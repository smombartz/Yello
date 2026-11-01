import { app, ipcMain, IpcMainInvokeEvent, shell } from 'electron';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { isAppUrl } from '../config';
import { checkReadable, DB_PATHS, type DesktopChannel, type ScanResult } from './readers';
import { BACKUP_ID_RE, listBackups, type BackupScanResult } from './iphoneBackup';

// IPC for Top contacts' iMessage and WhatsApp sources. Every channel is
// prefixed `messages:` and only answers pages on the Yello origin. The page
// gets daily counts per person and uploads them itself (with its session).

const FULL_DISK_ACCESS_PANE = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';
const CHANNELS: DesktopChannel[] = ['imessage', 'whatsapp'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function fromApp(event: IpcMainInvokeEvent): boolean {
  return isAppUrl(event.senderFrame?.url ?? '');
}

type WorkerJob =
  | { kind: 'mac'; channel: DesktopChannel; sinceDay: string | null }
  | { kind: 'backup'; backupId: string; password: string | null };

function runInWorker<T>(job: WorkerJob): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'worker.js'), { workerData: job });
    worker.once('message', (msg: { result?: T; error?: string }) => {
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
      scan = runInWorker<ScanResult>({ kind: 'mac', channel: c, sinceDay: sinceDay as string | null }).finally(() => running.delete(c));
      running.set(c, scan);
    }
    return scan;
  });

  // iPhone backups on this Mac (for WhatsApp's older history)
  ipcMain.handle('messages:backups', (event) => {
    if (!fromApp(event)) throw new Error('not allowed');
    if (process.platform !== 'darwin') return { state: 'not_found', backups: [] };
    try {
      const backups = listBackups();
      return { state: backups.length ? 'ready' : 'not_found', backups };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES') return { state: 'needs_full_disk_access', backups: [] };
      return { state: 'error', error: err instanceof Error ? err.message : String(err), backups: [] };
    }
  });

  // WhatsApp counts from one backup; the password is only passed to the worker, never kept
  let backupScan: Promise<BackupScanResult> | null = null;
  ipcMain.handle('messages:scan-backup', (event, backupId: unknown, password: unknown) => {
    if (!fromApp(event)) throw new Error('not allowed');
    if (typeof backupId !== 'string' || !BACKUP_ID_RE.test(backupId)) throw new Error('unknown backup');
    if (password !== null && (typeof password !== 'string' || password.length > 1000)) throw new Error('invalid password');
    if (backupScan) throw new Error('A backup is already being read.');
    backupScan = runInWorker<BackupScanResult>({ kind: 'backup', backupId, password: password as string | null })
      .finally(() => { backupScan = null; });
    return backupScan;
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
