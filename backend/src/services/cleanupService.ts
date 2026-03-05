import type { Database as DatabaseType } from 'better-sqlite3';
import { deleteContactsFromSearch } from './database.js';
import type { ContactDetail, ContactSocialProfile } from '../types/index.js';
import { getPhotoUrl } from './photoProcessor.js';

export type EmptyContactType = 'truly_empty' | 'name_only';
export type ProblematicContactType = 'many_domains' | 'same_domain';
export type NoIdentityContactType = 'no_identity';

export interface CleanupContact extends ContactDetail {
  issueType: EmptyContactType | ProblematicContactType | NoIdentityContactType;
  issueDetails?: string;
}

export interface CleanupSummary {
  empty: {
    trulyEmpty: number;
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

/**
 * Count truly empty contacts (no name AND no other data)
 */
function countTrulyEmptyContacts(db: DatabaseType): number {
  const result = db.prepare(`
    SELECT COUNT(*) as count
    FROM contacts c
    LEFT JOIN contact_emails ce ON ce.contact_id = c.id
    LEFT JOIN contact_phones cp ON cp.contact_id = c.id
    LEFT JOIN contact_addresses ca ON ca.contact_id = c.id
    LEFT JOIN contact_social_profiles csp ON csp.contact_id = c.id
    WHERE (c.display_name IS NULL OR TRIM(c.display_name) = '')
      AND ce.id IS NULL
      AND cp.id IS NULL
      AND ca.id IS NULL
      AND csp.id IS NULL
      AND c.archived_at IS NULL
  `).get() as { count: number };
  return result.count;
}

/**
 * Count name-only contacts (has name but no other useful info)
 */
function countNameOnlyContacts(db: DatabaseType): number {
  const result = db.prepare(`
    SELECT COUNT(*) as count
    FROM contacts c
    LEFT JOIN contact_emails ce ON ce.contact_id = c.id
    LEFT JOIN contact_phones cp ON cp.contact_id = c.id
    LEFT JOIN contact_addresses ca ON ca.contact_id = c.id
    LEFT JOIN contact_social_profiles csp ON csp.contact_id = c.id
    WHERE c.display_name IS NOT NULL AND TRIM(c.display_name) != ''
      AND ce.id IS NULL
      AND cp.id IS NULL
      AND ca.id IS NULL
      AND csp.id IS NULL
      AND (c.company IS NULL OR TRIM(c.company) = '')
      AND (c.title IS NULL OR TRIM(c.title) = '')
      AND (c.notes IS NULL OR TRIM(c.notes) = '')
      AND c.archived_at IS NULL
  `).get() as { count: number };
  return result.count;
}

/**
 * Find truly empty contact IDs
 */
function findTrulyEmptyContactIds(db: DatabaseType, limit: number, offset: number): number[] {
  const rows = db.prepare(`
    SELECT c.id
    FROM contacts c
    LEFT JOIN contact_emails ce ON ce.contact_id = c.id
    LEFT JOIN contact_phones cp ON cp.contact_id = c.id
    LEFT JOIN contact_addresses ca ON ca.contact_id = c.id
    LEFT JOIN contact_social_profiles csp ON csp.contact_id = c.id
    WHERE (c.display_name IS NULL OR TRIM(c.display_name) = '')
      AND ce.id IS NULL
      AND cp.id IS NULL
      AND ca.id IS NULL
      AND csp.id IS NULL
      AND c.archived_at IS NULL
    ORDER BY c.id
    LIMIT ? OFFSET ?
  `).all(limit, offset) as Array<{ id: number }>;
  return rows.map(r => r.id);
}

/**
 * Find name-only contact IDs
 */
function findNameOnlyContactIds(db: DatabaseType, limit: number, offset: number): number[] {
  const rows = db.prepare(`
    SELECT c.id
    FROM contacts c
    LEFT JOIN contact_emails ce ON ce.contact_id = c.id
    LEFT JOIN contact_phones cp ON cp.contact_id = c.id
    LEFT JOIN contact_addresses ca ON ca.contact_id = c.id
    LEFT JOIN contact_social_profiles csp ON csp.contact_id = c.id
    WHERE c.display_name IS NOT NULL AND TRIM(c.display_name) != ''
      AND ce.id IS NULL
      AND cp.id IS NULL
      AND ca.id IS NULL
      AND csp.id IS NULL
      AND (c.company IS NULL OR TRIM(c.company) = '')
      AND (c.title IS NULL OR TRIM(c.title) = '')
      AND (c.notes IS NULL OR TRIM(c.notes) = '')
      AND c.archived_at IS NULL
    ORDER BY c.display_name
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
    birthday: string | null;
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
  const trulyEmpty = countTrulyEmptyContacts(db);
  const nameOnly = countNameOnlyContacts(db);
  const manyDomains = countManyDomainsContacts(db, threshold);
  const sameDomain = countSameDomainContacts(db);

  return {
    empty: {
      trulyEmpty,
      nameOnly,
      total: trulyEmpty + nameOnly
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
  const includeTypes = types && types.length > 0
    ? types
    : ['truly_empty', 'name_only'] as EmptyContactType[];

  const results: CleanupContact[] = [];
  let totalCount = 0;

  // Calculate totals and gather contacts based on type filters
  if (includeTypes.includes('truly_empty')) {
    const trulyEmptyTotal = countTrulyEmptyContacts(db);
    totalCount += trulyEmptyTotal;
  }
  if (includeTypes.includes('name_only')) {
    const nameOnlyTotal = countNameOnlyContacts(db);
    totalCount += nameOnlyTotal;
  }

  // For pagination, we need to handle the union of both types
  // Simple approach: get from each type and combine
  let remaining = limit;
  let currentOffset = offset;

  if (includeTypes.includes('truly_empty') && remaining > 0) {
    const trulyEmptyCount = countTrulyEmptyContacts(db);
    if (currentOffset < trulyEmptyCount) {
      const ids = findTrulyEmptyContactIds(db, remaining, currentOffset);
      const contacts = getContactDetails(db, ids);
      for (const contact of contacts) {
        results.push({
          ...contact,
          issueType: 'truly_empty',
          issueDetails: 'No name or contact information'
        });
      }
      remaining -= ids.length;
      currentOffset = 0;
    } else {
      currentOffset -= trulyEmptyCount;
    }
  }

  if (includeTypes.includes('name_only') && remaining > 0) {
    const ids = findNameOnlyContactIds(db, remaining, currentOffset);
    const contacts = getContactDetails(db, ids);
    for (const contact of contacts) {
      results.push({
        ...contact,
        issueType: 'name_only',
        issueDetails: 'Has name but no contact information'
      });
    }
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
  const includeTypes = types && types.length > 0
    ? types
    : ['truly_empty', 'name_only'] as EmptyContactType[];

  const results: number[] = [];

  if (includeTypes.includes('truly_empty')) {
    const rows = db.prepare(`
      SELECT c.id
      FROM contacts c
      LEFT JOIN contact_emails ce ON ce.contact_id = c.id
      LEFT JOIN contact_phones cp ON cp.contact_id = c.id
      LEFT JOIN contact_addresses ca ON ca.contact_id = c.id
      LEFT JOIN contact_social_profiles csp ON csp.contact_id = c.id
      WHERE (c.display_name IS NULL OR TRIM(c.display_name) = '')
        AND ce.id IS NULL
        AND cp.id IS NULL
        AND ca.id IS NULL
        AND csp.id IS NULL
        AND c.archived_at IS NULL
      ORDER BY c.id
    `).all() as Array<{ id: number }>;
    results.push(...rows.map(r => r.id));
  }

  if (includeTypes.includes('name_only')) {
    const rows = db.prepare(`
      SELECT c.id
      FROM contacts c
      LEFT JOIN contact_emails ce ON ce.contact_id = c.id
      LEFT JOIN contact_phones cp ON cp.contact_id = c.id
      LEFT JOIN contact_addresses ca ON ca.contact_id = c.id
      LEFT JOIN contact_social_profiles csp ON csp.contact_id = c.id
      WHERE c.display_name IS NOT NULL AND TRIM(c.display_name) != ''
        AND ce.id IS NULL
        AND cp.id IS NULL
        AND ca.id IS NULL
        AND csp.id IS NULL
        AND (c.company IS NULL OR TRIM(c.company) = '')
        AND (c.title IS NULL OR TRIM(c.title) = '')
        AND (c.notes IS NULL OR TRIM(c.notes) = '')
        AND c.archived_at IS NULL
      ORDER BY c.display_name
    `).all() as Array<{ id: number }>;
    results.push(...rows.map(r => r.id));
  }

  return results;
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

    // Delete from FTS tables
    db.prepare(`DELETE FROM contacts_fts WHERE rowid IN (${placeholders})`).run(...contactIds);
    deleteContactsFromSearch(db, contactIds);

    // Delete contacts
    const result = db.prepare(`DELETE FROM contacts WHERE id IN (${placeholders})`).run(...contactIds);
    return result.changes;
  });

  const deletedCount = deleteInTransaction();
  return { deletedCount };
}
