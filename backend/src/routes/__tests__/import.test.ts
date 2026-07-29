import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import FormData from 'form-data';
import importRoutes from '../import.js';
import { closeAllUserDatabases } from '../../services/userDatabase.js';
import type { ImportJobResult } from '../../services/importJobService.js';
import os from 'os';
import fs from 'fs';
import path from 'path';

// Mock the photo processor to avoid file system operations during tests
vi.mock('../../services/photoProcessor.js', () => ({
  processPhoto: vi.fn().mockResolvedValue('mock-hash-123')
}));

/**
 * Uploads a VCF and waits for the background job to reach a terminal state.
 * The route only stages the file now, so every assertion about counts has to
 * go through the job row.
 */
async function importAndWait(app: FastifyInstance, vcfContent: string): Promise<ImportJobResult> {
  const form = new FormData();
  form.append('file', Buffer.from(vcfContent), {
    filename: 'contacts.vcf',
    contentType: 'text/vcard'
  });

  const response = await app.inject({
    method: 'POST',
    url: '/import',
    headers: form.getHeaders(),
    payload: form.getBuffer()
  });

  expect(response.statusCode).toBe(202);
  const { jobId } = JSON.parse(response.body) as { jobId: string };
  expect(jobId).toBeTruthy();

  for (let attempt = 0; attempt < 200; attempt++) {
    const poll = await app.inject({ method: 'GET', url: `/import/jobs/${jobId}` });
    expect(poll.statusCode).toBe(200);
    const job = JSON.parse(poll.body);

    if (job.status === 'completed') return job.result as ImportJobResult;
    if (job.status === 'failed') throw new Error(`Import failed: ${job.errorMessage}`);

    await new Promise(resolve => setTimeout(resolve, 20));
  }

  throw new Error('Import job did not finish in time');
}

describe('POST /import', () => {
  const app = Fastify();
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-import-test-'));
    process.env.USER_DATA_PATH = tmpDir;

    // Mock request.user so getUserDatabase(request.user!.id) works
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

    await app.register(fastifyMultipart, { limits: { fileSize: 100 * 1024 * 1024 } });
    await app.register(importRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 when no file is uploaded', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/import',
      headers: {
        'content-type': 'multipart/form-data; boundary=---test'
      },
      payload: '-----test--'
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('No file uploaded');
  });

  it('should reject a file that is not a vCard', async () => {
    const form = new FormData();
    form.append('file', Buffer.from('just some text, definitely not a contact'), {
      filename: 'contacts.vcf',
      contentType: 'text/vcard'
    });

    const response = await app.inject({
      method: 'POST',
      url: '/import',
      headers: form.getHeaders(),
      payload: form.getBuffer()
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('Invalid vCard file');
  });

  it('should accept the upload immediately and import in the background', async () => {
    const result = await importAndWait(app, `BEGIN:VCARD
VERSION:3.0
FN:John Doe
N:Doe;John;;;
EMAIL:john@example.com
TEL:+1-555-123-4567
END:VCARD`);

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('should import multiple contacts from a single VCF file', async () => {
    const result = await importAndWait(app, `BEGIN:VCARD
VERSION:3.0
FN:Alice Smith
N:Smith;Alice;;;
EMAIL:alice@example.com
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Bob Jones
N:Jones;Bob;;;
TEL:+1-555-987-6543
END:VCARD`);

    expect(result.imported).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('should handle contacts with photos and track photosProcessed count', async () => {
    const result = await importAndWait(app, `BEGIN:VCARD
VERSION:3.0
FN:Photo Person
N:Person;Photo;;;
PHOTO;VALUE=URI:data:image/jpeg;base64,/9j/4AAQSkZJRg==
END:VCARD`);

    expect(result.imported).toBe(1);
    expect(result.photosProcessed).toBe(1);
  });

  it('should handle contacts with addresses', async () => {
    const result = await importAndWait(app, `BEGIN:VCARD
VERSION:3.0
FN:Address Person
N:Person;Address;;;
ADR;TYPE=HOME:;;123 Main St;Springfield;IL;62701;USA
END:VCARD`);

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('should handle contacts with company and title', async () => {
    const result = await importAndWait(app, `BEGIN:VCARD
VERSION:3.0
FN:Corporate Person
N:Person;Corporate;;;
ORG:Acme Inc
TITLE:Software Engineer
END:VCARD`);

    expect(result.imported).toBe(1);
  });

  it('should return errors for malformed VCF entries while importing valid ones', async () => {
    const result = await importAndWait(app, `BEGIN:VCARD
VERSION:3.0
FN:Valid Contact
N:Contact;Valid;;;
END:VCARD
BEGIN:VCARD
VERSION:3.0
END:VCARD`);

    expect(result.imported).toBe(1);
    expect(result.failed).toBeGreaterThan(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should report no active job once an import has finished', async () => {
    await importAndWait(app, `BEGIN:VCARD
VERSION:3.0
FN:Quiet Person
N:Person;Quiet;;;
END:VCARD`);

    const response = await app.inject({ method: 'GET', url: '/import/jobs/active' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).job).toBeNull();
  });

  it('should return 413 when the file exceeds the size limit', async () => {
    // A separate app so the tiny limit does not affect the other tests.
    const limited = Fastify();
    limited.addHook('onRequest', async (request) => {
      request.user = {
        id: 2,
        googleId: 'test-google-id-2',
        email: 'test2@test.com',
        name: 'Test User 2',
        avatarUrl: null,
        isDemo: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
    await limited.register(fastifyMultipart, { limits: { fileSize: 1024 } });
    await limited.register(importRoutes);
    await limited.ready();

    const form = new FormData();
    form.append('file', Buffer.from('BEGIN:VCARD\n'.repeat(500)), {
      filename: 'huge.vcf',
      contentType: 'text/vcard'
    });

    const response = await limited.inject({
      method: 'POST',
      url: '/import',
      headers: form.getHeaders(),
      payload: form.getBuffer()
    });

    expect(response.statusCode).toBe(413);
    expect(JSON.parse(response.body).error).toContain('100 MB');

    await limited.close();
  });

  it('should return 404 for an unknown job id', async () => {
    const response = await app.inject({ method: 'GET', url: '/import/jobs/does-not-exist' });
    expect(response.statusCode).toBe(404);
  });
});
