import { getDatabase } from './database.js';
import { getPhotoUrl } from './photoProcessor.js';
import { geocodeAddress, isGeocodingConfigured } from './geocoding.js';

// ============================================================
// Types
// ============================================================

export interface AddressRecord {
  id: number;
  contactId: number;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  type: string | null;
}

export interface AddressWithIssues extends AddressRecord {
  isRecommended: boolean;
  issues: ('no_street' | 'duplicate')[];
}

export interface AddressGroup {
  fingerprint: string;
  addresses: AddressWithIssues[];
}

export interface AddressCleanupContact {
  id: number;
  displayName: string;
  company: string | null;
  photoHash: string | null;
  photoUrl: string | null;
  addressGroups: AddressGroup[];
}

export interface AddressCleanupSummary {
  noStreetCount: number;
  duplicateCount: number;
  totalContacts: number;
}

export interface AddressFix {
  contactId: number;
  keepAddressIds: number[];
  removeAddressIds: number[];
}

export interface AddressFixResult {
  fixed: number;
  removed: number;
}

// Normalize types
export type JunkIssueType = 'no_street' | 'empty' | 'placeholder' | 'missing_street';

export interface JunkAddress extends AddressRecord {
  issue: JunkIssueType;
}

export interface NormalizeContact {
  id: number;
  displayName: string;
  company: string | null;
  photoUrl: string | null;
  junkAddresses: JunkAddress[];
}

export interface NormalizeSummary {
  junkCount: number;
  totalContacts: number;
}

export interface NormalizeFixResult {
  removed: number;
}

// Duplicates types
export interface DuplicatesContact {
  id: number;
  displayName: string;
  company: string | null;
  photoHash: string | null;
  photoUrl: string | null;
  addressGroups: AddressGroup[];
}

export interface DuplicatesSummary {
  duplicateCount: number;
  totalContacts: number;
}

// ============================================================
// Fingerprinting
// ============================================================

// Stop words to remove from fingerprint
const STOP_WORDS = new Set([
  'no', 'street', 'str', 'st', 'road', 'rd', 'avenue', 'ave', 'drive', 'dr',
  'lane', 'ln', 'court', 'ct', 'place', 'pl', 'boulevard', 'blvd', 'way',
  'circle', 'cir', 'terrace', 'ter', 'trail', 'trl', 'parkway', 'pkwy',
  'highway', 'hwy', 'apt', 'apartment', 'unit', 'suite', 'ste', 'floor', 'fl',
  'building', 'bldg', 'room', 'rm', 'box', 'po', 'p.o.', 'stock', 'etage'
]);

/**
 * Extract all numbers from a string
 */
function extractNumbers(text: string): string[] {
  const matches = text.match(/\d+/g);
  return matches || [];
}

/**
 * Extract significant words (lowercase, no stop words)
 */
function extractWords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')  // Keep letters and numbers, replace others with space
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
  return words;
}

/**
 * Create a fingerprint for an address
 * Fingerprint = sorted set of (numbers + significant words)
 */
export function createFingerprint(address: AddressRecord): string {
  const parts: string[] = [];

  // Combine all address fields
  const fullText = [
    address.street,
    address.city,
    address.state,
    address.postalCode,
    address.country
  ].filter(Boolean).join(' ');

  if (!fullText.trim()) {
    return '';
  }

  // Extract numbers and words
  const numbers = extractNumbers(fullText);
  const words = extractWords(fullText);

  // Combine and dedupe
  const allParts = [...new Set([...numbers, ...words])];

  // Sort for consistent fingerprint
  allParts.sort();

  return allParts.join('|');
}

/**
 * Check if an address has a "No street" artifact
 */
function hasNoStreetArtifact(address: AddressRecord): boolean {
  if (!address.street) return false;

  const street = address.street.toLowerCase().trim();

  // Check for various "no street" patterns
  const noStreetPatterns = [
    /^no\s+street$/i,
    /^no\s+str$/i,
    /^\.\s*$/,
    /^-+$/,
    /^n\/a$/i,
    /^none$/i,
    /^unknown$/i,
  ];

  return noStreetPatterns.some(pattern => pattern.test(street));
}

/**
 * Check if a string is a placeholder value
 */
function isPlaceholderValue(value: string | null): boolean {
  if (!value) return false;
  const v = value.toLowerCase().trim();
  const placeholderPatterns = [
    /^n\/a$/i,
    /^none$/i,
    /^unknown$/i,
    /^-+$/,
    /^\.\s*$/,
    /^\.+$/,
    /^x+$/i,
    /^tbd$/i,
    /^null$/i,
  ];
  return placeholderPatterns.some(pattern => pattern.test(v));
}

/**
 * Check if an address is completely empty (all fields null or empty)
 */
function isEmptyAddress(address: AddressRecord): boolean {
  const fields = [address.street, address.city, address.state, address.postalCode, address.country];
  return fields.every(f => !f || f.trim() === '');
}

/**
 * Check if an address has only placeholder values (no real data)
 */
function isPlaceholderOnlyAddress(address: AddressRecord): boolean {
  const fields = [address.street, address.city, address.state, address.postalCode, address.country];
  const nonEmptyFields = fields.filter(f => f && f.trim() !== '');
  if (nonEmptyFields.length === 0) return false; // Empty, not placeholder
  return nonEmptyFields.every(f => isPlaceholderValue(f));
}

/**
 * Check if an address is missing street but has other populated fields
 */
function isMissingStreet(address: AddressRecord): boolean {
  // Street is null/empty
  if (address.street && address.street.trim() !== '') return false;

  // But has at least one other populated field
  const otherFields = [address.city, address.state, address.postalCode, address.country];
  return otherFields.some(f => f && f.trim() !== '');
}

/**
 * Detect what kind of junk issue an address has, if any
 */
function detectJunkIssue(address: AddressRecord): JunkIssueType | null {
  if (isEmptyAddress(address)) {
    return 'empty';
  }
  if (hasNoStreetArtifact(address)) {
    return 'no_street';
  }
  if (isPlaceholderOnlyAddress(address)) {
    return 'placeholder';
  }
  if (isMissingStreet(address)) {
    return 'missing_street';
  }
  return null;
}

/**
 * Count populated fields in an address
 */
function countPopulatedFields(address: AddressRecord): number {
  let count = 0;
  if (address.street && !hasNoStreetArtifact(address)) count++;
  if (address.city) count++;
  if (address.state) count++;
  if (address.postalCode) count++;
  if (address.country) count++;
  return count;
}

/**
 * Score an address for "best" selection
 * Higher score = better address
 */
function scoreAddress(address: AddressRecord): number {
  let score = 0;

  // Has postal code = +10
  if (address.postalCode) score += 10;

  // Populated fields count
  score += countPopulatedFields(address) * 2;

  // Street length (more detail = better)
  if (address.street) {
    score += Math.min(address.street.length, 50) / 10;
  }

  // Penalize "no street" artifacts
  if (hasNoStreetArtifact(address)) {
    score -= 20;
  }

  return score;
}

// ============================================================
// Core Detection Logic
// ============================================================

/**
 * Get all addresses grouped by contact
 */
function getAddressesByContact(): Map<number, AddressRecord[]> {
  const db = getDatabase();

  const addresses = db.prepare(`
    SELECT
      a.id,
      a.contact_id as contactId,
      a.street,
      a.city,
      a.state,
      a.postal_code as postalCode,
      a.country,
      a.type
    FROM contact_addresses a
    JOIN contacts c ON a.contact_id = c.id
    WHERE c.archived_at IS NULL
    ORDER BY a.contact_id, a.id
  `).all() as AddressRecord[];

  const byContact = new Map<number, AddressRecord[]>();
  for (const addr of addresses) {
    if (!byContact.has(addr.contactId)) {
      byContact.set(addr.contactId, []);
    }
    byContact.get(addr.contactId)!.push(addr);
  }

  return byContact;
}

/**
 * Find contacts with address issues (no street or duplicates)
 */
export function findAddressIssues(
  limit: number,
  offset: number
): { contacts: AddressCleanupContact[]; total: number } {
  const db = getDatabase();
  const addressesByContact = getAddressesByContact();

  // Process each contact to find issues
  const contactsWithIssues: AddressCleanupContact[] = [];

  for (const [contactId, addresses] of addressesByContact) {
    const addressGroups: AddressGroup[] = [];
    const fingerprints = new Map<string, AddressWithIssues[]>();

    // Group addresses by fingerprint
    for (const addr of addresses) {
      const fp = createFingerprint(addr);
      const issues: ('no_street' | 'duplicate')[] = [];

      if (hasNoStreetArtifact(addr)) {
        issues.push('no_street');
      }

      const addrWithIssues: AddressWithIssues = {
        ...addr,
        isRecommended: false,
        issues
      };

      if (!fingerprints.has(fp)) {
        fingerprints.set(fp, []);
      }
      fingerprints.get(fp)!.push(addrWithIssues);
    }

    // Check for duplicates within fingerprint groups
    let hasIssues = false;
    for (const [fp, addrs] of fingerprints) {
      if (addrs.length > 1) {
        // Mark as duplicates
        for (const addr of addrs) {
          addr.issues.push('duplicate');
        }

        // Find the best address to recommend
        const sorted = [...addrs].sort((a, b) => scoreAddress(b) - scoreAddress(a));
        sorted[0].isRecommended = true;

        addressGroups.push({
          fingerprint: fp,
          addresses: addrs
        });
        hasIssues = true;
      } else if (addrs[0].issues.length > 0) {
        // Single address with issues (no_street)
        addressGroups.push({
          fingerprint: fp,
          addresses: addrs
        });
        hasIssues = true;
      }
    }

    if (hasIssues) {
      // Fetch contact details
      const contact = db.prepare(`
        SELECT id, display_name as displayName, company, photo_hash as photoHash
        FROM contacts
        WHERE id = ?
      `).get(contactId) as { id: number; displayName: string; company: string | null; photoHash: string | null };

      contactsWithIssues.push({
        ...contact,
        photoUrl: getPhotoUrl(contact.photoHash, 'small'),
        addressGroups
      });
    }
  }

  // Sort by display name
  contactsWithIssues.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const total = contactsWithIssues.length;
  const paginated = contactsWithIssues.slice(offset, offset + limit);

  return { contacts: paginated, total };
}

/**
 * Get summary of address cleanup issues
 */
export function getAddressCleanupSummary(): AddressCleanupSummary {
  // Aggregate counts from all sub-tabs
  const normalizeSummary = getNormalizeSummary();
  const duplicatesSummary = getDuplicatesSummary();
  const geocodingSummary = getGeocodingSummary();

  return {
    noStreetCount: normalizeSummary.junkCount,
    duplicateCount: duplicatesSummary.duplicateCount,
    totalContacts: normalizeSummary.junkCount + duplicatesSummary.duplicateCount + geocodingSummary.pending
  };
}

/**
 * Apply address fixes - keep selected addresses, remove others
 */
export function applyAddressFixes(fixes: AddressFix[]): AddressFixResult {
  const db = getDatabase();

  let fixed = 0;
  let removed = 0;

  const deleteStmt = db.prepare('DELETE FROM contact_addresses WHERE id = ?');

  const transaction = db.transaction(() => {
    for (const fix of fixes) {
      // Remove addresses that are not in the keep list
      for (const addressId of fix.removeAddressIds) {
        deleteStmt.run(addressId);
        removed++;
      }
      fixed++;
    }
  });

  transaction();

  return { fixed, removed };
}

/**
 * Get all contacts with address issues for bulk operations
 */
export function getAllAddressIssueContacts(): {
  contacts: Array<{
    id: number;
    keepAddressIds: number[];
    removeAddressIds: number[];
  }>;
  total: number;
} {
  const addressesByContact = getAddressesByContact();

  const results: Array<{
    id: number;
    keepAddressIds: number[];
    removeAddressIds: number[];
  }> = [];

  for (const [contactId, addresses] of addressesByContact) {
    const fingerprints = new Map<string, AddressRecord[]>();
    const keepIds: number[] = [];
    const removeIds: number[] = [];
    let hasIssues = false;

    // Group by fingerprint
    for (const addr of addresses) {
      const fp = createFingerprint(addr);
      if (!fingerprints.has(fp)) {
        fingerprints.set(fp, []);
      }
      fingerprints.get(fp)!.push(addr);
    }

    // Process each fingerprint group
    for (const [fp, addrs] of fingerprints) {
      // Check for "no street" issues in single addresses
      if (addrs.length === 1) {
        if (hasNoStreetArtifact(addrs[0])) {
          // Remove addresses with only "no street" artifact
          removeIds.push(addrs[0].id);
          hasIssues = true;
        } else {
          keepIds.push(addrs[0].id);
        }
      } else {
        // Multiple addresses with same fingerprint - duplicates
        hasIssues = true;

        // Sort by score and keep the best one
        const sorted = [...addrs].sort((a, b) => scoreAddress(b) - scoreAddress(a));
        keepIds.push(sorted[0].id);

        // Remove the rest
        for (let i = 1; i < sorted.length; i++) {
          removeIds.push(sorted[i].id);
        }
      }
    }

    if (hasIssues) {
      results.push({
        id: contactId,
        keepAddressIds: keepIds,
        removeAddressIds: removeIds
      });
    }
  }

  return { contacts: results, total: results.length };
}

// ============================================================
// Normalize Functions (Junk Address Removal)
// ============================================================

/**
 * Get summary of junk addresses for normalize tab
 */
export function getNormalizeSummary(): NormalizeSummary {
  const addressesByContact = getAddressesByContact();

  let junkCount = 0;
  const contactsWithJunk = new Set<number>();

  for (const [contactId, addresses] of addressesByContact) {
    for (const addr of addresses) {
      const issue = detectJunkIssue(addr);
      if (issue) {
        junkCount++;
        contactsWithJunk.add(contactId);
      }
    }
  }

  return {
    junkCount,
    totalContacts: contactsWithJunk.size
  };
}

/**
 * Find contacts with junk addresses
 */
export function findJunkAddresses(
  limit: number,
  offset: number
): { contacts: NormalizeContact[]; total: number } {
  const db = getDatabase();
  const addressesByContact = getAddressesByContact();

  const contactsWithJunk: NormalizeContact[] = [];

  for (const [contactId, addresses] of addressesByContact) {
    const junkAddresses: JunkAddress[] = [];

    for (const addr of addresses) {
      const issue = detectJunkIssue(addr);
      if (issue) {
        junkAddresses.push({
          ...addr,
          issue
        });
      }
    }

    if (junkAddresses.length > 0) {
      const contact = db.prepare(`
        SELECT id, display_name as displayName, company, photo_hash as photoHash
        FROM contacts
        WHERE id = ? AND archived_at IS NULL
      `).get(contactId) as { id: number; displayName: string; company: string | null; photoHash: string | null } | undefined;

      // Skip if contact not found or archived
      if (!contact) {
        continue;
      }

      contactsWithJunk.push({
        id: contact.id,
        displayName: contact.displayName,
        company: contact.company,
        photoUrl: getPhotoUrl(contact.photoHash, 'small'),
        junkAddresses
      });
    }
  }

  // Sort by display name
  contactsWithJunk.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const total = contactsWithJunk.length;
  const paginated = contactsWithJunk.slice(offset, offset + limit);

  return { contacts: paginated, total };
}

/**
 * Remove junk addresses by IDs
 */
export function removeJunkAddresses(addressIds: number[]): NormalizeFixResult {
  const db = getDatabase();

  let removed = 0;
  const deleteStmt = db.prepare('DELETE FROM contact_addresses WHERE id = ?');

  const transaction = db.transaction(() => {
    for (const addressId of addressIds) {
      deleteStmt.run(addressId);
      removed++;
    }
  });

  transaction();

  return { removed };
}

/**
 * Get all junk address IDs for bulk removal
 */
export function getAllJunkAddressIds(): number[] {
  const addressesByContact = getAddressesByContact();
  const junkIds: number[] = [];

  for (const [, addresses] of addressesByContact) {
    for (const addr of addresses) {
      const issue = detectJunkIssue(addr);
      if (issue) {
        junkIds.push(addr.id);
      }
    }
  }

  return junkIds;
}

// ============================================================
// Duplicates Functions (Within-Contact Duplicate Detection)
// ============================================================

/**
 * Get summary of duplicate addresses for duplicates tab
 */
export function getDuplicatesSummary(): DuplicatesSummary {
  const addressesByContact = getAddressesByContact();

  let duplicateCount = 0;
  const contactsWithDuplicates = new Set<number>();

  for (const [contactId, addresses] of addressesByContact) {
    const fingerprints = new Map<string, number>();

    for (const addr of addresses) {
      // Skip junk addresses - they're handled in normalize tab
      if (detectJunkIssue(addr)) continue;

      const fp = createFingerprint(addr);
      if (fp) { // Only count non-empty fingerprints
        fingerprints.set(fp, (fingerprints.get(fp) || 0) + 1);
      }
    }

    for (const count of fingerprints.values()) {
      if (count > 1) {
        duplicateCount += count - 1;
        contactsWithDuplicates.add(contactId);
      }
    }
  }

  return {
    duplicateCount,
    totalContacts: contactsWithDuplicates.size
  };
}

/**
 * Find contacts with duplicate addresses (excluding junk)
 */
export function findDuplicateAddresses(
  limit: number,
  offset: number
): { contacts: DuplicatesContact[]; total: number } {
  const db = getDatabase();
  const addressesByContact = getAddressesByContact();

  const contactsWithDuplicates: DuplicatesContact[] = [];

  for (const [contactId, addresses] of addressesByContact) {
    const addressGroups: AddressGroup[] = [];
    const fingerprints = new Map<string, AddressWithIssues[]>();

    // Group non-junk addresses by fingerprint
    for (const addr of addresses) {
      // Skip junk addresses
      if (detectJunkIssue(addr)) continue;

      const fp = createFingerprint(addr);
      if (!fp) continue; // Skip empty fingerprints

      const addrWithIssues: AddressWithIssues = {
        ...addr,
        isRecommended: false,
        issues: []
      };

      if (!fingerprints.has(fp)) {
        fingerprints.set(fp, []);
      }
      fingerprints.get(fp)!.push(addrWithIssues);
    }

    // Check for duplicates within fingerprint groups
    let hasDuplicates = false;
    for (const [fp, addrs] of fingerprints) {
      if (addrs.length > 1) {
        // Mark as duplicates
        for (const addr of addrs) {
          addr.issues.push('duplicate');
        }

        // Find the best address to recommend
        const sorted = [...addrs].sort((a, b) => scoreAddress(b) - scoreAddress(a));
        sorted[0].isRecommended = true;

        addressGroups.push({
          fingerprint: fp,
          addresses: addrs
        });
        hasDuplicates = true;
      }
    }

    if (hasDuplicates) {
      const contact = db.prepare(`
        SELECT id, display_name as displayName, company, photo_hash as photoHash
        FROM contacts
        WHERE id = ?
      `).get(contactId) as { id: number; displayName: string; company: string | null; photoHash: string | null };

      contactsWithDuplicates.push({
        ...contact,
        photoUrl: getPhotoUrl(contact.photoHash, 'small'),
        addressGroups
      });
    }
  }

  // Sort by display name
  contactsWithDuplicates.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const total = contactsWithDuplicates.length;
  const paginated = contactsWithDuplicates.slice(offset, offset + limit);

  return { contacts: paginated, total };
}

/**
 * Get all contacts with duplicate addresses for bulk operations
 */
export function getAllDuplicateContacts(): {
  contacts: Array<{
    id: number;
    keepAddressIds: number[];
    removeAddressIds: number[];
  }>;
  total: number;
} {
  const addressesByContact = getAddressesByContact();

  const results: Array<{
    id: number;
    keepAddressIds: number[];
    removeAddressIds: number[];
  }> = [];

  for (const [contactId, addresses] of addressesByContact) {
    const fingerprints = new Map<string, AddressRecord[]>();
    const keepIds: number[] = [];
    const removeIds: number[] = [];
    let hasDuplicates = false;

    // Group non-junk addresses by fingerprint
    for (const addr of addresses) {
      // Skip junk addresses
      if (detectJunkIssue(addr)) continue;

      const fp = createFingerprint(addr);
      if (!fp) continue;

      if (!fingerprints.has(fp)) {
        fingerprints.set(fp, []);
      }
      fingerprints.get(fp)!.push(addr);
    }

    // Process each fingerprint group
    for (const [, addrs] of fingerprints) {
      if (addrs.length === 1) {
        keepIds.push(addrs[0].id);
      } else {
        // Multiple addresses with same fingerprint - duplicates
        hasDuplicates = true;

        // Sort by score and keep the best one
        const sorted = [...addrs].sort((a, b) => scoreAddress(b) - scoreAddress(a));
        keepIds.push(sorted[0].id);

        // Remove the rest
        for (let i = 1; i < sorted.length; i++) {
          removeIds.push(sorted[i].id);
        }
      }
    }

    if (hasDuplicates) {
      results.push({
        id: contactId,
        keepAddressIds: keepIds,
        removeAddressIds: removeIds
      });
    }
  }

  return { contacts: results, total: results.length };
}

// ============================================================
// Geocoding Types
// ============================================================

export type GeocodingStatus = 'pending' | 'failed' | 'geocoded';

export interface GeocodingAddress {
  id: number;
  contactId: number;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  type: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodedAt: string | null;
  status: GeocodingStatus;
}

export interface GeocodingContact {
  id: number;
  displayName: string;
  company: string | null;
  photoUrl: string | null;
  addresses: GeocodingAddress[];
}

export interface GeocodingSummary {
  pending: number;
  failed: number;
  geocoded: number;
  total: number;
}

export interface GeocodingBatchResult {
  processed: number;
  successful: number;
  failed: number;
}

// ============================================================
// Geocoding Functions
// ============================================================

/**
 * Determine geocoding status for an address
 */
function getGeocodingStatus(geocodedAt: string | null, latitude: number | null, longitude: number | null): GeocodingStatus {
  if (geocodedAt === null) {
    return 'pending';
  }
  if (latitude === null || longitude === null) {
    return 'failed';
  }
  return 'geocoded';
}

/**
 * Get geocoding summary counts
 */
export function getGeocodingSummary(): GeocodingSummary {
  const db = getDatabase();

  const result = db.prepare(`
    SELECT
      COUNT(CASE WHEN geocoded_at IS NULL THEN 1 END) as pending,
      COUNT(CASE WHEN geocoded_at IS NOT NULL AND (latitude IS NULL OR longitude IS NULL) THEN 1 END) as failed,
      COUNT(CASE WHEN geocoded_at IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as geocoded,
      COUNT(*) as total
    FROM contact_addresses a
    JOIN contacts c ON a.contact_id = c.id
    WHERE c.archived_at IS NULL
  `).get() as { pending: number; failed: number; geocoded: number; total: number };

  return result;
}

/**
 * Find addresses by geocoding status
 */
export function findAddressesByGeoStatus(
  filter: GeocodingStatus | 'all',
  limit: number,
  offset: number
): { contacts: GeocodingContact[]; total: number } {
  const db = getDatabase();

  // Build WHERE clause based on filter
  let statusCondition = '';
  switch (filter) {
    case 'pending':
      statusCondition = 'AND a.geocoded_at IS NULL';
      break;
    case 'failed':
      statusCondition = 'AND a.geocoded_at IS NOT NULL AND (a.latitude IS NULL OR a.longitude IS NULL)';
      break;
    case 'geocoded':
      statusCondition = 'AND a.geocoded_at IS NOT NULL AND a.latitude IS NOT NULL AND a.longitude IS NOT NULL';
      break;
    case 'all':
    default:
      statusCondition = '';
  }

  // Get all addresses matching the filter
  const addresses = db.prepare(`
    SELECT
      a.id,
      a.contact_id as contactId,
      a.street,
      a.city,
      a.state,
      a.postal_code as postalCode,
      a.country,
      a.type,
      a.latitude,
      a.longitude,
      a.geocoded_at as geocodedAt
    FROM contact_addresses a
    JOIN contacts c ON a.contact_id = c.id
    WHERE c.archived_at IS NULL ${statusCondition}
    ORDER BY a.contact_id, a.id
  `).all() as Array<{
    id: number;
    contactId: number;
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    type: string | null;
    latitude: number | null;
    longitude: number | null;
    geocodedAt: string | null;
  }>;

  // Group addresses by contact
  const contactMap = new Map<number, GeocodingAddress[]>();
  for (const addr of addresses) {
    if (!contactMap.has(addr.contactId)) {
      contactMap.set(addr.contactId, []);
    }
    contactMap.get(addr.contactId)!.push({
      ...addr,
      status: getGeocodingStatus(addr.geocodedAt, addr.latitude, addr.longitude)
    });
  }

  // Get contact details for each unique contact
  const contactIds = Array.from(contactMap.keys());
  const totalContacts = contactIds.length;

  // Apply pagination to contact IDs
  const paginatedContactIds = contactIds.slice(offset, offset + limit);

  const contacts: GeocodingContact[] = [];
  for (const contactId of paginatedContactIds) {
    const contact = db.prepare(`
      SELECT id, display_name as displayName, company, photo_hash as photoHash
      FROM contacts
      WHERE id = ?
    `).get(contactId) as { id: number; displayName: string; company: string | null; photoHash: string | null };

    contacts.push({
      id: contact.id,
      displayName: contact.displayName,
      company: contact.company,
      photoUrl: getPhotoUrl(contact.photoHash, 'small'),
      addresses: contactMap.get(contactId)!
    });
  }

  // Sort by display name
  contacts.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return { contacts, total: totalContacts };
}

/**
 * Retry geocoding for specific address IDs
 */
export async function retryGeocoding(addressIds: number[]): Promise<GeocodingBatchResult> {
  const db = getDatabase();
  let successful = 0;
  let failed = 0;

  for (const addressId of addressIds) {
    const addr = db.prepare(`
      SELECT id, street, city, state, postal_code as postalCode, country
      FROM contact_addresses
      WHERE id = ?
    `).get(addressId) as {
      id: number;
      street: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      country: string | null;
    } | undefined;

    if (!addr) continue;

    const result = await geocodeAddress({
      street: addr.street,
      city: addr.city,
      state: addr.state,
      postalCode: addr.postalCode,
      country: addr.country
    });

    if (result) {
      db.prepare(`
        UPDATE contact_addresses
        SET latitude = ?, longitude = ?, geocoded_at = datetime('now')
        WHERE id = ?
      `).run(result.latitude, result.longitude, addressId);
      successful++;
    } else {
      db.prepare(`
        UPDATE contact_addresses
        SET latitude = NULL, longitude = NULL, geocoded_at = datetime('now')
        WHERE id = ?
      `).run(addressId);
      failed++;
    }
  }

  return {
    processed: addressIds.length,
    successful,
    failed
  };
}

/**
 * Batch geocode pending addresses
 */
export async function batchGeocode(limit: number = 50): Promise<GeocodingBatchResult> {
  const db = getDatabase();

  // Get pending addresses
  const pendingAddresses = db.prepare(`
    SELECT
      a.id,
      a.street,
      a.city,
      a.state,
      a.postal_code as postalCode,
      a.country
    FROM contact_addresses a
    JOIN contacts c ON a.contact_id = c.id
    WHERE c.archived_at IS NULL
      AND a.geocoded_at IS NULL
    LIMIT ?
  `).all(limit) as Array<{
    id: number;
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  }>;

  let successful = 0;
  let failed = 0;

  for (const addr of pendingAddresses) {
    const result = await geocodeAddress({
      street: addr.street,
      city: addr.city,
      state: addr.state,
      postalCode: addr.postalCode,
      country: addr.country
    });

    if (result) {
      db.prepare(`
        UPDATE contact_addresses
        SET latitude = ?, longitude = ?, geocoded_at = datetime('now')
        WHERE id = ?
      `).run(result.latitude, result.longitude, addr.id);
      successful++;
    } else {
      db.prepare(`
        UPDATE contact_addresses
        SET latitude = NULL, longitude = NULL, geocoded_at = datetime('now')
        WHERE id = ?
      `).run(addr.id);
      failed++;
    }
  }

  return {
    processed: pendingAddresses.length,
    successful,
    failed
  };
}

/**
 * Update address fields and retry geocoding
 */
export async function updateAddressAndGeocode(
  addressId: number,
  updates: {
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  }
): Promise<GeocodingAddress | null> {
  const db = getDatabase();

  // Get current address
  const current = db.prepare(`
    SELECT id, contact_id as contactId, street, city, state, postal_code as postalCode, country, type
    FROM contact_addresses
    WHERE id = ?
  `).get(addressId) as {
    id: number;
    contactId: number;
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    type: string | null;
  } | undefined;

  if (!current) return null;

  // Merge updates with current values
  const updated = {
    street: updates.street !== undefined ? updates.street : current.street,
    city: updates.city !== undefined ? updates.city : current.city,
    state: updates.state !== undefined ? updates.state : current.state,
    postalCode: updates.postalCode !== undefined ? updates.postalCode : current.postalCode,
    country: updates.country !== undefined ? updates.country : current.country
  };

  // Update address fields
  db.prepare(`
    UPDATE contact_addresses
    SET street = ?, city = ?, state = ?, postal_code = ?, country = ?
    WHERE id = ?
  `).run(updated.street, updated.city, updated.state, updated.postalCode, updated.country, addressId);

  // Retry geocoding
  const result = await geocodeAddress(updated);

  let latitude: number | null = null;
  let longitude: number | null = null;

  if (result) {
    latitude = result.latitude;
    longitude = result.longitude;
  }

  // Update geocoding result
  db.prepare(`
    UPDATE contact_addresses
    SET latitude = ?, longitude = ?, geocoded_at = datetime('now')
    WHERE id = ?
  `).run(latitude, longitude, addressId);

  // Get updated address
  const updatedAddr = db.prepare(`
    SELECT
      id,
      contact_id as contactId,
      street,
      city,
      state,
      postal_code as postalCode,
      country,
      type,
      latitude,
      longitude,
      geocoded_at as geocodedAt
    FROM contact_addresses
    WHERE id = ?
  `).get(addressId) as {
    id: number;
    contactId: number;
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    type: string | null;
    latitude: number | null;
    longitude: number | null;
    geocodedAt: string | null;
  };

  return {
    ...updatedAddr,
    status: getGeocodingStatus(updatedAddr.geocodedAt, updatedAddr.latitude, updatedAddr.longitude)
  };
}

/**
 * Check if geocoding service is available
 */
export function isGeocodingAvailable(): boolean {
  return isGeocodingConfigured();
}
