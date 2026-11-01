# Text Blast — personal 1:1 texts through Apple Messages, from Yello

**Status:** built 2026-11-01. Waiting on the user's manual check (simulate → test send → 2–3 real people).

Brings the standalone TextBlast mini app (`../textblast/`, Python + local web page) into Yello as
**Tools › Text Blast**. It sends one personalised text per person through Messages on the user's Mac.
Each person gets their own conversation. It never sends group texts.

## Decisions

| Question | Decision |
|---|---|
| Where sending runs | **The Electron desktop app's main process.** Hosted Yello runs on Railway (Linux) and can't drive Messages.app. In a plain browser the page works for building a blast but can't send. |
| Recipients | A Yello group (one or more), a CSV, or both merged. Deduplicated by normalised number. |
| CSV people not in Yello | **Used for the blast only.** Rows whose number matches a contact are linked to it. Nothing is created. |
| Where state lives | **Backend** (per-user SQLite): blasts, per-recipient status, the daily-limit count. The CSV is no longer written back to. |

## Architecture

```
Yello page (/tools/text-blast)  ── REST ──▶  Backend (/api/text-blasts)
   build list, template,                      parse CSV, normalise numbers,
   preview, test, start/stop                  match contacts, store blasts + status
        │  window.yelloDesktop.textBlast (preload bridge, app origin only)
        ▼
Electron main: textBlast runner  ── session.fetch (user's cookie) ──▶ Backend
   osascript → Messages, chat.db read-only (node:sqlite), pacing, safety rails
```

### 1. Backend (`backend/src/`)

- **Tables** in `userDatabase.ts` (and `docs/database.md`):
  - `text_blasts`: `id`, `created_at`, `template`, `default_country`, `simulate` (0/1), `status`
    (`draft|running|stopped|finished`), `sources` (JSON: group names, CSV filename).
  - `text_blast_recipients`: `id`, `blast_id` → `text_blasts` ON DELETE CASCADE, `contact_id`
    (nullable, ON DELETE SET NULL), `name`, `phone_e164`, `text` (the final rendered text),
    `is_custom`, `source` (`group|csv|both`), `status`, `service`, `sent_at`, `status_note`,
    `position`. Index on `(blast_id, position)` and on `sent_at` for the daily count.
- **Services:**
  - `textBlast/recipients.ts`: group lookup, CSV parsing (delimiter sniffing, BOM, phone-column
    detection by name), number normalisation with `libphonenumber-js`, matching to `contact_phones`,
    picking a contact's number (`cell`/`mobile`/`iphone` → primary → first), merging and dedup.
  - `textBlast/template.ts`: port of TextBlast's `render()`. `{field}`, `{field|fallback}`, `{{`/`}}`,
    loose key matching. CSV columns win over contact fields (`first_name`, `last_name`, `nickname`,
    `company`). A CSV `message` column overrides the template.
- **Routes** `routes/textBlast.ts` under `/api/text-blasts`:
  - `POST /preview`: multipart (CSV optional) + groups + template + country → resolved recipient
    rows with rendered text, problems and alternate numbers. Stateless.
  - `POST /`: create a blast from the confirmed rows (texts are stored rendered).
  - `GET /`, `GET /:id`: history and detail (with counts).
  - `POST /:id/recipients/:rid/status`: the runner writes `in_flight` and the results.
  - `POST /:id/status`: running/stopped/finished.
  - `GET /sent-today`: count for the daily limit (all blasts, excluding `simulated`).
  - `POST /:id/rerun`: copy the recipients into a new draft with a new template.
  - This route doesn't change contacts, so it is **not** added to `EDITING_PREFIXES`.

### 2. Desktop app (`electron/src/`)

- `preload.ts` (new) exposes `window.yelloDesktop.textBlast`: `setup()`, `start(blastId)`, `stop()`,
  `testSend(phone, text)`, `onProgress(cb)`, `openSettings(pane)`. `main.ts` sets `preload` in
  `webPreferences`, and IPC handlers reject senders that aren't on the app origin.
- `textBlast/messages.ts`: the `SEND`, `ACCOUNTS` and `LAUNCH` AppleScripts copied from
  `textblast.py`, run with `execFile('osascript', …)`. Data is passed as argv only.
  `explain()` for the -1743, -1728, -1700, -1712 and -600 errors.
- `textBlast/chatDb.ts`: read-only `node:sqlite` query of `~/Library/Messages/chat.db` (same query and
  Apple-epoch maths as `ChatDB`), plus `classify()`.
- `textBlast/runner.ts`: the loop from `_run_queue`:
  - before each text: write `in_flight` → send → poll chat.db every 3 s for up to 60 s → SMS fallback
    → write the result
  - random 25–45 s wait between texts (1–2 s when simulating)
  - daily cap of 80 from the backend
  - stop after 3 failures in a row, after 10 or more attempts with over 20% failed, or on -1743
  - `powerSaveBlocker` keeps the Mac awake
  - only one blast at a time
  - `in_flight` rows on resume are checked against chat.db first (`needs_review` if they can't be
    checked)
  - a failed backend write stops the run before the next send
- `textBlast/api.ts`: backend calls through `session.defaultSession.fetch`, so the user's cookie is
  sent.
- Packaging: `NSAppleEventsUsageDescription` via `mac.extendInfo` in `electron-builder.yml`, and
  `com.apple.security.automation.apple-events` in `build-resources/entitlements.mac.plist`.

### 3. Frontend (`frontend/src/`)

- Route `tools/text-blast` → `TextBlastView.tsx`, with a card linking to it on the Tools page.
- **Setup bar** (desktop only): iMessage signed in, SMS available, Automation, Full Disk Access.
  Each one links to its System Settings pane. In a browser it says "Open in the Yello desktop app
  to send".
- **Recipients:** group multi-select plus a CSV drop zone, default country (saved in settings), and
  a preview table with source, number (a dropdown when there are several), text, a **custom** tag,
  problems and a checkbox.
- **Message:** template editor with placeholder chips, character count and live preview.
- **Send:** test number + **Send test**, a **Simulate** toggle, Start/Stop, and live progress
  (current person, countdown, sent/failed/remaining, log).
- **History:** past blasts → per-person results, resume leftovers, run again.

## Statuses (same as TextBlast)

`delivered`, `sent`, `sent_sms`, `dispatched`, `failed`, `error`, `in_flight`, `pending`,
`not_found`, `needs_review`, `skipped`, `simulated`. The following are done and never resent:
`delivered`, `sent`, `sent_sms`, `dispatched`. Selected for retry: blank, `failed`, `error` and
`simulated`. Everything else is shown but not selected.

## Out of scope

Attachments, scheduling, creating contacts from the CSV, "last texted" on the contact page (easy to
add later from these tables), and RCS targeting (fallback is plain SMS).

## Risks to check first

1. `node:sqlite` loads in Electron 44's main process and can open chat.db read-only. If it can't,
   fall back to `/usr/bin/sqlite3 -readonly -json`.
2. Automation and Full Disk Access prompts are tied to Yello.app (in dev, to the Electron binary).
   Both need a one-time grant. The setup bar has to make this obvious.

## Testing

- Backend (Vitest): CSV parsing (delimiters, BOM, phone-column detection), normalisation, matching,
  number choice, merge and dedup, template rendering (the TextBlast cases), routes, and the
  daily-count query.
- Electron: `classify()` and the runner against fake Messages and chat.db (no real sends). This
  needs a test runner added to `electron/`.
- Manual (the user): Simulate with a real group, then a test send to themselves, then 2–3 real
  people.

---

# Implementation Plan

> Executed inline in the session that wrote it (the user asked for no interruptions). Steps use
> checkboxes. No commits unless the user asks: the working tree has unrelated uncommitted work.

**Goal:** Tools › Text Blast. Build a list from groups and/or a CSV, preview personalised texts,
and send them 1:1 through Messages from the desktop app, with resumable per-recipient status
stored in Yello.

**Architecture:** The backend resolves recipients and stores blasts. The Electron main process runs
the sender (osascript + chat.db). The page talks to Electron through a preload bridge, and Electron
talks to the backend with the user's session cookie.

**Tech stack:** Fastify 5 + better-sqlite3 + libphonenumber-js (backend), React 19 + TanStack Query
(frontend), Electron 44 with `node:sqlite` (Node 24, verified) and `osascript`.

## Global constraints

- Pacing 25–45 s random between texts (1–2 s when simulating). Verify window 60 s, polled every 3 s.
- Daily cap of 80 texts across all blasts (`simulated` and test sends excluded).
- Auto-stop: 3 failures in a row; or at least 10 attempts with over 20% failed; or osascript error -1743.
- Failures for auto-stop: `failed`, `error`, `not_found`.
- Done (never resent): `delivered`, `sent`, `sent_sms`, `dispatched`. Retry by default: `''`
  (queued), `failed`, `error`, `simulated`.
- Message data goes to osascript as argv only, never interpolated into script text.
- Schema changes update `docs/database.md`. Each change gets a `docs/log.md` entry (newest first).
- Frontend is type-checked with `npm run build`, never with a bare `tsc`.

## File map

| File | Responsibility |
|---|---|
| `backend/src/services/textBlast/phone.ts` | `normalizePhone(raw, region)` → `{ e164 } \| { problem }` |
| `backend/src/services/textBlast/template.ts` | `normKey`, `renderTemplate`, `cleanText` |
| `backend/src/services/textBlast/csv.ts` | `parseCsv(text)` → `{ header, rows, phoneColumn, overrideColumn }` |
| `backend/src/services/textBlast/recipients.ts` | `buildRecipients(db, input)`: groups + CSV → preview rows |
| `backend/src/services/textBlast/store.ts` | blast CRUD, status updates, `sentToday` |
| `backend/src/routes/textBlast.ts` | `/api/text-blasts` routes |
| `backend/src/services/userDatabase.ts` | two tables + indexes |
| `electron/src/textBlast/messages.ts` | AppleScripts, `runOsascript`, `explainError`, `checkAccounts` |
| `electron/src/textBlast/chatDb.ts` | `ChatDb.check()`, `latestOutgoing()`, `classify()` |
| `electron/src/textBlast/runner.ts` | `TextBlastRunner` (loop, pacing, rails), dependency-injected |
| `electron/src/textBlast/api.ts` | backend calls through `session.defaultSession.fetch` |
| `electron/src/textBlast/ipc.ts` | IPC handlers with an origin check |
| `electron/src/preload.ts` | `window.yelloDesktop.textBlast` |
| `frontend/src/api/textBlastHooks.ts` | queries/mutations + `useDesktopTextBlast()` bridge hook |
| `frontend/src/components/textBlast/*` | `TextBlastView`, `RecipientsPanel`, `MessagePanel`, `SendPanel`, `BlastHistory` |
| `frontend/src/styles/pages/text-blast.css` | page styles (`--ds-*` tokens) |

## Shared types (backend ↔ frontend ↔ electron)

```ts
type RecipientStatus = '' | 'in_flight' | 'delivered' | 'sent' | 'sent_sms' | 'dispatched' | 'failed'
  | 'error' | 'pending' | 'not_found' | 'needs_review' | 'skipped' | 'simulated';
interface PreviewRecipient {           // POST /api/text-blasts/preview
  key: string;                         // e164, or 'row-<n>'/'contact-<id>' when there's no number
  contactId: number | null; name: string; source: 'group' | 'csv' | 'both';
  csvRow: number | null;               // 1-based data row incl. header (spreadsheet row)
  phone: string | null;                // E.164 or iMessage email
  phones: { e164: string; label: string }[];   // alternates for contacts
  text: string; isCustom: boolean; problems: string[];
}
interface BlastRecipient { id: number; contactId: number | null; name: string; phone: string;
  text: string; isCustom: boolean; source: string; status: RecipientStatus; service: string | null;
  sentAt: string | null; note: string | null; position: number; }
interface Blast { id: number; createdAt: string; template: string; country: string; simulate: boolean;
  status: 'draft' | 'running' | 'stopped' | 'finished'; sources: { groups: string[]; csvName: string | null };
  counts: Record<string, number>; recipients?: BlastRecipient[]; }
```

## Tasks

### Task 1: Backend pure helpers (phone, template, CSV)
- [x] Tests `backend/src/services/textBlast/__tests__/helpers.test.ts`:
  - `normalizePhone('(917) 555-0199','US')` → `+19175550199`; `'0151 23456789','DE'` → `+4915123456789`;
    `'0049 151 23456789','US'` → `+4915123456789`; `'Ana@Example.com'` → `ana@example.com`;
    `''` → problem `no phone number`; `'123','US'` → problem mentions `+country code`.
  - `renderTemplate('Hi {First Name}!', {first_name:'Ana'})` → `Hi Ana!`; `{x|there}` with empty x →
    `there`; empty without a fallback → a problem, and the token is left in place; `{{a}}` → `{a}`;
    an unknown key → problem `no column called {nope}`.
  - `parseCsv`: comma, semicolon and tab; BOM stripped; blank rows dropped; duplicate headers →
    `name_2`; phone column found by name (`Mobile Phone`) and by content when no name matches;
    `message` column detected as the override.
- [x] Implement as ports of `textblast.py` (`normalize_phone`, `render`, `clean_text`, `CsvStore.load`,
  `roles`), using `libphonenumber-js/max` for validation. Include an RFC-4180 quote-aware parser.
- [x] `cd backend && npx vitest run src/services/textBlast` passes.

### Task 2: Schema + recipient building + store
- [x] `userDatabase.ts`: `text_blasts` and `text_blast_recipients` in the `CREATE TABLE IF NOT EXISTS`
  block, plus indexes `idx_tbr_blast(blast_id, position)` and `idx_tbr_sent_at(sent_at)`.
  New tables, so no ALTER migrations are needed. `contact_id` is `ON DELETE SET NULL`.
- [x] Tests `recipients.test.ts` (real temp user DB, as in `contactKind.test.ts`):
  - a group contact with cell + work numbers picks the cell and lists both in `phones`
  - an archived contact is excluded
  - a contact with no phone → a `no phone number` problem
  - a CSV row matching a group contact's number → one row, `source: 'both'`, CSV `first_name` wins
  - a CSV row matching a non-group contact → `contactId` set, `source: 'csv'`
  - a duplicate CSV number → the second row gets a `same number as row N` problem
  - `phoneOverrides[contactId]` switches the number
  - the `message` column → `isCustom`
- [x] `store.ts` tests:
  - `createBlast` stores rendered texts and positions
  - `setRecipientStatus` writes status, service, note and `sent_at` (only for `in_flight`)
  - `sentToday` counts done and failed attempts since local midnight, excluding `simulated`
  - `getBlast` returns counts
  - `rerun` copies recipients with a new template and re-renders from the stored values
- [x] Re-rendering needs the values, so store the placeholder values (`values_json`) per recipient.
- [x] `docs/database.md` updated.

### Task 3: Routes
- [x] `routes/textBlast.ts`, registered at `/api/text-blasts` in `server.ts`:
  - `POST /preview {groups, csv?:{name,text}, template, country, phoneOverrides}` → `{recipients, fields, csvColumns}`
  - `POST / {template, country, simulate, sources, recipients:[{...PreviewRecipient, values}]}` → `{blast}`
  - `GET /` → `{blasts}` (no recipients)
  - `GET /:id` → `{blast}` (with recipients)
  - `POST /:id/status {status}`
  - `POST /:id/recipients/:rid/status {status, service?, note?}`
  - `POST /:id/recipients/skip {ids, skipped}` (untick/retick)
  - `GET /sent-today` → `{count, cap: 80}`
  - `DELETE /:id`
- [x] Route tests: preview → create → status update → get → sent-today; 404 for another blast id.
- [x] Rate limit 30/min on preview. Body limit large enough for a 5 MB CSV (route-level `bodyLimit`).

### Task 4: Electron engine (messages, chatDb, runner)
- [x] Add `vitest` to `electron/devDependencies` and a `test` script.
- [x] `chatDb.ts`: `classify(row, final)` ported exactly. Apple epoch 978307200; ns timestamps.
  Opened read-only per query.
- [x] `messages.ts`: `SEND_SCRIPT`, `ACCOUNTS_SCRIPT` and `LAUNCH_SCRIPT` copied verbatim. `runOsascript(lines,
  args, timeoutMs)` via `execFile` → `{ok, stdout, stderr, timedOut}`. `explainError(stderr)` →
  `{code, message}` with the same hints, reworded for "Yello" instead of "your terminal app".
- [x] `runner.ts`: `TextBlastRunner` with `deps = { api, send(handle,text,service), launch(),
  latestOutgoing(handle, sinceUnix), chatDbOk(), sleep(ms), now(), random(), keepAwake():()=>void }`.
  `start(blastId, simulate)`, `stop()`, `testSend(phone, text, simulate)`, `onProgress(snapshot)`.
  Logic = `_run_queue` + `deliver` + `_send_once` + `_already_went_out`.
- [x] Tests (fake deps, fake timers via an injected sleep):
  - sends in order and writes `in_flight` then the result
  - skips done rows
  - iMessage fail → SMS fallback (not for email handles or -1743)
  - 3 failures in a row stop the run
  - over 20% failed after 10 attempts stops the run
  - -1743 stops
  - the daily cap stops before sending
  - stop during the wait halts with no further send
  - an `in_flight` row found in chat.db isn't resent
  - `in_flight` with no chat.db → `needs_review`
  - a backend write failure stops before sending
  - simulate never calls `send`

### Task 5: Electron wiring (api, ipc, preload, packaging)
- [x] `api.ts`: `getBlast(id)`, `setRecipientStatus`, `setBlastStatus` and `sentToday()` via
  `session.defaultSession.fetch(APP_URL + path)`. Non-2xx throws.
- [x] `ipc.ts`: channels `textblast:setup`, `textblast:start`, `textblast:stop`, `textblast:test` and
  `textblast:open-settings`, plus a `textblast:progress` event to the window. Every handler checks
  `isAppUrl(event.senderFrame.url)`.
- [x] `setup()` → `{ macos, imessage, sms, accountsError, chatDb, chatDbError, running }`.
- [x] `open-settings` accepts only `automation` or `full-disk-access`, which map to
  `x-apple.systempreferences:com.apple.preference.security?Privacy_Automation` / `?Privacy_AllFiles`.
- [x] `preload.ts` with `contextBridge.exposeInMainWorld('yelloDesktop', { textBlast: {...} })`.
- [x] `main.ts` sets `preload: path.join(__dirname, 'preload.js')`. Sandboxed preload can use
  `contextBridge` and `ipcRenderer`, and compiles as CommonJS.
- [x] `electron-builder.yml` `mac.extendInfo.NSAppleEventsUsageDescription`, and the apple-events
  entitlement in `build-resources/entitlements.mac.plist`.
- [x] `npm run build` and `npm test` in `electron/` pass. Update `electron/README.md`.

### Task 6: Frontend
- [x] `textBlastHooks.ts`:
  - `useTextBlastPreview` (mutation, debounced by the caller)
  - `useCreateBlast`, `useBlasts`, `useBlast(id, {poll while running})`, `useSentToday`,
    `useSkipRecipients`, `useDeleteBlast`
  - `useDesktopTextBlast()` → `{ available, setup, refreshSetup, start, stop, testSend, progress }`
- [x] Route `tools/text-blast` in `App.tsx`. A Tools page card (a new "Messaging" group with
  `settings-nav-link`).
- [x] `TextBlastView`, two modes:
  - **Compose:** groups multi-select (from `/api/contacts/groups`), CSV `FilePicker`, country
    (default: the last blast's country, else US), template textarea with field chips, preview table
    (checkbox, name, source badge, number select, text, problems), test number + Send test,
    Simulate toggle, Start.
  - **Blast detail:** progress, Stop, per-recipient status table, Resume (failed/error/in_flight),
    Run again.
  - History list under the composer.
- [x] Setup bar from `useDesktopTextBlast().setup`. In a browser it shows "Open in the Yello desktop
  app to send", and Start/Test are disabled.
- [x] `styles/pages/text-blast.css` imported where the other page CSS is.
- [x] `cd frontend && npm run build` passes.

### Task 7: Docs + verification
- [x] `docs/reference.md` Text Blast section. `docs/log.md` entry. Tick the roadmap if one exists.
- [x] Run the full backend suite, the frontend build and the electron build/test.
- [x] Smoke-test the routes with curl against a running local backend, if one is up.

## Changes

- 2026-10-31: design written.
- 2026-11-01: implementation plan added. Default country is remembered from the last blast (no new
  settings table), and the CSV is sent to the backend as text in JSON (no multipart).
  `node:sqlite` verified in Electron 44 (Node 24.21).
- 2026-11-01: built. Deviations from the plan:
  - `POST /api/text-blasts` rebuilds the list on the server from the same input plus `excludeKeys`, instead of trusting
    recipient rows sent by the page.
  - Added `GET /normalize` for the test number.
  - A CSV row merged into a group contact keeps the CSV's number, so the number picker only shows for rows that
    didn't come from the CSV.
  - Test sends don't count toward the daily limit.
  - The desktop app calls the backend with `session.fetch` (cookies included by default; checked in Electron 44's
    `fetchWithSession`).
  - A parallel session (Top contacts from message activity) adds `yelloDesktop.messageActivity` next to `textBlast` in
    the same preload. We agreed on the split over cross-session messages.
- 2026-11-01: after the first real use, "Send test" says why it's disabled (no desktop app, no group/CSV picked,
  nobody ticked, no test number, or a blast already sending). The test still needs a list, since it sends the first
  person's rendered text.
- 2026-11-01: the counts above the preview ("N will get a text", "N held back", "N unticked") are filter chips.
  Clicking one shows only those rows (again shows everyone). The held-back view adds a count of reasons.
