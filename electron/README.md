# Yello desktop app

A macOS app that opens the hosted Yello deployment (`https://yello.up.railway.app`) in its own window. It has no backend of its own: the account, contacts and photos are the same ones you see on the web, and the app only keeps a session cookie in `~/Library/Application Support/Yello/`.

## Layout

```
electron/
├── src/config.ts        APP_URL (overridable with YELLO_URL) and the yello:// scheme
├── src/desktopAuth.ts   Google sign-in through the system browser (PKCE handoff)
├── src/main.ts          Window, navigation rules, deep links, offline fallback
├── src/preload.ts       window.yelloDesktop: local features for the Yello page
├── src/textBlast/       Text Blast sender: Messages (AppleScript), chat.db checks, send loop, IPC
├── pages/offline.html   "Can't reach Yello" page with a retry link
└── electron-builder.yml Packaging (dmg, arm64 + x64, registers yello://)
```

## How it behaves

- **Same-origin pages** load in the app window. Same-origin `window.open` / `target="_blank"` opens another app window.
- **Other origins** (LinkedIn, mailto:, maps, …) open in the default browser. Only `http(s)`, `mailto`, `tel` and `sms` links are handed off.
- **`tel:` on macOS** always opens in FaceTime (`open -b com.apple.FaceTime <url>`), so calls ring out through the iPhone ("Calls from iPhone") even when Chrome, Zoom or Teams has claimed `tel:` as the system default. If that fails it falls back to the default handler.
- **Server unreachable**: the window shows `pages/offline.html`, whose "Try again" link reloads the app.
- **Permissions** (notifications etc.) are granted only to the app origin.
- One instance at a time. Opening the app again focuses the existing window.

## Google sign-in

Google blocks sign-in inside embedded browsers, so the three Google flows run in the system browser instead:

- sign in (`/api/auth/google`)
- Gmail re-auth (`/api/auth/google/gmail`)
- Google Contacts re-auth (`/api/auth/google/contacts`)

```
App: user clicks "Sign in with Google"
 └─ will-navigate is cancelled; the app makes a PKCE verifier + challenge
    └─ system browser: /api/auth/desktop/start?flow=login&challenge=…
       └─ backend stores the challenge in a desktop_handoff cookie → normal Google OAuth
          └─ callback: instead of a session, a one-time code (2 min) and a page that opens
             yello://auth?code=… (with an "Open Yello" button)
App receives yello://auth?code=…
 └─ loads /api/auth/desktop/exchange?code=…&verifier=… in the app window
    └─ backend checks the verifier, burns the code, sets session_id → redirect into the app
```

The code is useless without the verifier, which never leaves the app. The backend half lives in `backend/src/services/desktopHandoff.ts` and the `/desktop/*` routes in `backend/src/routes/auth.ts`.

If the app quits mid-sign-in, the pending verifier is lost and the link does nothing; click Sign in again. "Try demo" works in the app window directly, since it doesn't involve Google.

## Text Blast (sending texts through Messages)

Tools › Text Blast in the Yello page builds a list and hands it to the app, which sends each text through Messages on this Mac (`src/textBlast/`). The page reaches it through `window.yelloDesktop.textBlast` (`src/preload.ts`). The IPC channels are `textblast:*`, and each one answers only pages on the app origin. Statuses are written to the backend before and after every text with the app's own session cookie, so a quit or crash mid-blast resumes without double-sending.

One-time permissions on the Mac:
- **Automation › Messages**: macOS asks the first time. Packaged builds declare `NSAppleEventsUsageDescription` (`electron-builder.yml`) and `com.apple.security.automation.apple-events` (`build-resources/entitlements.mac.plist`).
- **Full Disk Access**: needed to read `~/Library/Messages/chat.db` (read-only, `node:sqlite`) and confirm delivery. Without it, texts show "Sent (not checked)".
- In `npm run dev`, macOS ties both grants to the Electron binary in `node_modules` (or the terminal that started it), not to Yello.app.

`npm test` runs the send loop against a fake Messages (`src/textBlast/runner.test.ts`). Nothing is sent.

## Top contacts (reading iMessage and WhatsApp)

Top contacts (`/dashboard/top` › Sources) counts how much the user messages each person. iMessage and WhatsApp live on the Mac, so the desktop app reads them (`src/messageActivity/`):

- **Data read:** `~/Library/Messages/chat.db` and `~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite`, opened read-only with `node:sqlite` in a worker thread (`worker.ts`), so a large history doesn't freeze the window.
- **What comes out:** only daily counts per person (sent, received, group) and handles (phone numbers, emails, WhatsApp IDs, names). Message text is never selected. The page uploads the counts to `POST /api/messages/activity` with the user's session.
- **Rules:**
  - Chats with one other person count sent and received.
  - In groups, a received message counts as a group message for its sender, and a sent one for every member.
  - Tapbacks, renames, WhatsApp system notices, broadcasts and status updates are skipped.
  - iMessage dates are nanoseconds since 2001, divided in SQL because they don't fit a JavaScript number.
- **Permission:** both files need **Full Disk Access** for Yello. No entitlement is involved; the user grants it. `messages:status` tries a plain file open (it returns `EPERM` without access) and reports `needs_full_disk_access`. The page then offers *Open System Settings* and *Restart Yello* (relaunch through `app.quit()` so Text Blast's before-quit check still runs). In dev, grant it to the Electron binary or the terminal running `npm run dev`. The grant follows the app's signature, so an unsigned or ad-hoc rebuild may need it again.
- **Incremental reads:** `messages:scan` with a `sinceDay` filters on the raw date column (nanoseconds, or seconds for very old rows) so SQLite can use the date index; a "scan new messages" then reads days, not the whole 1 GB history. Automatic refresh is the page's job and is off until the user turns it on.
- **IPC:** `messages:status`, `messages:scan` (channel, sinceDay), `messages:open-settings`, `messages:relaunch`, exposed as `window.yelloDesktop.messageActivity`. All of them check that the caller is on the app origin.
- **Schema drift:** the readers check the tables and columns they use and fail with a clear message if Messages or WhatsApp change their layout. Tests (`readers.test.ts`) build small fake databases in both layouts.

## Development

```bash
cd electron && npm install
npm run dev                                   # against production
YELLO_URL=http://localhost:3456 npm run dev   # against a local backend (cd backend && npm run dev)
```

The local backend serves the built frontend, so run `cd frontend && npm run build` first. Deep links in dev register the development Electron binary as the `yello://` handler. That can take over from an installed Yello.app until you open the installed app again.

## Building

```bash
npm run electron:build      # from the repo root; same as: cd electron && npm run dist
```

This produces `electron/release/Yello-<version>-arm64.dmg` (Apple Silicon) and `Yello-<version>.dmg` (Intel).

- **Icon:** `build-resources/icon.icns`, generated from `icon.svg` (the favicon mark on the macOS icon grid) by `build-resources/make-icon.sh`. See `build-resources/ICON_README.md`.
- **Signing:** electron-builder signs with the Developer ID certificate in the keychain, if there is one, with hardened runtime.
- **Notarization:** not set up. A locally built app opens fine. A dmg downloaded on another Mac is blocked by Gatekeeper until it is notarized: add `notarize` to the `mac` config and set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`.
- **Deep links:** macOS registers `yello://` once the app has been launched from `/Applications`.

## Migrating from the old local-data app (1.x)

Up to 1.x the app bundled its own backend and kept a separate database in `~/Library/Application Support/Yello/` (`auth.db`, `users/<id>/contacts.db`, photos). 2.0 no longer reads those files and does not delete them.

To move that data to the hosted app:

1. Before upgrading, export a VCF from the 1.x app.
2. In 2.0 (or on the web), import it.

The old files can be deleted by hand afterwards.
