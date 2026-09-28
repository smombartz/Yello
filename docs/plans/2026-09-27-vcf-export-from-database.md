# VCF export loses everything edited after the original import

## Context

Exporting all contacts locally and importing the file on Railway produced thinner
contacts on Railway. Investigated with the contact `ngourvitch@gmail.com`
(local user 3, contact id 4114).

### Root cause (verified)

`GET /api/contacts/export/vcf` (`backend/src/routes/contacts.ts:1672-1731`) does not
build cards from the database. For any contact with a stored `raw_vcard` it writes that
text back out verbatim, only injecting GEO and the current photo. `raw_vcard` is written
once at import and never updated by edit, merge, LinkedIn import, enrichment or cleanups.
So the export is a snapshot of the *original* BusyContacts import from January, plus
today's photo.

Evidence for this contact:

| Field | Local DB | Exported card (= stale `raw_vcard`) |
|---|---|---|
| Emails | 5 | 1 |
| Company / title | Microsoft / VP of Product… | none |
| Notes | present | none |
| Social profiles | 6 | 0 |
| Categories | LinkedIn Connection | none |
| LinkedIn enrichment | headline, positions, skills, education… | none (never exported in any mode) |
| Photo | LinkedIn photo | same photo (md5 matches local `medium` file) |

Across the whole local database (8054 contacts, 7556 with `raw_vcard`):

| | In DB | In export |
|---|---|---|
| Notes | 4467 | 1448 |
| Categories | 3919 | 632 |
| Social profiles | 10982 | 2358 |
| Emails | 4311 | 4150 |
| LinkedIn enrichment rows | 2981 | 0 |

### Secondary defects found on the round trip

1. `generateVcard` writes `X-SOCIALPROFILE;X-SERVICE=linkedin`, but the parser only reads
   `TYPE=` (`vcardParser.ts:474`), so the platform comes back as `social`
   (507 such rows in a database populated from an earlier export).
2. `generateVcard` never writes `UID`, `URL`, `IMPP` or related people, and skips social
   profiles that have no `profile_url`.
3. The parser marks the first EMAIL/TEL as primary and ignores `PREF`; the generator emits
   rows in table order, so the primary flag can move.
4. Import dedupes on UID by *skipping* the card (`importService.ts:195-198`). Railway now
   holds the stale cards with those UIDs, so re-importing a corrected file would skip
   7556 of 8054 cards.

## Approach

Make the database the source of truth for the default export, and keep the original card
only as a source for properties the database does not model.

### 1. Export: generate from DB, pass through unmodeled properties

`backend/src/services/vcardGenerator.ts`
- Extend `ContactForVcard` with `uid`, `urls` (url, label, type), `instantMessages`,
  `relatedPeople`, `passthroughLines`, and optional `linkedinEnrichment`.
- `generateVcard` additionally emits:
  - `UID` (from `icloud_uid`, else the UID parsed out of `raw_vcard`)
  - `itemN.URL` + `itemN.X-ABLabel` for labelled URLs, bare `URL` otherwise
  - `IMPP;X-SERVICE-TYPE=…`
  - `X-ABRELATEDNAMES;TYPE=…`
  - `X-SOCIALPROFILE;TYPE=<platform>;X-USER=…` (Apple's form, which the parser already reads)
  - emails and phones ordered primary first
- New `extractPassthroughLines(rawVcard)`: unfold the raw card and keep logical lines whose
  property is not owned by the generator (NICKNAME, X-GENDER, X-ABDATE, X-ABSHOWAS,
  X-CREATED, PRODID, REV, …). Drop `X-ABLabel` lines whose group belonged to an owned
  property; renumber surviving groups after the generator's own `itemN` groups to avoid
  collisions. Reuse the existing unfolding logic from `injectGeoIntoVcard`.
- For `N` and `ORG`, reuse the raw line when it still parses to the current DB value, so
  middle names, suffixes and departments are not lost on unedited contacts.

`backend/src/routes/contacts.ts`
- `buildContactForVcard` also loads `contact_urls`, `contact_instant_messages`,
  `contact_related_people`, `icloud_uid`, `raw_vcard`, and the enrichment row.
- Default branch calls `generateVcard(buildContactForVcard(contact))` for every contact.
  The raw passthrough branch, `injectPhotoIntoVcard`, and the `regenerate` flag's separate
  branch collapse into one path (keep accepting `?regenerate=true` as a no-op).

### 2. LinkedIn enrichment (decided: carry it in the VCF)

Carry the `linkedin_enrichment` row as a single `X-YELLO-LINKEDIN` property holding
base64-encoded JSON of its columns (all except `id` and `contact_id`). Other apps ignore
it; Yello's importer restores it into `linkedin_enrichment`. Base64 keeps the JSON clear
of vCard escaping and line-folding issues.

### 3. Import: read back what the exporter writes

`backend/src/services/vcardParser.ts`
- `X-SOCIALPROFILE`: accept `X-SERVICE=` as a fallback for platform, unescape `X-USER`,
  allow an `itemN.` group prefix. Same group-prefix allowance for `X-ABRELATEDNAMES`.
- Honour `PREF` / `TYPE=pref` for `isPrimary`, falling back to first-in-order.
- Parse `X-YELLO-LINKEDIN` into `ParsedContact.linkedinEnrichment`.

`backend/src/services/importService.ts`
- Insert the enrichment row when present.

### 4. Repairing Railway — out of scope

The user handles the Railway delete and re-import themselves. This work touches nothing
on Railway and makes no change to the UID-skip behaviour in `importService.ts`.

For reference only: import skips any card whose UID already exists, so the corrected file
has to go into an emptied account to take effect.

### 5. Tests (written first, failing)

`backend/src/services/__tests__/exportRoundTrip.test.ts` (new)
- Contact imported from a raw card, then given extra emails, company, notes, categories,
  social profiles and URLs in the DB: exported card contains all of them.
- Unmodeled properties (NICKNAME, X-GENDER, grouped X-ABDATE + label) survive export.
- Full round trip: export → `parseSingleVcard` → values equal, including social platform,
  primary email, URL labels, UID and enrichment.

Extend `vcardParser.test.ts` for `X-SERVICE`, grouped social/related lines, and `PREF`.

### 6. Docs (per CLAUDE.md)

- Copy this plan to `docs/plans/2026-09-27-vcf-export-from-database.md`
- `docs/readme.md`: export is DB-generated; `raw_vcard` is passthrough-only; `X-YELLO-LINKEDIN`
- `docs/database.md`: note on the role of `raw_vcard` (no schema change)
- `docs/log.md`: entry at the top

## Verification

1. `cd backend && npx vitest run --testTimeout=20000`
2. `cd backend && npx tsc --noEmit`; `cd frontend && npm run build`
3. Against the running local server as user 3, download `/api/contacts/export/vcf` and check:
   - card count is 8054
   - the card for `ngourvitch@gmail.com` has 5 EMAIL lines, ORG, TITLE, NOTE, CATEGORIES,
     and 6 X-SOCIALPROFILE lines
   - property totals match the DB counts in the table above
4. Parse the new export with `parseVcf` in a script and confirm zero parse failures.

Verification stops at the local export file. Nothing is run against Railway.

## Outcome (2026-09-27)

Implemented as planned, with these additions that came out of verifying against real data:

- **Related-names backfill.** 44 contacts had related people only inside `raw_vcard`, because the importer could not read grouped `X-ABRELATEDNAMES`. A generated export would have dropped them, so they are copied into `contact_related_people` once per database (`relatedNamesBackfill.ts`, marker `user_settings.related_names_backfilled_at`).
- **URL labels.** The importer never stored them (it looked for the item group in the property name; ical.js reports it as a parameter). Fixed in the parser, and the export falls back to the raw card's label for URLs stored without one.
- **Categories.** The importer kept only the first category of a contact with several.
- **Semicolons in `TITLE` / `NOTE` / `FN`.** ical.js leaves `\;` escaped; these are now read from the card's lines.
- **Relationship capitalisation** is kept as written instead of lower-cased.
- **Enrichment is gzip-compressed**, not plain base64: uncompressed it would have pushed a full export past the 100 MB upload limit.
- **Export logic moved** from the route into `vcardExportService.ts` so it can be tested against a real database.

Not done: `injectGeoIntoVcard()` has no caller any more but was left in place.
