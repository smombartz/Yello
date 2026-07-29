import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { resumeInterruptedImports } from '../importRecovery.js';
import { createImportJob, getImportJob, updateJobProgress } from '../importJobService.js';
import { getUserDatabase, closeAllUserDatabases, getUserImportsPath } from '../userDatabase.js';

vi.mock('../photoProcessor.js', () => ({
  processPhoto: vi.fn().mockResolvedValue('mock-hash-123')
}));

const USER_ID = 99;

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  silent: vi.fn(),
  level: 'info',
  child: () => log
} as never;

function card(name: string, uid: string): string {
  return `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nN:Test;${name};;;\nUID:${uid}\nEND:VCARD`;
}

/** Waits for the fire-and-forget workers the sweep kicks off. */
async function waitForTerminal(jobId: string): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const job = getImportJob(getUserDatabase(USER_ID), jobId);
    if (job && (job.status === 'completed' || job.status === 'failed')) return job.status;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Recovery job never reached a terminal state');
}

describe('resumeInterruptedImports', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-import-recovery-'));
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
    vi.clearAllMocks();
  });

  it('resumes a running job from its committed offset', async () => {
    const vcf = Array.from({ length: 6 }, (_, i) => card(`Person${i}`, `rec-${i}`)).join('\n');
    const filePath = path.join(getUserImportsPath(USER_ID), 'interrupted.vcf');
    fs.writeFileSync(filePath, vcf, 'utf-8');

    const db = getUserDatabase(USER_ID);
    const jobId = createImportJob(db, { filename: 'x.vcf', filePath, fileSize: Buffer.byteLength(vcf) });

    // Look like a process that died after committing the first two cards.
    db.prepare("UPDATE import_jobs SET status = 'running' WHERE id = ?").run(jobId);
    db.prepare('INSERT INTO contacts (display_name, icloud_uid) VALUES (?, ?)').run('Person0', 'rec-0');
    db.prepare('INSERT INTO contacts (display_name, icloud_uid) VALUES (?, ?)').run('Person1', 'rec-1');
    updateJobProgress(db, jobId, {
      cardsProcessed: 2,
      importedCount: 2,
      skippedCount: 0,
      failedCount: 0,
      photosProcessed: 0
    });

    resumeInterruptedImports(log);
    expect(await waitForTerminal(jobId)).toBe('completed');

    const { count } = db.prepare('SELECT COUNT(*) as count FROM contacts').get() as { count: number };
    expect(count).toBe(6);

    const job = getImportJob(db, jobId);
    expect(job?.result?.imported).toBe(6);
  });

  it('fails a running job whose staged file is gone', async () => {
    const filePath = path.join(getUserImportsPath(USER_ID), 'vanished.vcf');
    fs.writeFileSync(filePath, card('Ghost', 'ghost-1'), 'utf-8');

    const db = getUserDatabase(USER_ID);
    const jobId = createImportJob(db, { filename: 'x.vcf', filePath, fileSize: 10 });
    db.prepare("UPDATE import_jobs SET status = 'running' WHERE id = ?").run(jobId);
    fs.unlinkSync(filePath);

    resumeInterruptedImports(log);

    const job = getImportJob(db, jobId);
    expect(job?.status).toBe('failed');
    expect(job?.errorMessage).toContain('interrupted by a server restart');
  });

  it('leaves completed jobs alone', async () => {
    const filePath = path.join(getUserImportsPath(USER_ID), 'done.vcf');
    fs.writeFileSync(filePath, card('Done', 'done-1'), 'utf-8');

    const db = getUserDatabase(USER_ID);
    const jobId = createImportJob(db, { filename: 'x.vcf', filePath, fileSize: 10 });
    db.prepare("UPDATE import_jobs SET status = 'completed' WHERE id = ?").run(jobId);

    resumeInterruptedImports(log);

    expect(getImportJob(db, jobId)?.status).toBe('completed');
  });
});
