import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { getUserDatabase, closeAllUserDatabases } from '../../services/userDatabase.js';
import { isContactEdit } from '../../services/sync/syncScheduler.js';
import contactsRoutes from '../contacts.js';
import os from 'os';
import fs from 'fs';
import path from 'path';

/** POST /api/contacts/export: selected contacts or a whole group, as VCF or Google CSV. */
describe('contact export', () => {
  let app: FastifyInstance;
  let tmpDir: string;
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-contact-export-test-'));
    process.env.USER_DATA_PATH = tmpDir;

    app = Fastify();
    app.addHook('onRequest', async (request) => {
      request.user = {
        id: 1,
        googleId: 'test-google-id',
        email: 'test@test.com',
        name: 'Test User',
        avatarUrl: null,
        isDemo: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
    await app.register(contactsRoutes, { prefix: '/api/contacts' });
    await app.ready();

    const db = getUserDatabase(1);
    const insert = db.prepare(`
      INSERT INTO contacts (first_name, last_name, display_name, archived_at) VALUES (?, ?, ?, ?)
    `);
    const add = (key: string, first: string, last: string, archivedAt: string | null = null) => {
      ids[key] = insert.run(first, last, `${first} ${last}`, archivedAt).lastInsertRowid as number;
    };
    add('ada', 'Ada', 'Lovelace');
    add('charles', 'Charles', 'Babbage');
    add('mary', 'Mary', 'Somerville');
    add('archived', 'Old', 'Friend', '2026-10-01T00:00:00Z');

    const group = db.prepare('INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)');
    for (const key of ['ada', 'charles', 'archived']) group.run(ids[key], 'Friends: Close');
    db.prepare('INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, 1)')
      .run(ids.ada, 'ada@example.com', 'home');
  });

  afterAll(async () => {
    await app.close();
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const post = (payload: unknown) => app.inject({ method: 'POST', url: '/api/contacts/export', payload: payload as object });
  const cardNames = (vcf: string) => [...vcf.matchAll(/^FN:(.*)$/gm)].map(m => m[1].trim());

  it('exports selected contacts as VCF, sorted by name', async () => {
    const res = await post({ format: 'vcf', ids: [ids.mary, ids.ada] });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/vcard');
    expect(res.headers['content-disposition']).toContain('yello-2-contacts.vcf');
    expect(cardNames(res.body)).toEqual(['Ada Lovelace', 'Mary Somerville']);
  });

  it('names a single-contact export after the contact', async () => {
    const res = await post({ format: 'csv', ids: [ids.ada] });
    expect(res.headers['content-disposition']).toContain('filename="Ada Lovelace.csv"');
  });

  it('exports selected contacts as Google CSV', async () => {
    const res = await post({ format: 'csv', ids: [ids.ada, ids.charles] });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.body.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('E-mail 1 - Value');
    expect(lines[1]).toContain('ada@example.com');
    expect(lines[1]).toContain('* myContacts ::: Friends: Close');
    expect(lines[2].startsWith('Charles,')).toBe(true);
  });

  it('exports every active contact in a group, leaving archived ones out', async () => {
    const res = await post({ format: 'vcf', group: 'Friends: Close' });
    expect(res.statusCode).toBe(200);
    expect(cardNames(res.body)).toEqual(['Ada Lovelace', 'Charles Babbage']);
    // Characters a file name can't hold are replaced.
    expect(res.headers['content-disposition']).toContain('filename="Friends- Close.vcf"');
    expect(res.headers['content-disposition']).toContain("filename*=UTF-8''Friends-%20Close.vcf");
  });

  it('keeps a non-ASCII group name in the UTF-8 filename', async () => {
    getUserDatabase(1).prepare('INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)').run(ids.mary, 'Café');
    const res = await post({ format: 'csv', group: 'Café' });
    expect(res.headers['content-disposition']).toContain('filename="Caf_.csv"');
    expect(res.headers['content-disposition']).toContain("filename*=UTF-8''Caf%C3%A9.csv");
  });

  it('returns 404 when nothing matches', async () => {
    expect((await post({ format: 'vcf', group: 'Nobody' })).statusCode).toBe(404);
    expect((await post({ format: 'csv', ids: [999999] })).statusCode).toBe(404);
  });

  it('needs exactly one of ids or group, and a known format', async () => {
    expect((await post({ format: 'vcf' })).statusCode).toBe(400);
    expect((await post({ format: 'vcf', ids: [ids.ada], group: 'Friends: Close' })).statusCode).toBe(400);
    expect((await post({ format: 'pdf', ids: [ids.ada] })).statusCode).toBe(400);
    expect((await post({ format: 'vcf', ids: [] })).statusCode).toBe(400);
  });

  it('does not count as a contact edit, so it never triggers a sync', () => {
    expect(isContactEdit('POST', '/api/contacts/export', 200)).toBe(false);
  });
});
