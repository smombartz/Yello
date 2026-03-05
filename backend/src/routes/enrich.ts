import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import {
  isLinkedInEnrichmentConfigured,
  getEnrichmentSummary,
  enrichContacts,
  recoverFromDataset,
  EnrichmentProgress,
} from '../services/apifyEnrichmentService.js';
import { getUserDatabase } from '../services/userDatabase.js';

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
    const configured = isLinkedInEnrichmentConfigured();
    const summary = getEnrichmentSummary(db, includeAlreadyEnriched);

    return {
      configured,
      ...summary,
    };
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
    if (!isLinkedInEnrichmentConfigured()) {
      return reply.status(400).send({
        error: 'LinkedIn enrichment not configured. Set APIFY_API_TOKEN environment variable.',
      });
    }

    const db = getUserDatabase(request.user!.id);
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
      const result = await enrichContacts(db, includeAlreadyEnriched, (progress: EnrichmentProgress) => {
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
    if (!isLinkedInEnrichmentConfigured()) {
      return reply.status(400).send({
        error: 'LinkedIn enrichment not configured. Set APIFY_API_TOKEN environment variable.',
      });
    }

    const db = getUserDatabase(request.user!.id);
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
      const result = await recoverFromDataset(db, datasetId, (progress: EnrichmentProgress) => {
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
