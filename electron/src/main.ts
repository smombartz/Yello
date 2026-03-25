import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

// Load .env from multiple locations with fallback
const userDataDir = app.getPath('userData');
const isDev = !app.isPackaged;
const resourcesBase = isDev
  ? path.join(__dirname, '..', '..')
  : process.resourcesPath;

const userEnvPath = path.join(userDataDir, '.env');
const backendEnvPath = path.join(resourcesBase, 'backend', '.env');

if (fs.existsSync(userEnvPath)) {
  console.log('[Electron] Loading .env from user data:', userEnvPath);
  dotenv.config({ path: userEnvPath });
} else if (fs.existsSync(backendEnvPath)) {
  console.log('[Electron] Loading .env from backend:', backendEnvPath);
  dotenv.config({ path: backendEnvPath });
} else {
  console.log('[Electron] No .env file found (checked:', userEnvPath, 'and', backendEnvPath, ')');
}

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const serverPath = path.join(resourcesBase, 'backend', 'dist', 'server.js');
const appUrl = 'http://localhost:3456';

/**
 * Get or create a persistent session secret stored in user data directory
 */
function getOrCreateSessionSecret(dir: string): string {
  const secretPath = path.join(dir, '.session-secret');
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf8').trim();
  }
  const secret = crypto.randomBytes(64).toString('hex');
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

/**
 * Ensure user data directory exists
 */
function ensureDataDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Spawn backend server with Electron environment
 */
function spawnBackend(): ChildProcess {
  ensureDataDir(userDataDir);

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: app.isPackaged ? 'production' : 'development',
    PORT: '3456',
    AUTH_DATABASE_PATH: path.join(userDataDir, 'auth.db'),
    USER_DATA_PATH: path.join(userDataDir, 'users'),
    APP_URL: appUrl,
    SESSION_SECRET: getOrCreateSessionSecret(userDataDir),
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
    HERE_API_KEY: process.env.HERE_API_KEY || '',
    APIFY_API_TOKEN: process.env.APIFY_API_TOKEN || '',
  };

  console.log(`[Electron] Spawning backend: ${process.execPath} ${serverPath}`);
  const backend = spawn(process.execPath, [serverPath], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Log backend output for debugging
  backend.stdout?.on('data', (data) => {
    console.log(`[Backend] ${data.toString().trim()}`);
  });

  backend.stderr?.on('data', (data) => {
    console.error(`[Backend Error] ${data.toString().trim()}`);
  });

  backend.on('error', (err) => {
    console.error('[Electron] Failed to spawn backend:', err);
  });

  backend.on('exit', (code, signal) => {
    console.log(`[Backend] Exited with code ${code}, signal ${signal}`);
  });

  return backend;
}

/**
 * Poll health endpoint until backend is ready
 */
function waitForBackend(timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const pollInterval = 200;

    const poll = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${appUrl}/health`, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          console.log('[Electron] Backend is ready');
          resolve();
          return;
        }
      } catch {
        // Not ready yet, continue polling
      }

      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Backend did not become ready within ${timeoutMs}ms`));
        return;
      }

      setTimeout(poll, pollInterval);
    };

    poll();
  });
}

/**
 * Create splash screen
 */
function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const splashPath = isDev
    ? path.join(__dirname, '..', 'splash.html')
    : path.join(process.resourcesPath, 'electron', 'splash.html');

  splash.loadFile(splashPath);
  splash.show();

  return splash;
}

/**
 * Create main application window
 */
function createMainWindow(): BrowserWindow {
  const mainWin = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Strip Electron user agent for OAuth compatibility
  const ua = mainWin.webContents.getUserAgent()
    .replace(/Electron\/[\d.]+\s?/g, '')
    .trim();
  mainWin.webContents.setUserAgent(ua);

  mainWin.loadURL(appUrl);

  // Open external links in system browser
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    const isLocalhost = new URL(url).hostname === 'localhost';
    if (!isLocalhost) {
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  return mainWin;
}

/**
 * App initialization on Electron ready
 */
async function initApp(): Promise<void> {
  try {
    // Show splash screen
    splashWindow = createSplashWindow();

    // Spawn backend
    backendProcess = spawnBackend();

    // Wait for backend to be ready
    console.log('[Electron] Waiting for backend...');
    await waitForBackend();

    // Create main window
    mainWindow = createMainWindow();
    mainWindow.show();

    // Close splash
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }

    console.log('[Electron] App initialized');
  } catch (error) {
    console.error('[Electron] Initialization failed:', error);
    if (splashWindow) {
      splashWindow.close();
    }
    app.quit();
  }
}

/**
 * Cleanup on app quit
 */
function cleanup(): void {
  if (backendProcess) {
    console.log('[Electron] Terminating backend...');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

// App event handlers
app.on('ready', initApp);

app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  cleanup();
});

app.on('activate', () => {
  if (mainWindow === null) {
    initApp();
  }
});
