import 'dotenv/config';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import path from 'path';
import fs, { createReadStream } from 'fs';
import { fileURLToPath } from 'url';

import { requireAuth } from './middleware/auth.js';
import healthRoutes from './routes/health.js';
import contactRoutes from './routes/contacts.js';
import importRoutes from './routes/import.js';
import duplicatesRoutes from './routes/duplicates.js';
import cleanupRoutes from './routes/cleanup.js';
import archiveRoutes from './routes/archive.js';
import settingsRoutes from './routes/settings.js';
import mapRoutes from './routes/map.js';
import authRoutes from './routes/auth.js';
import profileImagesRoutes from './routes/profileImages.js';
import profileRoutes from './routes/profile.js';
import socialLinksCleanupRoutes from './routes/socialLinksCleanup.js';
import invalidLinksCleanupRoutes from './routes/invalidLinksCleanup.js';
import addressCleanupRoutes from './routes/addressCleanup.js';
import statsRoutes from './routes/stats.js';
import enrichRoutes from './routes/enrich.js';
import emailSyncRoutes from './routes/emailSync.js';
import gmailEnrichRoutes from './routes/gmailEnrich.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET environment variable is required in production');
  process.exit(1);
}

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

// Global auth: protect all /api/* and /photos/* routes except auth endpoints
app.addHook('onRequest', async (request, reply) => {
  if (
    request.url === '/health' ||
    request.url.startsWith('/api/auth/') ||
    request.url.startsWith('/api/profile/public/')
  ) {
    return;
  }

  if (
    request.url.startsWith('/api/') ||
    request.url.startsWith('/photos/')
  ) {
    return requireAuth(request, reply);
  }
});

// Register multipart for file uploads (100MB limit for VCF files)
await app.register(fastifyMultipart, {
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Setup photos path
const photosPathEnv = process.env.PHOTOS_PATH || './data/photos';
const photosPath = path.isAbsolute(photosPathEnv) ? photosPathEnv : path.resolve(__dirname, '..', photosPathEnv);
if (!fs.existsSync(photosPath)) {
  fs.mkdirSync(photosPath, { recursive: true });
}

// Serve static files
if (process.env.NODE_ENV === 'production') {
  // In Docker, frontend is copied to /app/frontend/dist (see Dockerfile)
  const frontendPath = path.join(__dirname, '../frontend/dist');

  // Log for debugging
  console.log('Frontend path:', frontendPath);
  console.log('Frontend exists:', fs.existsSync(frontendPath));

  // Register frontend FIRST with decorateReply enabled (needed for sendFile)
  await app.register(fastifyStatic, {
    root: frontendPath,
    prefix: '/',
  });

  // SPA fallback - serve index.html for non-API routes
  app.setNotFoundHandler((request, reply) => {
    if (!request.url.startsWith('/api') && !request.url.startsWith('/photos') && !request.url.startsWith('/health')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not Found' });
  });
}

// Authenticated photo serving
app.get('/photos/*', async (request, reply) => {
  const url = request.url.replace(/\?.*$/, '');
  const relativePath = url.replace('/photos/', '');
  const filePath = path.join(photosPath, relativePath);

  // Prevent path traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(photosPath))) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  if (!fs.existsSync(resolved)) {
    return reply.status(404).send({ error: 'Not found' });
  }

  const ext = path.extname(resolved).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };

  reply.type(mimeTypes[ext] || 'application/octet-stream');
  reply.header('Cache-Control', 'private, max-age=86400');
  return reply.send(createReadStream(resolved));
});

// Register API routes
await app.register(healthRoutes);
await app.register(contactRoutes, { prefix: '/api/contacts' });
await app.register(importRoutes, { prefix: '/api' });
await app.register(duplicatesRoutes, { prefix: '/api/duplicates' });
await app.register(cleanupRoutes, { prefix: '/api/cleanup' });
await app.register(socialLinksCleanupRoutes, { prefix: '/api/cleanup/social-links' });
await app.register(invalidLinksCleanupRoutes, { prefix: '/api/cleanup/invalid-links' });
await app.register(addressCleanupRoutes, { prefix: '/api/cleanup/addresses' });
await app.register(archiveRoutes, { prefix: '/api/archive' });
await app.register(settingsRoutes, { prefix: '/api/settings' });
await app.register(mapRoutes, { prefix: '/api/map' });
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(profileImagesRoutes, { prefix: '/api/profile-images' });
await app.register(profileRoutes, { prefix: '/api/profile' });
await app.register(statsRoutes, { prefix: '/api/stats' });
await app.register(enrichRoutes, { prefix: '/api/enrich' });
await app.register(emailSyncRoutes, { prefix: '/api/contacts' });
await app.register(gmailEnrichRoutes, { prefix: '/api/enrich/gmail' });

const port = parseInt(process.env.PORT || '3000');
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`Server running on port ${port}`);
});

export default app;
