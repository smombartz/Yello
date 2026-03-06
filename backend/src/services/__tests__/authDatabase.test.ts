import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getAuthDatabase, closeAuthDatabase } from '../authDatabase.js';

describe('authDatabase', () => {
  let tmpDir: string;
  const originalAuthDbPath = process.env.AUTH_DATABASE_PATH;

  beforeEach(() => {
    // Create a unique temp directory for each test
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'authdb-test-'));
    process.env.AUTH_DATABASE_PATH = path.join(tmpDir, 'auth.db');
  });

  afterEach(() => {
    closeAuthDatabase();

    // Clean up temp directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // Restore original env
    if (originalAuthDbPath !== undefined) {
      process.env.AUTH_DATABASE_PATH = originalAuthDbPath;
    } else {
      delete process.env.AUTH_DATABASE_PATH;
    }
  });

  it('should create the auth database with users table', () => {
    const db = getAuthDatabase();

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .all() as Array<{ name: string }>;

    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('users');

    // Verify all columns exist
    const columns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('google_id');
    expect(columnNames).toContain('email');
    expect(columnNames).toContain('name');
    expect(columnNames).toContain('avatar_url');
    expect(columnNames).toContain('access_token');
    expect(columnNames).toContain('refresh_token');
    expect(columnNames).toContain('token_expires_at');
    expect(columnNames).toContain('created_at');
    expect(columnNames).toContain('updated_at');
  });

  it('should create the auth database with sessions table', () => {
    const db = getAuthDatabase();

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
      .all() as Array<{ name: string }>;

    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('sessions');

    // Verify columns
    const columns = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('user_id');
    expect(columnNames).toContain('expires_at');
    expect(columnNames).toContain('created_at');
  });

  it('should create the auth database with profile_images table', () => {
    const db = getAuthDatabase();

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='profile_images'")
      .all() as Array<{ name: string }>;

    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('profile_images');

    // Verify columns
    const columns = db.prepare("PRAGMA table_info(profile_images)").all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('user_id');
    expect(columnNames).toContain('source');
    expect(columnNames).toContain('original_url');
    expect(columnNames).toContain('local_hash');
    expect(columnNames).toContain('is_primary');
    expect(columnNames).toContain('fetched_at');
    expect(columnNames).toContain('created_at');
    expect(columnNames).toContain('updated_at');
  });

  it('should enforce source CHECK constraint on profile_images', () => {
    const db = getAuthDatabase();

    // Insert a valid user first
    db.prepare(`
      INSERT INTO users (google_id, email, name) VALUES ('g123', 'test@example.com', 'Test')
    `).run();

    // Valid sources should work
    for (const source of ['user_uploaded', 'google', 'google_contacts', 'gravatar']) {
      expect(() => {
        db.prepare(`
          INSERT INTO profile_images (user_id, source, is_primary) VALUES (1, ?, 0)
        `).run(source);
      }).not.toThrow();
    }

    // Invalid source should fail
    expect(() => {
      db.prepare(`
        INSERT INTO profile_images (user_id, source, is_primary) VALUES (1, 'invalid', 0)
      `).run();
    }).toThrow();
  });

  it('should return the same instance on subsequent calls (singleton)', () => {
    const db1 = getAuthDatabase();
    const db2 = getAuthDatabase();
    expect(db1).toBe(db2);
  });

  it('should return a new instance after closeAuthDatabase is called', () => {
    const db1 = getAuthDatabase();
    closeAuthDatabase();
    const db2 = getAuthDatabase();
    expect(db1).not.toBe(db2);
  });

  it('should NOT create contact-related tables', () => {
    const db = getAuthDatabase();

    const contactTables = [
      'contacts',
      'contact_emails',
      'contact_phones',
      'contact_addresses',
      'contact_social_profiles',
      'contact_categories',
      'contact_instant_messages',
      'contact_urls',
      'contact_related_people',
      'contacts_fts',
      'emails_fts',
      'contacts_unified_fts',
      'user_settings',
      'linkedin_enrichment',
      'contact_emails_history',
      'contact_photos',
    ];

    for (const tableName of contactTables) {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(tableName) as { name: string } | undefined;
      expect(result).toBeUndefined();
    }
  });

  it('should have is_demo column on users table', () => {
    const db = getAuthDatabase();
    const columns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('is_demo');
  });

  it('should create relevant indexes', () => {
    const db = getAuthDatabase();

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_users_is_demo');
    expect(indexNames).toContain('idx_users_google_id');
    expect(indexNames).toContain('idx_users_email');
    expect(indexNames).toContain('idx_sessions_user_id');
    expect(indexNames).toContain('idx_sessions_expires_at');
    expect(indexNames).toContain('idx_profile_images_user_id');
    expect(indexNames).toContain('idx_profile_images_source');
    expect(indexNames).toContain('idx_profile_images_user_source');
  });

  it('should set WAL mode and foreign keys', () => {
    const db = getAuthDatabase();

    const journalMode = db.pragma('journal_mode', { simple: true }) as string;
    expect(journalMode).toBe('wal');

    const foreignKeys = db.pragma('foreign_keys', { simple: true }) as number;
    expect(foreignKeys).toBe(1);
  });

  it('should create parent directory if it does not exist', () => {
    const nestedPath = path.join(tmpDir, 'nested', 'deep', 'auth.db');
    process.env.AUTH_DATABASE_PATH = nestedPath;
    closeAuthDatabase(); // reset singleton from beforeEach

    const db = getAuthDatabase();
    expect(db).toBeDefined();
    expect(fs.existsSync(nestedPath)).toBe(true);
  });

  it('should enforce google_id UNIQUE constraint on users', () => {
    const db = getAuthDatabase();

    db.prepare(`
      INSERT INTO users (google_id, email, name) VALUES ('g1', 'a@test.com', 'A')
    `).run();

    expect(() => {
      db.prepare(`
        INSERT INTO users (google_id, email, name) VALUES ('g1', 'b@test.com', 'B')
      `).run();
    }).toThrow();
  });

  it('should enforce email UNIQUE constraint on users', () => {
    const db = getAuthDatabase();

    db.prepare(`
      INSERT INTO users (google_id, email, name) VALUES ('g1', 'same@test.com', 'A')
    `).run();

    expect(() => {
      db.prepare(`
        INSERT INTO users (google_id, email, name) VALUES ('g2', 'same@test.com', 'B')
      `).run();
    }).toThrow();
  });

  it('should cascade delete sessions when user is deleted', () => {
    const db = getAuthDatabase();

    db.prepare(`
      INSERT INTO users (google_id, email, name) VALUES ('g1', 'test@test.com', 'Test')
    `).run();

    db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess1', 1, '2099-01-01')
    `).run();

    // Delete user
    db.prepare('DELETE FROM users WHERE id = 1').run();

    // Session should be cascade deleted
    const sessions = db.prepare('SELECT * FROM sessions WHERE user_id = 1').all();
    expect(sessions).toHaveLength(0);
  });

  it('should cascade delete profile_images when user is deleted', () => {
    const db = getAuthDatabase();

    db.prepare(`
      INSERT INTO users (google_id, email, name) VALUES ('g1', 'test@test.com', 'Test')
    `).run();

    db.prepare(`
      INSERT INTO profile_images (user_id, source, is_primary) VALUES (1, 'google', 1)
    `).run();

    // Delete user
    db.prepare('DELETE FROM users WHERE id = 1').run();

    // Profile image should be cascade deleted
    const images = db.prepare('SELECT * FROM profile_images WHERE user_id = 1').all();
    expect(images).toHaveLength(0);
  });
});
