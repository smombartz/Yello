import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { getUserDatabase, closeAllUserDatabases, closeUserDatabase } from '../../userDatabase.js';
import { mergeContacts } from '../../mergeService.js';
import { deleteArchivedContacts } from '../../archiveService.js';
import { isSyncEnabled } from '../syncState.js';
import contactsRoutes from '../../../routes/contacts.js';

const USER_ID = 1;
const UID_PATTERN = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/;

describe('sync schema', () => {
  let tmpDir: string;
  const db = () => getUserDatabase(USER_ID);

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-sync-schema-'));
    process.env.USER_DATA_PATH = tmpDir;
  });

  afterAll(() => {
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    db().exec(`
      DELETE FROM contacts; DELETE FROM sync_tombstones; DELETE FROM contact_sync_links;
      UPDATE sync_providers SET enabled = 0;
    `);
  });

  function add(name: string): number {
    return db().prepare('INSERT INTO contacts (display_name) VALUES (?)').run(name).lastInsertRowid as number;
  }

  function link(contactId: number, provider: 'icloud' | 'google', remoteId: string): void {
    db().prepare('INSERT INTO contact_sync_links (contact_id, provider, remote_id, etag) VALUES (?, ?, ?, ?)')
      .run(contactId, provider, remoteId, '"e"');
  }

  it('gives every new contact a UID unless it brings its own', () => {
    const id = add('Ada');
    const uid = (db().prepare('SELECT icloud_uid FROM contacts WHERE id = ?').get(id) as { icloud_uid: string }).icloud_uid;
    expect(uid).toMatch(UID_PATTERN);

    const own = db().prepare("INSERT INTO contacts (display_name, icloud_uid) VALUES ('Bob', 'MY-UID')").run().lastInsertRowid;
    expect(db().prepare('SELECT icloud_uid FROM contacts WHERE id = ?').get(own)).toEqual({ icloud_uid: 'MY-UID' });
  });

  it('backfills a UID on contacts that have none, once', () => {
    const id = add('Legacy');
    db().prepare('UPDATE contacts SET icloud_uid = NULL WHERE id = ?').run(id);
    db().exec('UPDATE user_settings SET contact_uids_backfilled_at = NULL');
    closeUserDatabase(USER_ID);
    expect((db().prepare('SELECT icloud_uid FROM contacts WHERE id = ?').get(id) as { icloud_uid: string }).icloud_uid)
      .toMatch(UID_PATTERN);
  });

  it('keeps search working when a UID is assigned on insert', () => {
    add('Searchable Person');
    const hits = db().prepare("SELECT rowid FROM contacts_fts WHERE contacts_fts MATCH 'Searchable'").all();
    expect(hits).toHaveLength(1);
    db().prepare("UPDATE contacts SET display_name = 'Renamed Person' WHERE display_name = 'Searchable Person'").run();
    expect(db().prepare("SELECT rowid FROM contacts_fts WHERE contacts_fts MATCH 'Renamed'").all()).toHaveLength(1);
    expect(db().prepare("SELECT rowid FROM contacts_fts WHERE contacts_fts MATCH 'Searchable'").all()).toHaveLength(0);
    expect(db().pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  });

  it('leaves a tombstone for every remote card of a hard-deleted contact', () => {
    const id = add('Gone');
    link(id, 'icloud', 'https://icloud/card/1.vcf');
    link(id, 'google', 'people/c1');
    db().prepare("UPDATE contacts SET archived_at = datetime('now') WHERE id = ?").run(id);

    deleteArchivedContacts(db(), [id]);

    const tombstones = db().prepare('SELECT provider, remote_id, display_name FROM sync_tombstones ORDER BY provider').all();
    expect(tombstones).toEqual([
      { provider: 'google', remote_id: 'people/c1', display_name: 'Gone' },
      { provider: 'icloud', remote_id: 'https://icloud/card/1.vcf', display_name: 'Gone' }
    ]);
    expect(db().prepare('SELECT COUNT(*) AS n FROM contact_sync_links').get()).toEqual({ n: 0 });
  });

  it('a merge moves a duplicate’s card link to the survivor, or tombstones it', () => {
    const primary = add('Primary');
    const second = add('Second');
    link(primary, 'icloud', 'icloud-primary');
    link(second, 'icloud', 'icloud-second');
    link(second, 'google', 'people/second');

    mergeContacts(db(), [primary, second], primary);

    const links = db().prepare('SELECT contact_id, provider, remote_id FROM contact_sync_links ORDER BY provider').all();
    expect(links).toEqual([
      { contact_id: primary, provider: 'google', remote_id: 'people/second' },
      { contact_id: primary, provider: 'icloud', remote_id: 'icloud-primary' }
    ]);
    expect(db().prepare('SELECT provider, remote_id FROM sync_tombstones').all())
      .toEqual([{ provider: 'icloud', remote_id: 'icloud-second' }]);
  });

  it('refuses to delete all contacts while sync is on', async () => {
    const app = Fastify();
    app.addHook('onRequest', async request => {
      request.user = {
        id: USER_ID, googleId: 'g', email: 't@t', name: 'T', avatarUrl: null, isDemo: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
    });
    await app.register(contactsRoutes, { prefix: '/api/contacts' });
    await app.ready();

    add('Keep me');
    db().prepare("UPDATE sync_providers SET enabled = 1 WHERE provider = 'icloud'").run();
    expect(isSyncEnabled(db())).toBe(true);
    const blocked = await app.inject({ method: 'DELETE', url: '/api/contacts/all' });
    expect(blocked.statusCode).toBe(409);
    expect(db().prepare('SELECT COUNT(*) AS n FROM contacts').get()).toEqual({ n: 1 });

    db().prepare('UPDATE sync_providers SET enabled = 0').run();
    const allowed = await app.inject({ method: 'DELETE', url: '/api/contacts/all' });
    expect(allowed.json()).toEqual({ deletedCount: 1 });
    await app.close();
  });
});
