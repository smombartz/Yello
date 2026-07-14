import type { Database as DatabaseType } from 'better-sqlite3';
import type { ParsedContact } from './vcardParser.js';
import { namesMatch } from './nameMatchingService.js';

/**
 * An incoming contact carrying whatever stable external identifier its source
 * provides: Google's People API resourceName, or a vCard UID (iCloud/file).
 */
export type IncomingContact = ParsedContact & { googleResourceName?: string | null };

export interface IncomingMatch {
  incoming: IncomingContact;
  existingContactId: number;
  existingDisplayName: string;
  confidence: 'very_high' | 'high' | 'medium';
  matchReasons: string[];
  /** True when the matched contact is archived — importing it again would resurrect it. */
  existingArchived: boolean;
}

export interface MatchResult {
  newContacts: IncomingContact[];
  matches: IncomingMatch[];
  stats: { total: number; new: number; matched: number };
}

interface DbContactMatchData {
  id: number;
  displayName: string;
  emails: string[];
  phones: string[];
  socials: string[];
  googleResourceName: string | null;
  icloudUid: string | null;
  archived: boolean;
}

/**
 * Load existing contact match data from the database.
 *
 * Archived contacts are deliberately included. If they were excluded, a contact
 * the user archived would look brand new on the next import and be re-inserted
 * as a duplicate — exactly the resurrection we're trying to prevent. They are
 * flagged instead, so the caller can surface them rather than silently merge.
 */
function loadExistingContacts(db: DatabaseType): DbContactMatchData[] {
  const contactRows = db.prepare(`
    SELECT id, display_name as displayName, google_resource_name as googleResourceName,
           icloud_uid as icloudUid, archived_at as archivedAt
    FROM contacts
  `).all() as Array<{
    id: number;
    displayName: string;
    googleResourceName: string | null;
    icloudUid: string | null;
    archivedAt: string | null;
  }>;

  const contactMap = new Map<number, DbContactMatchData>();
  for (const row of contactRows) {
    contactMap.set(row.id, {
      id: row.id,
      displayName: row.displayName,
      emails: [],
      phones: [],
      socials: [],
      googleResourceName: row.googleResourceName,
      icloudUid: row.icloudUid,
      archived: row.archivedAt !== null,
    });
  }

  const emailRows = db.prepare(`
    SELECT contact_id, LOWER(email) as email FROM contact_emails
  `).all() as Array<{ contact_id: number; email: string }>;

  for (const row of emailRows) {
    contactMap.get(row.contact_id)?.emails.push(row.email);
  }

  const phoneRows = db.prepare(`
    SELECT contact_id, phone FROM contact_phones WHERE phone != ''
  `).all() as Array<{ contact_id: number; phone: string }>;

  for (const row of phoneRows) {
    contactMap.get(row.contact_id)?.phones.push(row.phone);
  }

  const socialRows = db.prepare(`
    SELECT contact_id, LOWER(platform) || ':' || LOWER(username) as social
    FROM contact_social_profiles
  `).all() as Array<{ contact_id: number; social: string }>;

  for (const row of socialRows) {
    contactMap.get(row.contact_id)?.socials.push(row.social);
  }

  return Array.from(contactMap.values());
}

/**
 * Stable external-identity keys for an incoming contact, most trustworthy first.
 */
function externalKeysOf(contact: IncomingContact): string[] {
  const keys: string[] = [];
  if (contact.googleResourceName) keys.push(`google:${contact.googleResourceName}`);
  if (contact.uid) keys.push(`uid:${contact.uid}`);
  return keys;
}

/**
 * Build inverted indexes from existing contacts for O(1) lookup.
 */
function buildIndexes(existingContacts: DbContactMatchData[]) {
  const emailIndex = new Map<string, number[]>();
  const phoneIndex = new Map<string, number[]>();
  const socialIndex = new Map<string, number[]>();
  const externalIdIndex = new Map<string, number>();

  for (const contact of existingContacts) {
    if (contact.googleResourceName) {
      externalIdIndex.set(`google:${contact.googleResourceName}`, contact.id);
    }
    if (contact.icloudUid) {
      externalIdIndex.set(`uid:${contact.icloudUid}`, contact.id);
    }
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

  return { emailIndex, phoneIndex, socialIndex, externalIdIndex };
}

/**
 * Score an incoming ParsedContact against a single existing DB contact.
 */
function scoreMatch(
  incoming: ParsedContact,
  existing: DbContactMatchData,
): { score: number; reasons: string[]; hasEmail: boolean; hasPhone: boolean; hasSocial: boolean; hasName: boolean } {
  let score = 0;
  const reasons: string[] = [];
  let hasEmail = false;
  let hasPhone = false;
  let hasSocial = false;
  let hasName = false;

  // Email match
  for (const incomingEmail of incoming.emails) {
    const lower = incomingEmail.email.toLowerCase();
    if (existing.emails.includes(lower)) {
      if (!hasEmail) {
        hasEmail = true;
        score += 1;
      }
      reasons.push(`email: ${incomingEmail.email}`);
      break;
    }
  }

  // Phone match
  for (const incomingPhone of incoming.phones) {
    if (existing.phones.includes(incomingPhone.phone)) {
      if (!hasPhone) {
        hasPhone = true;
        score += 1;
      }
      reasons.push(`phone: ${incomingPhone.phoneDisplay || incomingPhone.phone}`);
      break;
    }
  }

  // Social match
  for (const incomingSocial of incoming.socialProfiles) {
    const key = `${(incomingSocial.platform || '').toLowerCase()}:${(incomingSocial.username || '').toLowerCase()}`;
    if (existing.socials.includes(key)) {
      if (!hasSocial) {
        hasSocial = true;
        score += 1;
      }
      reasons.push(`social: ${incomingSocial.platform}/${incomingSocial.username}`);
      break;
    }
  }

  // Name match (using existing namesMatch from nameMatchingService)
  if (namesMatch(incoming.displayName, existing.displayName)) {
    hasName = true;
    score += 1;
    reasons.push(`name: ${incoming.displayName}`);
  }

  return { score, reasons, hasEmail, hasPhone, hasSocial, hasName };
}

/**
 * Determine confidence from match result.
 */
function determineConfidence(
  match: ReturnType<typeof scoreMatch>
): 'very_high' | 'high' | 'medium' | null {
  if (match.score >= 3) return 'very_high';
  if (match.hasEmail && match.hasPhone) return 'very_high';
  if (match.score >= 2) return 'high';

  const exactMatches = (match.hasEmail ? 1 : 0) + (match.hasPhone ? 1 : 0) + (match.hasSocial ? 1 : 0);
  if (exactMatches >= 1 && match.hasName) return 'medium';

  return null;
}

/**
 * Match an array of incoming ParsedContacts against existing DB contacts.
 * Returns categorized results: new contacts vs. matches with confidence levels.
 */
export function matchIncomingContacts(
  db: DatabaseType,
  incoming: IncomingContact[]
): MatchResult {
  const existingContacts = loadExistingContacts(db);
  const indexes = buildIndexes(existingContacts);
  const existingById = new Map(existingContacts.map(c => [c.id, c]));

  const newContacts: IncomingContact[] = [];
  const matches: IncomingMatch[] = [];

  for (const incomingContact of incoming) {
    // A stable external identifier is authoritative: it means this is literally
    // the same source record we imported before, so trust it over any heuristic.
    const externalHit = externalKeysOf(incomingContact)
      .map(key => indexes.externalIdIndex.get(key))
      .find((id): id is number => id !== undefined);

    if (externalHit !== undefined) {
      const existing = existingById.get(externalHit)!;
      matches.push({
        incoming: incomingContact,
        existingContactId: existing.id,
        existingDisplayName: existing.displayName,
        confidence: 'very_high',
        matchReasons: [incomingContact.googleResourceName ? 'same Google contact' : 'same contact (vCard UID)'],
        existingArchived: existing.archived,
      });
      continue;
    }

    // Find all candidate existing contacts that share at least one field
    const candidateIds = new Set<number>();

    for (const email of incomingContact.emails) {
      const ids = indexes.emailIndex.get(email.email.toLowerCase());
      if (ids) ids.forEach(id => candidateIds.add(id));
    }
    for (const phone of incomingContact.phones) {
      const ids = indexes.phoneIndex.get(phone.phone);
      if (ids) ids.forEach(id => candidateIds.add(id));
    }
    for (const social of incomingContact.socialProfiles) {
      const key = `${(social.platform || '').toLowerCase()}:${(social.username || '').toLowerCase()}`;
      const ids = indexes.socialIndex.get(key);
      if (ids) ids.forEach(id => candidateIds.add(id));
    }

    // Score each candidate
    let bestMatch: { existingId: number; confidence: 'very_high' | 'high' | 'medium'; reasons: string[] } | null = null;

    for (const existingId of candidateIds) {
      const existing = existingById.get(existingId)!;
      const matchResult = scoreMatch(incomingContact, existing);
      const confidence = determineConfidence(matchResult);

      if (confidence !== null) {
        if (!bestMatch || confidenceRank(confidence) > confidenceRank(bestMatch.confidence)) {
          bestMatch = { existingId, confidence, reasons: matchResult.reasons };
        }
      }
    }

    if (bestMatch) {
      const existing = existingById.get(bestMatch.existingId)!;
      matches.push({
        incoming: incomingContact,
        existingContactId: bestMatch.existingId,
        existingDisplayName: existing.displayName,
        confidence: bestMatch.confidence,
        matchReasons: bestMatch.reasons,
        existingArchived: existing.archived,
      });
    } else {
      newContacts.push(incomingContact);
    }
  }

  return {
    newContacts,
    matches,
    stats: { total: incoming.length, new: newContacts.length, matched: matches.length },
  };
}

function confidenceRank(c: 'very_high' | 'high' | 'medium'): number {
  return c === 'very_high' ? 3 : c === 'high' ? 2 : 1;
}
