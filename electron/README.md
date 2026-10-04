# Yello desktop app

A macOS app that opens the hosted Yello deployment (`https://yello.up.railway.app`) in its own window. It has no backend of its own: the account, contacts and photos are the same ones you see on the web, and the app only keeps a session cookie in `~/Library/Application Support/Yello/`.

## Layout

```
electron/
├── src/config.ts        APP_URL (overridable with YELLO_URL) and the yello:// scheme
├── src/desktopAuth.ts   Google sign-in through the system browser (PKCE handoff)
├── src/main.ts          Window, navigation rules, deep links, offline fallback
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
