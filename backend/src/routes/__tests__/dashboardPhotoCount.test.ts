import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { getUserDatabase, closeAllUserDatabases } from '../../services/userDatabase.js';
import contactsRoutes from '../contacts.js';
import statsRoutes from '../stats.js';
import os from 'os';
import fs from 'fs';
import path from 'path';

/**
 * The dashboard's With Photos card links to /contacts?filter=has-photo, so the card's
 * number must be the total that filtered list reports.
 */
describe('dashboard With Photos card', () => {
  let app: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-photo-count-test-'));
    process.env.USER_DATA_PATH = tmpDir;

    app = Fastify();
    app.addHook('onRequest', async (request) => {
      request.user = {
        id: 1,
        googleId: 'test-google-id',
        email: 'test@test.com',
        name: 'Test User',
        avatarUrl: null,
        isDemo: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
    await app.register(contactsRoutes, { prefix: '/api/contacts' });
    await app.register(statsRoutes, { prefix: '/api/stats' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('counts the same contacts as the has-photo filter', async () => {
    const db = getUserDatabase(1);
    const insert = db.prepare('INSERT INTO contacts (display_name, photo_hash, archived_at) VALUES (?, ?, ?)');
    insert.run('With photo', 'aa11', null);
    insert.run('Also with photo', 'bb22', null);
    insert.run('No photo', null, null);
    insert.run('Archived with photo', 'cc33', '2026-10-01 00:00:00');

    const dash = (await app.inject('/api/stats/dashboard')).json();
    const list = (await app.inject('/api/contacts?filter=has-photo')).json();

    expect(dash.overview.contactsWithPhotos).toBe(2);
    expect(list.total).toBe(dash.overview.contactsWithPhotos);
  });
});
