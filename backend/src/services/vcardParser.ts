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

export interface ParsedContact {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  company: string | null;
  title: string | null;
  notes: string | null;
  emails: ParsedEmail[];
  phones: ParsedPhone[];
  addresses: ParsedAddress[];
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

  return {
    firstName,
    lastName,
    displayName,
    company: company || null,
    title,
    notes,
    emails,
    phones,
    addresses,
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
