import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import {
  isLinkedInEnrichmentConfigured,
  getEnrichmentSummary,
  enrichContacts,
  EnrichmentProgress,
} from '../services/apolloEnrichmentService.js';

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
        }),
      },
    },
  }, async (
    request: FastifyRequest<{ Querystring: { includeAlreadyEnriched?: boolean } }>,
    _reply: FastifyReply
  ) => {
    const includeAlreadyEnriched = request.query.includeAlreadyEnriched === true;
    const configured = isLinkedInEnrichmentConfigured();
    const summary = getEnrichmentSummary(includeAlreadyEnriched);

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
  }, async (request: FastifyRequest<{ Body: { includeAlreadyEnriched?: boolean; limit?: number } }>, reply: FastifyReply) => {
    if (!isLinkedInEnrichmentConfigured()) {
      return reply.status(400).send({
        error: 'LinkedIn enrichment not configured. Set APOLLO_API_KEY environment variable.',
      });
    }

    const includeAlreadyEnriched = request.body.includeAlreadyEnriched === true;
    const limit = request.body.limit;

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
      const result = await enrichContacts(includeAlreadyEnriched, (progress: EnrichmentProgress) => {
        sendEvent('progress', progress);
      }, limit);

      sendEvent('complete', result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Enrichment failed';
      sendEvent('error', { error: message });
    } finally {
      reply.raw.end();
    }
  });
}
