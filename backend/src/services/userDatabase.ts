import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const MAX_CACHE_SIZE = 50;

/**
 * LRU cache entry for a user database connection.
 * The Map insertion order tracks recency: most recently used entries
 * are moved to the end via delete + re-insert.
 */
const cache = new Map<number, DatabaseType>();

/**
 * Returns the base path for user data directories.
 */
function getUserDataPath(): string {
  return process.env.USER_DATA_PATH || './data/users';
}

/**
 * Returns a better-sqlite3 database instance for the given user.
 * Creates the database and all contact-related tables if it doesn't exist.
 * Uses an LRU cache with max 50 connections.
 */
export function getUserDatabase(userId: number): DatabaseType {
  // Check cache - if found, move to end (most recently used)
  const existing = cache.get(userId);
  if (existing) {
    cache.delete(userId);
    cache.set(userId, existing);
    return existing;
  }

  // Evict oldest entry if cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value!;
    const oldestDb = cache.get(oldestKey)!;
    try {
      oldestDb.close();
    } catch {
      // Ignore close errors on eviction
    }
    cache.delete(oldestKey);
  }

  const basePath = getUserDataPath();
  const userDir = path.join(basePath, String(userId));
  const dbPath = path.join(userDir, 'contacts.db');

  // Ensure user directory exists
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

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

    -- FTS5 virtual tables
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

    -- FTS triggers for contacts
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

    -- FTS triggers for emails
    CREATE TRIGGER IF NOT EXISTS emails_ai AFTER INSERT ON contact_emails BEGIN
      INSERT INTO emails_fts(rowid, email) VALUES (new.id, new.email);
    END;

    CREATE TRIGGER IF NOT EXISTS emails_ad AFTER DELETE ON contact_emails BEGIN
      INSERT INTO emails_fts(emails_fts, rowid, email) VALUES('delete', old.id, old.email);
    END;

    -- Indexes
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

    -- User settings (single row)
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

    -- LinkedIn enrichment
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

    -- LinkedIn enrichment failures
    CREATE TABLE IF NOT EXISTS linkedin_enrichment_failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
      error_reason TEXT NOT NULL,
      attempted_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_linkedin_enrichment_failures_contact_id ON linkedin_enrichment_failures(contact_id);

    -- Contact email history (Gmail sync)
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

    -- Contact photos (multi-source)
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

  cache.set(userId, db);
  return db;
}

/**
 * Returns the photos directory path for a user, creating it if needed.
 */
export function getUserPhotosPath(userId: number): string {
  const basePath = getUserDataPath();
  const photosDir = path.join(basePath, String(userId), 'photos');

  if (!fs.existsSync(photosDir)) {
    fs.mkdirSync(photosDir, { recursive: true });
  }

  return photosDir;
}

/**
 * Closes a specific user's database connection and removes it from the cache.
 */
export function closeUserDatabase(userId: number): void {
  const db = cache.get(userId);
  if (db) {
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
    cache.delete(userId);
  }
}

/**
 * Closes all cached user database connections.
 */
export function closeAllUserDatabases(): void {
  for (const [userId, db] of cache) {
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
  }
  cache.clear();
}
