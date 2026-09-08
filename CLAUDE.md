# CLAUDE.md

## Stack

Read this first — it heads off the most common wrong assumptions. Nothing here is Postgres, Supabase, Express, or Next.js.

- **Backend:** Fastify 5 + TypeScript (ESM). Entry point `backend/src/server.ts`; one plugin per file in `routes/`, business logic in `services/`, TypeBox schemas in `schemas/`.
- **Database:** `better-sqlite3`, WAL. **Multi-tenancy is one SQLite file per user** — isolation comes from opening a different file, not from a `user_id` column, so there is no cross-tenant query surface. See `docs/database.md`.
- **Frontend:** React 19 + Vite 7 + TanStack Query v5. Plain global CSS (`index.css` + `styles/`), no CSS modules or Tailwind. Design tokens are `--ds-*` custom properties.
- **Auth:** Google OAuth + signed cookie sessions. A global `onRequest` hook guards `/api/*` and `/photos/*`; handlers scope data with `getUserDatabase(request.user!.id)`.
- **Deployment:** single Docker container on Railway with a persistent volume at `/data`. Also packaged as an Electron desktop app.
- **Tests:** Vitest (`cd backend && npx vitest run`). A few suites are slow enough to need `--testTimeout=20000`.
- **Type-checking the frontend:** use `npm run build`. A bare `npx tsc --noEmit` at the frontend root misses `tsconfig.app.json` (`noUnusedLocals`, `include: ["src"]`) and will pass on code that fails the build.

---

## Documentation

When new features, integrations, architecture decisions, or other noteworthy information comes up during work, document it in `docs/readme.md`. Keep it updated as a living reference for the project.

**Database reference:** `docs/database.md` is the human-readable overview of the schema — every table, column, CHECK constraint, index, FTS table, and on-disk artefact in use. **Any change that adds or alters tables, columns, constraints, indexes, triggers, or seed data must update `docs/database.md` in the same change.**

There are no migration files and no migration CLI. Schema is applied imperatively on every connection, so the code is the source of truth:

- `backend/src/services/authDatabase.ts` — the shared auth database (`/data/auth.db`)
- `backend/src/services/userDatabase.ts` — the per-user contacts database (`/data/users/<id>/contacts.db`)
- `backend/src/routes/profile.ts` — `user_profiles` and `profile_slugs`, created lazily

To add a column: add it to the `CREATE TABLE IF NOT EXISTS` block **and** add an idempotent `try { ALTER TABLE ... } catch {}` so existing databases pick it up.

---

## Verification

**Visual/UI verification is the user's job — don't do it.** Do not start a
preview/dev server, drive a browser, or take screenshots to check how something
looks. The user runs their own dev server and verifies the UI themselves.
Functional/logic verification you *should* still do (type-check, lint, build,
and exercising behavior via `curl`/scripts against the running server is fine).
When a change is visually observable, finish your logic checks and hand it to
the user to look at rather than asking which browser to use.

---

## Plans

All implementation plans must be saved to `docs/plans/`. Filenames must start with the date in `YYYY-MM-DD` format, followed by a descriptive name (e.g., `docs/plans/2026-03-27-auth-system.md`, `docs/plans/2026-03-27-cms-migration.md`). This ensures plans are versioned, reviewable, and accessible across sessions.

---

## Logging Requirements

**CRITICAL:** For every code change or feature addition:

1. **Write a log entry** describing what was changed and why
2. **Save to `docs/log.md`** in the following format:

### Log Entry Format

```markdown
## [YYYY-MM-DD] - [Brief Change Title]

**What Changed:**
- Specific file(s) modified or created
- Description of the change

**Why:**
- Reason for the change (feature request, bug fix, refactor, etc.)

**Files Modified:**
- `path/to/file.ext`
- `path/to/file.ext`

---
```

### Example

```markdown
## 2026-07-30 — VCF import keeps per-address GEO coordinates

**What Changed:**
- `vcardParser` now parses `GEO`, matched to its address by item group (`item1.ADR` ↔ `item1.GEO`)
- Import persists `latitude`/`longitude` and stamps `geocoded_at` so the cleanup queue skips them
- Added `addresses_geotagged` to `import_jobs`, surfaced in the Last import summary

**Why:**
- Export wrote coordinates but import discarded them, so an export/import round trip
  silently lost all geocoding and forced re-billing through the HERE API

**Files Modified:**
- `backend/src/services/vcardParser.ts` — `applyGeoToAddresses`, `parseGeoValue`
- `backend/src/services/importService.ts` — persist coordinates, count them
- `backend/src/services/userDatabase.ts` — `addresses_geotagged` column + migration

---
```

### When to Log

Log entries are needed for:
- ✅ New features
- ✅ Bug fixes
- ✅ File modifications
- ✅ New file creation
- ✅ Schema changes (see the database reference requirement above)

Don't log:
- ❌ Reading files to understand context
- ❌ Running tests/verification
- ❌ Responding to questions without code changes

### Workflow

1. **Make the code change(s)**
2. **Write the log entry** in the format above
3. **Insert it at the top of `docs/log.md`** — most recent first, preserving all existing entries
4. **Inform the user** of what was done in your response