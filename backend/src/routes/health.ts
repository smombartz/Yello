import { FastifyPluginAsync } from 'fastify';
import { getAuthDatabase } from '../services/authDatabase.js';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    // Verify auth DB is accessible without leaking data
    getAuthDatabase().prepare('SELECT 1').get();
    return { status: 'ok' };
  });
};

export default healthRoutes;
