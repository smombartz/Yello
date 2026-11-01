import { contextBridge, ipcRenderer } from 'electron';

// Exposes the desktop app's local features to the Yello page as `window.yelloDesktop`.
// Sandboxed preload: only `electron` can be required here, so keep this file self-contained.
// Each feature is its own key. Main-process handlers also check the origin.

contextBridge.exposeInMainWorld('yelloDesktop', {
  // Top contacts: iMessage and WhatsApp counts read on this Mac (src/messageActivity/)
  messageActivity: {
    status: () => ipcRenderer.invoke('messages:status'),
    scan: (channel: 'imessage' | 'whatsapp', sinceDay: string | null) => ipcRenderer.invoke('messages:scan', channel, sinceDay),
    openFullDiskAccessSettings: () => ipcRenderer.invoke('messages:open-settings'),
    relaunch: () => ipcRenderer.invoke('messages:relaunch'),
  },
});
