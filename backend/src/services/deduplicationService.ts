import { getDatabase } from './database.js';
import type { DeduplicationMode } from '../schemas/duplicates.js';
import type { ContactDetail, DuplicateGroup, ContactSocialProfile } from '../types/index.js';
import { getPhotoUrl } from './photoProcessor.js';

interface DuplicateMatch {
  matchValue: string;
  contactIds: string;
}

function findEmailDuplicates(limit: number, offset: number): DuplicateMatch[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT LOWER(email) as matchValue, GROUP_CONCAT(DISTINCT contact_id) as contactIds
    FROM contact_emails
    GROUP BY LOWER(email)
    HAVING COUNT(DISTINCT contact_id) > 1
    ORDER BY COUNT(DISTINCT contact_id) DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as DuplicateMatch[];
}

function findPhoneDuplicates(limit: number, offset: number): DuplicateMatch[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT phone as matchValue, GROUP_CONCAT(DISTINCT contact_id) as contactIds
    FROM contact_phones
    WHERE phone != ''
    GROUP BY phone
    HAVING COUNT(DISTINCT contact_id) > 1
    ORDER BY COUNT(DISTINCT contact_id) DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as DuplicateMatch[];
}

function findAddressDuplicates(limit: number, offset: number): DuplicateMatch[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT
      LOWER(COALESCE(street, '')) || '|' || LOWER(COALESCE(city, '')) || '|' || LOWER(COALESCE(postal_code, '')) as matchValue,
      GROUP_CONCAT(DISTINCT contact_id) as contactIds
    FROM contact_addresses
    WHERE street IS NOT NULL AND street != '' AND city IS NOT NULL AND city != ''
    GROUP BY LOWER(street), LOWER(city), LOWER(postal_code)
    HAVING COUNT(DISTINCT contact_id) > 1
    ORDER BY COUNT(DISTINCT contact_id) DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as DuplicateMatch[];
}

function findSocialDuplicates(limit: number, offset: number): DuplicateMatch[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT
      platform || ':' || username as matchValue,
      GROUP_CONCAT(DISTINCT contact_id) as contactIds
    FROM contact_social_profiles
    GROUP BY platform, username
    HAVING COUNT(DISTINCT contact_id) > 1
    ORDER BY COUNT(DISTINCT contact_id) DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as DuplicateMatch[];
}

function countEmailDuplicateGroups(): number {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM (
      SELECT 1
      FROM contact_emails
      GROUP BY LOWER(email)
      HAVING COUNT(DISTINCT contact_id) > 1
    )
  `).get() as { count: number };
  return result.count;
}

function countPhoneDuplicateGroups(): number {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM (
      SELECT 1
      FROM contact_phones
      WHERE phone != ''
      GROUP BY phone
      HAVING COUNT(DISTINCT contact_id) > 1
    )
  `).get() as { count: number };
  return result.count;
}

function countAddressDuplicateGroups(): number {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM (
      SELECT 1
      FROM contact_addresses
      WHERE street IS NOT NULL AND street != '' AND city IS NOT NULL AND city != ''
      GROUP BY LOWER(street), LOWER(city), LOWER(postal_code)
      HAVING COUNT(DISTINCT contact_id) > 1
    )
  `).get() as { count: number };
  return result.count;
}

function countSocialDuplicateGroups(): number {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM (
      SELECT 1
      FROM contact_social_profiles
      GROUP BY platform, username
      HAVING COUNT(DISTINCT contact_id) > 1
    )
  `).get() as { count: number };
  return result.count;
}

export function getDuplicateSummary(): { email: number; phone: number; address: number; social: number } {
  return {
    email: countEmailDuplicateGroups(),
    phone: countPhoneDuplicateGroups(),
    address: countAddressDuplicateGroups(),
    social: countSocialDuplicateGroups()
  };
}

function getContactDetails(contactIds: number[]): ContactDetail[] {
  const db = getDatabase();
  const placeholders = contactIds.map(() => '?').join(',');

  const contacts = db.prepare(`
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
    WHERE id IN (${placeholders})
  `).all(...contactIds) as Array<{
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
  }>;

  return contacts.map(contact => {
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

    return {
      ...contact,
      emails: emails.map(e => ({ ...e, isPrimary: Boolean(e.isPrimary) })),
      phones: phones.map(p => ({ ...p, isPrimary: Boolean(p.isPrimary) })),
      addresses,
      socialProfiles,
      photoUrl: getPhotoUrl(contact.photoHash, 'medium')
    };
  });
}

export function findDuplicates(
  mode: DeduplicationMode,
  limit: number,
  offset: number
): { groups: DuplicateGroup[]; totalGroups: number } {
  let matches: DuplicateMatch[];
  let totalGroups: number;

  switch (mode) {
    case 'email':
      matches = findEmailDuplicates(limit, offset);
      totalGroups = countEmailDuplicateGroups();
      break;
    case 'phone':
      matches = findPhoneDuplicates(limit, offset);
      totalGroups = countPhoneDuplicateGroups();
      break;
    case 'address':
      matches = findAddressDuplicates(limit, offset);
      totalGroups = countAddressDuplicateGroups();
      break;
    case 'social':
      matches = findSocialDuplicates(limit, offset);
      totalGroups = countSocialDuplicateGroups();
      break;
  }

  const groups: DuplicateGroup[] = matches.map(match => {
    const contactIds = match.contactIds.split(',').map(id => parseInt(id, 10));
    const contacts = getContactDetails(contactIds);

    return {
      id: Buffer.from(match.matchValue).toString('base64'),
      matchingValue: match.matchValue,
      matchingField: mode,
      contacts
    };
  });

  return { groups, totalGroups };
}
