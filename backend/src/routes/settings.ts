import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getDatabase } from '../services/database.js';
import {
  UserSettingsSchema,
  UpdateUserSettingsSchema,
  UpdateUserSettings
} from '../schemas/settings.js';

interface SettingsRow {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  website: string | null;
  linkedin_url: string | null;
  created_at: string;
  updated_at: string;
}

export default async function settingsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // GET /api/settings - Get user settings
  fastify.get('/', {
    schema: {
      response: {
        200: UserSettingsSchema
      }
    }
  }, async (_request, _reply) => {
    const db = getDatabase();
    const settings = db.prepare(`
      SELECT name, email, phone, avatar_url, website, linkedin_url
      FROM user_settings
      WHERE id = 1
    `).get() as SettingsRow | undefined;

    return {
      name: settings?.name ?? null,
      email: settings?.email ?? null,
      phone: settings?.phone ?? null,
      avatarUrl: settings?.avatar_url ?? null,
      website: settings?.website ?? null,
      linkedinUrl: settings?.linkedin_url ?? null,
    };
  });

  // PUT /api/settings - Update user settings
  fastify.put<{ Body: UpdateUserSettings }>('/', {
    schema: {
      body: UpdateUserSettingsSchema,
      response: {
        200: UserSettingsSchema,
        404: { type: 'object', properties: { error: { type: 'string' } } },
        500: { type: 'object', properties: { error: { type: 'string' } } }
      }
    }
  }, async (request, reply) => {
    const updates = request.body;
    const db = getDatabase();

    // Check settings row exists
    const existingSettings = db.prepare('SELECT id FROM user_settings WHERE id = 1').get() as { id: number } | undefined;
    if (!existingSettings) {
      return reply.status(404).send({ error: 'Settings not initialized' });
    }

    const fields: string[] = [];
    const values: (string | null)[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email);
    }
    if (updates.phone !== undefined) {
      fields.push('phone = ?');
      values.push(updates.phone);
    }
    if (updates.avatarUrl !== undefined) {
      fields.push('avatar_url = ?');
      values.push(updates.avatarUrl);
    }
    if (updates.website !== undefined) {
      fields.push('website = ?');
      values.push(updates.website);
    }
    if (updates.linkedinUrl !== undefined) {
      fields.push('linkedin_url = ?');
      values.push(updates.linkedinUrl);
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      const sql = `UPDATE user_settings SET ${fields.join(', ')} WHERE id = 1`;
      db.prepare(sql).run(...values);
    }

    const settings = db.prepare(`
      SELECT name, email, phone, avatar_url, website, linkedin_url
      FROM user_settings
      WHERE id = 1
    `).get() as SettingsRow | undefined;

    if (!settings) {
      return reply.status(500).send({ error: 'Failed to retrieve settings after update' });
    }

    return {
      name: settings.name,
      email: settings.email,
      phone: settings.phone,
      avatarUrl: settings.avatar_url,
      website: settings.website,
      linkedinUrl: settings.linkedin_url,
    };
  });
}
