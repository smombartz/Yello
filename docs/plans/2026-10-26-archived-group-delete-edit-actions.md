# Archived group, delete from edit, reachable Save/Cancel

**Date:** 2026-10-26
**Status:** Implemented; awaiting the user's visual check

## Request

1. Move archived contacts into a group called "Archived" and hide them from the main search.
2. Add the ability to delete a contact. The Delete button shows only in edit mode, at the bottom of the edit card.
3. In edit mode, Save and Cancel should be at the top of the edit card so the user doesn't have to scroll to the bottom.

## Findings

- `GET /api/contacts` (list, search, category filter) never filtered `archived_at`, so archived
  contacts appeared in the main list and its search. The same was true for `/ids` (Select All),
  `/count`, `/groups` (counts and groups) and the map (`/api/map`, including its search).
- The Archived view (`/archived`) had no link anywhere in the app; its breadcrumb pointed at
  Tools, which doesn't link to it.
- Save/Cancel are already in the edit form's top row, but they scroll out of view on a long
  contact. The fix is to keep them pinned (sticky) under the page header while editing.
- A hard-delete endpoint already exists: `DELETE /api/cleanup/delete` (`deleteContacts` →
  `DELETE FROM contacts`, so `contacts_bd_sync` tombstones the remote cards, and
  `/api/cleanup` is already in `EDITING_PREFIXES`). The frontend hook is `useDeleteContacts`.

## Design

- **"Archived" is a virtual group**, not a real category. A real `Archived` category would
  sync to iCloud/Google as a group label and clash with a user category of the same name. The
  Groups page shows an "Archived" card (when there are archived contacts) that opens the
  existing Archived view, which keeps Restore, Delete permanently and Export. Breadcrumb: Groups.
  The Archived view stays desktop-only (bulk selection), so the card is hidden on phones.
- **Hide archived everywhere except the Archived group**: add `archived_at IS NULL` to the
  list, ids, count, groups and map queries.
- **Delete in edit mode**: a danger "Delete contact" button at the bottom of the edit card,
  behind a ConfirmDialog that says the contact is also removed from synced address books when
  sync is on. After deleting, the list row collapses; the detail page goes back to Contacts.
- **Sticky edit actions**: the edit form's top row sticks under the page header. The card's
  `overflow: hidden` becomes `overflow: clip` while expanded (clip doesn't create a scroll
  container, so sticky still works), and the contact detail page's `.page-content` stops being
  a scroll container.

## Steps

- [x] Backend: filter archived out of `/api/contacts`, `/ids`, `/count`, `/groups`, `/api/map`
- [x] Backend tests for the archived filtering
- [x] Frontend: invalidate `groups` (and `map`) on archive/unarchive/delete
- [x] Groups view: Archived group card → `/archived`; Archived view breadcrumb → Groups
- [x] Edit mode: Delete button at the bottom with confirm; collapse/navigate after delete
- [x] Edit mode: sticky Save/Cancel row
- [x] Docs: `docs/reference.md`, `docs/log.md`
- [x] Verify: backend tests, frontend build

## Changes

- The desktop contact list has an always-on sticky toolbar, so the pinned Save/Cancel row sits below it:
  `ContactList` measures the toolbar and passes `--contact-list-toolbar-height`.
- On phones the stacked name fields are too tall to pin, so only the buttons stick (row is `display: contents`).
- The delete confirm is portaled to `<body>`: the virtual list row is transformed and clipped.
