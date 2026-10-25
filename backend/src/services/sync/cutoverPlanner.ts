import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import type { Database as DatabaseType } from 'better-sqlite3';
import { getUserBackupsPath, getUserDatabase } from '../userDatabase.js';
import { isGroupVcard, parseSingleVcard, unfoldLines, ARCHIVE_CONTACT_ID_PROPERTY } from '../vcardParser.js';
import { loadContactsForVcard, type LoadedContact } from '../vcardExportService.js';
import { matchIncomingContacts, type IncomingContact } from '../icloudMatchingService.js';
import type { ContactForVcard } from '../vcardGenerator.js';
import {
  contactDataToParsed, diffProjections, entriesMissingFrom, entryKey, isEmptyField, MULTI_VALUE_FIELDS,
  parsedToContactData, projectContact, type SyncField, type SyncProjection
} from './syncProjection.js';
import { personToContactData } from './googlePersonMapper.js';
import { contactPhotoUrl, type GooglePersonRaw } from './googlePeople.js';
import { getProviderRow, sha256 } from './syncRuntime.js';
import { listBackups, type BackupManifest } from './remoteBackupService.js';
import type { SyncProvider } from './syncState.js';

/**
 * The cutover dry run: what switching to Yello as the source of truth would
 * do, computed from the latest verified backup of each remote address book.
 * Read-only: it writes nothing but its own plan (sync_cutovers and
 * sync_cutover_items), never a contact and never a remote.
 *
 * Yello's cleaned list is the base. Remote cards contribute only changes
 * made within the import window; everything that exists only remotely is
 * removed there, except contacts that are new within the window, which come
 * into Yello. See docs/plans/2026-10-25-yello-source-of-truth-sync.md.
 *
 * "Changed" is judged against the baseline where one exists: the original
 * cards archived when raw_vcard was retired (archive/original-cards-*.vcf.gz),
 * i.e. what Yello imported. A field equal to the baseline on the remote side
 * was not changed there, whatever Yello did to it since.
 */

export const DEFAULT_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CutoverItemKind =
  | 'link' | 'merged_duplicate' | 'update' | 'conflict' | 'possible_match'
  | 'import' | 'delete_remote' | 'restore_review' | 'create_remote' | 'group_card';

export interface CutoverItem {
  provider: SyncProvider | null;
  kind: CutoverItemKind;
  remoteId: string | null;
  remoteUid: string | null;
  contactId: number | null;
  displayName: string;
  field: SyncField | null;
  yelloValue: unknown;
  remoteValue: unknown;
  yelloTs: string | null;
  remoteTs: string | null;
  reason: string | null;
  suggested: string | null;
}

export interface ProviderPlanSummary {
  provider: SyncProvider;
  skipped: string | null;
  backupId: string | null;
  backupAt: string | null;
  remoteCards: number;
  groups: number;
  unreadable: Array<{ remoteId: string; error: string }>;
  matched: number;
  matchedByIdentifier: number;
  links: number;
  updates: { contacts: number; fields: number };
  conflicts: number;
  possibleMatches: number;
  imports: number;
  restoreReview: number;
  deletes: { mergedDuplicates: number; removedInCleanup: number; oldRemoteOnly: number; archivedInYello: number; total: number };
  creates: number;
  pushUpdates: number;
}

export interface CutoverSummary {
  windowDays: number;
  windowStart: string;
  generatedAt: string;
  yello: { active: number; archived: number; groupCards: number };
  providers: Record<SyncProvider, ProviderPlanSummary>;
}

// ─── Remote cards ───────────────────────────────────────────────────────────

export interface RemoteCard {
  provider: SyncProvider;
  remoteId: string;
  remoteUid: string | null;
  etag: string | null;
  modifiedAt: string | null;
  data: ContactForVcard;
  incoming: IncomingContact;
  /** Identity of the card's photo (iCloud: hash of its bytes; Google: hash of its URL). */
  photoHash: string | null;
  /** Google: the contact photo's URL, to download it. */
  photoUrl: string | null;
}

export interface LoadCardsOptions {
  /** Keep iCloud photos in `data.photoBase64` (the apply step imports them). */
  keepPhotos?: boolean;
  /** Only these remote ids (the rest are skipped, not parsed). */
  only?: Set<string>;
}

/** An ISO timestamp from a vCard REV (`20261024T101500Z`, `2026-10-24T10:15:00Z`, `2026-10-24`). */
export function parseRev(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{4})-?(\d{2})-?(\d{2})(?:T(\d{2}):?(\d{2}):?(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00', zone = 'Z'] = m;
  const tz = zone === 'Z' ? 'Z' : zone.replace(/^([+-]\d{2}):?(\d{2})$/, '$1:$2');
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${tz}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function splitCards(text: string): string[] {
  return unfoldLines(text)
    .split(/(?=^BEGIN:VCARD)/im)
    .map(block => block.trim())
    .filter(block => /^BEGIN:VCARD/i.test(block));
}

export async function loadICloudCards(userId: number, backup: BackupManifest, options: LoadCardsOptions = {}) {
  const dir = path.join(getUserBackupsPath(userId), backup.id);
  const blocks = splitCards(fs.readFileSync(path.join(dir, 'icloud-contacts.vcf'), 'utf-8'));
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'icloud-index.json'), 'utf-8')) as
    Array<{ url: string; etag: string | null; uid: string | null; group: boolean }>;
  if (index.length !== blocks.length) {
    throw new Error(`iCloud backup ${backup.id} is inconsistent: ${blocks.length} cards, ${index.length} index entries`);
  }

  const cards: RemoteCard[] = [];
  const unreadable: Array<{ remoteId: string; error: string }> = [];
  let groups = 0;
  for (let i = 0; i < blocks.length; i++) {
    // ical.js parsing is synchronous; keep the server responsive on big books.
    if (i % 100 === 99) await yieldToEventLoop();
    const block = blocks[i];
    const remoteId = index[i].url;
    if (options.only && !options.only.has(remoteId)) continue;
    if (isGroupVcard(block)) { groups++; continue; }
    try {
      const parsed = parseSingleVcard(block);
      if (!parsed) throw new Error('card produced no contact');
      const photoHash = parsed.photoBase64 ? sha256(parsed.photoBase64) : null;
      // The plan never needs the photo or the card text; dropping them keeps
      // a few thousand photo cards from piling up in memory.
      if (!options.keepPhotos) parsed.photoBase64 = null;
      parsed.rawVcard = '';
      const rev = parsed.extraProperties?.find(p => p.name === 'REV')?.value ?? null;
      cards.push({
        provider: 'icloud',
        remoteId,
        remoteUid: parsed.uid,
        etag: index[i].etag ?? null,
        modifiedAt: parseRev(rev),
        data: parsedToContactData(parsed),
        incoming: parsed,
        photoHash,
        photoUrl: null
      });
    } catch (error) {
      unreadable.push({ remoteId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { cards, groups, unreadable };
}

export function loadGoogleCards(userId: number, backup: BackupManifest, options: LoadCardsOptions = {}) {
  const dir = path.join(getUserBackupsPath(userId), backup.id);
  const { people } = JSON.parse(fs.readFileSync(path.join(dir, 'google-people.json'), 'utf-8')) as { people: GooglePersonRaw[] };
  const cards: RemoteCard[] = [];
  for (const person of people) {
    if (person.metadata?.deleted) continue;
    if (options.only && !options.only.has(person.resourceName)) continue;
    const data = personToContactData(person, { socialsFromUrls: true });
    const photoUrl = contactPhotoUrl(person);
    const updateTime = person.metadata?.sources?.find(s => s.type === 'CONTACT')?.updateTime ?? null;
    cards.push({
      provider: 'google',
      remoteId: person.resourceName,
      remoteUid: data.uid ?? null,
      etag: person.etag ?? null,
      modifiedAt: updateTime ? new Date(updateTime).toISOString() : null,
      data,
      incoming: { ...contactDataToParsed(data), googleResourceName: person.resourceName },
      photoHash: photoUrl ? sha256(photoUrl) : null,
      photoUrl
    });
  }
  return { cards, groups: 0, unreadable: [] as Array<{ remoteId: string; error: string }> };
}

// ─── Baseline ───────────────────────────────────────────────────────────────

interface BaselineCard {
  contactId: number;
  data: ContactForVcard;
}

/** The cards as Yello imported them, by vCard UID. */
export async function loadBaseline(userId: number): Promise<Map<string, BaselineCard>> {
  const dir = path.join(path.dirname(getUserBackupsPath(userId)), 'archive');
  const baseline = new Map<string, BaselineCard>();
  if (!fs.existsSync(dir)) return baseline;
  const idPattern = new RegExp(`^${ARCHIVE_CONTACT_ID_PROPERTY}:(\\d+)\\s*$`, 'im');

  for (const file of fs.readdirSync(dir).filter(f => /^original-cards-.*\.vcf\.gz$/.test(f)).sort()) {
    const text = zlib.gunzipSync(fs.readFileSync(path.join(dir, file))).toString('utf-8');
    const blocks = splitCards(text);
    for (let i = 0; i < blocks.length; i++) {
      if (i % 100 === 99) await yieldToEventLoop();
      const block = blocks[i];
      const contactId = Number(block.match(idPattern)?.[1]);
      try {
        const parsed = parseSingleVcard(block);
        if (parsed) { parsed.photoBase64 = null; parsed.rawVcard = ''; }
        if (parsed?.uid && contactId) baseline.set(parsed.uid, { contactId, data: parsedToContactData(parsed) });
      } catch { /* an unreadable original simply has no baseline */ }
    }
  }
  return baseline;
}

// ─── Planning ───────────────────────────────────────────────────────────────

interface YelloEntry {
  loaded: LoadedContact;
  projection: Record<SyncProvider, SyncProjection>;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

const CONFIDENCE_RANK: Record<string, number> = { very_high: 3, high: 2, medium: 1 };

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Yello contacts that are really Apple group cards imported before they were skipped. */
function findGroupCardContacts(db: DatabaseType): Set<number> {
  const rows = db.prepare(`
    SELECT DISTINCT contact_id FROM contact_vcard_properties
    WHERE name IN ('X-ADDRESSBOOKSERVER-KIND', 'KIND') AND LOWER(TRIM(value)) = 'group'
  `).all() as Array<{ contact_id: number }>;
  return new Set(rows.map(r => r.contact_id));
}

function emptySummary(provider: SyncProvider, skipped: string | null): ProviderPlanSummary {
  return {
    provider, skipped, backupId: null, backupAt: null, remoteCards: 0, groups: 0, unreadable: [],
    matched: 0, matchedByIdentifier: 0, links: 0, updates: { contacts: 0, fields: 0 }, conflicts: 0,
    possibleMatches: 0, imports: 0, restoreReview: 0,
    deletes: { mergedDuplicates: 0, removedInCleanup: 0, oldRemoteOnly: 0, archivedInYello: 0, total: 0 },
    creates: 0, pushUpdates: 0
  };
}

interface PlanContext {
  provider: SyncProvider;
  windowStart: number;
  baseline: Map<string, BaselineCard>;
  yello: Map<number, YelloEntry>;
  groupCards: Set<number>;
  items: CutoverItem[];
}

function item(ctx: PlanContext, card: RemoteCard | null, fields: Partial<CutoverItem> & { kind: CutoverItemKind }): void {
  ctx.items.push({
    provider: ctx.provider,
    remoteId: card?.remoteId ?? null,
    remoteUid: card?.remoteUid ?? null,
    contactId: null,
    displayName: card?.data.displayName ?? '',
    field: null,
    yelloValue: null,
    remoteValue: null,
    yelloTs: null,
    remoteTs: card?.modifiedAt ?? null,
    reason: null,
    suggested: null,
    ...fields
  });
}

function inWindow(ctx: PlanContext, card: RemoteCard): boolean {
  return card.modifiedAt !== null && new Date(card.modifiedAt).getTime() >= ctx.windowStart;
}

/**
 * The changes one remote card brings to its Yello contact, field family by
 * field family. Returns the families whose remote value Yello will adopt
 * wholesale (so they will not need pushing back).
 */
function planCardChanges(ctx: PlanContext, card: RemoteCard, entry: YelloEntry, summary: ProviderPlanSummary): Set<SyncField> {
  const adopted = new Set<SyncField>();
  if (!inWindow(ctx, card)) return adopted;

  const yelloP = entry.projection[ctx.provider];
  const remoteP = projectContact(card.data, ctx.provider);
  const base = card.remoteUid ? ctx.baseline.get(card.remoteUid) : undefined;
  const baseP = base ? projectContact(base.data, ctx.provider) : null;
  const contactId = entry.loaded.id;
  const yelloTs = entry.loaded.updatedAt ? `${entry.loaded.updatedAt.replace(' ', 'T')}Z` : null;
  let changedFields = 0;

  for (const field of diffProjections(yelloP, remoteP)) {
    const remoteChanged = baseP ? !same(remoteP[field], baseP[field]) : true;
    if (!remoteChanged) continue; // only Yello changed it: Yello's value is pushed
    const yelloChanged = baseP ? !same(yelloP[field], baseP[field]) : true;

    if (MULTI_VALUE_FIELDS.has(field)) {
      if (baseP && !yelloChanged) {
        item(ctx, card, { kind: 'update', contactId, field, yelloValue: yelloP[field], remoteValue: remoteP[field], yelloTs, reason: 'changed_remotely', suggested: 'replace' });
        adopted.add(field);
        changedFields++;
        continue;
      }
      // Both sides changed it (or there is no baseline): bring in only what the
      // remote added. Entries the remote dropped stay in Yello, which wins.
      const inBaseline = new Set(baseP ? (baseP[field] as unknown[]).map(e => entryKey(field, e)) : []);
      const additions = entriesMissingFrom(field, yelloP, remoteP).filter(e => !inBaseline.has(entryKey(field, e)));
      if (additions.length) {
        item(ctx, card, { kind: 'update', contactId, field, yelloValue: yelloP[field], remoteValue: additions, yelloTs, reason: 'added_remotely', suggested: 'add' });
        changedFields++;
      }
      continue;
    }

    if (isEmptyField(yelloP, field)) {
      item(ctx, card, { kind: 'update', contactId, field, yelloValue: null, remoteValue: remoteP[field], yelloTs, reason: 'filled_remotely', suggested: 'replace' });
      adopted.add(field);
      changedFields++;
    } else if (baseP && !yelloChanged) {
      item(ctx, card, { kind: 'update', contactId, field, yelloValue: yelloP[field], remoteValue: remoteP[field], yelloTs, reason: 'changed_remotely', suggested: 'replace' });
      adopted.add(field);
      changedFields++;
    } else if (!isEmptyField(remoteP, field)) {
      const remoteNewer = !!card.modifiedAt && (!yelloTs || card.modifiedAt > yelloTs);
      item(ctx, card, {
        kind: 'conflict', contactId, field, yelloValue: yelloP[field], remoteValue: remoteP[field], yelloTs,
        reason: baseP ? 'changed_on_both_sides' : 'differs_no_baseline', suggested: remoteNewer ? 'remote' : 'yello'
      });
      summary.conflicts++;
    }
  }

  if (changedFields) {
    summary.updates.fields += changedFields;
  }
  return adopted;
}

function planProvider(ctx: PlanContext, cards: RemoteCard[], db: DatabaseType, summary: ProviderPlanSummary): void {
  const match = matchIncomingContacts(db, cards.map(c => c.incoming));
  const cardOf = new Map(cards.map(c => [c.incoming, c]));

  const byContact = new Map<number, Array<{ card: RemoteCard; rank: number; byId: boolean }>>();
  const unmatched: RemoteCard[] = match.newContacts.map(incoming => cardOf.get(incoming)!);

  for (const m of match.matches) {
    const card = cardOf.get(m.incoming)!;
    const byId = m.confidence === 'very_high' && m.matchReasons.some(r => r.startsWith('same'));
    if (m.confidence === 'medium') {
      item(ctx, card, {
        kind: 'possible_match', contactId: m.existingContactId, reason: m.matchReasons.join(', '),
        yelloValue: m.existingDisplayName, suggested: null
      });
      summary.possibleMatches++;
      continue;
    }
    summary.matched++;
    if (byId) summary.matchedByIdentifier++;
    const list = byContact.get(m.existingContactId) ?? [];
    list.push({ card, rank: CONFIDENCE_RANK[m.confidence] * 10 + (byId ? 5 : 0), byId });
    byContact.set(m.existingContactId, list);
  }

  const updatedContacts = new Set<number>();

  for (const [contactId, list] of byContact) {
    const entry = ctx.yello.get(contactId);
    if (!entry) continue;
    // The best match stays as this contact's card; the rest are duplicates.
    list.sort((a, b) => b.rank - a.rank || (b.card.modifiedAt ?? '').localeCompare(a.card.modifiedAt ?? ''));
    const archivedAt = entry.loaded.archivedAt ? new Date(`${entry.loaded.archivedAt.replace(' ', 'T')}Z`).getTime() : null;

    if (archivedAt !== null) {
      for (const { card } of list) {
        const editedSince = card.modifiedAt !== null && new Date(card.modifiedAt).getTime() > archivedAt;
        if (editedSince) {
          item(ctx, card, { kind: 'restore_review', contactId, reason: 'edited_after_archived', suggested: 'delete' });
          summary.restoreReview++;
        } else {
          item(ctx, card, { kind: 'delete_remote', contactId, reason: 'archived_in_yello', suggested: 'delete' });
          summary.deletes.archivedInYello++;
        }
      }
      continue;
    }

    const before = ctx.items.length;
    list.forEach(({ card }, i) => {
      const adopted = planCardChanges(ctx, card, entry, summary);
      if (i === 0) {
        item(ctx, card, { kind: 'link', contactId, reason: list[0].byId ? 'identifier' : 'matched', suggested: 'link' });
        summary.links++;
        const remaining = diffProjections(entry.projection[ctx.provider], projectContact(card.data, ctx.provider))
          .filter(field => !adopted.has(field));
        if (remaining.length) summary.pushUpdates++;
      } else {
        item(ctx, card, { kind: 'merged_duplicate', contactId, reason: 'duplicate_of_yello_contact', suggested: 'delete' });
        summary.deletes.mergedDuplicates++;
      }
    });
    if (ctx.items.slice(before).some(i => i.kind === 'update')) updatedContacts.add(contactId);
  }
  summary.updates.contacts = updatedContacts.size;

  for (const card of unmatched) {
    const fromImport = card.remoteUid ? ctx.baseline.get(card.remoteUid) : undefined;
    if (fromImport) {
      // Yello imported this card once and no longer has it: deleted or merged away in the cleanup.
      if (inWindow(ctx, card)) {
        item(ctx, card, { kind: 'restore_review', reason: 'removed_in_cleanup_but_edited', suggested: 'delete' });
        summary.restoreReview++;
      } else {
        item(ctx, card, { kind: 'delete_remote', reason: 'removed_in_cleanup', suggested: 'delete' });
        summary.deletes.removedInCleanup++;
      }
    } else if (inWindow(ctx, card)) {
      item(ctx, card, { kind: 'import', reason: 'new_in_window', suggested: 'import' });
      summary.imports++;
    } else {
      item(ctx, card, { kind: 'delete_remote', reason: 'old_remote_only', suggested: 'delete' });
      summary.deletes.oldRemoteOnly++;
    }
  }

  // Active Yello contacts with no card in this book get one.
  for (const [contactId, entry] of ctx.yello) {
    if (entry.loaded.archivedAt || ctx.groupCards.has(contactId) || byContact.has(contactId)) continue;
    ctx.items.push({
      provider: ctx.provider, kind: 'create_remote', remoteId: null, remoteUid: entry.loaded.contact.uid ?? null,
      contactId, displayName: entry.loaded.contact.displayName, field: null, yelloValue: null, remoteValue: null,
      yelloTs: null, remoteTs: null, reason: null, suggested: 'create'
    });
    summary.creates++;
  }

  summary.deletes.total = summary.deletes.mergedDuplicates + summary.deletes.removedInCleanup
    + summary.deletes.oldRemoteOnly + summary.deletes.archivedInYello;
}

export interface CutoverPlan {
  summary: CutoverSummary;
  items: CutoverItem[];
  backups: Partial<Record<SyncProvider, string>>;
}

/** Computes the plan (pure apart from reading the database and backup files). */
export async function computeCutoverPlan(
  userId: number,
  options: { windowDays?: number; now?: Date } = {}
): Promise<CutoverPlan> {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = options.now ?? new Date();
  const windowStart = now.getTime() - windowDays * DAY_MS;
  const db = getUserDatabase(userId);

  const groupCards = findGroupCardContacts(db);
  const loaded = loadContactsForVcard(db, { archived: 'all', withoutEnrichment: true });
  const yello = new Map<number, YelloEntry>();
  for (let i = 0; i < loaded.length; i++) {
    const contact = loaded[i];
    yello.set(contact.id, {
      loaded: contact,
      projection: { icloud: projectContact(contact.contact, 'icloud'), google: projectContact(contact.contact, 'google') }
    });
    if (i % 500 === 499) await yieldToEventLoop();
  }
  const baseline = await loadBaseline(userId);
  await yieldToEventLoop();

  const items: CutoverItem[] = [];
  for (const contactId of groupCards) {
    const entry = yello.get(contactId);
    if (!entry || entry.loaded.archivedAt) continue;
    items.push({
      provider: null, kind: 'group_card', remoteId: null, remoteUid: entry.loaded.contact.uid ?? null, contactId,
      displayName: entry.loaded.contact.displayName, field: null, yelloValue: null, remoteValue: null,
      yelloTs: null, remoteTs: null, reason: 'apple_group_imported_as_contact', suggested: 'archive'
    });
  }

  const providers = {} as Record<SyncProvider, ProviderPlanSummary>;
  const backups: Partial<Record<SyncProvider, string>> = {};
  for (const provider of ['icloud', 'google'] as const) {
    if (getProviderRow(db, provider).cutover_completed_at) {
      providers[provider] = emptySummary(provider, `${provider === 'icloud' ? 'iCloud' : 'Google'} is already synced with Yello`);
      continue;
    }
    const backup = listBackups(userId, provider).find(b => b.status === 'verified');
    if (!backup) {
      providers[provider] = emptySummary(provider, `No verified ${provider === 'icloud' ? 'iCloud' : 'Google'} backup yet`);
      continue;
    }
    const summary = emptySummary(provider, null);
    summary.backupId = backup.id;
    summary.backupAt = backup.createdAt;
    backups[provider] = backup.id;

    const { cards, groups, unreadable } = provider === 'icloud' ? await loadICloudCards(userId, backup) : loadGoogleCards(userId, backup);
    summary.remoteCards = cards.length + unreadable.length;
    summary.groups = groups;
    summary.unreadable = unreadable;
    await yieldToEventLoop();

    planProvider({ provider, windowStart, baseline, yello, groupCards, items }, cards, db, summary);
    providers[provider] = summary;
    await yieldToEventLoop();
  }

  const summary: CutoverSummary = {
    windowDays,
    windowStart: new Date(windowStart).toISOString(),
    generatedAt: now.toISOString(),
    yello: {
      active: loaded.filter(c => !c.archivedAt).length,
      archived: loaded.filter(c => c.archivedAt).length,
      groupCards: items.filter(i => i.kind === 'group_card').length
    },
    providers
  };
  return { summary, items, backups };
}

// ─── Persistence ────────────────────────────────────────────────────────────

const running = new Set<number>();

function storePlan(db: DatabaseType, id: string, windowDays: number, plan: CutoverPlan): void {
  const insert = db.prepare(`
    INSERT INTO sync_cutover_items (
      cutover_id, provider, kind, remote_id, remote_uid, contact_id, display_name, field,
      yello_value, remote_value, yello_ts, remote_ts, reason, suggested
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const json = (value: unknown) => (value === null || value === undefined ? null : JSON.stringify(value));
  db.transaction(() => {
    // Only the latest plan is kept; nothing has been applied from an older one.
    db.prepare("DELETE FROM sync_cutovers WHERE status IN ('planned', 'failed') AND id != ?").run(id);
    for (const i of plan.items) {
      insert.run(
        id, i.provider, i.kind, i.remoteId, i.remoteUid, i.contactId, i.displayName, i.field,
        json(i.yelloValue), json(i.remoteValue), i.yelloTs, i.remoteTs, i.reason, i.suggested
      );
    }
    db.prepare(`
      UPDATE sync_cutovers SET status = 'planned', window_days = ?, icloud_backup_id = ?, google_backup_id = ?,
        summary_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(windowDays, plan.backups.icloud ?? null, plan.backups.google ?? null, JSON.stringify(plan.summary), id);
  })();
}

/** Starts a dry run in the background; poll getLatestCutover for the result. */
export function startCutoverPlan(userId: number, windowDays = DEFAULT_WINDOW_DAYS): { id: string; promise: Promise<void> } {
  if (running.has(userId)) throw new Error('A preview is already being prepared');
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 3650) throw new Error('windowDays must be between 1 and 3650');

  const db = getUserDatabase(userId);
  const id = `cutover-${crypto.randomUUID()}`;
  db.prepare("INSERT INTO sync_cutovers (id, status, window_days) VALUES (?, 'planning', ?)").run(id, windowDays);
  running.add(userId);

  const promise = (async () => {
    try {
      const plan = await computeCutoverPlan(userId, { windowDays });
      storePlan(getUserDatabase(userId), id, windowDays, plan);
    } catch (error) {
      getUserDatabase(userId)
        .prepare("UPDATE sync_cutovers SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(error instanceof Error ? error.message : String(error), id);
    } finally {
      running.delete(userId);
    }
  })();
  return { id, promise };
}

export interface CutoverRecord {
  id: string;
  status: string;
  windowDays: number;
  summary: CutoverSummary | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getLatestCutover(userId: number): CutoverRecord | null {
  const row = getUserDatabase(userId).prepare(`
    SELECT id, status, window_days, summary_json, error, created_at, updated_at FROM sync_cutovers
    ORDER BY created_at DESC, rowid DESC LIMIT 1
  `).get() as { id: string; status: string; window_days: number; summary_json: string | null; error: string | null; created_at: string; updated_at: string } | undefined;
  if (!row) return null;
  // A 'planning' row left by a restart is reported as failed.
  const status = row.status === 'planning' && !running.has(userId) ? 'failed' : row.status;
  return {
    id: row.id,
    status,
    windowDays: row.window_days,
    summary: row.summary_json ? JSON.parse(row.summary_json) as CutoverSummary : null,
    error: status === 'failed' && !row.error ? 'Interrupted (server restarted)' : row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export interface CutoverItemRow extends CutoverItem {
  id: number;
  resolution: string | null;
}

export function listCutoverItems(
  userId: number,
  cutoverId: string,
  filter: { kind?: CutoverItemKind; provider?: SyncProvider; limit?: number; offset?: number } = {}
): { items: CutoverItemRow[]; total: number } {
  const db = getUserDatabase(userId);
  const where = ['cutover_id = ?'];
  const params: unknown[] = [cutoverId];
  if (filter.kind) { where.push('kind = ?'); params.push(filter.kind); }
  if (filter.provider) { where.push('provider = ?'); params.push(filter.provider); }
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM sync_cutover_items WHERE ${where.join(' AND ')}`).get(...params) as { n: number }).n;
  const rows = db.prepare(`
    SELECT * FROM sync_cutover_items WHERE ${where.join(' AND ')}
    ORDER BY display_name COLLATE NOCASE, id LIMIT ? OFFSET ?
  `).all(...params, Math.min(filter.limit ?? 100, 500), filter.offset ?? 0) as Array<Record<string, unknown>>;
  const parse = (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : null);
  return {
    total,
    items: rows.map(r => ({
      id: r.id as number,
      provider: r.provider as SyncProvider | null,
      kind: r.kind as CutoverItemKind,
      remoteId: r.remote_id as string | null,
      remoteUid: r.remote_uid as string | null,
      contactId: r.contact_id as number | null,
      displayName: r.display_name as string,
      field: r.field as SyncField | null,
      yelloValue: parse(r.yello_value),
      remoteValue: parse(r.remote_value),
      yelloTs: r.yello_ts as string | null,
      remoteTs: r.remote_ts as string | null,
      reason: r.reason as string | null,
      suggested: r.suggested as string | null,
      resolution: r.resolution as string | null
    }))
  };
}
