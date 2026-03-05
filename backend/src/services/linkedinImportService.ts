import type { Database as DatabaseType } from 'better-sqlite3';
import { rebuildContactSearch } from './database.js';

export interface LinkedInContact {
  firstName: string;
  lastName: string;
  linkedinUrl: string;
  email: string | null;
  company: string | null;
  position: string | null;
  connectedOn: string | null;
}

export interface LinkedInImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}

export interface LinkedInProgressUpdate {
  current: number;
  total: number;
  created: number;
  updated: number;
  skipped: number;
}

const LINKEDIN_CATEGORY = 'LinkedIn Connection';

/**
 * Import LinkedIn contacts from parsed CSV data.
 * Matches by email first, then LinkedIn URL.
 * Only adds missing data to existing contacts.
 */
export async function importLinkedInContacts(
  db: DatabaseType,
  contacts: LinkedInContact[],
  onProgress?: (progress: LinkedInProgressUpdate) => void
): Promise<LinkedInImportResult> {

  const result: LinkedInImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  // Track processed LinkedIn URLs to skip duplicates within the same import
  const processedUrls = new Set<string>();

  // Prepared statements
  const findByEmail = db.prepare(`
    SELECT contact_id FROM contact_emails
    WHERE email = ? COLLATE NOCASE
    LIMIT 1
  `);

  const findByLinkedInUrl = db.prepare(`
    SELECT contact_id FROM contact_social_profiles
    WHERE platform = 'linkedin' AND profile_url = ?
    LIMIT 1
  `);

  const findByLinkedInUrlInUrls = db.prepare(`
    SELECT contact_id FROM contact_urls
    WHERE url LIKE '%linkedin.com/in/%'
      AND url LIKE ?
    LIMIT 1
  `);

  const getContact = db.prepare(`
    SELECT id, company, title, notes FROM contacts WHERE id = ?
  `);

  const updateContact = db.prepare(`
    UPDATE contacts
    SET company = COALESCE(company, ?),
        title = COALESCE(title, ?),
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const insertContact = db.prepare(`
    INSERT INTO contacts (first_name, last_name, display_name, company, title, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertEmail = db.prepare(`
    INSERT INTO contact_emails (contact_id, email, type, is_primary)
    VALUES (?, ?, 'work', 1)
  `);

  const insertSocialProfile = db.prepare(`
    INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url)
    VALUES (?, 'linkedin', ?, ?)
  `);

  const checkSocialProfileExists = db.prepare(`
    SELECT id FROM contact_social_profiles
    WHERE contact_id = ? AND platform = 'linkedin'
  `);

  const checkCategoryExists = db.prepare(`
    SELECT id FROM contact_categories
    WHERE contact_id = ? AND category = ?
  `);

  const insertCategory = db.prepare(`
    INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)
  `);

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    const rowNum = i + 1;

    try {
      // Normalize LinkedIn URL
      const linkedinUrl = contact.linkedinUrl?.trim() || '';

      // Skip if no LinkedIn URL (invalid row)
      if (!linkedinUrl) {
        result.skipped++;
        reportProgress();
        continue;
      }

      // Skip duplicates within this import
      if (processedUrls.has(linkedinUrl.toLowerCase())) {
        result.skipped++;
        reportProgress();
        continue;
      }
      processedUrls.add(linkedinUrl.toLowerCase());

      // Extract username from LinkedIn URL for social profile
      const username = extractLinkedInUsername(linkedinUrl);

      // Build connection note
      const connectionNote = contact.connectedOn
        ? `LinkedIn connection since ${contact.connectedOn}`
        : null;

      // Try to find existing contact
      let existingContactId: number | null = null;

      // 1. Try matching by email first
      if (contact.email?.trim()) {
        const emailMatch = findByEmail.get(contact.email.trim()) as { contact_id: number } | undefined;
        if (emailMatch) {
          existingContactId = emailMatch.contact_id;
        }
      }

      // 2. If no email match, try matching by LinkedIn URL in social profiles
      if (!existingContactId) {
        const urlMatch = findByLinkedInUrl.get(linkedinUrl) as { contact_id: number } | undefined;
        if (urlMatch) {
          existingContactId = urlMatch.contact_id;
        }
      }

      // 3. If still no match, try matching by LinkedIn URL in contact_urls
      if (!existingContactId && username) {
        const urlPattern = `%linkedin.com/in/${username}%`;
        const urlMatch = findByLinkedInUrlInUrls.get(urlPattern) as { contact_id: number } | undefined;
        if (urlMatch) {
          existingContactId = urlMatch.contact_id;
        }
      }

      if (existingContactId) {
        // Update existing contact
        const existing = getContact.get(existingContactId) as {
          id: number;
          company: string | null;
          title: string | null;
          notes: string | null;
        };

        // Build updated notes (append connection info if not present)
        let updatedNotes = existing.notes || '';
        if (connectionNote && !updatedNotes.includes('LinkedIn connection since')) {
          updatedNotes = updatedNotes
            ? `${updatedNotes}\n${connectionNote}`
            : connectionNote;
        }

        // Update contact (COALESCE in SQL handles only updating empty fields)
        updateContact.run(
          contact.company?.trim() || null,
          contact.position?.trim() || null,
          updatedNotes || null,
          existingContactId
        );

        // Add LinkedIn social profile if not exists
        const existingProfile = checkSocialProfileExists.get(existingContactId);
        if (!existingProfile && username) {
          insertSocialProfile.run(existingContactId, username, linkedinUrl);
        }

        // Add category if not exists
        addCategoryIfMissing(existingContactId);

        // Rebuild search index
        rebuildContactSearch(db, existingContactId);

        result.updated++;
      } else {
        // Create new contact
        const displayName = buildDisplayName(contact.firstName, contact.lastName);

        const insertResult = insertContact.run(
          contact.firstName?.trim() || null,
          contact.lastName?.trim() || null,
          displayName,
          contact.company?.trim() || null,
          contact.position?.trim() || null,
          connectionNote
        );

        const newContactId = insertResult.lastInsertRowid as number;

        // Add email if present
        if (contact.email?.trim()) {
          insertEmail.run(newContactId, contact.email.trim());
        }

        // Add LinkedIn social profile
        if (username) {
          insertSocialProfile.run(newContactId, username, linkedinUrl);
        }

        // Add category
        addCategoryIfMissing(newContactId);

        // Rebuild search index
        rebuildContactSearch(db, newContactId);

        result.created++;
      }
    } catch (error) {
      result.failed++;
      result.errors.push({
        row: rowNum,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    reportProgress();
  }

  return result;

  function reportProgress() {
    if (onProgress) {
      onProgress({
        current: result.created + result.updated + result.skipped + result.failed,
        total: contacts.length,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
      });
    }
  }

  function addCategoryIfMissing(contactId: number) {
    const existingCategory = checkCategoryExists.get(contactId, LINKEDIN_CATEGORY);
    if (!existingCategory) {
      insertCategory.run(contactId, LINKEDIN_CATEGORY);
    }
  }
}

/**
 * Extract username from LinkedIn profile URL
 * e.g., "https://www.linkedin.com/in/john-doe-123" -> "john-doe-123"
 */
function extractLinkedInUsername(url: string): string {
  const match = url.match(/linkedin\.com\/in\/([^\/\?]+)/i);
  return match ? match[1] : url;
}

/**
 * Build display name from first and last name
 */
function buildDisplayName(firstName: string | null, lastName: string | null): string {
  const first = firstName?.trim() || '';
  const last = lastName?.trim() || '';

  if (first && last) {
    return `${first} ${last}`;
  }
  return first || last || 'Unknown';
}
