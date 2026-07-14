import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Database as DatabaseType } from 'better-sqlite3';
import {
  getEnrichmentSummary,
  enrichContacts,
  recoverFromDataset,
  validateApifyToken,
  EnrichmentProgress,
} from '../services/apifyEnrichmentService.js';
import { getUserDatabase } from '../services/userDatabase.js';
import { encryptToken, decryptToken } from '../services/tokenEncryption.js';

interface ApifyRow {
  apify_api_token: string | null;
  apify_username: string | null;
}

/** Read the stored (encrypted) Apify key and username for the single-row user_settings table. */
function getApifyRow(db: DatabaseType): ApifyRow | undefined {
  return db
    .prepare('SELECT apify_api_token, apify_username FROM user_settings WHERE id = 1')
    .get() as ApifyRow | undefined;
}

export default async function enrichRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // GET /api/enrich/linkedin/summary - Get count of contacts available for enrichment
  fastify.get('/linkedin/summary', {
    schema: {
      querystring: Type.Object({
        includeAlreadyEnriched: Type.Optional(Type.Boolean({ default: false })),
      }),
      response: {
        200: Type.Object({
          configured: Type.Boolean(),
          apifyUsername: Type.Union([Type.String(), Type.Null()]),
          totalWithLinkedIn: Type.Number(),
          alreadyEnriched: Type.Number(),
          pendingEnrichment: Type.Number(),
          totalContacts: Type.Number(),
          enriched: Type.Number(),
          readyToEnrich: Type.Number(),
          noLinkedIn: Type.Number(),
          failed: Type.Number(),
        }),
      },
    },
  }, async (
    request: FastifyRequest<{ Querystring: { includeAlreadyEnriched?: boolean } }>,
    _reply: FastifyReply
  ) => {
    const db = getUserDatabase(request.user!.id);
    const includeAlreadyEnriched = request.query.includeAlreadyEnriched === true;
    const row = getApifyRow(db);
    const summary = getEnrichmentSummary(db, includeAlreadyEnriched);

    return {
      configured: !!row?.apify_api_token,
      apifyUsername: row?.apify_username ?? null,
      ...summary,
    };
  });

  // POST /api/enrich/apify-key - Validate and store the user's Apify API key
  fastify.post<{
    Body: { token: string };
  }>('/apify-key', {
    schema: {
      body: Type.Object({
        token: Type.String({ minLength: 1, maxLength: 500 }),
      }),
    },
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest<{ Body: { token: string } }>, reply: FastifyReply) => {
    if (request.user?.isDemo) {
      return reply.status(403).send({ error: 'This feature is not available in demo mode. Sign in with Google to unlock all features.' });
    }

    const token = request.body.token.trim();
    const validation = await validateApifyToken(token);
    if (!validation.ok) {
      // Bad key → 400; couldn't reach Apify (no status) → 502
      const status = validation.status === 401 || validation.status === 403 ? 400 : 502;
      return reply.status(status).send({ error: validation.error });
    }

    let encrypted: string;
    try {
      encrypted = encryptToken(token);
    } catch {
      return reply.status(500).send({ error: 'Server is missing SESSION_SECRET; cannot store credentials.' });
    }

    const db = getUserDatabase(request.user!.id);
    db.prepare(
      'UPDATE user_settings SET apify_api_token = ?, apify_username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1'
    ).run(encrypted, validation.username ?? null);

    return { success: true, username: validation.username };
  });

  // DELETE /api/enrich/apify-key - Remove the user's stored Apify API key
  fastify.delete('/apify-key', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.isDemo) {
      return reply.status(403).send({ error: 'This feature is not available in demo mode. Sign in with Google to unlock all features.' });
    }

    const db = getUserDatabase(request.user!.id);
    db.prepare(
      'UPDATE user_settings SET apify_api_token = NULL, apify_username = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1'
    ).run();

    return { success: true };
  });

  // POST /api/enrich/linkedin/start - Start enrichment process (SSE)
  fastify.post<{
    Body: { includeAlreadyEnriched?: boolean; limit?: number };
  }>('/linkedin/start', {
    schema: {
      body: Type.Object({
        includeAlreadyEnriched: Type.Optional(Type.Boolean({ default: false })),
        limit: Type.Optional(Type.Number({ minimum: 1 })),
      }),
    },
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest<{ Body: { includeAlreadyEnriched?: boolean; limit?: number } }>, reply: FastifyReply) => {
    if (request.user?.isDemo) {
      return reply.status(403).send({ error: 'This feature is not available in demo mode. Sign in with Google to unlock all features.' });
    }

    const db = getUserDatabase(request.user!.id);
    const row = getApifyRow(db);
    if (!row?.apify_api_token) {
      return reply.status(400).send({
        error: 'LinkedIn enrichment not configured. Add your Apify API key in Tools → Enrich.',
      });
    }
    const token = decryptToken(row.apify_api_token);
    if (!token) {
      return reply.status(500).send({
        error: 'Could not decrypt your Apify key. Disconnect and re-enter your key.',
      });
    }

    const includeAlreadyEnriched = request.body.includeAlreadyEnriched === true;
    const limit = request.body.limit;

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
      const result = await enrichContacts(db, token, includeAlreadyEnriched, (progress: EnrichmentProgress) => {
        sendEvent('progress', progress);
      }, limit);

      sendEvent('complete', result);
    } catch (error) {
      fastify.log.error(error, 'Enrichment failed');
      sendEvent('error', { error: 'Enrichment failed. Please try again.' });
    } finally {
      reply.raw.end();
    }
  });

  // GET /api/enrich/linkedin/contacts - Get contacts by enrichment category
  fastify.get<{
    Querystring: { category: string };
  }>('/linkedin/contacts', {
    schema: {
      querystring: Type.Object({
        category: Type.String(),
      }),
    },
  }, async (request: FastifyRequest<{ Querystring: { category: string } }>, reply: FastifyReply) => {
    const { category } = request.query;
    const db = getUserDatabase(request.user!.id);

    interface CategoryContactRow {
      id: number;
      display_name: string;
      company: string | null;
      linkedin_url: string | null;
      error_reason?: string | null;
      enriched_at?: string | null;
    }

    let contacts: CategoryContactRow[];

    switch (category) {
      case 'enriched':
        contacts = db.prepare(`
          SELECT c.id, c.display_name, c.company,
            (SELECT profile_url FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'linkedin' LIMIT 1) as linkedin_url,
            le.enriched_at
          FROM contacts c
          INNER JOIN linkedin_enrichment le ON le.contact_id = c.id
          WHERE c.archived_at IS NULL
          ORDER BY le.enriched_at DESC
        `).all() as CategoryContactRow[];
        break;

      case 'ready':
        contacts = db.prepare(`
          SELECT c.id, c.display_name, c.company,
            COALESCE(
              (SELECT profile_url FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'linkedin' LIMIT 1),
              (SELECT url FROM contact_urls WHERE contact_id = c.id AND url LIKE '%linkedin.com%' LIMIT 1)
            ) as linkedin_url
          FROM contacts c
          WHERE c.archived_at IS NULL
            AND (
              EXISTS (SELECT 1 FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'linkedin')
              OR EXISTS (SELECT 1 FROM contact_urls WHERE contact_id = c.id AND url LIKE '%linkedin.com%')
            )
            AND NOT EXISTS (SELECT 1 FROM linkedin_enrichment WHERE contact_id = c.id)
            AND NOT EXISTS (SELECT 1 FROM linkedin_enrichment_failures WHERE contact_id = c.id)
          ORDER BY c.display_name
        `).all() as CategoryContactRow[];
        break;

      case 'failed':
        contacts = db.prepare(`
          SELECT c.id, c.display_name, c.company,
            (SELECT profile_url FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'linkedin' LIMIT 1) as linkedin_url,
            lef.error_reason, lef.attempted_at as enriched_at
          FROM contacts c
          INNER JOIN linkedin_enrichment_failures lef ON lef.contact_id = c.id
          WHERE c.archived_at IS NULL
          ORDER BY lef.attempted_at DESC
        `).all() as CategoryContactRow[];
        break;

      case 'no-linkedin':
        contacts = db.prepare(`
          SELECT c.id, c.display_name, c.company, NULL as linkedin_url
          FROM contacts c
          WHERE c.archived_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'linkedin')
            AND NOT EXISTS (SELECT 1 FROM contact_urls WHERE contact_id = c.id AND url LIKE '%linkedin.com%')
          ORDER BY c.display_name
        `).all() as CategoryContactRow[];
        break;

      default:
        return reply.code(400).send({ error: 'Invalid category. Use: enriched, ready, failed, no-linkedin' });
    }

    return {
      category,
      total: contacts.length,
      contacts: contacts.map(c => ({
        id: c.id,
        displayName: c.display_name,
        company: c.company,
        linkedinUrl: c.linkedin_url ?? null,
        errorReason: c.error_reason ?? null,
        enrichedAt: c.enriched_at ?? null,
      })),
    };
  });

  // POST /api/enrich/linkedin/recover - Recover results from an Apify dataset (SSE)
  fastify.post<{
    Body: { datasetId: string };
  }>('/linkedin/recover', {
    schema: {
      body: Type.Object({
        datasetId: Type.String({ minLength: 1 }),
      }),
    },
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest<{ Body: { datasetId: string } }>, reply: FastifyReply) => {
    if (request.user?.isDemo) {
      return reply.status(403).send({ error: 'This feature is not available in demo mode. Sign in with Google to unlock all features.' });
    }

    const db = getUserDatabase(request.user!.id);
    const row = getApifyRow(db);
    if (!row?.apify_api_token) {
      return reply.status(400).send({
        error: 'LinkedIn enrichment not configured. Add your Apify API key in Tools → Enrich.',
      });
    }
    const token = decryptToken(row.apify_api_token);
    if (!token) {
      return reply.status(500).send({
        error: 'Could not decrypt your Apify key. Disconnect and re-enter your key.',
      });
    }

    const { datasetId } = request.body;

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await recoverFromDataset(db, token, datasetId, (progress: EnrichmentProgress) => {
        sendEvent('progress', progress);
      });

      sendEvent('complete', result);
    } catch (error) {
      fastify.log.error(error, 'Recovery failed');
      sendEvent('error', { error: 'Recovery failed. Please try again.' });
    } finally {
      reply.raw.end();
    }
  });
}
