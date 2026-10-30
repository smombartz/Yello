import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import {
  parseBirthdayMonthDay,
  daysUntilBirthday,
  getAllBirthdays,
  getDashboardRecent,
  getRecentChanges,
  UPCOMING_BIRTHDAY_DAYS,
} from '../stats.js';

describe('parseBirthdayMonthDay', () => {
  it('reads every stored format', () => {
    expect(parseBirthdayMonthDay('1985-03-04')).toEqual({ month: 3, day: 4 });
    expect(parseBirthdayMonthDay('--03-04')).toEqual({ month: 3, day: 4 });
    expect(parseBirthdayMonthDay('--0304')).toEqual({ month: 3, day: 4 });
    expect(parseBirthdayMonthDay('19850304')).toEqual({ month: 3, day: 4 });
    expect(parseBirthdayMonthDay('1604-03-04')).toEqual({ month: 3, day: 4 });
    expect(parseBirthdayMonthDay('03-04')).toEqual({ month: 3, day: 4 });
  });

  it('rejects garbage', () => {
    expect(parseBirthdayMonthDay('')).toBeNull();
    expect(parseBirthdayMonthDay('March 4')).toBeNull();
    expect(parseBirthdayMonthDay('1985-13-04')).toBeNull();
  });
});

describe('daysUntilBirthday', () => {
  const today = { year: 2026, month: 10, day: 28 };

  it('is 0 on the day itself', () => {
    expect(daysUntilBirthday(10, 28, today)).toBe(0);
  });

  it('counts forward within the year and wraps past ones to next year', () => {
    expect(daysUntilBirthday(10, 29, today)).toBe(1);
    expect(daysUntilBirthday(11, 11, today)).toBe(14);
    expect(daysUntilBirthday(10, 27, today)).toBe(364);
    expect(daysUntilBirthday(1, 1, today)).toBe(65);
  });

  it('puts Feb 29 on Mar 1 in non-leap years', () => {
    expect(daysUntilBirthday(2, 29, { year: 2027, month: 2, day: 28 })).toBe(1);
    expect(daysUntilBirthday(2, 29, { year: 2028, month: 2, day: 28 })).toBe(1);
  });
});

describe('getAllBirthdays', () => {
  it('lists non-archived parseable birthdays, soonest first', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE contacts (
      id INTEGER PRIMARY KEY, display_name TEXT, birthday TEXT, photo_hash TEXT, archived_at TEXT
    )`);
    const insert = db.prepare(
      'INSERT INTO contacts (display_name, birthday, archived_at) VALUES (?, ?, ?)'
    );
    insert.run('Later', '1990-01-01', null);
    insert.run('Today', '--10-28', null);
    insert.run('Soon', '1980-11-05', null);
    insert.run('Archived', '1980-10-29', '2026-01-01');
    insert.run('Broken', 'unknown', null);
    insert.run('Empty', '', null);

    const all = getAllBirthdays(db, { year: 2026, month: 10, day: 28 });
    expect(all.map((b) => [b.displayName, b.daysUntil])).toEqual([
      ['Today', 0],
      ['Soon', 8],
      ['Later', 65],
    ]);
    expect(all.filter((b) => b.daysUntil <= UPCOMING_BIRTHDAY_DAYS)).toHaveLength(2);
  });
});

describe('stats routes', () => {
  it('limits the dashboard to the next 14 days and lists everything on /birthdays', async () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE contacts (
        id INTEGER PRIMARY KEY, display_name TEXT, birthday TEXT, photo_hash TEXT,
        archived_at TEXT, created_via TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE contact_addresses (city TEXT, country TEXT, detail_archived_at TEXT);
    `);
    const insert = db.prepare('INSERT INTO contacts (display_name, birthday) VALUES (?, ?)');
    insert.run('Today', '1990-10-28');
    insert.run('Day 14', '--11-11');
    insert.run('Day 15', '--11-12');

    vi.resetModules();
    vi.doMock('../../services/userDatabase.js', () => ({ getUserDatabase: () => db }));
    const { default: statsRoutes } = await import('../stats.js');
    const app = Fastify();
    app.addHook('onRequest', async (request) => {
      (request as unknown as { user: { id: string } }).user = { id: 'u1' };
    });
    await app.register(statsRoutes, { prefix: '/api/stats' });

    const dash = await app.inject('/api/stats/dashboard?today=2026-10-28');
    expect(dash.statusCode).toBe(200);
    expect(dash.json().upcomingBirthdays.map((b: { displayName: string }) => b.displayName))
      .toEqual(['Today', 'Day 14']);

    const all = await app.inject('/api/stats/birthdays?today=2026-10-28');
    expect(all.json().birthdays.map((b: { daysUntil: number }) => b.daysUntil)).toEqual([0, 14, 15]);

    const bad = await app.inject('/api/stats/birthdays?today=yesterday');
    expect(bad.statusCode).toBe(400);

    expect(dash.json().recentTotal).toBe(3);
    const recent = await app.inject('/api/stats/recent?days=7');
    expect(recent.statusCode).toBe(200);
    expect(recent.json().days).toBe(7);
    expect(recent.json().counts.added).toBe(3);
    expect((await app.inject('/api/stats/recent?days=0')).statusCode).toBe(400);

    await app.close();
    vi.doUnmock('../../services/userDatabase.js');
  });
});

describe('recent changes', () => {
  /** Contacts table with SQLite-style UTC timestamps, `ago` in days before now. */
  function seed() {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE contacts (
      id INTEGER PRIMARY KEY, display_name TEXT, photo_hash TEXT, created_via TEXT,
      archived_at TEXT, created_at TEXT, updated_at TEXT
    )`);
    const at = (daysAgo: number | null) =>
      daysAgo === null ? null : (db.prepare(`SELECT datetime('now', ?) AS t`).get(`-${daysAgo * 24 * 60} minutes`) as { t: string }).t;
    const insert = db.prepare(
      'INSERT INTO contacts (display_name, created_via, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?)'
    );
    const add = (name: string, via: string | null, created: number, updated: number, archived: number | null = null) =>
      insert.run(name, via, at(created), at(updated), at(archived));
    add('Manual', 'manual', 1, 1);
    add('Legacy', null, 2, 2);
    // Touched a minute after the import (photo, search index): not an edit
    add('Imported', 'vcf_import', 3, 3 - 1 / 1440);
    add('Synced', 'icloud_sync', 4, 4);
    add('Edited', 'manual', 60, 0.5);
    add('Gone', 'manual', 90, 5, 5);
    add('Old', 'manual', 90, 90);
    add('ImportedThenEdited', 'google_import', 6, 0.25);
    return db;
  }

  it('lists every change in the window by kind, with UTC ISO timestamps', () => {
    const { counts, changes } = getRecentChanges(seed(), 30);
    expect(counts).toEqual({ added: 2, imported: 2, synced: 1, updated: 2, archived: 1 });
    expect(changes.map((c) => `${c.displayName}:${c.kind}`)).toEqual([
      'ImportedThenEdited:updated',
      'Edited:updated',
      'Manual:added',
      'Legacy:added',
      'Imported:imported',
      'Synced:synced',
      'Gone:archived',
      'ImportedThenEdited:imported',
    ]);
    expect(changes[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(new Date(changes[0].at).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('caps each kind but keeps its full count', () => {
    const { counts, changes } = getRecentChanges(seed(), 30, 1);
    expect(counts.added).toBe(2);
    expect(changes.filter((c) => c.kind === 'added').map((c) => c.displayName)).toEqual(['Manual']);
  });

  it('shows one entry per active contact on the dashboard, newest first', () => {
    const { recent, total } = getDashboardRecent(seed(), 7, 3);
    expect(total).toBe(6);
    expect(recent.map((c) => `${c.displayName}:${c.kind}`)).toEqual([
      'ImportedThenEdited:updated',
      'Edited:updated',
      'Manual:added',
    ]);
  });
});
