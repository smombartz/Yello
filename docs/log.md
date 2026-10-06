# Change Log

## 2026-10-06 — Landing hero: a working sample app

**What Changed:**
- The hero's contact list is now a small working copy of Yello, filled with the 20 invented demo people:
  - The left rail switches **Dashboard, Contacts, Map, Groups and Tools**. It has hover labels, and becomes a bottom tab bar on phones.
  - **Contacts:** rows expand into the app's real `ContactCardView` and `LinkedInSection`. Links in an expanded card are blocked with a toast; copying values still works.
  - **Dashboard:** birthdays open that person; Top Cities searches the city.
  - **Map:** pins open a list of the people there.
  - **Groups:** each group opens its members, with a Groups breadcrumb back.
  - **Tools:** sections expand to the app's descriptions with a sign-in button.
- The frame scrolls internally only after a click or keyboard focus, so it never traps page scrolling.
- `sampleBook.ts` now carries the full demo records (addresses, notes, groups, LinkedIn data), regenerated from `demoService.ts`.
- `MapVignette` gained a `fill` variant. Pins are now positioned in pixels to match the image's cover crop.

**Why:**
- User request: let visitors use the left-side menu and expand contacts in the hero.

**Files Modified:**
- `frontend/src/components/landing/SampleBookFrame.tsx`: rewritten as the sample app shell
- `frontend/src/components/landing/SampleViews.tsx` (new): contact list with expansion, dashboard, groups, tools
- `frontend/src/components/landing/Vignettes.tsx`: `MapVignette` `variant="fill"`, clickable pins and popover
- `frontend/src/components/landing/sampleBook.ts`: full records, `SAMPLE_GROUPS`, `SAMPLE_TOP_CITIES`
- `frontend/src/components/LandingPage.tsx`: passes `onSignIn` to the frame
- `frontend/src/styles/pages/landing.css`: rail, body, rows, map popover, phone tab bar
- `docs/readme.md`, `.impeccable/surfaces/frontend-src-components-landingpage-tsx.md`

---

## 2026-10-06 — Landing page at /

**What Changed:**
- **New public landing page at `/`** for signed-out visitors. It is quiet and Apple-inspired, with a first-person maker's note in the spirit of liumichelle.com/about.
  - **Hero:** "Everyone you know. One book.", Sign in with Google as the primary action, and Try the demo.
  - **Product shot:** the Contacts view at real scale, with a live search over the 20 demo people.
  - **Highlights:** six uneven tiles of working UI: Merge, Sources, Birthdays, Map, Public card and Export.
  - **Then:** a maker's note, a closing call to action and a footer.
- **`LandingRoute` in `App.tsx`:**
  - Signed-in users go to `/dashboard`.
  - The Electron desktop app, detected by its user agent, goes to `/login`.
  - The route renders nothing while the auth check runs.
- **Tiles:**
  - **Merge** folds a duplicate pair into one record when it scrolls into view. This is the page's one animation. It doesn't auto-play under reduced motion, and the Merge/Undo button repeats it.
  - **Birthdays** are computed from today's date.
  - **Map** pins are projected onto a static OpenStreetMap snapshot and re-clustered at a constant on-screen radius.
  - **Public card** has working per-field visibility switches.
  - **Export** shows a vCard 3.0 excerpt next to the 12,116-card lossless round-trip proof.
- **`Button` gained `size="lg"`** (48px, 12px corners, 16px label) for front doors only. **`SearchBar` gained an optional `ariaLabel`.**
- **Finish-review fixes:**
  - The search placeholder now invites a query.
  - Text on the Gray Wash band meets AA.
  - Map clusters adapt to the tile's width.
  - Demo errors announce once, the demo can't start twice, and loading can't hang.
  - The card button says "Add to Contacts", like the real card.
  - The lede no longer calls Gmail a contacts source.
  - The flag emoji is replaced by the phone icon.
  - The display floor is 44px.
  - The vCard excerpt wraps on phones instead of scrolling sideways.
- **DESIGN.md and `.impeccable/design.json`** now record the landing page's additions:
  - `/` is added to the Front Door Rule, with the gradient only inside the public-card stage.
  - The `--lp-*` front-door display steps are the one scoped exception to the Scale Floor Rule.
  - `button-primary-lg` is documented.
  - The front-door float shadow is documented.
  - The Merge fold is the front-door motion exception.
  - New **Ink On Wash** rule: Graphite on Gray Wash is 4.39:1, so text there uses Ink.

**Why:**
- Feature request: a landing page that is "simple, quiet" and shows the product's highlights.
- Until now every signed-out visitor landed on the bare login card.

**Files Modified:**
- `frontend/src/components/LandingPage.tsx` (new)
- `frontend/src/components/landing/SampleBookFrame.tsx`, `Vignettes.tsx`, `sampleBook.ts`, `GoogleMark.tsx` (new)
- `frontend/src/styles/pages/landing.css` (new), `frontend/src/styles/pages.css` (import)
- `frontend/src/assets/landing/us-map.webp` + `us-map.webp.json` (provenance), `frontend/src/assets/landing/mark.svg` (new)
- `frontend/src/App.tsx`: `LandingRoute` at `/`
- `frontend/src/components/ui/Button.tsx`, `frontend/src/index.css`: `size="lg"` / `.btn.btn--lg`
- `frontend/src/components/ui/SearchBar.tsx`: `ariaLabel`
- `DESIGN.md`, `.impeccable/design.json`
- `docs/readme.md`, `docs/plans/2026-10-06-landing-page.md`, `.impeccable/surfaces/frontend-src-components-landingpage-tsx.md`

---

## 2026-10-05 — Style guide page at /styleguide

**What Changed:**
- New admin-linked page `/styleguide`, a live specimen book of the design system, using the Docs layout with a sticky table of contents.
- **Foundations:** color, typography, spacing, shape, depth, motion, layout and component tokens.
  - Every token renders as its effect: a swatch, a type sample, a spacing bar, a radius tile, a shadow tile, a breakpoint ruler, a z-index ladder.
  - Motion has playable tracks driven by the duration and easing tokens themselves, and they respect `prefers-reduced-motion`.
  - Text colors show live WCAG contrast badges.
  - Clicking any specimen copies `var(--ds-…)` and confirms with the app's toast. The header search filters tokens by name or value.
- **Components:** live `Button` (variant × size × disabled/loading matrix, an interactive loading demo, icon buttons), `Badge`, `Tabs`, `SearchBar`, `.edit-input`, `FilePicker`, `Avatar`, `LoadingSpinner`, `Toast` triggers, `EmptyState`, `Modal` and `ConfirmDialog`. Each has a usage snippet and its source path.
- DESIGN.md's named rules and do's/don'ts sit beside the specimens they govern.
- `lib/designTokens.ts` (new): a runtime reader for `--ds-*` declarations (walking `:root` rules, including `@import`ed sheets), plus colour parsing and contrast.
- Added the `--ds-font-mono` token: a system monospace stack for code and token names. `docs.css` already referenced it, but it was undefined.
- **Finish-review fixes:**
  - DESIGN.md's rules now sit under the token group each governs, and all 11 Do's and 11 Don'ts appear once each.
  - Dimension and alias tokens render as true-size specimens.
  - Inverse text is shown and measured on Signal Violet.
  - Hover cues now have matching keyboard-focus cues.
  - Sample names are labelled.
  - New sections show the contact row (the real selection ring, check badge and `ActionMenu`), filter chips and subtab pills, and a disabled field.
- **Admin guard:** `/styleguide`, `/admin` and `/admin/docs` now redirect non-admins through a new `AdminRoute`. Before, only the nav links were hidden. `lib/admin.ts` holds the shared `isAdmin()` check.
- **DESIGN.md:**
  - Recorded `--ds-font-mono` as the code-only exception to the One Family Rule.
  - Fixed the Pewter Don't, which still listed placeholders.
  - Pointed to `/styleguide` as the live reference.

**Why:**
- Feature request: a page that renders the real tokens and components, so the system can be browsed, copied from and checked against DESIGN.md without reading CSS.

**Files Modified:**
- `frontend/src/components/StyleGuideView.tsx` (new)
- `frontend/src/lib/designTokens.ts` (new)
- `frontend/src/styles/pages/styleguide.css` (new), `frontend/src/styles/pages.css`
- `frontend/src/App.tsx` — `styleguide` route
- `frontend/src/components/NavRail.tsx` — admin "Style guide" item
- `frontend/src/lib/admin.ts` (new) — `isAdmin()`
- `DESIGN.md`, `.impeccable/design.json` — mono token, Pewter wording, style guide pointer
- `frontend/src/styles/design-system.css` — `--ds-font-mono`
- `docs/readme.md` — style guide notes
- `.impeccable/surfaces/frontend-src-components-styleguideview-tsx.md` — surface brief and direction contract

---

## 2026-10-05 — Contact edit view: auto-added empty rows replace the Add buttons

**What Changed:**
- The three-column contact edit view (`ContactCardView` edit mode) now ends every list section in an empty row, like New Contact: phone, address, social, email, related people, web links, categories and instant messages. Typing in it adds the next row.
- The auto-added empty row is now the only edit-list behaviour, since nothing used the Add-button mode any more.
  - Removed the `autoAddRow` prop and the `enabled` flag on `autoRows()`.
  - Removed the eight `add…` handlers and "Add …" buttons, and the now-unused `.add-item-btn` CSS.
- The edit view keeps its stacked fields. The one-line row layout stays scoped to New Contact, because the edit columns are too narrow for it.

**Why:**
- User request: remove the Add buttons in the contact's three-column edit layout and use the auto-added empty row pattern there too.

**Files Modified:**
- `frontend/src/components/ContactFormSections.tsx` — `autoRows` always on in edit mode; Add buttons and handlers removed
- `frontend/src/components/ContactCardView.tsx`, `frontend/src/components/AddContactPage.tsx` — dropped the `autoAddRow` prop
- `frontend/src/index.css` — removed `.add-item-btn`
- `docs/readme.md` — "Contact forms: always-open fields" section

---

## 2026-10-05 — Contact saves never silently drop entries; URL-only social links are kept; New Contact render loop fixed

**What Changed:**
- **New `buildContactLists`** (`utils/contactPayload.ts`) replaces the duplicated `.filter(...)` chains in `AddContactPage` and `ContactRowExpanded`.
  - Rows left completely empty are skipped.
  - A row with some data but no main value is no longer dropped. It is reported, and the save is refused. Before, a phone/email/link/relationship typed without its main value was thrown away. The same happened to an instant message missing either its service or its handle, and to a social profile without both a platform and a username.
- **Visible errors**: the new `SaveErrors` component lists each problem ("Nothing was saved…", then e.g. `Email “work” has no email address.`) with `role="alert"`.
  - After a refused save, the list re-checks live as the form changes.
  - New Contact scrolls the box into view, since Save is in the header.
  - The missing-name check joined the same list. Server errors show in the same box.
- **Social links with only a URL are saved.** `socialProfileFromUrl` fills an empty platform/username the way VCF import does: the detected platform or the host, and the extracted username, the last path segment, or the host. `detectSocialProfile` now shares `parseLooseUrl`/`pathSegments` with it.
- **Render-loop fix on New Contact**: `handleSave` depended on the `useMutation` result object, which is new every render. So the header effect called `setHeaderConfig` after every render. That re-rendered `Layout`, which passes a fresh outlet context, which re-rendered the page, forever ("Maximum update depth exceeded"). The page now depends on the stable `mutateAsync` and `isPending`.
- CSS: multi-line `.edit-error` (icon pinned to the first line, bulleted list).

**Why:**
- User request: don't drop social links whose platform/username weren't filled in, and never drop data silently — always show an error.
- In the edit form this was real data loss: the update route replaces each list wholesale, so a filtered-out row was deleted from the database on an unrelated edit.

**Files Modified:**
- `frontend/src/utils/contactPayload.ts` (new) — `buildContactLists`
- `frontend/src/utils/contactFormatters.ts` — `socialProfileFromUrl`, shared URL parsing helpers
- `frontend/src/components/ContactFormSections.tsx` — `SaveErrors`
- `frontend/src/components/AddContactPage.tsx` — validation, live problem list, scroll-to-error, stable mutation deps
- `frontend/src/components/ContactRowExpanded.tsx` — validation and problem list in the edit form
- `frontend/src/index.css` — `.edit-error` list layout
- `docs/readme.md` — "Saving a contact never silently drops data"

---

## 2026-10-05 — Add Contact: always-open fields that add rows as you type; social URL auto-detection

**What Changed:**
- **Always-open list fields on New Contact**: phone, email, address, social, categories, instant messages, web links and related people each start with an empty row. Filling in any field of the last row adds another beneath it, and the "Add …" buttons are gone from this page.
  - New opt-in `autoAddRow` prop on the list sections. `autoRows()` adds the blank row only when rendering and trims trailing blanks on every change, so form state never holds empty entries.
  - The blank row has no remove button (a spacer keeps the columns aligned) and can't be dragged or used as a drop target.
- **One-row layout** (scoped to `.add-contact-content`): each entry is a flat row with its fields side by side, wrapping when narrow, instead of a padded card with the fields stacked. The address takes two lines instead of four, or three on a phone.
- **Phone and Email are now separate sections on New Contact.** The page used the legacy combined `ContactInfoSection`, which had no other users, so it was deleted. The page now uses `PhoneSection` and `EmailSection`, like the edit view, which also lets you reorder entries by dragging.
- **Social URL detection**: the new `detectSocialProfile(url)` matches the hostname against the backend's platform list and pulls the username out of the path (`/in/x`, `/@x`, `profile.php?id=`, …).
  - Typing a URL into the Social section fills Platform and Username, using lowercase platform keys like the stored data.
  - A field is only overwritten while it is empty or still holds what the previous URL implied.
  - Profile URL is now the first field, with `type="url"`. This also applies in the contact edit view.
- Moved `useDragState()` above the early `return null` in the eight list sections. This fixes eight pre-existing `react-hooks/rules-of-hooks` lint errors (a conditional hook call).

**Why:**
- Feature request: entering a contact meant pressing "Add Email", "Add Phone" and so on before every field, and the stacked per-entry cards took a lot of vertical space.
- Feature request: the platform label should come from the pasted profile URL. For example, `https://www.instagram.com/tinymapsforbigliving/` → Instagram.

**Files Modified:**
- `frontend/src/components/ContactFormSections.tsx` — `autoRows`, `autoAddRow` on the list sections, blank-row handling in `EditableArrayItem`/`DraggableArrayItem`, `updateProfileUrl`, removed `ContactInfoSection`
- `frontend/src/components/AddContactPage.tsx` — `PhoneSection` + `EmailSection`, `autoAddRow` on every list section
- `frontend/src/utils/contactFormatters.ts` — `detectSocialProfile`
- `frontend/src/index.css` — `.add-contact-content` row layout, `.remove-item-spacer`
- `docs/readme.md` — "Add Contact form" section

---

## 2026-10-05 — Extract the design system: Button sizes/loading, Tabs, Modal; migrate ~110 call sites

**What Changed:**
- **`Button`**: added `size="sm"` (13px label and 12px padding, still 32px tall), `loading` (spinner icon, `disabled`, `aria-busy`) and a `ref` prop.
- **New `ui/Tabs`**: an accessible tablist (roving tabindex; Arrow, Home and End keys). `ModeSelector` and `CleanupModeSelector` now render it. Their two duplicate CSS blocks (`.mode-pill`, `.cleanup-mode-tab`) became one canonical `.tabs`/`.tab`/`.tab-count`.
- **New `ui/Modal`**: handles `aria-modal`, Escape in the capture phase, overlay-click close, initial focus, focus return and `useLayoutModal`.
  - `ConfirmDialog` is now built on it.
  - The merge-conflict modal, the geocoding progress modal and the demo prompt moved from hand-rolled overlays to it. The demo prompt now also closes on Escape and on an overlay click.
- **Button migration**: about 100 legacy `<button>`s with roughly 40 bespoke classes (`header-action-btn`, `fix-all-button`, `secondary-button`, `icloud-bulk-btn`, …) now render `<Button>`.
  - Ten busy-icon ternaries are now `loading`.
  - Two links styled as buttons now use `btn btn--secondary`.
  - In the contact selection toolbar, Archive is now secondary, so Merge is the only primary.
  - The copy-URL button is now a square `icon` button with an `aria-label`.
- **Spinners**: the hand-rolled spinners in Admin, Dashboard, Profile, Geocoding, iCloud import and Google import now use `<LoadingSpinner>`. Removed `.icloud-spinner`.
- **CSS cleanup**: `index.css` went from 7,901 to 6,651 lines.
  - Deleted the rules for every unreferenced legacy button class, along with dead empty/loading/tab/modal rules for views already on the primitives.
  - Deleted the descendant `.geocoding-*-actions button` overrides.
  - Replaced 44 `white` literals with `--ds-text-inverse` and `--ds-bg-primary`.
  - Moved the bottom tab bar and toast from a literal `z-index: 1000` onto the scale (`--ds-z-fixed`, `--ds-z-toast`). Modal overlays now cover the phone tab bar.
- **Docs**: `DESIGN.md` gained the `control-sm` type token, the `button-secondary-sm` component and guidance for Button size/loading, Tabs and Modal. Regenerated `.impeccable/design.json` with a Small Button snippet. `docs/readme.md` got a primitives table.

**Why:**
- `/impeccable extract`. The design system existed, but almost nothing used it. 176 raw buttons rebuilt the same three variants about 40 ways, and 13 of the class names were dead or duplicated. Routing every action through the primitives makes the DESIGN.md rules enforceable rather than aspirational, and it brings Escape/focus handling and tab semantics to every overlay and tab bar.

**Files Modified:**
- `frontend/src/components/ui/Button.tsx`, `Tabs.tsx` (new), `Modal.tsx` (new), `ConfirmDialog.tsx`, `FilePicker.tsx` (comment)
- `frontend/src/components/` — ModeSelector, CleanupModeSelector, AddressCleanupCard, AddressDuplicates, AddressGeocoding, AddressNormalize, InvalidLinksCleanup, SocialLinksWithinContact, CleanupContactList, CleanupView, DuplicateGroup, DeduplicationView, ArchivedView, EnrichToolsContent, GoogleContactsImportContent, ICloudImportView, ImportMatchCards, LinkedInImportContent, SettingsView, EmailHistorySection, AdminView, AddContactPage, ContactDetailPage, ContactsPage, DashboardView, MapView, ContactList, ContactRowExpanded, Pagination, UserProfilePage, OnboardingView, DemoPromptModal
- `frontend/src/index.css`; `frontend/src/styles/pages/{admin,demo-prompt-modal,enrich,login,user-profile}.css`
- `DESIGN.md`, `.impeccable/design.json`, `docs/readme.md`, `docs/plans/2026-10-05-design-system-extraction.md` (new)

---

## 2026-10-04 — Contact row ⋮ menu: Open contact page, Edit, Copy link, Archive

**What Changed:**
- The three-dot button on each contact list row now opens a menu. Since the February design redo it had only stopped click propagation, so it did nothing.
- **Open contact page** links to `/contacts/<id>`. **Edit** expands the row if needed and opens the edit form. **Copy link** copies the list URL with `contact=<id>`. **Archive** archives immediately, with an Undo in the toast.
- New `ActionMenu` UI primitive (`ui/ActionMenu.tsx`). It's portaled to `<body>` with fixed positioning, flips above the trigger near the bottom of the viewport, and has ARIA menu roles and arrow-key navigation. It closes on outside click, Escape, Tab, scroll and resize.
- `ContactRowExpanded` takes an optional `editRequest` counter that opens the edit form when bumped. `ContactRow` resets it when the row collapses.
- Moved the clipboard-and-toast logic into a `useCopyLink` hook, shared by the expanded card's Copy link and the menu.
- `ContactList` has `handleArchiveOne`. It uses its own mutation instance, so the bulk Archive button doesn't show "Archiving…". It also drops the contact from the selection and clears `?contact=` if the row was open.

**Why:**
- The user reported that the dots had no effect. It was a placeholder from the design redo that was never wired up, and the user asked for these four actions.

**Files Modified:**
- `frontend/src/components/ui/ActionMenu.tsx` (new) — generic action menu
- `frontend/src/hooks/useCopyLink.ts` (new) — copy URL + toast
- `frontend/src/components/ContactRow.tsx` — menu items, edit request
- `frontend/src/components/ContactRowExpanded.tsx` — `editRequest` prop, uses `useCopyLink`
- `frontend/src/components/ContactList.tsx` — single-contact archive with Undo
- `frontend/src/index.css` — `.action-menu*` styles, active state for the trigger
- `docs/readme.md` — "Contact row menu" section

---

## 2026-10-04 — Align the CSS with DESIGN.md (one violet, one button system, one motion scale)

**What Changed:**
- **Primary color.** `--ds-color-primary` moved from `#7c3aed` to Signal Violet `#5F27E3`, the logo's violet. Hover is now `#530bce`, dark `#4304ab` (both OKLCH-derived), and light is `rgba(95, 39, 227, 0.1)`. Removed the unused `--ds-color-purple` family. The Dashboard "photos" stat icon is now Info.
- **Stray violets and indigos.** Replaced them with tokens: the `#616189` metadata text, the `#9333ea` nickname indicator, the `#faf5ff` badge, the `#e0e7ff`/`#4338ca` address issue tag, and the demo button's `rgba(124, 58, 237, 0.3)` glow.
- **Selection.** Contact list and grid cards now use a 2px Signal Violet ring instead of a light-blue Info ring, matching Cleanup, Archive and Merge. The avatar check badge, avatar focus ring and patterns-input focus are violet too.
- **Buttons.** Search and Restore were filled blue and green; they are now primary. Header actions, Edit, Merge, Keep separate, pagination, Fix all, Geocode, Add item, profile buttons and the expanded-row action button now use the 6px button radius. Header and Edit labels went from bold to medium with 16px padding. The `.action-button` hover now changes the fill instead of fading opacity.
- **Duplicate rules.** Deleted three dead `.back-button` definitions (the class isn't used in any component) and the first of two `.merge-all-button` definitions, which was a blue copy the later one overrode. Deleted the `.primary-button` override in `user-profile.css`, which leaked app-wide and gave every Enrich primary button 10px/20px padding.
- **Type scale.** Nothing is below 11px now. Raised the 8px, 9.6px and 10px labels (section labels, "show more", metadata, photo source, email direction, primary badge, tab-bar labels) to `--ds-font-2xs`. Snapped the 0.7, 0.8, 0.85 and 0.9rem literals in iCloud import and LinkedIn to the scale, and moved the inline 0.875rem sizes to `var(--ds-font-sm)`.
- **Contrast.** About 24 places that used `--ds-text-muted` (#9ca3af, 2.5:1) for readable text now use `--ds-text-secondary` (4.8:1). This covers breadcrumbs, dates, footnotes, overlines, the login divider and footer, the docs TOC, and the search and enrich placeholders.
- **Badges.** Warning badge text now uses `--ds-color-warning-dark`, like every other status badge.
- **Cards.** `.card` now carries `--ds-shadow-xs` at rest ("flat, but softer"). That token was previously unused.
- **Motion.** `--ds-duration-normal` is now 150ms, the app's de-facto default. All 98 literal transitions now use `--ds-duration-*` + `--ds-easing-*`, and so do the toast and job-pill entrances. Removed the duplicate `@keyframes spin` and the separate 0.8s `icloud-spin`.
- **Docs.** Updated `DESIGN.md` and regenerated `.impeccable/design.json` to describe the aligned system. Replaced the "open migration" note in `docs/readme.md` with the conventions.

**Why:**
- The user asked to fix every inconsistency that writing `DESIGN.md` surfaced. The logo violet is canonical, so the UI now uses one violet, one button system, one selection treatment, one type floor and one motion scale.

**Files Modified:**
- `frontend/src/styles/design-system.css` — primary family, purple removed, `--ds-duration-normal`
- `frontend/src/index.css` — selection, buttons, dead duplicates, type floor, contrast, badges, card shadow, motion
- `frontend/src/styles/pages/user-profile.css` — removed leaking `.primary-button`, button radii
- `frontend/src/styles/pages/{dashboard,login,demo-prompt-modal,docs,enrich,launch,onboarding,public-contact-card,admin,background-job-pill,last-import}.css` — colors, contrast, motion tokens
- `frontend/src/components/{ICloudImportView,SettingsView,GoogleContactsImportContent}.tsx` — inline font size token
- `DESIGN.md`, `.impeccable/design.json`, `docs/readme.md`

---

## 2026-10-04 — DESIGN.md: document the visual design system

**What Changed:**
- Added `DESIGN.md` at the repo root, in the DESIGN.md spec format. The YAML frontmatter holds tokens (22 colors, 9 type roles, radius and spacing scales, 24 component variants). The body has eight sections: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts.
- Extracted from the shipped `--ds-*` tokens and component CSS. The descriptive language was confirmed with the user: North Star "The Connector's Desk", the mood "calm, crisp, utilitarian", components "refined and restrained", elevation "flat, but softer".
- Recorded the decision that the logo's violet **`#5F27E3` (Signal Violet) is the canonical primary**. The shipped `--ds-color-primary` family (`#7c3aed`) is documented as lagging, with a derived hover step (`#530bce`). No CSS was changed.
- Added the `.impeccable/design.json` sidecar: OKLCH tonal ramps, shadow, motion and breakpoint tokens, 10 drop-in component snippets, and the narrative extracted from `DESIGN.md`.
- Added a "Design system" section to `docs/readme.md` that points to these files and notes the open primary-color migration.

**Why:**
- Before this, the visual system lived only in CSS. New screens built by people or agents had no written rules for color, density, depth or component use. The doc also surfaced drift: two violets, unused `--ds-shadow-xs`, off-scale 8px labels, and a 150ms literal used everywhere instead of the duration tokens.

**Files Modified:**
- `DESIGN.md` — new
- `.impeccable/design.json` — new
- `docs/readme.md` — "Design system" section

---

## 2026-10-04 — Shareable URLs for groups, expanded contacts and list state

**What Changed:**
- Groups have their own route, `/groups/<encoded category>`. Clicking a group navigates there instead of setting local state, and the "Groups" breadcrumb navigates back.
- An expanded contact row is now `?contact=<id>` on whichever list it's in (`/contacts`, `/groups/…`). Opening such a link expands the row and scrolls to it. If the contact isn't in the loaded results (the list loads only the first 100), it opens `/contacts/<id>`. This check runs once, on first load; later list changes clear the param and never redirect.
- Contacts search, sort, filters and list/grid view are now `?q=`, `?sort=`, `?filter=` and `?view=`. Defaults are omitted. Group search is `?q=` too.
- Opening a group adds a history entry. Search, sort, filter, view and row toggles replace the current one.
- Added a **Copy link** button next to **Edit** in the expanded contact card (and on the detail page). It copies the current URL, which covers the desktop app's missing address bar.
- New `useSearchParamUpdater` hook that applies several param changes in one `setSearchParams` call, since React Router v7's setter has no update queue.

**Why:**
- Feature request: every view should have a URL, so copying it and opening it later lands on the same group or the same expanded contact.

**Files Modified:**
- `frontend/src/hooks/useSearchParamUpdater.ts` — new: `useSearchParamUpdater`, `EXPANDED_CONTACT_PARAM`
- `frontend/src/App.tsx` — `groups/:category` route
- `frontend/src/components/GroupsView.tsx` — group from the route, search from `?q=`
- `frontend/src/components/ContactsPage.tsx` — search/sort/filter/view from the URL
- `frontend/src/components/ContactList.tsx` — expanded row from `?contact=`, first-load scroll-to / fallback
- `frontend/src/components/ContactRowExpanded.tsx` — Copy link button
- `frontend/src/index.css` — gap in `.expanded-bottom-actions`
- `docs/readme.md` — "Shareable URLs" section
- `docs/plans/2026-10-04-url-addressable-views.md` — plan

---

## 2026-10-04 — Fix product name typos ("Yellow", "Ello" → "Yello")

**What Changed:**
- The `<title>` in `frontend/index.html` read "Yellow". It now reads "Yello", matching the `og:title` and `twitter:title` tags beside it.
- `introduction.mdx` called the product "Ello" in five places: the heading, the intro paragraph, "Why Ello?", the comparison paragraph and the quickstart card. All five now say "Yello".

**Why:**
- The browser tab title and the docs introduction showed the wrong product name.

**Files Modified:**
- `frontend/index.html`
- `introduction.mdx`

---

## 2026-10-04 — PRODUCT.md: durable product context for design work

**What Changed:**
- Added `PRODUCT.md` at the repo root, written by `/impeccable init` after an interview. It covers the primary users (super connectors and freelancers), their jobs, the four positioning pillars, and the "relationships win" tiebreaker. It also covers operating context (desktop for long sessions, phone for lookup and reach-out), constraints (one book per user, 10K+ scale, vCard fidelity, paid APIs, a public card only by consent), brand assets, evidence on hand, and five product principles.

**Why:**
- Design work on this repo had no product record. The legacy `.impeccable.md` from July described the audience as "owner-operator today". The interview replaced that with the current audience and positioning.

**Files Modified:**
- `PRODUCT.md` (new)

---

## 2026-10-04 — Group contact list no longer clips its first card

**What Changed:**
- `.groups-filtered` (a group opened from Groups) now sets `height: auto; overflow: visible`, so the contact list scrolls with the window as it does on the Contacts page, instead of inside the 100vh `.groups-view` scroller.

**Why:**
- `ContactList`'s toolbar is `position: sticky; top: var(--ds-header-height)`. Inside the nested scroller, that 64px offset is measured from the scroller's top rather than the viewport. That pushed the opaque toolbar down over the first card even before any scrolling.
- The same nested scroller also hid rows from `useWindowVirtualizer`. It only tracks window scroll, so in a large group, rows past the first screenful never rendered.

**Files Modified:**
- `frontend/src/index.css` — `.groups-filtered`

---

## 2026-10-04 — Desktop app opens tel: links in FaceTime on macOS

**What Changed:**
- `electron/src/main.ts` `openExternally` now sends `tel:` URLs on macOS to FaceTime with `open -b com.apple.FaceTime <url>` (through `execFile`, with no shell involved). If that fails it falls back to `shell.openExternal`. Other schemes and platforms are unchanged.

**Why:**
- The contact card's new call icon opened Chrome instead of FaceTime. `shell.openExternal` uses the system's `tel:` handler, and Chrome (or Zoom/Teams) can claim it. FaceTime declares `tel:` itself, so naming it explicitly gets the normal "Call from iPhone" flow, which reaches any number.
- The browser can't pick a handler, so it still follows the Mac's default. `docs/readme.md` notes how to point that at FaceTime.

**Files Modified:**
- `electron/src/main.ts` — `openTelInFaceTime`, `openExternally`
- `electron/README.md`, `docs/readme.md` — `tel:` handling notes

---

## 2026-10-03 — Contact details copy on click, with text/call/WhatsApp/email icons

**What Changed:**
- In the contact card view, phone numbers and emails are now buttons that copy the value to the clipboard and show a toast (`Copied …`). They used to be `tel:`/`mailto:` links.
- Each phone number has text (`sms:`), call (`tel:`) and WhatsApp (`wa.me`) icons beside it. Each email has a send-email (`mailto:`) icon.
- `InfoField` has a new `actions` slot rendered beside the value, so long emails truncate with an ellipsis and the icons stay visible.
- New components `CopyableValue`, `ContactActionLink`, `PhoneActions` and `EmailActions`. `WhatsAppLink` is gone; its link is now one of the phone actions.
- `sms:`/`tel:` hrefs strip everything but digits and `+`, because manually edited numbers are stored as typed.
- The phone's country-name tooltip moved from the old `tel:` link to the copy button's title.
- CSS: `.copyable-value`, `.info-field-actions`, `.contact-action-link` (with a `.whatsapp` variant) replace `a.whatsapp-link`.

**Why:**
- Feature request: on a desktop CRM, clicking a number or address usually means wanting to copy it, not launch the dialer or mail app. Calling, texting and emailing stay one click away through the icons.

**Files Modified:**
- `frontend/src/components/ContactFormSections.tsx` — new copy/action components; `PhoneSection`, `EmailSection` and legacy `ContactInfoSection` view modes use them
- `frontend/src/index.css` — copy button and action icon styles
- `docs/readme.md` — Contact detail section
- `docs/plans/2026-10-03-contact-detail-copy-and-actions.md` *(new)*

---

## 2026-10-03 — Desktop app icon from the favicon mark

**What Changed:**
- New `build-resources/icon.svg`: the favicon mark (white blob on `#5F27E3`, from `frontend/public/favicon.svg`) laid out on Apple's macOS icon grid. That's an 824px rounded square with a 100px margin and a soft drop shadow, inside a 1024px canvas.
- New `build-resources/make-icon.sh`: renders every iconset size straight from the SVG with `rsvg-convert`, then builds `icon.icns` with `iconutil`. It also writes a 1024px `icon.png`.
- `icon.icns` is picked up by electron-builder through `directories.buildResources` for the app bundle and the dmg. `electron/src/main.ts` sets `icon.png` as the Dock icon in dev (`process.defaultApp`).
- `build-resources/ICON_README.md` and `electron/README.md` now describe the generator instead of the manual `sips` steps.

**Why:**
- The packaged app and the dev build showed Electron's default icon.
- The favicon's near-square corners (`rx=4` on 46px) would look oversized next to other Dock icons, so the mark sits on the standard rounded-square grid instead.

**Files Modified:**
- `build-resources/icon.svg`, `build-resources/make-icon.sh`, `build-resources/icon.icns`, `build-resources/icon.png` *(new)*
- `build-resources/ICON_README.md`, `electron/README.md`
- `electron/src/main.ts` — dev Dock icon

---

## 2026-10-02 — Desktop app rewritten as a thin client of the Railway deployment

**What Changed:**
- **No local backend any more.** `electron/src/main.ts` no longer spawns `backend/dist/server.js`, polls `/health` or shows a splash. It opens `https://yello.up.railway.app` (`electron/src/config.ts`; `YELLO_URL` overrides it) in a sandboxed window with no preload.
- **Sign-in through the system browser** (`electron/src/desktopAuth.ts`):
  - Navigations to the three Google flow paths are cancelled and reopened in the browser via `/api/auth/desktop/start` with a fresh PKCE challenge.
  - `yello://auth?code=…` deep links (`open-url` on macOS, `second-instance` elsewhere) are redeemed at `/api/auth/desktop/exchange` with the pending verifier.
- **Navigation rules:**
  - Same-origin navigations and popups stay in the app.
  - Other origins open in the default browser (`http(s)`, `mailto`, `tel` and `sms` only).
  - Permissions are granted only to the app origin.
  - If the server can't be reached, `electron/pages/offline.html` offers a retry.
- **Single-instance lock.** `yello://` is registered via `setAsDefaultProtocolClient`, and in `Info.plist` via `protocols` in the builder config.
- **Packaging:**
  - The builder config moved to `electron/electron-builder.yml`. It packages only `dist/` and `pages/`; the backend, frontend and `node_modules` are no longer bundled.
  - Output goes to `electron/release/`. The explicit (missing) icon path was dropped, so the default icon is used until `build-resources/icon.icns` exists.
  - Root `electron:dev` / `electron:build` now just delegate to `electron/`.
- **Dependencies:** Electron 32 → 44 and electron-builder 25 → 26. `dotenv` and `@electron/rebuild` were removed, as was the root `electron-builder` devDependency. Version bumped to 2.0.0.
- **Removed:**
  - `electron/src/preload.ts`, `electron/splash.html`, `electron/.env.example`
  - the root `electron-builder.yml`
  - `ELECTRON_SETUP.md`, `ELECTRON_TEST_RESULTS.md`
  - `electron/data/`: 8 contact photos that had been committed by accident
- The `network.server` entitlement was dropped, since there's no local server.
- `electron/README.md` rewritten as the single desktop guide, including how to migrate 1.x local data. `docs/readme.md` gained a "Desktop app" section, and the Deployment line in `CLAUDE.md` was updated.

**Why:**
- The desktop app should show the same account and data as the web, without its own database, OAuth credentials, `.env` or native module rebuild.
- Google blocks OAuth in embedded browsers. The old approach of stripping "Electron" from the user agent was a workaround Google can break at any time.
- The app now renders remote content, so it should ship a current Chromium.

**Files Modified:**
- `electron/src/main.ts` — rewritten
- `electron/src/config.ts`, `electron/src/desktopAuth.ts`, `electron/pages/offline.html`, `electron/electron-builder.yml` *(new)*
- `electron/package.json`, `electron/package-lock.json`, `package.json`
- `build-resources/entitlements.mac.plist`, `.gitignore`
- `electron/README.md`, `docs/readme.md`, `CLAUDE.md`, `docs/plans/2026-10-02-electron-remote-client.md`

---

## 2026-10-02 — Desktop sign-in handoff (`/api/auth/desktop/*`)

**What Changed:**
- New `backend/src/services/desktopHandoff.ts`:
  - In-memory, single-use sign-in codes (2-minute TTL), each bound to a PKCE S256 challenge
  - A code is deleted before its verifier is checked, so a wrong guess burns it
  - `renderHandoffPage()` returns a script-free page that opens `yello://auth?code=…` by meta refresh and shows an "Open Yello" button
- `GET /api/auth/desktop/start?flow=login|gmail|contacts&challenge=…` stores the challenge in a 10-minute `desktop_handoff` cookie, then redirects into that Google flow.
- `GET /api/auth/desktop/exchange?code=…&verifier=…` creates a session and redirects to the flow's destination. On failure it redirects to `/?error=auth_failed`.
- The three Google callback endings (login, Gmail re-auth, Contacts re-auth) now go through `finishSignIn()`. Without the cookie it behaves exactly as before. With it, it renders the handoff page and sets no session in the browser.
- The four copies of the `session_id` cookie options were folded into `setSessionCookie()`.

**Why:**
- The desktop app now runs Google sign-in in the system browser and needs a safe way to get the resulting session back into its own cookie jar. An intercepted `yello://` link is useless without the verifier, which only the app holds.
- No schema change: Railway runs one process, and a restart only drops codes that are seconds old.

**Files Modified:**
- `backend/src/services/desktopHandoff.ts` *(new)*
- `backend/src/routes/auth.ts` — `setSessionCookie`, `finishSignIn`, `/desktop/start`, `/desktop/exchange`
- `backend/src/services/__tests__/desktopHandoff.test.ts`, `backend/src/routes/__tests__/desktopAuth.test.ts` *(new)*

---

## 2026-09-27 — Last imported vCard data captured; `raw_vcard` archived and dropped

**What Changed:**
- **Leftover vCard parameters are stored.**
  - New `params` JSON column on emails, phones, addresses, URLs, IMs, social profiles, related people and dates, plus `contacts.vcard_params` for single-valued properties.
  - They are written back on export, carried through merges, and kept across edits by `preserveEntryAnnotations()`, which now covers all child tables.
  - In practice this is `TYPE=pref` on URLs, addresses and IMs, `X-APPLE-OMIT-YEAR` on year-less birthdays (which used to export as year 1604), and Apple's `X-USERID` / `X-DISPLAYNAME` / `X-BUNDLEIDENTIFIERS` / `X-TEAMIDENTIFIER` on social profiles.
- **Backfill v2** (`backfillVcardModelV2`, marker `vcard_model_v2_backfilled_at`) fills those params from `raw_vcard` and fixes three older import problems:
  - categories after the first, which the old importer dropped
  - URL labels stored as `''`
  - a stray `\;` in titles and notes
- **`raw_vcard` retired** (`rawVcardRetirement.ts`, marker `raw_vcards_archived_at`):
  - Every stored card is written to `/data/users/<id>/archive/original-cards-<date>.vcf.gz`, tagged with its contact id.
  - The file is verified byte-for-byte before the column is dropped, then the database is vacuumed.
  - On any failure nothing changes, and it retries on the next open.
  - New databases no longer have the column. No importer writes it, and the API no longer returns `rawVcard`.
- The parser ignores `X-YELLO-CONTACT-ID`, so a re-imported archive stores nothing foreign.
- New `backend/scripts/checkVcardResidual.ts <userId>` compares the archive with what the database exports today.

**Why:**
- Goal: every piece of imported data about a person lives in the database, so the original cards can go. A per-contact comparison of `raw_vcard` against the DB export found the gaps above.
- Everything else that differed was deliberate in-app edits. For user 3 that was 9,413 removed URLs, 6,542 URLs turned into social profiles, 1,653 "No street" addresses and 537 cleaned notes. The archive keeps those originals out of the database.
- Photos stay at 800px. That was a deliberate choice; 29 originals in user 3 were larger.

**Verified:**
- 240 backend tests pass; backend `tsc` and the frontend build pass.
- `docs/contacts.vcf` (12,116 cards): import → export → parse gives 0 differences, parameters included.
- The dev server migrated the local databases. Their archives hold all 7,556 + 8,054 original cards byte-for-byte, and contact counts are unchanged.
- Database size went from 124 → 72 MB (user 3) and 52 → 11 MB (user 12).
- Residual check: user 12 differs from its originals in 1 value (a malformed Apple Instagram entry); user 3's differences are its cleanups.
- Backups taken before the change: `backend/data/users-backup-2026-09-27-pre-raw-vcard-retirement/`.

**Files Modified:**
- `backend/src/services/vcardParser.ts` — `leftoverParams`, `params` / `vcardParams`, `ARCHIVE_CONTACT_ID_PROPERTY`
- `backend/src/services/vcardGenerator.ts`, `vcardExportService.ts` — write params
- `backend/src/services/vcardModelStore.ts`, `mergeService.ts`, `importService.ts`, `routes/icloud.ts` — store and carry params
- `backend/src/services/vcardModelBackfill.ts` — v2 backfill; guarded for databases without `raw_vcard`
- `backend/src/services/rawVcardRetirement.ts` *(new)* — archive, verify, drop
- `backend/src/services/userDatabase.ts` — columns, markers, `raw_vcard` removed from `CREATE TABLE`, retirement hook
- `backend/src/services/relatedNamesBackfill.ts` — guarded for databases without the column
- `backend/src/routes/contacts.ts`, `routes/profile.ts`, `routes/googleContacts.ts`, `schemas/contact.ts`, `types/index.ts`, and the archive, cleanup, dedup and social-links services — `raw_vcard` / `rawVcard` removed
- `backend/scripts/checkVcardResidual.ts` *(new)*
- Tests: `rawVcardRetirement.test.ts` *(new)*, `vcardModelBackfill.test.ts`, `vcardGeneratorFromDatabase.test.ts`, `vcardParser.test.ts`, `vcardExportService.test.ts`, `relatedNamesBackfill.test.ts`, `importService.test.ts`, `userDatabase.test.ts`
- `docs/database.md`, `docs/readme.md`, `docs/plans/2026-09-27-retire-raw-vcard.md` *(new)*

---

## 2026-09-27 — Every vCard property is modeled in the database

**What Changed:**
- **New columns** for person data that used to exist only in `raw_vcard`:
  - `contacts`: `middle_name`, `name_prefix`, `name_suffix`, `nickname`, `gender`, `department`, `is_company`
  - `contact_emails` / `contact_phones` / `contact_addresses`: `label` (Apple `X-ABLabel`, e.g. "Obsolete", "WhatsApp") and `extra_types` (every TYPE after the first, e.g. `fax`)
  - `contact_addresses`: `po_box`, `extended`, `sublocality`, `subadministrative_area`, `country_code` (`X-ABADR`)
- **New tables**:
  - `contact_dates` holds `X-ABDATE` / `ANNIVERSARY` with their labels.
  - `contact_vcard_properties` holds every other property, one row per line (`PRODID`, `REV`, `X-IMAGEHASH`, `X-ADDRESSING-GRAMMAR`, unknown `X-` properties, URL photos, repeats).
- **Parser** reads all of the above. `collectExtraProperties()` returns every line no typed field consumed, so each property lands in exactly one place. `pref` is no longer stored as a type.
- **Export** builds every card from the database alone and no longer reads `raw_vcard`. This removes the N/ORG raw-line reuse, the raw UID and URL-label fallbacks, and the raw passthrough. The **archive export** now uses the same function; it used to replay `raw_vcard` and skip contacts without one.
- **Importers** (VCF job, iCloud) persist everything via the shared `saveVcardModelFields()`.
- **One-time backfill** (`backfillVcardModel`, marker `user_settings.vcard_model_backfilled_at`) re-parses existing `raw_vcard`s and fills the new fields, only where empty. It also clears 634 `type = 'pref'` phones.
- **Edits and merges keep the new data.** `preserveEntryAnnotations()` wraps the delete-and-reinsert in `PUT /api/contacts/:id` and the profile save. Merge carries a secondary's person fields, dates and annotations to the survivor.
- **API**: contact detail returns the person fields, `dates`, read-only `extraProperties`, and `label`/`extraTypes` (plus address hints) on entries. Update accepts the person fields.
- Nickname, middle name and department are searchable.
- Fixed `PHOTO;VALUE=URL` being passed to the image processor as base64.

**Why:**
- The question was which vCard properties the database doesn't model. Measured on 12,116 real cards, the ones that only lived in `raw_vcard` were:
  - 650 genders, 335 middle names, 81 nicknames, 59 company cards and 5 departments
  - 465 email/phone/address labels, including "Obsolete" and "Old", which the export dropped even after the DB-generated export change
  - fax/voice secondary types
  - all client metadata

  That data couldn't be edited or searched, didn't exist for contacts without a raw card, and was lost as soon as a name was edited.
- Metadata such as `REV` or `X-IMAGEHASH` gets no typed column because it describes the file or client, not the person. It now lives in the generic table instead of only in `raw_vcard`.

**Verified:**
- 231 backend tests pass. Backend `tsc` and the frontend build pass.
- Importing, exporting and re-parsing all 12,116 cards of `docs/contacts.vcf`: 0 errors, and every modeled field and generic property is equal on every card. The only diff is intended: usernames derived from social URLs.
- Backfill on a copy of local user 12 (8,054 contacts) takes 0.9 s. It recovered 165 middle names, 52 nicknames, 498 genders, 194 email and 49 phone labels, and 25,273 generic properties, and left 0 `pref` types.

**Files Modified:**
- `backend/src/services/userDatabase.ts` — columns, tables, migrations, backfill hook
- `backend/src/services/vcardParser.ts` — new fields, `extraTypes`, labels, `collectExtraProperties`, URL photos
- `backend/src/services/vcardModelStore.ts` *(new)* — save/load helpers, `preserveEntryAnnotations`, `mergeVcardModelFields`, `withVcardFields`
- `backend/src/services/vcardModelBackfill.ts` *(new)* — one-time backfill
- `backend/src/services/vcardGenerator.ts` — emits every field from the DB; raw-card reading removed
- `backend/src/services/vcardExportService.ts` — loads new fields; `archived` option; `contactPhotoReader`
- `backend/src/services/importService.ts`, `backend/src/routes/icloud.ts` — persist new fields
- `backend/src/services/mergeService.ts`, `backend/src/routes/profile.ts`, `backend/src/routes/contacts.ts` — keep annotations on merge/edit; API fields; export wiring
- `backend/src/routes/archive.ts`, `backend/src/services/archiveService.ts` — archive export via DB
- `backend/src/services/database.ts` — search text includes nickname, middle name, department
- `backend/src/schemas/contact.ts` — detail and update schemas
- `backend/src/services/__tests__/vcardGeneratorFromDatabase.test.ts`, `vcardExportService.test.ts`, `vcardModelBackfill.test.ts` *(new)*
- `docs/database.md`, `docs/readme.md`, `docs/plans/2026-09-27-vcard-full-model.md` *(new)*

---

## 2026-09-27 — VCF export is generated from the database; import reads back everything it writes

**What Changed:**
- **Export builds every card from the database.** `GET /api/contacts/export/vcf` now calls `exportContactsAsVcf()`, which loads each contact with all child rows and generates the card. The stored `raw_vcard` contributes only properties the database has no column for (`NICKNAME`, `X-GENDER`, `X-ABDATE`, `REV`, …), extra `N`/`ORG` parts while the name/company is unchanged, the `UID`, and URL labels the database lacks. `?regenerate=true` is accepted but no longer changes anything.
- **The generator writes more:** `UID`, `URL` with `X-ABLabel`, `IMPP`, `X-ABRELATEDNAMES`, and `X-SOCIALPROFILE` in Apple's `TYPE=` form (was `X-SERVICE=`, which the importer could not read). Parameter values are quoted instead of backslash-escaped. Phone and email rows with no value write no line.
- **LinkedIn enrichment travels in the file** as gzip-compressed JSON in a private `X-YELLO-LINKEDIN` property. Import restores the `linkedin_enrichment` row from a fixed column list, always against the new contact, and strips the property from the stored `raw_vcard`.
- **Importer fixes**, each a way data was lost or altered on the way in:
  - only the first of several `CATEGORIES` was kept
  - URL labels were never stored
  - grouped `X-ABRELATEDNAMES` and `X-SOCIALPROFILE` lines were skipped
  - a semicolon in `TITLE`, `NOTE` or `FN` arrived with a stray backslash
  - `PREF` / `TYPE=pref` was ignored, so the first email/phone was always primary
  - relationship capitalisation was lower-cased
- **One-time related-names backfill** on database open copies related people that exist only in `raw_vcard` (grouped lines the old importer skipped) into `contact_related_people`. New column `user_settings.related_names_backfilled_at` marks it done.

**Why:**
- An export from local, imported on Railway, arrived with thinner contacts. The export replayed each contact's `raw_vcard`, which is written once at import and never updated, so everything edited, merged, enriched or cleaned up afterwards was missing. For the contact that surfaced it: 1 of 5 emails, no company, title, notes, categories or social profiles. Across 8054 contacts the file lacked 3019 notes, 3287 categories, 8624 social profiles and all 2981 enrichment rows.
- Generating from the database exposed what the importer had been dropping, since those values now had to survive a real round trip.

**Verified:**
- 228 backend tests pass; backend type-check and frontend build pass.
- Against a copy of the 8054-contact local database: the new export parses with 0 errors and matches the database value-for-value on every compared field, except 9 contacts with malformed phone numbers and 2 with malformed social URLs, which are normalised on import. File size 55.9 MB (limit 100 MB).

**Not changed:**
- Import still skips a card whose `UID` already exists, so the corrected export only takes effect in an account that does not hold those contacts yet.
- `injectGeoIntoVcard()` has no caller any more and was left in place.
- 23 titles in the local database already contain a stray `\;` from earlier imports; they are exported as stored.

**Files Modified:**
- `backend/src/services/vcardExportService.ts` — new; loads contacts and generates the VCF
- `backend/src/services/vcardGenerator.ts` — new properties, raw-card passthrough, enrichment payload
- `backend/src/services/vcardParser.ts` — importer fixes, `X-YELLO-LINKEDIN`, `parseGroupedRelatedNames`
- `backend/src/services/importService.ts` — inserts the enrichment row
- `backend/src/services/linkedinEnrichmentColumns.ts` — new; columns carried by export and accepted by import
- `backend/src/services/relatedNamesBackfill.ts` — new; one-time backfill
- `backend/src/services/userDatabase.ts` — `related_names_backfilled_at` column + migration, runs the backfill
- `backend/src/routes/contacts.ts` — export route reduced to a call into the service
- `backend/src/services/__tests__/vcardGeneratorFromDatabase.test.ts`, `vcardExportService.test.ts`, `relatedNamesBackfill.test.ts` — new
- `backend/src/services/__tests__/vcardParser.test.ts`, `importService.test.ts`, `geoRoundTrip.test.ts`
- `frontend/src/components/DocsView.tsx` — Export and Import VCF entries
- `docs/readme.md`, `docs/database.md`, `docs/plans/2026-09-27-vcf-export-from-database.md`

---

## 2026-07-30 — Pruned CLAUDE.md of another project's instructions

**What Changed:**
- Removed the **Learn content** section entirely — it described a file-based MDX blog at `/learn` with `docs/learn.md`, `content/learn/`, and `lib/learn.ts`. None of those exist, and there is no `/learn` route.
- Rewrote the **Database reference** section. It described Supabase concepts that do not apply (RLS rules, storage buckets, views, policies) and named `supabase/migrations/` as the source of truth. There is no `supabase/` directory and not one `.sql` file in the repo. It now names the three files that actually create schema and explains the `CREATE TABLE IF NOT EXISTS` + idempotent `ALTER TABLE` model.
- Replaced the log-entry **example**, which was from a different project — a Google Apps Script notification form editing a root `index.html`, neither of which exists here — with a real entry from this repo.
- Fixed a contradiction in the logging workflow: step 3 said to **append** to `docs/log.md` while the section below it said new entries go at the top. Now consistently "insert at the top".
- Removed the redundant JavaScript pseudocode block for updating `docs/log.md` (it opened by admitting it was pseudocode and to use Read → Edit instead) and the empty trailing `## Current Project State` heading.
- Added a **Stack** section at the top: Fastify 5 / better-sqlite3 with file-per-tenant isolation / React 19 + Vite 7 + TanStack Query / Google OAuth / Railway + Electron / Vitest. Also recorded that frontend type-checking must go through `npm run build`, since a bare `npx tsc --noEmit` at the frontend root misses `tsconfig.app.json` and passes on code that fails the build.

**Why:**
- The file was largely boilerplate copied from an unrelated Next.js/Supabase project. It actively misled — two exploration passes on the import work started out looking for Supabase clients and Express routes because CLAUDE.md said they were there. Only the `docs/readme.md`, `docs/log.md`, `docs/plans/`, and verification conventions ever applied to this repo.

**Files Modified:**
- `CLAUDE.md`

---

## 2026-07-30 — Wrote docs/database.md; documented import status, history and GEO in DocsView

**What Changed:**
- **Created `docs/database.md`** — the schema overview `CLAUDE.md` has required all along but which never existed. Covers both tiers (shared `/data/auth.db` and per-user `/data/users/<id>/contacts.db`), every table with full column lists, all CHECK constraints, indexes, FTS5 virtual tables and their triggers, the on-disk photo/import layout, and the environment variables that place them.
- Documented the things that are easy to get wrong rather than just listing columns: tenancy is **by file, not by a `user_id` column** (so there is no cross-tenant query surface and sweeps must walk the filesystem); `getUserDatabase`'s 50-entry LRU can close a handle mid-flight; `contacts_unified_fts` is contentless and **trigger-free**, so any writer must call `rebuildContactSearch` itself; `contact_addresses` geocoding is a three-state machine keyed on `geocoded_at` vs lat/lon; rotating `SESSION_SECRET` invalidates every encrypted third-party credential in `user_settings`; and timestamps are zone-less UTC that clients must suffix with `Z`.
- Noted two schema surprises found while writing it: `user_profiles` and `profile_slugs` are created lazily by `routes/profile.ts` rather than by the database modules (and `user_profiles` carries a destructive `DROP COLUMN` migration), and **user profile images go to the shared `PHOTOS_PATH` hashed on user identity**, not into the per-user photos directory that contact photos use.
- Documented the migration model explicitly — no migration files, no CLI; schema is a `CREATE TABLE IF NOT EXISTS` block plus try/catch `ALTER TABLE` re-run on every connection — and flagged inline that `CLAUDE.md`'s reference to `supabase/migrations/` is stale.
- **`DocsView.tsx`**: added an "Import status & history" entry covering the app-wide status pill, `/api/import/jobs/active` reconnect, stay-until-dismissed behaviour, and the persistent Last import summary from `/api/import/jobs/latest`. Extended the Import VCF entry with GEO preservation (item-group matching, the single-address rule for card-level GEO, the `0;0` sentinel, and the `geocoded_at` stamp).
- Also extended the **Export** entry with the per-address GEO behaviour from 2026-07-29, which DocsView had never picked up — describing GEO on import while the export entry stayed silent would have read as incoherent.

**Why:**
- `CLAUDE.md` requires `docs/database.md` to be updated by any schema change, but the file did not exist, so several changes (including `import_jobs` and `addresses_geotagged`) had nowhere to land. DocsView had likewise fallen behind the last three changes.

**Files Modified:**
- `docs/database.md` — new
- `frontend/src/components/DocsView.tsx`

---

## 2026-07-30 — Persistent "last import" summary, and imports now keep vCard GEO

**What Changed:**
- **Closed the other half of the GEO round trip.** The 2026-07-29 change made export *write* per-address coordinates (`item1.ADR` + `item1.GEO`, plus `injectGeoIntoVcard` for the raw-vCard path), but `vcardParser` had no GEO handling at all — `ParsedAddress` carried no lat/lon. Exporting a geocoded Yello VCF and re-importing it therefore dropped every coordinate, forcing all those addresses back through the paid HERE geocoding API. `applyGeoToAddresses()` now parses GEO and the import persists it.
- GEO matching is by Apple-style item group (`item1.ADR` ↔ `item1.GEO`), because vCard 3.0's bare `GEO` is card-level and cannot otherwise be tied to one of several addresses. Ungrouped `ADR` lines still consume a slot so grouped coordinates stay aligned with the address order ical.js produced. A card-level `GEO` is applied **only** when the card has exactly one address — with two or more, guessing is worse than leaving them ungeocoded.
- Accepts vCard 3.0 `lat;lon`, vCard 4.0 `geo:lat,lon`, and comma-separated values. Rejects out-of-range values and `0;0`, which is the near-universal "geocoding failed" sentinel rather than a real point in the Atlantic.
- Imported coordinates stamp `geocoded_at`, so the address-cleanup queue (which treats `geocoded_at IS NULL` as pending) counts them as done instead of re-geocoding them.
- iCloud import shares the same parser and now carries coordinates through too (`routes/icloud.ts`). Google People API exposes no coordinates, so `googlePeopleService` maps them as null.
- Added `addresses_geotagged` to `import_jobs` (plus an idempotent `ALTER TABLE` migration for existing databases) and `addressesGeotagged` to the job row, progress updates, and `ImportJobResult`.
- **Added `GET /api/import/jobs/latest`** — the most recent `completed`/`failed` job, independent of the tracked-job lifecycle.
- **The Import VCF section now keeps a persistent "Last import" summary** (`LastImportSummary`): imported / already present / photos / geotagged / failed, plus filename, timestamp, file size, and the truncated error list. Because it reads `/latest` rather than the tracked job, it survives dismissing the status pill, navigating away, and new sessions.
- Restructured that section: the file picker and Import button are now **always** available, with the summary underneath, replacing the old either-form-or-result mode switch and its "Import Another File" button. Timestamps normalize SQLite's zone-less UTC before formatting — without the `Z` the browser reads them as local time and shows the wrong offset.

**Why:**
- Import results vanished as soon as the status indicator was dismissed, so there was no way to see what the last import actually did. Reporting a "geotagged" count also required the importer to stop discarding coordinates the exporter was already writing.

**Files Modified:**
- `backend/src/services/vcardParser.ts` — `applyGeoToAddresses`, `parseGeoValue`, lat/lon on `ParsedAddress`
- `backend/src/services/importService.ts`, `backend/src/services/importJobService.ts`
- `backend/src/services/userDatabase.ts` — `addresses_geotagged` column + migration
- `backend/src/routes/import.ts`, `backend/src/schemas/import.ts`
- `backend/src/routes/icloud.ts`, `backend/src/services/googlePeopleService.ts`
- `backend/src/services/__tests__/geoRoundTrip.test.ts` — new
- `backend/src/services/__tests__/importService.test.ts`, `backend/src/services/__tests__/importRecovery.test.ts`
- `frontend/src/components/LastImportSummary.tsx` — new
- `frontend/src/styles/pages/last-import.css` — new, imported from `styles/pages.css`
- `frontend/src/components/SettingsView.tsx`, `frontend/src/api/hooks.ts`, `frontend/src/api/types.ts`

---

## 2026-07-29 — VCF export includes per-address geocode (GEO) data

**What Changed:**
- `generateVcard()` now emits a `GEO:lat;lon` property for each address with stored coordinates, tied to its `ADR`/`LABEL` via an Apple-style item group (`item1.ADR` + `item1.GEO`); ungeocoded addresses render unchanged. `ContactForVcard` addresses gained optional `latitude`/`longitude`.
- New `injectGeoIntoVcard()` in `vcardGenerator.ts` injects GEO into stored raw vCards (mirroring the existing photo injection): matches DB addresses to `ADR` lines by street + city/postal with a positional fallback, reuses an ADR's existing group or adds a non-colliding `yelloN.` group (also grouping an adjacent ungrouped `LABEL`), and strips any pre-existing `GEO` lines first. Handles folded lines; skips addresses it can't confidently match.
- `GET /api/contacts/export/vcf` wires both paths: `buildContactForVcard()` selects `latitude`/`longitude`, and the default (raw-vCard) branch fetches the contact's addresses and runs GEO injection before photo injection. Both export modes now carry coordinates.
- Added `vcardGenerator.test.ts` (12 tests: grouped output, mixed geocoded/ungeocoded, parser round-trip, injection into grouped/ungrouped/folded ADRs, stale-GEO replacement, group-collision avoidance, no-match/no-coords no-ops).

**Why:**
- The address-cleanup feature geocodes addresses into `contact_addresses.latitude/longitude`, but exports silently dropped that data. User requested that VCF exports include it.

**Files Modified:**
- `backend/src/services/vcardGenerator.ts` — GEO emission + `injectGeoIntoVcard()`
- `backend/src/routes/contacts.ts` — export route: coordinate selection + GEO injection
- `backend/src/services/__tests__/vcardGenerator.test.ts` — new test file
- `docs/readme.md` — new "VCF export" feature section

---

## 2026-07-29 — Header: breadcrumbs, right-aligned search, dashboard Add Contact

**What Changed:**
- **Breadcrumb support in the page header.** `PageHeader` accepts a new optional `breadcrumbs` prop (`{ label, to?, onClick? }[]`, also added to `PageHeaderConfig` in `Layout.tsx`). Crumbs render before the page title in the title slot — muted, clickable (router `Link` for `to`, button for `onClick`), separated by small chevrons — so drill-down pages read e.g. "Tools › Cleanup" with "Tools" navigating back.
- **Wired breadcrumbs into drill-down pages:** Cleanup, Resolve Duplicates, Archived, and Import from iCloud show "Tools › …"; Docs shows "Admin › Docs"; a selected group shows "Groups › {category}" (replacing the old "Back to Groups" action button — the crumb now handles going back).
- **Search bar right-aligned and smaller.** `.search-bar--header` gets `margin-left: auto` so it pins to the right edge of the center column ahead of the info/actions blocks (which drop their own auto margin when a search is present, via sibling selectors). `--ds-header-search-width` reduced from 400px to 300px.
- **Added an "Add Contact" button to the Dashboard header**, matching the one on the Contacts page (navigates to `/contacts/new`).

**Why:**
- User request: quicker contact creation from the dashboard, a tidier right-aligned search, and clickable breadcrumbs to keep section context (Tools, Groups, Admin) visible and make navigating back out of sub-pages easier.

**Files Modified:**
- `frontend/src/components/PageHeader.tsx` — `Breadcrumb` type + breadcrumb rendering
- `frontend/src/components/Layout.tsx` — `breadcrumbs` in `PageHeaderConfig`
- `frontend/src/index.css` — breadcrumb styles; search bar right-align + sibling margin rules
- `frontend/src/styles/design-system.css` — `--ds-header-search-width` 400px → 300px
- `frontend/src/components/DashboardView.tsx` — Add Contact header action
- `frontend/src/components/GroupsView.tsx` — Groups crumb replaces back button
- `frontend/src/components/CleanupView.tsx`, `DeduplicationView.tsx`, `ArchivedView.tsx`, `ICloudImportView.tsx` — Tools crumb
- `frontend/src/components/DocsView.tsx` — Admin crumb

---

## 2026-07-29 — Header follow-up: logo/title overlap and off-center right edge

**What Changed:**
- **Fixed the title running into the logo.** The wordmark SVG is 188×40, so at its 24px header height it renders ~113px wide — but `.page-header-col-left` only reserved `min-width: 56px`. On windows under ~1250px the left column shrank below the logo's width and the logo overflowed under the title. Both side columns now share a `--ds-header-side-col-min: 120px` floor (new token in `design-system.css`, sized to the logo with the math documented).
- **Fixed the info text + action button being crammed against the right window edge.** The empty right spacer column had `flex-basis: 0` and no min-width, so on narrow windows it collapsed to 0 while the left column held its floor — shifting the whole center column off-center to the right and pushing the info counts ("X of Y on map") and button to the viewport edge. The shared min-width on `.page-header-col-right` restores symmetric centering.
- Added `column-gap: var(--ds-space-4)` to `.page-header-row` so the columns can never abut even at their floors.
- Mobile: `.page-header-col-right` is now `display: none` (was `flex: 0`) — with the new min-width it would otherwise reserve 120px of dead space on phones; the left column was already hidden there.

**Why:**
- User report after moving actions into the content column: info counts colliding with the button on the right, and the title sometimes running into the logo on the left. Both traced to asymmetric side-column minimums (56px left floor vs. none on the right) and a left floor smaller than the logo's rendered width.

**Files Modified:**
- `frontend/src/styles/design-system.css` — added `--ds-header-side-col-min` token
- `frontend/src/index.css` — side-column min-widths, header row column-gap, mobile right-column hide

---

## 2026-07-29 — Moved header action buttons into the main content column

**What Changed:**
- Header action buttons ("Add Contact" on Contacts, "Geocode" on Map, etc.) now render inside `.page-header-center-row` — the column sized to `--ds-content-width` and aligned with the main content — instead of the separate right-hand flex column. `.page-header-col-right` remains as an empty spacer that mirrors the logo column so the center column stays centered.
- `.page-header-actions` gets `margin-left: auto` (pins to the content column's right edge when no info block is present) plus `flex-shrink: 0`; when an info block precedes it, `.page-header-info + .page-header-actions` drops the auto margin so the info text keeps its right-edge anchor with the buttons following.

**Why:**
- The action buttons lived in a flex column to the right of the content column, so on mid-width windows they collided with / overlapped the center column instead of participating in its layout. Placing them inside the content column makes them part of the normal squeeze order and aligns them with the page content edge.

**Files Modified:**
- `frontend/src/components/PageHeader.tsx` — actions moved into the center row; right column reduced to a spacer
- `frontend/src/index.css` — `.page-header-actions` pinning/no-shrink rules; simplified `.page-header-col-right`; updated stale comments

---

## 2026-07-28 — Header/layout consistency pass: shrinkable center columns, dead CSS removal

**What Changed:**
- **Fixed logout/actions being pushed off-screen (769–~1100px windows).** `.page-header-col-center` was `width: 960px; flex-shrink: 0` — it could not shrink, so on windows narrower than ~1100px the header's right column (email + Logout on Profile, "Add Contact" on Contacts) overflowed past the viewport edge. Now `flex: 0 1 var(--ds-content-width); min-width: 0` so the center column squeezes gracefully. Squeeze order: info ellipsizes → search shrinks to its 200px floor → title ellipsizes at 120px; action buttons never shrink (`.page-header-actions button { flex-shrink: 0 }`) and the profile email truncates instead.
- **Same fix for the body column.** `.main-content` was also fixed `960px; flex-shrink: 0` (viewport overflow below ~992px, and the fixed 72px nav rail overlapped content's left edge below ~1104px). Now `flex: 0 1 var(--ds-content-width)` with `max-width: calc(100% - 2 * var(--ds-nav-rail-width))` so content stays clear of the rail on both sides; the map view keeps its full-bleed exception. Added `--ds-nav-rail-width: 72px` token to `design-system.css`. Mobile overrides updated from `width: 100%` to `flex: 1 1 100%` because a width override loses to the desktop rule's flex-basis.
- **Removed legacy dead CSS that corrupted the header title.** An old in-page-header block (`.page-header { margin-bottom }`, `.page-header h1 { font-size: 1.75rem; margin-bottom: 0.25rem }`, `.page-header p`) out-specified `.page-header-title`, making every page title render at 28px and vertically off-center instead of the intended 20px `--ds-header-title-size` token. No component uses the legacy pattern; block deleted.
- **Normalized cross-page header spacing.** The center row was left-packed, so the search bar started at a title-width-dependent x ("Dashboard" vs "Map") and the info text ("3,024 contacts") floated right after it at a different spot on each page. Title now has a `min-width: 120px` slot (search starts at the same x on all standard pages; long contact names ellipsize) and `.page-header-info` gets `margin-left: auto` (counts pinned to the center column's right edge on every page).
- Guard rails: `.page-header-col-left` gets `min-width: 56px` so the logo keeps breathing room; `.logout-btn` gets `white-space: nowrap`. Removed the never-rendered `.app-body-spacer` rules (dead class from an older layout).

**Why:**
- User report: header spacing differed between Dashboard/Contacts/Map, and the logout button was pushed off the page when narrowing the window. Fine-tooth-comb pass traced both to fixed 960px non-shrinkable columns (header center + main content), a leaked legacy CSS block, and left-packed header content with no anchoring.

**Files Modified:**
- `frontend/src/index.css`
- `frontend/src/styles/design-system.css`
- `frontend/src/styles/pages/user-profile.css`

---

## 2026-07-28 — Responsiveness foundation + fixed-size fixes

**What Changed:**
- **Breakpoint source of truth.** Added authoritative `--ds-bp-mobile/tablet/desktop/wide` (640/768/1024/1280) CSS variables to `styles/design-system.css` and a JS mirror `constants/breakpoints.ts` (`BREAKPOINTS`). `hooks/useIsMobile.ts` now derives its 768 threshold from `BREAKPOINTS.tablet` instead of a duplicated literal — the `768` value now exists in exactly one place in TS. Rewrote the old comment-only breakpoint block to declare these four as the only allowed breakpoints.
- **Normalized drifting breakpoints** onto the standard scale: `pages/docs.css` 900px→1024px (TOC drop), `index.css` iCloud match 600px→640px, `pages/public-contact-card.css` 440px→640px. Verified via grep that only 640/768/1024 remain in use.
- **Enrich 4-column stat grid** (`pages/enrich.css`) converted from fixed `repeat(4, 1fr)` to `repeat(auto-fit, minmax(150px, 1fr))` so it flows 4→1 columns without a manual breakpoint; removed the now-redundant 2-col override. Also made `.limit-input-group` wrap and capped `.strategy-select` with `max-width: 100%`.
- **Fixed-width offenders shrunk:** `.contact-details > .contact-detail-item` `width: 220px`→`width: min(220px, 100%)`; header search bar gets `min-width: 0` in the ≤768px block so `flex-shrink` actually works; `.within-contact-info` now `flex: 1; min-width: 0` with the name truncating; onboarding CTA capped and made full-width on phones.
- **Grid hardening:** `.geocoding-edit-row` collapses to a single column ≤640px; dashboard `.stat-card`/`.stat-info` get `min-width: 0` (+ `overflow-wrap` on the value) so long stat numbers can't blow out the 1fr track.
- **Verified (no change needed):** UserProfile split-pane already collapses cleanly at 1024px (sticky preview → static, moved to top); AdminView 7-col table is correctly contained in an `overflow-x: auto` wrapper; the expanded-row/expanded-grid contact grids already collapse 3→2→1. The three desktop-only routes (`/merge`, `/cleanup`, `/archived`) were intentionally left as-is (mobile redirect kept), so `.duplicate-card`'s fixed 220px was left untouched.
- Verification: `tsc -b`, `vite build`, and grep sanity checks pass; the 15 pre-existing ESLint errors are React-Compiler memoization issues in unrelated components. Visual verification at 320/375/768/1024px is handed to the user.

**Why:**
- Responsiveness audit found a decent foundation (flex layouts, auto-fit card grids, a real mobile shell) undermined by breakpoint drift (no enforced scale, off-scale one-offs, the 768 value duplicated in JS and CSS) and a scatter of fixed `width`/`min-width` declarations that overflowed narrow (~320px) screens. This establishes an enforceable breakpoint foundation and fixes the highest-risk offenders.

**Files Modified:**
- `frontend/src/styles/design-system.css`
- `frontend/src/constants/breakpoints.ts` (new)
- `frontend/src/hooks/useIsMobile.ts`
- `frontend/src/index.css`
- `frontend/src/styles/pages/enrich.css`
- `frontend/src/styles/pages/docs.css`
- `frontend/src/styles/pages/public-contact-card.css`
- `frontend/src/styles/pages/dashboard.css`
- `frontend/src/styles/pages/onboarding.css`

---

## 2026-07-28 — Persistent background-import status pill

**What Changed:**
- Added `ImportStatusProvider` (`contexts/ImportStatusProvider.tsx` + `contexts/importStatusContextValue.ts` + `hooks/useImportStatus.ts`), mounted in `App.tsx` beside `ToastProvider`. It owns VCF import tracking for the whole app. Previously the job id lived in `SettingsView` state, so navigating away unmounted the only thing watching the job — the import kept running with nothing to show for it, despite the panel saying "you can close this page and come back".
- Added `BackgroundJobPill` — a fixed bottom-left indicator showing spinner, label, `1,240 of 8,900`, and a progress bar; success and failure states; a dismiss button. Mounted once in `Layout` via `ImportStatusIndicator`, so it survives every route change. Clicking it navigates to Tools, which now auto-expands the Import section when an import is in flight.
- The pill takes a generic `BackgroundJobSummary` (`{id, status, label, doneLabel, current, total, errorMessage}`) rather than a VCF-specific type, so the other long-running flows can feed it once they move off SSE. Only VCF import is wired now.
- **Terminal jobs persist until dismissed.** `forgetImportJobId()` moved out of the completion effect in `useVcfImportJob` and onto the provider's `dismiss()`. This means a job that finished while the user was on another page — or before a reload — is still reported rather than silently vanishing. `SettingsView`'s "Import Another File" and the onboarding step's completion both call `dismiss()`.
- `SettingsView` and `OnboardingView` now derive their import state from the provider instead of each polling their own copy. `SettingsView`'s `importResult`/`importError` are derived from the shared job, so the inline panel and the pill can never disagree.
- The provider derives the tracked job id instead of syncing it through effects (`trackedJobId ?? activeJob.id`, minus a dismissed id). The React Compiler lint rule rejects synchronous `setState` inside an effect, and deriving is simpler regardless. The one remaining effect only touches `localStorage`, which is a legitimate external-system update.
- Pill sits at `z-index: 400` — above the fixed header/nav rail (300), below the modal overlay (500) — so modals cover it without the pill needing to know modal state. Several modals in this app never report theirs, so the Layout `modalOpen` coupling originally considered would have been unreliable. On mobile it clears the 56px bottom tab bar plus the safe-area inset; on desktop it clears the 72px nav rail.
- Fixed a build break from the previous change: `useUploadProfileImage` still used `uploadFile`, whose import had been dropped when `useImportVcf` was replaced. `npx tsc --noEmit` at the frontend root does not pick up `tsconfig.app.json` (`noUnusedLocals`, `include: ["src"]`), so only `npm run build` caught it.

**Why:**
- The backend already made imports survivable across navigation and restarts, but the UI gave no evidence of it — the only way to check on a running import was to reopen Tools. A large import can run for many minutes, so the status needs to follow the user around the app.

**Files Modified:**
- `frontend/src/contexts/ImportStatusProvider.tsx` — new
- `frontend/src/contexts/importStatusContextValue.ts` — new
- `frontend/src/hooks/useImportStatus.ts` — new
- `frontend/src/components/BackgroundJobPill.tsx` — new
- `frontend/src/components/ImportStatusIndicator.tsx` — new
- `frontend/src/styles/pages/background-job-pill.css` — new
- `frontend/src/styles/pages.css`
- `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`
- `frontend/src/api/hooks.ts`
- `frontend/src/components/SettingsView.tsx`, `frontend/src/components/OnboardingView.tsx`

---

## 2026-07-27 — VCF import runs as a chunked background job

**What Changed:**
- `POST /api/import` no longer parses the upload inline. It streams the file straight to `/data/users/<id>/imports/<jobId>.vcf`, creates an `import_jobs` row, kicks off the worker without awaiting it, and returns `202 { jobId }`. Added `GET /api/import/jobs/:id` and `GET /api/import/jobs/active` for polling and reconnect, both with a raised rate limit (300/min) since they are polled once a second. A second upload while one is running returns 409.
- Deleted `MAX_PARSE_TIME_MS` and the `Promise.race` timeout. That race returned 408 to the browser while `importVcf` kept running to completion in the background — the user saw "Import timed out", contacts kept landing, and retrying duplicated everything. The 408 path no longer exists, and the matching client-side message in `client.ts` was removed.
- Rewrote `importService.ts`: `importVcf(db, content)` became `runVcfImportJob(userId, jobId)`. It streams one vCard block at a time via `readline` (peak memory is now one batch, not the whole file — the old path held the file three times over: Buffer, string, and a fully-parsed array with base64 photos inline) and commits in batches of 50.
- Each batch is now a single `db.transaction()`. Previously every INSERT was its own implicit transaction, so a contact with emails, phones and addresses cost an fsync per row. Photo processing is sandwiched between two transactions — `processPhoto` is async and hashes on the contact id, so it can neither run inside a synchronous better-sqlite3 transaction nor before the insert that assigns the id. The event loop is yielded after every batch so the server stays responsive during an import.
- Added UID-based dedupe: a card whose vCard `UID` already exists in `contacts.icloud_uid` is skipped rather than inserted, and the UID is stamped on newly created contacts. Re-importing the same export is now a no-op. `ImportResult` gained a `skipped` count. Cards with no UID still insert unconditionally — full match/merge is still a follow-up.
- Fixed a cross-tenant photo bug: `processPhoto(base64, contactId)` was called without the `userId` argument, so imported photos fell back to the shared `PHOTOS_PATH` and hashed on `contactId` alone — two users importing could overwrite each other's images. iCloud and Google import already passed it.
- Added restart recovery. `cards_processed` is written only after a batch commits, so it is an exact resume offset. On boot, `resumeInterruptedImports` walks `USER_DATA_PATH` (there is no cross-user index — each tenant is a separate SQLite file), re-enqueues any `running` job whose staged file still exists, and fails the rest with a clear message.
- Frontend: `useImportVcf` replaced by `useStartVcfImport` / `useVcfImportJob` (`refetchInterval: 1500`, stops on terminal status) / `useActiveVcfImportJob`, with the job id in `localStorage`. This is the first polling query in the codebase — every other long-running flow hand-rolls SSE parsing. SettingsView now shows a real progress bar with imported/skipped/failed counts instead of a static "this may take a moment", and reconnects to a running import on mount. OnboardingView advances its step when the job completes rather than awaiting the request.
- Exported `unfoldLines` and `parseSingleVcard` from `vcardParser.ts` so the streaming worker can unfold per block. `parseVcf` is unchanged and still used by `icloudService`.
- Removed the dead duplicate `api.importVcf()` from `frontend/src/lib/api.ts`.

**Why:**
- A 37 MB .vcf failed with "Import timed out — the file may be too large to process. Try splitting it into smaller files." The message was misleading on both counts: the timeout was self-imposed rather than a real limit, and it did not stop the import, so the file was neither too large nor actually failing — it was just slow, and reporting failure while still writing.

**Files Modified:**
- `backend/src/routes/import.ts`
- `backend/src/services/importService.ts`
- `backend/src/services/importJobService.ts` — new
- `backend/src/services/importRecovery.ts` — new
- `backend/src/schemas/import.ts` — new
- `backend/src/services/userDatabase.ts` — `import_jobs` table, `getUserImportsPath`, `listUserIds`
- `backend/src/services/vcardParser.ts` — export `unfoldLines`, `parseSingleVcard`
- `backend/src/server.ts` — boot-time import recovery
- `backend/src/routes/__tests__/import.test.ts`
- `backend/src/services/__tests__/importService.test.ts` — new
- `backend/src/services/__tests__/importRecovery.test.ts` — new
- `frontend/src/api/hooks.ts`, `frontend/src/api/types.ts`, `frontend/src/api/client.ts`, `frontend/src/lib/api.ts`
- `frontend/src/components/SettingsView.tsx`, `frontend/src/components/OnboardingView.tsx`, `frontend/src/components/DocsView.tsx`
- `docs/plans/2026-07-27-background-chunked-vcf-import.md` — new

---

## 2026-07-27 — Removed profile edit mode; per-field visibility toggles now inline and autosaving

**What Changed:**
- Removed the entire edit mode from the Profile page (Edit Profile button, editable fields, Save/Cancel buttons, mobile save bar, and the `mapFormToEditState`/`mapEditStateToForm` mapping helpers). The page is now read-only; profile data is edited via the linked contact.
- The per-field visibility (eye) toggles now render directly in the read-only contact card, next to each phone, email, address, social link, web link, and birthday entry, and autosave on click via the existing `savePublicSettings` partial-PUT helper (optimistic update, revert + error banner on failure, disabled while a save is in flight or the card is private).
- Added an identity block above the contact card showing first name, last name, company, job title, and tagline with their own autosaving visibility toggles (these fields aren't part of the shared card layout).
- `ContactCardView` now passes `sectionSuffixes` through in view mode, and the view-mode branches of `PhoneSection`, `EmailSection`, `LocationsSection`, `SocialLinksSection`, `UrlsSection`, and `BirthdaySection` in `ContactFormSections.tsx` support an optional suffix renderer (wrapped in a new `.view-item-with-suffix` layout). Markup is unchanged when no suffix is provided, so the contact pages are unaffected.
- `mapProfileToCardData` now assigns the sentinel IDs (linkedin/instagram/whatsapp/website/other links) to the view data so the toggles can map each row back to its visibility flag.
- Removed now-dead code and CSS: `hasChanges`/`isEditMode` state, `updateForm`, `handleSave`, `handleCancelEdit`, edit-button/action-button/mobile-save-bar/name-field rules in `user-profile.css`.

**Why:**
- Showing/hiding fields required entering edit mode and pressing Save — cumbersome for what is conceptually a one-click setting. Visibility is now a direct, autosaving control on the page.

**Files Modified:**
- `frontend/src/components/UserProfilePage.tsx`
- `frontend/src/components/ContactCardView.tsx`
- `frontend/src/components/ContactFormSections.tsx`
- `frontend/src/index.css` — `.view-item-with-suffix` layout
- `frontend/src/styles/pages/user-profile.css` — identity-field styles, removed dead edit-mode rules
- `docs/readme.md` — updated the public-card feature notes

---

## 2026-07-26 — Fixed public profile toggle: autosave + no more "Anonymous" preview

**What Changed:**
- The "Make my contact card public" toggle and the "Hide All Fields" button now autosave immediately via a partial `PUT /api/profile` (new `savePublicSettings` helper), with optimistic UI, disabled controls while saving, and revert + error banner on failure. Previously these only mutated local form state and were silently lost unless the user happened to press the edit-mode Save button.
- When the toggle is switched on for a profile whose visibility was never configured (all flags false), first name, last name, and avatar are seeded as visible — the preview and public card no longer render "Anonymous". Already-public profiles are never auto-seeded.
- `getDefaultVisibility()` (frontend + backend) now defaults `avatar`/`firstName`/`lastName` to `true` for new profiles; safe because nothing is served until `is_public` is enabled. The public endpoint now blanks the visibility object with a dedicated all-false `emptyVisibility()` so its response doesn't drift with the defaults.
- `useUpdateUserProfile` writes the PUT response into the query cache (`setQueryData`) instead of invalidating/refetching; the profile→form sync effect only runs when the form has no unsaved changes, so background cache updates can't clobber in-flight edit-mode edits. `handleSave` syncs the form from the mutation response directly. The triplicated profile→form mapping was extracted into `profileToFormState()`.

**Why:**
- Bug report: enabling the public profile showed an "Anonymous" preview (all visibility flags defaulted to hidden) and the setting was lost on reload (the toggle never triggered a save).

**Files Modified:**
- `frontend/src/components/UserProfilePage.tsx`
- `frontend/src/api/profileHooks.ts`
- `backend/src/routes/profile.ts`
- `docs/readme.md` — documented the public-card behavior
- `docs/plans/2026-07-26-public-profile-toggle-autosave.md` — implementation plan

---

## 2026-07-24 — Show logged-in user's email next to Profile header logout button

**What Changed:**
- Added the signed-in user's email to the Profile page header actions, rendered to the left of the "Logout" button
- Added a `.header-user-email` style (secondary text, truncates with ellipsis) in `user-profile.css`

**Why:**
- Make it clear which account is currently signed in, directly in the header alongside the logout control

**Files Modified:**
- `frontend/src/components/UserProfilePage.tsx`
- `frontend/src/styles/pages/user-profile.css`

---

## 2026-07-14 — Made og:image URLs absolute via VITE_PUBLIC_URL env var

**What Changed:**
- `og:image` and `twitter:image` in `frontend/index.html` now use a `%VITE_PUBLIC_URL%` placeholder instead of a bare root-relative path.
- `frontend/vite.config.ts` injects the value at build time via a small `transformIndexHtml` plugin (runs `pre` so an unset variable resolves to an empty string — root-relative path, as before — rather than leaving the literal placeholder in the HTML). Trailing slashes are stripped.
- `Dockerfile` declares `ARG VITE_PUBLIC_URL` in the frontend build stage so Railway service variables reach the Vite build.
- Created `docs/readme.md` documenting the variable.

**Why:**
- Link previews weren't showing: the OG spec requires `og:image` to be an absolute URL, and scrapers (iMessage, Slack, Facebook, etc.) ignore relative paths. The domain may change, so it's wired through an env var instead of hardcoded. Set `VITE_PUBLIC_URL=https://<production-domain>` in Railway for previews to work.

**Files Modified:**
- `frontend/index.html`
- `frontend/vite.config.ts`
- `Dockerfile`
- `docs/readme.md` (new)

---

## 2026-07-14 — Recolored Open Graph image to purple brand background

**What Changed:**
- Regenerated `frontend/public/og-image.png` (1200×630) with a solid brand-purple background (`#5F27E3`) and the Yello logo, divider, and tagline all reversed out in white, replacing the previous white-background version.

**Why:**
- Requested a stronger, on-brand share card that leads with the brand color.

**Files Modified:**
- `frontend/public/og-image.png`

---

## 2026-07-14 — Added Open Graph / Twitter share image and meta tags

**What Changed:**
- Created `frontend/public/og-image.png` (1200×630): Yello logo on a white background with a soft purple glow and the tagline "Manage and organize your contacts with ease", rendered in the app's Geist font and brand purple (#5F27E3).
- Added `og:*` and `twitter:*` meta tags plus a `<meta name="description">` to `frontend/index.html`. Image paths are root-relative (`/og-image.png`) since there is no fixed production domain yet — swap in the absolute URL once one exists, as some scrapers require absolute `og:image` URLs.

**Why:**
- The app had no OG image or social meta tags, so shared links rendered without a preview card.

**Files Modified:**
- `frontend/public/og-image.png` (new)
- `frontend/index.html`

---

## 2026-07-14 — Linked related contacts with autocomplete

**What Changed:**
- Related people on a contact can now be linked to a real contact. In edit mode the name field is a typeahead: as you type it shows a dropdown of matching contacts (new `RelatedPersonNameField` combobox); picking one links the entry and shows it as a locked chip with an × to unlink. Free-text names that match nothing still save as plain, unlinked names.
- Linked entries follow the linked contact's current name (renames propagate) via a `COALESCE(linked.display_name, stored_name)` read; in view mode a linked name renders as a `<Link>` to `/contacts/:id`.
- Reverse links: a contact's detail view now also shows (read-only) the other contacts that list it as a related person (`linkedFrom`), deduped against its own outgoing links.
- Schema: added nullable `related_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL` (+ partial index) to `contact_related_people` via the existing try/catch ALTER migration. Deleting a linked contact nulls the link and keeps the name snapshot (FKs are enforced).
- New `GET /api/contacts/search?q=&exclude=` FTS typeahead endpoint (excludes archived contacts and the contact being edited). Writes null out self-links and dead ids and refresh the stored name snapshot for valid links. Merge repoints related-person links from secondaries to the surviving primary.

**Why:**
- Users wanted related people to connect to actual contacts (navigable, rename-safe) while still allowing free-text names.

**Files Modified:**
- `backend/src/services/userDatabase.ts` (migration)
- `backend/src/routes/contacts.ts` (search route, link-aware reads/writes, reverse links)
- `backend/src/schemas/contact.ts`, `backend/src/types/index.ts`
- `backend/src/services/mergeService.ts`, `archiveService.ts`, `cleanupService.ts`, `deduplicationService.ts`, `socialLinksCleanupService.ts`
- `frontend/src/components/RelatedPersonNameField.tsx` (new), `ContactFormSections.tsx`, `ContactCardView.tsx`, `ContactRowExpanded.tsx`, `AddContactPage.tsx`
- `frontend/src/api/types.ts`, `frontend/src/api/hooks.ts`, `frontend/src/index.css`

---

## 2026-07-14 — Redesigned onboarding to match the app design system

**What Changed:**
- Rewrote `OnboardingView` markup: replaced the native `<details>`/`<summary>` accordion (and the ref/attribute machinery fighting it) with state-driven step cards, a gradient hero (Welcome-page treatment) with a 3-dot progress indicator, and a success card on completion.
- Swapped raw HTML controls for the app's ui/ primitives: `Button` (primary/secondary), `FilePicker` for VCF and LinkedIn CSV selection (two-step select → import, matching the Settings import pattern), `Badge` ("Done"), `Icon` chips per step, and the global `.progress-bar-*` classes instead of a raw `<progress>`.
- Errors now surface via `useToast` instead of inline `error-text` paragraphs; the empty-CSV case now shows a toast instead of silently returning.
- Moved styles to `frontend/src/styles/pages/onboarding.css` (all `--ds-*` tokens, BEM-ish naming per `launch.css`), registered in `styles/pages.css`, and deleted the ad-hoc co-located `OnboardingView.css`.
- No functional changes: same hooks, 3-step flow, auto-advance, all-complete → 1.5s redirect, skip/finish → `PATCH /api/auth/onboarded`.

**Why:**
- The first-run onboarding was bare-bones and ignored the design system (raw buttons, native disclosure elements, ad-hoc CSS), looking broken next to the rest of the app.

**Files Modified:**
- `frontend/src/components/OnboardingView.tsx` (rewritten markup)
- `frontend/src/styles/pages/onboarding.css` (new)
- `frontend/src/styles/pages.css`
- `frontend/src/components/OnboardingView.css` (deleted)
- `docs/plans/2026-07-14-onboarding-redesign.md` (plan)

---

## 2026-07-13 — Made contact re-imports safe (stable IDs, no archived resurrection)

**What Changed:**
- **Schema:** added `contacts.icloud_uid` + a partial index (`userDatabase.ts`), mirroring the existing `google_resource_name` column.
- **vCard parser:** `ParsedContact` now carries a `uid` field, parsed from the vCard `UID` property (normalizing the `urn:uuid:` prefix). It was never extracted before, so iCloud's stable per-contact identifier was being thrown away on every import.
- **Matcher (`icloudMatchingService.ts`):** an exact external-identifier hit (`google_resource_name` or vCard `uid`) now short-circuits the heuristics and matches with `very_high` confidence. Previously matching was *only* email/phone/social overlap, so a contact with just a name re-imported as a fresh duplicate every time.
- **Matcher:** `loadExistingContacts` no longer filters `WHERE archived_at IS NULL`. Archived contacts are now loaded and flagged with a new `existingArchived` field on each match, instead of being invisible.
- **Routes:** `icloud.ts` now persists `icloud_uid` on insert and backfills it on merge (the Google route already did the equivalent for `google_resource_name`).
- **UI:** archived matches are labelled ("Existing (archived)" + an `archived` tag) and default to **skip** rather than merge, in `ICloudImportView` and `GoogleContactsImportContent`.
- **Tests:** 5 new cases in `icloudMatchingService.test.ts` covering resource-name matching, UID matching, non-matching UIDs, and the archived flag.

**Why:**
- Re-running either import was unsafe. Dedupe was purely heuristic: a contact with no email/phone/social overlap produced no match candidate at all and was re-inserted as a duplicate. `google_resource_name` was already being written on every Google import but was **never read** — the fix was mostly a matter of using it.
- Archived contacts were excluded from the match set, so anything the user archived came back as a brand-new contact on the next import.
- Kept as a manual import — no scheduling, no incremental sync, no write-back.

**Files Modified:**
- `backend/src/services/userDatabase.ts`
- `backend/src/services/vcardParser.ts`
- `backend/src/services/icloudMatchingService.ts`
- `backend/src/services/__tests__/icloudMatchingService.test.ts`
- `backend/src/routes/icloud.ts`
- `backend/src/routes/googleContacts.ts`
- `frontend/src/api/icloudHooks.ts`
- `frontend/src/components/ImportMatchCards.tsx`
- `frontend/src/components/ICloudImportView.tsx`
- `frontend/src/components/GoogleContactsImportContent.tsx`

**Known gap:** the plain `.vcf` upload path (`/api/import` → `importService.ts`) still has no matching at all — re-uploading a file duplicates every contact. It now parses `uid`, so wiring it through `matchIncomingContacts` is the natural follow-up.

---

## 2026-07-13 — Collapsed the "Sync" group into "Import" on the Tools page

**What Changed:**
- Removed the duplicate "Sync Google Contacts" card from `SettingsView.tsx`. It rendered the same `GoogleContactsImportContent` component and hit the same endpoints as the "Import Google Contacts" card already in the Import group — two differently-labelled cards doing the identical thing. Its one useful piece of copy (explaining that a Google-signed-in user may only need to grant extra permission) was moved into the surviving Import card rather than lost.
- Moved the Apple/iCloud card into the Import group and renamed it "Sync Apple Contacts" → "Import from Apple iCloud". Its connect/disconnect form and its link to `/icloud-import` are unchanged.
- Deleted the now-empty "Sync" group and the unused `googleContactsExpanded` state.
- Mirrored the same restructuring in `DocsView.tsx`'s `TOOL_GROUPS`: dropped the `sync-google` entry, moved `sync-apple` into the Import group as `import-apple` with an updated name and location.

**Why:**
- Neither integration actually syncs. Apple (`icloudService`) pulls a full CardDAV dump on every fetch with no CTag/ETag/sync-token stored; Google (`googlePeopleService`) pages `people/me/connections` to exhaustion without ever requesting a `syncToken`, and its OAuth scope is `contacts.readonly`, so write-back is impossible as built. Neither is scheduled, and nothing edited in Yello is pushed back to Apple or Google. The "Sync" group promised ongoing, two-way behaviour the code does not implement.
- Grouping them under "Sync" had also produced a straight duplication of the Google import card.
- Behavior is unchanged; this is naming and placement only. Real sync (Google `syncToken`, CardDAV CTag/ETag, read-write scope) remains future work per `docs/plans/2026-04-01-google-contacts-import.md` and `docs/plans/2026-03-31-icloud-contacts-sync-design.md`.

**Files Modified:**
- `frontend/src/components/SettingsView.tsx`
- `frontend/src/components/DocsView.tsx`

---

## 2026-07-13 — Header logo links to dashboard

**What Changed:**
- Wrapped the Yello logo in `PageHeader` in a react-router `Link` to `/dashboard` (with an `aria-label`), so clicking it navigates to the dashboard from any page.
- Added a `.page-header-logo-link` flex rule so the anchor wrapper doesn't change the logo's alignment.

**Why:**
- Standard UX convention: the app logo should take you back to the home/dashboard view.

**Files Modified:**
- `frontend/src/components/PageHeader.tsx`
- `frontend/src/index.css`

---

## 2026-07-11 — Per-user Apify API key for LinkedIn enrichment

**What Changed:**
- Replaced the global `APIFY_API_TOKEN` env var with a per-user Apify API key, validated against Apify and stored encrypted (AES-256-GCM via `tokenEncryption`) in each user's `user_settings` row.
- `userDatabase.ts`: added `apify_api_token` and `apify_username` columns (CREATE TABLE + guarded ALTER TABLE migrations).
- `apifyEnrichmentService.ts`: removed the module-level token constant and `isLinkedInEnrichmentConfigured()`; added `validateApifyToken()` (calls Apify `GET /users/me`); threaded a `token` param through `startApifyRun`/`waitForApifyRun`/`getApifyResults`/`enrichContacts`/`recoverFromDataset`.
- `enrich.ts`: added `POST`/`DELETE /api/enrich/apify-key` (validate → encrypt → store; never returns the secret); `/linkedin/summary` now derives `configured` + `apifyUsername` from the DB; `/linkedin/start` and `/linkedin/recover` decrypt the stored key and 400 with an actionable message when unset.
- Frontend: `useSaveApifyKey`/`useDeleteApifyKey` hooks; `apifyUsername` on `LinkedInEnrichmentSummary`; the Enrich card's "API Not Configured" warning is now an inline connect-your-Apify-account form, and the configured state shows "Connected to Apify as {username}" + Disconnect.
- Removed `APIFY_API_TOKEN` from Electron env pass-through and setup docs; updated the Tools docs entry.
- Added `backend/src/routes/__tests__/apifyKey.test.ts`.

**Why:**
- Multi-tenant app: every user should bill their own Apify account rather than a shared server-owned token (which also failed outright if unset).

**Files Modified:**
- `backend/src/services/userDatabase.ts`
- `backend/src/services/apifyEnrichmentService.ts`
- `backend/src/routes/enrich.ts`
- `backend/src/routes/__tests__/apifyKey.test.ts` (new)
- `frontend/src/api/enrichHooks.ts`
- `frontend/src/api/types.ts`
- `frontend/src/components/EnrichToolsContent.tsx`
- `frontend/src/components/DocsView.tsx`
- `frontend/src/styles/pages/enrich.css`
- `electron/src/main.ts`
- `electron/README.md`
- `electron/.env.example`
- `ELECTRON_SETUP.md`

---

## 2026-07-11 — Fix rate-limit keying behind Railway proxy (trustProxy)

**What Changed:**
- `Fastify({ logger: true })` → `Fastify({ logger: true, trustProxy: 1 })` in `backend/src/server.ts`.
- With no `trustProxy`, `request.ip` was Railway's proxy socket IP, so `@fastify/rate-limit` (default key: `req.ip`) bucketed **all users together** — one abuser could exhaust the global 100/min bucket and the tighter auth-endpoint limits for everyone, and per-client brute-force throttling didn't work.
- Deliberately `trustProxy: 1` (trust exactly one hop — Railway's edge) instead of the suggested `trustProxy: true`: with `true`, Fastify takes the **leftmost** `X-Forwarded-For` entry, which a client can spoof (Railway appends the real IP rather than stripping the header), letting an attacker rotate fake IPs to bypass rate limits entirely. With `1`, `request.ip` is the rightmost XFF entry — the one Railway itself appends — which the client cannot forge. Locally (Electron/dev, no proxy) there's no XFF header, so it falls back to the socket IP unchanged.

**Why:**
- Security audit finding: rate limiting was ineffective behind Railway's edge proxy (shared bucket, no per-client keying).

**Files Modified:**
- `backend/src/server.ts`

**Verified:** `tsc --noEmit` passes; all 126 backend tests pass. Behavioral test (Fastify inject mirroring the server config): spoofed-leftmost + Railway-appended-rightmost XFF resolves `request.ip` to the Railway-appended client IP; no-XFF requests fall back to the socket IP; the 4th request from the same real IP gets 429 even while rotating spoofed leftmost entries; a different real client IP gets a fresh bucket.

---

## 2026-07-10 16:10 — Launch/beta announcement banner + Welcome page

**What Changed:**
- **New `frontend/src/components/LaunchBanner.tsx`** — a dismissible brand-gradient announcement bar with a "Beta" pill and a "Read more" CTA. Clicking the bar navigates to `/welcome`; the "×" dismisses it and persists the choice in `localStorage` (`launchBannerDismissed`), following the direct-localStorage convention in `GroupsView.tsx`.
- **New `frontend/src/components/WelcomeView.tsx`** — a Welcome page modeled on `DocsView` (uses `setHeaderConfig({ title: 'Welcome' })`, typed content constant rendered with `.map()`). A brand-gradient hero plus three cards: *We're live* (launch announcement), *Still being built* (beta/WIP), and *Help us build it* (invites suggestions, input, and flagging content). Copy positions Yello as an address book for staying on top of relationships and owning your social graph. Copy only — no form/mailto this round.
- **New `frontend/src/styles/pages/launch.css`** — tokens-only styles for both the banner and the Welcome page; registered via an `@import` in `styles/pages.css`.
- **`DashboardView.tsx`:** renders `<LaunchBanner />` as the first child of `.dashboard-content` (loaded state only), so the banner shows only on the Dashboard in normal flow — no changes to the fixed-header/NavRail offsets.
- **`App.tsx`:** added the `WelcomeView` import and a `<Route path="welcome">` inside the protected `<Layout>` group. Reachable via the banner link only (no NavRail/BottomTabBar entry).

**Why:**
- Announce the launch and beta state of the site and invite early users to shape it with suggestions, input, and content flagging — together building the best place to stay on top of your relationships and own your social graph.

**Files Modified:**
- `frontend/src/components/LaunchBanner.tsx` (new)
- `frontend/src/components/WelcomeView.tsx` (new)
- `frontend/src/styles/pages/launch.css` (new)
- `frontend/src/components/DashboardView.tsx`
- `frontend/src/App.tsx`
- `frontend/src/styles/pages.css`

**Verified:** `npm run build` (tsc `-b` type-check + Vite build) passes; no lint issues in the new files (pre-existing lint errors in `MapView.tsx` etc. are unrelated). Visual/UI check left to the user per project convention.

---

## 2026-07-10 15:24 — Security audit (report only, no code changes)
- **`docs/plans/2026-07-10-security-audit-hardening.md`** — new audit report. Reviewed multi-tenant isolation, auth/session handling, deployment/secrets, and input handling across the backend.
- **Headline:** no live cross-tenant data-access path found — every per-user DB is opened via `getUserDatabase(request.user!.id)` sourced only from the server-side session; no route accepts a client-supplied userId; SQL is parameterized; photo serving is per-user with a traversal guard.
- **P0:** live `GOOGLE_CLIENT_SECRET`/`SESSION_SECRET`/`HERE_API_KEY`/`APIFY_API_TOKEN` sit in plaintext `backend/.env` inside a Dropbox-synced folder (not in git, not in the image) → rotate; note SESSION_SECRET rotation invalidates sessions + stored OAuth tokens.
- **P1:** contact/enrichment/imported photos write to a shared `./data/photos` keyed only by per-tenant contact id (`importService.ts:78` omits `userId`) → cross-tenant file collision/overwrite. Missing `trustProxy` makes rate limiting bucket on the proxy IP.
- **P2/P3:** cookie-secret fallback, `NODE_ENV` single-point dependency, PII/OAuth-error-body logging, session lifecycle, traversal prefix separator, no global error handler, demo-session entropy, hardcoded admin email.
- No source files changed; report only per user request.

## 2026-07-10 11:12 — Move Enrich tools into the Tools page as an inline subsection

- **What:** relocated the three enrichment tools (LinkedIn Profile Data, Fetch Contact Photos, Gmail Email History) from the standalone `/enrich` page into a new **"Enrich"** group on the Tools page (`SettingsView`), where each expands in place as a collapsible card.
- **New:** `frontend/src/components/EnrichToolsContent.tsx` — extracted all of EnrichView's state/hooks/handlers and the three `settings-section collapsible-card` sections into a self-contained component (renders a fragment of the three cards; no page header/outlet wrapper).
- **`SettingsView.tsx`:** removed the "Enrich" `settings-nav-link` (which navigated to `/enrich`) from the Tools group; added a new `settings-group` titled "Enrich" that renders `<EnrichToolsContent />`. Cleanup and Merge remain nav links to their own pages.
- **`App.tsx`:** removed the `EnrichView` import and the `<Route path="enrich">` route.
- **Deleted:** `frontend/src/components/EnrichView.tsx` (its content now lives in `EnrichToolsContent`, mounted on the Tools page).
- **CSS (`styles/pages/enrich.css`):** removed the now-dead page-container rules (`.enrich-view`, `.enrich-header`, `.enrich-subtitle`, `.enrich-content`, and their responsive overrides); all tool-specific classes (`.enrich-stats-row`, `.enrichment-*`, `.gmail-discovery-*`, `.recovery-*`, etc.) are global and unchanged, so styling carries over intact.
- **`DocsView.tsx`:** updated the Enrich feature location string from `Tools → Tools · /enrich` to `Tools → Enrich · /tools`.
- **Verified:** `tsc --noEmit`, `npm run build` (tsc + vite), and ESLint on the changed files all pass. Live UI walk-through not run (Chrome extension not connected).

- **What:** unified the file-upload and submit buttons across the Settings import sections so VCF and LinkedIn look and behave identically.
- **New:** `frontend/src/components/ui/FilePicker.tsx` — canonical file-upload control (visually-hidden native input + styled `.file-input-label` button showing the chosen filename, with a `disabled` state). One shared upload button.
- **`LinkedInImportContent.tsx`:** swapped its inline file-input markup for `<FilePicker>`; `handleLinkedInFileChange` now takes a `File | null`.
- **`SettingsView.tsx` (Import VCF):** replaced the raw browser-default `<input type="file">` (+ separate filename line) with `<FilePicker>`; the submit button now matches LinkedIn's (`secondary-button`, `upload` icon, disabled until a file is selected). Removed the now-unused `importFileRef`/`useRef` and inline styles in that block (the idle block unmounts on result, so the input is always fresh).
- **CSS (`index.css`):** renamed `.linkedin-import-controls` → `.import-controls` (now `align-items: flex-start` so upload + submit sit left-aligned at content width), added `.file-input-label.is-disabled`, `.import-progress-inline`, `.import-error-text`. Both buttons already share the 32px uniform control height, so they now render identically.
- Submit buttons are interactive: disabled with no file selected, enabled once a file is chosen (VCF and LinkedIn). Google/iCloud are fetch-based (no upload) and already used `secondary-button`; Onboarding uses a separate one-click choose-and-auto-import pattern and was left unchanged.
- **Verified:** `npm run build` (tsc + vite) and `npm run lint` pass (no new issues); running Vite dev server transforms `FilePicker`/`LinkedInImportContent`/`SettingsView` and serves the renamed `.import-controls` CSS. Live UI walk-through not run (Chrome extension not connected).

## 2026-07-09 11:37 — Inline LinkedIn & Google Contacts import in Settings

- **What:** the "Import LinkedIn Connections" and "Import Google Contacts" entries on the Tools page (`SettingsView`) now expand inline as `collapsible-card` accordions instead of navigating to standalone pages, matching the existing pattern used by Import VCF / Sync Apple Contacts / Export / Danger Zone.
- **New:** `frontend/src/components/LinkedInImportContent.tsx` and `frontend/src/components/GoogleContactsImportContent.tsx` — reusable content components extracted from the old page views (self-contained state/hooks, no `setHeaderConfig`, no page wrapper). The Google component drops the outer `icloud-import-view` wrapper (padding/max-width already provided by `.collapsible-content`) and keeps `useNavigate` for post-import redirect to `/contacts`.
- **`SettingsView.tsx`:** added `linkedInExpanded` / `googleImportExpanded` state; replaced the two `<Link>` nav cards with collapsible sections rendering the new components. The "Sync Google Contacts" section's button (which linked to the removed route) now renders `<GoogleContactsImportContent />` inline instead.
- **Removed:** `ImportView.tsx` and `GoogleContactsImportView.tsx` page files, plus their `/import` and `/google-contacts-import` routes/imports in `App.tsx` (nothing else referenced them; `OnboardingView` has its own inline LinkedIn import and was unaffected).
- No backend changes — all import hooks/endpoints reused unchanged.
- **Verified:** `frontend` `npm run build` (tsc + vite) and `npm run lint` pass (no new issues; 15 pre-existing lint errors in untouched files remain); running Vite dev server transforms all three modules; deleted files removed from disk with no dangling references. Live UI walk-through not run (Chrome extension not connected; Google import needs OAuth).

## 2026-07-08 — Fix: creating a contact returned 500 (missing `linkedinEnrichment`)

- **Bug:** `POST /api/contacts` threw `"linkedinEnrichment" is required!` during response serialization. `ContactDetailSchema` (the 201 response schema) requires `linkedinEnrichment`, but the create handler's returned object omitted it. The GET and PUT handlers already include it; only the POST handler was missing the field.
- **Fix:** `backend/src/routes/contacts.ts` — the create handler now returns `linkedinEnrichment: null` (a freshly created contact has no enrichment). Backend typecheck passes.
- Investigated the paired "Cancel does nothing" report: the Cancel button (`AddContactPage` → `navigate('/contacts')`) and the header-action rendering are correct and unchanged. The Save button's `onClick` is the only path that could have fired the logged POST (no `<form>`/Enter-submit exists), which confirms the header buttons and their handlers work. Fixing the 500 also restores Save's post-success `navigate('/contacts')` — the identical call Cancel uses.

## 2026-07-08 — UI unification follow-up: grey/spacing/typography token conversion

- **Colors:** converted the remaining raw grey/neutral hexes (`#e5e7eb`→`--ds-border-color`, `#f9fafb`→`--ds-bg-secondary`, `#9ca3af`→`--ds-text-muted`, `#d1d5db`→`--ds-border-dark`) property-aware, and stripped ~20 dead `var(--ds-*, #hex)` fallbacks (all tokens are defined). One-offs with no exact token (scrollbar `#c1c1c9`, toast `#333`, `#616189`, `#111118`) left as-is
- **Typography:** added `--ds-font-2xs` (11px); tokenized every font-weight (500/600/700 → `--ds-weight-*`) and every font-size that exactly matches the scale (rem + px forms → `--ds-font-*`); fixed the `8.2px` typo. The two off-scale compact densities (13px/0.8125rem, 15px/0.9375rem) are kept as documented literals (normalized to one rem form) rather than snapped, to avoid a blind size shift
- **Spacing:** converted single-value `gap`/`padding`/`margin*` on clean 4px multiples to `--ds-space-*` (shorthand and the bespoke 6px/`0.375rem` left alone). index.css now has 300+ spacing-token, 240 font-token, and 100+ weight-token references
- All property-scoped and value-preserving → no visual change; build + lint green (baseline unchanged)

## 2026-07-08 — UI unification follow-up: badge unification

- Added a canonical `.badge` system to `index.css` (`.badge` base + `--neutral/brand/success/warning/error/info` variants + a `.badge--count` round-pill base) and a `components/ui/Badge.tsx` component
- Consolidated ~13 one-off badge classes onto the canonical base via grouped selectors (same low-risk approach as the button unification): status badges (`confidence-badge` ×2 deduped, `cleanup-badge`, `normalize-badge`, `geocoding-badge`, `geocoding-status-badge`, `address-cleanup-badge`) and count badges (`subtab-badge`, `groups-count-badge`, `archived-count-badge`) now share one base; each keeps only its distinctive color. Status badges unified to `radius-sm`; count badges to a round pill
- Left genuinely-distinct badges alone: the absolute-positioned `primary-badge`, the JS-colored `icloud-confidence-badge`, the brand `filter-badge`, and the interactive chip/tag controls (`filter-chip`, `mode-pill`, `category-tag`, etc.)

## 2026-07-08 — UI unification follow-up: shared SearchBar

- Added `components/ui/SearchBar.tsx` (magnifying-glass icon + input + clear/cancel button) with `boxed`/`plain` variants and `clear`/`cancel` trailing modes
- Migrated PageHeader's search (`.page-header-search*` → `SearchBar` with `search-bar--header`) and UserProfilePage's contact-search autocomplete (`.search-input-wrapper` → `SearchBar variant="plain" trailing="cancel"`); removed the old per-view search CSS
- InvalidLinksCleanup's pattern input is intentionally left as-is — it's a submit-style form (labeled Search button, no live filter/clear), a distinct pattern from the two icon+input+clear search boxes

## 2026-07-07 23:50 — UI unification Phase 10: consistency pass + doc closeout

- Documented the design system + `components/ui/` primitives in CLAUDE.md (Button, ConfirmDialog, Toast/useToast, LoadingSpinner, EmptyState; token/stylesheet conventions; "no `<style>` blocks / no static inline styles" rule)
- Marked the plan Implemented and moved it to `docs/plans/completed/`
- Scoped-out (noted as future work, per the quality bar): the 3 search-bar and 3 tab implementations are genuinely distinct UI (page-filter vs form autocomplete; mobile nav vs sub-nav vs admin), so not force-unified; a canonical `.badge`, PublicContactCard's inline-SVG→Icon migration, and the exhaustive grey/spacing token sweep remain incremental follow-ups

## 2026-07-07 23:40 — UI unification Phase 9: visual refresh (font)

- Adopted **Geist** (400/500/600/700) as the app typeface: loaded via Google Fonts in `index.html` and set `--ds-font-family` to Geist with a system fallback stack. Form controls already inherit the font (`index.css:16`), so it propagates to buttons/inputs everywhere
- Brand color (#7C3AED) and gradient (#7C3AED→#273DE3) already landed in Phase 8, so this phase is font-only
- Density/finish left as-is (32px control height is already tight for the clean/utilitarian direction) — no over-tuning per the quality bar
- Visual sign-off pending: browser automation was unavailable this session; the running app (localhost:5173) is ready for the owner to review

## 2026-07-07 23:30 — UI unification Phase 8: token normalization + brand convergence

- Converged all 5 competing brand purples/gradients onto tokens: raw `#5f27e3`/`rgba(95,39,227,…)`, the `#667eea/#764ba2` gradient + its alpha tints/shadows, and the `#7C3AED/#273DE3` hero gradient all now reference `--ds-color-primary`, `--ds-color-primary-light`, `--ds-gradient-brand`, or `color-mix(...)`. Zero raw brand hexes remain in CSS
- Set the canonical brand values in `design-system.css` (the user's choice): `--ds-color-primary` #7C3AED / hover #6D28D9 / dark #5B21B6 / light rgba(124,58,237,.1); `--ds-gradient-brand` #7C3AED→#273DE3. (The solid-brand flip lands here rather than Phase 9 so gradient and solid stay in sync.)
- Fixed a latent broken token: `--ds-text-tertiary` was used in index.css + enrich.css but never defined — added it
- Normalized border-radius to tokens: the three competing pill radii (99/999/9999px) → `--ds-radius-full`; single-value px/rem radii → `--ds-radius-sm/md/lg/xl`
- **Fixed 10 global class collisions the Phase 7 extraction created** (mount-scoped styles became always-loaded): dashboard's `.contact-list/-info/-name` (were overriding the main ContactList) → `.dash-activity-*`; enrich's `.contact-name` → `.enrich-contact-name`; UserProfilePage's `.action-button/.confirm-actions/.danger-button/.edit-button-primary/.secondary-button` → `.profile-*`; PublicContactCard's `.contact-info` → `.public-card-contact-info` (renamed in both CSS and TSX)
- Deferred as lower-value code hygiene (per the quality bar): exhaustive grey/spacing/font-size → token conversion and retiring static inline `style={{}}`

## 2026-07-07 23:05 — UI unification Phase 7: CSS-in-JS → stylesheets

- Extracted all 7 remaining component `<style>` blocks into `src/styles/pages/*.css` (login, dashboard, admin, enrich, public-contact-card, user-profile, demo-prompt-modal), aggregated by `src/styles/pages.css`, imported after `index.css` in `main.tsx` so page rules cascade over the base as before
- Removed the 4 local `@keyframes spin` copies — one global keyframes in `index.css` now serves all
- Fixed three real global collisions surfaced by making these previously mount-only styles always-loaded: EnrichView's gradient `.primary-button`/`.secondary-button` were overriding the canonical brand buttons app-wide (removed — EnrichView now uses the canonical `.btn` system); the off-brand `.progress-bar-fill` gradient was overriding ImportView's brand-solid bar (removed the duplicate); and duplicate `.spinning` definitions (removed)
- Also dropped Dashboard's `.empty-state i`/`.empty-state p` (would have overridden the shared EmptyState primitive) and scoped EnrichView's mobile full-width button rule to `.enrichment-actions`
- Added `--ds-gradient-brand-from/-to` + `--ds-gradient-brand` tokens (currently the in-app pair) as the single plug-in point for Phase 9

## 2026-07-07 22:40 — UI unification Phase 6: structural dedupe & UX fixes

- Extracted `components/ImportMatchCards.tsx` (`MatchCard` with a `sourceLabel` prop + `NewContactCard`), replacing the ~200 lines of verbatim-duplicated card components in `ICloudImportView` and `GoogleContactsImportView`; both now pass `sourceLabel="iCloud"|"Google"`
- `ArchivedView` now uses the shared `Pagination` component instead of its hand-rolled prev/next markup
- Removed `ContactDetailPage`'s redundant in-body "Back to Contacts" button (the header already has a Back action)
- Deferred (flagged for owner decision, not changed): mobile nav parity (Dashboard/Profile unreachable from `BottomTabBar`) and consolidating the Settings VCF-import section into `ImportView` — both are IA/behavior changes rather than refactors
- Kept the shared cards' `.icloud-*` class names for now (functional dedup done; the cosmetic rename to `.import-*` is deferred to avoid a risky 40-class sweep)

## 2026-07-07 22:25 — UI unification Phase 5: canonical Button system

- Added `components/ui/Button.tsx` (`variant: primary|secondary|danger|ghost|icon`, `icon`, extends button attrs) rendering `.btn .btn--{variant}` built on `--ds-btn-*` tokens
- Added a canonical `.btn` CSS system and folded the common legacy button classes into it via grouped selectors, so `primary-button`/`confirm-button` → brand primary, `secondary-button`/`cancel-button`/`back-button` → bordered neutral, `confirm-button.danger` → solid danger — unifying every button's look app-wide with no call-site churn
- Fixed a cross-app inconsistency: confirm buttons were blue (`--ds-color-info`) while primary buttons were purple (`--ds-color-primary`) — both are now the brand primary
- Removed the redundant/duplicate standalone CSS blocks for `.primary-button`, `.secondary-button` (×2), `.cancel-button`, `.confirm-button`, and `.confirm-button.danger` (×2)
- Migrated `ConfirmDialog` to `<Button>` (covers all 14 dialogs)
- Note: took a CSS-consolidation approach (unify appearance) rather than churning ~30 button classes at every call site — meets the consistency bar without the regression risk; remaining ad-hoc action-button classes stay and can migrate to `<Button>` incrementally

## 2026-07-07 22:10 — UI unification Phase 4: LoadingSpinner adoption + EmptyState

- Moved `LoadingSpinner` to `components/ui/` and made it the canonical loader; added a `fullscreen` variant
- Collapsed App.tsx's two byte-identical auth-loading blocks (each with its own `<style>`) into a single `<LoadingSpinner fullscreen />`
- Swept 8 page-level `*-loading` blocks (Groups, Archived, Dedup, Cleanup, Map, AddressNormalize, AddressDuplicates, SocialLinks) onto `LoadingSpinner`; inline button spinners left as-is
- Added `components/ui/EmptyState.tsx` (icon/title/description/action) and migrated 8 empty states (ContactList, Groups, Archived, Map w/ CTA, DuplicateGroupList, AddressGeocoding, AddressNormalize, AddressDuplicates, SocialLinks); restyled the shared `.empty-state` CSS on the `.map-empty` model
- Small inline empties (email-history, enrich-category, cleanup-list) intentionally left as compact text

## 2026-07-07 21:55 — UI unification Phase 3: shared Toast system

- Added `components/ui/Toast.tsx` — `ToastProvider` (mounted in `App.tsx`) + `useToast()` hook: `showToast(message, { type?: 'success'|'error'|'info', duration?, action? })`, single toast, last-wins, centralized timer cleanup
- Migrated all 11 hand-rolled toast implementations (ContactList, ArchivedView, DeduplicationView, CleanupView, SettingsView, ImportView, EnrichView, AddressNormalize, AddressDuplicates, AddressGeocoding, SocialLinksWithinContact) — deleted per-file `ToastState`/`UndoState` interfaces, `useState`, `setTimeout` cleanup effects, and duplicated `.undo-toast` JSX
- Renamed `.undo-toast` CSS to `.toast`; added `.toast-action` styling and error-type icon color; removed the dead `.geocode-result` banner CSS + its duplicate `@keyframes slideUp`
- MapView's inline geocode-result banner replaced with success/error toasts in the mutation callbacks
- Removed DeduplicationView's stale "undo not implemented" toast — merge toasts are now plain confirmations

## 2026-07-07 21:40 — UI unification Phase 2: shared ConfirmDialog + Escape bug fix

- Added `components/ui/ConfirmDialog.tsx` — shared confirmation dialog (title/message/danger/confirmDisabled/children), replacing 14 hand-rolled modal copies across 8 files (ContactList, DeduplicationView ×4, CleanupView, ArchivedView, AddressNormalize, AddressDuplicates, SettingsView, SocialLinksWithinContact)
- ConfirmDialog signals `useLayoutModal().setModalOpen` on mount/unmount, fixing the bug where Layout's global Escape handler navigated to /contacts while a modal was open; Escape now closes the dialog (capture-phase listener)
- SettingsView's type-DELETE danger dialog migrated via `children` + `confirmDisabled`

## 2026-07-07 21:25 — UI unification Phase 1: dead code & broken refs

- Deleted `ImportModal.tsx` (138 lines, zero importers)
- Fixed `AdminView.tsx` referencing nonexistent `--ds-color-danger` → `--ds-color-error`
- Replaced 9 dead `var(--pico-*)` references in `OnboardingView.css` with `--ds-*` tokens (Pico CSS was never installed)
- Removed dead Inter font download from `index.html` (no CSS ever referenced it)
- Added `--ds-font-family` token to `design-system.css` and pointed `body` at it (single plug-in point for the font refresh)
- Note: 15 pre-existing lint errors (ContactFormSections conditional hooks, ContactList/Layout ref-in-render) are unrelated and untouched

## 2026-07-07 21:19 — UI unification: audit + plan + docs scaffolding (Phase 0)

- Audited frontend for reusable components and UI consistency; plan saved to `docs/plans/2026-07-07-ui-unification-refresh.md`
- Created `.impeccable.md` design-context file (clean & utilitarian direction, token/primitive conventions)
- Corrected CLAUDE.md: app does not use Pico CSS (never installed) and the design-token prefix is `--ds-*`, not `--stitch-*`

## 2026-05-07 — Fix: Production 404 on `/` (Railway)

- Railway-deployed site returned `{"message":"Route GET:/ not found"}` because the static-frontend block in `backend/src/server.ts` never registered. `server.ts` resolves the frontend as `path.join(__dirname, '../../frontend/dist')` (correct for the dev layout `backend/dist/server.js`), but the Dockerfile copied the backend build to `/app/dist`, so the resolved path became `/frontend/dist` (nonexistent), `frontendExists` was false, and neither `fastifyStatic` nor the SPA fallback was registered.
- Updated `Dockerfile` production stage to preserve the dev layout: backend lives at `/app/backend/dist`, prod deps installed at `/app/backend/node_modules`, CMD changed to `node backend/dist/server.js`. Frontend remains at `/app/frontend/dist`, so `../../frontend/dist` now resolves correctly.

## 2026-04-03 — Fix: Dev server redirect to wrong port

- Fixed backend OAuth redirects using absolute `${frontendUrl}` URLs (defaulting to `localhost:3456`) instead of relative paths — caused browser to navigate to backend port instead of staying on Vite dev server (port 5173)
- Changed all `reply.redirect()` calls in Google Contacts OAuth flow to use relative paths (matching the existing Gmail and login flows)
- Removed unused `frontendUrl` variable from `auth.ts`

## 2026-04-03 — Bugfixes: Google Contacts Import

- Fixed `fastify.getValidAccessToken is not a function` — imported `getValidAccessToken` directly from `googleAuthService.ts` instead of relying on Fastify decorator (encapsulation issue)
- Fixed `ParseError: NOT_A_NUMBER` crash — switched from `parsePhoneNumber` (throws on invalid input) to `parsePhoneNumberFromString` (returns undefined) in `googlePeopleService.ts`, added `.isValid()` check
- Fixed bulk action buttons (Merge All, Skip All, Select All, Deselect All) not responding to clicks in both `GoogleContactsImportView.tsx` and `ICloudImportView.tsx` — added `type="button"` to all `<button>` elements

## 2026-04-02 11:30 — Google Contacts Import

- Extended `googlePeopleService.ts` with `mapGooglePersonToParsedContact`, `fetchGoogleContacts`, and `downloadGooglePhoto` (11 tests)
- Created `googleAuthService.ts` — reusable `getValidAccessToken(userId)` with token refresh, exposed via Fastify decorator
- Added OAuth scope upgrade flow (`/google/contacts`) and contacts-status endpoint in `auth.ts`, following existing Gmail re-auth pattern
- Added `google_resource_name` column on contacts and `google_contacts_last_synced` on `user_settings` (migration for existing DBs)
- Created `backend/src/routes/googleContacts.ts` — 3 endpoints: POST fetch (with batched photo download), POST preview-import, POST import (reuses icloudMatchingService)
- Created `frontend/src/api/googleContactsHooks.ts` — 4 TanStack Query hooks, re-exports shared types from icloudHooks
- Created `frontend/src/components/GoogleContactsImportView.tsx` — mirrors ICloudImportView (fetch → preview duplicates → merge/skip/import → complete)
- Added route in `App.tsx` and Google Contacts section in `SettingsView.tsx` (collapsible card + quick-access nav link)
- Stores `google_resource_name` per contact for future two-way sync capability

## 2026-04-01 12:30 — iCloud Contacts Sync

- Added `tsdav` CardDAV client dependency for iCloud connectivity
- Added `icloud_email` and `icloud_app_password` columns to `user_settings` (with ALTER TABLE migration for existing DBs)
- Created `icloudService.ts` — builds DAVClient, tests connection, fetches all contacts from iCloud address books
- Created `icloudMatchingService.ts` — matches incoming ParsedContacts against DB using inverted indexes on email/phone/social with confidence scoring (very_high/high/medium)
- Created `backend/src/routes/icloud.ts` — 5 endpoints: GET/POST/DELETE settings, POST fetch, POST preview-import, POST import (with merge logic for scalar fields, union for multi-value fields)
- Created `frontend/src/api/icloudHooks.ts` — 6 TanStack Query hooks for all iCloud API endpoints
- Added Apple Contacts section to SettingsView with credential form, connect/disconnect, and nav link
- Created `ICloudImportView` component with 5 states: not-connected, idle, fetching, reviewing (match cards with merge/skip/import-as-new decisions), and import complete
- Added responsive CSS styles for iCloud import view (match cards, confidence badges, summary bars, bulk actions)
- Design doc status updated to Implemented

## 2026-03-25 12:15 — Electron Desktop App Wrapper

- Created `electron/` package with Fastify backend spawning and process lifecycle management
- Implemented `electron/src/main.ts` (262 lines) with:
  - Spawns backend via `ELECTRON_RUN_AS_NODE=1` child process
  - Health polling with AbortController (200ms interval, 30s timeout)
  - Session secret auto-generation and persistence (crypto-generated, mode 0o600)
  - User data directory management at `~/Library/Application Support/Yello/`
  - BrowserWindow creation with context isolation and preload
  - Electron user agent stripping for OAuth compatibility
  - App lifecycle management (ready, window-all-closed, before-quit, activate)
  - Backend termination with SIGTERM signal
- Created `electron/tsconfig.json` with CommonJS output (required for Electron main process)
- Created `electron/package.json` with electron, electron-builder, TypeScript dependencies
- Created `electron/src/preload.ts` for security context isolation
- Created `electron/splash.html` with gradient background and loading spinner
- Created `electron-builder.yml` with macOS DMG configuration (universal arm64 + x64)
- Created `build-resources/entitlements.mac.plist` for macOS Hardened Runtime (JIT, networking, file access)
- Created `electron/.env.example` template for Google OAuth and optional API keys
- Added root `package.json` scripts: `build:all`, `electron:dev`, `electron:build`
- Added comprehensive setup guide `ELECTRON_SETUP.md` with OAuth config, development workflows, troubleshooting
- Added test verification checklist `ELECTRON_TEST_RESULTS.md` with build pipeline and integration verification
- Fixed unused drag-drop code in `frontend/src/components/ContactFormSections.tsx` (unblocked frontend build)
- Backend integration verified: all env vars (GOOGLE_CLIENT_ID, SESSION_SECRET, database paths) passed correctly
- Build pipeline tested: frontend builds (778KB), backend builds (all tests passing), Electron compiles (main.js + preload.js)
- Data paths confirmed: auth DB, per-user DBs, session secret all use user data directory
- OAuth flow compatible: localhost redirects work within BrowserWindow
- All 106 backend tests passing (105 passing, 1 pre-existing photoProcessor failure unrelated to implementation)

## 2026-03-11 16:00 — Drag-to-Reorder Contact Details

- Added `DraggableArrayItem` wrapper component for HTML5 Drag & Drop
- Added `useDragState` hook for managing drag state and reordering
- Updated all detail sections (Phone, Email, Address, Social, URL, Related People, Categories, Instant Messages) with drag support in edit mode
- Auto-updates `isPrimary` when item moved to first position
- Added CSS styling for drag visual feedback (opacity on dragging, border highlight on drop zone)
- Works with existing save flow — no backend changes needed

## 2026-03-11 15:00 — Fix VCF Export: Missing Contacts & Photos

- Fixed default export dropping ~505 contacts that had no raw_vcard (manually created / LinkedIn imports)
- Default export now selects all non-archived contacts; generates vCard on the fly for contacts without raw_vcard
- Added photo embedding: contacts with photo_hash get their medium JPEG read from disk and injected as base64 PHOTO property
- Added `photoBase64` support to `vcardGenerator.ts` so generated vCards include photos
- Existing raw vCards get their PHOTO property replaced with the current local photo (handles enrichment/manual uploads)
- Refactored export route to share a `buildContactForVcard()` helper between default and regenerate modes

## 2026-03-06 15:00 — Onboarding Flow

- Added `/onboarding` route with accordion-style guided setup
- Profile photo upload via `POST /api/profile-images/upload` (Sharp pipeline, 4 sizes)
- VCF import section with export instructions for iPhone, Google, Outlook
- LinkedIn CSV import section with step-by-step export guide
- `has_onboarded` flag on users table, `PATCH /api/auth/onboarded` endpoint
- `hasOnboarded` included in `GET /api/auth/me` response
- Auto-redirect to onboarding for new users (both frontend ProtectedRoute and OAuth callback)
- Skippable at any time via "Skip to Dashboard" or "Go to Dashboard"
- Auto-completion detection with redirect after all steps done

## 2026-03-04 21:30 — Multi-Tenancy: Database-Per-User Architecture

- Converted from single-tenant to multi-tenant architecture supporting 100+ users
- **Shared auth DB** (`data/auth.db`): users, sessions, profile_images tables
- **Per-user contact DBs** (`data/users/{userId}/contacts.db`): all contact data, FTS indexes, linkedin enrichment, email history, user settings
- **Per-user photo directories** (`data/users/{userId}/photos/`): contact photos isolated per user
- Created `authDatabase.ts` with `getAuthDatabase()` singleton for auth data
- Created `userDatabase.ts` with `getUserDatabase(userId)` and LRU cache (max 50 connections)
- Updated all 15 route files to use `getUserDatabase(request.user!.id)`
- Updated all ~15 service files to accept `database: DatabaseType` parameter instead of calling singleton
- Refactored `database.ts` to utility-only module (buildSearchableText, rebuildContactSearch, etc.)
- Updated photo serving in server.ts to resolve per-user photo directories from session
- Created migration script (`scripts/migrateToMultiTenant.ts`) for single-tenant → multi-tenant conversion
- Updated Dockerfile with `AUTH_DATABASE_PATH` and `USER_DATA_PATH` env vars
- 45 new tests (14 auth DB + 22 user DB + 9 migration)
- OAuth tokens remain encrypted at rest with AES-256-GCM
- GDPR user deletion: just delete `data/users/{userId}/` directory + auth DB record

## 2026-03-04 14:05 — Security Hardening Phase 2

- Removed `Access-Control-Allow-Origin: *` from all 5 SSE endpoints (enrich.ts, gmailEnrich.ts, settings.ts)
- Dockerfile now runs as non-root `node` user with `USER node` directive
- Added `@fastify/helmet` for security headers (CSP in production, X-Content-Type-Options, X-Frame-Options, etc.)
- Added `@fastify/rate-limit` with global 100/min limit and per-route overrides on expensive endpoints (auth: 20/min, import: 10/min, enrichment: 5/min)
- Implemented AES-256-GCM encryption for OAuth tokens at rest using key derived from SESSION_SECRET
- Added token encryption migration that auto-encrypts existing plaintext tokens on startup
- Created tokenEncryption service with encrypt/decrypt/detect functions and test suite

## 2026-03-04 11:10 — Security Hardening

- Added global `onRequest` auth hook in `server.ts` protecting all `/api/*` and `/photos/*` routes
- Allowlisted `/health`, `/api/auth/*`, `/api/profile/public/*` from auth requirement
- Removed redundant per-route `requireAuth` from `import.ts`, `stats.ts`, `emailSync.ts`, `gmailEnrich.ts`
- Replaced custom `getUserIdFromSession` helpers with `request.user!.id` in `settings.ts`, `profileImages.ts`, `profile.ts`
- Photos now served through authenticated route with path traversal protection (replaced static serving)
- Removed contact count from `/health` endpoint to prevent data leakage
- Added `SESSION_SECRET` env var validation on production startup
- Sanitized all error messages across 10 route files to prevent internal info leakage (CWE-209)
- Updated health test to match new response format

## 2026-02-15 14:00 — Bulk Gmail Email History Sync in Enrich View

- Added `emailDiscoveryService.ts` — discovers which contacts user emails most recently/frequently by scanning Gmail messages
- Added `gmailEnrich.ts` route plugin at `/api/enrich/gmail` with summary, discover, and bulk-sync (SSE) endpoints
- Exported helper functions (`gmailFetch`, `fetchMessageMetadata`, `extractEmailAddresses`, `getHeader`) from `emailSyncService.ts`
- Added frontend types (`GmailSyncSummary`, `GmailDiscoveredContact`, `GmailBulkSyncProgress`, `GmailBulkSyncResult`) to `types.ts`
- Created `gmailEnrichHooks.ts` with `useGmailSyncSummary`, `useGmailDiscover`, `useGmailBulkSync` hooks
- Added "Gmail Email History" collapsible section to EnrichView with:
  - Summary stats (synced / not synced / total with email)
  - Strategy selector (most recent, most frequent, not yet synced, all)
  - Configurable scan depth and contact limit
  - Discovery step for recent/frequent strategies showing ranked contact list
  - SSE-streamed bulk sync with progress bar, cancel support
- Registered route in `server.ts`

## 2026-02-15 12:20 — Address Edit Option in Cleanup Normalize & Duplicates

- Added `PUT /api/cleanup/addresses/update` backend endpoint to update address fields without geocoding
- Extended `applyAddressFixes()` to support an optional `updatedAddress` field, applying address updates in the same transaction before removing duplicates
- Added `AddressUpdateData` / `AddressUpdateResponse` frontend types and `useUpdateAddress()` mutation hook
- Added inline edit mode to Normalize tab: pencil icon on each junk address opens editable fields (street, city, state, postalCode, country); Save updates the address and removes it from the junk list
- Added "Custom" radio option to Duplicates tab: lets users compose a custom address from editable fields pre-filled with the recommended address data; on Apply, the recommended address is updated and duplicates are removed
- Added CSS styles for `.address-edit-form`, `.address-edit-input`, `.address-edit-actions`, and normalize edit button

## 2026-07-08 — Search bar on Dashboard & Groups pages

- Added optional `onSubmit` (fires on Enter) to the shared `SearchBar` primitive; threaded a matching `onSearchSubmit` through `PageHeaderConfig` (Layout) and `PageHeader`
- Dashboard (`DashboardView`): added a header search bar; pressing Enter navigates to `/contacts?q=<term>` (global contact search)
- `ContactsPage`: now seeds its search state from the `?q=` URL param via `useSearchParams`, so the Dashboard query arrives pre-filled
- Groups (`GroupsView`): added a header search bar that filters the groups grid by category name (with a "No matching groups" empty state); when a group is open, the search filters contacts within that group via `ContactList`'s `search` prop. Search resets when entering/leaving a group.

## 2026-07-08 — WhatsApp quick-link next to phone numbers

- Added `--ds-color-whatsapp` / `--ds-color-whatsapp-hover` brand tokens to `design-system.css`
- Added a `WhatsAppLink` helper in `ContactFormSections.tsx` that renders a WhatsApp brand icon linking to `https://wa.me/<digits>` (phone stripped to digits via `.replace(/\D/g, '')`, opens in a new tab)
- Rendered `WhatsAppLink` next to each phone in both view-mode phone displays (`PhoneSection` — used by the contact card/detail + expanded row + profile preview; and `ContactInfoSection` — used by the add-contact page)
- Added `.whatsapp-link` styling in `index.css` (uses the new WhatsApp token)

## 2026-07-08 — Fix: buttons rendering too small (dangling-comma CSS regression)

- Fixed an app-wide button regression in `frontend/src/index.css` "UNIFORM CONTROL HEIGHT" block introduced by commit `08d2dbb`
- Root cause: that commit removed the `.page-header-search { height: var(--ds-control-height); box-sizing: border-box; }` rule (which had terminated the large button/input selector list) and left only a comment. The list's trailing comma made it merge into the next rule (`.btn--icon, … { width: var(--ds-control-height); }`), so ~50 button/input selectors got `width: 32px` and lost their height entirely — squashing buttons so labels overflowed
- Fix: terminated the selector list with its own `{ height: var(--ds-control-height); box-sizing: border-box; }` block, restoring uniform 32px height + border-box and stopping the erroneous `width: 32px` leak (square-icon width rule now applies to only the four square buttons, as intended)
- CSS-only change; `npm run build` passes

## 2026-07-08 19:19 — Search now covers LinkedIn enrichment, email domains, and URLs

- **Problem:** Contact search (FTS5 via `contacts_unified_fts`) never indexed the `linkedin_enrichment` table, so enriched data (headline, about, job title, company, industry, location, skills, education, positions, certifications, languages, honors) was unsearchable. Emails were only matchable from the start of the address (domain not searchable), and only social-profile *usernames* were indexed — not URLs.
- `backend/src/services/database.ts` — `buildSearchableText`: added a `linkedin_enrichment` block that pushes the plain-text columns and flattens the JSON-array columns via a new `collectJsonStrings()` helper (recursively collects string values, tolerant of malformed JSON). Also: emails now additionally indexed split on `@`/`.` (so `gmail` matches `john@gmail.com`); social `profile_url` and `contact_urls.url` are now indexed (raw + punctuation-normalized copy). No schema/tokenizer change.
- `backend/src/services/apifyEnrichmentService.ts` — `processApifyResults` now calls `rebuildContactSearch(db, contactId)` after `storeEnrichmentData`, so newly enriched data is immediately searchable (covers both `enrichContacts` and `recoverFromDataset`).
- `backend/src/services/demoService.ts` — demo seeder now calls `rebuildAllContactSearch(db)` after seeding instead of hand-rolling a name/company/email-only FTS entry, so demo LinkedIn data is searchable too.
- `backend/src/scripts/reindexSearch.ts` (new) — one-time backfill that iterates every per-user DB under `USER_DATA_PATH` and rebuilds the search index. Run with `npx tsx src/scripts/reindexSearch.ts`. Ran it: reindexed users 3 (8058), 12 (3693), 11 (20), 4 (20).
- `backend/src/routes/__tests__/contacts.test.ts` — added tests for LinkedIn (headline/company/skill/position), email-domain, and URL-fragment search.
- Verified: backend `npm run build` clean; full suite 126/126 pass; against real reindexed data, LinkedIn field terms (BlackRock, Spotify, skills, positions), email domains, and existing name search all resolve to the correct contacts.

## 2026-07-08 21:23 — Tools page reorganized into grouped sections

- **`frontend/src/components/SettingsView.tsx`** — replaced the flat mix of a top nav-link list + standalone collapsible cards with four labeled groups, each wrapped in `<section className="settings-group">` with a `settings-group-title` heading:
  - **Import** — Import VCF (collapsible upload), LinkedIn Contacts (→ `/import`), Import from Google Contacts (→ `/google-contacts-import`)
  - **Sync** — Apple Contacts (iCloud connect/import), Google Contacts
  - **Tools** — Cleanup (→ `/cleanup`), Merge (→ `/merge`), Enrich (→ `/enrich`)
  - **Export** — Export Data
  - **Danger Zone** — kept standalone underneath the groups
- Relabeled the old "Import LinkedIn Connections" nav link to "LinkedIn Contacts" with the `linkedin` brand icon (was `download`).
- Dropped the redundant conditional "Import from iCloud" top nav link — that action is already reachable from the Apple Contacts sync card when connected.
- **`frontend/src/index.css`** — added `.settings-group` (flex column, `--ds-space-3` gap) and `.settings-group-title` (uppercase `--ds-font-xs` secondary-color label); bumped `.settings-content` inter-group gap from `--ds-space-6` to `--ds-space-8`.
- All existing inline logic (VCF upload/progress/results, iCloud connect/disconnect, export, delete-all confirm) preserved verbatim. `tsc --noEmit` and ESLint both clean.

## 2026-07-10 — Cleanup mode tabs: pills → standard underline tab bar
- **`frontend/src/components/CleanupModeSelector.tsx`** — the top-level Cleanup mode selector (Empty Contacts, Problematic Emails, Social Links, Invalid Links, Addresses) was rendered as fixed-height rounded pills, which clipped the longer labels. Swapped the `cleanup-mode-pill` class for `cleanup-mode-tab` and added `role="tablist"`/`role="tab"`/`aria-selected` for accessibility.
- **`frontend/src/index.css`** —
  - Removed `.cleanup-mode-pill` from the shared `--ds-control-height` (32px) fixed-height selector group (the root cause of the label clipping).
  - Replaced the `.cleanup-mode-pill` pill styles with a `.cleanup-mode-tab` underline tab bar: `.cleanup-mode-selector` now has a `border-bottom` divider and `overflow-x: auto`; tabs use vertical padding (no fixed height), `white-space: nowrap`, a 2px transparent bottom border that turns brand-colored + primary text when `.active`. Count badges restyled to a subtle neutral chip (brand-tinted when active).
- `tsc --noEmit` clean; no remaining references to `cleanup-mode-pill`.

## 2026-07-10 09:42 — Admin › Docs page: Tools reference with right-column TOC
- **`frontend/src/components/DocsView.tsx`** (new) — admin-only reference page documenting every tool in the Tools section, with a sticky right-column table of contents. Data-driven from a `TOOL_GROUPS` array (Import / Sync / Tools / Export / Danger Zone) so the TOC and sections stay in sync. Each tool documents **How it works** and categorized **Dependencies** (External APIs, Env vars, Packages, Data tables, Services), plus availability tags (Desktop only / Blocked in demo / Irreversible). TOC uses an `IntersectionObserver` to highlight the active section; clicks smooth-scroll and update the hash.
- **`frontend/src/styles/pages/docs.css`** (new) — two-column grid (`minmax(0,1fr) 200px`), sticky `.docs-toc` (`top` offset by `--ds-header-height`), token-only styling, `scroll-margin-top` on tool cards so anchors clear the fixed header. Collapses to a single column and hides the TOC under 900px.
- **`frontend/src/styles/pages.css`** — registered `@import './pages/docs.css'`.
- **`frontend/src/App.tsx`** — added `admin/docs` route → `DocsView` (inside the protected `Layout`).
- **`frontend/src/components/NavRail.tsx`** — added a gated **Docs** nav item (`book` icon, `/admin/docs`) next to Admin, both behind the existing `s@mombartz.com` guard; added an optional `end` prop to `NavRailItem` and set it on Admin so it only highlights on exact `/admin`.
- Verified: `tsc --noEmit` clean, `npm run build` succeeds, ESLint clean on changed files (pre-existing MapView warnings unrelated).

## 2026-07-10 10:05 — Docs page: break Enrich and Cleanup into subtools
- **`frontend/src/components/DocsView.tsx`** — added `subtools` support to the tool model (`SubTool` type; `ToolDoc.how` doubles as an intro when subtools are present). Extracted `DepsList` and `Tags` helper components. The TOC now renders a nested sublist per subtool, and the `IntersectionObserver` tracks tool-header ids plus every subtool section id.
  - **Enrich** split into its three real features: **LinkedIn Profile Data** (Apify actor + Recover-from-Dataset, `demo`-tagged), **Fetch Contact Photos** (Google otherContacts + Gravatar fallback), **Gmail Email History** (discover/sync into `contact_emails_history`). The `demo` tag moved from the whole tool onto the LinkedIn subtool (only it and recover are demo-blocked).
  - **Cleanup** split into its five detectors: Empty Contacts, Problematic Emails, Social Links, Invalid Links, Addresses (Addresses notes its Fix/Normalize/Duplicates/Geocode ops; `HERE_API_KEY` scoped to Geocoding only).
- **`frontend/src/styles/pages/docs.css`** — added `.docs-subtool*` blocks (nested cards on `--ds-bg-secondary`), `.docs-how--intro`, and `.docs-toc-sublist` / `.docs-toc-sublink` indented TOC entries.
- Verified: `tsc --noEmit` clean, ESLint clean on DocsView, `npm run build` succeeds.

## 2026-07-10 10:30 — Cleanup/Merge header padding + unified tab UX
- **`frontend/src/index.css`** — removed left/right padding on `.cleanup-header` and `.dedup-header` (`1rem 1.5rem` → `1rem 0`) so the tab-bar underline and header divider span the full width of the view.
- **`frontend/src/index.css`** — restyled the Merge mode selector (`.mode-selector`/`.mode-pill`) from rounded pills to the same underline tab-bar UX used in Cleanup (`.cleanup-mode-selector`/`.cleanup-mode-tab`): container bottom border + `overflow-x` scroll, transparent tabs with a 2px transparent bottom border that turns `--ds-color-primary` when active, and pill-style counts using `--ds-bg-tertiary`/`--ds-color-primary-light` tokens.
