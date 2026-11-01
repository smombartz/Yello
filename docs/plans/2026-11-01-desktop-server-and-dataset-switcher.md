# Desktop app: switch between Railway and Local, and between local data sets

## Context

Right now the desktop app always opens Railway (`https://yello.up.railway.app`). Pointing it at your local
server means starting it from a terminal with `YELLO_URL` (`npm run electron:local`). The local server
always uses one fixed data folder (`backend/data/auth.db` + `backend/data/users/`), so there's no
quick way to test against a fresh empty database or a copy of production.

Goal (admin only, for testing):
1. **One app with a switcher.** The installed Yello.app can switch between **Railway** and **Local**
   (`http://localhost:3456`) and reloads into the one you pick. The choice is remembered.
2. **Local data sets.** The local server can swap between named data folders: the current dev data,
   new empty sets, and **copies of production** pulled from Railway in one click. Railway itself
   never switches data sets.
3. **Where the switch lives:** a "Server & data" card on the Admin page, plus a **Server** menu in
   the macOS menu bar and a "Back to Railway" link on the "Can't reach Yello" page, so you can always
   get back when the local server isn't running.

Decisions made with the user: one app (not two side by side); data sets are local only; the switch
is on the Admin page and in the app menu.

## Design

### 1. Electron: server switcher (`electron/src/`)

- **New `serverChoice.ts`:** reads/writes `server.json` in `app.getPath('userData')`:
  `{ target: 'railway' | 'local', adminSeen: boolean }`. Constants `RAILWAY_URL`,
  `LOCAL_URL = 'http://localhost:3456'`. `YELLO_URL` still wins for that run (the switcher shows
  "set by YELLO_URL" and is disabled), so `scripts/desktop-local.sh` keeps working unchanged.
- **`config.ts`:** replace the constant `APP_URL` with `appUrl()` (current origin) and make
  `isAppUrl()` compare against it. Update every user: `main.ts`, `desktopAuth.ts`,
  `textBlast/api.ts`, `textBlast/ipc.ts`, `messageActivity/ipc.ts`.
- **Switching** (`switchServer(target)` in `main.ts`): refuse while `textBlastRunning()` (Text Blast
  writes statuses to the current server). Otherwise save the choice, close any extra windows, and
  `loadURL(appUrl())` in the main window. Cookies are kept per origin, so you stay signed in to both.
  A pending desktop sign-in is dropped (its verifier belongs to the old server).
- **Window title:** on `page-title-updated`, add " — Local" when the target is Local, so it's
  always obvious which server you're on.
- **App menu:** set an application menu built from the standard roles (`appMenu`, `fileMenu`,
  `editMenu`, `viewMenu`, `windowMenu`, so copy and paste keep working) plus a **Server** menu with
  radio items *Railway* and *Local (localhost:3456)*. It's shown only when `adminSeen` is set,
  the target is Local, or `YELLO_URL` is set.
- **IPC** (`server:get`, `server:switch`, `server:mark-admin`, `server:pull-production`), exposed in
  `preload.ts` as `window.yelloDesktop.server`. Origin-checked like the existing `textblast:*`
  handlers. The frontend calls `markAdmin()` when the signed-in user is the admin, which sets
  `adminSeen` and reveals the menu.
- **Offline page** (`pages/offline.html`): when the target is Local, show "Is the local server running?
  Start it with `npm run local`" and a **Back to Railway** link (`yello://server/railway`). That link is
  intercepted in `will-navigate`, and only the switch back to Railway is accepted this way.
- **Pull production copy** (`server:pull-production`, name): the main process downloads
  `RAILWAY_URL/api/admin/backup` with `session.defaultSession.fetch` (Railway cookies; confirm cookies
  are sent, or fall back to `net.request({ useSessionCookies: true })`) into a temp file, then
  POSTs it to `LOCAL_URL/api/admin/datasets/import?name=…` with the local cookies. It reports progress
  to the page. A 403 from Railway means "switch to Railway and sign in once, then try again".

### 2. Backend: production backup (works on Railway, admin only)

- **`GET /api/admin/backup`** in `backend/src/routes/admin.ts` (`requireAdmin` already guards the plugin).
  It snapshots into a temp dir using SQLite's `.backup()` (the same pattern as
  `services/sync/remoteBackupService.ts:148`): `auth.db` plus each `users/<id>/contacts.db` (from
  `listUserIds()`), and copies `users/<id>/photos` and `PHOTOS_PATH` (profile images). It skips
  `imports/` and `backups/`. Then it streams `tar -czf - -C <tmp> .` (busybox tar on Alpine, bsdtar
  on macOS) and deletes the temp dir when done. The Admin card on Railway also gets a
  **Download backup** link to this route.

### 3. Backend: local data sets (disabled on Railway)

- **New `backend/src/services/datasets.ts`:**
  - `datasetsEnabled()`: false when any `RAILWAY_ENVIRONMENT*` variable is set, so Railway can never
    switch.
  - Layout: the built-in **`dev`** set is the current `./data/auth.db` + `./data/users`, with no files
    moved. Other sets live in `./data/datasets/<name>/{auth.db,users/}` plus `meta.json`
    (`{ kind: 'empty' | 'production-copy', createdAt }`). Names are `[a-z0-9-]{1,40}`.
  - The active set is stored in `./data/active-dataset.json`. `applyActiveDataset()` runs at the top
    of `server.ts` (before the data-directory diagnostics) and sets `AUTH_DATABASE_PATH` and
    `USER_DATA_PATH`. Every path read already happens at call time (`authDatabase.ts:16`,
    `userDatabase.ts:29`), so setting the env is enough.
  - `switchDataset(name, adminUser)`: calls `closeAllUserDatabases()` and a new `closeAuthDatabase()`
    (in `authDatabase.ts`), swaps the env vars, writes the pointer, and reopens. If the admin user row
    (`google_id`, `email`, `name`, `avatar_url`) is missing, it's copied into the target `auth.db`.
    A session is then created there so you stay signed in. This means exporting
    `createSession`/`setSessionCookie` from `routes/auth.ts`.
  - `importDataset(name, tarStream)`: writes the archive to a temp file, then `tar -xzf` into a new
    `datasets/<name>/`. Unsafe paths are rejected, and an existing name is refused. Then **all stored
    credentials in the copy are wiped**: `users.access_token`/`refresh_token` in `auth.db`, and the
    Apify token and iCloud app password in every `user_settings` (the columns listed in
    `services/tokenKeyRotation.ts`). Production's key wouldn't decrypt them locally anyway, but this
    guarantees a production copy can never reach your real Gmail, iCloud or Google.
  - `createEmptyDataset(name)`, `deleteDataset(name)` (not `dev`, not the active set),
    `listDatasets()` (name, kind, createdAt, user count, size, active).
- **Routes** in `routes/admin.ts` under `/api/admin/datasets`. All return 404 when
  `!datasetsEnabled()`:
  `GET /` · `POST /` (empty) · `POST /switch` · `POST /import?name=` (raw `application/gzip` body,
  through a content-type parser scoped to this plugin) · `DELETE /:name`.
- Switching while an import job or Gmail scan is running can make that job fail. It's a testing
  tool, so the card warns about this rather than blocking.

### 4. Frontend: "Server & data" card (Admin page)

- **New `frontend/src/components/admin/ServerDataCard.tsx`**, rendered at the top of `AdminView.tsx`.
  Hooks go in `api/adminHooks.ts`, and the desktop bridge types in a new `lib/desktopServer.ts` (same
  pattern as `lib/desktopMessages.ts`).
  - **Server row** (desktop app only): Railway / Local segmented control → `yelloDesktop.server.switch`.
  - **On Railway:** "Download backup" link.
  - **On Local:** a data-set list with the active one marked, plus *Switch*, *Delete*, *New empty set*,
    *Pull production copy* (desktop only, with progress) and *Import backup file…* (browser fallback:
    upload a downloaded backup).
- **`Layout.tsx`:** when `isAdmin(user)` and the bridge exists, call `yelloDesktop.server.markAdmin()`
  once.
- Styles go in `styles/pages/admin.css` using `--ds-*` tokens.

### 5. Small extras

- Root `package.json`: `"local": "cd frontend && npm run build && cd ../backend && npm run dev"`,
  which starts the server the Local target needs (the backend serves `frontend/dist`).
- Docs: `electron/README.md` (switcher, menu, pull), `docs/reference.md` (data sets, backup route),
  `docs/database.md` (new on-disk artefacts: `data/datasets/`, `active-dataset.json`; no schema
  change), plus a log entry in `docs/log.md`. Copy this plan to
  `docs/plans/2026-11-01-desktop-server-and-dataset-switcher.md` before starting.

## Critical files

- `electron/src/config.ts`, `main.ts`, `preload.ts`, `desktopAuth.ts`, `textBlast/api.ts`,
  `textBlast/ipc.ts`, `messageActivity/ipc.ts`, new `serverChoice.ts`, `pages/offline.html`
- `backend/src/server.ts`, `routes/admin.ts`, `routes/auth.ts` (exports), `services/authDatabase.ts`
  (`closeAuthDatabase`), new `services/datasets.ts`
- `frontend/src/components/AdminView.tsx`, new `components/admin/ServerDataCard.tsx`,
  `api/adminHooks.ts`, `components/Layout.tsx`, new `lib/desktopServer.ts`, `styles/pages/admin.css`

## Verification

- **Backend tests** (`cd backend && npx vitest run`): new `datasets.test.ts` covering name validation,
  create/list/delete, switching (paths change, the admin row is copied, the session works in the new
  set), import wipes credentials, unsafe tar paths are rejected, and everything returns 404 when
  `RAILWAY_ENVIRONMENT` is set. A backup route test checks that the archive contains `auth.db` and
  `users/<id>/contacts.db`.
- **Electron tests** (`cd electron && npm test`): `serverChoice` load/save/defaults, `isAppUrl` follows
  the switch, `YELLO_URL` override.
- **Builds:** `cd frontend && npm run build`, `cd backend && npm run build`,
  `cd electron && npm run build`.
- **Local curl run** against `npm run local` with an admin session: list, create empty, switch,
  `/api/auth/me` still works after the switch, import a backup file, delete.
- **Handed to you to try in the app:** switch Railway ↔ Local from the menu and the Admin card, Pull
  production copy, switch data sets, stop the local server and use "Back to Railway" on the offline
  page.

## Progress

- [x] Backend: backup route
- [x] Backend: data sets service + routes
- [x] Electron: server switcher, menu, offline page, pull
- [x] Frontend: Server & data card
- [x] Docs + log
- [ ] User checks it in the app (switching, pull production copy, offline fallback)

## Changes

- Data sets also switch `PHOTOS_PATH` (profile images), so each set is self-contained; the backup includes `photos/`.
- `GET /api/admin/datasets` answers `{ enabled: false }` on Railway instead of 404, so the Admin card can show "Download backup" there; the other data-set routes still 404.
- The admin user copied into a new set gets `has_onboarded = 1`, so an empty set doesn't start in onboarding.
- Restart behaviour is covered by a unit test rather than a curl run against a restarted server.
