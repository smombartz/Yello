/**
 * Address Formatter Utility
 * ==========================
 * Formats addresses according to country-specific conventions.
 */

import { ADDRESS_FORMATS, getFormat, type AddressFormatConfig } from './addressFormats.js';
import { getCountryCode } from './countryMapping.js';

/**
 * Input address structure
 */
export interface AddressInput {
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

/**
 * Formatted address result
 */
export interface FormattedAddress {
  /** Formatted address lines (for multiline display) */
  lines: string[];
  /** Single-line display format */
  display: string;
  /** Country format configuration used (if found) */
  format: AddressFormatConfig | null;
  /** ISO country code (if resolved) */
  countryCode: string | null;
}

/**
 * Format options
 */
export interface FormatOptions {
  /** Include country in output (default: false for domestic, true if country differs from default) */
  includeCountry?: boolean;
  /** Default country code for addresses without country (default: 'US') */
  defaultCountry?: string;
  /** Use single-line format only (default: false) */
  singleLine?: boolean;
}

/**
 * Detect the position of a street number in a street address string.
 * Returns 'before' if number appears to be at the start (e.g., "123 Main St"),
 * 'after' if at the end (e.g., "Hauptstr. 5"), or null if unclear.
 *
 * @param street - The street address string
 * @returns 'before' | 'after' | null
 */
export function detectStreetNumberPosition(street: string): 'before' | 'after' | null {
  if (!street || !street.trim()) return null;

  const trimmed = street.trim();

  // Check for number at the start (with optional letter suffix like "123A")
  const startsWithNumber = /^\d+[A-Za-z]?\s/.test(trimmed);

  // Check for number at the end (with optional letter suffix)
  // Also handles "No. 5", "Nr. 5", "N° 5" patterns at the end
  const endsWithNumber = /\s(?:No\.?|Nr\.?|N°)?\s*\d+[A-Za-z]?$/i.test(trimmed) ||
                         /\s\d+[A-Za-z]?$/.test(trimmed);

  if (startsWithNumber && !endsWithNumber) {
    return 'before';
  }

  if (endsWithNumber && !startsWithNumber) {
    return 'after';
  }

  // If both or neither, return null (ambiguous)
  return null;
}

/**
 * Extract street number from a street address string.
 *
 * @param street - The street address string
 * @returns The extracted street number or null
 */
export function extractStreetNumber(street: string): string | null {
  if (!street) return null;

  const trimmed = street.trim();

  // Try to match number at start
  const startMatch = trimmed.match(/^(\d+[A-Za-z]?)\s/);
  if (startMatch) {
    return startMatch[1];
  }

  // Try to match number at end (various formats)
  const endMatch = trimmed.match(/(?:No\.?|Nr\.?|N°)?\s*(\d+[A-Za-z]?)$/i);
  if (endMatch) {
    return endMatch[1];
  }

  return null;
}

/**
 * Extract street name from a street address string.
 *
 * @param street - The street address string
 * @returns The extracted street name or the original string
 */
export function extractStreetName(street: string): string {
  if (!street) return '';

  const trimmed = street.trim();

  // Remove number at start
  let result = trimmed.replace(/^\d+[A-Za-z]?\s+/, '');

  // Remove number at end (various formats)
  result = result.replace(/\s+(?:No\.?|Nr\.?|N°)?\s*\d+[A-Za-z]?$/i, '');

  return result.trim() || trimmed;
}

/**
 * Format a single-line address string (simple comma-separated format).
 * Used as fallback when country-specific formatting is not available.
 *
 * @param address - The address to format
 * @returns Single-line formatted address
 */
export function formatAddressSimple(address: AddressInput): string {
  const parts = [
    address.street,
    address.city,
    address.state,
    address.postalCode,
    address.country
  ].filter(Boolean);

  return parts.join(', ') || '(Empty address)';
}

/**
 * Format an address according to country-specific conventions.
 *
 * @param address - The address to format
 * @param options - Formatting options
 * @returns Formatted address with lines and display string
 */
export function formatAddress(address: AddressInput, options: FormatOptions = {}): FormattedAddress {
  const {
    includeCountry = false,
    defaultCountry = 'US',
    singleLine = false
  } = options;

  // Resolve country code
  const countryCode = getCountryCode(address.country) || defaultCountry;
  const format = countryCode ? getFormat(countryCode) : null;

  // If no format found or all fields are empty, use simple format
  const hasData = address.street || address.city || address.state ||
                  address.postalCode || address.country;

  if (!hasData) {
    return {
      lines: ['(Empty address)'],
      display: '(Empty address)',
      format: null,
      countryCode: null
    };
  }

  if (!format) {
    // Fallback to simple comma-separated format
    const display = formatAddressSimple(address);
    return {
      lines: [display],
      display,
      format: null,
      countryCode
    };
  }

  // Build formatted address based on country conventions
  const lines: string[] = [];

  // Format based on postal code position and street number position
  const postalPosition = format.postalCodePosition;

  // Build city/state/postal line based on format
  let cityLine = '';

  if (postalPosition === 'before') {
    // Postal code before city (e.g., Germany: "12345 Berlin")
    const parts: string[] = [];
    if (address.postalCode) parts.push(address.postalCode);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    cityLine = parts.join(' ');
  } else if (postalPosition === 'after') {
    // Postal code after city (e.g., US: "San Francisco, CA 94102")
    const parts: string[] = [];
    if (address.city) parts.push(address.city);
    if (address.state) {
      // Some countries use comma between city and state (US), others don't
      if (countryCode === 'US' || countryCode === 'CA' || countryCode === 'AU') {
        if (parts.length > 0) {
          parts[parts.length - 1] += ',';
        }
      }
      parts.push(address.state);
    }
    if (address.postalCode) parts.push(address.postalCode);
    cityLine = parts.join(' ');
  } else {
    // No postal code position defined (e.g., Hong Kong has no postal codes)
    const parts: string[] = [];
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    cityLine = parts.join(', ');
  }

  // Add street line
  if (address.street) {
    lines.push(address.street);
  }

  // Add city/state/postal line
  if (cityLine) {
    lines.push(cityLine);
  }

  // Add country if requested
  if (includeCountry && address.country) {
    lines.push(address.country);
  }

  // Build display string
  const display = singleLine
    ? lines.join(', ')
    : lines.join('\n');

  return {
    lines,
    display,
    format,
    countryCode
  };
}

/**
 * Format address for display in a UI (single-line, comma-separated).
 * This is a convenience wrapper around formatAddress.
 *
 * @param address - The address to format
 * @returns Single-line formatted address string
 */
export function formatAddressForDisplay(address: AddressInput): string {
  return formatAddress(address, { singleLine: true }).display;
}

/**
 * Format address for mailing (multiline format according to country conventions).
 *
 * @param address - The address to format
 * @param includeCountry - Whether to include country line (for international mail)
 * @returns Multiline formatted address string
 */
export function formatAddressForMailing(address: AddressInput, includeCountry = true): string {
  return formatAddress(address, { includeCountry }).display;
}

/**
 * Validate an address street number position against country conventions.
 *
 * @param address - The address to validate
 * @returns Validation result with isValid flag and details
 */
export function validateStreetNumberPosition(address: AddressInput): {
  isValid: boolean;
  expectedPosition: 'before' | 'after' | null;
  detectedPosition: 'before' | 'after' | null;
  message: string | null;
} {
  if (!address.street) {
    return {
      isValid: true,
      expectedPosition: null,
      detectedPosition: null,
      message: null
    };
  }

  const countryCode = getCountryCode(address.country);
  const format = countryCode ? getFormat(countryCode) : null;

  if (!format || !format.streetNumberPosition) {
    return {
      isValid: true,
      expectedPosition: null,
      detectedPosition: detectStreetNumberPosition(address.street),
      message: null
    };
  }

  const detectedPosition = detectStreetNumberPosition(address.street);

  if (!detectedPosition) {
    // Could not detect position - cannot validate
    return {
      isValid: true,
      expectedPosition: format.streetNumberPosition,
      detectedPosition: null,
      message: null
    };
  }

  const isValid = detectedPosition === format.streetNumberPosition;

  return {
    isValid,
    expectedPosition: format.streetNumberPosition,
    detectedPosition,
    message: isValid
      ? null
      : `Street number should be ${format.streetNumberPosition === 'before' ? 'before' : 'after'} the street name in ${format.name}`
  };
}

/**
 * Get formatting hints for a country.
 *
 * @param countryNameOrCode - Country name or ISO code
 * @returns Formatting hints or null if country not supported
 */
export function getCountryFormattingHints(countryNameOrCode: string | null): {
  name: string;
  streetNumberPosition: 'before' | 'after' | null;
  postalCodePosition: 'before' | 'after' | null;
  postalCodeFormat: string;
  notes: string[];
  example: string;
} | null {
  if (!countryNameOrCode) return null;

  const code = getCountryCode(countryNameOrCode);
  if (!code) return null;

  const format = getFormat(code);
  if (!format) return null;

  return {
    name: format.name,
    streetNumberPosition: format.streetNumberPosition,
    postalCodePosition: format.postalCodePosition,
    postalCodeFormat: format.postalCodeFormat.description,
    notes: format.notes,
    example: format.example
  };
}
