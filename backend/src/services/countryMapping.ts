/**
 * Country Name ↔ ISO 3166-1 Alpha-2 Code Mapping
 * ================================================
 * Maps common country names (including variations, demonyms, and translations)
 * to their ISO 3166-1 alpha-2 codes for use with address formatting.
 */

/**
 * Mapping from country names (lowercase) to ISO codes
 * Includes common variations, translations, and abbreviations
 */
export const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  // Argentina
  'argentina': 'AR',
  'argentine republic': 'AR',
  'arg': 'AR',

  // Australia
  'australia': 'AU',
  'aus': 'AU',

  // Austria
  'austria': 'AT',
  'österreich': 'AT',
  'oesterreich': 'AT',
  'aut': 'AT',

  // Bangladesh
  'bangladesh': 'BD',
  'বাংলাদেশ': 'BD',

  // Belarus
  'belarus': 'BY',
  'беларусь': 'BY',
  'белоруссия': 'BY',

  // Belgium
  'belgium': 'BE',
  'belgique': 'BE',
  'belgië': 'BE',
  'belgie': 'BE',
  'bel': 'BE',

  // Brazil
  'brazil': 'BR',
  'brasil': 'BR',
  'bra': 'BR',

  // Canada
  'canada': 'CA',
  'can': 'CA',

  // Chile
  'chile': 'CL',
  'chl': 'CL',

  // China
  'china': 'CN',
  "people's republic of china": 'CN',
  'p.r. china': 'CN',
  'p.r.c.': 'CN',
  'prc': 'CN',
  '中国': 'CN',
  '中华人民共和国': 'CN',
  'chn': 'CN',

  // Colombia
  'colombia': 'CO',
  'col': 'CO',

  // Croatia
  'croatia': 'HR',
  'hrvatska': 'HR',
  'hrv': 'HR',

  // Czech Republic
  'czech republic': 'CZ',
  'czechia': 'CZ',
  'česko': 'CZ',
  'cesko': 'CZ',
  'česká republika': 'CZ',
  'ceska republika': 'CZ',
  'cze': 'CZ',

  // Denmark
  'denmark': 'DK',
  'danmark': 'DK',
  'dnk': 'DK',

  // Estonia
  'estonia': 'EE',
  'eesti': 'EE',
  'est': 'EE',

  // Finland
  'finland': 'FI',
  'suomi': 'FI',
  'fin': 'FI',

  // France
  'france': 'FR',
  'fra': 'FR',

  // Germany
  'germany': 'DE',
  'deutschland': 'DE',
  'deu': 'DE',
  'ger': 'DE',

  // Greece
  'greece': 'GR',
  'hellas': 'GR',
  'ελλάδα': 'GR',
  'ellada': 'GR',
  'grc': 'GR',

  // Hong Kong
  'hong kong': 'HK',
  'hongkong': 'HK',
  '香港': 'HK',
  'hkg': 'HK',

  // Hungary
  'hungary': 'HU',
  'magyarország': 'HU',
  'magyarorszag': 'HU',
  'hun': 'HU',

  // Iceland
  'iceland': 'IS',
  'ísland': 'IS',
  'island': 'IS',
  'isl': 'IS',

  // India
  'india': 'IN',
  'भारत': 'IN',
  'ind': 'IN',

  // Indonesia
  'indonesia': 'ID',
  'idn': 'ID',

  // Iran
  'iran': 'IR',
  'islamic republic of iran': 'IR',
  'ایران': 'IR',
  'irn': 'IR',

  // Iraq
  'iraq': 'IQ',
  'العراق': 'IQ',
  'irq': 'IQ',

  // Ireland
  'ireland': 'IE',
  'éire': 'IE',
  'eire': 'IE',
  'republic of ireland': 'IE',
  'irl': 'IE',

  // Israel
  'israel': 'IL',
  'ישראל': 'IL',
  'isr': 'IL',

  // Italy
  'italy': 'IT',
  'italia': 'IT',
  'ita': 'IT',

  // Japan
  'japan': 'JP',
  '日本': 'JP',
  'nippon': 'JP',
  'jpn': 'JP',

  // South Korea
  'south korea': 'KR',
  'korea': 'KR',
  'republic of korea': 'KR',
  '대한민국': 'KR',
  '한국': 'KR',
  'kor': 'KR',

  // Latvia
  'latvia': 'LV',
  'latvija': 'LV',
  'lva': 'LV',

  // Macao
  'macao': 'MO',
  'macau': 'MO',
  '澳門': 'MO',
  'mac': 'MO',

  // Malaysia
  'malaysia': 'MY',
  'mys': 'MY',

  // Mexico
  'mexico': 'MX',
  'méxico': 'MX',
  'mex': 'MX',

  // Netherlands
  'netherlands': 'NL',
  'the netherlands': 'NL',
  'holland': 'NL',
  'nederland': 'NL',
  'nld': 'NL',

  // New Zealand
  'new zealand': 'NZ',
  'nzl': 'NZ',

  // Norway
  'norway': 'NO',
  'norge': 'NO',
  'noreg': 'NO',
  'nor': 'NO',

  // Oman
  'oman': 'OM',
  'عمان': 'OM',
  'omn': 'OM',

  // Pakistan
  'pakistan': 'PK',
  'پاکستان': 'PK',
  'pak': 'PK',

  // Peru
  'peru': 'PE',
  'perú': 'PE',
  'per': 'PE',

  // Philippines
  'philippines': 'PH',
  'the philippines': 'PH',
  'pilipinas': 'PH',
  'phl': 'PH',

  // Poland
  'poland': 'PL',
  'polska': 'PL',
  'pol': 'PL',

  // Portugal
  'portugal': 'PT',
  'prt': 'PT',

  // Qatar
  'qatar': 'QA',
  'قطر': 'QA',
  'qat': 'QA',

  // Romania
  'romania': 'RO',
  'românia': 'RO',
  'rou': 'RO',

  // Russia
  'russia': 'RU',
  'russian federation': 'RU',
  'россия': 'RU',
  'российская федерация': 'RU',
  'rus': 'RU',

  // Saudi Arabia
  'saudi arabia': 'SA',
  'kingdom of saudi arabia': 'SA',
  'السعودية': 'SA',
  'المملكة العربية السعودية': 'SA',
  'sau': 'SA',

  // Serbia
  'serbia': 'RS',
  'србија': 'RS',
  'srbija': 'RS',
  'srb': 'RS',

  // Singapore
  'singapore': 'SG',
  '新加坡': 'SG',
  'sgp': 'SG',

  // Slovakia
  'slovakia': 'SK',
  'slovensko': 'SK',
  'svk': 'SK',

  // Slovenia
  'slovenia': 'SI',
  'slovenija': 'SI',
  'svn': 'SI',

  // Spain
  'spain': 'ES',
  'españa': 'ES',
  'espana': 'ES',
  'esp': 'ES',

  // Sri Lanka
  'sri lanka': 'LK',
  'ශ්‍රී ලංකාව': 'LK',
  'இலங்கை': 'LK',
  'lka': 'LK',

  // Sweden
  'sweden': 'SE',
  'sverige': 'SE',
  'swe': 'SE',

  // Switzerland
  'switzerland': 'CH',
  'schweiz': 'CH',
  'suisse': 'CH',
  'svizzera': 'CH',
  'svizra': 'CH',
  'che': 'CH',

  // Taiwan
  'taiwan': 'TW',
  '台灣': 'TW',
  '台湾': 'TW',
  'republic of china': 'TW',
  'twn': 'TW',

  // Turkey
  'turkey': 'TR',
  'türkiye': 'TR',
  'turkiye': 'TR',
  'tur': 'TR',

  // Ukraine
  'ukraine': 'UA',
  'україна': 'UA',
  'украина': 'UA',
  'ukr': 'UA',

  // United Arab Emirates
  'united arab emirates': 'AE',
  'uae': 'AE',
  'u.a.e.': 'AE',
  'الإمارات العربية المتحدة': 'AE',
  'are': 'AE',

  // United Kingdom
  'united kingdom': 'GB',
  'uk': 'GB',
  'u.k.': 'GB',
  'great britain': 'GB',
  'britain': 'GB',
  'england': 'GB',  // Note: technically only part of UK, but commonly used
  'scotland': 'GB',
  'wales': 'GB',
  'northern ireland': 'GB',
  'gbr': 'GB',

  // United States
  'united states': 'US',
  'united states of america': 'US',
  'usa': 'US',
  'u.s.a.': 'US',
  'u.s.': 'US',
  'us': 'US',
  'america': 'US',

  // Vietnam
  'vietnam': 'VN',
  'viet nam': 'VN',
  'việt nam': 'VN',
  'vnm': 'VN',
};

/**
 * Reverse mapping from ISO codes to canonical English country names
 */
export const CODE_TO_COUNTRY_NAME: Record<string, string> = {
  'AR': 'Argentina',
  'AU': 'Australia',
  'AT': 'Austria',
  'BD': 'Bangladesh',
  'BY': 'Belarus',
  'BE': 'Belgium',
  'BR': 'Brazil',
  'CA': 'Canada',
  'CL': 'Chile',
  'CN': 'China',
  'CO': 'Colombia',
  'HR': 'Croatia',
  'CZ': 'Czech Republic',
  'DK': 'Denmark',
  'EE': 'Estonia',
  'FI': 'Finland',
  'FR': 'France',
  'DE': 'Germany',
  'GR': 'Greece',
  'HK': 'Hong Kong',
  'HU': 'Hungary',
  'IS': 'Iceland',
  'IN': 'India',
  'ID': 'Indonesia',
  'IR': 'Iran',
  'IQ': 'Iraq',
  'IE': 'Ireland',
  'IL': 'Israel',
  'IT': 'Italy',
  'JP': 'Japan',
  'KR': 'South Korea',
  'LV': 'Latvia',
  'MO': 'Macao',
  'MY': 'Malaysia',
  'MX': 'Mexico',
  'NL': 'Netherlands',
  'NZ': 'New Zealand',
  'NO': 'Norway',
  'OM': 'Oman',
  'PK': 'Pakistan',
  'PE': 'Peru',
  'PH': 'Philippines',
  'PL': 'Poland',
  'PT': 'Portugal',
  'QA': 'Qatar',
  'RO': 'Romania',
  'RU': 'Russia',
  'SA': 'Saudi Arabia',
  'RS': 'Serbia',
  'SG': 'Singapore',
  'SK': 'Slovakia',
  'SI': 'Slovenia',
  'ES': 'Spain',
  'LK': 'Sri Lanka',
  'SE': 'Sweden',
  'CH': 'Switzerland',
  'TW': 'Taiwan',
  'TR': 'Turkey',
  'UA': 'Ukraine',
  'AE': 'United Arab Emirates',
  'GB': 'United Kingdom',
  'US': 'United States',
  'VN': 'Vietnam',
};

/**
 * Get ISO country code from country name.
 * Handles various common spellings, translations, and abbreviations.
 *
 * @param countryName - The country name to look up (case-insensitive)
 * @returns ISO 3166-1 alpha-2 code or null if not found
 */
export function getCountryCode(countryName: string | null): string | null {
  if (!countryName) return null;

  const normalized = countryName.toLowerCase().trim();

  // Direct lookup
  if (COUNTRY_NAME_TO_CODE[normalized]) {
    return COUNTRY_NAME_TO_CODE[normalized];
  }

  // Check if it's already an ISO code (2 uppercase letters)
  const upperInput = countryName.toUpperCase().trim();
  if (upperInput.length === 2 && CODE_TO_COUNTRY_NAME[upperInput]) {
    return upperInput;
  }

  return null;
}

/**
 * Get canonical English country name from ISO code.
 *
 * @param code - ISO 3166-1 alpha-2 code
 * @returns English country name or null if not found
 */
export function getCountryName(code: string | null): string | null {
  if (!code) return null;
  return CODE_TO_COUNTRY_NAME[code.toUpperCase().trim()] || null;
}

/**
 * Normalize a country name to its canonical English form.
 *
 * @param input - Country name or code
 * @returns Canonical English country name or the original input if not recognized
 */
export function normalizeCountryName(input: string | null): string | null {
  if (!input) return null;

  const code = getCountryCode(input);
  if (code) {
    return getCountryName(code);
  }

  // Return original if not recognized
  return input.trim();
}

/**
 * Check if a country is supported in our format database.
 *
 * @param countryNameOrCode - Country name or ISO code
 * @returns true if the country is supported
 */
export function isCountrySupported(countryNameOrCode: string | null): boolean {
  if (!countryNameOrCode) return false;
  const code = getCountryCode(countryNameOrCode);
  return code !== null;
}
