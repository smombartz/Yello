import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import path from 'path';
import { fileURLToPath } from 'url';

import healthRoutes from './routes/health.js';
import contactRoutes from './routes/contacts.js';
import importRoutes from './routes/import.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

// Register CORS
await app.register(fastifyCors, {
  origin: process.env.NODE_ENV === 'production' ? false : true
});

// Register multipart for file uploads (100MB limit for VCF files)
await app.register(fastifyMultipart, {
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Serve photos from the photos directory
const photosPath = process.env.PHOTOS_PATH || path.join(__dirname, '../../data/photos');
await app.register(fastifyStatic, {
  root: photosPath,
  prefix: '/photos/',
  decorateReply: false
});

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  await app.register(fastifyStatic, {
    root: frontendPath,
    prefix: '/',
    decorateReply: false
  });

  // SPA fallback - serve index.html for non-API routes
  app.setNotFoundHandler((request, reply) => {
    if (!request.url.startsWith('/api') && !request.url.startsWith('/photos') && !request.url.startsWith('/health')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not Found' });
  });
}

// Register API routes
await app.register(healthRoutes);
await app.register(contactRoutes, { prefix: '/api' });
await app.register(importRoutes, { prefix: '/api' });

const port = parseInt(process.env.PORT || '3000');
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`Server running on port ${port}`);
});

export default app;
