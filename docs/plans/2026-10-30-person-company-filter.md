# Person vs Company: tag, filter and show

## Context

The user wants to mark contacts as a person or a company and filter the contacts list by that.

Most of it already exists in the backend:
- `contacts.is_company` (Apple's `X-ABShowAs:COMPANY`) is read on vCard import, written on export, and round-trips with iCloud sync.
- Google has no such flag. It's excluded from Google sync (`remoteVersions.ts:41`, `syncProjection.ts:213`), so Google pulls never overwrite it.
- `PUT /api/contacts/:id` already accepts `isCompany`.

What's missing:
- The frontend never shows or edits the flag.
- The list route can't filter on it.
- Contacts from Google or added in Yello are never flagged.

**Decisions (from the user):**
- **Detection:** a contact counts as a company when it's flagged, or when it has no first or last name but has a company name (auto-detect). An explicit choice in the edit form always wins.
- **Look:** company contacts with no photo show a building icon instead of initials.

## Design

**Effective company rule.** One shared SQL expression decides "is a company":

```sql
c.is_company = 1
OR (COALESCE(c.kind_confirmed, 0) = 0
    AND TRIM(COALESCE(c.first_name, '')) = '' AND TRIM(COALESCE(c.last_name, '')) = ''
    AND TRIM(COALESCE(c.company, '')) <> '')
```

**New column `contacts.kind_confirmed INTEGER DEFAULT 0`.** It's set to 1 when the user picks Person or Company in the UI. This is needed because `is_company = 0` alone can't tell "never set" apart from "user said Person". Auto-detect never writes `is_company`, so nothing is pushed to iCloud unless the user explicitly picks Company.

## Steps

0. Copy this plan to `docs/plans/2026-10-30-person-company-filter.md`, as `CLAUDE.md` requires.

1. **Schema:** `backend/src/services/userDatabase.ts`
   - Add `kind_confirmed INTEGER DEFAULT 0` to the `CREATE TABLE contacts` block.
   - Add an idempotent `ALTER TABLE` next to the `is_company` migration (~:655).
   - Update `docs/database.md`: document the new column, and note the effective-company rule beside `is_company` (:167).

2. **Shared expression:** export `EFFECTIVE_COMPANY_SQL` (the `c.`-aliased snippet above) from a small module, e.g. `backend/src/services/contactKind.ts`. The list route and the detail route both use it.

3. **List route:** `backend/src/routes/contacts.ts` `GET /`
   - Add `case 'is-company'` and `case 'is-person'` (`NOT (...)`) to the filter `switch` (:429).
   - Add `(${EFFECTIVE_COMPANY_SQL}) AS is_company` to the SELECT.
   - Map `isCompany: row.is_company === 1` in the response.
   - Add `isCompany` to the list item schema in `backend/src/schemas/contact.ts` and to the `ContactListRow` type.

4. **Detail route:** return `isCompany` as the effective value, computed with the same expression, so the edit toggle starts in the right state.

5. **Update route:** `PUT /:id` (:1090)
   - When `isCompany` is sent, also set `kind_confirmed = 1`.
   - Name fallback: when the result is a company with no first or last name, set `display_name` to the company (today it keeps the old `display_name`).

6. **Create route:** `POST /` (:539)
   - Accept `isCompany` in the create schema.
   - Insert `is_company`, and set `kind_confirmed = 1` when it's sent.

7. **Filter UI:** `frontend/src/components/ContactFilters.tsx`
   - Add a "Type" group at the top of `FILTER_GROUPS`. It's a 3-way segmented control (All · People · Companies) that writes `is-person` / `is-company` into the existing `?filter=` param. Reuse the `filter-segmented` / `filter-segment` markup already used for the View control.
   - Add chip labels "People" / "Companies" to `FILTER_LABELS`, so `getFilterLabel` shows them as chips in `ContactList.tsx`.
   - URL state, `useContacts` and the phone sheet need no changes.

8. **Edit toggle:**
   - **Edit form:** add a small Person / Company segmented control to the name row in `ContactRowExpanded.tsx` (~:182). Add `isCompany` to `editForm`. In `handleSave`, send `isCompany` **only if it changed**, so opening and saving a form doesn't lock in auto-detection.
   - **Add Contact:** add the same control to `AddContactPage.tsx`. Send `isCompany` only when Company is picked.
   - **Types:** add `isCompany` to `UpdateContactRequest` and the create request type in `frontend/src/api/types.ts` / `types/index.ts`.

9. **Avatar:** in `frontend/src/components/Avatar.tsx`
   - Add an `isCompany?: boolean` prop. With no photo, or when the photo fails to load, render a building `Icon` instead of initials. Check the icon name exists in `Icon.tsx`; add it if not.
   - Pass `isCompany` from `ContactRow`, `ContactGridCard` and `ContactDetailPage`.
   - Add a specimen in `StyleGuideView` next to the initials one.

10. **Dashboard (optional, cheap):** none planned. The filter is reachable via `/contacts?filter=is-company`.

11. **Docs and log:**
    - `docs/reference.md`: a short "Person vs company" note covering the rule, `kind_confirmed`, and why it isn't pushed to Google.
    - A `docs/log.md` entry.

## Files

- `backend/src/services/userDatabase.ts`, new `backend/src/services/contactKind.ts`
- `backend/src/routes/contacts.ts`, `backend/src/schemas/contact.ts`
- `frontend/src/components/ContactFilters.tsx`, `ContactRowExpanded.tsx`, `AddContactPage.tsx`, `Avatar.tsx`, `ContactRow.tsx`, `ContactGridCard.tsx`, `ContactDetailPage.tsx`, `StyleGuideView.tsx`
- `frontend/src/api/types.ts` / `frontend/src/types/index.ts`
- `docs/database.md`, `docs/reference.md`, `docs/log.md`, `docs/plans/…`

## Verification

**Backend tests:** `cd backend && npx vitest run --testTimeout=20000`. Add tests for:
- the list route with `filter=is-company` and `filter=is-person`, covering a flagged contact, a nameless contact with a company (auto-detected), and an auto-detected contact the user set to Person (`kind_confirmed = 1`, excluded);
- `PUT` with `isCompany: false` setting `kind_confirmed`;
- `POST` with `isCompany: true` storing the flag.

**Sync check:** confirm the existing sync tests still pass. iCloud gets `X-ABShowAs:COMPANY` only for explicitly flagged contacts.

**Frontend:** `cd frontend && npm run build` for types and lint.

**curl:** with the user's dev server running, call `GET /api/contacts?filter=is-company` and check `isCompany` in the response.

**Hand to the user to check visually:**
- the Type control in the filter popover and the phone sheet;
- the People/Companies chips;
- the building avatar;
- the edit toggle.

## Status

All steps done (2026-10-30). Backend suite passes (46 files, 414 tests, including the new `contactKind.test.ts`); the frontend builds.

## Changes

- **Edit toggle:** the edit form keeps `kindChoice` (null until picked) instead of `isCompany`. Add Contact shows the auto-detected value until the user picks one, matching the backend rule.
- **Toggle placement:** the toggle sits under the name row, not inside it, so the pinned Save/Cancel row keeps its layout.
- **Avatar:** a failed photo is now tracked in React state instead of rewriting the DOM, so companies fall back to the building icon too.
- **curl check:** skipped; the API needs a signed-in session. The route tests cover the same requests.
- **2026-10-31:** `kind_confirmed` was replaced by `contacts.kind` (`person` / `company` / `generic`, NULL until picked) before anything shipped, to add a Generic kind and the Cleanup "Company or Generic" tab. See `docs/plans/2026-10-31-contact-kind-cleanup.md`.
