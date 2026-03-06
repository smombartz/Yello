import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import {
  getProfileImages,
  setPrimaryImage,
  getProfileImageUrl,
  processUploadedImage,
  upsertProfileImage,
} from '../services/profileImageService.js';
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
    const userId = request.user!.id;

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
    const userId = request.user!.id;

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

  // POST /upload
  fastify.post('/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(data.mimetype)) {
      return reply.status(400).send({ error: 'Invalid file type. Use JPEG, PNG, or WebP.' });
    }

    const buffer = await data.toBuffer();

    if (buffer.length > 10 * 1024 * 1024) {
      return reply.status(400).send({ error: 'File too large. Maximum 10MB.' });
    }

    const identifier = `user-uploaded-${userId}-${Date.now()}`;
    const hash = await processUploadedImage(buffer, identifier);

    if (!hash) {
      return reply.status(500).send({ error: 'Failed to process image' });
    }

    upsertProfileImage(userId, 'user_uploaded', null, hash);

    const images = getProfileImages(userId);
    const uploaded = images.find(img => img.source === 'user_uploaded');
    if (uploaded) {
      setPrimaryImage(userId, uploaded.id);
    }

    return {
      success: true,
      url: getProfileImageUrl(hash),
      hash,
    };
  });
}
