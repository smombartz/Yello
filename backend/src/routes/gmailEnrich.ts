import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { requireAuth } from '../middleware/auth.js';
import { getDatabase } from '../services/database.js';
import {
  getGmailSyncSummary,
  discoverContacts,
} from '../services/emailDiscoveryService.js';
import {
  fullSyncContact,
  incrementalSyncContact,
} from '../services/emailSyncService.js';

export default async function gmailEnrichRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('preHandler', requireAuth);

  // GET /summary - sync status overview
  fastify.get('/summary', async () => {
    return getGmailSyncSummary();
  });

  // POST /discover - scan Gmail to find and rank contacts
  fastify.post<{
    Body: { strategy: 'recent' | 'frequent'; scanDepth?: number };
  }>('/discover', {
    schema: {
      body: Type.Object({
        strategy: Type.Union([Type.Literal('recent'), Type.Literal('frequent')]),
        scanDepth: Type.Optional(Type.Number({ minimum: 50, maximum: 5000, default: 500 })),
      }),
    },
  }, async (request: FastifyRequest<{ Body: { strategy: 'recent' | 'frequent'; scanDepth?: number } }>, reply: FastifyReply) => {
    const userId = request.user!.id;
    const { strategy, scanDepth } = request.body;

    try {
      const result = await discoverContacts(userId, strategy, scanDepth ?? 500);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === 'no_token') {
        return reply.status(401).send({ error: 'No valid Google token. Please re-authenticate.' });
      }
      if (msg === 'gmail_scope_required') {
        return reply.status(403).send({ error: 'gmail_scope_required' });
      }
      fastify.log.error(error, 'Gmail discover failed');
      return reply.status(500).send({ error: msg });
    }
  });

  // POST /bulk-sync - SSE stream to sync multiple contacts
  fastify.post<{
    Body: {
      contactIds?: number[];
      strategy?: 'all' | 'unsynced';
      limit: number;
    };
  }>('/bulk-sync', {
    schema: {
      body: Type.Object({
        contactIds: Type.Optional(Type.Array(Type.Number())),
        strategy: Type.Optional(Type.Union([Type.Literal('all'), Type.Literal('unsynced')])),
        limit: Type.Number({ minimum: 1, maximum: 5000 }),
      }),
    },
  }, async (request: FastifyRequest<{ Body: { contactIds?: number[]; strategy?: 'all' | 'unsynced'; limit: number } }>, reply: FastifyReply) => {
    const userId = request.user!.id;
    const { contactIds, strategy, limit } = request.body;

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const db = getDatabase();
      let idsToSync: number[];

      if (contactIds && contactIds.length > 0) {
        // Specific contacts from discovery step
        idsToSync = contactIds.slice(0, limit);
      } else if (strategy === 'unsynced') {
        // Contacts with email but no gmail_last_sync_at
        const rows = db.prepare(`
          SELECT DISTINCT c.id
          FROM contacts c
          INNER JOIN contact_emails ce ON ce.contact_id = c.id
          WHERE c.archived_at IS NULL AND c.gmail_last_sync_at IS NULL
          ORDER BY c.display_name
          LIMIT ?
        `).all(limit) as Array<{ id: number }>;
        idsToSync = rows.map(r => r.id);
      } else {
        // All contacts with email
        const rows = db.prepare(`
          SELECT DISTINCT c.id
          FROM contacts c
          INNER JOIN contact_emails ce ON ce.contact_id = c.id
          WHERE c.archived_at IS NULL
          ORDER BY c.display_name
          LIMIT ?
        `).all(limit) as Array<{ id: number }>;
        idsToSync = rows.map(r => r.id);
      }

      const total = idsToSync.length;
      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < idsToSync.length; i++) {
        const contactId = idsToSync[i];

        // Get contact name for progress display
        const contact = db.prepare('SELECT display_name FROM contacts WHERE id = ?')
          .get(contactId) as { display_name: string } | undefined;
        const contactName = contact?.display_name || `Contact #${contactId}`;

        sendEvent('progress', {
          current: i + 1,
          total,
          contactName,
          succeeded,
          failed,
        });

        try {
          // Check if contact has been synced before
          const syncInfo = db.prepare('SELECT gmail_last_sync_at FROM contacts WHERE id = ?')
            .get(contactId) as { gmail_last_sync_at: string | null } | undefined;

          let result;
          if (syncInfo?.gmail_last_sync_at) {
            result = await incrementalSyncContact(userId, contactId);
          } else {
            result = await fullSyncContact(userId, contactId);
          }

          if (result.error === 'gmail_scope_required') {
            sendEvent('error', { error: 'Gmail scope required. Please re-authenticate with Gmail permissions.' });
            reply.raw.end();
            return;
          }
          if (result.error === 'no_token') {
            sendEvent('error', { error: 'No valid Google token. Please re-authenticate.' });
            reply.raw.end();
            return;
          }
          if (result.error) {
            failed++;
          } else {
            succeeded++;
          }
        } catch {
          failed++;
        }
      }

      sendEvent('complete', { succeeded, failed });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bulk sync failed';
      sendEvent('error', { error: message });
    } finally {
      reply.raw.end();
    }
  });
}
