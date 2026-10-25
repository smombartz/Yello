import type { Database as DatabaseType } from 'better-sqlite3';
import { getUserDatabase, listUserIds } from '../userDatabase.js';
import { processPhoto } from '../photoProcessor.js';
import { loadContactsForVcard } from '../vcardExportService.js';
import { archiveContacts } from '../archiveService.js';
import {
  insertParsedContact, mergeParsedIntoContact, prepareContactStatements, replaceContactFields
} from '../contactPersistence.js';
import { preserveEntryAnnotations } from '../vcardModelStore.js';
import type { ParsedContact } from '../vcardParser.js';
import { entryKey, hashProjection, parsedToContactData, projectContact, type SyncField } from './syncProjection.js';
import {
  getLatestCutover, listCutoverItems, loadGoogleCards, loadICloudCards,
  type CutoverItemKind, type CutoverItemRow, type CutoverSummary, type RemoteCard
} from './cutoverPlanner.js';
import { checkDeletionGate, listBackups } from './remoteBackupService.js';
import { runICloudSync } from './icloudSyncEngine.js';
import { runGoogleSync } from './googleSyncEngine.js';
import { openGoogleRemote, type GoogleRemote } from './googleRemote.js';
import type { ICloudRemote } from './icloudRemote.js';
import { getProviderRow, logRemoteVersion, updateProvider, type SyncRunResult } from './syncRuntime.js';
import type { SyncProvider } from './syncState.js';

/**
 * Applies a reviewed cutover plan: the one-time switch to Yello as the source
 * of truth.
 *
 * Step 1, in one transaction on the Yello database: the remote changes the
 * user accepted are written into Yello, cards to keep become new contacts,
 * every remaining remote card is linked to its contact (contact_sync_links,
 * with the backup's version as the remote snapshot), every card to remove
 * becomes a tombstone, and the providers are switched on. Nothing remote has
 * changed yet; a crash before the commit leaves everything as it was.
 *
 * Step 2, the first push: each provider's sync engine runs, which writes
 * Yello's version of every card that differs, creates the missing ones, and
 * deletes the tombstoned ones last. It can be resumed (the cutover stays in
 * `pushing` until both engines complete).
 */

export class CutoverError extends Error {}

/** Users whose switch is being applied in this process. */
const running = new Set<number>();

/** The choices a reviewer has per item kind; the first is the default unless noted. */
export const RESOLUTIONS: Partial<Record<CutoverItemKind, string[]>> = {
  update: ['apply', 'skip'],
  conflict: ['yello', 'remote'],
  possible_match: ['import', 'same', 'delete'],
  import: ['import', 'delete'],
  delete_remote: ['delete', 'import'],
  restore_review: ['delete', 'restore'],
  merged_duplicate: ['delete', 'import'],
  group_card: ['archive', 'keep']
};

export function defaultResolution(item: Pick<CutoverItemRow, 'kind' | 'suggested'>): string | null {
  if (item.kind === 'conflict') return item.suggested === 'remote' ? 'remote' : 'yello';
  return RESOLUTIONS[item.kind]?.[0] ?? null;
}

export function effectiveResolution(item: Pick<CutoverItemRow, 'kind' | 'suggested' | 'resolution'>): string | null {
  return item.resolution ?? defaultResolution(item);
}

function requirePlanned(userId: number, cutoverId: string) {
  const latest = getLatestCutover(userId);
  if (!latest || latest.id !== cutoverId) throw new CutoverError('This preview is no longer the latest one. Preview again.');
  // Step 1 commits together with the switch to 'pushing', so an 'applying'
  // left by a restart changed nothing: it is a plan again.
  if (latest.status === 'applying' && !running.has(userId)) {
    getUserDatabase(userId).prepare("UPDATE sync_cutovers SET status = 'planned' WHERE id = ?").run(cutoverId);
    latest.status = 'planned';
  }
  return latest;
}

/** Records the reviewer's choices. `null` returns an item to its default. */
export function resolveCutoverItems(userId: number, cutoverId: string, choices: Array<{ id: number; resolution: string | null }>): number {
  const latest = requirePlanned(userId, cutoverId);
  if (latest.status !== 'planned') throw new CutoverError('Only a preview that has not been applied can be changed.');
  const db = getUserDatabase(userId);
  const select = db.prepare('SELECT kind FROM sync_cutover_items WHERE id = ? AND cutover_id = ?');
  const update = db.prepare('UPDATE sync_cutover_items SET resolution = ? WHERE id = ?');
  let changed = 0;
  db.transaction(() => {
    for (const { id, resolution } of choices) {
      const row = select.get(id, cutoverId) as { kind: CutoverItemKind } | undefined;
      if (!row) throw new CutoverError(`Item ${id} is not part of this preview`);
      if (resolution !== null && !RESOLUTIONS[row.kind]?.includes(resolution)) {
        throw new CutoverError(`"${resolution}" is not a choice for ${row.kind.replace('_', ' ')} items`);
      }
      changed += update.run(resolution, id).changes;
    }
  })();
  return changed;
}

/** Sets (or, with null, clears back to the defaults) every item of a kind / provider. */
export function resolveAllCutoverItems(
  userId: number,
  cutoverId: string,
  filter: { kind?: CutoverItemKind; provider?: SyncProvider },
  resolution: string | null
): number {
  const latest = requirePlanned(userId, cutoverId);
  if (latest.status !== 'planned') throw new CutoverError('Only a preview that has not been applied can be changed.');
  if (resolution !== null && (!filter.kind || !RESOLUTIONS[filter.kind]?.includes(resolution))) {
    throw new CutoverError('Pick an item kind and one of its choices');
  }
  const where = ['cutover_id = ?'];
  const params: unknown[] = [cutoverId];
  if (filter.kind) { where.push('kind = ?'); params.push(filter.kind); }
  if (filter.provider) { where.push('provider = ?'); params.push(filter.provider); }
  return getUserDatabase(userId).prepare(`UPDATE sync_cutover_items SET resolution = ? WHERE ${where.join(' AND ')}`)
    .run(resolution, ...params).changes;
}

// ─── Pre-checks ─────────────────────────────────────────────────────────────

interface ProviderInPlan {
  provider: SyncProvider;
  backupId: string;
  collectionUrl: string | null;
}

/** The common address-book URL of a set of iCloud card URLs, or null if they span several. */
function commonCollection(urls: string[]): string | null | 'mixed' {
  const dirs = new Set(urls.map(url => url.slice(0, url.lastIndexOf('/') + 1)));
  if (dirs.size === 0) return null;
  return dirs.size === 1 ? [...dirs][0] : 'mixed';
}

function checkPreconditions(userId: number, summary: CutoverSummary, items: CutoverItemRow[]): ProviderInPlan[] {
  const db = getUserDatabase(userId);
  const included: ProviderInPlan[] = [];
  for (const provider of ['icloud', 'google'] as const) {
    const plan = summary.providers[provider];
    if (plan.skipped || !plan.backupId) continue;
    const name = provider === 'icloud' ? 'iCloud' : 'Google';

    if (getProviderRow(db, provider).cutover_completed_at) throw new CutoverError(`${name} has already been switched over.`);
    const latest = listBackups(userId, provider).find(b => b.status === 'verified');
    if (latest?.id !== plan.backupId) {
      throw new CutoverError(`There is a newer ${name} backup than the one this preview was made from. Preview again.`);
    }
    const gate = checkDeletionGate(userId, provider);
    if (!gate.allowed) throw new CutoverError(gate.reason ?? `The ${name} backup is not ready.`);

    let collectionUrl: string | null = null;
    if (provider === 'icloud') {
      const urls = items.filter(i => i.provider === 'icloud' && i.remoteId).map(i => i.remoteId!);
      const collection = commonCollection(urls);
      if (collection === 'mixed') {
        throw new CutoverError('Your iCloud contacts are spread over several address books. Yello syncs one; move them into one first.');
      }
      collectionUrl = collection;
    }
    included.push({ provider, backupId: plan.backupId, collectionUrl });
  }
  if (!included.length) throw new CutoverError('Back up iCloud or Google first; there is nothing to switch over.');
  return included;
}

// ─── Step 1: Yello ──────────────────────────────────────────────────────────

const LINKING = new Set<CutoverItemKind>(['link', 'merged_duplicate', 'update', 'conflict', 'possible_match', 'import', 'delete_remote', 'restore_review']);

interface PhotoTask {
  provider: SyncProvider;
  contactId: number;
  base64: string | null;
  url: string | null;
}

const ENTRY_LISTS = ['emails', 'phones', 'addresses', 'urls', 'socialProfiles', 'instantMessages', 'relatedPeople', 'dates', 'categories'] as const;

/**
 * An incoming card reduced to the entries of one multi-value family that the
 * plan listed as added remotely (`additions`, projected entries), so a merge
 * adds exactly those and nothing the remote merely still has. Each entry is
 * projected on its own to compare it with the plan's.
 */
function onlyAdditions(incoming: ParsedContact, field: SyncField, provider: SyncProvider, additions: unknown[]): ParsedContact {
  const wanted = new Set(additions.map(entry => entryKey(field, entry)));
  const family = onlyFamily(incoming, field);
  const bare = onlyFamily({ ...incoming, ...Object.fromEntries(ENTRY_LISTS.map(k => [k, []])) } as ParsedContact, field);
  const isWanted = (list: typeof ENTRY_LISTS[number], entry: unknown) => {
    const projected = projectContact(parsedToContactData({ ...bare, [list]: [entry] } as ParsedContact), provider)[field] as unknown[];
    return projected.length > 0 && wanted.has(entryKey(field, projected[0]));
  };
  const result = { ...family };
  for (const list of ENTRY_LISTS) {
    const entries = family[list] as unknown[] | undefined;
    if (entries?.length) (result as unknown as Record<string, unknown>)[list] = entries.filter(entry => isWanted(list, entry));
  }
  return result;
}

/** An incoming card reduced to one multi-value family. */
function onlyFamily(incoming: ParsedContact, field: SyncField): ParsedContact {
  const empty: ParsedContact = {
    firstName: null, lastName: null, displayName: incoming.displayName, company: null, title: null, notes: null,
    birthday: null, emails: [], phones: [], addresses: [], categories: [], instantMessages: [], urls: [],
    relatedPeople: [], socialProfiles: [], photoBase64: null, rawVcard: '', uid: null, dates: []
  };
  const map: Partial<Record<SyncField, (keyof ParsedContact)[]>> = {
    emails: ['emails'], phones: ['phones'], addresses: ['addresses'], urls: ['urls', 'socialProfiles'],
    socials: ['socialProfiles'], ims: ['instantMessages'], related: ['relatedPeople'], dates: ['dates'], categories: ['categories']
  };
  for (const key of map[field] ?? []) (empty as unknown as Record<string, unknown>)[key] = incoming[key];
  return empty;
}

function applyStep(
  db: DatabaseType,
  userId: number,
  cutoverId: string,
  providers: ProviderInPlan[],
  items: CutoverItemRow[],
  cards: Map<SyncProvider, Map<string, RemoteCard>>
): PhotoTask[] {
  const stmts = prepareContactStatements(db);
  const photos: PhotoTask[] = [];
  const now = new Date().toISOString();
  const tombstone = db.prepare(`
    INSERT INTO sync_tombstones (provider, remote_id, remote_uid, etag, display_name, reason) VALUES (?, ?, ?, ?, ?, 'cutover')
  `);

  // Apple groups imported as contacts.
  const groupIds = items.filter(i => i.kind === 'group_card' && i.contactId && effectiveResolution(i) === 'archive').map(i => i.contactId!);
  if (groupIds.length) archiveContacts(db, groupIds);

  for (const { provider, collectionUrl } of providers) {
    const byRemote = cards.get(provider)!;
    const own = items.filter(i => i.provider === provider);
    /** remote id → contact it becomes linked to */
    const links = new Map<string, number>();
    const linkedContacts = new Set<number>();
    const remove = (item: CutoverItemRow) => {
      const card = item.remoteId ? byRemote.get(item.remoteId) : undefined;
      if (item.remoteId) tombstone.run(provider, item.remoteId, item.remoteUid, card?.etag ?? null, item.displayName);
    };
    const link = (remoteId: string, contactId: number, item: CutoverItemRow) => {
      if (linkedContacts.has(contactId)) { remove(item); return; }
      links.set(remoteId, contactId);
      linkedContacts.add(contactId);
    };
    const importCard = (item: CutoverItemRow) => {
      const card = byRemote.get(item.remoteId!);
      if (!card) return;
      const inserted = insertParsedContact(stmts, db, {
        ...card.incoming,
        photoBase64: null,
        // An iCloud card keeps its UID (CardDAV never lets it change); Google's get a new one.
        uid: provider === 'icloud' ? card.remoteUid : null
      }, { skipExistingUid: false });
      if (!inserted) return;
      links.set(item.remoteId!, inserted.contactId);
      linkedContacts.add(inserted.contactId);
      if (card.photoHash) photos.push({ provider, contactId: inserted.contactId, base64: card.data.photoBase64 ?? null, url: card.photoUrl });
    };

    // Links first, so a contact's own card wins over a duplicate that would claim it.
    for (const item of own.filter(i => i.kind === 'link')) {
      // Deleted in Yello since the preview: Yello wins, its card goes.
      if (item.contactId) link(item.remoteId!, item.contactId, item);
      else remove(item);
    }

    for (const item of own) {
      const resolution = effectiveResolution(item);
      const card = item.remoteId ? byRemote.get(item.remoteId) : undefined;
      switch (item.kind) {
        case 'update':
        case 'conflict': {
          if (!card || !item.contactId || !item.field) break;
          const take = (item.kind === 'update' && resolution === 'apply') || (item.kind === 'conflict' && resolution === 'remote');
          if (!take) {
            if (item.kind === 'conflict') {
              logRemoteVersion(db, { runId: null, contactId: item.contactId, provider, remoteId: item.remoteId!, reason: 'cutover_conflict', payload: JSON.stringify({ field: item.field, value: item.remoteValue }) });
            }
            break;
          }
          const field = item.field as SyncField;
          const restore = provider === 'google' ? preserveEntryAnnotations(db, item.contactId) : null;
          if (item.kind === 'update' && item.reason === 'added_remotely') {
            mergeParsedIntoContact(stmts, db, item.contactId, onlyAdditions(card.incoming, field, provider, (item.remoteValue as unknown[]) ?? []));
          } else {
            replaceContactFields(stmts, db, item.contactId, card.incoming, field === 'urls' && provider === 'google' ? ['urls', 'socials'] : [field]);
          }
          restore?.();
          break;
        }
        case 'possible_match':
          if (resolution === 'same' && item.contactId) link(item.remoteId!, item.contactId, item);
          else if (resolution === 'delete') remove(item);
          else importCard(item);
          break;
        case 'import':
        case 'delete_remote':
        case 'merged_duplicate':
          if (resolution === 'import') importCard(item);
          else remove(item);
          break;
        case 'restore_review':
          if (resolution !== 'restore') remove(item);
          else if (item.contactId) {
            db.prepare('UPDATE contacts SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(item.contactId);
            link(item.remoteId!, item.contactId, item);
          } else importCard(item);
          break;
        default:
          break;
      }
    }

    // A linked contact without a photo takes the card's.
    const photoless = new Set((db.prepare('SELECT id FROM contacts WHERE photo_hash IS NULL').all() as Array<{ id: number }>).map(r => r.id));
    for (const [remoteId, contactId] of links) {
      const card = byRemote.get(remoteId);
      if (card?.photoHash && photoless.has(contactId) && !photos.some(p => p.provider === provider && p.contactId === contactId)) {
        photos.push({ provider, contactId, base64: card.data.photoBase64 ?? null, url: card.photoUrl });
      }
    }

    // The links, from the backup's version of each card. A contact Yello now
    // describes exactly like its card is in sync; any other is pushed first.
    const contacts = new Map(loadContactsForVcard(db, { ids: [...links.values()], withoutEnrichment: true }).map(c => [c.id, c]));
    const insert = db.prepare(`
      INSERT INTO contact_sync_links (
        contact_id, provider, remote_id, remote_uid, etag, remote_hash, remote_snapshot, remote_photo_hash,
        local_hash, local_snapshot, local_photo_hash, status, last_pulled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      ON CONFLICT(contact_id, provider) DO UPDATE SET
        remote_id = excluded.remote_id, remote_uid = excluded.remote_uid, etag = excluded.etag,
        remote_hash = excluded.remote_hash, remote_snapshot = excluded.remote_snapshot,
        remote_photo_hash = excluded.remote_photo_hash, local_hash = excluded.local_hash,
        local_snapshot = excluded.local_snapshot, local_photo_hash = excluded.local_photo_hash,
        status = 'active', last_pulled_at = excluded.last_pulled_at
    `);
    for (const [remoteId, contactId] of links) {
      const card = byRemote.get(remoteId);
      const contact = contacts.get(contactId);
      if (!card || !contact) continue;
      const remoteP = projectContact(card.data, provider);
      const localP = projectContact(contact.contact, provider);
      const inSync = JSON.stringify(remoteP) === JSON.stringify(localP);
      // Both sides having a photo counts as in sync; only a missing one is pushed.
      const localPhoto = contact.photoHash && card.photoHash ? contact.photoHash : null;
      insert.run(
        contactId, provider, remoteId, provider === 'icloud' ? card.remoteUid : null, card.etag,
        hashProjection(remoteP), JSON.stringify(remoteP), card.photoHash,
        inSync ? hashProjection(localP) : null, inSync ? JSON.stringify(localP) : null, localPhoto, now
      );
      if (provider === 'google') db.prepare('UPDATE contacts SET google_resource_name = ? WHERE id = ?').run(remoteId, contactId);
    }

    updateProvider(db, provider, {
      enabled: 1, paused: 0, cutover_completed_at: now, sync_token: null, ctag: null, last_error: null,
      consecutive_failures: 0, ...(provider === 'icloud' ? { collection_url: collectionUrl } : {})
    });
  }

  db.prepare("UPDATE sync_cutovers SET status = 'pushing', error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(cutoverId);
  void userId;
  return photos;
}

async function importPhotos(userId: number, tasks: PhotoTask[], google: GoogleRemote | null): Promise<void> {
  const db = getUserDatabase(userId);
  for (const task of tasks) {
    try {
      const base64 = task.base64 ?? (task.url && google ? await google.downloadPhoto(task.url) : null);
      if (!base64) continue;
      const hash = await processPhoto(base64, task.contactId, userId);
      db.prepare('UPDATE contacts SET photo_hash = ? WHERE id = ?').run(hash, task.contactId);
      db.prepare(`
        INSERT INTO contact_photos (contact_id, source, local_hash, is_primary) VALUES (?, ?, ?, 1)
        ON CONFLICT(contact_id, source) DO UPDATE SET local_hash = excluded.local_hash, fetched_at = CURRENT_TIMESTAMP
      `).run(task.contactId, task.provider === 'icloud' ? 'vcard' : 'google', hash);
      db.prepare('UPDATE contact_sync_links SET local_photo_hash = ? WHERE provider = ? AND contact_id = ?').run(hash, task.provider, task.contactId);
    } catch { /* the contact itself is in; a photo can be added later */ }
  }
}

// ─── Step 2: the first push ─────────────────────────────────────────────────

export interface CutoverRemotes {
  icloud?: ICloudRemote;
  google?: GoogleRemote;
}

interface ApplyRecord {
  appliedAt: string | null;
  results: Partial<Record<SyncProvider, Pick<SyncRunResult, 'runId' | 'status' | 'reason' | 'counters'>>>;
  finishedAt: string | null;
}

function saveApplyRecord(db: DatabaseType, cutoverId: string, record: ApplyRecord, status: string, error: string | null): void {
  const row = db.prepare('SELECT summary_json FROM sync_cutovers WHERE id = ?').get(cutoverId) as { summary_json: string };
  const summary = JSON.parse(row.summary_json) as CutoverSummary & { apply?: ApplyRecord };
  summary.apply = record;
  db.prepare('UPDATE sync_cutovers SET status = ?, error = ?, summary_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, error, JSON.stringify(summary), cutoverId);
}

async function pushStep(userId: number, cutoverId: string, remotes: CutoverRemotes): Promise<void> {
  const db = getUserDatabase(userId);
  const latest = getLatestCutover(userId)!;
  const record: ApplyRecord = (latest.summary as CutoverSummary & { apply?: ApplyRecord }).apply
    ?? { appliedAt: new Date().toISOString(), results: {}, finishedAt: null };

  // iCloud first, so an edit made on the phone meanwhile reaches Google in the same pass.
  for (const provider of ['icloud', 'google'] as const) {
    if (!getProviderRow(db, provider).cutover_completed_at) continue;
    if (record.results[provider]?.status === 'completed') continue;
    const options = { trigger: 'cutover' as const, confirmLargeChanges: true, fullScan: true };
    const result = provider === 'icloud'
      ? await runICloudSync(userId, { ...options, remote: remotes.icloud })
      : await runGoogleSync(userId, { ...options, remote: remotes.google });
    record.results[provider] = { runId: result.runId, status: result.status, reason: result.reason, counters: result.counters };
  }

  const unfinished = Object.entries(record.results).filter(([, r]) => r?.status !== 'completed');
  if (unfinished.length) {
    const message = unfinished.map(([p, r]) => `${p === 'icloud' ? 'iCloud' : 'Google'}: ${r?.reason ?? r?.status}`).join('; ');
    saveApplyRecord(db, cutoverId, record, 'pushing', `Not finished — ${message}. Apply again to continue.`);
    return;
  }
  record.finishedAt = new Date().toISOString();
  saveApplyRecord(db, cutoverId, record, 'done', null);
}


/**
 * Applies the latest plan (or, if it is already applied and pushing,
 * continues the push). Throws CutoverError when a precondition fails;
 * otherwise runs in the background and reports through the cutover record.
 */
export async function startCutoverApply(
  userId: number,
  cutoverId: string,
  remotes: CutoverRemotes = {}
): Promise<{ promise: Promise<void> }> {
  if (running.has(userId)) throw new CutoverError('The switch is already running');
  const latest = requirePlanned(userId, cutoverId);
  if (latest.status === 'done') throw new CutoverError('This switch is already done.');
  if (latest.status !== 'planned' && latest.status !== 'pushing') throw new CutoverError(`A ${latest.status} preview cannot be applied.`);
  const db = getUserDatabase(userId);

  if (latest.status === 'pushing') {
    running.add(userId);
    return { promise: pushStep(userId, cutoverId, remotes).finally(() => running.delete(userId)) };
  }

  const summary = latest.summary!;
  const items = listAllItems(userId, cutoverId);
  const providers = checkPreconditions(userId, summary, items);

  running.add(userId);
  const promise = (async () => {
    try {
      db.prepare("UPDATE sync_cutovers SET status = 'applying', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(cutoverId);
      const cards = new Map<SyncProvider, Map<string, RemoteCard>>();
      for (const { provider, backupId } of providers) {
        const backup = listBackups(userId, provider).find(b => b.id === backupId)!;
        const needed = new Set(items.filter(i => i.provider === provider && i.remoteId && LINKING.has(i.kind)).map(i => i.remoteId!));
        const loaded = provider === 'icloud'
          ? (await loadICloudCards(userId, backup, { keepPhotos: true, only: needed })).cards
          : loadGoogleCards(userId, backup, { only: needed }).cards;
        cards.set(provider, new Map(loaded.map(c => [c.remoteId, c])));
      }

      const photos = db.transaction(() => applyStep(db, userId, cutoverId, providers, items, cards))();
      const google = providers.some(p => p.provider === 'google') ? (remotes.google ?? openGoogleRemote(userId)) : null;
      await importPhotos(userId, photos, google);
      await pushStep(userId, cutoverId, remotes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = (db.prepare('SELECT status FROM sync_cutovers WHERE id = ?').get(cutoverId) as { status: string }).status;
      // Before step 1 committed nothing changed: back to a reviewable plan.
      db.prepare('UPDATE sync_cutovers SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(status === 'applying' ? 'planned' : status, message, cutoverId);
    } finally {
      running.delete(userId);
    }
  })();
  return { promise };
}

function listAllItems(userId: number, cutoverId: string): CutoverItemRow[] {
  const items: CutoverItemRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = listCutoverItems(userId, cutoverId, { limit: 500, offset }).items;
    items.push(...page);
    if (page.length < 500) return items;
  }
}

export function isCutoverRunning(userId: number): boolean {
  return running.has(userId);
}

/** Boot: continue the first push of any switch a restart interrupted. */
export function resumeInterruptedCutovers(log: { info: (msg: string) => void; error: (err: unknown, msg: string) => void }): void {
  for (const userId of listUserIds()) {
    let cutover;
    try {
      cutover = getLatestCutover(userId);
    } catch {
      continue;
    }
    if (cutover?.status !== 'pushing') continue;
    log.info(`Resuming the switch to Yello for user ${userId}`);
    startCutoverApply(userId, cutover.id)
      .then(({ promise }) => promise)
      .catch(err => log.error(err, `Could not resume the switch for user ${userId}`));
  }
}
