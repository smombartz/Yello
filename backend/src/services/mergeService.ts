import { getDatabase } from './database.js';
import { getPhotoUrl } from './photoProcessor.js';
import type { ContactDetail, ContactSocialProfile } from '../types/index.js';

interface MergeResult {
  mergedContact: ContactDetail;
  deletedContactIds: number[];
}

export function mergeContacts(contactIds: number[], primaryContactId: number): MergeResult {
  const db = getDatabase();

  // Validate inputs
  if (!contactIds.includes(primaryContactId)) {
    throw new Error('Primary contact ID must be in the list of contact IDs to merge');
  }

  if (contactIds.length < 2) {
    throw new Error('At least 2 contacts are required to merge');
  }

  // Check all contacts exist
  const placeholders = contactIds.map(() => '?').join(',');
  const existingContacts = db.prepare(`
    SELECT id FROM contacts WHERE id IN (${placeholders})
  `).all(...contactIds) as Array<{ id: number }>;

  if (existingContacts.length !== contactIds.length) {
    throw new Error('One or more contact IDs do not exist');
  }

  const secondaryContactIds = contactIds.filter(id => id !== primaryContactId);

  // Run merge in a transaction
  const mergeTransaction = db.transaction(() => {
    // Get existing emails for primary contact (for deduplication)
    const primaryEmails = db.prepare(`
      SELECT LOWER(email) as email FROM contact_emails WHERE contact_id = ?
    `).all(primaryContactId) as Array<{ email: string }>;
    const primaryEmailSet = new Set(primaryEmails.map(e => e.email));

    // Get existing phones for primary contact
    const primaryPhones = db.prepare(`
      SELECT phone FROM contact_phones WHERE contact_id = ?
    `).all(primaryContactId) as Array<{ phone: string }>;
    const primaryPhoneSet = new Set(primaryPhones.map(p => p.phone));

    // Get existing addresses for primary contact (compare on key fields)
    const primaryAddresses = db.prepare(`
      SELECT LOWER(COALESCE(street, '')) || '|' || LOWER(COALESCE(city, '')) || '|' || LOWER(COALESCE(postal_code, '')) as key
      FROM contact_addresses WHERE contact_id = ?
    `).all(primaryContactId) as Array<{ key: string }>;
    const primaryAddressSet = new Set(primaryAddresses.map(a => a.key));

    // Get existing social profiles for primary contact
    const primarySocials = db.prepare(`
      SELECT platform || ':' || username as key FROM contact_social_profiles WHERE contact_id = ?
    `).all(primaryContactId) as Array<{ key: string }>;
    const primarySocialSet = new Set(primarySocials.map(s => s.key));

    // Merge emails from secondary contacts
    for (const secondaryId of secondaryContactIds) {
      const secondaryEmails = db.prepare(`
        SELECT email, type, is_primary FROM contact_emails WHERE contact_id = ?
      `).all(secondaryId) as Array<{ email: string; type: string | null; is_primary: number }>;

      for (const email of secondaryEmails) {
        if (!primaryEmailSet.has(email.email.toLowerCase())) {
          db.prepare(`
            INSERT INTO contact_emails (contact_id, email, type, is_primary)
            VALUES (?, ?, ?, 0)
          `).run(primaryContactId, email.email, email.type);
          primaryEmailSet.add(email.email.toLowerCase());
        }
      }
    }

    // Merge phones from secondary contacts
    for (const secondaryId of secondaryContactIds) {
      const secondaryPhones = db.prepare(`
        SELECT phone, phone_display, type, is_primary FROM contact_phones WHERE contact_id = ?
      `).all(secondaryId) as Array<{ phone: string; phone_display: string; type: string | null; is_primary: number }>;

      for (const phone of secondaryPhones) {
        if (!primaryPhoneSet.has(phone.phone)) {
          db.prepare(`
            INSERT INTO contact_phones (contact_id, phone, phone_display, type, is_primary)
            VALUES (?, ?, ?, ?, 0)
          `).run(primaryContactId, phone.phone, phone.phone_display, phone.type);
          primaryPhoneSet.add(phone.phone);
        }
      }
    }

    // Merge addresses from secondary contacts
    for (const secondaryId of secondaryContactIds) {
      const secondaryAddresses = db.prepare(`
        SELECT street, city, state, postal_code, country, type,
               LOWER(COALESCE(street, '')) || '|' || LOWER(COALESCE(city, '')) || '|' || LOWER(COALESCE(postal_code, '')) as key
        FROM contact_addresses WHERE contact_id = ?
      `).all(secondaryId) as Array<{
        street: string | null;
        city: string | null;
        state: string | null;
        postal_code: string | null;
        country: string | null;
        type: string | null;
        key: string;
      }>;

      for (const addr of secondaryAddresses) {
        if (!primaryAddressSet.has(addr.key)) {
          db.prepare(`
            INSERT INTO contact_addresses (contact_id, street, city, state, postal_code, country, type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(primaryContactId, addr.street, addr.city, addr.state, addr.postal_code, addr.country, addr.type);
          primaryAddressSet.add(addr.key);
        }
      }
    }

    // Merge social profiles from secondary contacts
    for (const secondaryId of secondaryContactIds) {
      const secondarySocials = db.prepare(`
        SELECT platform, username, profile_url, type,
               platform || ':' || username as key
        FROM contact_social_profiles WHERE contact_id = ?
      `).all(secondaryId) as Array<{
        platform: string;
        username: string;
        profile_url: string | null;
        type: string | null;
        key: string;
      }>;

      for (const social of secondarySocials) {
        if (!primarySocialSet.has(social.key)) {
          db.prepare(`
            INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url, type)
            VALUES (?, ?, ?, ?, ?)
          `).run(primaryContactId, social.platform, social.username, social.profile_url, social.type);
          primarySocialSet.add(social.key);
        }
      }
    }

    // Merge notes from secondary contacts
    const primaryContact = db.prepare(`
      SELECT notes FROM contacts WHERE id = ?
    `).get(primaryContactId) as { notes: string | null };

    const secondaryNotes: string[] = [];
    for (const secondaryId of secondaryContactIds) {
      const secondary = db.prepare(`
        SELECT notes, display_name FROM contacts WHERE id = ?
      `).get(secondaryId) as { notes: string | null; display_name: string };
      if (secondary.notes && secondary.notes.trim()) {
        secondaryNotes.push(`[From ${secondary.display_name}]: ${secondary.notes}`);
      }
    }

    if (secondaryNotes.length > 0) {
      const combinedNotes = [primaryContact.notes, ...secondaryNotes]
        .filter(n => n && n.trim())
        .join('\n\n');
      db.prepare(`
        UPDATE contacts SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(combinedNotes, primaryContactId);
    } else {
      db.prepare(`
        UPDATE contacts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(primaryContactId);
    }

    // Delete secondary contacts (cascades to related tables)
    const secondaryPlaceholders = secondaryContactIds.map(() => '?').join(',');
    db.prepare(`
      DELETE FROM contacts WHERE id IN (${secondaryPlaceholders})
    `).run(...secondaryContactIds);
  });

  mergeTransaction();

  // Fetch the merged contact to return
  const mergedContact = getContactDetail(primaryContactId);

  return {
    mergedContact,
    deletedContactIds: secondaryContactIds
  };
}

function getContactDetail(contactId: number): ContactDetail {
  const db = getDatabase();

  const contact = db.prepare(`
    SELECT
      id,
      first_name as firstName,
      last_name as lastName,
      display_name as displayName,
      company,
      title,
      notes,
      photo_hash as photoHash,
      raw_vcard as rawVcard,
      created_at as createdAt,
      updated_at as updatedAt
    FROM contacts
    WHERE id = ?
  `).get(contactId) as {
    id: number;
    firstName: string | null;
    lastName: string | null;
    displayName: string;
    company: string | null;
    title: string | null;
    notes: string | null;
    photoHash: string | null;
    rawVcard: string | null;
    createdAt: string;
    updatedAt: string;
  };

  const emails = db.prepare(`
    SELECT id, contact_id as contactId, email, type, is_primary as isPrimary
    FROM contact_emails
    WHERE contact_id = ?
  `).all(contactId) as Array<{
    id: number;
    contactId: number;
    email: string;
    type: string | null;
    isPrimary: number;
  }>;

  const phones = db.prepare(`
    SELECT id, contact_id as contactId, phone, phone_display as phoneDisplay, type, is_primary as isPrimary
    FROM contact_phones
    WHERE contact_id = ?
  `).all(contactId) as Array<{
    id: number;
    contactId: number;
    phone: string;
    phoneDisplay: string;
    type: string | null;
    isPrimary: number;
  }>;

  const addresses = db.prepare(`
    SELECT id, contact_id as contactId, street, city, state, postal_code as postalCode, country, type
    FROM contact_addresses
    WHERE contact_id = ?
  `).all(contactId) as Array<{
    id: number;
    contactId: number;
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    type: string | null;
  }>;

  const socialProfiles = db.prepare(`
    SELECT id, contact_id as contactId, platform, username, profile_url as profileUrl, type
    FROM contact_social_profiles
    WHERE contact_id = ?
  `).all(contactId) as ContactSocialProfile[];

  return {
    ...contact,
    emails: emails.map(e => ({ ...e, isPrimary: Boolean(e.isPrimary) })),
    phones: phones.map(p => ({ ...p, isPrimary: Boolean(p.isPrimary) })),
    addresses,
    socialProfiles,
    photoUrl: getPhotoUrl(contact.photoHash, 'medium')
  };
}
