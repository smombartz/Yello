import 'dotenv/config';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyCookie from '@fastify/cookie';
import path from 'path';
import fs, { createReadStream } from 'fs';
import { fileURLToPath } from 'url';

import { requireAuth } from './middleware/auth.js';
import { getUserPhotosPath } from './services/userDatabase.js';
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
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Diagnostic logging for data directory setup
const authDbPath = process.env.AUTH_DATABASE_PATH || './data/auth.db';
const userDataPath = process.env.USER_DATA_PATH || './data/users';
console.log('=== Data Directory Diagnostics ===');
console.log('AUTH_DATABASE_PATH:', authDbPath);
console.log('USER_DATA_PATH:', userDataPath);
console.log('Resolved auth dir:', path.resolve(path.dirname(authDbPath)));
console.log('CWD:', process.cwd());
console.log('UID:', process.getuid?.(), 'GID:', process.getgid?.());
try {
  const authDir = path.dirname(authDbPath);
  console.log('Auth dir exists:', fs.existsSync(authDir));
  console.log('Auth dir stat:', fs.existsSync(authDir) ? fs.statSync(authDir) : 'N/A');
  fs.accessSync(authDir, fs.constants.W_OK);
  console.log('Auth dir writable: YES');
} catch (e: any) {
  console.log('Auth dir writable: NO -', e.message);
}
console.log('=================================');

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

// Security headers
await app.register(fastifyHelmet, {
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://kit.fontawesome.com", "https://ka-f.fontawesome.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://ka-f.fontawesome.com"],
      imgSrc: ["'self'", "data:", "https://*.googleusercontent.com", "https://*.gravatar.com", "https://tile.openstreetmap.org"],
      connectSrc: ["'self'", "https://ka-f.fontawesome.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://ka-f.fontawesome.com"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
});

// Rate limiting
await app.register(fastifyRateLimit, {
  max: 100,
  timeWindow: '1 minute',
  allowList: (request) => request.url === '/health',
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

// Authenticated photo serving (per-user photo directories)
app.get('/photos/*', async (request, reply) => {
  // request.user is set by the global auth hook
  const userId = request.user?.id;
  if (!userId) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const userPhotosPath = getUserPhotosPath(userId);
  const url = request.url.replace(/\?.*$/, '');
  const relativePath = url.replace('/photos/', '');
  const filePath = path.join(userPhotosPath, relativePath);

  // Prevent path traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(userPhotosPath))) {
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
await app.register(adminRoutes, { prefix: '/api/admin' });

const port = parseInt(process.env.PORT || '3456');
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`Server running on port ${port}`);
});

export default app;
