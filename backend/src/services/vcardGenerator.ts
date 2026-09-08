/**
 * vCard Generator
 * ================
 * Generates vCard 3.0 format from database contact records.
 * Used to regenerate vCards with properly formatted addresses.
 */

import { formatAddress, type AddressInput } from './addressFormatter.js';

/**
 * Contact data for vCard generation
 */
export interface ContactForVcard {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  company: string | null;
  title: string | null;
  notes: string | null;
  birthday: string | null;
  emails: Array<{
    email: string;
    type: string | null;
    isPrimary: boolean;
  }>;
  phones: Array<{
    phone: string;
    phoneDisplay: string;
    type: string | null;
    isPrimary: boolean;
  }>;
  addresses: Array<{
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    type: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }>;
  socialProfiles: Array<{
    platform: string;
    username: string | null;
    profileUrl: string | null;
  }>;
  categories: string[];
  photoBase64?: string;
}

/**
 * Escape special characters for vCard values
 * vCard 3.0 requires escaping of backslash, semicolon, comma, and newline
 */
function escapeVcardValue(value: string | null): string {
  if (!value) return '';
  return value
    .replace(/\\/g, '\\\\')   // Escape backslash first
    .replace(/;/g, '\\;')      // Escape semicolon
    .replace(/,/g, '\\,')      // Escape comma
    .replace(/\n/g, '\\n');    // Escape newline
}

/**
 * Fold long lines according to vCard spec (max 75 characters per line)
 * Lines are continued with a space on the next line
 */
function foldLine(line: string, maxLength: number = 75): string {
  if (line.length <= maxLength) return line;

  const lines: string[] = [];
  let currentLine = line;

  while (currentLine.length > maxLength) {
    // Find a good break point (don't break in the middle of a UTF-8 sequence)
    let breakPoint = maxLength;
    while (breakPoint > 0 && currentLine.charCodeAt(breakPoint) >= 0x80 && currentLine.charCodeAt(breakPoint) < 0xC0) {
      breakPoint--;
    }
    if (breakPoint === 0) breakPoint = maxLength; // Fallback

    lines.push(currentLine.substring(0, breakPoint));
    currentLine = ' ' + currentLine.substring(breakPoint); // Continuation with space
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.join('\r\n');
}

/**
 * Generate TYPE parameter string for vCard properties
 */
function getTypeParam(type: string | null): string {
  if (!type) return '';
  const upperType = type.toUpperCase();
  // Common vCard types
  if (['HOME', 'WORK', 'CELL', 'VOICE', 'FAX', 'PAGER', 'OTHER'].includes(upperType)) {
    return `;TYPE=${upperType}`;
  }
  // Custom types get wrapped in X-
  return `;TYPE=${escapeVcardValue(type)}`;
}

/**
 * Format an ADR (address) property value
 * Format: PO Box;Extended Address;Street;City;State;Postal Code;Country
 */
function formatAdrValue(address: AddressInput): string {
  const parts = [
    '',                                    // PO Box
    '',                                    // Extended Address
    escapeVcardValue(address.street),      // Street
    escapeVcardValue(address.city),        // City
    escapeVcardValue(address.state),       // State/Province
    escapeVcardValue(address.postalCode),  // Postal Code
    escapeVcardValue(address.country)      // Country
  ];
  return parts.join(';');
}

/**
 * Generate a LABEL property with formatted address
 */
function formatLabelValue(address: AddressInput): string {
  const formatted = formatAddress(address, { includeCountry: true });
  // Replace newlines with \n for vCard format
  return escapeVcardValue(formatted.display.replace(/\n/g, '\\n'));
}

/**
 * Generate a vCard 3.0 string from contact data
 */
export function generateVcard(contact: ContactForVcard): string {
  const lines: string[] = [];

  // Required vCard header
  lines.push('BEGIN:VCARD');
  lines.push('VERSION:3.0');

  // FN (Formatted Name) - required
  lines.push(`FN:${escapeVcardValue(contact.displayName)}`);

  // N (Structured Name)
  const firstName = escapeVcardValue(contact.firstName);
  const lastName = escapeVcardValue(contact.lastName);
  lines.push(`N:${lastName};${firstName};;;`);

  // ORG (Organization)
  if (contact.company) {
    lines.push(`ORG:${escapeVcardValue(contact.company)}`);
  }

  // TITLE
  if (contact.title) {
    lines.push(`TITLE:${escapeVcardValue(contact.title)}`);
  }

  // EMAIL entries
  for (const email of contact.emails) {
    const typeParam = getTypeParam(email.type);
    const prefParam = email.isPrimary ? ';PREF=1' : '';
    lines.push(`EMAIL${typeParam}${prefParam}:${email.email}`);
  }

  // TEL entries
  for (const phone of contact.phones) {
    const typeParam = getTypeParam(phone.type);
    const prefParam = phone.isPrimary ? ';PREF=1' : '';
    // Use the display format which is more human-readable
    lines.push(`TEL${typeParam}${prefParam}:${phone.phoneDisplay || phone.phone}`);
  }

  // ADR entries with country-formatted LABEL.
  // Geocoded addresses get an Apple-style item group so a per-address GEO
  // property can be tied to its ADR (vCard 3.0 GEO is otherwise card-level).
  let itemCounter = 0;
  for (const address of contact.addresses) {
    const typeParam = getTypeParam(address.type);
    const adrValue = formatAdrValue(address);
    const hasGeo = address.latitude != null && address.longitude != null;
    const group = hasGeo ? `item${++itemCounter}.` : '';
    lines.push(`${group}ADR${typeParam}:${adrValue}`);

    // Add LABEL with formatted address
    const labelValue = formatLabelValue(address);
    if (labelValue) {
      lines.push(`${group}LABEL${typeParam}:${labelValue}`);
    }

    if (hasGeo) {
      lines.push(`${group}GEO:${address.latitude};${address.longitude}`);
    }
  }

  // BDAY (Birthday)
  if (contact.birthday) {
    // Try to format as ISO date (YYYY-MM-DD or YYYYMMDD)
    const bday = contact.birthday.replace(/-/g, '');
    lines.push(`BDAY:${bday}`);
  }

  // NOTE
  if (contact.notes) {
    lines.push(`NOTE:${escapeVcardValue(contact.notes)}`);
  }

  // CATEGORIES
  if (contact.categories.length > 0) {
    lines.push(`CATEGORIES:${contact.categories.map(escapeVcardValue).join(',')}`);
  }

  // X-SOCIALPROFILE entries
  for (const profile of contact.socialProfiles) {
    if (profile.profileUrl) {
      const platformParam = profile.platform ? `;X-SERVICE=${escapeVcardValue(profile.platform)}` : '';
      const usernameParam = profile.username ? `;X-USER=${escapeVcardValue(profile.username)}` : '';
      lines.push(`X-SOCIALPROFILE${platformParam}${usernameParam}:${profile.profileUrl}`);
    }
  }

  // PHOTO (base64 JPEG)
  if (contact.photoBase64) {
    lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${contact.photoBase64}`);
  }

  // Required vCard footer
  lines.push('END:VCARD');

  // Fold long lines and join
  return lines.map(line => foldLine(line)).join('\r\n');
}

/**
 * Generate vCards for multiple contacts
 */
export function generateVcards(contacts: ContactForVcard[]): string {
  return contacts.map(generateVcard).join('\r\n');
}

/**
 * Address with coordinates for GEO injection into a raw vCard
 */
export interface AddressForGeoInjection {
  street: string | null;
  city: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Unescape a vCard component value (\\ \; \, \n) */
function unescapeVcardValue(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, ch) =>
    ch === 'n' || ch === 'N' ? '\n' : ch
  );
}

/** Split a vCard compound value on unescaped semicolons */
function splitVcardComponents(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let escaped = false;
  for (const ch of value) {
    if (escaped) {
      current += ch;
      escaped = false;
    } else if (ch === '\\') {
      current += ch;
      escaped = true;
    } else if (ch === ';') {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/** Normalize an address part for fuzzy equality (case, whitespace, newlines) */
function normalizeAddressPart(value: string | null): string {
  if (!value) return '';
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

interface LogicalLine {
  /** Unfolded property text */
  text: string;
  /** Indices into the raw line array (inclusive) */
  startIdx: number;
  endIdx: number;
}

/**
 * Inject per-address GEO properties into an existing raw vCard, mirroring how
 * the export injects the current photo. Each DB address with coordinates is
 * matched to an ADR line (by street + city/postal, falling back to position);
 * the ADR's item group carries the GEO, with a new group added when the ADR
 * is ungrouped. Any pre-existing GEO properties are replaced.
 */
export function injectGeoIntoVcard(vcardText: string, addresses: AddressForGeoInjection[]): string {
  const geocoded = addresses.filter(a => a.latitude != null && a.longitude != null);
  if (geocoded.length === 0) return vcardText;

  const eol = vcardText.includes('\r\n') ? '\r\n' : '\n';
  const rawLines = vcardText.split(/\r?\n/);

  // Build logical (unfolded) lines with their raw-line ranges
  const logical: LogicalLine[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if ((line.startsWith(' ') || line.startsWith('\t')) && logical.length > 0) {
      const prev = logical[logical.length - 1];
      prev.text += line.substring(1);
      prev.endIdx = i;
    } else {
      logical.push({ text: line, startIdx: i, endIdx: i });
    }
  }

  const geoRe = /^(?:[^.;:]+\.)?GEO[;:]/i;
  const adrRe = /^(?:([^.;:]+)\.)?ADR[;:]/i;
  const labelRe = /^LABEL[;:]/i;

  // Collect existing group names to avoid collisions when adding new ones
  const existingGroups = new Set<string>();
  for (const ll of logical) {
    const m = ll.text.match(/^([^.;:]+)\./);
    if (m) existingGroups.add(m[1].toLowerCase());
  }
  let newGroupCounter = 0;
  function nextGroup(): string {
    let name: string;
    do {
      name = `yello${++newGroupCounter}`;
    } while (existingGroups.has(name));
    existingGroups.add(name);
    return name;
  }

  // Parse ADR logical lines
  interface AdrEntry {
    logicalIdx: number;
    group: string | null;
    street: string;
    city: string;
    postalCode: string;
    matchedAddress: AddressForGeoInjection | null;
  }
  const adrEntries: AdrEntry[] = [];
  for (let li = 0; li < logical.length; li++) {
    const m = logical[li].text.match(adrRe);
    if (!m) continue;
    const colonIdx = logical[li].text.indexOf(':');
    if (colonIdx === -1) continue;
    const components = splitVcardComponents(logical[li].text.substring(colonIdx + 1));
    adrEntries.push({
      logicalIdx: li,
      group: m[1] ?? null,
      street: normalizeAddressPart(unescapeVcardValue(components[2] ?? '')),
      city: normalizeAddressPart(unescapeVcardValue(components[3] ?? '')),
      postalCode: normalizeAddressPart(unescapeVcardValue(components[5] ?? '')),
      matchedAddress: null
    });
  }
  if (adrEntries.length === 0) return vcardText;

  // Match geocoded DB addresses to ADR lines: street + (city or postal) first
  const unmatched: AddressForGeoInjection[] = [];
  for (const addr of geocoded) {
    const street = normalizeAddressPart(addr.street);
    const city = normalizeAddressPart(addr.city);
    const postal = normalizeAddressPart(addr.postalCode);
    const entry = adrEntries.find(e =>
      !e.matchedAddress &&
      street !== '' &&
      e.street === street &&
      (e.city === city || e.postalCode === postal)
    );
    if (entry) {
      entry.matchedAddress = addr;
    } else {
      unmatched.push(addr);
    }
  }
  // Positional fallback when the ADR count matches the DB address count
  if (unmatched.length > 0 && adrEntries.length === addresses.length) {
    for (let i = 0; i < addresses.length; i++) {
      const addr = addresses[i];
      if (addr.latitude == null || addr.longitude == null) continue;
      if (!unmatched.includes(addr)) continue;
      if (!adrEntries[i].matchedAddress) {
        adrEntries[i].matchedAddress = addr;
      }
    }
  }

  // Rebuild the vCard: drop existing GEO lines, group ungrouped matched ADRs
  // (plus their adjacent ungrouped LABEL), and insert GEO after each match.
  const output: string[] = [];
  for (let li = 0; li < logical.length; li++) {
    const ll = logical[li];
    if (geoRe.test(ll.text)) continue; // replaced below

    const entry = adrEntries.find(e => e.logicalIdx === li && e.matchedAddress);
    if (!entry) {
      for (let i = ll.startIdx; i <= ll.endIdx; i++) output.push(rawLines[i]);
      continue;
    }

    const group = entry.group ?? nextGroup();
    const prefix = entry.group ? '' : `${group}.`;
    output.push(prefix + rawLines[ll.startIdx]);
    for (let i = ll.startIdx + 1; i <= ll.endIdx; i++) output.push(rawLines[i]);

    // Keep an adjacent ungrouped LABEL tied to this address under the same group
    const next = logical[li + 1];
    if (!entry.group && next && labelRe.test(next.text)) {
      output.push(`${group}.` + rawLines[next.startIdx]);
      for (let i = next.startIdx + 1; i <= next.endIdx; i++) output.push(rawLines[i]);
      li++;
    }

    const addr = entry.matchedAddress!;
    output.push(`${group}.GEO:${addr.latitude};${addr.longitude}`);
  }

  return output.join(eol);
}
