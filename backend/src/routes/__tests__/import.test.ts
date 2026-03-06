import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import FormData from 'form-data';
import importRoutes from '../import.js';
import { closeAllUserDatabases } from '../../services/userDatabase.js';
import os from 'os';
import fs from 'fs';
import path from 'path';

// Mock the photo processor to avoid file system operations during tests
vi.mock('../../services/photoProcessor.js', () => ({
  processPhoto: vi.fn().mockResolvedValue('mock-hash-123')
}));

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

  it('should import a simple VCF contact', async () => {
    const vcfContent = `BEGIN:VCARD
VERSION:3.0
FN:John Doe
N:Doe;John;;;
EMAIL:john@example.com
TEL:+1-555-123-4567
END:VCARD`;

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

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.imported).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.errors).toEqual([]);
  });

  it('should import multiple contacts from a single VCF file', async () => {
    const vcfContent = `BEGIN:VCARD
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
END:VCARD`;

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

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.imported).toBe(2);
    expect(body.failed).toBe(0);
  });

  it('should handle contacts with photos and track photosProcessed count', async () => {
    // Use a proper base64 encoded PHOTO property that ical.js can parse
    const vcfContent = `BEGIN:VCARD
VERSION:3.0
FN:Photo Person
N:Person;Photo;;;
PHOTO;VALUE=URI:data:image/jpeg;base64,/9j/4AAQSkZJRg==
END:VCARD`;

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

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.imported).toBe(1);
    expect(body.photosProcessed).toBe(1);
  });

  it('should handle contacts with addresses', async () => {
    const vcfContent = `BEGIN:VCARD
VERSION:3.0
FN:Address Person
N:Person;Address;;;
ADR;TYPE=HOME:;;123 Main St;Springfield;IL;62701;USA
END:VCARD`;

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

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.imported).toBe(1);
    expect(body.failed).toBe(0);
  });

  it('should handle contacts with company and title', async () => {
    const vcfContent = `BEGIN:VCARD
VERSION:3.0
FN:Corporate Person
N:Person;Corporate;;;
ORG:Acme Inc
TITLE:Software Engineer
END:VCARD`;

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

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.imported).toBe(1);
  });

  it('should return errors for malformed VCF entries while importing valid ones', async () => {
    const vcfContent = `BEGIN:VCARD
VERSION:3.0
FN:Valid Contact
N:Contact;Valid;;;
END:VCARD
BEGIN:VCARD
VERSION:3.0
END:VCARD`;

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

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.imported).toBe(1);
    expect(body.failed).toBeGreaterThan(0);
    expect(body.errors.length).toBeGreaterThan(0);
  });
});
