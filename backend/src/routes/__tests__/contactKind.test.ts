import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { getUserDatabase, closeAllUserDatabases } from '../../services/userDatabase.js';
import contactsRoutes from '../contacts.js';
import os from 'os';
import fs from 'fs';
import path from 'path';

/**
 * Person, company or generic: a contact is a company when flagged (Apple's Show as
 * Company), or when it has a company name but no first or last name, unless the user
 * picked a kind (contacts.kind). See services/contactKind.ts.
 */
describe('person, company or generic', () => {
  let app: FastifyInstance;
  let tmpDir: string;
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-contact-kind-test-'));
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
    await app.ready();

    const db = getUserDatabase(1);
    const insert = db.prepare(`
      INSERT INTO contacts (first_name, last_name, display_name, company, is_company, kind)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const add = (key: string, ...row: [string | null, string | null, string, string | null, number, string | null]) => {
      ids[key] = insert.run(...row).lastInsertRowid as number;
    };
    add('person', 'Ada', 'Lovelace', 'Ada Lovelace', 'Analytical Engines', 0, null);
    add('flagged', 'Tim', 'Cook', 'Apple', 'Apple', 1, 'company');
    add('detected', null, null, 'Acme Corp', 'Acme Corp', 0, null);
    add('confirmedPerson', null, null, 'Solo Studio', 'Solo Studio', 0, 'person');
    add('noName', null, null, 'someone@example.com', null, 0, null);
    add('generic', null, null, 'Front Desk', 'Hilton', 0, 'generic');
  });

  afterAll(async () => {
    await app.close();
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const listIds = async (filter: string) => {
    const body = (await app.inject(`/api/contacts?filter=${filter}`)).json();
    return (body.contacts as Array<{ id: number }>).map(c => c.id).sort();
  };

  it('filters companies: flagged and auto-detected, not ones the user called a person', async () => {
    expect(await listIds('is-company')).toEqual([ids.flagged, ids.detected].sort());
  });

  it('filters people, leaving out companies and generic contacts', async () => {
    expect(await listIds('is-person')).toEqual([ids.person, ids.confirmedPerson, ids.noName].sort());
  });

  it('filters generic contacts', async () => {
    expect(await listIds('is-generic')).toEqual([ids.generic]);
  });

  it('marks list rows and the detail with the effective value', async () => {
    const body = (await app.inject('/api/contacts')).json();
    const byId = new Map((body.contacts as Array<{ id: number; kind: string }>).map(c => [c.id, c.kind]));
    expect(byId.get(ids.detected)).toBe('company');
    expect(byId.get(ids.person)).toBe('person');
    expect(byId.get(ids.generic)).toBe('generic');

    const detail = (await app.inject(`/api/contacts/${ids.detected}`)).json();
    expect(detail.kind).toBe('company');
  });

  it('auto-detection never writes the synced flag', async () => {
    const row = getUserDatabase(1).prepare('SELECT is_company FROM contacts WHERE id = ?').get(ids.detected) as { is_company: number };
    expect(row.is_company).toBe(0);
  });

  it('picking Person on an auto-detected company sticks (older isCompany form)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/contacts/${ids.detected}`,
      payload: { isCompany: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().kind).toBe('person');
    expect(await listIds('is-company')).toEqual([ids.flagged]);
  });

  it('picking Generic never sets the synced company flag', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/contacts/${ids.flagged}`,
      payload: { kind: 'generic' },
    });
    expect(res.json().kind).toBe('generic');
    const row = getUserDatabase(1).prepare('SELECT is_company, kind FROM contacts WHERE id = ?').get(ids.flagged);
    expect(row).toEqual({ is_company: 0, kind: 'generic' });
  });

  it('a nameless contact is named after its company on save', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/contacts/${ids.noName}`,
      payload: { firstName: null, lastName: null, company: 'Globex', kind: 'company' },
    });
    expect(res.json().displayName).toBe('Globex');
    expect(res.json().kind).toBe('company');
  });

  it('creates a contact as a company', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/contacts',
      payload: { displayName: 'Initech', company: 'Initech', firstName: 'Bill', lastName: 'Lumbergh', kind: 'company' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().kind).toBe('company');
    const row = getUserDatabase(1).prepare('SELECT is_company, kind FROM contacts WHERE id = ?').get(res.json().id);
    expect(row).toEqual({ is_company: 1, kind: 'company' });
  });
});
