import { DatabaseSync } from 'node:sqlite';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Top contacts: reads iMessage's and WhatsApp's databases on this Mac and
// turns them into per-person daily message counts. Only counts and handles
// (phone numbers, emails, WhatsApp IDs, names) come out; message text is
// never selected. Both databases sit in folders macOS protects, so reading
// them needs Full Disk Access for Yello (in dev: the Electron binary or the
// terminal running it).

export type DesktopChannel = 'imessage' | 'whatsapp';

export const DB_PATHS: Record<DesktopChannel, string> = {
  imessage: path.join(os.homedir(), 'Library', 'Messages', 'chat.db'),
  whatsapp: path.join(os.homedir(), 'Library', 'Group Containers', 'group.net.whatsapp.WhatsApp.shared', 'ChatStorage.sqlite'),
};

/** Seconds between the Unix epoch and Apple's (2001-01-01 UTC). */
const APPLE_EPOCH = 978307200;

export interface ReaderStatus {
  state: 'ready' | 'needs_full_disk_access' | 'not_found' | 'error';
  error?: string;
}

export interface ScanResult {
  from: string;
  to: string;
  handles: Array<{ handle: string; displayName?: string | null }>;
  activity: Array<{ handle: string; day: string; sent: number; received: number; group: number }>;
  messages: number;
}

function isPermissionError(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException;
  return e?.code === 'EPERM' || e?.code === 'EACCES' || /authorization denied|operation not permitted|not authorized/i.test(String(e?.message));
}

function open(dbPath: string): DatabaseSync {
  return new DatabaseSync(dbPath, { readOnly: true });
}

/** Whether the database can be read, and if not, why. */
export function checkReadable(dbPath: string): ReaderStatus {
  // macOS lets apps see these files but not open them without Full Disk
  // Access; a plain open says EPERM where SQLite only says "unable to open".
  try {
    fs.closeSync(fs.openSync(dbPath, 'r'));
  } catch (err) {
    if (isPermissionError(err)) return { state: 'needs_full_disk_access' };
    return { state: 'not_found' };
  }
  try {
    const db = open(dbPath);
    try {
      db.prepare('SELECT name FROM sqlite_master LIMIT 1').all();
    } finally {
      db.close();
    }
    return { state: 'ready' };
  } catch (err) {
    if (isPermissionError(err)) return { state: 'needs_full_disk_access' };
    return { state: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

/** YYYY-MM-DD of a Unix time (seconds) in this Mac's time zone. */
export function localDay(unix: number): string {
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The day after a YYYY-MM-DD day. */
export function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + 1, 12).getTime() / 1000);
}

/** Local midnight of a YYYY-MM-DD day, as Unix seconds. */
export function dayStartUnix(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.floor(new Date(y, m - 1, d).getTime() / 1000);
}

function columns(db: DatabaseSync, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map(r => r.name));
}

function requireColumns(db: DatabaseSync, table: string, needed: string[], app: string): Set<string> {
  const have = columns(db, table);
  const missing = needed.filter(c => !have.has(c));
  if (missing.length) {
    throw new Error(`${app}'s database has a layout Yello doesn't know (${table} lacks ${missing.join(', ')}). Please report this.`);
  }
  return have;
}

class Tally {
  handles = new Map<string, string | null>();
  days = new Map<string, { sent: number; received: number; group: number }>();
  messages = 0;

  handle(handle: string, name: string | null = null): void {
    if (!this.handles.get(handle)) this.handles.set(handle, name || this.handles.get(handle) || null);
  }

  add(handle: string, unix: number, field: 'sent' | 'received' | 'group'): void {
    this.handle(handle);
    const key = `${handle}\u0000${localDay(unix)}`;
    const c = this.days.get(key) ?? { sent: 0, received: 0, group: 0 };
    c[field]++;
    this.days.set(key, c);
  }

  result(): ScanResult {
    const activity: ScanResult['activity'] = [];
    let from = '9999-12-31';
    let to = '0000-01-01';
    for (const [key, c] of this.days) {
      const [handle, day] = key.split('\u0000');
      activity.push({ handle, day, ...c });
      if (day < from) from = day;
      if (day > to) to = day;
    }
    if (!activity.length) from = to = localDay(Date.now() / 1000);
    return {
      from,
      to,
      handles: [...this.handles].map(([handle, displayName]) => ({ handle, displayName })),
      activity,
      messages: this.messages,
    };
  }
}

/**
 * iMessage and SMS from chat.db. A chat with one other participant counts
 * sent and received for them; in group chats a received message counts as a
 * group message for its sender and a sent one for every participant.
 * Reactions (tapbacks) and system items (renames, joins) are skipped.
 */
export function readIMessage(dbPath: string, sinceDay: string | null): ScanResult {
  const db = open(dbPath);
  try {
    const messageCols = requireColumns(db, 'message', ['ROWID', 'date', 'is_from_me', 'handle_id'], 'Messages');
    requireColumns(db, 'chat_message_join', ['chat_id', 'message_id'], 'Messages');
    requireColumns(db, 'chat_handle_join', ['chat_id', 'handle_id'], 'Messages');
    requireColumns(db, 'handle', ['ROWID', 'id'], 'Messages');

    // Participants of every chat
    const participants = new Map<number, string[]>();
    for (const row of db.prepare(`
      SELECT chj.chat_id AS chat_id, h.id AS handle FROM chat_handle_join chj JOIN handle h ON h.ROWID = chj.handle_id
    `).all() as Array<{ chat_id: number; handle: string }>) {
      const list = participants.get(row.chat_id) ?? [];
      if (!list.includes(row.handle)) list.push(row.handle);
      participants.set(row.chat_id, list);
    }

    // Modern dates are nanoseconds since 2001; very old ones are seconds. Converted
    // in SQL: nanosecond values don't fit a JavaScript number.
    const unixExpr = `(CASE WHEN m.date > 100000000000 THEN m.date / 1000000000 ELSE m.date END) + ${APPLE_EPOCH}`;
    const filters = [`m.date > 0`];
    if (messageCols.has('associated_message_type')) filters.push('COALESCE(m.associated_message_type, 0) = 0');
    if (messageCols.has('item_type')) filters.push('COALESCE(m.item_type, 0) = 0');
    if (sinceDay) {
      // Compared on the raw column (no conversion) so SQLite can use its date
      // index and a "scan new messages" doesn't read the whole history.
      const sinceSeconds = dayStartUnix(sinceDay) - APPLE_EPOCH;
      const sinceNanos = (BigInt(sinceSeconds) * 1_000_000_000n).toString();
      filters[0] = `(m.date >= ${sinceNanos} OR (m.date <= 100000000000 AND m.date >= ${sinceSeconds}))`;
    }

    const tally = new Tally();
    const statement = db.prepare(`
      SELECT ${unixExpr} AS unix, m.is_from_me AS from_me, cmj.chat_id AS chat_id, h.id AS sender
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      LEFT JOIN handle h ON h.ROWID = m.handle_id
      WHERE ${filters.join(' AND ')}
    `);
    for (const row of statement.iterate() as Iterable<{ unix: number; from_me: number; chat_id: number; sender: string | null }>) {
      const people = participants.get(row.chat_id) ?? [];
      if (!people.length) continue;
      tally.messages++;
      if (people.length === 1) {
        tally.add(people[0], row.unix, row.from_me ? 'sent' : 'received');
      } else if (row.from_me) {
        for (const p of people) tally.add(p, row.unix, 'group');
      } else if (row.sender) {
        tally.add(row.sender, row.unix, 'group');
      }
    }
    return tally.result();
  } finally {
    db.close();
  }
}

/** WhatsApp session types: individual chats and groups; broadcasts and status updates are skipped. */
const WA_INDIVIDUAL = 0;
const WA_GROUP = 1;
/** Message types that aren't messages: group events and system notices. */
const WA_SKIPPED_TYPES = [6, 10];

/**
 * WhatsApp from the Mac app's ChatStorage.sqlite. Same rules as iMessage:
 * 1:1 chats count sent and received; group messages count as group
 * messages for the sender (received) or every member (sent).
 * Contacts identified only by a privacy ID (…@lid) keep their name, so
 * Yello can suggest a match by name.
 */
export function readWhatsApp(dbPath: string, sinceDay: string | null, untilDay: string | null = null): ScanResult {
  const db = open(dbPath);
  try {
    requireColumns(db, 'ZWACHATSESSION', ['Z_PK', 'ZCONTACTJID', 'ZSESSIONTYPE'], 'WhatsApp');
    const sessionCols = columns(db, 'ZWACHATSESSION');
    const messageCols = requireColumns(db, 'ZWAMESSAGE', ['ZCHATSESSION', 'ZISFROMME', 'ZMESSAGEDATE'], 'WhatsApp');
    const memberCols = columns(db, 'ZWAGROUPMEMBER');
    const hasMembers = memberCols.has('ZMEMBERJID') && memberCols.has('ZCHATSESSION');

    interface Session { jid: string; name: string | null; type: number }
    const sessions = new Map<number, Session>();
    for (const row of db.prepare(`
      SELECT Z_PK AS id, ZCONTACTJID AS jid, ${sessionCols.has('ZPARTNERNAME') ? 'ZPARTNERNAME' : 'NULL'} AS name, ZSESSIONTYPE AS type
      FROM ZWACHATSESSION
    `).all() as Array<{ id: number; jid: string | null; name: string | null; type: number }>) {
      if (row.jid) sessions.set(row.id, { jid: row.jid, name: row.name, type: row.type });
    }

    // Group members, and the names WhatsApp shows for people (push names)
    const members = new Map<number, string[]>();
    const memberJid = new Map<number, string>();
    const names = new Map<string, string>();
    if (hasMembers) {
      for (const row of db.prepare(`
        SELECT Z_PK AS id, ZCHATSESSION AS chat, ZMEMBERJID AS jid, ${memberCols.has('ZCONTACTNAME') ? 'ZCONTACTNAME' : 'NULL'} AS name
        FROM ZWAGROUPMEMBER
      `).all() as Array<{ id: number; chat: number; jid: string | null; name: string | null }>) {
        if (!row.jid) continue;
        memberJid.set(row.id, row.jid);
        const list = members.get(row.chat) ?? [];
        list.push(row.jid);
        members.set(row.chat, list);
        if (row.name) names.set(row.jid, row.name);
      }
    }
    try {
      for (const row of db.prepare('SELECT ZJID AS jid, ZPUSHNAME AS name FROM ZWAPROFILEPUSHNAME').all() as Array<{ jid: string; name: string | null }>) {
        if (row.jid && row.name && !names.has(row.jid)) names.set(row.jid, row.name);
      }
    } catch { /* older versions have no push-name table */ }
    for (const s of sessions.values()) if (s.type === WA_INDIVIDUAL && s.name) names.set(s.jid, s.name);

    const filters = ['ZMESSAGEDATE IS NOT NULL'];
    if (messageCols.has('ZMESSAGETYPE')) filters.push(`COALESCE(ZMESSAGETYPE, 0) NOT IN (${WA_SKIPPED_TYPES.join(', ')})`);
    if (sinceDay) filters.push(`ZMESSAGEDATE >= ${dayStartUnix(sinceDay) - APPLE_EPOCH}`);
    if (untilDay) filters.push(`ZMESSAGEDATE < ${dayStartUnix(nextDay(untilDay)) - APPLE_EPOCH}`);
    const groupMemberCol = messageCols.has('ZGROUPMEMBER') ? 'ZGROUPMEMBER' : 'NULL';
    const fromJidCol = messageCols.has('ZFROMJID') ? 'ZFROMJID' : 'NULL';

    const tally = new Tally();
    const statement = db.prepare(`
      SELECT CAST(ZMESSAGEDATE AS INTEGER) + ${APPLE_EPOCH} AS unix, ZISFROMME AS from_me, ZCHATSESSION AS chat,
        ${groupMemberCol} AS member, ${fromJidCol} AS from_jid
      FROM ZWAMESSAGE WHERE ${filters.join(' AND ')}
    `);
    for (const row of statement.iterate() as Iterable<{ unix: number; from_me: number; chat: number; member: number | null; from_jid: string | null }>) {
      const session = sessions.get(row.chat);
      if (!session || session.jid.endsWith('@broadcast') || session.jid.startsWith('status@')) continue;
      if (session.type === WA_INDIVIDUAL) {
        tally.messages++;
        tally.handle(session.jid, names.get(session.jid) ?? null);
        tally.add(session.jid, row.unix, row.from_me ? 'sent' : 'received');
      } else if (session.type === WA_GROUP) {
        if (row.from_me) {
          const people = members.get(row.chat) ?? [];
          if (!people.length) continue;
          tally.messages++;
          for (const jid of people) {
            tally.handle(jid, names.get(jid) ?? null);
            tally.add(jid, row.unix, 'group');
          }
        } else {
          const jid = (row.member != null ? memberJid.get(row.member) : undefined) ?? (row.from_jid?.includes('@') ? row.from_jid : undefined);
          if (!jid || jid === session.jid) continue;
          tally.messages++;
          tally.handle(jid, names.get(jid) ?? null);
          tally.add(jid, row.unix, 'group');
        }
      }
    }
    return tally.result();
  } finally {
    db.close();
  }
}

export function readChannel(channel: DesktopChannel, sinceDay: string | null, dbPath = DB_PATHS[channel]): ScanResult {
  return channel === 'imessage' ? readIMessage(dbPath, sinceDay) : readWhatsApp(dbPath, sinceDay);
}
