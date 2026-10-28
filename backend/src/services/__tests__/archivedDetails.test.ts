import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { getUserDatabase, closeAllUserDatabases } from '../userDatabase.js';
import { insertParsedContact, prepareContactStatements, replaceContactFields } from '../contactPersistence.js';
import { archiveObsoleteLabels } from '../archivedDetails.js';
import { loadContactsForVcard } from '../vcardExportService.js';
import { generateVcard, type ContactForVcard } from '../vcardGenerator.js';
import { parseSingleVcard, type ParsedContact } from '../vcardParser.js';
import { projectContact } from '../sync/syncProjection.js';
import { mergeContacts } from '../mergeService.js';

const USER_ID = 11;

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

function contactData(overrides: Partial<ContactForVcard>): ContactForVcard {
  return {
    firstName: 'Ada', lastName: 'Lovelace', displayName: 'Ada Lovelace',
    company: null, title: null, notes: null, birthday: null,
    emails: [], phones: [], addresses: [], socialProfiles: [], categories: [],
    ...overrides
  };
}

const phone = (number: string, extra: Partial<ParsedContact['phones'][number]> = {}) => ({
  phone: number, phoneDisplay: number, countryCode: null, type: 'cell', isPrimary: false, ...extra
});

describe('archived details', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-archived-details-'));
    process.env.USER_DATA_PATH = tmpDir;
  });

  afterAll(() => {
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    getUserDatabase(USER_ID).exec('DELETE FROM contacts;');
  });

  function insert(contact: ParsedContact): number {
    const db = getUserDatabase(USER_ID);
    const stmts = prepareContactStatements(db);
    return db.transaction(() => insertParsedContact(stmts, db, contact, { skipExistingUid: false }))()!.contactId;
  }

  const phoneRows = (id: number) => getUserDatabase(USER_ID).prepare(`
    SELECT phone, label, is_primary, detail_archived_at IS NOT NULL AS archived
    FROM contact_phones WHERE contact_id = ? ORDER BY id
  `).all(id);

  describe('vCard', () => {
    const card = contactData({
      phones: [
        { phone: '+14155550100', phoneDisplay: '+1 415 555 0100', type: 'cell', label: 'mobile', isPrimary: false, archivedAt: '2026-10-26T09:00:00Z' },
        { phone: '+14155550199', phoneDisplay: '+1 415 555 0199', type: 'cell', isPrimary: true }
      ],
      emails: [{ email: 'old@example.com', type: 'home', isPrimary: false, archivedAt: '2026-10-01T00:00:00Z' }],
      socialProfiles: [{ platform: 'twitter', username: 'ada', profileUrl: 'https://twitter.com/ada', archivedAt: '2026-09-01T00:00:00Z' }]
    });

    it('exports an archived entry labelled Archived, with the marker and its original label', () => {
      const vcard = generateVcard(card).replace(/\r\n /g, '');
      expect(vcard).toMatch(/item\d+\.TEL;TYPE=CELL;X-YELLO-ARCHIVED=2026-10-26;X-YELLO-LABEL=mobile:\+1 415 555 0100/);
      expect(vcard).toMatch(/item\d+\.X-ABLabel:Archived/);
      expect(vcard).toContain('EMAIL;TYPE=HOME;X-YELLO-ARCHIVED=2026-10-01:old@example.com');
      expect(vcard).toContain('X-YELLO-ARCHIVED=2026-09-01:https://twitter.com/ada');
    });

    it('round-trips archived entries through a Yello export and import', () => {
      const back = parseSingleVcard(generateVcard(card))!;
      expect(back.phones[0]).toMatchObject({ phone: '+14155550100', label: 'mobile', archivedAt: '2026-10-26' });
      expect(back.phones[0].params ?? null).toBeNull();
      expect(back.phones[1].archivedAt).toBeUndefined();
      expect(back.emails[0]).toMatchObject({ email: 'old@example.com', label: null, archivedAt: '2026-10-01' });
      expect(back.socialProfiles[0]).toMatchObject({ url: 'https://twitter.com/ada', archivedAt: '2026-09-01' });
      expect(back.socialProfiles[0]).not.toHaveProperty('label');
    });

    it('leaves archived entries off a card pushed to a sync target', () => {
      const vcard = generateVcard(card, { sync: { rev: '2026-10-26T00:00:00Z' } });
      expect(vcard).not.toContain('555 0100');
      expect(vcard).not.toContain('old@example.com');
      expect(vcard).not.toContain('twitter.com/ada');
      expect(vcard).not.toContain('X-YELLO-ARCHIVED');
      expect(vcard).toContain('555 0199');
    });

    it('leaves archived entries out of the sync projection', () => {
      const projection = projectContact(card, 'icloud');
      expect(projection.phones).toEqual([{ value: '+14155550199', type: 'cell' }]);
      expect(projection.emails).toEqual([]);
      expect(projection.socials).toEqual([]);
      expect(projectContact(card, 'google').urls).toEqual([]);
    });
  });

  describe('storage', () => {
    it('archives an entry labelled Obsolete on import and moves the primary flag', () => {
      const id = insert(parsed({
        phones: [phone('+14155550100', { label: 'Obsolete', isPrimary: true }), phone('+14155550199')]
      }));
      expect(phoneRows(id)).toEqual([
        { phone: '+14155550100', label: null, is_primary: 0, archived: 1 },
        { phone: '+14155550199', label: null, is_primary: 1, archived: 0 }
      ]);
    });

    it('exports archived rows from the database but not for sync', () => {
      const id = insert(parsed({ phones: [phone('+14155550100', { archivedAt: '2026-10-26' }), phone('+14155550199', { isPrimary: true })] }));
      const [loaded] = loadContactsForVcard(getUserDatabase(USER_ID), { ids: [id] });
      expect(loaded.contact.phones.map(p => p.archivedAt ?? null)).toEqual(['2026-10-26', null]);
      expect(generateVcard(loaded.contact)).toContain('X-YELLO-ARCHIVED=2026-10-26');
    });

    it('keeps archived rows when sync replaces a family, skipping a remote copy of an archived value', () => {
      const db = getUserDatabase(USER_ID);
      const id = insert(parsed({
        phones: [phone('+14155550100', { archivedAt: '2026-10-26', label: 'mobile' }), phone('+14155550199', { isPrimary: true })]
      }));
      const stmts = prepareContactStatements(db);
      db.transaction(() => replaceContactFields(stmts, db, id, parsed({
        phones: [phone('+14155550100', { isPrimary: true }), phone('+14155550123')]
      }), ['phones']))();

      expect(phoneRows(id)).toEqual([
        { phone: '+14155550100', label: 'mobile', is_primary: 0, archived: 1 },
        { phone: '+14155550123', label: null, is_primary: 1, archived: 0 }
      ]);
    });

    it('archives a remote entry relabelled Obsolete, so the next push removes it', () => {
      const db = getUserDatabase(USER_ID);
      const id = insert(parsed({ phones: [phone('+14155550100', { isPrimary: true }), phone('+14155550199')] }));
      const stmts = prepareContactStatements(db);
      db.transaction(() => replaceContactFields(stmts, db, id, parsed({
        phones: [phone('+14155550100', { label: 'Obsolete', isPrimary: true }), phone('+14155550199')]
      }), ['phones']))();

      expect(phoneRows(id)).toEqual([
        { phone: '+14155550100', label: null, is_primary: 0, archived: 1 },
        { phone: '+14155550199', label: null, is_primary: 1, archived: 0 }
      ]);
    });
  });

  describe('merging contacts', () => {
    it('carries archived rows over, and an active copy on either side wins', () => {
      const db = getUserDatabase(USER_ID);
      const primary = insert(parsed({
        phones: [phone('+14155550100', { archivedAt: '2026-10-26' }), phone('+14155550199', { isPrimary: true })]
      }));
      const secondary = insert(parsed({
        phones: [phone('+14155550100', { isPrimary: true }), phone('+14155550123', { archivedAt: '2026-09-01' })]
      }));
      mergeContacts(db, [primary, secondary], primary);

      expect(phoneRows(primary)).toEqual([
        { phone: '+14155550100', label: null, is_primary: 0, archived: 0 },
        { phone: '+14155550199', label: null, is_primary: 1, archived: 0 },
        { phone: '+14155550123', label: null, is_primary: 0, archived: 1 }
      ]);
    });
  });

  describe('Obsolete label migration', () => {
    it('archives Obsolete/Archived rows once, clears the label and fixes the primary', () => {
      const db = getUserDatabase(USER_ID);
      const id = insert(parsed({
        phones: [phone('+14155550100', { isPrimary: true }), phone('+14155550199')],
        urls: [{ url: 'https://old.example.com', label: null, type: null }]
      }));
      // Labels written before this feature existed
      db.prepare("UPDATE contact_phones SET label = 'obsolete' WHERE phone = '+14155550100'").run();
      db.prepare("UPDATE contact_urls SET label = 'Archived'").run();

      archiveObsoleteLabels(db);
      const firstRun = db.prepare('SELECT detail_archived_at FROM contact_phones WHERE phone = ?').get('+14155550100');
      archiveObsoleteLabels(db);

      expect(phoneRows(id)).toEqual([
        { phone: '+14155550100', label: null, is_primary: 0, archived: 1 },
        { phone: '+14155550199', label: null, is_primary: 1, archived: 0 }
      ]);
      expect(db.prepare('SELECT detail_archived_at FROM contact_phones WHERE phone = ?').get('+14155550100')).toEqual(firstRun);
      expect(db.prepare('SELECT label, detail_archived_at IS NOT NULL AS archived FROM contact_urls').get())
        .toEqual({ label: null, archived: 1 });
    });
  });
});
