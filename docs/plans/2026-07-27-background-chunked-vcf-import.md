# Background chunked VCF import

## Context

Uploading a 37 MB `.vcf` fails with *"Import timed out — the file may be too large to process. Try splitting it into smaller files."* The message is misleading and the underlying behaviour is worse than a plain failure.

What actually happens today (`backend/src/routes/import.ts`, `backend/src/services/importService.ts`):

1. **The whole file is buffered in RAM three times.** `data.toBuffer()` → `buffer.toString('utf-8')` → `parseVcf()` builds a complete `ParsedContact[]` with base64 photos inline. A 37 MB VCF peaks around 150–250 MB RSS. Railway Hobby is 512 MB (`deployment/railway.mdx:243-248` already flags OOM on large imports).
2. **`parseVcf()` is fully synchronous over the entire file** (`vcardParser.ts:446-473`) — it unfolds and splits 37 MB, then parses every card before returning a single array. This blocks the event loop for the whole duration.
3. **There is no transaction anywhere in the import loop.** Every `INSERT` is its own implicit transaction → an fsync per row per child table. `db.transaction()` is used elsewhere in the codebase (`mergeService.ts:186`, `contacts.ts:1411`) but never in an import path. This alone is likely a 10–50× throughput loss.
4. **`rebuildContactSearch(db, contactId)` runs per contact** (`importService.ts:150`), each call re-`SELECT`ing all child rows.
5. **`await processPhoto(...)` per contact does 4 sharp resizes + 4 file writes.** On a photo-heavy iPhone export this dominates wall-clock.
6. **The 408 is self-inflicted and does not cancel anything.** `MAX_PARSE_TIME_MS = 120000` (`import.ts:8`) races a `setTimeout` against `importVcf`. When the timer wins, the client gets 408 — but `importVcf` keeps running to completion in the background. The user sees "timed out", contacts keep landing, and because **the `.vcf` path does no dedupe at all**, retrying duplicates everything.

Intended outcome: the upload returns immediately with a job id, the import runs in the background in bounded batches with real progress, memory stays flat regardless of file size, and re-imports are safe.

**Repo facts that shape the design** (note `CLAUDE.md:5-13` is stale boilerplate — there is no Supabase, no `docs/database.md`, no `supabase/migrations/`, no Express):
- Backend is **Fastify 5 + better-sqlite3**, one SQLite file per user (`getUserDatabase(userId)`, `userDatabase.ts:27`). Tenancy is the file, not a column.
- Schema is created imperatively in `userDatabase.ts:62-305` with `CREATE TABLE IF NOT EXISTS`; "migrations" are try/catch-swallowed `ALTER TABLE` (`userDatabase.ts:307-352`). No migration CLI, no push step.
- Deployed as a **single always-on Railway container with a `/data` volume** (`railway.toml`), so an in-process worker + a durable job row is sufficient — no external broker needed. `restartPolicyType = "on_failure"` means restarts must be survivable.
- There is a written-but-unimplemented job design at `docs/plans/2026-02-13-linkedin-apify-background-jobs.md`. This plan adopts its table shape and endpoint conventions so the two features converge.

**Scope decisions (confirmed):** single-pass inline photo processing; UID-based skip on re-import; VCF path only — iCloud/Google/LinkedIn keep their SSE streams and can migrate onto this infra later.

---

## 1. Schema: `import_jobs` table

Append to the `db.exec()` block in `backend/src/services/userDatabase.ts` (after the existing tables, before the `ALTER TABLE` migration section at `:307`). `CREATE TABLE IF NOT EXISTS` self-applies on next connection — no migration step.

```sql
CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'vcf',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','running','completed','failed')),
  filename TEXT,
  file_path TEXT,                  -- staged upload on the /data volume
  file_size INTEGER,
  total_cards INTEGER DEFAULT 0,   -- 0 until the count pass finishes
  cards_processed INTEGER DEFAULT 0,
  imported_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  photos_processed INTEGER DEFAULT 0,
  result TEXT,                     -- JSON: final ImportResult
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);
```

Also add a staged-upload directory helper next to `getUserPhotosPath` (`userDatabase.ts:359-368`):

```ts
export function getUserImportsPath(userId: number): string {
  return path.join(getUserDataPath(), String(userId), 'imports');
}
```

`cards_processed` is the resume offset — see §5.

## 2. New service: `backend/src/services/importJobService.ts`

Job CRUD, mirroring the naming in the enrichment-jobs plan so both can share conventions:

- `createImportJob(db, { filename, filePath, fileSize }): string` — `crypto.randomUUID()`
- `getImportJob(db, id): ImportJob | null`
- `getActiveImportJob(db): ImportJob | null` — `status IN ('pending','running')`, newest first
- `updateJobProgress(db, id, counts)` — batch-level counter update
- `completeJob(db, id, result)` / `failJob(db, id, message)` — set status, `completed_at`, `result`/`error_message`

Return camelCase objects (the codebase's existing row-mapping style).

## 3. Streaming chunked worker: rewrite `backend/src/services/importService.ts`

Replace `importVcf(db, vcfContent)` with `runVcfImportJob(userId, jobId)`. The key change is that **the file is never fully in memory and never fully parsed at once**.

```
BATCH_SIZE = 50            // cards per DB transaction
```

**Card streaming.** Read the staged file with `fs.createReadStream(filePath, 'utf-8')` piped through `readline`. Accumulate lines from `BEGIN:VCARD` to `END:VCARD` into a block, push the joined block onto a batch buffer, flush when the buffer hits `BATCH_SIZE`. Peak memory is one batch (~a few MB even with photos) instead of the whole file.

`unfoldLines` (`vcardParser.ts:77-79`) is a pure regex over `\r\n[ \t]` / `\n[ \t]` and folding never crosses a `BEGIN`/`END` boundary — so it is safe to apply **per block** rather than to the whole file. Call `parseSingleVcard(unfoldLines(block))` directly; `parseVcf()` stays for the other callers and the existing tests.

**Per-batch processing — photos outside the transaction, DB writes inside it:**

1. Parse the batch's blocks into `ParsedContact[]`, collecting parse errors.
2. `await processPhoto(...)` for every card that has one — **before** opening the transaction. better-sqlite3 transactions are synchronous; awaiting inside one is not safe. Collect `{ index, photoHash }`.
   - Fix while here: pass the third argument — `processPhoto(contact.photoBase64, contactId, userId)`. Today `importService.ts:78` omits it, so photos fall back to the shared `PHOTOS_PATH` and hash on `contactId` alone → **cross-tenant photo collisions**. iCloud (`icloud.ts:143`) and Google (`googleContacts.ts:137`) already pass it. Photo hashing is content-addressed by contact id, so the hash must be computed after insert; process the image bytes first, write files after the id is known, or restructure `processPhoto` to take the id at write time — whichever fits with the least churn.
3. Wrap all inserts + `rebuildContactSearch` for the batch in a single `db.transaction(() => { ... })()`. Reuse the existing hoisted prepared statements — hoist them once per job, not per batch.
4. After the transaction commits, `updateJobProgress(...)` and `await new Promise(setImmediate)` to yield the event loop so the server stays responsive to other requests.

**Dedupe (UID skip).** Before inserting, if `contact.uid` is non-null, check `SELECT id FROM contacts WHERE icloud_uid = ?` (the column and its partial index already exist, `userDatabase.ts:337`). If found, increment `skipped_count` and continue. On insert, stamp `icloud_uid = contact.uid`. `normalizeUid` (`vcardParser.ts:440`) already handles the `urn:uuid:` variance. Cards without a UID still insert unconditionally — full match/merge via `matchIncomingContacts` stays a follow-up.

**Total count.** Do a cheap first pass over the stream counting `BEGIN:VCARD` occurrences, write `total_cards`, then reopen for the real pass. On a 37 MB file this is a fast sequential read and it gives the UI an accurate denominator from the start.

**On finish:** `completeJob` with the `ImportResult` JSON, then `fs.unlink` the staged file. On throw: `failJob` with a sanitized message (per the repo's error convention, e.g. `archive.ts:45-51`) and leave the staged file for debugging.

**Cap the error list.** Store at most ~100 entries in `result.errors` with a total count alongside — a malformed 37 MB file could otherwise produce a multi-megabyte JSON blob.

## 4. Routes: `backend/src/routes/import.ts`

Rewrite `POST /api/import` to stage-and-enqueue, and add two read endpoints.

**`POST /api/import`** — keep the demo guard, extension check, and MIME check exactly as they are. Then:
- Stream the multipart file straight to disk instead of `toBuffer()`:
  `await pipeline(data.file, fs.createWriteStream(path.join(getUserImportsPath(userId), `${jobId}.vcf`)))`.
  Check `data.file.truncated` after the pipeline and return 413 if the 100 MB multipart limit was hit.
- Validate content by checking the first chunk (or re-reading the first ~1 KB) for `BEGIN:VCARD`, preserving the current 400 response.
- `createImportJob(...)`, then call `runVcfImportJob(userId, jobId)` **without awaiting** — attach a `.catch()` that calls `failJob` so an unhandled rejection can't take the process down.
- Return `202 { jobId }`.
- **Delete `MAX_PARSE_TIME_MS` and the `Promise.race`.** The 408 path disappears entirely.
- Reject a new upload with 409 if `getActiveImportJob(db)` returns a job — one import at a time per user.

**`GET /api/import/jobs/:id`** → the job row (for polling).
**`GET /api/import/jobs/active`** → the current pending/running job or `null` (for reconnect on page load).

Both are already covered by the global auth hook (`server.ts:108-124`) and scoped by `getUserDatabase(request.user!.id)`. Give the polling endpoints a per-route `config.rateLimit` override well above the global 100/min, since a 1.5 s poll over a long import will otherwise trip the global limiter.

Add TypeBox schemas in `backend/src/schemas/` to match the existing convention.

## 5. Restart recovery

Railway restarts (`restartPolicyType = "on_failure"`, plus every redeploy) kill in-flight work. Because batches commit atomically and `cards_processed` is written only after a commit, **resume is exact at batch boundaries**: reopen the staged file, skip the first `cards_processed` cards, continue.

Add a boot sweep called from `server.ts` after registration. There is no cross-user index, so enumerate `USER_DATA_PATH` subdirectories with `fs.readdirSync`, open each user's DB, and for any `status = 'running'` job whose `file_path` still exists, re-enqueue `runVcfImportJob`. If the staged file is gone, `failJob` it with "interrupted by a server restart".

Note the LRU hazard: `getUserDatabase` closes handles on eviction at 50 open DBs (`userDatabase.ts:37-46`). The worker must **re-acquire via `getUserDatabase(userId)` at each batch** rather than capturing the handle for the lifetime of the job.

## 6. Frontend

**`frontend/src/api/types.ts`** — add `VcfImportJob` (mirroring the `EnrichmentJob` shape in the enrichment plan) and keep `ImportResult` as the `result` payload.

**`frontend/src/api/hooks.ts`** — replace `useImportVcf` with:
- `useStartVcfImport()` — mutation posting the file via `uploadFileWithProgress`, returns `{ jobId }`, persists it to `localStorage`.
- `useVcfImportJob(jobId)` — `useQuery` with `refetchInterval: 1500` while `pending`/`running`, `false` once terminal. On completion, invalidate `['contacts']` and `['contactCount']` and clear localStorage. **This is the first `refetchInterval` in the codebase** — there is no existing polling precedent to copy (every other long job hand-rolls SSE parsing).
- `useActiveVcfImportJob()` — `GET /api/import/jobs/active` on mount to reconnect after navigation or refresh.

**`frontend/src/api/client.ts:78`** — remove the 408 special case; it is now unreachable. Keep 413/429/403.

**`frontend/src/components/SettingsView.tsx`** — `importPhase` becomes three states: `uploading` (existing XHR `<progress>`, unchanged) → `importing` (driven by the polled job) → done. Replace the static *"Processing contacts — this may take a moment for large files…"* copy at `:132` with a real bar. Reuse the established progress markup and classes from `EnrichToolsContent.tsx:377-411` (`.progress-bar-container` / `.progress-bar-fill` / `.progress-stats`, styled at `frontend/src/index.css:4849-4892`) rather than the inline `<progress>`. Show `imported / skipped / failed` counts. On mount, adopt any active job so navigating away and back resumes the display.

**`frontend/src/components/OnboardingView.tsx:87-98`** — `handleVcfImport` currently awaits the final `ImportResult` from the mutation. Rework it to start the job and render the same polled progress, so onboarding doesn't hang on a promise that now resolves immediately.

**`frontend/src/components/DocsView.tsx:64-66, 80`** — user-facing prose describes the current import mechanics; update it.

`frontend/src/lib/api.ts:23-33` holds a third, unused `api.importVcf()` duplicate — delete it while here.

## 7. Tests

`backend/src/routes/__tests__/import.test.ts` has 7 tests asserting the synchronous `ImportResult` response. Rework them: the POST now asserts `202 { jobId }`, and a new test drives `runVcfImportJob` directly against an in-memory/temp DB to assert final counts. Add cases for: a multi-batch file (> `BATCH_SIZE` cards), UID dedupe on a second run of the same file, and resume from a non-zero `cards_processed`.

---

## Verification

1. `cd backend && npx tsc --noEmit && npx vitest run` — all green.
2. `cd frontend && npx tsc --noEmit && npm run lint`.
3. Generate a large fixture and import it against the running dev server:
   ```bash
   # concatenate an exported .vcf to ~37MB, then:
   curl -b cookies.txt -F "file=@big.vcf" http://localhost:3456/api/import   # expect 202 {"jobId":"..."}
   curl -b cookies.txt http://localhost:3456/api/import/jobs/<id>            # poll: running → completed
   ```
   Confirm the response is immediate, `cards_processed` climbs, and no 408 is ever returned.
4. Memory: watch RSS during the import (`node --expose-gc` not needed; `process.memoryUsage()` logged per batch, or Activity Monitor). It should stay roughly flat, not scale with file size.
5. Responsiveness: hit `GET /api/contacts` repeatedly during the import — it must keep answering, proving the event-loop yield works.
6. Re-import the same file: `imported` should be ~0 and `skipped` should equal the UID-bearing card count. Verify no duplicate rows: `SELECT display_name, COUNT(*) FROM contacts GROUP BY 1 HAVING COUNT(*) > 1`.
7. Restart recovery: start a large import, `kill` the backend mid-run, restart, confirm the job resumes from `cards_processed` and finishes with the correct total.
8. Photo isolation: import as two different users and confirm photos land under `/data/users/<id>/photos/...` per user with no cross-user overwrite.
9. UI (user-verified per `CLAUDE.md`): upload in Tools → Import VCF, watch upload % then the live import bar, navigate away and back to confirm it reconnects, and check the completion summary. Same for the onboarding step.
10. Prepend a `docs/log.md` entry and save this plan to `docs/plans/2026-07-27-background-chunked-vcf-import.md` per repo convention.
