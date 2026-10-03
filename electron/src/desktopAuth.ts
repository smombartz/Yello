import { shell } from 'electron';
import { createHash, randomBytes } from 'crypto';
import { APP_URL, PROTOCOL, isAppUrl } from './config';

/**
 * Google sign-in for the desktop app. Google blocks embedded browsers, so the
 * three Google flows run in the system browser instead. The backend hands a
 * one-time code back on yello://auth?code=…, which this app redeems together
 * with a PKCE verifier only it holds (see backend/src/services/desktopHandoff.ts).
 */

// Mirrors DESKTOP_FLOWS in the backend: the in-app path that starts each flow.
const FLOW_BY_PATH: Record<string, string> = {
  '/api/auth/google': 'login',
  '/api/auth/google/gmail': 'gmail',
  '/api/auth/google/contacts': 'contacts',
};

const VERIFIER_TTL_MS = 10 * 60 * 1000;

// Only the most recent attempt can complete; starting over replaces it.
let pending: { verifier: string; expiresAt: number } | null = null;

/** The sign-in flow a navigation starts, or null if it isn't one. */
export function flowForUrl(url: string): string | null {
  if (!isAppUrl(url)) return null;
  return FLOW_BY_PATH[new URL(url).pathname] ?? null;
}

export async function startSystemSignIn(flow: string): Promise<void> {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  pending = { verifier, expiresAt: Date.now() + VERIFIER_TTL_MS };

  const start = new URL('/api/auth/desktop/start', APP_URL);
  start.searchParams.set('flow', flow);
  start.searchParams.set('challenge', challenge);
  await shell.openExternal(start.toString());
}

/**
 * Turn a yello://auth?code=… link into the URL that trades it for a session,
 * or null if it isn't a sign-in link this app is waiting for.
 */
export function exchangeUrlFor(deepLink: string): string | null {
  let link: URL;
  try {
    link = new URL(deepLink);
  } catch {
    return null;
  }

  const code = link.searchParams.get('code');
  if (link.protocol !== `${PROTOCOL}:` || link.hostname !== 'auth' || !code) return null;

  const attempt = pending;
  pending = null;
  if (!attempt || attempt.expiresAt < Date.now()) return null;

  const exchange = new URL('/api/auth/desktop/exchange', APP_URL);
  exchange.searchParams.set('code', code);
  exchange.searchParams.set('verifier', attempt.verifier);
  return exchange.toString();
}
