import { getDatabase } from './database.js';
import { getValidAccessToken, hasGoogleTokens } from './googleAuthService.js';
import { fetchGoogleContactsPhotos } from './googlePeopleService.js';
import { getGravatarUrl, downloadAndProcessImage } from './profileImageService.js';
import crypto from 'crypto';

export interface FetchPhotosResult {
  matched: number;
  downloaded: number;
  failed: number;
  skipped: number;
}

export interface ProgressUpdate {
  current: number;
  total: number;
  downloaded: number;
  failed: number;
  skipped: number;
}

interface ContactWithEmail {
  id: number;
  email: string;
}

interface GoogleContactPhoto {
  email: string;
  photoUrl: string | null;
}

/**
 * Process a photo for a contact - downloads and stores it.
 * Uses contact-specific hash to avoid conflicts with user profile images.
 */
async function processContactPhoto(imageUrl: string, contactId: number): Promise<string | null> {
  // Use a contact-specific identifier for the hash
  const identifier = `contact-${contactId}`;
  return downloadAndProcessImage(imageUrl, identifier);
}

/**
 * Fetch and store photos for contacts from Google Contacts and Gravatar.
 */
export async function fetchContactPhotos(
  userId: number,
  onProgress?: (progress: ProgressUpdate) => void
): Promise<FetchPhotosResult> {
  const result: FetchPhotosResult = {
    matched: 0,
    downloaded: 0,
    failed: 0,
    skipped: 0,
  };

  const db = getDatabase();

  // Check if user has Google tokens
  if (!hasGoogleTokens(userId)) {
    throw new Error('No Google authentication found. Please log in with Google first.');
  }

  // Get valid access token
  const accessToken = await getValidAccessToken(userId);

  // Get all contacts with emails (process even those with existing photos to collect all sources)
  const contactsWithEmails = db.prepare(`
    SELECT DISTINCT c.id, e.email
    FROM contacts c
    JOIN contact_emails e ON e.contact_id = c.id
    WHERE c.archived_at IS NULL
    ORDER BY c.id
  `).all() as ContactWithEmail[];

  console.log(`[PhotoFetch] Found ${contactsWithEmails.length} contacts with emails (rows, may include duplicates)`);

  if (contactsWithEmails.length === 0) {
    return result;
  }

  // Build email-to-contact mapping (first email wins for each contact)
  const emailToContact = new Map<string, number>();
  const contactEmails = new Map<number, string[]>();

  for (const row of contactsWithEmails) {
    const normalizedEmail = row.email.toLowerCase().trim();

    if (!emailToContact.has(normalizedEmail)) {
      emailToContact.set(normalizedEmail, row.id);
    }

    if (!contactEmails.has(row.id)) {
      contactEmails.set(row.id, []);
    }
    contactEmails.get(row.id)!.push(normalizedEmail);
  }

  // Fetch Google Contacts photos if we have a valid access token
  let googleContactsMap = new Map<string, string>();

  if (accessToken) {
    const googleContacts = await fetchGoogleContactsPhotos(accessToken);

    for (const contact of googleContacts) {
      if (contact.photoUrl) {
        googleContactsMap.set(contact.email.toLowerCase(), contact.photoUrl);
      }
    }
    console.log(`[PhotoFetch] Google Contacts with photos: ${googleContactsMap.size}`);
  }

  // Get unique contact IDs for total count
  const uniqueContactIds = new Set<number>();
  for (const [_, contactId] of emailToContact) {
    uniqueContactIds.add(contactId);
  }
  const totalContacts = uniqueContactIds.size;
  console.log(`[PhotoFetch] Unique contacts to process: ${totalContacts}`);

  // Process each unique contact
  const processedContacts = new Set<number>();
  let currentContact = 0;

  for (const [email, contactId] of emailToContact) {
    if (processedContacts.has(contactId)) {
      continue;
    }
    processedContacts.add(contactId);
    currentContact++;

    // Get all emails for this contact
    const emails = contactEmails.get(contactId) || [email];
    console.log(`[PhotoFetch] Contact ${contactId}: emails=${emails.join(', ')}`);

    // Try to find a photo from Google Contacts first
    let photoUrl: string | null = null;
    let source: 'google' | 'gravatar' = 'google';

    for (const e of emails) {
      if (googleContactsMap.has(e)) {
        photoUrl = googleContactsMap.get(e)!;
        console.log(`[PhotoFetch] Contact ${contactId}: Found Google photo for ${e}`);
        result.matched++;
        break;
      }
    }

    // If no Google Contact match, try Gravatar
    if (!photoUrl) {
      // Try Gravatar for the primary (first) email
      const primaryEmail = emails[0];
      const gravatarUrl = getGravatarUrl(primaryEmail);

      try {
        // Check if Gravatar exists (returns 404 if not)
        const response = await fetch(gravatarUrl, { method: 'HEAD' });
        console.log(`[PhotoFetch] Contact ${contactId}: Gravatar check for ${primaryEmail} - status=${response.status}`);
        if (response.ok) {
          photoUrl = gravatarUrl;
          source = 'gravatar';
          result.matched++;
        }
      } catch (error) {
        // Gravatar check failed, skip
        console.log(`[PhotoFetch] Contact ${contactId}: Gravatar check failed - ${error}`);
      }
    }

    if (!photoUrl) {
      console.log(`[PhotoFetch] Contact ${contactId}: SKIPPED - no photo found from Google or Gravatar`);
      result.skipped++;
      // Report progress after skipped contact
      if (onProgress) {
        onProgress({
          current: currentContact,
          total: totalContacts,
          downloaded: result.downloaded,
          failed: result.failed,
          skipped: result.skipped,
        });
      }
      continue;
    }

    // Download and process the photo
    const photoHash = await processContactPhoto(photoUrl, contactId);

    if (photoHash) {
      // Only set contacts.photo_hash if it's currently NULL (don't overwrite existing primary)
      db.prepare(`
        UPDATE contacts SET photo_hash = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND photo_hash IS NULL
      `).run(photoHash, contactId);

      // Always upsert into contact_photos
      db.prepare(`
        INSERT INTO contact_photos (contact_id, source, original_url, local_hash, is_primary)
        VALUES (?, ?, ?, ?, CASE WHEN (SELECT photo_hash FROM contacts WHERE id = ?) = ? THEN 1 ELSE 0 END)
        ON CONFLICT(contact_id, source) DO UPDATE SET
          original_url = excluded.original_url,
          local_hash = excluded.local_hash,
          fetched_at = CURRENT_TIMESTAMP
      `).run(contactId, source, photoUrl, photoHash, contactId, photoHash);

      console.log(`[PhotoFetch] Contact ${contactId}: DOWNLOADED photo from ${source}`);
      result.downloaded++;
    } else {
      console.log(`[PhotoFetch] Contact ${contactId}: FAILED to download photo from ${source}`);
      result.failed++;
    }

    // Report progress after processing
    if (onProgress) {
      onProgress({
        current: currentContact,
        total: totalContacts,
        downloaded: result.downloaded,
        failed: result.failed,
        skipped: result.skipped,
      });
    }
  }

  return result;
}
