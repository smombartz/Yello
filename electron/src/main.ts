import { app, BrowserWindow, session, shell } from 'electron';
import * as path from 'path';
import { APP_URL, PROTOCOL, isAppUrl } from './config';
import { exchangeUrlFor, flowForUrl, startSystemSignIn } from './desktopAuth';

// A window onto the hosted Yello deployment. There is no local backend: all
// data lives on the server, and the session cookie lives in this app's
// cookie jar (~/Library/Application Support/Yello).

let mainWindow: BrowserWindow | null = null;

const offlinePage = path.join(__dirname, '..', 'pages', 'offline.html');

const EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'tel:', 'sms:']);

function openExternally(url: string): void {
  try {
    if (EXTERNAL_PROTOCOLS.has(new URL(url).protocol)) {
      void shell.openExternal(url);
    }
  } catch {
    // Not a URL; ignore
  }
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    mainWindow = null;
  });

  // Server unreachable (offline, deploy in progress): show a retry page
  // instead of a blank window. -3 is ERR_ABORTED, i.e. a cancelled navigation.
  win.webContents.on('did-fail-load', (_event, errorCode, _description, url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || !isAppUrl(url)) return;
    void win.loadFile(offlinePage, { query: { url: APP_URL } });
  });

  void win.loadURL(APP_URL);
  return win;
}

function showMainWindow(): BrowserWindow {
  if (!mainWindow) {
    mainWindow = createMainWindow();
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  return mainWindow;
}

function handleDeepLink(url: string): void {
  const win = showMainWindow();
  const exchange = exchangeUrlFor(url);
  if (exchange) void win.loadURL(exchange);
}

// Every window, including same-origin popups: keep the app origin in-app,
// send Google sign-in to the system browser, and everything else outside.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event) => {
    const flow = flowForUrl(event.url);
    if (flow) {
      event.preventDefault();
      void startSystemSignIn(flow);
    } else if (!isAppUrl(event.url)) {
      event.preventDefault();
      openExternally(event.url);
    }
  });

  contents.on('will-redirect', (event) => {
    if (!isAppUrl(event.url)) {
      event.preventDefault();
      openExternally(event.url);
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: 'allow' };
    openExternally(url);
    return { action: 'deny' };
  });
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // In dev the app runs as `electron .`, so register the script path too
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }

  // macOS delivers yello:// links here, possibly before the app is ready
  app.on('open-url', (event, url) => {
    event.preventDefault();
    void app.whenReady().then(() => handleDeepLink(url));
  });

  // Windows/Linux deliver them as an argument to a second launch
  app.on('second-instance', (_event, argv) => {
    const link = argv.find(arg => arg.startsWith(`${PROTOCOL}://`));
    if (link) handleDeepLink(link);
    else showMainWindow();
  });

  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback, details) => {
      callback(isAppUrl(details.requestingUrl));
    });
    session.defaultSession.setPermissionCheckHandler((_contents, _permission, requestingOrigin) =>
      isAppUrl(requestingOrigin)
    );

    showMainWindow();
  });

  app.on('activate', () => {
    if (app.isReady()) showMainWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
