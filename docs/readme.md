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

Exports all non-archived contacts as vCard 3.0. **Every card is generated from the database** by `exportContactsAsVcf()` (`backend/src/services/vcardExportService.ts`), which loads each contact and hands it to `generateVcard()` (`backend/src/services/vcardGenerator.ts`). `?regenerate=true` is still accepted but no longer changes anything. `GET /api/archive/export` uses the same function with `{ archived: true }` (it used to replay `raw_vcard`, and skipped archived contacts that had none).

Historical note: until 2026-09-27 the default mode replayed each contact's stored `raw_vcard` and only injected the photo and GEO. `raw_vcard` is written once at import and never updated, so **everything edited, merged, enriched or cleaned up after the original import was missing from the file** — on a database of 8054 contacts that was 3019 notes, 3287 categories, 8624 social profiles and all LinkedIn enrichment.

**What comes from where**

| Source | Properties |
| --- | --- |
| Typed columns | `FN`, full `N`, `NICKNAME`, `ORG` (+ department), `X-ABShowAs`, `X-GENDER`, `TITLE`, `EMAIL`/`TEL` (all `TYPE`s, + `X-ABLabel`), `ADR` + `LABEL` + `GEO` + `X-ABLabel` + `X-ABADR` + `X-APPLE-SUB*`, `URL` (+ `X-ABLabel`), `IMPP`, `BDAY`, `X-ABDATE` (+ label), `NOTE`, `CATEGORIES`, `X-SOCIALPROFILE`, `X-ABRELATEDNAMES`, `UID`, `PHOTO`, `X-YELLO-LINKEDIN` |
| `contact_vcard_properties` | Every other property of the imported card, as written: `PRODID`, `REV`, `X-CREATED`, `X-IMAGEHASH`, `X-ADDRESSING-GRAMMAR`, … |

**The database holds every imported vCard property** — including parameters no column holds (`X-APPLE-OMIT-YEAR`, `TYPE=pref` on a URL, …), stored as JSON `params` on the row. The stored copy of each original card (`contacts.raw_vcard`) was retired on 2026-09-27: the originals were archived to `/data/users/<id>/archive/original-cards-<date>.vcf.gz` and the column dropped. See *vCard coverage* and *raw_vcard retirement* in `docs/database.md`.

Rules worth knowing:

- **Item groups are renumbered.** Each labelled email/phone/address/URL/date gets its own `itemN` group; generic grouped properties keep sharing a group with each other but are renamed past the generator's groups, so nothing collides.
- **`pref` is never written as a `TYPE`**; the primary entry gets `PREF=1`.
- **Rows with no value are skipped** — a `contact_phones` row with an empty number writes no `TEL` line.

**LinkedIn enrichment (`X-YELLO-LINKEDIN`).** vCard has no equivalent for the `linkedin_enrichment` row, so its non-null columns travel as gzip-compressed JSON, base64-encoded, in one private property. Other contact apps ignore it; this app's importer restores the row. Compression matters: uncompressed, the enrichment of ~3000 contacts would push a full export past the 100 MB upload limit. On import the column list in `linkedinEnrichmentColumns.ts` — not the payload — decides which columns are written, and the row is always attached to the newly created contact.

**Known limits of a round trip**

- `contact_related_people.related_contact_id`, `contact_emails_history`, non-primary `contact_photos`, archived contacts and timestamps are not exported.
- Phone numbers are re-normalised by `libphonenumber-js` on import, so a malformed stored number can come back in a different form.
- Import still skips a card whose `UID` already exists rather than updating it, so a corrected export only takes effect in an account that does not hold those contacts yet.

**Geocode data:** addresses geocoded by the address-cleanup feature (`contact_addresses.latitude/longitude`) export as per-address `GEO` properties tied to their `ADR` via Apple-style item groups (`item1.ADR` + `item1.GEO:lat;lon`) — vCard 3.0's plain `GEO` is card-level, so grouping is what keeps it per-address. `injectGeoIntoVcard()` remains in `vcardGenerator.ts` from the raw-replay export but has no caller now.

**Verified lossless on real data (2026-09-27):** importing the 12,116-card `docs/contacts.vcf`, exporting, and re-parsing gives the same value for every modeled field and every generic property on every card. The only difference is intentional: a social profile imported without a username gets one derived from its URL.

### VCF parsing notes (`vcardParser.ts`)

Several properties are read from the unfolded lines rather than through ical.js, because ical.js gets them wrong or leaves them untyped:

- **`TITLE`, `NOTE`, `FN`** — ical.js leaves `\;` escaped in single-value text, which put a stray backslash before every semicolon of an imported title.
- **`CATEGORIES`** — every value of every line is read. `getFirstPropertyValue` returned only the first category of a contact that had several.
- **`X-SOCIALPROFILE`, `X-ABRELATEDNAMES`** — read grouped or ungrouped, with quoted parameter values honoured. The platform comes from `TYPE` (Apple) or `X-SERVICE` (this app's exports before 2026-09-27). A related person's relationship comes from `TYPE`, else from the `X-ABLabel` of its group; Apple's built-in labels (`_$!<Spouse>!$_`) are lower-cased, anything else is kept as written.
- **URL labels** — ical.js reports the item group as a `group` parameter, not as part of the property name.
- **Primary email/phone** — the first entry flagged `TYPE=pref` or `PREF=1`, else the first entry.
- **Labels of emails, phones and addresses** — the `X-ABLabel` of the entry's item group, which ical.js exposes as the `group` parameter.
- **Everything not mapped to a field** — `collectExtraProperties()` sweeps the card's lines and returns every one no typed field consumed as `extraProperties`. A single-valued property (`N`, `ORG`, `NICKNAME`, …) is consumed once; a repeat is kept as extra. An annotation (`X-ABLabel`, `X-ABADR`, `GEO`, …) is consumed only when its group's owner stores it; a card-level `GEO` only when the card has one address.
- **`PHOTO;VALUE=URL`** — a link, not image data; kept as a generic property. It used to be passed to the image processor as base64.

### vCard-model backfills and `raw_vcard` retirement

Imports before 2026-09-27 stored only part of each card. On the first open of each database after deploy, in this order and once each:

1. `backfillVcardModel()` and `backfillVcardModelV2()` (`backend/src/services/vcardModelBackfill.ts`) re-parse `raw_vcard` and fill what was dropped — person fields, labels, extra types, address hints, dates, generic properties, leftover parameters, categories after the first, stray `\;` escapes — only where empty, never undoing a later edit.
2. `retireRawVcards()` (`backend/src/services/rawVcardRetirement.ts`) writes every stored card to `archive/original-cards-<date>.vcf.gz` in the user's directory, verifies the file byte-for-byte, then drops `contacts.raw_vcard` and runs `VACUUM`. If the archive can't be written it changes nothing and retries on the next open.

This also runs **in production** (Railway volume `/data`) on each user's first request after deploy. The archive is the only record of what contacts looked like before in-app edits and cleanups (removed Dex links, "No street" placeholders, cleaned notes, …); it is not read by the app. To see what differs between the originals and the database today: `cd backend && npx tsx scripts/checkVcardResidual.ts <userId>`.

Measured on the local databases: user 12 (8054 contacts) differs from its originals in 1 value (a malformed Apple Instagram entry); user 3's differences are all its cleanups. The databases shrank from 124 → 72 MB and 52 → 11 MB.

### Related-names backfill

Imports before 2026-09-27 could not read grouped `X-ABRELATEDNAMES`, so those related people existed only inside `raw_vcard` (since retired, see above). Since the export no longer replays the raw card, `backfillGroupedRelatedNames()` (`backend/src/services/relatedNamesBackfill.ts`) copies them into `contact_related_people` once per database, on open. It recovers grouped lines only — ungrouped ones were always imported, so a missing row for one of those means the user removed it — and records completion in `user_settings.related_names_backfilled_at` so that later removals are not undone.

### Public profile card (`/p/:slug`)

Users can publish their contact card at a server-generated slug. Behavior notes:

- The Profile page is **read-only with autosaving visibility controls** — there is no edit mode. The "Make my contact card public" toggle, "Hide All Fields", and the per-field eye toggles (shown next to every field in the contact card and next to the identity fields above it) all **autosave immediately** via a partial `PUT /api/profile`. On a failed autosave the control reverts and an error banner is shown. Profile data itself is edited via the linked contact.
- Per-field visibility lives in `visibility_json` on `user_profiles`. **Name and avatar default to visible**; tagline, company, title, contact details (emails/phones/addresses), socials, and birthday are hidden until opted in via the eye toggles. Older profiles created with all fields hidden are seeded with name + avatar visible the first time the public toggle is switched on (never while already public, to avoid silently exposing data).
- Nothing is served publicly until `is_public` is set — `GET /api/profile/public/:slug` returns 404 otherwise, and it blanks the visibility object and nulls all hidden fields in its response.
