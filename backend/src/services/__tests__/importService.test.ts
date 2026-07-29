import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
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
      photosProcessed: 0
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

  it('marks the job failed when the staged file is missing', async () => {
    const jobId = stageJob(card('Doomed Person'));
    const db = getUserDatabase(USER_ID);
    fs.unlinkSync(getImportJob(db, jobId)!.filePath!);

    await expect(runVcfImportJob(USER_ID, jobId)).rejects.toThrow();
    expect(getImportJob(db, jobId)?.status).toBe('failed');
  });
});
