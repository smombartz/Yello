import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getUserDatabase, closeUserDatabase, closeAllUserDatabases } from '../userDatabase.js';
import { mergeVcardModelFields, preserveEntryAnnotations } from '../vcardModelStore.js';

/**
 * Contacts imported before the database modelled every vCard property kept
 * their nicknames, labels, extra TYPEs and client metadata only in raw_vcard.
 * The backfill recovers them into the typed columns and
 * contact_vcard_properties once, on open.
 */
const USER_ID = 11;

const CARD = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'PRODID:-//BusyApps//BusyContacts 2025.4.4//EN',
  'FN:Ada Lovelace',
  'N:Lovelace;Ada;Augusta;Hon.;',
  'NICKNAME:Countess',
  'X-GENDER:Female',
  'ORG:Analytical Engines;Research',
  'item1.EMAIL;TYPE=INTERNET;TYPE=OTHER;TYPE=pref:ada@old.example',
  'item1.X-ABLabel:Obsolete',
  'TEL;TYPE=pref:+1 212 555 0101',
  'item2.ADR;TYPE=HOME:;;1 St James Square;London;;SW1Y 4JH;UK',
  'item2.X-ABADR:gb',
  'item3.URL:https://example.com/ada',
  'item3.X-ABLabel:Portfolio',
  'item4.X-ABDATE:1835-07-08',
  'item4.X-ABLabel:_$!<Anniversary>!$_',
  'UID:4bb11a808bd6e881',
  'END:VCARD'
].join('\n');

function db() {
  return getUserDatabase(USER_ID);
}

/** A contact as an older import stored it: the base rows, with `pref` as a type. */
function insertLegacyContact(overrides: { firstName?: string; company?: string } = {}): number {
  withLegacyRawVcardColumn();
  const id = db().prepare(`
    INSERT INTO contacts (first_name, last_name, display_name, company, raw_vcard)
    VALUES (?, 'Lovelace', 'Ada Lovelace', ?, ?)
  `).run(overrides.firstName ?? 'Ada', overrides.company ?? 'Analytical Engines', CARD).lastInsertRowid as number;
  db().prepare(`INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, 'ada@old.example', 'internet', 1)`).run(id);
  db().prepare(`INSERT INTO contact_phones (contact_id, phone, phone_display, type, is_primary) VALUES (?, '+12125550101', '+1 212 555 0101', 'pref', 1)`).run(id);
  db().prepare(`
    INSERT INTO contact_addresses (contact_id, street, city, postal_code, country, type)
    VALUES (?, '1 St James Square', 'London', 'SW1Y 4JH', 'UK', 'home')
  `).run(id);
  db().prepare(`INSERT INTO contact_urls (contact_id, url) VALUES (?, 'https://example.com/ada')`).run(id);
  return id;
}

/**
 * Databases from before raw_vcard was retired still have the column; the
 * backfills exist for them. A new database is created without it.
 */
function withLegacyRawVcardColumn(): void {
  try {
    getUserDatabase(USER_ID).exec('ALTER TABLE contacts ADD COLUMN raw_vcard TEXT');
  } catch { /* already added */ }
}

/** Puts the database back in the state of one that predates the backfill. */
function reopenAsNotYetBackfilled(): void {
  db().exec('UPDATE user_settings SET vcard_model_backfilled_at = NULL');
  closeUserDatabase(USER_ID);
  getUserDatabase(USER_ID);
}

describe('vCard model backfill', () => {
  let tmpDir: string;
  const originalUserDataPath = process.env.USER_DATA_PATH;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcard-model-backfill-test-'));
    process.env.USER_DATA_PATH = tmpDir;
  });

  afterEach(() => {
    closeAllUserDatabases();
    process.env.USER_DATA_PATH = originalUserDataPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('recovers person fields, annotations, dates and generic properties from raw_vcard', () => {
    const id = insertLegacyContact();
    reopenAsNotYetBackfilled();

    expect(db().prepare(`
      SELECT middle_name, name_prefix, nickname, gender, department, icloud_uid FROM contacts WHERE id = ?
    `).get(id)).toEqual({
      middle_name: 'Augusta',
      name_prefix: 'Hon.',
      nickname: 'Countess',
      gender: 'Female',
      department: 'Research',
      icloud_uid: '4bb11a808bd6e881'
    });
    expect(db().prepare('SELECT type, extra_types, label FROM contact_emails WHERE contact_id = ?').get(id))
      .toEqual({ type: 'internet', extra_types: 'other', label: 'Obsolete' });
    expect(db().prepare('SELECT type FROM contact_phones WHERE contact_id = ?').get(id)).toEqual({ type: null });
    expect(db().prepare('SELECT country_code FROM contact_addresses WHERE contact_id = ?').get(id))
      .toEqual({ country_code: 'gb' });
    expect(db().prepare('SELECT label FROM contact_urls WHERE contact_id = ?').get(id)).toEqual({ label: 'Portfolio' });
    expect(db().prepare('SELECT date, label FROM contact_dates WHERE contact_id = ?').all(id))
      .toEqual([{ date: '1835-07-08', label: '_$!<Anniversary>!$_' }]);
    expect(db().prepare('SELECT name FROM contact_vcard_properties WHERE contact_id = ? ORDER BY position').all(id))
      .toEqual([{ name: 'PRODID' }]);
  });

  it('keeps name parts and department off a contact whose name or company was edited', () => {
    const id = insertLegacyContact({ firstName: 'Augusta', company: 'Difference Engines' });
    reopenAsNotYetBackfilled();

    expect(db().prepare('SELECT middle_name, name_prefix, department, nickname FROM contacts WHERE id = ?').get(id))
      .toEqual({ middle_name: null, name_prefix: null, department: null, nickname: 'Countess' });
  });

  it('never overwrites a value set since import, and runs once', () => {
    const id = insertLegacyContact();
    db().prepare(`UPDATE contacts SET nickname = 'Ada' WHERE id = ?`).run(id);
    reopenAsNotYetBackfilled();
    reopenAsNotYetBackfilled();

    expect(db().prepare('SELECT nickname FROM contacts WHERE id = ?').get(id)).toEqual({ nickname: 'Ada' });
    expect(db().prepare('SELECT COUNT(*) AS n FROM contact_dates WHERE contact_id = ?').get(id)).toEqual({ n: 1 });
    expect(db().prepare('SELECT COUNT(*) AS n FROM contact_vcard_properties WHERE contact_id = ?').get(id)).toEqual({ n: 1 });
  });
});

describe('vCard model backfill v2', () => {
  let tmpDir: string;
  const originalUserDataPath = process.env.USER_DATA_PATH;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcard-model-v2-test-'));
    process.env.USER_DATA_PATH = tmpDir;
  });

  afterEach(() => {
    closeAllUserDatabases();
    process.env.USER_DATA_PATH = originalUserDataPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const V2_CARD = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:Ada Lovelace',
    'N:Lovelace;Ada;;;',
    'TITLE:Analyst; Poet',
    'BDAY;X-APPLE-OMIT-YEAR=1604:1604-12-10',
    'CATEGORIES:Mathematicians,Poets,Friends',
    'URL;TYPE=pref:https://example.com/ada',
    'END:VCARD'
  ].join('\n');

  function reopenAsNotYetV2(): void {
    db().exec('UPDATE user_settings SET vcard_model_v2_backfilled_at = NULL');
    closeUserDatabase(USER_ID);
    getUserDatabase(USER_ID);
  }

  function insertV2Contact(categories: string[], title = 'Analyst\\; Poet'): number {
    withLegacyRawVcardColumn();
    const id = db().prepare(`INSERT INTO contacts (display_name, title, raw_vcard) VALUES ('Ada Lovelace', ?, ?)`)
      .run(title, V2_CARD).lastInsertRowid as number;
    for (const category of categories) {
      db().prepare('INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)').run(id, category);
    }
    db().prepare(`INSERT INTO contact_urls (contact_id, url) VALUES (?, 'https://example.com/ada')`).run(id);
    return id;
  }

  const categoriesOf = (id: number) =>
    (db().prepare('SELECT category FROM contact_categories WHERE contact_id = ? ORDER BY id').all(id) as Array<{ category: string }>)
      .map(r => r.category);

  it('recovers categories the old importer cut off, parameters, and a stray escape', () => {
    const id = insertV2Contact(['Mathematicians']);
    reopenAsNotYetV2();

    expect(categoriesOf(id)).toEqual(['Mathematicians', 'Poets', 'Friends']);
    expect(db().prepare('SELECT title, vcard_params FROM contacts WHERE id = ?').get(id)).toEqual({
      title: 'Analyst; Poet',
      vcard_params: JSON.stringify({ BDAY: { 'X-APPLE-OMIT-YEAR': ['1604'] } })
    });
    expect(db().prepare('SELECT params FROM contact_urls WHERE contact_id = ?').get(id))
      .toEqual({ params: JSON.stringify({ TYPE: ['pref'] }) });
  });

  it('recovers cut-off categories even when others were added in the app since', () => {
    const id = insertV2Contact(['Mathematicians', 'LinkedIn Connection']);
    reopenAsNotYetV2();

    expect(categoriesOf(id)).toEqual(['Mathematicians', 'LinkedIn Connection', 'Poets', 'Friends']);
  });

  it('leaves categories alone when they no longer look like the old import', () => {
    const removed = insertV2Contact([]);
    const firstRemoved = insertV2Contact(['Poets']);
    const oneOfTheRestRemoved = insertV2Contact(['Mathematicians', 'Poets']);
    reopenAsNotYetV2();

    expect(categoriesOf(removed)).toEqual([]);
    expect(categoriesOf(firstRemoved)).toEqual(['Poets']);
    expect(categoriesOf(oneOfTheRestRemoved)).toEqual(['Mathematicians', 'Poets']);
  });

  it('keeps a title the user has since changed', () => {
    const id = insertV2Contact(['Mathematicians'], 'Countess of Lovelace');
    reopenAsNotYetV2();

    expect(db().prepare('SELECT title FROM contacts WHERE id = ?').get(id)).toEqual({ title: 'Countess of Lovelace' });
  });
});

describe('preserveEntryAnnotations', () => {
  let tmpDir: string;
  const originalUserDataPath = process.env.USER_DATA_PATH;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcard-annotations-test-'));
    process.env.USER_DATA_PATH = tmpDir;
  });

  afterEach(() => {
    closeAllUserDatabases();
    process.env.USER_DATA_PATH = originalUserDataPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('gives labels back to rows that survive a delete-and-reinsert edit', () => {
    const id = db().prepare(`INSERT INTO contacts (display_name) VALUES ('Ada')`).run().lastInsertRowid as number;
    db().prepare(`INSERT INTO contact_emails (contact_id, email, type, extra_types, label) VALUES (?, 'Ada@Old.example', 'home', 'internet', 'Obsolete')`).run(id);
    db().prepare(`INSERT INTO contact_emails (contact_id, email, label) VALUES (?, 'gone@example.com', 'Old')`).run(id);

    const restore = preserveEntryAnnotations(db(), id);
    db().prepare('DELETE FROM contact_emails WHERE contact_id = ?').run(id);
    db().prepare(`INSERT INTO contact_emails (contact_id, email, type) VALUES (?, 'ada@old.example', 'work')`).run(id);
    db().prepare(`INSERT INTO contact_emails (contact_id, email) VALUES (?, 'new@example.com')`).run(id);
    restore();

    expect(db().prepare('SELECT email, type, extra_types, label FROM contact_emails WHERE contact_id = ? ORDER BY id').all(id))
      .toEqual([
        { email: 'ada@old.example', type: 'work', extra_types: 'internet', label: 'Obsolete' },
        { email: 'new@example.com', type: null, extra_types: null, label: null }
      ]);
  });
});

describe('mergeVcardModelFields', () => {
  let tmpDir: string;
  const originalUserDataPath = process.env.USER_DATA_PATH;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcard-merge-test-'));
    process.env.USER_DATA_PATH = tmpDir;
  });

  afterEach(() => {
    closeAllUserDatabases();
    process.env.USER_DATA_PATH = originalUserDataPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fills the survivor’s empty person fields and adds dates it lacks', () => {
    const primary = db().prepare(`INSERT INTO contacts (display_name, nickname) VALUES ('Ada', 'Countess')`).run().lastInsertRowid as number;
    const secondary = db().prepare(`INSERT INTO contacts (display_name, nickname, gender) VALUES ('Ada L', 'Enchantress', 'Female')`).run().lastInsertRowid as number;
    db().prepare(`INSERT INTO contact_dates (contact_id, date, label) VALUES (?, '1835-07-08', 'Wedding')`).run(primary);
    db().prepare(`INSERT INTO contact_dates (contact_id, date, label) VALUES (?, '1835-07-08', 'Wedding')`).run(secondary);
    db().prepare(`INSERT INTO contact_dates (contact_id, date, label) VALUES (?, '1843-10-01', 'Notes')`).run(secondary);

    mergeVcardModelFields(db(), primary, secondary);

    expect(db().prepare('SELECT nickname, gender FROM contacts WHERE id = ?').get(primary))
      .toEqual({ nickname: 'Countess', gender: 'Female' });
    expect(db().prepare('SELECT date, label FROM contact_dates WHERE contact_id = ? ORDER BY date').all(primary))
      .toEqual([{ date: '1835-07-08', label: 'Wedding' }, { date: '1843-10-01', label: 'Notes' }]);
  });
});
