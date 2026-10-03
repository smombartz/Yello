# Yello desktop app as a thin client of the Railway deployment

## Context

Today `electron/src/main.ts` spawns its own copy of the backend (`backend/dist/server.js`) with a local SQLite store in `~/Library/Application Support/Yello/`, and loads `http://localhost:3456`. That means the desktop app has separate data from the web app, needs its own Google OAuth credentials in a `.env`, a native `better-sqlite3` rebuild, and bundles the whole backend and frontend.

**Goal:** the desktop app opens the hosted Railway app in a window and shares the same account and data as the web.

**Decisions made:**
- **Replace local mode.** The app no longer bundles a backend. Data from the old local mode stays on disk untouched. To keep it, export it as VCF from the old build and import it into the hosted app.
- **Sign in through the system browser.** Google blocks sign-in inside embedded browsers, so all three Google flows (login, Gmail re-auth, Contacts re-auth) run in Safari or Chrome. The backend then hands a one-time code back to the app through a `yello://` link, and the app exchanges it for a session cookie. The code is bound to a PKCE secret the app holds, so an intercepted link is useless on its own.

No frontend changes are needed. All three entry points are plain in-window navigations (`AuthContext.tsx:26`, `EmailHistorySection.tsx:57,68`, `GoogleContactsImportContent.tsx:122`), which Electron can intercept. No Google Cloud console changes are needed either, because the redirect URI stays the Railway callback. The old `localhost:3456` redirect URI can be removed afterwards.

**Input needed at implementation start:** the production URL. It isn't in the repo.

## How the handoff works

```
App window: user clicks "Sign in with Google" (navigates to /api/auth/google)
  └─ Electron will-navigate: cancel; make verifier + challenge = base64url(sha256(verifier))
     └─ open in system browser: {APP_URL}/api/auth/desktop/start?flow=login&challenge=…
        └─ backend sets desktop_handoff=<challenge> cookie (10 min) → 302 /api/auth/google
           └─ normal Google OAuth (unchanged) → /api/auth/google/callback
              └─ finishSignIn(): desktop_handoff cookie present →
                 mint one-time code {userId, challenge, redirectPath}, 2-min TTL
                 → HTML page: meta-refresh to yello://auth?code=… plus an "Open Yello" button
                   (no session cookie is set in the system browser)
yello://auth?code=… → Electron open-url
  └─ window.loadURL({APP_URL}/api/auth/desktop/exchange?code=…&verifier=…)
     └─ backend checks sha256(verifier) == challenge, deletes the code (single use),
        createSession → session_id cookie in Electron's jar → 302 redirectPath
```

## Step 1: Backend handoff (TDD)

**New `backend/src/services/desktopHandoff.ts`:**
- In-memory `Map<code, { userId, challenge, redirectPath, expiresAt }>`. Railway runs one process, and a restart only loses codes that are seconds old, so no table and no `docs/database.md` change.
- `DESKTOP_FLOWS = { login: '/api/auth/google', gmail: '/api/auth/google/gmail', contacts: '/api/auth/google/contacts' }`
- `isValidChallenge(s)`: base64url, 43 characters
- `createHandoffCode(userId, challenge, redirectPath)`: 32 random bytes, hex; prunes expired entries
- `consumeHandoffCode(code, verifier)`: deletes the entry *before* checking, so a wrong verifier burns the code. Checks expiry, then `timingSafeEqual` on the challenge. Returns `{ userId, redirectPath } | null`.
- `renderHandoffPage(code)`: a small HTML page with `<meta http-equiv="refresh">` to `yello://auth?code=…` and a visible "Open Yello" link. It also has a "Not using the desktop app? Sign in here" link to `/api/auth/google`. No inline script, so the production CSP from helmet is fine (inline styles are already allowed).

**`backend/src/routes/auth.ts`:**
- Extract `setSessionCookie(reply, sessionId)`; the same cookie options are currently repeated in four places.
- Add `finishSignIn(request, reply, userId, redirectPath)` and replace the three create-session/set-cookie/redirect blocks with it:
  - Gmail flow (`:297-309`): redirect to `/`
  - Contacts flow (`:386-398`): redirect to `/google-contacts-import`
  - Login flow (`:448-465`): redirect to `/dashboard` or `/onboarding`

  If the `desktop_handoff` cookie is present, it clears the cookie and sends `renderHandoffPage(createHandoffCode(...))`. Otherwise it does exactly what happens today.
- `GET /desktop/start?flow&challenge`: validates both (400 if invalid), sets the `desktop_handoff` cookie (httpOnly, secure in production, sameSite lax, 600 s, path `/`), then redirects to `DESKTOP_FLOWS[flow]`. The lax cookie survives the top-level redirect back from accounts.google.com, the same way the existing `gmail_oauth_state` cookie does.
- `GET /desktop/exchange?code&verifier`: on success it calls `createSession`, then `setSessionCookie`, then redirects to `redirectPath`. On failure it redirects to `/?error=auth_failed`. Rate-limited at 20/min like its siblings. Both routes sit under `/api/auth/`, so they are already exempt from the global auth hook (`server.ts:110`).

**Tests:**
- `backend/src/services/__tests__/desktopHandoff.test.ts`: happy path; wrong verifier returns null and burns the code; expired code (fake timers); unknown code; challenge validation
- `backend/src/routes/__tests__/desktopAuth.test.ts`: uses a temp `AUTH_DATABASE_PATH` like `authOnboarding.test.ts`, and `app.inject` against `authRoutes` plus `@fastify/cookie`. It covers: start sets the cookie and gives a 302 to the flow path; a bad flow or challenge gives 400; exchange with a valid code sets `session_id`, redirects, and resolves to the user in the auth DB; replaying the code fails.

**Deploy dependency:** the desktop app can only sign in against production after this backend change is live on Railway. Until then, develop against a local backend with `YELLO_URL=http://localhost:3456`. I won't push or deploy without asking.

## Step 2: Rewrite the Electron app

Bump `electron` 32 → 44.x and `electron-builder` → 26.x. The app now renders remote content, so it should ship a current Chromium. Drop `dotenv` and `@electron/rebuild`.

**`electron/src/config.ts`:** `APP_URL = process.env.YELLO_URL ?? '<production URL>'`, `PROTOCOL = 'yello'`.

**`electron/src/desktopAuth.ts`:**
- `startSystemSignIn(flow)`: generates the verifier and challenge, keeps a single pending verifier in memory (10-minute expiry, newest wins), and opens `/api/auth/desktop/start` with `shell.openExternal`
- `exchangeUrlFor(deepLink)`: parses `yello://auth?code=…`, then returns the exchange URL, or null if there is no pending verifier

**`electron/src/main.ts` (rewritten; no spawn, no health polling, no splash):**
- `app.requestSingleInstanceLock()`. A `second-instance` handler focuses the window and takes the `yello://` URL from argv.
- `app.setAsDefaultProtocolClient('yello')`. In dev, pass `process.execPath` and the script path. `open-url` is registered before `ready`, because macOS can deliver the link at launch.
- The `BrowserWindow` has `contextIsolation`, `sandbox` and no preload. It is shown on `ready-to-show` and loads `APP_URL`.
- `will-navigate`:
  - A path in `DESKTOP_FLOWS`: `preventDefault` and `startSystemSignIn`
  - Another origin: `preventDefault` and `openExternal`
- `setWindowOpenHandler`: same origin opens a new window; anything else uses `openExternal`. This replaces the `localhost` check.
- `did-fail-load` (main frame, not an aborted load): load `electron/pages/offline.html?url=<APP_URL>`, which has a "Can't reach Yello" message and a Retry link.
- `session.setPermissionRequestHandler`: grant only to the `APP_URL` origin.
- macOS lifecycle: keep the app alive when all windows close, and recreate the window on `activate`.

**Delete:** `electron/src/preload.ts`, `electron/splash.html`, `electron/.env.example`, and `electron/data/` (8 contact photos accidentally committed).

## Step 3: Packaging

- Move the config to `electron/electron-builder.yml` and run it from `electron/`:
  - `files: [dist/**/*, pages/**/*]`, output `release/`
  - `directories.buildResources: ../build-resources`. `icon.icns` doesn't exist, so the explicit icon path in the current config would fail the build. Without it, the builder falls back to the default icon until one is added.
  - `protocols: [{ name: Yello, schemes: [yello] }]` registers the scheme in Info.plist
  - Keep the dmg target for arm64 and x64, `hardenedRuntime`, and the entitlements
- `build-resources/entitlements.mac.plist`: remove `network.server` (there's no local server any more).
- Root `package.json`: `electron:dev` becomes `cd electron && npm run dev`, and `electron:build` becomes `cd electron && npm run dist`, with no `build:all` or rebuild step. Remove the root `electron-builder` devDependency and delete the root `electron-builder.yml`.
- `.gitignore`: add `electron/release/`.
- Code signing and notarization are out of scope (they need an Apple Developer ID). An unsigned build still registers `yello://` once it is launched from /Applications.

## Step 4: Docs

- `docs/plans/2026-10-02-electron-remote-client.md`: a copy of this plan, as CLAUDE.md requires
- `electron/README.md`: rewritten as the single desktop guide (architecture, the handoff, dev with `YELLO_URL`, building, migrating local data). Delete the obsolete `ELECTRON_SETUP.md` and `ELECTRON_TEST_RESULTS.md`.
- `docs/readme.md`: a "Desktop app" section
- `CLAUDE.md` Deployment line: "Electron desktop app is a thin client of the Railway deployment (see `electron/README.md`)"
- `docs/log.md`: one entry for the backend handoff, one for the Electron rewrite and packaging
- Worth knowing: your Vercel assessment plan listed "Electron spawns the same backend with local SQLite" as a blocker. This change removes it. I'll leave that untracked plan file alone.

## Verification

- `cd backend && npx vitest run --testTimeout=20000` passes, including the two new suites, and `cd backend && npm run build` is clean
- Local backend running, checked with curl:
  - `GET /api/auth/desktop/start?flow=login&challenge=<43 chars>` returns 302 to `/api/auth/google` with a `Set-Cookie: desktop_handoff`
  - A bad flow returns 400
  - `GET /api/auth/desktop/exchange?code=bogus&verifier=x` returns 302 to `/?error=auth_failed`
- `cd electron && npm run build` (tsc) is clean, and `npm run dist` produces a dmg
- **Yours, since it needs a person and Google:** run `YELLO_URL=http://localhost:3456 npm run electron:dev`, click Sign in, complete it in the browser, and check that "Open Yello" returns you to the app signed in. Repeat for Gmail and Contacts re-auth. After the deploy, repeat once with the packaged app against production, and check that offline mode shows the Retry page.
