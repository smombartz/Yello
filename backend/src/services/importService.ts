import { getDatabase } from './database.js';
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
    INSERT INTO contacts (first_name, last_name, display_name, company, title, notes, photo_hash, raw_vcard)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEmail = db.prepare(`
    INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, ?)
  `);

  const insertPhone = db.prepare(`
    INSERT INTO contact_phones (contact_id, phone, phone_display, type, is_primary) VALUES (?, ?, ?, ?, ?)
  `);

  const insertAddress = db.prepare(`
    INSERT INTO contact_addresses (contact_id, street, city, state, postal_code, country, type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
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
        null,
        contact.rawVcard
      );
      const contactId = result.lastInsertRowid as number;

      if (contact.photoBase64) {
        try {
          photoHash = await processPhoto(contact.photoBase64, contactId);
          db.prepare('UPDATE contacts SET photo_hash = ? WHERE id = ?').run(photoHash, contactId);
          photosProcessed++;
        } catch {
          /* skip photo on error */
        }
      }

      for (const email of contact.emails) {
        insertEmail.run(contactId, email.email, email.type, email.isPrimary ? 1 : 0);
      }

      for (const phone of contact.phones) {
        insertPhone.run(contactId, phone.phone, phone.phoneDisplay, phone.type, phone.isPrimary ? 1 : 0);
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
