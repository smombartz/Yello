import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import {
  getAddressCleanupSummary,
  findAddressIssues,
  applyAddressFixes,
  getAllAddressIssueContacts,
  getNormalizeSummary,
  findJunkAddresses,
  removeJunkAddresses,
  getAllJunkAddressIds,
  getDuplicatesSummary,
  findDuplicateAddresses,
  getAllDuplicateContacts,
  getGeocodingSummary,
  findAddressesByGeoStatus,
  retryGeocoding,
  batchGeocode,
  updateAddressAndGeocode,
  isGeocodingAvailable,
  type GeocodingStatus
} from '../services/addressCleanupService.js';
import {
  AddressCleanupQuerySchema,
  AddressCleanupQuery,
  AddressFixRequestSchema,
  AddressFixRequest,
  AddressCleanupSummaryResponseSchema,
  AddressCleanupResponseSchema,
  AddressFixResponseSchema,
  AddressCleanupErrorSchema,
  AddressCleanupBulkResponseSchema,
  NormalizeSummaryResponseSchema,
  NormalizeResponseSchema,
  NormalizeFixRequestSchema,
  NormalizeFixRequest,
  NormalizeFixResponseSchema,
  NormalizeAllIdsResponseSchema,
  DuplicatesSummaryResponseSchema,
  DuplicatesResponseSchema,
  GeocodingSummaryResponseSchema,
  GeocodingResponseSchema,
  GeocodingQuerySchema,
  GeocodingQuery,
  GeocodingRetryRequestSchema,
  GeocodingRetryRequest,
  GeocodingBatchRequestSchema,
  GeocodingBatchRequest,
  GeocodingBatchResponseSchema,
  GeocodingUpdateRequestSchema,
  GeocodingUpdateRequest,
  GeocodingUpdateResponseSchema
} from '../schemas/addressCleanup.js';

export default async function addressCleanupRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // ============================================================
  // Legacy endpoints (combined view) - kept for backward compatibility
  // ============================================================

  // GET /api/cleanup/addresses/summary
  fastify.get('/summary', {
    schema: {
      response: {
        200: AddressCleanupSummaryResponseSchema
      }
    }
  }, async (_request, _reply) => {
    return getAddressCleanupSummary();
  });

  // GET /api/cleanup/addresses
  fastify.get<{ Querystring: AddressCleanupQuery }>('/', {
    schema: {
      querystring: AddressCleanupQuerySchema,
      response: {
        200: AddressCleanupResponseSchema
      }
    }
  }, async (request, _reply) => {
    const { limit = 50, offset = 0 } = request.query;
    return findAddressIssues(limit, offset);
  });

  // GET /api/cleanup/addresses/all - get all contacts for bulk fix
  fastify.get('/all', {
    schema: {
      response: {
        200: AddressCleanupBulkResponseSchema
      }
    }
  }, async (_request, _reply) => {
    return getAllAddressIssueContacts();
  });

  // POST /api/cleanup/addresses/fix
  fastify.post<{ Body: AddressFixRequest }>('/fix', {
    schema: {
      body: AddressFixRequestSchema,
      response: {
        200: AddressFixResponseSchema,
        500: AddressCleanupErrorSchema
      }
    }
  }, async (request, reply) => {
    try {
      const { fixes } = request.body;
      return applyAddressFixes(fixes);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({ error: message });
    }
  });

  // ============================================================
  // Normalize endpoints (junk address removal)
  // ============================================================

  // GET /api/cleanup/addresses/normalize/summary
  fastify.get('/normalize/summary', {
    schema: {
      response: {
        200: NormalizeSummaryResponseSchema
      }
    }
  }, async (_request, _reply) => {
    return getNormalizeSummary();
  });

  // GET /api/cleanup/addresses/normalize
  fastify.get<{ Querystring: AddressCleanupQuery }>('/normalize', {
    schema: {
      querystring: AddressCleanupQuerySchema,
      response: {
        200: NormalizeResponseSchema
      }
    }
  }, async (request, _reply) => {
    const { limit = 50, offset = 0 } = request.query;
    return findJunkAddresses(limit, offset);
  });

  // GET /api/cleanup/addresses/normalize/all - get all junk address IDs
  fastify.get('/normalize/all', {
    schema: {
      response: {
        200: NormalizeAllIdsResponseSchema
      }
    }
  }, async (_request, _reply) => {
    const addressIds = getAllJunkAddressIds();
    return { addressIds, total: addressIds.length };
  });

  // POST /api/cleanup/addresses/normalize/fix
  fastify.post<{ Body: NormalizeFixRequest }>('/normalize/fix', {
    schema: {
      body: NormalizeFixRequestSchema,
      response: {
        200: NormalizeFixResponseSchema,
        500: AddressCleanupErrorSchema
      }
    }
  }, async (request, reply) => {
    try {
      const { addressIds } = request.body;
      return removeJunkAddresses(addressIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({ error: message });
    }
  });

  // ============================================================
  // Duplicates endpoints (within-contact duplicate merging)
  // ============================================================

  // GET /api/cleanup/addresses/duplicates/summary
  fastify.get('/duplicates/summary', {
    schema: {
      response: {
        200: DuplicatesSummaryResponseSchema
      }
    }
  }, async (_request, _reply) => {
    return getDuplicatesSummary();
  });

  // GET /api/cleanup/addresses/duplicates
  fastify.get<{ Querystring: AddressCleanupQuery }>('/duplicates', {
    schema: {
      querystring: AddressCleanupQuerySchema,
      response: {
        200: DuplicatesResponseSchema
      }
    }
  }, async (request, _reply) => {
    const { limit = 50, offset = 0 } = request.query;
    return findDuplicateAddresses(limit, offset);
  });

  // GET /api/cleanup/addresses/duplicates/all - get all contacts for bulk fix
  fastify.get('/duplicates/all', {
    schema: {
      response: {
        200: AddressCleanupBulkResponseSchema
      }
    }
  }, async (_request, _reply) => {
    return getAllDuplicateContacts();
  });

  // POST /api/cleanup/addresses/duplicates/fix - same as /fix
  fastify.post<{ Body: AddressFixRequest }>('/duplicates/fix', {
    schema: {
      body: AddressFixRequestSchema,
      response: {
        200: AddressFixResponseSchema,
        500: AddressCleanupErrorSchema
      }
    }
  }, async (request, reply) => {
    try {
      const { fixes } = request.body;
      return applyAddressFixes(fixes);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({ error: message });
    }
  });

  // ============================================================
  // Geocoding endpoints
  // ============================================================

  // GET /api/cleanup/addresses/geocoding/summary
  fastify.get('/geocoding/summary', {
    schema: {
      response: {
        200: GeocodingSummaryResponseSchema
      }
    }
  }, async (_request, _reply) => {
    return getGeocodingSummary();
  });

  // GET /api/cleanup/addresses/geocoding
  fastify.get<{ Querystring: GeocodingQuery }>('/geocoding', {
    schema: {
      querystring: GeocodingQuerySchema,
      response: {
        200: GeocodingResponseSchema
      }
    }
  }, async (request, _reply) => {
    const { filter = 'all', limit = 50, offset = 0 } = request.query;
    return findAddressesByGeoStatus(filter as GeocodingStatus | 'all', limit, offset);
  });

  // POST /api/cleanup/addresses/geocoding/retry
  fastify.post<{ Body: GeocodingRetryRequest }>('/geocoding/retry', {
    schema: {
      body: GeocodingRetryRequestSchema,
      response: {
        200: GeocodingBatchResponseSchema,
        500: AddressCleanupErrorSchema
      }
    }
  }, async (request, reply) => {
    if (!isGeocodingAvailable()) {
      return reply.status(500).send({ error: 'Geocoding service not configured. Set HERE_API_KEY environment variable.' });
    }

    try {
      const { addressIds } = request.body;
      return await retryGeocoding(addressIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({ error: message });
    }
  });

  // POST /api/cleanup/addresses/geocoding/batch
  fastify.post<{ Body: GeocodingBatchRequest }>('/geocoding/batch', {
    schema: {
      body: GeocodingBatchRequestSchema,
      response: {
        200: GeocodingBatchResponseSchema,
        500: AddressCleanupErrorSchema
      }
    }
  }, async (request, reply) => {
    if (!isGeocodingAvailable()) {
      return reply.status(500).send({ error: 'Geocoding service not configured. Set HERE_API_KEY environment variable.' });
    }

    try {
      const { limit = 50 } = request.body;
      return await batchGeocode(limit);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({ error: message });
    }
  });

  // PUT /api/cleanup/addresses/geocoding/update
  fastify.put<{ Body: GeocodingUpdateRequest }>('/geocoding/update', {
    schema: {
      body: GeocodingUpdateRequestSchema,
      response: {
        200: GeocodingUpdateResponseSchema,
        404: AddressCleanupErrorSchema,
        500: AddressCleanupErrorSchema
      }
    }
  }, async (request, reply) => {
    if (!isGeocodingAvailable()) {
      return reply.status(500).send({ error: 'Geocoding service not configured. Set HERE_API_KEY environment variable.' });
    }

    try {
      const { addressId, ...updates } = request.body;
      const result = await updateAddressAndGeocode(addressId, updates);

      if (!result) {
        return reply.status(404).send({ error: 'Address not found' });
      }

      return { address: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({ error: message });
    }
  });
}
