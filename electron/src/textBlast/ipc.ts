import { BrowserWindow, ipcMain, IpcMainInvokeEvent, powerSaveBlocker, shell } from 'electron';
import { isAppUrl } from '../config';
import { textBlastApi } from './api';
import { checkChatDb, latestOutgoing } from './chatDb';
import { checkAccounts, launchMessages, sendViaMessages } from './messages';
import { TextBlastRunner } from './runner';
import type { RunnerProgress, SetupState } from './types';

// IPC for Tools › Text Blast. Every channel is prefixed `textblast:` and only answers
// pages on the Yello origin, so no other site loaded in the app can send texts.

const SETTINGS_PANES: Record<string, string> = {
  automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
  'full-disk-access': 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
};

let setup: SetupState | null = null;

async function runSetupCheck(): Promise<SetupState> {
  const macos = process.platform === 'darwin';
  const accounts = macos ? await checkAccounts() : { imessage: null, sms: null, error: 'Text Blast needs a Mac.' };
  const db = macos ? checkChatDb() : { ok: false, error: 'not a Mac' };
  setup = {
    macos,
    imessage: accounts.imessage,
    sms: accounts.sms,
    accountsError: accounts.error,
    chatDb: db.ok,
    chatDbError: db.error,
    checkedAt: new Date().toISOString(),
  };
  return setup;
}

function broadcast(progress: RunnerProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && isAppUrl(win.webContents.getURL())) win.webContents.send('textblast:progress', progress);
  }
}

const runner = new TextBlastRunner({
  api: textBlastApi,
  send: sendViaMessages,
  launchMessages,
  latestOutgoing: (handle, since) => latestOutgoing(handle, since),
  chatDbReadable: () => setup?.chatDb ?? false,
  smsAvailable: () => setup?.sms ?? null,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  random: () => Math.random(),
  keepAwake: () => {
    const id = powerSaveBlocker.start('prevent-app-suspension');
    return () => powerSaveBlocker.stop(id);
  },
}, broadcast);

function fromApp(event: IpcMainInvokeEvent): boolean {
  return isAppUrl(event.senderFrame?.url ?? '');
}

/** Registers the Text Blast IPC handlers. Call once, after app is ready. */
export function registerTextBlastIpc(): void {
  const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R) => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!fromApp(event)) throw new Error('Not allowed');
      return fn(...(args as A));
    });
  };

  handle('textblast:setup', async (refresh?: boolean) => (refresh || !setup ? runSetupCheck() : setup));

  handle('textblast:progress', () => runner.snapshot());

  handle('textblast:start', async (blastId: number) => {
    if (!Number.isInteger(blastId) || blastId <= 0) throw new Error('Invalid blast');
    if (runner.running) throw new Error('Already sending another blast.');
    if (!setup) await runSetupCheck();
    else setup = { ...setup, chatDb: checkChatDb().ok };
    // Runs in the background; progress arrives as textblast:progress events.
    void runner.start(blastId).catch(() => {});
    return runner.snapshot();
  });

  handle('textblast:stop', () => {
    runner.stop();
    return runner.snapshot();
  });

  handle('textblast:test', async (phone: string, text: string, simulate: boolean) => {
    if (typeof phone !== 'string' || typeof text !== 'string' || !phone || !text) throw new Error('Phone and text are required');
    if (!setup) await runSetupCheck();
    return runner.testSend(phone, text, !!simulate);
  });

  handle('textblast:open-settings', async (pane: string) => {
    const url = SETTINGS_PANES[pane];
    if (url) await shell.openExternal(url);
  });
}

/** True while a blast is sending (so quitting can warn). */
export function textBlastRunning(): boolean {
  return runner.running;
}
