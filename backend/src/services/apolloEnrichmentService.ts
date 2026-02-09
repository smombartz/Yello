/**
 * LinkedIn Enrichment Service using Apollo.io People Match API
 * Stores enriched data separately from contact data (never overwrites)
 */

import { getDatabase } from './database.js';

export interface LinkedInEnrichmentSummary {
  totalWithLinkedIn: number;
  alreadyEnriched: number;
  pendingEnrichment: number;
}

export interface ContactForEnrichment {
  contactId: number;
  displayName: string;
  linkedinUrl: string;
}

export interface LinkedInEnrichmentData {
  linkedinFirstName: string | null;
  linkedinLastName: string | null;
  headline: string | null;
  about: string | null;
  jobTitle: string | null;
  companyName: string | null;
  companyLinkedinUrl: string | null;
  industry: string | null;
  country: string | null;
  location: string | null;
  followersCount: number | null;
  education: string[] | null;
  skills: string[] | null;
  photoLinkedin: string | null;
}

export interface EnrichmentResult {
  contactId: number;
  contactName: string;
  success: boolean;
  error?: string;
}

export interface EnrichmentProgress {
  current: number;
  total: number;
  succeeded: number;
  failed: number;
  currentContact?: string;
}

export interface EnrichedContactInfo {
  contactId: number;
  contactName: string;
  headline: string | null;
  jobTitle: string | null;
  companyName: string | null;
}

export interface EnrichmentComplete {
  succeeded: number;
  failed: number;
  errors: Array<{ contactId: number; contactName: string; reason: string }>;
  enrichedContacts: EnrichedContactInfo[];
}

// Apollo.io API response types
interface ApolloOrganization {
  name?: string;
  linkedin_url?: string;
  industry?: string;
}

interface ApolloPerson {
  first_name?: string;
  last_name?: string;
  headline?: string;
  title?: string;
  organization?: ApolloOrganization;
  country?: string;
  city?: string;
  state?: string;
  photo_url?: string;
}

interface ApolloResponse {
  person?: ApolloPerson | null;
}

const APOLLO_API_KEY = process.env.APOLLO_API_KEY || '';

/**
 * Check if Apollo.io API is configured
 */
export function isLinkedInEnrichmentConfigured(): boolean {
  return APOLLO_API_KEY.length > 0;
}

/**
 * Get summary of contacts available for enrichment
 */
export function getEnrichmentSummary(includeAlreadyEnriched: boolean): LinkedInEnrichmentSummary {
  const db = getDatabase();

  // Count contacts with LinkedIn URLs (from social_profiles or urls table)
  const totalWithLinkedIn = db.prepare(`
    SELECT COUNT(DISTINCT c.id) as count
    FROM contacts c
    LEFT JOIN contact_social_profiles sp ON c.id = sp.contact_id AND LOWER(sp.platform) = 'linkedin'
    LEFT JOIN contact_urls u ON c.id = u.contact_id AND u.url LIKE '%linkedin.com%'
    WHERE c.archived_at IS NULL
      AND (sp.id IS NOT NULL OR u.id IS NOT NULL)
  `).get() as { count: number };

  // Count already enriched contacts
  const alreadyEnriched = db.prepare(`
    SELECT COUNT(*) as count
    FROM linkedin_enrichment le
    JOIN contacts c ON le.contact_id = c.id
    WHERE c.archived_at IS NULL
  `).get() as { count: number };

  const pendingEnrichment = includeAlreadyEnriched
    ? totalWithLinkedIn.count
    : totalWithLinkedIn.count - alreadyEnriched.count;

  return {
    totalWithLinkedIn: totalWithLinkedIn.count,
    alreadyEnriched: alreadyEnriched.count,
    pendingEnrichment: Math.max(0, pendingEnrichment),
  };
}

/**
 * Get contacts that need enrichment
 */
export function getContactsForEnrichment(includeAlreadyEnriched: boolean): ContactForEnrichment[] {
  const db = getDatabase();

  // Get LinkedIn URLs from social_profiles first, then from urls
  const contacts = db.prepare(`
    SELECT DISTINCT
      c.id as contactId,
      c.display_name as displayName,
      COALESCE(sp.profile_url, u.url) as linkedinUrl
    FROM contacts c
    LEFT JOIN contact_social_profiles sp ON c.id = sp.contact_id AND LOWER(sp.platform) = 'linkedin'
    LEFT JOIN contact_urls u ON c.id = u.contact_id AND u.url LIKE '%linkedin.com%'
    LEFT JOIN linkedin_enrichment le ON c.id = le.contact_id
    WHERE c.archived_at IS NULL
      AND (sp.id IS NOT NULL OR u.id IS NOT NULL)
      ${includeAlreadyEnriched ? '' : 'AND le.id IS NULL'}
    ORDER BY c.display_name
  `).all() as ContactForEnrichment[];

  return contacts.filter(c => c.linkedinUrl);
}

/**
 * Normalize LinkedIn URL to standard format
 */
function normalizeLinkedInUrl(url: string): string {
  let normalized = url.trim();

  // Ensure https
  if (!normalized.startsWith('http')) {
    normalized = 'https://' + normalized;
  }

  // Handle linkedin.com/in/ URLs
  if (!normalized.includes('linkedin.com')) {
    return normalized;
  }

  // Remove tracking parameters and ensure clean URL
  try {
    const urlObj = new URL(normalized);
    return `https://www.linkedin.com${urlObj.pathname}`;
  } catch {
    return normalized;
  }
}

/**
 * Call Apollo.io People Match API
 */
async function callApolloApi(linkedinUrl: string): Promise<ApolloPerson | null> {
  if (!isLinkedInEnrichmentConfigured()) {
    throw new Error('APOLLO_API_KEY not configured');
  }

  const normalizedUrl = normalizeLinkedInUrl(linkedinUrl);

  const response = await fetch('https://api.apollo.io/api/v1/people/match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': APOLLO_API_KEY,
    },
    body: JSON.stringify({
      linkedin_url: normalizedUrl,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apollo API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as ApolloResponse;
  return data.person || null;
}

/**
 * Map Apollo response to enrichment data
 */
function mapApolloToEnrichmentData(person: ApolloPerson): LinkedInEnrichmentData {
  // Build location string from city and state
  let location: string | null = null;
  const locationParts = [person.city, person.state].filter(Boolean);
  if (locationParts.length > 0) {
    location = locationParts.join(', ');
  }

  return {
    linkedinFirstName: person.first_name || null,
    linkedinLastName: person.last_name || null,
    headline: person.headline || null,
    about: null, // Apollo doesn't provide about/summary
    jobTitle: person.title || null,
    companyName: person.organization?.name || null,
    companyLinkedinUrl: person.organization?.linkedin_url || null,
    industry: person.organization?.industry || null,
    country: person.country || null,
    location: location,
    followersCount: null, // Apollo doesn't provide followers count
    education: null, // Apollo doesn't provide education in people/match
    skills: null, // Apollo doesn't provide skills in people/match
    photoLinkedin: person.photo_url || null,
  };
}

/**
 * Store enrichment data in database
 */
function storeEnrichmentData(
  contactId: number,
  data: LinkedInEnrichmentData,
  rawResponse: string
): void {
  const db = getDatabase();

  // Use INSERT OR REPLACE to handle re-enrichment
  db.prepare(`
    INSERT OR REPLACE INTO linkedin_enrichment (
      contact_id,
      linkedin_first_name,
      linkedin_last_name,
      headline,
      about,
      job_title,
      company_name,
      company_linkedin_url,
      industry,
      country,
      location,
      followers_count,
      education,
      skills,
      photo_linkedin,
      enriched_at,
      raw_response
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
  `).run(
    contactId,
    data.linkedinFirstName,
    data.linkedinLastName,
    data.headline,
    data.about,
    data.jobTitle,
    data.companyName,
    data.companyLinkedinUrl,
    data.industry,
    data.country,
    data.location,
    data.followersCount,
    data.education ? JSON.stringify(data.education) : null,
    data.skills ? JSON.stringify(data.skills) : null,
    data.photoLinkedin,
    rawResponse
  );
}

/**
 * Enrich a single contact from LinkedIn via Apollo.io
 */
export async function enrichContactFromLinkedIn(
  contactId: number,
  linkedinUrl: string,
  displayName: string
): Promise<EnrichmentResult> {
  try {
    const person = await callApolloApi(linkedinUrl);

    if (!person) {
      return {
        contactId,
        contactName: displayName,
        success: false,
        error: 'Person not found in Apollo database',
      };
    }

    const enrichmentData = mapApolloToEnrichmentData(person);

    // Check if we got meaningful data
    if (!enrichmentData.linkedinFirstName && !enrichmentData.headline && !enrichmentData.companyName) {
      return {
        contactId,
        contactName: displayName,
        success: false,
        error: 'No useful profile data returned',
      };
    }

    storeEnrichmentData(contactId, enrichmentData, JSON.stringify(person));

    return {
      contactId,
      contactName: displayName,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      contactId,
      contactName: displayName,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Enrich multiple contacts with progress callback
 */
export async function enrichContacts(
  includeAlreadyEnriched: boolean,
  onProgress?: (progress: EnrichmentProgress) => void,
  limit?: number
): Promise<EnrichmentComplete> {
  let contacts = getContactsForEnrichment(includeAlreadyEnriched);

  // Apply limit if specified
  if (limit && limit > 0) {
    contacts = contacts.slice(0, limit);
  }

  const total = contacts.length;
  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ contactId: number; contactName: string; reason: string }> = [];
  const enrichedContacts: EnrichedContactInfo[] = [];

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];

    // Report progress
    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        succeeded,
        failed,
        currentContact: contact.displayName,
      });
    }

    // Enrich the contact
    const result = await enrichContactFromLinkedIn(
      contact.contactId,
      contact.linkedinUrl,
      contact.displayName
    );

    if (result.success) {
      succeeded++;

      // Fetch the enrichment data we just stored
      const enrichmentData = getEnrichmentDataForContact(contact.contactId);
      enrichedContacts.push({
        contactId: contact.contactId,
        contactName: contact.displayName,
        headline: enrichmentData?.headline ?? null,
        jobTitle: enrichmentData?.jobTitle ?? null,
        companyName: enrichmentData?.companyName ?? null,
      });
    } else {
      failed++;
      errors.push({
        contactId: contact.contactId,
        contactName: contact.displayName,
        reason: result.error || 'Unknown error',
      });
    }

    // Rate limiting: Apollo allows 600 requests/hour = 10/minute
    // Use 7 second delay between requests for safety margin
    if (i < contacts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 7000));
    }
  }

  return {
    succeeded,
    failed,
    errors,
    enrichedContacts,
  };
}

/**
 * Get enrichment data for a specific contact
 */
function getEnrichmentDataForContact(contactId: number): LinkedInEnrichmentData | null {
  const db = getDatabase();

  const row = db.prepare(`
    SELECT
      linkedin_first_name as linkedinFirstName,
      linkedin_last_name as linkedinLastName,
      headline,
      about,
      job_title as jobTitle,
      company_name as companyName,
      company_linkedin_url as companyLinkedinUrl,
      industry,
      country,
      location,
      followers_count as followersCount,
      education,
      skills,
      photo_linkedin as photoLinkedin
    FROM linkedin_enrichment
    WHERE contact_id = ?
  `).get(contactId) as {
    linkedinFirstName: string | null;
    linkedinLastName: string | null;
    headline: string | null;
    about: string | null;
    jobTitle: string | null;
    companyName: string | null;
    companyLinkedinUrl: string | null;
    industry: string | null;
    country: string | null;
    location: string | null;
    followersCount: number | null;
    education: string | null;
    skills: string | null;
    photoLinkedin: string | null;
  } | undefined;

  if (!row) {
    return null;
  }

  return {
    linkedinFirstName: row.linkedinFirstName,
    linkedinLastName: row.linkedinLastName,
    headline: row.headline,
    about: row.about,
    jobTitle: row.jobTitle,
    companyName: row.companyName,
    companyLinkedinUrl: row.companyLinkedinUrl,
    industry: row.industry,
    country: row.country,
    location: row.location,
    followersCount: row.followersCount,
    education: row.education ? JSON.parse(row.education) : null,
    skills: row.skills ? JSON.parse(row.skills) : null,
    photoLinkedin: row.photoLinkedin,
  };
}
