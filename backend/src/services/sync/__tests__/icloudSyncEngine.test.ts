import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';

vi.mock('../../photoProcessor.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../photoProcessor.js')>()),
  processPhoto: vi.fn(async (base64: string) => `photo-${base64.length}`)
}));

import { getUserDatabase, closeAllUserDatabases, getUserBackupsPath } from '../../userDatabase.js';
import { mergeContacts } from '../../mergeService.js';
import { archiveContacts, unarchiveContacts } from '../../archiveService.js';
import { runICloudSync } from '../icloudSyncEngine.js';
import { BOOK, FakeICloud } from './syncFakes.js';

const USER_ID = 31;
const card = (name: string, uid: string, lines: string[] = []) => [
  'BEGIN:VCARD', 'VERSION:3.0', `N:${name.split(' ')[1] ?? ''};${name.split(' ')[0]};;;`, `FN:${name}`, `UID:${uid}`,
  ...lines, 'END:VCARD'
].join('\r\n');

/** Replaces (or adds) one property line of a card. */
const setLine = (prop: string, value: string | null) => (data: string) => {
  const lines = data.split(/\r?\n/).filter(l => !new RegExp(`^${prop}[;:]`, 'i').test(l));
  if (value !== null) lines.splice(lines.length - 1, 0, `${prop}:${value}`);
  return lines.join('\r\n');
};

describe('iCloud sync engine', () => {
  let tmpDir: string;
  let icloud: FakeICloud;
  const db = () => getUserDatabase(USER_ID);
  const sync = (extra: Partial<Parameters<typeof runICloudSync>[1]> = {}) =>
    runICloudSync(USER_ID, { trigger: 'manual', remote: icloud, fullScan: true, ...extra });

  function addContact(first: string, last: string, extra: { title?: string; email?: string } = {}): number {
    const id = db().prepare('INSERT INTO contacts (first_name, last_name, display_name, title) VALUES (?, ?, ?, ?)')
      .run(first, last, `${first} ${last}`, extra.title ?? null).lastInsertRowid as number;
    if (extra.email) db().prepare('INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, 1)').run(id, extra.email, 'home');
    return id;
  }
  const uidOf = (id: number) => (db().prepare('SELECT icloud_uid FROM contacts WHERE id = ?').get(id) as { icloud_uid: string }).icloud_uid;
  const contact = (id: number) => db().prepare('SELECT * FROM contacts WHERE id = ?').get(id) as Record<string, unknown>;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-icloud-sync-'));
    process.env.USER_DATA_PATH = tmpDir;
  });
  afterAll(() => {
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  beforeEach(() => {
    db().exec(`
      DELETE FROM contacts; DELETE FROM contact_sync_links; DELETE FROM sync_tombstones;
      DELETE FROM sync_runs; DELETE FROM sync_remote_versions;
      UPDATE sync_providers SET enabled = 1, paused = 0, ctag = NULL, last_error = NULL,
        cutover_completed_at = datetime('now'), lock_holder = NULL, lock_until = NULL WHERE provider = 'icloud';
    `);
    icloud = new FakeICloud();
  });

  it('does nothing before the account has been switched over', async () => {
    db().exec("UPDATE sync_providers SET cutover_completed_at = NULL WHERE provider = 'icloud'");
    const result = await sync();
    expect(result.status).toBe('skipped');
    expect(icloud.writes).toEqual({ create: 0, update: 0, delete: 0 });
  });

  it('creates a card per contact, then a second run changes nothing', async () => {
    const ada = addContact('Ada', 'Lovelace', { title: 'Analyst', email: 'ada@example.com' });
    addContact('Alan', 'Turing');

    const first = await sync();
    expect(first.status).toBe('completed');
    expect(first.counters.pushedCreated).toBe(2);
    expect(icloud.cardOf(uidOf(ada))).toContain('TITLE:Analyst');
    expect(icloud.cardOf(uidOf(ada))).toContain(`UID:${uidOf(ada)}`);

    const second = await sync();
    expect(second.counters).toEqual({ pulledCreated: 0, pulledUpdated: 0, pulledArchived: 0, pushedCreated: 0, pushedUpdated: 0, pushedDeleted: 0, conflicts: 0 });
    expect(icloud.writes).toEqual({ create: 2, update: 0, delete: 0 });
  });

  it('is not fooled by iCloud rewriting the cards it stores', async () => {
    icloud.rewrite = data => data
      .replace('END:VCARD', 'X-ADDRESSING-GRAMMAR:abc\r\nEND:VCARD')
      .replace(/EMAIL;TYPE=HOME/i, 'EMAIL;TYPE=INTERNET;TYPE=HOME');
    addContact('Ada', 'Lovelace', { email: 'ada@example.com' });
    await sync();
    const second = await sync();
    expect(second.counters.pushedUpdated + second.counters.pulledUpdated).toBe(0);
  });

  it('brings a phone edit into Yello, and stays in sync afterwards', async () => {
    const ada = addContact('Ada', 'Lovelace', { title: 'Analyst' });
    await sync();
    icloud.phoneEdit(icloud.urlOf(uidOf(ada)), setLine('TITLE', 'Lead Analyst'));

    const result = await sync();
    expect(result.counters.pulledUpdated).toBe(1);
    expect(contact(ada).title).toBe('Lead Analyst');
    expect(icloud.writes.update).toBe(0);

    const again = await sync();
    expect(again.counters.pulledUpdated + again.counters.pushedUpdated).toBe(0);
  });

  it('keeps both sides’ edits when they touch different fields', async () => {
    const ada = addContact('Ada', 'Lovelace', { title: 'Analyst', email: 'ada@example.com' });
    await sync();
    icloud.phoneEdit(icloud.urlOf(uidOf(ada)), setLine('TITLE', 'Lead Analyst'));
    db().prepare("UPDATE contact_emails SET email = 'ada@new.example' WHERE contact_id = ?").run(ada);

    await sync();
    expect(contact(ada).title).toBe('Lead Analyst');
    expect(icloud.cardOf(uidOf(ada))).toContain('ada@new.example');
    expect(icloud.cardOf(uidOf(ada))).toContain('TITLE:Lead Analyst');
  });

  it('Yello wins a field both sides changed, and keeps iCloud’s version', async () => {
    const ada = addContact('Ada', 'Lovelace', { title: 'Analyst' });
    await sync();
    icloud.phoneEdit(icloud.urlOf(uidOf(ada)), setLine('TITLE', 'Phone Title'));
    db().prepare("UPDATE contacts SET title = 'Yello Title' WHERE id = ?").run(ada);

    const result = await sync();
    expect(result.counters.conflicts).toBe(1);
    expect(contact(ada).title).toBe('Yello Title');
    expect(icloud.cardOf(uidOf(ada))).toContain('TITLE:Yello Title');
    const versions = db().prepare('SELECT reason, payload FROM sync_remote_versions').all() as Array<{ reason: string; payload: string }>;
    expect(versions.map(v => v.reason)).toEqual(['conflict_yello_won']);
    expect(versions[0].payload).toContain('TITLE:Phone Title');
  });

  it('archives a contact deleted on the phone, never hard-deletes it', async () => {
    const ada = addContact('Ada', 'Lovelace');
    await sync();
    icloud.phoneDelete(icloud.urlOf(uidOf(ada)));

    const result = await sync();
    expect(result.counters.pulledArchived).toBe(1);
    expect(contact(ada).archived_at).not.toBeNull();
    expect(db().prepare('SELECT status FROM contact_sync_links WHERE contact_id = ?').get(ada)).toEqual({ status: 'deleted' });
  });

  it('deletes the card of a contact archived in Yello, and recreates it when unarchived', async () => {
    const ada = addContact('Ada', 'Lovelace');
    await sync();
    archiveContacts(db(), [ada]);

    const archived = await sync();
    expect(archived.counters.pushedDeleted).toBe(1);
    expect(icloud.cards.has(icloud.urlOf(uidOf(ada)))).toBe(false);
    expect((db().prepare("SELECT COUNT(*) AS n FROM sync_remote_versions WHERE reason = 'remote_delete'").get() as { n: number }).n).toBe(1);

    unarchiveContacts(db(), [ada]);
    const restored = await sync();
    expect(restored.counters.pushedCreated).toBe(1);
    expect(icloud.cards.has(icloud.urlOf(uidOf(ada)))).toBe(true);
  });

  it('imports a card added on the phone, with its UID', async () => {
    addContact('Ada', 'Lovelace');
    await sync();
    icloud.phoneAdd('NEW-1.vcf', card('Nina New', 'NEW-1', ['EMAIL:nina@example.com']));

    const result = await sync();
    expect(result.counters.pulledCreated).toBe(1);
    const nina = db().prepare("SELECT id, icloud_uid FROM contacts WHERE display_name = 'Nina New'").get() as { id: number; icloud_uid: string };
    expect(nina.icloud_uid).toBe('NEW-1');
    const again = await sync();
    expect(again.counters.pushedUpdated + again.counters.pulledCreated).toBe(0);
  });

  it('merges a concurrent phone edit when a push hits a 412, then pushes again', async () => {
    const ada = addContact('Ada', 'Lovelace', { title: 'Analyst', email: 'ada@example.com' });
    await sync();
    db().prepare("UPDATE contact_emails SET email = 'ada@new.example' WHERE contact_id = ?").run(ada);
    icloud.beforeNextUpdate = () => icloud.phoneEdit(icloud.urlOf(uidOf(ada)), setLine('TITLE', 'Edited Meanwhile'));

    const result = await sync();
    expect(result.status).toBe('completed');
    expect(contact(ada).title).toBe('Edited Meanwhile');
    expect(icloud.cardOf(uidOf(ada))).toContain('ada@new.example');
    expect(icloud.cardOf(uidOf(ada))).toContain('TITLE:Edited Meanwhile');
  });

  it('deletes the leftover card after a merge in Yello', async () => {
    const a = addContact('Ada', 'Lovelace');
    const b = addContact('Ada', 'L.');
    await sync();
    const bUrl = icloud.urlOf(uidOf(b));
    mergeContacts(db(), [a, b], a);

    const result = await sync();
    expect(result.counters.pushedDeleted).toBe(1);
    expect(icloud.cards.has(bUrl)).toBe(false);
    expect(icloud.cards.has(icloud.urlOf(uidOf(a)))).toBe(true);
  });

  it('pauses instead of archiving when many cards vanish at once, until confirmed', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => addContact(`P${i}`, 'Person'));
    await sync();
    for (const id of ids) icloud.phoneDelete(icloud.urlOf(uidOf(id)));

    const paused = await sync();
    expect(paused.status).toBe('paused');
    expect(paused.reason).toMatch(/25 cards disappeared/);
    expect((db().prepare('SELECT COUNT(*) AS n FROM contacts WHERE archived_at IS NOT NULL').get() as { n: number }).n).toBe(0);
    expect((await sync()).status).toBe('skipped');

    const confirmed = await sync({ confirmLargeChanges: true });
    expect(confirmed.counters.pulledArchived).toBe(25);
  });

  it('a mass delete from Yello needs confirming and a fresh, confirmed backup', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => addContact(`P${i}`, 'Person'));
    await sync();
    archiveContacts(db(), ids);

    const paused = await sync();
    expect(paused.status).toBe('paused');
    expect(paused.reason).toMatch(/delete 25 cards/);

    const noBackup = await sync({ confirmLargeChanges: true });
    expect(noBackup.status).toBe('paused');
    expect(noBackup.reason).toMatch(/Back up your iCloud contacts/);
    expect(icloud.cards.size).toBe(25);

    const id = 'icloud-20991231T000000000Z';
    const dir = path.join(getUserBackupsPath(USER_ID), id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
      id, provider: 'icloud', status: 'verified', createdAt: new Date().toISOString(), confirmedAt: new Date().toISOString(), files: []
    }));
    const confirmed = await sync({ confirmLargeChanges: true });
    expect(confirmed.counters.pushedDeleted).toBe(25);
    expect(icloud.cards.size).toBe(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('skips a card it cannot read and syncs the rest', async () => {
    addContact('Ada', 'Lovelace');
    await sync();
    icloud.phoneAdd('broken.vcf', 'BEGIN:VCARD\r\nVERSION:3.0\r\nPHOTO;;\r\nEND:VCARD');
    icloud.phoneAdd('NEW-2.vcf', card('Nina New', 'NEW-2'));

    const result = await sync();
    expect(result.status).toBe('completed');
    expect(result.counters.pulledCreated).toBe(1);
    expect(result.errors.map(e => e.remoteId)).toEqual([new URL('broken.vcf', BOOK).href]);
  });

  it('brings in a photo added on the phone', async () => {
    const ada = addContact('Ada', 'Lovelace');
    await sync();
    icloud.phoneEdit(icloud.urlOf(uidOf(ada)), setLine('PHOTO;ENCODING=b;TYPE=JPEG', 'AAAA'));

    await sync();
    expect(contact(ada).photo_hash).toBe('photo-4');
    const again = await sync();
    expect(again.counters.pushedUpdated).toBe(0);
  });

  it('records every run', async () => {
    addContact('Ada', 'Lovelace');
    await sync();
    const runs = db().prepare('SELECT provider, trigger, status, pushed_created FROM sync_runs').all();
    expect(runs).toEqual([{ provider: 'icloud', trigger: 'manual', status: 'completed', pushed_created: 1 }]);
  });
});
