import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'crypto';
import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import authRoutes, { finishSignIn } from '../auth.js';
import { getAuthDatabase, closeAuthDatabase } from '../../services/authDatabase.js';
import { createHandoffCode } from '../../services/desktopHandoff.js';

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function cookieValue(setCookie: string | string[] | undefined, name: string): string | undefined {
  const all = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = all.find(c => c.startsWith(`${name}=`));
  return match?.split(';')[0].slice(name.length + 1);
}

describe('desktop sign-in handoff routes', () => {
  const app = Fastify();
  let tmpDir: string;
  let userId: number;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-desktop-auth-test-'));
    process.env.AUTH_DATABASE_PATH = path.join(tmpDir, 'auth.db');
    closeAuthDatabase();

    const result = getAuthDatabase()
      .prepare('INSERT INTO users (google_id, email, name) VALUES (?, ?, ?)')
      .run('google-desktop-1', 'desktop@example.com', 'Desktop User');
    userId = Number(result.lastInsertRowid);

    await app.register(fastifyCookie, { secret: 'test-secret' });
    await app.register(authRoutes, { prefix: '/api/auth' });
    // Stand-in for the OAuth callback, which ends in finishSignIn
    app.get('/test/finish', async (request: FastifyRequest, reply: FastifyReply) => {
      return finishSignIn(request, reply, userId, '/dashboard');
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeAuthDatabase();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('GET /api/auth/desktop/start', () => {
    it('stores the challenge in a cookie and redirects into the requested flow', async () => {
      const { challenge } = pkcePair();
      const res = await app.inject({ method: 'GET', url: `/api/auth/desktop/start?flow=gmail&challenge=${challenge}` });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/api/auth/google/gmail');
      expect(cookieValue(res.headers['set-cookie'], 'desktop_handoff')).toBe(challenge);
    });

    it('rejects an unknown flow or malformed challenge', async () => {
      const { challenge } = pkcePair();
      const badFlow = await app.inject({ method: 'GET', url: `/api/auth/desktop/start?flow=admin&challenge=${challenge}` });
      const badChallenge = await app.inject({ method: 'GET', url: '/api/auth/desktop/start?flow=login&challenge=short' });

      expect(badFlow.statusCode).toBe(400);
      expect(badChallenge.statusCode).toBe(400);
    });
  });

  describe('finishSignIn', () => {
    it('without the handoff cookie, sets a session and redirects as before', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/finish' });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/dashboard');
      expect(cookieValue(res.headers['set-cookie'], 'session_id')).toBeTruthy();
    });

    it('with the handoff cookie, renders the deep-link page and sets no session', async () => {
      const { challenge } = pkcePair();
      const res = await app.inject({ method: 'GET', url: '/test/finish', cookies: { desktop_handoff: challenge } });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toMatch(/yello:\/\/auth\?code=[0-9a-f]{64}/);
      expect(cookieValue(res.headers['set-cookie'], 'session_id')).toBeUndefined();
      expect(cookieValue(res.headers['set-cookie'], 'desktop_handoff')).toBe('');
    });
  });

  describe('GET /api/auth/desktop/exchange', () => {
    it('trades a valid code and verifier for a session, once', async () => {
      const { verifier, challenge } = pkcePair();
      const code = createHandoffCode(userId, challenge, '/onboarding');
      const url = `/api/auth/desktop/exchange?code=${code}&verifier=${verifier}`;

      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/onboarding');

      const sessionId = cookieValue(res.headers['set-cookie'], 'session_id');
      const session = getAuthDatabase().prepare('SELECT user_id FROM sessions WHERE id = ?').get(sessionId) as
        { user_id: number } | undefined;
      expect(session?.user_id).toBe(userId);

      const replay = await app.inject({ method: 'GET', url });
      expect(replay.headers.location).toBe('/?error=auth_failed');
      expect(cookieValue(replay.headers['set-cookie'], 'session_id')).toBeUndefined();
    });

    it('rejects a wrong verifier', async () => {
      const { challenge } = pkcePair();
      const code = createHandoffCode(userId, challenge, '/dashboard');
      const res = await app.inject({
        method: 'GET',
        url: `/api/auth/desktop/exchange?code=${code}&verifier=${pkcePair().verifier}`,
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/?error=auth_failed');
    });
  });
});
