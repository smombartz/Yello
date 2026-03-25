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

  // ADR entries with country-formatted LABEL
  for (const address of contact.addresses) {
    const typeParam = getTypeParam(address.type);
    const adrValue = formatAdrValue(address);
    lines.push(`ADR${typeParam}:${adrValue}`);

    // Add LABEL with formatted address
    const labelValue = formatLabelValue(address);
    if (labelValue) {
      lines.push(`LABEL${typeParam}:${labelValue}`);
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
