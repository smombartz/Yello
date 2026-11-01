import { app, ipcMain, IpcMainInvokeEvent, shell } from 'electron';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { isAppUrl } from '../config';
import { checkReadable, DB_PATHS, type DesktopChannel, type ScanResult } from './readers';

// IPC for Top contacts' iMessage and WhatsApp sources. Every channel is
// prefixed `messages:` and only answers pages on the Yello origin. The page
// gets daily counts per person and uploads them itself (with its session).

const FULL_DISK_ACCESS_PANE = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';
const CHANNELS: DesktopChannel[] = ['imessage', 'whatsapp'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function fromApp(event: IpcMainInvokeEvent): boolean {
  return isAppUrl(event.senderFrame?.url ?? '');
}

function scanInWorker(channel: DesktopChannel, sinceDay: string | null): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'worker.js'), { workerData: { channel, sinceDay } });
    worker.once('message', (msg: { result?: ScanResult; error?: string }) => {
      if (msg.result) resolve(msg.result);
      else reject(new Error(msg.error ?? 'scan failed'));
      void worker.terminate();
    });
    worker.once('error', reject);
  });
}

const running = new Map<DesktopChannel, Promise<ScanResult>>();

export function registerMessageActivityIpc(): void {
  ipcMain.handle('messages:status', (event) => {
    if (!fromApp(event)) throw new Error('not allowed');
    if (process.platform !== 'darwin') {
      return Object.fromEntries(CHANNELS.map(c => [c, { state: 'not_found' }]));
    }
    return Object.fromEntries(CHANNELS.map(c => [c, checkReadable(DB_PATHS[c])]));
  });

  ipcMain.handle('messages:scan', (event, channel: unknown, sinceDay: unknown) => {
    if (!fromApp(event)) throw new Error('not allowed');
    if (!CHANNELS.includes(channel as DesktopChannel)) throw new Error('unknown channel');
    if (sinceDay !== null && (typeof sinceDay !== 'string' || !DAY_RE.test(sinceDay))) throw new Error('invalid day');
    const c = channel as DesktopChannel;
    // One scan per channel at a time; a second request shares the first
    let scan = running.get(c);
    if (!scan) {
      scan = scanInWorker(c, sinceDay as string | null).finally(() => running.delete(c));
      running.set(c, scan);
    }
    return scan;
  });

  ipcMain.handle('messages:open-settings', (event) => {
    if (!fromApp(event)) throw new Error('not allowed');
    return shell.openExternal(FULL_DISK_ACCESS_PANE);
  });

  // Full Disk Access applies from the next launch. quit (not exit) so other
  // features' before-quit checks still run.
  ipcMain.handle('messages:relaunch', (event) => {
    if (!fromApp(event)) throw new Error('not allowed');
    app.relaunch();
    app.quit();
  });
}
