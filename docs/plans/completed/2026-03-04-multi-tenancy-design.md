# Multi-Tenancy Design: Database-Per-User Architecture

**Status:** Approved
**Date:** 2026-03-04

## Goal

Convert Yello CRM from single-tenant to multi-tenant, supporting 100+ users with completely private, isolated data per user.

## Architecture

**Approach:** Shared Auth DB + Per-User Contact DB + Per-User Photo Directories

This provides the strongest data isolation — a bug in one query can never leak another user's contacts. It also makes GDPR user deletion trivial (delete the user's DB file and photo directory).

## Database Architecture

### Shared Auth Database (`data/auth.db`)

Tables:
- `users` — google_id, email, name, avatar_url, OAuth tokens (encrypted)
- `sessions` — session_id → user_id mapping with expiration
- `profile_images` — user avatar images from multiple sources (Google, Gravatar, etc.)

### Per-User Database (`data/users/{userId}/contacts.db`)

Tables (same schema as today, minus auth tables):
- `contacts` — all contact data (no user_id column needed — it's the whole DB)
- `contact_emails`
- `contact_phones`
- `contact_addresses`
- `contact_social_profiles`
- `contact_categories`
- `contact_instant_messages`
- `contact_urls`
- `contact_related_people`
- `contacts_fts` / `emails_fts` / `contacts_unified_fts` — FTS5 virtual tables
- `linkedin_enrichment` / `linkedin_enrichment_failures`
- `contact_emails_history`
- `contact_photos`
- `user_settings` — per-user CRM settings (name, phone, website, LinkedIn URL)

### Per-User Photos (`data/users/{userId}/photos/`)

```
thumbnail/{2-char-hash-prefix}/{hash}.jpg
small/{2-char-hash-prefix}/{hash}.jpg
medium/{2-char-hash-prefix}/{hash}.jpg
large/{2-char-hash-prefix}/{hash}.jpg
```

## Connection Management

### Auth Database
- Singleton pattern (like today's `getDatabase()`)
- `getAuthDatabase()` returns the shared auth DB

### User Databases
- LRU cache of open DB connections (max ~50 handles)
- `getUserDatabase(userId: number)` returns the per-user DB
- On cache miss: open DB file, run schema init/migrations, cache the handle
- On eviction from LRU: close the connection
- On first access for a new user: create the DB file and run full schema initialization

### Photo Path Resolution
- `getUserPhotosPath(userId: number)` returns `data/users/{userId}/photos/`
- Creates directory if it doesn't exist

## Code Changes

### New Files
- `backend/src/services/authDatabase.ts` — shared auth DB management
- `backend/src/services/userDatabase.ts` — per-user DB management with LRU cache

### Modified Files

**Database layer:**
- `database.ts` — refactored: auth schema extracted to authDatabase.ts, contact schema extracted to userDatabase.ts

**Middleware:**
- `middleware/auth.ts` — `getDatabase()` → `getAuthDatabase()`

**Routes (all):**
- Replace `getDatabase()` with `getUserDatabase(request.user!.id)`
- No query changes needed (no WHERE user_id = ? required)

**Services:**
- Services that call `getDatabase()` internally must accept `userId` or `database` parameter
- `importService`, `mergeService`, `nameMatchingService` — accept userId
- `photoProcessor` — accept userId for photo directory resolution
- `geocoding` — accept userId
- `googleAuthService`, `profileImageService` — use `getAuthDatabase()`
- `tokenEncryption` — no changes (pure functions)

**Server:**
- `server.ts` — photo serving resolves to user's photo directory from session

**Frontend:**
- Zero changes needed — photo URLs stay the same, backend resolves user directory transparently

## Migration Strategy

One-time migration script (runs on first startup or as CLI command):

1. **Create shared auth DB** — extract `users`, `sessions`, `profile_images` from current `contacts.db` into `data/auth.db`
2. **Identify admin user** — first user in `users` table becomes owner of all existing contacts
3. **Create admin's user DB** — copy `contacts.db` to `data/users/{adminUserId}/contacts.db`, drop auth tables from it
4. **Move photos** — move `data/photos/*` to `data/users/{adminUserId}/photos/`
5. **Cleanup** — archive or remove old `contacts.db`

## Security Considerations

- OAuth tokens encrypted at rest using `SESSION_SECRET` (already implemented)
- Per-user DB isolation prevents cross-user data leaks at the storage level
- Photo serving validates user context from session before resolving file path
- No cross-user queries possible since data lives in separate DB files
- User deletion: remove `data/users/{userId}/` directory + remove from auth DB

## Sensitive Information Best Practices

- OAuth tokens: encrypted with AES-256 before storage (already implemented via `tokenEncryption.ts`)
- Session secrets: environment variable, required in production
- Per-user DB files: filesystem permissions restrict access
- No PII in shared auth DB beyond email/name/avatar (needed for login)
- All contact PII lives in isolated per-user DB files
