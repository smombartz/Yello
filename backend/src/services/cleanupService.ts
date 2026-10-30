import type { Database as DatabaseType } from 'better-sqlite3';
import { deleteContactsFromSearch } from './database.js';
import type { ContactDetail, ContactSocialProfile } from '../types/index.js';
import { getPhotoUrl } from './photoProcessor.js';

export type EmptyContactType = 'truly_empty' | 'no_name' | 'name_only';
export type ProblematicContactType = 'many_domains' | 'same_domain';
export type NoIdentityContactType = 'no_identity';

export interface CleanupContact extends ContactDetail {
  issueType: EmptyContactType | ProblematicContactType | NoIdentityContactType;
  issueDetails?: string;
}

export interface CleanupSummary {
  empty: {
    trulyEmpty: number;
    noName: number;
    nameOnly: number;
    total: number;
  };
  problematic: {
    manyDomains: number;
    sameDomain: number;
    total: number;
  };
}

// ============================================================
// Empty Contacts Detection
// ============================================================

const blank = (column: string) => `TRIM(COALESCE(c.${column}, '')) = ''`;

/**
 * No real name: the display name is empty, or it is still the stand-in a
 * nameless card was given on import (its company, email or phone).
 */
const NO_REAL_NAME_SQL = `(
  ${blank('display_name')}
  OR (c.placeholder_name IS NOT NULL AND c.display_name = c.placeholder_name
      AND ${blank('first_name')} AND ${blank('last_name')})
)`;

/** Tables whose rows are information about the contact (archived rows count too). */
const DATA_TABLES = [
  'contact_emails', 'contact_phones', 'contact_addresses', 'contact_social_profiles',
  'contact_instant_messages', 'contact_urls', 'contact_related_people', 'contact_dates',
  'contact_photos', 'linkedin_enrichment'
];

/** Contact columns that hold information beyond the name. */
const DATA_COLUMNS = ['company', 'title', 'department', 'notes', 'birthday', 'gender', 'photo_hash'];

/**
 * Nothing but a name: no contact details, notes, birthday, dates, photo, work
 * info, related people or LinkedIn data. Group membership doesn't count.
 */
const NO_DATA_SQL = `(
  ${DATA_COLUMNS.map(blank).join('\n  AND ')}
  AND ${DATA_TABLES.map(t => `NOT EXISTS (SELECT 1 FROM ${t} x WHERE x.contact_id = c.id)`).join('\n  AND ')}
)`;

const EMPTY_TYPE_WHERE: Record<EmptyContactType, string> = {
  truly_empty: `${NO_REAL_NAME_SQL} AND ${NO_DATA_SQL}`,
  no_name: `${NO_REAL_NAME_SQL} AND NOT ${NO_DATA_SQL}`,
  name_only: `NOT ${NO_REAL_NAME_SQL} AND ${NO_DATA_SQL}`
};

const EMPTY_TYPE_ORDER: Record<EmptyContactType, string> = {
  truly_empty: 'c.id',
  no_name: 'c.display_name COLLATE NOCASE, c.id',
  name_only: 'c.display_name COLLATE NOCASE, c.id'
};

const EMPTY_TYPE_DETAILS: Record<EmptyContactType, string> = {
  truly_empty: 'No name or other information',
  no_name: 'No name: showing its company, email or phone instead',
  name_only: 'Has a name but no other information'
};

const ALL_EMPTY_TYPES: EmptyContactType[] = ['truly_empty', 'no_name', 'name_only'];

function countEmptyContacts(db: DatabaseType, type: EmptyContactType): number {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM contacts c
    WHERE c.archived_at IS NULL AND ${EMPTY_TYPE_WHERE[type]}
  `).get() as { count: number };
  return result.count;
}

function findEmptyContactIds(db: DatabaseType, type: EmptyContactType, limit = -1, offset = 0): number[] {
  const rows = db.prepare(`
    SELECT c.id FROM contacts c
    WHERE c.archived_at IS NULL AND ${EMPTY_TYPE_WHERE[type]}
    ORDER BY ${EMPTY_TYPE_ORDER[type]}
    LIMIT ? OFFSET ?
  `).all(limit, offset) as Array<{ id: number }>;
  return rows.map(r => r.id);
}

// ============================================================
// Problematic Contacts Detection
// ============================================================

/**
 * Count contacts with many different email domains
 */
function countManyDomainsContacts(db: DatabaseType, threshold: number): number {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM (
      SELECT c.id
      FROM contacts c
      JOIN contact_emails ce ON ce.contact_id = c.id
      WHERE INSTR(ce.email, '@') > 0 AND c.archived_at IS NULL
      GROUP BY c.id
      HAVING COUNT(DISTINCT LOWER(SUBSTR(ce.email, INSTR(ce.email, '@') + 1))) >= ?
    )
  `).get(threshold) as { count: number };
  return result.count;
}

/**
 * Count contacts with same domain but multiple different usernames
 */
function countSameDomainContacts(db: DatabaseType): number {
  // Count distinct contacts that have at least one domain with multiple usernames
  const result = db.prepare(`
    SELECT COUNT(DISTINCT contact_id) as count FROM (
      SELECT ce.contact_id, LOWER(SUBSTR(ce.email, INSTR(ce.email, '@') + 1)) as domain
      FROM contact_emails ce
      JOIN contacts c ON c.id = ce.contact_id
      WHERE INSTR(ce.email, '@') > 0 AND c.archived_at IS NULL
      GROUP BY ce.contact_id, domain
      HAVING COUNT(DISTINCT LOWER(SUBSTR(ce.email, 1, INSTR(ce.email, '@') - 1))) > 1
    )
  `).get() as { count: number };
  return result.count;
}

/**
 * Find contact IDs with many different email domains
 */
function findManyDomainsContactIds(db: DatabaseType, threshold: number, limit: number, offset: number): Array<{ id: number; domainCount: number }> {
  return db.prepare(`
    SELECT c.id, COUNT(DISTINCT LOWER(SUBSTR(ce.email, INSTR(ce.email, '@') + 1))) as domainCount
    FROM contacts c
    JOIN contact_emails ce ON ce.contact_id = c.id
    WHERE INSTR(ce.email, '@') > 0 AND c.archived_at IS NULL
    GROUP BY c.id
    HAVING domainCount >= ?
    ORDER BY domainCount DESC, c.display_name
    LIMIT ? OFFSET ?
  `).all(threshold, limit, offset) as Array<{ id: number; domainCount: number }>;
}

/**
 * Find contact IDs with same domain but multiple different usernames
 */
function findSameDomainContactIds(db: DatabaseType, limit: number, offset: number): Array<{ id: number; domain: string; usernameCount: number }> {
  // Get contacts that have at least one domain with multiple usernames
  // For simplicity, we return the first problematic domain for each contact
  return db.prepare(`
    SELECT contact_id as id, domain, usernameCount
    FROM (
      SELECT ce.contact_id,
             LOWER(SUBSTR(ce.email, INSTR(ce.email, '@') + 1)) as domain,
             COUNT(DISTINCT LOWER(SUBSTR(ce.email, 1, INSTR(ce.email, '@') - 1))) as usernameCount
      FROM contact_emails ce
      JOIN contacts c ON c.id = ce.contact_id
      WHERE INSTR(ce.email, '@') > 0 AND c.archived_at IS NULL
      GROUP BY ce.contact_id, domain
      HAVING usernameCount > 1
    )
    GROUP BY contact_id
    ORDER BY usernameCount DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as Array<{ id: number; domain: string; usernameCount: number }>;
}

// ============================================================
// Contact Details Helper
// ============================================================

function getContactDetails(db: DatabaseType, contactIds: number[]): ContactDetail[] {
  if (contactIds.length === 0) return [];
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
      birthday,
      photo_hash as photoHash,
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
    birthday: string | null;
    photoHash: string | null;
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
      SELECT id, contact_id as contactId, phone, phone_display as phoneDisplay, country_code as countryCode, type, is_primary as isPrimary
      FROM contact_phones
      WHERE contact_id = ?
    `).all(contact.id) as Array<{
      id: number;
      contactId: number;
      phone: string;
      phoneDisplay: string;
      countryCode: string | null;
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
      SELECT id, contact_id as contactId, name, relationship, related_contact_id as relatedContactId
      FROM contact_related_people
      WHERE contact_id = ?
    `).all(contact.id) as Array<{ id: number; contactId: number; name: string; relationship: string | null; relatedContactId: number | null }>;

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
      linkedFrom: [],
      photoUrl: getPhotoUrl(contact.photoHash, 'medium'),
      linkedinEnrichment: null
    };
  });
}

// ============================================================
// Public API
// ============================================================

/**
 * Get summary counts for all cleanup categories
 */
export function getCleanupSummary(db: DatabaseType, threshold: number = 3): CleanupSummary {
  const trulyEmpty = countEmptyContacts(db, 'truly_empty');
  const noName = countEmptyContacts(db, 'no_name');
  const nameOnly = countEmptyContacts(db, 'name_only');
  const manyDomains = countManyDomainsContacts(db, threshold);
  const sameDomain = countSameDomainContacts(db);

  return {
    empty: {
      trulyEmpty,
      noName,
      nameOnly,
      total: trulyEmpty + noName + nameOnly
    },
    problematic: {
      manyDomains,
      sameDomain,
      total: manyDomains + sameDomain
    }
  };
}

/**
 * Find empty contacts with pagination and optional type filtering
 */
export function findEmptyContacts(
  db: DatabaseType,
  limit: number,
  offset: number,
  types?: EmptyContactType[]
): { contacts: CleanupContact[]; total: number } {
  const includeTypes = ALL_EMPTY_TYPES.filter(t => !types || types.length === 0 || types.includes(t));

  const results: CleanupContact[] = [];
  let totalCount = 0;
  let remaining = limit;
  let currentOffset = offset;

  // The types are listed one after the other; the page window walks across them
  for (const type of includeTypes) {
    const count = countEmptyContacts(db, type);
    totalCount += count;
    if (remaining <= 0) continue;
    if (currentOffset >= count) {
      currentOffset -= count;
      continue;
    }
    const ids = findEmptyContactIds(db, type, remaining, currentOffset);
    for (const contact of getContactDetails(db, ids)) {
      results.push({ ...contact, issueType: type, issueDetails: EMPTY_TYPE_DETAILS[type] });
    }
    remaining -= ids.length;
    currentOffset = 0;
  }

  return { contacts: results, total: totalCount };
}

/**
 * Find problematic contacts with pagination and optional type filtering
 */
export function findProblematicContacts(
  db: DatabaseType,
  limit: number,
  offset: number,
  threshold: number = 3,
  types?: ProblematicContactType[]
): { contacts: CleanupContact[]; total: number } {
  const includeTypes = types && types.length > 0
    ? types
    : ['many_domains', 'same_domain'] as ProblematicContactType[];

  const results: CleanupContact[] = [];
  let totalCount = 0;

  // Calculate totals
  if (includeTypes.includes('many_domains')) {
    totalCount += countManyDomainsContacts(db, threshold);
  }
  if (includeTypes.includes('same_domain')) {
    totalCount += countSameDomainContacts(db);
  }

  let remaining = limit;
  let currentOffset = offset;

  if (includeTypes.includes('many_domains') && remaining > 0) {
    const manyDomainsCount = countManyDomainsContacts(db, threshold);
    if (currentOffset < manyDomainsCount) {
      const rows = findManyDomainsContactIds(db, threshold, remaining, currentOffset);
      const ids = rows.map(r => r.id);
      const contacts = getContactDetails(db, ids);

      // Map domain counts to contacts
      const domainCountMap = new Map(rows.map(r => [r.id, r.domainCount]));
      for (const contact of contacts) {
        const domainCount = domainCountMap.get(contact.id) || 0;
        results.push({
          ...contact,
          issueType: 'many_domains',
          issueDetails: `${domainCount} different email domains`
        });
      }
      remaining -= ids.length;
      currentOffset = 0;
    } else {
      currentOffset -= manyDomainsCount;
    }
  }

  if (includeTypes.includes('same_domain') && remaining > 0) {
    const rows = findSameDomainContactIds(db, remaining, currentOffset);
    const ids = rows.map(r => r.id);
    const contacts = getContactDetails(db, ids);

    // Map domain info to contacts
    const domainInfoMap = new Map(rows.map(r => [r.id, { domain: r.domain, count: r.usernameCount }]));
    for (const contact of contacts) {
      const info = domainInfoMap.get(contact.id);
      results.push({
        ...contact,
        issueType: 'same_domain',
        issueDetails: info ? `${info.count} usernames at ${info.domain}` : 'Multiple usernames at same domain'
      });
    }
  }

  return { contacts: results, total: totalCount };
}

/**
 * Get all empty contact IDs (no pagination, for bulk selection)
 */
export function getAllEmptyContactIds(db: DatabaseType, types?: EmptyContactType[]): number[] {
  return ALL_EMPTY_TYPES
    .filter(t => !types || types.length === 0 || types.includes(t))
    .flatMap(type => findEmptyContactIds(db, type));
}

/**
 * Get all problematic contact IDs (no pagination, for bulk selection)
 */
export function getAllProblematicContactIds(
  db: DatabaseType,
  threshold: number = 3,
  types?: ProblematicContactType[]
): number[] {
  const includeTypes = types && types.length > 0
    ? types
    : ['many_domains', 'same_domain'] as ProblematicContactType[];

  const results: number[] = [];

  if (includeTypes.includes('many_domains')) {
    const rows = db.prepare(`
      SELECT c.id
      FROM contacts c
      JOIN contact_emails ce ON ce.contact_id = c.id
      WHERE INSTR(ce.email, '@') > 0 AND c.archived_at IS NULL
      GROUP BY c.id
      HAVING COUNT(DISTINCT LOWER(SUBSTR(ce.email, INSTR(ce.email, '@') + 1))) >= ?
      ORDER BY COUNT(DISTINCT LOWER(SUBSTR(ce.email, INSTR(ce.email, '@') + 1))) DESC
    `).all(threshold) as Array<{ id: number }>;
    results.push(...rows.map(r => r.id));
  }

  if (includeTypes.includes('same_domain')) {
    const rows = db.prepare(`
      SELECT DISTINCT contact_id as id
      FROM (
        SELECT ce.contact_id,
               LOWER(SUBSTR(ce.email, INSTR(ce.email, '@') + 1)) as domain,
               COUNT(DISTINCT LOWER(SUBSTR(ce.email, 1, INSTR(ce.email, '@') - 1))) as usernameCount
        FROM contact_emails ce
        JOIN contacts c ON c.id = ce.contact_id
        WHERE INSTR(ce.email, '@') > 0 AND c.archived_at IS NULL
        GROUP BY ce.contact_id, domain
        HAVING usernameCount > 1
      )
    `).all() as Array<{ id: number }>;
    results.push(...rows.map(r => r.id));
  }

  return results;
}

/**
 * Delete contacts by IDs
 */
export function deleteContacts(db: DatabaseType, contactIds: number[]): { deletedCount: number } {
  if (contactIds.length === 0) {
    return { deletedCount: 0 };
  }
  const placeholders = contactIds.map(() => '?').join(',');

  // Use transaction for atomicity
  const deleteInTransaction = db.transaction(() => {
    // Delete related data first (foreign key constraints)
    db.prepare(`DELETE FROM contact_emails WHERE contact_id IN (${placeholders})`).run(...contactIds);
    db.prepare(`DELETE FROM contact_phones WHERE contact_id IN (${placeholders})`).run(...contactIds);
    db.prepare(`DELETE FROM contact_addresses WHERE contact_id IN (${placeholders})`).run(...contactIds);
    db.prepare(`DELETE FROM contact_social_profiles WHERE contact_id IN (${placeholders})`).run(...contactIds);

    // contacts_fts is cleared by the contacts_ad trigger. Deleting its rows here
    // as well made that trigger delete them twice, which SQLite reports as
    // "database disk image is malformed" and rolled the whole delete back.
    deleteContactsFromSearch(db, contactIds);

    // Delete contacts
    const result = db.prepare(`DELETE FROM contacts WHERE id IN (${placeholders})`).run(...contactIds);
    return result.changes;
  });

  const deletedCount = deleteInTransaction();
  return { deletedCount };
}
