import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';

vi.mock('../../photoProcessor.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../photoProcessor.js')>()),
  processPhoto: vi.fn(async (base64: string) => `photo-${base64.length}`)
}));

import { getUserDatabase, closeAllUserDatabases, getUserPhotosPath } from '../../userDatabase.js';
import { archiveContacts, unarchiveContacts } from '../../archiveService.js';
import { runGoogleSync } from '../googleSyncEngine.js';
import { runICloudSync } from '../icloudSyncEngine.js';
import { FakeGoogle, FakeICloud } from './syncFakes.js';

const USER_ID = 41;

describe('Google sync engine', () => {
  let tmpDir: string;
  let google: FakeGoogle;
  const db = () => getUserDatabase(USER_ID);
  const sync = (extra: Partial<Parameters<typeof runGoogleSync>[1]> = {}) =>
    runGoogleSync(USER_ID, { trigger: 'manual', remote: google, ...extra });

  function addContact(first: string, last: string, extra: { title?: string; email?: string; label?: string } = {}): number {
    const id = db().prepare('INSERT INTO contacts (first_name, last_name, display_name, title) VALUES (?, ?, ?, ?)')
      .run(first, last, `${first} ${last}`, extra.title ?? null).lastInsertRowid as number;
    if (extra.email) {
      db().prepare('INSERT INTO contact_emails (contact_id, email, type, label, is_primary) VALUES (?, ?, ?, ?, 1)')
        .run(id, extra.email, 'home', extra.label ?? null);
    }
    return id;
  }
  const contact = (id: number) => db().prepare('SELECT * FROM contacts WHERE id = ?').get(id) as Record<string, unknown>;
  const nameOf = (id: number) => (db().prepare("SELECT remote_id FROM contact_sync_links WHERE provider = 'google' AND contact_id = ?").get(id) as { remote_id: string }).remote_id;
  const quiet = { pulledCreated: 0, pulledUpdated: 0, pulledArchived: 0, pushedCreated: 0, pushedUpdated: 0, pushedDeleted: 0, conflicts: 0 };

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-google-sync-'));
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
      UPDATE sync_providers SET enabled = 1, paused = 0, sync_token = NULL, ctag = NULL, last_error = NULL,
        cutover_completed_at = datetime('now'), lock_holder = NULL, lock_until = NULL;
    `);
    google = new FakeGoogle();
  });

  it('does nothing before the account has been switched over', async () => {
    db().exec("UPDATE sync_providers SET cutover_completed_at = NULL WHERE provider = 'google'");
    expect((await sync()).status).toBe('skipped');
  });

  it('creates each contact with its Yello UID and no labels, then a second run changes nothing', async () => {
    const ada = addContact('Ada', 'Lovelace', { title: 'Analyst', email: 'ada@example.com' });
    const first = await sync();
    expect(first.counters.pushedCreated).toBe(1);

    const person = google.people.get(nameOf(ada))!;
    const uid = contact(ada).icloud_uid;
    expect(person.clientData).toEqual([{ key: 'yelloUid', value: uid }]);
    expect(person.organizations?.[0]?.title).toBe('Analyst');
    expect(google.bodies.every(body => !('memberships' in body))).toBe(true);
    expect(contact(ada).google_resource_name).toBe(nameOf(ada));

    expect((await sync()).counters).toEqual(quiet);
    expect(google.calls.update).toBe(0);
  });

  it('brings a Gmail edit into Yello and stays in sync', async () => {
    const ada = addContact('Ada', 'Lovelace', { title: 'Analyst' });
    await sync();
    google.gmailEdit(nameOf(ada), p => { p.organizations = [{ title: 'Lead Analyst', metadata: { source: { type: 'CONTACT' } } }]; });

    const result = await sync();
    expect(result.counters.pulledUpdated).toBe(1);
    expect(contact(ada).title).toBe('Lead Analyst');
    expect((await sync()).counters).toEqual(quiet);
  });

  it('keeps Apple labels when Gmail changes the emails', async () => {
    const ada = addContact('Ada', 'Lovelace', { email: 'ada@example.com', label: 'Lab' });
    await sync();
    google.gmailEdit(nameOf(ada), p => {
      p.emailAddresses = [...(p.emailAddresses ?? []), { value: 'ada@second.example', type: 'work', metadata: { source: { type: 'CONTACT' } } }];
    });

    await sync();
    const emails = db().prepare('SELECT email, label FROM contact_emails WHERE contact_id = ? ORDER BY email').all(ada);
    expect(emails).toEqual([{ email: 'ada@example.com', label: 'Lab' }, { email: 'ada@second.example', label: null }]);
  });

  it('Yello wins a field both sides changed, and keeps Google’s version', async () => {
    const ada = addContact('Ada', 'Lovelace', { title: 'Analyst' });
    await sync();
    google.gmailEdit(nameOf(ada), p => { p.organizations = [{ title: 'Gmail Title', metadata: { source: { type: 'CONTACT' } } }]; });
    db().prepare("UPDATE contacts SET title = 'Yello Title' WHERE id = ?").run(ada);

    const result = await sync();
    expect(result.counters.conflicts).toBe(1);
    expect(google.people.get(nameOf(ada))!.organizations?.[0]?.title).toBe('Yello Title');
    const [version] = db().prepare('SELECT reason, payload FROM sync_remote_versions').all() as Array<{ reason: string; payload: string }>;
    expect(version.reason).toBe('conflict_yello_won');
    expect(version.payload).toContain('Gmail Title');
  });

  it('archives a contact deleted in Gmail', async () => {
    const ada = addContact('Ada', 'Lovelace');
    await sync();
    google.gmailDelete(nameOf(ada));
    expect((await sync()).counters.pulledArchived).toBe(1);
    expect(contact(ada).archived_at).not.toBeNull();
  });

  it('deletes the Google contact of a contact archived in Yello, and recreates it when unarchived', async () => {
    const ada = addContact('Ada', 'Lovelace');
    await sync();
    const original = nameOf(ada);
    archiveContacts(db(), [ada]);
    expect((await sync()).counters.pushedDeleted).toBe(1);
    expect(google.people.has(original)).toBe(false);

    unarchiveContacts(db(), [ada]);
    expect((await sync()).counters.pushedCreated).toBe(1);
    expect(google.people.has(nameOf(ada))).toBe(true);
  });

  it('imports a contact added in Gmail, ignoring the person’s public profile', async () => {
    addContact('Ada', 'Lovelace');
    await sync();
    google.gmailAdd({
      names: [
        { givenName: 'Public', familyName: 'Profile', metadata: { source: { type: 'PROFILE' } } },
        { givenName: 'Gina', familyName: 'Gmail', metadata: { source: { type: 'CONTACT' } } }
      ],
      emailAddresses: [{ value: 'gina@example.com', metadata: { source: { type: 'CONTACT' } } }]
    });

    expect((await sync()).counters.pulledCreated).toBe(1);
    const gina = db().prepare("SELECT first_name, display_name FROM contacts WHERE last_name = 'Gmail'").get();
    expect(gina).toEqual({ first_name: 'Gina', display_name: 'Gina Gmail' });
  });

  it('merges a concurrent Gmail edit when an update is stale, then pushes again', async () => {
    const ada = addContact('Ada', 'Lovelace', { title: 'Analyst', email: 'ada@example.com' });
    await sync();
    db().prepare("UPDATE contact_emails SET email = 'ada@new.example' WHERE contact_id = ?").run(ada);
    google.beforeNextUpdate = () => google.gmailEdit(nameOf(ada), p => {
      p.organizations = [{ title: 'Edited Meanwhile', metadata: { source: { type: 'CONTACT' } } }];
    });

    expect((await sync()).status).toBe('completed');
    const person = google.people.get(nameOf(ada))!;
    expect(person.emailAddresses?.map(e => e.value)).toEqual(['ada@new.example']);
    expect(person.organizations?.[0]?.title).toBe('Edited Meanwhile');
    expect(contact(ada).title).toBe('Edited Meanwhile');
  });

  it('reads everything again when the sync token has expired, without duplicating', async () => {
    addContact('Ada', 'Lovelace');
    await sync();
    google.expireTokens = true;
    const result = await sync();
    expect(result.status).toBe('completed');
    expect(result.counters).toEqual(quiet);
    expect((db().prepare('SELECT COUNT(*) AS n FROM contacts').get() as { n: number }).n).toBe(1);
  });

  it('uploads a contact photo once', async () => {
    const ada = addContact('Ada', 'Lovelace');
    const hash = 'abcdef0123456789abcdef0123456789';
    const dir = path.join(getUserPhotosPath(USER_ID), 'medium', hash.slice(0, 2));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${hash}.jpg`), Buffer.from('jpeg-bytes'));
    db().prepare('UPDATE contacts SET photo_hash = ? WHERE id = ?').run(hash, ada);

    await sync();
    expect(google.calls.photo).toBe(1);
    expect(google.people.get(nameOf(ada))!.photos).toHaveLength(1);
    expect((await sync()).counters).toEqual(quiet);
    expect(google.calls.photo).toBe(1);
  });

  it('carries an iPhone edit through Yello to Google in one round', async () => {
    const icloud = new FakeICloud();
    const ada = addContact('Ada', 'Lovelace', { title: 'Analyst' });
    await runICloudSync(USER_ID, { trigger: 'manual', remote: icloud, fullScan: true });
    await sync();

    icloud.phoneEdit(icloud.urlOf(contact(ada).icloud_uid as string), data => data.replace('TITLE:Analyst', 'TITLE:From the iPhone'));
    await runICloudSync(USER_ID, { trigger: 'manual', remote: icloud, fullScan: true });
    const result = await sync();

    expect(result.counters.pushedUpdated).toBe(1);
    expect(google.people.get(nameOf(ada))!.organizations?.[0]?.title).toBe('From the iPhone');
    // ...and nothing echoes back to iCloud.
    const echo = await runICloudSync(USER_ID, { trigger: 'manual', remote: icloud, fullScan: true });
    expect(echo.counters.pushedUpdated).toBe(0);
  });

  it('pauses when Google refuses the permission', async () => {
    addContact('Ada', 'Lovelace');
    google.createContacts = async () => { throw new (await import('../syncRuntime.js')).RemoteAuthError('Yello may not change your Google Contacts.'); };
    const result = await sync();
    expect(result.status).toBe('paused');
    expect(result.reason).toMatch(/may not change/);
  });
});
