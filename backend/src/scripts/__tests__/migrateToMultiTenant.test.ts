import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { migrateToMultiTenant, type MigrationOptions } from '../migrateToMultiTenant.js';

/**
 * Creates a mock "old" single-tenant database with both auth and contact tables,
 * matching the schema from the existing database.ts.
 */
function createOldDatabase(dbPath: string): void {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    -- Auth tables
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      avatar_url TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE profile_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('user_uploaded', 'google', 'google_contacts', 'gravatar')),
      original_url TEXT,
      local_hash TEXT,
      is_primary INTEGER DEFAULT 0,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Contact tables
    CREATE TABLE contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT,
      last_name TEXT,
      display_name TEXT NOT NULL,
      company TEXT,
      title TEXT,
      notes TEXT,
      birthday TEXT,
      photo_hash TEXT,
      raw_vcard TEXT,
      archived_at DATETIME DEFAULT NULL,
      gmail_history_id TEXT DEFAULT NULL,
      gmail_last_sync_at TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE contact_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      type TEXT,
      is_primary INTEGER DEFAULT 0
    );

    CREATE TABLE contact_phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      phone_display TEXT NOT NULL,
      country_code TEXT DEFAULT NULL,
      type TEXT,
      is_primary INTEGER DEFAULT 0
    );

    CREATE TABLE contact_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      street TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      country TEXT,
      type TEXT,
      latitude REAL DEFAULT NULL,
      longitude REAL DEFAULT NULL,
      geocoded_at TEXT DEFAULT NULL
    );

    CREATE TABLE user_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT,
      email TEXT,
      phone TEXT,
      avatar_url TEXT,
      website TEXT,
      linkedin_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO user_settings (id) VALUES (1);
  `);

  // Insert test data: admin user
  db.prepare(`
    INSERT INTO users (google_id, email, name, avatar_url, access_token, refresh_token)
    VALUES ('google-admin-123', 'admin@example.com', 'Admin User', 'https://avatar.url/pic.jpg', 'access-tok', 'refresh-tok')
  `).run();

  // Insert a session
  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES ('session-abc', 1, '2099-12-31')
  `).run();

  // Insert a profile image
  db.prepare(`
    INSERT INTO profile_images (user_id, source, original_url, is_primary)
    VALUES (1, 'google', 'https://avatar.url/pic.jpg', 1)
  `).run();

  // Insert contacts
  db.prepare(`
    INSERT INTO contacts (first_name, last_name, display_name, company)
    VALUES ('John', 'Doe', 'John Doe', 'Acme Corp')
  `).run();

  db.prepare(`
    INSERT INTO contacts (first_name, last_name, display_name, company)
    VALUES ('Jane', 'Smith', 'Jane Smith', 'Widget Inc')
  `).run();

  // Insert contact emails
  db.prepare(`
    INSERT INTO contact_emails (contact_id, email, type, is_primary)
    VALUES (1, 'john@acme.com', 'work', 1)
  `).run();

  db.prepare(`
    INSERT INTO contact_emails (contact_id, email, type, is_primary)
    VALUES (2, 'jane@widget.com', 'work', 1)
  `).run();

  db.close();
}

/**
 * Creates mock photo files in the old photos directory.
 */
function createOldPhotos(photosPath: string): void {
  // Create nested directory structure like the real app uses
  const subDir = path.join(photosPath, 'thumbnail', 'ab');
  fs.mkdirSync(subDir, { recursive: true });
  fs.writeFileSync(path.join(subDir, 'abcdef1234.jpg'), 'fake-photo-data-1');

  const subDir2 = path.join(photosPath, 'small', 'cd');
  fs.mkdirSync(subDir2, { recursive: true });
  fs.writeFileSync(path.join(subDir2, 'cdef567890.jpg'), 'fake-photo-data-2');
}

describe('migrateToMultiTenant', () => {
  let tmpDir: string;
  let options: MigrationOptions;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));

    const oldDbPath = path.join(tmpDir, 'old', 'contacts.db');
    const oldPhotosPath = path.join(tmpDir, 'old', 'photos');
    const authDbPath = path.join(tmpDir, 'new', 'auth.db');
    const userDataPath = path.join(tmpDir, 'new', 'users');

    options = { oldDbPath, oldPhotosPath, authDbPath, userDataPath };
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should throw if old DB does not exist', () => {
    expect(() => migrateToMultiTenant(options)).toThrow(/does not exist/);
  });

  it('should throw if no users found in old DB', () => {
    // Create DB without any users
    const dir = path.dirname(options.oldDbPath);
    fs.mkdirSync(dir, { recursive: true });

    const db = new Database(options.oldDbPath);
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        google_id TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        avatar_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    db.close();

    expect(() => migrateToMultiTenant(options)).toThrow(/no users found/i);
  });

  it('should create auth.db with users and sessions from old DB', () => {
    createOldDatabase(options.oldDbPath);
    createOldPhotos(options.oldPhotosPath);

    migrateToMultiTenant(options);

    // Open auth.db and verify
    const authDb = new Database(options.authDbPath, { readonly: true });

    // Check users table exists and has data
    const users = authDb.prepare('SELECT * FROM users').all() as Array<{
      id: number;
      google_id: string;
      email: string;
      name: string;
      avatar_url: string;
      access_token: string;
      refresh_token: string;
    }>;
    expect(users).toHaveLength(1);
    expect(users[0].google_id).toBe('google-admin-123');
    expect(users[0].email).toBe('admin@example.com');
    expect(users[0].name).toBe('Admin User');
    expect(users[0].access_token).toBe('access-tok');
    expect(users[0].refresh_token).toBe('refresh-tok');

    // Check sessions
    const sessions = authDb.prepare('SELECT * FROM sessions').all() as Array<{
      id: string;
      user_id: number;
    }>;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('session-abc');
    expect(sessions[0].user_id).toBe(1);

    // Check profile images
    const images = authDb.prepare('SELECT * FROM profile_images').all() as Array<{
      user_id: number;
      source: string;
    }>;
    expect(images).toHaveLength(1);
    expect(images[0].user_id).toBe(1);
    expect(images[0].source).toBe('google');

    authDb.close();
  });

  it('should create user DB with contacts from old DB', () => {
    createOldDatabase(options.oldDbPath);
    createOldPhotos(options.oldPhotosPath);

    migrateToMultiTenant(options);

    // The admin user has id=1, so user DB is at userDataPath/1/contacts.db
    const userDbPath = path.join(options.userDataPath, '1', 'contacts.db');
    expect(fs.existsSync(userDbPath)).toBe(true);

    const userDb = new Database(userDbPath, { readonly: true });

    // Verify contacts are there
    const contacts = userDb.prepare('SELECT * FROM contacts').all() as Array<{
      id: number;
      display_name: string;
    }>;
    expect(contacts).toHaveLength(2);
    expect(contacts[0].display_name).toBe('John Doe');
    expect(contacts[1].display_name).toBe('Jane Smith');

    // Verify contact_emails are there
    const emails = userDb.prepare('SELECT * FROM contact_emails').all() as Array<{
      contact_id: number;
      email: string;
    }>;
    expect(emails).toHaveLength(2);
    expect(emails[0].email).toBe('john@acme.com');
    expect(emails[1].email).toBe('jane@widget.com');

    userDb.close();
  });

  it('should NOT have auth tables in user DB', () => {
    createOldDatabase(options.oldDbPath);
    createOldPhotos(options.oldPhotosPath);

    migrateToMultiTenant(options);

    const userDbPath = path.join(options.userDataPath, '1', 'contacts.db');
    const userDb = new Database(userDbPath, { readonly: true });

    // Auth tables should not be present
    const tables = userDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).not.toContain('users');
    expect(tableNames).not.toContain('sessions');
    expect(tableNames).not.toContain('profile_images');

    // But contact tables should still exist
    expect(tableNames).toContain('contacts');
    expect(tableNames).toContain('contact_emails');

    userDb.close();
  });

  it('should copy photos to user directory', () => {
    createOldDatabase(options.oldDbPath);
    createOldPhotos(options.oldPhotosPath);

    migrateToMultiTenant(options);

    const userPhotosPath = path.join(options.userDataPath, '1', 'photos');
    expect(fs.existsSync(userPhotosPath)).toBe(true);

    // Verify nested photo structure was preserved
    const thumbFile = path.join(userPhotosPath, 'thumbnail', 'ab', 'abcdef1234.jpg');
    expect(fs.existsSync(thumbFile)).toBe(true);
    expect(fs.readFileSync(thumbFile, 'utf-8')).toBe('fake-photo-data-1');

    const smallFile = path.join(userPhotosPath, 'small', 'cd', 'cdef567890.jpg');
    expect(fs.existsSync(smallFile)).toBe(true);
    expect(fs.readFileSync(smallFile, 'utf-8')).toBe('fake-photo-data-2');
  });

  it('should rename old DB as backup (.bak)', () => {
    createOldDatabase(options.oldDbPath);
    createOldPhotos(options.oldPhotosPath);

    migrateToMultiTenant(options);

    // Original DB should be gone
    expect(fs.existsSync(options.oldDbPath)).toBe(false);

    // Backup should exist
    const bakPath = options.oldDbPath + '.bak';
    expect(fs.existsSync(bakPath)).toBe(true);

    // Backup should be a valid SQLite database
    const bakDb = new Database(bakPath, { readonly: true });
    const tables = bakDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    expect(tables.length).toBeGreaterThan(0);
    bakDb.close();
  });

  it('should work when old photos directory does not exist', () => {
    createOldDatabase(options.oldDbPath);
    // Don't create photos directory

    // Should not throw
    expect(() => migrateToMultiTenant(options)).not.toThrow();

    // Auth DB should still be created
    expect(fs.existsSync(options.authDbPath)).toBe(true);

    // User DB should still be created
    const userDbPath = path.join(options.userDataPath, '1', 'contacts.db');
    expect(fs.existsSync(userDbPath)).toBe(true);
  });

  it('should return the admin user id', () => {
    createOldDatabase(options.oldDbPath);
    createOldPhotos(options.oldPhotosPath);

    const result = migrateToMultiTenant(options);

    expect(result.adminUserId).toBe(1);
  });
});
