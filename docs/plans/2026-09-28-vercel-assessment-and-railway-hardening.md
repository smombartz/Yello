# Stay on Railway and harden it (Vercel move assessed and declined)

## Context

The question was whether to move Yello from Railway to Vercel to reduce the number of platforms, given an existing Vercel Pro subscription. It had been asked before, but no record of the earlier answer existed (memory empty, nothing in `docs/`).

**Decision: stay on Railway.** Yello is built as one long-lived process with a writable disk. Vercel offers neither: functions have a read-only filesystem plus 500 MB of ephemeral `/tmp`, and scale down after 5 minutes idle. That also applies to Vercel's container-image support (beta). Moving would replace Railway with Vercel + Turso + Blob + a queue, and touch nearly every backend file.

The review surfaced two real risks that exist today regardless of host: there are no backups, and profile images are written to a path that is neither on the volume nor served. This plan records the decision and fixes those.

## What a full move would have taken (for the record)

| Workstream | Today | On Vercel | Size |
|---|---|---|---|
| Database | `better-sqlite3`, one file per user; 581 `.prepare(` calls in 41 files, 21 sync transactions, 54 sync service functions | Turso, one DB per user. Async `@libsql/client` (rewrite nearly every route and service) or sync `libsql-js` with a `/tmp` replica re-synced on cold start | Large |
| Search | 3 FTS5 tables, triggers, `MATCH` | Contentless FTS5 and `VACUUM` on Turso need proving | Medium, uncertain |
| Schema on open | ~400 lines of DDL and backfills per connection (`userDatabase.ts:65-491`) | Schema-version gate plus one-off migration scripts | Medium |
| Files | Photos, staged VCFs, raw-vCard archives on disk | Vercel Blob (private) | Medium |
| Background import | In-process worker, resumed on boot (`importRecovery.ts`, `server.ts:219`) | Vercel Queues (beta) or Workflow | Medium |
| Long jobs | Apify enrichment streams up to 30 min (`routes/enrich.ts:120-177`) | Over the 800 s Pro maximum; becomes job + polling | Medium |
| Electron | Spawns the same `backend/dist/server.js` with local SQLite | Two storage modes to maintain and test | Ongoing |

Not blockers: 100 MB request bodies, SSE, `sharp`, and same-origin SPA + API all work on Vercel today.

**Revisit if:** Vercel ships persistent volumes, the Electron app is retired, or the DB layer goes async for another reason.

## Step 1: Record the decision

- This plan is saved as `docs/plans/2026-09-28-vercel-assessment-and-railway-hardening.md` and serves as the assessment record
- `docs/readme.md`: a short "Hosting" section (why Railway, revisit conditions, link to this plan)
- Memory entry (`project` type) pointing at this plan, plus the `MEMORY.md` index line

## Step 2: Fix the profile image path

**The defect:** `profileImageService.ts:135-137` writes to `PHOTOS_PATH || './data/photos'`, a single global folder. `/photos/*` (`server.ts:157-190`) only reads from `getUserPhotosPath(userId)`, i.e. `<USER_DATA_PATH>/<uid>/photos`. The `Dockerfile` does not set `PHOTOS_PATH`, so in production these files land in `/app/data/photos`: off the volume and outside the served folder.

Affected callers of `downloadAndProcessImage` / `processUploadedImage`:
- `routes/profileImages.ts:88` (uploads)
- `services/apifyEnrichmentService.ts:1128` (LinkedIn pictures)
- `services/contactPhotoService.ts:40`
- `services/profileImageService.ts:233,252,290` (Google, Gravatar, Google Contacts)

**Approach:**
1. Reproduce first with a failing Vitest test: process an image for a user, then assert the file exists under `getUserPhotosPath(userId)`.
2. Add a `userId` parameter to both functions and write to `getUserPhotosPath(userId)`, matching what `processPhoto` already does (`photoProcessor.ts:22`).
3. Thread `userId` through the six call sites.
4. Leave the `PHOTOS_PATH` fallback in `photoProcessor.ts` and the two scripts untouched; they serve the legacy single-DB path.

No schema change, so `docs/database.md` only needs its on-disk artefacts section checked.

## Step 3: Nightly backups to Vercel Blob

Uses the existing Vercel Pro account, so no new platform.

**New files**
- `backend/src/services/backupService.ts`
  - `runBackup()`: snapshot `auth.db` and each user's `contacts.db` with `better-sqlite3`'s online `db.backup(dest)`, which is safe under WAL while the server is live
  - Tenants enumerated with the existing `listUserIds()` (`userDatabase.ts:531`); connections via `getAuthDatabase()` / `getUserDatabase()`
  - Each user's `photos/` folder archived as one gzip tarball
  - Upload with `@vercel/blob` `put(..., { access: 'private' })` to `backups/<YYYY-MM-DD>/...`
  - Retention: delete snapshots older than 14 days using `list` + `del`
  - Staging files written under `<USER_DATA_PATH>/../backups-tmp` and removed after upload
- `backend/src/scripts/restoreBackup.ts`: download one dated snapshot into a target directory

**Changes**
- `backend/src/server.ts`: after `listen`, next to `resumeInterruptedImports`, start a daily timer. Only when `BLOB_READ_WRITE_TOKEN` is set, so Electron and local dev skip it.
- `backend/src/routes/admin.ts`: `POST /api/admin/backup` to trigger a run on demand
- `backend/package.json`: add `@vercel/blob`

**Needs you:** create a private Blob store in the Vercel dashboard and add `BLOB_READ_WRITE_TOKEN` to the Railway service variables.

## Step 4: Correct stale deployment docs

`deployment/railway.mdx`, `PRD.md:330-337` and `README.md:562-663` list `DATABASE_PATH`, `PHOTOS_PATH`, `PORT=3000` and an outdated Dockerfile. Update to `AUTH_DATABASE_PATH`, `USER_DATA_PATH`, `PORT=3456`, and add `BLOB_READ_WRITE_TOKEN`.

## Logging

One `docs/log.md` entry per step that changes code or docs, newest first, in the `CLAUDE.md` format.

## Verification

- `cd backend && npx vitest run` (add `--testTimeout=20000` for the slow suites), including the new profile image test
- `cd backend && npm run build` and `cd frontend && npm run build`
- Profile images: with the local server running, `curl` an upload to `/api/profile-images`, confirm the file is under `data/users/<id>/photos`, restart, `curl` the returned `/photos/...` URL and expect 200
- Backups: with a test token, `curl -X POST /api/admin/backup`, run `restoreBackup` into a scratch directory, open the restored DBs and compare contact counts with the live ones
- Without `BLOB_READ_WRITE_TOKEN`, confirm the server boots and logs that backups are disabled
- Visual checks of profile images in the UI are yours to do
