# Multi-Tenancy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert Yello CRM from single-tenant to multi-tenant with database-per-user isolation, supporting 100+ users with completely private data.

**Architecture:** Shared auth DB (`data/auth.db`) for users/sessions/profile_images + per-user SQLite databases (`data/users/{userId}/contacts.db`) for all contact data + per-user photo directories (`data/users/{userId}/photos/`). LRU cache for database connection management.

**Tech Stack:** Node.js 20, Fastify 5, better-sqlite3, TypeScript

**Design Doc:** `docs/plans/2026-03-04-multi-tenancy-design.md`

---

## Phase 1: Database Layer

### Task 1: Create Auth Database Module

**Files:**
- Create: `backend/src/services/authDatabase.ts`
- Test: `backend/src/services/__tests__/authDatabase.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/__tests__/authDatabase.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { getAuthDatabase, closeAuthDatabase } from '../authDatabase.js';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = '/tmp/test-auth.db';

describe('authDatabase', () => {
  afterEach(() => {
    closeAuthDatabase();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('creates auth database with users, sessions, profile_images tables', () => {
    process.env.AUTH_DATABASE_PATH = TEST_DB_PATH;
    const db = getAuthDatabase();

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as Array<{ name: string }>;

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('profile_images');
  });

  it('returns the same instance on subsequent calls', () => {
    process.env.AUTH_DATABASE_PATH = TEST_DB_PATH;
    const db1 = getAuthDatabase();
    const db2 = getAuthDatabase();
    expect(db1).toBe(db2);
  });

  it('does NOT create contact-related tables', () => {
    process.env.AUTH_DATABASE_PATH = TEST_DB_PATH;
    const db = getAuthDatabase();

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as Array<{ name: string }>;

    const tableNames = tables.map(t => t.name);
    expect(tableNames).not.toContain('contacts');
    expect(tableNames).not.toContain('contact_emails');
    expect(tableNames).not.toContain('contact_phones');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/__tests__/authDatabase.test.ts`
Expected: FAIL with "Cannot find module '../authDatabase.js'"

**Step 3: Write minimal implementation**

```typescript
// backend/src/services/authDatabase.ts
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let authDb: DatabaseType | null = null;

export function getAuthDatabase(): DatabaseType {
  if (authDb) return authDb;

  const dbPath = process.env.AUTH_DATABASE_PATH || './data/auth.db';
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  authDb = new Database(dbPath);
  authDb.pragma('journal_mode = WAL');
  authDb.pragma('foreign_keys = ON');

  authDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
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

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profile_images (
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

    CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_profile_images_user_id ON profile_images(user_id);
    CREATE INDEX IF NOT EXISTS idx_profile_images_source ON profile_images(source);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_images_user_source ON profile_images(user_id, source);
  `);

  return authDb;
}

export function closeAuthDatabase(): void {
  if (authDb) {
    authDb.close();
    authDb = null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/__tests__/authDatabase.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/authDatabase.ts backend/src/services/__tests__/authDatabase.test.ts
git commit -m "feat: add auth database module for multi-tenancy"
```

---

### Task 2: Create User Database Module with LRU Cache

**Files:**
- Create: `backend/src/services/userDatabase.ts`
- Test: `backend/src/services/__tests__/userDatabase.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/__tests__/userDatabase.test.ts
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { getUserDatabase, closeUserDatabase, closeAllUserDatabases, getUserPhotosPath } from '../userDatabase.js';
import fs from 'fs';
import path from 'path';

const TEST_DATA_DIR = '/tmp/test-user-data';

describe('userDatabase', () => {
  beforeEach(() => {
    process.env.USER_DATA_PATH = TEST_DATA_DIR;
  });

  afterEach(() => {
    closeAllUserDatabases();
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  it('creates per-user database with contact tables', () => {
    const db = getUserDatabase(1);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as Array<{ name: string }>;

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('contacts');
    expect(tableNames).toContain('contact_emails');
    expect(tableNames).toContain('contact_phones');
    expect(tableNames).toContain('contact_addresses');
    expect(tableNames).toContain('user_settings');
  });

  it('does NOT create auth tables in user database', () => {
    const db = getUserDatabase(1);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as Array<{ name: string }>;

    const tableNames = tables.map(t => t.name);
    expect(tableNames).not.toContain('users');
    expect(tableNames).not.toContain('sessions');
    expect(tableNames).not.toContain('profile_images');
  });

  it('returns the same instance for the same userId', () => {
    const db1 = getUserDatabase(1);
    const db2 = getUserDatabase(1);
    expect(db1).toBe(db2);
  });

  it('returns different instances for different userIds', () => {
    const db1 = getUserDatabase(1);
    const db2 = getUserDatabase(2);
    expect(db1).not.toBe(db2);
  });

  it('creates database file at correct path', () => {
    getUserDatabase(42);
    const expectedPath = path.join(TEST_DATA_DIR, '42', 'contacts.db');
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  it('getUserPhotosPath returns correct path and creates directory', () => {
    const photosPath = getUserPhotosPath(42);
    expect(photosPath).toBe(path.join(TEST_DATA_DIR, '42', 'photos'));
    expect(fs.existsSync(photosPath)).toBe(true);
  });

  it('evicts oldest connection when cache exceeds max size', () => {
    // Create more connections than the cache limit
    // Use a small cache for testing (set via env or default)
    for (let i = 1; i <= 55; i++) {
      getUserDatabase(i);
    }

    // First few should have been evicted (DB files still exist, just connections closed)
    // Getting them again should work (re-opens)
    const db = getUserDatabase(1);
    expect(db).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/__tests__/userDatabase.test.ts`
Expected: FAIL with "Cannot find module '../userDatabase.js'"

**Step 3: Write implementation**

```typescript
// backend/src/services/userDatabase.ts
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const MAX_CACHED_CONNECTIONS = 50;

interface CachedConnection {
  db: DatabaseType;
  lastAccess: number;
}

const connectionCache = new Map<number, CachedConnection>();

function getUserDataPath(): string {
  return process.env.USER_DATA_PATH || './data/users';
}

function getUserDbPath(userId: number): string {
  return path.join(getUserDataPath(), String(userId), 'contacts.db');
}

export function getUserPhotosPath(userId: number): string {
  const photosPath = path.join(getUserDataPath(), String(userId), 'photos');
  if (!fs.existsSync(photosPath)) {
    fs.mkdirSync(photosPath, { recursive: true });
  }
  return photosPath;
}

function evictOldestIfNeeded(): void {
  if (connectionCache.size < MAX_CACHED_CONNECTIONS) return;

  let oldestKey: number | null = null;
  let oldestTime = Infinity;

  for (const [key, entry] of connectionCache) {
    if (entry.lastAccess < oldestTime) {
      oldestTime = entry.lastAccess;
      oldestKey = key;
    }
  }

  if (oldestKey !== null) {
    const entry = connectionCache.get(oldestKey);
    if (entry) {
      try { entry.db.close(); } catch {}
      connectionCache.delete(oldestKey);
    }
  }
}

function initializeUserSchema(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
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

    CREATE TABLE IF NOT EXISTS contact_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      type TEXT,
      is_primary INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS contact_phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      phone_display TEXT NOT NULL,
      country_code TEXT DEFAULT NULL,
      type TEXT,
      is_primary INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS contact_addresses (
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

    CREATE TABLE IF NOT EXISTS contact_social_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      username TEXT NOT NULL,
      profile_url TEXT,
      type TEXT
    );

    CREATE TABLE IF NOT EXISTS contact_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      category TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contact_instant_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      service TEXT NOT NULL,
      handle TEXT NOT NULL,
      type TEXT
    );

    CREATE TABLE IF NOT EXISTS contact_urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      label TEXT,
      type TEXT
    );

    CREATE TABLE IF NOT EXISTS contact_related_people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      relationship TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS contacts_fts USING fts5(
      display_name,
      company,
      content='contacts',
      content_rowid='id',
      tokenize='porter unicode61',
      prefix='2 3'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
      email,
      content='contact_emails',
      content_rowid='id'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS contacts_unified_fts USING fts5(
      searchable_text,
      content='',
      contentless_delete=1,
      tokenize="unicode61 tokenchars '@.'"
    );

    CREATE TRIGGER IF NOT EXISTS contacts_ai AFTER INSERT ON contacts BEGIN
      INSERT INTO contacts_fts(rowid, display_name, company)
      VALUES (new.id, new.display_name, new.company);
    END;

    CREATE TRIGGER IF NOT EXISTS contacts_ad AFTER DELETE ON contacts BEGIN
      INSERT INTO contacts_fts(contacts_fts, rowid, display_name, company)
      VALUES('delete', old.id, old.display_name, old.company);
    END;

    CREATE TRIGGER IF NOT EXISTS contacts_au AFTER UPDATE ON contacts BEGIN
      INSERT INTO contacts_fts(contacts_fts, rowid, display_name, company)
      VALUES('delete', old.id, old.display_name, old.company);
      INSERT INTO contacts_fts(rowid, display_name, company)
      VALUES (new.id, new.display_name, new.company);
    END;

    CREATE TRIGGER IF NOT EXISTS emails_ai AFTER INSERT ON contact_emails BEGIN
      INSERT INTO emails_fts(rowid, email) VALUES (new.id, new.email);
    END;

    CREATE TRIGGER IF NOT EXISTS emails_ad AFTER DELETE ON contact_emails BEGIN
      INSERT INTO emails_fts(emails_fts, rowid, email) VALUES('delete', old.id, old.email);
    END;

    CREATE INDEX IF NOT EXISTS idx_contacts_display_name ON contacts(display_name);
    CREATE INDEX IF NOT EXISTS idx_contacts_last_name ON contacts(last_name, first_name);
    CREATE INDEX IF NOT EXISTS idx_contacts_archived_at ON contacts(archived_at);
    CREATE INDEX IF NOT EXISTS idx_contact_emails_contact_id ON contact_emails(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_phones_contact_id ON contact_phones(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_addresses_contact_id ON contact_addresses(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_social_profiles_contact_id ON contact_social_profiles(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_social_profiles_platform_username ON contact_social_profiles(platform, username);
    CREATE INDEX IF NOT EXISTS idx_contact_emails_email_lower ON contact_emails(email COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_contact_phones_phone ON contact_phones(phone);
    CREATE INDEX IF NOT EXISTS idx_contact_addresses_composite ON contact_addresses(street, city, postal_code);
    CREATE INDEX IF NOT EXISTS idx_contact_addresses_geocoded ON contact_addresses(latitude, longitude) WHERE latitude IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_contact_categories_contact_id ON contact_categories(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_instant_messages_contact_id ON contact_instant_messages(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_urls_contact_id ON contact_urls(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_related_people_contact_id ON contact_related_people(contact_id);

    CREATE TABLE IF NOT EXISTS user_settings (
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

    INSERT OR IGNORE INTO user_settings (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS linkedin_enrichment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
      linkedin_first_name TEXT,
      linkedin_last_name TEXT,
      headline TEXT,
      about TEXT,
      job_title TEXT,
      company_name TEXT,
      company_linkedin_url TEXT,
      industry TEXT,
      country TEXT,
      location TEXT,
      followers_count INTEGER,
      education TEXT,
      skills TEXT,
      photo_linkedin TEXT,
      positions TEXT,
      certifications TEXT,
      languages TEXT,
      honors TEXT,
      enriched_at TEXT,
      raw_response TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_linkedin_enrichment_contact_id ON linkedin_enrichment(contact_id);

    CREATE TABLE IF NOT EXISTS linkedin_enrichment_failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
      error_reason TEXT NOT NULL,
      attempted_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_linkedin_enrichment_failures_contact_id ON linkedin_enrichment_failures(contact_id);

    CREATE TABLE IF NOT EXISTS contact_emails_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      gmail_message_id TEXT NOT NULL UNIQUE,
      thread_id TEXT NOT NULL,
      subject TEXT,
      date TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
      snippet TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_email_history_contact ON contact_emails_history(contact_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_email_history_gmail_id ON contact_emails_history(gmail_message_id);

    CREATE TABLE IF NOT EXISTS contact_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('vcard', 'google', 'gravatar', 'linkedin')),
      original_url TEXT,
      local_hash TEXT,
      is_primary INTEGER DEFAULT 0,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_contact_photos_contact_id ON contact_photos(contact_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_photos_contact_source ON contact_photos(contact_id, source);
  `);
}

export function getUserDatabase(userId: number): DatabaseType {
  const cached = connectionCache.get(userId);
  if (cached) {
    cached.lastAccess = Date.now();
    return cached.db;
  }

  evictOldestIfNeeded();

  const dbPath = getUserDbPath(userId);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initializeUserSchema(db);

  connectionCache.set(userId, { db, lastAccess: Date.now() });
  return db;
}

export function closeUserDatabase(userId: number): void {
  const cached = connectionCache.get(userId);
  if (cached) {
    try { cached.db.close(); } catch {}
    connectionCache.delete(userId);
  }
}

export function closeAllUserDatabases(): void {
  for (const [, entry] of connectionCache) {
    try { entry.db.close(); } catch {}
  }
  connectionCache.clear();
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/__tests__/userDatabase.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/userDatabase.ts backend/src/services/__tests__/userDatabase.test.ts
git commit -m "feat: add user database module with LRU connection cache"
```

---

### Task 3: Create Migration Script

**Files:**
- Create: `backend/src/scripts/migrateToMultiTenant.ts`
- Test: `backend/src/scripts/__tests__/migrateToMultiTenant.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/scripts/__tests__/migrateToMultiTenant.test.ts
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { migrateToMultiTenant } from '../migrateToMultiTenant.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const TEST_DIR = '/tmp/test-migration';
const OLD_DB_PATH = path.join(TEST_DIR, 'contacts.db');
const OLD_PHOTOS_PATH = path.join(TEST_DIR, 'photos');
const AUTH_DB_PATH = path.join(TEST_DIR, 'auth.db');
const USER_DATA_PATH = path.join(TEST_DIR, 'users');

describe('migrateToMultiTenant', () => {
  beforeEach(() => {
    // Clean up
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(OLD_PHOTOS_PATH, { recursive: true });

    // Create a fake old single-tenant DB with test data
    const oldDb = new Database(OLD_DB_PATH);
    oldDb.pragma('journal_mode = WAL');
    oldDb.pragma('foreign_keys = ON');

    oldDb.exec(`
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
        user_id INTEGER NOT NULL REFERENCES users(id),
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE profile_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        source TEXT NOT NULL,
        original_url TEXT,
        local_hash TEXT,
        is_primary INTEGER DEFAULT 0,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        display_name TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        company TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE contact_emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL REFERENCES contacts(id),
        email TEXT NOT NULL,
        type TEXT,
        is_primary INTEGER DEFAULT 0
      );

      INSERT INTO users (google_id, email, name) VALUES ('g123', 'admin@test.com', 'Admin User');
      INSERT INTO contacts (display_name, first_name) VALUES ('John Doe', 'John');
      INSERT INTO contacts (display_name, first_name) VALUES ('Jane Smith', 'Jane');
      INSERT INTO contact_emails (contact_id, email, type) VALUES (1, 'john@test.com', 'work');
    `);
    oldDb.close();

    // Create a fake photo file
    const photoDir = path.join(OLD_PHOTOS_PATH, 'thumbnail', 'ab');
    fs.mkdirSync(photoDir, { recursive: true });
    fs.writeFileSync(path.join(photoDir, 'abcdef.jpg'), 'fake-photo-data');
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('creates auth.db with users and sessions from old DB', () => {
    migrateToMultiTenant({
      oldDbPath: OLD_DB_PATH,
      oldPhotosPath: OLD_PHOTOS_PATH,
      authDbPath: AUTH_DB_PATH,
      userDataPath: USER_DATA_PATH,
    });

    expect(fs.existsSync(AUTH_DB_PATH)).toBe(true);

    const authDb = new Database(AUTH_DB_PATH);
    const users = authDb.prepare('SELECT * FROM users').all() as Array<{ email: string }>;
    expect(users.length).toBe(1);
    expect(users[0].email).toBe('admin@test.com');
    authDb.close();
  });

  it('creates user DB with contacts from old DB', () => {
    migrateToMultiTenant({
      oldDbPath: OLD_DB_PATH,
      oldPhotosPath: OLD_PHOTOS_PATH,
      authDbPath: AUTH_DB_PATH,
      userDataPath: USER_DATA_PATH,
    });

    // Admin user has id=1
    const userDbPath = path.join(USER_DATA_PATH, '1', 'contacts.db');
    expect(fs.existsSync(userDbPath)).toBe(true);

    const userDb = new Database(userDbPath);
    const contacts = userDb.prepare('SELECT * FROM contacts').all() as Array<{ display_name: string }>;
    expect(contacts.length).toBe(2);

    const emails = userDb.prepare('SELECT * FROM contact_emails').all();
    expect(emails.length).toBe(1);

    // Should NOT have auth tables
    const tables = userDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    const tableNames = tables.map(t => t.name);
    expect(tableNames).not.toContain('users');
    expect(tableNames).not.toContain('sessions');

    userDb.close();
  });

  it('moves photos to user directory', () => {
    migrateToMultiTenant({
      oldDbPath: OLD_DB_PATH,
      oldPhotosPath: OLD_PHOTOS_PATH,
      authDbPath: AUTH_DB_PATH,
      userDataPath: USER_DATA_PATH,
    });

    const userPhotoPath = path.join(USER_DATA_PATH, '1', 'photos', 'thumbnail', 'ab', 'abcdef.jpg');
    expect(fs.existsSync(userPhotoPath)).toBe(true);
  });

  it('renames old DB as backup', () => {
    migrateToMultiTenant({
      oldDbPath: OLD_DB_PATH,
      oldPhotosPath: OLD_PHOTOS_PATH,
      authDbPath: AUTH_DB_PATH,
      userDataPath: USER_DATA_PATH,
    });

    expect(fs.existsSync(OLD_DB_PATH + '.bak')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/scripts/__tests__/migrateToMultiTenant.test.ts`
Expected: FAIL

**Step 3: Write implementation**

The migration script should:
1. Open old `contacts.db`
2. Create `auth.db` with users/sessions/profile_images data copied over
3. Identify the first user (admin)
4. Copy `contacts.db` to `data/users/{adminId}/contacts.db`
5. Drop auth tables from the user DB copy
6. Move `data/photos/*` to `data/users/{adminId}/photos/`
7. Rename old `contacts.db` to `contacts.db.bak`

```typescript
// backend/src/scripts/migrateToMultiTenant.ts
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

interface MigrationOptions {
  oldDbPath: string;
  oldPhotosPath: string;
  authDbPath: string;
  userDataPath: string;
}

export function migrateToMultiTenant(options: MigrationOptions): void {
  const { oldDbPath, oldPhotosPath, authDbPath, userDataPath } = options;

  if (!fs.existsSync(oldDbPath)) {
    throw new Error(`Old database not found: ${oldDbPath}`);
  }

  console.log('Starting multi-tenant migration...');

  // Step 1: Open old database
  const oldDb = new Database(oldDbPath, { readonly: true });

  // Step 2: Get admin user (first user)
  const adminUser = oldDb.prepare('SELECT * FROM users ORDER BY id ASC LIMIT 1').get() as { id: number; email: string } | undefined;
  if (!adminUser) {
    throw new Error('No users found in old database. Cannot migrate.');
  }
  console.log(`Admin user: ${adminUser.email} (id: ${adminUser.id})`);

  // Step 3: Create auth database
  const authDir = path.dirname(authDbPath);
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const authDb = new Database(authDbPath);
  authDb.pragma('journal_mode = WAL');
  authDb.pragma('foreign_keys = ON');

  // Create auth tables
  authDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
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

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profile_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      original_url TEXT,
      local_hash TEXT,
      is_primary INTEGER DEFAULT 0,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Copy users
  const users = oldDb.prepare('SELECT * FROM users').all() as Array<Record<string, unknown>>;
  for (const user of users) {
    const columns = Object.keys(user);
    const placeholders = columns.map(() => '?').join(', ');
    authDb.prepare(`INSERT INTO users (${columns.join(', ')}) VALUES (${placeholders})`).run(...Object.values(user));
  }

  // Copy sessions
  try {
    const sessions = oldDb.prepare('SELECT * FROM sessions').all() as Array<Record<string, unknown>>;
    for (const session of sessions) {
      const columns = Object.keys(session);
      const placeholders = columns.map(() => '?').join(', ');
      authDb.prepare(`INSERT INTO sessions (${columns.join(', ')}) VALUES (${placeholders})`).run(...Object.values(session));
    }
  } catch { /* sessions table might not exist in test DBs */ }

  // Copy profile_images
  try {
    const images = oldDb.prepare('SELECT * FROM profile_images').all() as Array<Record<string, unknown>>;
    for (const img of images) {
      const columns = Object.keys(img);
      const placeholders = columns.map(() => '?').join(', ');
      authDb.prepare(`INSERT INTO profile_images (${columns.join(', ')}) VALUES (${placeholders})`).run(...Object.values(img));
    }
  } catch { /* table might not exist */ }

  authDb.close();

  // Step 4: Create user database by copying the old DB
  const userDir = path.join(userDataPath, String(adminUser.id));
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

  const userDbPath = path.join(userDir, 'contacts.db');
  fs.copyFileSync(oldDbPath, userDbPath);

  // Drop auth tables from user DB
  const userDb = new Database(userDbPath);
  userDb.pragma('journal_mode = WAL');

  // Drop auth-related tables
  const authTables = ['sessions', 'profile_images', 'users'];
  for (const table of authTables) {
    try {
      userDb.exec(`DROP TABLE IF EXISTS ${table}`);
    } catch { /* ignore if doesn't exist */ }
  }

  // Drop auth-related indexes
  const authIndexes = ['idx_users_google_id', 'idx_users_email', 'idx_sessions_user_id', 'idx_sessions_expires_at',
    'idx_profile_images_user_id', 'idx_profile_images_source', 'idx_profile_images_user_source'];
  for (const idx of authIndexes) {
    try {
      userDb.exec(`DROP INDEX IF EXISTS ${idx}`);
    } catch { /* ignore */ }
  }

  userDb.close();

  // Step 5: Move photos to user directory
  const userPhotosPath = path.join(userDir, 'photos');
  if (fs.existsSync(oldPhotosPath)) {
    copyDirRecursive(oldPhotosPath, userPhotosPath);
  }

  // Step 6: Rename old DB as backup
  oldDb.close();
  fs.renameSync(oldDbPath, oldDbPath + '.bak');

  console.log('Migration complete!');
  console.log(`Auth DB: ${authDbPath}`);
  console.log(`User DB: ${userDbPath}`);
  console.log(`User photos: ${userPhotosPath}`);
  console.log(`Old DB backed up to: ${oldDbPath}.bak`);
}

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith('migrateToMultiTenant')) {
  const oldDbPath = process.env.DATABASE_PATH || './data/contacts.db';
  const oldPhotosPath = process.env.PHOTOS_PATH || './data/photos';
  const authDbPath = process.env.AUTH_DATABASE_PATH || './data/auth.db';
  const userDataPath = process.env.USER_DATA_PATH || './data/users';

  migrateToMultiTenant({ oldDbPath, oldPhotosPath, authDbPath, userDataPath });
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/scripts/__tests__/migrateToMultiTenant.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/scripts/migrateToMultiTenant.ts backend/src/scripts/__tests__/migrateToMultiTenant.test.ts
git commit -m "feat: add migration script for single-tenant to multi-tenant conversion"
```

---

## Phase 2: Update Auth Layer

### Task 4: Update Auth Middleware to Use Auth Database

**Files:**
- Modify: `backend/src/middleware/auth.ts`

**Step 1: Update import and function calls**

Change `getDatabase()` to `getAuthDatabase()` in auth middleware:

```typescript
// Change import from:
import { getDatabase } from '../services/database.js';
// To:
import { getAuthDatabase } from '../services/authDatabase.js';

// In requireAuth(), change:
const db = getDatabase();
// To:
const db = getAuthDatabase();

// In optionalAuth(), same change
```

**Step 2: Run existing tests**

Run: `cd backend && npx vitest run`
Expected: Tests may fail if they depend on the old getDatabase() returning auth tables — this is expected and will be fixed as we progress.

**Step 3: Commit**

```bash
git add backend/src/middleware/auth.ts
git commit -m "refactor: update auth middleware to use auth database"
```

---

### Task 5: Update Auth Routes to Use Auth Database

**Files:**
- Modify: `backend/src/routes/auth.ts`

**Step 1: Update imports and all getDatabase() calls**

Change all `getDatabase()` calls in auth.ts to `getAuthDatabase()`:
- `upsertUser()` function
- `createSession()` function
- `getUserFromSession()` function
- `deleteSession()` function
- `cleanupExpiredSessions()` function

**Step 2: Commit**

```bash
git add backend/src/routes/auth.ts
git commit -m "refactor: update auth routes to use auth database"
```

---

### Task 6: Update Profile Image Service to Use Auth Database

**Files:**
- Modify: `backend/src/services/profileImageService.ts`

**Step 1: Update imports and all getDatabase() calls**

This service manages user profile images (Google avatar, Gravatar) — these live in the auth DB.

Change `getDatabase()` to `getAuthDatabase()` in all functions.

**Step 2: Commit**

```bash
git add backend/src/services/profileImageService.ts
git commit -m "refactor: update profile image service to use auth database"
```

---

### Task 7: Update Google Auth Service to Use Auth Database

**Files:**
- Modify: `backend/src/services/googleAuthService.ts`

**Step 1: Update imports and all getDatabase() calls**

This service reads/refreshes Google OAuth tokens from the users table — auth DB.

Change `getDatabase()` to `getAuthDatabase()`.

**Step 2: Commit**

```bash
git add backend/src/services/googleAuthService.ts
git commit -m "refactor: update google auth service to use auth database"
```

---

## Phase 3: Update Route and Service Layer

### Task 8: Update database.ts — Extract Reusable Functions

**Files:**
- Modify: `backend/src/services/database.ts`

**Step 1: Refactor database.ts**

The current `database.ts` is the monolithic entry point. After multi-tenancy:
- Auth schema moved to `authDatabase.ts` (done in Task 1)
- User schema moved to `userDatabase.ts` (done in Task 2)
- `getDatabase()` should be removed or deprecated
- Keep utility functions (`buildSearchableText`, `rebuildContactSearch`, etc.) that operate on a passed-in database instance — they already accept a `database` parameter

The exported functions that already accept a `database: DatabaseType` parameter need no changes:
- `buildSearchableText(database, contactId)`
- `rebuildContactSearch(database, contactId)`
- `rebuildAllContactSearch(database)`
- `deleteContactFromSearch(database, contactId)`
- `deleteContactsFromSearch(database, contactIds)`

Remove: `getDatabase()`, `closeDatabase()`, and all the migration functions (they now run inside `userDatabase.ts` and `authDatabase.ts` schema initialization).

**Step 2: Commit**

```bash
git add backend/src/services/database.ts
git commit -m "refactor: strip database.ts to utility functions only, remove getDatabase singleton"
```

---

### Task 9: Update Contacts Route

**Files:**
- Modify: `backend/src/routes/contacts.ts`

**Step 1: Replace getDatabase() with getUserDatabase()**

```typescript
// Change import:
import { getDatabase } from '../services/database.js';
// To:
import { getUserDatabase } from '../services/userDatabase.js';

// In every route handler, change:
const db = getDatabase();
// To:
const db = getUserDatabase(request.user!.id);
```

This route has the heaviest direct DB usage. Every handler needs this change. No query changes needed — the per-user DB already scopes the data.

**Step 2: Update photoProcessor calls to pass userId for photo path**

Change `processPhoto(base64, contactId)` calls to `processPhoto(base64, contactId, request.user!.id)` (photoProcessor needs updating too — see Task 14).

**Step 3: Run existing tests (if any)**

Run: `cd backend && npx vitest run`

**Step 4: Commit**

```bash
git add backend/src/routes/contacts.ts
git commit -m "refactor: update contacts route to use per-user database"
```

---

### Task 10: Update Import Route and Service

**Files:**
- Modify: `backend/src/routes/import.ts`
- Modify: `backend/src/services/importService.ts` (if it calls getDatabase internally)

**Step 1: Thread userId through import**

The import route delegates to `importVcf()` in importService. Update importService to accept a userId parameter and use `getUserDatabase(userId)` internally.

**Step 2: Commit**

```bash
git add backend/src/routes/import.ts backend/src/services/importService.ts
git commit -m "refactor: update import route and service for multi-tenancy"
```

---

### Task 11: Update Duplicates Route and Deduplication Service

**Files:**
- Modify: `backend/src/routes/duplicates.ts`
- Modify: `backend/src/services/deduplicationService.ts`

**Step 1: Thread userId through deduplication**

Update deduplicationService functions to accept userId and use `getUserDatabase(userId)`.

**Step 2: Commit**

```bash
git add backend/src/routes/duplicates.ts backend/src/services/deduplicationService.ts
git commit -m "refactor: update duplicates route and service for multi-tenancy"
```

---

### Task 12: Update Merge Service

**Files:**
- Modify: `backend/src/services/mergeService.ts`

**Step 1: Replace all getDatabase() calls with passed database parameter**

mergeService has 5 internal `getDatabase()` calls. Change all functions to accept a `database: DatabaseType` parameter instead of calling the singleton.

Routes that call mergeService (contacts.ts, duplicates.ts) will pass `getUserDatabase(request.user!.id)`.

**Step 2: Commit**

```bash
git add backend/src/services/mergeService.ts
git commit -m "refactor: update merge service to accept database parameter"
```

---

### Task 13: Update Cleanup Routes and Services

**Files:**
- Modify: `backend/src/routes/cleanup.ts`
- Modify: `backend/src/routes/socialLinksCleanup.ts`
- Modify: `backend/src/routes/invalidLinksCleanup.ts`
- Modify: `backend/src/routes/addressCleanup.ts`
- Modify: `backend/src/services/cleanupService.ts`
- Modify: `backend/src/services/socialLinksCleanupService.ts` (if exists)
- Modify: `backend/src/services/invalidLinksCleanupService.ts` (if exists)
- Modify: `backend/src/services/addressCleanupService.ts` (if exists)

**Step 1: Thread userId through all cleanup routes and services**

Each cleanup route calls service functions that internally call `getDatabase()`. Update all to accept userId and use `getUserDatabase(userId)`.

**Step 2: Commit**

```bash
git add backend/src/routes/cleanup.ts backend/src/routes/socialLinksCleanup.ts backend/src/routes/invalidLinksCleanup.ts backend/src/routes/addressCleanup.ts backend/src/services/cleanupService.ts
git commit -m "refactor: update cleanup routes and services for multi-tenancy"
```

---

### Task 14: Update Photo Processor for Per-User Photos

**Files:**
- Modify: `backend/src/services/photoProcessor.ts`

**Step 1: Update processPhoto to accept userId**

```typescript
// Change:
export async function processPhoto(base64Data: string, contactId: number): Promise<string>
// To:
export async function processPhoto(base64Data: string, contactId: number, userId: number): Promise<string>

// Internally, resolve photo path using getUserPhotosPath(userId) instead of PHOTOS_PATH
```

```typescript
// Change:
export function getPhotoUrl(hash: string, size: string = 'thumbnail'): string
// To:
// URL stays the same — the server resolves the user's photo directory
```

**Step 2: Commit**

```bash
git add backend/src/services/photoProcessor.ts
git commit -m "refactor: update photo processor for per-user photo directories"
```

---

### Task 15: Update Remaining Routes

**Files:**
- Modify: `backend/src/routes/archive.ts` + its service
- Modify: `backend/src/routes/map.ts`
- Modify: `backend/src/routes/stats.ts`
- Modify: `backend/src/routes/settings.ts`
- Modify: `backend/src/routes/enrich.ts` + apifyEnrichmentService
- Modify: `backend/src/routes/emailSync.ts` + emailSyncService
- Modify: `backend/src/routes/gmailEnrich.ts` + emailDiscoveryService
- Modify: `backend/src/routes/profile.ts`
- Modify: `backend/src/routes/profileImages.ts`

**Step 1: For each route, apply the same pattern:**

```typescript
// Replace: const db = getDatabase();
// With:    const db = getUserDatabase(request.user!.id);
```

For routes that delegate to services, thread userId through the service functions.

For profile.ts and profileImages.ts — these use auth DB data (profile images). Use `getAuthDatabase()` for user profile data, `getUserDatabase()` for contact-related data.

**Step 2: Commit each batch**

```bash
git add backend/src/routes/archive.ts backend/src/services/archiveService.ts
git commit -m "refactor: update archive route for multi-tenancy"

git add backend/src/routes/map.ts backend/src/routes/stats.ts
git commit -m "refactor: update map and stats routes for multi-tenancy"

git add backend/src/routes/settings.ts backend/src/routes/enrich.ts
git commit -m "refactor: update settings and enrich routes for multi-tenancy"

git add backend/src/routes/emailSync.ts backend/src/routes/gmailEnrich.ts
git commit -m "refactor: update email sync routes for multi-tenancy"

git add backend/src/routes/profile.ts backend/src/routes/profileImages.ts
git commit -m "refactor: update profile routes for multi-tenancy"
```

---

## Phase 4: Update Server and Photo Serving

### Task 16: Update Server Photo Serving

**Files:**
- Modify: `backend/src/server.ts`

**Step 1: Update photo serving to use per-user directory**

The photo serving endpoint needs to resolve the user's photo directory from the session. Since `requireAuth` already runs and sets `request.user`, we can use it:

```typescript
app.get('/photos/*', async (request, reply) => {
  // request.user is already set by the global auth hook
  const userId = (request as any).user?.id;
  if (!userId) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const userPhotosPath = getUserPhotosPath(userId);
  const url = request.url.replace(/\?.*$/, '');
  const relativePath = url.replace('/photos/', '');
  const filePath = path.join(userPhotosPath, relativePath);

  // Prevent path traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(userPhotosPath))) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  // ... rest stays the same
});
```

**Step 2: Remove old PHOTOS_PATH setup (no longer global)**

**Step 3: Commit**

```bash
git add backend/src/server.ts
git commit -m "refactor: update photo serving for per-user directories"
```

---

### Task 17: Update Dockerfile and Environment Variables

**Files:**
- Modify: `Dockerfile`
- Modify: `backend/.env.example`

**Step 1: Update Dockerfile**

```dockerfile
# Change:
ENV DATABASE_PATH=/data/contacts.db
ENV PHOTOS_PATH=/data/photos

# To:
ENV AUTH_DATABASE_PATH=/data/auth.db
ENV USER_DATA_PATH=/data/users
```

Create data directories:
```dockerfile
RUN mkdir -p /data/users && chown -R node:node /app /data
```

**Step 2: Update .env.example**

```env
# Old (remove):
# DATABASE_PATH=./data/contacts.db
# PHOTOS_PATH=./data/photos

# New:
AUTH_DATABASE_PATH=./data/auth.db
USER_DATA_PATH=./data/users
```

**Step 3: Commit**

```bash
git add Dockerfile backend/.env.example
git commit -m "refactor: update Dockerfile and env for multi-tenancy"
```

---

## Phase 5: Integration Testing and Cleanup

### Task 18: Remove Old getDatabase() and Verify No References

**Step 1: Search for any remaining getDatabase() calls**

Run: `grep -r "getDatabase" backend/src/ --include="*.ts" -l`

The only file that should reference it is the deprecated `database.ts` utility module. All routes and services should now use `getAuthDatabase()` or `getUserDatabase()`.

**Step 2: Remove the old getDatabase() from database.ts**

Keep only the utility functions (buildSearchableText, rebuildContactSearch, etc.).

**Step 3: Commit**

```bash
git add backend/src/
git commit -m "cleanup: remove all getDatabase() references, verify multi-tenancy complete"
```

---

### Task 19: End-to-End Manual Testing

**Step 1: Run the migration**

```bash
cd backend
npx tsx src/scripts/migrateToMultiTenant.ts
```

**Step 2: Start the dev server**

```bash
npm run dev
```

**Step 3: Verify:**
- [ ] Can log in with Google OAuth
- [ ] Contacts list loads (your migrated contacts)
- [ ] Contact photos display correctly
- [ ] Can create a new contact
- [ ] Can import a VCF file
- [ ] Search works
- [ ] Duplicate detection works
- [ ] Map view works
- [ ] Settings page loads
- [ ] LinkedIn enrichment works
- [ ] Email sync works

**Step 4: Test second user**
- Log in with a different Google account
- Verify they see an empty contact list (not your contacts)
- Create a contact as the second user
- Switch back to first user — verify the second user's contact doesn't appear

---

### Task 20: Update CLAUDE.md and Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/log.md`

**Step 1: Update CLAUDE.md**

Update the Architecture Overview, Environment Variables, and Key Patterns sections to reflect:
- Auth DB vs User DB split
- New env vars (AUTH_DATABASE_PATH, USER_DATA_PATH)
- `getUserDatabase(userId)` pattern in routes
- Per-user photo directories

**Step 2: Update docs/log.md**

Add entry: `## 2026-03-04 HH:MM — Multi-Tenancy: Database-Per-User`

**Step 3: Move design doc to completed**

```bash
mv docs/plans/2026-03-04-multi-tenancy-design.md docs/plans/completed/
```

**Step 4: Commit**

```bash
git add CLAUDE.md docs/log.md docs/plans/
git commit -m "docs: update documentation for multi-tenancy architecture"
```
