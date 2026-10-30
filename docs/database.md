# Database Overview

Human-readable map of every table, column, constraint, index, and on-disk artefact in Yello.

**The code is the source of truth.** There are no migration files and no schema DSL — schema is created imperatively at connection time:

| Source | Owns |
| --- | --- |
| `backend/src/services/authDatabase.ts` | The shared auth database (`users`, `sessions`, `profile_images`) |
| `backend/src/services/userDatabase.ts` | The per-user contacts database (everything else) |
| `backend/src/routes/profile.ts` | `user_profiles` and `profile_slugs`, created lazily on first profile request |

---

## Architecture

Two tiers of **SQLite** (`better-sqlite3`), both opened with `journal_mode = WAL` and `foreign_keys = ON`.

```
/data
├── auth.db                        ← shared: users, sessions, profile_images, profile_slugs
├── photos/                        ← shared: USER profile images (see caveat below)
│   └── {thumbnail,small,medium,large}/<2-char prefix>/<md5>.jpg
└── users/
    └── <userId>/
        ├── contacts.db            ← one full contact database per tenant
        ├── photos/                ← that user's CONTACT photos
        │   └── {thumbnail,small,medium,large}/<2-char prefix>/<md5>.jpg
        ├── imports/<jobId>.vcf    ← staged VCF uploads, deleted on success
        ├── archive/original-cards-<date>.vcf.gz
        │                          ← imported originals, written once when raw_vcard was retired
        └── backups/<provider>-<timestamp>/
                                   ← backups of the user's iCloud / Google address books (see below)
```

**Remote address-book backups (`backups/`).** `services/sync/remoteBackupService.ts` writes one directory per backup, named `icloud-<UTC yyyymmddThhmmssmmm>Z` or `google-…`. Contents: `<provider>-contacts.vcf` (iCloud: every card byte-for-byte as iCloud stores it, groups included; Google: every contact rendered as vCard 3.0, labels as `CATEGORIES`, contact photos embedded), the full-fidelity copy (`icloud-index.json`: URL, etag, UID per card; `google-people.json`: every Person field plus all contact groups, as Google returned them), `yello.db` (a `db.backup()` snapshot of `contacts.db`), and `manifest.json` (counts, sha256 per file, status `running|verified|unverified|failed`, `confirmedAt`, and `restores[]`: every time the backup was put back, with counts). A backup is `verified` only when its `.vcf` re-reads to exactly the number of contacts the remote listed. Nothing deletes backups; they are not in any database.

### Tenancy has no tenant column

**A user's data is isolated by living in a different file, not by a `user_id` predicate.** There is no row-level security, no `WHERE user_id = ?`, and no cross-tenant query surface. Every authenticated handler resolves its database with:

```ts
const db = getUserDatabase(request.user!.id);   // /data/users/<id>/contacts.db
```

Consequences worth internalising:

- **There is no way to query across users.** Anything that must sweep all tenants (e.g. `resumeInterruptedImports`) enumerates `USER_DATA_PATH` subdirectories on the filesystem via `listUserIds()`.
- `getUserDatabase` is an **LRU cache of 50 open handles** (`userDatabase.ts:6`). Eviction calls `db.close()`, so long-running work must re-acquire the handle rather than hold one across await points.
- Deleting a user means deleting a directory.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUTH_DATABASE_PATH` | `./data/auth.db` | Shared auth database file |
| `USER_DATA_PATH` | `./data/users` | Parent directory of all per-user tenants |
| `PHOTOS_PATH` | `./data/photos` | Shared photo root — used for **user profile images**, and as the fallback when a contact photo is processed without a `userId` |

In production (`Dockerfile`) these are `/data/auth.db` and `/data/users`, on a Railway volume mounted at `/data`.

---

## Migration model

There is no CLI, no `migrate` script, and no ordered migration files. Schema is applied on **every connection**, in two phases:

1. **A single `db.exec()`** of `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` / `CREATE TRIGGER IF NOT EXISTS` / `CREATE VIRTUAL TABLE IF NOT EXISTS`.
2. **Idempotent `ALTER TABLE` blocks** whose failure is swallowed, for databases created before a column existed:

```ts
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN icloud_uid TEXT`);
} catch { /* column already exists */ }
```

`authDatabase.ts` uses the more explicit variant (`PRAGMA table_info` then conditional `ALTER`).

**To add a column:** append both the column to the `CREATE TABLE` (so fresh databases get it) and a try/catch `ALTER TABLE` (so existing ones do). Since the `ALTER` runs on every connection anyway, a column added only via `ALTER` still reaches fresh databases — but listing it in `CREATE TABLE` keeps the definition readable.

**And update this file in the same change.**

---

## Shared auth database (`/data/auth.db`)

Singleton connection via `getAuthDatabase()`. Shared by all tenants.

### `users`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | **This id is the tenant key** — it names the user's data directory |
| `google_id` | TEXT UNIQUE NOT NULL | Google OAuth subject |
| `email` | TEXT UNIQUE NOT NULL | |
| `name` | TEXT | |
| `avatar_url` | TEXT | Google-hosted URL |
| `access_token` | TEXT | Google OAuth access token |
| `refresh_token` | TEXT | Google OAuth refresh token |
| `token_expires_at` | DATETIME | |
| `is_demo` | INTEGER DEFAULT 0 | Demo accounts are blocked from writes and reaped on expiry |
| `has_onboarded` | INTEGER DEFAULT 0 | Drives the `/onboarding` redirect |
| `created_at` / `updated_at` | DATETIME DEFAULT CURRENT_TIMESTAMP | |

Indexes: `google_id`, `email`, `is_demo`.

### `sessions`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | Value of the `session_id` cookie |
| `user_id` | INTEGER NOT NULL → `users(id)` ON DELETE CASCADE | |
| `expires_at` | DATETIME NOT NULL | Auth check is `expires_at > datetime('now')` |
| `created_at` | DATETIME DEFAULT CURRENT_TIMESTAMP | |

Indexes: `user_id`, `expires_at`.

### `profile_images`

The signed-in user's own avatar, from several possible sources.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `user_id` | INTEGER NOT NULL → `users(id)` ON DELETE CASCADE | |
| `source` | TEXT NOT NULL | CHECK IN (`user_uploaded`, `google`, `google_contacts`, `gravatar`) |
| `original_url` | TEXT | Remote URL when not uploaded |
| `local_hash` | TEXT | MD5 naming the file on disk |
| `is_primary` | INTEGER DEFAULT 0 | |
| `fetched_at`, `created_at`, `updated_at` | DATETIME DEFAULT CURRENT_TIMESTAMP | |

Indexes: `user_id`, `source`, **UNIQUE** `(user_id, source)` — one image per source per user.

> **Storage caveat:** profile images are written to the **shared** `PHOTOS_PATH` and hashed on the user's email/id (`profileImageService.ts`), *not* into `/data/users/<id>/photos/`. Contact photos are the opposite — per-user directory, hashed on `contact_id`. Don't assume the two share a layout.

### `profile_slugs`

Created lazily by `ensureProfileSlugTable()` in `routes/profile.ts`. It lives in the **auth** DB because a public profile lookup (`GET /api/profile/public/:slug`) is unauthenticated and therefore has no tenant to open yet — the slug is what resolves the tenant.

| Column | Type | Notes |
| --- | --- | --- |
| `slug` | TEXT PK | 8 random lowercase alphanumerics |
| `user_id` | INTEGER NOT NULL UNIQUE → `users(id)` ON DELETE CASCADE | One slug per user |

Kept in sync with `user_profiles.public_slug` by `syncProfileSlug()` (delete-then-insert).

---

## Per-user contacts database (`/data/users/<userId>/contacts.db`)

### `contacts`

The root record. Everything else in this database hangs off it via `ON DELETE CASCADE`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `first_name`, `last_name` | TEXT | |
| `display_name` | TEXT **NOT NULL** | The only required field |
| `company`, `title`, `notes` | TEXT | |
| `birthday` | TEXT | ISO-ish date string, not a DATE type |
| `photo_hash` | TEXT | MD5 of `contact_id`; locates the file under the user's photos dir |
| `middle_name`, `name_prefix`, `name_suffix` | TEXT | *(migration)* Components 3–5 of vCard `N` |
| `nickname` | TEXT | *(migration)* vCard `NICKNAME` |
| `gender` | TEXT | *(migration)* Apple `X-GENDER`, as written (`Male`, `Female`, …) |
| `department` | TEXT | *(migration)* `ORG` components after the company, `;`-joined |
| `is_company` | INTEGER DEFAULT 0 | *(migration)* Apple `X-ABShowAs:COMPANY` — the card is an organisation |
| `placeholder_name` | TEXT | *(migration)* Stand-in name of a card imported or synced with no name at all (no `FN`, empty `N`): its company, else primary email, else primary phone, else `No Name`. `display_name` is set to the same value. Cleanup's **No Name** list is the contacts whose `display_name` still equals it (with no first/last name); renaming the contact takes it off the list |
| `vcard_params` | TEXT | *(migration)* JSON leftover parameters of the single-valued properties, keyed by property: `{"BDAY": {"X-APPLE-OMIT-YEAR": ["1604"]}}`. See *Leftover parameters* |
| ~~`raw_vcard`~~ | — | **Retired 2026-09-27.** Held each card as imported. Dropped once every property was modeled; the originals are in `archive/original-cards-<date>.vcf.gz`. See *raw_vcard retirement* below |
| `archived_at` | DATETIME DEFAULT NULL | **`NULL` means active.** Soft-delete — see below |
| `gmail_history_id` | TEXT | Gmail incremental-sync cursor |
| `gmail_last_sync_at` | TEXT | |
| `google_resource_name` | TEXT | *(migration)* Google People API `resourceName` |
| `icloud_uid` | TEXT | *(migration)* vCard `UID`, `urn:uuid:` stripped. **Every contact has one** since 2026-10-25: trigger `contacts_ai_uid` gives a new contact without one a random uppercase v4 UUID, and a one-time backfill (marker `user_settings.contact_uids_backfilled_at`, run after the `raw_vcard` backfills so a card's own UID wins) did the same for existing contacts. It names the contact's card in iCloud and is written to Google as `clientData` `yelloUid`. Despite the name it is the contact's UID for every source |
| `created_via` | TEXT | *(migration 2026-10-28)* How the contact was created: `manual`, `profile`, `demo`, `vcf_import`, `icloud_import`, `google_import`, `linkedin_import`, `icloud_sync`, `google_sync`. NULL for contacts created before the column. No CHECK; the values are `ContactOrigin` in `contactPersistence.ts`. Read by the Recent page (`routes/stats.ts`) |
| `created_at` / `updated_at` | DATETIME DEFAULT CURRENT_TIMESTAMP | UTC, `YYYY-MM-DD HH:MM:SS` with no zone: parse as UTC |

Indexes: `display_name`, `(last_name, first_name)`, `archived_at`, partial `google_resource_name WHERE NOT NULL`, partial `icloud_uid WHERE NOT NULL`.

**Archive semantics:** `archived_at IS NULL` = active, and essentially every listing query filters on it. Archived contacts are *not* excluded from import matching — `loadExistingContacts()` deliberately includes them so a re-import matches an archived contact rather than resurrecting a duplicate; the UI labels those matches and defaults them to skip.

**External identifiers** (`google_resource_name`, `icloud_uid`) are the stable keys that make re-imports idempotent. `matchIncomingContacts` short-circuits on an external-id hit at `very_high` confidence *before* falling back to email/phone/social heuristics, and the VCF importer skips any card whose `icloud_uid` already exists.

### Contact child tables

All share `contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE` and an index on `contact_id`.

| Table | Columns beyond `id` / `contact_id` | Notes |
| --- | --- | --- |
| `contact_emails` | `email` NOT NULL, `type`, `extra_types`, `label`, `params`, `is_primary`, `detail_archived_at` | Extra index on `email COLLATE NOCASE` |
| `contact_phones` | `phone` NOT NULL, `phone_display` NOT NULL, `country_code`, `type`, `extra_types`, `label`, `params`, `is_primary`, `detail_archived_at` | `phone` is E.164 (`libphonenumber-js`); `phone_display` is the formatted form. Extra index on `phone` |
| `contact_addresses` | `street`, `city`, `state`, `postal_code`, `country`, `type`, `extra_types`, `label`, `po_box`, `extended`, `sublocality`, `subadministrative_area`, `country_code`, `params`, `latitude`, `longitude`, `geocoded_at`, `detail_archived_at` | See geocoding below. `po_box`/`extended` are `ADR` components 1–2; `sublocality`, `subadministrative_area`, `country_code` are Apple's `X-APPLE-SUBLOCALITY`, `X-APPLE-SUBADMINISTRATIVEAREA`, `X-ABADR` of the address's item group |
| `contact_social_profiles` | `platform` NOT NULL, `username` NOT NULL, `profile_url`, `type`, `params`, `detail_archived_at` | Extra index on `(platform, username)` |
| `contact_categories` | `category` NOT NULL | Free-text tags, from vCard `CATEGORIES` |
| `contact_instant_messages` | `service` NOT NULL, `handle` NOT NULL, `type`, `params`, `detail_archived_at` | From vCard `IMPP` |
| `contact_urls` | `url` NOT NULL, `label`, `type`, `params`, `detail_archived_at` | `label` carries Apple `X-ABLabel` grouped labels |
| `contact_related_people` | `name` NOT NULL, `relationship`, `related_contact_id`, `params` | *(migration)* nullable FK → `contacts(id)` ON DELETE **SET NULL**, so free-text names keep a `NULL` link. Partial index `WHERE related_contact_id IS NOT NULL` |
| `contact_dates` | `date` NOT NULL, `label`, `params` | Apple `X-ABDATE` and vCard `ANNIVERSARY`. `date` and `label` are kept as written (Apple's built-ins look like `_$!<Anniversary>!$_`) |
| `contact_vcard_properties` | `position` NOT NULL, `group_name`, `name` NOT NULL, `params`, `value` NOT NULL | Every vCard property with no typed home, one row per line in card order. `name` upper-cased; `params` JSON `{"PARAM": ["v", …]}` (a bare vCard 2.1 parameter maps to `[]`); `value` still vCard-escaped. Indexes `(contact_id, position)` and `name`. Read-only in the API |
| `contact_merged_identities` | `kind` NOT NULL, `value` NOT NULL, `merged_at` | The vCard UIDs (`kind = 'uid'`) and Google resource names (`'google_resource_name'`) of contacts merged *into* this one. `UNIQUE (kind, value)`; index on `contact_id`. Written by `carryMergedIdentities()` during a merge (the primary first adopts a UID / resource name it lacks; the rest land here, and a secondary's own records are re-pointed). `matchIncomingContacts` treats them as authoritative identifiers, so the merged-away cards still in iCloud/Google resolve to the surviving contact. Merges before 2026-10-25 recorded nothing |

**`type` / `extra_types` / `label` (emails, phones, addresses).** `type` is the first vCard `TYPE` (what the edit form's select binds to); `extra_types` holds the rest, comma-joined (`fax` of `TYPE=HOME;TYPE=FAX`, `internet` of `TYPE=OTHER;TYPE=INTERNET`). `pref` is never stored as a type — preference is `is_primary`. `label` is the Apple `X-ABLabel` of the entry's item group ("Obsolete", "WhatsApp", `_$!<HomePage>!$_`). The edit endpoints replace child rows wholesale from forms that don't carry `label`/`extra_types`/address hints/`params`, so `PUT /api/contacts/:id` and the profile save wrap the replacement in `preserveEntryAnnotations()`, which restores them on rows whose value (email, E.164 phone, street+city+postcode, URL, IM, social URL, related name) survived.

**Archived details (`detail_archived_at`, *migration* 2026-10-26).** Nullable ISO timestamp on emails, phones, addresses, social profiles, IMs and URLs; set means the detail is archived: kept and searchable, hidden behind the card's "N archived" link, never sent to iCloud or Google, and exported to VCF with `X-ABLabel:Archived` plus `X-YELLO-ARCHIVED=<date>` / `X-YELLO-LABEL=<original label>`. Named so it can't collide with `contacts.archived_at` in joined queries. An archived email/phone is never `is_primary` (`normalizeArchivedPrimary`). Any row written with the label `Obsolete` or `Archived` is stored archived with the label cleared, and `archiveObsoleteLabels()` runs that conversion over existing rows on every connection (idempotent: a converted row no longer matches). See `services/archivedDetails.ts` and *Archived contact details* in `docs/reference.md`.

**Leftover parameters (`params`, `contacts.vcard_params`).** A typed column keeps a property's value but not every vCard parameter on it. Whatever parameters no column holds are stored as JSON in the row's `params` (or, for single-valued properties like `BDAY`, in `contacts.vcard_params` keyed by property name) and written back on export. In real Apple/BusyContacts data that is mostly `TYPE=pref` on URLs, addresses and IMs (which have no `is_primary`), `X-APPLE-OMIT-YEAR` on birthdays without a year (without it a birthday exports as year 1604), and Apple's `X-USERID` / `X-DISPLAYNAME` / `X-BUNDLEIDENTIFIERS` / `X-TEAMIDENTIFIER` on social profiles. Not stored: `TYPE` values already in `type`/`extra_types`, `PREF` (→ `is_primary`), the item group, and parameters other columns hold (`X-USER`, `X-SERVICE-TYPE`).

### vCard coverage

Every property of an imported card lands in exactly one place — a typed column/table above, or `contact_vcard_properties` — so export (`vcardExportService.ts`) builds the card from the database alone.

| vCard property | Stored in |
| --- | --- |
| `FN`, `N`, `ORG`, `TITLE`, `NOTE`, `BDAY`, `NICKNAME`, `X-GENDER`, `X-ABShowAs`, `UID` | `contacts` columns (`UID` → `icloud_uid`) |
| `EMAIL`, `TEL`, `ADR` (+ their `X-ABLabel`, `X-ABADR`, `X-APPLE-SUB*`, `GEO`) | `contact_emails` / `contact_phones` / `contact_addresses` |
| `LABEL` | Not stored — the display form of an address, regenerated from its parts |
| `URL`, `IMPP`, `X-SOCIALPROFILE`, `X-ABRELATEDNAMES`, `CATEGORIES` | Their child tables |
| `X-ABDATE`, `ANNIVERSARY` | `contact_dates` |
| `PHOTO` (inline) | Files on disk + `contact_photos`, re-encoded to at most 800 px (the larger originals are not kept — a deliberate choice) |
| `X-YELLO-LINKEDIN` | `linkedin_enrichment` |
| `VERSION` | Not stored — always written as `3.0` |
| `X-YELLO-CONTACT-ID` | Not stored — tags cards in the `raw_vcard` archive; a contact id means nothing in another database |
| Parameters no column holds | The row's `params`, or `contacts.vcard_params` |
| **Everything else**: `PRODID`, `REV`, `X-CREATED`, `X-IMAGEHASH`, `X-IMAGETYPE`, `X-BUSYMAC-*`, `X-SHARED-PHOTO-DISPLAY-PREF`, `X-ADDRESSING-GRAMMAR`, `VND-63-*`, a `PHOTO` given as a URL, a repeat of a single-valued property, an `X-ABLabel` of a property with no label column (e.g. `IMPP`), unknown `X-` properties | `contact_vcard_properties` |

These last ones get no typed column because they describe the file or the client that wrote it (sync revision, image hash, BusyContacts' last editor), or are an opaque vendor encoding (`X-ADDRESSING-GRAMMAR` is iOS 17's base64 plist of pronouns). Nothing in the app can meaningfully edit them; they only need to survive a round trip.

**Geocoding (`contact_addresses`).** `latitude`/`longitude` are REAL, `geocoded_at` is TEXT. The address-cleanup queue reads these as a three-state machine:

| State | Meaning |
| --- | --- |
| `geocoded_at IS NULL` | Pending — will be sent to the HERE API |
| `geocoded_at` set, lat/lon `NULL` | Attempted and failed — not retried |
| `geocoded_at` set, lat/lon present | Geocoded |

Coordinates arrive from two places: the HERE API, or a vCard's `GEO` property on import. Imported coordinates **stamp `geocoded_at`** precisely so they land in the third state and are not re-billed through HERE. Partial index `idx_contact_addresses_geocoded ON (latitude, longitude) WHERE latitude IS NOT NULL`; composite index on `(street, city, postal_code)` for duplicate matching.

### Search (FTS5)

Three virtual tables, two maintained by triggers and one maintained in code.

| Table | Content | Maintained by |
| --- | --- | --- |
| `contacts_fts` | `display_name`, `company` — external content on `contacts` | Triggers `contacts_ai` / `contacts_ad` / `contacts_au` (`AFTER UPDATE OF display_name, company` — older databases had it on every UPDATE and are migrated on open; see below) |
| `emails_fts` | `email` — external content on `contact_emails` | Triggers `emails_ai` / `emails_ad` |
| `contacts_unified_fts` | `searchable_text` — **contentless** (`content=''`, `contentless_delete=1`) | Code: `rebuildContactSearch()` |

`contacts_fts` uses `tokenize='porter unicode61'` with `prefix='2 3'`. `contacts_unified_fts` uses `tokenize="unicode61 tokenchars '@.'"` so email addresses and domains tokenise sensibly.

**`contacts_fts` is never written directly.** Its triggers are the only writers. A manual `DELETE FROM contacts_fts` before deleting the contact made `contacts_ad` delete the row a second time, which SQLite reports as `database disk image is malformed` (fixed 2026-10-25 in `deleteArchivedContacts` and `cleanupService`'s delete). For the same reason `contacts_au` only fires on the two indexed columns: the UID trigger updates a row before `contacts_ai` has indexed it.

**`contacts_unified_fts` has no triggers.** `buildSearchableText()` (`services/database.ts`) concatenates the contact plus all of its child rows plus JSON-encoded enrichment blobs; `rebuildContactSearch(db, contactId)` deletes and re-inserts the row. **Any code path that writes contacts or their children must call `rebuildContactSearch` itself**, or the contact becomes unfindable. Every importer does this per contact.

### `user_settings`

Single row, enforced by `CHECK (id = 1)` and seeded with `INSERT OR IGNORE INTO user_settings (id) VALUES (1)`. The only seeded data in the schema.

| Column | Notes |
| --- | --- |
| `name`, `email`, `phone`, `avatar_url`, `website`, `linkedin_url` | The user's own details |
| `icloud_email` | iCloud account for CardDAV sync |
| `icloud_app_password` | **Encrypted at rest** |
| `apify_api_token` | **Encrypted at rest** |
| `apify_username` | |
| `google_contacts_last_synced` | *(migration)* DATETIME |
| `related_names_backfilled_at` | *(migration)* TEXT. Marker for the one-time related-names backfill; `NULL` means it has not run. See below |
| `vcard_model_backfilled_at` | *(migration)* TEXT. Marker for the one-time vCard-model backfill. See below |
| `vcard_model_v2_backfilled_at` | *(migration)* TEXT. Marker for the second vCard-model backfill |
| `raw_vcards_archived_at` | *(migration)* TEXT. Marker for the `raw_vcard` retirement; set only after the archive is verified and the column dropped |
| `contact_uids_backfilled_at` | *(migration)* TEXT. Marker for the one-time UID backfill (every contact without `icloud_uid` gets a random one) |
| `created_at` / `updated_at` | |

Encryption is `services/tokenEncryption.ts` (`encryptToken` / `decryptToken`), keyed off `SESSION_SECRET`. **Rotating `SESSION_SECRET` invalidates every stored third-party credential.**

**Related-names backfill (data migration).** `getUserDatabase` runs `backfillGroupedRelatedNames()` after the schema migrations. While `related_names_backfilled_at` is `NULL` it scans contacts whose `raw_vcard` holds a grouped `X-ABRELATEDNAMES` line, inserts the names missing from `contact_related_people` (matched case-insensitively per contact), and stamps the marker — all in one transaction. Resetting the marker to `NULL` makes it run again on the next open, which would re-add any recovered name the user has since removed.

**vCard-model backfill (data migration).** Right after it, `backfillVcardModel()` (`services/vcardModelBackfill.ts`) runs while `vcard_model_backfilled_at` is `NULL`: it re-parses every contact's `raw_vcard` and fills what older imports dropped — person fields, email/phone/address labels and extra types, address hints, URL labels, `icloud_uid`, `contact_dates` and `contact_vcard_properties` — then sets every stored `type = 'pref'` to `NULL`, all in one transaction (~0.9 s for 8000 contacts). It only fills gaps: columns are `COALESCE`d, rows are matched by value so a removed row stays removed, dates/properties are inserted only for contacts that have none, and name parts / department are taken only while first+last name / company still match the card. Then `backfillVcardModelV2()` (marker `vcard_model_v2_backfilled_at`) fills the leftover `params`, restores categories after the first where the contact still has the card's first category and none of the rest (the signature of the old importer keeping only the first), fills URL labels stored as `''`, and removes the stray `\;` ical.js left in titles and notes where that yields exactly the card's value. It matches rows with keys computed in JS, because SQLite's `LOWER()` folds ASCII only. These backfills and the retirement below are the only migrations that write contact data rather than schema. On a database created after the retirement there is no `raw_vcard`, so all of them only set their marker.

**`raw_vcard` retirement (data migration).** Last, `retireRawVcards()` (`services/rawVcardRetirement.ts`) writes every non-empty `raw_vcard` — archived contacts included — to `/data/users/<id>/archive/original-cards-<date>.vcf.gz`, each card tagged `X-YELLO-CONTACT-ID:<id>`. The file goes to a temporary name, is fsynced, read back and compared byte-for-byte, then renamed. Only after that does it null the column, `DROP COLUMN raw_vcard`, set `raw_vcards_archived_at`, and `VACUUM` (`raw_vcard` was 40–70% of a database). If the archive or the drop fails it logs, leaves everything as it was, and tries again on the next open; it never throws out of `getUserDatabase`. `backend/scripts/checkVcardResidual.ts <userId>` compares the archive with what the database exports today — the differences are the app's own edits and cleanups, not losses.

### `linkedin_enrichment`

One row per enriched contact — `contact_id` is **UNIQUE**, so enrichment is upserted rather than accumulated.

Text fields: `linkedin_first_name`, `linkedin_last_name`, `headline`, `about`, `job_title`, `company_name`, `company_linkedin_url`, `industry`, `country`, `location`, `photo_linkedin`, `enriched_at`.
Numeric: `followers_count`.
**JSON-encoded TEXT columns:** `education`, `skills`, `positions`, `certifications`, `languages`, `honors`, `raw_response`.

The JSON columns are walked recursively by `collectJsonStrings()` when building search text, so nested values stay searchable.

Rows are written by Apify enrichment and by VCF import, which restores them from an `X-YELLO-LINKEDIN` property. `services/linkedinEnrichmentColumns.ts` lists the columns that export carries and import accepts; **a column added to this table must be added there too**, or it will not survive an export/import.

### `linkedin_enrichment_failures`

| Column | Notes |
| --- | --- |
| `contact_id` | NOT NULL **UNIQUE** → cascade |
| `error_reason` | TEXT NOT NULL |
| `attempted_at` | TEXT DEFAULT `(datetime('now'))` |

A result log, not a retry queue — there is no attempt counter or backoff state.

### `contact_emails_history`

Gmail message metadata synced per contact. Bodies are never stored.

| Column | Notes |
| --- | --- |
| `gmail_message_id` | TEXT NOT NULL **UNIQUE** — the idempotency key for re-sync |
| `thread_id` | TEXT NOT NULL |
| `subject`, `snippet` | TEXT |
| `date` | TEXT NOT NULL |
| `direction` | TEXT NOT NULL, CHECK IN (`inbound`, `outbound`) |
| `synced_at` | TEXT NOT NULL DEFAULT `(datetime('now'))` |

Indexes: `(contact_id, date DESC)`, `gmail_message_id`.

### `contact_photos`

Multi-source photo record. The winning image's hash is denormalised onto `contacts.photo_hash`.

| Column | Notes |
| --- | --- |
| `source` | TEXT NOT NULL, CHECK IN (`vcard`, `google`, `gravatar`, `linkedin`) |
| `original_url` | TEXT |
| `local_hash` | TEXT — MD5 naming the files on disk |
| `is_primary` | INTEGER DEFAULT 0 |
| `fetched_at` | DATETIME DEFAULT CURRENT_TIMESTAMP |

**UNIQUE `(contact_id, source)`** — importers rely on this for `ON CONFLICT ... DO UPDATE`.

Files live at `/data/users/<userId>/photos/<size>/<first 2 chars of hash>/<hash>.jpg` in four sizes: `thumbnail` 96px, `small` 192px, `medium` 400px, `large` 800px (all `fit: cover`, `position: attention`). Served by the auth-gated `GET /photos/*` handler, which resolves the path and rejects anything escaping the user's directory.

### `import_jobs`

Durable progress record for background VCF imports. The frontend polls this; it is not a generic queue.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID, and also the staged filename (`<id>.vcf`) |
| `kind` | TEXT NOT NULL DEFAULT `'vcf'` | Forward-looking; only `vcf` is produced today |
| `status` | TEXT NOT NULL DEFAULT `'pending'` | CHECK IN (`pending`, `running`, `completed`, `failed`) |
| `filename` | TEXT | The user's original filename, for display |
| `file_path` | TEXT | Staged upload on the volume. **Never exposed** — stripped by the response schema |
| `file_size` | INTEGER | Bytes |
| `total_cards` | INTEGER DEFAULT 0 | `0` until the counting pass finishes |
| `cards_processed` | INTEGER DEFAULT 0 | **Doubles as the restart resume offset** |
| `imported_count` | INTEGER DEFAULT 0 | |
| `skipped_count` | INTEGER DEFAULT 0 | Cards whose `icloud_uid` already existed |
| `failed_count` | INTEGER DEFAULT 0 | |
| `photos_processed` | INTEGER DEFAULT 0 | |
| `addresses_geotagged` | INTEGER DEFAULT 0 | *(migration)* Addresses that arrived carrying `GEO` |
| `result` | TEXT | JSON `ImportJobResult` on finish; `errors` truncated to 100 entries |
| `error_message` | TEXT | Sanitised, user-facing |
| `started_at`, `completed_at` | TEXT | |
| `created_at` | TEXT DEFAULT `(datetime('now'))` | |

Indexes: `status`, `created_at DESC`.

**`cards_processed` is written only after a batch transaction commits**, which is what makes it an exact resume offset — resuming can neither drop nor duplicate a card. On boot, `resumeInterruptedImports()` walks every tenant directory, re-enqueues `running` jobs whose staged file survives, and fails the rest.

### Sync with iCloud and Google

Tables for making Yello the source of truth and syncing it with the user's iCloud and Google address books (`docs/plans/2026-10-25-yello-source-of-truth-sync.md`). Created on every open in `userDatabase.ts`. Until the sync engine ships (Phase 2+), only the cutover preview writes to them (`sync_cutovers`, `sync_cutover_items`), plus the tombstone trigger and merge link handover.

**`contact_sync_links`** — one row per contact per remote book it is synced with.

| Column | Type | Notes |
| --- | --- | --- |
| `contact_id` | INTEGER NOT NULL | FK → `contacts(id)` ON DELETE CASCADE |
| `provider` | TEXT NOT NULL | CHECK `icloud`, `google` |
| `remote_id` | TEXT | iCloud card URL or Google `people/…` resource name; NULL while `pending_create` |
| `remote_uid` | TEXT | UID inside the iCloud card (CardDAV never lets it change) |
| `etag` | TEXT | Remote version at the last sync |
| `local_hash` / `remote_hash` | TEXT | sha256 of the provider projection (`services/sync/syncProjection.ts`) of Yello's / the remote's side at the last sync. `NULL` local hash = "compare everything next run" (set when a merge hands the link to another contact) |
| `local_snapshot` / `remote_snapshot` | TEXT | That projection as JSON, for field-by-field three-way merges |
| `local_photo_hash` / `remote_photo_hash` | TEXT | Photos are compared apart from the projection (servers recompress them) |
| `status` | TEXT NOT NULL DEFAULT `'active'` | CHECK `active`, `pending_create`, `deleted`, `error` |
| `last_error`, `last_pulled_at`, `last_pushed_at`, `created_at` | | |

`UNIQUE (provider, remote_id)`, `UNIQUE (contact_id, provider)`. A merge moves a secondary's link to the survivor when the survivor has none for that provider (`carryMergedIdentities`); otherwise the link is left to cascade, and the tombstone trigger records the card for deletion.

**`sync_tombstones`** — remote cards whose contact was hard-deleted: `provider`, `remote_id` NOT NULL, `remote_uid`, `etag`, `display_name`, `reason` (default `contact_deleted`), `created_at`, `remote_deleted_at` (set once sync has deleted the card). Filled by trigger **`contacts_bd_sync`** (`BEFORE DELETE ON contacts`) from the contact's active/error links, so every hard-delete path (merge, empty archive, cleanup, delete-all) is covered without touching it. Partial index on `provider WHERE remote_deleted_at IS NULL`.

**`sync_providers`** — one row per provider, seeded `icloud` and `google`: `enabled`, `paused` (INTEGER 0/1), `collection_url` (the iCloud address book), `sync_token` (CardDAV sync-token / Google `syncToken`), `ctag`, `last_run_at`, `last_success_at`, `last_error`, `consecutive_failures`, `cutover_completed_at`, `lock_holder` / `lock_until` (a lease so two processes never sync one user at once), `updated_at`. `DELETE /api/contacts/all` returns 409 while any row is `enabled`.

**`sync_runs`** — one row per sync run: `provider`, `trigger` (CHECK `cutover`, `scheduled`, `manual`, `local_edit`), `status` (CHECK `running`, `completed`, `failed`, `paused`), `started_at`, `finished_at`, counters `pulled_created/updated/archived`, `pushed_created/updated/deleted`, `conflicts`, `errors_json`.

**`sync_remote_versions`** — remote versions sync overwrote or deleted, kept for restore: `run_id` (FK → `sync_runs` SET NULL), `contact_id` (FK → `contacts` SET NULL), `provider`, `remote_id`, `reason` (CHECK `conflict_yello_won`, `remote_delete`, `pre_update`, `cutover_conflict`, `cutover_delete`), `payload` (raw vCard or Person JSON), `created_at`, `restored_at`. Index on `contact_id`.

**`sync_cutovers`** — the one-time switch: `id` TEXT PK (`cutover-<uuid>`), `status` (CHECK `planning`, `planned`, `applying`, `pushing`, `done`, `failed`, `aborted`), `window_days`, `icloud_backup_id` / `google_backup_id` (the backups the plan was computed from), `summary_json`, `error`, `created_at`, `updated_at`. Only the latest plan is kept: a new preview deletes older `planned`/`failed` rows.

**`sync_cutover_items`** — the plan's decisions: `cutover_id` (FK ON DELETE CASCADE), `provider` (NULL for Yello-only items), `kind` (CHECK `link`, `merged_duplicate`, `update`, `conflict`, `possible_match`, `import`, `delete_remote`, `restore_review`, `create_remote`, `group_card`), `remote_id`, `remote_uid`, `contact_id` (FK SET NULL), `display_name`, `field` (a projection family for `update`/`conflict`), `yello_value` / `remote_value` (projection JSON), `yello_ts` / `remote_ts`, `reason`, `suggested`, `resolution` (the reviewer's choice; `NULL` = the default, see `RESOLUTIONS` / `defaultResolution` in `services/sync/cutoverApply.ts`: `update` apply|skip, `conflict` yello|remote (default: the suggested side), `possible_match` import|same|delete, `import` import|delete, `delete_remote` and `merged_duplicate` delete|import, `restore_review` delete|restore, `group_card` archive|keep). Index `(cutover_id, kind)`.

Applying a plan writes, in one transaction: the accepted remote changes into the contacts, new contacts for cards being kept, a `contact_sync_links` row per remaining card (the backup's version as `remote_snapshot`; `local_hash` set only when Yello already describes the contact exactly like the card, else `NULL` so the first push updates it), a `sync_tombstones` row (`reason = 'cutover'`) per card to remove, and `sync_providers.enabled = 1` / `cutover_completed_at`; then `sync_cutovers.status` moves `applying → pushing → done` and `summary_json.apply` records each provider's first sync run.

### `user_profiles`

Created lazily by `ensureProfileTables()` in `routes/profile.ts`, not in `userDatabase.ts`.

| Column | Notes |
| --- | --- |
| `user_id` | INTEGER NOT NULL **UNIQUE** — denormalised; this database already belongs to one user |
| `linked_contact_id` | INTEGER → `contacts(id)` ON DELETE **SET NULL**. Profile data is read from this contact rather than duplicated |
| `is_public` | INTEGER DEFAULT 0 — **nothing is served publicly until this is 1** |
| `public_slug` | TEXT UNIQUE — mirrored into `profile_slugs` in the auth DB |
| `tagline`, `notes` | TEXT |
| `visibility_json` | TEXT — JSON per-field visibility map |
| `created_at` / `updated_at` | DATETIME |

Indexes: `user_id`, `public_slug`, `linked_contact_id`.

`visibility_json` holds booleans for `avatar`, `firstName`, `lastName`, `tagline`, `company`, `title`, `website`, `linkedin`, `instagram`, `whatsapp`, `birthday`, plus id-keyed maps for `emails`, `phones`, `addresses`, `otherSocialLinks`. **Defaults are name + avatar visible, everything else hidden.** `GET /api/profile/public/:slug` returns 404 unless `is_public`, and nulls every hidden field rather than relying on the client to respect the flags.

This table has a **destructive migration**: legacy columns (`first_name`, `last_name`, `company`, `title`, `website`, `linkedin`, `instagram`, `whatsapp`, `birthday`, `avatar_url`) are `DROP COLUMN`ed if present, since profiles now read through `linked_contact_id`.

---

## CHECK constraints at a glance

| Table.column | Allowed values |
| --- | --- |
| `profile_images.source` | `user_uploaded`, `google`, `google_contacts`, `gravatar` |
| `contact_photos.source` | `vcard`, `google`, `gravatar`, `linkedin` |
| `contact_emails_history.direction` | `inbound`, `outbound` |
| `import_jobs.status` | `pending`, `running`, `completed`, `failed` |
| `contact_merged_identities.kind` | `uid`, `google_resource_name` |
| `contact_sync_links.provider`, `sync_tombstones.provider`, `sync_providers.provider`, `sync_runs.provider`, `sync_remote_versions.provider`, `sync_cutover_items.provider` | `icloud`, `google` |
| `contact_sync_links.status` | `active`, `pending_create`, `deleted`, `error` |
| `sync_runs.trigger` | `cutover`, `scheduled`, `manual`, `local_edit` |
| `sync_runs.status` | `running`, `completed`, `failed`, `paused` |
| `sync_remote_versions.reason` | `conflict_yello_won`, `remote_delete`, `pre_update`, `cutover_conflict`, `cutover_delete` |
| `sync_cutovers.status` | `planning`, `planned`, `applying`, `pushing`, `done`, `failed`, `aborted` |
| `sync_cutover_items.kind` | `link`, `merged_duplicate`, `update`, `conflict`, `possible_match`, `import`, `delete_remote`, `restore_review`, `create_remote`, `group_card` |
| `user_settings.id` | `1` (single-row table) |

---

## Conventions and traps

- **Timestamps are inconsistent by type.** Some columns are `DATETIME DEFAULT CURRENT_TIMESTAMP`, others `TEXT DEFAULT (datetime('now'))`. Both store zone-less UTC strings. Clients **must** append a `Z` before parsing, or the browser reads them as local time.
- **Booleans are INTEGER `0`/`1`.** SQLite has no boolean type.
- **`is_primary` is not enforced.** Nothing prevents two primary emails; ordering code treats it as a hint.
- **Cascades are wide.** Deleting a contact removes every child row, its photos record, enrichment, email history, custom dates and generic vCard properties. A merge carries a secondary's person fields, dates, email/phone/address annotations and remote identifiers (`icloud_uid`, `google_resource_name` → the survivor or `contact_merged_identities`) to the survivor, but not its `contact_vcard_properties` (client metadata of a card that no longer exists). Only `contact_related_people.related_contact_id` and `user_profiles.linked_contact_id` use SET NULL.
- **FTS is only as correct as the last `rebuildContactSearch` call** — `contacts_unified_fts` is contentless and trigger-free.
- **No `updated_at` triggers.** Where it matters it is set explicitly in the query.
- **Writes must go through the owning tenant's handle.** Re-acquire via `getUserDatabase(userId)` rather than caching a connection across awaits, because the 50-entry LRU may have closed it.
