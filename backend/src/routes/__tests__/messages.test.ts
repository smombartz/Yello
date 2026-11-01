import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { getUserDatabase, closeAllUserDatabases } from '../../services/userDatabase.js';
import messagesRoutes from '../messages.js';
import contactRoutes from '../contacts.js';
import { isContactEdit } from '../../services/sync/syncScheduler.js';

/** /api/messages (routes/messages.ts): upload, rank, review queue. */
describe('messages routes', () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let adaId: number;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-messages-routes-'));
    process.env.USER_DATA_PATH = tmpDir;
    app = Fastify();
    app.addHook('onRequest', async (request) => {
      request.user = {
        id: 1, googleId: 'g', email: 'test@test.com', name: 'Test', avatarUrl: null, isDemo: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
    });
    await app.register(messagesRoutes, { prefix: '/api/messages' });
    await app.register(contactRoutes, { prefix: '/api/contacts' });
    await app.ready();
    const db = getUserDatabase(1);
    adaId = db.prepare(`INSERT INTO contacts (display_name) VALUES ('Ada Lovelace')`).run().lastInsertRowid as number;
  });

  afterAll(async () => {
    await app.close();
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('takes an upload, queues the unknown number, and ranks it once linked', async () => {
    const upload = await app.inject({
      method: 'POST', url: '/api/messages/activity',
      payload: {
        channel: 'whatsapp', from: '2026-10-01', to: '2026-10-31', final: true,
        handles: [{ handle: '4915112345678@s.whatsapp.net', displayName: 'Ada' }],
        activity: [{ handle: '4915112345678@s.whatsapp.net', day: '2026-10-20', sent: 3, received: 2 }],
      },
    });
    expect(upload.statusCode).toBe(200);
    expect(upload.json()).toMatchObject({ handles: 1, days: 1, matched: 0 });

    const queue = (await app.inject('/api/messages/handles')).json();
    expect(queue.handles.map((h: { handle: string }) => h.handle)).toEqual(['+4915112345678']);

    const link = await app.inject({
      method: 'POST', url: '/api/messages/handles/link',
      payload: { handles: [{ channel: 'whatsapp', handle: '+4915112345678' }], contactId: adaId },
    });
    expect(link.json()).toEqual({ linked: 1, added: 1 });

    const top = (await app.inject('/api/messages/top?mode=count&window=90&today=2026-10-31')).json();
    expect(top.contacts[0]).toMatchObject({ contactId: adaId, total: 5, channels: { whatsapp: { sent: 3, received: 2, group: 0 } } });

    const stats = (await app.inject(`/api/messages/contacts/${adaId}`)).json();
    expect(stats.total).toBe(5);

    const sources = (await app.inject('/api/messages/sources')).json();
    expect(sources.sources).toHaveLength(5);
  });

  it('sorts the contact list by the latest message on any channel', async () => {
    const db = getUserDatabase(1);
    db.prepare(`INSERT INTO contacts (display_name) VALUES ('Zed Quiet')`).run();
    const res = await app.inject('/api/contacts?sort=last-contacted&limit=10');
    expect(res.statusCode).toBe(200);
    const names = res.json().contacts.map((c: { displayName: string }) => c.displayName);
    expect(names[0]).toBe('Ada Lovelace');
  });

  it('validates uploads', async () => {
    const bad = await app.inject({
      method: 'POST', url: '/api/messages/activity',
      payload: { channel: 'fax', from: '2026-10-01', to: '2026-10-31', handles: [], activity: [] },
    });
    expect(bad.statusCode).toBe(400);
    const outside = await app.inject({
      method: 'POST', url: '/api/messages/activity',
      payload: { channel: 'imessage', from: '2026-10-01', to: '2026-10-31', handles: [], activity: [{ handle: '+14155552671', day: '2026-12-01', sent: 1 }] },
    });
    expect(outside.statusCode).toBe(400);
  });

  it('linking triggers a sync, uploads do not', () => {
    expect(isContactEdit('POST', '/api/messages/handles/link', 200)).toBe(true);
    expect(isContactEdit('POST', '/api/messages/activity', 200)).toBe(false);
  });
});
