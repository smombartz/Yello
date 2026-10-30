import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { getUserDatabase, closeAllUserDatabases } from '../userDatabase.js';
import { insertParsedContact, prepareContactStatements } from '../contactPersistence.js';
import { parseSingleVcard } from '../vcardParser.js';
import { findEmptyContacts, getAllEmptyContactIds, getCleanupSummary } from '../cleanupService.js';

const USER_ID = 11;

const card = (...lines: string[]) =>
  ['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join('\r\n');

describe('nameless cards', () => {
  it('use the company as a stand-in name', () => {
    const parsed = parseSingleVcard(card('N:;;;;', 'FN:', 'ORG:Acme;', 'EMAIL:a@acme.com'))!;
    expect(parsed.displayName).toBe('Acme');
    expect(parsed.namePlaceholder).toBe(true);
  });

  it('fall back to the primary email, then the phone, then "No Name"', () => {
    expect(parseSingleVcard(card('EMAIL;TYPE=INTERNET:x@a.com', 'EMAIL;TYPE=INTERNET,pref:y@b.com'))!.displayName).toBe('y@b.com');
    expect(parseSingleVcard(card('TEL;TYPE=CELL:+1 212 555 0100'))!.displayName).toBe('+1 212 555 0100');
    const empty = parseSingleVcard(card('NOTE:hello'))!;
    expect(empty.displayName).toBe('No Name');
    expect(empty.namePlaceholder).toBe(true);
  });

  it('are not flagged when the card has a name', () => {
    expect(parseSingleVcard(card('N:Doe;Jane;;;', 'EMAIL:j@d.com'))!.namePlaceholder).toBeUndefined();
  });
});

describe('cleanup empty categories', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-nameless-'));
    process.env.USER_DATA_PATH = tmpDir;
  });

  afterAll(() => {
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    getUserDatabase(USER_ID).exec('DELETE FROM contacts;');
  });

  function insert(vcard: string): number {
    const db = getUserDatabase(USER_ID);
    const stmts = prepareContactStatements(db);
    return db.transaction(() => insertParsedContact(stmts, db, parseSingleVcard(vcard)!, { skipExistingUid: false })!.contactId)();
  }

  it('sorts contacts into truly empty, no name and name only', () => {
    const db = getUserDatabase(USER_ID);
    const nameless = insert(card('EMAIL:who@x.com'));
    const empty = insert(card('FN:'));
    const nameOnly = insert(card('FN:Just A Name', 'N:Name;Just;;;'));
    const withNote = insert(card('FN:Has Note', 'NOTE:met at the fair'));
    const withBirthday = insert(card('FN:Has Birthday', 'BDAY:1990-04-01'));
    const withDate = insert(card('FN:Has Date', 'item1.X-ABDATE:2010-06-01', 'item1.X-ABLabel:_$!<Anniversary>!$_'));
    const withUrl = insert(card('FN:Has Url', 'URL:https://example.com'));
    insert(card('FN:Has Email', 'EMAIL:e@x.com'));

    expect(db.prepare('SELECT placeholder_name FROM contacts WHERE id = ?').get(nameless)).toEqual({ placeholder_name: 'who@x.com' });

    const summary = getCleanupSummary(db).empty;
    expect(summary).toEqual({ trulyEmpty: 1, noName: 1, nameOnly: 1, total: 3 });
    expect(getAllEmptyContactIds(db, ['truly_empty'])).toEqual([empty]);
    expect(getAllEmptyContactIds(db, ['no_name'])).toEqual([nameless]);
    expect(getAllEmptyContactIds(db, ['name_only'])).toEqual([nameOnly]);
    for (const id of [withNote, withBirthday, withDate, withUrl]) {
      expect(getAllEmptyContactIds(db)).not.toContain(id);
    }

    const page = findEmptyContacts(db, 10, 1);
    expect(page.total).toBe(3);
    expect(page.contacts.map(c => [c.id, c.issueType])).toEqual([[nameless, 'no_name'], [nameOnly, 'name_only']]);
  });

  it('lists nameless contacts that have no placeholder_name (imported before stand-ins)', () => {
    // These cards came in with the stand-in written into FN by the source
    // (or an older import): no first/last name, and placeholder_name is NULL.
    const db = getUserDatabase(USER_ID);
    const localPart = insert(card('FN:peter', 'EMAIL:peter@peterp.me'));
    const fullEmail = insert(card('FN:awemerald@gmail.com', 'EMAIL:awemerald@gmail.com'));
    const noNamePhone = insert(card('FN:No Name', 'TEL;TYPE=CELL:+1 443 326 5452'));
    const phoneAsName = insert(card('FN:(212) 555-0100', 'TEL;TYPE=CELL:+1 212 555 0100'));
    const noNameEmpty = insert(card('FN:No Name'));
    // Real names and company cards stay out of No Name
    insert(card('FN:Peter Pan', 'EMAIL:peter@pan.com'));
    insert(card('N:;peter;;;', 'FN:peter', 'EMAIL:peter@example.com'));
    insert(card('FN:Acme Inc.', 'ORG:Acme Inc.;', 'X-ABSHOWAS:COMPANY', 'EMAIL:info@acme.com'));

    const placeholders = db.prepare('SELECT COUNT(*) AS n FROM contacts WHERE placeholder_name IS NOT NULL').get() as { n: number };
    expect(placeholders.n).toBe(0);

    const noName = getAllEmptyContactIds(db, ['no_name']);
    expect([...noName].sort((a, b) => a - b)).toEqual([localPart, fullEmail, noNamePhone, phoneAsName].sort((a, b) => a - b));
    expect(getAllEmptyContactIds(db, ['truly_empty'])).toEqual([noNameEmpty]);
    expect(getCleanupSummary(db).empty.noName).toBe(4);

    const page = findEmptyContacts(db, 50, 0, ['no_name']);
    expect(page.total).toBe(4);
    expect(page.contacts).toHaveLength(4);
    expect(page.contacts.every(c => c.issueType === 'no_name')).toBe(true);
  });

  it('drops a contact from No Name once it is given a name', () => {
    const db = getUserDatabase(USER_ID);
    const id = insert(card('EMAIL:who@x.com'));
    db.prepare("UPDATE contacts SET first_name = 'Ann', display_name = 'Ann' WHERE id = ?").run(id);
    expect(getAllEmptyContactIds(db, ['no_name'])).toEqual([]);
  });
});
