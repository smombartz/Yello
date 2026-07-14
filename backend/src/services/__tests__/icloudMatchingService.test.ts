import { describe, it, expect } from 'vitest';
import { matchIncomingContacts, type MatchResult, type IncomingContact } from '../icloudMatchingService.js';
import Database from 'better-sqlite3';

function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT, last_name TEXT, display_name TEXT NOT NULL,
      company TEXT, title TEXT, notes TEXT, birthday TEXT,
      photo_hash TEXT, raw_vcard TEXT, archived_at DATETIME,
      google_resource_name TEXT, icloud_uid TEXT
    );
    CREATE TABLE contact_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL, email TEXT NOT NULL,
      type TEXT, is_primary INTEGER DEFAULT 0
    );
    CREATE TABLE contact_phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL, phone TEXT NOT NULL,
      phone_display TEXT, country_code TEXT, type TEXT, is_primary INTEGER DEFAULT 0
    );
    CREATE TABLE contact_social_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL, platform TEXT, username TEXT,
      profile_url TEXT, type TEXT
    );
  `);
  return db;
}

function makeParsedContact(overrides: Partial<IncomingContact>): IncomingContact {
  return {
    firstName: null, lastName: null, displayName: 'Test',
    company: null, title: null, notes: null, birthday: null,
    emails: [], phones: [], addresses: [], categories: [],
    instantMessages: [], urls: [], relatedPeople: [], socialProfiles: [],
    photoBase64: null, rawVcard: 'BEGIN:VCARD\nEND:VCARD', uid: null,
    ...overrides,
  };
}

describe('matchIncomingContacts', () => {
  it('returns all contacts as new when DB is empty', () => {
    const db = createTestDb();
    const incoming = [makeParsedContact({ displayName: 'John Smith' })];
    const result = matchIncomingContacts(db, incoming);
    expect(result.newContacts).toHaveLength(1);
    expect(result.matches).toHaveLength(0);
  });

  it('detects email match as a duplicate', () => {
    const db = createTestDb();
    db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('John Smith');
    db.prepare('INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, ?)').run(1, 'john@example.com', 'home', 1);

    const incoming = [
      makeParsedContact({
        displayName: 'John Smith',
        emails: [{ email: 'john@example.com', type: 'home', isPrimary: true }],
      }),
    ];
    const result = matchIncomingContacts(db, incoming);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].confidence).toBe('high'); // email + name = score 2 = high
    expect(result.matches[0].matchReasons).toContain('email: john@example.com');
    expect(result.newContacts).toHaveLength(0);
  });

  it('detects email + phone match as very_high confidence', () => {
    const db = createTestDb();
    db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Jane Doe');
    db.prepare('INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, ?)').run(1, 'jane@example.com', 'home', 1);
    db.prepare('INSERT INTO contact_phones (contact_id, phone, phone_display, country_code, type, is_primary) VALUES (?, ?, ?, ?, ?, ?)').run(1, '+15551234567', '555-123-4567', 'US', 'cell', 1);

    const incoming = [
      makeParsedContact({
        displayName: 'Jane Doe',
        emails: [{ email: 'jane@example.com', type: 'work', isPrimary: true }],
        phones: [{ phone: '+15551234567', phoneDisplay: '555-123-4567', countryCode: 'US', type: 'cell', isPrimary: true }],
      }),
    ];
    const result = matchIncomingContacts(db, incoming);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].confidence).toBe('very_high');
  });

  it('returns non-matching contacts as new', () => {
    const db = createTestDb();
    db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Existing Person');

    const incoming = [
      makeParsedContact({ displayName: 'Totally Different Person' }),
    ];
    const result = matchIncomingContacts(db, incoming);
    expect(result.newContacts).toHaveLength(1);
    expect(result.matches).toHaveLength(0);
  });

  describe('stable external identifiers', () => {
    it('matches on google_resource_name even with no email, phone or shared name', () => {
      const db = createTestDb();
      db.prepare('INSERT INTO contacts (display_name, google_resource_name) VALUES (?, ?)')
        .run('Bob Jones', 'people/c123');

      // Renamed in Google, and carries none of the heuristic fields — previously
      // this re-imported as a brand new duplicate.
      const incoming = [
        makeParsedContact({ displayName: 'Robert Jones', googleResourceName: 'people/c123' }),
      ];
      const result = matchIncomingContacts(db, incoming);
      expect(result.newContacts).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].existingContactId).toBe(1);
      expect(result.matches[0].confidence).toBe('very_high');
      expect(result.matches[0].matchReasons).toContain('same Google contact');
    });

    it('matches on vCard UID even with no email, phone or shared name', () => {
      const db = createTestDb();
      db.prepare('INSERT INTO contacts (display_name, icloud_uid) VALUES (?, ?)')
        .run('Bob Jones', 'ABC-123');

      const incoming = [
        makeParsedContact({ displayName: 'Robert Jones', uid: 'ABC-123' }),
      ];
      const result = matchIncomingContacts(db, incoming);
      expect(result.newContacts).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].existingContactId).toBe(1);
      expect(result.matches[0].confidence).toBe('very_high');
    });

    it('does not match a different contact that happens to share no identifier', () => {
      const db = createTestDb();
      db.prepare('INSERT INTO contacts (display_name, icloud_uid) VALUES (?, ?)')
        .run('Bob Jones', 'ABC-123');

      const incoming = [makeParsedContact({ displayName: 'Someone Else', uid: 'XYZ-999' })];
      const result = matchIncomingContacts(db, incoming);
      expect(result.newContacts).toHaveLength(1);
      expect(result.matches).toHaveLength(0);
    });
  });

  describe('archived contacts', () => {
    it('matches an archived contact instead of resurrecting it as new', () => {
      const db = createTestDb();
      db.prepare('INSERT INTO contacts (display_name, archived_at) VALUES (?, CURRENT_TIMESTAMP)').run('John Smith');
      db.prepare('INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, ?)').run(1, 'john@example.com', 'home', 1);

      const incoming = [
        makeParsedContact({
          displayName: 'John Smith',
          emails: [{ email: 'john@example.com', type: 'home', isPrimary: true }],
        }),
      ];
      const result = matchIncomingContacts(db, incoming);
      expect(result.newContacts).toHaveLength(0);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].existingArchived).toBe(true);
    });

    it('flags live matches as not archived', () => {
      const db = createTestDb();
      db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('John Smith');
      db.prepare('INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, ?)').run(1, 'john@example.com', 'home', 1);

      const incoming = [
        makeParsedContact({
          displayName: 'John Smith',
          emails: [{ email: 'john@example.com', type: 'home', isPrimary: true }],
        }),
      ];
      const result = matchIncomingContacts(db, incoming);
      expect(result.matches[0].existingArchived).toBe(false);
    });
  });
});
