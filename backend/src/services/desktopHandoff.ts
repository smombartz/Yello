import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Desktop sign-in handoff.
 *
 * The Electron app runs Google OAuth in the system browser (Google blocks
 * embedded browsers). When the callback finishes, the browser is handed a
 * one-time code via a yello:// deep link; the app then exchanges it — together
 * with the PKCE verifier only it holds — for a session cookie in its own
 * cookie jar. Codes live in memory: Railway runs a single process and a code
 * is only valid for seconds, so a restart just means signing in again.
 */

export const DESKTOP_PROTOCOL = 'yello';
export const HANDOFF_CODE_TTL_MS = 2 * 60 * 1000;

// Paths that start each Google flow; the desktop app intercepts navigations
// to these and routes them through /api/auth/desktop/start instead.
export const DESKTOP_FLOWS = {
  login: '/api/auth/google',
  gmail: '/api/auth/google/gmail',
  contacts: '/api/auth/google/contacts',
} as const;

export type DesktopFlow = keyof typeof DESKTOP_FLOWS;

interface PendingHandoff {
  userId: number;
  challenge: string;
  redirectPath: string;
  expiresAt: number;
}

const pending = new Map<string, PendingHandoff>();

export function isDesktopFlow(value: unknown): value is DesktopFlow {
  return typeof value === 'string' && Object.hasOwn(DESKTOP_FLOWS, value);
}

/** A PKCE S256 challenge: base64url SHA-256 digest, 43 characters. */
export function isValidChallenge(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function pruneExpired(now: number): void {
  for (const [code, entry] of pending) {
    if (entry.expiresAt <= now) pending.delete(code);
  }
}

export function createHandoffCode(userId: number, challenge: string, redirectPath: string): string {
  const now = Date.now();
  pruneExpired(now);

  const code = randomBytes(32).toString('hex');
  pending.set(code, { userId, challenge, redirectPath, expiresAt: now + HANDOFF_CODE_TTL_MS });
  return code;
}

/**
 * Redeem a handoff code. The code is deleted before it is checked, so a wrong
 * verifier burns it rather than allowing repeated guesses.
 */
export function consumeHandoffCode(
  code: string,
  verifier: string
): { userId: number; redirectPath: string } | null {
  const entry = pending.get(code);
  pending.delete(code);

  if (!entry || entry.expiresAt <= Date.now()) {
    return null;
  }

  const actual = createHash('sha256').update(verifier).digest();
  const expected = Buffer.from(entry.challenge, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  return { userId: entry.userId, redirectPath: entry.redirectPath };
}

/**
 * Page shown in the system browser once Google sign-in completes. It opens
 * the app via meta refresh (no inline script, so the production CSP holds)
 * and keeps a visible link in case the browser asks before opening apps.
 */
export function renderHandoffPage(code: string): string {
  const deepLink = `${DESKTOP_PROTOCOL}://auth?code=${encodeURIComponent(code)}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=${deepLink}">
<title>Return to Yello</title>
<style>
  :root { color-scheme: light dark; --primary: #7c3aed; --text: #1a202c; --muted: #6b7280; --bg: #f9fafb; }
  @media (prefers-color-scheme: dark) { :root { --text: #f3f4f6; --muted: #9ca3af; --bg: #111827; } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--text);
         font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  main { max-width: 360px; padding: 24px; text-align: center; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { color: var(--muted); font-size: 14px; line-height: 1.5; margin: 0 0 20px; }
  .button { display: inline-block; padding: 10px 20px; border-radius: 8px; background: var(--primary); color: #fff;
            text-decoration: none; font-weight: 600; }
  .fallback { margin-top: 28px; font-size: 13px; }
  .fallback a { color: var(--primary); }
</style>
</head>
<body>
<main>
  <h1>You're signed in</h1>
  <p>Return to the Yello app to continue. You can close this tab afterwards.</p>
  <a class="button" href="${deepLink}">Open Yello</a>
  <p class="fallback">Not using the desktop app? <a href="${DESKTOP_FLOWS.login}">Sign in here instead</a>.</p>
</main>
</body>
</html>`;
}
