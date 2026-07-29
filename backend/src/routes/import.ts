import { FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { getUserDatabase, getUserImportsPath } from '../services/userDatabase.js';
import { runVcfImportJob } from '../services/importService.js';
import {
  createImportJob,
  getImportJob,
  getActiveImportJob,
  failJob
} from '../services/importJobService.js';
import {
  ImportJobParamsSchema,
  ImportJobSchema,
  ActiveImportJobResponseSchema,
  type ImportJobParams
} from '../schemas/import.js';

const ALLOWED_EXTENSIONS = ['.vcf', '.vcard'];
const ALLOWED_MIME_TYPES = ['text/vcard', 'text/x-vcard', 'text/directory'];

/** Enough to cover a leading BOM plus a few property lines. */
const CONTENT_SNIFF_BYTES = 4096;

/**
 * Reads the head of the staged file to confirm it really is a vCard. Replaces
 * the old whole-file `includes('BEGIN:VCARD')` check, which required holding
 * the entire upload in memory.
 */
async function looksLikeVcard(filePath: string): Promise<boolean> {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(CONTENT_SNIFF_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, CONTENT_SNIFF_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString('utf-8').toUpperCase().includes('BEGIN:VCARD');
  } finally {
    await handle.close();
  }
}

const importRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Stages the upload on the data volume and hands it to a background worker.
   * Returns immediately — large files used to be parsed inline and tripped a
   * 2-minute timeout that reported failure while the import kept running.
   */
  app.post('/import', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (request.user?.isDemo) {
      return reply.status(403).send({ error: 'This feature is not available in demo mode. Sign in with Google to unlock all features.' });
    }

    const userId = request.user!.id;
    const db = getUserDatabase(userId);

    // One import at a time per user, so two jobs cannot interleave writes.
    const active = getActiveImportJob(db);
    if (active) {
      return reply.code(409).send({
        error: 'An import is already running. Wait for it to finish before starting another.',
        jobId: active.id
      });
    }

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    // Validate file extension
    const filename = data.filename?.toLowerCase() || '';
    const hasValidExtension = ALLOWED_EXTENSIONS.some(ext => filename.endsWith(ext));
    if (!hasValidExtension) {
      return reply.code(400).send({
        error: 'Invalid file type. Only .vcf and .vcard files are allowed.'
      });
    }

    // Validate MIME type (if provided)
    const mimeType = data.mimetype?.toLowerCase();
    if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType) && mimeType !== 'application/octet-stream') {
      return reply.code(400).send({
        error: 'Invalid file type. Only vCard files are allowed.'
      });
    }

    // Stream straight to disk — never buffer the whole upload in memory.
    const jobId = crypto.randomUUID();
    const filePath = path.join(getUserImportsPath(userId), `${jobId}.vcf`);

    try {
      await pipeline(data.file, fs.createWriteStream(filePath));
    } catch (error) {
      await fs.promises.unlink(filePath).catch(() => { /* nothing staged */ });

      // @fastify/multipart aborts the stream with FST_REQ_FILE_TOO_LARGE once
      // the configured fileSize limit is passed.
      const code = (error as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE' || data.file.truncated) {
        return reply.code(413).send({ error: 'File exceeds the 100 MB size limit.' });
      }

      request.log.error(error, 'Failed to stage import upload');
      return reply.code(500).send({ error: 'Could not save the uploaded file. Please try again.' });
    }

    if (data.file.truncated) {
      await fs.promises.unlink(filePath).catch(() => { /* best effort */ });
      return reply.code(413).send({ error: 'File exceeds the 100 MB size limit.' });
    }

    if (!(await looksLikeVcard(filePath))) {
      await fs.promises.unlink(filePath).catch(() => { /* best effort */ });
      return reply.code(400).send({
        error: 'Invalid vCard file. File does not contain valid vCard data.'
      });
    }

    const { size } = await fs.promises.stat(filePath);
    const createdJobId = createImportJob(db, {
      id: jobId,
      filename: data.filename ?? null,
      filePath,
      fileSize: size
    });

    // Fire and forget: the worker owns the job row from here. The catch is
    // essential — an unhandled rejection would take the process down.
    void runVcfImportJob(userId, createdJobId).catch((error) => {
      app.log.error(error, `Import job ${createdJobId} failed`);
      try {
        failJob(getUserDatabase(userId), createdJobId, 'Import failed unexpectedly. Please try again.');
      } catch (updateError) {
        app.log.error(updateError, `Could not mark import job ${createdJobId} as failed`);
      }
    });

    return reply.code(202).send({ jobId: createdJobId });
  });

  /**
   * Polled roughly once a second while an import runs, so it needs a much
   * higher ceiling than the global 100/min limiter.
   */
  app.get('/import/jobs/active', {
    config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    schema: { response: { 200: ActiveImportJobResponseSchema } }
  }, async (request) => {
    const db = getUserDatabase(request.user!.id);
    return { job: getActiveImportJob(db) };
  });

  app.get<{ Params: ImportJobParams }>('/import/jobs/:id', {
    config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    schema: {
      params: ImportJobParamsSchema,
      response: { 200: ImportJobSchema }
    }
  }, async (request, reply) => {
    const db = getUserDatabase(request.user!.id);
    const job = getImportJob(db, request.params.id);

    if (!job) {
      return reply.code(404).send({ error: 'Import job not found' });
    }

    return job;
  });
};

export default importRoutes;
