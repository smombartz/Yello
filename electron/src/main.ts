import { app, BrowserWindow, dialog, session, shell } from 'electron';
import { execFile } from 'child_process';
import * as path from 'path';
import { PROTOCOL, appUrl, isAppUrl, serverTarget, urlOverride } from './config';
import { exchangeUrlFor, flowForUrl, startSystemSignIn } from './desktopAuth';
import { registerTextBlastIpc, textBlastRunning } from './textBlast/ipc';
import { registerMessageActivityIpc } from './messageActivity/ipc';
import { loadServerChoice } from './serverChoice';
import { decorateTitle, handleServerLink, registerServerSwitch } from './serverSwitch';

// A window onto the hosted Yello deployment. There is no local backend: all
// data lives on the server, and the session cookie lives in this app's
// cookie jar (~/Library/Application Support/Yello). The admin can point the
// app at a local backend instead (serverSwitch.ts).

let mainWindow: BrowserWindow | null = null;

const offlinePage = path.join(__dirname, '..', 'pages', 'offline.html');

const EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'tel:', 'sms:']);

// tel: goes to whatever app last claimed it (Chrome, Zoom, Teams...). On macOS,
// hand it to FaceTime explicitly so calls ring out through the iPhone
// ("Calls from iPhone"); fall back to the default handler if that fails.
function openTelInFaceTime(url: string): void {
  execFile('open', ['-b', 'com.apple.FaceTime', url], (error) => {
    if (error) void shell.openExternal(url);
  });
}

function openExternally(url: string): void {
  try {
    const { protocol } = new URL(url);
    if (!EXTERNAL_PROTOCOLS.has(protocol)) return;
    if (protocol === 'tel:' && process.platform === 'darwin') {
      openTelInFaceTime(url);
    } else {
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
      // window.yelloDesktop: local features (Text Blast) for the Yello page
      preload: path.join(__dirname, 'preload.js'),
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
    const local = serverTarget() === 'local' && !urlOverride();
    void win.loadFile(offlinePage, { query: { url: appUrl(), local: local ? '1' : '0' } });
  });

  void win.loadURL(appUrl());
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
  if (handleServerLink(url)) return;
  const win = showMainWindow();
  const exchange = exchangeUrlFor(url);
  if (exchange) void win.loadURL(exchange);
}

// Mark windows on the local server in the title bar
app.on('browser-window-created', (_event, win) => {
  win.on('page-title-updated', (event, title) => {
    event.preventDefault();
    win.setTitle(decorateTitle(title));
  });
});

// Every window, including same-origin popups: keep the app origin in-app,
// send Google sign-in to the system browser, and everything else outside.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event) => {
    const flow = flowForUrl(event.url);
    if (event.url.startsWith(`${PROTOCOL}://server/`)) {
      // "Back to Railway" on the offline page
      event.preventDefault();
      handleServerLink(event.url);
    } else if (flow) {
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
    loadServerChoice(app.getPath('userData'));

    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback, details) => {
      callback(isAppUrl(details.requestingUrl));
    });
    session.defaultSession.setPermissionCheckHandler((_contents, _permission, requestingOrigin) =>
      isAppUrl(requestingOrigin)
    );

    // Packaged builds get the icon from icon.icns; in dev the Dock would show Electron's
    if (process.defaultApp) {
      app.dock?.setIcon(path.join(__dirname, '..', '..', 'build-resources', 'icon.png'));
    }

    registerTextBlastIpc();
    registerMessageActivityIpc();
    registerServerSwitch({ getMainWindow: () => mainWindow, openMainWindow: showMainWindow });
    showMainWindow();
  });

  // Quitting mid-blast is safe (each person's status is saved before and after every
  // text), but say so, since the rest of the list won't go out until it's resumed.
  app.on('before-quit', (event) => {
    if (!textBlastRunning()) return;
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Keep sending', 'Quit'],
      defaultId: 0,
      cancelId: 0,
      message: 'A text blast is still sending',
      detail: 'If you quit, the rest of the list waits until you resume it in Tools › Text Blast. Nobody gets the same text twice.',
    });
    if (choice === 0) event.preventDefault();
  });

  app.on('activate', () => {
    if (app.isReady()) showMainWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
