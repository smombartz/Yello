import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { getDatabase, closeDatabase } from '../../services/database.js';
import contactsRoutes from '../contacts.js';

describe('contacts routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';

    app = Fastify();
    await app.register(contactsRoutes, { prefix: '/api/contacts' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
  });

  beforeEach(() => {
    const db = getDatabase();
    // Clear tables before each test
    db.exec('DELETE FROM contact_addresses');
    db.exec('DELETE FROM contact_phones');
    db.exec('DELETE FROM contact_emails');
    db.exec('DELETE FROM contacts');
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
      const db = getDatabase();
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
      const db = getDatabase();
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
      const db = getDatabase();
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
      const db = getDatabase();
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
      const db = getDatabase();
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
      const db = getDatabase();
      db.prepare('INSERT INTO contacts (display_name, photo_hash) VALUES (?, ?)').run('John Doe', 'abc123def456');

      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts'
      });

      const body = response.json();
      expect(body.contacts[0].photoUrl).toBe('/photos/thumbnail/ab/abc123def456.jpg');
    });

    it('should search contacts using FTS', async () => {
      const db = getDatabase();
      db.prepare('INSERT INTO contacts (display_name, company) VALUES (?, ?)').run('John Doe', 'Apple Inc');
      db.prepare('INSERT INTO contacts (display_name, company) VALUES (?, ?)').run('Jane Smith', 'Microsoft');

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
      const db = getDatabase();
      db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Smith Anderson');
      db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Smithson Jones');
      db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Jane Doe');

      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts?search=Smith'
      });

      const body = response.json();
      expect(body.contacts).toHaveLength(2);
      expect(body.total).toBe(2);
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
      const db = getDatabase();
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
      const db = getDatabase();
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
      const db = getDatabase();
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
      const db = getDatabase();
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
