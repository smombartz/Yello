import ICAL from 'ical.js';
import { parsePhoneNumber } from 'libphonenumber-js';

export interface ParsedEmail {
  email: string;
  type: string | null;
  isPrimary: boolean;
}

export interface ParsedPhone {
  phone: string;
  phoneDisplay: string;
  type: string | null;
  isPrimary: boolean;
}

export interface ParsedAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  type: string | null;
}

export interface ParsedInstantMessage {
  service: string;
  handle: string;
  type: string | null;
}

export interface ParsedUrl {
  url: string;
  label: string | null;
  type: string | null;
}

export interface ParsedRelatedPerson {
  name: string;
  relationship: string | null;
}

export interface ParsedSocialProfile {
  platform: string;
  username: string | null;
  url: string;
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
}

export interface ParseResult {
  contacts: ParsedContact[];
  errors: Array<{ line: number; reason: string }>;
}

function unfoldLines(vcfContent: string): string {
  return vcfContent.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function extractType(params: Record<string, string | string[]> | undefined): string | null {
  if (!params) return null;
  const typeValue = params.type || params.TYPE;
  if (Array.isArray(typeValue)) {
    return typeValue[0]?.toLowerCase() || null;
  }
  return typeValue?.toLowerCase() || null;
}

function parsePhone(rawPhone: string): { phone: string; phoneDisplay: string } {
  try {
    const parsed = parsePhoneNumber(rawPhone, 'US');
    if (parsed) {
      return {
        phone: parsed.format('E.164'),
        phoneDisplay: parsed.formatNational()
      };
    }
  } catch {
    // Fall through to raw value
  }
  const cleaned = rawPhone.replace(/[^\d+]/g, '');
  return { phone: cleaned, phoneDisplay: rawPhone };
}

function parseSingleVcard(vcardText: string): ParsedContact | null {
  const jcalData = ICAL.parse(vcardText);
  const comp = new ICAL.Component(jcalData);

  const fnProp = comp.getFirstPropertyValue('fn');
  const nProp = comp.getFirstProperty('n');

  let displayName = fnProp as string;
  let firstName: string | null = null;
  let lastName: string | null = null;

  if (nProp) {
    // ical.js returns N property as a single structured value (array)
    const nValue = nProp.getFirstValue();
    if (Array.isArray(nValue) && nValue.length >= 2) {
      lastName = nValue[0] || null;
      firstName = nValue[1] || null;
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

  const emails: ParsedEmail[] = [];
  for (const emailProp of comp.getAllProperties('email')) {
    const email = emailProp.getFirstValue() as string;
    if (email) {
      emails.push({
        email: email.replace(/^mailto:/i, ''),
        type: extractType(emailProp.toJSON()[1]),
        isPrimary: emails.length === 0
      });
    }
  }

  const phones: ParsedPhone[] = [];
  for (const telProp of comp.getAllProperties('tel')) {
    const rawPhone = telProp.getFirstValue() as string;
    if (rawPhone) {
      const { phone, phoneDisplay } = parsePhone(rawPhone.replace(/^tel:/i, ''));
      phones.push({
        phone,
        phoneDisplay,
        type: extractType(telProp.toJSON()[1]),
        isPrimary: phones.length === 0
      });
    }
  }

  const addresses: ParsedAddress[] = [];
  for (const adrProp of comp.getAllProperties('adr')) {
    const adrValue = adrProp.getValues() as string[];
    if (adrValue && adrValue.length > 0) {
      addresses.push({
        street: adrValue[2] || null,
        city: adrValue[3] || null,
        state: adrValue[4] || null,
        postalCode: adrValue[5] || null,
        country: adrValue[6] || null,
        type: extractType(adrProp.toJSON()[1])
      });
    }
  }

  const orgProp = comp.getFirstPropertyValue('org') as string | string[] | null;
  const company = Array.isArray(orgProp) ? orgProp[0] : orgProp;

  const title = comp.getFirstPropertyValue('title') as string | null;
  const notes = comp.getFirstPropertyValue('note') as string | null;

  let photoBase64: string | null = null;
  const photoProp = comp.getFirstProperty('photo');
  if (photoProp) {
    const photoValue = photoProp.getFirstValue();
    if (typeof photoValue === 'string') {
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
  const rawLines = vcardText.split(/\r?\n/);

  // First try ical.js
  const categoriesProp = comp.getFirstPropertyValue('categories');
  if (categoriesProp) {
    if (Array.isArray(categoriesProp)) {
      categories.push(...categoriesProp.filter((c): c is string => typeof c === 'string'));
    } else if (typeof categoriesProp === 'string') {
      categories.push(...categoriesProp.split(',').map(c => c.trim()).filter(Boolean));
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
        type: extractType(params)
      });
    }
  }

  // Build a map of item labels for URL matching (e.g., item3.X-ABLabel -> LinkedIn)
  const itemLabels = new Map<string, string>();
  for (const line of rawLines) {
    const match = line.match(/^(item\d+)\.X-ABLabel[;:](.+)/i);
    if (match) {
      // Handle parameter format and simple format
      const labelValue = match[2].includes(':')
        ? match[2].split(':').pop()?.trim()
        : match[2].replace(/^[^:]*:/, '').trim();
      if (labelValue) {
        itemLabels.set(match[1].toLowerCase(), labelValue);
      }
    }
  }

  // Parse URLs with labels
  const urls: ParsedUrl[] = [];
  for (const urlProp of comp.getAllProperties('url')) {
    const urlValue = urlProp.getFirstValue() as string;
    if (urlValue) {
      const params = urlProp.toJSON()[1] as Record<string, string | string[]>;

      // Check for item group to get label
      let label: string | null = null;
      const propName = urlProp.toJSON()[0] as string;
      const itemMatch = propName.match(/^(item\d+)\./i);
      if (itemMatch) {
        label = itemLabels.get(itemMatch[1].toLowerCase()) || null;
      }

      urls.push({
        url: urlValue,
        label,
        type: extractType(params)
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

  // Parse related people (X-ABRELATEDNAMES)
  const relatedPeople: ParsedRelatedPerson[] = [];
  for (const line of rawLines) {
    const match = line.match(/^X-ABRELATEDNAMES[;:](.+)/i);
    if (match) {
      const rest = match[1];
      // Extract type if present
      let relationship: string | null = null;
      let name: string;

      if (rest.includes(':')) {
        const parts = rest.split(':');
        const paramPart = parts.slice(0, -1).join(':');
        name = parts[parts.length - 1];

        const typeMatch = paramPart.match(/TYPE=([^;:]+)/i);
        if (typeMatch) {
          relationship = typeMatch[1].toLowerCase();
          if (relationship === 'pref') relationship = null;
        }
      } else {
        name = rest;
      }

      if (name) {
        relatedPeople.push({ name, relationship });
      }
    }
  }

  // Parse social profiles (X-SOCIALPROFILE)
  const socialProfiles: ParsedSocialProfile[] = [];
  for (const line of rawLines) {
    const match = line.match(/^X-SOCIALPROFILE[;:](.+)/i);
    if (match) {
      const rest = match[1];
      let platform = 'social';
      let username: string | null = null;
      let url = '';

      // Parse parameters and value
      if (rest.includes(':')) {
        const colonIdx = rest.indexOf('http');
        if (colonIdx >= 0) {
          const paramPart = rest.substring(0, colonIdx);
          url = rest.substring(colonIdx);

          const typeMatch = paramPart.match(/TYPE=([^;:]+)/i);
          if (typeMatch) {
            platform = typeMatch[1].toLowerCase();
          }

          const userMatch = paramPart.match(/X-USER=([^;:]+)/i);
          if (userMatch) {
            username = userMatch[1];
          }
        } else {
          // No HTTP URL, might be protocol:value
          const parts = rest.split(':');
          if (parts.length >= 2) {
            const paramPart = parts.slice(0, -1).join(':');
            url = parts[parts.length - 1];

            const typeMatch = paramPart.match(/TYPE=([^;:]+)/i);
            if (typeMatch) {
              platform = typeMatch[1].toLowerCase();
            }
          }
        }
      }

      if (url) {
        socialProfiles.push({ platform, username, url });
      }
    }
  }

  return {
    firstName,
    lastName,
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
    rawVcard: vcardText
  };
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
