# Archived contact details


## Context

Contacts pile up stale details: an old phone number, a former email, a previous address. Deleting
them loses history (old email threads, old messages, "who was this number?"), but leaving them
active causes confusion and mistakes like calling the dead number or emailing the old address. The
user wants to **archive individual details**:

- Archived details are hidden from the main view and sit behind a small gray "N archived" link in
  their section of the card.
- They are **not pushed to Google or iCloud**.
- They **stay in Yello's VCF export**, marked so a re-import restores them.

Real data already contains Apple details labeled "Obsolete", which looks like manual archiving;
those get converted once.

Decisions made while brainstorming:

- **Which details:** phones, emails, addresses, URLs, social profiles and IMs.
- **VCF format:** `X-ABLabel:Archived` plus the hidden parameters `X-YELLO-ARCHIVED=<date>` and
  `X-YELLO-LABEL=<original label>`.
- **Obsolete labels:** a one-off migration converts every "Obsolete" or "Archived" label.
- **Labels on incoming cards:** an incoming detail labeled "Obsolete" or "Archived", including one
  from an iCloud or Google pull, is archived. Relabeling on an iPhone is therefore a shortcut.

## Design

### Data model
- Add a nullable `detail_archived_at TEXT` column to six tables: `contact_emails`,
  `contact_phones`, `contact_addresses`, `contact_urls`, `contact_social_profiles` and
  `contact_instant_messages`. Add it both to `CREATE TABLE` and to the migration loop
  (`userDatabase.ts:640-667`).
- **Why not `archived_at`:** `contacts.archived_at` already exists and is referenced without a table
  prefix (e.g. `routes/contacts.ts:277`, `stats.ts`). A second column with that name would make
  joined queries fail with "ambiguous column".
- **Primary flag:** archiving clears `is_primary`. If the archived row was primary, the first
  remaining active row becomes primary.
- **API naming:** in the API the field is `archivedAt`.

### API
- **Schemas** (`backend/src/schemas/contact.ts`): optional `archivedAt` on the read schemas (email
  :20, phone :30, address :42, social :61, IM :76, URL :84) and on the update schemas (:226-266).
- **Reading:** `GET /:id` (`routes/contacts.ts:771-783`) and the `PUT` re-read (:1188-1200) select the
  new column.
- **Writing:** the `PUT` inserts (:1058-1164) write `archivedAt` from the payload.
- **Backstop:** add `detail_archived_at` to every table's column list in `ENTRY_ANNOTATIONS`
  (`vcardModelStore.ts:75-86`), so `preserveEntryAnnotations` carries it over even when a client
  omits it.

### Sync
- **What gets pushed:** `loadContactsForVcard` (`vcardExportService.ts:74`) gets a `forSync` option
  that adds `AND detail_archived_at IS NULL` to the child queries. Pass it from:
  - the iCloud engine, the Google engine and remote versions (`remoteVersions.ts`)
  - the cutover planner and apply (`cutoverPlanner.ts:502`, `cutoverApply.ts:355,596`)

  The VCF export and backups don't pass it.
- **Change detection:** `projectContact` (`syncProjection.ts:185`) is fed the filtered contact, or
  filters archived rows itself. So archiving counts as a local change and the next push removes the
  detail remotely.
- **Merges don't delete archived rows:** `replaceContactFields` (`contactPersistence.ts:404`, clears
  at :433-466) clears only `WHERE contact_id = ? AND detail_archived_at IS NULL`. Before inserting,
  it drops incoming entries whose identity key matches an archived row. The keys are the same ones
  `preserveEntryAnnotations` uses: lowercased email, E.164 phone, street|city|postcode, URL,
  service|handle, profile URL. Yello stays authoritative.
- **Still aware of archived rows:**
  - search (`buildSearchableText` in `services/database.ts`)
  - Gmail history (`emailSyncService.ts`)
  - duplicate detection (`deduplicationService.ts`)
  - import matching (`icloudMatchingService.ts`, `routes/googleContacts.ts`,
    `linkedinImportService.ts`)

### vCard
- **Generator** (`vcardGenerator.ts:256`, TEL/EMAIL/ADR/URL/social/IMPP writers at ~306-407): an
  archived row is always grouped and written as:
  - `itemN.X-ABLabel:Archived`
  - `;X-YELLO-ARCHIVED=<YYYY-MM-DD>` on the property line
  - `;X-YELLO-LABEL=<original>` on the property line, only when the row has a label
- **Parser** (`vcardParser.ts:500`, labels at :541-553, `leftoverParams` at :295):
  - **Marker present:** `X-YELLO-ARCHIVED` sets `archivedAt` and `X-YELLO-LABEL` restores the label.
    Both parameters are consumed and not kept in `params`.
  - **No marker:** a label of `Obsolete` or `Archived` (case-insensitive) sets `archivedAt` to now
    and clears the label.
  - Put this logic in one small helper, e.g. `applyArchiveMarkers` in a new
    `services/archivedDetails.ts`, so the parser, the Google mapper and the migration share the
    label rule.
- **Google mapper** (`googlePersonMapper.ts`): an incoming `type`/`formattedType` of
  Obsolete/Archived archives the entry through the same helper. Archived entries never reach
  `contactDataToPerson`, because the loader already filtered them out.
- **Persisting:** `insertParsedContact` / `saveVcardModelFields` and `replaceContactFields` persist
  `archivedAt`.

### Migration (one-off, idempotent)
- In `userDatabase.ts`, after the column migrations, run this on each of the six tables:
  `UPDATE <t> SET detail_archived_at = CURRENT_TIMESTAMP, label = NULL WHERE LOWER(label) IN ('obsolete','archived') AND detail_archived_at IS NULL`.
- **Tables without `label`:** socials and IMs have no `label` column, so this applies only where one
  exists.
- **Idempotent by construction:** once the label is cleared the row no longer matches. Rerunning it
  on every connection is cheap.
- **Primary flag:** fix up `is_primary` for affected emails and phones.

### Contact merge
- `mergeService.ts:191-260` carries over `detail_archived_at`.
- When the same value is archived on one contact and active on the other, the active row wins.

### Frontend
- **Types and payload:** add `archivedAt?: string | null` to the detail types in `api/types.ts:14-35`.
  `buildContactLists` (`utils/contactPayload.ts:35`) sends it.
- **View mode** (`ContactFormSections.tsx`: `PhoneSection` :379, `EmailSection` :493,
  `LocationsSection` :595, plus the social, URL and IM sections):
  - Split the rows into active and archived. Active rows render as today, and the existing
    "Show N additional" limit counts active rows only.
  - If there are archived rows, render a gray "N archived" toggle using the existing
    `.show-more-link > button.show-more-button` style (`index.css:1810-1830`).
  - When expanded, archived rows are muted: label, value as selectable text with no
    `tel:`/`mailto:`/WhatsApp actions, and an "archived Mon YYYY" note.
  - A section whose rows are all archived still renders its header and the toggle.
- **Edit mode:**
  - An archive icon button sits next to each active row's remove (×). It sets `archivedAt` in form
    state.
  - Archived rows sit behind the same toggle, each with Unarchive (clears `archivedAt`) and remove.
  - Nothing persists until Save, and Cancel reverts.
- **Active rows only:**
  - `ReachOutBar` (`ContactFormSections.tsx:145-185`)
  - `ContactRow`, `ContactGridCard` (primary email/phone)
  - `PublicContactCard`, `UserProfilePage`
  - `AddressGeocoding`, `AddressCleanupCard`
- **New CSS:** one modifier class for muted archived rows in `index.css`, using `--ds-*` tokens.

### Backend consumers that switch to active rows only
- List/grid primary email/phone subqueries and the has-email/phone/address filters
  (`routes/contacts.ts:324-325, 382-387, 438-440`).
- Map, geocoding and address cleanup:
  - `routes/map.ts:140,198,248,286`
  - `stats.ts:51,57,213,222`
  - `addressCleanupService.ts:412,1108`

  Archived addresses are never geocoded or billed.
- Public profile (`routes/profile.ts:307-315, 533-534`).
- Gmail enrichment and photo lookup by email (`gmailEnrich.ts`, `contactPhotoService.ts`,
  `emailDiscoveryService.ts`).

## Steps

1. ✅ Copy this plan to `docs/plans/2026-10-26-archived-contact-details.md`.
2. ✅ Schema: add the column and migration, plus the one-off Obsolete/Archived conversion.
3. ✅ `archivedDetails.ts` helper: the label rule and marker parameters.
4. ✅ vCard generator and parser, plus tests (round trip; labels Obsolete/Archived).
5. ✅ `replaceContactFields`, sync filtering and the projection, plus sync tests.
6. ✅ API schemas, `GET`/`PUT`, plus a `PUT` test.
7. ✅ Google mapper (outgoing filter), merge service, and the active-only backend consumers.
8. ✅ Frontend: types, payload, section split, toggle, edit actions, active-only consumers, CSS.
9. ✅ Docs: `docs/database.md` (new columns, migration), `docs/reference.md` (archived details +
   sync behaviour), and the `docs/log.md` entry.

## Verification

- `cd backend && npx vitest run --testTimeout=20000`. New tests cover:
  - The vCard round trip keeps `archivedAt` and the original label. The output contains
    `X-ABLabel:Archived` and the marker parameters.
  - Parsing `X-ABLabel:Obsolete` → archived with the label cleared.
  - `replaceContactFields` with a remote phone list keeps archived rows and skips a remote entry
    equal to an archived value.
  - `projectContact` / `loadContactsForVcard({ forSync: true })` leave archived rows out, and the
    export includes them.
  - `PUT /api/contacts/:id` round-trips `archivedAt`, and an omitted flag is preserved by value.
  - The migration converts the labels, is safe to repeat, and fixes up `is_primary`.
- `cd frontend && npm run build` (type-check and build).
- `curl` against the user's running dev server:
  1. `PUT` a contact with an archived phone.
  2. `GET` it back.
  3. Export the VCF and grep for `X-YELLO-ARCHIVED`.
- The user checks the card UI visually (view toggle, edit archive/unarchive, phone layout).

## Changes

Changes made during implementation, 2026-10-26:

- **The Obsolete/Archived label rule runs at storage, not in the parser.** Before, the plan had
  the parser apply it. But if the parser archived a remote "Obsolete" entry, the remote projection
  would drop it too. Local and remote would then match, and the iPhone shortcut would never push the
  removal. Now the parser only reads Yello's own `X-YELLO-ARCHIVED` marker. Every row insert goes
  through `archiveStateForStorage`, which also covers Google's custom types without touching
  `googlePersonMapper` for incoming data.
- **No `forSync` option on `loadContactsForVcard`.** Filtering happens where data leaves Yello
  instead: `generateVcard` with `sync`, `contactDataToPerson` and `projectContact`. One loader keeps
  feeding the export, the sync engines and the cutover.
- **No `preserveEntryAnnotations` backstop for the flag.** It restores values with COALESCE, which
  would re-archive a detail the user had just restored. The only `PUT` client (the frontend) always
  sends `archivedAt`.
- **Social profiles and IMs export only the marker parameters**, with no `X-ABLabel:Archived`. They
  have no label column, and Apple doesn't model labels for them.
- **Gmail enrichment, email discovery and Gravatar lookup still use archived emails.** Matching old
  mail is the point of the feature. The plan had wrongly listed them as active-only.
- **The profile editor shows active details only, and its save deletes only active rows.** Without
  that, saving your own profile would have wiped archived details on the linked contact.
- **Fastify coerces a JSON `null` to `""` for nullable strings**, so `PUT` stores
  `archivedAt || null`.

