import { getDatabase } from './database.js';
import type { ContactDetail, ContactSocialProfile } from '../types/index.js';
import { getPhotoUrl } from './photoProcessor.js';

export interface ArchivedContact extends ContactDetail {
  archivedAt: string;
}

/**
 * Archive contacts by setting archived_at timestamp
 */
export function archiveContacts(contactIds: number[]): { archivedCount: number } {
  if (contactIds.length === 0) {
    return { archivedCount: 0 };
  }

  const db = getDatabase();
  const placeholders = contactIds.map(() => '?').join(',');

  const result = db.prepare(`
    UPDATE contacts
    SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id IN (${placeholders}) AND archived_at IS NULL
  `).run(...contactIds);

  return { archivedCount: result.changes };
}

/**
 * Unarchive contacts by clearing archived_at
 */
export function unarchiveContacts(contactIds: number[]): { unarchivedCount: number } {
  if (contactIds.length === 0) {
    return { unarchivedCount: 0 };
  }

  const db = getDatabase();
  const placeholders = contactIds.map(() => '?').join(',');

  const result = db.prepare(`
    UPDATE contacts
    SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id IN (${placeholders}) AND archived_at IS NOT NULL
  `).run(...contactIds);

  return { unarchivedCount: result.changes };
}

/**
 * Get count of archived contacts
 */
export function getArchivedCount(): number {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM contacts WHERE archived_at IS NOT NULL
  `).get() as { count: number };
  return result.count;
}

/**
 * Get archived contacts with pagination
 */
export function getArchivedContacts(limit: number, offset: number): {
  contacts: ArchivedContact[];
  total: number;
} {
  const db = getDatabase();
  const total = getArchivedCount();

  const rows = db.prepare(`
    SELECT
      id,
      first_name as firstName,
      last_name as lastName,
      display_name as displayName,
      company,
      title,
      notes,
      birthday,
      photo_hash as photoHash,
      raw_vcard as rawVcard,
      created_at as createdAt,
      updated_at as updatedAt,
      archived_at as archivedAt
    FROM contacts
    WHERE archived_at IS NOT NULL
    ORDER BY archived_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as Array<{
    id: number;
    firstName: string | null;
    lastName: string | null;
    displayName: string;
    company: string | null;
    title: string | null;
    notes: string | null;
    birthday: string | null;
    photoHash: string | null;
    rawVcard: string | null;
    createdAt: string;
    updatedAt: string;
    archivedAt: string;
  }>;

  const contacts: ArchivedContact[] = rows.map(contact => {
    const emails = db.prepare(`
      SELECT id, contact_id as contactId, email, type, is_primary as isPrimary
      FROM contact_emails
      WHERE contact_id = ?
    `).all(contact.id) as Array<{
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
    `).all(contact.id) as Array<{
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
    `).all(contact.id) as Array<{
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
    `).all(contact.id) as ContactSocialProfile[];

    const categories = db.prepare(`
      SELECT id, contact_id as contactId, category
      FROM contact_categories
      WHERE contact_id = ?
    `).all(contact.id) as Array<{ id: number; contactId: number; category: string }>;

    const instantMessages = db.prepare(`
      SELECT id, contact_id as contactId, service, handle, type
      FROM contact_instant_messages
      WHERE contact_id = ?
    `).all(contact.id) as Array<{ id: number; contactId: number; service: string; handle: string; type: string | null }>;

    const urls = db.prepare(`
      SELECT id, contact_id as contactId, url, label, type
      FROM contact_urls
      WHERE contact_id = ?
    `).all(contact.id) as Array<{ id: number; contactId: number; url: string; label: string | null; type: string | null }>;

    const relatedPeople = db.prepare(`
      SELECT id, contact_id as contactId, name, relationship
      FROM contact_related_people
      WHERE contact_id = ?
    `).all(contact.id) as Array<{ id: number; contactId: number; name: string; relationship: string | null }>;

    return {
      ...contact,
      emails: emails.map(e => ({ ...e, isPrimary: Boolean(e.isPrimary) })),
      phones: phones.map(p => ({ ...p, isPrimary: Boolean(p.isPrimary) })),
      addresses,
      socialProfiles,
      categories,
      instantMessages,
      urls,
      relatedPeople,
      photoUrl: getPhotoUrl(contact.photoHash, 'medium')
    };
  });

  return { contacts, total };
}

/**
 * Permanently delete archived contacts
 */
export function deleteArchivedContacts(contactIds: number[]): { deletedCount: number } {
  if (contactIds.length === 0) {
    return { deletedCount: 0 };
  }

  const db = getDatabase();
  const placeholders = contactIds.map(() => '?').join(',');

  const deleteInTransaction = db.transaction(() => {
    // Delete related data first (foreign key constraints)
    db.prepare(`DELETE FROM contact_emails WHERE contact_id IN (${placeholders})`).run(...contactIds);
    db.prepare(`DELETE FROM contact_phones WHERE contact_id IN (${placeholders})`).run(...contactIds);
    db.prepare(`DELETE FROM contact_addresses WHERE contact_id IN (${placeholders})`).run(...contactIds);
    db.prepare(`DELETE FROM contact_social_profiles WHERE contact_id IN (${placeholders})`).run(...contactIds);
    db.prepare(`DELETE FROM contact_categories WHERE contact_id IN (${placeholders})`).run(...contactIds);
    db.prepare(`DELETE FROM contact_instant_messages WHERE contact_id IN (${placeholders})`).run(...contactIds);
    db.prepare(`DELETE FROM contact_urls WHERE contact_id IN (${placeholders})`).run(...contactIds);
    db.prepare(`DELETE FROM contact_related_people WHERE contact_id IN (${placeholders})`).run(...contactIds);

    // Delete from FTS tables
    db.prepare(`DELETE FROM contacts_fts WHERE rowid IN (${placeholders})`).run(...contactIds);

    // Delete contacts (only if archived)
    const result = db.prepare(`
      DELETE FROM contacts WHERE id IN (${placeholders}) AND archived_at IS NOT NULL
    `).run(...contactIds);
    return result.changes;
  });

  const deletedCount = deleteInTransaction();
  return { deletedCount };
}

/**
 * Export archived contacts as VCF
 */
export function exportArchivedContactsVcf(): string {
  const db = getDatabase();

  const rows = db.prepare(`
    SELECT raw_vcard as rawVcard
    FROM contacts
    WHERE archived_at IS NOT NULL AND raw_vcard IS NOT NULL
    ORDER BY archived_at DESC
  `).all() as Array<{ rawVcard: string }>;

  return rows.map(r => r.rawVcard).join('\n');
}
