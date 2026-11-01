import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import type { Database } from 'better-sqlite3';
import { getUserDatabase, closeAllUserDatabases } from '../../userDatabase.js';
import { buildRecipients } from '../recipients.js';
import {
  createBlast, getBlast, listBlasts, rerunBlast, sentSince, setBlastStatus, setRecipientStatus, setSkipped, deleteBlast,
  DEFAULT_LIMITS, getLimits, sendCounts, setLimits,
} from '../store.js';

let tmpDir: string;
let db: Database;
const ids: Record<string, number> = {};

function addContact(key: string, first: string, last: string, opts: {
  phones?: [string, string | null, number?][]; groups?: string[]; archived?: boolean; nickname?: string;
} = {}) {
  const id = Number(db.prepare(`
    INSERT INTO contacts (first_name, last_name, display_name, nickname, archived_at) VALUES (?, ?, ?, ?, ?)
  `).run(first, last, `${first} ${last}`, opts.nickname ?? null, opts.archived ? new Date().toISOString() : null).lastInsertRowid);
  for (const [phone, type, primary] of opts.phones ?? []) {
    db.prepare('INSERT INTO contact_phones (contact_id, phone, phone_display, type, is_primary) VALUES (?, ?, ?, ?, ?)')
      .run(id, phone, phone, type, primary ?? 0);
  }
  for (const g of opts.groups ?? []) {
    db.prepare('INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)').run(id, g);
  }
  ids[key] = id;
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-text-blast-test-'));
  process.env.USER_DATA_PATH = tmpDir;
  db = getUserDatabase(1);
  addContact('ana', 'Ana', 'Lopez', { phones: [['+12125550100', 'work', 1], ['+19175550101', 'cell']], groups: ['Friends'] });
  addContact('ben', 'Ben', 'Weber', { phones: [['+19175550102', null]], groups: ['Friends'], nickname: 'Benny' });
  addContact('cara', 'Cara', 'Diaz', { groups: ['Friends'] });
  addContact('gone', 'Old', 'Friend', { phones: [['+19175550109', 'cell']], groups: ['Friends'], archived: true });
  addContact('dan', 'Dan', 'Kim', { phones: [['+19175550104', 'mobile']] });
});

afterAll(() => {
  closeAllUserDatabases();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('buildRecipients', () => {
  it('lists group members with their mobile number, skipping archived contacts', () => {
    const { recipients, fields } = buildRecipients(db, { groups: ['Friends'], template: 'Hi {first_name}!', country: 'US' });
    expect(recipients.map((r) => r.name)).toEqual(['Ana Lopez', 'Ben Weber', 'Cara Diaz']);
    const ana = recipients[0];
    expect(ana.phone).toBe('+19175550101');
    expect(ana.phones.map((p) => p.e164)).toEqual(['+19175550101', '+12125550100']);
    expect(ana.text).toBe('Hi Ana!');
    expect(ana.source).toBe('group');
    expect(recipients[2].problems).toContain('no phone number');
    expect(fields).toEqual(expect.arrayContaining(['first_name', 'nickname', 'company']));
  });

  it('switches number with a phone override', () => {
    const { recipients } = buildRecipients(db, {
      groups: ['Friends'], template: 'Hi', country: 'US', phoneOverrides: { [ids.ana]: '+12125550100' },
    });
    expect(recipients[0].phone).toBe('+12125550100');
  });

  it('merges CSV rows into matching group members, CSV values winning', () => {
    const csv = 'phone,first_name,event\n(917) 555-0102,Benjamin,dinner\n+1 917 555 0104,,brunch\n917 555 0199,Eve,lunch\n917 555 0199,Eve2,lunch\n';
    const { recipients, csv: info } = buildRecipients(db, {
      groups: ['Friends'], csv: { name: 'guests.csv', text: csv }, template: 'Hi {first_name|there}, {event}', country: 'US',
    });
    expect(info).toMatchObject({ name: 'guests.csv', rows: 4, phoneColumn: 'phone' });
    const ben = recipients.find((r) => r.contactId === ids.ben)!;
    expect(ben).toMatchObject({ source: 'both', csvRow: 2, text: 'Hi Benjamin, dinner' });
    // Matches a contact outside the group: linked, contact fields fill empty cells
    const dan = recipients.find((r) => r.contactId === ids.dan)!;
    expect(dan).toMatchObject({ source: 'csv', key: `c${ids.dan}`, text: 'Hi Dan, brunch' });
    // Unknown number: CSV-only row
    const eve = recipients.find((r) => r.csvRow === 4)!;
    expect(eve).toMatchObject({ contactId: null, name: 'Eve', phone: '+19175550199', key: 'r4', problems: [] });
    expect(recipients.find((r) => r.csvRow === 5)!.problems).toContain('same number as row 4');
    // Group members without an event cell are held back
    expect(recipients.find((r) => r.contactId === ids.ana)!.problems[0]).toMatch(/\{event\} is empty/);
  });

  it('uses a message column as a per-row override', () => {
    const csv = 'phone,name,message\n+19175550199,,"Hey {name|you}, custom!"\n+19175550198,Bo,\n';
    const { recipients } = buildRecipients(db, { groups: [], csv: { name: 'x.csv', text: csv }, template: 'Default', country: 'US' });
    expect(recipients[0]).toMatchObject({ isCustom: true, text: 'Hey you, custom!' });
    expect(recipients[1]).toMatchObject({ isCustom: false, text: 'Default' });
  });

  it('reports a CSV without a phone column', () => {
    const { recipients } = buildRecipients(db, { groups: [], csv: { name: 'x.csv', text: 'name\nAna\n' }, template: 'Hi', country: 'US' });
    expect(recipients[0].problems[0]).toMatch(/no phone column/);
  });
});

describe('blast store', () => {
  it('stores sendable recipients, tracks status and counts the daily limit', () => {
    const preview = buildRecipients(db, { groups: ['Friends'], template: 'Hi {first_name}!', country: 'US' });
    const id = createBlast(db, {
      template: 'Hi {first_name}!', country: 'US', simulate: false,
      sources: { groups: ['Friends'], csvName: null }, recipients: preview.recipients,
    });
    const blast = getBlast(db, id)!;
    expect(blast.recipients!.map((r) => r.name)).toEqual(['Ana Lopez', 'Ben Weber']); // Cara has no number
    expect(blast).toMatchObject({ status: 'draft', total: 2, counts: { '': 2 } });

    const [ana, ben] = blast.recipients!;
    const since = new Date(Date.now() - 1000).toISOString();
    const inFlight = setRecipientStatus(db, id, ana.id, { status: 'in_flight', note: 'sending' })!;
    expect(inFlight.sentAt).not.toBeNull();
    setRecipientStatus(db, id, ana.id, { status: 'delivered', service: 'iMessage', note: 'delivered' });
    expect(getBlast(db, id)!.recipients![0]).toMatchObject({ status: 'delivered', sentAt: inFlight.sentAt });
    expect(sentSince(db, since)).toBe(1);
    expect(setRecipientStatus(db, id + 99, ana.id, { status: 'sent' })).toBeNull();

    expect(setSkipped(db, id, [ana.id, ben.id], true)).toBe(1); // delivered rows don't change
    expect(getBlast(db, id)!.counts).toEqual({ delivered: 1, skipped: 1 });
    setSkipped(db, id, [ben.id], false);
    expect(setBlastStatus(db, id, 'running')).toBe(true);
    expect(deleteBlast(db, id)).toBe(false); // can't delete while running
    expect(listBlasts(db)[0].id).toBe(id);
  });

  it('does not count simulated blasts toward the limit', () => {
    const preview = buildRecipients(db, { groups: ['Friends'], template: 'Yo', country: 'US' });
    const id = createBlast(db, { template: 'Yo', country: 'US', simulate: true, sources: { groups: [], csvName: null }, recipients: preview.recipients });
    const since = new Date(Date.now() - 60_000).toISOString();
    const before = sentSince(db, since);
    const r = getBlast(db, id)!.recipients![0];
    setRecipientStatus(db, id, r.id, { status: 'in_flight' });
    setRecipientStatus(db, id, r.id, { status: 'simulated' });
    expect(sentSince(db, since)).toBe(before);
  });

  it('stores the send limits and counts the rolling hour', () => {
    expect(getLimits(db)).toEqual(DEFAULT_LIMITS);
    const preview = buildRecipients(db, { groups: ['Friends'], template: 'Hey', country: 'US' });
    const id = createBlast(db, { template: 'Hey', country: 'US', simulate: false, sources: { groups: [], csvName: null }, recipients: preview.recipients });
    const [ana, ben] = getBlast(db, id)!.recipients!;
    setRecipientStatus(db, id, ana.id, { status: 'in_flight' });
    setRecipientStatus(db, id, ben.id, { status: 'in_flight' });
    // A clock 10 days ahead, so attempts from other tests fall outside its hour.
    const now = new Date(Date.now() + 10 * 86400_000);
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
    db.prepare('UPDATE text_blast_recipients SET sent_at = ? WHERE id = ?').run(minutesAgo(50), ana.id);
    db.prepare('UPDATE text_blast_recipients SET sent_at = ? WHERE id = ?').run(minutesAgo(10), ben.id);
    const today = minutesAgo(120);

    expect(sendCounts(db, today, now)).toEqual({ count: 2, cap: 80, hourCount: 2, hourCap: 60, hourResetAt: null });
    setLimits(db, { daily: 100, hourly: 2 });
    // Full hour: the oldest attempt (50 min ago) drops out in 10 minutes.
    expect(sendCounts(db, today, now)).toMatchObject({ cap: 100, hourCap: 2, hourResetAt: minutesAgo(-10) });
    setLimits(db, { daily: 100, hourly: 1 });
    // Over by one: back under the limit only once the newer one (10 min ago) drops out too.
    expect(sendCounts(db, today, now).hourResetAt).toBe(minutesAgo(-50));
    setLimits(db, DEFAULT_LIMITS);
  });

  it('reruns a blast with a new message, holding back people it cannot fill in for', () => {
    const preview = buildRecipients(db, { groups: ['Friends'], template: 'Hi', country: 'US' });
    const id = createBlast(db, { template: 'Hi', country: 'US', simulate: false, sources: { groups: ['Friends'], csvName: null }, recipients: preview.recipients });
    const newId = rerunBlast(db, id, 'Hey {nickname}', false)!;
    const rerun = getBlast(db, newId)!;
    expect(rerun.recipients!.map((r) => [r.name, r.status, r.text])).toEqual([
      ['Ana Lopez', 'skipped', 'Hey {nickname}'],
      ['Ben Weber', '', 'Hey Benny'],
    ]);
    expect(rerun.recipients![0].note).toMatch(/nickname/);
  });

  it('refuses a blast with nobody to send to', () => {
    expect(() => createBlast(db, { template: '', country: 'US', simulate: false, sources: { groups: [], csvName: null }, recipients: [] }))
      .toThrow(/Nobody/);
  });
});
