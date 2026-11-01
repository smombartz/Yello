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
});
