import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getUserDatabase } from '../services/userDatabase.js';
import {
  archiveContacts,
  unarchiveContacts,
  getArchivedContacts,
  getArchivedCount,
  deleteArchivedContacts,
  exportArchivedContactsVcf
} from '../services/archiveService.js';
import {
  ArchiveContactsBodySchema,
  ArchiveContactsBody,
  UnarchiveContactsBodySchema,
  UnarchiveContactsBody,
  DeleteArchivedBodySchema,
  DeleteArchivedBody,
  ArchivedListQuerySchema,
  ArchivedListQuery,
  ArchivedListResponseSchema,
  ArchivedCountResponseSchema,
  ArchiveResponseSchema,
  UnarchiveResponseSchema,
  DeleteArchivedResponseSchema,
  ArchiveErrorSchema
} from '../schemas/archive.js';

export default async function archiveRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // POST /api/archive - Archive contacts
  fastify.post<{ Body: ArchiveContactsBody }>('/', {
    schema: {
      body: ArchiveContactsBodySchema,
      response: {
        200: ArchiveResponseSchema,
        400: ArchiveErrorSchema
      }
    }
  }, async (request, reply) => {
    const db = getUserDatabase(request.user!.id);
    const { contactIds } = request.body;

    try {
      const result = archiveContacts(db, contactIds);
      return result;
    } catch (error) {
      fastify.log.error(error, 'Archive operation failed');
      return reply.status(500).send({ error: 'Archive operation failed. Please try again.' });
    }
  });

  // GET /api/archive - List archived contacts (paginated)
  fastify.get<{ Querystring: ArchivedListQuery }>('/', {
    schema: {
      querystring: ArchivedListQuerySchema,
      response: {
        200: ArchivedListResponseSchema
      }
    }
  }, async (request) => {
    const db = getUserDatabase(request.user!.id);
    const { limit = 50, offset = 0 } = request.query;
    const { contacts, total } = getArchivedContacts(db, limit, offset);

    return {
      contacts,
      total,
      limit,
      offset
    };
  });

  // GET /api/archive/count - Get archived count
  fastify.get('/count', {
    schema: {
      response: {
        200: ArchivedCountResponseSchema
      }
    }
  }, async (request) => {
    const db = getUserDatabase(request.user!.id);
    const count = getArchivedCount(db);
    return { count };
  });

  // POST /api/archive/unarchive - Restore contacts from archive
  fastify.post<{ Body: UnarchiveContactsBody }>('/unarchive', {
    schema: {
      body: UnarchiveContactsBodySchema,
      response: {
        200: UnarchiveResponseSchema,
        400: ArchiveErrorSchema
      }
    }
  }, async (request, reply) => {
    const db = getUserDatabase(request.user!.id);
    const { contactIds } = request.body;

    try {
      const result = unarchiveContacts(db, contactIds);
      return result;
    } catch (error) {
      fastify.log.error(error, 'Unarchive operation failed');
      return reply.status(500).send({ error: 'Archive operation failed. Please try again.' });
    }
  });

  // DELETE /api/archive/delete - Permanently delete archived contacts
  fastify.delete<{ Body: DeleteArchivedBody }>('/delete', {
    schema: {
      body: DeleteArchivedBodySchema,
      response: {
        200: DeleteArchivedResponseSchema,
        400: ArchiveErrorSchema
      }
    }
  }, async (request, reply) => {
    const db = getUserDatabase(request.user!.id);
    const { contactIds } = request.body;

    try {
      const result = deleteArchivedContacts(db, contactIds);
      return result;
    } catch (error) {
      fastify.log.error(error, 'Delete archived contacts failed');
      return reply.status(500).send({ error: 'Archive operation failed. Please try again.' });
    }
  });

  // GET /api/archive/export - Export archived contacts as VCF
  fastify.get('/export', async (request, reply) => {
    const db = getUserDatabase(request.user!.id);
    const vcfContent = exportArchivedContactsVcf(db);

    return reply
      .header('Content-Type', 'text/vcard; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="archived-contacts.vcf"')
      .send(vcfContent);
  });
}
