import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getUserDatabase } from '../services/userDatabase.js';
import { encryptToken, decryptToken } from '../services/tokenEncryption.js';
import { testICloudConnection, fetchICloudContacts } from '../services/icloudService.js';
import { matchIncomingContacts } from '../services/icloudMatchingService.js';
import type { ParsedContact } from '../services/vcardParser.js';
import { processPhoto } from '../services/photoProcessor.js';
import { insertParsedContact, mergeParsedIntoContact, prepareContactStatements } from '../services/contactPersistence.js';
import { getProviderRow } from '../services/sync/syncRuntime.js';

export default async function icloudRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {

  // GET /api/icloud/settings — check if iCloud credentials are stored
  fastify.get('/settings', async (request) => {
    const db = getUserDatabase(request.user!.id);
    const row = db.prepare('SELECT icloud_email, icloud_app_password FROM user_settings WHERE id = 1').get() as {
      icloud_email: string | null;
      icloud_app_password: string | null;
    } | undefined;
    return {
      connected: !!(row?.icloud_email && row?.icloud_app_password),
      email: row?.icloud_email || null,
    };
  });

  // POST /api/icloud/settings — save or update iCloud credentials
  fastify.post<{ Body: { email: string; appPassword: string } }>('/settings', async (request, reply) => {
    const { email, appPassword } = request.body;
    if (!email || !appPassword) {
      return reply.status(400).send({ error: 'Email and app-specific password are required' });
    }

    // Test connection before saving
    const test = await testICloudConnection(email, appPassword);
    if (!test.success) {
      return reply.status(400).send({ error: `Connection failed: ${test.error}` });
    }

    const db = getUserDatabase(request.user!.id);
    const encrypted = encryptToken(appPassword);
    db.prepare('UPDATE user_settings SET icloud_email = ?, icloud_app_password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1')
      .run(email, encrypted);

    return { success: true, addressBookCount: test.addressBookCount };
  });

  // DELETE /api/icloud/settings — remove iCloud credentials
  fastify.delete('/settings', async (request) => {
    const db = getUserDatabase(request.user!.id);
    db.prepare('UPDATE user_settings SET icloud_email = NULL, icloud_app_password = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run();
    return { success: true };
  });

  // POST /api/icloud/fetch — fetch all contacts from iCloud
  fastify.post('/fetch', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const db = getUserDatabase(request.user!.id);
    const row = db.prepare('SELECT icloud_email, icloud_app_password FROM user_settings WHERE id = 1').get() as {
      icloud_email: string | null;
      icloud_app_password: string | null;
    } | undefined;

    if (!row?.icloud_email || !row?.icloud_app_password) {
      return reply.status(400).send({ error: 'iCloud credentials not configured. Go to Settings to connect.' });
    }

    const password = decryptToken(row.icloud_app_password);
    if (!password) {
      return reply.status(500).send({ error: 'Failed to decrypt stored credentials. Please re-enter in Settings.' });
    }

    const TIMEOUT_MS = 120_000;
    const result = await Promise.race([
      fetchICloudContacts(row.icloud_email, password),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('iCloud fetch timed out after 120 seconds')), TIMEOUT_MS)
      ),
    ]);

    return result;
  });

  // POST /api/icloud/preview-import — match fetched contacts against existing DB
  fastify.post<{ Body: { contacts: ParsedContact[] } }>('/preview-import', { bodyLimit: 100 * 1024 * 1024 }, async (request, reply) => {
    const { contacts } = request.body;
    if (!contacts || !Array.isArray(contacts)) {
      return reply.status(400).send({ error: 'contacts array is required' });
    }

    const db = getUserDatabase(request.user!.id);
    const result = matchIncomingContacts(db, contacts);
    return result;
  });

  // POST /api/icloud/import — execute the import with user's merge/skip decisions
  fastify.post<{
    Body: {
      newContacts: ParsedContact[];
      merges: Array<{
        incomingContact: ParsedContact;
        existingContactId: number;
        conflictResolutions?: Record<string, 'incoming' | 'existing'>;
      }>;
      skipped: number;
    };
  }>('/import', { bodyLimit: 100 * 1024 * 1024 }, async (request, reply) => {
    const { newContacts, merges, skipped } = request.body;
    // Once iCloud is synced, its contacts arrive through sync; an import would add unlinked duplicates.
    if (getProviderRow(getUserDatabase(request.user!.id), 'icloud').cutover_completed_at) {
      return reply.status(409).send({ error: 'iCloud is synced with Yello now; its contacts come in through sync.' });
    }
    const userId = request.user!.id;
    const db = getUserDatabase(userId);

    let imported = 0;
    let merged = 0;
    const errors: Array<{ line: number; reason: string }> = [];
    const stmts = prepareContactStatements(db);

    // Async (sharp), so it runs between transactions, never inside one.
    const attachPhoto = async (contactId: number, photoBase64: string): Promise<void> => {
      try {
        const photoHash = await processPhoto(photoBase64, contactId, userId);
        stmts.setPhotoHash.run(photoHash, contactId);
        stmts.upsertContactPhoto.run(contactId, photoHash);
      } catch { /* skip photo on error */ }
    };

    // --- Import new contacts ---
    for (const contact of (newContacts || [])) {
      try {
        const inserted = db.transaction(() =>
          insertParsedContact(stmts, db, contact, { skipExistingUid: false })
        )();
        if (inserted && contact.photoBase64) await attachPhoto(inserted.contactId, contact.photoBase64);
        imported++;
      } catch (e) {
        errors.push({ line: imported + 1, reason: e instanceof Error ? e.message : 'Unknown error' });
      }
    }

    // --- Merge matched contacts ---
    for (const merge of (merges || [])) {
      try {
        const { incomingContact, existingContactId, conflictResolutions } = merge;
        const existingRow = db.prepare('SELECT photo_hash FROM contacts WHERE id = ?').get(existingContactId) as
          { photo_hash: string | null } | undefined;
        if (!existingRow) {
          errors.push({ line: merged + 1, reason: `Existing contact ${existingContactId} not found` });
          continue;
        }

        db.transaction(() =>
          mergeParsedIntoContact(stmts, db, existingContactId, incomingContact, conflictResolutions)
        )();

        // Photo: only if existing has none
        if (incomingContact.photoBase64 && !existingRow.photo_hash) {
          await attachPhoto(existingContactId, incomingContact.photoBase64);
        }
        merged++;
      } catch (e) {
        errors.push({ line: merged + 1, reason: e instanceof Error ? e.message : 'Unknown error' });
      }
    }

    return { imported, merged, skipped: skipped || 0, errors };
  });
}
