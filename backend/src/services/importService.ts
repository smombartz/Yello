import { getDatabase, rebuildContactSearch } from './database.js';
import { parseVcf, type ParsedContact } from './vcardParser.js';
import { processPhoto } from './photoProcessor.js';

export interface ImportResult {
  imported: number;
  failed: number;
  photosProcessed: number;
  errors: Array<{ line: number; reason: string }>;
}

export async function importVcf(vcfContent: string): Promise<ImportResult> {
  const { contacts, errors } = parseVcf(vcfContent);
  const db = getDatabase();

  let imported = 0;
  let photosProcessed = 0;

  const insertContact = db.prepare(`
    INSERT INTO contacts (first_name, last_name, display_name, company, title, notes, birthday, photo_hash, raw_vcard)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEmail = db.prepare(`
    INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, ?)
  `);

  const insertPhone = db.prepare(`
    INSERT INTO contact_phones (contact_id, phone, phone_display, country_code, type, is_primary) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertAddress = db.prepare(`
    INSERT INTO contact_addresses (contact_id, street, city, state, postal_code, country, type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCategory = db.prepare(`
    INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)
  `);

  const insertInstantMessage = db.prepare(`
    INSERT INTO contact_instant_messages (contact_id, service, handle, type) VALUES (?, ?, ?, ?)
  `);

  const insertUrl = db.prepare(`
    INSERT INTO contact_urls (contact_id, url, label, type) VALUES (?, ?, ?, ?)
  `);

  const insertRelatedPerson = db.prepare(`
    INSERT INTO contact_related_people (contact_id, name, relationship) VALUES (?, ?, ?)
  `);

  const insertSocialProfile = db.prepare(`
    INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url, type)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const contact of contacts) {
    try {
      let photoHash = null;

      const result = insertContact.run(
        contact.firstName,
        contact.lastName,
        contact.displayName,
        contact.company,
        contact.title,
        contact.notes,
        contact.birthday,
        null,
        contact.rawVcard
      );
      const contactId = result.lastInsertRowid as number;

      if (contact.photoBase64) {
        try {
          photoHash = await processPhoto(contact.photoBase64, contactId);
          db.prepare('UPDATE contacts SET photo_hash = ? WHERE id = ?').run(photoHash, contactId);
          // Also record in contact_photos table
          db.prepare(`
            INSERT INTO contact_photos (contact_id, source, local_hash, is_primary)
            VALUES (?, 'vcard', ?, 1)
            ON CONFLICT(contact_id, source) DO UPDATE SET
              local_hash = excluded.local_hash,
              fetched_at = CURRENT_TIMESTAMP
          `).run(contactId, photoHash);
          photosProcessed++;
        } catch {
          /* skip photo on error */
        }
      }

      for (const email of contact.emails) {
        insertEmail.run(contactId, email.email, email.type, email.isPrimary ? 1 : 0);
      }

      for (const phone of contact.phones) {
        insertPhone.run(contactId, phone.phone, phone.phoneDisplay, phone.countryCode, phone.type, phone.isPrimary ? 1 : 0);
      }

      for (const addr of contact.addresses) {
        insertAddress.run(
          contactId,
          addr.street,
          addr.city,
          addr.state,
          addr.postalCode,
          addr.country,
          addr.type
        );
      }

      for (const category of contact.categories) {
        insertCategory.run(contactId, category);
      }

      for (const im of contact.instantMessages) {
        insertInstantMessage.run(contactId, im.service, im.handle, im.type);
      }

      for (const url of contact.urls) {
        insertUrl.run(contactId, url.url, url.label, url.type);
      }

      for (const person of contact.relatedPeople) {
        insertRelatedPerson.run(contactId, person.name, person.relationship);
      }

      for (const profile of contact.socialProfiles) {
        // Extract username from URL if not provided
        let username = profile.username;
        if (!username && profile.url) {
          // Try to extract username from URL path (last segment)
          const urlMatch = profile.url.match(/\/([^\/]+)\/?$/);
          username = urlMatch ? urlMatch[1] : profile.platform;
        }
        username = username || profile.platform; // Final fallback to platform name

        insertSocialProfile.run(
          contactId,
          profile.platform,
          username,
          profile.url,
          null
        );
      }

      // Rebuild unified FTS index for this contact
      rebuildContactSearch(db, contactId);

      imported++;
    } catch (e) {
      errors.push({
        line: imported + 1,
        reason: e instanceof Error ? e.message : 'Unknown error'
      });
    }
  }

  return { imported, failed: errors.length, photosProcessed, errors };
}
