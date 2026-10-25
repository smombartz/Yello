import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { closeAllUserDatabases, getUserDatabase } from '../../services/userDatabase.js';
import { encryptToken } from '../../services/tokenEncryption.js';

const book = new Map<string, string>();
const BOOK = 'https://p01-contacts.icloud.com/1/carddavhome/card/';

vi.mock('../../services/sync/icloudRemote.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/sync/icloudRemote.js')>()),
  openICloudRemote: vi.fn(async () => ({
    collectionUrl: BOOK,
    getCtag: async () => String(book.size),
    listCards: async () => [...book.keys()].map(url => ({ url, etag: '"1"' })),
    fetchCards: async (urls: string[]) => urls.filter(u => book.has(u)).map(url => ({ url, etag: '"1"', data: book.get(url)! })),
    createCard: async (filename: string, data: string) => {
      const url = new URL(filename, BOOK).href;
      book.set(url, data);
      return { url, etag: '"1"' };
    },
    updateCard: async (url: string, data: string) => { book.set(url, data); return { url, etag: '"2"' }; },
    deleteCard: async (url: string) => { book.delete(url); }
  }))
}));

const { default: syncRoutes } = await import('../sync.js');

describe('sync engine routes', () => {
  const app = Fastify();
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-sync-engine-routes-'));
    process.env.USER_DATA_PATH = tmpDir;
    process.env.TOKEN_ENCRYPTION_KEY = 'test-token-encryption-key-for-engine-routes';
    app.addHook('onRequest', async request => {
      request.user = {
        id: 1, googleId: 'g', email: 't@t', name: 'T', avatarUrl: null, isDemo: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
    });
    await app.register(syncRoutes);
    await app.ready();
    const db = getUserDatabase(1);
    db.prepare('UPDATE user_settings SET icloud_email = ?, icloud_app_password = ? WHERE id = 1').run('me@icloud.com', encryptToken('pw'));
    db.prepare("INSERT INTO contacts (display_name) VALUES ('Ada Lovelace')").run();
  });

  afterEach(() => {
    delete process.env.SYNC_ENGINE;
    book.clear();
  });

  afterAll(async () => {
    await app.close();
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('is off unless the server switches the engine on', async () => {
    expect((await app.inject({ method: 'POST', url: '/icloud/enable' })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/run', payload: { provider: 'icloud' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/cutover/cutover-x/apply' })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/status' })).json().engineEnabled).toBe(false);
  });

  it('rejects changes to a preview that is not the latest', async () => {
    const response = await app.inject({ method: 'POST', url: '/cutover/cutover-x/resolve', payload: { items: [{ id: 1, resolution: 'import' }] } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/no longer the latest/);
  });

  it('refuses to restore a backup that does not exist, and while sync is on', async () => {
    expect((await app.inject({ method: 'POST', url: '/backups/icloud-20261025T000000000Z/restore', payload: {} })).statusCode).toBe(409);
  });

  it('refuses to enable sync on an address book that already holds contacts', async () => {
    process.env.SYNC_ENGINE = '1';
    book.set(`${BOOK}x.vcf`, 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Someone\r\nN:;Someone;;;\r\nEND:VCARD');
    const response = await app.inject({ method: 'POST', url: '/icloud/enable' });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/already holds 1 contacts/);
    const state = (await app.inject({ method: 'GET', url: '/status' })).json();
    expect(state.providers.find((p: { provider: string }) => p.provider === 'icloud').enabled).toBe(false);
  });

  it('enables sync on an empty book and writes every contact there', async () => {
    process.env.SYNC_ENGINE = '1';
    const response = await app.inject({ method: 'POST', url: '/icloud/enable' });
    expect(response.statusCode).toBe(200);
    expect(response.json().counters.pushedCreated).toBe(1);
    expect([...book.values()][0]).toContain('FN:Ada Lovelace');

    const run = (await app.inject({ method: 'POST', url: '/run', payload: { provider: 'icloud' } })).json();
    expect(run.status).toBe('completed');
    const runs = (await app.inject({ method: 'GET', url: '/runs?provider=icloud' })).json();
    expect(runs.runs).toHaveLength(2);

    // Reset forgets the pairing but keeps the contacts.
    const reset = (await app.inject({ method: 'POST', url: '/icloud/reset' })).json();
    expect(reset.providers.find((p: { provider: string }) => p.provider === 'icloud')).toMatchObject({ enabled: false, cutoverCompletedAt: null });
    const db = getUserDatabase(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM contact_sync_links WHERE provider = 'icloud'").get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM contacts').get()).toEqual({ n: 1 });
  });
});
