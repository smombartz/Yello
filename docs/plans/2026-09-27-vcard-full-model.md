# Model every vCard property in the database

## Context

The question was which vCard properties the per-user DB doesn't model, and why. The goal
(decided) is that **every property is modeled**: person data gets typed columns, and
everything else goes into a generic properties table. Measured against
`docs/contacts.vcf` (12,116 real Apple/BusyContacts cards).

### State after the uncommitted export work (`docs/plans/2026-09-27-vcf-export-from-database.md`)

Re-checked against the working tree:

- ✅ Export is now DB-generated (`vcardExportService.ts` → `generateVcard`), and both
  `?regenerate` modes share it. My earlier findings that export replayed stale
  `raw_vcard` and that bulk export skipped passthrough are **fixed**.
- Unmodeled properties now survive export through `passthroughLines(raw_vcard)`
  (`vcardGenerator.ts:205`). But they are still **not modeled**:
  - They're frozen at the first import. `raw_vcard` is never updated, so these properties
    can't be edited, queried, searched or shown.
  - Contacts with no `raw_vcard` have nowhere to keep them. That's 498 in local user 3,
    plus every Google/LinkedIn/manual contact.
  - Middle name, prefix, suffix and ORG department survive only while first/last/company
    are unedited (`vcardGenerator.ts:275-297`). One name edit and they're gone.
- ❌ **Still lost even on export**: custom `X-ABLabel` on EMAIL/TEL/ADR. Their groups count
  as annotations of generated properties, so passthrough drops them, and there's no `label`
  column to keep them.
- ❌ Only the first `TYPE` is kept (`extractType`, `vcardParser.ts:180`), so `HOME,FAX`
  becomes `home`.
- ❌ `TYPE=pref` alone is stored *as the type*: 634 phones in user 12. `getTypeParam` then
  re-emits it as `TYPE=pref`.
- ✅ Already handled: grouped related names (plus backfill), URL labels, multiple
  categories, `\;` in TITLE/NOTE, LinkedIn enrichment.

## Unmodeled person data → typed columns

| vCard data | Cards in sample | New home |
|---|---|---|
| `X-GENDER` | 650 | `contacts.gender` |
| `N` middle / prefix / suffix | 335 / 9 / 12 | `contacts.middle_name`, `name_prefix`, `name_suffix` |
| `NICKNAME` | 81 | `contacts.nickname` |
| `X-ABSHOWAS:COMPANY` | 59 | `contacts.is_company` |
| `ORG` department | 5 | `contacts.department` |
| `X-ABLabel` on EMAIL/TEL/ADR ("Obsolete" 66, "Old" 58, "WhatsApp", "Home fax"…) | 465 | `label` on `contact_emails` / `contact_phones` / `contact_addresses` |
| All TYPEs, not just the first | — | store the non-pref types comma-joined in the existing `type` |
| `X-ABDATE` + label / `ANNIVERSARY` | 1 | new `contact_dates (contact_id, date, label)` |
| ADR PO box / extended, `X-APPLE-SUBLOCALITY`, `-SUBADMINISTRATIVEAREA` | 0 / 0 / 1 / 1 | `contact_addresses.po_box`, `extended`, `sublocality`, `subadministrative_area` |

## Why the rest never got columns → generic table

These properties describe the file, the sync client, or a derived value, not the person:
`VERSION`, `PRODID`, `REV`, `X-CREATED`, `X-BUSYMAC-MODIFIED-BY`, `X-BUSYMAC-NOTES`,
`X-IMAGEHASH`, `X-IMAGETYPE`, `X-SHARED-PHOTO-DISPLAY-PREF`, `VND-63-SENSITIVE-CONTENT-CONFIG`,
`X-ADDRESSBOOKSERVER-PHONEME-DATA`. `X-ADDRESSING-GRAMMAR` (81) is iOS 17's encoded pronoun
blob, and its format is undocumented. All of these, plus any property seen in the future,
go into:

**`contact_vcard_properties`**: `id`, `contact_id` → cascade, `position` (original order),
`group_name`, `name` (upper-cased), `params` (JSON `{PARAM:[values]}`), `value` (raw,
escaped). Indexes on `contact_id` and `name`.

Rule: **each property lives in exactly one place**, either a typed field or this table.
`LABEL`, `X-ABADR` and `GEO` stay regenerated from address rows, as they are today.

## Implementation

1. **Schema.** In `services/userDatabase.ts`, add the columns and tables above, each in
   `CREATE` plus an idempotent `ALTER`. Update `docs/database.md`.
2. **Parser** (`vcardParser.ts`):
   - Parse the new fields, reusing `parsePropertyLine`, the `itemLabels` map and
     `normalizeLabel`.
   - Replace `extractType` with a version that drops `pref` and joins every remaining
     type.
   - Emit `extraProperties: {group,name,params,value}[]` for every line not consumed by a
     typed field. Keep the owned-property set in one shared module used by both parser and
     generator, replacing the generator-only `GENERATED_PROPERTIES`.
3. **Importers.** Persist the new fields and extra properties in `importService.ts`
   (plus `routes/icloud.ts`, which inserts `raw_vcard` too). Add nickname and middle name
   to `buildSearchableText`.
4. **Generator/export** (`vcardGenerator.ts`, `vcardExportService.ts`):
   - Emit full `N` from columns, `ORG:company;department`, `NICKNAME`, `X-GENDER`,
     `X-ABSHOWAS`, `itemN.EMAIL/TEL/ADR` with `X-ABLabel`, and `X-ABDATE` with its label.
   - `passthroughLines` reads from `contact_vcard_properties` instead of `raw_vcard`,
     keeping the group renumbering.
   - Remove the N/ORG raw-line reuse hack, which the new columns replace.
   - Stop emitting `TYPE=pref`.
5. **Contact API.** Return the new typed fields and `extraProperties` (read-only) on contact
   detail, and accept the typed fields in the update schema. UI is a follow-up.
6. **Backfill.** Follow `relatedNamesBackfill.ts`: a marker column
   `user_settings.vcard_properties_backfilled_at`, and one pass that re-parses `raw_vcard`
   into the new columns and table. In the same pass, fix `type = 'pref'` rows to `NULL`.
   After that, `raw_vcard` is only an audit copy and nothing reads it.
7. **Docs.** Add a `docs/log.md` entry, update `docs/readme.md` (export / raw_vcard role),
   and save this plan as `docs/plans/2026-09-27-vcard-full-model.md`.

## Verification

- Parser tests: each new field, multi-TYPE, `pref`-only TYPE, EMAIL/TEL/ADR labels, and
  unknown properties landing in `extraProperties` with order, group and params intact.
- Round-trip test (extend `vcardExportService.test.ts`): import a card with every property
  from the tables above, edit first name and an email, export. Middle name, labels and
  metadata must survive, and the edits must appear.
- Completeness script over `docs/contacts.vcf`: per card, parse→persist→export→parse gives
  the same property multiset. Normalized fields (phones, folding, group names) are compared
  in parsed form.
- Backfill against a copy of `backend/data/users/12/contacts.db`: non-null counts should
  match the sample counts above, and 0 phones should be left with `type = 'pref'`.
- `cd backend && npx vitest run --testTimeout=20000` and `cd frontend && npm run build`.

## Outcome (2026-09-27)

Implemented as planned, with these changes that came out of the work:

- **`type` stays single; the rest go to `extra_types`.** Joining all TYPEs into `type` would have broken the edit form's `<select>`, which binds to `type`.
- **Edits no longer strip vCard-only data.** `PUT /api/contacts/:id` and the profile save replace emails/phones/addresses wholesale, which would have wiped `label`/`extra_types`/address hints on every edit. `preserveEntryAnnotations()` restores them on rows whose value survived.
- **Merge** carries a secondary's person fields, dates and row annotations to the survivor, but not its generic properties.
- **Archive export** (`GET /api/archive/export`) replayed `raw_vcard` and skipped contacts without one; it now uses `exportContactsAsVcf(..., { archived: true })`.
- **URL photos**: `PHOTO;VALUE=URL` was passed to the image processor as base64. It now lands in `contact_vcard_properties`.
- **`X-ABADR`** got a column (`contact_addresses.country_code`) instead of being dropped.
- The API returns the new fields on contact detail and accepts the person fields on update. There is no UI for them yet.

Verification: 231 backend tests pass, backend tsc and the frontend build pass. The completeness check over all 12,116 cards in `docs/contacts.vcf` (import → export → parse) is lossless for every modeled field and generic property. Backfill on a copy of local user 12 (8054 contacts) takes 0.9 s cold.
