import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { getUserDatabase, closeAllUserDatabases } from '../userDatabase.js';
import { insertParsedContact, prepareContactStatements, replaceContactFields } from '../contactPersistence.js';
import { setContactKind } from '../contactKind.js';
import { loadContactsForVcard } from '../vcardExportService.js';
import { projectContact } from '../sync/syncProjection.js';
import type { ParsedContact } from '../vcardParser.js';

const USER_ID = 12;

function parsed(overrides: Partial<ParsedContact>): ParsedContact {
  return {
    firstName: null, lastName: null, displayName: 'Front Desk',
    company: null, title: null, notes: null, birthday: null,
    emails: [], phones: [], addresses: [], categories: [],
    instantMessages: [], urls: [], relatedPeople: [], socialProfiles: [],
    photoBase64: null, rawVcard: '', uid: null,
    ...overrides
  };
}

/** The Yello kind (services/contactKind.ts) against iCloud's Show as Company flag. */
describe('contact kind and sync', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-kind-sync-'));
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

  const kindRow = (id: number) =>
    getUserDatabase(USER_ID).prepare('SELECT is_company, kind FROM contacts WHERE id = ?').get(id);

  it('a Generic contact goes to iCloud as a normal card', () => {
    const id = insert(parsed({}));
    setContactKind(getUserDatabase(USER_ID), id, 'generic');
    const [loaded] = loadContactsForVcard(getUserDatabase(USER_ID), { ids: [id] });
    expect(projectContact(loaded.contact, 'icloud').isCompany).toBe(false);
  });

  it('turning Show as Company on or off in iCloud sets the kind', () => {
    const db = getUserDatabase(USER_ID);
    const id = insert(parsed({}));
    setContactKind(db, id, 'generic');
    const stmts = prepareContactStatements(db);

    db.transaction(() => replaceContactFields(stmts, db, id, parsed({ isCompany: true }), ['isCompany']))();
    expect(kindRow(id)).toEqual({ is_company: 1, kind: 'company' });

    db.transaction(() => replaceContactFields(stmts, db, id, parsed({ isCompany: false }), ['isCompany']))();
    expect(kindRow(id)).toEqual({ is_company: 0, kind: 'person' });
  });
});
