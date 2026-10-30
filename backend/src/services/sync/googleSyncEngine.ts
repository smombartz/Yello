import type { Database as DatabaseType } from 'better-sqlite3';
import { getUserDatabase } from '../userDatabase.js';
import { processPhoto } from '../photoProcessor.js';
import { contactPhotoReader, loadContactsForVcard, type LoadedContact } from '../vcardExportService.js';
import { insertParsedContact, prepareContactStatements, replaceContactFields } from '../contactPersistence.js';
import { preserveEntryAnnotations } from '../vcardModelStore.js';
import { findContactByMergedIdentity } from '../mergedIdentities.js';
import {
  contactDataToParsed, hashProjection, planFieldMerge, projectContact, type SyncField, type SyncProjection
} from './syncProjection.js';
import { contactDataToPerson, personToContactData } from './googlePersonMapper.js';
import { contactPhotoUrl, type GooglePersonRaw } from './googlePeople.js';
import { openGoogleRemote, SyncTokenExpiredError, type GoogleRemote } from './googleRemote.js';
import { assertDeletionAllowed, DeletionBlockedError } from './remoteBackupService.js';
import {
  acquireSyncLock, emptyCounters, finishRun, progressReporter, getProviderRow, logRemoteVersion, massChangeThreshold,
  MASS_CREATE_THRESHOLD, PreconditionFailedError, pruneRemoteVersions, pushError, RemoteAuthError,
  RemoteRetryLaterError, sha256, startRun, updateProvider,
  type SyncCounters, type SyncRunError, type SyncRunResult, type SyncTrigger
} from './syncRuntime.js';

/**
 * Two-way sync between Yello and the user's Google Contacts, the People API
 * counterpart of icloudSyncEngine.ts: pull what changed in Google (by sync
 * token), then push what changed in Yello. Yello wins per field family;
 * Google's version of anything it overwrites or deletes is kept in
 * sync_remote_versions.
 *
 * Google-specific: only values from the contact card itself are read (not
 * the person's public Google profile); Google labels (memberships) are never
 * written; photos are uploaded separately and at most PHOTO_PUSH_LIMIT per
 * run, the rest on later runs; the contact's Yello UID is stored as
 * clientData so a lost link can be rebuilt.
 */

const PROVIDER = 'google' as const;
const PHOTO_PUSH_LIMIT = 100;

interface LinkRow {
  id: number;
  contact_id: number;
  remote_id: string | null;
  etag: string | null;
  local_hash: string | null;
  remote_hash: string | null;
  local_snapshot: string | null;
  remote_snapshot: string | null;
  local_photo_hash: string | null;
  remote_photo_hash: string | null;
  status: 'active' | 'pending_create' | 'deleted' | 'error';
}

export interface GoogleSyncOptions {
  trigger: SyncTrigger;
  /** Overrides the live Google connection (tests). */
  remote?: GoogleRemote;
  confirmLargeChanges?: boolean;
  /** Ignore the sync token and read every contact. */
  fullScan?: boolean;
}

class PauseRun extends Error {}

interface RemotePerson {
  person: GooglePersonRaw;
  projection: SyncProjection;
  hash: string;
  /** Identity of the contact's own photo (its URL changes when the photo does). */
  photoHash: string | null;
}

function readPerson(person: GooglePersonRaw): RemotePerson {
  const projection = projectContact(personToContactData(person, { socialsFromUrls: true }), PROVIDER);
  const url = contactPhotoUrl(person);
  return { person, projection, hash: hashProjection(projection), photoHash: url ? sha256(url) : null };
}

function parseSnapshot(json: string | null): SyncProjection | null {
  return json ? JSON.parse(json) as SyncProjection : null;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/** Google holds social profiles as URLs, so taking its URLs replaces both. */
function familiesToWrite(take: SyncField[]): SyncField[] {
  return take.includes('urls') ? [...take, 'socials'] : take;
}

class GoogleSyncRun {
  readonly counters: SyncCounters = emptyCounters();
  readonly errors: SyncRunError[] = [];
  private readonly db: DatabaseType;
  private readonly stmts;
  private links: LinkRow[] = [];
  private pendingPhotos: Array<{ contactId: number; url: string }> = [];
  nextSyncToken: string | null = null;

  constructor(
    private readonly userId: number,
    private readonly runId: number,
    private readonly remote: GoogleRemote,
    private readonly options: GoogleSyncOptions
  ) {
    this.db = getUserDatabase(userId);
    this.stmts = prepareContactStatements(this.db);
    this.progress = progressReporter(this.db, runId, PROVIDER, userId, this.counters);
  }

  private readonly progress: (label?: string, planned?: number) => void;

  /** After each write to the remote: keeps the run log and server log current. */
  private reportProgress(label?: string, planned?: number): void {
    this.progress(label, planned);
  }

  private loadLinks(): void {
    this.links = this.db.prepare("SELECT * FROM contact_sync_links WHERE provider = 'google'").all() as LinkRow[];
  }

  private loadContacts(ids?: number[], withPhotos = false): Map<number, { loaded: LoadedContact; projection: SyncProjection }> {
    const loaded = loadContactsForVcard(this.db, {
      ...(ids ? { ids } : { archived: 'all' as const }),
      withoutEnrichment: true,
      ...(withPhotos ? { readPhotoBase64: contactPhotoReader(this.userId) } : {})
    });
    return new Map(loaded.map(l => [l.id, { loaded: l, projection: projectContact(l.contact, PROVIDER) }]));
  }

  private updateLink(linkId: number, values: Record<string, unknown>): void {
    const columns = Object.keys(values);
    this.db.prepare(`UPDATE contact_sync_links SET ${columns.map(c => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...columns.map(c => values[c] ?? null), linkId);
  }

  private insertLink(contactId: number, values: Record<string, unknown>): void {
    const row = { contact_id: contactId, provider: PROVIDER, ...values };
    const columns = Object.keys(row);
    this.db.prepare(`INSERT INTO contact_sync_links (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
      .run(...columns.map(c => (row as Record<string, unknown>)[c] ?? null));
    this.db.prepare('UPDATE contacts SET google_resource_name = ? WHERE id = ?').run(values.remote_id ?? null, contactId);
  }

  private guard(count: number, limit: number, message: string): void {
    if (count > limit && !this.options.confirmLargeChanges) throw new PauseRun(message);
  }

  private remoteFields(remote: RemotePerson): Record<string, unknown> {
    return {
      etag: remote.person.etag ?? null, remote_hash: remote.hash, remote_snapshot: JSON.stringify(remote.projection),
      remote_photo_hash: remote.photoHash, last_pulled_at: new Date().toISOString(), status: 'active', last_error: null
    };
  }

  // ─── Pull ─────────────────────────────────────────────────────────────────

  async pull(storedToken: string | null): Promise<void> {
    let changes;
    try {
      changes = await this.remote.listChanges(this.options.fullScan ? null : storedToken);
    } catch (error) {
      if (!(error instanceof SyncTokenExpiredError)) throw error;
      // Sync tokens last about a week; after that, read everything again.
      changes = await this.remote.listChanges(null);
    }
    this.nextSyncToken = changes.nextSyncToken;

    this.loadLinks();
    const live = this.links.filter(l => l.remote_id && (l.status === 'active' || l.status === 'error'));
    const linkByName = new Map(live.map(l => [l.remote_id!, l]));
    const known = new Set(this.links.map(l => l.remote_id).filter(Boolean));
    const tombstoned = new Set((this.db.prepare(
      "SELECT remote_id FROM sync_tombstones WHERE provider = 'google' AND remote_deleted_at IS NULL"
    ).all() as Array<{ remote_id: string }>).map(r => r.remote_id));

    const present = changes.people.filter(p => !p.metadata?.deleted);
    const deletedNames = new Set(changes.people.filter(p => p.metadata?.deleted).map(p => p.resourceName));
    if (changes.full) {
      const listed = new Set(present.map(p => p.resourceName));
      for (const link of live) if (!listed.has(link.remote_id!)) deletedNames.add(link.remote_id!);
    }

    const missing = live.filter(l => deletedNames.has(l.remote_id!));
    const changed = present
      .filter(p => linkByName.has(p.resourceName))
      .map(p => ({ link: linkByName.get(p.resourceName)!, remote: readPerson(p) }))
      .filter(({ link, remote }) => remote.person.etag !== link.etag || remote.hash !== link.remote_hash);
    const fresh = present.filter(p => !known.has(p.resourceName) && !tombstoned.has(p.resourceName));

    this.guard(missing.length, massChangeThreshold(live.length),
      `${missing.length} contacts disappeared from Google at once. Sync is paused until you confirm.`);
    this.guard(fresh.length, live.length === 0 ? Infinity : massChangeThreshold(live.length),
      `${fresh.length} new contacts appeared in Google at once. Sync is paused until you confirm.`);

    const contacts = this.loadContacts([...new Set([...changed.map(c => c.link.contact_id), ...missing.map(l => l.contact_id)])]);

    this.db.transaction(() => {
      for (const { link, remote } of changed) {
        const contact = contacts.get(link.contact_id);
        if (contact) this.mergeRemotePerson(link, remote, contact);
      }
      for (const link of missing) {
        const contact = contacts.get(link.contact_id);
        if (contact) this.handleRemoteDelete(link, contact);
      }
      for (const person of fresh) this.handleNewRemotePerson(readPerson(person));
    })();

    await this.processPulledPhotos();
  }

  private mergeRemotePerson(link: LinkRow, remote: RemotePerson, contact: { loaded: LoadedContact; projection: SyncProjection }): void {
    const photoChanged = remote.photoHash !== link.remote_photo_hash;
    if (remote.hash === link.remote_hash && !photoChanged) {
      this.updateLink(link.id, this.remoteFields(remote));
      return;
    }
    const contactId = link.contact_id;
    const payload = JSON.stringify(remote.person);
    if (contact.loaded.archivedAt) {
      logRemoteVersion(this.db, { runId: this.runId, contactId, provider: PROVIDER, remoteId: link.remote_id!, reason: 'conflict_yello_won', payload });
      this.counters.conflicts++;
      this.updateLink(link.id, this.remoteFields(remote));
      return;
    }

    const local = contact.projection;
    const { take, conflicts } = planFieldMerge(parseSnapshot(link.remote_snapshot), parseSnapshot(link.local_snapshot), local, remote.projection);

    if (take.length) {
      const incoming = contactDataToParsed(personToContactData(remote.person, { socialsFromUrls: true }));
      // Google cannot hold Apple's labels and extra types; keep them on entries whose value survived.
      const restoreAnnotations = preserveEntryAnnotations(this.db, contactId);
      replaceContactFields(this.stmts, this.db, contactId, incoming, familiesToWrite(take));
      restoreAnnotations();
      this.counters.pulledUpdated++;
    }
    if (conflicts.length) {
      logRemoteVersion(this.db, { runId: this.runId, contactId, provider: PROVIDER, remoteId: link.remote_id!, reason: 'conflict_yello_won', payload });
      this.counters.conflicts++;
    }

    if (photoChanged) {
      const url = contactPhotoUrl(remote.person);
      const localPhotoUnchanged = (contact.loaded.photoHash ?? null) === link.local_photo_hash;
      if (url && localPhotoUnchanged) this.pendingPhotos.push({ contactId, url });
    }

    const after = take.length ? this.loadContacts([contactId]).get(contactId)!.projection : local;
    const inSync = JSON.stringify(after) === JSON.stringify(remote.projection);
    this.updateLink(link.id, {
      ...this.remoteFields(remote),
      ...(inSync ? { local_hash: remote.hash, local_snapshot: JSON.stringify(after) } : {})
    });
  }

  private handleRemoteDelete(link: LinkRow, contact: { loaded: LoadedContact; projection: SyncProjection }): void {
    const contactId = link.contact_id;
    if (contact.loaded.archivedAt) {
      this.updateLink(link.id, { status: 'deleted' });
      return;
    }
    const localUnchanged = hashProjection(contact.projection) === link.local_hash;
    if (localUnchanged) {
      this.db.prepare("UPDATE contacts SET archived_at = datetime('now'), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(contactId);
      logRemoteVersion(this.db, { runId: this.runId, contactId, provider: PROVIDER, remoteId: link.remote_id!, reason: 'remote_delete', payload: link.remote_snapshot ?? '{}' });
      this.updateLink(link.id, { status: 'deleted' });
      this.counters.pulledArchived++;
    } else {
      this.updateLink(link.id, { status: 'pending_create', remote_id: null, etag: null, remote_hash: null, remote_snapshot: null });
      this.counters.conflicts++;
    }
  }

  /** A Google contact Yello has never linked: relink by Yello UID / resource name, else a new contact. */
  private handleNewRemotePerson(remote: RemotePerson): void {
    const data = personToContactData(remote.person, { socialsFromUrls: true });
    const name = remote.person.resourceName;
    const byIdentity = (data.uid
      ? (this.db.prepare('SELECT id FROM contacts WHERE icloud_uid = ? LIMIT 1').get(data.uid) as { id: number } | undefined)?.id
        ?? findContactByMergedIdentity(this.db, 'uid', data.uid)
      : null)
      ?? (this.db.prepare('SELECT id FROM contacts WHERE google_resource_name = ? LIMIT 1').get(name) as { id: number } | undefined)?.id
      ?? findContactByMergedIdentity(this.db, 'google_resource_name', name);

    if (byIdentity) {
      const existing = this.db.prepare("SELECT id, status FROM contact_sync_links WHERE provider = 'google' AND contact_id = ?").get(byIdentity) as
        { id: number; status: string } | undefined;
      if (existing?.status === 'active') {
        pushError(this.errors, { contactId: byIdentity, remoteId: name, message: 'A second Google contact belongs to a contact that already has one; left untouched' });
        return;
      }
      const values = { ...this.remoteFields(remote), remote_id: name, local_hash: null, local_snapshot: null };
      if (existing) {
        this.updateLink(existing.id, values);
        this.db.prepare('UPDATE contacts SET google_resource_name = ? WHERE id = ?').run(name, byIdentity);
      } else {
        this.insertLink(byIdentity, values);
      }
      return;
    }

    const parsed = contactDataToParsed({ ...data, uid: null });
    const inserted = insertParsedContact(this.stmts, this.db, { ...parsed, photoBase64: null }, { skipExistingUid: false, createdVia: 'google_sync' });
    if (!inserted) return;
    const contactId = inserted.contactId;
    const local = this.loadContacts([contactId]).get(contactId)!.projection;
    this.insertLink(contactId, {
      ...this.remoteFields(remote),
      remote_id: name,
      ...(JSON.stringify(local) === JSON.stringify(remote.projection) ? { local_hash: remote.hash, local_snapshot: JSON.stringify(local) } : {})
    });
    const url = contactPhotoUrl(remote.person);
    if (url) this.pendingPhotos.push({ contactId, url });
    this.counters.pulledCreated++;
  }

  private async processPulledPhotos(): Promise<void> {
    for (const { contactId, url } of this.pendingPhotos) {
      try {
        const base64 = await this.remote.downloadPhoto(url);
        if (!base64) continue;
        const hash = await processPhoto(base64, contactId, this.userId);
        this.db.prepare('UPDATE contacts SET photo_hash = ? WHERE id = ?').run(hash, contactId);
        this.db.prepare(`
          INSERT INTO contact_photos (contact_id, source, local_hash, is_primary) VALUES (?, 'google', ?, 1)
          ON CONFLICT(contact_id, source) DO UPDATE SET local_hash = excluded.local_hash, fetched_at = CURRENT_TIMESTAMP
        `).run(contactId, hash);
        this.db.prepare("UPDATE contact_sync_links SET local_photo_hash = ? WHERE provider = 'google' AND contact_id = ?").run(hash, contactId);
      } catch (error) {
        pushError(this.errors, { contactId, remoteId: null, message: `Photo not imported: ${(error as Error).message}` });
      }
    }
    this.pendingPhotos = [];
  }

  // ─── Push ─────────────────────────────────────────────────────────────────

  async push(): Promise<void> {
    this.loadLinks();
    const contacts = this.loadContacts();
    const linkByContact = new Map(this.links.map(l => [l.contact_id, l]));
    const groupCards = new Set((this.db.prepare(`
      SELECT DISTINCT contact_id FROM contact_vcard_properties
      WHERE name IN ('X-ADDRESSBOOKSERVER-KIND', 'KIND') AND LOWER(TRIM(value)) = 'group'
    `).all() as Array<{ contact_id: number }>).map(r => r.contact_id));
    const tombstones = this.db.prepare(`
      SELECT id, remote_id FROM sync_tombstones WHERE provider = 'google' AND remote_deleted_at IS NULL
    `).all() as Array<{ id: number; remote_id: string }>;

    const creates: number[] = [];
    const updates: Array<{ contactId: number; link: LinkRow }> = [];
    const photos: number[] = [];
    const archivedDeletes: LinkRow[] = [];

    for (const [contactId, { loaded, projection }] of contacts) {
      const link = linkByContact.get(contactId);
      if (loaded.archivedAt) {
        if (link?.remote_id && (link.status === 'active' || link.status === 'error')) archivedDeletes.push(link);
        continue;
      }
      if (groupCards.has(contactId)) continue;
      if (!link || link.status === 'pending_create' || link.status === 'deleted' || !link.remote_id) {
        creates.push(contactId);
        if (loaded.photoHash) photos.push(contactId);
        continue;
      }
      if (hashProjection(projection) !== link.local_hash) updates.push({ contactId, link });
      if ((loaded.photoHash ?? null) !== link.local_photo_hash) photos.push(contactId);
    }

    const live = this.links.filter(l => l.status === 'active' || l.status === 'error').length;
    const deleteCount = archivedDeletes.length + tombstones.length;
    this.guard(deleteCount, massChangeThreshold(live),
      `This sync would delete ${deleteCount} contacts from Google. Sync is paused until you confirm.`);
    if (deleteCount > massChangeThreshold(live)) assertDeletionAllowed(this.userId, PROVIDER);
    this.guard(creates.length, live === 0 ? Infinity : MASS_CREATE_THRESHOLD,
      `This sync would create ${creates.length} contacts in Google. Sync is paused until you confirm.`);

    await this.pushCreates(creates, contacts, linkByContact);
    await this.pushUpdates(updates, contacts);
    await this.pushDeletes(archivedDeletes, tombstones);
    await this.pushPhotos(photos);
  }

  private async pushCreates(
    creates: number[],
    contacts: Map<number, { loaded: LoadedContact; projection: SyncProjection }>,
    linkByContact: Map<number, LinkRow>
  ): Promise<void> {
    if (!creates.length) return;
    const results = await this.remote.createContacts(creates.map(id => contactDataToPerson(contacts.get(id)!.loaded.contact)));
    this.db.transaction(() => {
      creates.forEach((contactId, i) => {
        const result = results[i];
        const link = linkByContact.get(contactId) ?? null;
        if (result instanceof Error) {
          this.recordPushError(contactId, link, null, result);
          return;
        }
        const remote = readPerson(result);
        const local = contacts.get(contactId)!.projection;
        const values = {
          ...this.remoteFields(remote), remote_id: result.resourceName, last_pushed_at: new Date().toISOString(),
          local_hash: hashProjection(local), local_snapshot: JSON.stringify(local), local_photo_hash: null
        };
        if (link) {
          this.updateLink(link.id, values);
          this.db.prepare('UPDATE contacts SET google_resource_name = ? WHERE id = ?').run(result.resourceName, contactId);
        } else {
          this.insertLink(contactId, values);
        }
        this.counters.pushedCreated++;
      });
    })();
    this.reportProgress();
  }

  private async pushUpdates(
    updates: Array<{ contactId: number; link: LinkRow }>,
    contacts: Map<number, { loaded: LoadedContact; projection: SyncProjection }>
  ): Promise<void> {
    if (!updates.length) return;
    const results = await this.remote.updateContacts(updates.map(({ contactId, link }) => ({
      resourceName: link.remote_id!, etag: link.etag, body: contactDataToPerson(contacts.get(contactId)!.loaded.contact)
    })));

    const stale: Array<{ contactId: number; link: LinkRow }> = [];
    this.db.transaction(() => {
      updates.forEach((update, i) => {
        const result = results[i];
        if (result instanceof PreconditionFailedError) { stale.push(update); return; }
        if (result instanceof Error) { this.recordPushError(update.contactId, update.link, update.link.remote_id, result); return; }
        this.recordPushed(update.link, readPerson(result), contacts.get(update.contactId)!.projection);
        this.counters.pushedUpdated++;
      });
    })();
    this.reportProgress();

    // Edited in Google since the pull: merge that edit, then push once more.
    for (const { contactId, link } of stale) {
      try {
        const [current] = await this.remote.getPeople([link.remote_id!]);
        if (!current) throw new Error('The Google contact is gone');
        const remote = readPerson(current);
        this.db.transaction(() => this.mergeRemotePerson(link, remote, this.loadContacts([contactId]).get(contactId)!))();
        const fresh = this.loadContacts([contactId]).get(contactId)!;
        const [result] = await this.remote.updateContacts([{ resourceName: link.remote_id!, etag: current.etag ?? null, body: contactDataToPerson(fresh.loaded.contact) }]);
        if (result instanceof Error) throw result;
        this.recordPushed(link, readPerson(result), fresh.projection);
        this.counters.pushedUpdated++;
      } catch (error) {
        this.recordPushError(contactId, link, link.remote_id, error);
      }
    }
  }

  private recordPushed(link: LinkRow, remote: RemotePerson, local: SyncProjection): void {
    this.updateLink(link.id, {
      ...this.remoteFields(remote), last_pushed_at: new Date().toISOString(),
      local_hash: hashProjection(local), local_snapshot: JSON.stringify(local)
    });
  }

  private async pushDeletes(archived: LinkRow[], tombstones: Array<{ id: number; remote_id: string }>): Promise<void> {
    const names = [...archived.map(l => l.remote_id!), ...tombstones.map(t => t.remote_id)];
    if (!names.length) return;
    // Keep each contact's last version before it goes.
    const current = new Map((await this.remote.getPeople(names)).map(p => [p.resourceName, p]));
    const contactOf = new Map(archived.map(l => [l.remote_id!, l.contact_id]));
    for (const name of names) {
      const person = current.get(name);
      if (person) logRemoteVersion(this.db, { runId: this.runId, contactId: contactOf.get(name) ?? null, provider: PROVIDER, remoteId: name, reason: 'remote_delete', payload: JSON.stringify(person) });
    }

    // Recorded batch by batch, so an interrupted run (Google's per-minute
    // quota, a restart) continues where it stopped.
    const linkOf = new Map(archived.map(l => [l.remote_id!, l]));
    const tombstoneOf = new Map(tombstones.map(t => [t.remote_id, t]));
    const markDeleted = (batch: string[]) => {
      const now = new Date().toISOString();
      this.db.transaction(() => {
        for (const name of batch) {
          const link = linkOf.get(name);
          if (link) this.updateLink(link.id, { status: 'deleted', last_error: null });
          const tombstone = tombstoneOf.get(name);
          if (tombstone) this.db.prepare('UPDATE sync_tombstones SET remote_deleted_at = ? WHERE id = ?').run(now, tombstone.id);
        }
      })();
      this.counters.pushedDeleted += batch.length;
      this.reportProgress('removed', names.length);
    };

    markDeleted(names.filter(name => !current.has(name))); // already gone from Google
    const existing = names.filter(name => current.has(name));
    try {
      if (existing.length) await this.remote.deleteContacts(existing, markDeleted);
    } catch (error) {
      if (error instanceof RemoteAuthError || error instanceof RemoteRetryLaterError) throw error;
      pushError(this.errors, { contactId: null, remoteId: null, message: `Removing contacts from Google stopped: ${error instanceof Error ? error.message : String(error)}` });
    }
  }


  /** Photos go one request each, so at most PHOTO_PUSH_LIMIT per run; the rest follow on later runs. */
  private async pushPhotos(contactIds: number[]): Promise<void> {
    if (!contactIds.length) return;
    this.loadLinks();
    const linkByContact = new Map(this.links.map(l => [l.contact_id, l]));
    const withPhotos = this.loadContacts(contactIds.slice(0, PHOTO_PUSH_LIMIT), true);
    let n = 0;
    for (const [contactId, { loaded }] of withPhotos) {
      if (++n % 25 === 0) await yieldToEventLoop();
      const link = linkByContact.get(contactId);
      if (!link?.remote_id || link.status !== 'active') continue;
      try {
        const base64 = loaded.contact.photoBase64;
        const person = base64
          ? await this.remote.updatePhoto(link.remote_id, base64)
          : link.local_photo_hash ? await this.remote.deletePhoto(link.remote_id) : null;
        const url = person ? contactPhotoUrl(person) : null;
        this.updateLink(link.id, {
          local_photo_hash: loaded.photoHash ?? null,
          ...(person ? { remote_photo_hash: url ? sha256(url) : null, etag: person.etag ?? link.etag } : {})
        });
      } catch (error) {
        this.recordPushError(contactId, null, link.remote_id, error);
      }
    }
  }

  private recordPushError(contactId: number | null, link: LinkRow | null, remoteId: string | null, error: unknown): void {
    if (error instanceof RemoteAuthError || error instanceof RemoteRetryLaterError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    pushError(this.errors, { contactId, remoteId, message });
    if (link) this.updateLink(link.id, { status: 'error', last_error: message });
  }
}

/** Runs one Google sync for a user. Never throws; see SyncRunResult. */
export async function runGoogleSync(userId: number, options: GoogleSyncOptions): Promise<SyncRunResult> {
  const db = getUserDatabase(userId);
  const skip = (reason: string): SyncRunResult => ({ runId: null, status: 'skipped', reason, counters: emptyCounters(), errors: [] });

  const state = getProviderRow(db, PROVIDER);
  if (!state.enabled) return skip('Google sync is off');
  if (!state.cutover_completed_at) return skip('Google has not been switched over to Yello yet');
  if (state.paused && !options.confirmLargeChanges) return skip('Google sync is paused');

  const release = acquireSyncLock(db, userId, PROVIDER);
  if (!release) return skip('A Google sync is already running');

  const runId = startRun(db, PROVIDER, options.trigger);
  let run: GoogleSyncRun | null = null;
  try {
    if (options.confirmLargeChanges) updateProvider(db, PROVIDER, { paused: 0 });
    const remote = options.remote ?? openGoogleRemote(userId);
    run = new GoogleSyncRun(userId, runId, remote, options);
    await run.pull(state.sync_token);
    await run.push();

    pruneRemoteVersions(db);
    // The token from before our writes: they come back next run and are
    // recognised by their hashes, and nothing edited meanwhile is skipped.
    updateProvider(db, PROVIDER, {
      sync_token: run.nextSyncToken,
      last_run_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_error: run.errors.length ? `${run.errors.length} contacts could not be synced` : null,
      consecutive_failures: 0
    });
    finishRun(db, runId, 'completed', run.counters, run.errors);
    return { runId, status: 'completed', reason: null, counters: run.counters, errors: run.errors };
  } catch (error) {
    const counters = run?.counters ?? emptyCounters();
    const errors = run?.errors ?? [];
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof PauseRun || error instanceof DeletionBlockedError || error instanceof RemoteAuthError) {
      updateProvider(db, PROVIDER, { paused: 1, last_run_at: new Date().toISOString(), last_error: message });
      finishRun(db, runId, 'paused', counters, errors);
      return { runId, status: 'paused', reason: message, counters, errors };
    }
    updateProvider(db, PROVIDER, {
      last_run_at: new Date().toISOString(),
      last_error: message,
      consecutive_failures: state.consecutive_failures + 1
    });
    finishRun(db, runId, 'failed', counters, [...errors, { contactId: null, remoteId: null, message }]);
    return { runId, status: 'failed', reason: message, counters, errors };
  } finally {
    release();
  }
}
