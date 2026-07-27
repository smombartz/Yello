# Change Log

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
