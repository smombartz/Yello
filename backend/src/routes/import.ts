import { FastifyPluginAsync } from 'fastify';
import { importVcf } from '../services/importService.js';


const ALLOWED_EXTENSIONS = ['.vcf', '.vcard'];
const ALLOWED_MIME_TYPES = ['text/vcard', 'text/x-vcard', 'text/directory'];
const MAX_PARSE_TIME_MS = 30000; // 30 second timeout for parsing

const importRoutes: FastifyPluginAsync = async (app) => {
  app.post('/import', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    // Validate file extension
    const filename = data.filename?.toLowerCase() || '';
    const hasValidExtension = ALLOWED_EXTENSIONS.some(ext => filename.endsWith(ext));
    if (!hasValidExtension) {
      return reply.code(400).send({
        error: 'Invalid file type. Only .vcf and .vcard files are allowed.'
      });
    }

    // Validate MIME type (if provided)
    const mimeType = data.mimetype?.toLowerCase();
    if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType) && mimeType !== 'application/octet-stream') {
      return reply.code(400).send({
        error: 'Invalid file type. Only vCard files are allowed.'
      });
    }

    const buffer = await data.toBuffer();
    const vcfContent = buffer.toString('utf-8');

    // Basic content validation - must contain vCard markers
    if (!vcfContent.includes('BEGIN:VCARD') || !vcfContent.includes('END:VCARD')) {
      return reply.code(400).send({
        error: 'Invalid vCard file. File does not contain valid vCard data.'
      });
    }

    // Import with timeout protection
    try {
      const result = await Promise.race([
        importVcf(vcfContent),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Import timeout')), MAX_PARSE_TIME_MS)
        )
      ]);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === 'Import timeout') {
        return reply.code(408).send({
          error: 'Import timed out. The file may be too large or contain malformed data.'
        });
      }
      throw error;
    }
  });
};

export default importRoutes;
