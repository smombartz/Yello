# URL-addressable views: groups, expanded contacts, list state

## Context

Top-level views already have routes (`/contacts`, `/groups`, `/contacts/:id`, …), but everything *inside* a view lived in `useState`: the open group, the expanded contact row, and the contacts search/sort/filter/view toggle. Copying the address bar gave you the bare view, never what you were looking at.

Goal: copying the URL (or pressing a **Copy link** button, for the Electron app which has no address bar) and opening it lands on the same view, with the same contact expanded.

## URL scheme

| View | URL |
|---|---|
| Contacts list | `/contacts?q=smith&sort=newest&filter=no-email,has-photo&view=grid` |
| Expanded contact | adds `contact=<id>` to whichever list it's in |
| Group | `/groups/<encoded category>`, plus `?q=` and `&contact=<id>` |
| Fallback | `/contacts/<id>` (existing detail page) |

Defaults are omitted (`sort=name-asc`, `view=list`, no filters).

## Approach

**The URL is the source of truth.** Pages derive state from `useParams` / `useSearchParams` instead of `useState`, so there's no state↔URL syncing to drift. A helper, `useSearchParamUpdater`, applies several param changes in one `setSearchParams` call — React Router v7's `setSearchParams` has no update queue, so two calls in one tick clobber each other.

**History:**
- Opening a group pushes (Back returns to the groups grid).
- Search, sort, filter, view toggle and row expand/collapse replace, so Back doesn't step through keystrokes or toggles.

**Expanded contact (`ContactList`):**
- Toggling a row writes/removes `contact`.
- On mount, once the first results arrive: if the contact is in them, scroll it into view (`virtualizer.scrollToIndex`); otherwise `navigate('/contacts/<id>', { replace: true })`. The list only loads the first 100 matches, so this fallback matters.
- Resolution runs once per mount. Changing search/sort/filter/view clears `contact` instead, so typing never ejects you to the detail page.
- Grid view has no expansion and ignores `contact`.

**Copy link:** a secondary button beside **Edit** in `ContactRowExpanded` copies `window.location.href`. That component also renders on the detail page, so there it copies `/contacts/<id>`. Electron loads the Railway URL, so the copied link works in a browser.

No backend change: the Fastify SPA fallback already serves `index.html` for non-API paths.

## Changes

1. `frontend/src/hooks/useSearchParamUpdater.ts` (new): `useSearchParamUpdater()` and the `EXPANDED_CONTACT_PARAM` constant.
2. `frontend/src/App.tsx`: `groups/:category` route.
3. `frontend/src/components/ContactsPage.tsx`: `q`, `sort`, `filter`, `view` from the URL; setters also clear `contact`.
4. `frontend/src/components/GroupsView.tsx`: category from `useParams`, `q` from the URL; group click navigates, breadcrumb navigates back.
5. `frontend/src/components/ContactList.tsx`: `expandedId` from `contact`; first-load scroll-to / fallback.
6. `frontend/src/components/ContactRowExpanded.tsx` + `index.css`: Copy link button.
7. Docs: `docs/readme.md`, `docs/log.md`.

## Verification

No frontend test runner exists; adding one isn't warranted for this. Verify with `npm run build` and `npm run lint` in `frontend/`. UI behaviour is checked by the user.
