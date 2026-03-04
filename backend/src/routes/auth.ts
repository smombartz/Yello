import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import oauthPlugin from '@fastify/oauth2';
import type { OAuth2Namespace } from '@fastify/oauth2';
import { randomBytes } from 'crypto';
import { encryptToken } from '../services/tokenEncryption.js';

// Google OAuth2 configuration - manually defined since types don't export it
// See: https://github.com/fastify/fastify-oauth2
const GOOGLE_CONFIGURATION = {
  authorizeHost: 'https://accounts.google.com',
  authorizePath: '/o/oauth2/v2/auth',
  tokenHost: 'https://www.googleapis.com',
  tokenPath: '/oauth2/v4/token',
};
import { getAuthDatabase } from '../services/authDatabase.js';
import { AuthMeResponseSchema, AuthErrorSchema } from '../schemas/auth.js';
import { fetchAndStoreGoogleAvatar, fetchAndStoreGravatar, getProfileImages, getProfileImageUrl, enrichUsersFromGoogleContacts } from '../services/profileImageService.js';

// Google userinfo response type
interface GoogleUserInfo {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

// Database row types
interface UserRow {
  id: number;
  google_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionRow {
  id: string;
  user_id: number;
  expires_at: string;
}

// Session duration: 30 days
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

// Generate a secure session ID
function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

// Token data for storing OAuth tokens
interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

// Create or update user from Google profile
function upsertUser(
  googleId: string,
  email: string,
  name: string | null,
  avatarUrl: string | null,
  tokenData?: TokenData
): UserRow {
  const db = getAuthDatabase();

  // Calculate token expiration time
  const tokenExpiresAt = tokenData?.expiresIn
    ? new Date(Date.now() + tokenData.expiresIn * 1000).toISOString()
    : null;

  // Check if user exists
  const existing = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as UserRow | undefined;

  // Encrypt tokens before storing
  const encryptedAccessToken = tokenData?.accessToken ? encryptToken(tokenData.accessToken) : null;
  const encryptedRefreshToken = tokenData?.refreshToken ? encryptToken(tokenData.refreshToken) : null;

  if (existing) {
    // Update existing user with tokens if provided
    if (tokenData) {
      db.prepare(`
        UPDATE users
        SET email = ?, name = ?, avatar_url = ?,
            access_token = ?, refresh_token = COALESCE(?, refresh_token), token_expires_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE google_id = ?
      `).run(email, name, avatarUrl, encryptedAccessToken, encryptedRefreshToken, tokenExpiresAt, googleId);
    } else {
      db.prepare(`
        UPDATE users
        SET email = ?, name = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP
        WHERE google_id = ?
      `).run(email, name, avatarUrl, googleId);
    }

    return db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as UserRow;
  } else {
    // Create new user with tokens
    const result = db.prepare(`
      INSERT INTO users (google_id, email, name, avatar_url, access_token, refresh_token, token_expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      googleId,
      email,
      name,
      avatarUrl,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt
    );

    return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as UserRow;
  }
}

// Create a new session for a user
function createSession(userId: number): string {
  const db = getAuthDatabase();
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(sessionId, userId, expiresAt);

  return sessionId;
}

// Get user from session ID
function getUserFromSession(sessionId: string): UserRow | null {
  const db = getAuthDatabase();

  // Get session and check if it's valid
  const session = db.prepare(`
    SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')
  `).get(sessionId) as SessionRow | undefined;

  if (!session) {
    return null;
  }

  // Get user
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as UserRow | undefined;
  return user || null;
}

// Delete a session
function deleteSession(sessionId: string): void {
  const db = getAuthDatabase();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

// Clean up expired sessions (called periodically)
function cleanupExpiredSessions(): void {
  const db = getAuthDatabase();
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}

// Extend Fastify instance type to include googleOAuth2
declare module 'fastify' {
  interface FastifyInstance {
    googleOAuth2: OAuth2Namespace;
  }
}

export default async function authRoutes(fastify: FastifyInstance) {
  // Check if Google OAuth is configured
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL || 'http://localhost:3456';

  if (!googleClientId || !googleClientSecret) {
    // Register placeholder routes that return helpful errors
    fastify.get('/google', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (_request, reply) => {
      return reply.status(503).send({
        error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.'
      });
    });

    fastify.get('/google/callback', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (_request, reply) => {
      return reply.status(503).send({
        error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.'
      });
    });

    console.warn('Google OAuth not configured. Auth routes will return 503.');
  } else {
    // Register Google OAuth2 plugin
    await fastify.register(oauthPlugin, {
      name: 'googleOAuth2',
      scope: ['profile', 'email', 'https://www.googleapis.com/auth/contacts.other.readonly'],
      credentials: {
        client: {
          id: googleClientId,
          secret: googleClientSecret,
        },
        auth: GOOGLE_CONFIGURATION,
      },
      startRedirectPath: '/google',
      callbackUri: `${appUrl}/api/auth/google/callback`,
      callbackUriParams: {
        access_type: 'offline',
      },
    });

    // Google OAuth callback handler (shared by normal login and Gmail re-auth)
    fastify.get('/google/callback', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>, reply: FastifyReply) => {
      try {
        const isGmailFlow = request.cookies.gmail_oauth_flow === '1';

        if (isGmailFlow) {
          // --- Gmail re-auth flow (manual token exchange) ---
          reply.clearCookie('gmail_oauth_flow', { path: '/' });

          const { code, state, error: oauthError } = request.query;

          if (oauthError) {
            fastify.log.error(`Gmail OAuth error: ${oauthError}`);
            return reply.redirect('/?error=auth_failed');
          }

          if (!code) {
            return reply.redirect('/?error=auth_failed');
          }

          // Verify state to prevent CSRF
          const savedState = request.cookies.gmail_oauth_state;
          if (!savedState || savedState !== state) {
            fastify.log.error('Gmail OAuth state mismatch');
            return reply.redirect('/?error=auth_failed');
          }
          reply.clearCookie('gmail_oauth_state', { path: '/' });

          // Exchange authorization code for tokens
          const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: googleClientId,
              client_secret: googleClientSecret,
              redirect_uri: `${appUrl}/api/auth/google/callback`,
              grant_type: 'authorization_code',
            }),
          });

          if (!tokenResponse.ok) {
            const errorBody = await tokenResponse.text();
            fastify.log.error(`Gmail token exchange failed: ${errorBody}`);
            return reply.redirect('/?error=auth_failed');
          }

          const tokenData = await tokenResponse.json() as {
            access_token: string;
            refresh_token?: string;
            expires_in?: number;
          };

          // Fetch user profile from Google
          const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });

          if (!userInfoResponse.ok) {
            throw new Error('Failed to fetch user info from Google');
          }

          const userInfo = await userInfoResponse.json() as GoogleUserInfo;

          // Create or update user with new tokens (now including Gmail scope)
          const user = upsertUser(
            userInfo.id,
            userInfo.email,
            userInfo.name || null,
            userInfo.picture || null,
            {
              accessToken: tokenData.access_token,
              refreshToken: tokenData.refresh_token,
              expiresIn: tokenData.expires_in,
            }
          );

          // Create session
          const sessionId = createSession(user.id);

          reply.setCookie('session_id', sessionId, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: SESSION_DURATION_MS / 1000,
          });

          cleanupExpiredSessions();
          return reply.redirect('/');
        }

        // --- Normal login flow (uses @fastify/oauth2 plugin) ---
        const tokenResponse = await fastify.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
        const accessToken = tokenResponse.token.access_token as string;
        const refreshToken = tokenResponse.token.refresh_token as string | undefined;
        const expiresIn = tokenResponse.token.expires_in as number | undefined;

        // Fetch user profile from Google
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!userInfoResponse.ok) {
          throw new Error('Failed to fetch user info from Google');
        }

        const userInfo = await userInfoResponse.json() as GoogleUserInfo;

        // Create or update user in database with tokens
        const user = upsertUser(
          userInfo.id,
          userInfo.email,
          userInfo.name || null,
          userInfo.picture || null,
          { accessToken, refreshToken, expiresIn }
        );

        // Fetch and store profile images in background (don't block the response)
        (async () => {
          try {
            // Fetch Google avatar
            await fetchAndStoreGoogleAvatar(user.id, userInfo.picture || null, userInfo.email);

            // Fetch Gravatar as additional source
            await fetchAndStoreGravatar(user.id, userInfo.email);

            // Enrich other users from this user's Google contacts
            const enrichedCount = await enrichUsersFromGoogleContacts(accessToken);
            if (enrichedCount > 0) {
              fastify.log.info(`Enriched ${enrichedCount} users from Google contacts`);
            }
          } catch (error) {
            fastify.log.error(error, 'Error fetching profile images');
          }
        })();

        // Create session
        const sessionId = createSession(user.id);

        // Set session cookie
        reply.setCookie('session_id', sessionId, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: SESSION_DURATION_MS / 1000, // maxAge is in seconds
        });

        // Clean up old sessions periodically
        cleanupExpiredSessions();

        // Redirect to frontend
        return reply.redirect('/');
      } catch (error) {
        fastify.log.error(error, 'OAuth callback error');
        return reply.redirect('/?error=auth_failed');
      }
    });
  }

  // Gmail re-auth: redirect to Google OAuth with expanded scope
  fastify.get('/google/gmail', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!googleClientId || !googleClientSecret) {
      return reply.status(503).send({ error: 'Google OAuth not configured' });
    }

    const scopes = [
      'profile',
      'email',
      'https://www.googleapis.com/auth/contacts.other.readonly',
      'https://www.googleapis.com/auth/gmail.readonly',
    ].join(' ');

    const state = randomBytes(16).toString('hex');
    reply.setCookie('gmail_oauth_state', state, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
    });

    // Flag this as a Gmail re-auth flow so the shared callback can differentiate
    reply.setCookie('gmail_oauth_flow', '1', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
    });

    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: `${appUrl}/api/auth/google/callback`,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  // Get current user
  fastify.get('/me', {
    schema: {
      response: {
        200: AuthMeResponseSchema,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.cookies.session_id;

    if (!sessionId) {
      return { user: null, isAuthenticated: false };
    }

    const user = getUserFromSession(sessionId);

    if (!user) {
      // Clear invalid cookie
      reply.clearCookie('session_id', { path: '/' });
      return { user: null, isAuthenticated: false };
    }

    // Get profile images
    const profileImages = getProfileImages(user.id);

    return {
      user: {
        id: user.id,
        googleId: user.google_id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        profileImages: profileImages.map(img => ({
          id: img.id,
          source: img.source,
          url: getProfileImageUrl(img.localHash),
          isPrimary: img.isPrimary,
        })),
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
      isAuthenticated: true,
    };
  });

  // Logout
  fastify.post('/logout', {
    schema: {
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' } } },
        401: AuthErrorSchema,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.cookies.session_id;

    if (sessionId) {
      deleteSession(sessionId);
      reply.clearCookie('session_id', { path: '/' });
    }

    return { success: true };
  });
}
