import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { getUserDatabase, closeAllUserDatabases } from '../../services/userDatabase.js';
import contactKindCleanupRoutes from '../contactKindCleanup.js';
import os from 'os';
import fs from 'fs';
import path from 'path';

/** Cleanup's "Company or Generic" tab (routes/contactKindCleanup.ts). */
describe('company or generic cleanup', () => {
  let app: FastifyInstance;
  let tmpDir: string;
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-kind-cleanup-test-'));
    process.env.USER_DATA_PATH = tmpDir;
    app = Fastify();
    app.addHook('onRequest', async (request) => {
      request.user = {
        id: 1, googleId: 'g', email: 'test@test.com', name: 'Test', avatarUrl: null, isDemo: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
    });
    await app.register(contactKindCleanupRoutes, { prefix: '/api/cleanup/contact-kind' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    const db = getUserDatabase(1);
    db.prepare('DELETE FROM contacts').run();
    const insert = db.prepare(`
      INSERT INTO contacts (first_name, last_name, display_name, company, is_company, kind, archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const add = (key: string, first: string | null, last: string | null, display: string, company: string | null,
      isCompany = 0, kind: string | null = null, archivedAt: string | null = null) => {
      ids[key] = insert.run(first, last, display, company, isCompany, kind, archivedAt).lastInsertRowid as number;
    };
    add('gmbh', null, null, 'Acme GmbH', 'Acme GmbH');
    add('studio', 'Blue', 'Studio', 'Blue Studio', null);
    add('frontDesk', null, null, 'Front Desk', null);
    add('person', 'Ada', 'Lovelace', 'Ada Lovelace', 'Acme Inc');
    add('picked', null, null, 'Solo LLC', 'Solo LLC', 0, 'person');
    add('flagged', null, null, 'Apple Inc', 'Apple Inc', 1, 'company');
    add('archived', null, null, 'Old Corp', 'Old Corp', 0, null, '2026-10-01 00:00:00');
  });

  const list = async (query = '') =>
    (await app.inject(`/api/cleanup/contact-kind/suggestions${query}`)).json() as {
      contacts: Array<{ id: number; suggestedKind: string; confidence: string; reasons: string[] }>;
      total: number;
    };

  it('counts suggestions, skipping picked, flagged and archived contacts', async () => {
    const summary = (await app.inject('/api/cleanup/contact-kind/summary')).json();
    expect(summary).toEqual({ company: 2, generic: 1, total: 3 });
  });

  it('lists strong suggestions first, filtered and paginated', async () => {
    const all = await list();
    expect(all.contacts.map(c => c.id)).toEqual([ids.gmbh, ids.frontDesk, ids.studio]);
    expect(all.contacts[2]).toMatchObject({ suggestedKind: 'company', confidence: 'likely' });

    const companies = await list('?kind=company&limit=1&offset=1');
    expect(companies.total).toBe(2);
    expect(companies.contacts.map(c => c.id)).toEqual([ids.studio]);
  });

  it('applying a kind takes the contact off the list', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cleanup/contact-kind/apply',
      payload: { items: [{ id: ids.frontDesk, kind: 'generic' }, { id: ids.studio, kind: 'person' }] },
    });
    expect(res.json()).toEqual({ updated: 2 });
    expect((await list()).contacts.map(c => c.id)).toEqual([ids.gmbh]);
    const row = getUserDatabase(1).prepare('SELECT is_company, kind FROM contacts WHERE id = ?').get(ids.frontDesk);
    expect(row).toEqual({ is_company: 0, kind: 'generic' });
  });

  it('apply-all marks each as suggested, honouring the filter and skipped rows', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cleanup/contact-kind/apply-all',
      payload: { kind: 'company', excludeIds: [ids.studio] },
    });
    expect(res.json()).toEqual({ updated: 1 });
    const db = getUserDatabase(1);
    expect(db.prepare('SELECT is_company, kind FROM contacts WHERE id = ?').get(ids.gmbh)).toEqual({ is_company: 1, kind: 'company' });
    expect(db.prepare('SELECT kind FROM contacts WHERE id = ?').get(ids.frontDesk)).toEqual({ kind: null });
    expect(db.prepare('SELECT kind FROM contacts WHERE id = ?').get(ids.studio)).toEqual({ kind: null });
  });
});
