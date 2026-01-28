import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { parsePhoneNumber } from 'libphonenumber-js';

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

    -- Insert default row if not exists
    INSERT OR IGNORE INTO user_settings (id) VALUES (1);
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

  // Migration: Add country_code column to contact_phones if it doesn't exist
  const phonesTableInfo = db.prepare("PRAGMA table_info(contact_phones)").all() as Array<{ name: string }>;
  const hasCountryCode = phonesTableInfo.some(col => col.name === 'country_code');

  if (!hasCountryCode) {
    db.exec(`
      ALTER TABLE contact_phones ADD COLUMN country_code TEXT DEFAULT NULL;
    `);
  }

  // Migration: Update existing phone records with country_code and new display format
  // Check if migration is needed by looking for phones without country_code
  const phonesNeedingMigration = db.prepare(`
    SELECT COUNT(*) as count FROM contact_phones WHERE country_code IS NULL
  `).get() as { count: number };

  if (phonesNeedingMigration.count > 0) {
    console.log(`Migrating ${phonesNeedingMigration.count} phone records to new format...`);
    migratePhoneFormats(db);
  }

  // Migration: Recreate unified FTS with proper tokenizer for email search
  try {
    // Check if table exists and needs recreation (lacks tokenchars option)
    const needsRecreation = (() => {
      try {
        const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='contacts_unified_fts'").get() as { sql: string } | undefined;
        return !sql || !sql.sql.includes('tokenchars');
      } catch {
        return true;
      }
    })();

    if (needsRecreation) {
      db.exec('DROP TABLE IF EXISTS contacts_unified_fts');
      db.exec(`
        CREATE VIRTUAL TABLE contacts_unified_fts USING fts5(
          searchable_text,
          content='',
          contentless_delete=1,
          tokenize="unicode61 tokenchars '@.'"
        )
      `);
    }

    // Rebuild if empty or just recreated
    const ftsCount = db.prepare('SELECT COUNT(*) as c FROM contacts_unified_fts').get() as { c: number };
    const contactCount = db.prepare('SELECT COUNT(*) as c FROM contacts').get() as { c: number };
    if (ftsCount.c === 0 && contactCount.c > 0) {
      rebuildAllContactSearchInternal(db);
    }
  } catch (e) {
    console.error('Failed to setup unified FTS:', e);
  }

  return db;
}

/**
 * Internal helper to rebuild all contact search (used during initialization)
 */
function rebuildAllContactSearchInternal(database: DatabaseType): void {
  // Clear existing index
  database.prepare('DELETE FROM contacts_unified_fts').run();

  // Get all contact IDs
  const contacts = database.prepare('SELECT id FROM contacts').all() as Array<{ id: number }>;

  // Rebuild each contact's search entry
  for (const contact of contacts) {
    const searchableText = buildSearchableTextInternal(database, contact.id);
    if (searchableText.trim()) {
      database.prepare('INSERT INTO contacts_unified_fts(rowid, searchable_text) VALUES (?, ?)').run(contact.id, searchableText);
    }
  }
}

/**
 * Internal helper to build searchable text (used during initialization)
 */
function buildSearchableTextInternal(database: DatabaseType, contactId: number): string {
  const parts: string[] = [];

  const contact = database.prepare(`
    SELECT first_name, last_name, display_name, company, title, notes
    FROM contacts WHERE id = ?
  `).get(contactId) as {
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    company: string | null;
    title: string | null;
    notes: string | null;
  } | undefined;

  if (contact) {
    if (contact.first_name) parts.push(contact.first_name);
    if (contact.last_name) parts.push(contact.last_name);
    if (contact.display_name) parts.push(contact.display_name);
    if (contact.company) parts.push(contact.company);
    if (contact.title) parts.push(contact.title);
    if (contact.notes) parts.push(contact.notes);
  }

  const emails = database.prepare('SELECT email FROM contact_emails WHERE contact_id = ?').all(contactId) as Array<{ email: string }>;
  for (const e of emails) parts.push(e.email);

  const phones = database.prepare('SELECT phone_display FROM contact_phones WHERE contact_id = ?').all(contactId) as Array<{ phone_display: string }>;
  for (const p of phones) parts.push(p.phone_display);

  const addresses = database.prepare('SELECT street, city, state, postal_code, country FROM contact_addresses WHERE contact_id = ?').all(contactId) as Array<{
    street: string | null; city: string | null; state: string | null; postal_code: string | null; country: string | null;
  }>;
  for (const a of addresses) {
    if (a.street) parts.push(a.street);
    if (a.city) parts.push(a.city);
    if (a.state) parts.push(a.state);
    if (a.postal_code) parts.push(a.postal_code);
    if (a.country) parts.push(a.country);
  }

  const socials = database.prepare('SELECT username FROM contact_social_profiles WHERE contact_id = ?').all(contactId) as Array<{ username: string }>;
  for (const s of socials) parts.push(s.username);

  const categories = database.prepare('SELECT category FROM contact_categories WHERE contact_id = ?').all(contactId) as Array<{ category: string }>;
  for (const c of categories) parts.push(c.category);

  const ims = database.prepare('SELECT handle FROM contact_instant_messages WHERE contact_id = ?').all(contactId) as Array<{ handle: string }>;
  for (const im of ims) parts.push(im.handle);

  const urls = database.prepare('SELECT label FROM contact_urls WHERE contact_id = ? AND label IS NOT NULL').all(contactId) as Array<{ label: string }>;
  for (const u of urls) parts.push(u.label);

  const related = database.prepare('SELECT name FROM contact_related_people WHERE contact_id = ?').all(contactId) as Array<{ name: string }>;
  for (const r of related) parts.push(r.name);

  return parts.join(' ');
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Build searchable text for a contact by concatenating all searchable fields
 */
export function buildSearchableText(database: DatabaseType, contactId: number): string {
  const parts: string[] = [];

  // Contact main fields
  const contact = database.prepare(`
    SELECT first_name, last_name, display_name, company, title, notes
    FROM contacts WHERE id = ?
  `).get(contactId) as {
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    company: string | null;
    title: string | null;
    notes: string | null;
  } | undefined;

  if (contact) {
    if (contact.first_name) parts.push(contact.first_name);
    if (contact.last_name) parts.push(contact.last_name);
    if (contact.display_name) parts.push(contact.display_name);
    if (contact.company) parts.push(contact.company);
    if (contact.title) parts.push(contact.title);
    if (contact.notes) parts.push(contact.notes);
  }

  // Emails
  const emails = database.prepare(`
    SELECT email FROM contact_emails WHERE contact_id = ?
  `).all(contactId) as Array<{ email: string }>;
  for (const e of emails) {
    parts.push(e.email);
  }

  // Phones
  const phones = database.prepare(`
    SELECT phone_display FROM contact_phones WHERE contact_id = ?
  `).all(contactId) as Array<{ phone_display: string }>;
  for (const p of phones) {
    parts.push(p.phone_display);
  }

  // Addresses
  const addresses = database.prepare(`
    SELECT street, city, state, postal_code, country FROM contact_addresses WHERE contact_id = ?
  `).all(contactId) as Array<{
    street: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
  }>;
  for (const a of addresses) {
    if (a.street) parts.push(a.street);
    if (a.city) parts.push(a.city);
    if (a.state) parts.push(a.state);
    if (a.postal_code) parts.push(a.postal_code);
    if (a.country) parts.push(a.country);
  }

  // Social profiles
  const socials = database.prepare(`
    SELECT username FROM contact_social_profiles WHERE contact_id = ?
  `).all(contactId) as Array<{ username: string }>;
  for (const s of socials) {
    parts.push(s.username);
  }

  // Categories
  const categories = database.prepare(`
    SELECT category FROM contact_categories WHERE contact_id = ?
  `).all(contactId) as Array<{ category: string }>;
  for (const c of categories) {
    parts.push(c.category);
  }

  // Instant messages
  const ims = database.prepare(`
    SELECT handle FROM contact_instant_messages WHERE contact_id = ?
  `).all(contactId) as Array<{ handle: string }>;
  for (const im of ims) {
    parts.push(im.handle);
  }

  // URLs (labels)
  const urls = database.prepare(`
    SELECT label FROM contact_urls WHERE contact_id = ? AND label IS NOT NULL
  `).all(contactId) as Array<{ label: string }>;
  for (const u of urls) {
    parts.push(u.label);
  }

  // Related people
  const related = database.prepare(`
    SELECT name FROM contact_related_people WHERE contact_id = ?
  `).all(contactId) as Array<{ name: string }>;
  for (const r of related) {
    parts.push(r.name);
  }

  return parts.join(' ');
}

/**
 * Rebuild the unified FTS index for a single contact
 */
export function rebuildContactSearch(database: DatabaseType, contactId: number): void {
  // Delete existing entry
  database.prepare('DELETE FROM contacts_unified_fts WHERE rowid = ?').run(contactId);

  // Build searchable text
  const searchableText = buildSearchableText(database, contactId);

  // Insert new entry if there's text to index
  if (searchableText.trim()) {
    database.prepare('INSERT INTO contacts_unified_fts(rowid, searchable_text) VALUES (?, ?)').run(contactId, searchableText);
  }
}

/**
 * Rebuild the unified FTS index for all contacts
 */
export function rebuildAllContactSearch(database: DatabaseType): void {
  // Clear existing index
  database.prepare('DELETE FROM contacts_unified_fts').run();

  // Get all contact IDs
  const contacts = database.prepare('SELECT id FROM contacts').all() as Array<{ id: number }>;

  // Rebuild each contact's search entry
  for (const contact of contacts) {
    const searchableText = buildSearchableText(database, contact.id);
    if (searchableText.trim()) {
      database.prepare('INSERT INTO contacts_unified_fts(rowid, searchable_text) VALUES (?, ?)').run(contact.id, searchableText);
    }
  }
}

/**
 * Delete a contact from the unified FTS index
 */
export function deleteContactFromSearch(database: DatabaseType, contactId: number): void {
  database.prepare('DELETE FROM contacts_unified_fts WHERE rowid = ?').run(contactId);
}

/**
 * Delete multiple contacts from the unified FTS index
 */
export function deleteContactsFromSearch(database: DatabaseType, contactIds: number[]): void {
  if (contactIds.length === 0) return;
  const placeholders = contactIds.map(() => '?').join(',');
  database.prepare(`DELETE FROM contacts_unified_fts WHERE rowid IN (${placeholders})`).run(...contactIds);
}

/**
 * Parse a phone number and return formatted display and country code
 */
function parsePhoneForMigration(rawPhone: string): { phoneDisplay: string; countryCode: string | null } {
  try {
    // Try parsing with US as default region
    const parsed = parsePhoneNumber(rawPhone, 'US');
    if (parsed) {
      // Get international format: +1 201 555 0123
      const international = parsed.formatInternational();
      // Clean up any parentheses or dashes, ensure single spaces
      const phoneDisplay = international
        .replace(/[()-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        phoneDisplay,
        countryCode: parsed.country || null
      };
    }
  } catch {
    // Fall through to raw value
  }

  // Return original format if parsing fails
  return { phoneDisplay: rawPhone, countryCode: null };
}

/**
 * Migrate existing phone records to new format with country codes
 */
function migratePhoneFormats(database: DatabaseType): void {
  // Get all phone records
  const phones = database.prepare(`
    SELECT id, phone, phone_display FROM contact_phones
  `).all() as Array<{ id: number; phone: string; phone_display: string }>;

  let updated = 0;
  let failed = 0;

  const updateStmt = database.prepare(`
    UPDATE contact_phones
    SET phone_display = ?, country_code = ?
    WHERE id = ?
  `);

  const migrateAll = database.transaction(() => {
    for (const phoneRecord of phones) {
      // Try to parse the stored E.164 phone number first
      let result = parsePhoneForMigration(phoneRecord.phone);

      // If that didn't yield a country code, try the display format
      if (!result.countryCode && phoneRecord.phone_display) {
        const altResult = parsePhoneForMigration(phoneRecord.phone_display);
        if (altResult.countryCode) {
          result = altResult;
        }
      }

      if (result.countryCode || result.phoneDisplay !== phoneRecord.phone_display) {
        updateStmt.run(result.phoneDisplay, result.countryCode, phoneRecord.id);
        updated++;
      } else {
        failed++;
      }
    }
  });

  migrateAll();
  console.log(`Phone migration complete: ${updated} updated, ${failed} could not be parsed`);
}
