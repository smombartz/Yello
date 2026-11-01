# Yello — Project Reference

Living reference for features, integrations, and architecture decisions. See `docs/log.md` for the change-by-change history and `docs/database.md` for the schema overview.

## Configuration

### Environment variables (frontend build)

| Variable | Purpose |
| --- | --- |
| `VITE_PUBLIC_URL` | Absolute public origin of the deployed app (e.g. `https://yello.example.com`, no trailing slash needed). Baked into the `og:image` / `twitter:image` meta tags at build time — the Open Graph spec requires absolute image URLs, and link scrapers (iMessage, Slack, Facebook, LinkedIn) ignore relative ones. When unset, the tags fall back to root-relative paths: fine for dev, but shared links won't render a preview image. |

Vite build-time variables must be present when `npm run build` runs. On Railway (Docker build), set `VITE_PUBLIC_URL` as a service variable — the `Dockerfile` declares it as an `ARG` in the frontend build stage so it reaches Vite. If the domain changes, update the variable and redeploy, then force a re-scrape in each platform's debugger (e.g. Facebook Sharing Debugger) since scrapers cache previews.

### Secrets and key rotation

| Variable | Purpose | Reissue at |
| --- | --- | --- |
| `SESSION_SECRET` | Signs the session cookie (`@fastify/cookie`). Changing it logs every web and desktop session out. | `openssl rand -hex 32` |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM key (scrypt-derived) for credentials stored at rest: Google access/refresh tokens in `auth.db` `users`, and each tenant's `user_settings.apify_api_token` / `icloud_app_password`. Falls back to `SESSION_SECRET` when unset, which is how older deployments worked. | `openssl rand -hex 32` |
| `TOKEN_ENCRYPTION_KEY_PREVIOUS` | Set **only during a rotation**: the value the stored credentials are currently encrypted with. | — |
| `GOOGLE_CLIENT_SECRET` | OAuth login and Gmail/Contacts token refresh. | Google Cloud Console → Credentials → OAuth client → Add secret, then disable the old one |
| `HERE_API_KEY` | Geocoding (billed). | HERE platform → API keys |

**Rotating the token key without forcing reconnects** (`services/tokenKeyRotation.ts`): when `TOKEN_ENCRYPTION_KEY_PREVIOUS` is set, the server re-encrypts every stored credential onto `TOKEN_ENCRYPTION_KEY` at boot, before it starts listening. Values the new key already opens are skipped, so it is safe on every restart. Values neither key opens are logged and left untouched, never cleared. Look for `Token key rotation: rotated N, already current M, failed F` in the deploy log, then delete `TOKEN_ENCRYPTION_KEY_PREVIOUS` and redeploy.

To rotate everything after a leak (as after Railway's October 2026 incident), use two deploys. This needs nobody to read the old secret, because Railway resolves same-service references (`${{ VAR }}`) at deploy time:
1. `TOKEN_ENCRYPTION_KEY` = new value, `TOKEN_ENCRYPTION_KEY_PREVIOUS` = `${{SESSION_SECRET}}` (or `${{TOKEN_ENCRYPTION_KEY}}`'s old value if it was already set). Check the log for `failed 0`.
2. `SESSION_SECRET` = another new value, `TOKEN_ENCRYPTION_KEY_PREVIOUS` = empty (an empty value disables the rotation; delete the variable in the dashboard when convenient).

If step 1 reports failures, blank `TOKEN_ENCRYPTION_KEY` to fall back to `SESSION_SECRET`; failed values are never modified. Then rotate the third-party keys at their providers (create new → update the variable → deploy → delete the old). The full runbook is in `docs/plans/2026-10-24-railway-incident-secret-rotation.md`.

## Desktop app (`electron/`)

The macOS app opens the hosted deployment (`https://yello.up.railway.app`, overridable with `YELLO_URL`) in a window. It loads `/`, and the web app sends a signed-out desktop window to `/login` rather than the landing page (see Landing page below). It has no local backend or database, so desktop and web share one account and one set of data. Full guide: `electron/README.md`.

**Sign-in handoff.** Google blocks OAuth inside embedded browsers, so the app sends the three Google flows (login, Gmail re-auth, Contacts re-auth) to the system browser:

1. The app intercepts the in-window navigation and opens `/api/auth/desktop/start?flow=…&challenge=…` in the browser. `challenge` is a PKCE S256 challenge.
2. The backend stores the challenge in a 10-minute `desktop_handoff` cookie and runs the normal flow.
3. At the end of every Google callback, `finishSignIn()` (`routes/auth.ts`) sees the cookie. Instead of starting a browser session, it mints a one-time, 2-minute code (`services/desktopHandoff.ts`, in memory) and returns a page that opens `yello://auth?code=…`.
4. The app loads `/api/auth/desktop/exchange?code=…&verifier=…`. The backend checks the verifier, burns the code, and sets `session_id` in the app's cookie jar.

Codes are deleted on first use, even when the verifier is wrong. A server restart only drops codes that are seconds old.

**Local features (`window.yelloDesktop`).** `electron/src/preload.ts` exposes one object per feature to pages on the app origin (`textBlast`, and `messageActivity` from the Top contacts work). Every IPC handler in the main process also checks `isAppUrl(event.senderFrame.url)`. Features that need the Mac (Messages, `chat.db`) run in the main process and call the backend through `session.defaultSession.fetch`, which sends the app's session cookie. See Text Blast below.

Up to 1.x the app spawned its own backend with local SQLite in `~/Library/Application Support/Yello/`. That mode is gone, and its files are left in place. See the migration note in `electron/README.md`.

## Design system

`DESIGN.md` (repo root) documents the visual system for anyone building new UI, people and AI agents alike. Its YAML frontmatter holds the normative tokens, and the body covers colors, type, layout, depth, shapes, components and do's/don'ts. `.impeccable/design.json` is a machine-read sidecar with tonal ramps, shadows, motion and drop-in component snippets. `PRODUCT.md` holds the product context (users, positioning, principles) that the design serves. The implementation lives in `frontend/src/styles/design-system.css` (`--ds-*` tokens).

**One violet.** The primary is **Signal Violet `#5F27E3`**, the violet of the logo, favicon and app icon (`--ds-color-primary`). Its hover is `#530bce` and its dark step `#4304ab`, both derived in OKLCH. The old UI violet `#7c3aed` survives only as the brand gradient's first stop.

**Conventions the CSS now follows** (aligned on 2026-10-04):

- Filled buttons are Signal Violet or Error only. Every in-app button has 6px corners and a medium-weight label.
- Selection is a 2px Signal Violet ring plus a violet avatar check.
- No text is smaller than 11px.
- Readable text is never `--ds-text-muted`. That color is for icons and zero states only.
- Every transition uses `--ds-duration-*` and `--ds-easing-*`. `--ds-duration-normal` (150ms) is the default.
- Page stylesheets must not redefine canonical classes like `.btn`. `pages.css` loads globally, so an override leaks app-wide.

**Style guide (`/styleguide`).** A live specimen book of the design system, linked in the nav rail for the admin account beside Admin and Docs.
- **It can't drift.** `lib/designTokens.ts` reads every `--ds-*` token from the loaded stylesheets at runtime, so a new token in `design-system.css` appears automatically. Anything no section claims falls into an "Other tokens" list.
- **Using it.** Click any specimen to copy its `var(--ds-…)`. The header search filters tokens by name or value. Text colors show their live WCAG contrast against `--ds-bg-primary`.
- **What it covers.** The `components/ui` primitives render live in every variant and state, with DESIGN.md's named rules and do's/don'ts beside them. Those rules are quoted in `StyleGuideView.tsx`, so when DESIGN.md's rules change, update them there too.
- **Access.** Admin-only. `AdminRoute` in `App.tsx` redirects anyone else to the dashboard, and `/admin` and `/admin/docs` use the same guard. Both the guard and the nav rail read `isAdmin()` from `lib/admin.ts`. It mirrors the backend's `ADMIN_EMAIL`, which is what actually protects the admin API.

**Primitives (`frontend/src/components/ui/`).** Build with these before writing new markup:

| Primitive | Use for | Notes |
| --- | --- | --- |
| `Button` | Every action button | `variant` (primary/secondary/danger/ghost/icon), `size` (`md`/`sm`/`lg`), `icon`, `loading`. `lg` (48px, 12px corners, 16px label) is for front doors only (the landing page uses it today); never use it inside the app shell. Links styled as buttons use `btn btn--{variant}`. |
| `Tabs` | Underline tab bars | Accessible tablist with Arrow/Home/End keys. Merge and Cleanup use it. |
| `Modal` | Every overlay | Escape, overlay click, `aria-modal`, focus in and focus return, `useLayoutModal`. Omit `onClose` for a blocking progress dialog. |
| `ConfirmDialog` | Yes/no confirmations | A `Modal` with secondary plus primary/danger actions. |
| `LoadingSpinner`, `EmptyState`, `Badge`, `SearchBar`, `Toast`, `FilePicker` | Their namesakes | |

## Features

### Legal pages (`/privacy`, `/terms`)

Public routes declared before the `*` catch-all, so they work signed in, signed out and in the desktop app. The shared layout `components/legal/LegalPage.tsx` uses the landing nav and footer around one reading column with an "On this page" list. Styles are in `styles/pages/legal.css`.

- **Placeholders:** the entity, contact email, governing law, notice periods and dates live in `components/legal/legalDetails.ts`. A value still in `[brackets]` renders highlighted (`<Fill>`).
- **Footer:** `components/landing/LandingFooter.tsx` is shared by the landing page and the legal pages, and carries the Privacy and Terms links. The login page links both under the sign-in button.
- **Review notes:** `docs/legal-review.md` lists the open placeholders, the blockers to fix before publishing, and the code source for every factual claim. **When a data practice changes (a new provider, OAuth scope, cookie or retention rule), update the policy and that table in the same change.**

### Landing page (`/`)

`/` is the public front door. Signed-out visitors see the landing page (`components/LandingPage.tsx`, vignettes in `components/landing/`, styles in `styles/pages/landing.css`).

**Routing (`LandingRoute` in `App.tsx`):**
- Signed-in users go to `/dashboard`.
- The desktop app goes to `/login`. It is detected by Electron's default `Electron/…` user agent, which the app doesn't override.
- While the auth check is in flight the route renders nothing, not a spinner.
- The catch-all route and `/login` are unchanged.

**Actions:**
- The primary is **Sign in with Google** (`useAuth().login`). It also works in the desktop app, because the app intercepts `/api/auth/google`.
- **Try the demo** calls `startDemo()`, the same as the login page. The route redirects once the session lands.

**Every picture on the page is real Yello UI.** It is built from the demo book's 20 invented people, copied from `demoService.ts` into `components/landing/sampleBook.ts`.
- **Hero:** a small working copy of the app (`SampleBookFrame.tsx`, views in `SampleViews.tsx`):
  - **Rail:** switches Dashboard, Contacts, Map, Groups and Tools. It is the app's icons with hover labels, and becomes a bottom tab bar on phones.
  - **Contacts:** rows expand in place into the app's real `ContactCardView` (with `LinkedInSection` for enriched people), so copy-on-click works. Every link inside an expanded card (call, text, WhatsApp, email, maps) is blocked with a toast, because some demo domains may be real businesses.
  - **Dashboard:** stat cards, upcoming birthdays and top cities. Each item opens a person or a city search.
  - **Map:** the map with clickable pins and clusters that list their people.
  - **Groups:** the three demo groups (vCard categories), each opening its members.
  - **Tools:** the Tools sections in the app's own words, each offering sign-in.
  - **Scrolling:** the body scrolls only after the visitor clicks or tabs into the frame. It lets go on mouse leave, on blur, or when the hero leaves the viewport, so page scrolling is never trapped.
- **Merge:** a duplicate pair that folds into one record when the tile scrolls into view. This is the page's one authored motion, and it doesn't auto-play under reduced motion.
- **Sources:** the import list.
- **Birthdays:** upcoming birthdays, computed from today's date.
- **Map:** the sample book pinned and clustered on a static map.
- **Public card:** per-field visibility switches.
- **Export:** a vCard 3.0 excerpt.
- **Maker's note:** a first-person note signed "Sascha". It is a draft, waiting for the owner's edit.

**Content rules:**
- Claims are limited to what `PRODUCT.md` records. The one number is the 12,116-card lossless round trip.
- Avatars are initials only, because the demo photos have no recorded licence.
- Never put real contacts from `docs/` on this page.

**Map asset.** `assets/landing/us-map.webp` is a static OpenStreetMap snapshot, not live tiles.
- It is stitched from zoom-5 tiles, cropped to the continental US, grayscaled and lightened.
- Its provenance is in `us-map.webp.json`, and the "© OpenStreetMap contributors" credit sits on the map.
- Pins are projected at runtime with Web Mercator using the crop constants in `Vignettes.tsx` (`MAP`). If you regenerate the image, update those constants.

**Display type.** The page uses front-door display sizes beyond the app's 30px ceiling. They are defined as `--lp-*` custom properties on `.landing` and are not global tokens.

### Dashboard stat cards

`DashboardView.tsx` opens with four stat cards, each a link (data: `overview` from
`GET /api/stats/dashboard`, `getOverviewStats` in `routes/stats.ts`):

- **Total Contacts** → `/contacts`.
- **Countries**, with the distinct city count as a secondary line (`.stat-detail`) → `/map`.
  Cities used to be a card of their own.
- **With Photos** → `/contacts?filter=has-photo`, the list's existing Photo filter. The card
  counts `photo_hash IS NOT NULL AND archived_at IS NULL`, the same rule as the filter, so the
  list total matches the card (`__tests__/dashboardPhotoCount.test.ts`).
- **With Birthdays** → `/dashboard/birthdays`.

### Dashboard birthdays and the Birthdays page (`/dashboard/birthdays`)

- The dashboard's **Upcoming Birthdays** card lists only birthdays from today through 14 days ahead
  (`UPCOMING_BIRTHDAY_DAYS` in `routes/stats.ts`). A **See all birthdays** link under it, and the
  **With Birthdays** stat card, open the Birthdays page.
- The Birthdays page (`BirthdaysView.tsx`) lists every birthday, soonest first, in one card per
  month of the next occurrence (current month first, later years labelled with the year). The
  header search filters by name.
- Both the dashboard card and the page use `ContactTileGrid.tsx` (see *Contact tiles* below), with
  days-until and the date/age (`birthdayTile()` in `utils/birthdays.ts`) as the tooltip.
- Data: `GET /api/stats/dashboard` and `GET /api/stats/birthdays` both take `?today=YYYY-MM-DD`,
  the browser's local date, so "today" follows the user's calendar rather than the server's UTC
  clock. Days are counted on calendar dates, so a birthday today is `daysUntil: 0` ("Today!").
- On the dashboard card, today's birthdays (`daysUntil === 0`) get a violet outline with a small
  **Today** label on its top edge (`ContactTile.badge`). The Birthdays page doesn't use it.
- Birthday parsing (`parseBirthdayMonthDay`) accepts `--MM-DD`, `YYYY-MM-DD`, `YYYYMMDD`, `MM-DD`
  and Apple's `1604-MM-DD`; the frontend (`utils/birthdays.ts`) treats 1604 as "no year" when
  showing the age. Feb 29 birthdays fall on Mar 1 in non-leap years.

### Dashboard Recent card and the Recent changes page (`/dashboard/recent`)

- The dashboard's **Recent** card (formerly *Recently Added*) shows up to 12 active contacts added,
  imported, synced or edited in the last 7 days, newest first, one tile per contact (its latest
  change). **See all recent changes** opens the page.
- The Recent changes page (`RecentView.tsx`) covers the last 30 days with one card per kind:
  **Added**, **Imported**, **Synced**, **Updated**, **Archived**. Tabs filter by kind (with
  counts); the header search filters by name. A contact can show under two kinds (imported, then
  edited). Each kind shows its 300 newest, with a "Showing N of M" note past that.
- Where a contact came from is `contacts.created_via`, set by every insert path (`manual`,
  `profile`, `demo`, `vcf_import`, `icloud_import`, `google_import`, `linkedin_import`,
  `icloud_sync`, `google_sync`; type `ContactOrigin` in `contactPersistence.ts`). Contacts created
  before the column existed have NULL and count as *Added*. **A new way of creating contacts must
  set it.**
- Rules (`getRecentChanges` / `getDashboardRecent` in `routes/stats.ts`): creation in the window →
  added/imported/synced from `created_via`; `updated_at` in the window and more than 5 minutes
  after creation, contact not archived → updated (the grace keeps an import's own follow-up
  writes, like photos, from reading as edits); `archived_at` in the window → archived.
  `updated_at` is best effort: not every writer bumps it.
- Data: `GET /api/stats/recent?days=30` (1–365) → `{ days, counts, changes }`; the dashboard
  response carries `recent` and `recentTotal`. Window comparisons use `julianday()` on both sides,
  and timestamps go out as ISO UTC with `Z`.
- **Timestamps in the browser:** SQLite's `CURRENT_TIMESTAMP` is UTC with no zone
  (`YYYY-MM-DD HH:MM:SS`), which `new Date()` reads as *local* time. That put fresh contacts in the
  future west of UTC and showed "-1 days ago". Parse server times with `parseServerTime()` and
  format with `formatRelativeDay()` (`utils/relativeTime.ts`: "Today, 3:14 PM", "Yesterday", "3
  days ago", then a date; never negative).

### Contact tiles (`ContactTileGrid.tsx`)

The reusable photo-and-name tile grid used by the Birthdays and Recent cards and pages. Each tile
(`ContactTile`) links to the contact and supplies a two-line tooltip (`tipTitle`, `tipText`) shown
on hover or keyboard focus. The tooltip is portalled to `<body>` with fixed positioning so cards
never clip it, flips below a tile near the top of the window, and hides on scroll; the tile's
`aria-label` carries the same text. Touch devices have no hover, so a tap simply opens the contact.
An optional `badge` outlines the tile (`.has-badge`, an inset shadow so it takes no space) and
centres the label on the outline's top edge (`.contact-tile-badge`); it is `aria-hidden`, since the
`aria-label` already says the same.
Styles: `.contact-tile-grid`, `.contact-tile*`, `.contact-tile-tip*` in `styles/pages/dashboard.css`.

### Shareable URLs for views and expanded contacts

Copying the address bar reproduces what you're looking at, not only which view you're in. The URL holds the state: pages read it from `useParams` / `useSearchParams` rather than `useState`, so nothing has to keep the two in sync.

| View | URL |
|---|---|
| Contacts list | `/contacts?q=smith&sort=newest&filter=no-email,has-photo&view=grid` |
| Expanded contact | adds `contact=<id>` to whichever list it's in |
| Group | `/groups/<encoded category>`, plus `?q=` and `&contact=<id>` |
| Contact detail | `/contacts/<id>` |

Defaults are omitted (`sort=name-asc`, `view=list`, no filters).

- **History:** opening a group adds a history entry, so Back returns to the groups grid. Searching, sorting, filtering, toggling list/grid and expanding or collapsing a row replace the current entry.
- **Opening a link with `?contact=`:** `ContactList` resolves it once, when the first results arrive. If the contact is in the list, it expands and is scrolled into view. If not, the app opens `/contacts/<id>`, replacing the history entry. The list loads only the first 100 matches, so this happens for contacts further down or filtered out. Changing search, sort, filter or view while a row is open clears `contact` instead of redirecting.
- **Copy link** in the expanded card copies `window.location.href`. On the detail page, the same component copies `/contacts/<id>`. The desktop app has no address bar, but it loads the Railway URL, so the copied link also opens in a browser.
- **Updating params:** `useSearchParamUpdater` (`frontend/src/hooks/`) applies several changes in a single `setSearchParams` call, replacing the history entry by default. React Router v7's setter has no update queue: two calls in the same tick overwrite each other.

No server change was needed. The Fastify SPA fallback already serves `index.html` for any non-API path, so a deep link survives a reload.

### Contact detail: copy on click, reach-out icons

In the contact card view (contact detail page, expanded list row, Profile page), clicking a phone number or email **copies it to the clipboard** and shows a short toast. It no longer opens the dialer or mail app. The reach-out links sit as icons beside each value:

- **Phone:** text (`sms:`), call (`tel:`) and WhatsApp (`https://wa.me/<digits>`). `sms:` and `tel:` use the number with everything but digits and `+` stripped, since manually edited numbers aren't normalized to E.164.
- **Email:** send email (`mailto:`).

The components are `CopyableValue`, `PhoneActions` and `EmailActions` in `frontend/src/components/ContactFormSections.tsx`; the icons render through `InfoField`'s `actions` slot, beside the value, so long values truncate without hiding them. The desktop app hands `sms:` and `mailto:` to the OS default app (`EXTERNAL_PROTOCOLS` in `electron/src/main.ts`). On macOS it opens `tel:` in FaceTime explicitly, so the call rings out through the iPhone whatever app has claimed `tel:`. In a browser, `tel:` goes to the Mac's default handler; if that isn't FaceTime (Chrome claims it on some Macs), set FaceTime → Settings → General → Default for calls. The public card (`/p/:slug`) keeps tap-to-call/email links.

### Contact forms: always-open fields, social URL detection

On **New Contact** (`AddContactPage`) and in the three-column contact edit view (`ContactCardView`), every list section (phone, email, address, social, categories, instant messages, web links, related people) ends in an empty row ready to type into. There are no "Add …" buttons. Filling in any field of the last row adds a fresh blank row beneath it. On New Contact, each entry's fields share one line and wrap when the screen is narrow; the address uses two lines (Street · City · State, then Postal Code · Country · Type). The edit view's columns are narrow, so its fields stay stacked.

- **How it works:** in edit mode every list section runs through `autoRows()` in `ContactFormSections.tsx`. It adds the blank row only when rendering. On every change it trims trailing blank rows, so blank rows never reach form state, and clearing the last entry turns it back into the blank row. The blank row can't be dragged or removed. The flat row layout CSS is scoped to `.add-contact-content`.
- **Social URL detection:** pasting or typing a profile URL fills **Platform** and **Username** (`detectSocialProfile` in `utils/contactFormatters.ts`), so `https://www.instagram.com/tinymapsforbigliving/` gives `instagram` / `tinymapsforbigliving`. Platform keys are the lowercase ones the backend uses (`linkedin`, `facebook`, `twitter` for both twitter.com and x.com, `instagram`, `youtube`, `tiktok`, `pinterest`, `snapchat`, `reddit`, `github`, `threads`), so the "Has Instagram" filter matches. Detection compares the hostname exactly, so `dropbox.com` doesn't count as `x.com`. Platform and Username only change while they are empty or still hold what the previous URL implied: a value you typed yourself is kept, and an unrecognised or cleared URL changes neither. This applies in the contact edit view too, where Profile URL is now the first field.
### Saving a contact never silently drops data

New Contact and the contact edit form build their save payload with `buildContactLists` (`frontend/src/utils/contactPayload.ts`). This matters most when editing: the update route deletes each list and re-inserts it from the payload, so a row left out of the payload is deleted from the database.

- **A fully empty row** (every field blank or whitespace) is skipped. It holds no data.
- **A row with some data but no main value** blocks the save. Examples: an email type with no address, an address with only a type, an instant message without a handle or a service, a web link label with no URL, a relationship with no name. An error box lists each one by the value it does have, for example `Email “work” has no email address.`, under "Nothing was saved". Once shown, the list re-checks as you type and disappears when everything is fixed. On New Contact the box also scrolls into view, since Save is in the header.
- **Social links:** a profile URL alone is enough. If Platform or Username is empty, `socialProfileFromUrl` fills it at save time, following VCF import's rule: a recognised platform, otherwise the host (`bsky.app`); the username from the URL, otherwise its last path segment, otherwise the host. Without a URL, a social link needs both a platform and a username.
- Server errors appear in the same box (`SaveErrors` in `ContactFormSections.tsx`).

### Contact row columns: full email and phone, aligned

List rows show the whole primary email and phone, and every row's email and phone start at the same x.

- Each collapsed row (`.contact-card .collapsed-content`) is a CSS grid with the same tracks on every row: name/role `minmax(0, 1fr)`, email, phone, action strip. `.contact-details` is `display: contents`, so its two cells sit on the row's grid.
- The email and phone tracks are as wide as the widest value in the loaded list. `ContactList` renders an off-screen copy of every loaded email and phone cell (`.contact-column-sizer`, using the row's own `ContactEmailDetail` / `ContactPhoneDetail`), measures each column with a `ResizeObserver` (rounded up, re-run when the contacts or the web font change) and sets `--contact-email-col` / `--contact-phone-col` on `.contact-list`. Measuring the full list rather than the rendered rows keeps the columns steady while the virtualizer scrolls.
- When space is short, the role/company line is what ellipsizes. The email track is capped at 40% of the row, so only an unusually long email truncates.
- At ≤1024px windows (content column under 880px) email stacks over phone in one column; at ≤640px the details and action strip drop out as before. The row stays 74px tall in every layout.

### Contact list count

The list's sticky toolbar shows how many contacts the view lists, pinned right ahead of Select Page: "1,284 contacts", or "12 results" while searching. It is `total` from `GET /api/contacts`, counted with the same WHERE clause as the page (search, filters, group), so it is the full match count, not the 100 loaded rows; when more match than are loaded, its tooltip says "Showing the first 100". It lives in `ContactList`, so a group's list (`/groups/:category`) shows it too. It replaced the Contacts page's header count. On phones it shows only when the toolbar does (filter chips active); an empty result shows the "No matches" state instead.

### Person, company or generic (filter, toggle, avatar)

Every contact is a person, a company, or generic: neither a person nor a company (Front Desk, Support line, Taxi, Mom's office, noreply@). The contacts filter has a **Type** control (All · People · Companies · Generic) that writes `is-person` / `is-company` / `is-generic` into `?filter=`; its chips read "People" / "Companies" / "Generic". `/contacts?filter=is-company` links straight to companies.

- **Two columns:** `contacts.is_company` is Apple's "Show as Company" (`X-ABShowAs:COMPANY`), synced with iCloud. `contacts.kind` is what the user picked in Yello (`person` / `company` / `generic`, `NULL` until picked).
- **Effective kind:** one SQL snippet, `EFFECTIVE_KIND_SQL` in `backend/src/services/contactKind.ts`, used by the list filter, the list rows' `kind` and the detail's `kind` (`withVcardFields`). Flagged → company; else a picked person/generic; else unpicked with a company name and no first or last name → company (auto-detected); else person.
- **Picking:** the Person | Company | Generic toggle (`ContactKindToggle`, under the name fields in edit and Add Contact) sends `kind` only when the user picks one; `PUT` still takes the older `isCompany` boolean. All writes go through `setContactKind` / `kindColumns`: Company sets `is_company = 1`, Person and Generic set `0`.
- **Sync:** auto-detection never writes `is_company`, so only a picked Company reaches iCloud as Show as Company. Generic is Yello-only and syncs as a normal card. Turning Show as Company on or off in Apple sets `kind` to `company` / `person` on the next pull (`replaceContactFields`, the `isCompany` family). Google has no such flag and neither reads nor writes it.
- **Name:** saving a contact with no first or last name names it after its company (`PUT /api/contacts/:id`), as import and Add Contact already did.
- **Avatar:** with no photo (or a broken one), companies show a building and generic contacts a card (`address-card`) instead of initials (`Avatar` `kind`).

### Cleanup: Company or Generic

Tools → Cleanup → **Company or Generic** suggests contacts to mark as a company or generic (`ContactKindCleanup.tsx`, `routes/contactKindCleanup.ts` at `/api/cleanup/contact-kind`).

- **Candidates:** active contacts with no picked `kind` that aren't already flagged (`is_company = 0`). Suggestions are computed on each request in memory: no table, nothing cached.
- **Rules** (`services/contactKindSuggestions.ts`, `suggestKind`): keyword rules, first match wins. Each suggestion carries a confidence (strong / likely) and up to 3 readable reasons.
  - **Text searched:** only the name (first + last, or the display name when there is no person name), never the company field. "Ada Lovelace" at "Acme Inc" is a person.
  - **Rules, in order:**
    1. legal forms (Inc, LLC, GmbH, …; short ones such as AG and SA only as the last word, in capitals) → company
    2. role words (Front Desk, Support, Hotline, Taxi, …) and possessive places ("Mom's work") → generic
    3. business words (Restaurant, Studio, Clinic, …) → likely company
    4. trades (Plumber, Locksmith, …) → likely generic
    5. on nameless contacts, role emails: `noreply@`/`support@` → generic, `info@`/`hello@` → likely company
    6. a company name with no person name → company. These count as companies already through auto-detection; accepting confirms it and sends Show as Company to iCloud.
- **Sub-tabs:** All · Company · Generic, with counts from `GET /summary`. The list is `GET /suggestions?kind=&limit=&offset=`, strong suggestions first, then by name.
- **Row actions:** the suggested kind (primary), the other kind, Person, and Skip. Applying calls `POST /apply` with `{items: [{id, kind}]}`.
- **Skip** hides the row until the page reloads; it isn't saved, so the contact is suggested again later. Marking it Person removes it for good.
- **Mark all as suggested** calls `POST /apply-all` with `{kind?, excludeIds}`. The server recomputes the suggestions and applies each one's suggested kind, leaving out the skipped rows.
- **Sync:** everything is under `/api/cleanup`, which is in `EDITING_PREFIXES`, so applying triggers a sync.

### Contact row menu (⋮)

The three-dot button at the end of each list row opens a menu that works without expanding the card first:

- **Open contact page** is a link to `/contacts/<id>`, so Cmd/Ctrl-click opens it in a new tab.
- **Edit** expands the row if needed and opens the edit form. `ContactRow` bumps an `editRequest` counter that `ContactRowExpanded` picks up during render. The counter resets when the row collapses, so expanding it again later shows view mode.
- **Copy link** copies the current list URL with `contact=<id>` set. That's the same link the expanded card's Copy link gives (see *Shareable URLs* above).
- **Archive** archives the contact right away. The toast has an **Undo** that unarchives it. Archive is reversible, so there's no confirm dialog. Bulk Archive still asks for confirmation. If the row was expanded, `contact` is cleared from the URL.

The menu is the generic `ActionMenu` (`frontend/src/components/ui/ActionMenu.tsx`). It's portaled to `<body>` with fixed positioning, because `.contact-card` is `overflow: hidden` and each virtual row is transformed, which would clip it or stack it under the next row. React click events still bubble through the portal to the card, so both the trigger and the menu stop propagation. It supports arrow keys, Home and End. It closes on outside click, Escape (captured so Layout doesn't navigate away), Tab, scroll and resize. Below 640px the row's action icons are hidden, menu included.

### Archived contacts: the Archived group

Archived contacts (`archived_at` set) show **only** in the Archived view (`/archived`). The contact list,
its search and category filter, Select All (`/api/contacts/ids`), `/api/contacts/count`, the group counts
(`/api/contacts/groups`, which also drops groups whose contacts are all archived) and the map all filter
`archived_at IS NULL`. Before 2026-10-26 the list, its search, groups and the map did not, so archived
contacts kept showing up there.

The Groups page shows a built-in **Archived** card (when there are archived contacts) that opens the
Archived view, which keeps Restore, Delete permanently and Export. It is not a category: a real
`Archived` category would sync to iCloud/Google as a group label and could clash with a user's own
category of that name. The Archived view is desktop-only (bulk selection), so phones don't get the card.
Archive, unarchive and delete invalidate the `groups` and `map` queries as well as `contacts`.

### Adding a contact to a group from the group view

An open group (`/groups/<category>`) has a **search-or-add** field above its list
(`AddToGroupField.tsx`). What's typed is the group's search: it sets `?q=`, which filters the group's
list. At the same time its dropdown suggests contacts to add, from
`GET /api/contacts/search?q=…&notInCategory=<category>`, so current members and archived contacts aren't
suggested. Because typing is a search, Enter adds only a highlighted suggestion (arrow keys), never the
first match on its own. Inside a group the header search is the universal contact search, as on the
Dashboard: Enter opens `/contacts?q=…`. The field stacks just above the list's sticky toolbar
(`--ds-z-sticky`), or the toolbar covers its dropdown.

Picking a suggestion calls `POST /api/contacts/:id/categories` with `{ category }`. That route
adds the one category without resending the contact's others, is a no-op (`added: false`) if the contact
already has it, bumps `updated_at`, and 404s for archived or missing contacts. It's under `/api/contacts`,
so it triggers a sync. Sync spots the change through the projection hash (categories are projected for
iCloud; Google holds no labels in the projection). The field clears (so the list shows the whole group
again) and keeps focus for the next add.

### Edit mode: pinned Save/Cancel, Delete at the bottom

- The edit form's top row (name fields + Cancel/Save) is `position: sticky` under the page header, and
  under the contact list's sticky toolbar on desktop. `ContactList` measures that toolbar with a
  `ResizeObserver` and passes `--contact-list-toolbar-height`. Below 640px the name fields stack, so the
  row is `display: contents` and only the buttons stick, moved above the fields.
- Sticky needs the window to be the scroll container: the expanded card uses `overflow: clip` instead of
  `hidden`, and the detail page's `.page-content` (`.contact-detail-page`) is `overflow-y: visible`.
- **Delete contact** shows only in edit mode, at the bottom of the card, behind a confirm. The dialog names
  the synced address books it will also delete from (from `/api/sync/status`). It is portaled to `<body>`,
  since the list row is transformed and clipped. It uses `DELETE /api/cleanup/delete` (a real
  `DELETE FROM contacts`, so `contacts_bd_sync` tombstones the remote cards, and `/api/cleanup` is in
  `EDITING_PREFIXES`). Afterwards the list row collapses, and the detail page goes back to Contacts.

### Nameless cards and the Cleanup "Empty Contacts" lists

- A vCard with no name (empty `FN` and `N`) used to be rejected ("Unreadable card: Missing required FN
  or N field"), which left it out of Yello and raised a problem on every iCloud sync. `parseSingleVcard`
  now gives it a stand-in name via `placeholderName()` (company → primary email → primary phone →
  `No Name`) and sets `namePlaceholder`. Google's `personToContactData` does the same. The stand-in is
  stored in `contacts.placeholder_name` on insert, and refreshed when a sync rewrites the name family
  (`replaceContactFields`). Parsing is deterministic, so the iCloud projection matches and no push is
  triggered by the stand-in alone.
- Cleanup → Empty Contacts has three non-overlapping lists (`cleanupService.ts`, `EMPTY_TYPE_WHERE`):
  **Truly Empty** (no real name, no data), **No Name** (no real name, has data), **Name Only** (a name and
  nothing else). "No real name" = empty `display_name`, or no first/last name and a `display_name`
  that is only a stand-in: `placeholder_name`, `No Name` / `Unknown`, one of the contact's emails or
  the part before its `@`, or a phone number (nothing but digits and phone punctuation). The stand-ins
  other than `placeholder_name` matter because most nameless contacts predate that column (or arrive
  with the stand-in already in `FN`), so `placeholder_name` is NULL on them: matching on it alone left
  No Name with 0 of the 77 nameless contacts in the local copy of user 12. Company cards
  (`display_name` = `company`) are named and stay out. "No data" = blank `company`, `title`, `department`, `notes`, `birthday`, `gender`,
  `photo_hash`, and no rows in emails, phones, addresses, social profiles, IMs, URLs, related people,
  dates, photos or LinkedIn enrichment (archived rows count as data). Group membership and nickname
  don't count.
- The lists are tabs (`CleanupFilters.tsx` renders the shared `<Tabs>`), one list at a time; Problematic
  Emails' Many Domains / Same Domain work the same way. Switching tabs clears the selection, so a bulk
  archive or delete only ever touches contacts in the visible list.

### VCF import (background job)

Importing a `.vcf` is a **staged, chunked background job**, not an inline request. This matters because a photo-heavy export (iPhone/iCloud) is routinely tens of megabytes and takes minutes to process.

- `POST /api/import` streams the upload to `/data/users/<userId>/imports/<jobId>.vcf`, inserts an `import_jobs` row, starts the worker **without awaiting it**, and returns `202 { jobId }`. The browser then polls `GET /api/import/jobs/:id`; `GET /api/import/jobs/active` lets the UI reconnect to a running import after a reload or navigation.
- The worker (`runVcfImportJob`) streams **one vCard block at a time** via `readline` and commits in batches of 50 inside a single `db.transaction()`, yielding the event loop between batches. Peak memory is one batch, independent of file size.
- Photo processing sits **between two transactions per batch**: `processPhoto` is async (sharp) and hashes on the contact id, so it can neither run inside a synchronous better-sqlite3 transaction nor before the insert that assigns the id. Transaction A inserts contacts and child rows, photos are processed, transaction B attaches the hashes.
- **Re-imports are safe.** A card whose vCard `UID` matches an existing `contacts.icloud_uid` is skipped and counted separately; new contacts get their UID stamped. Cards without a UID still insert unconditionally — full match/merge (as iCloud/Google import does via `matchIncomingContacts`) remains a follow-up.
- **Restart-safe.** `cards_processed` is written only after a batch commits, making it an exact resume offset. `resumeInterruptedImports` runs at boot, walks `USER_DATA_PATH` (there is no cross-user index — each tenant is a separate SQLite file), and re-enqueues any `running` job whose staged file survives. The staged file is deleted on success and kept on failure for debugging.
- One import at a time per user; a concurrent upload gets a 409.
- **Per-address `GEO` is preserved**, closing the round trip with the exporter below. Coordinates are matched to their address by item group (`item1.ADR` ↔ `item1.GEO`) since vCard 3.0's bare `GEO` is card-level; a card-level `GEO` is only applied when the card has exactly one address. `0;0` and out-of-range values are rejected as failed-geocode sentinels. Imported coordinates stamp `geocoded_at` so the address-cleanup queue does not re-geocode them through the paid HERE API. iCloud import shares the parser and benefits too; the Google People API exposes no coordinates.

#### Last import summary

`GET /api/import/jobs/latest` returns the most recent `completed`/`failed` job, independent of the tracked-job lifecycle that drives the status indicator. The Tools → Import VCF section renders it as a persistent "Last import" block (imported / already present / photos / geotagged / failed, plus filename, time and size), so results survive dismissing the pill, navigation, and new sessions. The upload form is always available above it — there is no form-vs-result mode switch.

Historical note: this replaced a synchronous path guarded by a 2-minute `Promise.race`. That race returned **408 while the import kept running**, so large files reported failure, kept writing contacts, and duplicated them on retry (the path had no dedupe at all).

#### Status indicator

`ImportStatusProvider` (wrapped around the app in `App.tsx`) owns import tracking, and `BackgroundJobPill` renders it as a fixed bottom-left indicator mounted once in `Layout`. Consequences worth knowing:

- **Tracking is app-wide, not page-scoped.** `SettingsView` and `OnboardingView` both read the same job from the provider rather than polling their own copies, so the inline panel and the pill cannot disagree.
- **The tracked id is derived, not synced** — `trackedJobId ?? activeJob.id`, minus any dismissed id. That means an import started in another tab (or before a reload) is adopted automatically via `GET /api/import/jobs/active`. Deriving also satisfies the React Compiler lint rule that rejects synchronous `setState` inside effects.
- **Terminal jobs persist until dismissed.** `forgetImportJobId()` runs on `dismiss()`, not on completion — otherwise an import that finished while the user was elsewhere would leave no trace.
- **`z-index: 400`** puts the pill above the header/nav rail (300) and below the modal overlay (500), so modals cover it without it having to track modal state — several modals here never report theirs.
- The pill takes a **generic `BackgroundJobSummary`**, so LinkedIn CSV / Google Contacts / enrichment can feed it once they migrate off SSE. Today they stream over SSE and die on unmount, so they cannot.

### VCF export (`GET /api/contacts/export/vcf`)

Exports all non-archived contacts as vCard 3.0. **Every card is generated from the database** by `exportContactsAsVcf()` (`backend/src/services/vcardExportService.ts`), which loads each contact and hands it to `generateVcard()` (`backend/src/services/vcardGenerator.ts`). `?regenerate=true` is still accepted but no longer changes anything. `GET /api/archive/export` uses the same function with `{ archived: true }` (it used to replay `raw_vcard`, and skipped archived contacts that had none).

Historical note: until 2026-09-27 the default mode replayed each contact's stored `raw_vcard` and only injected the photo and GEO. `raw_vcard` is written once at import and never updated, so **everything edited, merged, enriched or cleaned up after the original import was missing from the file** — on a database of 8054 contacts that was 3019 notes, 3287 categories, 8624 social profiles and all LinkedIn enrichment.

**What comes from where**

| Source | Properties |
| --- | --- |
| Typed columns | `FN`, full `N`, `NICKNAME`, `ORG` (+ department), `X-ABShowAs`, `X-GENDER`, `TITLE`, `EMAIL`/`TEL` (all `TYPE`s, + `X-ABLabel`), `ADR` + `LABEL` + `GEO` + `X-ABLabel` + `X-ABADR` + `X-APPLE-SUB*`, `URL` (+ `X-ABLabel`), `IMPP`, `BDAY`, `X-ABDATE` (+ label), `NOTE`, `CATEGORIES`, `X-SOCIALPROFILE`, `X-ABRELATEDNAMES`, `UID`, `PHOTO`, `X-YELLO-LINKEDIN` |
| `contact_vcard_properties` | Every other property of the imported card, as written: `PRODID`, `REV`, `X-CREATED`, `X-IMAGEHASH`, `X-ADDRESSING-GRAMMAR`, … |

**The database holds every imported vCard property** — including parameters no column holds (`X-APPLE-OMIT-YEAR`, `TYPE=pref` on a URL, …), stored as JSON `params` on the row. The stored copy of each original card (`contacts.raw_vcard`) was retired on 2026-09-27: the originals were archived to `/data/users/<id>/archive/original-cards-<date>.vcf.gz` and the column dropped. See *vCard coverage* and *raw_vcard retirement* in `docs/database.md`.

Rules worth knowing:

- **Item groups are renumbered.** Each labelled email/phone/address/URL/date gets its own `itemN` group; generic grouped properties keep sharing a group with each other but are renamed past the generator's groups, so nothing collides.
- **`pref` is never written as a `TYPE`**; the primary entry gets `PREF=1`.
- **Rows with no value are skipped** — a `contact_phones` row with an empty number writes no `TEL` line.

**LinkedIn enrichment (`X-YELLO-LINKEDIN`).** vCard has no equivalent for the `linkedin_enrichment` row, so its non-null columns travel as gzip-compressed JSON, base64-encoded, in one private property. Other contact apps ignore it; this app's importer restores the row. Compression matters: uncompressed, the enrichment of ~3000 contacts would push a full export past the 100 MB upload limit. On import the column list in `linkedinEnrichmentColumns.ts` — not the payload — decides which columns are written, and the row is always attached to the newly created contact.

**Known limits of a round trip**

- `contact_related_people.related_contact_id`, `contact_emails_history`, non-primary `contact_photos`, archived contacts and timestamps are not exported.
- Phone numbers are re-normalised by `libphonenumber-js` on import, so a malformed stored number can come back in a different form.
- Import still skips a card whose `UID` already exists rather than updating it, so a corrected export only takes effect in an account that does not hold those contacts yet.

**Geocode data:** addresses geocoded by the address-cleanup feature (`contact_addresses.latitude/longitude`) export as per-address `GEO` properties tied to their `ADR` via Apple-style item groups (`item1.ADR` + `item1.GEO:lat;lon`) — vCard 3.0's plain `GEO` is card-level, so grouping is what keeps it per-address. `injectGeoIntoVcard()` remains in `vcardGenerator.ts` from the raw-replay export but has no caller now.

**Verified lossless on real data (2026-09-27):** importing the 12,116-card `docs/contacts.vcf`, exporting, and re-parsing gives the same value for every modeled field and every generic property on every card. The only difference is intentional: a social profile imported without a username gets one derived from its URL.

### Export selected contacts or a group (`POST /api/contacts/export`)

Body `{ format: 'vcf' | 'csv', ids?: number[], group?: string }`, exactly one of `ids` / `group`
(400 otherwise, 404 when nothing matches). `group` exports the group's **active** contacts, the same
set its card counts; `ids` exports those contacts as given. Rows come sorted by display name.

- **Why POST:** a selection can be thousands of IDs, too long for a URL. Every non-GET under
  `/api/contacts` normally counts as an edit and schedules a sync, so `isContactEdit` exempts this
  path (`READ_ONLY_PATHS` in `syncScheduler.ts`).
- **VCF** is the same card as the full export (`exportContactsAsVcf(db, photos, { ids })`), photos included.
- **CSV** is Google Contacts' layout, written by `generateGoogleCsv()` (`csvExportService.ts`) from the
  same `loadContactsForVcard` data. Column names follow Google's own export (`E-mail 1 - Label`,
  `Labels` = `* myContacts ::: <groups>`), so Google imports it as its own; numbered groups get as many
  slots as the contact with the most entries. The primary email/phone label starts with `* `. Social
  profiles go into Website columns, IMs into Custom Field, dates are `YYYY-MM-DD` or `--MM-DD` (Apple's
  1604 placeholder year counts as no year). Archived details, photos and LinkedIn enrichment are left
  out. UTF-8 with a BOM (for Excel), CRLF rows.
- **Filename:** the group's name, the contact's name for a single contact, else `yello-<n>-contacts`.
  `Content-Disposition` carries an ASCII `filename` plus a UTF-8 `filename*`; dev CORS exposes the header.
- **UI:** `ActionMenu` (with `triggerLabel`) in `ContactList`: *Export (n)* among the selection actions,
  and *Export* beside Select Page inside a group when nothing is selected. `useExportContacts`
  (`frontend/src/api/exportHooks.ts`) posts, then downloads the response blob via `<a download>`.

### VCF parsing notes (`vcardParser.ts`)

Several properties are read from the unfolded lines rather than through ical.js, because ical.js gets them wrong or leaves them untyped:

- **`TITLE`, `NOTE`, `FN`** — ical.js leaves `\;` escaped in single-value text, which put a stray backslash before every semicolon of an imported title.
- **`CATEGORIES`** — every value of every line is read. `getFirstPropertyValue` returned only the first category of a contact that had several.
- **`X-SOCIALPROFILE`, `X-ABRELATEDNAMES`** — read grouped or ungrouped, with quoted parameter values honoured. The platform comes from `TYPE` (Apple) or `X-SERVICE` (this app's exports before 2026-09-27). A related person's relationship comes from `TYPE`, else from the `X-ABLabel` of its group; Apple's built-in labels (`_$!<Spouse>!$_`) are lower-cased, anything else is kept as written.
- **URL labels** — ical.js reports the item group as a `group` parameter, not as part of the property name.
- **Primary email/phone** — the first entry flagged `TYPE=pref` or `PREF=1`, else the first entry.
- **Labels of emails, phones and addresses** — the `X-ABLabel` of the entry's item group, which ical.js exposes as the `group` parameter.
- **Everything not mapped to a field** — `collectExtraProperties()` sweeps the card's lines and returns every one no typed field consumed as `extraProperties`. A single-valued property (`N`, `ORG`, `NICKNAME`, …) is consumed once; a repeat is kept as extra. An annotation (`X-ABLabel`, `X-ABADR`, `GEO`, …) is consumed only when its group's owner stores it; a card-level `GEO` only when the card has one address.
- **`PHOTO;VALUE=URL`** — a link, not image data; kept as a generic property. It used to be passed to the image processor as base64.

### vCard-model backfills and `raw_vcard` retirement

Imports before 2026-09-27 stored only part of each card. On the first open of each database after deploy, in this order and once each:

1. `backfillVcardModel()` and `backfillVcardModelV2()` (`backend/src/services/vcardModelBackfill.ts`) re-parse `raw_vcard` and fill what was dropped — person fields, labels, extra types, address hints, dates, generic properties, leftover parameters, categories after the first, stray `\;` escapes — only where empty, never undoing a later edit.
2. `retireRawVcards()` (`backend/src/services/rawVcardRetirement.ts`) writes every stored card to `archive/original-cards-<date>.vcf.gz` in the user's directory, verifies the file byte-for-byte, then drops `contacts.raw_vcard` and runs `VACUUM`. If the archive can't be written it changes nothing and retries on the next open.

This also runs **in production** (Railway volume `/data`) on each user's first request after deploy. The archive is the only record of what contacts looked like before in-app edits and cleanups (removed Dex links, "No street" placeholders, cleaned notes, …); it is not read by the app. To see what differs between the originals and the database today: `cd backend && npx tsx scripts/checkVcardResidual.ts <userId>`.

Measured on the local databases: user 12 (8054 contacts) differs from its originals in 1 value (a malformed Apple Instagram entry); user 3's differences are all its cleanups. The databases shrank from 124 → 72 MB and 52 → 11 MB.

### Related-names backfill

Imports before 2026-09-27 could not read grouped `X-ABRELATEDNAMES`, so those related people existed only inside `raw_vcard` (since retired, see above). Since the export no longer replays the raw card, `backfillGroupedRelatedNames()` (`backend/src/services/relatedNamesBackfill.ts`) copies them into `contact_related_people` once per database, on open. It recovers grouped lines only — ungrouped ones were always imported, so a missing row for one of those means the user removed it — and records completion in `user_settings.related_names_backfilled_at` so that later removals are not undone.

### Yello as source of truth: sync with iCloud and Google (in progress)

Plan: `docs/plans/2026-10-25-yello-source-of-truth-sync.md`. Yello's cleaned, deduplicated list is
the base; the one-time cutover imports only recent remote changes and new contacts, and replaces the
remote address books (removing their old duplicates) only after a verified backup. Ongoing sync is
two-way, Yello wins per field. Shipped so far (Phase 0):

- **Backups** (Migration page `/migration` › Back up Apple & Google contacts; `/api/sync/backups`).
  `startBackup` runs in the background (one per provider at a time); iCloud is read through
  `streamICloudCards` (`icloudService.ts`: href listing, then 100-card multigets, so photos are never
  all in memory), Google through `fetchAllGooglePeople` / `fetchAllGoogleContactGroups`
  (`services/sync/googlePeople.ts`, every person field). Files and layout: `docs/database.md`,
  *Remote address-book backups*. Downloads: `GET /api/sync/backups/:id/files/:name` (only names in the
  manifest resolve).
- **Deletion gate.** `checkDeletionGate` / `assertDeletionAllowed` (`remoteBackupService.ts`): a
  provider may be deleted from only with a `verified` backup of it from the last 24 hours that the user
  confirmed (`POST /api/sync/backups/:id/confirm`). Every remote-delete path of the sync engine must
  call `assertDeletionAllowed` first.
- **Shared contact writes** (`services/contactPersistence.ts`): `prepareContactStatements`,
  `insertParsedContact` (VCF import job, iCloud import) and `mergeParsedIntoContact` (iCloud import
  merges; fills empty scalars, unions every child table with labels and params). Replaces the iCloud
  route's own statements, whose merge path passed too few arguments and threw on any new child row,
  and whose photo source `'icloud'` violated the `contact_photos` CHECK.
- **Merged identities.** Merges keep the secondaries' `icloud_uid` / `google_resource_name`
  (`carryMergedIdentities`, `contact_merged_identities`), so cards of merged-away contacts that are
  still in iCloud/Google match the survivor instead of looking new.
- **Apple group cards** (`X-ADDRESSBOOKSERVER-KIND:group`, vCard 4 `KIND:group`) are skipped by
  `parseVcf` and the VCF import job (counted as skipped). Group cards imported before this exist as
  contacts; the cutover dry run will list them.
- **Google OAuth** flows all send `include_granted_scopes=true`, so signing in again or the Gmail
  re-consent no longer returns a token without the Contacts scope.

Phase 1 (foundations, no remote writes):

- **Cutover preview** (Migration page `/migration` › Preview the switch to Yello;
  `POST /api/sync/cutover/plan`, `GET /api/sync/cutover/latest`, `GET /api/sync/cutover/:id/items`).
  `services/sync/cutoverPlanner.ts` reads the latest *verified* backup of each provider (never the live
  remote) plus the baseline archive, and classifies every remote card: `link` (its Yello contact's card),
  `merged_duplicate` (another card matching the same contact → removed), `update` (a remote change inside
  the window that Yello takes), `conflict` (changed on both sides), `possible_match` (medium-confidence
  match, for review), `import` (not in Yello, not in the baseline, modified inside the window),
  `delete_remote` (removed in the cleanup / old remote-only / archived in Yello), `restore_review`
  (would be deleted but was edited recently), `create_remote` (Yello contact with no card there) and
  `group_card` (Apple group imported as a contact). A family counts as changed remotely only if it differs
  from the baseline card (where one exists); multi-value families changed on both sides bring in only the
  remote's additions. Runs in the background (yields every 100 cards); 12,116 real contacts plan in ~3.4 s.
  Writes only `sync_cutovers` / `sync_cutover_items`.
- **Projection** (`services/sync/syncProjection.ts`): `projectContact(contactData, provider)` →
  normalised field families (`SYNC_FIELDS`), `hashProjection`, `diffProjections`, `entriesMissingFrom`.
  Google's projection has no categories, company flag or FN and folds social profiles into URLs. A card
  imported into Yello projects identically to the card (tested on the real sample cards and the 12k export).
- **Google mapping** (`services/sync/googlePersonMapper.ts`): `personToContactData` (contact-sourced
  values only, social URLs → profiles) and `contactDataToPerson` (writes `clientData` `yelloUid`, never
  `memberships`); round-trips to the same Google projection.
- **`loadContactsForVcard(db, options)`** (`vcardExportService.ts`) loads contacts in generateVcard's
  shape for the export and sync alike; `generateVcard(contact, { sync: { rev } })` writes a card for
  iCloud (fresh `REV`, Yello `PRODID`, no stale imported REV/PRODID, no LinkedIn blob).
- **Every contact has a UID** (trigger `contacts_ai_uid` + backfill), so VCF exports now carry a UID for
  every card and re-importing an export no longer duplicates app-created contacts.
- **Delete all** returns 409 while sync is enabled (`isSyncEnabled`, `services/sync/syncState.ts`).
- **Fixed:** permanently deleting archived contacts (and the cleanup delete) failed with "database disk
  image is malformed": the code deleted the `contacts_fts` rows itself and then the `contacts_ad` trigger
  deleted them again.


Phase 2 (iCloud two-way engine, behind `SYNC_ENGINE=1`):

- **`runICloudSync(userId, { trigger, confirmLargeChanges?, fullScan? })`**
  (`services/sync/icloudSyncEngine.ts`). One run = pull then push, under a per-user lock (in-process
  plus a lease on `sync_providers`), recorded in `sync_runs`. Never throws; returns
  `completed | failed | paused | skipped` with counters. Refuses to run before
  `sync_providers.cutover_completed_at` is set.
  - *Pull:* skipped when the book's ctag is unchanged (the ctag is only stored after a run that wrote
    nothing, so a phone edit made during our own writes is never hidden). Otherwise the etag listing is
    diffed against the links: changed cards are three-way merged per field family against the link's
    snapshots (`replaceContactFields` takes the families only iCloud changed; families changed on both
    sides keep Yello's value and log iCloud's card as `conflict_yello_won`); a vanished card archives
    its contact if Yello did not change it since (else it is re-created); an unknown card relinks by UID
    / merged identity or becomes a new contact. Photos changed only in iCloud are imported.
  - *Push:* creates (`<UID>.vcf`, `If-None-Match: *`) for contacts without a card, conditional updates
    when the projection hash or photo changed, deletes for archived contacts and tombstones (each card's
    last version goes to `sync_remote_versions` first). A 412 on update re-reads the card, merges it, and
    pushes once more. After pushing, the stored cards are read back so the link remembers iCloud's own
    version (iCloud rewrites cards) and the next pull does not echo.
  - *Guards:* more than max(20, 5%) cards vanishing, appearing or being deleted, or more than 300 created,
    pauses the provider until a run with `confirmLargeChanges`; a confirmed mass delete still needs a
    fresh confirmed backup (`assertDeletionAllowed`). An iCloud 401 pauses the provider.
- **`services/sync/icloudRemote.ts`**: the `ICloudRemote` interface (ctag, list, multiget, conditional
  create/update/delete) and its tsdav implementation; tests use an in-memory book.
- **Routes** (all need `SYNC_ENGINE=1`): `POST /api/sync/icloud/enable` (only on an empty book: sets
  `cutover_completed_at` and runs the first sync, creating a card per contact), `POST /api/sync/run`,
  `POST /api/sync/icloud/disable`, `POST /api/sync/icloud/reset` (forget the pairing; contacts kept),
  `POST /api/sync/pause|resume`, `GET /api/sync/runs`, `GET /api/sync/status`.
- **Testing with a spare Apple ID:** sign in to Yello with a second Google account (a separate Yello user,
  so the real contacts are not involved), add a few contacts, connect the spare Apple ID under Tools,
  then from the browser console: `await (await fetch('/api/sync/icloud/enable', {method: 'POST'})).json()`
  and later `fetch('/api/sync/run', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({provider: 'icloud'})})`.

Phase 3 (Google two-way engine, behind `SYNC_ENGINE=1`):

- **`runGoogleSync(userId, { trigger, confirmLargeChanges?, fullScan? })`**
  (`services/sync/googleSyncEngine.ts`), the People API counterpart of the iCloud engine, using the same
  three-way merge (`planFieldMerge` in `syncProjection.ts`), guards, deletion gate, run log and
  remote-version log.
  - *Pull* by sync token (`people.connections.list` with `requestSyncToken`; an expired token, about a
    week, triggers a full read). Deleted people arrive flagged `metadata.deleted`; on a full read, linked
    contacts missing from the list count as deleted. Only `CONTACT`-sourced values are read (never the
    person's public profile). When Google's emails/phones/addresses replace Yello's, Apple labels and
    extra types are kept on entries whose value survived (`preserveEntryAnnotations`). Taking `urls`
    also replaces social profiles (Google holds them as typed URLs).
  - *Push* with `batchCreateContacts` / `batchUpdateContacts` (200 per call, each with its etag,
    `updateMask` = the mapped fields, never `memberships`) and `batchDeleteContacts`; a stale etag fails
    the batch, so it is retried contact by contact and a stale one is re-read, merged and pushed again.
    Photos go through `updateContactPhoto` / `deleteContactPhoto`, at most 100 per run (the rest on
    later runs); the photo's URL identifies it for change detection. `clientData` `yelloUid` and
    `contacts.google_resource_name` are written so a lost link can be rebuilt.
  - The sync token stored is the one read at the start of the run, so our own writes come back next run
    (and are recognised by their hashes) and nothing edited in between is skipped.
- **`services/sync/googleRemote.ts`**: the `GoogleRemote` interface and its People API client (writes
  spaced 1.1 s apart, 429/503 retried with back-off, 401/403 → `RemoteAuthError`, which pauses sync).
- **OAuth:** `/api/auth/google/contacts?write=1` asks for `https://www.googleapis.com/auth/contacts`
  (full Contacts access) and returns to `/tools?google=write-granted`; `contacts-status` also reports
  `scope: none | readonly | write` (`contactsScopeOf`, via Google's tokeninfo). The Google Cloud OAuth
  consent screen must list the `contacts` scope.
- **Routes:** `POST /api/sync/google/enable` (needs the write scope and an empty Google Contacts),
  `/google/disable`, `/google/reset`; `POST /api/sync/run` takes `provider: 'google'`.
- **Testing with a spare Google account:** sign in to Yello with it (a separate Yello user), open
  `/api/auth/google/contacts?write=1` to grant access, add a few contacts in Yello, then
  `await (await fetch('/api/sync/google/enable', {method: 'POST'})).json()`.

Phase 4 (the cutover: review, apply, restore; behind `SYNC_ENGINE=1`):

- **Migration page** (`/migration`, `MigrationView.tsx`; linked from Tools): step 1 the backups (folding
  card), step 2 the preview, review and switch (on the page itself). In the lists, each contact's items are
  grouped under its name with one choice next to the name (it sets all of that contact's items in the list),
  and every difference is a sub-bullet: the field, then "Yello has …" / "iCloud has …". Each list's heading
  opens with a caret and has its own dropdown for every item in it (`resolve-all`; "Mixed" when they differ,
  from `GET /api/sync/cutover/:id/sections`).
- **Review** (the preview card): every decision item has a choice select (`RESOLUTIONS`, defaults from
  `defaultResolution`), saved with `POST /api/sync/cutover/:id/resolve` (one or more items) or
  `/resolve-all` (every item of a kind/provider, or `null` = back to the suggestions). Lists stay readable
  but frozen once the switch starts.
- **Apply** (`POST /api/sync/cutover/:id/apply`, `startCutoverApply` in `services/sync/cutoverApply.ts`).
  Preconditions: the plan is the latest; for each provider in it, the newest verified backup is the one the
  plan was made from, and the deletion gate is open (fresh, confirmed); the provider is not already switched
  over; iCloud cards all live in one address book. Then, in one transaction, Yello takes the accepted
  changes, links every remaining card (backup version as the remote snapshot) and tombstones the ones to
  remove, and the providers are switched on; photos for photoless contacts come from the cards. The first
  push runs each engine (`trigger: 'cutover'`, confirmed, iCloud first): differing cards updated, missing
  ones created, tombstoned ones deleted last. If it cannot finish, the cutover stays `pushing` with the
  reason; applying again (the "Continue" button, or the boot hook `resumeInterruptedCutovers`) picks up.
  An `applying` left by a crash is reported as `planned` (step 1 commits atomically).
- **Restore** (`POST /api/sync/backups/:id/restore` `{ mode: 'missing' | 'all' }`, `startRestore` in
  `services/sync/remoteRestore.ts`; "Restore this backup…" on the backups card). Only while that provider's
  sync is off. `missing` re-creates every backed-up card that is gone (iCloud: byte for byte at the same URL,
  photos included; Google: new resource names, labels re-attached where the group still exists, photos not
  restored); `all` also overwrites cards that changed with the backup's version. Results land in the
  manifest's `restores`.
- **Legacy imports** (`/api/icloud/import`, `/api/google-contacts/import`) return 409 for a provider that is
  synced: its contacts arrive through sync, and an import would add unlinked duplicates.
- **Tally** (bottom of the preview card; `GET /api/sync/cutover/:id/tally`, `computeCutoverTally`): per
  source (Yello, iCloud, Google) how many contacts end up unchanged / updated / new / deleted (Yello:
  archived), with the current choices. It copies the database (`db.backup` to a temp file), runs the switch's
  own Yello step on the copy, and compares: Yello rows by projection, remote rows from the links (in step →
  unchanged, differing or photo to send → updated), contacts without a card (new) and tombstones (deleted).
  So it cannot drift from what the switch does. Cached per choice set; about 5 s for 12k contacts.

Phase 5 (running on its own; behind `SYNC_ENGINE=1`):

- **Schedule** (`services/sync/syncScheduler.ts`, started after `app.listen`): every
  `SYNC_INTERVAL_MINUTES` (10) a round syncs each user's active providers, users one after another, iCloud
  before Google; a round is skipped while the previous one runs; a provider with `consecutive_failures` ≥ 2
  waits that many intervals (max an hour) between tries.
- **After an edit:** a root `onResponse` hook in `server.ts` calls `scheduleSyncAfterEdit` for every 2xx
  non-GET under `EDITING_PREFIXES` (`/api/contacts`, `/api/archive`, `/api/duplicates`, `/api/cleanup`,
  `/api/import`, `/api/profile`); each edit restarts a `SYNC_EDIT_DELAY_SECONDS` (45) countdown, so a burst
  becomes one sync.
- **Tools › Sync** (`SyncStatusContent.tsx`): per book On / Paused / Needs you / Off / Not switched over,
  last sync, the last problem, Sync now, Pause / Resume; when the mass-change guard paused a book, *Review*
  shows why and *Continue* runs with `confirmLargeChanges`. Recent runs (`GET /api/sync/runs`).
  `POST /api/sync/run-all` syncs every book.
- **Earlier versions** (`RemoteVersionsPanel.tsx` on the contact page; `GET /api/sync/remote-versions`,
  `POST /api/sync/remote-versions/:id/restore`, `services/sync/remoteVersions.ts`): what sync overwrote or
  removed in iCloud/Google, with a preview; *Restore* rewrites the contact from that card (unarchiving it if
  needed) and the next sync writes it out. Field-only entries from the cutover cannot be restored.
- The Tools page's one-off Google / iCloud import sections turn into a note once that book is synced.

### Archived contact details

A phone, email, address, social profile, IM or web link can be **archived**: an old number or former address stays in Yello for reference (and so old email threads and messages can still be traced) but leaves the main view, so nobody dials or mails it by mistake. Contact-level archiving (`contacts.archived_at`, the Archived group) is a separate feature.

- **Storage:** `detail_archived_at` on each detail table (`docs/database.md`). All rules live in `backend/src/services/archivedDetails.ts`.
- **Card UI** (`ContactFormSections.tsx`): each section lists active entries; archived ones sit behind a gray "N archived" link (the `.show-more-link` pattern) and expand as muted plain text with "Archived Mon YYYY", without call/text/WhatsApp/mail actions. In edit mode each row has an archive button beside remove; archived rows get Restore and remove. Changes save with the form. `ReachOutBar` only uses active entries.
- **Sync never sends them.** `generateVcard(…, { sync })` and `contactDataToPerson` skip archived entries, and `projectContact` leaves them out, so archiving is an ordinary local change and the next push removes the detail from iCloud/Google. `replaceContactFields` (a remote family taken in a merge) deletes only active rows, and drops an incoming entry that matches an archived row's value instead of re-adding it as active.
- **Obsolete / Archived labels.** Any row written with the X-ABLabel (or Google custom type) `Obsolete` or `Archived` is stored archived, label cleared. This runs at storage, not in the parser, on purpose: the remote card still projects the entry, so after relabeling a number "Obsolete" on an iPhone, Yello archives it and its next push removes it from the phone. A one-off migration (`archiveObsoleteLabels`, every connection, idempotent) converted existing rows.
- **VCF export/import.** The export keeps archived entries, written as an `Archived` label plus hidden parameters, e.g. `item3.TEL;TYPE=CELL;X-YELLO-ARCHIVED=2026-10-26;X-YELLO-LABEL=mobile:+1 415 555 0100` + `item3.X-ABLabel:Archived`. Other apps show "Archived"; a Yello import (`takeArchiveMarker` in the parser) restores the archived state and the original label. Social profiles and IMs carry only the parameters (Apple has no label for them).
- **Who still sees archived entries:** search (FTS), Gmail history/discovery, Gravatar lookup, duplicate detection and import matching (an old email is still evidence of who someone is). **Who doesn't:** list primary email/phone and has-email/phone/address filters, map, geocoding and address cleanup (never geocoded or billed), stats, the public profile and the profile editor (whose save leaves archived rows alone).
- **Merging contacts** carries the flag over; a value archived on one contact but active on another comes out active (`unarchiveDetailsActiveElsewhere`).
- **Gotcha:** Fastify's request coercion turns a JSON `null` into `""` for a nullable string, so `PUT /api/contacts/:id` writes `archivedAt || null`.

### Text Blast (Tools › Text Blast, `/tools/text-blast`)

Personal 1:1 texts to a list through Apple Messages, from the user's own number, one conversation per person (never a group text). This is a port of the standalone TextBlast app (`../textblast/`, Python). Plan: `docs/plans/2026-10-31-text-blast.md`.

**Who does what.** Messages can only be driven on the user's Mac, and the backend runs on Railway, so:
- **Backend** (`routes/textBlast.ts`, `services/textBlast/`) builds the recipient list and stores every blast and each person's status (`text_blasts`, `text_blast_recipients`, see `docs/database.md`).
- **Desktop app** (`electron/src/textBlast/`) sends: AppleScript to Messages, then `~/Library/Messages/chat.db` read-only (`node:sqlite`) to confirm delivery.
- **Page** (`frontend/src/components/textBlast/`) composes, previews, tests and starts. It talks to the desktop app through `window.yelloDesktop.textBlast`. In a regular browser it can build and save a blast but not send it.

**Recipients** (`buildRecipients`). One or more groups (archived contacts left out), and/or a CSV such as a Google Sheet download or a Google Contacts export:
- **CSV parsing:** comma, semicolon or tab, BOM-safe, quote-aware. The phone column is found by name (`phone`, `mobile`, `cell`, `Phone 1 - Value`, …) or by content.
- **Numbers:** normalised to E.164 with `libphonenumber-js` (`00` prefix → `+`; national numbers use the page's country, which defaults to the last blast's). An iMessage email works too.
- **Matching:** a CSV number belonging to a contact links the row to that contact. If the contact is also in a chosen group, the two become one row (`source: both`), and CSV cells override contact fields when non-empty. CSV people are never added to contacts.
- **Number choice:** a contact's number is `cell`/`mobile`/`iphone` first, then primary, then the first stored. The preview offers the others in a dropdown (`phoneOverrides`).
- **Duplicates:** a repeated number is held back with "same number as row N".

**Message.** `{field}`, `{field|fallback}`, `{{`/`}}`, loose key matching (`{First Name}` = `{first_name}`). Fields: `first_name`, `last_name`, `nickname`, `company`, `full_name` and every CSV column. An empty field without a fallback holds that person back. A CSV `message` column replaces the template for that row (**custom**). Texts are rendered when the blast is created, and the stored text is exactly what's sent.

**Sending** (`TextBlastRunner`), for each queued person:
1. Write `in_flight` to the backend.
2. `osascript` sends through `1st account whose service type = iMessage` (data passed as argv).
3. Poll `chat.db` every 3 s for up to 60 s.
4. If iMessage failed, fall back to SMS through the iPhone (not for emails, -1743, or when there's no SMS account).
5. Write the result, then wait a random 25–45 s (1–2 s when simulating).

The person is re-read before each send, so unticking someone mid-run skips them.

**Safety rails:**
- 80 real attempts a day across all blasts (`GET /sent-today?since=<local midnight>`; simulated blasts don't count).
- Auto-stop after 3 failures in a row, after ≥10 attempts with >20% failed, or on -1743.
- `powerSaveBlocker` keeps the Mac awake during a run.
- One blast at a time.
- If the backend can't record `in_flight`, nothing is sent.
- Quitting mid-blast asks first.

**Resume.**
- `failed`/`error` are retried.
- An `in_flight` row is looked up in `chat.db` from its `sent_at` and only resent if nothing went out. If it can't be checked, it becomes `needs_review`.
- `pending`/`not_found`/`needs_review` show "Check Messages", with a "Queue again" button.

**macOS permissions** (shown in the page's setup bar, which links to the right System Settings pane):
- **Automation › Messages** for Yello. Asked on first use; packaged builds carry `NSAppleEventsUsageDescription` and the `com.apple.security.automation.apple-events` entitlement.
- **Full Disk Access** for delivery checks. Without it, texts are marked `dispatched` ("Sent (not checked)").
- In dev, both grants belong to the Electron binary (or the terminal that launched it).

**Other features.**
- **Send test:** sends the first selected person's text to the user's own number. It doesn't touch the blast or the daily count.
- **Simulate:** runs the whole flow without calling Messages.
- **Run again:** a new draft for the same people with a new message, re-rendered from the stored `values_json`.

### Top contacts (`/dashboard/top`)

Ranks contacts by how much the user messages them across Gmail, iMessage, WhatsApp, Instagram and LinkedIn.
Plan: `docs/plans/2026-10-31-top-contacts-messages.md`; tables: `docs/database.md` › *Message activity*.

- **One format for every channel.** Each source boils down to daily counts per person: `{ channel, handle, day, sent, received, group }`. Everything goes through `POST /api/messages/activity`, in batches that each cover a day range; a batch replaces the channel's counts in its range, so re-imports never double-count. **No message text, subject or body is ever stored or uploaded.**
- **Where each channel comes from:**
  - **Gmail:** a server-side scan (`services/gmailActivityService.ts`, `POST /api/messages/gmail/scan`). It reads only the From/To/Cc headers, 2 years on the first run, then incrementally. Sent mail counts for each recipient, received mail for the sender. It skips promotions, social, updates and forums, `List-Unsubscribe`/`Precedence: bulk` mail and no-reply senders. Progress lives in `message_sources`, polled through `GET /api/messages/sources`. It needs the `gmail.readonly` scope (`/api/auth/google/gmail`).
  - **iMessage and WhatsApp:** read by the desktop app on the Mac (`electron/src/messageActivity/`), see `electron/README.md`. The page uploads the counts. *Scan new messages* re-reads only from two days before the last imported day (`incrementalScanStart`) and replaces those days; *Rescan everything* reads the whole history. Automatic refresh is opt-in per channel and per Mac (*Refresh automatically* switch, off by default, kept in `localStorage`): `useDesktopMessageSync` (mounted in `Layout`) checks 20 s after launch, every 15 min and when a switch changes, and scans a channel once its last read on this Mac is 6+ hours old. A scan already running for a channel is joined, not started twice.
  - **Instagram and LinkedIn:** the user uploads the platform's data export. It's parsed in the browser (`frontend/src/lib/messageExports.ts`, zip.js loaded on demand), so multi-GB Instagram zips never upload. Instagram: `messages/inbox/*/message_*.json`, with Meta's Latin-1 mojibake fixed; people are `opaque` `ig:<folder>` handles matched by name. LinkedIn: `messages.csv`, where people are profile URLs and the user is the profile in the most conversations.
- **Matching** (`services/messageMatching.ts`): handles are normalized per channel (E.164 phones via libphonenumber with `US` as default region, lowercase emails, `linkedin.com/in/<slug>`; WhatsApp `…@s.whatsapp.net` → `+number`, `…@lid` → `opaque:`). They're then matched to active contacts by phone (exact, else a unique match on the last 9 digits), email, or Instagram/LinkedIn profile. Automatic links are recomputed on every import and every `/top` load, so a removed number unlinks. Manual links, ignores and unlinks stick. Unmatched handles with a unique exact name match get a suggestion.
- **"Needs a match" queue** (`GET /api/messages/handles`): unmatched people the user **wrote to at least once**, which keeps out newsletters and spam. Actions are accept the suggestion (or all of them), pick a contact, ignore, and unlink. Linking can add the phone, email or profile to the contact (on by default), so `/api/messages/handles` is in `EDITING_PREFIXES` and triggers a sync.
- **Ranking** (`GET /api/messages/top?mode=score|count&window=30|90|365|all&channel=`):
  - Score: each day's messages weigh `0.5^(age/180 days)`, and direct messages are multiplied by the reciprocity factor `0.5 + 0.5·min(sent, received)/max(sent, received)`. Group messages add at 0.25 weight.
  - Count: plain totals in the window.
  - Rows carry per-channel counts and a 12-month series for the sparkline.
- **UI:**
  - `TopContactsView` has three tabs: Ranking, Needs a match and Sources (`MessageSourcesPanel`, one card per channel).
  - The Dashboard has a Top Contacts card (last 90 days).
  - Contact pages show a Messages section (`MessageActivitySection`, `GET /api/messages/contacts/:id`).
  - The contact list's *Last contacted* sort uses the latest day on any channel plus Gmail history.

### Public profile card (`/p/:slug`)

Users can publish their contact card at a server-generated slug. Behavior notes:

- The Profile page is **read-only with autosaving visibility controls** — there is no edit mode. The "Make my contact card public" toggle, "Hide All Fields", and the per-field eye toggles (shown next to every field in the contact card and next to the identity fields above it) all **autosave immediately** via a partial `PUT /api/profile`. On a failed autosave the control reverts and an error banner is shown. Profile data itself is edited via the linked contact.
- Per-field visibility lives in `visibility_json` on `user_profiles`. **Name and avatar default to visible**; tagline, company, title, contact details (emails/phones/addresses), socials, and birthday are hidden until opted in via the eye toggles. Older profiles created with all fields hidden are seeded with name + avatar visible the first time the public toggle is switched on (never while already public, to avoid silently exposing data).
- Nothing is served publicly until `is_public` is set — `GET /api/profile/public/:slug` returns 404 otherwise, and it blanks the visibility object and nulls all hidden fields in its response.
