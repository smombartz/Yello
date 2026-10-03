// The hosted Yello deployment this app opens. YELLO_URL overrides it, e.g.
// YELLO_URL=http://localhost:3456 to develop against a local backend.
export const APP_URL = new URL(process.env.YELLO_URL ?? 'https://yello.up.railway.app').origin;

// Deep-link scheme the backend hands sign-in codes back on (yello://auth?code=…).
// Also declared under `protocols` in electron-builder.yml.
export const PROTOCOL = 'yello';

export function isAppUrl(url: string): boolean {
  try {
    return new URL(url).origin === APP_URL;
  } catch {
    return false;
  }
}
