import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Exposes the desktop app's local features to the Yello page as `window.yelloDesktop`.
// Sandboxed preload: only `electron` can be required here, so keep this file self-contained.
// Each feature is its own key (textBlast, …). Main-process handlers also check the origin.

contextBridge.exposeInMainWorld('yelloDesktop', {
  textBlast: {
    setup: (refresh = false) => ipcRenderer.invoke('textblast:setup', refresh),
    progress: () => ipcRenderer.invoke('textblast:progress'),
    start: (blastId: number) => ipcRenderer.invoke('textblast:start', blastId),
    stop: () => ipcRenderer.invoke('textblast:stop'),
    testSend: (phone: string, text: string, simulate: boolean) => ipcRenderer.invoke('textblast:test', phone, text, simulate),
    openSettings: (pane: 'automation' | 'full-disk-access') => ipcRenderer.invoke('textblast:open-settings', pane),
    onProgress: (callback: (progress: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, progress: unknown) => callback(progress);
      ipcRenderer.on('textblast:progress', listener);
      return () => { ipcRenderer.removeListener('textblast:progress', listener); };
    },
  },
  // Top contacts: iMessage and WhatsApp counts read on this Mac (src/messageActivity/)
  messageActivity: {
    status: () => ipcRenderer.invoke('messages:status'),
    scan: (channel: 'imessage' | 'whatsapp', sinceDay: string | null) => ipcRenderer.invoke('messages:scan', channel, sinceDay),
    openFullDiskAccessSettings: () => ipcRenderer.invoke('messages:open-settings'),
    relaunch: () => ipcRenderer.invoke('messages:relaunch'),
    backups: () => ipcRenderer.invoke('messages:backups'),
    scanBackup: (backupId: string, password: string | null) => ipcRenderer.invoke('messages:scan-backup', backupId, password),
  },
  // Admin: switch between Railway and a local backend, pull production into it (src/serverSwitch.ts)
  server: {
    get: () => ipcRenderer.invoke('server:get'),
    switch: (target: 'railway' | 'local', landing?: '/' | '/admin') => ipcRenderer.invoke('server:switch', target, landing),
    markAdmin: () => ipcRenderer.invoke('server:mark-admin'),
    pullProduction: (name: string) => ipcRenderer.invoke('server:pull-production', name),
    onPullProgress: (callback: (progress: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, progress: unknown) => callback(progress);
      ipcRenderer.on('server:pull-progress', listener);
      return () => { ipcRenderer.removeListener('server:pull-progress', listener); };
    },
  },
});
