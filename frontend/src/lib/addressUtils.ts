/**
 * Address Formatting Utilities for Frontend
 * ==========================================
 * Provides address formatting functions for UI display.
 * This is a lightweight version optimized for the frontend.
 */

/**
 * Input address structure (matches backend AddressRecord fields)
 */
export interface AddressInput {
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

/**
 * Country name to ISO code mapping (subset for frontend)
 * Only includes most common countries for frontend display purposes
 */
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  // English names
  'argentina': 'AR',
  'australia': 'AU',
  'austria': 'AT',
  'belgium': 'BE',
  'brazil': 'BR',
  'canada': 'CA',
  'chile': 'CL',
  'china': 'CN',
  'colombia': 'CO',
  'czech republic': 'CZ',
  'czechia': 'CZ',
  'denmark': 'DK',
  'finland': 'FI',
  'france': 'FR',
  'germany': 'DE',
  'greece': 'GR',
  'hong kong': 'HK',
  'hungary': 'HU',
  'india': 'IN',
  'indonesia': 'ID',
  'ireland': 'IE',
  'israel': 'IL',
  'italy': 'IT',
  'japan': 'JP',
  'south korea': 'KR',
  'korea': 'KR',
  'malaysia': 'MY',
  'mexico': 'MX',
  'netherlands': 'NL',
  'new zealand': 'NZ',
  'norway': 'NO',
  'pakistan': 'PK',
  'philippines': 'PH',
  'poland': 'PL',
  'portugal': 'PT',
  'romania': 'RO',
  'russia': 'RU',
  'saudi arabia': 'SA',
  'singapore': 'SG',
  'spain': 'ES',
  'sweden': 'SE',
  'switzerland': 'CH',
  'taiwan': 'TW',
  'turkey': 'TR',
  'ukraine': 'UA',
  'united arab emirates': 'AE',
  'uae': 'AE',
  'united kingdom': 'GB',
  'uk': 'GB',
  'great britain': 'GB',
  'england': 'GB',
  'united states': 'US',
  'usa': 'US',
  'us': 'US',
  'america': 'US',
  'vietnam': 'VN',
  // Native names
  'deutschland': 'DE',
  'españa': 'ES',
  'espana': 'ES',
  'italia': 'IT',
  'brasil': 'BR',
  'méxico': 'MX',
  'österreich': 'AT',
  'schweiz': 'CH',
  'suisse': 'CH',
  'nederland': 'NL',
  'holland': 'NL',
  'polska': 'PL',
  'россия': 'RU',
  'україна': 'UA',
  '日本': 'JP',
  '中国': 'CN',
  '香港': 'HK',
  '台灣': 'TW',
  '한국': 'KR',
};

/**
 * Postal code position by country code
 * 'before' = postal code before city (e.g., "12345 Berlin")
 * 'after' = postal code after city (e.g., "San Francisco, CA 94102")
 */
const POSTAL_POSITION: Record<string, 'before' | 'after'> = {
  // Postal code BEFORE city (European style)
  'AR': 'before', 'AT': 'before', 'BE': 'before', 'BY': 'before', 'CH': 'before',
  'CL': 'before', 'CN': 'before', 'CZ': 'before', 'DE': 'before', 'DK': 'before',
  'EE': 'before', 'ES': 'before', 'FI': 'before', 'FR': 'before', 'GR': 'before',
  'HR': 'before', 'IL': 'before', 'IS': 'before', 'IT': 'before', 'JP': 'before',
  'MX': 'before', 'MY': 'before', 'NL': 'before', 'NO': 'before', 'PH': 'before',
  'PL': 'before', 'PT': 'before', 'RS': 'before', 'SE': 'before', 'SI': 'before',
  'SK': 'before', 'TR': 'before',

  // Postal code AFTER city (US/UK style)
  'AU': 'after', 'BD': 'after', 'BR': 'after', 'CA': 'after', 'CO': 'after',
  'GB': 'after', 'HU': 'after', 'ID': 'after', 'IE': 'after', 'IN': 'after',
  'IQ': 'after', 'IR': 'after', 'KR': 'after', 'LK': 'after', 'LV': 'after',
  'NZ': 'after', 'OM': 'after', 'PE': 'after', 'PK': 'after', 'RO': 'after',
  'RU': 'after', 'SA': 'after', 'SG': 'after', 'TW': 'after', 'UA': 'after',
  'US': 'after', 'VN': 'after',
};

/**
 * Countries that use comma between city and state (US/CA/AU style)
 */
const COMMA_BEFORE_STATE = new Set(['US', 'CA', 'AU']);

/**
 * Get ISO country code from country name
 */
function getCountryCode(countryName: string | null): string | null {
  if (!countryName) return null;

  const normalized = countryName.toLowerCase().trim();

  // Direct lookup
  if (COUNTRY_NAME_TO_CODE[normalized]) {
    return COUNTRY_NAME_TO_CODE[normalized];
  }

  // Check if it's already a 2-letter code
  const upper = countryName.toUpperCase().trim();
  if (upper.length === 2 && POSTAL_POSITION[upper]) {
    return upper;
  }

  return null;
}

/**
 * Format an address for single-line display.
 * Uses country-specific conventions when available.
 *
 * @param address - The address to format
 * @param options - Optional formatting options
 * @returns Formatted address string
 */
export function formatAddress(
  address: AddressInput,
  options: { includeCountry?: boolean } = {}
): string {
  const { includeCountry = false } = options;

  // Handle empty address
  const hasData = address.street || address.city || address.state ||
                  address.postalCode || address.country;

  if (!hasData) {
    return '(Empty address)';
  }

  // Resolve country code for formatting
  const countryCode = getCountryCode(address.country) || 'US';
  const postalPosition = POSTAL_POSITION[countryCode] || 'after';
  const useComma = COMMA_BEFORE_STATE.has(countryCode);

  const parts: string[] = [];

  // Add street
  if (address.street) {
    parts.push(address.street);
  }

  // Build city/state/postal portion
  const locationParts: string[] = [];

  if (postalPosition === 'before') {
    // European style: postal code before city
    if (address.postalCode) locationParts.push(address.postalCode);
    if (address.city) locationParts.push(address.city);
    if (address.state) locationParts.push(address.state);
  } else {
    // US/UK style: postal code after city
    if (address.city) {
      let cityPart = address.city;
      if (useComma && address.state) {
        cityPart += ',';
      }
      locationParts.push(cityPart);
    }
    if (address.state) locationParts.push(address.state);
    if (address.postalCode) locationParts.push(address.postalCode);
  }

  if (locationParts.length > 0) {
    parts.push(locationParts.join(' '));
  }

  // Add country if requested
  if (includeCountry && address.country) {
    parts.push(address.country);
  }

  return parts.join(', ') || '(Empty address)';
}

/**
 * Format an address for multiline display.
 *
 * @param address - The address to format
 * @param options - Optional formatting options
 * @returns Array of formatted address lines
 */
export function formatAddressLines(
  address: AddressInput,
  options: { includeCountry?: boolean } = {}
): string[] {
  const { includeCountry = false } = options;

  const lines: string[] = [];

  // Handle empty address
  const hasData = address.street || address.city || address.state ||
                  address.postalCode || address.country;

  if (!hasData) {
    return ['(Empty address)'];
  }

  // Resolve country code for formatting
  const countryCode = getCountryCode(address.country) || 'US';
  const postalPosition = POSTAL_POSITION[countryCode] || 'after';
  const useComma = COMMA_BEFORE_STATE.has(countryCode);

  // Add street line
  if (address.street) {
    lines.push(address.street);
  }

  // Build city/state/postal line
  const locationParts: string[] = [];

  if (postalPosition === 'before') {
    if (address.postalCode) locationParts.push(address.postalCode);
    if (address.city) locationParts.push(address.city);
    if (address.state) locationParts.push(address.state);
  } else {
    if (address.city) {
      let cityPart = address.city;
      if (useComma && address.state) {
        cityPart += ',';
      }
      locationParts.push(cityPart);
    }
    if (address.state) locationParts.push(address.state);
    if (address.postalCode) locationParts.push(address.postalCode);
  }

  if (locationParts.length > 0) {
    lines.push(locationParts.join(' '));
  }

  // Add country if requested
  if (includeCountry && address.country) {
    lines.push(address.country);
  }

  return lines.length > 0 ? lines : ['(Empty address)'];
}

/**
 * Get a brief label for an address (city + state/country).
 * Useful for displaying in lists or compact views.
 *
 * @param address - The address to format
 * @returns Brief location label
 */
export function getAddressLabel(address: AddressInput): string {
  const parts: string[] = [];

  if (address.city) parts.push(address.city);
  if (address.state) parts.push(address.state);
  else if (address.country) parts.push(address.country);

  return parts.join(', ') || '(No location)';
}
