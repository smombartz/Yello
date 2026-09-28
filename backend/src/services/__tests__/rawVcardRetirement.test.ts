import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import { getUserDatabase, closeUserDatabase, closeAllUserDatabases } from '../userDatabase.js';
import { hasRawVcardColumn } from '../rawVcardRetirement.js';

/**
 * Every property of an imported card is modeled in the database, so the
 * stored originals move to a verified archive file and the column is dropped.
 */
const USER_ID = 13;

const card = (name: string) => [
  'BEGIN:VCARD',
  'VERSION:3.0',
  `FN:${name}`,
  `N:${name};;;;`,
  'END:VCARD'
].join('\r\n');

let tmpDir: string;
const archiveDir = () => path.join(tmpDir, String(USER_ID), 'archive');
const db = () => getUserDatabase(USER_ID);

/** A database from before retirement: the column, stored cards, marker unset. */
function legacyDatabase(names: string[]): number[] {
  db().exec('ALTER TABLE contacts ADD COLUMN raw_vcard TEXT');
  db().exec('UPDATE user_settings SET raw_vcards_archived_at = NULL');
  const ids = names.map(name => db()
    .prepare('INSERT INTO contacts (display_name, raw_vcard) VALUES (?, ?)')
    .run(name, card(name)).lastInsertRowid as number);
  db().prepare(`INSERT INTO contacts (display_name, raw_vcard) VALUES ('No Card', '')`).run();
  return ids;
}

function reopen(): void {
  closeUserDatabase(USER_ID);
  getUserDatabase(USER_ID);
}

function archiveFiles(): string[] {
  return fs.existsSync(archiveDir()) ? fs.readdirSync(archiveDir()).sort() : [];
}

describe('raw_vcard retirement', () => {
  const originalUserDataPath = process.env.USER_DATA_PATH;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-vcard-retirement-test-'));
    process.env.USER_DATA_PATH = tmpDir;
  });

  afterEach(() => {
    closeAllUserDatabases();
    process.env.USER_DATA_PATH = originalUserDataPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates new databases without the column', () => {
    expect(hasRawVcardColumn(db())).toBe(false);
    expect(db().prepare('SELECT raw_vcards_archived_at FROM user_settings').get())
      .toEqual({ raw_vcards_archived_at: expect.any(String) });
    expect(archiveFiles()).toEqual([]);
  });

  it('archives every stored card with its contact id, then drops the column', () => {
    const [ada, grace] = legacyDatabase(['Ada Lovelace', 'Grace Hopper']);
    reopen();

    const files = archiveFiles();
    expect(files).toEqual([`original-cards-${new Date().toISOString().slice(0, 10)}.vcf.gz`]);
    const archive = zlib.gunzipSync(fs.readFileSync(path.join(archiveDir(), files[0]))).toString('utf-8');
    expect(archive.match(/^BEGIN:VCARD\r$/gm)).toHaveLength(2);
    expect(archive).toContain(`BEGIN:VCARD\r\nX-YELLO-CONTACT-ID:${ada}\r\nVERSION:3.0\r\nFN:Ada Lovelace`);
    expect(archive).toContain(`X-YELLO-CONTACT-ID:${grace}`);

    expect(hasRawVcardColumn(db())).toBe(false);
    expect(db().prepare('SELECT COUNT(*) AS n FROM contacts').get()).toEqual({ n: 3 });
  });

  it('runs once', () => {
    legacyDatabase(['Ada Lovelace']);
    reopen();
    reopen();

    expect(archiveFiles()).toHaveLength(1);
  });

  it('leaves the database untouched when the archive cannot be written', () => {
    legacyDatabase(['Ada Lovelace']);
    // A file where the archive directory should be makes mkdir fail
    fs.mkdirSync(path.dirname(archiveDir()), { recursive: true });
    fs.writeFileSync(archiveDir(), 'not a directory');
    reopen();

    expect(hasRawVcardColumn(db())).toBe(true);
    expect(db().prepare(`SELECT raw_vcard FROM contacts WHERE display_name = 'Ada Lovelace'`).get())
      .toEqual({ raw_vcard: card('Ada Lovelace') });
    expect(db().prepare('SELECT raw_vcards_archived_at FROM user_settings').get())
      .toEqual({ raw_vcards_archived_at: null });

    // Retried, and completed, once the archive can be written
    fs.rmSync(archiveDir());
    reopen();
    expect(hasRawVcardColumn(db())).toBe(false);
    expect(archiveFiles()).toHaveLength(1);
  });
});
