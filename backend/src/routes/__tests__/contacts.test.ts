import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { rebuildContactSearch } from '../../services/database.js';
import { getUserDatabase, closeAllUserDatabases } from '../../services/userDatabase.js';
import contactsRoutes from '../contacts.js';
import os from 'os';
import fs from 'fs';
import path from 'path';

describe('contacts routes', () => {
  let app: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-contacts-test-'));
    process.env.USER_DATA_PATH = tmpDir;

    app = Fastify();

    // Mock request.user so getUserDatabase(request.user!.id) works
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
  });

  afterAll(async () => {
    await app.close();
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    const db = getUserDatabase(1);
    // Clear tables before each test
    db.exec('DELETE FROM contact_addresses');
    db.exec('DELETE FROM contact_phones');
    db.exec('DELETE FROM contact_emails');
    db.exec('DELETE FROM contacts');
    db.exec('DELETE FROM contacts_unified_fts');
  });

  describe('archived details', () => {
    function seedWithPhones() {
      const db = getUserDatabase(1);
      const id = db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Ada Lovelace').lastInsertRowid as number;
      db.prepare('INSERT INTO contact_phones (contact_id, phone, phone_display, type, is_primary) VALUES (?, ?, ?, ?, 1)')
        .run(id, '+14155550100', '+1 415 555 0100', 'cell');
      return id;
    }

    it('round-trips archivedAt through PUT and GET, keeping the primary on an active row', async () => {
      const id = seedWithPhones();
      const response = await app.inject({
        method: 'PUT',
        url: `/api/contacts/${id}`,
        payload: {
          phones: [
            { phone: '+14155550100', phoneDisplay: '+1 415 555 0100', countryCode: null, type: 'cell', isPrimary: true, archivedAt: '2026-10-26T10:00:00.000Z' },
            { phone: '+14155550199', phoneDisplay: '+1 415 555 0199', countryCode: null, type: 'cell', isPrimary: false }
          ],
          emails: [{ email: 'old@example.com', type: 'home', isPrimary: true, archivedAt: '2026-10-01T00:00:00.000Z' }]
        }
      });
      expect(response.statusCode).toBe(200);

      const detail = (await app.inject({ method: 'GET', url: `/api/contacts/${id}` })).json();
      expect(detail.phones.map((p: { phone: string; isPrimary: boolean; archivedAt: string | null }) => [p.phone, p.isPrimary, p.archivedAt]))
        .toEqual([
          ['+14155550100', false, '2026-10-26T10:00:00.000Z'],
          ['+14155550199', true, null]
        ]);
      expect(detail.emails[0]).toMatchObject({ email: 'old@example.com', isPrimary: false, archivedAt: '2026-10-01T00:00:00.000Z' });

      // Unarchiving is just sending it back without archivedAt
      await app.inject({
        method: 'PUT',
        url: `/api/contacts/${id}`,
        payload: { emails: [{ email: 'old@example.com', type: 'home', isPrimary: true, archivedAt: null }] }
      });
      const after = (await app.inject({ method: 'GET', url: `/api/contacts/${id}` })).json();
      expect(after.emails[0]).toMatchObject({ isPrimary: true, archivedAt: null });
    });

    it('do not count for the list primary or the has-phone filter, but stay searchable', async () => {
      const id = seedWithPhones();
      const db = getUserDatabase(1);
      db.prepare("UPDATE contact_phones SET detail_archived_at = '2026-10-26', is_primary = 0 WHERE contact_id = ?").run(id);
      rebuildContactSearch(db, id);

      const list = (await app.inject({ method: 'GET', url: '/api/contacts' })).json();
      expect(list.contacts[0].primaryPhone ?? null).toBeNull();
      const withPhone = (await app.inject({ method: 'GET', url: '/api/contacts?filter=has-phone' })).json();
      expect(withPhone.total).toBe(0);
      const search = (await app.inject({ method: 'GET', url: '/api/contacts?search=0100' })).json();
      expect(search.contacts.map((c: { displayName: string }) => c.displayName)).toEqual(['Ada Lovelace']);
    });
  });

  describe('search after edit', () => {
    it('finds a renamed contact by its new name and not its old one', async () => {
      const db = getUserDatabase(1);
      const id = db.prepare('INSERT INTO contacts (first_name, last_name, display_name) VALUES (?, ?, ?)')
        .run('Brian', 'Benasich', 'Brian Benasich').lastInsertRowid as number;
      rebuildContactSearch(db, id);

      const put = await app.inject({
        method: 'PUT',
        url: `/api/contacts/${id}`,
        payload: { firstName: 'Bryan', lastName: 'Benasich' }
      });
      expect(put.statusCode).toBe(200);

      const byNew = (await app.inject({ method: 'GET', url: '/api/contacts?search=bryan%20benasich' })).json();
      expect(byNew.contacts.map((c: { id: number }) => c.id)).toEqual([id]);

      const byOld = (await app.inject({ method: 'GET', url: '/api/contacts?search=brian' })).json();
      expect(byOld.contacts).toHaveLength(0);
    });
  });

  describe('archived contacts', () => {
    // Archived contacts only show in the Archived view, never in the list, its search or groups.
    function seed() {
      const db = getUserDatabase(1);
      const active = db.prepare('INSERT INTO contacts (display_name, company) VALUES (?, ?)').run('Ada Active', 'Acme').lastInsertRowid as number;
      const archived = db.prepare("INSERT INTO contacts (display_name, company, archived_at) VALUES (?, ?, datetime('now'))").run('Arlo Archived', 'Acme').lastInsertRowid as number;
      const onlyArchived = db.prepare("INSERT INTO contacts (display_name, archived_at) VALUES (?, datetime('now'))").run('Olive Old').lastInsertRowid as number;
      for (const id of [active, archived, onlyArchived]) rebuildContactSearch(db, id);
      db.prepare('INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)').run(active, 'Friends');
      db.prepare('INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)').run(archived, 'Friends');
      db.prepare('INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)').run(onlyArchived, 'Old crew');
      return { active, archived, onlyArchived };
    }

    it('are left out of the list and its search', async () => {
      seed();
      const list = (await app.inject({ method: 'GET', url: '/api/contacts' })).json();
      expect(list.contacts.map((c: { displayName: string }) => c.displayName)).toEqual(['Ada Active']);
      expect(list.total).toBe(1);

      const search = (await app.inject({ method: 'GET', url: '/api/contacts?search=Acme' })).json();
      expect(search.contacts.map((c: { displayName: string }) => c.displayName)).toEqual(['Ada Active']);
    });

    it('are left out of a group, its counts, and groups that only hold archived contacts', async () => {
      seed();
      const inGroup = (await app.inject({ method: 'GET', url: '/api/contacts?category=Friends' })).json();
      expect(inGroup.total).toBe(1);

      const groups = (await app.inject({ method: 'GET', url: '/api/contacts/groups' })).json();
      expect(groups.groups).toEqual([{ category: 'Friends', contactCount: 1 }]);
    });

    it('are left out of Select All ids and the count', async () => {
      const { active } = seed();
      expect((await app.inject({ method: 'GET', url: '/api/contacts/ids' })).json().contactIds).toEqual([active]);
      expect((await app.inject({ method: 'GET', url: '/api/contacts/ids?search=Acme' })).json().contactIds).toEqual([active]);
      expect((await app.inject({ method: 'GET', url: '/api/contacts/count' })).json()).toEqual({ total: 1 });
    });
  });

  describe('add contact to group', () => {
    function seed() {
      const db = getUserDatabase(1);
      const member = db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Ruth Member').lastInsertRowid as number;
      const other = db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Ruthie Other').lastInsertRowid as number;
      const archived = db.prepare("INSERT INTO contacts (display_name, archived_at) VALUES (?, datetime('now'))").run('Ruthann Gone').lastInsertRowid as number;
      for (const id of [member, other, archived]) rebuildContactSearch(db, id);
      db.prepare('INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)').run(member, 'BDay 2026');
      db.prepare('INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)').run(other, 'Work');
      return { member, other, archived };
    }

    const categoriesOf = (id: number) => (getUserDatabase(1)
      .prepare('SELECT category FROM contact_categories WHERE contact_id = ? ORDER BY category').all(id) as { category: string }[])
      .map(r => r.category);

    it('adds the category, keeps the others, and bumps updated_at', async () => {
      const { other } = seed();
      getUserDatabase(1).prepare("UPDATE contacts SET updated_at = '2000-01-01 00:00:00' WHERE id = ?").run(other);

      const res = await app.inject({ method: 'POST', url: `/api/contacts/${other}/categories`, payload: { category: 'BDay 2026' } });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ added: true });
      expect(categoriesOf(other)).toEqual(['BDay 2026', 'Work']);

      const { updated_at } = getUserDatabase(1).prepare('SELECT updated_at FROM contacts WHERE id = ?').get(other) as { updated_at: string };
      expect(updated_at).not.toBe('2000-01-01 00:00:00');

      const inGroup = (await app.inject({ method: 'GET', url: '/api/contacts?category=BDay%202026' })).json();
      expect(inGroup.total).toBe(2);
    });

    it('is a no-op for a contact already in the group', async () => {
      const { member } = seed();
      const res = await app.inject({ method: 'POST', url: `/api/contacts/${member}/categories`, payload: { category: 'BDay 2026' } });
      expect(res.json()).toEqual({ added: false });
      expect(categoriesOf(member)).toEqual(['BDay 2026']);
    });

    it('refuses archived and missing contacts, and a blank category', async () => {
      const { archived, other } = seed();
      expect((await app.inject({ method: 'POST', url: `/api/contacts/${archived}/categories`, payload: { category: 'BDay 2026' } })).statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: '/api/contacts/999999/categories', payload: { category: 'BDay 2026' } })).statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: `/api/contacts/${other}/categories`, payload: { category: '   ' } })).statusCode).toBe(400);
      expect(categoriesOf(archived)).toEqual([]);
    });

    it('search with notInCategory leaves out current members', async () => {
      const { other } = seed();
      const all = (await app.inject({ method: 'GET', url: '/api/contacts/search?q=ruth' })).json();
      expect(all.map((c: { displayName: string }) => c.displayName).sort()).toEqual(['Ruth Member', 'Ruthie Other']);

      const candidates = (await app.inject({ method: 'GET', url: '/api/contacts/search?q=ruth&notInCategory=BDay%202026' })).json();
      expect(candidates.map((c: { id: number }) => c.id)).toEqual([other]);
    });
  });

  describe('GET /api/contacts/count', () => {
    it('should return count of 0 when no contacts', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts/count'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ total: 0 });
    });

    it('should return correct count when contacts exist', async () => {
      const db = getUserDatabase(1);
      db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('John Doe');
      db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Jane Smith');

      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts/count'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ total: 2 });
    });
  });

  describe('GET /api/contacts', () => {
    it('should return empty list when no contacts', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.contacts).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.page).toBe(1);
      expect(body.totalPages).toBe(0);
    });

    it('should return contacts with default pagination', async () => {
      const db = getUserDatabase(1);
      db.prepare('INSERT INTO contacts (display_name, first_name, last_name) VALUES (?, ?, ?)').run('John Doe', 'John', 'Doe');
      db.prepare('INSERT INTO contacts (display_name, first_name, last_name, company) VALUES (?, ?, ?, ?)').run('Jane Smith', 'Jane', 'Smith', 'Acme Inc');

      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.contacts).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.totalPages).toBe(1);
    });

    it('should return contacts sorted by last_name, first_name, display_name', async () => {
      const db = getUserDatabase(1);
      db.prepare('INSERT INTO contacts (display_name, first_name, last_name) VALUES (?, ?, ?)').run('John Doe', 'John', 'Doe');
      db.prepare('INSERT INTO contacts (display_name, first_name, last_name) VALUES (?, ?, ?)').run('Alice Smith', 'Alice', 'Smith');
      db.prepare('INSERT INTO contacts (display_name, first_name, last_name) VALUES (?, ?, ?)').run('Bob Smith', 'Bob', 'Smith');

      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts'
      });

      const body = response.json();
      expect(body.contacts[0].displayName).toBe('John Doe');
      expect(body.contacts[1].displayName).toBe('Alice Smith');
      expect(body.contacts[2].displayName).toBe('Bob Smith');
    });

    it('should paginate results', async () => {
      const db = getUserDatabase(1);
      for (let i = 0; i < 5; i++) {
        db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run(`Contact ${i}`);
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts?page=2&limit=2'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.contacts).toHaveLength(2);
      expect(body.total).toBe(5);
      expect(body.page).toBe(2);
      expect(body.totalPages).toBe(3);
    });

    it('should include primary email and phone', async () => {
      const db = getUserDatabase(1);
      const result = db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('John Doe');
      const contactId = result.lastInsertRowid;

      db.prepare('INSERT INTO contact_emails (contact_id, email, is_primary) VALUES (?, ?, ?)').run(contactId, 'john@example.com', 1);
      db.prepare('INSERT INTO contact_phones (contact_id, phone, phone_display, is_primary) VALUES (?, ?, ?, ?)').run(contactId, '+15551234567', '(555) 123-4567', 1);

      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts'
      });

      const body = response.json();
      expect(body.contacts[0].primaryEmail).toBe('john@example.com');
      expect(body.contacts[0].primaryPhone).toBe('(555) 123-4567');
    });

    it('should include photo URL when photo_hash exists', async () => {
      const db = getUserDatabase(1);
      db.prepare('INSERT INTO contacts (display_name, photo_hash) VALUES (?, ?)').run('John Doe', 'abc123def456');

      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts'
      });

      const body = response.json();
      expect(body.contacts[0].photoUrl).toBe('/photos/small/ab/abc123def456.jpg');
    });

    it('should search contacts using FTS', async () => {
      const db = getUserDatabase(1);
      const result1 = db.prepare('INSERT INTO contacts (display_name, company) VALUES (?, ?)').run('John Doe', 'Apple Inc');
      rebuildContactSearch(db, result1.lastInsertRowid as number);
      const result2 = db.prepare('INSERT INTO contacts (display_name, company) VALUES (?, ?)').run('Jane Smith', 'Microsoft');
      rebuildContactSearch(db, result2.lastInsertRowid as number);

      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts?search=Apple'
      });

      const body = response.json();
      expect(body.contacts).toHaveLength(1);
      expect(body.contacts[0].displayName).toBe('John Doe');
      expect(body.total).toBe(1);
    });

    it('should search with prefix matching', async () => {
      const db = getUserDatabase(1);
      const result1 = db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Smith Anderson');
      rebuildContactSearch(db, result1.lastInsertRowid as number);
      const result2 = db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Smithson Jones');
      rebuildContactSearch(db, result2.lastInsertRowid as number);
      const result3 = db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Jane Doe');
      rebuildContactSearch(db, result3.lastInsertRowid as number);

      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts?search=Smith'
      });

      const body = response.json();
      expect(body.contacts).toHaveLength(2);
      expect(body.total).toBe(2);
    });

    it('should search LinkedIn enrichment fields (headline, company, skills)', async () => {
      const db = getUserDatabase(1);
      const target = db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Grace Hopper');
      const targetId = target.lastInsertRowid as number;
      db.prepare(`
        INSERT INTO linkedin_enrichment (contact_id, headline, company_name, skills, positions)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        targetId,
        'Distinguished Compiler Pioneer',
        'US Navy',
        JSON.stringify(['COBOL', 'Compilers']),
        JSON.stringify([{ title: 'Rear Admiral', companyName: 'United States Navy' }])
      );
      rebuildContactSearch(db, targetId);

      const other = db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Someone Else');
      rebuildContactSearch(db, other.lastInsertRowid as number);

      for (const term of ['Compiler', 'COBOL', 'Navy', 'Admiral']) {
        const response = await app.inject({ method: 'GET', url: `/api/contacts?search=${term}` });
        const body = response.json();
        expect(body.total, `search=${term}`).toBe(1);
        expect(body.contacts[0].displayName, `search=${term}`).toBe('Grace Hopper');
      }
    });

    it('should search by email domain', async () => {
      const db = getUserDatabase(1);
      const target = db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Alan Turing');
      const targetId = target.lastInsertRowid as number;
      db.prepare('INSERT INTO contact_emails (contact_id, email, is_primary) VALUES (?, ?, ?)').run(targetId, 'alan@bletchley.org', 1);
      rebuildContactSearch(db, targetId);

      const other = db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('No Email');
      rebuildContactSearch(db, other.lastInsertRowid as number);

      const response = await app.inject({ method: 'GET', url: '/api/contacts?search=bletchley' });
      const body = response.json();
      expect(body.total).toBe(1);
      expect(body.contacts[0].displayName).toBe('Alan Turing');
    });

    it('should search by URL fragment', async () => {
      const db = getUserDatabase(1);
      const target = db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Ada Lovelace');
      const targetId = target.lastInsertRowid as number;
      db.prepare('INSERT INTO contact_urls (contact_id, url, label) VALUES (?, ?, ?)').run(targetId, 'https://analyticalengine.example/ada', 'Homepage');
      db.prepare('INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url) VALUES (?, ?, ?, ?)').run(targetId, 'linkedin', 'adalovelace', 'https://www.linkedin.com/in/countessofcomputing');
      rebuildContactSearch(db, targetId);

      const other = db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('No Links');
      rebuildContactSearch(db, other.lastInsertRowid as number);

      for (const term of ['analyticalengine', 'countessofcomputing']) {
        const response = await app.inject({ method: 'GET', url: `/api/contacts?search=${term}` });
        const body = response.json();
        expect(body.total, `search=${term}`).toBe(1);
        expect(body.contacts[0].displayName, `search=${term}`).toBe('Ada Lovelace');
      }
    });
  });

  describe('GET /api/contacts/:id', () => {
    it('should return 404 when contact not found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts/999'
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Contact not found' });
    });

    it('should return full contact detail', async () => {
      const db = getUserDatabase(1);
      const result = db.prepare(`
        INSERT INTO contacts (display_name, first_name, last_name, company, title, notes, photo_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('John Doe', 'John', 'Doe', 'Acme Inc', 'Engineer', 'Some notes', 'abc123');
      const contactId = result.lastInsertRowid;

      const response = await app.inject({
        method: 'GET',
        url: `/api/contacts/${contactId}`
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(Number(contactId));
      expect(body.displayName).toBe('John Doe');
      expect(body.firstName).toBe('John');
      expect(body.lastName).toBe('Doe');
      expect(body.company).toBe('Acme Inc');
      expect(body.title).toBe('Engineer');
      expect(body.notes).toBe('Some notes');
      expect(body.photoUrl).toBe('/photos/medium/ab/abc123.jpg');
    });

    it('should include emails in detail', async () => {
      const db = getUserDatabase(1);
      const result = db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('John Doe');
      const contactId = result.lastInsertRowid;

      db.prepare('INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, ?)').run(contactId, 'john@work.com', 'work', 1);
      db.prepare('INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, ?)').run(contactId, 'john@home.com', 'home', 0);

      const response = await app.inject({
        method: 'GET',
        url: `/api/contacts/${contactId}`
      });

      const body = response.json();
      expect(body.emails).toHaveLength(2);
      expect(body.emails[0].email).toBe('john@work.com');
      expect(body.emails[0].type).toBe('work');
      expect(body.emails[0].isPrimary).toBe(true);
    });

    it('should include phones in detail', async () => {
      const db = getUserDatabase(1);
      const result = db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('John Doe');
      const contactId = result.lastInsertRowid;

      db.prepare('INSERT INTO contact_phones (contact_id, phone, phone_display, type, is_primary) VALUES (?, ?, ?, ?, ?)').run(contactId, '+15551234567', '(555) 123-4567', 'mobile', 1);

      const response = await app.inject({
        method: 'GET',
        url: `/api/contacts/${contactId}`
      });

      const body = response.json();
      expect(body.phones).toHaveLength(1);
      expect(body.phones[0].phone).toBe('+15551234567');
      expect(body.phones[0].phoneDisplay).toBe('(555) 123-4567');
      expect(body.phones[0].type).toBe('mobile');
      expect(body.phones[0].isPrimary).toBe(true);
    });

    it('should include addresses in detail', async () => {
      const db = getUserDatabase(1);
      const result = db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('John Doe');
      const contactId = result.lastInsertRowid;

      db.prepare(`
        INSERT INTO contact_addresses (contact_id, street, city, state, postal_code, country, type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(contactId, '123 Main St', 'Springfield', 'IL', '62701', 'USA', 'home');

      const response = await app.inject({
        method: 'GET',
        url: `/api/contacts/${contactId}`
      });

      const body = response.json();
      expect(body.addresses).toHaveLength(1);
      expect(body.addresses[0].street).toBe('123 Main St');
      expect(body.addresses[0].city).toBe('Springfield');
      expect(body.addresses[0].state).toBe('IL');
      expect(body.addresses[0].postalCode).toBe('62701');
      expect(body.addresses[0].country).toBe('USA');
      expect(body.addresses[0].type).toBe('home');
    });
  });
});
