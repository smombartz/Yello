import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';

vi.mock('../../photoProcessor.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../photoProcessor.js')>()),
  processPhoto: vi.fn(async (base64: string) => `photo-${base64.length}`)
}));

import { getUserDatabase, closeAllUserDatabases } from '../../userDatabase.js';
import { unfoldLines } from '../../vcardParser.js';
import { activeProviders, isContactEdit, runAllSyncs, runScheduledRound } from '../syncScheduler.js';
import { listRemoteVersions, restoreRemoteVersion, RemoteVersionError } from '../remoteVersions.js';
import { FakeGoogle, FakeICloud } from './syncFakes.js';

const USER_ID = 61;
const quietLog = { info: () => {}, error: () => {} };

describe('sync scheduling and remote versions', () => {
  let tmpDir: string;
  let icloud: FakeICloud;
  let google: FakeGoogle;
  const db = () => getUserDatabase(USER_ID);
  const remotes = () => ({ icloud, google });
  const contact = (id: number) => db().prepare('SELECT * FROM contacts WHERE id = ?').get(id) as Record<string, unknown>;

  function addContact(first: string, last: string, title: string): number {
    return db().prepare('INSERT INTO contacts (first_name, last_name, display_name, title) VALUES (?, ?, ?, ?)')
      .run(first, last, `${first} ${last}`, title).lastInsertRowid as number;
  }

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-sync-scheduler-'));
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
      UPDATE sync_providers SET enabled = 1, paused = 0, sync_token = NULL, ctag = NULL, last_error = NULL, last_run_at = NULL,
        consecutive_failures = 0, cutover_completed_at = datetime('now'), lock_holder = NULL, lock_until = NULL;
    `);
    icloud = new FakeICloud();
    google = new FakeGoogle();
  });
  afterEach(() => vi.useRealTimers());

  it('knows which requests edit contacts', () => {
    expect(isContactEdit('PUT', '/api/contacts/12', 200)).toBe(true);
    expect(isContactEdit('POST', '/api/duplicates/merge', 200)).toBe(true);
    expect(isContactEdit('POST', '/api/archive/12?x=1', 204)).toBe(true);
    expect(isContactEdit('GET', '/api/contacts', 200)).toBe(false);
    expect(isContactEdit('PUT', '/api/contacts/12', 400)).toBe(false);
    expect(isContactEdit('POST', '/api/sync/run', 200)).toBe(false);
    expect(isContactEdit('POST', '/api/contactsfoo', 200)).toBe(false);
  });

  it('a scheduled round syncs iCloud then Google for every active user', async () => {
    const ada = addContact('Ada', 'Lovelace', 'Analyst');
    await runScheduledRound(quietLog, remotes());
    expect(icloud.cards.size).toBe(1);
    expect(google.people.size).toBe(1);

    // A phone edit reaches Google in the next round.
    icloud.phoneEdit(icloud.urlOf(contact(ada).icloud_uid as string), data => data.replace('TITLE:Analyst', 'TITLE:Edited on iPhone'));
    await runScheduledRound(quietLog, remotes());
    expect(contact(ada).title).toBe('Edited on iPhone');
    expect([...google.people.values()][0].organizations?.[0]?.title).toBe('Edited on iPhone');
    const triggers = db().prepare('SELECT DISTINCT trigger FROM sync_runs').all();
    expect(triggers).toEqual([{ trigger: 'scheduled' }]);
  });

  it('leaves paused and switched-off providers alone', async () => {
    db().exec("UPDATE sync_providers SET paused = 1 WHERE provider = 'icloud'; UPDATE sync_providers SET enabled = 0 WHERE provider = 'google'");
    addContact('Ada', 'Lovelace', 'Analyst');
    expect(activeProviders(USER_ID)).toEqual([]);
    await runScheduledRound(quietLog, remotes());
    expect(icloud.cards.size + google.people.size).toBe(0);
  });

  it('leaves a user alone while their switch to Yello is unfinished', async () => {
    addContact('Ada', 'Lovelace', 'Analyst');
    db().prepare("INSERT INTO sync_cutovers (id, status, window_days) VALUES ('cutover-x', 'pushing', 90)").run();
    expect(activeProviders(USER_ID)).toEqual([]);
    await runScheduledRound(quietLog, remotes());
    expect(icloud.cards.size + google.people.size).toBe(0);
    db().exec("DELETE FROM sync_cutovers");
  });

  it('tries a failing provider less often', async () => {
    addContact('Ada', 'Lovelace', 'Analyst');
    db().exec(`UPDATE sync_providers SET consecutive_failures = 3, last_run_at = '${new Date().toISOString()}' WHERE provider = 'icloud'`);
    await runScheduledRound(quietLog, remotes());
    expect(icloud.cards.size).toBe(0); // waits
    expect(google.people.size).toBe(1); // Google is fine and goes ahead
  });

  it('runAllSyncs runs both, iCloud first', async () => {
    addContact('Ada', 'Lovelace', 'Analyst');
    const results = await runAllSyncs(USER_ID, 'manual', { remotes: remotes() });
    expect(Object.keys(results)).toEqual(['icloud', 'google']);
    expect(results.icloud!.counters.pushedCreated).toBe(1);
    expect(results.google!.counters.pushedCreated).toBe(1);
  });

  it('lists the versions sync overwrote and restores one', async () => {
    const ada = addContact('Ada', 'Lovelace', 'Analyst');
    await runAllSyncs(USER_ID, 'manual', { remotes: remotes() });
    // Both sides change the title: Yello wins, iCloud's version is kept.
    icloud.phoneEdit(icloud.urlOf(contact(ada).icloud_uid as string), data => data.replace('TITLE:Analyst', 'TITLE:Phone Title'));
    db().prepare("UPDATE contacts SET title = 'Yello Title' WHERE id = ?").run(ada);
    await runAllSyncs(USER_ID, 'manual', { remotes: remotes() });

    const versions = listRemoteVersions(USER_ID, ada);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ provider: 'icloud', reason: 'conflict_yello_won', restorable: true, restoredAt: null });
    expect(versions[0].preview!.lines).toContain('Phone Title');

    restoreRemoteVersion(USER_ID, versions[0].id);
    expect(contact(ada).title).toBe('Phone Title');
    expect(listRemoteVersions(USER_ID, ada)[0].restoredAt).not.toBeNull();

    // The restored version goes out to both books on the next sync.
    await runAllSyncs(USER_ID, 'manual', { remotes: remotes() });
    expect(unfoldLines(icloud.cards.get(icloud.urlOf(contact(ada).icloud_uid as string))!.data)).toContain('TITLE:Phone Title');
    expect([...google.people.values()][0].organizations?.[0]?.title).toBe('Phone Title');
  });

  it('restoring a deleted contact’s last version brings it back', async () => {
    const ada = addContact('Ada', 'Lovelace', 'Analyst');
    await runAllSyncs(USER_ID, 'manual', { remotes: remotes() });
    db().prepare("UPDATE contacts SET archived_at = datetime('now') WHERE id = ?").run(ada);
    await runAllSyncs(USER_ID, 'manual', { remotes: remotes() });
    expect(icloud.cards.size + google.people.size).toBe(0);

    const google_version = listRemoteVersions(USER_ID, ada).find(v => v.provider === 'google' && v.reason === 'remote_delete')!;
    expect(google_version.restorable).toBe(true);
    restoreRemoteVersion(USER_ID, google_version.id);
    expect(contact(ada).archived_at).toBeNull();
    await runAllSyncs(USER_ID, 'manual', { remotes: remotes() });
    expect(icloud.cards.size).toBe(1);
    expect(google.people.size).toBe(1);
  });

  it('refuses entries that hold only a summary', () => {
    const ada = addContact('Ada', 'Lovelace', 'Analyst');
    db().prepare(`INSERT INTO sync_remote_versions (contact_id, provider, remote_id, reason, payload) VALUES (?, 'icloud', 'x', 'cutover_conflict', '{"field":"org"}')`).run(ada);
    const [version] = listRemoteVersions(USER_ID, ada);
    expect(version.restorable).toBe(false);
    expect(() => restoreRemoteVersion(USER_ID, version.id)).toThrow(RemoteVersionError);
  });
});
