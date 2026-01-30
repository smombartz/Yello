import 'dotenv/config';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
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
import mapRoutes from './routes/map.js';
import authRoutes from './routes/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

// Register CORS
await app.register(fastifyCors, {
  origin: process.env.NODE_ENV === 'production' ? false : true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  credentials: true, // Allow cookies in cross-origin requests
});

// Register cookie plugin (required for @fastify/oauth2 and session management)
await app.register(fastifyCookie, {
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
});

// Register multipart for file uploads (100MB limit for VCF files)
await app.register(fastifyMultipart, {
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Serve photos from the photos directory
const photosPathEnv = process.env.PHOTOS_PATH || './data/photos';
const photosPath = path.isAbsolute(photosPathEnv) ? photosPathEnv : path.resolve(__dirname, '..', photosPathEnv);
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
  // In Docker, frontend is copied to /app/public (see Dockerfile)
  const frontendPath = path.join(__dirname, '../public');
  await app.register(fastifyStatic, {
    root: frontendPath,
    prefix: '/',
    decorateReply: true  // Enable sendFile for SPA fallback
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
await app.register(mapRoutes, { prefix: '/api/map' });
await app.register(authRoutes, { prefix: '/api/auth' });

const port = parseInt(process.env.PORT || '3000');
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`Server running on port ${port}`);
});

export default app;
