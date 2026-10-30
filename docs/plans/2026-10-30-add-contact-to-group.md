# Add contact to group from the group's list view

**Goal:** inside an open group (`/groups/:category`), a search field finds a contact and, when a
suggestion is picked, adds that contact to the group.

## Design

- **Backend:** `POST /api/contacts/:id/categories` with `{ category }` adds one category (no-op if
  the contact already has it), bumps `updated_at`, 404s for missing or archived contacts. It sits
  under `/api/contacts`, which is already in `EDITING_PREFIXES`, so an add triggers sync. Sync sees the
  change through the projection hash (categories are a projected field for iCloud).
- `GET /api/contacts/search` gains an optional `notInCategory` so suggestions skip current members.
- **Frontend:** `AddToGroupField` above the group's `ContactList`, built on the same combobox markup
  and classes as `RelatedPersonNameField` (arrow keys, Enter, Escape). Picking a contact clears the
  field, keeps focus for the next add, and shows a short "Added …" note. `useAddContactToGroup`
  invalidates `contacts`, `groups`, `contactSearch` and the contact's detail.

## Steps

- [x] Backend route + `notInCategory` search filter
- [x] Backend tests
- [x] Frontend hook + `AddToGroupField` + wiring in `GroupsView` + CSS
- [x] Type-check/build, run tests
- [x] Docs: `docs/reference.md`, `docs/log.md`

## Changes

- 2026-10-30: Enter with no highlighted suggestion adds the first match, so typing a name and pressing
  Enter works without the arrow keys.
