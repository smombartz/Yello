# Yello

Project-specific context and rules for Claude. `CLAUDE.md` imports this file and holds the general
rules shared by every project; where the two disagree, this file wins.

## Stack

Read this first — it heads off the most common wrong assumptions. Nothing here is Postgres, Supabase, Express, or Next.js.

- **Backend:** Fastify 5 + TypeScript (ESM). Entry point `backend/src/server.ts`; one plugin per file in `routes/`, business logic in `services/`, TypeBox schemas in `schemas/`.
- **Database:** `better-sqlite3`, WAL. **Multi-tenancy is one SQLite file per user** — isolation comes from opening a different file, not from a `user_id` column, so there is no cross-tenant query surface. See `docs/database.md`.
- **Frontend:** React 19 + Vite 7 + TanStack Query v5. Plain global CSS (`index.css` + `styles/`), no CSS modules or Tailwind. Design tokens are `--ds-*` custom properties.
- **Auth:** Google OAuth + signed cookie sessions. A global `onRequest` hook guards `/api/*` and `/photos/*`; handlers scope data with `getUserDatabase(request.user!.id)`.
- **Deployment:** single Docker container on Railway with a persistent volume at `/data`. The Electron desktop app is a thin client of that deployment (no local backend); its Google sign-in runs in the system browser and hands back over `yello://`. See `electron/README.md`.
- **Tests:** Vitest (`cd backend && npx vitest run`). A few suites are slow enough to need `--testTimeout=20000`.
- **Type-checking the frontend:** use `npm run build`. A bare `npx tsc --noEmit` at the frontend root misses `tsconfig.app.json` (`noUnusedLocals`, `include: ["src"]`) and will pass on code that fails the build.

---

## Documentation

**Database reference:** `docs/database.md` is the human-readable overview of the schema — every table, column, CHECK constraint, index, FTS table, and on-disk artefact in use. **Any change that adds or alters tables, columns, constraints, indexes, triggers, or seed data must update `docs/database.md` in the same change.**

There are no migration files and no migration CLI. Schema is applied imperatively on every connection, so the code is the source of truth:

- `backend/src/services/authDatabase.ts` — the shared auth database (`/data/auth.db`)
- `backend/src/services/userDatabase.ts` — the per-user contacts database (`/data/users/<id>/contacts.db`)
- `backend/src/routes/profile.ts` — `user_profiles` and `profile_slugs`, created lazily

To add a column: add it to the `CREATE TABLE IF NOT EXISTS` block **and** add an idempotent `try { ALTER TABLE ... } catch {}` so existing databases pick it up.

---

## Project Rules

- **Schema changes are logged too**, and the same change must update `docs/database.md` (see the
  database reference requirement above).
- **Log entry example for this project** (replaces the general template's example; headings use an
  em dash, and Files Modified items name the functions/columns touched; the `**Session:**` line from
  the general format still goes under the heading):

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
