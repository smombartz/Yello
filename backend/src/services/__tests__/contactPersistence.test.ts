import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { getUserDatabase, closeAllUserDatabases } from '../userDatabase.js';
import { insertParsedContact, mergeParsedIntoContact, prepareContactStatements } from '../contactPersistence.js';
import { mergeContacts } from '../mergeService.js';
import { findContactByMergedIdentity } from '../mergedIdentities.js';
import { isGroupVcard, parseSingleVcard, parseVcf, type ParsedContact } from '../vcardParser.js';

const USER_ID = 7;

function parsed(overrides: Partial<ParsedContact>): ParsedContact {
  return {
    firstName: null, lastName: null, displayName: 'Test',
    company: null, title: null, notes: null, birthday: null,
    emails: [], phones: [], addresses: [], categories: [],
    instantMessages: [], urls: [], relatedPeople: [], socialProfiles: [],
    photoBase64: null, rawVcard: '', uid: null,
    ...overrides
  };
}

describe('contactPersistence', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-contact-persistence-'));
    process.env.USER_DATA_PATH = tmpDir;
  });

  afterAll(() => {
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    getUserDatabase(USER_ID).exec('DELETE FROM contacts; DELETE FROM contact_merged_identities;');
  });

  function insert(contact: ParsedContact): number {
    const db = getUserDatabase(USER_ID);
    const stmts = prepareContactStatements(db);
    return db.transaction(() => insertParsedContact(stmts, db, contact, { skipExistingUid: false }))()!.contactId;
  }

  describe('mergeParsedIntoContact', () => {
    it('adds new child rows of every kind with their labels and parameters', () => {
      const db = getUserDatabase(USER_ID);
      const id = insert(parsed({
        firstName: 'Ada', lastName: 'Lovelace', displayName: 'Ada Lovelace',
        emails: [{ email: 'ada@example.com', type: 'home', isPrimary: true }]
      }));

      const stmts = prepareContactStatements(db);
      db.transaction(() => mergeParsedIntoContact(stmts, db, id, parsed({
        displayName: 'Ada Lovelace',
        title: 'Analyst',
        emails: [
          { email: 'ADA@example.com', type: 'home', isPrimary: true },
          { email: 'ada@work.example', type: 'work', label: 'Lab', params: { 'X-TEST': ['1'] }, isPrimary: true }
        ],
        phones: [{ phone: '+441234567890', phoneDisplay: '+44 1234 567890', countryCode: 'GB', type: 'cell', isPrimary: true }],
        addresses: [{ street: '1 Main St', city: 'London', state: null, postalCode: 'N1', country: 'UK', type: 'home', latitude: null, longitude: null }],
        urls: [{ url: 'https://ada.example', label: null, type: 'home' }],
        instantMessages: [{ service: 'skype', handle: 'ada', type: null }],
        relatedPeople: [{ name: 'Byron', relationship: 'father' }],
        socialProfiles: [{ platform: 'twitter', username: 'ada', url: 'https://twitter.com/ada' }],
        categories: ['Friends'],
        dates: [{ date: '1843-01-01', label: 'Notes published' }]
      })))();

      const count = (table: string) =>
        (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE contact_id = ?`).get(id) as { n: number }).n;
      expect(count('contact_emails')).toBe(2);
      expect(count('contact_phones')).toBe(1);
      expect(count('contact_addresses')).toBe(1);
      expect(count('contact_urls')).toBe(1);
      expect(count('contact_instant_messages')).toBe(1);
      expect(count('contact_related_people')).toBe(1);
      expect(count('contact_social_profiles')).toBe(1);
      expect(count('contact_categories')).toBe(1);
      expect(count('contact_dates')).toBe(1);

      const work = db.prepare("SELECT label, params, is_primary FROM contact_emails WHERE email = 'ada@work.example'").get() as
        { label: string; params: string; is_primary: number };
      expect(work.label).toBe('Lab');
      expect(JSON.parse(work.params)).toEqual({ 'X-TEST': ['1'] });
      expect(work.is_primary).toBe(0);

      expect((db.prepare('SELECT title FROM contacts WHERE id = ?').get(id) as { title: string }).title).toBe('Analyst');
    });

    it('keeps a differing scalar unless the resolution says incoming', () => {
      const db = getUserDatabase(USER_ID);
      const stmts = prepareContactStatements(db);
      const id = insert(parsed({ displayName: 'X', company: 'Old Co', title: 'CEO' }));

      db.transaction(() => mergeParsedIntoContact(stmts, db, id, parsed({ company: 'New Co', title: 'CTO' }), { title: 'incoming' }))();

      const row = db.prepare('SELECT company, title FROM contacts WHERE id = ?').get(id) as { company: string; title: string };
      expect(row).toEqual({ company: 'Old Co', title: 'CTO' });
    });
  });

  describe('merging contacts keeps their remote identities', () => {
    it('the primary adopts a missing UID and records the rest', () => {
      const db = getUserDatabase(USER_ID);
      const primary = insert(parsed({ displayName: 'Primary' }));
      // A contact from before every contact was given a UID.
      db.prepare('UPDATE contacts SET icloud_uid = NULL WHERE id = ?').run(primary);
      const second = insert(parsed({ displayName: 'Second', uid: 'UID-2' }));
      const third = insert(parsed({ displayName: 'Third', uid: 'UID-3' }));
      db.prepare('UPDATE contacts SET google_resource_name = ? WHERE id = ?').run('people/c2', second);
      db.prepare('UPDATE contacts SET google_resource_name = ? WHERE id = ?').run('people/c3', third);

      mergeContacts(db, [primary, second, third], primary);

      const row = db.prepare('SELECT icloud_uid, google_resource_name FROM contacts WHERE id = ?').get(primary) as
        { icloud_uid: string; google_resource_name: string };
      expect(row).toEqual({ icloud_uid: 'UID-2', google_resource_name: 'people/c2' });
      expect(findContactByMergedIdentity(db, 'uid', 'UID-3')).toBe(primary);
      expect(findContactByMergedIdentity(db, 'google_resource_name', 'people/c3')).toBe(primary);
    });

    it('identities recorded on a contact follow it into a later merge', () => {
      const db = getUserDatabase(USER_ID);
      const a = insert(parsed({ displayName: 'A', uid: 'UID-A' }));
      const b = insert(parsed({ displayName: 'B', uid: 'UID-B' }));
      const c = insert(parsed({ displayName: 'C', uid: 'UID-C' }));

      mergeContacts(db, [b, c], b);
      mergeContacts(db, [a, b], a);

      expect(findContactByMergedIdentity(db, 'uid', 'UID-B')).toBe(a);
      expect(findContactByMergedIdentity(db, 'uid', 'UID-C')).toBe(a);
    });
  });
});

describe('Apple group cards', () => {
  const group = [
    'BEGIN:VCARD', 'VERSION:3.0', 'N:Family', 'FN:Family',
    'X-ADDRESSBOOKSERVER-KIND:group',
    'X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:1234',
    'UID:GROUP-1', 'END:VCARD'
  ].join('\r\n');
  const person = ['BEGIN:VCARD', 'VERSION:3.0', 'N:Doe;Jane;;;', 'FN:Jane Doe', 'UID:P-1', 'END:VCARD'].join('\r\n');

  it('are recognised, including the vCard 4 KIND property', () => {
    expect(isGroupVcard(group)).toBe(true);
    expect(isGroupVcard(group.replace('X-ADDRESSBOOKSERVER-KIND', 'KIND'))).toBe(true);
    expect(isGroupVcard(person)).toBe(false);
    expect(parseSingleVcard(person)).not.toBeNull();
  });

  it('are skipped by parseVcf', () => {
    const result = parseVcf(`${group}\r\n${person}\r\n`);
    expect(result.contacts.map(c => c.displayName)).toEqual(['Jane Doe']);
    expect(result.skippedGroups).toBe(1);
  });
});
