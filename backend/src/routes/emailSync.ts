import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getUserDatabase } from '../services/userDatabase.js';

import {
  fullSyncContact,
  incrementalSyncContact,
  getContactEmailHistory,
  getSyncedContactIds,
} from '../services/emailSyncService.js';

export default async function emailSyncRoutes(fastify: FastifyInstance) {
  // Full sync for a contact
  fastify.post<{ Params: { id: string } }>(
    '/:id/email-sync',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (request.user?.isDemo) {
        return reply.status(403).send({ error: 'This feature is not available in demo mode. Sign in with Google to unlock all features.' });
      }

      const contactId = parseInt(request.params.id, 10);
      const userId = request.user!.id;

      if (isNaN(contactId)) {
        return reply.status(400).send({ error: 'Invalid contact ID' });
      }

      try {
        const db = getUserDatabase(userId);
        const result = await fullSyncContact(db, userId, contactId);

        if (result.error === 'gmail_scope_required') {
          return reply.status(403).send({ error: 'gmail_scope_required' });
        }
        if (result.error === 'no_token') {
          return reply.status(401).send({ error: 'No valid Google token. Please re-authenticate.' });
        }
        if (result.error === 'no_email_addresses') {
          return reply.status(400).send({ error: 'Contact has no email addresses' });
        }
        if (result.error) {
          return reply.status(500).send({ error: result.error });
        }

        return { synced: result.synced, total: result.total };
      } catch (error) {
        fastify.log.error(error, 'Email sync failed');
        return reply.status(500).send({
          error: 'Email sync failed. Please try again.',
        });
      }
    }
  );

  // Incremental sync for a contact
  fastify.post<{ Params: { id: string } }>(
    '/:id/email-sync/refresh',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (request.user?.isDemo) {
        return reply.status(403).send({ error: 'This feature is not available in demo mode. Sign in with Google to unlock all features.' });
      }

      const contactId = parseInt(request.params.id, 10);
      const userId = request.user!.id;

      if (isNaN(contactId)) {
        return reply.status(400).send({ error: 'Invalid contact ID' });
      }

      try {
        const db = getUserDatabase(userId);
        const result = await incrementalSyncContact(db, userId, contactId);

        if (result.error === 'gmail_scope_required') {
          return reply.status(403).send({ error: 'gmail_scope_required' });
        }
        if (result.error === 'no_token') {
          return reply.status(401).send({ error: 'No valid Google token' });
        }
        if (result.error) {
          return reply.status(500).send({ error: result.error });
        }

        return { synced: result.synced, total: result.total };
      } catch (error) {
        fastify.log.error(error, 'Email refresh failed');
        return reply.status(500).send({
          error: 'Email refresh failed. Please try again.',
        });
      }
    }
  );

  // Get email history for a contact
  fastify.get<{ Params: { id: string }; Querystring: { limit?: string; cursor?: string } }>(
    '/:id/email-history',
    async (request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: string; cursor?: string } }>, reply: FastifyReply) => {
      const contactId = parseInt(request.params.id, 10);

      if (isNaN(contactId)) {
        return reply.status(400).send({ error: 'Invalid contact ID' });
      }

      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 10;
      const cursor = request.query.cursor || undefined;

      const db = getUserDatabase(request.user!.id);
      return getContactEmailHistory(db, contactId, limit, cursor);
    }
  );

  // Incremental sync for all previously-synced contacts (called on login)
  fastify.post(
    '/refresh-all',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.user?.isDemo) {
        return { synced: 0, errors: 0, message: 'Skipped for demo account' };
      }

      const userId = request.user!.id;

      try {
        const db = getUserDatabase(userId);
        const syncedIds = getSyncedContactIds(db);

        // Limit to 50 contacts per refresh
        const idsToSync = syncedIds.slice(0, 50);
        let totalSynced = 0;
        let totalErrors = 0;

        for (const contactId of idsToSync) {
          try {
            const result = await incrementalSyncContact(db, userId, contactId);
            if (result.error === 'gmail_scope_required') {
              return reply.status(403).send({ error: 'gmail_scope_required' });
            }
            totalSynced += result.synced;
          } catch {
            totalErrors++;
          }
        }

        return {
          contactsRefreshed: idsToSync.length,
          emailsSynced: totalSynced,
          errors: totalErrors,
        };
      } catch (error) {
        fastify.log.error(error, 'Bulk email refresh failed');
        return reply.status(500).send({
          error: 'Bulk refresh failed. Please try again.',
        });
      }
    }
  );
}
