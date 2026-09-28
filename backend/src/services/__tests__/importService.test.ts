import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { runVcfImportJob } from '../importService.js';
import { createImportJob, getImportJob, updateJobProgress } from '../importJobService.js';
import { getUserDatabase, closeAllUserDatabases, getUserImportsPath } from '../userDatabase.js';

vi.mock('../photoProcessor.js', () => ({
  processPhoto: vi.fn().mockResolvedValue('mock-hash-123')
}));

const USER_ID = 42;

function card(name: string, uid?: string): string {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${name}`,
    `N:${name.split(' ')[1] ?? ''};${name.split(' ')[0]};;;`,
    ...(uid ? [`UID:${uid}`] : []),
    'END:VCARD'
  ].join('\n');
}

/** Stages a VCF on disk exactly the way the upload route does. */
function stageJob(vcf: string): string {
  const db = getUserDatabase(USER_ID);
  const filePath = path.join(getUserImportsPath(USER_ID), `${Date.now()}-${Math.round(performance.now())}.vcf`);
  fs.writeFileSync(filePath, vcf, 'utf-8');
  return createImportJob(db, { filename: 'test.vcf', filePath, fileSize: Buffer.byteLength(vcf) });
}

describe('runVcfImportJob', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-import-service-'));
    process.env.USER_DATA_PATH = tmpDir;
  });

  afterAll(() => {
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    const db = getUserDatabase(USER_ID);
    db.exec('DELETE FROM contacts');
    db.exec('DELETE FROM import_jobs');
  });

  it('imports a file spanning multiple batches', async () => {
    // 125 cards against a BATCH_SIZE of 50 — exercises three commits, the last
    // one partial.
    const vcf = Array.from({ length: 125 }, (_, i) => card(`Person${i} Test`)).join('\n');
    const jobId = stageJob(vcf);

    const result = await runVcfImportJob(USER_ID, jobId);

    expect(result.imported).toBe(125);
    expect(result.failed).toBe(0);

    const db = getUserDatabase(USER_ID);
    const { count } = db.prepare('SELECT COUNT(*) as count FROM contacts').get() as { count: number };
    expect(count).toBe(125);

    const job = getImportJob(db, jobId);
    expect(job?.status).toBe('completed');
    expect(job?.totalCards).toBe(125);
    expect(job?.cardsProcessed).toBe(125);
  });

  it('deletes the staged file once the import completes', async () => {
    const jobId = stageJob(card('Temp File'));
    const stagedPath = getImportJob(getUserDatabase(USER_ID), jobId)!.filePath!;

    await runVcfImportJob(USER_ID, jobId);

    expect(fs.existsSync(stagedPath)).toBe(false);
  });

  it('skips cards whose UID was already imported', async () => {
    const vcf = [card('Ada Lovelace', 'uid-1'), card('Alan Turing', 'uid-2')].join('\n');

    const first = await runVcfImportJob(USER_ID, stageJob(vcf));
    expect(first.imported).toBe(2);
    expect(first.skipped).toBe(0);

    // Re-importing the same export must be a no-op, not a duplication.
    const second = await runVcfImportJob(USER_ID, stageJob(vcf));
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(2);

    const db = getUserDatabase(USER_ID);
    const { count } = db.prepare('SELECT COUNT(*) as count FROM contacts').get() as { count: number };
    expect(count).toBe(2);
  });

  it('normalizes urn:uuid UIDs so they match bare ones', async () => {
    await runVcfImportJob(USER_ID, stageJob(card('Grace Hopper', 'abc-123')));
    const second = await runVcfImportJob(USER_ID, stageJob(card('Grace Hopper', 'urn:uuid:abc-123')));

    expect(second.skipped).toBe(1);
    expect(second.imported).toBe(0);
  });

  it('still imports cards without a UID', async () => {
    const vcf = [card('No Uid'), card('Also None')].join('\n');

    await runVcfImportJob(USER_ID, stageJob(vcf));
    const second = await runVcfImportJob(USER_ID, stageJob(vcf));

    // Without a stable identifier there is nothing to match on.
    expect(second.imported).toBe(2);
    expect(second.skipped).toBe(0);
  });

  it('resumes from cards_processed instead of reimporting from the start', async () => {
    const vcf = Array.from({ length: 10 }, (_, i) => card(`Resume${i} Test`, `resume-${i}`)).join('\n');
    const jobId = stageJob(vcf);
    const db = getUserDatabase(USER_ID);

    // Simulate a crash after the first 4 cards committed.
    for (let i = 0; i < 4; i++) {
      db.prepare(`
        INSERT INTO contacts (display_name, icloud_uid) VALUES (?, ?)
      `).run(`Resume${i} Test`, `resume-${i}`);
    }
    updateJobProgress(db, jobId, {
      cardsProcessed: 4,
      importedCount: 4,
      skippedCount: 0,
      failedCount: 0,
      photosProcessed: 0,
      addressesGeotagged: 0
    });

    const result = await runVcfImportJob(USER_ID, jobId);

    // The 6 remaining cards are added to the 4 already counted; the first 4 are
    // never re-read, so they are not double-counted as skips either.
    expect(result.imported).toBe(10);
    expect(result.skipped).toBe(0);

    const { count } = db.prepare('SELECT COUNT(*) as count FROM contacts').get() as { count: number };
    expect(count).toBe(10);
  });

  it('handles CRLF line endings and folded lines', async () => {
    // Folded continuation lines are how real exports carry long values.
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Folded Person',
      'N:Person;Folded;;;',
      'NOTE:This note is split across',
      '  two physical lines',
      'END:VCARD'
    ].join('\r\n');

    const result = await runVcfImportJob(USER_ID, stageJob(vcf));

    expect(result.imported).toBe(1);
    const db = getUserDatabase(USER_ID);
    const row = db.prepare('SELECT notes FROM contacts LIMIT 1').get() as { notes: string | null };
    expect(row.notes).toContain('two physical lines');
  });

  it('keeps per-address GEO coordinates from a grouped vCard', async () => {
    // This is exactly the shape vcardGenerator writes on export, so an
    // export/import round trip must not lose the geocoding.
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Geo Person',
      'N:Person;Geo;;;',
      'item1.ADR;TYPE=HOME:;;1 Infinite Loop;Cupertino;CA;95014;USA',
      'item1.GEO:37.331741;-122.030333',
      'END:VCARD'
    ].join('\n');

    const result = await runVcfImportJob(USER_ID, stageJob(vcf));
    expect(result.addressesGeotagged).toBe(1);

    const row = getUserDatabase(USER_ID)
      .prepare('SELECT latitude, longitude, geocoded_at FROM contact_addresses LIMIT 1')
      .get() as { latitude: number; longitude: number; geocoded_at: string | null };

    expect(row.latitude).toBeCloseTo(37.331741);
    expect(row.longitude).toBeCloseTo(-122.030333);
    // Stamped so the geocoding queue treats it as done, not pending.
    expect(row.geocoded_at).not.toBeNull();
  });

  it('matches GEO to the right address when a card has several', async () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Multi Address',
      'N:Address;Multi;;;',
      'item1.ADR;TYPE=HOME:;;1 Home St;Springfield;IL;62701;USA',
      'item1.GEO:39.799999;-89.650002',
      'ADR;TYPE=WORK:;;2 Work Ave;Chicago;IL;60601;USA',
      'END:VCARD'
    ].join('\n');

    const result = await runVcfImportJob(USER_ID, stageJob(vcf));
    expect(result.addressesGeotagged).toBe(1);

    const rows = getUserDatabase(USER_ID)
      .prepare('SELECT street, latitude FROM contact_addresses ORDER BY id')
      .all() as Array<{ street: string; latitude: number | null }>;

    expect(rows).toHaveLength(2);
    expect(rows[0].street).toBe('1 Home St');
    expect(rows[0].latitude).toBeCloseTo(39.799999);
    // The ungrouped work address must not inherit the home coordinates.
    expect(rows[1].street).toBe('2 Work Ave');
    expect(rows[1].latitude).toBeNull();
  });

  it('applies a card-level GEO only when there is one address', async () => {
    const single = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Single Addr',
      'N:Addr;Single;;;',
      'ADR;TYPE=HOME:;;5 Only Rd;Boston;MA;02101;USA',
      'GEO:42.360081;-71.058884',
      'END:VCARD'
    ].join('\n');

    expect((await runVcfImportJob(USER_ID, stageJob(single))).addressesGeotagged).toBe(1);

    getUserDatabase(USER_ID).exec('DELETE FROM contacts');

    const ambiguous = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Two Addr',
      'N:Addr;Two;;;',
      'ADR;TYPE=HOME:;;5 One Rd;Boston;MA;02101;USA',
      'ADR;TYPE=WORK:;;6 Two Rd;Boston;MA;02102;USA',
      'GEO:42.360081;-71.058884',
      'END:VCARD'
    ].join('\n');

    // Guessing which of two addresses a card-level GEO belongs to is worse
    // than leaving both ungeocoded.
    expect((await runVcfImportJob(USER_ID, stageJob(ambiguous))).addressesGeotagged).toBe(0);
  });

  it('ignores unusable GEO values', async () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Bad Geo',
      'N:Geo;Bad;;;',
      // 0;0 is the common "geocoding failed" sentinel, not the Atlantic.
      'item1.ADR;TYPE=HOME:;;1 Null Island;Nowhere;;;',
      'item1.GEO:0;0',
      'END:VCARD'
    ].join('\n');

    expect((await runVcfImportJob(USER_ID, stageJob(vcf))).addressesGeotagged).toBe(0);
  });

  it('accepts the vCard 4.0 geo: URI form', async () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:4.0',
      'FN:V4 Person',
      'N:Person;V4;;;',
      'item1.ADR;TYPE=home:;;9 Fourth St;Portland;OR;97201;USA',
      'item1.GEO:geo:45.512230,-122.658722',
      'END:VCARD'
    ].join('\n');

    const result = await runVcfImportJob(USER_ID, stageJob(vcf));
    expect(result.addressesGeotagged).toBe(1);

    const row = getUserDatabase(USER_ID)
      .prepare('SELECT latitude, longitude FROM contact_addresses LIMIT 1')
      .get() as { latitude: number; longitude: number };
    expect(row.latitude).toBeCloseTo(45.51223);
    expect(row.longitude).toBeCloseTo(-122.658722);
  });

  it('stores only known enrichment columns, against the imported contact', async () => {
    // The payload comes from an uploaded file, so its keys are not trusted:
    // they must never choose the row's owner or name a column.
    const payload = zlib.gzipSync(JSON.stringify({
      headline: 'Analyst',
      followers_count: 12,
      id: 999,
      contact_id: 999,
      'headline = (SELECT 1) --': 'x',
      education: { nested: 'object' }
    })).toString('base64');
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Enriched Person',
      'N:Person;Enriched;;;',
      `X-YELLO-LINKEDIN:${payload}`,
      'END:VCARD'
    ].join('\n');

    const result = await runVcfImportJob(USER_ID, stageJob(vcf));
    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);

    const db = getUserDatabase(USER_ID);
    const contact = db.prepare('SELECT id FROM contacts').get() as { id: number };
    const rows = db.prepare(
      'SELECT contact_id, headline, followers_count, education FROM linkedin_enrichment'
    ).all();

    expect(rows).toEqual([
      { contact_id: contact.id, headline: 'Analyst', followers_count: 12, education: null }
    ]);
    // Stored once, in linkedin_enrichment — not again as a generic property
    expect(db.prepare(`SELECT COUNT(*) AS n FROM contact_vcard_properties WHERE name = 'X-YELLO-LINKEDIN'`).get())
      .toEqual({ n: 0 });
  });

  it('marks the job failed when the staged file is missing', async () => {
    const jobId = stageJob(card('Doomed Person'));
    const db = getUserDatabase(USER_ID);
    fs.unlinkSync(getImportJob(db, jobId)!.filePath!);

    await expect(runVcfImportJob(USER_ID, jobId)).rejects.toThrow();
    expect(getImportJob(db, jobId)?.status).toBe('failed');
  });
});
