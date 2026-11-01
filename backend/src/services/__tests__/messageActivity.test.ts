import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import type { Database as DatabaseType } from 'better-sqlite3';
import { getUserDatabase, closeAllUserDatabases } from '../userDatabase.js';
import {
  toE164, normalizeHandle, normalizeLinkedInUrl, normalizeInstagramUsername, autoMatchHandles,
} from '../messageMatching.js';
import {
  ingestActivity, getTopContacts, listHandles, linkHandles, ignoreHandles, unlinkHandles,
  acceptAllSuggestions, getContactMessageStats, getSources, scoreOf, decay, clearChannel,
} from '../messageActivityService.js';
import { parseAddressList, newTally, tallyMessage, saveTally, yearWindows, scanRange } from '../gmailActivityService.js';
import type { GmailMessage } from '../emailSyncService.js';

describe('handle normalization', () => {
  it('turns phone numbers into E.164', () => {
    expect(toE164('(415) 555-2671')).toBe('+14155552671');
    expect(toE164('+49 151 12345678')).toBe('+4915112345678');
    expect(toE164('0049 151 12345678')).toBe('+4915112345678');
    expect(toE164('someone@icloud.com')).toBeNull();
  });

  it('normalizes per channel', () => {
    expect(normalizeHandle('imessage', 'Ada@iCloud.com')).toEqual({ handle: 'ada@icloud.com', kind: 'email' });
    expect(normalizeHandle('imessage', '+1 415 555 2671')).toEqual({ handle: '+14155552671', kind: 'phone' });
    expect(normalizeHandle('whatsapp', '4915112345678@s.whatsapp.net')).toEqual({ handle: '+4915112345678', kind: 'phone' });
    expect(normalizeHandle('whatsapp', '123456789@lid')).toEqual({ handle: 'opaque:123456789@lid', kind: 'opaque' });
    expect(normalizeHandle('gmail', 'not an email')).toBeNull();
  });

  it('reads LinkedIn URLs and Instagram usernames in any form', () => {
    expect(normalizeLinkedInUrl('https://www.linkedin.com/in/Ada-Lovelace/')).toBe('linkedin.com/in/ada-lovelace');
    expect(normalizeLinkedInUrl('linkedin.com/in/ada-lovelace?trk=x')).toBe('linkedin.com/in/ada-lovelace');
    expect(normalizeLinkedInUrl('https://example.com')).toBeNull();
    expect(normalizeInstagramUsername('@Ada.Codes')).toBe('ada.codes');
    expect(normalizeInstagramUsername('https://www.instagram.com/ada.codes/')).toBe('ada.codes');
  });
});

describe('scoring', () => {
  it('halves every 180 days and damps one-way traffic', () => {
    expect(decay(0)).toBe(1);
    expect(decay(180)).toBeCloseTo(0.5);
    expect(scoreOf(10, 10, 0)).toBe(20);
    expect(scoreOf(20, 0, 0)).toBe(10);
    expect(scoreOf(0, 0, 8)).toBe(2);
  });
});

describe('message activity', () => {
  let tmpDir: string;
  let db: DatabaseType;
  const ids: Record<string, number> = {};

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-messages-test-'));
    process.env.USER_DATA_PATH = tmpDir;
    db = getUserDatabase(1);
  });

  afterAll(() => {
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    for (const t of ['message_activity', 'message_handles', 'message_sources', 'contacts']) db.prepare(`DELETE FROM ${t}`).run();
    const add = (key: string, name: string, archived: string | null = null) => {
      ids[key] = db.prepare('INSERT INTO contacts (display_name, archived_at) VALUES (?, ?)').run(name, archived).lastInsertRowid as number;
    };
    add('ada', 'Ada Lovelace');
    add('bob', 'Bob Builder');
    add('carol', 'Carol Danvers');
    add('dup1', 'Sam Smith');
    add('dup2', 'Sam Smith');
    add('old', 'Old Friend', '2026-01-01');
    db.prepare(`INSERT INTO contact_phones (contact_id, phone, phone_display) VALUES (?, ?, ?)`).run(ids.ada, '+14155552671', '(415) 555-2671');
    // Stored without country code: matches by its last digits
    db.prepare(`INSERT INTO contact_phones (contact_id, phone, phone_display) VALUES (?, ?, ?)`).run(ids.bob, '0151 12345678', '0151 12345678');
    db.prepare(`INSERT INTO contact_emails (contact_id, email) VALUES (?, ?)`).run(ids.carol, 'Carol@Example.com');
    db.prepare(`INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url) VALUES (?, ?, ?, ?)`)
      .run(ids.carol, 'linkedin', 'carol', 'https://www.linkedin.com/in/carol-d/');
    db.prepare(`INSERT INTO contact_phones (contact_id, phone, phone_display) VALUES (?, ?, ?)`).run(ids.old, '+15550001111', 'x');
  });

  const imessage = (from: string, to: string, activity: Array<[string, string, number, number, number?]>, final = true) =>
    ingestActivity(db, {
      channel: 'imessage', from, to, final,
      handles: [...new Set(activity.map(a => a[0]))].map(handle => ({ handle })),
      activity: activity.map(([handle, day, sent, received, group]) => ({ handle, day, sent, received, group })),
    });

  it('matches by phone (exact and by last digits) and email; skips archived contacts', () => {
    imessage('2026-10-01', '2026-10-31', [
      ['(415) 555-2671', '2026-10-30', 3, 4],
      ['+49 151 12345678', '2026-10-29', 1, 1],
      ['carol@example.com', '2026-10-28', 2, 0],
      ['+1 555 000 1111', '2026-10-27', 5, 5],
    ]);
    const handles = db.prepare('SELECT handle, contact_id, match_source FROM message_handles ORDER BY handle').all();
    expect(handles).toEqual([
      { handle: '+14155552671', contact_id: ids.ada, match_source: 'auto_phone' },
      { handle: '+15550001111', contact_id: null, match_source: null },
      { handle: '+4915112345678', contact_id: ids.bob, match_source: 'auto_phone' },
      { handle: 'carol@example.com', contact_id: ids.carol, match_source: 'auto_email' },
    ]);
  });

  it('replaces counts in the uploaded range instead of adding to them', () => {
    imessage('2026-10-01', '2026-10-31', [['+14155552671', '2026-10-30', 3, 4]]);
    imessage('2026-10-01', '2026-10-31', [['+14155552671', '2026-10-30', 3, 4]]);
    // A later batch for another range leaves October alone
    imessage('2026-11-01', '2026-11-30', [['+14155552671', '2026-11-01', 1, 0]]);
    const top = getTopContacts(db, { mode: 'count', windowDays: null, limit: 10, offset: 0, today: '2026-11-01' });
    expect(top.contacts[0]).toMatchObject({ contactId: ids.ada, total: 8, sent: 4, received: 4 });
    expect(getSources(db).find(s => s.channel === 'imessage')).toMatchObject({
      coveredFrom: '2026-10-01', coveredThrough: '2026-11-30', messages: 8, handles: 1, matchedHandles: 1,
    });
  });

  it('rejects days outside the batch range', () => {
    expect(() => imessage('2026-10-01', '2026-10-31', [['+14155552671', '2026-11-02', 1, 1]])).toThrow(/outside/);
  });

  it('ranks by recency-weighted score or by count within a window, across channels', () => {
    imessage('2025-01-01', '2026-10-31', [
      ['+14155552671', '2025-01-15', 50, 50], // Ada: lots, long ago
      ['+4915112345678', '2026-10-30', 5, 5], // Bob: a little, recently
    ]);
    ingestActivity(db, {
      channel: 'linkedin', from: '2026-10-01', to: '2026-10-31', final: true,
      handles: [{ handle: 'https://linkedin.com/in/carol-d', displayName: 'Carol Danvers' }],
      activity: [{ handle: 'https://linkedin.com/in/carol-d', day: '2026-10-20', sent: 1, received: 1 }],
    });
    const today = '2026-10-31';
    const byScore = getTopContacts(db, { mode: 'score', windowDays: null, limit: 10, offset: 0, today });
    // Bob's 10 messages from yesterday outrank Ada's 100 from ~650 days ago
    expect(byScore.contacts.map(c => c.contactId)).toEqual([ids.bob, ids.ada, ids.carol]);
    expect(byScore.contacts[1].score).toBeCloseTo(100 * decay(654), 0);

    const byCount = getTopContacts(db, { mode: 'count', windowDays: null, limit: 10, offset: 0, today });
    expect(byCount.contacts.map(c => c.contactId)).toEqual([ids.ada, ids.bob, ids.carol]);

    const recent = getTopContacts(db, { mode: 'count', windowDays: 30, limit: 10, offset: 0, today });
    expect(recent.contacts.map(c => [c.contactId, c.total])).toEqual([[ids.bob, 10], [ids.carol, 2]]);
    expect(recent.contacts[1].channels).toEqual({ linkedin: { sent: 1, received: 1, group: 0 } });
    expect(recent.contacts[0].months[11]).toBe(10);

    const onlyLinkedIn = getTopContacts(db, { mode: 'count', windowDays: null, channel: 'linkedin', limit: 10, offset: 0, today });
    expect(onlyLinkedIn.total).toBe(1);
  });

  it('queues unmatched people the user wrote to, with name suggestions', () => {
    ingestActivity(db, {
      channel: 'whatsapp', from: '2026-10-01', to: '2026-10-31', final: true,
      handles: [
        { handle: '111@lid', kind: 'opaque', displayName: 'Ada Lovelace' },
        { handle: '222@lid', kind: 'opaque', displayName: 'Sam Smith' },
        { handle: '4930999999@s.whatsapp.net', displayName: 'Shop Bot' },
      ],
      activity: [
        { handle: '111@lid', day: '2026-10-10', sent: 2, received: 9 },
        { handle: '222@lid', day: '2026-10-10', sent: 1, received: 0 },
        { handle: '4930999999@s.whatsapp.net', day: '2026-10-10', sent: 0, received: 30 }, // never written to
      ],
    });
    const queue = listHandles(db, { status: 'unmatched', limit: 10, offset: 0 });
    expect(queue.total).toBe(2);
    expect(queue.handles[0]).toMatchObject({ label: '111@lid', displayName: 'Ada Lovelace', suggestion: { id: ids.ada } });
    expect(queue.handles[1].suggestion).toBeNull(); // two Sam Smiths: no suggestion

    expect(acceptAllSuggestions(db)).toBe(1);
    expect(listHandles(db, { status: 'unmatched', limit: 10, offset: 0 }).total).toBe(1);
    expect(getContactMessageStats(db, ids.ada, '2026-10-31')).toMatchObject({ total: 11, last30Days: 11, lastDay: '2026-10-10' });
  });

  it('can list name matches first and counts them', () => {
    ingestActivity(db, {
      channel: 'whatsapp', from: '2026-10-01', to: '2026-10-31', final: true,
      handles: [
        { handle: '111@lid', kind: 'opaque', displayName: 'Ada Lovelace' },
        { handle: '222@lid', kind: 'opaque', displayName: 'Sam Smith' },
      ],
      activity: [
        { handle: '111@lid', day: '2026-10-10', sent: 1, received: 1 },
        { handle: '222@lid', day: '2026-10-10', sent: 5, received: 20 },
      ],
    });
    const busiest = listHandles(db, { status: 'unmatched', limit: 10, offset: 0 });
    expect(busiest.handles.map(h => h.label)).toEqual(['222@lid', '111@lid']);
    expect(busiest.suggestions).toBe(1);

    const matchesFirst = listHandles(db, { status: 'unmatched', limit: 10, offset: 0, sort: 'suggestions' });
    expect(matchesFirst.handles.map(h => h.label)).toEqual(['111@lid', '222@lid']);
    expect(matchesFirst.total).toBe(2);
  });

  it('links by hand (adding the detail), ignores, and keeps undone auto links undone', () => {
    imessage('2026-10-01', '2026-10-31', [['+1 555 000 2222', '2026-10-10', 4, 4], ['(415) 555-2671', '2026-10-10', 1, 1]]);
    const ref = { channel: 'imessage' as const, handle: '+15550002222' };

    expect(linkHandles(db, [ref], ids.carol, true)).toEqual({ linked: 1, added: 1 });
    expect(db.prepare('SELECT phone FROM contact_phones WHERE contact_id = ?').all(ids.carol)).toEqual([{ phone: '+15550002222' }]);
    expect(linkHandles(db, [ref], ids.carol, true)).toEqual({ linked: 1, added: 0 });

    // Unlinking Ada's automatic match sticks, even though the number still matches
    unlinkHandles(db, [{ channel: 'imessage', handle: '+14155552671' }]);
    autoMatchHandles(db);
    expect(db.prepare(`SELECT contact_id, match_source FROM message_handles WHERE handle = '+14155552671'`).get())
      .toEqual({ contact_id: null, match_source: 'unlinked' });

    ignoreHandles(db, [{ channel: 'imessage', handle: '+14155552671' }]);
    expect(listHandles(db, { status: 'unmatched', limit: 10, offset: 0 }).total).toBe(0);
    expect(listHandles(db, { status: 'ignored', limit: 10, offset: 0 }).total).toBe(1);
  });

  it('drops an automatic link when the contact loses the number', () => {
    imessage('2026-10-01', '2026-10-31', [['(415) 555-2671', '2026-10-10', 1, 1]]);
    db.prepare('DELETE FROM contact_phones WHERE contact_id = ?').run(ids.ada);
    autoMatchHandles(db);
    expect(db.prepare('SELECT contact_id FROM message_handles').get()).toEqual({ contact_id: null });
  });

  it('clears a channel', () => {
    imessage('2026-10-01', '2026-10-31', [['(415) 555-2671', '2026-10-10', 1, 1]]);
    clearChannel(db, 'imessage');
    expect(getSources(db).find(s => s.channel === 'imessage')).toMatchObject({ messages: 0, handles: 0, coveredFrom: null });
  });

  it('counts Gmail headers: sent per recipient, received per sender, skipping bulk mail and groups apart', () => {
    const msg = (headers: Record<string, string>, labels: string[], date = '2026-10-10T12:00:00Z'): GmailMessage & { labelIds: string[] } => ({
      id: Math.random().toString(), threadId: 't', historyId: 'h', snippet: '', internalDate: String(Date.parse(date)),
      labelIds: labels, payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) },
    });
    const tally = newTally('me@gmail.com');
    tallyMessage(tally, msg({ From: 'Me <me@gmail.com>', To: '"Lovelace, Ada" <carol@example.com>' }, ['SENT']), 'UTC');
    tallyMessage(tally, msg({ From: 'Carol <carol@example.com>', To: 'me@gmail.com' }, ['INBOX']), 'UTC');
    tallyMessage(tally, msg({ From: 'News <news@shop.com>', To: 'me@gmail.com', 'List-Unsubscribe': '<x>' }, ['INBOX']), 'UTC');
    tallyMessage(tally, msg({ From: 'noreply@service.com', To: 'me@gmail.com' }, ['INBOX']), 'UTC');
    tallyMessage(tally, msg({ From: 'me@gmail.com', To: 'a@x.com, b@x.com', Cc: 'c@x.com' }, ['SENT']), 'UTC');
    // The Gmail query starts a day early: that day is left out instead of failing the scan
    tallyMessage(tally, msg({ From: 'Carol <carol@example.com>', To: 'me@gmail.com' }, ['INBOX'], '2026-09-30T12:00:00Z'), 'UTC');
    saveTally(db, tally, '2026-10-01', '2026-10-31');

    const rows = db.prepare(`SELECT handle, sent, received, group_messages FROM message_activity WHERE channel = 'gmail' ORDER BY handle`).all();
    expect(rows).toEqual([
      { handle: 'a@x.com', sent: 0, received: 0, group_messages: 1 },
      { handle: 'b@x.com', sent: 0, received: 0, group_messages: 1 },
      { handle: 'c@x.com', sent: 0, received: 0, group_messages: 1 },
      { handle: 'carol@example.com', sent: 1, received: 1, group_messages: 0 },
    ]);
    expect(db.prepare(`SELECT contact_id, display_name FROM message_handles WHERE handle = 'carol@example.com'`).get())
      .toEqual({ contact_id: ids.carol, display_name: 'Lovelace, Ada' });
  });

  it('splits Gmail scans into calendar years, newest first', () => {
    expect(yearWindows('2024-11-01', '2026-11-01')).toEqual([
      { from: '2026-01-01', to: '2026-11-01' },
      { from: '2025-01-01', to: '2025-12-31' },
      { from: '2024-11-01', to: '2024-12-31' },
    ]);
    expect(yearWindows('2026-03-05', '2026-03-07')).toEqual([{ from: '2026-03-05', to: '2026-03-07' }]);
  });

  it('picks the Gmail scan range: first, new mail, older mail', () => {
    const today = '2026-11-01';
    expect(scanRange(undefined, today)).toEqual({ from: '2024-11-01', to: today });
    const covered = { covered_from: '2024-11-01', covered_through: '2026-10-20' };
    expect(scanRange(covered, today)).toEqual({ from: '2026-10-18', to: today });
    expect(scanRange(covered, today, '5y')).toEqual({ from: '2021-11-01', to: '2024-10-31' });
    expect(scanRange(covered, today, 'all')).toEqual({ from: '2004-01-01', to: '2024-10-31' });
    // Already scanned back past 5 years: nothing to do
    expect(scanRange({ covered_from: '2020-01-01', covered_through: today }, today, '5y')).toBeNull();
  });

  it('parses quoted address lists', () => {
    expect(parseAddressList('"Doe, Jane" <JANE@x.com>, bob@y.org, bad')).toEqual([
      { email: 'jane@x.com', name: 'Doe, Jane' },
      { email: 'bob@y.org', name: null },
    ]);
  });
});
