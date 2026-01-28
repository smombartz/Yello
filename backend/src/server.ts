import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import healthRoutes from './routes/health.js';
import contactRoutes from './routes/contacts.js';
import importRoutes from './routes/import.js';
import duplicatesRoutes from './routes/duplicates.js';
import cleanupRoutes from './routes/cleanup.js';
import archiveRoutes from './routes/archive.js';
import settingsRoutes from './routes/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

// Register CORS
await app.register(fastifyCors, {
  origin: process.env.NODE_ENV === 'production' ? false : true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']
});

// Register multipart for file uploads (100MB limit for VCF files)
await app.register(fastifyMultipart, {
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Serve photos from the photos directory
const photosPath = process.env.PHOTOS_PATH || path.join(__dirname, '../data/photos');
if (!fs.existsSync(photosPath)) {
  fs.mkdirSync(photosPath, { recursive: true });
}
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
await app.register(contactRoutes, { prefix: '/api/contacts' });
await app.register(importRoutes, { prefix: '/api' });
await app.register(duplicatesRoutes, { prefix: '/api/duplicates' });
await app.register(cleanupRoutes, { prefix: '/api/cleanup' });
await app.register(archiveRoutes, { prefix: '/api/archive' });
await app.register(settingsRoutes, { prefix: '/api/settings' });

const port = parseInt(process.env.PORT || '3000');
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`Server running on port ${port}`);
});

export default app;
