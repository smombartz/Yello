import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { getUserDatabase, closeAllUserDatabases } from '../../services/userDatabase.js';
import textBlastRoutes from '../textBlast.js';

/** Text Blast routes: preview → create → the desktop app's status writes → history. */
describe('/api/text-blasts', () => {
  let app: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-text-blast-routes-'));
    process.env.USER_DATA_PATH = tmpDir;
    app = Fastify();
    app.addHook('onRequest', async (request) => {
      request.user = {
        id: 1, googleId: 'g', email: 't@t.com', name: 'T', avatarUrl: null, isDemo: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
    });
    await app.register(textBlastRoutes, { prefix: '/api/text-blasts' });
    await app.ready();

    const db = getUserDatabase(1);
    for (const [first, phone] of [['Ana', '+19175550101'], ['Ben', '+19175550102']]) {
      const id = db.prepare("INSERT INTO contacts (first_name, display_name) VALUES (?, ?)").run(first, first).lastInsertRowid;
      db.prepare("INSERT INTO contact_phones (contact_id, phone, phone_display, type) VALUES (?, ?, ?, 'cell')").run(id, phone, phone);
      db.prepare("INSERT INTO contact_categories (contact_id, category) VALUES (?, 'Party')").run(id);
    }
  });

  afterAll(async () => {
    await app.close();
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const input = {
    groups: ['Party'],
    csv: { name: 'extra.csv', text: 'phone,first_name\n0151 23456789,Jonas\n' },
    template: 'Hi {first_name}!',
    country: 'DE',
  };

  it('previews a merged list', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/text-blasts/preview', payload: input });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.recipients.map((r: { text: string }) => r.text)).toEqual(['Hi Ana!', 'Hi Ben!', 'Hi Jonas!']);
    expect(body.recipients[2].phone).toBe('+4915123456789');
    expect(body.csv).toMatchObject({ name: 'extra.csv', rows: 1 });
  });

  it('rejects a bad country code', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/text-blasts/preview', payload: { ...input, country: 'germany' } });
    expect(res.statusCode).toBe(400);
  });

  it('creates a blast, records statuses and counts the daily limit', async () => {
    const preview = (await app.inject({ method: 'POST', url: '/api/text-blasts/preview', payload: input })).json();
    const excludeKeys = [preview.recipients[1].key]; // untick Ben
    const created = await app.inject({ method: 'POST', url: '/api/text-blasts', payload: { ...input, excludeKeys } });
    expect(created.statusCode).toBe(200);
    const { blast } = created.json();
    expect(blast.recipients.map((r: { name: string }) => r.name)).toEqual(['Ana', 'Jonas']);
    expect(blast.sources).toEqual({ groups: ['Party'], csvName: 'extra.csv' });

    const rid = blast.recipients[0].id;
    const since = new Date(Date.now() - 5000).toISOString();
    expect((await app.inject({ method: 'POST', url: `/api/text-blasts/${blast.id}/status`, payload: { status: 'running' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/text-blasts/${blast.id}/recipients/${rid}/status`, payload: { status: 'in_flight' } })).statusCode).toBe(200);
    const done = await app.inject({
      method: 'POST', url: `/api/text-blasts/${blast.id}/recipients/${rid}/status`,
      payload: { status: 'delivered', service: 'iMessage', note: 'delivered' },
    });
    expect(done.json().recipient).toMatchObject({ status: 'delivered', service: 'iMessage' });
    expect((await app.inject({ method: 'POST', url: `/api/text-blasts/${blast.id}/recipients/${rid}/status`, payload: { status: 'bogus' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/api/text-blasts/${blast.id + 50}/recipients/${rid}/status`, payload: { status: 'sent' } })).statusCode).toBe(404);

    const today = await app.inject({ method: 'GET', url: `/api/text-blasts/sent-today?since=${encodeURIComponent(since)}` });
    expect(today.json()).toEqual({ count: 1, cap: 80 });

    expect((await app.inject({ method: 'DELETE', url: `/api/text-blasts/${blast.id}` })).statusCode).toBe(409);
    const list = (await app.inject({ method: 'GET', url: '/api/text-blasts' })).json();
    expect(list.blasts[0]).toMatchObject({ id: blast.id, status: 'running', total: 2, counts: { delivered: 1, '': 1 } });

    const rerun = await app.inject({ method: 'POST', url: `/api/text-blasts/${blast.id}/rerun`, payload: { template: 'Bye {first_name}' } });
    expect(rerun.json().blast.recipients.map((r: { text: string }) => r.text)).toEqual(['Bye Ana', 'Bye Jonas']);
  });

  it('normalizes a test number', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/text-blasts/normalize?phone=0151%2023456789&country=DE' });
    expect(res.json()).toEqual({ e164: '+4915123456789' });
    expect((await app.inject({ method: 'GET', url: '/api/text-blasts/normalize?phone=12' })).json().problem).toBeTruthy();
  });

  it('returns 404 for unknown blasts', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/text-blasts/9999' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/text-blasts/abc' })).statusCode).toBe(404);
  });
});
