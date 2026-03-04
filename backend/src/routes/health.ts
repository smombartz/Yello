import { FastifyPluginAsync } from 'fastify';
import { getDatabase } from '../services/database.js';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    // Verify DB is accessible without leaking data
    getDatabase().prepare('SELECT 1').get();
    return { status: 'ok' };
  });
};

export default healthRoutes;
