import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../services/database.js';
import { fetchContactPhotos, ProgressUpdate } from '../services/contactPhotoService.js';
import {
  importLinkedInContacts,
  LinkedInContact,
  LinkedInProgressUpdate
} from '../services/linkedinImportService.js';

// Get user from session helper
function getUserIdFromSession(request: FastifyRequest): number | null {
  const sessionId = request.cookies.session_id;
  if (!sessionId) return null;

  const db = getDatabase();

  const session = db.prepare(`
    SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')
  `).get(sessionId) as { user_id: number } | undefined;

  return session?.user_id || null;
}

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
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return reply.status(401).send({ error: 'Not authenticated. Please log in with Google first.' });
    }

    try {
      const result = await fetchContactPhotos(userId);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch contact photos';
      return reply.status(500).send({ error: message });
    }
  });

  // GET /api/settings/fetch-contact-photos-stream - Stream progress while fetching photos (SSE)
  fastify.get('/fetch-contact-photos-stream', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return reply.status(401).send({ error: 'Not authenticated. Please log in with Google first.' });
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
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
      const message = error instanceof Error ? error.message : 'Failed to fetch contact photos';
      sendEvent('error', { error: message });
    } finally {
      reply.raw.end();
    }
  });

  // POST /api/settings/import-linkedin - Import LinkedIn contacts from CSV data (SSE)
  fastify.post<{
    Body: { contacts: LinkedInContact[] };
  }>('/import-linkedin', async (request: FastifyRequest<{ Body: { contacts: LinkedInContact[] } }>, reply: FastifyReply) => {
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
      'Access-Control-Allow-Origin': '*',
    });

    // Helper to send SSE events
    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await importLinkedInContacts(contacts, (progress: LinkedInProgressUpdate) => {
        sendEvent('progress', progress);
      });

      sendEvent('complete', result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import LinkedIn contacts';
      sendEvent('error', { error: message });
    } finally {
      reply.raw.end();
    }
  });
}
