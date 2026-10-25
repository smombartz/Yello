import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

vi.mock('../../photoProcessor.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../photoProcessor.js')>()),
  processPhoto: vi.fn(async (base64: string) => `photo-${base64.length}`)
}));

import { getUserDatabase, closeAllUserDatabases, getUserBackupsPath } from '../../userDatabase.js';
import { insertParsedContact, prepareContactStatements } from '../../contactPersistence.js';
import { parseSingleVcard, unfoldLines } from '../../vcardParser.js';
import { getLatestCutover, listCutoverItems, startCutoverPlan } from '../cutoverPlanner.js';
import { computeCutoverTally, CutoverError, resolveAllCutoverItems, resolveCutoverItems, startCutoverApply } from '../cutoverApply.js';
import { runICloudSync } from '../icloudSyncEngine.js';
import { runGoogleSync } from '../googleSyncEngine.js';
import { startRestore } from '../remoteRestore.js';
import { BOOK, FakeGoogle, FakeICloud } from './syncFakes.js';

const USER_ID = 51;
const rev = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const RECENT = rev(10);
const OLD = '20250101T100000Z';

function card(name: string, uid: string, lines: string[] = [], at: string | null = OLD): string {
  const [first, last] = name.split(' ');
  return ['BEGIN:VCARD', 'VERSION:3.0', `N:${last ?? ''};${first};;;`, `FN:${name}`, `UID:${uid}`, ...lines, ...(at ? [`REV:${at}`] : []), 'END:VCARD'].join('\r\n');
}

describe('cutover apply', () => {
  let tmpDir: string;
  let icloud: FakeICloud;
  let google: FakeGoogle;
  const ids: Record<string, number> = {};
  const db = () => getUserDatabase(USER_ID);
  const contact = (id: number) => db().prepare('SELECT * FROM contacts WHERE id = ?').get(id) as Record<string, unknown>;
  const remotes = () => ({ icloud, google });

  function insertYello(raw: string): number {
    const stmts = prepareContactStatements(db());
    return db().transaction(() => insertParsedContact(stmts, db(), parseSingleVcard(raw)!, { skipExistingUid: false }))()!.contactId;
  }

  function writeBackup(provider: 'icloud' | 'google', files: Record<string, string>, count: number, confirmed = true): void {
    const id = `${provider}-${new Date().toISOString().replace(/[-:]/g, '').replace('.', '')}`;
    const dir = path.join(getUserBackupsPath(USER_ID), id);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
      id, provider, account: 'me', createdAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      status: 'verified', remoteCount: count, vcfCardCount: count, groupCount: 0, photosIncluded: 0, parseErrors: 0,
      files: [], error: null, confirmedAt: confirmed ? new Date().toISOString() : null
    }));
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-cutover-apply-'));
    process.env.USER_DATA_PATH = tmpDir;
    icloud = new FakeICloud();
    google = new FakeGoogle();

    const original = {
      ada: card('Ada Lovelace', 'A', ['TITLE:Analyst', 'EMAIL;TYPE=HOME:ada@example.com']),
      bob: card('Bob Ross', 'B', ['EMAIL:bob@example.com']),
      bob2: card('Bobby Ross', 'B2', ['EMAIL:bob@example.com', 'TEL:+15550001']),
      dora: card('Dora Explorer', 'D', ['TITLE:Explorer', 'EMAIL:dora@example.com']),
      rita: card('Rita Removed', 'R', ['EMAIL:rita@example.com']),
      zed: card('Zed Archived', 'Z', ['EMAIL:zed@example.com'])
    };
    ids.ada = insertYello(original.ada);
    ids.bob = insertYello(original.bob);
    ids.dora = insertYello(card('Dora Explorer', 'D', ['TITLE:Navigator', 'EMAIL:dora@example.com']));
    ids.zed = insertYello(original.zed);
    ids.yara = insertYello(card('Yara Yello', 'Y', ['EMAIL:yara@example.com']));
    db().prepare("UPDATE contacts SET archived_at = '2026-06-01 00:00:00' WHERE id = ?").run(ids.zed);

    const archiveDir = path.join(tmpDir, String(USER_ID), 'archive');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'original-cards-2026-09-27.vcf.gz'), zlib.gzipSync(Object.entries(original)
      .map(([key, raw], i) => raw.replace('BEGIN:VCARD\r\n', `BEGIN:VCARD\r\nX-YELLO-CONTACT-ID:${ids[key] ?? 900 + i}\r\n`)).join('\r\n')));

    // iCloud today, uncleaned.
    for (const [file, raw] of [
      ['A.vcf', card('Ada Lovelace', 'A', ['TITLE:Lead Analyst', 'EMAIL;TYPE=HOME:ada@example.com'], RECENT)],
      ['B.vcf', card('Bob Ross', 'B', ['EMAIL:bob@example.com'])],
      ['B2.vcf', card('Bobby Ross', 'B2', ['EMAIL:bob@example.com', 'TEL:+15550001', 'TEL:+15550002'], RECENT)],
      ['D.vcf', card('Dora Explorer', 'D', ['TITLE:Captain', 'EMAIL:dora@example.com'], RECENT)],
      ['R.vcf', card('Rita Removed', 'R', ['EMAIL:rita@example.com'])],
      ['N.vcf', card('Nina New', 'N', ['EMAIL:nina@example.com'], RECENT)],
      ['O.vcf', card('Otto Old', 'O', ['EMAIL:otto@example.com'])],
      ['Z.vcf', card('Zed Archived', 'Z', ['EMAIL:zed@example.com'])]
    ] as const) icloud.phoneAdd(file, raw);
    const icloudCards = [...icloud.cards];
    writeBackup('icloud', {
      'icloud-contacts.vcf': icloudCards.map(([, c]) => c.data).join('\r\n'),
      'icloud-index.json': JSON.stringify(icloudCards.map(([url, c]) => ({
        addressBook: 'card', url, etag: c.etag, uid: unfoldLines(c.data).match(/^UID:(.*)$/m)![1].trim(), group: false
      })))
    }, icloudCards.length);

    // Google today.
    const src = { source: { type: 'CONTACT' } };
    google.gmailAdd({ names: [{ givenName: 'Ada', familyName: 'Lovelace', metadata: src }], emailAddresses: [{ value: 'ada@example.com', metadata: src }] });
    google.gmailAdd({ names: [{ givenName: 'Gary', familyName: 'Gone', metadata: src }], emailAddresses: [{ value: 'gary@example.com', metadata: src }] });
    const gina = google.gmailAdd({ names: [{ givenName: 'Gina', familyName: 'Gmail', metadata: src }], emailAddresses: [{ value: 'gina@example.com', metadata: src }] });
    google.gmailEdit(gina, p => { p.metadata = { sources: [{ type: 'CONTACT', updateTime: new Date(Date.now() - 2 * 86400000).toISOString() }] }; });
    writeBackup('google', {
      'google-people.json': JSON.stringify({ people: [...google.people.values()], contactGroups: [] })
    }, google.people.size);
  });

  afterEach(() => {
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function plan(): Promise<string> {
    const { id, promise } = startCutoverPlan(USER_ID, 90);
    await promise;
    expect(getLatestCutover(USER_ID)!.status).toBe('planned');
    return id;
  }

  async function apply(id: string): Promise<void> {
    const { promise } = await startCutoverApply(USER_ID, id, remotes());
    await promise;
  }

  const icloudNames = () => [...icloud.cards.values()].map(c => unfoldLines(c.data).match(/^FN:(.*)$/m)![1].trim()).sort();
  const googleNames = () => [...google.people.values()].map(p => [p.names?.[0]?.givenName, p.names?.[0]?.familyName].filter(Boolean).join(' ')).sort();

  it('switches both address books over to the cleaned Yello list', async () => {
    const id = await plan();
    await apply(id);

    const cutover = getLatestCutover(USER_ID)!;
    expect(cutover.error).toBeNull();
    expect(cutover.status).toBe('done');

    // Yello took the remote changes inside the window...
    expect(contact(ids.ada).title).toBe('Lead Analyst');
    expect(db().prepare('SELECT phone FROM contact_phones WHERE contact_id = ? ORDER BY phone').all(ids.bob))
      .toEqual([{ phone: '+15550002' }]);
    // ...kept its own value where both sides changed (Yello's edit is the newer one)...
    expect(contact(ids.dora).title).toBe('Navigator');
    // ...and brought in the contacts new on the phone and in Gmail.
    const names = (db().prepare('SELECT display_name FROM contacts WHERE archived_at IS NULL ORDER BY display_name').all() as Array<{ display_name: string }>).map(r => r.display_name);
    expect(names).toEqual(['Ada Lovelace', 'Bob Ross', 'Dora Explorer', 'Gina Gmail', 'Nina New', 'Yara Yello']);

    // Both books now hold exactly Yello's active contacts.
    expect(icloudNames()).toEqual(names);
    expect(googleNames()).toEqual(names);
    expect(unfoldLines(icloud.cards.get(`${BOOK}D.vcf`)!.data)).toContain('TITLE:Navigator');

    // The overwritten and deleted versions are kept.
    const reasons = (db().prepare('SELECT reason, COUNT(*) AS n FROM sync_remote_versions GROUP BY reason ORDER BY reason').all() as Array<{ reason: string; n: number }>);
    expect(reasons.find(r => r.reason === 'cutover_conflict')?.n).toBe(1);
    expect(reasons.find(r => r.reason === 'remote_delete')!.n).toBeGreaterThanOrEqual(5);

    // Ongoing sync from here: nothing left to do.
    const quiet = { pulledCreated: 0, pulledUpdated: 0, pulledArchived: 0, pushedCreated: 0, pushedUpdated: 0, pushedDeleted: 0, conflicts: 0 };
    expect((await runICloudSync(USER_ID, { trigger: 'manual', remote: icloud, fullScan: true })).counters).toEqual(quiet);
    expect((await runGoogleSync(USER_ID, { trigger: 'manual', remote: google })).counters).toEqual(quiet);
  });

  it('tallies beforehand exactly what the switch then does', async () => {
    const id = await plan();
    const tally = await computeCutoverTally(USER_ID, id);
    expect(tally.yello).toEqual({ unchanged: 2, updated: 2, new: 2, deleted: 0 });
    expect(tally.providers.icloud).toEqual({ unchanged: 2, updated: 2, new: 2, deleted: 4 });
    expect(tally.providers.google).toEqual({ unchanged: 1, updated: 1, new: 4, deleted: 1 });

    // The tally changed nothing...
    expect(db().prepare('SELECT COUNT(*) AS n FROM contact_sync_links').get()).toEqual({ n: 0 });
    expect(getLatestCutover(USER_ID)!.status).toBe('planned');

    // ...and follows the choices.
    const otto = listCutoverItems(USER_ID, id, { provider: 'icloud', kind: 'delete_remote' }).items.find(i => i.displayName === 'Otto Old')!;
    resolveCutoverItems(USER_ID, id, [{ id: otto.id, resolution: 'import' }]);
    const recount = await computeCutoverTally(USER_ID, id);
    expect(recount.yello.new).toBe(3);
    expect(recount.providers.icloud!.deleted).toBe(3);

    // The real switch matches the (recounted) tally.
    await apply(id);
    const results = (getLatestCutover(USER_ID)!.summary as { apply?: { results: Record<string, { counters: Record<string, number> }> } }).apply!.results;
    expect(results.icloud.counters).toMatchObject({ pushedUpdated: 2, pushedCreated: recount.providers.icloud!.new, pushedDeleted: 3 });
    expect(results.google.counters).toMatchObject({ pushedUpdated: 1, pushedCreated: recount.providers.google!.new, pushedDeleted: 1 });
  });

  it('follows the reviewer’s choices', async () => {
    const id = await plan();
    const items = listCutoverItems(USER_ID, id, { provider: 'icloud', limit: 100 }).items;
    const otto = items.find(i => i.displayName === 'Otto Old')!;
    const dora = items.find(i => i.kind === 'conflict')!;
    const ada = items.find(i => i.kind === 'update' && i.displayName === 'Ada Lovelace')!;
    resolveCutoverItems(USER_ID, id, [
      { id: otto.id, resolution: 'import' },
      { id: dora.id, resolution: 'remote' },
      { id: ada.id, resolution: 'skip' }
    ]);
    expect(() => resolveCutoverItems(USER_ID, id, [{ id: otto.id, resolution: 'remote' }])).toThrow(CutoverError);

    await apply(id);
    expect(getLatestCutover(USER_ID)!.status).toBe('done');
    expect(icloudNames()).toContain('Otto Old');
    expect(contact(ids.dora).title).toBe('Captain');
    expect(contact(ids.ada).title).toBe('Analyst');
    expect(unfoldLines(icloud.cards.get(`${BOOK}A.vcf`)!.data)).toContain('TITLE:Analyst');
  });

  it('can set every item of a kind at once and back to the suggestions', async () => {
    const id = await plan();
    expect(resolveAllCutoverItems(USER_ID, id, { kind: 'delete_remote', provider: 'icloud' }, 'import')).toBe(3);
    expect(listCutoverItems(USER_ID, id, { kind: 'delete_remote', provider: 'icloud' }).items.every(i => i.resolution === 'import')).toBe(true);
    resolveAllCutoverItems(USER_ID, id, {}, null);
    expect(listCutoverItems(USER_ID, id, { kind: 'delete_remote', provider: 'icloud' }).items.every(i => i.resolution === null)).toBe(true);
  });

  it('refuses without a confirmed backup, and changes nothing', async () => {
    const dir = getUserBackupsPath(USER_ID);
    for (const entry of fs.readdirSync(dir)) {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, entry, 'manifest.json'), 'utf-8'));
      manifest.confirmedAt = null;
      fs.writeFileSync(path.join(dir, entry, 'manifest.json'), JSON.stringify(manifest));
    }
    const id = await plan();
    await expect(startCutoverApply(USER_ID, id, remotes())).rejects.toThrow(/Confirm that you downloaded/);
    expect(icloud.writes).toEqual({ create: 0, update: 0, delete: 0 });
    expect(db().prepare("SELECT COUNT(*) AS n FROM contact_sync_links").get()).toEqual({ n: 0 });
  });

  it('continues an unfinished first push when applied again', async () => {
    const id = await plan();
    const failing = Object.assign(Object.create(FakeICloud.prototype), icloud, {
      listCards: async () => { throw new Error('iCloud unreachable'); }
    }) as FakeICloud;
    const { promise } = await startCutoverApply(USER_ID, id, { icloud: failing, google });
    await promise;
    const halfway = getLatestCutover(USER_ID)!;
    expect(halfway.status).toBe('pushing');
    expect(halfway.error).toMatch(/iCloud unreachable/);

    await apply(id);
    expect(getLatestCutover(USER_ID)!.status).toBe('done');
    expect(icloudNames()).not.toContain('Otto Old');
  });

  it('restores the deleted cards from the backup once sync is off', async () => {
    await apply(await plan());
    expect(icloudNames()).not.toContain('Rita Removed');

    const backupId = fs.readdirSync(getUserBackupsPath(USER_ID)).find(d => d.startsWith('icloud-'))!;
    expect(() => startRestore(USER_ID, backupId, 'missing', { icloud })).toThrow(/Turn iCloud sync off/);
    db().prepare("UPDATE sync_providers SET enabled = 0 WHERE provider = 'icloud'").run();

    const result = await startRestore(USER_ID, backupId, 'missing', { icloud }).promise;
    expect(result.recreated).toBe(4); // Bobby, Rita, Otto, Zed
    expect(icloudNames()).toEqual(expect.arrayContaining(['Bobby Ross', 'Otto Old', 'Rita Removed', 'Zed Archived']));

    const all = await startRestore(USER_ID, backupId, 'all', { icloud }).promise;
    expect(all.reverted).toBeGreaterThanOrEqual(2); // Bob's and Dora's cards, as Yello rewrote them
    expect(unfoldLines(icloud.cards.get(`${BOOK}D.vcf`)!.data)).toContain('TITLE:Captain');
  });
});
