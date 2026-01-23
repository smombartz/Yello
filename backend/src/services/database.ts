import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: DatabaseType | null = null;

export function getDatabase(): DatabaseType {
  if (db) return db;

  const dbPath = process.env.DATABASE_PATH || './data/contacts.db';

  // Ensure parent directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);

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
      type TEXT
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
    CREATE INDEX IF NOT EXISTS idx_contact_emails_contact_id ON contact_emails(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_phones_contact_id ON contact_phones(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_addresses_contact_id ON contact_addresses(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_social_profiles_contact_id ON contact_social_profiles(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_social_profiles_platform_username ON contact_social_profiles(platform, username);
    CREATE INDEX IF NOT EXISTS idx_contact_emails_email_lower ON contact_emails(email COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_contact_phones_phone ON contact_phones(phone);
    CREATE INDEX IF NOT EXISTS idx_contact_addresses_composite ON contact_addresses(street, city, postal_code);
    CREATE INDEX IF NOT EXISTS idx_contact_categories_contact_id ON contact_categories(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_instant_messages_contact_id ON contact_instant_messages(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_urls_contact_id ON contact_urls(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_related_people_contact_id ON contact_related_people(contact_id);
  `);

  // Migration: Add archived_at column if it doesn't exist
  const tableInfo = db.prepare("PRAGMA table_info(contacts)").all() as Array<{ name: string }>;
  const hasArchivedAt = tableInfo.some(col => col.name === 'archived_at');

  if (!hasArchivedAt) {
    db.exec(`
      ALTER TABLE contacts ADD COLUMN archived_at DATETIME DEFAULT NULL;
      CREATE INDEX IF NOT EXISTS idx_contacts_archived_at ON contacts(archived_at);
    `);
  }

  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
