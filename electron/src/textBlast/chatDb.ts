import { DatabaseSync } from 'node:sqlite';
import * as os from 'os';
import * as path from 'path';
import type { OutgoingMessage } from './types';

// Messages' own database, read-only, to confirm each text went out. Reading it needs
// Full Disk Access for Yello (in dev: for the Electron binary or the terminal running it).

export const CHAT_DB_PATH = path.join(os.homedir(), 'Library', 'Messages', 'chat.db');

/** Messages timestamps count nanoseconds from 2001-01-01 UTC. */
const APPLE_EPOCH = 978307200;

const LATEST_OUTGOING = `
  SELECT m.ROWID, m.service, m.is_sent, m.is_delivered, m.error
  FROM message m
  LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
  LEFT JOIN chat c ON c.ROWID = cmj.chat_id
  LEFT JOIN handle h ON h.ROWID = m.handle_id
  WHERE m.is_from_me = 1 AND m.date >= ?
    AND (c.chat_identifier = ? OR h.id = ?)
  ORDER BY m.date DESC
  LIMIT 5
`;

function open(dbPath: string): DatabaseSync {
  return new DatabaseSync(dbPath, { readOnly: true });
}

/** Whether the database can be read; the error explains why not (usually missing Full Disk Access). */
export function checkChatDb(dbPath = CHAT_DB_PATH): { ok: boolean; error: string | null } {
  try {
    const db = open(dbPath);
    try {
      db.prepare('SELECT ROWID, is_sent, is_delivered, error, service FROM message LIMIT 1').all();
    } finally {
      db.close();
    }
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** The newest messages sent to `handle` since `sinceUnix` (seconds), newest first. Throws if unreadable. */
export function latestOutgoing(handle: string, sinceUnix: number, dbPath = CHAT_DB_PATH): OutgoingMessage[] {
  const sinceNs = BigInt(Math.floor(sinceUnix - APPLE_EPOCH)) * 1_000_000_000n;
  const db = open(dbPath);
  try {
    const rows = db.prepare(LATEST_OUTGOING).all(sinceNs, handle, handle) as unknown as OutgoingMessage[];
    const seen = new Set<number>();
    return rows.filter((r) => (seen.has(r.ROWID) ? false : (seen.add(r.ROWID), true)));
  } finally {
    db.close();
  }
}
