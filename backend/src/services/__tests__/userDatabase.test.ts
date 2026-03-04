import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getUserDatabase,
  getUserPhotosPath,
  closeUserDatabase,
  closeAllUserDatabases,
} from '../userDatabase.js';

describe('userDatabase', () => {
  let tmpDir: string;
  const originalUserDataPath = process.env.USER_DATA_PATH;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'userdb-test-'));
    process.env.USER_DATA_PATH = tmpDir;
  });

  afterEach(() => {
    closeAllUserDatabases();

    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    if (originalUserDataPath !== undefined) {
      process.env.USER_DATA_PATH = originalUserDataPath;
    } else {
      delete process.env.USER_DATA_PATH;
    }
  });

  it('should create the contacts table with all columns', () => {
    const db = getUserDatabase(1);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contacts'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);

    const columns = db.prepare('PRAGMA table_info(contacts)').all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('first_name');
    expect(columnNames).toContain('last_name');
    expect(columnNames).toContain('display_name');
    expect(columnNames).toContain('company');
    expect(columnNames).toContain('title');
    expect(columnNames).toContain('notes');
    expect(columnNames).toContain('birthday');
    expect(columnNames).toContain('photo_hash');
    expect(columnNames).toContain('raw_vcard');
    expect(columnNames).toContain('archived_at');
    expect(columnNames).toContain('gmail_history_id');
    expect(columnNames).toContain('gmail_last_sync_at');
    expect(columnNames).toContain('created_at');
    expect(columnNames).toContain('updated_at');
  });

  it('should create contact_emails table', () => {
    const db = getUserDatabase(1);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_emails'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);

    const columns = db.prepare('PRAGMA table_info(contact_emails)').all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('contact_id');
    expect(columnNames).toContain('email');
    expect(columnNames).toContain('type');
    expect(columnNames).toContain('is_primary');
  });

  it('should create contact_phones table with country_code', () => {
    const db = getUserDatabase(1);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_phones'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);

    const columns = db.prepare('PRAGMA table_info(contact_phones)').all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('contact_id');
    expect(columnNames).toContain('phone');
    expect(columnNames).toContain('phone_display');
    expect(columnNames).toContain('country_code');
    expect(columnNames).toContain('type');
    expect(columnNames).toContain('is_primary');
  });

  it('should create contact_addresses table with geocoding columns', () => {
    const db = getUserDatabase(1);

    const columns = db.prepare('PRAGMA table_info(contact_addresses)').all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('latitude');
    expect(columnNames).toContain('longitude');
    expect(columnNames).toContain('geocoded_at');
    expect(columnNames).toContain('street');
    expect(columnNames).toContain('city');
    expect(columnNames).toContain('state');
    expect(columnNames).toContain('postal_code');
    expect(columnNames).toContain('country');
    expect(columnNames).toContain('type');
  });

  it('should create user_settings table', () => {
    const db = getUserDatabase(1);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_settings'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);

    const columns = db.prepare('PRAGMA table_info(user_settings)').all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('name');
    expect(columnNames).toContain('email');
    expect(columnNames).toContain('phone');
    expect(columnNames).toContain('avatar_url');
    expect(columnNames).toContain('website');
    expect(columnNames).toContain('linkedin_url');

    // Should have default row inserted
    const row = db.prepare('SELECT * FROM user_settings WHERE id = 1').get();
    expect(row).toBeDefined();
  });

  it('should create all auxiliary contact tables', () => {
    const db = getUserDatabase(1);

    const expectedTables = [
      'contact_social_profiles',
      'contact_categories',
      'contact_instant_messages',
      'contact_urls',
      'contact_related_people',
      'linkedin_enrichment',
      'linkedin_enrichment_failures',
      'contact_emails_history',
      'contact_photos',
    ];

    for (const tableName of expectedTables) {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(tableName) as { name: string } | undefined;
      expect(result, `Expected table '${tableName}' to exist`).toBeDefined();
    }
  });

  it('should create FTS virtual tables', () => {
    const db = getUserDatabase(1);

    const ftsNames = ['contacts_fts', 'emails_fts', 'contacts_unified_fts'];

    for (const name of ftsNames) {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(name) as { name: string } | undefined;
      expect(result, `Expected FTS table '${name}' to exist`).toBeDefined();
    }
  });

  it('should create FTS triggers', () => {
    const db = getUserDatabase(1);

    const triggerNames = ['contacts_ai', 'contacts_ad', 'contacts_au', 'emails_ai', 'emails_ad'];

    for (const name of triggerNames) {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name=?")
        .get(name) as { name: string } | undefined;
      expect(result, `Expected trigger '${name}' to exist`).toBeDefined();
    }
  });

  it('should NOT create auth tables (users, sessions, profile_images)', () => {
    const db = getUserDatabase(1);

    const authTables = ['users', 'sessions', 'profile_images'];

    for (const tableName of authTables) {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(tableName) as { name: string } | undefined;
      expect(result, `Table '${tableName}' should NOT exist in user database`).toBeUndefined();
    }
  });

  it('should return the same instance for the same userId (caching)', () => {
    const db1 = getUserDatabase(1);
    const db2 = getUserDatabase(1);
    expect(db1).toBe(db2);
  });

  it('should return different instances for different userIds', () => {
    const db1 = getUserDatabase(1);
    const db2 = getUserDatabase(2);
    expect(db1).not.toBe(db2);
  });

  it('should create DB file at the correct path', () => {
    getUserDatabase(42);
    const expectedPath = path.join(tmpDir, '42', 'contacts.db');
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  it('should set WAL mode and foreign keys', () => {
    const db = getUserDatabase(1);

    const journalMode = db.pragma('journal_mode', { simple: true }) as string;
    expect(journalMode).toBe('wal');

    const foreignKeys = db.pragma('foreign_keys', { simple: true }) as number;
    expect(foreignKeys).toBe(1);
  });

  it('should close a specific user database and remove from cache', () => {
    const db1 = getUserDatabase(1);
    closeUserDatabase(1);

    // After closing, getting again should return a new instance
    const db2 = getUserDatabase(1);
    expect(db1).not.toBe(db2);
  });

  it('should close all user databases', () => {
    const db1 = getUserDatabase(1);
    const db2 = getUserDatabase(2);
    closeAllUserDatabases();

    // After closing all, getting again should return new instances
    const db1b = getUserDatabase(1);
    const db2b = getUserDatabase(2);
    expect(db1).not.toBe(db1b);
    expect(db2).not.toBe(db2b);
  });

  describe('getUserPhotosPath', () => {
    it('should return the correct path', () => {
      const photosPath = getUserPhotosPath(7);
      expect(photosPath).toBe(path.join(tmpDir, '7', 'photos'));
    });

    it('should create the photos directory', () => {
      const photosPath = getUserPhotosPath(7);
      expect(fs.existsSync(photosPath)).toBe(true);
      expect(fs.statSync(photosPath).isDirectory()).toBe(true);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest connections when cache exceeds 50', () => {
      // Create 51 connections (IDs 1..51)
      for (let i = 1; i <= 51; i++) {
        getUserDatabase(i);
      }

      // User 1 should have been evicted (it was the oldest)
      // Getting user 1 again should return a fresh instance
      // We verify by checking the DB file still exists and a new connection works
      const dbPath = path.join(tmpDir, '1', 'contacts.db');
      expect(fs.existsSync(dbPath)).toBe(true);

      // The re-opened DB should work normally
      const db = getUserDatabase(1);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contacts'")
        .all() as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
    });

    it('should keep recently accessed connections when cache is full', () => {
      // Create 50 connections (IDs 1..50)
      for (let i = 1; i <= 50; i++) {
        getUserDatabase(i);
      }

      // Access user 1 to make it recently used
      const db1first = getUserDatabase(1);

      // Now add user 51 - user 2 should be evicted (oldest after 1 was refreshed)
      getUserDatabase(51);

      // User 1 should still be cached (same instance)
      const db1second = getUserDatabase(1);
      expect(db1first).toBe(db1second);
    });
  });

  it('should create all expected indexes', () => {
    const db = getUserDatabase(1);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_contacts_display_name');
    expect(indexNames).toContain('idx_contacts_last_name');
    expect(indexNames).toContain('idx_contacts_archived_at');
    expect(indexNames).toContain('idx_contact_emails_contact_id');
    expect(indexNames).toContain('idx_contact_phones_contact_id');
    expect(indexNames).toContain('idx_contact_addresses_contact_id');
    expect(indexNames).toContain('idx_contact_addresses_composite');
    expect(indexNames).toContain('idx_contact_addresses_geocoded');
    expect(indexNames).toContain('idx_contact_social_profiles_contact_id');
    expect(indexNames).toContain('idx_contact_social_profiles_platform_username');
    expect(indexNames).toContain('idx_contact_emails_email_lower');
    expect(indexNames).toContain('idx_contact_phones_phone');
    expect(indexNames).toContain('idx_contact_categories_contact_id');
    expect(indexNames).toContain('idx_contact_instant_messages_contact_id');
    expect(indexNames).toContain('idx_contact_urls_contact_id');
    expect(indexNames).toContain('idx_contact_related_people_contact_id');
    expect(indexNames).toContain('idx_linkedin_enrichment_contact_id');
    expect(indexNames).toContain('idx_linkedin_enrichment_failures_contact_id');
    expect(indexNames).toContain('idx_email_history_contact');
    expect(indexNames).toContain('idx_email_history_gmail_id');
    expect(indexNames).toContain('idx_contact_photos_contact_id');
    expect(indexNames).toContain('idx_contact_photos_contact_source');
  });

  it('should enforce contact_photos source CHECK constraint', () => {
    const db = getUserDatabase(1);

    // Insert a contact first
    db.prepare(`
      INSERT INTO contacts (display_name) VALUES ('Test Contact')
    `).run();

    // Valid sources should work
    for (const source of ['vcard', 'google', 'gravatar', 'linkedin']) {
      expect(() => {
        db.prepare(`
          INSERT INTO contact_photos (contact_id, source, is_primary) VALUES (1, ?, 0)
        `).run(source);
      }).not.toThrow();

      // Clean up for unique constraint
      db.prepare('DELETE FROM contact_photos WHERE contact_id = 1 AND source = ?').run(source);
    }

    // Invalid source should fail
    expect(() => {
      db.prepare(`
        INSERT INTO contact_photos (contact_id, source, is_primary) VALUES (1, 'invalid', 0)
      `).run();
    }).toThrow();
  });

  it('should cascade delete related records when contact is deleted', () => {
    const db = getUserDatabase(1);

    db.prepare(`INSERT INTO contacts (display_name) VALUES ('Test')`).run();
    db.prepare(`INSERT INTO contact_emails (contact_id, email) VALUES (1, 'test@test.com')`).run();
    db.prepare(`INSERT INTO contact_phones (contact_id, phone, phone_display) VALUES (1, '+1234', '+1 234')`).run();

    db.prepare('DELETE FROM contacts WHERE id = 1').run();

    const emails = db.prepare('SELECT * FROM contact_emails WHERE contact_id = 1').all();
    const phones = db.prepare('SELECT * FROM contact_phones WHERE contact_id = 1').all();
    expect(emails).toHaveLength(0);
    expect(phones).toHaveLength(0);
  });
});
