import type { Database as DatabaseType } from 'better-sqlite3';

// ============================================================
// Types
// ============================================================

export interface InvalidLinkMatch {
  contactId: number;
  contactName: string;
  source: 'social_profiles' | 'urls';
  platform: string | null;
  value: string;
  recordId: number;
}

export interface InvalidLinksSearchResult {
  matches: InvalidLinkMatch[];
  totalCount: number;
}

export interface InvalidLinksRemoveResult {
  deletedCount: number;
  deletedFromSocialProfiles: number;
  deletedFromUrls: number;
}

// ============================================================
// Search Functions
// ============================================================

/**
 * Search for invalid links matching the given patterns
 */
export function searchInvalidLinks(db: DatabaseType, patterns: string[]): InvalidLinksSearchResult {
  if (patterns.length === 0) {
    return { matches: [], totalCount: 0 };
  }
  const matches: InvalidLinkMatch[] = [];

  // Normalize patterns: lowercase, trim
  const normalizedPatterns = patterns.map(p => p.toLowerCase().trim()).filter(p => p.length > 0);

  if (normalizedPatterns.length === 0) {
    return { matches: [], totalCount: 0 };
  }

  // Search contact_social_profiles
  // Match if username equals or starts with pattern (for cases like profile.php?id=123)
  const socialProfiles = db.prepare(`
    SELECT
      sp.id as recordId,
      sp.contact_id as contactId,
      sp.platform,
      sp.username as value,
      c.display_name as contactName
    FROM contact_social_profiles sp
    JOIN contacts c ON sp.contact_id = c.id
    WHERE c.archived_at IS NULL
      AND sp.username IS NOT NULL
      AND sp.username != ''
  `).all() as Array<{
    recordId: number;
    contactId: number;
    platform: string;
    value: string;
    contactName: string;
  }>;

  for (const sp of socialProfiles) {
    const usernameLower = sp.value.toLowerCase();
    for (const pattern of normalizedPatterns) {
      if (usernameLower === pattern || usernameLower.startsWith(pattern)) {
        matches.push({
          contactId: sp.contactId,
          contactName: sp.contactName,
          source: 'social_profiles',
          platform: sp.platform,
          value: sp.value,
          recordId: sp.recordId,
        });
        break; // Only add once per record
      }
    }
  }

  // Search contact_urls
  // Match if any path segment equals the pattern
  const urls = db.prepare(`
    SELECT
      cu.id as recordId,
      cu.contact_id as contactId,
      cu.url as value,
      cu.label,
      c.display_name as contactName
    FROM contact_urls cu
    JOIN contacts c ON cu.contact_id = c.id
    WHERE c.archived_at IS NULL
      AND cu.url IS NOT NULL
      AND cu.url != ''
  `).all() as Array<{
    recordId: number;
    contactId: number;
    value: string;
    label: string | null;
    contactName: string;
  }>;

  for (const url of urls) {
    const urlLower = url.value.toLowerCase();
    // Extract path segments from URL
    const pathSegments = extractPathSegments(urlLower);

    for (const pattern of normalizedPatterns) {
      if (pathSegments.includes(pattern)) {
        matches.push({
          contactId: url.contactId,
          contactName: url.contactName,
          source: 'urls',
          platform: null,
          value: url.value,
          recordId: url.recordId,
        });
        break; // Only add once per record
      }
    }
  }

  // Sort by contact name
  matches.sort((a, b) => a.contactName.localeCompare(b.contactName));

  return {
    matches,
    totalCount: matches.length,
  };
}

/**
 * Extract path segments from a URL for matching
 */
function extractPathSegments(url: string): string[] {
  try {
    // Remove protocol
    let path = url.replace(/^https?:\/\//, '');
    // Remove domain
    const slashIndex = path.indexOf('/');
    if (slashIndex === -1) return [];
    path = path.substring(slashIndex);
    // Remove query string and hash
    path = path.split('?')[0].split('#')[0];
    // Split into segments and filter empty
    return path.split('/').filter(s => s.length > 0);
  } catch {
    return [];
  }
}

// ============================================================
// Remove Functions
// ============================================================

/**
 * Remove all invalid links matching the given patterns
 */
export function removeInvalidLinks(db: DatabaseType, patterns: string[]): InvalidLinksRemoveResult {
  if (patterns.length === 0) {
    return { deletedCount: 0, deletedFromSocialProfiles: 0, deletedFromUrls: 0 };
  }

  // First, find all matching records
  const { matches } = searchInvalidLinks(db, patterns);

  if (matches.length === 0) {
    return { deletedCount: 0, deletedFromSocialProfiles: 0, deletedFromUrls: 0 };
  }

  // Separate by source
  const socialProfileIds = matches
    .filter(m => m.source === 'social_profiles')
    .map(m => m.recordId);
  const urlIds = matches
    .filter(m => m.source === 'urls')
    .map(m => m.recordId);

  let deletedFromSocialProfiles = 0;
  let deletedFromUrls = 0;

  const transaction = db.transaction(() => {
    // Delete from contact_social_profiles
    if (socialProfileIds.length > 0) {
      const placeholders = socialProfileIds.map(() => '?').join(',');
      const result = db.prepare(`
        DELETE FROM contact_social_profiles WHERE id IN (${placeholders})
      `).run(...socialProfileIds);
      deletedFromSocialProfiles = result.changes;
    }

    // Delete from contact_urls
    if (urlIds.length > 0) {
      const placeholders = urlIds.map(() => '?').join(',');
      const result = db.prepare(`
        DELETE FROM contact_urls WHERE id IN (${placeholders})
      `).run(...urlIds);
      deletedFromUrls = result.changes;
    }
  });

  transaction();

  return {
    deletedCount: deletedFromSocialProfiles + deletedFromUrls,
    deletedFromSocialProfiles,
    deletedFromUrls,
  };
}
