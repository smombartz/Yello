# Change Log

## 2026-03-04 21:30 — Multi-Tenancy: Database-Per-User Architecture

- Converted from single-tenant to multi-tenant architecture supporting 100+ users
- **Shared auth DB** (`data/auth.db`): users, sessions, profile_images tables
- **Per-user contact DBs** (`data/users/{userId}/contacts.db`): all contact data, FTS indexes, linkedin enrichment, email history, user settings
- **Per-user photo directories** (`data/users/{userId}/photos/`): contact photos isolated per user
- Created `authDatabase.ts` with `getAuthDatabase()` singleton for auth data
- Created `userDatabase.ts` with `getUserDatabase(userId)` and LRU cache (max 50 connections)
- Updated all 15 route files to use `getUserDatabase(request.user!.id)`
- Updated all ~15 service files to accept `database: DatabaseType` parameter instead of calling singleton
- Refactored `database.ts` to utility-only module (buildSearchableText, rebuildContactSearch, etc.)
- Updated photo serving in server.ts to resolve per-user photo directories from session
- Created migration script (`scripts/migrateToMultiTenant.ts`) for single-tenant → multi-tenant conversion
- Updated Dockerfile with `AUTH_DATABASE_PATH` and `USER_DATA_PATH` env vars
- 45 new tests (14 auth DB + 22 user DB + 9 migration)
- OAuth tokens remain encrypted at rest with AES-256-GCM
- GDPR user deletion: just delete `data/users/{userId}/` directory + auth DB record

## 2026-03-04 14:05 — Security Hardening Phase 2

- Removed `Access-Control-Allow-Origin: *` from all 5 SSE endpoints (enrich.ts, gmailEnrich.ts, settings.ts)
- Dockerfile now runs as non-root `node` user with `USER node` directive
- Added `@fastify/helmet` for security headers (CSP in production, X-Content-Type-Options, X-Frame-Options, etc.)
- Added `@fastify/rate-limit` with global 100/min limit and per-route overrides on expensive endpoints (auth: 20/min, import: 10/min, enrichment: 5/min)
- Implemented AES-256-GCM encryption for OAuth tokens at rest using key derived from SESSION_SECRET
- Added token encryption migration that auto-encrypts existing plaintext tokens on startup
- Created tokenEncryption service with encrypt/decrypt/detect functions and test suite

## 2026-03-04 11:10 — Security Hardening

- Added global `onRequest` auth hook in `server.ts` protecting all `/api/*` and `/photos/*` routes
- Allowlisted `/health`, `/api/auth/*`, `/api/profile/public/*` from auth requirement
- Removed redundant per-route `requireAuth` from `import.ts`, `stats.ts`, `emailSync.ts`, `gmailEnrich.ts`
- Replaced custom `getUserIdFromSession` helpers with `request.user!.id` in `settings.ts`, `profileImages.ts`, `profile.ts`
- Photos now served through authenticated route with path traversal protection (replaced static serving)
- Removed contact count from `/health` endpoint to prevent data leakage
- Added `SESSION_SECRET` env var validation on production startup
- Sanitized all error messages across 10 route files to prevent internal info leakage (CWE-209)
- Updated health test to match new response format

## 2026-02-15 14:00 — Bulk Gmail Email History Sync in Enrich View

- Added `emailDiscoveryService.ts` — discovers which contacts user emails most recently/frequently by scanning Gmail messages
- Added `gmailEnrich.ts` route plugin at `/api/enrich/gmail` with summary, discover, and bulk-sync (SSE) endpoints
- Exported helper functions (`gmailFetch`, `fetchMessageMetadata`, `extractEmailAddresses`, `getHeader`) from `emailSyncService.ts`
- Added frontend types (`GmailSyncSummary`, `GmailDiscoveredContact`, `GmailBulkSyncProgress`, `GmailBulkSyncResult`) to `types.ts`
- Created `gmailEnrichHooks.ts` with `useGmailSyncSummary`, `useGmailDiscover`, `useGmailBulkSync` hooks
- Added "Gmail Email History" collapsible section to EnrichView with:
  - Summary stats (synced / not synced / total with email)
  - Strategy selector (most recent, most frequent, not yet synced, all)
  - Configurable scan depth and contact limit
  - Discovery step for recent/frequent strategies showing ranked contact list
  - SSE-streamed bulk sync with progress bar, cancel support
- Registered route in `server.ts`

## 2026-02-15 12:20 — Address Edit Option in Cleanup Normalize & Duplicates

- Added `PUT /api/cleanup/addresses/update` backend endpoint to update address fields without geocoding
- Extended `applyAddressFixes()` to support an optional `updatedAddress` field, applying address updates in the same transaction before removing duplicates
- Added `AddressUpdateData` / `AddressUpdateResponse` frontend types and `useUpdateAddress()` mutation hook
- Added inline edit mode to Normalize tab: pencil icon on each junk address opens editable fields (street, city, state, postalCode, country); Save updates the address and removes it from the junk list
- Added "Custom" radio option to Duplicates tab: lets users compose a custom address from editable fields pre-filled with the recommended address data; on Apply, the recommended address is updated and duplicates are removed
- Added CSS styles for `.address-edit-form`, `.address-edit-input`, `.address-edit-actions`, and normalize edit button
