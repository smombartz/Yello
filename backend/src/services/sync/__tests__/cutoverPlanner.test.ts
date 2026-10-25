import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { getUserDatabase, closeAllUserDatabases, getUserBackupsPath } from '../../userDatabase.js';
import { insertParsedContact, prepareContactStatements } from '../../contactPersistence.js';
import { parseSingleVcard } from '../../vcardParser.js';
import { computeCutoverPlan, getLatestCutover, listCutoverItems, parseRev, startCutoverPlan, type CutoverItem } from '../cutoverPlanner.js';
import type { BackupManifest } from '../remoteBackupService.js';

const USER_ID = 21;
const NOW = new Date('2026-10-25T12:00:00Z');
const RECENT = '20261001T100000Z'; // inside a 90-day window
const OLD = '20250101T100000Z';    // outside it

function card(name: string, uid: string, lines: string[] = [], rev: string | null = OLD): string {
  const [first, last] = name.split(' ');
  return [
    'BEGIN:VCARD', 'VERSION:3.0', `N:${last ?? ''};${first};;;`, `FN:${name}`, `UID:${uid}`,
    ...lines, ...(rev ? [`REV:${rev}`] : []), 'END:VCARD'
  ].join('\r\n');
}

describe('cutoverPlanner', () => {
  let tmpDir: string;
  const ids: Record<string, number> = {};

  function insertYello(raw: string): number {
    const db = getUserDatabase(USER_ID);
    const stmts = prepareContactStatements(db);
    return db.transaction(() => insertParsedContact(stmts, db, parseSingleVcard(raw)!, { skipExistingUid: false }))()!.contactId;
  }

  function writeBackup(provider: 'icloud' | 'google', files: Record<string, string>, remoteCount: number): void {
    const id = `${provider}-20261025T110000000Z`;
    const dir = path.join(getUserBackupsPath(USER_ID), id);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
    const manifest: BackupManifest = {
      id, provider, account: 'me', createdAt: '2026-10-25T11:00:00.000Z', finishedAt: '2026-10-25T11:00:05.000Z',
      status: 'verified', remoteCount, vcfCardCount: remoteCount, groupCount: 0, photosIncluded: 0, parseErrors: 0,
      files: [], error: null, confirmedAt: null
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  }

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-cutover-planner-'));
    process.env.USER_DATA_PATH = tmpDir;

    // What Yello imported originally (the baseline archive).
    const original = {
      ada: card('Ada Lovelace', 'A', ['TITLE:Analyst', 'EMAIL;TYPE=HOME:ada@example.com']),
      bob: card('Bob Ross', 'B', ['EMAIL:bob@example.com']),
      bob2: card('Bobby Ross', 'B2', ['EMAIL:bob@example.com', 'TEL:+15550001']),
      cleo: card('Cleo Patra', 'C', ['TITLE:Queen', 'EMAIL:cleo@example.com']),
      dora: card('Dora Explorer', 'D', ['TITLE:Explorer', 'EMAIL:dora@example.com']),
      emil: card('Emil Zola', 'E', ['TITLE:Writer', 'EMAIL:emil@example.com']),
      removed: card('Rita Removed', 'R', ['EMAIL:rita@example.com']),
      zed: card('Zed Archived', 'Z', ['EMAIL:zed@example.com'])
    };

    // Yello after the user's cleanup.
    ids.ada = insertYello(original.ada);
    ids.bob = insertYello(original.bob);   // B2 was merged into B (before identities were recorded)
    ids.cleo = insertYello(original.cleo);
    ids.dora = insertYello(card('Dora Explorer', 'D', ['TITLE:Navigator', 'EMAIL:dora@example.com']));
    ids.emil = insertYello(card('Emil Zola', 'E', ['TITLE:Novelist', 'EMAIL:emil@example.com']));
    ids.zed = insertYello(original.zed);
    ids.yonly = insertYello(card('Yara Yello', 'Y', ['EMAIL:yara@example.com']));
    ids.group = insertYello(card('Old Group', 'G0', ['X-ADDRESSBOOKSERVER-KIND:group']));
    const db = getUserDatabase(USER_ID);
    db.prepare("UPDATE contacts SET archived_at = '2026-06-01 00:00:00' WHERE id = ?").run(ids.zed);

    const archiveDir = path.join(tmpDir, String(USER_ID), 'archive');
    fs.mkdirSync(archiveDir, { recursive: true });
    const archived = Object.entries(original).map(([key, raw], i) =>
      raw.replace('BEGIN:VCARD\r\n', `BEGIN:VCARD\r\nX-YELLO-CONTACT-ID:${ids[key] ?? 900 + i}\r\n`));
    fs.writeFileSync(path.join(archiveDir, 'original-cards-2026-09-27.vcf.gz'), zlib.gzipSync(archived.join('\r\n')));

    // iCloud today: uncleaned, with recent phone edits.
    const icloudCards = [
      card('Ada Lovelace', 'A', ['TITLE:Lead Analyst', 'EMAIL;TYPE=HOME:ada@example.com'], RECENT), // only iCloud changed
      card('Bob Ross', 'B', ['EMAIL:bob@example.com'], OLD),
      card('Bobby Ross', 'B2', ['EMAIL:bob@example.com', 'TEL:+15550001', 'TEL:+15550002'], RECENT), // duplicate, new phone
      card('Cleo Patra', 'C', ['TITLE:Pharaoh', 'EMAIL:cleo@example.com'], OLD), // changed, but long ago
      card('Dora Explorer', 'D', ['TITLE:Captain', 'EMAIL:dora@example.com'], RECENT), // both changed
      card('Emil Zola', 'E', ['TITLE:Writer', 'EMAIL:emil@example.com'], RECENT), // only Yello changed
      card('Rita Removed', 'R', ['EMAIL:rita@example.com'], OLD), // removed in cleanup
      card('Nina New', 'N', ['EMAIL:nina@example.com'], RECENT), // new on the phone
      card('Otto Old', 'O', ['EMAIL:otto@example.com'], OLD), // old clutter never imported
      card('Zed Archived', 'Z', ['EMAIL:zed@example.com'], OLD),
      card('Family', 'GRP', ['X-ADDRESSBOOKSERVER-KIND:group'], OLD),
      // A card the parser rejects (a bare `PHOTO;;`, as some apps write).
      ['BEGIN:VCARD', 'VERSION:3.0', 'N:Card;Broken;;;', 'FN:Broken Card', 'UID:BRK', 'PHOTO;;', 'END:VCARD'].join('\r\n')
    ];
    writeBackup('icloud', {
      'icloud-contacts.vcf': icloudCards.join('\r\n'),
      'icloud-index.json': JSON.stringify(icloudCards.map((c, i) => ({
        addressBook: 'card', url: `https://contacts.icloud.com/1/card/${i}.vcf`, etag: `"${i}"`,
        uid: c.match(/UID:(.*)/)![1].trim(), group: c.includes('KIND:group')
      })))
    }, 11);

    const source = (updateTime: string) => ({ sources: [{ type: 'CONTACT', updateTime }] });
    writeBackup('google', {
      'google-people.json': JSON.stringify({
        contactGroups: [],
        people: [
          { resourceName: 'people/c1', metadata: source('2025-02-01T00:00:00Z'), names: [{ givenName: 'Ada', familyName: 'Lovelace' }], emailAddresses: [{ value: 'ada@example.com' }] },
          { resourceName: 'people/c2', metadata: source('2025-02-01T00:00:00Z'), names: [{ givenName: 'Gary', familyName: 'Gone' }], emailAddresses: [{ value: 'gary@example.com' }] },
          { resourceName: 'people/c3', metadata: source('2026-10-20T00:00:00Z'), names: [{ givenName: 'Gina', familyName: 'Gmail' }], emailAddresses: [{ value: 'gina@example.com' }] },
          { resourceName: 'people/c4', metadata: source('2026-10-20T00:00:00Z'), names: [{ givenName: 'Yara', familyName: 'Yello' }], emailAddresses: [{ value: 'yara@example.com' }, { value: 'yara@work.example' }] }
        ]
      })
    }, 4);
  });

  afterAll(() => {
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const of = (items: CutoverItem[], provider: string | null, kind: string) =>
    items.filter(i => i.provider === provider && i.kind === kind).map(i => i.displayName).sort();

  it('classifies every iCloud card against the cleaned Yello list', async () => {
    const { summary, items } = await computeCutoverPlan(USER_ID, { windowDays: 90, now: NOW });
    const s = summary.providers.icloud;

    expect(s.remoteCards).toBe(11);
    expect(s.groups).toBe(1);
    expect(s.unreadable).toHaveLength(1);
    expect(s.unreadable[0]).toMatchObject({ name: 'Broken Card', uid: 'BRK', remoteId: 'https://contacts.icloud.com/1/card/11.vcf' });
    expect(s.unreadable[0].error).toMatch(/PHOTO/);
    expect(s.unreadable[0].card).toContain('FN:Broken Card');
    expect(s.unreadable[0].card).not.toMatch(/^PHOTO/m);
    expect(of(items, 'icloud', 'link')).toEqual(['Ada Lovelace', 'Bob Ross', 'Cleo Patra', 'Dora Explorer', 'Emil Zola']);
    expect(of(items, 'icloud', 'merged_duplicate')).toEqual(['Bobby Ross']);
    expect(of(items, 'icloud', 'import')).toEqual(['Nina New']);
    expect(items.filter(i => i.provider === 'icloud' && i.kind === 'delete_remote').map(i => [i.displayName, i.reason]).sort())
      .toEqual([['Otto Old', 'old_remote_only'], ['Rita Removed', 'removed_in_cleanup'], ['Zed Archived', 'archived_in_yello']]);
    expect(of(items, 'icloud', 'create_remote')).toEqual(['Yara Yello']);

    // Ada: only iCloud changed the title, within the window → taken.
    const ada = items.find(i => i.kind === 'update' && i.displayName === 'Ada Lovelace')!;
    expect([ada.field, ada.reason, (ada.remoteValue as { title: string }).title]).toEqual(['org', 'changed_remotely', 'Lead Analyst']);
    // The duplicate's new phone comes in, its other data does not.
    const bob2 = items.filter(i => i.kind === 'update' && i.displayName === 'Bobby Ross');
    expect(bob2.map(i => [i.field, i.remoteValue])).toEqual([['phones', [{ value: '+15550002', type: null }]]]);
    // Cleo's iCloud edit is older than the window; Emil was changed only in Yello.
    expect(items.some(i => i.kind === 'update' && ['Cleo Patra', 'Emil Zola'].includes(i.displayName))).toBe(false);
    // Dora: both sides changed the title → review, suggesting the newer side.
    const dora = items.filter(i => i.kind === 'conflict');
    expect(dora.map(i => [i.displayName, i.field, i.reason])).toEqual([['Dora Explorer', 'org', 'changed_on_both_sides']]);

    expect(s.deletes).toEqual({ mergedDuplicates: 1, removedInCleanup: 1, oldRemoteOnly: 1, archivedInYello: 1, total: 4 });
    expect(s.updates).toEqual({ contacts: 2, fields: 2 });
    // Cleo (old iCloud edit), Emil (Yello edit) and Dora (conflict, Yello's
    // value until resolved) get Yello's version pushed.
    expect(s.pushUpdates).toBe(3);
  });

  it('plans Google the same way, without a baseline', async () => {
    const { summary, items } = await computeCutoverPlan(USER_ID, { windowDays: 90, now: NOW });
    expect(of(items, 'google', 'link')).toEqual(['Ada Lovelace', 'Yara Yello']);
    expect(of(items, 'google', 'import')).toEqual(['Gina Gmail']);
    expect(of(items, 'google', 'delete_remote')).toEqual(['Gary Gone']);
    // Yara's recent Google edit adds an email.
    const yara = items.find(i => i.provider === 'google' && i.kind === 'update')!;
    expect([yara.displayName, yara.field, yara.remoteValue]).toEqual(['Yara Yello', 'emails', [{ value: 'yara@work.example', type: null }]]);
    expect(summary.providers.google.creates).toBe(4); // Bob, Cleo, Dora, Emil
  });

  it('lists Apple group cards imported as contacts, and never creates them remotely', async () => {
    const { summary, items } = await computeCutoverPlan(USER_ID, { windowDays: 90, now: NOW });
    expect(of(items, null, 'group_card')).toEqual(['Old Group']);
    expect(summary.yello.groupCards).toBe(1);
    expect(items.some(i => i.kind === 'create_remote' && i.displayName === 'Old Group')).toBe(false);
  });

  it('a wider window brings in older remote edits', async () => {
    const { items } = await computeCutoverPlan(USER_ID, { windowDays: 3650, now: NOW });
    expect(items.some(i => i.kind === 'update' && i.displayName === 'Cleo Patra')).toBe(true);
    expect(items.some(i => i.kind === 'import' && i.displayName === 'Otto Old')).toBe(true);
  });

  it('changes nothing in Yello, and stores the plan for review', async () => {
    const db = getUserDatabase(USER_ID);
    const before = db.prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS u FROM contacts').get();

    const { id, promise } = startCutoverPlan(USER_ID, 90);
    await promise;
    const latest = getLatestCutover(USER_ID)!;
    expect(latest.id).toBe(id);
    expect(latest.status).toBe('planned');
    expect(latest.summary!.providers.icloud.deletes.total).toBe(4);
    expect(listCutoverItems(USER_ID, id, { kind: 'delete_remote', provider: 'icloud' }).total).toBe(3);

    expect(db.prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS u FROM contacts').get()).toEqual(before);
  });

  it('parses vCard REV timestamps', () => {
    expect(parseRev('20261024T101500Z')).toBe('2026-10-24T10:15:00.000Z');
    expect(parseRev('2026-10-24T10:15:00Z')).toBe('2026-10-24T10:15:00.000Z');
    expect(parseRev('2026-10-24')).toBe('2026-10-24T00:00:00.000Z');
    expect(parseRev('garbage')).toBeNull();
  });
});
