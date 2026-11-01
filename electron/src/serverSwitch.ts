import { app, BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent, Menu, MenuItemConstructorOptions, session, WebContents } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { LOCAL_URL, PROTOCOL, RAILWAY_URL, ServerTarget, appUrl, isAppUrl, serverTarget, urlOverride } from './config';
import { clearPendingSignIn } from './desktopAuth';
import { adminSeen, markAdminSeen, saveServerTarget } from './serverChoice';
import { textBlastRunning } from './textBlast/ipc';

// Admin testing tool: switch the app between Railway and a local backend, and
// pull a copy of production into the local server as a data set
// (backend/src/services/datasets.ts). Reached from the Server menu, the Admin
// page (window.yelloDesktop.server) and the offline page's "Back to Railway".

/** Link on the offline page; the only switch accepted from a plain navigation. */
export const BACK_TO_RAILWAY_LINK = `${PROTOCOL}://server/railway`;

const DATASET_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

export interface ServerState {
  target: ServerTarget;
  url: string;
  railwayUrl: string;
  localUrl: string;
  override: string | null;
  adminSeen: boolean;
}

let getMainWindow: () => BrowserWindow | null = () => null;
let openMainWindow: () => BrowserWindow = () => {
  throw new Error('Server switching is not set up');
};

export function serverState(): ServerState {
  return {
    target: serverTarget(),
    url: appUrl(),
    railwayUrl: RAILWAY_URL,
    localUrl: LOCAL_URL,
    override: urlOverride(),
    adminSeen: adminSeen(),
  };
}

/** Window title suffix, so it's always clear which server is open. */
export function decorateTitle(title: string): string {
  if (serverTarget() !== 'local') return title;
  const override = urlOverride();
  const label = override && override !== LOCAL_URL ? new URL(override).host : 'Local';
  return title ? `${title} — ${label}` : `Yello — ${label}`;
}

export function switchServer(next: ServerTarget, landingPath: '/' | '/admin' = '/'): ServerState {
  if (urlOverride()) throw new Error('YELLO_URL is set for this run, so the server can\'t be switched.');
  if (next === serverTarget()) return serverState();
  if (textBlastRunning()) throw new Error('A text blast is still sending. Stop it in Tools › Text Blast before switching servers.');

  saveServerTarget(next);
  clearPendingSignIn();

  const main = getMainWindow();
  for (const win of BrowserWindow.getAllWindows()) {
    if (win !== main && !win.isDestroyed()) win.close();
  }
  if (main) void main.loadURL(`${appUrl()}${landingPath}`);
  else openMainWindow();

  buildAppMenu();
  return serverState();
}

/** Switch from a menu or link: errors go to a dialog instead of a promise. */
function switchFromUi(next: ServerTarget): void {
  try {
    switchServer(next);
  } catch (error) {
    buildAppMenu(); // put the radio check back
    void dialog.showMessageBox({
      type: 'warning',
      message: 'Couldn\'t switch servers',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Handles yello://server/railway. Returns true when the URL was that link. */
export function handleServerLink(url: string): boolean {
  if (url !== BACK_TO_RAILWAY_LINK) return false;
  switchFromUi('railway');
  return true;
}

export function buildAppMenu(): void {
  const isMac = process.platform === 'darwin';
  const override = urlOverride();
  const target = serverTarget();
  const showServerMenu = adminSeen() || target === 'local' || override !== null;

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
  ];

  if (showServerMenu) {
    template.push({
      label: 'Server',
      submenu: [
        {
          label: 'Railway',
          type: 'radio',
          checked: target === 'railway',
          enabled: !override,
          click: () => switchFromUi('railway'),
        },
        {
          label: `Local (${new URL(LOCAL_URL).host})`,
          type: 'radio',
          checked: target === 'local',
          enabled: !override,
          click: () => switchFromUi('local'),
        },
        ...(override ? [{ label: `Set by YELLO_URL: ${override}`, enabled: false } as MenuItemConstructorOptions] : []),
        { type: 'separator' },
        {
          label: 'Server & Data Settings…',
          click: () => {
            const win = getMainWindow() ?? openMainWindow();
            void win.loadURL(`${appUrl()}/admin`);
          },
        },
      ],
    });
  }

  template.push({ role: 'windowMenu' });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function errorFrom(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json() as { error?: string };
    if (body.error) return body.error;
  } catch { /* keep the fallback */ }
  return fallback;
}

/**
 * Downloads a backup from Railway with this app's Railway session, then
 * imports it into the local server as data set `name`.
 */
async function pullProductionCopy(name: string, sender: WebContents): Promise<{ name: string }> {
  if (serverTarget() !== 'local') throw new Error('Switch to Local first: the copy goes into the local server.');
  if (!DATASET_NAME.test(name) || name === 'dev') {
    throw new Error('Use 1 to 40 lowercase letters, digits or dashes, not "dev".');
  }

  const report = (stage: 'downloading' | 'importing', bytes: number) => {
    if (!sender.isDestroyed()) sender.send('server:pull-progress', { stage, bytes });
  };

  report('downloading', 0);
  const res = await session.defaultSession.fetch(`${RAILWAY_URL}/api/admin/backup`, { credentials: 'include' });
  if (res.status === 401 || res.status === 403) {
    throw new Error('This app isn\'t signed in to Railway as the admin. Switch to Railway, sign in, switch back and try again.');
  }
  if (!res.ok || !res.body) throw new Error(await errorFrom(res, `Railway answered ${res.status}`));

  const chunks: Buffer[] = [];
  let bytes = 0;
  let lastReport = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    bytes += value.byteLength;
    if (Date.now() - lastReport > 250) {
      report('downloading', bytes);
      lastReport = Date.now();
    }
  }
  const archive = Buffer.concat(chunks);

  // Keep the last download next to the app data, handy if the import fails
  try {
    fs.writeFileSync(path.join(app.getPath('temp'), 'yello-last-backup.tar.gz'), archive);
  } catch { /* not needed for the import */ }

  report('importing', bytes);
  const up = await session.defaultSession.fetch(`${appUrl()}/api/admin/datasets/import?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/gzip' },
    body: archive,
  });
  if (!up.ok) throw new Error(await errorFrom(up, `The local server answered ${up.status}`));
  return { name };
}

function fromApp(event: IpcMainInvokeEvent): boolean {
  return isAppUrl(event.senderFrame?.url ?? '');
}

export function registerServerSwitch(windows: {
  getMainWindow: () => BrowserWindow | null;
  openMainWindow: () => BrowserWindow;
}): void {
  getMainWindow = windows.getMainWindow;
  openMainWindow = windows.openMainWindow;

  const handle = <A extends unknown[], R>(channel: string, fn: (event: IpcMainInvokeEvent, ...args: A) => Promise<R> | R) => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!fromApp(event)) throw new Error('Not allowed');
      return fn(event, ...(args as A));
    });
  };

  handle('server:get', () => serverState());
  handle('server:switch', (_event, next: unknown, landing: unknown) => {
    if (next !== 'railway' && next !== 'local') throw new Error('Unknown server');
    return switchServer(next, landing === '/admin' ? '/admin' : '/');
  });
  handle('server:mark-admin', () => {
    if (markAdminSeen()) buildAppMenu();
    return serverState();
  });
  handle('server:pull-production', (event, name: unknown) => pullProductionCopy(String(name ?? ''), event.sender));

  buildAppMenu();
}
