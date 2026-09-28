import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getUserDatabase, closeUserDatabase, closeAllUserDatabases } from '../userDatabase.js';

/**
 * Imports before grouped X-ABRELATEDNAMES lines were understood stored the
 * card but not the related people on it. The database is now the source for
 * export, so those names are recovered from raw_vcard once, on open.
 */
const USER_ID = 9;

const CARD_WITH_GROUPED_NAMES = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Ada Lovelace',
  'N:Lovelace;Ada;;;',
  'item1.X-ABRELATEDNAMES:Leo Lovelace',
  'item1.X-ABLabel:_$!<Child>!$_',
  'item2.X-ABRELATEDNAMES;TYPE=pref:Charles Babbage',
  'item2.X-ABLabel:Mentor',
  'END:VCARD'
].join('\n');

const CARD_WITH_UNGROUPED_NAME = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Grace Hopper',
  'N:Hopper;Grace;;;',
  'X-ABRELATEDNAMES;TYPE=friend:Howard Aiken',
  'END:VCARD'
].join('\n');

function insertContact(name: string, rawVcard: string): number {
  withLegacyRawVcardColumn();
  const result = getUserDatabase(USER_ID)
    .prepare('INSERT INTO contacts (display_name, raw_vcard) VALUES (?, ?)')
    .run(name, rawVcard);
  return result.lastInsertRowid as number;
}

function relatedPeople(contactId: number) {
  return getUserDatabase(USER_ID)
    .prepare('SELECT name, relationship FROM contact_related_people WHERE contact_id = ? ORDER BY id')
    .all(contactId);
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
  getUserDatabase(USER_ID).exec('UPDATE user_settings SET related_names_backfilled_at = NULL');
  closeUserDatabase(USER_ID);
  getUserDatabase(USER_ID);
}

describe('related names backfill', () => {
  let tmpDir: string;
  const originalUserDataPath = process.env.USER_DATA_PATH;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'related-backfill-test-'));
    process.env.USER_DATA_PATH = tmpDir;
  });

  afterEach(() => {
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalUserDataPath !== undefined) {
      process.env.USER_DATA_PATH = originalUserDataPath;
    } else {
      delete process.env.USER_DATA_PATH;
    }
  });

  it('recovers grouped related names from the raw card', () => {
    const id = insertContact('Ada Lovelace', CARD_WITH_GROUPED_NAMES);

    reopenAsNotYetBackfilled();

    expect(relatedPeople(id)).toEqual([
      { name: 'Leo Lovelace', relationship: 'child' },
      { name: 'Charles Babbage', relationship: 'Mentor' }
    ]);
  });

  it('does not add a name the contact already has', () => {
    const id = insertContact('Ada Lovelace', CARD_WITH_GROUPED_NAMES);
    getUserDatabase(USER_ID)
      .prepare('INSERT INTO contact_related_people (contact_id, name, relationship) VALUES (?, ?, ?)')
      .run(id, 'leo lovelace', 'son');

    reopenAsNotYetBackfilled();

    expect(relatedPeople(id)).toEqual([
      { name: 'leo lovelace', relationship: 'son' },
      { name: 'Charles Babbage', relationship: 'Mentor' }
    ]);
  });

  it('leaves ungrouped names alone, which imports always stored', () => {
    // Re-adding these would bring back a related person the user removed.
    const id = insertContact('Grace Hopper', CARD_WITH_UNGROUPED_NAME);

    reopenAsNotYetBackfilled();

    expect(relatedPeople(id)).toEqual([]);
  });

  it('runs once, so a name removed afterwards stays removed', () => {
    const id = insertContact('Ada Lovelace', CARD_WITH_GROUPED_NAMES);
    reopenAsNotYetBackfilled();

    getUserDatabase(USER_ID).prepare('DELETE FROM contact_related_people WHERE contact_id = ?').run(id);
    closeUserDatabase(USER_ID);
    getUserDatabase(USER_ID);

    expect(relatedPeople(id)).toEqual([]);
  });
});
