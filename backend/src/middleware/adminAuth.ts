import { FastifyRequest, FastifyReply } from 'fastify';

const ADMIN_EMAIL = 's@mombartz.com';

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user || request.user.email !== ADMIN_EMAIL) {
    return reply.status(403).send({ error: 'Forbidden - admin access required' });
  }
}
