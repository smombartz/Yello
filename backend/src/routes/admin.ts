import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import type { Readable } from 'stream';
import { getAuthDatabase } from '../services/authDatabase.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { setSessionCookie } from './auth.js';
import { createBackupSnapshot, tarSnapshot } from '../services/backupService.js';
import {
  DatasetError,
  activeDataset,
  createEmptyDataset,
  datasetsEnabled,
  deleteDataset,
  importDataset,
  listDatasets,
  switchDataset,
} from '../services/datasets.js';

interface UserRow {
  id: number;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionRow {
  created_at: string;
}

interface AdminUserInfo {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  lastLogin: string | null;
  contactCount: number;
  dbSizeBytes: number;
  photoCount: number;
  photoSizeBytes: number;
}

function countFiles(dir: string): { count: number; sizeBytes: number } {
  let count = 0;
  let sizeBytes = 0;

  if (!fs.existsSync(dir)) return { count, sizeBytes };

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countFiles(fullPath);
      count += sub.count;
      sizeBytes += sub.sizeBytes;
    } else if (entry.isFile()) {
      count++;
      try {
        sizeBytes += fs.statSync(fullPath).size;
      } catch { /* skip unreadable files */ }
    }
  }

  return { count, sizeBytes };
}

export default async function adminRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  fastify.addHook('preHandler', requireAdmin);

  // GET /api/admin/users
  fastify.get('/users', async (_request, _reply) => {
    const authDb = getAuthDatabase();
    const userDataPath = process.env.USER_DATA_PATH || './data/users';

    const users = authDb.prepare('SELECT id, email, name, avatar_url, created_at, updated_at FROM users ORDER BY created_at DESC').all() as UserRow[];

    const adminUsers: AdminUserInfo[] = users.map(user => {
      // Last login from sessions table
      const lastSession = authDb.prepare(
        'SELECT created_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
      ).get(user.id) as SessionRow | undefined;

      // Contact count from user's contacts.db
      let contactCount = 0;
      const userDbPath = path.join(userDataPath, String(user.id), 'contacts.db');
      if (fs.existsSync(userDbPath)) {
        try {
          const userDb = new Database(userDbPath, { readonly: true });
          const result = userDb.prepare('SELECT COUNT(*) as count FROM contacts').get() as { count: number };
          contactCount = result.count;
          userDb.close();
        } catch { /* skip if DB is locked or corrupt */ }
      }

      // DB file size
      let dbSizeBytes = 0;
      try {
        if (fs.existsSync(userDbPath)) {
          dbSizeBytes = fs.statSync(userDbPath).size;
        }
      } catch { /* skip */ }

      // Photo stats
      const photosDir = path.join(userDataPath, String(user.id), 'photos');
      const { count: photoCount, sizeBytes: photoSizeBytes } = countFiles(photosDir);

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
        lastLogin: lastSession?.created_at ?? null,
        contactCount,
        dbSizeBytes,
        photoCount,
        photoSizeBytes,
      };
    });

    return { users: adminUsers, totalUsers: adminUsers.length };
  });

  // GET /api/admin/backup: the whole server's data as a .tar.gz (see backupService)
  fastify.get('/backup', async (request, reply) => {
    const dir = await createBackupSnapshot();
    const tar = tarSnapshot(dir);
    const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
    tar.on('close', cleanup);
    tar.on('error', cleanup);
    tar.stderr.on('data', chunk => request.log.warn(`backup tar: ${String(chunk).trim()}`));

    const date = new Date().toISOString().slice(0, 10);
    return reply
      .type('application/gzip')
      .header('content-disposition', `attachment; filename="yello-backup-${date}.tar.gz"`)
      .header('cache-control', 'no-store')
      .send(tar.stdout);
  });

  // /api/admin/datasets: local data sets (services/datasets.ts). Never on Railway.
  await fastify.register(async (datasets) => {
    // Backup archives arrive as the raw request body
    datasets.addContentTypeParser(['application/gzip', 'application/x-gzip', 'application/octet-stream'], (_request, payload, done) => {
      done(null, payload);
    });

    datasets.setErrorHandler((error, _request, reply) => {
      if (error instanceof DatasetError) return reply.status(error.statusCode).send({ error: error.message });
      reply.log.error(error);
      return reply.status(500).send({ error: (error instanceof Error && error.message) || 'Data set operation failed' });
    });

    datasets.get('/', async () => {
      if (!datasetsEnabled()) return { enabled: false, active: null, datasets: [] };
      return { enabled: true, active: activeDataset(), datasets: listDatasets() };
    });

    datasets.addHook('preHandler', async (request, reply) => {
      if (request.method !== 'GET' && !datasetsEnabled()) {
        return reply.status(404).send({ error: 'Data sets are only available on a local server' });
      }
    });

    datasets.post<{ Body: { name?: string } }>('/', async (request) => {
      createEmptyDataset(request.body?.name);
      return { datasets: listDatasets() };
    });

    datasets.post<{ Body: { name?: string } }>('/switch', async (request, reply) => {
      const user = request.user!;
      const { sessionId } = switchDataset(request.body?.name, {
        googleId: user.googleId,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      });
      setSessionCookie(reply, sessionId);
      return { active: activeDataset() };
    });

    datasets.post<{ Querystring: { name?: string } }>('/import', async (request) => {
      await importDataset(request.query.name, request.body as Readable);
      return { datasets: listDatasets() };
    });

    datasets.delete<{ Params: { name: string } }>('/:name', async (request) => {
      deleteDataset(request.params.name);
      return { datasets: listDatasets() };
    });
  }, { prefix: '/datasets' });
}
