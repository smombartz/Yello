import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import enrichRoutes from '../enrich.js';
import { getUserDatabase, closeAllUserDatabases } from '../../services/userDatabase.js';
import { isEncryptedToken } from '../../services/tokenEncryption.js';
import os from 'os';
import fs from 'fs';
import path from 'path';

// The apify-key routes call Apify's HTTP API; stub fetch so tests never hit the network.
function mockFetchOnce(impl: () => Response | Promise<Response>) {
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(impl);
}

function apifyRow() {
  const db = getUserDatabase(1);
  return db.prepare('SELECT apify_api_token, apify_username FROM user_settings WHERE id = 1').get() as {
    apify_api_token: string | null;
    apify_username: string | null;
  };
}

describe('Apify key routes', () => {
  const app = Fastify();
  let tmpDir: string;
  // Mutable so individual tests can flip demo mode.
  const testUser = {
    id: 1,
    googleId: 'test-google-id',
    email: 'test@test.com',
    name: 'Test User',
    avatarUrl: null,
    isDemo: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-apify-test-'));
    process.env.USER_DATA_PATH = tmpDir;
    process.env.SESSION_SECRET = 'test-session-secret-for-apify-key';

    app.addHook('onRequest', async (request) => {
      request.user = { ...testUser };
    });

    await app.register(enrichRoutes, { prefix: '/api/enrich' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeAllUserDatabases();
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    testUser.isDemo = false;
    vi.stubGlobal('fetch', vi.fn());
    // Reset stored key between tests.
    const db = getUserDatabase(1);
    db.prepare('UPDATE user_settings SET apify_api_token = NULL, apify_username = NULL WHERE id = 1').run();
  });

  it('validates and stores an encrypted key on success', async () => {
    mockFetchOnce(() => new Response(JSON.stringify({ data: { username: 'alice' } }), { status: 200 }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/enrich/apify-key',
      payload: { token: 'apify_api_secret_123' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, username: 'alice' });

    const row = apifyRow();
    expect(row.apify_username).toBe('alice');
    expect(row.apify_api_token).toBeTruthy();
    expect(isEncryptedToken(row.apify_api_token!)).toBe(true);
    expect(row.apify_api_token).not.toBe('apify_api_secret_123');
  });

  it('rejects an invalid key (401) with 400 and stores nothing', async () => {
    mockFetchOnce(() => new Response('unauthorized', { status: 401 }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/enrich/apify-key',
      payload: { token: 'bad-token' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Invalid Apify API token');
    expect(apifyRow().apify_api_token).toBeNull();
  });

  it('returns 502 on network failure and stores nothing', async () => {
    mockFetchOnce(() => { throw new Error('network down'); });

    const res = await app.inject({
      method: 'POST',
      url: '/api/enrich/apify-key',
      payload: { token: 'some-token' },
    });

    expect(res.statusCode).toBe(502);
    expect(apifyRow().apify_api_token).toBeNull();
  });

  it('summary flips configured false → true after save', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/enrich/linkedin/summary' });
    expect(before.json().configured).toBe(false);
    expect(before.json().apifyUsername).toBeNull();

    mockFetchOnce(() => new Response(JSON.stringify({ data: { username: 'bob' } }), { status: 200 }));
    await app.inject({ method: 'POST', url: '/api/enrich/apify-key', payload: { token: 'tok' } });

    const after = await app.inject({ method: 'GET', url: '/api/enrich/linkedin/summary' });
    expect(after.json().configured).toBe(true);
    expect(after.json().apifyUsername).toBe('bob');
  });

  it('DELETE nulls the columns and configured returns to false', async () => {
    mockFetchOnce(() => new Response(JSON.stringify({ data: { username: 'carol' } }), { status: 200 }));
    await app.inject({ method: 'POST', url: '/api/enrich/apify-key', payload: { token: 'tok' } });
    expect(apifyRow().apify_api_token).toBeTruthy();

    const del = await app.inject({ method: 'DELETE', url: '/api/enrich/apify-key' });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ success: true });

    const row = apifyRow();
    expect(row.apify_api_token).toBeNull();
    expect(row.apify_username).toBeNull();

    const summary = await app.inject({ method: 'GET', url: '/api/enrich/linkedin/summary' });
    expect(summary.json().configured).toBe(false);
  });

  it('/linkedin/start without a stored key returns 400 JSON', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/enrich/linkedin/start',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Add your Apify API key');
  });

  it('demo users get 403 on POST /apify-key', async () => {
    testUser.isDemo = true;

    const res = await app.inject({
      method: 'POST',
      url: '/api/enrich/apify-key',
      payload: { token: 'tok' },
    });

    expect(res.statusCode).toBe(403);
    expect(apifyRow().apify_api_token).toBeNull();
  });
});
