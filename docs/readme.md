# Yello — Project Reference

Living reference for features, integrations, and architecture decisions. See `docs/log.md` for the change-by-change history and `docs/database.md` for the schema overview.

## Configuration

### Environment variables (frontend build)

| Variable | Purpose |
| --- | --- |
| `VITE_PUBLIC_URL` | Absolute public origin of the deployed app (e.g. `https://yello.example.com`, no trailing slash needed). Baked into the `og:image` / `twitter:image` meta tags at build time — the Open Graph spec requires absolute image URLs, and link scrapers (iMessage, Slack, Facebook, LinkedIn) ignore relative ones. When unset, the tags fall back to root-relative paths: fine for dev, but shared links won't render a preview image. |

Vite build-time variables must be present when `npm run build` runs. On Railway (Docker build), set `VITE_PUBLIC_URL` as a service variable — the `Dockerfile` declares it as an `ARG` in the frontend build stage so it reaches Vite. If the domain changes, update the variable and redeploy, then force a re-scrape in each platform's debugger (e.g. Facebook Sharing Debugger) since scrapers cache previews.

## Features

### VCF import (background job)

Importing a `.vcf` is a **staged, chunked background job**, not an inline request. This matters because a photo-heavy export (iPhone/iCloud) is routinely tens of megabytes and takes minutes to process.

- `POST /api/import` streams the upload to `/data/users/<userId>/imports/<jobId>.vcf`, inserts an `import_jobs` row, starts the worker **without awaiting it**, and returns `202 { jobId }`. The browser then polls `GET /api/import/jobs/:id`; `GET /api/import/jobs/active` lets the UI reconnect to a running import after a reload or navigation.
- The worker (`runVcfImportJob`) streams **one vCard block at a time** via `readline` and commits in batches of 50 inside a single `db.transaction()`, yielding the event loop between batches. Peak memory is one batch, independent of file size.
- Photo processing sits **between two transactions per batch**: `processPhoto` is async (sharp) and hashes on the contact id, so it can neither run inside a synchronous better-sqlite3 transaction nor before the insert that assigns the id. Transaction A inserts contacts and child rows, photos are processed, transaction B attaches the hashes.
- **Re-imports are safe.** A card whose vCard `UID` matches an existing `contacts.icloud_uid` is skipped and counted separately; new contacts get their UID stamped. Cards without a UID still insert unconditionally — full match/merge (as iCloud/Google import does via `matchIncomingContacts`) remains a follow-up.
- **Restart-safe.** `cards_processed` is written only after a batch commits, making it an exact resume offset. `resumeInterruptedImports` runs at boot, walks `USER_DATA_PATH` (there is no cross-user index — each tenant is a separate SQLite file), and re-enqueues any `running` job whose staged file survives. The staged file is deleted on success and kept on failure for debugging.
- One import at a time per user; a concurrent upload gets a 409.
- **Per-address `GEO` is preserved**, closing the round trip with the exporter below. Coordinates are matched to their address by item group (`item1.ADR` ↔ `item1.GEO`) since vCard 3.0's bare `GEO` is card-level; a card-level `GEO` is only applied when the card has exactly one address. `0;0` and out-of-range values are rejected as failed-geocode sentinels. Imported coordinates stamp `geocoded_at` so the address-cleanup queue does not re-geocode them through the paid HERE API. iCloud import shares the parser and benefits too; the Google People API exposes no coordinates.

#### Last import summary

`GET /api/import/jobs/latest` returns the most recent `completed`/`failed` job, independent of the tracked-job lifecycle that drives the status indicator. The Tools → Import VCF section renders it as a persistent "Last import" block (imported / already present / photos / geotagged / failed, plus filename, time and size), so results survive dismissing the pill, navigation, and new sessions. The upload form is always available above it — there is no form-vs-result mode switch.

Historical note: this replaced a synchronous path guarded by a 2-minute `Promise.race`. That race returned **408 while the import kept running**, so large files reported failure, kept writing contacts, and duplicated them on retry (the path had no dedupe at all).

#### Status indicator

`ImportStatusProvider` (wrapped around the app in `App.tsx`) owns import tracking, and `BackgroundJobPill` renders it as a fixed bottom-left indicator mounted once in `Layout`. Consequences worth knowing:

- **Tracking is app-wide, not page-scoped.** `SettingsView` and `OnboardingView` both read the same job from the provider rather than polling their own copies, so the inline panel and the pill cannot disagree.
- **The tracked id is derived, not synced** — `trackedJobId ?? activeJob.id`, minus any dismissed id. That means an import started in another tab (or before a reload) is adopted automatically via `GET /api/import/jobs/active`. Deriving also satisfies the React Compiler lint rule that rejects synchronous `setState` inside effects.
- **Terminal jobs persist until dismissed.** `forgetImportJobId()` runs on `dismiss()`, not on completion — otherwise an import that finished while the user was elsewhere would leave no trace.
- **`z-index: 400`** puts the pill above the header/nav rail (300) and below the modal overlay (500), so modals cover it without it having to track modal state — several modals here never report theirs.
- The pill takes a **generic `BackgroundJobSummary`**, so LinkedIn CSV / Google Contacts / enrichment can feed it once they migrate off SSE. Today they stream over SSE and die on unmount, so they cannot.

### VCF export (`GET /api/contacts/export/vcf`)

Exports all non-archived contacts as vCard 3.0. Two modes:

- **Default** reuses each contact's stored `raw_vcard` (falling back to generation for contacts without one), injecting the current photo and geocode data.
- **`?regenerate=true`** rebuilds every card from database fields via `generateVcard()` (`backend/src/services/vcardGenerator.ts`).

**Geocode data:** addresses geocoded by the address-cleanup feature (`contact_addresses.latitude/longitude`) export as per-address `GEO` properties tied to their `ADR` via Apple-style item groups (`item1.ADR` + `item1.GEO:lat;lon`) — vCard 3.0's plain `GEO` is card-level, so grouping is what keeps it per-address. For raw vCards, `injectGeoIntoVcard()` matches DB addresses to `ADR` lines by street + city/postal (positional fallback when counts align), reuses the ADR's existing group or adds a `yelloN.` group to ungrouped ones, and replaces any stale `GEO` lines. Unmatched addresses are skipped rather than guessed.

### Public profile card (`/p/:slug`)

Users can publish their contact card at a server-generated slug. Behavior notes:

- The Profile page is **read-only with autosaving visibility controls** — there is no edit mode. The "Make my contact card public" toggle, "Hide All Fields", and the per-field eye toggles (shown next to every field in the contact card and next to the identity fields above it) all **autosave immediately** via a partial `PUT /api/profile`. On a failed autosave the control reverts and an error banner is shown. Profile data itself is edited via the linked contact.
- Per-field visibility lives in `visibility_json` on `user_profiles`. **Name and avatar default to visible**; tagline, company, title, contact details (emails/phones/addresses), socials, and birthday are hidden until opted in via the eye toggles. Older profiles created with all fields hidden are seeded with name + avatar visible the first time the public toggle is switched on (never while already public, to avoid silently exposing data).
- Nothing is served publicly until `is_public` is set — `GET /api/profile/public/:slug` returns 404 otherwise, and it blanks the visibility object and nulls all hidden fields in its response.
