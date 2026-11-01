import type { Database as DatabaseType } from 'better-sqlite3';
import { autoMatchHandles, normalizeHandle, type HandleKind, type MessageChannel, MESSAGE_CHANNELS } from './messageMatching.js';
import { getPhotoUrl } from './photoProcessor.js';

/**
 * Message activity: how much the user messages each person, per channel and
 * day. Every source (Gmail scan, the desktop app's iMessage and WhatsApp
 * readers, Instagram and LinkedIn exports) uploads the same shape of daily
 * counts; this file stores them, ranks contacts by them and runs the
 * "Needs a match" queue. No message text is ever stored.
 */

/** Recency half-life of the score, in days: a message this old counts half. */
export const SCORE_HALF_LIFE_DAYS = 180;
/** Group-chat messages count this much of a direct one. */
export const GROUP_WEIGHT = 0.25;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface IngestHandle {
  handle: string;
  kind?: HandleKind;
  displayName?: string | null;
}

export interface IngestActivity {
  handle: string;
  day: string;
  sent?: number;
  received?: number;
  group?: number;
}

export interface IngestBatch {
  channel: MessageChannel;
  /** Inclusive day range this batch covers; existing counts in it are replaced */
  from: string;
  to: string;
  handles: IngestHandle[];
  activity: IngestActivity[];
  /** Last batch of an import: record the source as imported and re-match handles */
  final?: boolean;
}

export interface IngestResult {
  handles: number;
  days: number;
  matched?: number;
}

export class IngestError extends Error {}

/**
 * Store a batch of daily counts. Idempotent per day range: the channel's rows
 * inside [from, to] are replaced, so re-uploading a period never double-counts.
 */
export function ingestActivity(db: DatabaseType, batch: IngestBatch): IngestResult {
  const { channel, from, to } = batch;
  if (!MESSAGE_CHANNELS.includes(channel)) throw new IngestError(`unknown channel ${channel}`);
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) throw new IngestError('invalid day range');

  // Raw handle → normalized; several raw forms of one number collapse to one key
  const handleKinds = new Map<string, HandleKind>();
  const names = new Map<string, string>();
  const rawToHandle = new Map<string, string>();
  for (const h of batch.handles) {
    const normalized = normalizeHandle(channel, h.handle, h.kind);
    if (!normalized) continue;
    rawToHandle.set(h.handle, normalized.handle);
    handleKinds.set(normalized.handle, normalized.kind);
    const name = h.displayName?.trim();
    if (name) names.set(normalized.handle, name);
  }

  const totals = new Map<string, { sent: number; received: number; group: number }>();
  for (const a of batch.activity) {
    if (!DAY_RE.test(a.day) || a.day < from || a.day > to) throw new IngestError(`day ${a.day} outside ${from}..${to}`);
    let handle = rawToHandle.get(a.handle);
    if (!handle) {
      const normalized = normalizeHandle(channel, a.handle);
      if (!normalized) continue;
      handle = normalized.handle;
      rawToHandle.set(a.handle, handle);
      handleKinds.set(handle, normalized.kind);
    }
    const key = `${handle}\u0000${a.day}`;
    const t = totals.get(key) ?? { sent: 0, received: 0, group: 0 };
    t.sent += Math.max(0, Math.floor(a.sent ?? 0));
    t.received += Math.max(0, Math.floor(a.received ?? 0));
    t.group += Math.max(0, Math.floor(a.group ?? 0));
    totals.set(key, t);
  }

  const upsertHandle = db.prepare(`
    INSERT INTO message_handles (channel, handle, handle_kind, display_name)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(channel, handle) DO UPDATE SET
      display_name = COALESCE(excluded.display_name, message_handles.display_name),
      handle_kind = excluded.handle_kind
  `);
  const insertActivity = db.prepare(`
    INSERT INTO message_activity (channel, handle, day, sent, received, group_messages) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result: IngestResult = { handles: handleKinds.size, days: totals.size };
  db.transaction(() => {
    db.prepare('DELETE FROM message_activity WHERE channel = ? AND day BETWEEN ? AND ?').run(channel, from, to);
    for (const [handle, kind] of handleKinds) upsertHandle.run(channel, handle, kind, names.get(handle) ?? null);
    for (const [key, t] of totals) {
      if (!t.sent && !t.received && !t.group) continue;
      const [handle, day] = key.split('\u0000');
      insertActivity.run(channel, handle, day, t.sent, t.received, t.group);
    }
    db.prepare(`
      INSERT INTO message_sources (channel, covered_from, covered_through) VALUES (?, ?, ?)
      ON CONFLICT(channel) DO UPDATE SET
        covered_from = CASE WHEN message_sources.covered_from IS NULL OR excluded.covered_from < message_sources.covered_from
          THEN excluded.covered_from ELSE message_sources.covered_from END,
        covered_through = CASE WHEN message_sources.covered_through IS NULL OR excluded.covered_through > message_sources.covered_through
          THEN excluded.covered_through ELSE message_sources.covered_through END
    `).run(channel, from, to);
    if (batch.final) {
      db.prepare(`
        UPDATE message_sources SET last_imported_at = datetime('now'), status = 'idle', error = NULL WHERE channel = ?
      `).run(channel);
    }
  })();

  if (batch.final) result.matched = autoMatchHandles(db);
  return result;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface MessageSourceStatus {
  channel: MessageChannel;
  status: 'idle' | 'running' | 'failed';
  coveredFrom: string | null;
  coveredThrough: string | null;
  lastImportedAt: string | null;
  progressDone: number | null;
  progressTotal: number | null;
  error: string | null;
  handles: number;
  matchedHandles: number;
  messages: number;
}

export function getSources(db: DatabaseType): MessageSourceStatus[] {
  const rows = db.prepare('SELECT * FROM message_sources').all() as Array<{
    channel: MessageChannel; status: MessageSourceStatus['status']; covered_from: string | null;
    covered_through: string | null; last_imported_at: string | null; progress_done: number | null;
    progress_total: number | null; error: string | null;
  }>;
  const byChannel = new Map(rows.map(r => [r.channel, r]));
  const handleCounts = new Map((db.prepare(`
    SELECT channel, COUNT(*) AS total, SUM(contact_id IS NOT NULL) AS matched FROM message_handles GROUP BY channel
  `).all() as Array<{ channel: string; total: number; matched: number }>).map(r => [r.channel, r]));
  const messageCounts = new Map((db.prepare(`
    SELECT channel, SUM(sent + received + group_messages) AS total FROM message_activity GROUP BY channel
  `).all() as Array<{ channel: string; total: number }>).map(r => [r.channel, r.total]));

  return MESSAGE_CHANNELS.map(channel => {
    const r = byChannel.get(channel);
    return {
      channel,
      status: r?.status ?? 'idle',
      coveredFrom: r?.covered_from ?? null,
      coveredThrough: r?.covered_through ?? null,
      lastImportedAt: r?.last_imported_at ? `${r.last_imported_at.replace(' ', 'T')}Z` : null,
      progressDone: r?.progress_done ?? null,
      progressTotal: r?.progress_total ?? null,
      error: r?.error ?? null,
      handles: handleCounts.get(channel)?.total ?? 0,
      matchedHandles: handleCounts.get(channel)?.matched ?? 0,
      messages: messageCounts.get(channel) ?? 0,
    };
  });
}

export function setSourceStatus(
  db: DatabaseType,
  channel: MessageChannel,
  fields: { status?: MessageSourceStatus['status']; progressDone?: number | null; progressTotal?: number | null; error?: string | null }
): void {
  db.prepare(`INSERT INTO message_sources (channel) VALUES (?) ON CONFLICT(channel) DO NOTHING`).run(channel);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (fields.status !== undefined) { sets.push('status = ?'); values.push(fields.status); }
  if (fields.progressDone !== undefined) { sets.push('progress_done = ?'); values.push(fields.progressDone); }
  if (fields.progressTotal !== undefined) { sets.push('progress_total = ?'); values.push(fields.progressTotal); }
  if (fields.error !== undefined) { sets.push('error = ?'); values.push(fields.error); }
  if (!sets.length) return;
  db.prepare(`UPDATE message_sources SET ${sets.join(', ')} WHERE channel = ?`).run(...values, channel);
}

/** Forget everything imported from one channel (counts, handles, links). */
export function clearChannel(db: DatabaseType, channel: MessageChannel): void {
  db.transaction(() => {
    db.prepare('DELETE FROM message_activity WHERE channel = ?').run(channel);
    db.prepare('DELETE FROM message_handles WHERE channel = ?').run(channel);
    db.prepare('DELETE FROM message_sources WHERE channel = ?').run(channel);
  })();
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

export type RankMode = 'score' | 'count';

export interface ChannelCounts {
  sent: number;
  received: number;
  group: number;
}

export interface TopContact {
  contactId: number;
  displayName: string;
  photoUrl: string | null;
  photoHash: string | null;
  score: number;
  total: number;
  sent: number;
  received: number;
  group: number;
  lastDay: string;
  channels: Partial<Record<MessageChannel, ChannelCounts>>;
  /** Messages per month, oldest first, ending with the current month */
  months: number[];
}

export interface TopOptions {
  mode: RankMode;
  /** Only days within this many days before today; null for all time */
  windowDays: number | null;
  channel?: MessageChannel;
  limit: number;
  offset: number;
  /** YYYY-MM-DD, for tests; defaults to the server's today */
  today?: string;
}

const MONTHS_IN_SERIES = 12;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * How much one exchange is worth: recent messages count more (half-life
 * SCORE_HALF_LIFE_DAYS), group messages less, and one-way traffic is damped
 * by the reciprocity factor 0.5 + 0.5·min/max of sent and received.
 */
export function scoreOf(weightedSent: number, weightedReceived: number, weightedGroup: number): number {
  const high = Math.max(weightedSent, weightedReceived);
  const reciprocity = high > 0 ? 0.5 + 0.5 * Math.min(weightedSent, weightedReceived) / high : 0.5;
  return (weightedSent + weightedReceived) * reciprocity + GROUP_WEIGHT * weightedGroup;
}

export function decay(ageDays: number): number {
  return Math.pow(0.5, Math.max(0, ageDays) / SCORE_HALF_LIFE_DAYS);
}

export function getTopContacts(db: DatabaseType, options: TopOptions): { contacts: TopContact[]; total: number } {
  const today = options.today ?? todayString();
  const since = options.windowDays ? shiftDay(today, -options.windowDays + 1) : '0000-00-00';

  const rows = db.prepare(`
    SELECT h.contact_id, c.display_name, c.photo_hash, a.channel, a.day, a.sent, a.received, a.group_messages
    FROM message_activity a
    JOIN message_handles h ON h.channel = a.channel AND h.handle = a.handle
    JOIN contacts c ON c.id = h.contact_id
    WHERE h.contact_id IS NOT NULL AND c.archived_at IS NULL AND a.day >= ? AND a.day <= ?
      ${options.channel ? 'AND a.channel = ?' : ''}
  `).all(...[since, today, ...(options.channel ? [options.channel] : [])]) as Array<{
    contact_id: number; display_name: string; photo_hash: string | null; channel: MessageChannel;
    day: string; sent: number; received: number; group_messages: number;
  }>;

  const thisMonth = today.slice(0, 7);
  const monthIndex = (day: string): number => {
    const [y, m] = day.split('-').map(Number);
    const [ty, tm] = thisMonth.split('-').map(Number);
    return MONTHS_IN_SERIES - 1 - ((ty - y) * 12 + (tm - m));
  };

  interface Acc extends TopContact { wSent: number; wReceived: number; wGroup: number }
  const byContact = new Map<number, Acc>();
  for (const row of rows) {
    let acc = byContact.get(row.contact_id);
    if (!acc) {
      acc = {
        contactId: row.contact_id, displayName: row.display_name, photoUrl: getPhotoUrl(row.photo_hash, 'small'), photoHash: row.photo_hash,
        score: 0, total: 0, sent: 0, received: 0, group: 0, lastDay: row.day, channels: {},
        months: new Array(MONTHS_IN_SERIES).fill(0), wSent: 0, wReceived: 0, wGroup: 0,
      };
      byContact.set(row.contact_id, acc);
    }
    const w = decay(daysBetween(row.day, today));
    acc.wSent += row.sent * w;
    acc.wReceived += row.received * w;
    acc.wGroup += row.group_messages * w;
    acc.sent += row.sent;
    acc.received += row.received;
    acc.group += row.group_messages;
    const count = row.sent + row.received + row.group_messages;
    acc.total += count;
    if (row.day > acc.lastDay) acc.lastDay = row.day;
    const ch = acc.channels[row.channel] ?? { sent: 0, received: 0, group: 0 };
    ch.sent += row.sent;
    ch.received += row.received;
    ch.group += row.group_messages;
    acc.channels[row.channel] = ch;
    const mi = monthIndex(row.day);
    if (mi >= 0 && mi < MONTHS_IN_SERIES) acc.months[mi] += count;
  }

  const contacts: TopContact[] = [...byContact.values()].map(({ wSent, wReceived, wGroup, ...c }) => ({
    ...c,
    score: Math.round(scoreOf(wSent, wReceived, wGroup) * 10) / 10,
  }));
  contacts.sort(options.mode === 'score'
    ? (a, b) => b.score - a.score || b.total - a.total
    : (a, b) => b.total - a.total || b.lastDay.localeCompare(a.lastDay));

  return { contacts: contacts.slice(options.offset, options.offset + options.limit), total: contacts.length };
}

// ---------------------------------------------------------------------------
// Per-contact summary
// ---------------------------------------------------------------------------

export interface ContactMessageStats {
  total: number;
  last30Days: number;
  lastDay: string | null;
  channels: Array<{ channel: MessageChannel; sent: number; received: number; group: number; lastDay: string; handles: string[] }>;
}

export function getContactMessageStats(db: DatabaseType, contactId: number, today = todayString()): ContactMessageStats {
  const since30 = shiftDay(today, -29);
  const rows = db.prepare(`
    SELECT a.channel, a.handle, SUM(a.sent) AS sent, SUM(a.received) AS received, SUM(a.group_messages) AS grp,
      MAX(a.day) AS last_day,
      SUM(CASE WHEN a.day >= ? THEN a.sent + a.received + a.group_messages ELSE 0 END) AS recent
    FROM message_activity a
    JOIN message_handles h ON h.channel = a.channel AND h.handle = a.handle
    WHERE h.contact_id = ?
    GROUP BY a.channel, a.handle
  `).all(since30, contactId) as Array<{
    channel: MessageChannel; handle: string; sent: number; received: number; grp: number; last_day: string; recent: number;
  }>;

  const channels = new Map<MessageChannel, ContactMessageStats['channels'][number]>();
  let total = 0;
  let last30Days = 0;
  let lastDay: string | null = null;
  for (const r of rows) {
    const ch = channels.get(r.channel) ?? { channel: r.channel, sent: 0, received: 0, group: 0, lastDay: r.last_day, handles: [] };
    ch.sent += r.sent;
    ch.received += r.received;
    ch.group += r.grp;
    if (r.last_day > ch.lastDay) ch.lastDay = r.last_day;
    ch.handles.push(displayHandle(r.handle));
    channels.set(r.channel, ch);
    total += r.sent + r.received + r.grp;
    last30Days += r.recent;
    if (!lastDay || r.last_day > lastDay) lastDay = r.last_day;
  }
  return {
    total,
    last30Days,
    lastDay,
    channels: [...channels.values()].sort((a, b) => (b.sent + b.received + b.group) - (a.sent + a.received + a.group)),
  };
}

// ---------------------------------------------------------------------------
// "Needs a match" queue
// ---------------------------------------------------------------------------

export type HandleListStatus = 'unmatched' | 'matched' | 'ignored';

export interface HandleListItem {
  channel: MessageChannel;
  handle: string;
  /** The handle as people read it (no opaque: prefix) */
  label: string;
  kind: HandleKind;
  displayName: string | null;
  sent: number;
  received: number;
  group: number;
  lastDay: string | null;
  contact: { id: number; displayName: string; photoUrl: string | null } | null;
  matchSource: string | null;
  suggestion: { id: number; displayName: string; photoUrl: string | null } | null;
}

export function displayHandle(handle: string): string {
  return handle.startsWith('opaque:') ? handle.slice('opaque:'.length) : handle;
}

/**
 * Handles for the review queue, busiest first. Unmatched only lists people
 * the user wrote to at least once, which keeps out newsletters and spam.
 */
export function listHandles(
  db: DatabaseType,
  options: { status: HandleListStatus; channel?: MessageChannel; limit: number; offset: number }
): { handles: HandleListItem[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.status === 'unmatched') {
    where.push(`h.contact_id IS NULL AND COALESCE(h.match_source, '') != 'ignored'`, 'stats.sent > 0');
  } else if (options.status === 'matched') {
    where.push('h.contact_id IS NOT NULL');
  } else {
    where.push(`h.match_source = 'ignored'`);
  }
  if (options.channel) { where.push('h.channel = ?'); params.push(options.channel); }

  const base = `
    FROM message_handles h
    JOIN (
      SELECT channel, handle, SUM(sent) AS sent, SUM(received) AS received, SUM(group_messages) AS grp, MAX(day) AS last_day
      FROM message_activity GROUP BY channel, handle
    ) stats ON stats.channel = h.channel AND stats.handle = h.handle
    LEFT JOIN contacts c ON c.id = h.contact_id
    LEFT JOIN contacts s ON s.id = h.suggested_contact_id AND s.archived_at IS NULL
    WHERE ${where.join(' AND ')}
  `;
  const total = (db.prepare(`SELECT COUNT(*) AS n ${base}`).get(...params) as { n: number }).n;
  const rows = db.prepare(`
    SELECT h.channel, h.handle, h.handle_kind, h.display_name, h.match_source,
      stats.sent, stats.received, stats.grp, stats.last_day,
      c.id AS contact_id, c.display_name AS contact_name, c.photo_hash AS contact_photo,
      s.id AS suggestion_id, s.display_name AS suggestion_name, s.photo_hash AS suggestion_photo
    ${base}
    ORDER BY (stats.sent + stats.received + stats.grp) DESC, stats.last_day DESC
    LIMIT ? OFFSET ?
  `).all(...params, options.limit, options.offset) as Array<{
    channel: MessageChannel; handle: string; handle_kind: HandleKind; display_name: string | null; match_source: string | null;
    sent: number; received: number; grp: number; last_day: string | null;
    contact_id: number | null; contact_name: string | null; contact_photo: string | null;
    suggestion_id: number | null; suggestion_name: string | null; suggestion_photo: string | null;
  }>;

  return {
    total,
    handles: rows.map(r => ({
      channel: r.channel,
      handle: r.handle,
      label: displayHandle(r.handle),
      kind: r.handle_kind,
      displayName: r.display_name,
      sent: r.sent,
      received: r.received,
      group: r.grp,
      lastDay: r.last_day,
      matchSource: r.match_source,
      contact: r.contact_id ? { id: r.contact_id, displayName: r.contact_name ?? '', photoUrl: getPhotoUrl(r.contact_photo, 'small') } : null,
      suggestion: r.suggestion_id && !r.contact_id
        ? { id: r.suggestion_id, displayName: r.suggestion_name ?? '', photoUrl: getPhotoUrl(r.suggestion_photo, 'small') }
        : null,
    })),
  };
}

export interface HandleRef {
  channel: MessageChannel;
  handle: string;
}

/**
 * Link handles to a contact by hand. With addToContact, the phone, email or
 * profile is also added to the contact (when it isn't there yet), which then
 * syncs to iCloud/Google like any edit.
 */
export function linkHandles(db: DatabaseType, refs: HandleRef[], contactId: number, addToContact: boolean): { linked: number; added: number } {
  const contact = db.prepare('SELECT id FROM contacts WHERE id = ?').get(contactId);
  if (!contact) throw new IngestError('contact not found');

  const getHandle = db.prepare('SELECT channel, handle, handle_kind FROM message_handles WHERE channel = ? AND handle = ?');
  const link = db.prepare(`
    UPDATE message_handles SET contact_id = ?, match_source = 'manual', suggested_contact_id = NULL, updated_at = datetime('now')
    WHERE channel = ? AND handle = ?
  `);
  let linked = 0;
  let added = 0;
  db.transaction(() => {
    for (const ref of refs) {
      const row = getHandle.get(ref.channel, ref.handle) as { channel: MessageChannel; handle: string; handle_kind: HandleKind } | undefined;
      if (!row) continue;
      linked += link.run(contactId, ref.channel, ref.handle).changes;
      if (addToContact && addDetailToContact(db, contactId, row)) added++;
    }
    if (added) db.prepare(`UPDATE contacts SET updated_at = datetime('now') WHERE id = ?`).run(contactId);
  })();
  return { linked, added };
}

function addDetailToContact(db: DatabaseType, contactId: number, row: { channel: MessageChannel; handle: string; handle_kind: HandleKind }): boolean {
  switch (row.handle_kind) {
    case 'email': {
      const exists = db.prepare('SELECT 1 FROM contact_emails WHERE contact_id = ? AND lower(email) = ?').get(contactId, row.handle);
      if (exists) return false;
      const hasAny = db.prepare('SELECT 1 FROM contact_emails WHERE contact_id = ?').get(contactId);
      db.prepare('INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, ?)')
        .run(contactId, row.handle, 'other', hasAny ? 0 : 1);
      return true;
    }
    case 'phone': {
      const exists = db.prepare('SELECT 1 FROM contact_phones WHERE contact_id = ? AND phone = ?').get(contactId, row.handle);
      if (exists) return false;
      const hasAny = db.prepare('SELECT 1 FROM contact_phones WHERE contact_id = ?').get(contactId);
      db.prepare(`
        INSERT INTO contact_phones (contact_id, phone, phone_display, country_code, type, is_primary) VALUES (?, ?, ?, NULL, ?, ?)
      `).run(contactId, row.handle, row.handle, 'mobile', hasAny ? 0 : 1);
      return true;
    }
    case 'username': {
      const exists = db.prepare(`
        SELECT 1 FROM contact_social_profiles WHERE contact_id = ? AND lower(platform) = 'instagram' AND lower(username) = ?
      `).get(contactId, row.handle);
      if (exists) return false;
      db.prepare('INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url) VALUES (?, ?, ?, ?)')
        .run(contactId, 'instagram', row.handle, `https://www.instagram.com/${row.handle}`);
      return true;
    }
    case 'url': {
      const slug = row.handle.replace(/^linkedin\.com\/in\//, '');
      const exists = db.prepare(`
        SELECT 1 FROM contact_social_profiles WHERE contact_id = ? AND lower(platform) = 'linkedin'
          AND (lower(username) = ? OR lower(profile_url) LIKE ?)
      `).get(contactId, slug, `%linkedin.com/in/${slug}%`);
      if (exists) return false;
      db.prepare('INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url) VALUES (?, ?, ?, ?)')
        .run(contactId, 'linkedin', slug, `https://www.linkedin.com/in/${slug}`);
      return true;
    }
    case 'opaque':
      return false;
  }
}

/** Hide handles from the queue for good (a bot, a shop, someone not worth a contact). */
export function ignoreHandles(db: DatabaseType, refs: HandleRef[]): number {
  const stmt = db.prepare(`
    UPDATE message_handles SET contact_id = NULL, match_source = 'ignored', suggested_contact_id = NULL, updated_at = datetime('now')
    WHERE channel = ? AND handle = ?
  `);
  let n = 0;
  db.transaction(() => { for (const r of refs) n += stmt.run(r.channel, r.handle).changes; })();
  return n;
}

/** Undo a link or an ignore. An undone automatic link stays undone ('unlinked') instead of coming back. */
export function unlinkHandles(db: DatabaseType, refs: HandleRef[]): number {
  const stmt = db.prepare(`
    UPDATE message_handles SET contact_id = NULL,
      match_source = CASE WHEN match_source = 'ignored' THEN NULL ELSE 'unlinked' END,
      suggested_contact_id = NULL, updated_at = datetime('now')
    WHERE channel = ? AND handle = ?
  `);
  let n = 0;
  db.transaction(() => { for (const r of refs) n += stmt.run(r.channel, r.handle).changes; })();
  return n;
}

/** Link every unmatched handle that has a name suggestion to it. */
export function acceptAllSuggestions(db: DatabaseType, channel?: MessageChannel): number {
  return db.prepare(`
    UPDATE message_handles SET contact_id = suggested_contact_id, match_source = 'manual', suggested_contact_id = NULL,
      updated_at = datetime('now')
    WHERE contact_id IS NULL AND suggested_contact_id IS NOT NULL AND COALESCE(match_source, '') != 'ignored'
      ${channel ? 'AND channel = ?' : ''}
  `).run(...(channel ? [channel] : [])).changes;
}
