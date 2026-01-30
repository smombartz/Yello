import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import {
  getProfileImages,
  setPrimaryImage,
  getProfileImageUrl,
} from '../services/profileImageService.js';
import { getDatabase } from '../services/database.js';

// Get user from session helper
function getUserIdFromSession(request: FastifyRequest): number | null {
  const sessionId = request.cookies.session_id;
  if (!sessionId) return null;

  const db = getDatabase();

  const session = db.prepare(`
    SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')
  `).get(sessionId) as { user_id: number } | undefined;

  return session?.user_id || null;
}

export default async function profileImagesRoutes(fastify: FastifyInstance) {
  // Get all profile images for current user
  fastify.get('/', {
    schema: {
      response: {
        200: Type.Array(Type.Object({
          id: Type.Number(),
          source: Type.String(),
          url: Type.Union([Type.String(), Type.Null()]),
          isPrimary: Type.Boolean(),
        })),
        401: Type.Object({ error: Type.String() }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const images = getProfileImages(userId);
    return images.map(img => ({
      id: img.id,
      source: img.source,
      url: getProfileImageUrl(img.localHash),
      isPrimary: img.isPrimary,
    }));
  });

  // Set primary image
  fastify.post('/:imageId/primary', {
    schema: {
      params: Type.Object({
        imageId: Type.String(),
      }),
      response: {
        200: Type.Object({ success: Type.Boolean() }),
        401: Type.Object({ error: Type.String() }),
        404: Type.Object({ error: Type.String() }),
      },
    },
  }, async (request: FastifyRequest<{ Params: { imageId: string } }>, reply: FastifyReply) => {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const imageId = parseInt(request.params.imageId, 10);
    if (isNaN(imageId)) {
      return reply.status(404).send({ error: 'Invalid image ID' });
    }

    // Verify the image belongs to this user
    const images = getProfileImages(userId);
    const image = images.find(img => img.id === imageId);
    if (!image) {
      return reply.status(404).send({ error: 'Image not found' });
    }

    setPrimaryImage(userId, imageId);
    return { success: true };
  });
}
