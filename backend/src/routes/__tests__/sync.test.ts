import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { closeAllUserDatabases, getUserDatabase } from '../../services/userDatabase.js';
import { encryptToken } from '../../services/tokenEncryption.js';

vi.mock('../../services/icloudService.js', () => ({
  buildICloudClient: vi.fn(() => ({ login: vi.fn().mockResolvedValue(undefined) })),
  streamICloudCards: vi.fn(async function* () {
    yield {
      addressBook: { url: 'https://contacts.icloud.com/1/carddavhome/card/' },
      cards: [{ url: 'https://contacts.icloud.com/1/carddavhome/card/a.vcf', etag: '"1"', data: 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Ada;;;;\r\nFN:Ada\r\nUID:A\r\nEND:VCARD' }],
      requested: 1
    };
  })
}));

const { default: syncRoutes } = await import('../sync.js');

describe('/api/sync/backups', () => {
  const app = Fastify();
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-sync-routes-'));
    process.env.USER_DATA_PATH = tmpDir;
    process.env.TOKEN_ENCRYPTION_KEY = 'test-token-encryption-key-for-sync-routes';

    app.addHook('onRequest', async (request) => {
      request.user = {
        id: 1, googleId: 'g', email: 'test@test.com', name: 'Test', avatarUrl: null, isDemo: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
    });
    await app.register(syncRoutes);
    await app.ready();

    getUserDatabase(1)
      .prepare('UPDATE user_settings SET icloud_email = ?, icloud_app_password = ? WHERE id = 1')
      .run('me@icloud.com', encryptToken('pw'));
  });

  afterAll(async () => {
    await app.close();
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs a backup, serves its files, and opens the deletion gate once confirmed', async () => {
    const empty = (await app.inject({ method: 'GET', url: '/backups' })).json();
    expect(empty.backups).toEqual([]);
    expect(empty.gates.icloud.allowed).toBe(false);

    const start = await app.inject({ method: 'POST', url: '/backups', payload: { provider: 'icloud' } });
    expect(start.statusCode).toBe(202);
    const { id } = start.json();

    let backup;
    for (let attempt = 0; attempt < 100; attempt++) {
      backup = (await app.inject({ method: 'GET', url: `/backups/${id}` })).json();
      if (backup.status !== 'running') break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(backup.status).toBe('verified');

    const vcf = await app.inject({ method: 'GET', url: `/backups/${id}/files/icloud-contacts.vcf` });
    expect(vcf.statusCode).toBe(200);
    expect(vcf.headers['content-type']).toMatch(/text\/vcard/);
    expect(vcf.headers['content-disposition']).toContain('attachment');
    expect(vcf.body).toContain('FN:Ada');

    const db = await app.inject({ method: 'GET', url: `/backups/${id}/files/yello.db` });
    expect(db.statusCode).toBe(200);
    expect(db.rawPayload.subarray(0, 15).toString()).toBe('SQLite format 3');

    expect((await app.inject({ method: 'POST', url: `/backups/${id}/confirm` })).statusCode).toBe(200);
    const after = (await app.inject({ method: 'GET', url: '/backups' })).json();
    expect(after.gates.icloud.allowed).toBe(true);
    expect(after.gates.google.allowed).toBe(false);
  });

  it('rejects unknown providers, backups and files', async () => {
    expect((await app.inject({ method: 'POST', url: '/backups', payload: { provider: 'yahoo' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/backups/nope' })).statusCode).toBe(404);
    const list = (await app.inject({ method: 'GET', url: '/backups' })).json();
    const id = list.backups[0].id;
    expect((await app.inject({ method: 'GET', url: `/backups/${id}/files/manifest.json` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/backups/${id}/files/..%2F..%2Fcontacts.db` })).statusCode).toBe(404);
  });
});
