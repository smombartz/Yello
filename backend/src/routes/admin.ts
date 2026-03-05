import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { getAuthDatabase } from '../services/authDatabase.js';
import { requireAdmin } from '../middleware/adminAuth.js';

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
}
