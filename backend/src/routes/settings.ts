import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../services/database.js';
import {
  UserSettingsSchema,
  UpdateUserSettingsSchema,
  UpdateUserSettings
} from '../schemas/settings.js';
import { fetchContactPhotos, ProgressUpdate } from '../services/contactPhotoService.js';
import {
  importLinkedInContacts,
  LinkedInContact,
  LinkedInProgressUpdate
} from '../services/linkedinImportService.js';

interface SettingsRow {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  website: string | null;
  linkedin_url: string | null;
  created_at: string;
  updated_at: string;
}

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
  // GET /api/settings - Get user settings
  fastify.get('/', {
    schema: {
      response: {
        200: UserSettingsSchema
      }
    }
  }, async (_request, _reply) => {
    const db = getDatabase();
    const settings = db.prepare(`
      SELECT name, email, phone, avatar_url, website, linkedin_url
      FROM user_settings
      WHERE id = 1
    `).get() as SettingsRow | undefined;

    return {
      name: settings?.name ?? null,
      email: settings?.email ?? null,
      phone: settings?.phone ?? null,
      avatarUrl: settings?.avatar_url ?? null,
      website: settings?.website ?? null,
      linkedinUrl: settings?.linkedin_url ?? null,
    };
  });

  // PUT /api/settings - Update user settings
  fastify.put<{ Body: UpdateUserSettings }>('/', {
    schema: {
      body: UpdateUserSettingsSchema,
      response: {
        200: UserSettingsSchema,
        404: { type: 'object', properties: { error: { type: 'string' } } },
        500: { type: 'object', properties: { error: { type: 'string' } } }
      }
    }
  }, async (request, reply) => {
    const updates = request.body;
    const db = getDatabase();

    // Check settings row exists
    const existingSettings = db.prepare('SELECT id FROM user_settings WHERE id = 1').get() as { id: number } | undefined;
    if (!existingSettings) {
      return reply.status(404).send({ error: 'Settings not initialized' });
    }

    const fields: string[] = [];
    const values: (string | null)[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email);
    }
    if (updates.phone !== undefined) {
      fields.push('phone = ?');
      values.push(updates.phone);
    }
    if (updates.avatarUrl !== undefined) {
      fields.push('avatar_url = ?');
      values.push(updates.avatarUrl);
    }
    if (updates.website !== undefined) {
      fields.push('website = ?');
      values.push(updates.website);
    }
    if (updates.linkedinUrl !== undefined) {
      fields.push('linkedin_url = ?');
      values.push(updates.linkedinUrl);
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      const sql = `UPDATE user_settings SET ${fields.join(', ')} WHERE id = 1`;
      db.prepare(sql).run(...values);
    }

    const settings = db.prepare(`
      SELECT name, email, phone, avatar_url, website, linkedin_url
      FROM user_settings
      WHERE id = 1
    `).get() as SettingsRow | undefined;

    if (!settings) {
      return reply.status(500).send({ error: 'Failed to retrieve settings after update' });
    }

    return {
      name: settings.name,
      email: settings.email,
      phone: settings.phone,
      avatarUrl: settings.avatar_url,
      website: settings.website,
      linkedinUrl: settings.linkedin_url,
    };
  });

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
