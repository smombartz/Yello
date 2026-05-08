import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getUserDatabase } from '../services/userDatabase.js';
import { fetchGoogleContacts, downloadGooglePhoto, type GoogleParsedContact } from '../services/googlePeopleService.js';
import { matchIncomingContacts } from '../services/icloudMatchingService.js';
import type { ParsedContact } from '../services/vcardParser.js';
import { processPhoto } from '../services/photoProcessor.js';
import { rebuildContactSearch } from '../services/database.js';
import { getValidAccessToken } from '../services/googleAuthService.js';

export default async function googleContactsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {

  // POST /api/google-contacts/fetch — fetch all contacts from Google
  fastify.post('/fetch', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const userId = request.user!.id;

    // Get a valid access token
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      return reply.status(401).send({ error: 'GOOGLE_TOKEN_EXPIRED' });
    }

    let googleContacts: GoogleParsedContact[];
    try {
      googleContacts = await fetchGoogleContacts(accessToken);
    } catch (err) {
      if (err === 'GOOGLE_TOKEN_EXPIRED') {
        return reply.status(401).send({ error: 'GOOGLE_TOKEN_EXPIRED' });
      }
      if (err === 'GOOGLE_CONTACTS_SCOPE_REQUIRED') {
        return reply.status(403).send({ error: 'GOOGLE_CONTACTS_SCOPE_REQUIRED' });
      }
      throw err;
    }

    // Download photos in batches of 10
    const contactsWithPhotos = [...googleContacts];
    const needsPhoto = contactsWithPhotos.filter(c => c.photoUrl);
    for (let i = 0; i < needsPhoto.length; i += 10) {
      const batch = needsPhoto.slice(i, i + 10);
      const results = await Promise.all(
        batch.map(c => downloadGooglePhoto(c.photoUrl!, accessToken))
      );
      for (let j = 0; j < batch.length; j++) {
        batch[j].photoBase64 = results[j];
      }
    }

    // Map to ParsedContact[] (drop photoUrl and googleResourceName from response,
    // but keep googleResourceName attached for the import endpoint)
    const contacts: (ParsedContact & { googleResourceName: string })[] = contactsWithPhotos.map(c => ({
      firstName: c.firstName,
      lastName: c.lastName,
      displayName: c.displayName,
      company: c.company,
      title: c.title,
      notes: c.notes,
      birthday: c.birthday,
      emails: c.emails,
      phones: c.phones,
      addresses: c.addresses,
      categories: c.categories,
      instantMessages: c.instantMessages,
      urls: c.urls,
      relatedPeople: c.relatedPeople,
      socialProfiles: c.socialProfiles,
      photoBase64: c.photoBase64,
      rawVcard: c.rawVcard,
      googleResourceName: c.googleResourceName,
    }));

    return { contacts, total: contacts.length, errors: [] };
  });

  // POST /api/google-contacts/preview-import — match fetched contacts against existing DB
  fastify.post<{ Body: { contacts: ParsedContact[] } }>('/preview-import', { bodyLimit: 100 * 1024 * 1024 }, async (request, reply) => {
    const { contacts } = request.body;
    if (!contacts || !Array.isArray(contacts)) {
      return reply.status(400).send({ error: 'contacts array is required' });
    }

    const db = getUserDatabase(request.user!.id);
    const result = matchIncomingContacts(db, contacts);
    return result;
  });

  // POST /api/google-contacts/import — execute the import with user's merge/skip decisions
  fastify.post<{
    Body: {
      newContacts: (ParsedContact & { googleResourceName?: string })[];
      merges: Array<{
        incomingContact: ParsedContact & { googleResourceName?: string };
        existingContactId: number;
        conflictResolutions?: Record<string, 'incoming' | 'existing'>;
      }>;
      skipped: number;
    };
  }>('/import', { bodyLimit: 100 * 1024 * 1024 }, async (request, reply) => {
    const { newContacts, merges, skipped } = request.body;
    const userId = request.user!.id;
    const db = getUserDatabase(userId);

    let imported = 0;
    let merged = 0;
    const errors: Array<{ line: number; reason: string }> = [];

    const insertContact = db.prepare(`
      INSERT INTO contacts (first_name, last_name, display_name, company, title, notes, birthday, photo_hash, raw_vcard, google_resource_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertEmail = db.prepare('INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, ?)');
    const insertPhone = db.prepare('INSERT INTO contact_phones (contact_id, phone, phone_display, country_code, type, is_primary) VALUES (?, ?, ?, ?, ?, ?)');
    const insertAddress = db.prepare('INSERT INTO contact_addresses (contact_id, street, city, state, postal_code, country, type) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertCategory = db.prepare('INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)');
    const insertInstantMessage = db.prepare('INSERT INTO contact_instant_messages (contact_id, service, handle, type) VALUES (?, ?, ?, ?)');
    const insertUrl = db.prepare('INSERT INTO contact_urls (contact_id, url, label, type) VALUES (?, ?, ?, ?)');
    const insertRelatedPerson = db.prepare('INSERT INTO contact_related_people (contact_id, name, relationship) VALUES (?, ?, ?)');
    const insertSocialProfile = db.prepare('INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url, type) VALUES (?, ?, ?, ?, ?)');

    // --- Import new contacts ---
    for (const contact of (newContacts || [])) {
      try {
        const result = insertContact.run(
          contact.firstName, contact.lastName, contact.displayName,
          contact.company, contact.title, contact.notes, contact.birthday, null, contact.rawVcard,
          (contact as any).googleResourceName || null
        );
        const contactId = result.lastInsertRowid as number;

        if (contact.photoBase64) {
          try {
            const photoHash = await processPhoto(contact.photoBase64, contactId, userId);
            db.prepare('UPDATE contacts SET photo_hash = ? WHERE id = ?').run(photoHash, contactId);
            db.prepare(`
              INSERT INTO contact_photos (contact_id, source, local_hash, is_primary)
              VALUES (?, 'google', ?, 1)
              ON CONFLICT(contact_id, source) DO UPDATE SET local_hash = excluded.local_hash, fetched_at = CURRENT_TIMESTAMP
            `).run(contactId, photoHash);
          } catch { /* skip photo on error */ }
        }

        for (const e of contact.emails) insertEmail.run(contactId, e.email, e.type, e.isPrimary ? 1 : 0);
        for (const p of contact.phones) insertPhone.run(contactId, p.phone, p.phoneDisplay, p.countryCode, p.type, p.isPrimary ? 1 : 0);
        for (const a of contact.addresses) insertAddress.run(contactId, a.street, a.city, a.state, a.postalCode, a.country, a.type);
        for (const c of contact.categories) insertCategory.run(contactId, c);
        for (const im of contact.instantMessages) insertInstantMessage.run(contactId, im.service, im.handle, im.type);
        for (const u of contact.urls) insertUrl.run(contactId, u.url, u.label, u.type);
        for (const rp of contact.relatedPeople) insertRelatedPerson.run(contactId, rp.name, rp.relationship);
        for (const sp of contact.socialProfiles) {
          let username = sp.username;
          if (!username && sp.url) {
            const m = sp.url.match(/\/([^\/]+)\/?$/);
            username = m ? m[1] : sp.platform;
          }
          username = username || sp.platform;
          insertSocialProfile.run(contactId, sp.platform, username, sp.url, null);
        }

        rebuildContactSearch(db, contactId);
        imported++;
      } catch (e) {
        errors.push({ line: imported + 1, reason: e instanceof Error ? e.message : 'Unknown error' });
      }
    }

    // --- Merge matched contacts ---
    for (const merge of (merges || [])) {
      try {
        const { incomingContact, existingContactId, conflictResolutions } = merge;
        const existingRow = db.prepare('SELECT * FROM contacts WHERE id = ?').get(existingContactId) as Record<string, unknown> | undefined;
        if (!existingRow) {
          errors.push({ line: merged + 1, reason: `Existing contact ${existingContactId} not found` });
          continue;
        }

        // Store google_resource_name on existing contact if it doesn't have one
        const googleResourceName = (incomingContact as any).googleResourceName;
        if (googleResourceName && !existingRow.google_resource_name) {
          db.prepare('UPDATE contacts SET google_resource_name = ? WHERE id = ?').run(googleResourceName, existingContactId);
        }

        // Apply scalar field resolutions
        const scalarFields = ['first_name', 'last_name', 'company', 'title', 'birthday'] as const;
        const incomingFieldMap: Record<string, string | null> = {
          first_name: incomingContact.firstName,
          last_name: incomingContact.lastName,
          company: incomingContact.company,
          title: incomingContact.title,
          birthday: incomingContact.birthday,
        };

        for (const field of scalarFields) {
          const incomingVal = incomingFieldMap[field];
          const existingVal = existingRow[field] as string | null;

          if (incomingVal && !existingVal) {
            db.prepare(`UPDATE contacts SET ${field} = ? WHERE id = ?`).run(incomingVal, existingContactId);
          } else if (incomingVal && existingVal && incomingVal !== existingVal) {
            const resolution = conflictResolutions?.[field];
            if (resolution === 'incoming') {
              db.prepare(`UPDATE contacts SET ${field} = ? WHERE id = ?`).run(incomingVal, existingContactId);
            }
          }
        }

        // Union multi-value fields (skip duplicates)
        const existingEmails = new Set(
          (db.prepare('SELECT LOWER(email) as email FROM contact_emails WHERE contact_id = ?').all(existingContactId) as Array<{ email: string }>)
            .map(r => r.email)
        );
        for (const e of incomingContact.emails) {
          if (!existingEmails.has(e.email.toLowerCase())) {
            insertEmail.run(existingContactId, e.email, e.type, 0);
          }
        }

        const existingPhones = new Set(
          (db.prepare('SELECT phone FROM contact_phones WHERE contact_id = ?').all(existingContactId) as Array<{ phone: string }>)
            .map(r => r.phone)
        );
        for (const p of incomingContact.phones) {
          if (!existingPhones.has(p.phone)) {
            insertPhone.run(existingContactId, p.phone, p.phoneDisplay, p.countryCode, p.type, 0);
          }
        }

        const existingAddresses = new Set(
          (db.prepare('SELECT street, city, postal_code FROM contact_addresses WHERE contact_id = ?').all(existingContactId) as Array<{ street: string; city: string; postal_code: string }>)
            .map(r => `${(r.street || '').toLowerCase()}|${(r.city || '').toLowerCase()}|${(r.postal_code || '').toLowerCase()}`)
        );
        for (const a of incomingContact.addresses) {
          const key = `${(a.street || '').toLowerCase()}|${(a.city || '').toLowerCase()}|${(a.postalCode || '').toLowerCase()}`;
          if (!existingAddresses.has(key)) {
            insertAddress.run(existingContactId, a.street, a.city, a.state, a.postalCode, a.country, a.type);
          }
        }

        const existingSocials = new Set(
          (db.prepare(`SELECT LOWER(platform) || ':' || LOWER(username) as key FROM contact_social_profiles WHERE contact_id = ?`).all(existingContactId) as Array<{ key: string }>)
            .map(r => r.key)
        );
        for (const sp of incomingContact.socialProfiles) {
          let username = sp.username || sp.platform;
          const key = `${(sp.platform || '').toLowerCase()}:${(username || '').toLowerCase()}`;
          if (!existingSocials.has(key)) {
            insertSocialProfile.run(existingContactId, sp.platform, username, sp.url, null);
          }
        }

        const existingCategories = new Set(
          (db.prepare('SELECT LOWER(category) as cat FROM contact_categories WHERE contact_id = ?').all(existingContactId) as Array<{ cat: string }>)
            .map(r => r.cat)
        );
        for (const c of incomingContact.categories) {
          if (!existingCategories.has(c.toLowerCase())) {
            insertCategory.run(existingContactId, c);
          }
        }

        const existingUrls = new Set(
          (db.prepare('SELECT LOWER(url) as url FROM contact_urls WHERE contact_id = ?').all(existingContactId) as Array<{ url: string }>)
            .map(r => r.url)
        );
        for (const u of incomingContact.urls) {
          if (!existingUrls.has(u.url.toLowerCase())) {
            insertUrl.run(existingContactId, u.url, u.label, u.type);
          }
        }

        const existingIMs = new Set(
          (db.prepare(`SELECT LOWER(service) || ':' || LOWER(handle) as key FROM contact_instant_messages WHERE contact_id = ?`).all(existingContactId) as Array<{ key: string }>)
            .map(r => r.key)
        );
        for (const im of incomingContact.instantMessages) {
          const key = `${(im.service || '').toLowerCase()}:${(im.handle || '').toLowerCase()}`;
          if (!existingIMs.has(key)) {
            insertInstantMessage.run(existingContactId, im.service, im.handle, im.type);
          }
        }

        const existingRelated = new Set(
          (db.prepare(`SELECT LOWER(name) || ':' || LOWER(relationship) as key FROM contact_related_people WHERE contact_id = ?`).all(existingContactId) as Array<{ key: string }>)
            .map(r => r.key)
        );
        for (const rp of incomingContact.relatedPeople) {
          const key = `${(rp.name || '').toLowerCase()}:${(rp.relationship || '').toLowerCase()}`;
          if (!existingRelated.has(key)) {
            insertRelatedPerson.run(existingContactId, rp.name, rp.relationship);
          }
        }

        // Photo: only if existing has none
        if (incomingContact.photoBase64) {
          const existingPhoto = existingRow.photo_hash as string | null;
          if (!existingPhoto) {
            try {
              const photoHash = await processPhoto(incomingContact.photoBase64, existingContactId, userId);
              db.prepare('UPDATE contacts SET photo_hash = ? WHERE id = ?').run(photoHash, existingContactId);
              db.prepare(`
                INSERT INTO contact_photos (contact_id, source, local_hash, is_primary)
                VALUES (?, 'google', ?, 1)
                ON CONFLICT(contact_id, source) DO UPDATE SET local_hash = excluded.local_hash, fetched_at = CURRENT_TIMESTAMP
              `).run(existingContactId, photoHash);
            } catch { /* skip photo on error */ }
          }
        }

        // Update display_name if it changed
        const updatedFirst = db.prepare('SELECT first_name, last_name FROM contacts WHERE id = ?').get(existingContactId) as { first_name: string | null; last_name: string | null };
        const newDisplayName = [updatedFirst.first_name, updatedFirst.last_name].filter(Boolean).join(' ') || incomingContact.displayName;
        db.prepare('UPDATE contacts SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newDisplayName, existingContactId);

        rebuildContactSearch(db, existingContactId);
        merged++;
      } catch (e) {
        errors.push({ line: merged + 1, reason: e instanceof Error ? e.message : 'Unknown error' });
      }
    }

    // Update google_contacts_last_synced timestamp
    db.prepare(`
      UPDATE user_settings SET google_contacts_last_synced = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = 1
    `).run();

    return { imported, merged, skipped: skipped || 0, errors };
  });
}
