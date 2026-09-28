import ICAL from 'ical.js';
import zlib from 'zlib';
import { parsePhoneNumber } from 'libphonenumber-js';

/**
 * Carries a contact's linkedin_enrichment row through a VCF export/import.
 * vCard has no equivalent for this data, so it travels as gzip-compressed JSON
 * in a private property that other contact apps ignore.
 */
export const LINKEDIN_ENRICHMENT_PROPERTY = 'X-YELLO-LINKEDIN';

/** Upper bound on a decompressed enrichment payload from an uploaded file. */
const MAX_ENRICHMENT_BYTES = 16 * 1024 * 1024;

export interface ParsedEmail {
  email: string;
  type: string | null;
  /** TYPE values after the first, comma-joined (`pref` excluded). */
  extraTypes?: string | null;
  /** X-ABLabel of the email's item group, as written. */
  label?: string | null;
  /** vCard parameters no other field holds (e.g. X-APPLE-OMIT-YEAR), re-emitted on export. */
  params?: VcardParams | null;
  isPrimary: boolean;
}

export interface ParsedPhone {
  phone: string;
  phoneDisplay: string;
  countryCode: string | null;
  type: string | null;
  extraTypes?: string | null;
  label?: string | null;
  /** vCard parameters no other field holds (e.g. X-APPLE-OMIT-YEAR), re-emitted on export. */
  params?: VcardParams | null;
  isPrimary: boolean;
}

export interface ParsedAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  type: string | null;
  extraTypes?: string | null;
  label?: string | null;
  poBox?: string | null;
  extended?: string | null;
  /** Apple's X-APPLE-SUBLOCALITY / X-APPLE-SUBADMINISTRATIVEAREA of the ADR's group. */
  sublocality?: string | null;
  subadministrativeArea?: string | null;
  /** Apple's X-ABADR country-format hint of the ADR's group. */
  countryCode?: string | null;
  /** vCard parameters no other field holds (e.g. X-APPLE-OMIT-YEAR), re-emitted on export. */
  params?: VcardParams | null;
  /** From a GEO property tied to this ADR. Null unless the file carried one. */
  latitude: number | null;
  longitude: number | null;
}

export interface ParsedInstantMessage {
  service: string;
  handle: string;
  type: string | null;
  /** vCard parameters no other field holds (e.g. X-APPLE-OMIT-YEAR), re-emitted on export. */
  params?: VcardParams | null;
}

export interface ParsedUrl {
  url: string;
  label: string | null;
  type: string | null;
  /** vCard parameters no other field holds (e.g. X-APPLE-OMIT-YEAR), re-emitted on export. */
  params?: VcardParams | null;
}

export interface ParsedRelatedPerson {
  name: string;
  relationship: string | null;
  /** vCard parameters no other field holds (e.g. X-APPLE-OMIT-YEAR), re-emitted on export. */
  params?: VcardParams | null;
}

export interface ParsedSocialProfile {
  platform: string;
  username: string | null;
  url: string;
  /** vCard parameters no other field holds (e.g. X-APPLE-OMIT-YEAR), re-emitted on export. */
  params?: VcardParams | null;
}

/** Upper-cased parameter names to their values; a bare parameter maps to []. */
export type VcardParams = Record<string, string[]>;

export interface ParsedDate {
  date: string;
  label: string | null;
  /** vCard parameters no other field holds (e.g. X-APPLE-OMIT-YEAR), re-emitted on export. */
  params?: VcardParams | null;
}

/** A property with no typed home, kept as written (value still escaped). */
export interface ParsedVcardProperty {
  group: string | null;
  /** Upper-cased property name */
  name: string;
  /** Upper-cased parameter names; a bare parameter maps to an empty list. */
  params: Record<string, string[]>;
  value: string;
}

export interface ParsedContact {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  company: string | null;
  title: string | null;
  notes: string | null;
  birthday: string | null;
  emails: ParsedEmail[];
  phones: ParsedPhone[];
  addresses: ParsedAddress[];
  categories: string[];
  instantMessages: ParsedInstantMessage[];
  urls: ParsedUrl[];
  relatedPeople: ParsedRelatedPerson[];
  socialProfiles: ParsedSocialProfile[];
  photoBase64: string | null;
  rawVcard: string;
  /** vCard UID — stable per-contact identifier, used to recognize re-imports. */
  uid: string | null;
  /** linkedin_enrichment columns from an X-YELLO-LINKEDIN property, if any. */
  linkedinEnrichment?: Record<string, unknown> | null;
  middleName?: string | null;
  namePrefix?: string | null;
  nameSuffix?: string | null;
  nickname?: string | null;
  gender?: string | null;
  /** ORG components after the company, `;`-joined. */
  department?: string | null;
  /** X-ABSHOWAS:COMPANY — the card is an organisation, not a person. */
  isCompany?: boolean;
  dates?: ParsedDate[];
  /** Every property of the card that none of the fields above holds. */
  extraProperties?: ParsedVcardProperty[];
  /**
   * Leftover parameters of the single-valued properties (BDAY, N, ORG, ...),
   * keyed by property name, e.g. { BDAY: { 'X-APPLE-OMIT-YEAR': ['1604'] } }.
   */
  vcardParams?: Record<string, VcardParams> | null;
}

export interface ParseResult {
  contacts: ParsedContact[];
  errors: Array<{ line: number; reason: string }>;
}

/**
 * Joins RFC 6350 folded continuation lines. Folding never crosses a
 * BEGIN/END:VCARD boundary, so this is safe to apply to a single card block —
 * which is what the streaming importer does to avoid holding the whole file.
 */
export function unfoldLines(vcfContent: string): string {
  return vcfContent.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

/**
 * Parses a GEO value into coordinates. Handles vCard 3.0 `lat;lon`, vCard 4.0
 * `geo:lat,lon`, and the comma-separated form some clients emit.
 */
function parseGeoValue(raw: string): { latitude: number; longitude: number } | null {
  const cleaned = raw.trim().replace(/^geo:/i, '');
  const parts = cleaned.split(/[;,]/).map(p => p.trim());
  if (parts.length < 2) return null;

  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  // 0,0 is the overwhelmingly common "failed to geocode" sentinel, not the
  // Atlantic — treating it as real would pin contacts off the coast of Africa.
  if (latitude === 0 && longitude === 0) return null;

  return { latitude, longitude };
}

/**
 * Attaches GEO coordinates to their addresses in place.
 *
 * vCard 3.0's bare GEO is card-level, so per-address coordinates are carried by
 * an Apple-style item group (`item1.ADR` + `item1.GEO`) — which is exactly what
 * this app's own exporter writes. Matching is therefore by group; an ungrouped
 * card-level GEO is only applied when the card has a single address, since
 * anything else would be a guess.
 */
function applyGeoToAddresses(vcardText: string, addresses: ParsedAddress[]): void {
  if (addresses.length === 0) return;

  const groupOrder: string[] = [];
  const geoByGroup = new Map<string, { latitude: number; longitude: number }>();
  let cardLevelGeo: { latitude: number; longitude: number } | null = null;

  for (const line of vcardText.split(/\r?\n/)) {
    const adrMatch = line.match(/^([^.;:]+)\.ADR[;:]/i);
    if (adrMatch) {
      groupOrder.push(adrMatch[1].toLowerCase());
      continue;
    }

    // An ADR with no group still consumes a slot, so grouped GEO stays aligned
    // with the address order ical.js produced.
    if (/^ADR[;:]/i.test(line)) {
      groupOrder.push('');
      continue;
    }

    const groupedGeo = line.match(/^([^.;:]+)\.GEO[;:](.+)$/i);
    if (groupedGeo) {
      const coords = parseGeoValue(groupedGeo[2]);
      if (coords) geoByGroup.set(groupedGeo[1].toLowerCase(), coords);
      continue;
    }

    const bareGeo = line.match(/^GEO[;:](.+)$/i);
    if (bareGeo) {
      cardLevelGeo = parseGeoValue(bareGeo[1]) ?? cardLevelGeo;
    }
  }

  for (let i = 0; i < addresses.length; i++) {
    const group = groupOrder[i];
    const coords = group ? geoByGroup.get(group) : undefined;
    if (coords) {
      addresses[i].latitude = coords.latitude;
      addresses[i].longitude = coords.longitude;
    }
  }

  if (cardLevelGeo && addresses.length === 1 && addresses[0].latitude === null) {
    addresses[0].latitude = cardLevelGeo.latitude;
    addresses[0].longitude = cardLevelGeo.longitude;
  }
}

/** Every TYPE value except the `pref` marker, lower-cased, in order. */
function namedTypes(params: Record<string, string | string[]> | undefined): string[] {
  if (!params) return [];
  const typeValue = params.type || params.TYPE;
  const values = Array.isArray(typeValue) ? typeValue : typeValue ? [typeValue] : [];
  return values
    .flatMap(v => String(v).split(','))
    .map(v => v.trim().toLowerCase())
    .filter(v => v && v !== 'pref');
}

function extractType(params: Record<string, string | string[]> | undefined): string | null {
  return namedTypes(params)[0] ?? null;
}

/** TYPE values after the first, e.g. `fax` of `TYPE=HOME;TYPE=FAX`. */
function extractExtraTypes(params: Record<string, string | string[]> | undefined): string | null {
  const types = namedTypes(params);
  return types.length > 1 ? types.slice(1).join(',') : null;
}

/** The item group ical.js reports as a parameter, lower-cased. */
function groupOf(params: Record<string, string | string[]> | undefined): string | null {
  const group = params?.group;
  return typeof group === 'string' ? group.toLowerCase() : null;
}

/** ical.js or line parameters in one shape: upper-cased names, list values, no item group. */
function normalizeParams(params: Record<string, string | string[]> | Map<string, string[]> | undefined): VcardParams {
  const entries = params instanceof Map ? [...params] : Object.entries(params ?? {});
  const normalized: VcardParams = {};
  for (const [name, value] of entries) {
    const key = name.toUpperCase();
    if (key === 'GROUP') continue;
    const values = (Array.isArray(value) ? value : [value]).map(String);
    normalized[key] = [...(normalized[key] ?? []), ...values];
  }
  return normalized;
}

/**
 * Parameters a typed field does not already hold, or undefined when there are none.
 * `consumed` names parameters stored elsewhere; `storedTypes` lists the TYPE
 * values the row keeps (case-insensitive), so only the others are left over.
 */
function leftoverParams(
  params: Record<string, string | string[]> | Map<string, string[]> | undefined,
  consumed: string[],
  storedTypes: Array<string | null | undefined> = []
): VcardParams | undefined {
  const normalized = normalizeParams(params);
  const stored = new Set(storedTypes.filter((t): t is string => !!t).flatMap(t => t.split(',')).map(t => t.trim().toLowerCase()));
  const leftover: VcardParams = {};
  for (const [key, values] of Object.entries(normalized)) {
    if (consumed.includes(key)) continue;
    if (key === 'TYPE') {
      const rest = values.flatMap(v => v.split(',')).map(v => v.trim()).filter(v => v && !stored.has(v.toLowerCase()));
      if (rest.length > 0) leftover.TYPE = rest;
      continue;
    }
    leftover[key] = values;
  }
  return Object.keys(leftover).length > 0 ? leftover : undefined;
}

/** A structured-value component, which ical.js returns as a list when it holds commas. */
function component(value: unknown): string | null {
  if (Array.isArray(value)) return value.filter(Boolean).join(',') || null;
  return typeof value === 'string' && value ? value : null;
}

/** True for vCard 3.0 `TYPE=pref` and vCard 4.0 `PREF=1`. */
function isPreferred(params: Record<string, string | string[]> | undefined): boolean {
  if (!params) return false;
  if (params.pref !== undefined || params.PREF !== undefined) return true;
  const typeValue = params.type || params.TYPE;
  const types = Array.isArray(typeValue) ? typeValue : typeValue ? [typeValue] : [];
  return types.some(t => t.split(',').some(part => part.trim().toLowerCase() === 'pref'));
}

/**
 * Exactly one entry is primary: the first one flagged preferred, or the first
 * entry when the card flags none.
 */
function primaryIndex(preferred: boolean[]): number {
  const flagged = preferred.indexOf(true);
  return flagged >= 0 ? flagged : 0;
}

interface PropertyLine {
  group: string | null;
  /** Upper-cased property name, without the group */
  name: string;
  /** Parameter names are upper-cased; a repeated parameter keeps every value. */
  params: Map<string, string[]>;
  value: string;
}

/**
 * Splits an unfolded property line into group, parameters and value, honouring
 * quoted parameter values. Used for the X- properties ical.js leaves untyped.
 */
function parsePropertyLine(line: string): PropertyLine | null {
  let inQuotes = false;
  let colonIdx = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ':' && !inQuotes) {
      colonIdx = i;
      break;
    }
  }
  if (colonIdx === -1) return null;

  const segments: string[] = [];
  let current = '';
  inQuotes = false;
  for (const ch of line.substring(0, colonIdx)) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ';' && !inQuotes) {
      segments.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  segments.push(current);

  const groupMatch = segments[0].match(/^([^.]+)\./);
  const params = new Map<string, string[]>();
  for (const segment of segments.slice(1)) {
    const eqIdx = segment.indexOf('=');
    if (eqIdx === -1) {
      // vCard 2.1 bare parameter (`TEL;HOME:`)
      const key = segment.trim().toUpperCase();
      if (key && !params.has(key)) params.set(key, []);
      continue;
    }
    const key = segment.substring(0, eqIdx).toUpperCase();
    const values = params.get(key) ?? [];
    values.push(segment.substring(eqIdx + 1));
    params.set(key, values);
  }

  return {
    group: groupMatch ? groupMatch[1].toLowerCase() : null,
    name: segments[0].substring(groupMatch ? groupMatch[0].length : 0).trim().toUpperCase(),
    params,
    value: line.substring(colonIdx + 1)
  };
}

/** Unescape a vCard text value (\\ \; \, \n) */
function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, ch) =>
    ch === 'n' || ch === 'N' ? '\n' : ch
  );
}

/** First TYPE value that is not the `pref` marker, as written. */
function firstNamedType(params: Map<string, string[]>): string | null {
  const types = (params.get('TYPE') ?? [])
    .flatMap(v => v.split(','))
    .map(v => v.trim())
    .filter(v => v && v.toLowerCase() !== 'pref');
  return types[0] ?? null;
}

/**
 * Apple wraps its built-in labels as `_$!<Spouse>!$_`; those are lower-cased
 * to match how relationships are stored. A custom label is kept as written.
 */
function relationshipFromLabel(label: string): string {
  const builtIn = label.match(/^_\$!<(.*)>!\$_$/);
  return builtIn ? builtIn[1].trim().toLowerCase() : label.trim();
}

/**
 * Reads a single-value text property from the unfolded lines. ical.js leaves
 * `\;` escaped in these, which put a stray backslash in front of every
 * semicolon of an imported title or note.
 */
function readTextProperty(lines: string[], name: string): string | null {
  const re = new RegExp(`^(?:[^.;:]+\\.)?${name}[;:]`, 'i');
  const line = lines.find(l => re.test(l));
  const prop = line ? parsePropertyLine(line) : null;
  return prop ? unescapeText(prop.value) : null;
}

const enrichmentLineRe = new RegExp(
  `^(?:[^.;:\\r\\n]+\\.)?${LINKEDIN_ENRICHMENT_PROPERTY}[;:][^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*\\r?\\n?`,
  'gim'
);

/**
 * Lifts the enrichment property out of a card. The payload is returned decoded
 * and removed from the text, so it is stored once in linkedin_enrichment
 * rather than a second time inside raw_vcard.
 */
function extractLinkedinEnrichment(vcardText: string): {
  text: string;
  enrichment: Record<string, unknown> | null;
} {
  let enrichment: Record<string, unknown> | null = null;

  const text = vcardText.replace(enrichmentLineRe, match => {
    const line = parsePropertyLine(unfoldLines(match).trim());
    if (!line) return '';
    try {
      const json = zlib
        .gunzipSync(Buffer.from(line.value, 'base64'), { maxOutputLength: MAX_ENRICHMENT_BYTES })
        .toString('utf-8');
      const parsed: unknown = JSON.parse(json);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        enrichment = parsed as Record<string, unknown>;
      }
    } catch {
      // A corrupt payload costs the enrichment, not the contact.
    }
    return '';
  });

  return { text, enrichment };
}

function parsePhone(rawPhone: string): { phone: string; phoneDisplay: string; countryCode: string | null } {
  try {
    const parsed = parsePhoneNumber(rawPhone, 'US');
    if (parsed) {
      // Format as international with spaces: +1 201 555 0123
      const international = parsed.formatInternational();
      // Replace dashes and remove parentheses for clean space-separated format
      const phoneDisplay = international
        .replace(/[()-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        phone: parsed.format('E.164'),
        phoneDisplay,
        countryCode: parsed.country || null
      };
    }
  } catch {
    // Fall through to raw value
  }
  const cleaned = rawPhone.replace(/[^\d+]/g, '');
  return { phone: cleaned, phoneDisplay: rawPhone, countryCode: null };
}

export function parseSingleVcard(rawText: string): ParsedContact | null {
  const { text: vcardText, enrichment: linkedinEnrichment } = extractLinkedinEnrichment(rawText);
  const jcalData = ICAL.parse(vcardText);
  const comp = new ICAL.Component(jcalData);
  const rawLines = unfoldLines(vcardText).split(/\r?\n/);

  const fnProp = readTextProperty(rawLines, 'FN') ?? comp.getFirstPropertyValue('fn');
  const nProp = comp.getFirstProperty('n');

  let displayName = fnProp as string;
  let firstName: string | null = null;
  let lastName: string | null = null;
  let middleName: string | null = null;
  let namePrefix: string | null = null;
  let nameSuffix: string | null = null;

  if (nProp) {
    // ical.js returns N property as a single structured value (array)
    const nValue = nProp.getFirstValue();
    if (Array.isArray(nValue) && nValue.length >= 2) {
      lastName = nValue[0] || null;
      firstName = nValue[1] || null;
      middleName = component(nValue[2]);
      namePrefix = component(nValue[3]);
      nameSuffix = component(nValue[4]);
    } else if (typeof nValue === 'string') {
      // Fallback: parse semicolon-separated string manually
      const parts = nValue.split(';');
      lastName = parts[0] || null;
      firstName = parts[1] || null;
    }
  }

  if (!displayName) {
    if (firstName || lastName) {
      displayName = [firstName, lastName].filter(Boolean).join(' ');
    } else {
      throw new Error('Missing required FN or N field');
    }
  }

  // Item labels by group (item3.X-ABLabel -> LinkedIn), kept as written
  const itemLabels = new Map<string, string>();
  for (const line of rawLines) {
    if (!/^[^.;:]+\.X-ABLabel[;:]/i.test(line)) continue;
    const prop = parsePropertyLine(line);
    const labelValue = prop ? unescapeText(prop.value).trim() : '';
    if (prop?.group && labelValue) {
      itemLabels.set(prop.group, labelValue);
    }
  }
  const labelOf = (params: Record<string, string | string[]>): string | null => {
    const group = groupOf(params);
    return (group && itemLabels.get(group)) || null;
  };

  const emails: ParsedEmail[] = [];
  const emailPreferred: boolean[] = [];
  for (const emailProp of comp.getAllProperties('email')) {
    const email = emailProp.getFirstValue() as string;
    if (email) {
      const params = emailProp.toJSON()[1];
      emails.push({
        email: email.replace(/^mailto:/i, ''),
        type: extractType(params),
        extraTypes: extractExtraTypes(params),
        label: labelOf(params),
        params: leftoverParams(params, ['PREF'], [...namedTypes(params), 'pref']),
        isPrimary: false
      });
      emailPreferred.push(isPreferred(params));
    }
  }
  if (emails.length > 0) emails[primaryIndex(emailPreferred)].isPrimary = true;

  const phones: ParsedPhone[] = [];
  const phonePreferred: boolean[] = [];
  for (const telProp of comp.getAllProperties('tel')) {
    const rawPhone = telProp.getFirstValue() as string;
    if (rawPhone) {
      const params = telProp.toJSON()[1];
      const { phone, phoneDisplay, countryCode } = parsePhone(rawPhone.replace(/^tel:/i, ''));
      phones.push({
        phone,
        phoneDisplay,
        countryCode,
        type: extractType(params),
        extraTypes: extractExtraTypes(params),
        label: labelOf(params),
        params: leftoverParams(params, ['PREF'], [...namedTypes(params), 'pref']),
        isPrimary: false
      });
      phonePreferred.push(isPreferred(params));
    }
  }
  if (phones.length > 0) phones[primaryIndex(phonePreferred)].isPrimary = true;

  // Apple annotates an ADR through its item group
  const groupValue = (group: string | null, name: string): string | null => {
    if (!group) return null;
    const re = new RegExp(`^${group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.${name}[;:]`, 'i');
    const line = rawLines.find(l => re.test(l));
    const prop = line ? parsePropertyLine(line) : null;
    return prop ? unescapeText(prop.value).trim() || null : null;
  };

  const addresses: ParsedAddress[] = [];
  for (const adrProp of comp.getAllProperties('adr')) {
    const adrValue = adrProp.getFirstValue() as string[] | null;
    if (adrValue && adrValue.length > 0) {
      const params = adrProp.toJSON()[1] as Record<string, string | string[]>;
      const group = groupOf(params);
      addresses.push({
        street: adrValue[2] || null,
        city: adrValue[3] || null,
        state: adrValue[4] || null,
        postalCode: adrValue[5] || null,
        country: adrValue[6] || null,
        type: extractType(params),
        extraTypes: extractExtraTypes(params),
        label: labelOf(params),
        poBox: component(adrValue[0]),
        extended: component(adrValue[1]),
        sublocality: groupValue(group, 'X-APPLE-SUBLOCALITY'),
        subadministrativeArea: groupValue(group, 'X-APPLE-SUBADMINISTRATIVEAREA'),
        countryCode: groupValue(group, 'X-ABADR'),
        // vCard 4's LABEL parameter is the display form, regenerated from the parts
        params: leftoverParams(params, ['LABEL'], namedTypes(params)),
        latitude: null,
        longitude: null
      });
    }
  }

  applyGeoToAddresses(vcardText, addresses);

  const orgProp = comp.getFirstPropertyValue('org') as string | string[] | null;
  const company = Array.isArray(orgProp) ? orgProp[0] : orgProp;
  const department = Array.isArray(orgProp)
    ? orgProp.slice(1).map(c => component(c) ?? '').join(';').replace(/;+$/, '') || null
    : null;

  const title = readTextProperty(rawLines, 'TITLE') ?? (comp.getFirstPropertyValue('title') as string | null);
  const notes = readTextProperty(rawLines, 'NOTE') ?? (comp.getFirstPropertyValue('note') as string | null);

  let photoBase64: string | null = null;
  const photoProp = comp.getFirstProperty('photo');
  if (photoProp) {
    const photoValue = photoProp.getFirstValue();
    const photoParams = photoProp.toJSON()[1] as Record<string, string | string[]>;
    const valueType = String(photoParams.value ?? photoParams.VALUE ?? '').toLowerCase();
    if (typeof photoValue === 'string' && (valueType === 'uri' || valueType === 'url' || /^https?:/i.test(photoValue))) {
      // A link to a photo, not the photo; kept as a generic property
    } else if (typeof photoValue === 'string') {
      // Handle data URIs - strip the prefix
      photoBase64 = photoValue.replace(/^data:image\/[^;]+;base64,/i, '');
    } else if (photoValue && typeof photoValue === 'object' && 'icaltype' in photoValue && photoValue.icaltype === 'binary') {
      // Handle ENCODING=B format - Binary object has toString() method
      photoBase64 = (photoValue as { toString(): string }).toString();
    }
    // Skip URL references and other unsupported formats
  }

  // Parse birthday (BDAY)
  const bdayProp = comp.getFirstPropertyValue('bday');
  let birthday: string | null = null;
  if (bdayProp) {
    if (typeof bdayProp === 'string') {
      birthday = bdayProp;
    } else if (bdayProp && typeof bdayProp === 'object' && 'toICALString' in bdayProp) {
      birthday = (bdayProp as { toICALString(): string }).toICALString();
    }
  }

  // Parse categories (CATEGORIES:val1,val2)
  const categories: string[] = [];

  // First try ical.js. CATEGORIES is multi-valued and may repeat, so every
  // value of every line counts — not just the first.
  for (const categoriesProp of comp.getAllProperties('categories')) {
    for (const value of categoriesProp.getValues()) {
      if (typeof value === 'string' && value.trim()) {
        categories.push(value.trim());
      }
    }
  }

  // Fallback: parse raw lines if ical.js didn't find any
  if (categories.length === 0) {
    for (const line of rawLines) {
      const match = line.match(/^CATEGORIES[;:](.+)/i);
      if (match) {
        const catValue = match[1].includes(':')
          ? match[1].split(':').pop() || ''
          : match[1];
        categories.push(...catValue.split(',').map(c => c.trim()).filter(Boolean));
      }
    }
  }

  // Parse instant messages (IMPP)
  const instantMessages: ParsedInstantMessage[] = [];
  for (const imppProp of comp.getAllProperties('impp')) {
    const imppValue = imppProp.getFirstValue() as string;
    if (imppValue) {
      const params = imppProp.toJSON()[1] as Record<string, string | string[]>;
      const serviceType = params['x-service-type'] || params['X-SERVICE-TYPE'];
      const service = Array.isArray(serviceType) ? serviceType[0] : serviceType;

      // Parse handle from URI (aim:handle, xmpp:handle, etc.)
      const colonIndex = imppValue.indexOf(':');
      const handle = colonIndex >= 0 ? imppValue.substring(colonIndex + 1) : imppValue;
      const protocol = colonIndex >= 0 ? imppValue.substring(0, colonIndex).toUpperCase() : null;

      instantMessages.push({
        service: service || protocol || 'IM',
        handle,
        type: extractType(params),
        params: leftoverParams(params, ['X-SERVICE-TYPE'], [extractType(params)])
      });
    }
  }

  // Parse URLs with labels
  const urls: ParsedUrl[] = [];
  for (const urlProp of comp.getAllProperties('url')) {
    const urlValue = urlProp.getFirstValue() as string;
    if (urlValue) {
      const params = urlProp.toJSON()[1] as Record<string, string | string[]>;

      // ical.js reports the item group as a parameter, not in the property name
      const group = typeof params.group === 'string' ? params.group.toLowerCase() : null;
      const label = (group && itemLabels.get(group)) || null;

      urls.push({
        url: urlValue,
        label,
        type: extractType(params),
        params: leftoverParams(params, [], [extractType(params)])
      });
    }
  }

  // Also check raw lines for grouped URLs (item3.URL format)
  for (const line of rawLines) {
    const match = line.match(/^(item\d+)\.URL[;:](.*)/i);
    if (match) {
      const itemKey = match[1].toLowerCase();
      const rest = match[2];
      // Extract URL from the line
      const colonIdx = rest.indexOf(':');
      let urlValue: string;
      if (rest.startsWith('http')) {
        urlValue = rest;
      } else if (colonIdx >= 0) {
        urlValue = rest.substring(colonIdx + 1);
      } else {
        urlValue = rest;
      }

      // Check if we already have this URL
      const exists = urls.some(u => u.url === urlValue);
      if (!exists && urlValue) {
        urls.push({
          url: urlValue,
          label: itemLabels.get(itemKey) || null,
          type: null
        });
      }
    }
  }

  const relatedPeople = parseRelatedPeople(rawLines, itemLabels);

  // Parse social profiles (X-SOCIALPROFILE), grouped or not
  const socialProfiles: ParsedSocialProfile[] = [];
  for (const line of rawLines) {
    if (!/^(?:[^.;:]+\.)?X-SOCIALPROFILE[;:]/i.test(line)) continue;
    const prop = parsePropertyLine(line);
    if (!prop) continue;

    // Apple writes the platform as TYPE; this app's earlier exports used X-SERVICE.
    const typedPlatform = firstNamedType(prop.params);
    const platform = (
      typedPlatform
      ?? prop.params.get('X-SERVICE')?.[0]?.trim()
      ?? 'social'
    ).toLowerCase();
    const username = prop.params.get('X-USER')?.[0] || null;

    // `x-apple:handle` style values carry a handle rather than a URL.
    const httpIdx = prop.value.search(/https?:/i);
    const url = httpIdx >= 0
      ? prop.value.substring(httpIdx)
      : prop.value.substring(prop.value.lastIndexOf(':') + 1);

    if (url) {
      socialProfiles.push({
        platform,
        username,
        url,
        params: leftoverParams(prop.params, ['X-USER', 'X-SERVICE'], [typedPlatform])
      });
    }
  }

  // Custom dates: Apple's grouped X-ABDATE + label, and vCard ANNIVERSARY
  const dates: ParsedDate[] = [];
  for (const line of rawLines) {
    const prop = /^(?:[^.;:]+\.)?(?:X-ABDATE|X-ANNIVERSARY|ANNIVERSARY)[;:]/i.test(line)
      ? parsePropertyLine(line)
      : null;
    const date = prop?.value.trim();
    if (!prop || !date) continue;
    const isAnniversary = /^(?:[^.;:]+\.)?(?:X-)?ANNIVERSARY[;:]/i.test(line);
    dates.push({
      date,
      label: isAnniversary
        ? ANNIVERSARY_LABEL
        : (prop.group && itemLabels.get(prop.group)) || null,
      params: leftoverParams(prop.params, [])
    });
  }

  const nickname = readTextProperty(rawLines, 'NICKNAME')?.trim() || null;
  const gender = readTextProperty(rawLines, 'X-GENDER')?.trim() || null;
  const isCompany = readTextProperty(rawLines, 'X-ABSHOWAS')?.trim().toUpperCase() === 'COMPANY';

  // Leftover parameters of the single-valued properties, from their first line
  const vcardParams: Record<string, VcardParams> = {};
  for (const name of ['FN', 'N', 'ORG', 'TITLE', 'NOTE', 'BDAY', 'NICKNAME', 'X-GENDER', 'X-ABSHOWAS', 'CATEGORIES', 'UID']) {
    const re = new RegExp(`^(?:[^.;:]+\\.)?${name}[;:]`, 'i');
    const line = rawLines.find(l => re.test(l));
    const leftover = line ? leftoverParams(parsePropertyLine(line)?.params, []) : null;
    if (leftover) vcardParams[name] = leftover;
  }

  const extraProperties = collectExtraProperties(rawLines, {
    addressCount: addresses.length,
    photoConsumed: photoBase64 !== null
  });

  return {
    firstName,
    lastName,
    middleName,
    namePrefix,
    nameSuffix,
    nickname,
    gender,
    department,
    isCompany,
    dates,
    extraProperties,
    vcardParams: Object.keys(vcardParams).length > 0 ? vcardParams : null,
    displayName,
    company: company || null,
    title,
    notes,
    birthday,
    emails,
    phones,
    addresses,
    categories,
    instantMessages,
    urls,
    relatedPeople,
    socialProfiles,
    photoBase64,
    rawVcard: vcardText,
    uid: normalizeUid(comp.getFirstPropertyValue('uid') as string | null),
    linkedinEnrichment
  };
}

/** Apple's built-in label for an anniversary date. */
export const ANNIVERSARY_LABEL = '_$!<Anniversary>!$_';

/**
 * Properties the typed fields hold; the first occurrence of each is consumed,
 * any repeat is kept as an extra property. VERSION is regenerated on export.
 */
const SINGLE_VALUED_PROPERTIES = new Set([
  'VERSION', 'FN', 'N', 'ORG', 'TITLE', 'NOTE', 'BDAY', 'UID',
  'NICKNAME', 'X-GENDER', 'X-ABSHOWAS', 'PHOTO'
]);

/**
 * Tags a card in the archive of original cards written when raw_vcard was
 * retired. A contact id means nothing outside that database, so an imported
 * archive does not keep it.
 */
export const ARCHIVE_CONTACT_ID_PROPERTY = 'X-YELLO-CONTACT-ID';

/** Properties the typed tables hold every occurrence of, or that are not kept. */
const MULTI_VALUED_PROPERTIES = new Set([
  'BEGIN', 'END', 'EMAIL', 'TEL', 'ADR', 'URL', 'IMPP', 'X-SOCIALPROFILE',
  'X-ABRELATEDNAMES', 'CATEGORIES', 'X-ABDATE', 'ANNIVERSARY', 'X-ANNIVERSARY',
  LINKEDIN_ENRICHMENT_PROPERTY, ARCHIVE_CONTACT_ID_PROPERTY
]);

/** Grouped annotations that are stored on their owner, by owner. */
const MODELED_ANNOTATIONS: Record<string, Set<string>> = {
  'X-ABLABEL': new Set(['EMAIL', 'TEL', 'ADR', 'URL', 'X-ABRELATEDNAMES', 'X-ABDATE']),
  'X-ABADR': new Set(['ADR']),
  'X-APPLE-SUBLOCALITY': new Set(['ADR']),
  'X-APPLE-SUBADMINISTRATIVEAREA': new Set(['ADR']),
  // LABEL is the display form of the address, regenerated from its parts
  'LABEL': new Set(['ADR']),
  'GEO': new Set(['ADR'])
};

/**
 * Every property of a card that no typed field holds, in card order. Together
 * with the typed fields this accounts for every line, so export can rebuild the
 * card from the database alone.
 */
function collectExtraProperties(
  rawLines: string[],
  context: { addressCount: number; photoConsumed: boolean }
): ParsedVcardProperty[] {
  const named = rawLines
    .map(line => parsePropertyLine(line))
    .filter((p): p is PropertyLine => p !== null);

  // The owner of a group is its first property that is not an annotation
  const groupOwners = new Map<string, string>();
  for (const p of named) {
    if (p.group && !(p.name in MODELED_ANNOTATIONS) && !groupOwners.has(p.group)) {
      groupOwners.set(p.group, p.name);
    }
  }

  const seen = new Set<string>();
  const extras: ParsedVcardProperty[] = [];
  for (const p of named) {
    let consumed: boolean;
    if (MULTI_VALUED_PROPERTIES.has(p.name)) {
      consumed = true;
    } else if (SINGLE_VALUED_PROPERTIES.has(p.name)) {
      consumed = !seen.has(p.name) && (p.name !== 'PHOTO' || context.photoConsumed);
      seen.add(p.name);
    } else if (p.name in MODELED_ANNOTATIONS) {
      const owner = p.group ? groupOwners.get(p.group) : undefined;
      consumed = owner !== undefined && MODELED_ANNOTATIONS[p.name].has(owner);
      // A card-level GEO is applied only to a card's single address; a
      // card-level LABEL is an address's display form, regenerated from it
      if (p.name === 'GEO' && !p.group) consumed = context.addressCount === 1;
      if (p.name === 'LABEL' && !p.group) consumed = context.addressCount > 0;
    } else {
      consumed = false;
    }

    if (!consumed) {
      extras.push({
        group: p.group,
        name: p.name,
        params: Object.fromEntries(p.params),
        value: p.value
      });
    }
  }
  return extras;
}

/**
 * Reads X-ABRELATEDNAMES lines. Apple groups them with an X-ABLabel that names
 * the relationship (`item1.X-ABRELATEDNAMES` + `item1.X-ABLabel`); other
 * clients put the relationship in TYPE.
 */
function parseRelatedPeople(lines: string[], itemLabels: Map<string, string>): ParsedRelatedPerson[] {
  const relatedPeople: ParsedRelatedPerson[] = [];

  for (const line of lines) {
    if (!/^(?:[^.;:]+\.)?X-ABRELATEDNAMES[;:]/i.test(line)) continue;
    const prop = parsePropertyLine(line);
    if (!prop) continue;

    const name = unescapeText(prop.value).trim();
    if (!name) continue;

    const label = prop.group ? itemLabels.get(prop.group) : undefined;
    const typedRelationship = firstNamedType(prop.params);
    const relationship = typedRelationship ?? (label ? relationshipFromLabel(label) : null);

    relatedPeople.push({
      name,
      relationship: relationship || null,
      params: leftoverParams(prop.params, [], [typedRelationship])
    });
  }

  return relatedPeople;
}

/**
 * Related names carried only by grouped lines of a stored raw card. Imports
 * before grouped lines were understood dropped these, so they exist nowhere
 * but raw_vcard; the one-time backfill uses this to recover them.
 */
export function parseGroupedRelatedNames(rawVcard: string): ParsedRelatedPerson[] {
  const lines = unfoldLines(rawVcard).split(/\r?\n/);

  const itemLabels = new Map<string, string>();
  for (const line of lines) {
    if (!/^[^.;:]+\.X-ABLabel[;:]/i.test(line)) continue;
    const prop = parsePropertyLine(line);
    const labelValue = prop ? unescapeText(prop.value).trim() : '';
    if (prop?.group && labelValue) itemLabels.set(prop.group, labelValue);
  }

  return parseRelatedPeople(
    lines.filter(line => /^[^.;:]+\.X-ABRELATEDNAMES[;:]/i.test(line)),
    itemLabels
  );
}

/**
 * Normalize a vCard UID for use as a match key. Apple emits bare UUIDs, other
 * clients wrap them in a urn:uuid: scheme; treat those as the same identifier.
 */
function normalizeUid(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim().replace(/^urn:uuid:/i, '');
  return trimmed || null;
}

export function parseVcf(vcfContent: string): ParseResult {
  const contacts: ParsedContact[] = [];
  const errors: Array<{ line: number; reason: string }> = [];

  const unfolded = unfoldLines(vcfContent);
  const vcardBlocks = unfolded
    .split(/(?=BEGIN:VCARD)/gi)
    .filter(block => block.trim().length > 0);

  for (let i = 0; i < vcardBlocks.length; i++) {
    const block = vcardBlocks[i].trim();
    if (!block.match(/^BEGIN:VCARD/i)) continue;

    try {
      const parsed = parseSingleVcard(block);
      if (parsed) {
        contacts.push(parsed);
      }
    } catch (e) {
      errors.push({
        line: i + 1,
        reason: e instanceof Error ? e.message : 'Unknown parsing error'
      });
    }
  }

  return { contacts, errors };
}
