import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import {
  getSocialLinksSummary,
  findCrossContactDuplicates,
  findWithinContactIssues,
  fixAllWithinContactIssues,
  findAllCrossContactGroups
} from '../services/socialLinksCleanupService.js';
import {
  SocialLinksCrossContactQuerySchema,
  SocialLinksCrossContactQuery,
  SocialLinksWithinContactQuerySchema,
  SocialLinksWithinContactQuery,
  SocialLinksSummaryResponseSchema,
  SocialLinksCrossContactResponseSchema,
  SocialLinksWithinContactResponseSchema,
  SocialLinksFixAllResponseSchema,
  SocialLinksErrorSchema,
  SocialLinksCrossContactAllGroupsQuerySchema,
  SocialLinksCrossContactAllGroupsQuery,
  SocialLinksCrossContactAllGroupsResponseSchema
} from '../schemas/socialLinksCleanup.js';

export default async function socialLinksCleanupRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // GET /api/cleanup/social-links/summary
  fastify.get('/summary', {
    schema: {
      response: {
        200: SocialLinksSummaryResponseSchema
      }
    }
  }, async (_request, _reply) => {
    return getSocialLinksSummary();
  });

  // GET /api/cleanup/social-links/cross-contact
  fastify.get<{ Querystring: SocialLinksCrossContactQuery }>('/cross-contact', {
    schema: {
      querystring: SocialLinksCrossContactQuerySchema,
      response: {
        200: SocialLinksCrossContactResponseSchema
      }
    }
  }, async (request, _reply) => {
    const { limit = 50, offset = 0, platform } = request.query;
    const { groups, totalGroups } = findCrossContactDuplicates(limit, offset, platform);

    return {
      groups,
      totalGroups,
      limit,
      offset
    };
  });

  // GET /api/cleanup/social-links/cross-contact/all-groups - lightweight endpoint for bulk operations
  fastify.get<{ Querystring: SocialLinksCrossContactAllGroupsQuery }>('/cross-contact/all-groups', {
    schema: {
      querystring: SocialLinksCrossContactAllGroupsQuerySchema,
      response: {
        200: SocialLinksCrossContactAllGroupsResponseSchema
      }
    }
  }, async (request, _reply) => {
    const { platform } = request.query;
    return findAllCrossContactGroups(platform);
  });

  // GET /api/cleanup/social-links/within-contact
  fastify.get<{ Querystring: SocialLinksWithinContactQuery }>('/within-contact', {
    schema: {
      querystring: SocialLinksWithinContactQuerySchema,
      response: {
        200: SocialLinksWithinContactResponseSchema
      }
    }
  }, async (request, _reply) => {
    const { limit = 50, offset = 0 } = request.query;
    const { contacts, total } = findWithinContactIssues(limit, offset);

    return {
      contacts,
      total,
      limit,
      offset
    };
  });

  // POST /api/cleanup/social-links/within-contact/fix-all
  fastify.post('/within-contact/fix-all', {
    schema: {
      response: {
        200: SocialLinksFixAllResponseSchema,
        500: SocialLinksErrorSchema
      }
    }
  }, async (_request, reply) => {
    try {
      const result = fixAllWithinContactIssues();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({ error: message });
    }
  });
}
