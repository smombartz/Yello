# Linked Related Contacts with Autocomplete

## Context

The "Related People" field on a contact is free text only: `contact_related_people` stores `(contact_id, name, relationship)` with no reference to another contact. The user wants related people to be linkable to real contacts — typing a name in edit mode should show a dropdown of matching contacts; picking one creates a link (clickable in view mode), while plain free-text names must keep working.

**User decisions (confirmed via Q&A):**
1. **Linked names follow the contact** — a linked entry always displays the linked contact's *current* display name (renames propagate). In edit mode a linked entry is a locked chip with an × to unlink; the text is only editable while unlinked.
2. **Reverse links show too** — if contact A lists contact B, B's detail view also shows A under "Related" (read-only back-reference).

**Verified foundations:**
- `PRAGMA foreign_keys = ON` (`backend/src/services/userDatabase.ts:60`) → `ON DELETE SET NULL` is enforced; a link is either valid or NULL.
- Import/sync flows (`icloud.ts:128`, `googleContacts.ts:122`, `importService.ts:51`) insert by name only and are **additive** (dedupe on `LOWER(name):LOWER(relationship)`, no delete) → existing links survive re-imports, new imported rows are unlinked. No import changes needed.
- A hand-rolled contact autocomplete already exists (`UserProfilePage.tsx:431` + `profileHooks.ts:36` + `GET /api/profile/contacts/search` at `profile.ts:478`) — pattern to copy, but the profile endpoint doesn't filter archived contacts and can't exclude the edited contact, so we add a dedicated route.

## Step 1 — Schema migration

`backend/src/services/userDatabase.ts` — add after the icloud_uid migration block (~line 341), using the existing try/catch ALTER pattern:

```sql
ALTER TABLE contact_related_people ADD COLUMN related_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contact_related_people_related_contact_id
  ON contact_related_people(related_contact_id) WHERE related_contact_id IS NOT NULL;
```

Nullable + NULL default → legal under SQLite's ADD COLUMN FK rules; existing rows stay unlinked free text. The partial index serves both FK-delete scans and the reverse-links query.

## Step 2 — Backend (`backend/src/routes/contacts.ts`, `backend/src/schemas/contact.ts`)

**2a. Schemas** (`schemas/contact.ts`):
- `ContactRelatedPersonSchema` (:80): add `relatedContactId: Type.Union([Type.Number(), Type.Null()])`.
- `UpdateContactRelatedPersonSchema` (:232): add optional `relatedContactId`.
- New `LinkedFromEntrySchema` `{ contactId: number, displayName: string, relationship: string | null, photoUrl: string | null }`; add `linkedFrom: Type.Array(LinkedFromEntrySchema)` to `ContactDetailSchema`.

**2b. Reads** — `RelatedPersonRow` (:119) gets `related_contact_id: number | null`. Replace the three identical related-people selects (POST response :536, GET /:id :687, PUT response :1087) with a LEFT JOIN implementing live-follow:

```sql
SELECT rp.id, rp.contact_id, COALESCE(c2.display_name, rp.name) AS name,
       rp.relationship, rp.related_contact_id
FROM contact_related_people rp
LEFT JOIN contacts c2 ON c2.id = rp.related_contact_id
WHERE rp.contact_id = ?
```

Map `relatedContactId` in the three response mappers (:609, :799, :1199). Also add `related_contact_id` to the archived-contact detail select in `backend/src/services/archiveService.ts:166-170` for schema consistency.

**2c. Reverse links** — at the same three response sites, add:

```sql
SELECT rp.contact_id AS contactId, c.display_name AS displayName,
       rp.relationship, c.photo_hash
FROM contact_related_people rp
JOIN contacts c ON c.id = rp.contact_id
WHERE rp.related_contact_id = ? AND c.archived_at IS NULL
```

Return as `linkedFrom` (photoUrl via existing `getPhotoUrl`). **Dedupe in the mapper:** drop reverse entries whose `contactId` already appears as a `relatedContactId` in the contact's own list (avoids showing the same person twice when both directions exist).

**2d. Writes** — POST insert (:472) and PUT delete-all+re-insert (:1024): add the `related_contact_id` column to the INSERT. Sanitize per row with a small shared helper:
- `relatedContactId === contactId` → null (no self-links).
- id doesn't exist in `contacts` → null (avoids FK-constraint 500 on stale client state).
- Valid link → overwrite stored `name` with the linked contact's current `display_name` (keeps the snapshot + FTS `buildSearchableText` fresh under live-follow; `rebuildContactSearch` already runs after both writes).

**2e. Merge repoint** — `backend/src/services/mergeService.ts` (~:430, before secondaries are deleted): `UPDATE contact_related_people SET related_contact_id = <primaryId> WHERE related_contact_id IN (<secondaryIds>)`, then null any row where `contact_id = related_contact_id` (self-link created by the repoint). Extend the related-people copy loop (:362-381) to carry `related_contact_id`.

**2f. New search endpoint** — `GET /api/contacts/search` in `routes/contacts.ts` (static route, precedent `/count`, `/groups`): querystring `q` (required) + `exclude` (optional id). Copy the FTS query from `profile.ts:504-515`, add `AND c.archived_at IS NULL` and `AND c.id != ?` when `exclude` is set, `LIMIT 10`. Response reuses `ContactSearchResultSchema` (import from `schemas/profile.ts:123`).

## Step 3 — Frontend

**3a. Types** (`frontend/src/api/types.ts`): `ContactRelatedPerson` (:68) + `relatedContactId: number | null`; `UpdateContactRelatedPerson` (:332) + optional `relatedContactId`; new `LinkedFromEntry`; `ContactDetail` + `linkedFrom: LinkedFromEntry[]`. Reuse `ContactSearchResult` (:710).

**3b. Hook** (`frontend/src/api/hooks.ts`): `useSearchContacts(query, excludeId?)` mirroring `profileHooks.ts:36` — queryKey `['contactSearch', query, excludeId]`, fetch `/api/contacts/search?q=…&exclude=…`, `enabled: query.length >= 1`.

**3c. New combobox** — `frontend/src/components/RelatedPersonNameField.tsx` (new file; keeps TanStack Query out of ContactFormSections.tsx). Props: `{ name, relatedContactId, excludeContactId?, onNameChange, onLink(contact), onUnlink }`.
- **Unlinked:** `<input className="edit-input">` in a relative wrapper; while focused with results, absolutely positioned dropdown of ≤10 matches (small `Avatar` + displayName + email/phone detail, per `UserProfilePage.tsx:466-481`). Item buttons use `onMouseDown={e => e.preventDefault()}` + `onClick → onLink` so selection beats input blur; `onBlur` closes the dropdown. Keyboard in v1: ArrowUp/Down highlight, Enter selects, Escape closes. Typing and never picking = plain free text, exactly today's behavior.
- **Linked:** chip with small Avatar + name + × button calling `onUnlink()` (reverts to the input, keeping the text).
- Also filter `excludeContactId` client-side.
- CSS: ~5 new classes in `frontend/src/index.css` near `.edit-input` (~:4298): `.name-combobox`, `.name-combobox-dropdown`, `.name-combobox-item` (+`.active`), `.linked-person-chip` — using existing `--ds-*` vars. Don't reuse `user-profile.css` autocomplete classes (they style a 600px centered panel).

**3d. `RelatedPeopleSection`** (`frontend/src/components/ContactFormSections.tsx:1095-1178`):
- New props: `excludeContactId?: number`, `linkedFrom?: LinkedFromEntry[]`.
- `addPerson` seeds `relatedContactId: null`; add a multi-field updater so picking a suggestion sets `name` + `relatedContactId` in one state update.
- Edit mode: swap the name `EditableField` (:1144) for `RelatedPersonNameField`; relationship field unchanged; reverse links are NOT shown/editable here.
- View mode (:1168): linked → `<Link to={`/contacts/${person.relatedContactId}`}>{person.name}</Link>` (add `react-router-dom` Link import; `.info-field-value a` styling already exists at `index.css:1874`); unlinked → `<span>` as today. After own entries, render `linkedFrom` entries as read-only `InfoField` rows linking to `/contacts/${contactId}`, showing the stored relationship label.

**3e. Wiring:**
- `ContactCardView.tsx`: optional `contactId?: number` prop → `excludeContactId` on the edit-mode section (:179); pass `linkedFrom` to the view-mode section (:267).
- `ContactRowExpanded.tsx`: pass `contactId={contact.id}` and `linkedFrom={contact.linkedFrom}`; seed `relatedContactId` when copying `relatedPeople` into edit state (:38-57); save mapper (:118) adds `relatedContactId: rp.relatedContactId ?? null`.
- `AddContactPage.tsx` (:126, :247): same payload extension; no `excludeContactId`/`linkedFrom` (contact doesn't exist yet).

## Step 4 — Edge cases (handled by design)

| Case | Handling |
|---|---|
| Self-link | Excluded from search results (server `exclude` + client filter) and nulled at write time |
| Linked contact deleted | FK `ON DELETE SET NULL` fires; entry degrades to free text (stored name snapshot) |
| Linked contact merged away | Repointed to the merge primary (Step 2e) |
| Linked contact archived | Link and navigation still work; archived contacts just don't appear in new searches or `linkedFrom` |
| Re-import (vCard/Google/iCloud) | Additive inserts don't name the new column → unlinked; existing linked rows untouched |
| Stale client sends dead id | Write-time existence check nulls it instead of a FK 500 |

## Step 5 — Docs & housekeeping (per CLAUDE.md)

- Copy this plan to `docs/plans/2026-07-14-linked-related-contacts.md`.
- Update `docs/database.md`: new `related_contact_id` column + index on `contact_related_people`.
- Append a `docs/log.md` entry (top of file) and note the feature in `docs/readme.md`.

## Verification

1. **Build/type-check:** `cd backend && npm run build && npm test`; `cd frontend && npm run build && npm run lint`.
2. **Migration idempotency:** start the backend twice against an existing user DB; `PRAGMA table_info(contact_related_people)` shows `related_contact_id`.
3. **API (curl with session cookie):**
   - `GET /api/contacts/search?q=<prefix>` → ≤10 non-archived results; `&exclude=<id>` omits that contact.
   - `PUT /api/contacts/:id` with `relatedPeople: [{name, relationship, relatedContactId}]` → response echoes the link; bogus id → saved as null (no 500); self-id → null.
   - Rename the linked contact, re-GET the linker → name follows.
   - GET the linked contact → `linkedFrom` contains the linker; if both link each other, no duplicate rows.
   - Permanently delete the linked contact → `relatedContactId: null`, name text preserved.
4. **UI (user verifies visually per CLAUDE.md):** typing shows the dropdown; mouse and keyboard selection produce the chip; save → view mode shows a working link to `/contacts/:id`; × unlinks keeping text; free-text names still save as plain text; reverse links appear read-only on the target contact; create flow (`/contacts/new`) works the same.

## Critical files

- `backend/src/services/userDatabase.ts` (migration)
- `backend/src/routes/contacts.ts` (reads, writes, search route)
- `backend/src/schemas/contact.ts`, `backend/src/services/mergeService.ts`, `backend/src/services/archiveService.ts`
- `frontend/src/components/RelatedPersonNameField.tsx` (new), `ContactFormSections.tsx`, `ContactCardView.tsx`, `ContactRowExpanded.tsx`, `AddContactPage.tsx`
- `frontend/src/api/types.ts`, `frontend/src/api/hooks.ts`, `frontend/src/index.css`
