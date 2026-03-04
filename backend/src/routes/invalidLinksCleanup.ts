import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import {
  searchInvalidLinks,
  removeInvalidLinks
} from '../services/invalidLinksCleanupService.js';
import {
  InvalidLinksSearchRequestSchema,
  InvalidLinksSearchRequest,
  InvalidLinksRemoveRequestSchema,
  InvalidLinksRemoveRequest,
  InvalidLinksSearchResponseSchema,
  InvalidLinksRemoveResponseSchema,
  InvalidLinksErrorSchema
} from '../schemas/invalidLinksCleanup.js';

export default async function invalidLinksCleanupRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // POST /api/cleanup/invalid-links/search
  fastify.post<{ Body: InvalidLinksSearchRequest }>('/search', {
    schema: {
      body: InvalidLinksSearchRequestSchema,
      response: {
        200: InvalidLinksSearchResponseSchema,
        400: InvalidLinksErrorSchema
      }
    }
  }, async (request, reply) => {
    const { patterns } = request.body;

    if (!patterns || patterns.length === 0) {
      return reply.status(400).send({ error: 'At least one pattern is required' });
    }

    const result = searchInvalidLinks(patterns);
    return result;
  });

  // POST /api/cleanup/invalid-links/remove
  fastify.post<{ Body: InvalidLinksRemoveRequest }>('/remove', {
    schema: {
      body: InvalidLinksRemoveRequestSchema,
      response: {
        200: InvalidLinksRemoveResponseSchema,
        400: InvalidLinksErrorSchema,
        500: InvalidLinksErrorSchema
      }
    }
  }, async (request, reply) => {
    const { patterns } = request.body;

    if (!patterns || patterns.length === 0) {
      return reply.status(400).send({ error: 'At least one pattern is required' });
    }

    try {
      const result = removeInvalidLinks(patterns);
      return result;
    } catch (error) {
      fastify.log.error(error, 'Link validation failed');
      return reply.status(500).send({ error: 'Link validation failed. Please try again.' });
    }
  });
}
