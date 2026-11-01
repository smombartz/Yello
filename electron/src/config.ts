// Which Yello server the app opens. Normally the hosted deployment on Railway;
// the admin can switch to a local backend for testing (serverChoice.ts,
// Server menu, Admin page). YELLO_URL forces a server for one run, e.g.
// YELLO_URL=http://localhost:3456 (scripts/desktop-local.sh), and disables the switch.

export type ServerTarget = 'railway' | 'local';

export const RAILWAY_URL = 'https://yello.up.railway.app';
export const LOCAL_URL = 'http://localhost:3456';

// Deep-link scheme the backend hands sign-in codes back on (yello://auth?code=…).
// Also declared under `protocols` in electron-builder.yml.
export const PROTOCOL = 'yello';

let target: ServerTarget = 'railway';

/** The origin forced by YELLO_URL, or null. */
export function urlOverride(): string | null {
  const value = process.env.YELLO_URL;
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function setServerTarget(next: ServerTarget): void {
  target = next;
}

/** The server in use: YELLO_URL's counts as Railway only when it is Railway. */
export function serverTarget(): ServerTarget {
  const override = urlOverride();
  if (override) return override === RAILWAY_URL ? 'railway' : 'local';
  return target;
}

/** Origin of the server the app opens right now. */
export function appUrl(): string {
  return urlOverride() ?? (target === 'local' ? LOCAL_URL : RAILWAY_URL);
}

export function isAppUrl(url: string): boolean {
  try {
    return new URL(url).origin === appUrl();
  } catch {
    return false;
  }
}
