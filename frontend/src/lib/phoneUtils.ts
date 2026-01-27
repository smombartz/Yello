/**
 * Convert a 2-letter ISO country code to a flag emoji.
 * Uses Unicode regional indicator symbols.
 */
export function getCountryFlag(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode.length !== 2) {
    return '';
  }

  const code = countryCode.toUpperCase();
  // Convert each letter to its regional indicator symbol
  // Regional indicators are at code points 0x1F1E6 (A) through 0x1F1FF (Z)
  const firstChar = code.charCodeAt(0) - 65 + 0x1f1e6;
  const secondChar = code.charCodeAt(1) - 65 + 0x1f1e6;

  return String.fromCodePoint(firstChar, secondChar);
}

/**
 * Get country name from ISO country code.
 */
export function getCountryName(countryCode: string | null | undefined): string {
  if (!countryCode) {
    return '';
  }

  const countryNames: Record<string, string> = {
    // Common countries
    US: 'United States',
    CA: 'Canada',
    GB: 'United Kingdom',
    UK: 'United Kingdom',
    AU: 'Australia',
    NZ: 'New Zealand',
    DE: 'Germany',
    FR: 'France',
    IT: 'Italy',
    ES: 'Spain',
    PT: 'Portugal',
    NL: 'Netherlands',
    BE: 'Belgium',
    CH: 'Switzerland',
    AT: 'Austria',
    SE: 'Sweden',
    NO: 'Norway',
    DK: 'Denmark',
    FI: 'Finland',
    IE: 'Ireland',
    PL: 'Poland',
    CZ: 'Czech Republic',
    RU: 'Russia',
    UA: 'Ukraine',
    GR: 'Greece',
    TR: 'Turkey',
    IL: 'Israel',
    SA: 'Saudi Arabia',
    AE: 'United Arab Emirates',
    IN: 'India',
    CN: 'China',
    JP: 'Japan',
    KR: 'South Korea',
    TW: 'Taiwan',
    HK: 'Hong Kong',
    SG: 'Singapore',
    MY: 'Malaysia',
    TH: 'Thailand',
    VN: 'Vietnam',
    ID: 'Indonesia',
    PH: 'Philippines',
    MX: 'Mexico',
    BR: 'Brazil',
    AR: 'Argentina',
    CL: 'Chile',
    CO: 'Colombia',
    PE: 'Peru',
    ZA: 'South Africa',
    EG: 'Egypt',
    NG: 'Nigeria',
    KE: 'Kenya',
  };

  return countryNames[countryCode.toUpperCase()] || countryCode.toUpperCase();
}

/**
 * Format a phone display with country flag prefix.
 */
export function formatPhoneWithFlag(
  phoneDisplay: string,
  countryCode: string | null | undefined
): string {
  const flag = getCountryFlag(countryCode);
  if (flag) {
    return `${flag} ${phoneDisplay}`;
  }
  return phoneDisplay;
}
