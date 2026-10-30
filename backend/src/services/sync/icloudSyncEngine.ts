import type { Database as DatabaseType } from 'better-sqlite3';
import { getUserDatabase } from '../userDatabase.js';
import { decryptToken } from '../tokenEncryption.js';
import { processPhoto } from '../photoProcessor.js';
import { isGroupVcard, parseSingleVcard, type ParsedContact } from '../vcardParser.js';
import { generateVcard } from '../vcardGenerator.js';
import { contactPhotoReader, loadContactsForVcard, type LoadedContact } from '../vcardExportService.js';
import { insertParsedContact, prepareContactStatements, replaceContactFields } from '../contactPersistence.js';
import { findContactByMergedIdentity } from '../mergedIdentities.js';
import {
  hashProjection, parsedToContactData, planFieldMerge, projectContact, type SyncProjection
} from './syncProjection.js';
import {
  openICloudRemote, PreconditionFailedError, RemoteAuthError, RemoteRetryLaterError,
  type ICloudRemote, type RemoteCardData
} from './icloudRemote.js';
import { assertDeletionAllowed, DeletionBlockedError } from './remoteBackupService.js';
import {
  acquireSyncLock, emptyCounters, finishRun, progressReporter, getProviderRow, logRemoteVersion, massChangeThreshold,
  MASS_CREATE_THRESHOLD, pruneRemoteVersions, pushError, sha256, startRun, updateProvider, withoutPhoto,
  type SyncCounters, type SyncRunError, type SyncRunResult, type SyncTrigger
} from './syncRuntime.js';

/**
 * Two-way sync between Yello and the user's iCloud address book.
 *
 * One run: pull (what changed in iCloud since the last run), then push (what
 * changed in Yello). Yello is the source of truth, applied per field family:
 * a family changed only in iCloud comes into Yello; a family changed on both
 * sides keeps Yello's value, which is then pushed, and iCloud's version is
 * kept in sync_remote_versions. Change is detected by comparing projection
 * hashes with the ones stored on contact_sync_links at the last sync, never
 * by timestamps.
 *
 * The engine refuses to run until the account has been switched over
 * (sync_providers.cutover_completed_at): either through the cutover, which
 * links every existing card, or by enabling sync on an empty address book.
 * Without that every card already in iCloud would look new.
 */

const PROVIDER = 'icloud' as const;

interface LinkRow {
  id: number;
  contact_id: number;
  remote_id: string | null;
  remote_uid: string | null;
  etag: string | null;
  local_hash: string | null;
  remote_hash: string | null;
  local_snapshot: string | null;
  remote_snapshot: string | null;
  local_photo_hash: string | null;
  remote_photo_hash: string | null;
  status: 'active' | 'pending_create' | 'deleted' | 'error';
}

export interface ICloudSyncOptions {
  trigger: SyncTrigger;
  /** Overrides the live iCloud connection (tests). */
  remote?: ICloudRemote;
  /** Proceed with, and unpause after, a run the mass-change guard stopped. */
  confirmLargeChanges?: boolean;
  /** Ignore the ctag and list every card. */
  fullScan?: boolean;
}

class PauseRun extends Error {}

function photoHashOf(base64: string | null | undefined): string | null {
  return base64 ? sha256(base64) : null;
}

/** A CardDAV resource name for a contact UID. */
export function cardFilename(uid: string): string {
  return `${uid.replace(/[^A-Za-z0-9._-]/g, '_')}.vcf`;
}

function parseSnapshot(json: string | null): SyncProjection | null {
  return json ? JSON.parse(json) as SyncProjection : null;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

function icloudCredentials(db: DatabaseType): { email: string; password: string } {
  const row = db.prepare('SELECT icloud_email, icloud_app_password FROM user_settings WHERE id = 1').get() as
    { icloud_email: string | null; icloud_app_password: string | null } | undefined;
  if (!row?.icloud_email || !row.icloud_app_password) throw new RemoteAuthError('iCloud is not connected');
  const password = decryptToken(row.icloud_app_password);
  if (!password) throw new RemoteAuthError('The stored iCloud password could not be decrypted. Reconnect iCloud.');
  return { email: row.icloud_email, password };
}

export async function openUserICloud(db: DatabaseType): Promise<ICloudRemote> {
  const { email, password } = icloudCredentials(db);
  return openICloudRemote(email, password, getProviderRow(db, PROVIDER).collection_url);
}

interface ParsedCard {
  card: RemoteCardData;
  parsed: ParsedContact;
  projection: SyncProjection;
  hash: string;
  photoHash: string | null;
}

function parseCard(card: RemoteCardData): ParsedCard | null {
  if (isGroupVcard(card.data)) return null;
  const parsed = parseSingleVcard(card.data);
  if (!parsed) throw new Error('card produced no contact');
  const projection = projectContact(parsedToContactData(parsed), PROVIDER);
  return { card, parsed, projection, hash: hashProjection(projection), photoHash: photoHashOf(parsed.photoBase64) };
}

class ICloudSyncRun {
  readonly counters: SyncCounters = emptyCounters();
  readonly errors: SyncRunError[] = [];
  private readonly db: DatabaseType;
  private readonly stmts;
  private links: LinkRow[] = [];
  private pendingPhotos: Array<{ contactId: number; base64: string; remotePhotoHash: string }> = [];
  private pushedAnything = false;

  constructor(
    private readonly userId: number,
    private readonly runId: number,
    private readonly remote: ICloudRemote,
    private readonly options: ICloudSyncOptions
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
    this.links = this.db.prepare("SELECT * FROM contact_sync_links WHERE provider = 'icloud'").all() as LinkRow[];
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

  private guard(count: number, limit: number, message: string): void {
    if (count > limit && !this.options.confirmLargeChanges) throw new PauseRun(message);
  }

  // ─── Pull ─────────────────────────────────────────────────────────────────

  async pull(startCtag: string | null, storedCtag: string | null): Promise<void> {
    if (!this.options.fullScan && startCtag && startCtag === storedCtag) return;

    this.loadLinks();
    const listing = new Map((await this.remote.listCards()).map(c => [c.url, c.etag]));
    const tombstoned = new Set((this.db.prepare(
      "SELECT remote_id FROM sync_tombstones WHERE provider = 'icloud' AND remote_deleted_at IS NULL"
    ).all() as Array<{ remote_id: string }>).map(r => r.remote_id));
    const live = this.links.filter(l => l.remote_id && (l.status === 'active' || l.status === 'error'));
    const linkByUrl = new Map(live.map(l => [l.remote_id!, l]));
    const knownUrls = new Set(this.links.map(l => l.remote_id).filter(Boolean));

    const missing = live.filter(l => !listing.has(l.remote_id!));
    const changed = live.filter(l => listing.has(l.remote_id!) && (listing.get(l.remote_id!) ?? null) !== l.etag);
    const fresh = [...listing.keys()].filter(url => !knownUrls.has(url) && !tombstoned.has(url));

    this.guard(missing.length, massChangeThreshold(live.length),
      `${missing.length} cards disappeared from iCloud at once. Sync is paused until you confirm.`);
    this.guard(fresh.length, massChangeThreshold(live.length),
      `${fresh.length} new cards appeared in iCloud at once. Sync is paused until you confirm.`);

    const fetched = await this.remote.fetchCards([...changed.map(l => l.remote_id!), ...fresh]);
    const parsedByUrl = new Map<string, ParsedCard | null>();
    for (const card of fetched) {
      try {
        parsedByUrl.set(card.url, parseCard(card));
      } catch (error) {
        pushError(this.errors, { contactId: linkByUrl.get(card.url)?.contact_id ?? null, remoteId: card.url, message: `Unreadable card: ${(error as Error).message}` });
      }
    }

    const contactIds = [...new Set([...changed, ...missing].map(l => l.contact_id))];
    const contacts = this.loadContacts(contactIds);

    this.db.transaction(() => {
      for (const link of changed) {
        const parsed = parsedByUrl.get(link.remote_id!);
        const contact = contacts.get(link.contact_id);
        if (!parsed || !contact) continue;
        this.mergeRemoteCard(link, parsed, contact);
      }
      for (const link of missing) {
        const contact = contacts.get(link.contact_id);
        if (contact) this.handleRemoteDelete(link, contact);
      }
      for (const url of fresh) {
        const parsed = parsedByUrl.get(url);
        if (parsed) this.handleNewRemoteCard(parsed);
      }
    })();

    await this.processPulledPhotos();
  }

  /** A linked card changed in iCloud: take the families only iCloud changed. */
  private mergeRemoteCard(
    link: LinkRow,
    remote: ParsedCard,
    contact: { loaded: LoadedContact; projection: SyncProjection }
  ): void {
    const pulledAt = new Date().toISOString();
    const remoteFields = {
      etag: remote.card.etag, remote_hash: remote.hash, remote_snapshot: JSON.stringify(remote.projection),
      remote_photo_hash: remote.photoHash, last_pulled_at: pulledAt, status: 'active', last_error: null
    };
    const photoChanged = remote.photoHash !== link.remote_photo_hash;
    if (remote.hash === link.remote_hash && !photoChanged) {
      // Only the etag moved (our own write echoing back, or a server rewrite).
      this.updateLink(link.id, remoteFields);
      return;
    }

    const contactId = link.contact_id;
    if (contact.loaded.archivedAt) {
      // Archived in Yello, edited in iCloud: Yello wins (the card is deleted
      // in the push); keep iCloud's version.
      logRemoteVersion(this.db, { runId: this.runId, contactId, provider: PROVIDER, remoteId: link.remote_id!, reason: 'conflict_yello_won', payload: withoutPhoto(remote.card.data) });
      this.counters.conflicts++;
      this.updateLink(link.id, remoteFields);
      return;
    }

    const local = contact.projection;
    const { take, conflicts } = planFieldMerge(parseSnapshot(link.remote_snapshot), parseSnapshot(link.local_snapshot), local, remote.projection);

    if (take.length) {
      replaceContactFields(this.stmts, this.db, contactId, remote.parsed, take);
      this.counters.pulledUpdated++;
    }
    if (conflicts.length) {
      logRemoteVersion(this.db, { runId: this.runId, contactId, provider: PROVIDER, remoteId: link.remote_id!, reason: 'conflict_yello_won', payload: withoutPhoto(remote.card.data) });
      this.counters.conflicts++;
    }

    if (photoChanged && remote.parsed.photoBase64) {
      const localPhotoUnchanged = (contact.loaded.photoHash ?? null) === link.local_photo_hash;
      if (localPhotoUnchanged) {
        this.pendingPhotos.push({ contactId, base64: remote.parsed.photoBase64, remotePhotoHash: remote.photoHash! });
      } else if (!conflicts.length) {
        logRemoteVersion(this.db, { runId: this.runId, contactId, provider: PROVIDER, remoteId: link.remote_id!, reason: 'conflict_yello_won', payload: withoutPhoto(remote.card.data) });
        this.counters.conflicts++;
      }
    }

    // In sync when Yello now looks exactly like the card; otherwise the push
    // sees the difference from the stored local snapshot and sends Yello's.
    const after = take.length ? projectContact(this.loadContacts([contactId]).get(contactId)!.loaded.contact, PROVIDER) : local;
    const inSync = same(after, remote.projection);
    this.updateLink(link.id, {
      ...remoteFields,
      ...(inSync ? { local_hash: remote.hash, local_snapshot: JSON.stringify(after) } : {})
    });
  }

  /** A linked card is gone from iCloud. */
  private handleRemoteDelete(link: LinkRow, contact: { loaded: LoadedContact; projection: SyncProjection }): void {
    const contactId = link.contact_id;
    if (contact.loaded.archivedAt) {
      this.updateLink(link.id, { status: 'deleted' });
      return;
    }
    const localUnchanged = hashProjection(contact.projection) === link.local_hash
      && (contact.loaded.photoHash ?? null) === link.local_photo_hash;
    if (localUnchanged) {
      // Deleted on the phone: archive (never hard-delete) in Yello.
      this.db.prepare("UPDATE contacts SET archived_at = datetime('now'), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(contactId);
      logRemoteVersion(this.db, { runId: this.runId, contactId, provider: PROVIDER, remoteId: link.remote_id!, reason: 'remote_delete', payload: link.remote_snapshot ?? '{}' });
      this.updateLink(link.id, { status: 'deleted' });
      this.counters.pulledArchived++;
    } else {
      // Changed in Yello since: Yello wins, the card is created again.
      this.updateLink(link.id, { status: 'pending_create', remote_id: null, etag: null, remote_hash: null, remote_snapshot: null });
      this.counters.conflicts++;
    }
  }

  /** A card Yello has never linked: relink by UID, else a new contact. */
  private handleNewRemoteCard(remote: ParsedCard): void {
    const uid = remote.parsed.uid;
    const byUid = uid
      ? (this.db.prepare('SELECT id FROM contacts WHERE icloud_uid = ? LIMIT 1').get(uid) as { id: number } | undefined)?.id
        ?? findContactByMergedIdentity(this.db, 'uid', uid)
      : null;

    if (byUid) {
      const existing = this.db.prepare("SELECT id, status FROM contact_sync_links WHERE provider = 'icloud' AND contact_id = ?").get(byUid) as
        { id: number; status: string } | undefined;
      if (existing && existing.status === 'active') {
        pushError(this.errors, { contactId: byUid, remoteId: remote.card.url, message: 'A second iCloud card carries the UID of a contact that already has one; left untouched' });
        return;
      }
      // Yello's own card (e.g. a push whose link was not saved): link it with
      // no local snapshot, so Yello's version is pushed over it.
      const values = {
        remote_id: remote.card.url, remote_uid: uid, etag: remote.card.etag, remote_hash: remote.hash,
        remote_snapshot: JSON.stringify(remote.projection), remote_photo_hash: remote.photoHash,
        local_hash: null, local_snapshot: null, status: 'active', last_pulled_at: new Date().toISOString()
      };
      if (existing) this.updateLink(existing.id, values);
      else this.insertLink(byUid, values);
      return;
    }

    const inserted = insertParsedContact(this.stmts, this.db, { ...remote.parsed, photoBase64: null }, { skipExistingUid: false, createdVia: 'icloud_sync' });
    if (!inserted) return;
    const contactId = inserted.contactId;
    const local = projectContact(this.loadContacts([contactId]).get(contactId)!.loaded.contact, PROVIDER);
    this.insertLink(contactId, {
      remote_id: remote.card.url, remote_uid: uid, etag: remote.card.etag,
      remote_hash: remote.hash, remote_snapshot: JSON.stringify(remote.projection), remote_photo_hash: remote.photoHash,
      // A card that does not survive the trip into Yello unchanged is pushed back once.
      ...(same(local, remote.projection) ? { local_hash: remote.hash, local_snapshot: JSON.stringify(local) } : {}),
      status: 'active', last_pulled_at: new Date().toISOString()
    });
    if (remote.parsed.photoBase64) {
      this.pendingPhotos.push({ contactId, base64: remote.parsed.photoBase64, remotePhotoHash: remote.photoHash! });
    }
    this.counters.pulledCreated++;
  }

  private insertLink(contactId: number, values: Record<string, unknown>): void {
    const row = { contact_id: contactId, provider: PROVIDER, ...values };
    const columns = Object.keys(row);
    this.db.prepare(`INSERT INTO contact_sync_links (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
      .run(...columns.map(c => (row as Record<string, unknown>)[c] ?? null));
  }

  private async processPulledPhotos(): Promise<void> {
    for (const photo of this.pendingPhotos) {
      try {
        const hash = await processPhoto(photo.base64, photo.contactId, this.userId);
        this.stmts.setPhotoHash.run(hash, photo.contactId);
        this.stmts.upsertContactPhoto.run(photo.contactId, hash);
        this.db.prepare("UPDATE contact_sync_links SET local_photo_hash = ? WHERE provider = 'icloud' AND contact_id = ?")
          .run(hash, photo.contactId);
      } catch (error) {
        pushError(this.errors, { contactId: photo.contactId, remoteId: null, message: `Photo not imported: ${(error as Error).message}` });
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
      SELECT id, remote_id, etag, display_name FROM sync_tombstones WHERE provider = 'icloud' AND remote_deleted_at IS NULL
    `).all() as Array<{ id: number; remote_id: string; etag: string | null; display_name: string | null }>;

    const creates: number[] = [];
    const updates: Array<{ contactId: number; link: LinkRow }> = [];
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
      } else if (hashProjection(projection) !== link.local_hash || (loaded.photoHash ?? null) !== link.local_photo_hash) {
        updates.push({ contactId, link });
      }
    }

    const live = this.links.filter(l => l.status === 'active' || l.status === 'error').length;
    const deleteCount = archivedDeletes.length + tombstones.length;
    this.guard(deleteCount, massChangeThreshold(live),
      `This sync would delete ${deleteCount} cards from iCloud. Sync is paused until you confirm.`);
    // Even a confirmed mass delete needs a fresh backup.
    if (deleteCount > massChangeThreshold(live)) assertDeletionAllowed(this.userId, PROVIDER);
    this.guard(creates.length, live === 0 ? Infinity : MASS_CREATE_THRESHOLD,
      `This sync would create ${creates.length} cards in iCloud. Sync is paused until you confirm.`);

    const pushIds = [...creates, ...updates.map(u => u.contactId)];
    const withPhotos = pushIds.length ? this.loadContacts(pushIds, true) : new Map();
    const pushed: Array<{ contactId: number; url: string; projection: SyncProjection; photoHash: string | null }> = [];
    const rev = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

    let n = 0;
    for (const contactId of creates) {
      if (++n % 25 === 0) await yieldToEventLoop();
      const entry = withPhotos.get(contactId);
      if (!entry) continue;
      const link = linkByContact.get(contactId);
      const uid = link?.remote_uid ?? entry.loaded.contact.uid!;
      try {
        const card = generateVcard({ ...entry.loaded.contact, uid }, { sync: { rev } });
        let ref;
        try {
          ref = await this.remote.createCard(cardFilename(uid), card);
        } catch (error) {
          if (!(error instanceof PreconditionFailedError)) throw error;
          // A card of that name exists already (our own earlier create): overwrite it.
          const [current] = await this.remote.fetchCards([error.url]);
          ref = await this.remote.updateCard(error.url, card, current?.etag ?? null);
        }
        const values = { remote_id: ref.url, remote_uid: uid, etag: ref.etag, status: 'active', last_error: null };
        if (link) this.updateLink(link.id, values);
        else this.insertLink(contactId, values);
        pushed.push({ contactId, url: ref.url, projection: entry.projection, photoHash: entry.loaded.photoHash ?? null });
        this.counters.pushedCreated++;
        this.reportProgress('new cards', creates.length);
      } catch (error) {
        this.recordPushError(contactId, link ?? null, null, error);
      }
    }

    for (const { contactId, link } of updates) {
      if (++n % 25 === 0) await yieldToEventLoop();
      const entry = withPhotos.get(contactId);
      if (!entry) continue;
      const card = generateVcard({ ...entry.loaded.contact, uid: link.remote_uid ?? entry.loaded.contact.uid }, { sync: { rev } });
      try {
        let ref;
        try {
          ref = await this.remote.updateCard(link.remote_id!, card, link.etag);
        } catch (error) {
          if (!(error instanceof PreconditionFailedError)) throw error;
          // Edited in iCloud since the pull: merge that edit first, then push once more.
          const [current] = await this.remote.fetchCards([link.remote_id!]);
          if (!current) throw error;
          const parsed = parseCard(current);
          if (parsed) this.db.transaction(() => this.mergeRemoteCard(link, parsed, this.loadContacts([contactId]).get(contactId)!))();
          const fresh = this.loadContacts([contactId], true).get(contactId)!;
          const merged = generateVcard({ ...fresh.loaded.contact, uid: link.remote_uid ?? fresh.loaded.contact.uid }, { sync: { rev } });
          ref = await this.remote.updateCard(link.remote_id!, merged, current.etag);
          entry.projection = fresh.projection;
          entry.loaded = fresh.loaded;
        }
        this.updateLink(link.id, { etag: ref.etag, status: 'active', last_error: null });
        pushed.push({ contactId, url: link.remote_id!, projection: entry.projection, photoHash: entry.loaded.photoHash ?? null });
        this.counters.pushedUpdated++;
        this.reportProgress('updated cards', updates.length);
      } catch (error) {
        this.recordPushError(contactId, link, link.remote_id, error);
      }
    }

    for (const link of archivedDeletes) {
      if (++n % 25 === 0) await yieldToEventLoop();
      try {
        await this.deleteRemoteCard(link.remote_id!, link.etag, link.contact_id);
        this.updateLink(link.id, { status: 'deleted', last_error: null });
        this.counters.pushedDeleted++;
        this.reportProgress('removals', archivedDeletes.length + tombstones.length);
      } catch (error) {
        this.recordPushError(link.contact_id, link, link.remote_id, error);
      }
    }

    for (const tombstone of tombstones) {
      if (++n % 25 === 0) await yieldToEventLoop();
      try {
        await this.deleteRemoteCard(tombstone.remote_id, tombstone.etag, null);
        this.db.prepare('UPDATE sync_tombstones SET remote_deleted_at = ? WHERE id = ?').run(new Date().toISOString(), tombstone.id);
        this.counters.pushedDeleted++;
        this.reportProgress('removals', archivedDeletes.length + tombstones.length);
      } catch (error) {
        this.recordPushError(null, null, tombstone.remote_id, error);
      }
    }

    await this.recordPushedCards(pushed);
  }

  /** Deletes a card, keeping its last version; a 412 means it changed, so read it again and delete that. */
  private async deleteRemoteCard(url: string, etag: string | null, contactId: number | null): Promise<void> {
    const [current] = await this.remote.fetchCards([url]);
    if (!current) return; // already gone
    logRemoteVersion(this.db, { runId: this.runId, contactId, provider: PROVIDER, remoteId: url, reason: 'remote_delete', payload: withoutPhoto(current.data) });
    try {
      await this.remote.deleteCard(url, current.etag ?? etag);
    } catch (error) {
      if (!(error instanceof PreconditionFailedError)) throw error;
      const [again] = await this.remote.fetchCards([url]);
      if (again) await this.remote.deleteCard(url, again.etag);
    }
    this.pushedAnything = true;
  }

  /**
   * Reads back what iCloud stored for each pushed card: iCloud may rewrite a
   * card or return no etag, so the link remembers the server's version, and
   * the next pull does not mistake our own write for an edit.
   */
  private async recordPushedCards(pushed: Array<{ contactId: number; url: string; projection: SyncProjection; photoHash: string | null }>): Promise<void> {
    if (!pushed.length) return;
    this.pushedAnything = true;
    const stored = new Map((await this.remote.fetchCards(pushed.map(p => p.url))).map(c => [c.url, c]));
    const now = new Date().toISOString();
    this.db.transaction(() => {
      for (const p of pushed) {
        const card = stored.get(p.url);
        let remote: ParsedCard | null = null;
        try {
          remote = card ? parseCard(card) : null;
        } catch { /* recorded below without a remote snapshot */ }
        this.db.prepare(`
          UPDATE contact_sync_links SET etag = COALESCE(?, etag), remote_hash = ?, remote_snapshot = ?, remote_photo_hash = ?,
            local_hash = ?, local_snapshot = ?, local_photo_hash = ?, last_pushed_at = ?
          WHERE provider = 'icloud' AND contact_id = ?
        `).run(
          card?.etag ?? null,
          remote?.hash ?? hashProjection(p.projection),
          JSON.stringify(remote?.projection ?? p.projection),
          remote?.photoHash ?? null,
          hashProjection(p.projection),
          JSON.stringify(p.projection),
          p.photoHash,
          now,
          p.contactId
        );
      }
    })();
  }

  private recordPushError(contactId: number | null, link: LinkRow | null, remoteId: string | null, error: unknown): void {
    if (error instanceof RemoteAuthError || error instanceof RemoteRetryLaterError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    pushError(this.errors, { contactId, remoteId, message });
    if (link) this.updateLink(link.id, { status: 'error', last_error: message });
  }

  get wroteToRemote(): boolean {
    return this.pushedAnything;
  }
}

/**
 * Runs one iCloud sync for a user. Never throws: the outcome, including why
 * a run was skipped or paused the provider, is in the result.
 */
export async function runICloudSync(userId: number, options: ICloudSyncOptions): Promise<SyncRunResult> {
  const db = getUserDatabase(userId);
  const skip = (reason: string): SyncRunResult => ({ runId: null, status: 'skipped', reason, counters: emptyCounters(), errors: [] });

  const state = getProviderRow(db, PROVIDER);
  if (!state.enabled) return skip('iCloud sync is off');
  if (!state.cutover_completed_at) return skip('iCloud has not been switched over to Yello yet');
  if (state.paused && !options.confirmLargeChanges) return skip('iCloud sync is paused');

  const release = acquireSyncLock(db, userId, PROVIDER);
  if (!release) return skip('An iCloud sync is already running');

  const runId = startRun(db, PROVIDER, options.trigger);
  let run: ICloudSyncRun | null = null;
  try {
    if (options.confirmLargeChanges) updateProvider(db, PROVIDER, { paused: 0 });
    const remote = options.remote ?? await openUserICloud(db);
    run = new ICloudSyncRun(userId, runId, remote, options);
    const startCtag = await remote.getCtag();
    await run.pull(startCtag, state.ctag);
    await run.push();

    pruneRemoteVersions(db);
    // A ctag read after our own writes could hide a phone edit made in
    // between, so it is kept only when this run wrote nothing.
    updateProvider(db, PROVIDER, {
      ctag: run.wroteToRemote ? null : startCtag,
      collection_url: remote.collectionUrl,
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
