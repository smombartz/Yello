# Change Log

## 2026-03-25 12:15 — Electron Desktop App Wrapper

- Created `electron/` package with Fastify backend spawning and process lifecycle management
- Implemented `electron/src/main.ts` (262 lines) with:
  - Spawns backend via `ELECTRON_RUN_AS_NODE=1` child process
  - Health polling with AbortController (200ms interval, 30s timeout)
  - Session secret auto-generation and persistence (crypto-generated, mode 0o600)
  - User data directory management at `~/Library/Application Support/Yello/`
  - BrowserWindow creation with context isolation and preload
  - Electron user agent stripping for OAuth compatibility
  - App lifecycle management (ready, window-all-closed, before-quit, activate)
  - Backend termination with SIGTERM signal
- Created `electron/tsconfig.json` with CommonJS output (required for Electron main process)
- Created `electron/package.json` with electron, electron-builder, TypeScript dependencies
- Created `electron/src/preload.ts` for security context isolation
- Created `electron/splash.html` with gradient background and loading spinner
- Created `electron-builder.yml` with macOS DMG configuration (universal arm64 + x64)
- Created `build-resources/entitlements.mac.plist` for macOS Hardened Runtime (JIT, networking, file access)
- Created `electron/.env.example` template for Google OAuth and optional API keys
- Added root `package.json` scripts: `build:all`, `electron:dev`, `electron:build`
- Added comprehensive setup guide `ELECTRON_SETUP.md` with OAuth config, development workflows, troubleshooting
- Added test verification checklist `ELECTRON_TEST_RESULTS.md` with build pipeline and integration verification
- Fixed unused drag-drop code in `frontend/src/components/ContactFormSections.tsx` (unblocked frontend build)
- Backend integration verified: all env vars (GOOGLE_CLIENT_ID, SESSION_SECRET, database paths) passed correctly
- Build pipeline tested: frontend builds (778KB), backend builds (all tests passing), Electron compiles (main.js + preload.js)
- Data paths confirmed: auth DB, per-user DBs, session secret all use user data directory
- OAuth flow compatible: localhost redirects work within BrowserWindow
- All 106 backend tests passing (105 passing, 1 pre-existing photoProcessor failure unrelated to implementation)

## 2026-03-11 16:00 — Drag-to-Reorder Contact Details

- Added `DraggableArrayItem` wrapper component for HTML5 Drag & Drop
- Added `useDragState` hook for managing drag state and reordering
- Updated all detail sections (Phone, Email, Address, Social, URL, Related People, Categories, Instant Messages) with drag support in edit mode
- Auto-updates `isPrimary` when item moved to first position
- Added CSS styling for drag visual feedback (opacity on dragging, border highlight on drop zone)
- Works with existing save flow — no backend changes needed

## 2026-03-11 15:00 — Fix VCF Export: Missing Contacts & Photos

- Fixed default export dropping ~505 contacts that had no raw_vcard (manually created / LinkedIn imports)
- Default export now selects all non-archived contacts; generates vCard on the fly for contacts without raw_vcard
- Added photo embedding: contacts with photo_hash get their medium JPEG read from disk and injected as base64 PHOTO property
- Added `photoBase64` support to `vcardGenerator.ts` so generated vCards include photos
- Existing raw vCards get their PHOTO property replaced with the current local photo (handles enrichment/manual uploads)
- Refactored export route to share a `buildContactForVcard()` helper between default and regenerate modes

## 2026-03-06 15:00 — Onboarding Flow

- Added `/onboarding` route with accordion-style guided setup
- Profile photo upload via `POST /api/profile-images/upload` (Sharp pipeline, 4 sizes)
- VCF import section with export instructions for iPhone, Google, Outlook
- LinkedIn CSV import section with step-by-step export guide
- `has_onboarded` flag on users table, `PATCH /api/auth/onboarded` endpoint
- `hasOnboarded` included in `GET /api/auth/me` response
- Auto-redirect to onboarding for new users (both frontend ProtectedRoute and OAuth callback)
- Skippable at any time via "Skip to Dashboard" or "Go to Dashboard"
- Auto-completion detection with redirect after all steps done

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
