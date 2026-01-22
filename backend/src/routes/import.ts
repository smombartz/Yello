import { FastifyPluginAsync } from 'fastify';
import { importVcf } from '../services/importService.js';

const importRoutes: FastifyPluginAsync = async (app) => {
  app.post('/import', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const buffer = await data.toBuffer();
    const vcfContent = buffer.toString('utf-8');
    const result = await importVcf(vcfContent);
    return result;
  });
};

export default importRoutes;
