/**
 * LinkedIn Enrichment Service using Apify LinkedIn Profile Scraper
 * Stores enriched data separately from contact data (never overwrites)
 *
 * Uses actor: supreme_coder~linkedin-profile-scraper
 * Batch processing: submits up to 1500 URLs per run, polls for completion
 */

import { getDatabase } from './database.js';
import { downloadAndProcessImage } from './profileImageService.js';

// ============================================================
// Shared interfaces (identical to apolloEnrichmentService.ts)
// ============================================================

export interface LinkedInEnrichmentSummary {
  totalWithLinkedIn: number;
  alreadyEnriched: number;
  pendingEnrichment: number;
  totalContacts: number;
  enriched: number;
  readyToEnrich: number;
  noLinkedIn: number;
  failed: number;
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
  positions: Array<{title: string; companyName?: string; locationName?: string; startDate?: string; endDate?: string}> | null;
  certifications: Array<{name: string; authority?: string}> | null;
  languages: Array<{name: string; proficiency?: string}> | null;
  honors: Array<{title: string; issuer?: string; description?: string}> | null;
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

// ============================================================
// Apify-specific types
// ============================================================

interface ApifyPositionFlat {
  title?: string;
  companyName?: string;
  companyUrl?: string;
  locationName?: string;
  startDate?: string;
  endDate?: string;
  timePeriod?: {
    startDate?: { month?: number; year?: number };
    endDate?: { month?: number; year?: number };
  };
  description?: string;
}

// Format B: company-grouped with nested positions sub-array
interface ApifyPositionGrouped {
  company?: { name?: string; linkedinUrl?: string };
  positions?: ApifyPositionFlat[];
  companyName?: string;
  title?: string;
  locationName?: string;
  timePeriod?: {
    startDate?: { month?: number; year?: number };
    endDate?: { month?: number; year?: number };
  };
}

type ApifyPosition = ApifyPositionFlat | ApifyPositionGrouped;

interface ApifyEducation {
  degreeName?: string;
  fieldOfStudy?: string;
  schoolName?: string;
  startDate?: string;
  endDate?: string;
}

interface ApifyCurrentCompany {
  name?: string;
  linkedinUrl?: string;
  industries?: Array<{ name?: string }>;
  followerCount?: number;
}

interface ApifyProfileResult {
  firstName?: string;
  lastName?: string;
  headline?: string;
  summary?: string;
  occupation?: string;
  jobTitle?: string;
  companyName?: string;
  companyLinkedinUrl?: string;
  companyPublicId?: string;
  industryName?: string;
  countryCode?: string;
  geoCountryName?: string;
  geoLocationName?: string;
  pictureUrl?: string;
  publicIdentifier?: string;
  positions?: ApifyPosition[];
  educations?: ApifyEducation[];
  skills?: string[];
  certifications?: Array<{name?: string; authority?: string}>;
  languages?: Array<{name?: string; proficiency?: string}>;
  honors?: Array<{title?: string; issuer?: string; description?: string}>;
  currentCompany?: ApifyCurrentCompany;
}

interface ApifyRunResponse {
  data?: {
    id: string;
    defaultDatasetId: string;
    status: string;
  };
}

interface ApifyRunStatus {
  data?: {
    id: string;
    status: string;
    defaultDatasetId: string;
    finishedAt?: string;
  };
}

// ============================================================
// Constants
// ============================================================

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || '';
const APIFY_BASE_URL = 'https://api.apify.com/v2';
const APIFY_ACTOR_ID = 'supreme_coder~linkedin-profile-scraper';
const MAX_URLS_PER_RUN = 1500;
const POLL_INTERVAL_MS = 5000; // 5 seconds
const MAX_POLL_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// ============================================================
// Retry helper for transient HTTP errors
// ============================================================

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  label: string,
  maxAttempts = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, options);

      // Don't retry 4xx — those are permanent errors
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // 5xx — transient, worth retrying
      const errorText = await response.text();
      lastError = new Error(`${label} (${response.status}): ${errorText.slice(0, 200)}`);
      console.warn(`[Enrich] ${label} failed (attempt ${attempt}/${maxAttempts}, status ${response.status}), retrying...`);
    } catch (err) {
      // Network error — transient, worth retrying
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Enrich] ${label} network error (attempt ${attempt}/${maxAttempts}): ${lastError.message}`);
    }

    if (attempt < maxAttempts) {
      const delayMs = 5000 * Math.pow(2, attempt - 1); // 5s, 10s, 20s
      console.log(`[Enrich] Waiting ${delayMs / 1000}s before retry...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error(`${label} failed after ${maxAttempts} attempts`);
}

// ============================================================
// Configuration check
// ============================================================

/**
 * Check if Apify API is configured
 */
export function isLinkedInEnrichmentConfigured(): boolean {
  return APIFY_API_TOKEN.length > 0;
}

// ============================================================
// Database functions (identical to apolloEnrichmentService.ts)
// ============================================================

/**
 * Get summary of contacts available for enrichment
 */
export function getEnrichmentSummary(includeAlreadyEnriched: boolean): LinkedInEnrichmentSummary {
  const db = getDatabase();

  // Total non-archived contacts
  const totalContacts = (db.prepare(
    'SELECT COUNT(*) as count FROM contacts WHERE archived_at IS NULL'
  ).get() as { count: number }).count;

  // Count contacts with LinkedIn URLs (from social_profiles or urls table)
  const totalWithLinkedIn = (db.prepare(`
    SELECT COUNT(DISTINCT c.id) as count
    FROM contacts c
    LEFT JOIN contact_social_profiles sp ON c.id = sp.contact_id AND LOWER(sp.platform) = 'linkedin'
    LEFT JOIN contact_urls u ON c.id = u.contact_id AND u.url LIKE '%linkedin.com%'
    WHERE c.archived_at IS NULL
      AND (sp.id IS NOT NULL OR u.id IS NOT NULL)
  `).get() as { count: number }).count;

  // Count already enriched contacts
  const enriched = (db.prepare(`
    SELECT COUNT(*) as count
    FROM linkedin_enrichment le
    JOIN contacts c ON le.contact_id = c.id
    WHERE c.archived_at IS NULL
  `).get() as { count: number }).count;

  // Count failed contacts
  const failedCount = (db.prepare(`
    SELECT COUNT(*) as count
    FROM linkedin_enrichment_failures lef
    JOIN contacts c ON lef.contact_id = c.id
    WHERE c.archived_at IS NULL
  `).get() as { count: number }).count;

  const noLinkedIn = totalContacts - totalWithLinkedIn;
  const readyToEnrich = Math.max(0, totalWithLinkedIn - enriched - failedCount);

  const pendingEnrichment = includeAlreadyEnriched
    ? totalWithLinkedIn
    : totalWithLinkedIn - enriched;

  return {
    // Legacy fields (used by existing enrichment UI logic)
    totalWithLinkedIn,
    alreadyEnriched: enriched,
    pendingEnrichment: Math.max(0, pendingEnrichment),
    // New category fields
    totalContacts,
    enriched,
    readyToEnrich,
    noLinkedIn,
    failed: failedCount,
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

function storeEnrichmentFailure(contactId: number, reason: string): void {
  const db = getDatabase();
  db.prepare(`
    INSERT OR REPLACE INTO linkedin_enrichment_failures (contact_id, error_reason, attempted_at)
    VALUES (?, ?, datetime('now'))
  `).run(contactId, reason);
}

function clearEnrichmentFailure(contactId: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM linkedin_enrichment_failures WHERE contact_id = ?').run(contactId);
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
      positions,
      certifications,
      languages,
      honors,
      enriched_at,
      raw_response
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
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
    data.positions ? JSON.stringify(data.positions) : null,
    data.certifications ? JSON.stringify(data.certifications) : null,
    data.languages ? JSON.stringify(data.languages) : null,
    data.honors ? JSON.stringify(data.honors) : null,
    rawResponse
  );
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
      photo_linkedin as photoLinkedin,
      positions,
      certifications,
      languages,
      honors
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
    positions: string | null;
    certifications: string | null;
    languages: string | null;
    honors: string | null;
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
    positions: row.positions ? JSON.parse(row.positions) : null,
    certifications: row.certifications ? JSON.parse(row.certifications) : null,
    languages: row.languages ? JSON.parse(row.languages) : null,
    honors: row.honors ? JSON.parse(row.honors) : null,
  };
}

// ============================================================
// Apify-specific helper functions
// ============================================================

/**
 * Extract the public identifier from a LinkedIn URL
 * Supports both /in/ (modern) and /pub/ (older) URL formats:
 *   "https://www.linkedin.com/in/johndoe" -> "johndoe"
 *   "https://www.linkedin.com/pub/sara-plumbly/69/18/5b9" -> "sara-plumbly/69/18/5b9"
 */
function extractPublicIdentifier(url: string): string | null {
  const normalized = normalizeLinkedInUrl(url);
  const match = normalized.match(/linkedin\.com\/(?:in|pub)\/([^?#]+?)\/?\s*$/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Start an Apify actor run with a batch of LinkedIn URLs
 */
async function startApifyRun(urls: string[]): Promise<{ runId: string; datasetId: string }> {
  console.log(`[Enrich] Starting Apify run with ${urls.length} URLs`);

  const response = await fetch(
    `${APIFY_BASE_URL}/acts/${APIFY_ACTOR_ID}/runs`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${APIFY_API_TOKEN}`,
      },
      body: JSON.stringify({
        urls: urls.map(url => ({ url })),
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Enrich] Failed to start Apify run: ${response.status} ${errorText}`);
    throw new Error(`Apify API error (${response.status}): ${errorText}`);
  }

  const result = await response.json() as ApifyRunResponse;

  if (!result.data?.id || !result.data?.defaultDatasetId) {
    console.error('[Enrich] Apify response missing run ID or dataset ID', result);
    throw new Error('Invalid Apify response: missing run ID or dataset ID');
  }

  console.log(`[Enrich] Apify run started: runId=${result.data.id}`);

  return {
    runId: result.data.id,
    datasetId: result.data.defaultDatasetId,
  };
}

/**
 * Poll an Apify run until it completes or times out
 * Returns the dataset ID when the run finishes successfully
 */
async function waitForApifyRun(
  runId: string,
  onPoll?: (pollCount: number, status: string, elapsedMs: number) => void
): Promise<string> {
  const startTime = Date.now();
  let pollCount = 0;

  while (true) {
    pollCount++;
    const elapsed = Date.now() - startTime;

    if (elapsed > MAX_POLL_DURATION_MS) {
      console.error(`[Enrich] Apify run ${runId} timed out after ${Math.round(elapsed / 1000)}s`);
      throw new Error(`Apify run timed out after ${Math.round(elapsed / 60000)} minutes`);
    }

    const response = await fetchWithRetry(
      `${APIFY_BASE_URL}/actor-runs/${runId}`,
      {
        headers: {
          'Authorization': `Bearer ${APIFY_API_TOKEN}`,
        },
      },
      'Apify status check'
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Apify status check error (${response.status}): ${errorText}`);
    }

    const statusResult = await response.json() as ApifyRunStatus;
    const status = statusResult.data?.status || 'UNKNOWN';

    console.log(`[Enrich] Poll #${pollCount}: runId=${runId}, status=${status}, elapsed=${Math.round(elapsed / 1000)}s`);

    if (onPoll) {
      onPoll(pollCount, status, elapsed);
    }

    if (status === 'SUCCEEDED') {
      const datasetId = statusResult.data?.defaultDatasetId;
      if (!datasetId) {
        throw new Error('Apify run succeeded but no dataset ID found');
      }
      console.log(`[Enrich] Apify run ${runId} completed successfully`);
      return datasetId;
    }

    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      console.error(`[Enrich] Apify run ${runId} ended with status: ${status}`);
      throw new Error(`Apify run ended with status: ${status}`);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/**
 * Retrieve results from an Apify dataset
 */
async function getApifyResults(datasetId: string): Promise<ApifyProfileResult[]> {
  console.log(`[Enrich] Fetching results from dataset ${datasetId}`);

  const response = await fetchWithRetry(
    `${APIFY_BASE_URL}/datasets/${datasetId}/items?format=json`,
    {
      headers: {
        'Authorization': `Bearer ${APIFY_API_TOKEN}`,
      },
    },
    'Apify dataset fetch'
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apify dataset fetch error (${response.status}): ${errorText}`);
  }

  const results = await response.json() as ApifyProfileResult[];

  console.log(`[Enrich] Retrieved ${results.length} results from dataset ${datasetId}`);

  // Log first result's keys for schema verification
  if (results.length > 0) {
    const sampleKeys = Object.keys(results[0]).sort().join(', ');
    console.log(`[Enrich] Sample profile keys: ${sampleKeys}`);
  }

  return results;
}

/**
 * Map Apify profile result to our LinkedInEnrichmentData format
 */
function mapApifyToEnrichmentData(profile: ApifyProfileResult): LinkedInEnrichmentData {
  // Build company LinkedIn URL from companyLinkedinUrl or companyPublicId
  let companyLinkedinUrl: string | null = profile.companyLinkedinUrl || null;
  if (!companyLinkedinUrl && profile.companyPublicId) {
    companyLinkedinUrl = `https://www.linkedin.com/company/${profile.companyPublicId}`;
  }

  // Map educations to readable strings like "Degree in Field at School"
  let education: string[] | null = null;
  if (profile.educations && profile.educations.length > 0) {
    education = profile.educations
      .map(edu => {
        const parts: string[] = [];
        if (edu.degreeName) {
          parts.push(edu.degreeName);
        }
        if (edu.fieldOfStudy) {
          parts.push(`in ${edu.fieldOfStudy}`);
        }
        if (edu.schoolName) {
          parts.push(`at ${edu.schoolName}`);
        }
        return parts.join(' ');
      })
      .filter(s => s.length > 0);

    if (education.length === 0) {
      education = null;
    }
  }

  // Map positions with readable date strings
  // Handles two Apify formats:
  //   Format A (flat): { title, companyName, timePeriod, ... }
  //   Format B (grouped): { company: { name }, positions: [{ title, timePeriod, ... }] }
  let positions: LinkedInEnrichmentData['positions'] = null;
  if (profile.positions && profile.positions.length > 0) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const formatDate = (pos: ApifyPositionFlat, which: 'start' | 'end'): string | undefined => {
      // Try timePeriod first (structured), then fall back to string field
      const tp = which === 'start' ? pos.timePeriod?.startDate : pos.timePeriod?.endDate;
      if (tp?.year) {
        return tp.month ? `${months[tp.month - 1]} ${tp.year}` : `${tp.year}`;
      }
      const str = which === 'start' ? pos.startDate : pos.endDate;
      return str || undefined;
    };

    // Flatten both formats into a single ApifyPositionFlat[]
    const flatPositions: ApifyPositionFlat[] = [];
    for (const pos of profile.positions) {
      const grouped = pos as ApifyPositionGrouped;
      if (grouped.positions && Array.isArray(grouped.positions)) {
        // Format B: company-grouped — extract company name and flatten nested positions
        const companyName = grouped.company?.name || grouped.companyName;
        for (const sub of grouped.positions) {
          flatPositions.push({
            ...sub,
            companyName: sub.companyName || companyName,
          });
        }
      } else {
        // Format A: flat position with title at top level
        flatPositions.push(pos as ApifyPositionFlat);
      }
    }

    const rawCount = flatPositions.length;
    positions = flatPositions
      .filter(p => p.title)
      .map(p => ({
        title: p.title!,
        companyName: p.companyName,
        locationName: p.locationName,
        startDate: formatDate(p, 'start'),
        endDate: formatDate(p, 'end'),
      }));
    if (positions.length === 0) {
      if (rawCount > 0) {
        console.log(`[Enrich] Mapping: ${rawCount} positions found but all filtered (no title)`);
      }
      positions = null;
    }
  }

  // Map certifications
  let certifications: LinkedInEnrichmentData['certifications'] = null;
  if (profile.certifications && profile.certifications.length > 0) {
    certifications = profile.certifications
      .filter(c => c.name)
      .map(c => ({ name: c.name!, authority: c.authority }));
    if (certifications.length === 0) {
      console.log(`[Enrich] Mapping: ${profile.certifications.length} certifications found but all filtered (no name)`);
      certifications = null;
    }
  }

  // Map languages
  let languages: LinkedInEnrichmentData['languages'] = null;
  if (profile.languages && profile.languages.length > 0) {
    languages = profile.languages
      .filter(l => l.name)
      .map(l => ({ name: l.name!, proficiency: l.proficiency }));
    if (languages.length === 0) {
      console.log(`[Enrich] Mapping: ${profile.languages.length} languages found but all filtered (no name)`);
      languages = null;
    }
  }

  // Map honors
  let honors: LinkedInEnrichmentData['honors'] = null;
  if (profile.honors && profile.honors.length > 0) {
    honors = profile.honors
      .filter(h => h.title)
      .map(h => ({ title: h.title!, issuer: h.issuer, description: h.description }));
    if (honors.length === 0) {
      console.log(`[Enrich] Mapping: ${profile.honors.length} honors found but all filtered (no title)`);
      honors = null;
    }
  }

  return {
    linkedinFirstName: profile.firstName || null,
    linkedinLastName: profile.lastName || null,
    headline: profile.headline || profile.occupation || null,
    about: profile.summary || null,
    jobTitle: profile.jobTitle || profile.positions?.[0]?.title || null,
    companyName: profile.companyName || profile.currentCompany?.name || null,
    companyLinkedinUrl,
    industry: profile.industryName || profile.currentCompany?.industries?.[0]?.name || null,
    country: profile.geoCountryName || profile.countryCode || null,
    location: profile.geoLocationName || null,
    followersCount: profile.currentCompany?.followerCount ?? null,
    education,
    skills: profile.skills && profile.skills.length > 0 ? profile.skills : null,
    photoLinkedin: profile.pictureUrl || null,
    positions,
    certifications,
    languages,
    honors,
  };
}

// ============================================================
// Main enrichment function (batch processing via Apify)
// ============================================================

/**
 * Enrich multiple contacts with progress callback using Apify batch processing
 *
 * Flow:
 *   Phase 1: Build URL list, create identifier->contact map, submit batch(es) to Apify
 *   Phase 2: Poll for completion with progress callbacks
 *   Phase 3: Retrieve results, match by publicIdentifier, store enrichment data
 */
export async function enrichContacts(
  includeAlreadyEnriched: boolean,
  onProgress?: (progress: EnrichmentProgress) => void,
  limit?: number
): Promise<EnrichmentComplete> {
  if (!isLinkedInEnrichmentConfigured()) {
    throw new Error('APIFY_API_TOKEN not configured');
  }

  let contacts = getContactsForEnrichment(includeAlreadyEnriched);

  // Apply limit if specified
  if (limit && limit > 0) {
    contacts = contacts.slice(0, limit);
  }

  const total = contacts.length;
  console.log(`[Enrich] Starting enrichment for ${total} contacts (includeAlreadyEnriched=${includeAlreadyEnriched}, limit=${limit ?? 'none'})`);

  if (total === 0) {
    return { succeeded: 0, failed: 0, errors: [], enrichedContacts: [] };
  }

  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ contactId: number; contactName: string; reason: string }> = [];
  const enrichedContacts: EnrichedContactInfo[] = [];

  // Phase 1: Build URL list and identifier->contact map
  const identifierToContacts = new Map<string, ContactForEnrichment[]>();
  const allUrls: string[] = [];
  const contactsWithoutIdentifier: ContactForEnrichment[] = [];

  for (const contact of contacts) {
    const normalizedUrl = normalizeLinkedInUrl(contact.linkedinUrl);
    const identifier = extractPublicIdentifier(normalizedUrl);

    if (identifier) {
      const existing = identifierToContacts.get(identifier) || [];
      existing.push(contact);
      identifierToContacts.set(identifier, existing);
      // Only add the URL once per unique identifier
      if (existing.length === 1) {
        allUrls.push(normalizedUrl);
      }
    } else {
      contactsWithoutIdentifier.push(contact);
    }
  }

  // Mark contacts without valid identifiers as failed
  for (const contact of contactsWithoutIdentifier) {
    failed++;
    const reason = `Could not extract LinkedIn identifier from URL: ${contact.linkedinUrl}`;
    errors.push({
      contactId: contact.contactId,
      contactName: contact.displayName,
      reason,
    });
    storeEnrichmentFailure(contact.contactId, reason);
    console.log(`[Enrich] FAILED ${contact.displayName}: invalid LinkedIn URL "${contact.linkedinUrl}"`);
  }

  if (allUrls.length === 0) {
    console.log('[Enrich] No valid LinkedIn URLs to process');
    return { succeeded, failed, errors, enrichedContacts };
  }

  // Split URLs into batches of MAX_URLS_PER_RUN
  const batches: string[][] = [];
  for (let i = 0; i < allUrls.length; i += MAX_URLS_PER_RUN) {
    batches.push(allUrls.slice(i, i + MAX_URLS_PER_RUN));
  }

  console.log(`[Enrich] Processing ${allUrls.length} unique URLs in ${batches.length} batch(es)`);

  // Report initial progress
  if (onProgress) {
    onProgress({
      current: 0,
      total,
      succeeded,
      failed,
      currentContact: 'Submitting batch to Apify...',
    });
  }

  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batchUrls = batches[batchIndex];
    const batchLabel = batches.length > 1 ? ` (batch ${batchIndex + 1}/${batches.length})` : '';

    try {
      // Phase 1: Start the Apify run
      const { runId, datasetId: batchDatasetId } = await startApifyRun(batchUrls);
      console.log(`[Enrich] Batch ${batchIndex + 1}/${batches.length}: runId=${runId}, datasetId=${batchDatasetId} ← save this for recovery`);

      // Phase 2: Poll for completion
      if (onProgress) {
        onProgress({
          current: 0,
          total,
          succeeded,
          failed,
          currentContact: `Waiting for Apify results${batchLabel}...`,
        });
      }

      const datasetId = await waitForApifyRun(runId, (pollCount, status, elapsedMs) => {
        if (onProgress) {
          onProgress({
            current: 0,
            total,
            succeeded,
            failed,
            currentContact: `Apify ${status}${batchLabel} (${Math.round(elapsedMs / 1000)}s, poll #${pollCount})`,
          });
        }
      });

      // Phase 3: Retrieve and process results
      if (onProgress) {
        onProgress({
          current: 0,
          total,
          succeeded,
          failed,
          currentContact: `Processing results${batchLabel}...`,
        });
      }

      const results = await getApifyResults(datasetId);
      const batchState: ProcessResultsState = { succeeded, failed, errors, enrichedContacts };
      const matchedIdentifiers = await processApifyResults(
        results, identifierToContacts, batchState, total, onProgress
      );
      // Sync counters back from shared state
      succeeded = batchState.succeeded;
      failed = batchState.failed;

      // Mark unmatched contacts as failed
      for (const [identifier, contactsForId] of identifierToContacts.entries()) {
        // Only process identifiers that were in this batch
        // Check both /in/ and /pub/ URL formats
        const inBatch = batchUrls.some(url => {
          const urlIdentifier = extractPublicIdentifier(url);
          return urlIdentifier === identifier;
        });
        if (!inBatch) {
          continue;
        }

        if (!matchedIdentifiers.has(identifier)) {
          for (const contact of contactsForId) {
            failed++;
            errors.push({
              contactId: contact.contactId,
              contactName: contact.displayName,
              reason: 'Profile not found in Apify results',
            });
            storeEnrichmentFailure(contact.contactId, 'Profile not found in Apify results');
            console.log(`[Enrich] FAILED ${contact.displayName}: not found in results (identifier: ${identifier})`);
          }
        }
      }
    } catch (error) {
      // If the entire batch fails, mark all contacts in this batch as failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Enrich] Batch${batchLabel} failed: ${errorMessage}`);

      for (const url of batchUrls) {
        const identifier = extractPublicIdentifier(url);
        if (identifier) {
          const contactsForId = identifierToContacts.get(identifier);
          if (contactsForId) {
            for (const contact of contactsForId) {
              failed++;
              const reason = `Batch failed: ${errorMessage}`;
              errors.push({
                contactId: contact.contactId,
                contactName: contact.displayName,
                reason,
              });
              storeEnrichmentFailure(contact.contactId, reason);
            }
          }
        }
      }
    }
  }

  console.log(`[Enrich] Enrichment complete: ${succeeded} succeeded, ${failed} failed out of ${total} total`);

  // Final progress update
  if (onProgress) {
    onProgress({
      current: total,
      total,
      succeeded,
      failed,
    });
  }

  return {
    succeeded,
    failed,
    errors,
    enrichedContacts,
  };
}

// ============================================================
// Shared result-processing helper
// ============================================================

interface ProcessResultsState {
  succeeded: number;
  failed: number;
  errors: Array<{ contactId: number; contactName: string; reason: string }>;
  enrichedContacts: EnrichedContactInfo[];
}

/**
 * Process Apify results: match profiles to contacts, store enrichment data, download photos.
 * Shared by enrichContacts() batch processing and recoverFromDataset().
 */
async function processApifyResults(
  results: ApifyProfileResult[],
  identifierToContacts: Map<string, ContactForEnrichment[]>,
  state: ProcessResultsState,
  total: number,
  onProgress?: (progress: EnrichmentProgress) => void
): Promise<Set<string>> {
  const matchedIdentifiers = new Set<string>();

  for (const profile of results) {
    const identifier = profile.publicIdentifier?.toLowerCase();
    if (!identifier) {
      continue;
    }

    const matchingContacts = identifierToContacts.get(identifier);
    if (!matchingContacts) {
      continue;
    }

    matchedIdentifiers.add(identifier);

    // Log raw profile data summary for debugging
    const contactName = matchingContacts[0]?.displayName || identifier;
    console.log(
      `[Enrich] Profile data for ${contactName}: ` +
      `positions=${profile.positions?.length ?? 0}, ` +
      `certs=${profile.certifications?.length ?? 0}, ` +
      `langs=${profile.languages?.length ?? 0}, ` +
      `honors=${profile.honors?.length ?? 0}, ` +
      `skills=${profile.skills?.length ?? 0}, ` +
      `education=${profile.educations?.length ?? 0}, ` +
      `photo=${profile.pictureUrl ? 'yes' : 'no'}`
    );

    const enrichmentData = mapApifyToEnrichmentData(profile);

    // Check if we got meaningful data
    const hasMeaningfulData = enrichmentData.linkedinFirstName
      || enrichmentData.headline
      || enrichmentData.companyName;

    for (const contact of matchingContacts) {
      if (!hasMeaningfulData) {
        state.failed++;
        state.errors.push({
          contactId: contact.contactId,
          contactName: contact.displayName,
          reason: 'No useful profile data returned',
        });
        storeEnrichmentFailure(contact.contactId, 'No useful profile data returned');
        console.log(`[Enrich] FAILED ${contact.displayName}: no useful data`);
        continue;
      }

      storeEnrichmentData(contact.contactId, enrichmentData, JSON.stringify(profile));
      clearEnrichmentFailure(contact.contactId);
      state.succeeded++;

      // Download LinkedIn photo if available and contact has no existing photo
      if (profile.pictureUrl) {
        try {
          const db = getDatabase();
          const contactRow = db.prepare('SELECT photo_hash FROM contacts WHERE id = ?').get(contact.contactId) as { photo_hash: string | null } | undefined;
          if (contactRow && !contactRow.photo_hash) {
            const hash = await downloadAndProcessImage(profile.pictureUrl, `linkedin-contact-${contact.contactId}`);
            if (hash) {
              db.prepare('UPDATE contacts SET photo_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(hash, contact.contactId);
              console.log(`[Enrich] Downloaded LinkedIn photo for ${contact.displayName}`);
            }
          }
        } catch (photoError) {
          console.log(`[Enrich] Failed to download photo for ${contact.displayName}: ${photoError instanceof Error ? photoError.message : photoError}`);
        }
      }

      const storedData = getEnrichmentDataForContact(contact.contactId);
      state.enrichedContacts.push({
        contactId: contact.contactId,
        contactName: contact.displayName,
        headline: storedData?.headline ?? null,
        jobTitle: storedData?.jobTitle ?? null,
        companyName: storedData?.companyName ?? null,
      });

      console.log(`[Enrich] SUCCESS ${contact.displayName}`);

      if (onProgress) {
        onProgress({
          current: state.succeeded + state.failed,
          total,
          succeeded: state.succeeded,
          failed: state.failed,
          currentContact: contact.displayName,
        });
      }
    }
  }

  return matchedIdentifiers;
}

// ============================================================
// Dataset recovery function
// ============================================================

/**
 * Recover enrichment data from an existing Apify dataset.
 * Skips submit+poll phases — goes straight to fetching and processing results.
 */
export async function recoverFromDataset(
  datasetId: string,
  onProgress?: (progress: EnrichmentProgress) => void
): Promise<EnrichmentComplete> {
  if (!isLinkedInEnrichmentConfigured()) {
    throw new Error('APIFY_API_TOKEN not configured');
  }

  console.log(`[Enrich] Recovering from dataset ${datasetId}`);

  // Build identifier->contact map from ALL contacts with LinkedIn URLs
  const contacts = getContactsForEnrichment(true);
  const identifierToContacts = new Map<string, ContactForEnrichment[]>();

  for (const contact of contacts) {
    const normalizedUrl = normalizeLinkedInUrl(contact.linkedinUrl);
    const identifier = extractPublicIdentifier(normalizedUrl);
    if (identifier) {
      const existing = identifierToContacts.get(identifier) || [];
      existing.push(contact);
      identifierToContacts.set(identifier, existing);
    }
  }

  if (onProgress) {
    onProgress({ current: 0, total: 0, succeeded: 0, failed: 0, currentContact: 'Fetching dataset results...' });
  }

  const results = await getApifyResults(datasetId);
  const total = results.length;

  console.log(`[Enrich] Recovery: ${results.length} profiles to process against ${identifierToContacts.size} known contacts`);

  if (onProgress) {
    onProgress({ current: 0, total, succeeded: 0, failed: 0, currentContact: 'Processing results...' });
  }

  const state: ProcessResultsState = { succeeded: 0, failed: 0, errors: [], enrichedContacts: [] };
  await processApifyResults(results, identifierToContacts, state, total, onProgress);

  console.log(`[Enrich] Recovery complete: ${state.succeeded} succeeded, ${state.failed} failed`);

  if (onProgress) {
    onProgress({ current: total, total, succeeded: state.succeeded, failed: state.failed });
  }

  return {
    succeeded: state.succeeded,
    failed: state.failed,
    errors: state.errors,
    enrichedContacts: state.enrichedContacts,
  };
}
