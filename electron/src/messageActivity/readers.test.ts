import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkReadable, localDay, readIMessage, readWhatsApp } from './readers';

const APPLE_EPOCH = 978307200;
/** Local noon of a day, as Unix seconds (keeps the day stable in any time zone) */
const noon = (day: string) => Math.floor(new Date(`${day}T12:00:00`).getTime() / 1000);
const appleNs = (day: string) => BigInt(noon(day) - APPLE_EPOCH) * 1_000_000_000n;

let dir: string;
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-readers-')); });
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

function byHandle(result: ReturnType<typeof readIMessage>) {
  const out: Record<string, { sent: number; received: number; group: number }> = {};
  for (const a of result.activity) {
    const t = out[a.handle] ?? { sent: 0, received: 0, group: 0 };
    t.sent += a.sent; t.received += a.received; t.group += a.group;
    out[a.handle] = t;
  }
  return out;
}

describe('iMessage reader', () => {
  let dbPath: string;

  beforeAll(() => {
    dbPath = path.join(dir, 'chat.db');
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT, service TEXT);
      CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, chat_identifier TEXT, style INTEGER);
      CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER);
      CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);
      CREATE TABLE message (ROWID INTEGER PRIMARY KEY, text TEXT, date INTEGER, is_from_me INTEGER, handle_id INTEGER,
        associated_message_type INTEGER DEFAULT 0, item_type INTEGER DEFAULT 0);
      INSERT INTO handle VALUES (1, '+14155552671', 'iMessage'), (2, 'bob@icloud.com', 'iMessage'), (3, '+4915112345678', 'SMS');
      INSERT INTO chat VALUES (1, '+14155552671', 45), (2, 'chat123', 43);
      INSERT INTO chat_handle_join VALUES (1, 1), (2, 2), (2, 3);
    `);
    const msg = db.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id, associated_message_type, item_type) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const join = db.prepare('INSERT INTO chat_message_join VALUES (?, ?)');
    const add = (id: number, chat: number, date: bigint | number, fromMe: number, handle: number, assoc = 0, item = 0) => {
      msg.run(id, 'secret text', date, fromMe, handle, assoc, item);
      join.run(chat, id);
    };
    add(1, 1, appleNs('2026-10-01'), 1, 1);
    add(2, 1, appleNs('2026-10-01'), 0, 1);
    add(3, 1, appleNs('2026-10-02'), 0, 1);
    add(4, 1, appleNs('2026-10-02'), 0, 1, 2000); // tapback: skipped
    add(5, 1, appleNs('2026-10-02'), 0, 1, 0, 2); // rename: skipped
    add(6, 2, appleNs('2026-10-03'), 0, 2); // group, from Bob
    add(7, 2, appleNs('2026-10-03'), 1, 0); // group, from me: both members
    add(8, 1, noon('2009-05-01') - APPLE_EPOCH, 0, 1); // old seconds-based date
    db.close();
  });

  it('counts 1:1 and group messages, skipping tapbacks and system items, never reading text', () => {
    const result = readIMessage(dbPath, null);
    expect(result.messages).toBe(6);
    expect(byHandle(result)).toEqual({
      '+14155552671': { sent: 1, received: 3, group: 0 },
      'bob@icloud.com': { sent: 0, received: 0, group: 2 },
      '+4915112345678': { sent: 0, received: 0, group: 1 },
    });
    expect(result.from).toBe('2009-05-01');
    expect(result.to).toBe('2026-10-03');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('reads only from a given day on', () => {
    const result = readIMessage(dbPath, '2026-10-02');
    expect(result.from).toBe('2026-10-02');
    expect(byHandle(result)['+14155552671']).toEqual({ sent: 0, received: 1, group: 0 });
  });
});

describe('WhatsApp reader', () => {
  let dbPath: string;

  beforeAll(() => {
    dbPath = path.join(dir, 'ChatStorage.sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE ZWACHATSESSION (Z_PK INTEGER PRIMARY KEY, ZCONTACTJID TEXT, ZPARTNERNAME TEXT, ZSESSIONTYPE INTEGER);
      CREATE TABLE ZWAGROUPMEMBER (Z_PK INTEGER PRIMARY KEY, ZCHATSESSION INTEGER, ZMEMBERJID TEXT, ZCONTACTNAME TEXT);
      CREATE TABLE ZWAPROFILEPUSHNAME (Z_PK INTEGER PRIMARY KEY, ZJID TEXT, ZPUSHNAME TEXT);
      CREATE TABLE ZWAMESSAGE (Z_PK INTEGER PRIMARY KEY, ZCHATSESSION INTEGER, ZISFROMME INTEGER, ZMESSAGEDATE REAL,
        ZMESSAGETYPE INTEGER, ZGROUPMEMBER INTEGER, ZFROMJID TEXT, ZTEXT TEXT);
      INSERT INTO ZWACHATSESSION VALUES
        (1, '4915112345678@s.whatsapp.net', 'Ada', 0),
        (2, '120363000@g.us', 'Family', 1),
        (3, '777@lid', 'Privacy Pete', 0),
        (4, 'status@broadcast', NULL, 3);
      INSERT INTO ZWAGROUPMEMBER VALUES (1, 2, '4915112345678@s.whatsapp.net', NULL), (2, 2, '14155550000@s.whatsapp.net', 'Cousin');
    `);
    const m = db.prepare('INSERT INTO ZWAMESSAGE (ZCHATSESSION, ZISFROMME, ZMESSAGEDATE, ZMESSAGETYPE, ZGROUPMEMBER, ZTEXT) VALUES (?, ?, ?, ?, ?, ?)');
    const at = (day: string) => noon(day) - APPLE_EPOCH + 0.5;
    m.run(1, 1, at('2026-10-01'), 0, null, 'secret');
    m.run(1, 0, at('2026-10-01'), 0, null, 'secret');
    m.run(1, 0, at('2026-10-01'), 6, null, null); // system notice: skipped
    m.run(2, 0, at('2026-10-02'), 0, 2, 'secret'); // group, from Cousin
    m.run(2, 1, at('2026-10-02'), 0, null, 'secret'); // group, from me: both members
    m.run(3, 0, at('2026-10-03'), 0, null, 'secret');
    m.run(4, 0, at('2026-10-03'), 0, null, 'secret'); // status update: skipped
    db.close();
  });

  it('counts chats and groups, keeps names, skips status and system messages', () => {
    const result = readWhatsApp(dbPath, null);
    expect(result.messages).toBe(5);
    expect(byHandle(result)).toEqual({
      '4915112345678@s.whatsapp.net': { sent: 1, received: 1, group: 1 },
      '14155550000@s.whatsapp.net': { sent: 0, received: 0, group: 2 },
      '777@lid': { sent: 0, received: 1, group: 0 },
    });
    const names = Object.fromEntries(result.handles.map(h => [h.handle, h.displayName]));
    expect(names).toEqual({
      '4915112345678@s.whatsapp.net': 'Ada',
      '14155550000@s.whatsapp.net': 'Cousin',
      '777@lid': 'Privacy Pete',
    });
    expect(result.activity.every(a => a.day === localDay(noon(a.day)))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});

describe('checkReadable', () => {
  it('tells missing files from readable ones', () => {
    expect(checkReadable(path.join(dir, 'nope.db')).state).toBe('not_found');
    expect(checkReadable(path.join(dir, 'chat.db')).state).toBe('ready');
  });
});
