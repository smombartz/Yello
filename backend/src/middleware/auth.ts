import { FastifyRequest, FastifyReply } from 'fastify';
import { getAuthDatabase } from '../services/authDatabase.js';

// Database row types
interface SessionRow {
  id: string;
  user_id: number;
  expires_at: string;
}

interface UserRow {
  id: number;
  google_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: number;
      googleId: string;
      email: string;
      name: string | null;
      avatarUrl: string | null;
      createdAt: string;
      updatedAt: string;
    };
  }
}

/**
 * Authentication middleware - requires valid session
 * Returns 401 if no valid session found
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sessionId = request.cookies.session_id;

  if (!sessionId) {
    return reply.status(401).send({ error: 'Unauthorized - no session' });
  }

  const db = getAuthDatabase();

  // Get session and check if it's valid
  const session = db.prepare(`
    SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')
  `).get(sessionId) as SessionRow | undefined;

  if (!session) {
    reply.clearCookie('session_id', { path: '/' });
    return reply.status(401).send({ error: 'Unauthorized - session expired' });
  }

  // Get user
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as UserRow | undefined;

  if (!user) {
    reply.clearCookie('session_id', { path: '/' });
    return reply.status(401).send({ error: 'Unauthorized - user not found' });
  }

  // Attach user to request
  request.user = {
    id: user.id,
    googleId: user.google_id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar_url,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

/**
 * Optional authentication - sets request.user if valid session exists
 * Does not return 401, allows request to continue either way
 */
export async function optionalAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const sessionId = request.cookies.session_id;

  if (!sessionId) {
    return;
  }

  const db = getAuthDatabase();

  // Get session and check if it's valid
  const session = db.prepare(`
    SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')
  `).get(sessionId) as SessionRow | undefined;

  if (!session) {
    return;
  }

  // Get user
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as UserRow | undefined;

  if (!user) {
    return;
  }

  // Attach user to request
  request.user = {
    id: user.id,
    googleId: user.google_id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar_url,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}
