# Yello Electron Desktop App

A desktop application for Yello CRM contact management built with Electron. The app bundles the Fastify backend and React frontend into a single distributable.

## Architecture

The Electron app works by:

1. **Spawning the backend process** - Runs the Node.js Fastify backend (`backend/dist/server.js`) using Electron's bundled Node.js runtime with `ELECTRON_RUN_AS_NODE=1`
2. **Starting the frontend** - Loads the pre-built React frontend from `frontend/dist/`
3. **Communicating via HTTP** - The Electron BrowserWindow connects to the backend on `http://localhost:3456`
4. **Managing storage** - Uses Electron's user data directory to store databases and config files

## Running the App

### Development

```bash
# From root directory
npm run electron:dev
```

This will:
- Build the frontend to `frontend/dist/`
- Rebuild native modules (better-sqlite3, sharp) for Electron's Node ABI
- Compile TypeScript in `electron/src/` to `electron/dist/`
- Launch the Electron app with a splash screen
- Display the dashboard once the backend is ready

### Production Build

```bash
# From root directory
npm run electron:build
```

This creates a signed DMG installer in `dist-electron/`. The build:
- Compiles frontend and backend (production mode)
- Bundles Electron app with electron-builder
- Includes all dependencies and resources
- Signs code (requires valid Apple certificate for distribution)

## App Icon

The app icon is located at `build-resources/icon.icns` (macOS format).

To update the app icon:

1. **Create a new icon:**
   - Prepare a 512×512 PNG image
   - Use tools like [electron-icon-builder](https://www.npmjs.com/package/electron-icon-builder) or [ImageMagick](https://imagemagick.org/)

2. **Convert to ICNS (macOS):**
   ```bash
   # Using sips (built-in macOS tool)
   sips -s format icns icon-512.png -o build-resources/icon.icns

   # Or using ImageMagick
   convert icon-512.png -define icon:auto-resize=512,256,128,64,32,16 build-resources/icon.icns
   ```

3. **Update Electron Builder** - The icon is automatically picked up from `electron-builder.yml`

## Environment Variables

Environment variables are loaded from multiple locations in this order:

1. **User config directory** (highest priority): `~/.config/Yello/.env` on Linux/macOS
2. **Backend .env**: `backend/.env` (for development)
3. **None** - If neither file exists, features requiring API keys won't work

### Configuration

Copy `.env.example` to your config location and fill in values:

```bash
# macOS/Linux
mkdir -p ~/.config/Yello
cp electron/.env.example ~/.config/Yello/.env
# Edit with your API keys
```

### Available Variables

| Variable | Description | Required | Where to Get |
|----------|-------------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | ✅ Yes | [Google Cloud Console](https://console.cloud.google.com/) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | ✅ Yes | [Google Cloud Console](https://console.cloud.google.com/) |
| `HERE_API_KEY` | HERE.com geocoding API key | ❌ No | [HERE Developer](https://developer.here.com/) - Free tier: 250K requests/month |
| `APIFY_API_TOKEN` | Apify LinkedIn enrichment token | ❌ No | [Apify](https://apify.com/) |

**Google OAuth Setup:**
- Create a project in [Google Cloud Console](https://console.cloud.google.com/)
- Enable Google+ API
- Create OAuth 2.0 credentials (Desktop application)
- Add authorized redirect URI: `http://localhost:3456/api/auth/google/callback`
- Copy the Client ID and Secret to your `.env`

## Data Storage

All user data is stored in Electron's user data directory:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/yello-electron/` |
| Linux | `~/.config/yello-electron/` |
| Windows | `%APPDATA%\yello-electron\` |

### Directory Structure

```
~/Library/Application Support/yello-electron/
├── auth.db              # Authentication database (users, sessions, profile images)
├── .env                 # User-provided environment variables (optional)
├── .session-secret      # Auto-generated session secret (created on first run)
└── users/
    └── {userId}/
        ├── contacts.db  # Per-user contact database
        ├── settings     # User-specific settings
        └── photos/      # User's contact photos
```

The session secret is generated on first launch and persists to maintain secure sessions across restarts.

## Development Workflow

### Building and Running Locally

1. **Install dependencies:**
   ```bash
   npm install
   cd electron && npm install
   cd ../backend && npm install
   cd ../frontend && npm install
   ```

2. **Set up environment variables** (optional for basic testing):
   ```bash
   cp backend/.env.example backend/.env
   # Add Google OAuth credentials if testing auth
   ```

3. **Run dev server:**
   ```bash
   npm run electron:dev
   ```

### Native Module Management

The app uses native modules (`better-sqlite3`, `sharp`) that must be compiled for Electron's Node.js ABI.

**Important:** After running `npm run electron:dev`, the native modules in `backend/node_modules/` are compiled for Electron's ABI. If you then run `npm run dev` (plain Node.js), native modules will fail.

To fix, rebuild for system Node.js:
```bash
cd backend && npm rebuild
```

The `npm run electron:dev` script automatically handles this via the rebuild step.

### Making Changes

- **Backend changes** → `backend/src/*.ts` → Run `electron:dev` (rebuilds backend)
- **Frontend changes** → `frontend/src/**/*.tsx` → Run `electron:dev` (rebuilds frontend)
- **Electron changes** → `electron/src/*.ts` → Run `electron:dev` (rebuilds electron)

All builds happen automatically when you run `npm run electron:dev`.

## Debugging

### View Logs

**Development console:**
- DevTools: Press `Ctrl+Shift+I` (or `Cmd+Shift+I` on macOS)
- Backend output: Shown in terminal during `npm run electron:dev`

**Electron logs:**
- Check terminal output for `[Electron]` and `[Backend]` prefixed messages

### Common Issues

**1. Native module errors (ERR_DLOPEN_FAILED)**
```bash
# Rebuild native modules for Electron
cd electron && npm run rebuild

# Or if switching back to regular Node.js
cd backend && npm rebuild
```

**2. Backend fails to start**
- Check port 3456 is not in use: `lsof -i :3456`
- Verify `backend/dist/server.js` exists: `npm run build:all`
- Check environment variables are set: `echo $GOOGLE_CLIENT_ID`

**3. Frontend doesn't load (404 error)**
- Ensure frontend built to `frontend/dist/`: `cd frontend && npm run build`
- Backend should serve frontend automatically when dist exists

**4. Auth doesn't work**
- Verify Google OAuth credentials are set: `cat ~/.config/Yello/.env`
- Check redirect URI matches in Google Cloud Console: `http://localhost:3456/api/auth/google/callback`

## Building for Distribution

### macOS

```bash
npm run electron:build
```

Creates `dist-electron/Yello-1.0.0-arm64.dmg` and `dist-electron/Yello-1.0.0-x64.dmg`

**Code signing (required for distribution):**
- The build script uses `hardenedRuntime: true` and entitlements in `build-resources/entitlements.mac.plist`
- For signed builds, you'll need a valid Apple Developer Certificate
- Set environment variable: `CSC_LINK` (path to certificate) and `CSC_KEY_PASSWORD`

### Notarization (required for App Store/distribution)

After building, notarize with Apple:
```bash
xcrun altool --notarize-app \
  -f dist-electron/Yello-1.0.0-arm64.dmg \
  --primary-bundle-id com.yello.crm \
  -u "your-apple-id@example.com" \
  -p "app-specific-password"
```

## Entitlements

macOS app entitlements are configured in `build-resources/entitlements.mac.plist`:

- **com.apple.security.files.user-selected.read-write** - Read/write user files (for contact imports)
- **com.apple.security.network.client** - Network access (for backend and API calls)
- **com.apple.security.temporary-exception.files.absolute-path.read-write** - Temp file access

## Scripts

Available npm scripts in `/electron/package.json`:

```bash
npm run build      # Compile TypeScript (electron/src → electron/dist)
npm run dev        # Build + launch Electron app
npm run rebuild    # Rebuild native modules for Electron's Node ABI
```

Top-level scripts (from root):

```bash
npm run electron:dev      # Full build and dev launch
npm run electron:build    # Full production build
```

## Dependencies

### Development

- **electron** (v32.0.0) - Electron framework
- **electron-builder** (v25.0.0) - Packaging and distribution
- **@electron/rebuild** (v3.6.0) - Rebuild native modules for Electron
- **typescript** (v5.9.3) - TypeScript compiler

### Runtime

- **dotenv** (v16.0.0) - Load environment variables

**Backend dependencies** (bundled):
- **better-sqlite3** - SQLite database (native module)
- **sharp** - Image processing (native module)
- **fastify** - HTTP server
- And others (see `backend/package.json`)

## Configuration Files

| File | Purpose |
|------|---------|
| `electron/package.json` | Electron app metadata and dependencies |
| `electron/tsconfig.json` | TypeScript configuration for Electron |
| `electron-builder.yml` | Build and packaging configuration |
| `build-resources/icon.icns` | macOS app icon |
| `build-resources/entitlements.mac.plist` | macOS security/capability entitlements |
| `electron/.env.example` | Example environment variables |

## Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [Electron Builder](https://www.electron.build/)
- [electron-rebuild](https://github.com/electron/electron-rebuild)
- [Yello Backend API](../backend/README.md)
- [Yello Frontend](../frontend/README.md)
