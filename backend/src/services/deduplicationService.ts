import type { Database as DatabaseType } from 'better-sqlite3';
import type { DeduplicationMode, ConfidenceLevel } from '../schemas/duplicates.js';
import type { ContactDetail, DuplicateGroup, ContactSocialProfile } from '../types/index.js';
import { getPhotoUrl } from './photoProcessor.js';
import { namesMatch } from './nameMatchingService.js';
import {
  countCrossContactDuplicates,
  findCrossContactDuplicates,
  findAllCrossContactGroups
} from './socialLinksCleanupService.js';

interface DuplicateMatch {
  matchValue: string;
  contactIds: string;
}

function findEmailDuplicates(db: DatabaseType, limit: number, offset: number): DuplicateMatch[] {
  return db.prepare(`
    SELECT LOWER(e.email) as matchValue, GROUP_CONCAT(DISTINCT e.contact_id) as contactIds
    FROM contact_emails e
    JOIN contacts c ON e.contact_id = c.id
    WHERE c.archived_at IS NULL
    GROUP BY LOWER(e.email)
    HAVING COUNT(DISTINCT e.contact_id) > 1
    ORDER BY COUNT(DISTINCT e.contact_id) DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as DuplicateMatch[];
}

function findPhoneDuplicates(db: DatabaseType, limit: number, offset: number): DuplicateMatch[] {
  return db.prepare(`
    SELECT p.phone as matchValue, GROUP_CONCAT(DISTINCT p.contact_id) as contactIds
    FROM contact_phones p
    JOIN contacts c ON p.contact_id = c.id
    WHERE p.phone != '' AND c.archived_at IS NULL
    GROUP BY p.phone
    HAVING COUNT(DISTINCT p.contact_id) > 1
    ORDER BY COUNT(DISTINCT p.contact_id) DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as DuplicateMatch[];
}

function findAddressDuplicates(db: DatabaseType, limit: number, offset: number): DuplicateMatch[] {
  return db.prepare(`
    SELECT
      LOWER(COALESCE(a.street, '')) || '|' || LOWER(COALESCE(a.city, '')) || '|' || LOWER(COALESCE(a.postal_code, '')) as matchValue,
      GROUP_CONCAT(DISTINCT a.contact_id) as contactIds
    FROM contact_addresses a
    JOIN contacts c ON a.contact_id = c.id
    WHERE a.street IS NOT NULL AND a.street != '' AND a.city IS NOT NULL AND a.city != ''
      AND c.archived_at IS NULL
    GROUP BY LOWER(a.street), LOWER(a.city), LOWER(a.postal_code)
    HAVING COUNT(DISTINCT a.contact_id) > 1
    ORDER BY COUNT(DISTINCT a.contact_id) DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as DuplicateMatch[];
}


function countEmailDuplicateGroups(db: DatabaseType): number {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM (
      SELECT 1
      FROM contact_emails e
      JOIN contacts c ON e.contact_id = c.id
      WHERE c.archived_at IS NULL
      GROUP BY LOWER(e.email)
      HAVING COUNT(DISTINCT e.contact_id) > 1
    )
  `).get() as { count: number };
  return result.count;
}

function countPhoneDuplicateGroups(db: DatabaseType): number {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM (
      SELECT 1
      FROM contact_phones p
      JOIN contacts c ON p.contact_id = c.id
      WHERE p.phone != '' AND c.archived_at IS NULL
      GROUP BY p.phone
      HAVING COUNT(DISTINCT p.contact_id) > 1
    )
  `).get() as { count: number };
  return result.count;
}

function countAddressDuplicateGroups(db: DatabaseType): number {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM (
      SELECT 1
      FROM contact_addresses a
      JOIN contacts c ON a.contact_id = c.id
      WHERE a.street IS NOT NULL AND a.street != '' AND a.city IS NOT NULL AND a.city != ''
        AND c.archived_at IS NULL
      GROUP BY LOWER(a.street), LOWER(a.city), LOWER(a.postal_code)
      HAVING COUNT(DISTINCT a.contact_id) > 1
    )
  `).get() as { count: number };
  return result.count;
}


// ============================================================
// Recommended Duplicates Algorithm
// ============================================================

interface ContactMatchData {
  id: number;
  displayName: string;
  emails: string[];
  phones: string[];
  socials: string[]; // format: "platform:username"
}

interface CandidatePair {
  contactId1: number;
  contactId2: number;
  score: number;
  matchedCriteria: string[];
  hasEmailMatch: boolean;
  hasPhoneMatch: boolean;
  hasSocialMatch: boolean;
  hasNameMatch: boolean;
}

interface ScoredGroup {
  contactIds: number[];
  confidence: ConfidenceLevel;
  matchedCriteria: string[];
  score: number;
}

/**
 * Union-Find data structure for grouping connected contacts
 */
class UnionFind {
  private parent: Map<number, number> = new Map();
  private rank: Map<number, number> = new Map();

  find(x: number): number {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(x: number, y: number): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;

    const rankX = this.rank.get(rootX)!;
    const rankY = this.rank.get(rootY)!;

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }

  getGroups(): Map<number, number[]> {
    const groups = new Map<number, number[]>();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(id);
    }
    return groups;
  }
}

/**
 * Load all contact data needed for duplicate detection
 */
function loadContactMatchData(db: DatabaseType): Map<number, ContactMatchData> {
  const contacts = new Map<number, ContactMatchData>();

  // Load basic contact info (excluding archived contacts)
  const contactRows = db.prepare(`
    SELECT id, display_name as displayName FROM contacts WHERE archived_at IS NULL
  `).all() as Array<{ id: number; displayName: string }>;

  for (const row of contactRows) {
    contacts.set(row.id, {
      id: row.id,
      displayName: row.displayName,
      emails: [],
      phones: [],
      socials: []
    });
  }

  // Load emails (only for non-archived contacts)
  const emailRows = db.prepare(`
    SELECT e.contact_id, LOWER(e.email) as email
    FROM contact_emails e
    JOIN contacts c ON e.contact_id = c.id
    WHERE c.archived_at IS NULL
  `).all() as Array<{ contact_id: number; email: string }>;

  for (const row of emailRows) {
    const contact = contacts.get(row.contact_id);
    if (contact) {
      contact.emails.push(row.email);
    }
  }

  // Load phones (normalized, only for non-archived contacts)
  const phoneRows = db.prepare(`
    SELECT p.contact_id, p.phone
    FROM contact_phones p
    JOIN contacts c ON p.contact_id = c.id
    WHERE p.phone != '' AND c.archived_at IS NULL
  `).all() as Array<{ contact_id: number; phone: string }>;

  for (const row of phoneRows) {
    const contact = contacts.get(row.contact_id);
    if (contact) {
      contact.phones.push(row.phone);
    }
  }

  // Load social profiles (only for non-archived contacts)
  const socialRows = db.prepare(`
    SELECT s.contact_id, LOWER(s.platform) || ':' || LOWER(s.username) as social
    FROM contact_social_profiles s
    JOIN contacts c ON s.contact_id = c.id
    WHERE c.archived_at IS NULL
  `).all() as Array<{ contact_id: number; social: string }>;

  for (const row of socialRows) {
    const contact = contacts.get(row.contact_id);
    if (contact) {
      contact.socials.push(row.social);
    }
  }

  return contacts;
}

/**
 * Build candidate pairs by finding contacts sharing at least one exact field
 */
function buildCandidatePairs(contacts: Map<number, ContactMatchData>): CandidatePair[] {
  const pairs = new Map<string, CandidatePair>();

  // Helper to create a pair key
  const pairKey = (id1: number, id2: number): string => {
    const [a, b] = id1 < id2 ? [id1, id2] : [id2, id1];
    return `${a}-${b}`;
  };

  // Helper to get or create a pair
  const getOrCreatePair = (id1: number, id2: number): CandidatePair => {
    const key = pairKey(id1, id2);
    if (!pairs.has(key)) {
      const [a, b] = id1 < id2 ? [id1, id2] : [id2, id1];
      pairs.set(key, {
        contactId1: a,
        contactId2: b,
        score: 0,
        matchedCriteria: [],
        hasEmailMatch: false,
        hasPhoneMatch: false,
        hasSocialMatch: false,
        hasNameMatch: false
      });
    }
    return pairs.get(key)!;
  };

  // Build indexes for fast lookup
  const emailIndex = new Map<string, number[]>();
  const phoneIndex = new Map<string, number[]>();
  const socialIndex = new Map<string, number[]>();

  for (const contact of contacts.values()) {
    for (const email of contact.emails) {
      if (!emailIndex.has(email)) emailIndex.set(email, []);
      emailIndex.get(email)!.push(contact.id);
    }
    for (const phone of contact.phones) {
      if (!phoneIndex.has(phone)) phoneIndex.set(phone, []);
      phoneIndex.get(phone)!.push(contact.id);
    }
    for (const social of contact.socials) {
      if (!socialIndex.has(social)) socialIndex.set(social, []);
      socialIndex.get(social)!.push(contact.id);
    }
  }

  // Find pairs sharing emails
  for (const [email, contactIds] of emailIndex) {
    if (contactIds.length > 1) {
      for (let i = 0; i < contactIds.length; i++) {
        for (let j = i + 1; j < contactIds.length; j++) {
          const pair = getOrCreatePair(contactIds[i], contactIds[j]);
          if (!pair.hasEmailMatch) {
            pair.hasEmailMatch = true;
            pair.score += 1;
            pair.matchedCriteria.push(`email:${email}`);
          }
        }
      }
    }
  }

  // Find pairs sharing phones
  for (const [phone, contactIds] of phoneIndex) {
    if (contactIds.length > 1) {
      for (let i = 0; i < contactIds.length; i++) {
        for (let j = i + 1; j < contactIds.length; j++) {
          const pair = getOrCreatePair(contactIds[i], contactIds[j]);
          if (!pair.hasPhoneMatch) {
            pair.hasPhoneMatch = true;
            pair.score += 1;
            pair.matchedCriteria.push(`phone:${phone}`);
          }
        }
      }
    }
  }

  // Find pairs sharing social profiles
  for (const [social, contactIds] of socialIndex) {
    if (contactIds.length > 1) {
      for (let i = 0; i < contactIds.length; i++) {
        for (let j = i + 1; j < contactIds.length; j++) {
          const pair = getOrCreatePair(contactIds[i], contactIds[j]);
          if (!pair.hasSocialMatch) {
            pair.hasSocialMatch = true;
            pair.score += 1;
            pair.matchedCriteria.push(`social:${social}`);
          }
        }
      }
    }
  }

  // Check for name matches in existing pairs
  for (const pair of pairs.values()) {
    const contact1 = contacts.get(pair.contactId1)!;
    const contact2 = contacts.get(pair.contactId2)!;
    if (namesMatch(contact1.displayName, contact2.displayName)) {
      pair.hasNameMatch = true;
      pair.score += 1;
      pair.matchedCriteria.push('name');
    }
  }

  return Array.from(pairs.values());
}

/**
 * Determine confidence level based on score and match types
 */
function determineConfidence(pair: CandidatePair): ConfidenceLevel | null {
  // Very High: 3+ matching fields OR email + phone match
  if (pair.score >= 3) {
    return 'very_high';
  }
  if (pair.hasEmailMatch && pair.hasPhoneMatch) {
    return 'very_high';
  }

  // High: 2 matching fields
  if (pair.score >= 2) {
    return 'high';
  }

  // Medium: 1 exact match + fuzzy name match
  const exactMatches = (pair.hasEmailMatch ? 1 : 0) +
                       (pair.hasPhoneMatch ? 1 : 0) +
                       (pair.hasSocialMatch ? 1 : 0);
  if (exactMatches >= 1 && pair.hasNameMatch) {
    return 'medium';
  }

  // Doesn't meet any confidence threshold
  return null;
}

/**
 * Group connected contacts using union-find and assign confidence levels
 */
function groupConnectedContacts(pairs: CandidatePair[]): ScoredGroup[] {
  const uf = new UnionFind();
  const groupMetadata = new Map<string, {
    confidence: ConfidenceLevel;
    matchedCriteria: Set<string>;
    maxScore: number
  }>();

  // Process pairs and build groups
  for (const pair of pairs) {
    const confidence = determineConfidence(pair);
    if (confidence === null) continue;

    uf.union(pair.contactId1, pair.contactId2);

    // Track metadata for this pair
    const key = `${pair.contactId1}-${pair.contactId2}`;
    groupMetadata.set(key, {
      confidence,
      matchedCriteria: new Set(pair.matchedCriteria),
      maxScore: pair.score
    });
  }

  // Get connected groups
  const connectedGroups = uf.getGroups();

  // Build final scored groups
  const scoredGroups: ScoredGroup[] = [];

  for (const [, contactIds] of connectedGroups) {
    if (contactIds.length < 2) continue;

    // Find the best confidence and all matched criteria for this group
    let bestConfidence: ConfidenceLevel = 'medium';
    let maxScore = 0;
    const allCriteria = new Set<string>();

    // Check all pairs within this group
    for (let i = 0; i < contactIds.length; i++) {
      for (let j = i + 1; j < contactIds.length; j++) {
        const id1 = Math.min(contactIds[i], contactIds[j]);
        const id2 = Math.max(contactIds[i], contactIds[j]);
        const key = `${id1}-${id2}`;
        const metadata = groupMetadata.get(key);
        if (metadata) {
          // Update best confidence (very_high > high > medium)
          if (metadata.confidence === 'very_high') {
            bestConfidence = 'very_high';
          } else if (metadata.confidence === 'high' && bestConfidence !== 'very_high') {
            bestConfidence = 'high';
          }
          // Track max score
          if (metadata.maxScore > maxScore) {
            maxScore = metadata.maxScore;
          }
          // Collect all criteria
          for (const c of metadata.matchedCriteria) {
            allCriteria.add(c);
          }
        }
      }
    }

    scoredGroups.push({
      contactIds: contactIds.sort((a, b) => a - b),
      confidence: bestConfidence,
      matchedCriteria: Array.from(allCriteria),
      score: maxScore
    });
  }

  return scoredGroups;
}

/**
 * Sort groups by confidence tier and group size
 */
function sortGroups(groups: ScoredGroup[]): ScoredGroup[] {
  const confidenceOrder: Record<ConfidenceLevel, number> = {
    'very_high': 0,
    'high': 1,
    'medium': 2
  };

  return groups.sort((a, b) => {
    // First by confidence (very_high first)
    const confDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    if (confDiff !== 0) return confDiff;

    // Then by group size (larger first)
    const sizeDiff = b.contactIds.length - a.contactIds.length;
    if (sizeDiff !== 0) return sizeDiff;

    // Then by score (higher first)
    return b.score - a.score;
  });
}

/**
 * Count recommended duplicate groups by confidence level
 */
export function countRecommendedDuplicateGroups(db: DatabaseType): {
  veryHigh: number;
  high: number;
  medium: number;
  total: number
} {
  const contacts = loadContactMatchData(db);
  const pairs = buildCandidatePairs(contacts);
  const groups = groupConnectedContacts(pairs);

  const counts = {
    veryHigh: 0,
    high: 0,
    medium: 0,
    total: 0
  };

  for (const group of groups) {
    counts.total++;
    switch (group.confidence) {
      case 'very_high':
        counts.veryHigh++;
        break;
      case 'high':
        counts.high++;
        break;
      case 'medium':
        counts.medium++;
        break;
    }
  }

  return counts;
}

/**
 * Get recommended duplicate groups with pagination and optional confidence filtering
 */
export function getRecommendedDuplicates(
  db: DatabaseType,
  confidenceLevels: string[] | undefined,
  limit: number,
  offset: number
): { groups: DuplicateGroup[]; totalGroups: number } {
  const contacts = loadContactMatchData(db);
  const pairs = buildCandidatePairs(contacts);
  let groups = groupConnectedContacts(pairs);

  // Filter by confidence levels if specified
  if (confidenceLevels && confidenceLevels.length > 0) {
    groups = groups.filter(g => confidenceLevels.includes(g.confidence));
  }

  // Sort groups
  const sortedGroups = sortGroups(groups);
  const totalGroups = sortedGroups.length;

  // Apply pagination
  const paginatedGroups = sortedGroups.slice(offset, offset + limit);

  // Convert to DuplicateGroup format with full contact details
  const duplicateGroups: DuplicateGroup[] = paginatedGroups.map((group, index) => {
    const contactDetails = getContactDetails(db, group.contactIds);

    // Create a readable matching value from criteria
    const matchingValue = group.matchedCriteria.join(', ');

    return {
      id: `recommended-${offset + index}-${group.contactIds.join('-')}`,
      matchingValue,
      matchingField: 'recommended' as DeduplicationMode,
      contacts: contactDetails,
      confidence: group.confidence,
      matchedCriteria: group.matchedCriteria
    };
  });

  return { groups: duplicateGroups, totalGroups };
}

export function getDuplicateSummary(database: DatabaseType): {
  email: number;
  phone: number;
  address: number;
  socialLinks: number;
  recommended: { veryHigh: number; high: number; medium: number; total: number };
} {
  return {
    email: countEmailDuplicateGroups(database),
    phone: countPhoneDuplicateGroups(database),
    address: countAddressDuplicateGroups(database),
    socialLinks: countCrossContactDuplicates(database),
    recommended: countRecommendedDuplicateGroups(database)
  };
}

function getContactDetails(db: DatabaseType, contactIds: number[]): ContactDetail[] {
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

export interface DuplicateGroupLight {
  id: string;
  contactIds: number[];
  primaryContactId: number;
}

/**
 * Get all duplicate group IDs without full contact details (for bulk operations)
 */
export function getAllDuplicateGroupIds(
  database: DatabaseType,
  mode: DeduplicationMode,
  confidenceLevels?: string[]
): { groups: DuplicateGroupLight[]; totalGroups: number } {
  if (mode === 'recommended') {
    // Use the existing recommended logic but extract only IDs
    const contacts = loadContactMatchData(database);
    const pairs = buildCandidatePairs(contacts);
    let groups = groupConnectedContacts(pairs);

    // Filter by confidence levels if specified
    if (confidenceLevels && confidenceLevels.length > 0) {
      groups = groups.filter(g => confidenceLevels.includes(g.confidence));
    }

    // Sort groups
    const sortedGroups = sortGroups(groups);

    // Convert to lightweight format
    const lightGroups: DuplicateGroupLight[] = sortedGroups.map((group, index) => ({
      id: `recommended-${index}-${group.contactIds.join('-')}`,
      contactIds: group.contactIds,
      primaryContactId: group.contactIds[0]
    }));

    return { groups: lightGroups, totalGroups: lightGroups.length };
  }

  // Handle social-links mode separately (uses different data structure)
  if (mode === 'social-links') {
    const result = findAllCrossContactGroups(database);
    const lightGroups: DuplicateGroupLight[] = result.groups.map(g => ({
      id: g.id,
      contactIds: g.contactIds,
      primaryContactId: g.primaryContactId
    }));
    return { groups: lightGroups, totalGroups: result.totalGroups };
  }

  // For simple modes (email, phone, address), fetch all matches without pagination
  let allMatches: DuplicateMatch[];

  switch (mode) {
    case 'email':
      allMatches = findEmailDuplicatesAll(database);
      break;
    case 'phone':
      allMatches = findPhoneDuplicatesAll(database);
      break;
    case 'address':
      allMatches = findAddressDuplicatesAll(database);
      break;
  }

  const lightGroups: DuplicateGroupLight[] = allMatches.map(match => {
    const contactIds = match.contactIds.split(',').map(id => parseInt(id, 10));
    return {
      id: Buffer.from(match.matchValue).toString('base64'),
      contactIds,
      primaryContactId: contactIds[0]
    };
  });

  return { groups: lightGroups, totalGroups: lightGroups.length };
}

// Helper functions to fetch all matches without pagination (for bulk operations)
function findEmailDuplicatesAll(db: DatabaseType): DuplicateMatch[] {
  return db.prepare(`
    SELECT LOWER(e.email) as matchValue, GROUP_CONCAT(DISTINCT e.contact_id) as contactIds
    FROM contact_emails e
    JOIN contacts c ON e.contact_id = c.id
    WHERE c.archived_at IS NULL
    GROUP BY LOWER(e.email)
    HAVING COUNT(DISTINCT e.contact_id) > 1
    ORDER BY COUNT(DISTINCT e.contact_id) DESC
  `).all() as DuplicateMatch[];
}

function findPhoneDuplicatesAll(db: DatabaseType): DuplicateMatch[] {
  return db.prepare(`
    SELECT p.phone as matchValue, GROUP_CONCAT(DISTINCT p.contact_id) as contactIds
    FROM contact_phones p
    JOIN contacts c ON p.contact_id = c.id
    WHERE p.phone != '' AND c.archived_at IS NULL
    GROUP BY p.phone
    HAVING COUNT(DISTINCT p.contact_id) > 1
    ORDER BY COUNT(DISTINCT p.contact_id) DESC
  `).all() as DuplicateMatch[];
}

function findAddressDuplicatesAll(db: DatabaseType): DuplicateMatch[] {
  return db.prepare(`
    SELECT
      LOWER(COALESCE(a.street, '')) || '|' || LOWER(COALESCE(a.city, '')) || '|' || LOWER(COALESCE(a.postal_code, '')) as matchValue,
      GROUP_CONCAT(DISTINCT a.contact_id) as contactIds
    FROM contact_addresses a
    JOIN contacts c ON a.contact_id = c.id
    WHERE a.street IS NOT NULL AND a.street != '' AND a.city IS NOT NULL AND a.city != ''
      AND c.archived_at IS NULL
    GROUP BY LOWER(a.street), LOWER(a.city), LOWER(a.postal_code)
    HAVING COUNT(DISTINCT a.contact_id) > 1
    ORDER BY COUNT(DISTINCT a.contact_id) DESC
  `).all() as DuplicateMatch[];
}


export function findDuplicates(
  database: DatabaseType,
  mode: DeduplicationMode,
  limit: number,
  offset: number,
  confidenceLevels?: string[]
): { groups: DuplicateGroup[]; totalGroups: number } {
  // Handle recommended mode separately
  if (mode === 'recommended') {
    return getRecommendedDuplicates(database, confidenceLevels, limit, offset);
  }

  // Handle social-links mode separately (uses different service)
  if (mode === 'social-links') {
    const result = findCrossContactDuplicates(database, limit, offset);
    // Update matchingField to 'social-links' instead of 'social'
    const groups = result.groups.map(g => ({
      ...g,
      matchingField: 'social-links' as const
    }));
    return { groups, totalGroups: result.totalGroups };
  }

  let matches: DuplicateMatch[];
  let totalGroups: number;

  switch (mode) {
    case 'email':
      matches = findEmailDuplicates(database, limit, offset);
      totalGroups = countEmailDuplicateGroups(database);
      break;
    case 'phone':
      matches = findPhoneDuplicates(database, limit, offset);
      totalGroups = countPhoneDuplicateGroups(database);
      break;
    case 'address':
      matches = findAddressDuplicates(database, limit, offset);
      totalGroups = countAddressDuplicateGroups(database);
      break;
  }

  const groups: DuplicateGroup[] = matches.map(match => {
    const contactIds = match.contactIds.split(',').map(id => parseInt(id, 10));
    const contacts = getContactDetails(database, contactIds);

    return {
      id: Buffer.from(match.matchValue).toString('base64'),
      matchingValue: match.matchValue,
      matchingField: mode,
      contacts
    };
  });

  return { groups, totalGroups };
}
