# Security Audit & Hardening Plan — Yello CRM

## Context

Yello CRM is a multi-tenant contact manager (Fastify 5 + better-sqlite3 backend, React frontend) running in production on Railway. The primary concern driving this audit: **can one user read or modify another user's contacts / address book?** Secondary goal: general production hardening.

**Headline result: No live cross-tenant data-access path was found.** The isolation model is sound. The items below are hardening/defense-in-depth, led by one genuinely urgent ops item (live credentials in a cloud-synced file) and one real isolation defect (shared photo directory).

> **Deliverable scope:** report only — this document is the deliverable; no code changes have been made. It's a remediation reference to act on (or hand back to Claude to implement) later.

---

## What was verified as SAFE (the core question)

The multi-tenant isolation model holds up under inspection:

- **Every** per-user database is opened via `getUserDatabase(request.user!.id)` (`backend/src/services/userDatabase.ts:27`). `request.user.id` is populated **only** by a server-side session lookup in `requireAuth` (`backend/src/middleware/auth.ts:42-80`) — never from a query param, body, or header.
- A sweep for client-supplied user IDs (`query.userId`, `body.userId`, `params.userId`, custom headers) across all routes returned **nothing**. No IDOR via userId.
- **Contact/resource IDs are inherently tenant-scoped**: a contact ID is looked up inside the caller's own `contacts.db`, so an ID belonging to another user simply doesn't exist in your database.
- **Photo *serving*** (`backend/src/server.ts:152-185`) is done by an authenticated handler scoped to `getUserPhotosPath(request.user.id)` with a path-traversal guard. (The photo *write* path has a separate isolation defect — see P1 finding #2 below.)
- **`userId` is a numeric integer**, so the `data/users/<id>/` path cannot be manipulated for traversal.
- **SQL is parameterized**: FTS search uses `MATCH ?` bound values; bulk deletes build `?,?,?` bind-placeholder lists, not interpolated values. No SQL injection found.
- **Session tokens** are 256-bit random (`randomBytes(32)`), DB-backed, httpOnly, sameSite=lax, expiry-enforced in SQL.
- **OAuth tokens & iCloud app-password** are encrypted at rest (AES-256-GCM via `tokenEncryption.ts`) before being stored.
- **Admin route** (`/api/admin/users`) is gated on the session-derived email and exposes only counts/sizes — no contact contents, no impersonation endpoint.
- **Public profile route** is opt-in, owner-gated per-field, and keyed by an unguessable random slug.

---

## Findings to fix (prioritized)

### P0 — Urgent
1. **Live production credentials in plaintext, in a Dropbox-synced folder.** `backend/.env` contains the real `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `HERE_API_KEY`, and `APIFY_API_TOKEN`. The file is **not** in git (correctly gitignored) and is **not** copied into the Docker image (`.dockerignore` excludes it; production reads these from Railway variables). But the project lives under `/Users/.../Dropbox/...`, so these secrets are continuously synced to Dropbox's cloud — an exposure surface outside your control.
   - **Action:** Rotate all four credentials, then decide whether to move the repo out of the Dropbox-synced path (or confirm the sync exclusion is acceptable).
   - **Critical caveat:** `SESSION_SECRET` is also the scrypt input that encrypts stored Google/iCloud OAuth tokens (`tokenEncryption.ts:14-19`). Rotating it (a) invalidates all active sessions and (b) makes every stored OAuth token undecryptable — affected users must re-authenticate Google/Gmail/Contacts and re-enter iCloud credentials. Plan the rotation as a coordinated event, not a silent swap.

### P1 — High
2. **Contact photos written to a SHARED, tenant-agnostic directory (the one real isolation defect).** Two photo subsystems coexist: `photoProcessor.processPhoto(base64, contactId, userId)` correctly writes to the per-user `./data/users/{userId}/photos/...`, but `profileImageService`'s `getPhotosPath()` returns a single shared `./data/photos` for all tenants. Three code paths write contact photos there using keys built **only from the per-user contact ID**:
   - `contactPhotoService.ts:37-40` — `identifier = "contact-"+contactId` → `md5(...)`.
   - `apifyEnrichmentService.ts:1096` — `"linkedin-contact-"+contact.contactId`.
   - `importService.ts:78` — `processPhoto(base64, contactId)` called **without `userId`**, so it falls through to the shared dir (the odd one out; every other caller passes `userId`).
   Because `contacts.id` is a per-DB `AUTOINCREMENT` integer, tenant A's contact `5` and tenant B's contact `5` hash to the **same file path** → cross-tenant collision/overwrite at the storage layer.
   - **Current blast radius:** the `/photos/*` route only reads the *per-user* dir, so this is not a live cross-tenant HTTP *read* today — but it is a genuine isolation/data-integrity bug (one tenant's photo silently overwrites another's), and it also means these photos are effectively broken to display (they 404).
   - **Action:** route every photo write through the per-user `getUserPhotosPath(userId)` and include `userId` in the storage key. Fix the `importService.ts:78` call to pass `userId`. Audit `profileImageService` writes to ensure nothing contact-related lands in the shared dir. Migrate any existing files out of `./data/photos`.

3. ✅ **FIXED 2026-07-11** — **Missing `trustProxy` behind Railway's edge proxy.** `Fastify({ logger: true })` (`server.ts:59`) does not enable `trustProxy`, so `@fastify/rate-limit` buckets requests by the proxy's socket IP instead of the real client IP. The 100/min limit and the tighter auth-endpoint limits are therefore effectively **shared across all users** — one abuser can exhaust the bucket for everyone, and per-client brute-force throttling doesn't work as intended.
   - **Action:** `Fastify({ logger: true, trustProxy: true })`. Verify rate-limit keying uses `X-Forwarded-For` afterward.
   - **Resolution:** implemented as `trustProxy: 1` (not `true`): `true` takes the *leftmost* `X-Forwarded-For` entry, which a client can spoof to rotate fake IPs and bypass rate limits entirely; `1` trusts exactly one hop (Railway's edge) so `request.ip` is the *rightmost*, Railway-appended entry. Verified via injected requests: spoofed leftmost entries are ignored, rate-limit 429s key on the real client IP, and no-proxy (local/Electron) requests fall back to the socket IP.

### P2 — Medium
4. **Hardcoded cookie-secret fallback** `'dev-secret-change-in-production'` (`server.ts:101`). Neutralized in production only by the `SESSION_SECRET` fail-fast guard. Make the guard unconditional (fail fast whenever `SESSION_SECRET` is unset) and drop the literal fallback.
5. **Everything security-critical hinges on `NODE_ENV === 'production'`** — secure cookies, the secret guard, CORS lockdown, CSP. It's hard-set in the Dockerfile today (fine), but brittle. Resolve `const isProd = process.env.NODE_ENV === 'production'` once, log it at boot, and fail fast if a production-only secret is missing regardless of `NODE_ENV`.
6. **Sensitive data in logs.** Emails logged in `contactPhotoService.ts:134/158`, `googlePeopleService.ts:303`; OAuth token-exchange error bodies logged verbatim in `auth.ts:263/352`; Google refresh `errorText` in `googleAuthService.ts:95`. Redact PII and truncate/omit provider error bodies.
7. **Session lifecycle.** 30-day sessions, no rotation on login, no idle timeout (`auth.ts:49`). Consider rotating the session ID on each login and adding an idle-timeout column, or at least shortening the absolute lifetime.

### P3 — Low / defense-in-depth
8. **Photo path-traversal prefix check lacks a trailing separator** (`server.ts:164-168`). `resolved.startsWith(path.resolve(userPhotosPath))` would pass a sibling like `.../photos-x`. Not cross-tenant exploitable (escaping still can't match another tenant's `.../users/{id}/photos` prefix, and the URL isn't percent-decoded before `path.join`), but append `path.sep` as standard hardening.
9. **No global `setErrorHandler`.** Fastify defaults don't leak stack traces in response bodies, but add a centralized handler for consistent redaction and a generic 500 message.
10. **Demo session entropy.** `randomUUID()` (122-bit) vs 256-bit for real logins (`demoService.ts`). Bump to `randomBytes(32)` for consistency.
11. **Admin gate is a single hardcoded email** (`adminAuth.ts:3`). Functional, but consider an `is_admin` column so it survives an email change and is auditable.
12. **Move the working copy out of Dropbox** (or exclude it), since live DBs (`data/`) and `.env` are otherwise cloud-synced.

---

## Suggested remediation order (for when you're ready)

1. **Ops, do first (P0):** rotate `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `HERE_API_KEY`, `APIFY_API_TOKEN` in the Railway variables + their respective consoles. Remember the SESSION_SECRET caveat — coordinate it (invalidates sessions + stored OAuth tokens). Then move/exclude the repo from Dropbox. (#1, #12)
2. **Isolation fix (P1):** route all photo writes through per-user dirs with tenant-scoped keys; fix `importService.ts:78`; migrate existing `./data/photos` files. (#2)
3. **Quick, low-risk code changes:** `trustProxy: true`; unconditional SESSION_SECRET guard + drop literal fallback; `isProd` constant; traversal-check trailing separator. (#3, #4, #5, #8)
4. **Log hygiene pass:** redact emails and provider error bodies. (#6)
5. **Optional, larger:** session rotation/idle timeout, global error handler, demo entropy, `is_admin` column. (#7, #9, #10, #11)

## How to verify each fix (when implemented)
- Backend boots (`npm run dev` in `backend/`, port 3456) and logs the resolved `isProd`.
- With `NODE_ENV` unset and no `SESSION_SECRET`, the process exits (guard is unconditional).
- Behind a simulated proxy (`X-Forwarded-For`), rate-limit counters key on the forwarded IP.
- New contact photo lands under `data/users/{userId}/photos/` and is retrievable via `/photos/...`; nothing new appears in `./data/photos`.
- `npm test` (backend, vitest) passes; ideally add a test asserting `getUserDatabase` is only called with `request.user.id`.
- No emails/tokens appear in logs during a login + photo-fetch flow.
