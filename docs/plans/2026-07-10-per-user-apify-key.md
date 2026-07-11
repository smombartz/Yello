# Per-User Apify API Key for LinkedIn Enrichment

## Context

LinkedIn enrichment currently uses a single global `APIFY_API_TOKEN` env var, so in this multi-tenant app every user's enrichment runs would bill the server owner's Apify account — or not work at all if unset. The goal: each user supplies their own Apify API key, stored encrypted in their per-user database, entered inline in the Enrich section where they hit the "not configured" wall.

**Decisions made with user:**
- **Per-user only** — remove the env var entirely, no fallback.
- **Inline UI** — the "API Not Configured" warning in the LinkedIn enrichment card (`EnrichToolsContent.tsx`) becomes a key-entry form; configured state shows "Connected as {username}" + Disconnect.
- **Validate on save** — backend calls Apify `GET /v2/users/me` before storing; store the Apify username for display.

**Template to follow:** the iCloud credentials flow (`backend/src/routes/icloud.ts`) — validates before saving, encrypts with `encryptToken()`/`decryptToken()` from `backend/src/services/tokenEncryption.ts` (AES-256-GCM, keyed off `SESSION_SECRET`), GET returns only `{ connected, email }`, never the secret.

## Implementation

### 1. DB migration — `backend/src/services/userDatabase.ts`

Add to `user_settings` CREATE TABLE (after `icloud_app_password`, ~line 229) and as `try { ALTER TABLE ... } catch {}` migrations (mirroring iCloud's at ~lines 305-311):
- `apify_api_token TEXT` (encrypted)
- `apify_username TEXT`

### 2. Service refactor — `backend/src/services/apifyEnrichmentService.ts`

- Delete module-level `APIFY_API_TOKEN` constant (line 179) and `isLinkedInEnrichmentConfigured()` (lines 231-236).
- Add exported `validateApifyToken(token: string)`:
  - `GET ${APIFY_BASE_URL}/users/me` with `Authorization: Bearer`, ~10s `AbortSignal.timeout`
  - 200 → `{ ok: true, username }` (from `data.username`, fall back to `data.email`)
  - 401/403 → `{ ok: false, status, error: 'Invalid Apify API token' }`
  - other non-2xx → `{ ok: false, status, error: ... }`
  - network/timeout → `{ ok: false, error: 'Could not reach Apify...' }` (no status)
- Thread token through:
  - `startApifyRun(token, urls)` (line 510), `waitForApifyRun(token, runId, onPoll?)` (line 552), `getApifyResults(token, datasetId)` (line 614) — use param in Authorization headers
  - `enrichContacts(db, token, includeAlreadyEnriched, onProgress?, limit?)` (line 803) — guard becomes `if (!token) throw ...`
  - `recoverFromDataset(db, token, datasetId, onProgress?)` (line 1150) — same

### 3. Routes — `backend/src/routes/enrich.ts`

New endpoints in this file (already registered at `/api/enrich`). Local helper `getApifyRow(db)` reading `apify_api_token, apify_username FROM user_settings WHERE id = 1`.

- **`POST /apify-key`** — TypeBox body `{ token: string (1-500 chars) }`, rate limit `{ max: 5, timeWindow: '1 minute' }`, demo-user 403 block (same as `/linkedin/start`). Trim → `validateApifyToken` → invalid key = 400 with error, network failure = 502. `encryptToken()` in try/catch (missing `SESSION_SECRET` → 500 with clear message). UPDATE row, return `{ success: true, username }`.
- **`DELETE /apify-key`** — demo block, NULL both columns, `{ success: true }`.
- **`GET /linkedin/summary`** (line 17) — `configured` now `!!row?.apify_api_token`; add `apifyUsername: string | null` to response schema. (No separate GET-key endpoint; summary is already the card's source of truth.)
- **`POST /linkedin/start`** (guard 67-71) and **`POST /linkedin/recover`** (216-220) — before SSE headers: no stored token → 400 `'...Add your Apify API key in Tools → Enrich.'`; `decryptToken` fails → 500 `'...Disconnect and re-enter your key.'`; pass decrypted token to `enrichContacts`/`recoverFromDataset`.

Token is never returned by any endpoint.

### 4. Frontend API — `frontend/src/api/enrichHooks.ts` + `types.ts`

- `types.ts`: add `apifyUsername: string | null` to `LinkedInEnrichmentSummary`.
- New mutations modeled on `icloudHooks.ts`, both invalidating `['linkedinEnrichmentSummary']`:
  - `useSaveApifyKey()` — POST `/api/enrich/apify-key`
  - `useDeleteApifyKey()` — DELETE `/api/enrich/apify-key`

### 5. UI — `frontend/src/components/EnrichToolsContent.tsx` + `styles/pages/enrich.css`

- Replace the not-configured warning (lines 200-208) with an inline setup panel (`.apify-key-setup`, neutral panel not error styling; render once `!isSummaryLoading`):
  - Heading "Connect your Apify account", one-line explanation, link to the [Apify Console](https://console.apify.com/settings/integrations) for getting a token (free tier)
  - Form row: `<input type="password" autoComplete="off">` + primary "Connect" Button (disabled while empty/pending, spinner while pending like the Recover button)
  - On success: toast "Connected to Apify as {username}", clear input; query invalidation flips `configured` and reveals stats automatically. On error: error toast.
- Connected state inside the `summary?.configured` branch (line 212), above the stats: check icon + "Connected to Apify as {username}" + Disconnect button (disabled while enriching/recovering; no ConfirmDialog — re-pasting restores). 
- CSS in `enrich.css`: `.apify-key-setup`, `.apify-key-form` (flex row), `.apify-connected-row` — tokens only (`--ds-*`), no inline styles.

### 6. Cleanup — remove `APIFY_API_TOKEN` references

- `CLAUDE.md` env vars section — remove; note key is per-user in-app.
- `electron/src/main.ts` (~line 75 env pass-through), `electron/README.md`, `ELECTRON_SETUP.md` — remove/replace.
- `frontend/src/components/DocsView.tsx` (~line 230) — drop from `env`, amend `how` text, add `user_settings` to tables.
- Leave `ELECTRON_TEST_RESULTS.md` and `docs/plans/completed/` (historical).
- `docs/log.md` entry + save this plan to `docs/plans/2026-07-10-per-user-apify-key.md` per repo convention.

### 7. Tests — `backend/src/routes/__tests__/apifyKey.test.ts` (vitest)

Mock Apify with `vi.stubGlobal('fetch', ...)`, set `SESSION_SECRET` in test env:
1. POST with mocked 200 → stored encrypted (`isEncryptedToken` true, ≠ plaintext), username saved
2. Mocked 401 → 400, nothing stored
3. Mocked network failure → 502, nothing stored
4. Summary `configured` false → true after save (with `apifyUsername`)
5. DELETE → columns nulled, `configured` false
6. `/linkedin/start` without key → 400 JSON
7. Demo user → 403

## Verification

1. `cd backend && npx tsc --noEmit && npx vitest run` — compiler flags any missed call sites of the changed signatures.
2. `cd frontend && npm run build` (includes type check).
3. Manual with dev servers (`SESSION_SECRET` set, `APIFY_API_TOKEN` removed from env):
   - Enrich card shows key form; garbage key → "Invalid Apify API token" toast
   - Real key → connected row with username, stats appear immediately
   - Small enrichment run (`limit: 1`) end-to-end; disconnect → form returns
   - Reload → connected state persists from DB
4. `grep -rn APIFY_API_TOKEN` → only historical docs remain.
5. Shut down dev servers after testing (per CLAUDE.md).
