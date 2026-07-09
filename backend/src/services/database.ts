import type { Database as DatabaseType } from 'better-sqlite3';

/**
 * Recursively collect every string value from a JSON-encoded column so it can
 * be indexed for search. Handles string arrays (skills, education) and object
 * arrays (positions: [{title, companyName, ...}]) alike. Returns [] on any
 * parse failure so a malformed value never breaks index building.
 */
function collectJsonStrings(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (value.trim()) out.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) walk(item);
    }
  };
  walk(parsed);
  return out;
}

/**
 * Build searchable text for a contact by concatenating all searchable fields
 */
export function buildSearchableText(database: DatabaseType, contactId: number): string {
  const parts: string[] = [];

  // Contact main fields
  const contact = database.prepare(`
    SELECT first_name, last_name, display_name, company, title, notes
    FROM contacts WHERE id = ?
  `).get(contactId) as {
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    company: string | null;
    title: string | null;
    notes: string | null;
  } | undefined;

  if (contact) {
    if (contact.first_name) parts.push(contact.first_name);
    if (contact.last_name) parts.push(contact.last_name);
    if (contact.display_name) parts.push(contact.display_name);
    if (contact.company) parts.push(contact.company);
    if (contact.title) parts.push(contact.title);
    if (contact.notes) parts.push(contact.notes);
  }

  // Emails
  const emails = database.prepare(`
    SELECT email FROM contact_emails WHERE contact_id = ?
  `).all(contactId) as Array<{ email: string }>;
  for (const e of emails) {
    parts.push(e.email);
    // Also index the address split on @ and . so the domain/TLD are searchable
    // (e.g. "gmail" matches john@gmail.com), not just the leading local-part.
    parts.push(e.email.replace(/[@.]/g, ' '));
  }

  // Phones
  const phones = database.prepare(`
    SELECT phone_display FROM contact_phones WHERE contact_id = ?
  `).all(contactId) as Array<{ phone_display: string }>;
  for (const p of phones) {
    parts.push(p.phone_display);
  }

  // Addresses
  const addresses = database.prepare(`
    SELECT street, city, state, postal_code, country FROM contact_addresses WHERE contact_id = ?
  `).all(contactId) as Array<{
    street: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
  }>;
  for (const a of addresses) {
    if (a.street) parts.push(a.street);
    if (a.city) parts.push(a.city);
    if (a.state) parts.push(a.state);
    if (a.postal_code) parts.push(a.postal_code);
    if (a.country) parts.push(a.country);
  }

  // Social profiles
  const socials = database.prepare(`
    SELECT username, profile_url FROM contact_social_profiles WHERE contact_id = ?
  `).all(contactId) as Array<{ username: string | null; profile_url: string | null }>;
  for (const s of socials) {
    if (s.username) parts.push(s.username);
    if (s.profile_url) {
      parts.push(s.profile_url);
      parts.push(s.profile_url.replace(/[^a-zA-Z0-9]+/g, ' '));
    }
  }

  // Categories
  const categories = database.prepare(`
    SELECT category FROM contact_categories WHERE contact_id = ?
  `).all(contactId) as Array<{ category: string }>;
  for (const c of categories) {
    parts.push(c.category);
  }

  // Instant messages
  const ims = database.prepare(`
    SELECT handle FROM contact_instant_messages WHERE contact_id = ?
  `).all(contactId) as Array<{ handle: string }>;
  for (const im of ims) {
    parts.push(im.handle);
  }

  // URLs (labels + the URL itself)
  const urls = database.prepare(`
    SELECT label, url FROM contact_urls WHERE contact_id = ?
  `).all(contactId) as Array<{ label: string | null; url: string | null }>;
  for (const u of urls) {
    if (u.label) parts.push(u.label);
    if (u.url) {
      parts.push(u.url);
      parts.push(u.url.replace(/[^a-zA-Z0-9]+/g, ' '));
    }
  }

  // Related people
  const related = database.prepare(`
    SELECT name FROM contact_related_people WHERE contact_id = ?
  `).all(contactId) as Array<{ name: string }>;
  for (const r of related) {
    parts.push(r.name);
  }

  // LinkedIn enrichment (plain-text columns + parsed JSON-array columns)
  const enrichment = database.prepare(`
    SELECT headline, about, job_title, company_name, industry, country, location,
           education, skills, positions, certifications, languages, honors
    FROM linkedin_enrichment WHERE contact_id = ?
  `).get(contactId) as {
    headline: string | null;
    about: string | null;
    job_title: string | null;
    company_name: string | null;
    industry: string | null;
    country: string | null;
    location: string | null;
    education: string | null;
    skills: string | null;
    positions: string | null;
    certifications: string | null;
    languages: string | null;
    honors: string | null;
  } | undefined;

  if (enrichment) {
    if (enrichment.headline) parts.push(enrichment.headline);
    if (enrichment.about) parts.push(enrichment.about);
    if (enrichment.job_title) parts.push(enrichment.job_title);
    if (enrichment.company_name) parts.push(enrichment.company_name);
    if (enrichment.industry) parts.push(enrichment.industry);
    if (enrichment.country) parts.push(enrichment.country);
    if (enrichment.location) parts.push(enrichment.location);
    // JSON-encoded columns: flatten to their string values (e.g. position
    // titles + companies, skill names, degrees).
    parts.push(...collectJsonStrings(enrichment.education));
    parts.push(...collectJsonStrings(enrichment.skills));
    parts.push(...collectJsonStrings(enrichment.positions));
    parts.push(...collectJsonStrings(enrichment.certifications));
    parts.push(...collectJsonStrings(enrichment.languages));
    parts.push(...collectJsonStrings(enrichment.honors));
  }

  return parts.join(' ');
}

/**
 * Rebuild the unified FTS index for a single contact
 */
export function rebuildContactSearch(database: DatabaseType, contactId: number): void {
  // Delete existing entry
  database.prepare('DELETE FROM contacts_unified_fts WHERE rowid = ?').run(contactId);

  // Build searchable text
  const searchableText = buildSearchableText(database, contactId);

  // Insert new entry if there's text to index
  if (searchableText.trim()) {
    database.prepare('INSERT INTO contacts_unified_fts(rowid, searchable_text) VALUES (?, ?)').run(contactId, searchableText);
  }
}

/**
 * Rebuild the unified FTS index for all contacts
 */
export function rebuildAllContactSearch(database: DatabaseType): void {
  // Clear existing index
  database.prepare('DELETE FROM contacts_unified_fts').run();

  // Get all contact IDs
  const contacts = database.prepare('SELECT id FROM contacts').all() as Array<{ id: number }>;

  // Rebuild each contact's search entry
  for (const contact of contacts) {
    const searchableText = buildSearchableText(database, contact.id);
    if (searchableText.trim()) {
      database.prepare('INSERT INTO contacts_unified_fts(rowid, searchable_text) VALUES (?, ?)').run(contact.id, searchableText);
    }
  }
}

/**
 * Delete a contact from the unified FTS index
 */
export function deleteContactFromSearch(database: DatabaseType, contactId: number): void {
  database.prepare('DELETE FROM contacts_unified_fts WHERE rowid = ?').run(contactId);
}

/**
 * Delete multiple contacts from the unified FTS index
 */
export function deleteContactsFromSearch(database: DatabaseType, contactIds: number[]): void {
  if (contactIds.length === 0) return;
  const placeholders = contactIds.map(() => '?').join(',');
  database.prepare(`DELETE FROM contacts_unified_fts WHERE rowid IN (${placeholders})`).run(...contactIds);
}
