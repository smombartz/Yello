import { getDatabase } from './database.js';
import type { ContactDetail, ContactSocialProfile, DuplicateGroup } from '../types/index.js';
import { getPhotoUrl } from './photoProcessor.js';

// ============================================================
// Platform Detection
// ============================================================

export const SOCIAL_PLATFORMS: Record<string, RegExp> = {
  linkedin: /linkedin\.com\/in\//i,
  facebook: /facebook\.com\//i,
  twitter: /(twitter\.com|x\.com)\//i,
  instagram: /instagram\.com\//i,
  youtube: /youtube\.com\/(user|channel|@)/i,
  tiktok: /tiktok\.com\/@/i,
  pinterest: /pinterest\.com\//i,
  snapchat: /snapchat\.com\/add\//i,
  reddit: /reddit\.com\/(user|u)\//i,
  github: /github\.com\//i,
  threads: /threads\.net\/@/i,
};

const USERNAME_EXTRACTORS: Record<string, RegExp> = {
  linkedin: /linkedin\.com\/in\/([^\/\?\#]+)/i,
  facebook: /facebook\.com\/([^\/\?\#]+)/i,
  twitter: /(?:twitter|x)\.com\/([^\/\?\#]+)/i,
  instagram: /instagram\.com\/([^\/\?\#]+)/i,
  youtube: /youtube\.com\/(?:user|channel|@)\/([^\/\?\#]+)/i,
  tiktok: /tiktok\.com\/@([^\/\?\#]+)/i,
  pinterest: /pinterest\.com\/([^\/\?\#]+)/i,
  snapchat: /snapchat\.com\/add\/([^\/\?\#]+)/i,
  reddit: /reddit\.com\/(?:user|u)\/([^\/\?\#]+)/i,
  github: /github\.com\/([^\/\?\#]+)/i,
  threads: /threads\.net\/@([^\/\?\#]+)/i,
};

/**
 * Detect the social platform from a URL
 */
export function detectPlatform(url: string): string | null {
  for (const [platform, pattern] of Object.entries(SOCIAL_PLATFORMS)) {
    if (pattern.test(url)) {
      return platform;
    }
  }
  return null;
}

/**
 * Extract username from a social URL
 */
export function extractUsername(url: string, platform: string): string | null {
  // Special handling for Facebook profile.php URLs
  if (platform === 'facebook') {
    // Check for profile.php?id=NUMBER format
    const profileIdMatch = url.match(/facebook\.com\/profile\.php\?id=(\d+)/i);
    if (profileIdMatch) {
      return profileIdMatch[1]; // Return the numeric ID
    }
    // Fall through to standard extraction for username URLs
  }

  const extractor = USERNAME_EXTRACTORS[platform];
  if (!extractor) return null;

  const match = url.match(extractor);
  return match ? match[1] : null;
}

/**
 * Normalize a social URL for comparison
 */
function normalizeUrl(url: string): string {
  let normalized = url.toLowerCase().trim();

  // Remove protocol
  normalized = normalized.replace(/^https?:\/\//, '');

  // Remove www prefix
  normalized = normalized.replace(/^www\./, '');

  // Remove trailing slash
  normalized = normalized.replace(/\/$/, '');

  // Remove query parameters and hash
  normalized = normalized.replace(/[?#].*$/, '');

  return normalized;
}

// ============================================================
// Cross-contact Duplicates
// ============================================================

interface SocialUrlEntry {
  contactId: number;
  url: string;
  normalizedUrl: string;
  platform: string;
  username: string;
  source: 'social_profiles' | 'urls';
}

/**
 * Get all social URLs from both tables
 */
function getAllSocialUrls(): SocialUrlEntry[] {
  const db = getDatabase();
  const entries: SocialUrlEntry[] = [];

  // Get from contact_social_profiles
  const socialProfiles = db.prepare(`
    SELECT sp.contact_id, sp.profile_url, sp.platform, sp.username
    FROM contact_social_profiles sp
    JOIN contacts c ON sp.contact_id = c.id
    WHERE sp.profile_url IS NOT NULL AND sp.profile_url != ''
      AND c.archived_at IS NULL
  `).all() as Array<{
    contact_id: number;
    profile_url: string;
    platform: string;
    username: string;
  }>;

  for (const sp of socialProfiles) {
    // Skip Facebook pages - they're not personal profiles
    if (sp.profile_url.toLowerCase().includes('facebook.com/pages/')) {
      continue;
    }

    entries.push({
      contactId: sp.contact_id,
      url: sp.profile_url,
      normalizedUrl: normalizeUrl(sp.profile_url),
      platform: sp.platform.toLowerCase(),
      username: sp.username.toLowerCase(),
      source: 'social_profiles',
    });
  }

  // Get social URLs from contact_urls
  const urls = db.prepare(`
    SELECT cu.contact_id, cu.url
    FROM contact_urls cu
    JOIN contacts c ON cu.contact_id = c.id
    WHERE c.archived_at IS NULL
  `).all() as Array<{
    contact_id: number;
    url: string;
  }>;

  for (const u of urls) {
    // Skip Facebook pages - they're not personal profiles
    if (u.url.toLowerCase().includes('facebook.com/pages/')) {
      continue;
    }

    const platform = detectPlatform(u.url);
    if (platform) {
      const username = extractUsername(u.url, platform);
      if (username) {
        entries.push({
          contactId: u.contact_id,
          url: u.url,
          normalizedUrl: normalizeUrl(u.url),
          platform,
          username: username.toLowerCase(),
          source: 'urls',
        });
      }
    }
  }

  return entries;
}

/**
 * Count cross-contact duplicate groups
 */
export function countCrossContactDuplicates(): number {
  const entries = getAllSocialUrls();

  // Group by platform + username (normalized)
  const groups = new Map<string, Set<number>>();

  for (const entry of entries) {
    const key = `${entry.platform}:${entry.username}`;
    if (!groups.has(key)) {
      groups.set(key, new Set());
    }
    groups.get(key)!.add(entry.contactId);
  }

  // Count groups with more than one contact
  let count = 0;
  for (const contactIds of groups.values()) {
    if (contactIds.size > 1) {
      count++;
    }
  }

  return count;
}

/**
 * Find cross-contact duplicates with pagination
 */
export function findCrossContactDuplicates(
  limit: number,
  offset: number,
  platform?: string
): { groups: DuplicateGroup[]; totalGroups: number } {
  const entries = getAllSocialUrls();

  // Group by platform + username (normalized)
  const groupMap = new Map<string, {
    contactIds: Set<number>;
    platform: string;
    username: string;
    urls: string[];
  }>();

  for (const entry of entries) {
    // Filter by platform if specified
    if (platform && entry.platform !== platform.toLowerCase()) {
      continue;
    }

    const key = `${entry.platform}:${entry.username}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        contactIds: new Set(),
        platform: entry.platform,
        username: entry.username,
        urls: [],
      });
    }
    const group = groupMap.get(key)!;
    group.contactIds.add(entry.contactId);
    if (!group.urls.includes(entry.url)) {
      group.urls.push(entry.url);
    }
  }

  // Filter to groups with multiple contacts
  const duplicateGroups = Array.from(groupMap.values())
    .filter(g => g.contactIds.size > 1)
    .sort((a, b) => b.contactIds.size - a.contactIds.size);

  const totalGroups = duplicateGroups.length;

  // Apply pagination
  const paginatedGroups = duplicateGroups.slice(offset, offset + limit);

  // Convert to DuplicateGroup format with full contact details
  const groups: DuplicateGroup[] = paginatedGroups.map((group, index) => {
    const contactIds = Array.from(group.contactIds);
    const contactDetails = getContactDetails(contactIds);

    return {
      id: `social-${offset + index}-${group.platform}-${group.username}`,
      matchingValue: `${group.platform}:${group.username}`,
      matchingField: 'social-links' as const,
      contacts: contactDetails,
    };
  });

  return { groups, totalGroups };
}

// ============================================================
// Within-contact Cleanup
// ============================================================

export interface WithinContactIssue {
  contactId: number;
  displayName: string;
  photoUrl: string | null;
  socialUrls: Array<{
    id: number;
    url: string;
    platform: string;
    username: string;
  }>;
}

/**
 * Count contacts with social URLs in contact_urls
 */
export function countWithinContactIssues(): number {
  const db = getDatabase();

  // Build pattern for all social platforms
  const patterns = Object.values(SOCIAL_PLATFORMS).map(p => p.source);

  // SQLite doesn't support regex, so we use LIKE patterns
  const likePatterns = [
    '%linkedin.com/in/%',
    '%facebook.com/%',
    '%twitter.com/%',
    '%x.com/%',
    '%instagram.com/%',
    '%youtube.com/user/%',
    '%youtube.com/channel/%',
    '%youtube.com/@%',
    '%tiktok.com/@%',
    '%pinterest.com/%',
    '%snapchat.com/add/%',
    '%reddit.com/user/%',
    '%reddit.com/u/%',
    '%github.com/%',
    '%threads.net/@%',
  ];

  const whereClause = likePatterns.map(() => 'cu.url LIKE ?').join(' OR ');

  const result = db.prepare(`
    SELECT COUNT(DISTINCT cu.contact_id) as count
    FROM contact_urls cu
    JOIN contacts c ON cu.contact_id = c.id
    WHERE c.archived_at IS NULL AND (${whereClause})
  `).get(...likePatterns) as { count: number };

  return result.count;
}

/**
 * Find contacts with social URLs in contact_urls (for display)
 */
export function findWithinContactIssues(
  limit: number,
  offset: number
): { contacts: WithinContactIssue[]; total: number } {
  const db = getDatabase();

  const likePatterns = [
    '%linkedin.com/in/%',
    '%facebook.com/%',
    '%twitter.com/%',
    '%x.com/%',
    '%instagram.com/%',
    '%youtube.com/user/%',
    '%youtube.com/channel/%',
    '%youtube.com/@%',
    '%tiktok.com/@%',
    '%pinterest.com/%',
    '%snapchat.com/add/%',
    '%reddit.com/user/%',
    '%reddit.com/u/%',
    '%github.com/%',
    '%threads.net/@%',
  ];

  const whereClause = likePatterns.map(() => 'cu.url LIKE ?').join(' OR ');

  // Get total count
  const totalResult = db.prepare(`
    SELECT COUNT(DISTINCT cu.contact_id) as count
    FROM contact_urls cu
    JOIN contacts c ON cu.contact_id = c.id
    WHERE c.archived_at IS NULL AND (${whereClause})
  `).get(...likePatterns) as { count: number };

  const total = totalResult.count;

  // Get contact IDs with pagination
  const contactRows = db.prepare(`
    SELECT DISTINCT cu.contact_id, c.display_name, c.photo_hash
    FROM contact_urls cu
    JOIN contacts c ON cu.contact_id = c.id
    WHERE c.archived_at IS NULL AND (${whereClause})
    ORDER BY c.display_name
    LIMIT ? OFFSET ?
  `).all(...likePatterns, limit, offset) as Array<{
    contact_id: number;
    display_name: string;
    photo_hash: string | null;
  }>;

  // For each contact, get their social URLs
  // Note: whereClause uses 'cu.' prefix, so we need a clause without alias for this query
  const urlWhereClause = likePatterns.map(() => 'url LIKE ?').join(' OR ');
  const contacts: WithinContactIssue[] = contactRows.map(row => {
    const socialUrls = db.prepare(`
      SELECT id, url FROM contact_urls
      WHERE contact_id = ? AND (${urlWhereClause})
    `).all(row.contact_id, ...likePatterns) as Array<{ id: number; url: string }>;

    return {
      contactId: row.contact_id,
      displayName: row.display_name,
      photoUrl: getPhotoUrl(row.photo_hash, 'small'),
      socialUrls: socialUrls.map(su => {
        const platform = detectPlatform(su.url) || 'unknown';
        const username = extractUsername(su.url, platform) || su.url;
        return {
          id: su.id,
          url: su.url,
          platform,
          username,
        };
      }),
    };
  });

  return { contacts, total };
}

/**
 * Fix all within-contact issues: migrate social URLs from contact_urls to contact_social_profiles
 */
export function fixAllWithinContactIssues(): { migrated: number; deleted: number } {
  const db = getDatabase();

  const likePatterns = [
    '%linkedin.com/in/%',
    '%facebook.com/%',
    '%twitter.com/%',
    '%x.com/%',
    '%instagram.com/%',
    '%youtube.com/user/%',
    '%youtube.com/channel/%',
    '%youtube.com/@%',
    '%tiktok.com/@%',
    '%pinterest.com/%',
    '%snapchat.com/add/%',
    '%reddit.com/user/%',
    '%reddit.com/u/%',
    '%github.com/%',
    '%threads.net/@%',
  ];

  const whereClause = likePatterns.map(() => 'url LIKE ?').join(' OR ');

  // Get all social URLs from contact_urls
  const socialUrls = db.prepare(`
    SELECT cu.id, cu.contact_id, cu.url
    FROM contact_urls cu
    JOIN contacts c ON cu.contact_id = c.id
    WHERE c.archived_at IS NULL AND (${whereClause})
  `).all(...likePatterns) as Array<{
    id: number;
    contact_id: number;
    url: string;
  }>;

  let migrated = 0;
  let deleted = 0;

  const checkExistingProfile = db.prepare(`
    SELECT id FROM contact_social_profiles
    WHERE contact_id = ? AND platform = ? AND username = ?
    LIMIT 1
  `);

  const insertProfile = db.prepare(`
    INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url)
    VALUES (?, ?, ?, ?)
  `);

  const deleteUrl = db.prepare(`
    DELETE FROM contact_urls WHERE id = ?
  `);

  const transaction = db.transaction(() => {
    for (const su of socialUrls) {
      const platform = detectPlatform(su.url);
      if (!platform) continue;

      const username = extractUsername(su.url, platform);
      if (!username) continue;

      // Check if already exists in contact_social_profiles
      const existing = checkExistingProfile.get(su.contact_id, platform, username.toLowerCase());

      if (!existing) {
        // Migrate to contact_social_profiles
        insertProfile.run(su.contact_id, platform, username, su.url);
        migrated++;
      }

      // Delete from contact_urls
      deleteUrl.run(su.id);
      deleted++;
    }
  });

  transaction();

  return { migrated, deleted };
}

// ============================================================
// Summary
// ============================================================

export interface SocialLinksSummary {
  crossContact: number;
  withinContact: number;
}

export function getSocialLinksSummary(): SocialLinksSummary {
  return {
    crossContact: countCrossContactDuplicates(),
    withinContact: countWithinContactIssues(),
  };
}

// ============================================================
// All Groups (for Merge All feature)
// ============================================================

export interface SocialLinksCrossContactGroupLight {
  id: string;
  contactIds: number[];
  primaryContactId: number;
}

/**
 * Get all cross-contact duplicate groups in lightweight format for bulk operations
 */
export function findAllCrossContactGroups(
  platform?: string
): { groups: SocialLinksCrossContactGroupLight[]; totalGroups: number } {
  const entries = getAllSocialUrls();

  // Group by platform + username (normalized)
  const groupMap = new Map<string, {
    contactIds: Set<number>;
    platform: string;
    username: string;
  }>();

  for (const entry of entries) {
    // Filter by platform if specified
    if (platform && entry.platform !== platform.toLowerCase()) {
      continue;
    }

    const key = `${entry.platform}:${entry.username}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        contactIds: new Set(),
        platform: entry.platform,
        username: entry.username,
      });
    }
    groupMap.get(key)!.contactIds.add(entry.contactId);
  }

  // Filter to groups with multiple contacts and convert to lightweight format
  const lightGroups: SocialLinksCrossContactGroupLight[] = [];
  let index = 0;

  for (const [key, group] of groupMap) {
    if (group.contactIds.size > 1) {
      const contactIds = Array.from(group.contactIds);
      lightGroups.push({
        id: `social-${index}-${key}`,
        contactIds,
        primaryContactId: contactIds[0],
      });
      index++;
    }
  }

  // Sort by number of contacts descending (consistent with findCrossContactDuplicates)
  lightGroups.sort((a, b) => b.contactIds.length - a.contactIds.length);

  return { groups: lightGroups, totalGroups: lightGroups.length };
}

// ============================================================
// Helper: Get Contact Details
// ============================================================

function getContactDetails(contactIds: number[]): ContactDetail[] {
  if (contactIds.length === 0) return [];

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
      photoUrl: getPhotoUrl(contact.photoHash, 'medium')
    };
  });
}
