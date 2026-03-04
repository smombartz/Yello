import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { findDuplicates, getDuplicateSummary, getAllDuplicateGroupIds } from '../services/deduplicationService.js';
import { mergeContacts } from '../services/mergeService.js';
import {
  DuplicatesQuerySchema,
  DuplicatesQuery,
  DuplicateGroupsResponseSchema,
  DuplicateSummarySchema,
  MergeRequestSchema,
  MergeRequest,
  MergeResponseSchema,
  AllDuplicateGroupsQuerySchema,
  AllDuplicateGroupsQuery,
  AllDuplicateGroupsResponseSchema
} from '../schemas/duplicates.js';

export default async function duplicatesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // GET /api/duplicates/summary
  fastify.get('/summary', {
    schema: {
      response: {
        200: DuplicateSummarySchema
      }
    }
  }, async (_request, _reply) => {
    return getDuplicateSummary();
  });

  // GET /api/duplicates/all-groups - lightweight endpoint for bulk operations
  fastify.get<{ Querystring: AllDuplicateGroupsQuery }>('/all-groups', {
    schema: {
      querystring: AllDuplicateGroupsQuerySchema,
      response: {
        200: AllDuplicateGroupsResponseSchema
      }
    }
  }, async (request, _reply) => {
    const { mode, confidence } = request.query;
    const confidenceLevels = confidence?.split(',').filter(c =>
      ['very_high', 'high', 'medium'].includes(c)
    );
    return getAllDuplicateGroupIds(mode, confidenceLevels);
  });

  // GET /api/duplicates
  fastify.get<{ Querystring: DuplicatesQuery }>('/', {
    schema: {
      querystring: DuplicatesQuerySchema,
      response: {
        200: DuplicateGroupsResponseSchema
      }
    }
  }, async (request, _reply) => {
    const { mode, limit = 50, offset = 0, confidence } = request.query;

    // Parse and validate confidence levels from comma-separated string if provided
    const validConfidenceLevels = ['very_high', 'high', 'medium'];
    const confidenceLevels = confidence
      ? confidence.split(',').map(c => c.trim()).filter(c => validConfidenceLevels.includes(c))
      : undefined;

    const { groups, totalGroups } = findDuplicates(mode, limit, offset, confidenceLevels);

    return {
      groups,
      totalGroups,
      limit,
      offset
    };
  });

  // POST /api/duplicates/merge
  fastify.post<{ Body: MergeRequest }>('/merge', {
    schema: {
      body: MergeRequestSchema,
      response: {
        200: MergeResponseSchema
      }
    }
  }, async (request, reply) => {
    const { contactIds, primaryContactId } = request.body;

    try {
      const result = mergeContacts(contactIds, primaryContactId);
      return result;
    } catch (error) {
      fastify.log.error(error, 'Duplicate merge failed');
      return reply.status(500).send({ error: 'Duplicate detection failed. Please try again.' });
    }
  });
}
