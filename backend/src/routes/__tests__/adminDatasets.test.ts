import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import adminRoutes from '../admin.js';
import { getAuthDatabase, closeAuthDatabase } from '../../services/authDatabase.js';
import { getUserDatabase, closeAllUserDatabases } from '../../services/userDatabase.js';
import { _resetDatasetsForTests, applyActiveDataset, isSafeArchivePath } from '../../services/datasets.js';

const ADMIN = {
  id: 0,
  googleId: 'google-admin',
  email: 's@mombartz.com',
  name: 'Admin',
  avatarUrl: null,
  isDemo: false,
  createdAt: '',
  updatedAt: '',
};

function cookieValue(setCookie: string | string[] | undefined, name: string): string | undefined {
  const all = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return all.find(c => c.startsWith(`${name}=`))?.split(';')[0].slice(name.length + 1);
}

describe('admin data sets and backup', () => {
  const app = Fastify();
  let tmpDir: string;
  let dataDir: string;
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-datasets-test-'));
    dataDir = path.join(tmpDir, 'data');
    process.env.AUTH_DATABASE_PATH = path.join(dataDir, 'auth.db');
    process.env.USER_DATA_PATH = path.join(dataDir, 'users');
    process.env.PHOTOS_PATH = path.join(dataDir, 'photos');
    delete process.env.RAILWAY_ENVIRONMENT;
    delete process.env.RAILWAY_ENVIRONMENT_ID;
    delete process.env.RAILWAY_PROJECT_ID;
    closeAuthDatabase();
    closeAllUserDatabases();
    _resetDatasetsForTests();
    applyActiveDataset();

    // The dev set: the admin with Google tokens, and a user with stored credentials
    const auth = getAuthDatabase();
    const admin = auth
      .prepare('INSERT INTO users (google_id, email, name, access_token, refresh_token) VALUES (?, ?, ?, ?, ?)')
      .run(ADMIN.googleId, ADMIN.email, ADMIN.name, 'enc-access', 'enc-refresh');
    ADMIN.id = Number(admin.lastInsertRowid);
    auth.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('old-session', ?, '2999-01-01')").run(ADMIN.id);
    getUserDatabase(ADMIN.id)
      .prepare("INSERT OR REPLACE INTO user_settings (id, apify_api_token, icloud_app_password) VALUES (1, 'enc-apify', 'enc-icloud')")
      .run();
    fs.mkdirSync(path.join(dataDir, 'users', String(ADMIN.id), 'photos'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'users', String(ADMIN.id), 'photos', 'a.jpg'), 'jpg');

    await app.register(fastifyCookie, { secret: 'test-secret' });
    app.addHook('onRequest', async (request) => {
      request.user = { ...ADMIN };
    });
    await app.register(adminRoutes, { prefix: '/api/admin' });
    await app.ready();
  });

  afterEach(() => {
    delete process.env.RAILWAY_ENVIRONMENT;
  });

  afterAll(async () => {
    await app.close();
    closeAuthDatabase();
    closeAllUserDatabases();
    _resetDatasetsForTests();
    process.env = savedEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists the dev set as active to begin with', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/datasets' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enabled).toBe(true);
    expect(body.active).toBe('dev');
    expect(body.datasets).toEqual([expect.objectContaining({ name: 'dev', kind: 'dev', active: true, userCount: 1 })]);
  });

  it('creates an empty set and rejects bad or duplicate names', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/admin/datasets', payload: { name: 'scratch' } });
    expect(created.statusCode).toBe(200);
    expect(created.json().datasets.map((d: { name: string }) => d.name)).toEqual(['dev', 'scratch']);

    for (const name of ['dev', 'Bad Name', '../x', '']) {
      const bad = await app.inject({ method: 'POST', url: '/api/admin/datasets', payload: { name } });
      expect(bad.statusCode).toBe(400);
    }
    const dup = await app.inject({ method: 'POST', url: '/api/admin/datasets', payload: { name: 'scratch' } });
    expect(dup.statusCode).toBe(409);
  });

  it('switches to a set, copying the admin in and signing them in there', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/datasets/switch', payload: { name: 'scratch' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().active).toBe('scratch');
    expect(process.env.AUTH_DATABASE_PATH).toBe(path.join(dataDir, 'datasets', 'scratch', 'auth.db'));
    expect(process.env.USER_DATA_PATH).toBe(path.join(dataDir, 'datasets', 'scratch', 'users'));

    const sessionId = cookieValue(res.headers['set-cookie'], 'session_id');
    expect(sessionId).toBeTruthy();
    const row = getAuthDatabase()
      .prepare('SELECT u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?')
      .get(sessionId) as { email: string } | undefined;
    expect(row?.email).toBe(ADMIN.email);

    // Remembered across a restart
    _resetDatasetsForTests();
    process.env.AUTH_DATABASE_PATH = path.join(dataDir, 'auth.db');
    process.env.USER_DATA_PATH = path.join(dataDir, 'users');
    process.env.PHOTOS_PATH = path.join(dataDir, 'photos');
    expect(applyActiveDataset()).toBe('scratch');
  });

  it('refuses to delete the active set or dev', async () => {
    expect((await app.inject({ method: 'DELETE', url: '/api/admin/datasets/scratch' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'DELETE', url: '/api/admin/datasets/dev' })).statusCode).toBe(400);
  });

  it('round-trips a backup into a production copy with every credential wiped', async () => {
    await app.inject({ method: 'POST', url: '/api/admin/datasets/switch', payload: { name: 'dev' } });

    const backup = await app.inject({ method: 'GET', url: '/api/admin/backup' });
    expect(backup.statusCode).toBe(200);
    expect(backup.headers['content-type']).toContain('application/gzip');
    expect(backup.rawPayload.length).toBeGreaterThan(100);

    const imported = await app.inject({
      method: 'POST',
      url: '/api/admin/datasets/import?name=prod-copy',
      headers: { 'content-type': 'application/gzip' },
      payload: backup.rawPayload,
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().datasets).toContainEqual(
      expect.objectContaining({ name: 'prod-copy', kind: 'production-copy', userCount: 1 })
    );

    const copyDir = path.join(dataDir, 'datasets', 'prod-copy');
    expect(fs.readFileSync(path.join(copyDir, 'users', String(ADMIN.id), 'photos', 'a.jpg'), 'utf8')).toBe('jpg');

    const auth = new Database(path.join(copyDir, 'auth.db'), { readonly: true });
    expect(auth.prepare('SELECT access_token, refresh_token FROM users').get()).toEqual({ access_token: null, refresh_token: null });
    expect((auth.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n).toBe(0);
    auth.close();

    const user = new Database(path.join(copyDir, 'users', String(ADMIN.id), 'contacts.db'), { readonly: true });
    expect(user.prepare('SELECT apify_api_token, icloud_app_password FROM user_settings').get()).toEqual({
      apify_api_token: null,
      icloud_app_password: null,
    });
    user.close();

    // The dev set itself is untouched
    expect(getAuthDatabase().prepare('SELECT access_token FROM users WHERE id = ?').get(ADMIN.id)).toEqual({ access_token: 'enc-access' });

    const again = await app.inject({
      method: 'POST',
      url: '/api/admin/datasets/import?name=prod-copy',
      headers: { 'content-type': 'application/gzip' },
      payload: backup.rawPayload,
    });
    expect(again.statusCode).toBe(409);
  });

  it('rejects a file that is not a backup and leaves nothing behind', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/datasets/import?name=junk',
      headers: { 'content-type': 'application/gzip' },
      payload: Buffer.from('not a tarball'),
    });
    expect(res.statusCode).toBe(400);
    expect(fs.existsSync(path.join(dataDir, 'datasets', 'junk'))).toBe(false);
  });

  it('deletes a set that is not active', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/admin/datasets/scratch' });
    expect(res.statusCode).toBe(200);
    expect(fs.existsSync(path.join(dataDir, 'datasets', 'scratch'))).toBe(false);
  });

  it('is switched off on Railway', async () => {
    process.env.RAILWAY_ENVIRONMENT = 'production';
    const list = await app.inject({ method: 'GET', url: '/api/admin/datasets' });
    expect(list.json()).toEqual({ enabled: false, active: null, datasets: [] });
    const create = await app.inject({ method: 'POST', url: '/api/admin/datasets', payload: { name: 'nope' } });
    expect(create.statusCode).toBe(404);
    const switched = await app.inject({ method: 'POST', url: '/api/admin/datasets/switch', payload: { name: 'dev' } });
    expect(switched.statusCode).toBe(404);
  });

  it('only accepts archive paths inside the target folder', () => {
    expect(isSafeArchivePath('./auth.db')).toBe(true);
    expect(isSafeArchivePath('users/3/contacts.db')).toBe(true);
    expect(isSafeArchivePath('../etc/passwd')).toBe(false);
    expect(isSafeArchivePath('users/../../x')).toBe(false);
    expect(isSafeArchivePath('/etc/passwd')).toBe(false);
  });
});
