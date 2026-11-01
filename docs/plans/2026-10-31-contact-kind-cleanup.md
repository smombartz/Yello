# Cleanup tab "Company or Generic" + a third Generic kind

## Context

Yello just gained a Person vs Company distinction (uncommitted, not deployed): the `is_company` flag, a `kind_confirmed` column, a Type filter, an edit toggle, and a building avatar. Plan: `docs/plans/2026-10-30-person-company-filter.md`.

The user now wants two things:
- **A Cleanup tab** under Tools > Cleanup that goes through contacts and suggests which ones to mark as a company.
- **A third Generic kind** for contacts that are neither a person nor a company: Front Desk, Support line, Taxi, Mom's office, noreply@.

**Decisions (from the user):**
- **Generic is Yello-only.** It syncs to iCloud and Google as a normal person card. Apple and Google only know person vs company.
- **Rejecting a suggestion is Skip.** It hides the row until reload and isn't saved, like the Addresses tab's Skip.

**What exploration found:**
- There is no AI SDK in the backend.
- There are no business-name or role-email keyword lists anywhere.
- No cleanup "dismissed" state is persisted anywhere.
- `/api/cleanup` is already in `EDITING_PREFIXES` (`syncScheduler.ts:155`), so a new `/api/cleanup/contact-kind` route triggers sync for free.
- The best UI template is Addresses → Normalize (`AddressNormalize.tsx`): a description, a bulk button behind a `ConfirmDialog`, per-row Skip, `Pagination`, `EmptyState` and toasts. Its hooks live in `addressCleanupHooks.ts`.

## Data model: replace `kind_confirmed` with `kind`

`kind_confirmed` was never committed or deployed, so it is replaced outright with no migration debt. A local dev database may keep an unused leftover column; that's harmless.

- **New column:** `contacts.kind TEXT CHECK (kind IN ('person','company','generic'))`. `NULL` means the user never picked a kind. Add it to the `CREATE TABLE` block plus an idempotent `ALTER TABLE`, and remove the `kind_confirmed` lines.
- **`is_company` stays the iCloud-synced flag.**

**Effective kind.** `EFFECTIVE_KIND_SQL` in `services/contactKind.ts` replaces `EFFECTIVE_COMPANY_SQL`; the company test becomes `${EFFECTIVE_KIND_SQL} = 'company'`.

```sql
CASE
  WHEN c.is_company = 1 THEN 'company'
  WHEN c.kind IN ('person','generic') THEN c.kind
  WHEN c.kind IS NULL AND <no first/last name, has company> THEN 'company'
  ELSE 'person'
END
```

**Writes all go through one helper,** `setContactKind(db, id, kind)` in `contactKind.ts`:

| Pick | `is_company` | `kind` | Also |
|---|---|---|---|
| Company | 1 | `'company'` | |
| Person | 0 | `'person'` | |
| Generic | 0 | `'generic'` | |

Every pick also bumps `updated_at`. Generic writes `is_company = 0`, so iCloud sees a normal card and the sync projection doesn't churn.

**iCloud pull** (`contactPersistence.ts:467`, the `isCompany` case, which runs only when that field changed): also set `kind = 'company'` or `'person'` to match. Flipping Show as Company in Apple is an explicit choice.

## Steps

0. Save this plan as `docs/plans/2026-10-31-contact-kind-cleanup.md`. Add a "Changes" note to the 10-30 plan saying `kind_confirmed` was replaced by `kind`.

1. **Kind model (backend):**
   - **Files:** `userDatabase.ts` (column), `contactKind.ts` (`EFFECTIVE_KIND_SQL`, `ContactKind` type, `setContactKind`) and `contactPersistence.ts` (the sync pull sets `kind`).
   - **API shape:** the list and detail return `kind: 'person'|'company'|'generic'` instead of `isCompany`. Both places are in `routes/contacts.ts`; the detail goes through `withVcardFields` in `vcardModelStore.ts`.
   - **Writes:** `POST` and `PUT /api/contacts` accept `kind`. `PUT` still accepts the older `isCompany` and maps it to company or person. Schemas live in `schemas/contact.ts`.
   - **Filter:** the list route gets `is-generic`. `is-person` becomes `= 'person'`, so generic contacts are not counted as people.

2. **Suggestion engine:** new `backend/src/services/contactKindSuggestions.ts`. It is pure TypeScript with no SQL, so it is easy to unit-test.
   - `suggestKind(c) → { kind: 'company'|'generic', confidence: 'strong'|'likely', reasons: string[] } | null`.
   - **Input:** display/first/last name, company, and the active emails.
   - **Text checked:** only the name fields. A contact with the name "Ada Lovelace" and the company "Acme Inc" is never suggested. For a nameless contact the display name is the company, so it's checked.
   - **Matching:** whole-word and case-insensitive, with accents folded.
   - **Rules, first match wins:**
     1. **Legal form → company (strong).** Inc, LLC, Ltd, Limited, GmbH, Corp, Corporation, PLC, LLP, Pty, S.A., SAS, SARL, B.V., N.V., S.r.l., S.p.A., KG, "& Co", "Co.". The 2-letter forms (AG, SA, AB, AS, BV, NV, Oy, UG) only count as the last word.
     2. **Role or function words → generic (strong).** Reception, Front Desk, Support, Help Desk, Hotline, Customer Service, Service Desk, Emergency, Voicemail, Switchboard, Main Line, Dispatch, Concierge, Doorman, Lobby, Security, After Hours, Appointments, Booking(s), Reservations, Taxi, Cab, Delivery. Also possessive places ("Mom's work", "Dan's office", "…'s house/home").
     3. **Business words → company (likely).** Restaurant, Café, Bistro, Bar, Bakery, Hotel, Bank, Studio, Agency, Gallery, Clinic, Dental, Salon, Shop, Store, Group, Partners, Associates, Consulting, Solutions, Services, Foundation, Institute, University, College, School, Museum, Pharmacy, Garage, Airlines, Insurance, Realty, Labs, Media, Architects, Club, Center/Centre.
     4. **Trades used as a name → generic (likely).** Plumber, Electrician, Locksmith, Dentist, Doctor, Vet, Mechanic, Babysitter, Landlord, Handyman, Cleaner.
     5. **Role email, no first or last name.** `noreply`/`no-reply`/`donotreply`/`notifications`/`alerts`/`support`/`help`/`admin` → generic (strong). `info`/`hello`/`contact`/`office`/`sales`/`team`/`enquiries`/`inquiries`/`orders`/`billing`/`bookings` → company (likely).
     6. **Company name with no person name → company (strong)**, with the reason "Only a company name". These already count as companies through auto-detection. Accepting confirms it and sends Show as Company to iCloud.
   - **Reasons** are short and human: `Name ends in "GmbH"`, `"Front Desk" in name`, `Email starts with info@`.

3. **Cleanup API:** new `backend/src/routes/contactKindCleanup.ts`, registered at `/api/cleanup/contact-kind` in `index.ts` next to the other cleanup routers.
   - **Candidates:** active contacts (`archived_at IS NULL`) that are unpicked and unflagged (`kind IS NULL AND is_company = 0`). They're loaded with their primary email and photo hash, then run through `suggestKind`. Sort strong suggestions first, then by name. Pagination happens in memory: a few thousand rows is cheap.
   - `GET /summary` → `{ company, generic, total }`.
   - `GET /?kind=company|generic&limit=50&offset=0` → `{ contacts: [{ id, displayName, company, title, primaryEmail, photoUrl, suggestedKind, confidence, reasons }], total }`.
   - `POST /apply` with `{ items: [{ id, kind: 'person'|'company'|'generic' }] }`. It calls `setContactKind` inside one transaction and returns `{ updated }`.
   - `POST /apply-all` with `{ kind?: 'company'|'generic', excludeIds: number[] }`. It recomputes the suggestions on the server and applies each one's suggested kind, skipping `excludeIds` (the rows Skipped in the browser). This is the bulk button.
   - All writes go under `/api/cleanup`, so a sync runs afterwards.

4. **Cleanup tab:** new `frontend/src/components/ContactKindCleanup.tsx` and `frontend/src/api/contactKindCleanupHooks.ts`.
   - **Hooks:** `useContactKindSummary`, `useContactKindSuggestions(kind, page)`, `useApplyContactKind` and `useApplyAllContactKinds`. They invalidate `['contactKindCleanup']` and `['contacts']`.
   - **Register the tab** (the 5 places the exploration listed):
     - `CleanupMode` gets `'contact-kind'` (`api/types.ts:276`).
     - Add `MODE_CONFIG` `{ label: 'Company or Generic', icon: 'building' }` in `CleanupModeSelector.tsx`.
     - Add a `getCount` branch returning the summary total.
     - Exclude it from `shouldFetchContacts` (`CleanupView.tsx:46`, :195).
     - Add a branch in the tab ternary (`CleanupView.tsx:252`).
   - **Layout:**
     - **Top:** a one-line description, then a segmented sub-filter **All · Company (n) · Generic (n)** that reuses `.filter-segmented` / `.filter-segment` (or the Addresses `.subtab-badge` sub-tabs, whichever matches the Cleanup page better).
     - **Header:** the count, plus a **"Mark all n as suggested"** button behind a `ConfirmDialog` that calls `apply-all` with the current sub-filter and the skipped ids.
     - **Each row:** `Avatar`, the name, a company/email line, the reason chips, and a "Suggested: Company/Generic" label. Actions: a primary button for the suggested kind ("Mark as Company"), a secondary button for the other kind, **Person**, and **Skip**.
     - **Skip** goes into an in-browser `skippedIds` set and is never saved, as the user chose.
     - **Rest:** `Pagination` (50 a page), `EmptyState` ("Nothing to suggest"), and a toast per action.

5. **Extend the earlier UI to three kinds:**
   - **Type filter:** All · People · Companies · Generic, using `is-generic`. Add a `.filter-segmented-4` grid, or 2×2 if 4 columns don't fit the popover. Add the "Generic" chip label. File: `ContactFilters.tsx`.
   - **Toggle:** Person | Company | Generic. The forms keep a `kindChoice: ContactKind | null` and send `kind` only when it was picked. Files: `ContactKindToggle.tsx`, `ContactRowExpanded.tsx`, `AddContactPage.tsx`.
   - **Avatar:** the prop becomes `kind`. Company shows a building, Generic shows `address-card`, and a person shows initials. Pass it from `ContactRow`, `ContactGridCard` and `ContactDetailPage`, and add a Generic sample to `StyleGuideView`.
   - **Types:** `ContactKind` in `api/types.ts`. `kind` replaces `isCompany` on the list item, the detail and the requests.

6. **Docs and log:**
   - `docs/database.md`: the `kind` column replaces `kind_confirmed`; update the effective rule.
   - `docs/reference.md`: update "Person vs company" with Generic and sync, and add a "Cleanup: Company or Generic" section covering the rules, Skip and apply-all.
   - A `docs/log.md` entry.

## Files

**Backend:**
- `services/contactKind.ts`, new `services/contactKindSuggestions.ts`, `services/userDatabase.ts`, `services/contactPersistence.ts`, `services/vcardModelStore.ts`
- `routes/contacts.ts`, new `routes/contactKindCleanup.ts`, `index.ts`, `schemas/contact.ts`

**Frontend:**
- new `components/ContactKindCleanup.tsx`, new `api/contactKindCleanupHooks.ts`
- `CleanupModeSelector.tsx`, `CleanupView.tsx`, `ContactFilters.tsx`, `ContactKindToggle.tsx`, `ContactRowExpanded.tsx`, `AddContactPage.tsx`, `Avatar.tsx`, `ContactRow.tsx`, `ContactGridCard.tsx`, `ContactDetailPage.tsx`, `StyleGuideView.tsx`
- `api/types.ts`, `index.css`

## Verification

**Unit tests** (new `contactKindSuggestions.test.ts`), table-driven:
- "Acme GmbH" → company/strong
- "Front Desk – Hilton" → generic
- "Mom's work" → generic
- "Sabine Ag" → no suggestion (a person name, and "Ag" is not the last word of a company)
- "Ada Lovelace" with the company "Acme Inc" → none
- nameless + info@ → company
- noreply@ → generic
- "Bar" inside "Barbara" → none (word boundary)

**Route tests** (update `contactKind.test.ts`):
- `kind` in list and detail
- `is-generic` / `is-person` filters
- `PUT kind: 'generic'` writes `is_company = 0`
- the old `isCompany` still works

**New `contactKindCleanup.test.ts`:**
- the summary counts
- the list is paginated and filtered by kind
- `apply` sets the kind, and the contact drops out of the suggestions
- `apply-all` respects `excludeIds` and the kind filter
- picked contacts are never suggested

**Sync:**
- an iCloud pull flipping `isCompany` sets `kind`
- a Generic contact projects `isCompany: false`
- the existing sync suites stay green

**Commands:**
- `cd backend && npx vitest run --testTimeout=20000`
- `cd frontend && npm run build`, then `npx eslint` on the changed files

**Hand to the user to check visually:**
- the new Cleanup tab and its bulk confirm
- the 4-way Type filter
- the 3-way toggle
- the Generic avatar

## Status

All steps done (2026-10-31).

## Changes

- **Server registration:** the routers are registered in `backend/src/server.ts`, not `index.ts`.
- **Skip counts:** skipped rows are kept with their suggested kind, so each sub-tab's count leaves out only its own skipped rows.
- **Type filter:** the 4-way Type filter is a 2×2 grid (`.filter-segmented-4`).
- **Sub-filter:** reuses the Addresses sub-tab markup (`.address-subtabs`).
- **Full backend suite:** the first run had 3 timeouts in `demoService` / `tokenKeyRotation`, caused by heavy machine load (load average ~80–120). Both pass on their own.
