import { getAuthDatabase } from './authDatabase.js';
import { encryptToken, decryptToken, isEncryptedToken } from './tokenEncryption.js';

interface UserTokens {
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
}

interface TokenRefreshResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

/**
 * Get a valid access token for a user, refreshing if necessary.
 * Returns null if the user has no tokens or refresh fails.
 */
export async function getValidAccessToken(userId: number): Promise<string | null> {
  const db = getAuthDatabase();

  const user = db.prepare(`
    SELECT access_token, refresh_token, token_expires_at
    FROM users WHERE id = ?
  `).get(userId) as UserTokens | undefined;

  if (!user || !user.access_token) {
    return null;
  }

  // Decrypt tokens if encrypted, otherwise treat as legacy plaintext
  const accessToken = isEncryptedToken(user.access_token)
    ? decryptToken(user.access_token)
    : user.access_token;
  const refreshToken = user.refresh_token
    ? (isEncryptedToken(user.refresh_token) ? decryptToken(user.refresh_token) : user.refresh_token)
    : null;

  if (!accessToken) {
    console.log('Failed to decrypt access token for user', userId);
    return null;
  }

  // Check if token is still valid (with 5 minute buffer)
  if (user.token_expires_at) {
    const expiresAt = new Date(user.token_expires_at);
    const bufferMs = 5 * 60 * 1000; // 5 minutes

    if (expiresAt.getTime() - bufferMs > Date.now()) {
      // Token is still valid
      return accessToken;
    }
  }

  // Token is expired or expiring soon, try to refresh
  if (!refreshToken) {
    console.log('No refresh token available for user', userId);
    return null;
  }

  const newToken = await refreshAccessToken(userId, refreshToken);
  return newToken;
}

/**
 * Refresh an access token using the refresh token.
 */
async function refreshAccessToken(userId: number, refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Google OAuth credentials not configured');
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token refresh failed:', response.status, errorText);
      return null;
    }

    const data = await response.json() as TokenRefreshResponse;

    // Encrypt and update tokens in database
    const db = getAuthDatabase();
    const tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
    const encryptedAccessToken = encryptToken(data.access_token);

    db.prepare(`
      UPDATE users
      SET access_token = ?, token_expires_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(encryptedAccessToken, tokenExpiresAt, userId);

    return data.access_token;
  } catch (error) {
    console.error('Error refreshing access token:', error);
    return null;
  }
}

/**
 * Check if a user has Google OAuth tokens stored.
 */
export function hasGoogleTokens(userId: number): boolean {
  const db = getAuthDatabase();

  const user = db.prepare(`
    SELECT access_token, refresh_token FROM users WHERE id = ?
  `).get(userId) as { access_token: string | null; refresh_token: string | null } | undefined;

  return !!(user?.access_token || user?.refresh_token);
}
