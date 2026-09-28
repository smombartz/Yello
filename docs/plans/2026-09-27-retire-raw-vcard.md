# Finish capturing imported vCard data, then retire `raw_vcard`

## Context

Goal: every piece of imported data about a person lives in the database, so the stored
original cards (`contacts.raw_vcard`) can be removed. The last change modeled every vCard
*property*. This plan measures what is still only in `raw_vcard`, closes those gaps,
archives the originals to a file, and drops the column.

### Where we are (measured on copies of local users 3 and 12)

A per-contact comparison of `parse(raw_vcard)` against the DB-generated card found:

**Real gaps: import bugs or data we don't store**

| Gap | Size | Cause |
|---|---|---|
| Categories after the first | 52 (u12) / 51 (u3) | Old importer kept only the first `CATEGORIES` value; never backfilled |
| Titles with a stray `\;` | 23 / 26 | Old importer left ical.js escaping in place |
| Email/phone labels not matching | 6 + 6 | Backfill matched by value; duplicate values in one card with different labels (to confirm) |
| **Parameters on modeled properties** | 241 `BDAY;X-APPLE-OMIT-YEAR`; ~86 `X-SOCIALPROFILE` `X-USERID`/`X-DISPLAYNAME`/`X-BUNDLEIDENTIFIERS`/`X-TEAMIDENTIFIER`; `IMPP;X-BUNDLEIDENTIFIERS`; extra TYPEs on URL/IMPP/related names (sample counts) | Typed columns keep the value but drop these params. Without `X-APPLE-OMIT-YEAR`, a no-year birthday exports as year 1604 |

**Not gaps: deliberate changes (user 3 only)**, where `raw_vcard` holds the pre-cleanup
original:
- 9,413 URLs removed, mostly Dex links
- 6,542 URLs converted into social profiles
- 1,653 "No street" addresses removed and 614 normalized
- 537 notes cleaned
- a few company, phone and social edits

**Decided:**
- The originals get archived to a file before the column is dropped.
- 800px photos are enough, so the 29 larger originals in user 3 are not kept.
  (User 12's photos are all ≤200px.)

`raw_vcard` is 48 MB of user 3's 130 MB database and 36 MB of user 12's 54 MB.

Readers today: the two one-time backfills; the API's `rawVcard` field (built in 3 handlers
in `routes/contacts.ts`, typed in `schemas/contact.ts` and `types/index.ts`; the frontend
never reads it); and `SELECT raw_vcard` in the archive, merge, cleanup, dedup and
social-links-cleanup services, which only fill that field. Writers: `importService.ts`,
`routes/icloud.ts`, and `routes/googleContacts.ts`, which always writes `''`.

## Part 1: Close the remaining gaps

1. **Leftover parameters.**
   - Add a `params TEXT` JSON column to `contact_emails`, `contact_phones`,
     `contact_addresses`, `contact_urls`, `contact_instant_messages`,
     `contact_social_profiles`, `contact_related_people` and `contact_dates`.
   - Add `contacts.vcard_params TEXT` as JSON keyed by property name, e.g.
     `{"BDAY": {"X-APPLE-OMIT-YEAR": ["1604"]}}`.
   - Store every parameter the typed columns don't already represent. That means anything
     except `TYPE` values held in `type`/`extra_types`, `PREF`, the `group`, `ENCODING`, and
     `X-USER` / `X-SERVICE-TYPE` where those have columns.
   - Parser (`vcardParser.ts`): add a helper `leftoverParams(params, consumedKeys)`. For
     ical.js properties it reads `prop.toJSON()[1]`; for line-parsed ones it uses
     `parsePropertyLine`.
   - Generator (`vcardGenerator.ts`): re-emit the stored params, reusing the param
     formatting from `extraPropertyLines`.
   - Write the new columns in `vcardModelStore.ts`, the importers, merge, and
     `preserveEntryAnnotations`.
2. **Backfill v2.** Add a second marker, `user_settings.vcard_model_v2_backfilled_at`, and
   extend `vcardModelBackfill.ts`:
   - Insert categories from the raw card that the contact lacks, but only when the
     contact's existing categories are a prefix of the card's list. That is the old-importer
     signature; it avoids re-adding a category the user deleted.
   - Replace `\;` with `;` in `title` and `notes` only where the DB value equals the raw
     value plus the stray escape.
   - Fill the new `params` columns by the same value matching.
   - Look into the 6 + 6 label mismatches and fix the matching, e.g. match duplicate values
     in order.
3. **Check with the residual script** (`scratchpad/residual.mts`, to be saved as
   `backend/scripts/checkVcardResidual.ts`). On copies of users 3 and 12 it should report
   only the deliberate-change categories above, and zero on the round trip of
   `docs/contacts.vcf`.

## Part 2: Archive the originals, then drop `raw_vcard`

4. **Archive step.** Add `services/rawVcardRetirement.ts`, called from `getUserDatabase`
   after the backfills and guarded by the marker `user_settings.raw_vcards_archived_at`:
   - Stream every non-empty `raw_vcard`, including archived contacts, into
     `/data/users/<id>/imports/original-cards-<YYYY-MM-DD>.vcf.gz` via
     `zlib.createGzip`, with the contact id as `X-YELLO-CONTACT-ID` on each card.
   - Write it synchronously; `better-sqlite3` is sync and this runs once.
   - fsync the file and verify it by gunzipping and counting `BEGIN:VCARD`. Only then:
     - `UPDATE contacts SET raw_vcard = NULL`
     - `ALTER TABLE contacts DROP COLUMN raw_vcard`, wrapped in try/catch so it stays
       idempotent
     - `VACUUM`
     - set the marker.
   - If the archive can't be written or verified, leave everything untouched and log.
5. **Stop reading and writing it.**
   - Remove `raw_vcard` from the `INSERT`s in `importService.ts`, `routes/icloud.ts` and
     `routes/googleContacts.ts`, and from the `CREATE TABLE` in `userDatabase.ts`.
   - Remove the `rawVcard` field from `schemas/contact.ts`, `types/index.ts`, the 3
     handlers in `routes/contacts.ts`, and the `SELECT`s in the archive, merge, cleanup,
     dedup and social-links-cleanup services.
   - `ParsedContact.rawVcard` stays, because the iCloud preview (`frontend/src/api/icloudHooks.ts`)
     uses it. It just isn't persisted.
   - Order the backfills (`relatedNamesBackfill.ts`, `vcardModelBackfill.ts`) before
     retirement. After the column is gone they must be no-ops: markers are set, and they
     should also guard on the column existing via `PRAGMA table_info`.
6. **Import dedupe no longer needs the raw card.** It uses `icloud_uid`, so nothing changes.

## Docs

- `docs/database.md`:
  - remove `raw_vcard`
  - document the `params` / `vcard_params` columns, the archive file and the new markers
  - update the coverage table
- `docs/readme.md`:
  - update the export and import sections
  - add the retirement step and where the archive lives
  - note that production (Railway `/data`) migrates on first open after deploy
- Log entry, and save this plan as `docs/plans/2026-09-27-retire-raw-vcard.md`.

## Verification

- Unit tests:
  - params round trip: omit-year birthday, `X-SOCIALPROFILE` extras
  - category prefix recovery vs. a deleted category
  - title unescape
  - retirement writes a readable archive, nulls and drops the column, is idempotent, and
    leaves the DB untouched when the archive write fails (point it at an unwritable dir)
- The full-sample round trip over `docs/contacts.vcf`, as before, now also comparing params.
- On copies of users 3 and 12, check:
  - the residual script before retirement shows only the deliberate categories
  - after opening, the archive's card count equals the count of non-empty `raw_vcard`
  - `PRAGMA table_info(contacts)` has no `raw_vcard`
  - DB size drops by roughly the raw payload
  - export still round-trips
- `cd backend && npx vitest run --testTimeout=20000`, backend `tsc`, and `cd frontend && npm run build`.
- **Caution:** the running dev server will apply retirement to your real local databases on
  its next reload, just as the last backfill did. The archive file is the safety net;
  consider copying `backend/data/users` before starting.

## Outcome (2026-09-27)

Implemented as planned, with these differences:

- **The 6 + 6 label mismatches were not real.** They were duplicate values in one card; the comparison had matched the first row. No code change.
- **Categories rule changed.** The "prefix" rule missed contacts that later gained categories in the app (e.g. "LinkedIn Connection"). The rule is now: the contact has the card's first category and none of the rest.
- **Also found and fixed:**
  - 83 URL labels stored as `''`
  - address `params` missed when the postcode had been normalised (now falls back to street + city)
  - SQLite `LOWER()` folds ASCII only, so match keys are computed in JS
- **Archive location:** `/data/users/<id>/archive/` rather than `imports/`, so a future sweep of staged uploads can't touch it.
- **Retirement never throws** out of `getUserDatabase`. The archive, the column drop and `VACUUM` each fail safe and retry on the next open.
- The parser drops `X-YELLO-CONTACT-ID`, so a re-imported archive doesn't store foreign ids.

Verification:
- 240 backend tests pass; backend tsc and the frontend build pass.
- `docs/contacts.vcf` (12,116 cards) round-trips with zero differences, parameters included.
- The dev server retired the local databases. Their archives hold all 15,610 original cards byte-for-byte, and no contacts were lost.
- `scripts/checkVcardResidual.ts`: user 12 has 1 leftover value, a malformed Apple Instagram entry. User 3's leftovers are all its cleanups.
- Pre-change backups are in `backend/data/users-backup-2026-09-27-pre-raw-vcard-retirement/`.
