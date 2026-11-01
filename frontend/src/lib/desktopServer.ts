/**
 * Admin testing tool in the Yello desktop app (electron/src/serverSwitch.ts):
 * switch the app between Railway and a local backend, and pull a copy of
 * production into the local server. In a plain browser `window.yelloDesktop`
 * doesn't exist and only the server-side parts (data sets, backup) show.
 */

export type ServerTarget = 'railway' | 'local';

export interface DesktopServerState {
  target: ServerTarget;
  url: string;
  railwayUrl: string;
  localUrl: string;
  /** Origin forced by YELLO_URL for this run; switching is off */
  override: string | null;
  adminSeen: boolean;
}

export interface PullProgress {
  stage: 'downloading' | 'importing';
  bytes: number;
}

export interface DesktopServer {
  get(): Promise<DesktopServerState>;
  /** Reloads the app on the other server, landing on `landing` */
  switch(target: ServerTarget, landing?: '/' | '/admin'): Promise<DesktopServerState>;
  markAdmin(): Promise<DesktopServerState>;
  pullProduction(name: string): Promise<{ name: string }>;
  onPullProgress(callback: (progress: PullProgress) => void): () => void;
}

/** Null in a browser, or in desktop builds from before the switcher */
export function getDesktopServer(): DesktopServer | null {
  const bridge = (window as unknown as { yelloDesktop?: { server?: DesktopServer } }).yelloDesktop;
  return bridge?.server ?? null;
}

/** Electron wraps errors from the main process; keep just the message */
export function desktopErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
