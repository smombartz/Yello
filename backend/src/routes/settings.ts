import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { getUserDatabase } from '../services/userDatabase.js';
import { fetchContactPhotos, ProgressUpdate } from '../services/contactPhotoService.js';
import {
  importLinkedInContacts,
  LinkedInContact,
  LinkedInProgressUpdate
} from '../services/linkedinImportService.js';

export default async function settingsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // POST /api/settings/fetch-contact-photos - Fetch photos for contacts from Google Contacts and Gravatar
  fastify.post('/fetch-contact-photos', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            matched: { type: 'number' },
            downloaded: { type: 'number' },
            failed: { type: 'number' },
            skipped: { type: 'number' }
          }
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        500: { type: 'object', properties: { error: { type: 'string' } } }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;

    try {
      const result = await fetchContactPhotos(userId);
      return result;
    } catch (error) {
      fastify.log.error(error, 'Photo fetch failed');
      return reply.status(500).send({ error: 'Photo fetch failed. Please try again.' });
    }
  });

  // GET /api/settings/fetch-contact-photos-stream - Stream progress while fetching photos (SSE)
  fastify.get('/fetch-contact-photos-stream', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Helper to send SSE events
    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await fetchContactPhotos(userId, (progress: ProgressUpdate) => {
        sendEvent('progress', progress);
      });

      sendEvent('complete', result);
    } catch (error) {
      fastify.log.error(error, 'Photo fetch stream failed');
      sendEvent('error', { error: 'Photo fetch failed. Please try again.' });
    } finally {
      reply.raw.end();
    }
  });

  // POST /api/settings/import-linkedin - Import LinkedIn contacts from CSV data (SSE)
  fastify.post<{
    Body: { contacts: LinkedInContact[] };
  }>('/import-linkedin', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request: FastifyRequest<{ Body: { contacts: LinkedInContact[] } }>, reply: FastifyReply) => {
    const { contacts } = request.body;

    if (!contacts || !Array.isArray(contacts)) {
      return reply.status(400).send({ error: 'Invalid request: contacts array required' });
    }

    if (contacts.length === 0) {
      return reply.status(400).send({ error: 'No contacts to import' });
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Helper to send SSE events
    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const db = getUserDatabase(request.user!.id);
      const result = await importLinkedInContacts(db, contacts, (progress: LinkedInProgressUpdate) => {
        sendEvent('progress', progress);
      });

      sendEvent('complete', result);
    } catch (error) {
      fastify.log.error(error, 'LinkedIn import failed');
      sendEvent('error', { error: 'LinkedIn import failed. Please try again.' });
    } finally {
      reply.raw.end();
    }
  });
}
