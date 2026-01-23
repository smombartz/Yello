import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import {
  getCleanupSummary,
  findEmptyContacts,
  findProblematicContacts,
  deleteContacts,
  getAllEmptyContactIds,
  getAllProblematicContactIds,
  type EmptyContactType,
  type ProblematicContactType
} from '../services/cleanupService.js';
import {
  CleanupQuerySchema,
  CleanupQuery,
  CleanupSummaryQuerySchema,
  CleanupSummaryQuery,
  CleanupIdsQuerySchema,
  CleanupIdsQuery,
  DeleteContactsBodySchema,
  DeleteContactsBody,
  CleanupResponseSchema,
  CleanupSummaryResponseSchema,
  CleanupIdsResponseSchema,
  DeleteContactsResponseSchema,
  CleanupErrorSchema
} from '../schemas/cleanup.js';

export default async function cleanupRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // GET /api/cleanup/summary
  fastify.get<{ Querystring: CleanupSummaryQuery }>('/summary', {
    schema: {
      querystring: CleanupSummaryQuerySchema,
      response: {
        200: CleanupSummaryResponseSchema
      }
    }
  }, async (request, _reply) => {
    const { threshold = 3 } = request.query;
    return getCleanupSummary(threshold);
  });

  // GET /api/cleanup/ids - Get all contact IDs for a query (for bulk selection)
  fastify.get<{ Querystring: CleanupIdsQuery }>('/ids', {
    schema: {
      querystring: CleanupIdsQuerySchema,
      response: {
        200: CleanupIdsResponseSchema,
        400: CleanupErrorSchema
      }
    }
  }, async (request, reply) => {
    const { mode, types, threshold = 3 } = request.query;

    if (mode === 'empty') {
      const validEmptyTypes: EmptyContactType[] = ['truly_empty', 'name_only'];
      const typeFilter = types
        ? types.split(',').map(t => t.trim()).filter((t): t is EmptyContactType => validEmptyTypes.includes(t as EmptyContactType))
        : undefined;

      const contactIds = getAllEmptyContactIds(typeFilter);
      return { contactIds };
    } else if (mode === 'problematic') {
      const validProblematicTypes: ProblematicContactType[] = ['many_domains', 'same_domain'];
      const typeFilter = types
        ? types.split(',').map(t => t.trim()).filter((t): t is ProblematicContactType => validProblematicTypes.includes(t as ProblematicContactType))
        : undefined;

      const contactIds = getAllProblematicContactIds(threshold, typeFilter);
      return { contactIds };
    }

    return reply.status(400).send({ error: 'Invalid mode' });
  });

  // GET /api/cleanup
  fastify.get<{ Querystring: CleanupQuery }>('/', {
    schema: {
      querystring: CleanupQuerySchema,
      response: {
        200: CleanupResponseSchema,
        400: CleanupErrorSchema
      }
    }
  }, async (request, reply) => {
    const { mode, limit = 50, offset = 0, types, threshold = 3 } = request.query;

    if (mode === 'empty') {
      // Parse types filter
      const validEmptyTypes: EmptyContactType[] = ['truly_empty', 'name_only'];
      const typeFilter = types
        ? types.split(',').map(t => t.trim()).filter((t): t is EmptyContactType => validEmptyTypes.includes(t as EmptyContactType))
        : undefined;

      const { contacts, total } = findEmptyContacts(limit, offset, typeFilter);

      return {
        contacts,
        total,
        limit,
        offset
      };
    } else if (mode === 'problematic') {
      // Parse types filter
      const validProblematicTypes: ProblematicContactType[] = ['many_domains', 'same_domain'];
      const typeFilter = types
        ? types.split(',').map(t => t.trim()).filter((t): t is ProblematicContactType => validProblematicTypes.includes(t as ProblematicContactType))
        : undefined;

      const { contacts, total } = findProblematicContacts(limit, offset, threshold, typeFilter);

      return {
        contacts,
        total,
        limit,
        offset
      };
    }

    return reply.status(400).send({ error: 'Invalid mode' });
  });

  // DELETE /api/cleanup/delete
  fastify.delete<{ Body: DeleteContactsBody }>('/delete', {
    schema: {
      body: DeleteContactsBodySchema,
      response: {
        200: DeleteContactsResponseSchema,
        400: CleanupErrorSchema
      }
    }
  }, async (request, reply) => {
    const { contactIds } = request.body;

    try {
      const result = deleteContacts(contactIds);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });
}
