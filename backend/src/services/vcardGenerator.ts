/**
 * vCard Generator
 * ================
 * Generates vCard 3.0 format from database contact records.
 *
 * The database is the only source: typed columns for everything it models,
 * and contact_vcard_properties for every other property of the imported card
 * (PRODID, REV, X-ADDRESSING-GRAMMAR, ...). The stored raw_vcard is not read,
 * so edits, merges and enrichment made after the import reach the export.
 */

import zlib from 'zlib';
import { formatAddress, type AddressInput } from './addressFormatter.js';
import { LINKEDIN_ENRICHMENT_PROPERTY, type ParsedVcardProperty, type VcardParams } from './vcardParser.js';

/** Fields an email, phone or address row carries alongside its value. */
interface TypedEntry {
  type: string | null;
  /** TYPE values after the first, comma-joined */
  extraTypes?: string | null;
  /** X-ABLabel, as written */
  label?: string | null;
  /** Leftover vCard parameters, written after the ones above */
  params?: VcardParams | null;
}

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
  middleName?: string | null;
  namePrefix?: string | null;
  nameSuffix?: string | null;
  nickname?: string | null;
  gender?: string | null;
  /** ORG components after the company, `;`-joined */
  department?: string | null;
  isCompany?: boolean;
  emails: Array<TypedEntry & {
    email: string;
    isPrimary: boolean;
  }>;
  phones: Array<TypedEntry & {
    phone: string;
    phoneDisplay: string;
    isPrimary: boolean;
  }>;
  addresses: Array<TypedEntry & {
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    poBox?: string | null;
    extended?: string | null;
    sublocality?: string | null;
    subadministrativeArea?: string | null;
    countryCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }>;
  socialProfiles: Array<{
    platform: string;
    username: string | null;
    profileUrl: string | null;
    params?: VcardParams | null;
  }>;
  categories: string[];
  photoBase64?: string;
  uid?: string | null;
  urls?: Array<{
    url: string;
    label: string | null;
    type: string | null;
    params?: VcardParams | null;
  }>;
  instantMessages?: Array<{
    service: string;
    handle: string;
    type: string | null;
    params?: VcardParams | null;
  }>;
  relatedPeople?: Array<{
    name: string;
    relationship: string | null;
    params?: VcardParams | null;
  }>;
  dates?: Array<{
    date: string;
    label: string | null;
    params?: VcardParams | null;
  }>;
  /** contact_vcard_properties rows, in card order */
  extraProperties?: ParsedVcardProperty[];
  /** Leftover parameters of single-valued properties, keyed by property name */
  vcardParams?: Record<string, VcardParams> | null;
  /** linkedin_enrichment columns, written as one X-YELLO-LINKEDIN property. */
  linkedinEnrichment?: Record<string, unknown> | null;
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
 * Generate TYPE parameters for vCard properties, one per type. `pref` is
 * never a type here; preference is written separately as PREF=1.
 */
function getTypeParam(type: string | null, extraTypes?: string | null): string {
  const types = [type, ...(extraTypes ?? '').split(',')]
    .map(t => t?.trim())
    .filter((t): t is string => !!t && t.toLowerCase() !== 'pref');

  return types.map(t => {
    const upperType = t.toUpperCase();
    // Common vCard types
    if (['HOME', 'WORK', 'CELL', 'VOICE', 'FAX', 'PAGER', 'OTHER', 'INTERNET', 'IPHONE', 'MAIN'].includes(upperType)) {
      return `;TYPE=${upperType}`;
    }
    return `;TYPE=${escapeVcardValue(t)}`;
  }).join('');
}

/**
 * Format a parameter value. Parameters are not backslash-escaped like
 * property values; a value holding a separator is quoted instead.
 */
function formatParamValue(value: string): string {
  const cleaned = value.replace(/["\r\n]/g, '');
  return /[;:,]/.test(cleaned) ? `"${cleaned}"` : cleaned;
}

/**
 * Parameters as written after a property name: one `;NAME=value` per value,
 * quoted when the value holds a separator, `;NAME` for a bare parameter.
 */
function formatParams(params: VcardParams | null | undefined): string {
  return Object.entries(params ?? {})
    .flatMap(([name, values]) => values.length === 0
      ? [`;${name}`]
      : values.map(value => `;${name}=${/[;:]/.test(value) ? `"${value.replace(/"/g, '')}"` : value}`))
    .join('');
}

/**
 * Lines for the contact's generic properties. Their item groups are renamed
 * past the generator's own so the two can never collide; lines that shared a
 * group keep sharing one.
 */
function extraPropertyLines(properties: ParsedVcardProperty[], nextGroup: () => string): string[] {
  const renamed = new Map<string, string>();
  return properties.map(property => {
    let prefix = '';
    if (property.group) {
      let group = renamed.get(property.group);
      if (!group) {
        group = nextGroup();
        renamed.set(property.group, group);
      }
      prefix = `${group}.`;
    }

    return `${prefix}${property.name}${formatParams(property.params)}:${property.value}`;
  });
}

/**
 * Format an ADR (address) property value
 * Format: PO Box;Extended Address;Street;City;State;Postal Code;Country
 */
function formatAdrValue(address: AddressInput & { poBox?: string | null; extended?: string | null }): string {
  const parts = [
    escapeVcardValue(address.poBox ?? null),     // PO Box
    escapeVcardValue(address.extended ?? null),  // Extended Address
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
  const vp = (name: string) => formatParams(contact.vcardParams?.[name]);

  lines.push(`FN${vp('FN')}:${escapeVcardValue(contact.displayName)}`);

  // N (Structured Name): family;given;additional;prefix;suffix
  lines.push(`N${vp('N')}:${[
    contact.lastName,
    contact.firstName,
    contact.middleName,
    contact.namePrefix,
    contact.nameSuffix
  ].map(part => escapeVcardValue(part ?? null)).join(';')}`);

  if (contact.nickname) {
    lines.push(`NICKNAME${vp('NICKNAME')}:${escapeVcardValue(contact.nickname)}`);
  }

  // ORG (Organization): company, then each organisational unit
  if (contact.company || contact.department) {
    const units = contact.department ? contact.department.split(';') : [];
    lines.push(`ORG${vp('ORG')}:${[contact.company, ...units].map(part => escapeVcardValue(part ?? null)).join(';')}`);
  }

  if (contact.isCompany) {
    lines.push(`X-ABShowAs${vp('X-ABSHOWAS')}:COMPANY`);
  }

  if (contact.gender) {
    lines.push(`X-GENDER${vp('X-GENDER')}:${escapeVcardValue(contact.gender)}`);
  }

  // TITLE
  if (contact.title) {
    lines.push(`TITLE${vp('TITLE')}:${escapeVcardValue(contact.title)}`);
  }

  // Item groups tie a property to its annotations (X-ABLabel, GEO, ...)
  let itemCounter = 0;
  const nextGroup = () => `item${++itemCounter}`;
  const labelLine = (group: string, label: string) => `${group}.X-ABLabel:${escapeVcardValue(label)}`;

  // EMAIL entries
  for (const email of contact.emails) {
    if (!email.email) continue;
    const typeParam = getTypeParam(email.type, email.extraTypes);
    const prefParam = email.isPrimary ? ';PREF=1' : '';
    if (email.label) {
      const group = nextGroup();
      lines.push(`${group}.EMAIL${typeParam}${prefParam}${formatParams(email.params)}:${email.email}`);
      lines.push(labelLine(group, email.label));
    } else {
      lines.push(`EMAIL${typeParam}${prefParam}${formatParams(email.params)}:${email.email}`);
    }
  }

  // TEL entries
  for (const phone of contact.phones) {
    if (!phone.phoneDisplay && !phone.phone) continue;
    const typeParam = getTypeParam(phone.type, phone.extraTypes);
    const prefParam = phone.isPrimary ? ';PREF=1' : '';
    // Use the display format which is more human-readable
    const value = phone.phoneDisplay || phone.phone;
    if (phone.label) {
      const group = nextGroup();
      lines.push(`${group}.TEL${typeParam}${prefParam}${formatParams(phone.params)}:${value}`);
      lines.push(labelLine(group, phone.label));
    } else {
      lines.push(`TEL${typeParam}${prefParam}${formatParams(phone.params)}:${value}`);
    }
  }

  // ADR entries with country-formatted LABEL.
  // Annotated addresses get an Apple-style item group so a per-address GEO,
  // label or country hint can be tied to its ADR (vCard 3.0 GEO is otherwise
  // card-level).
  for (const address of contact.addresses) {
    const typeParam = getTypeParam(address.type, address.extraTypes);
    const adrValue = formatAdrValue(address);
    const hasGeo = address.latitude != null && address.longitude != null;
    const needsGroup = hasGeo || !!address.label || !!address.countryCode ||
      !!address.sublocality || !!address.subadministrativeArea;
    const groupName = needsGroup ? nextGroup() : null;
    const group = groupName ? `${groupName}.` : '';
    lines.push(`${group}ADR${typeParam}${formatParams(address.params)}:${adrValue}`);

    // Add LABEL with formatted address
    const labelValue = formatLabelValue(address);
    if (labelValue) {
      lines.push(`${group}LABEL${typeParam}:${labelValue}`);
    }

    if (hasGeo) {
      lines.push(`${group}GEO:${address.latitude};${address.longitude}`);
    }
    if (groupName && address.label) lines.push(labelLine(groupName, address.label));
    if (address.countryCode) lines.push(`${group}X-ABADR:${escapeVcardValue(address.countryCode)}`);
    if (address.sublocality) {
      lines.push(`${group}X-APPLE-SUBLOCALITY:${escapeVcardValue(address.sublocality)}`);
    }
    if (address.subadministrativeArea) {
      lines.push(`${group}X-APPLE-SUBADMINISTRATIVEAREA:${escapeVcardValue(address.subadministrativeArea)}`);
    }
  }

  // URL entries. A label travels as the X-ABLabel of the URL's item group.
  for (const url of contact.urls ?? []) {
    const typeParam = getTypeParam(url.type);
    const label = url.label;
    if (label) {
      const group = `item${++itemCounter}`;
      lines.push(`${group}.URL${typeParam}${formatParams(url.params)}:${url.url}`);
      lines.push(`${group}.X-ABLabel:${escapeVcardValue(label)}`);
    } else {
      lines.push(`URL${typeParam}${formatParams(url.params)}:${url.url}`);
    }
  }

  // IMPP (instant messaging) entries
  for (const im of contact.instantMessages ?? []) {
    const scheme = im.service.toLowerCase().replace(/[^a-z0-9+.-]/g, '') || 'x-apple';
    const typeParam = getTypeParam(im.type);
    lines.push(`IMPP;X-SERVICE-TYPE=${formatParamValue(im.service)}${typeParam}${formatParams(im.params)}:${scheme}:${im.handle}`);
  }

  // BDAY (Birthday)
  if (contact.birthday) {
    // Try to format as ISO date (YYYY-MM-DD or YYYYMMDD)
    const bday = contact.birthday.replace(/-/g, '');
    lines.push(`BDAY${vp('BDAY')}:${bday}`);
  }

  // Custom dates, labelled the way Apple writes them
  for (const date of contact.dates ?? []) {
    if (date.label) {
      const group = nextGroup();
      lines.push(`${group}.X-ABDATE${formatParams(date.params)}:${date.date}`);
      lines.push(labelLine(group, date.label));
    } else {
      lines.push(`X-ABDATE${formatParams(date.params)}:${date.date}`);
    }
  }

  // NOTE
  if (contact.notes) {
    lines.push(`NOTE${vp('NOTE')}:${escapeVcardValue(contact.notes)}`);
  }

  // CATEGORIES
  if (contact.categories.length > 0) {
    lines.push(`CATEGORIES${vp('CATEGORIES')}:${contact.categories.map(escapeVcardValue).join(',')}`);
  }

  // X-SOCIALPROFILE entries, in the form Apple writes them
  for (const profile of contact.socialProfiles) {
    if (profile.profileUrl) {
      const platformParam = profile.platform ? `;TYPE=${formatParamValue(profile.platform)}` : '';
      const usernameParam = profile.username ? `;X-USER=${formatParamValue(profile.username)}` : '';
      lines.push(`X-SOCIALPROFILE${platformParam}${usernameParam}${formatParams(profile.params)}:${profile.profileUrl}`);
    }
  }

  // X-ABRELATEDNAMES entries
  for (const person of contact.relatedPeople ?? []) {
    const typeParam = person.relationship ? `;TYPE=${formatParamValue(person.relationship)}` : '';
    lines.push(`X-ABRELATEDNAMES${typeParam}${formatParams(person.params)}:${escapeVcardValue(person.name)}`);
  }

  // UID
  if (contact.uid) {
    lines.push(`UID${vp('UID')}:${contact.uid}`);
  }

  // Every other property of the imported card
  lines.push(...extraPropertyLines(contact.extraProperties ?? [], nextGroup));

  // LinkedIn enrichment, gzip-compressed so a full export stays uploadable
  if (contact.linkedinEnrichment && Object.keys(contact.linkedinEnrichment).length > 0) {
    const payload = zlib.gzipSync(JSON.stringify(contact.linkedinEnrichment)).toString('base64');
    lines.push(`${LINKEDIN_ENRICHMENT_PROPERTY}:${payload}`);
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
