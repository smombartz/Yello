import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { exportContactsAsVcf } from '../vcardExportService.js';
import { runVcfImportJob } from '../importService.js';
import { createImportJob } from '../importJobService.js';
import { getUserDatabase, closeAllUserDatabases, getUserImportsPath } from '../userDatabase.js';
import { parseVcf } from '../vcardParser.js';

vi.mock('../photoProcessor.js', () => ({
  processPhoto: vi.fn().mockResolvedValue('mock-hash-123')
}));

const SOURCE_USER = 71;
const TARGET_USER = 72;

const noPhoto = () => null;

/** The card as the contact apps originally supplied it: one email, no company. */
const ORIGINAL_CARD = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'PRODID:-//BusyApps//BusyContacts 2025.4.4//EN',
  'FN:Ada Lovelace',
  'N:Lovelace;Ada;;;',
  'NICKNAME:Countess',
  'EMAIL;TYPE=INTERNET;TYPE=pref:ada@example.com',
  'TEL;TYPE=pref:+1-212-555-0101',
  'UID:4bb11a808bd6e881',
  'item1.URL;TYPE=pref:https://example.com/ada',
  'item1.X-ABLabel:Portfolio',
  'END:VCARD'
].join('\n');

async function importVcf(userId: number, vcf: string) {
  const db = getUserDatabase(userId);
  const filePath = path.join(getUserImportsPath(userId), `${Date.now()}-${Math.round(performance.now())}.vcf`);
  fs.writeFileSync(filePath, vcf, 'utf-8');
  const jobId = createImportJob(db, { filename: 'test.vcf', filePath, fileSize: Buffer.byteLength(vcf) });
  return runVcfImportJob(userId, jobId);
}

/** Imports the original card, then applies the edits made in the app since. */
async function seedEditedContact(): Promise<number> {
  await importVcf(SOURCE_USER, ORIGINAL_CARD);
  const db = getUserDatabase(SOURCE_USER);
  const { id } = db.prepare('SELECT id FROM contacts').get() as { id: number };

  db.prepare('UPDATE contacts SET company = ?, title = ?, notes = ? WHERE id = ?')
    .run('Analytical Engines', 'Analyst', 'Met at the Royal Society', id);
  db.prepare('INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, 0)')
    .run(id, 'ada@engines.example', 'work');
  db.prepare('INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url) VALUES (?, ?, ?, ?)')
    .run(id, 'linkedin', 'ada-lovelace', 'https://www.linkedin.com/in/ada-lovelace');
  db.prepare('INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)')
    .run(id, 'LinkedIn Connection');
  db.prepare('INSERT INTO contact_instant_messages (contact_id, service, handle, type) VALUES (?, ?, ?, ?)')
    .run(id, 'WhatsApp', '+12125550101', null);
  db.prepare('INSERT INTO contact_related_people (contact_id, name, relationship) VALUES (?, ?, ?)')
    .run(id, 'Charles Babbage', 'friend');
  db.prepare(`
    INSERT INTO linkedin_enrichment (contact_id, headline, company_name, followers_count, positions, enriched_at, raw_response)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, 'Analyst at Analytical Engines', 'Analytical Engines', 1815,
    '[{"title":"Analyst"}]', '2026-02-13 21:44:46', '{"firstName":"Ada"}');

  return id;
}

describe('exportContactsAsVcf', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-export-service-'));
    process.env.USER_DATA_PATH = tmpDir;
  });

  afterAll(() => {
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    for (const userId of [SOURCE_USER, TARGET_USER]) {
      const db = getUserDatabase(userId);
      db.exec('DELETE FROM contacts');
      db.exec('DELETE FROM import_jobs');
    }
  });

  it('exports what was added to a contact after its original import', async () => {
    await seedEditedContact();

    const { contacts, errors } = parseVcf(exportContactsAsVcf(getUserDatabase(SOURCE_USER), noPhoto));

    expect(errors).toEqual([]);
    expect(contacts).toHaveLength(1);
    const exported = contacts[0];
    expect(exported.company).toBe('Analytical Engines');
    expect(exported.title).toBe('Analyst');
    expect(exported.notes).toBe('Met at the Royal Society');
    expect(exported.emails.map(e => [e.email, e.isPrimary])).toEqual([
      ['ada@example.com', true],
      ['ada@engines.example', false]
    ]);
    expect(exported.socialProfiles).toEqual([
      { platform: 'linkedin', username: 'ada-lovelace', url: 'https://www.linkedin.com/in/ada-lovelace' }
    ]);
    expect(exported.categories).toEqual(['LinkedIn Connection']);
    expect(exported.instantMessages).toEqual([{ service: 'WhatsApp', handle: '+12125550101', type: null }]);
    expect(exported.relatedPeople).toEqual([{ name: 'Charles Babbage', relationship: 'friend' }]);
    expect(exported.urls).toEqual([
      { url: 'https://example.com/ada', label: 'Portfolio', type: null, params: { TYPE: ['pref'] } }
    ]);
    expect(exported.uid).toBe('4bb11a808bd6e881');
    expect(exported.nickname).toBe('Countess');
    expect(exported.extraProperties?.map(p => p.name)).toEqual(['PRODID']);
    expect(exported.linkedinEnrichment).toEqual({
      headline: 'Analyst at Analytical Engines',
      company_name: 'Analytical Engines',
      followers_count: 1815,
      positions: '[{"title":"Analyst"}]',
      enriched_at: '2026-02-13 21:44:46',
      raw_response: '{"firstName":"Ada"}'
    });
  });

  it('leaves out a value removed from the contact after import', async () => {
    const id = await seedEditedContact();
    getUserDatabase(SOURCE_USER).prepare('DELETE FROM contact_phones WHERE contact_id = ?').run(id);

    const { contacts } = parseVcf(exportContactsAsVcf(getUserDatabase(SOURCE_USER), noPhoto));

    expect(contacts[0].phones).toEqual([]);
  });

  it('leaves archived contacts out', async () => {
    const db = getUserDatabase(SOURCE_USER);
    db.prepare(`INSERT INTO contacts (display_name) VALUES ('Kept Contact')`).run();
    db.prepare(`INSERT INTO contacts (display_name, archived_at) VALUES ('Archived Contact', datetime('now'))`).run();

    const { contacts } = parseVcf(exportContactsAsVcf(db, noPhoto));

    expect(contacts.map(c => c.displayName)).toEqual(['Kept Contact']);
  });

  it('exports only archived contacts when asked for them', () => {
    const db = getUserDatabase(SOURCE_USER);
    db.prepare(`INSERT INTO contacts (display_name) VALUES ('Kept Contact')`).run();
    db.prepare(`INSERT INTO contacts (display_name, archived_at) VALUES ('Archived Contact', datetime('now'))`).run();

    const { contacts } = parseVcf(exportContactsAsVcf(db, noPhoto, { archived: true }));

    expect(contacts.map(c => c.displayName)).toEqual(['Archived Contact']);
  });

  it('embeds the photo the reader returns for the contact hash', () => {
    const db = getUserDatabase(SOURCE_USER);
    db.prepare(`INSERT INTO contacts (display_name, photo_hash) VALUES ('With Photo', 'hash-a')`).run();
    db.prepare(`INSERT INTO contacts (display_name, photo_hash) VALUES ('Photo Missing', 'hash-b')`).run();

    const vcf = exportContactsAsVcf(db, hash => (hash === 'hash-a' ? 'QUJDRA==' : null));

    const { contacts } = parseVcf(vcf);
    expect(contacts.map(c => [c.displayName, c.photoBase64])).toEqual([
      ['With Photo', 'QUJDRA=='],
      ['Photo Missing', null]
    ]);
  });

  it('separates cards so every contact parses', () => {
    const db = getUserDatabase(SOURCE_USER);
    db.prepare(`INSERT INTO contacts (display_name) VALUES ('First Contact')`).run();
    db.prepare(`INSERT INTO contacts (display_name) VALUES ('Second Contact')`).run();

    const vcf = exportContactsAsVcf(db, noPhoto);

    expect(vcf.match(/^BEGIN:VCARD\r?$/gm)).toHaveLength(2);
    expect(parseVcf(vcf).contacts.map(c => c.displayName)).toEqual(['First Contact', 'Second Contact']);
  });
});

describe('export then import into another account', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-export-roundtrip-'));
    process.env.USER_DATA_PATH = tmpDir;
  });

  afterAll(() => {
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('arrives with the same detail it had in the source account', async () => {
    await seedEditedContact();

    const result = await importVcf(TARGET_USER, exportContactsAsVcf(getUserDatabase(SOURCE_USER), noPhoto));
    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);

    const db = getUserDatabase(TARGET_USER);
    const contact = db.prepare(
      'SELECT id, display_name, first_name, last_name, company, title, notes, icloud_uid FROM contacts'
    ).get() as { id: number } & Record<string, unknown>;

    expect(contact).toMatchObject({
      display_name: 'Ada Lovelace',
      first_name: 'Ada',
      last_name: 'Lovelace',
      company: 'Analytical Engines',
      title: 'Analyst',
      notes: 'Met at the Royal Society',
      icloud_uid: '4bb11a808bd6e881'
    });

    const rows = (sql: string) => db.prepare(sql).all(contact.id);

    expect(rows('SELECT email, is_primary FROM contact_emails WHERE contact_id = ? ORDER BY id')).toEqual([
      { email: 'ada@example.com', is_primary: 1 },
      { email: 'ada@engines.example', is_primary: 0 }
    ]);
    expect(rows('SELECT phone FROM contact_phones WHERE contact_id = ?')).toEqual([
      { phone: '+12125550101' }
    ]);
    expect(rows('SELECT platform, username, profile_url FROM contact_social_profiles WHERE contact_id = ?')).toEqual([
      { platform: 'linkedin', username: 'ada-lovelace', profile_url: 'https://www.linkedin.com/in/ada-lovelace' }
    ]);
    expect(rows('SELECT category FROM contact_categories WHERE contact_id = ?')).toEqual([
      { category: 'LinkedIn Connection' }
    ]);
    expect(rows('SELECT url, label FROM contact_urls WHERE contact_id = ?')).toEqual([
      { url: 'https://example.com/ada', label: 'Portfolio' }
    ]);
    expect(rows('SELECT service, handle FROM contact_instant_messages WHERE contact_id = ?')).toEqual([
      { service: 'WhatsApp', handle: '+12125550101' }
    ]);
    expect(rows('SELECT name, relationship FROM contact_related_people WHERE contact_id = ?')).toEqual([
      { name: 'Charles Babbage', relationship: 'friend' }
    ]);
    expect(db.prepare('SELECT nickname FROM contacts WHERE id = ?').get(contact.id)).toEqual({ nickname: 'Countess' });
    expect(rows('SELECT name, value FROM contact_vcard_properties WHERE contact_id = ?')).toEqual([
      { name: 'PRODID', value: '-//BusyApps//BusyContacts 2025.4.4//EN' }
    ]);
    expect(rows(`
      SELECT headline, company_name, followers_count, positions, enriched_at, raw_response, about
      FROM linkedin_enrichment WHERE contact_id = ?
    `)).toEqual([{
      headline: 'Analyst at Analytical Engines',
      company_name: 'Analytical Engines',
      followers_count: 1815,
      positions: '[{"title":"Analyst"}]',
      enriched_at: '2026-02-13 21:44:46',
      raw_response: '{"firstName":"Ada"}',
      about: null
    }]);
  });
});
