import { FastifyPluginAsync } from 'fastify';
import { getDatabase } from '../services/database.js';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    const db = getDatabase();
    const result = db.prepare('SELECT COUNT(*) as total FROM contacts').get() as { total: number };
    return { status: 'ok', contacts: result.total };
  });
};

export default healthRoutes;
