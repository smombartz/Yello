# Export selected contacts and whole groups (.vcf and Google CSV)

**Status:** implemented, awaiting UI check

## Goal

Export a selection of contacts, or every active contact in a group, as a vCard file or as a
CSV in Google Contacts' layout.

## Design

**Where it shows up (desktop only, like the other bulk actions)**
- **Selected contacts:** an *Export (n)* menu in the contact list's selection toolbar, next to
  Merge / Archive / Delete: *vCard (.vcf)* and *CSV (Google Contacts)*. Works inside a group too.
- **Whole group:** an *Export* menu in the toolbar of an open group. Exports every active contact
  in the group, not just the loaded page (matches the group card's count).
- `ActionMenu` gains an optional `triggerLabel` so the trigger can be a labelled button.

**Backend**
- `POST /api/contacts/export` with body `{ format: 'vcf' | 'csv', ids?: number[], group?: string }`;
  exactly one of `ids` / `group`. Responds with the file and a `Content-Disposition` filename.
- POST because a selection can be thousands of IDs. `isContactEdit` exempts this path so an export
  doesn't trigger a sync.
- VCF: `exportContactsAsVcf` takes `ids`; same cards as the full export, photos included.
- CSV: new `services/csvExportService.ts`, built from `loadContactsForVcard`. Google's current
  header layout (names, organization, birthday, notes, Labels joined with ` ::: `, numbered
  E-mail / Phone / Address / Website / Relation / Event columns). Column counts adapt to the
  contact with the most entries. Archived details and photos left out. RFC 4180 quoting, UTF-8 BOM.

**Frontend**
- `exportContacts({ format, ids | group })` posts, turns the response into a blob and downloads it
  via `<a download>`; errors show a toast.

**Out of scope:** exporting search/filter results, export from group cards.

## Steps

- [x] CSV writer + tests
- [x] Export route (ids / group, vcf / csv) + sync exemption + tests
- [x] `ActionMenu` `triggerLabel`
- [x] Frontend helper, selection-toolbar menu, group toolbar menu
- [x] Docs (`docs/reference.md`, DocsView), log entry, build + tests

## Changes

- CSV column names follow Google's own export (`E-mail N`), not the help page's `Email N`, since
  Google imports its own format.
- The group *Export* hides while contacts are selected, so only one Export button shows at a time;
  *Export (n)* then covers the selection.
- Dev CORS now exposes `Content-Disposition` (frontend and API are cross-origin in dev).
