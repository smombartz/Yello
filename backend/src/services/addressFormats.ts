/**
 * Address Format Reference for Country-Specific Address Formatting
 * ================================================================
 * Source: Wikipedia — "Address format by country and area"
 *
 * Each country entry contains:
 *   - format: ordered array of address line components (top to bottom)
 *   - postalCodeFormat: regex pattern and description for postal code validation
 *   - postalCodePosition: where the postal code appears relative to the city ("before" or "after")
 *   - streetNumberPosition: whether street number comes "before" or "after" the street name
 *   - notes: array of important formatting quirks
 *   - example: a realistic formatted address as a multiline string
 */

export interface AddressFormatConfig {
  name: string;
  format: string[];
  postalCodeFormat: { regex: RegExp | null; description: string };
  postalCodePosition: 'before' | 'after' | null;
  streetNumberPosition: 'before' | 'after' | null;
  notes: string[];
  example: string;
}

export const ADDRESS_FORMATS: Record<string, AddressFormatConfig> = {
  // ─── ARGENTINA ──────────────────────────────────────────────
  AR: {
    name: "Argentina",
    format: [
      "recipient",
      "streetName streetNumber",
      "unit, neighborhood",
      "postalCode, city"
    ],
    postalCodeFormat: {
      regex: /^[A-Z]\d{4}[A-Z]{3}$|^\d{4}$/,
      description: "Old: 4 digits (1828). New: letter + 4 digits + 3 letters (B1828HKH)"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Street name comes before the number, separated by comma or space",
      "New 8-character postal code: district letter + 4 digits + 3 letters",
      "Old 4-digit format still accepted but province name should be added"
    ],
    example: `Luis Escala
Piedras 623
Piso 2, depto 4
C1070AAM, Capital Federal`
  },

  // ─── AUSTRALIA ──────────────────────────────────────────────
  AU: {
    name: "Australia",
    format: [
      "recipient",
      "organization",
      "unit/streetNumber streetName",
      "city state postalCode"
    ],
    postalCodeFormat: {
      regex: /^\d{4}$/,
      description: "4 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "before",
    notes: [
      "Unit numbers use forward slash before street number: 3/17 Adam Street",
      "Locality (suburb) is used instead of city — never include the metro city name",
      "Last line should be in CAPITALS per Australia Post",
      "State abbreviated: NSW, VIC, QLD, SA, WA, TAS, NT, ACT",
      "Two spaces between suburb and state; two spaces between state and postcode"
    ],
    example: `Ms H Williams
Finance and Accounting
219-241 Cleveland St
STRAWBERRY HILLS NSW 1427`
  },

  // ─── AUSTRIA ────────────────────────────────────────────────
  AT: {
    name: "Austria",
    format: [
      "recipient",
      "organization",
      "streetName streetNumber",
      "postalCode city"
    ],
    postalCodeFormat: {
      regex: /^\d{4}$/,
      description: "4 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Street number follows street name",
      "Postal code always 4 digits, precedes the city"
    ],
    example: `Firma ABC
Kundendienst
Hauptstr. 5
1234 Musterstadt`
  },

  // ─── BANGLADESH ─────────────────────────────────────────────
  BD: {
    name: "Bangladesh",
    format: [
      "recipient",
      "unit, buildingName",
      "streetName streetNumber",
      "city postalCode",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{4}$/,
      description: "4 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "after",
    notes: [
      "Urban and rural formats differ significantly",
      "Rural: Village, Post Office (P.O.), Thana, District instead of street",
      "Postal code is 4 digits"
    ],
    example: `Mr. Rahman
Flat 3A, Sunrise Tower
12 Gulshan Avenue
Dhaka 1212
Bangladesh`
  },

  // ─── BELARUS ────────────────────────────────────────────────
  BY: {
    name: "Belarus",
    format: [
      "recipient",
      "streetName, streetNumber, unit",
      "village",
      "postalCode, city",
      "district",
      "region",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{6}$/,
      description: "6 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Written in Cyrillic domestically, Latin for international mail",
      "Some buildings use subsidiary building numbers (bud.)",
      "Microraion numbering may replace street names in newer areas"
    ],
    example: `Svistunov Ivan Piatrovič
vul. Tsentralnaya, d. 20
v. Karalistavičy
223016, Novy Dvor
Minskaha r-na
Minskaj vobl.`
  },

  // ─── BELGIUM ────────────────────────────────────────────────
  BE: {
    name: "Belgium",
    format: [
      "recipient",
      "department",
      "organization",
      "spatialInfo",
      "streetName streetNumber bus boxNumber",
      "postalCode city",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{4}$/,
      description: "4 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Street number after street name, separated by a space",
      "Box number: 'bus' (Dutch) or 'bte' (French) — no symbols like #, /, -",
      "No punctuation between street name and number",
      "Building/floor/stairwell info goes on a SEPARATE line above the street line"
    ],
    example: `Monsieur Alain Dupont
Directeur Service Clients
Acme SA
Bloc A – étage 4
Rue du Vivier 7C bte 5
1000 Bruxelles`
  },

  // ─── BRAZIL ─────────────────────────────────────────────────
  BR: {
    name: "Brazil",
    format: [
      "recipient",
      "streetType streetName, streetNumber, unit",
      "neighborhood",
      "city – state",
      "postalCode"
    ],
    postalCodeFormat: {
      regex: /^\d{5}-\d{3}$/,
      description: "5 digits, hyphen, 3 digits (13035-680)"
    },
    postalCodePosition: "after",
    streetNumberPosition: "after",
    notes: [
      "CEP (postal code) format: NNNNN-NNN",
      "State can be full name, partial, or 2-letter abbreviation (SP, RJ, etc.)",
      "Street types: Rua, Avenida (Av.), Travessa, Alameda, etc.",
      "Cities 60k+ have street-level postal codes (-000 to -899)"
    ],
    example: `Carlos Rossi
Avenida João Jorge, 112, ap. 31
Vila Industrial
Campinas – SP
13035-680`
  },

  // ─── CANADA ─────────────────────────────────────────────────
  CA: {
    name: "Canada",
    format: [
      "recipient",
      "unit-streetNumber streetName streetType direction",
      "city state postalCode"
    ],
    postalCodeFormat: {
      regex: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/,
      description: "Letter-Digit-Letter Space Digit-Letter-Digit (A1A 1A1)"
    },
    postalCodePosition: "after",
    streetNumberPosition: "before",
    notes: [
      "Apartment number BEFORE house number, separated by hyphen: 10-123 Rue Main",
      "Province uses 2-letter abbreviation: ON, QC, BC, AB, etc.",
      "Two spaces between province abbreviation and postal code",
      "Street names are not translated; only Street/Avenue/Boulevard may be translated",
      "Québec format differs slightly (e.g., uses commas, full province name in parens)",
      "'CANADA' at the bottom for international mail"
    ],
    example: `NICOLE MARTIN
123 SHERBROOKE ST
TORONTO ON  L3R 9P6`
  },

  // ─── CHILE ──────────────────────────────────────────────────
  CL: {
    name: "Chile",
    format: [
      "recipient",
      "streetName streetNumber",
      "unit",
      "postalCode city",
      "region"
    ],
    postalCodeFormat: {
      regex: /^\d{7}$/,
      description: "7 digits (first 3 = municipality, last 4 = block/quadrant)"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Postal codes rarely used by general public",
      "Large cities span multiple municipalities — municipality is important",
      "N° often used before the number: Av. Bellavista N° 185",
      "S/N means 'sin número' (no number)"
    ],
    example: `Sr. Rodrigo Domínguez
Av. Bellavista N° 185
Dep. 609
8420507 RECOLETA
REGION METROPOLITANA`
  },

  // ─── CHINA ──────────────────────────────────────────────────
  CN: {
    name: "China",
    format: [
      "recipient",
      "streetNumber streetName, village, town",
      "district, city",
      "postalCode province",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{6}$/,
      description: "6 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "before",
    notes: [
      "Chinese addresses: BIG-ENDIAN (province → city → district → street → number)",
      "English/international addresses: LITTLE-ENDIAN (number → street → city → province)",
      "Simplified Chinese characters preferred for domestic mail",
      "Domestic mail: postal code written in boxes in upper-left corner"
    ],
    example: `Mr. CHEN Liguo
No. 10 Tuanjie Road, Xinyang Village, Danyang Town
Lianjiang County, Fuzhou City
350503 FUJIAN
P.R. CHINA`
  },

  // ─── COLOMBIA ───────────────────────────────────────────────
  CO: {
    name: "Colombia",
    format: [
      "recipient",
      "streetLine",
      "city"
    ],
    postalCodeFormat: {
      regex: /^\d{6}$/,
      description: "6 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "after",
    notes: [
      "Numeric grid system: Calles (south→north), Carreras (east→west)",
      "Format: Calle XX #YY – ZZ (calle number, carrera of nearest corner, house distance)",
      "Postal codes exist but are not widely used in everyday addressing"
    ],
    example: `Juan Pérez
Calle 34 #24 – 30
Bogotá`
  },

  // ─── CROATIA ────────────────────────────────────────────────
  HR: {
    name: "Croatia",
    format: [
      "recipient",
      "locality",
      "unit",
      "streetName streetNumber",
      "postalCode city",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$/,
      description: "5 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "5-digit postal code",
      "HR- prefix sometimes used before postal code for international mail",
      "Locality line only if different from post office name"
    ],
    example: `Hrvoje Horvat
Soblinec
1. kat, stan 2
Soblinečka ulica 1
10360 SESVETE`
  },

  // ─── CZECH REPUBLIC ─────────────────────────────────────────
  CZ: {
    name: "Czech Republic",
    format: [
      "organization",
      "recipient",
      "streetName streetNumber",
      "postalCode city"
    ],
    postalCodeFormat: {
      regex: /^\d{3}\s?\d{2}$/,
      description: "3 digits, space, 2 digits (123 07) or CZ-##### for international"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Dual house numbering: conscription number / orientation number (e.g., 2256/16)",
      "If recipient name is BEFORE company → only that person may open it",
      "If company is BEFORE recipient name → any employee may open it",
      "Pre-printed envelopes have boxes for postal code digits"
    ],
    example: `První informační
Josef Novák
Brněnská 2256/16
123 07 Jitrnice`
  },

  // ─── DENMARK ────────────────────────────────────────────────
  DK: {
    name: "Denmark",
    format: [
      "recipient",
      "streetName streetNumber, floor side",
      "postalCode city"
    ],
    postalCodeFormat: {
      regex: /^\d{4}$/,
      description: "4 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Apartment: floor number + side: t.v. (left), mf. (middle), t.h. (right)",
      "For postal codes 2000+, there is a 1:1 relationship between code and town"
    ],
    example: `Stig Jensen
Solvej 5, 4. t.v.
5250 Odense SV`
  },

  // ─── ESTONIA ────────────────────────────────────────────────
  EE: {
    name: "Estonia",
    format: [
      "recipient",
      "streetName streetNumber–unit",
      "postalCode city",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$/,
      description: "5 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Building and apartment numbers separated by en-dash: Aia tn 1–23"
    ],
    example: `Kati Kask
Aia tn 1–23
10615 Tallinn`
  },

  // ─── FINLAND ────────────────────────────────────────────────
  FI: {
    name: "Finland",
    format: [
      "organization",
      "recipient",
      "streetName streetNumber unit",
      "postalCode city",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$/,
      description: "5 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Name before company → only that person may open it",
      "Company before name → any employee may open it",
      "Apartment: 'as 5' or staircase letter + number: 'C 55'",
      "5-digit postal code; some large orgs have their own code"
    ],
    example: `Eduskunta
Matti Mallikainen
Mannerheimintie 30 as. 1
00100 HELSINKI`
  },

  // ─── FRANCE ─────────────────────────────────────────────────
  FR: {
    name: "France",
    format: [
      "recipient",
      "organization",
      "streetNumber streetName",
      "postalCode CITY",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$/,
      description: "5 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "before",
    notes: [
      "House number BEFORE street name (unlike most continental Europe)",
      "City/location in UPPERCASE",
      "CEDEX suffix for high-volume recipients: 75001 PARIS CEDEX",
      "5-digit postal code"
    ],
    example: `Entreprise ABC
M. Frank Bender
12 rue de la Montagne
01234 EXAMPLEVILLE`
  },

  // ─── GERMANY ────────────────────────────────────────────────
  DE: {
    name: "Germany",
    format: [
      "recipient",
      "organization",
      "streetName streetNumber",
      "postalCode city",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$/,
      description: "5 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "5-digit postal code (PLZ)",
      "Apartment numbers rarely used — name on post box is the identifier",
      "Some places have house numbers but no street names (e.g., Baltrum island)",
      "Village part of municipality: use 'OT' (Ortsteil) on a line before the street",
      "Post codes follow DPAG routing, NOT administrative boundaries",
      "Bulk recipients may have dedicated postal codes"
    ],
    example: `Firma ABC
Kundendienst
Hauptstr. 5
01234 Musterstadt`
  },

  // ─── GREECE ─────────────────────────────────────────────────
  GR: {
    name: "Greece",
    format: [
      "recipient",
      "streetName streetNumber",
      "postalCode city",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{3}\s?\d{2}$/,
      description: "5 digits with space after 3rd: 653 02"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Postal code: space between 3rd and 4th digit (653 02)",
      "Two spaces between postcode and town name",
      "International: prefix GR- before postal code (GR-111 42)",
      "Town name in CAPITALS"
    ],
    example: `Petros Pavlou
Doiranis 25
653 02 Kavala`
  },

  // ─── HONG KONG ──────────────────────────────────────────────
  HK: {
    name: "Hong Kong",
    format: [
      "recipient",
      "unit, floor, buildingName",
      "streetNumber streetName",
      "district",
      "area"
    ],
    postalCodeFormat: {
      regex: null,
      description: "No postal codes used"
    },
    postalCodePosition: null,
    streetNumberPosition: "before",
    notes: [
      "NO postal codes (some rural properties have identification codes like HKT-12345)",
      "English: small → large (flat, floor, building, street, district, area)",
      "Chinese: large → small (area, district, street, building, floor, flat)",
      "Area: 'Hong Kong' / 'Kowloon' / 'New Territories'",
      "Both Traditional and Simplified Chinese understood"
    ],
    example: `Mr. Jackie Chan
Flat 25, 12/F, Acacia Building
150 Kennedy Road
Wan Chai
Hong Kong Island`
  },

  // ─── HUNGARY ────────────────────────────────────────────────
  HU: {
    name: "Hungary",
    format: [
      "recipient",
      "city district",
      "streetName streetNumber floor/door",
      "postalCode"
    ],
    postalCodeFormat: {
      regex: /^\d{4}$/,
      description: "4 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "after",
    notes: [
      "City/town name PRECEDES street address (unusual for Europe)",
      "Postal code comes AFTER street line (on the last line before country)",
      "Hungarian names: family name before given name",
      "Abbreviations: em. (floor), fszt (ground floor), hrsz (lot number)"
    ],
    example: `Kis János
Budapest
Árpád fejedelem útja 82. fszt. 2
1036`
  },

  // ─── ICELAND ────────────────────────────────────────────────
  IS: {
    name: "Iceland",
    format: [
      "recipient",
      "streetName streetNumber",
      "unit",
      "postalCode city"
    ],
    postalCodeFormat: {
      regex: /^\d{3}$/,
      description: "3 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Last name is usually a patronymic, not a family name",
      "3-digit postal code"
    ],
    example: `Agnes Gísladóttir
Holtsflöt 4
íbúð 202
300 Akranes`
  },

  // ─── INDIA ──────────────────────────────────────────────────
  IN: {
    name: "India",
    format: [
      "recipient",
      "streetNumber, streetName",
      "locality",
      "city – postalCode",
      "state",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{6}$/,
      description: "6 digits (PIN — Postal Index Number)"
    },
    postalCodePosition: "after",
    streetNumberPosition: "before",
    notes: [
      "PIN (Postal Index Number) is 6 digits",
      "Mobile number sometimes included for delivery",
      "Format can vary widely across regions"
    ],
    example: `Mr. Naveen Patnaik
016-46N, Mahatma Gandhi Road
Banjara Hills
Hyderabad – 500034
Telangana`
  },

  // ─── INDONESIA ──────────────────────────────────────────────
  ID: {
    name: "Indonesia",
    format: [
      "recipient",
      "streetName streetNumber RT/RW",
      "village, district",
      "city postalCode"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$/,
      description: "5 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "after",
    notes: [
      "Jl. or Jalan = Street; No. = Building number",
      "RT./RW. = neighbourhood/community association numbers",
      "Kel. = kelurahan (village/subdistrict); Kec. = kecamatan (district)",
      "Kota = City; Kab. = Kabupaten (Regency)",
      "Province is optional"
    ],
    example: `Budiman
Jl. Surya No. 10 RT.05/RW.02
Kel. Cempaka Putih, Kec. Cempaka Baru
Kota Jakarta Pusat 10640`
  },

  // ─── IRAN ───────────────────────────────────────────────────
  IR: {
    name: "Iran",
    format: [
      "recipient",
      "streetName streetNumber",
      "city",
      "province",
      "postalCode",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{10}$/,
      description: "10 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "after",
    notes: [
      "4 address types: Urban, Rural, PO Box, Post Restante",
      "10-digit postal code"
    ],
    example: `Ali Mohammadi
Vali-e-Asr Street 123
Tehran
Tehran Province
1234567890`
  },

  // ─── IRAQ ───────────────────────────────────────────────────
  IQ: {
    name: "Iraq",
    format: [
      "recipient",
      "district",
      "mahla number",
      "zuqaq number",
      "buildingNumber",
      "province",
      "postalCode",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$/,
      description: "5 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "after",
    notes: [
      "Mahla = Area with a number",
      "Zuqaq = Alley/lane with a number"
    ],
    example: `Ali Hassan
Al-Mansour
Mahla 609
Zuqaq 8
House no. 12
Baghdad
10013`
  },

  // ─── IRELAND ────────────────────────────────────────────────
  IE: {
    name: "Ireland",
    format: [
      "recipient",
      "streetNumber streetName",
      "townland",
      "city",
      "county",
      "eircode"
    ],
    postalCodeFormat: {
      regex: /^[A-Z0-9]{3}\s?[A-Z0-9]{4}$/,
      description: "Eircode: 3-char routing key + 4-char unique ID (A65 F4E2)"
    },
    postalCodePosition: "after",
    streetNumberPosition: "before",
    notes: [
      "Eircode introduced July 2015: 7-character alphanumeric code",
      "Dublin routing codes start with D (D02, D04, etc.)",
      "Rural addresses: county + post town + townland",
      "Urban addresses: street number + street name",
      "County prefixed with 'Co.' for non-Dublin addresses"
    ],
    example: `Lissadell House
Lissadell
Ballinfull
Co. Sligo
F91 ED70`
  },

  // ─── ISRAEL ─────────────────────────────────────────────────
  IL: {
    name: "Israel",
    format: [
      "recipient",
      "streetNumber streetName, unit",
      "postalCode city"
    ],
    postalCodeFormat: {
      regex: /^\d{7}$/,
      description: "7 digits (introduced 2013)"
    },
    postalCodePosition: "before",
    streetNumberPosition: "before",
    notes: [
      "7-digit postal code since 2013",
      "House number before street name",
      "Apartment buildings: buildingNumber/apartmentNumber (16/20)",
      "Building entrance indicated by letter: 1B HaDoar, Apt. 20"
    ],
    example: `Yisrael Yisraeli
16/20 Jaffa Street
9414219 Tel Aviv`
  },

  // ─── ITALY ──────────────────────────────────────────────────
  IT: {
    name: "Italy",
    format: [
      "recipient",
      "additionalInfo",
      "buildingInfo",
      "streetType streetName streetNumber",
      "postalCode city stateAbbr",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$/,
      description: "5 digits (CAP)"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "3 to 5 rows domestic, up to 6 international",
      "Street types: Via, Viale, Corso, Piazza",
      "Province abbreviation (2 letters): RM, MI, NA, CE, etc.",
      "Line ordering may NOT be changed",
      "PO Box: 'CASELLA POSTALE' + number"
    ],
    example: `Claudio Verdi
Via Roma 35
81055 Santa Maria Capua Vetere CE`
  },

  // ─── JAPAN ──────────────────────────────────────────────────
  JP: {
    name: "Japan",
    format: [
      "postalCode",
      "prefecture, city, ward",
      "chome-ban-go",
      "buildingName floor room",
      "recipient"
    ],
    postalCodeFormat: {
      regex: /^\d{3}-?\d{4}$/,
      description: "7 digits with hyphen: 112-0001"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Japanese format: BIG-ENDIAN (largest → smallest → recipient at end)",
      "English/international format: LITTLE-ENDIAN (smallest → largest)",
      "Postal code: 〒 symbol prefix in Japanese, NNN-NNNN format",
      "Address: chōme-ban-gō system (e.g., 4-3-2 Hakusan)",
      "Honorific after name: 様 (sama) for individuals, 御中 (onchū) for companies",
      "Vertical writing on Japanese-style envelopes (top→bottom, right→left)"
    ],
    example: `3F. Rm. B
4-3-2 Hakusan
Bunkyō-ku, Tōkyō 112-0001
Japan`
  },

  // ─── SOUTH KOREA ────────────────────────────────────────────
  KR: {
    name: "South Korea",
    format: [
      "recipient",
      "unit",
      "streetNumber streetName",
      "district, city postalCode",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$/,
      description: "5 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "before",
    notes: [
      "Korean format: BIG-ENDIAN (province → district → street → unit → recipient)",
      "English format: LITTLE-ENDIAN (unit → street → district → province)",
      "5-digit postal code",
      "dong (동) = building, ho (호) = unit number"
    ],
    example: `Apt. 102-304
23 Sajik-ro 9-gil
Jongno-gu, Seoul 30174
South Korea`
  },

  // ─── LATVIA ─────────────────────────────────────────────────
  LV: {
    name: "Latvia",
    format: [
      "recipient",
      "streetName streetNumber, unit",
      "village",
      "parish",
      "municipality",
      "postalCode"
    ],
    postalCodeFormat: {
      regex: /^LV-\d{4}$/,
      description: "LV- prefix + 4 digits (LV-3456)"
    },
    postalCodePosition: "after",
    streetNumberPosition: "after",
    notes: [
      "Postal code: LV- prefix + 4 digits",
      "House and flat separated by hyphen: iela 1-12",
      "Addressee name in dative case in Latvian",
      "pag. = parish (pagasts), nov. = municipality (novads)"
    ],
    example: `Andris Lapa
Jelgavas iela 1-12
Aizpute
Aizputes nov.
LV-3456`
  },

  // ─── MACAO ──────────────────────────────────────────────────
  MO: {
    name: "Macao",
    format: [
      "recipient",
      "streetName, streetNumber, buildingName, floor, unit",
      "area"
    ],
    postalCodeFormat: {
      regex: null,
      description: "No postal codes used"
    },
    postalCodePosition: null,
    streetNumberPosition: "after",
    notes: [
      "No postal codes",
      "Portuguese format: street name first",
      "Chinese format: area first (large → small)",
      "Traditional Chinese commonly used; Simplified also understood",
      "Area: Península de Macau, Taipa, or Coloane"
    ],
    example: `Sr. João Kuok
Rua de Macau, n.o 1, Edifício ABC, 2 andar, moradia C
Península de Macau`
  },

  // ─── MALAYSIA ───────────────────────────────────────────────
  MY: {
    name: "Malaysia",
    format: [
      "recipient",
      "streetNumber streetName",
      "residentialArea",
      "postalCode CITY",
      "state",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$/,
      description: "5 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "before",
    notes: [
      "Post office / mail centre name in BLOCK LETTERS",
      "State line is optional",
      "Country line 'MALAYSIA' omitted for domestic mail",
      "5-digit postcode must match the respective post office",
      "Jalan = Street"
    ],
    example: `Mr. Zack Ahmad
11 Jalan Budi 1
Taman Budiman
42700 KUALA LUMPUR`
  },

  // ─── MEXICO ─────────────────────────────────────────────────
  MX: {
    name: "Mexico",
    format: [
      "recipient",
      "organization",
      "streetType streetName streetNumber",
      "settlementType settlementName",
      "postalCode city, municipality, state"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$/,
      description: "5 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Settlement types: Col. (Colonia), Fracc. (Fraccionamiento), etc.",
      "Street types: C. (Calle), Av. (Avenida), Blvd. (Boulevard), etc.",
      "State abbreviated: Chih., Sin., Ags., etc.",
      "Int. = Interior number (suite/apartment within building)"
    ],
    example: `Alejandro Ramírez
C. Francisco I. Madero No. 115
Col. Nuevo Casas Grandes Centro
31700 Nuevo Casas Grandes, Chih.`
  },

  // ─── NETHERLANDS ────────────────────────────────────────────
  NL: {
    name: "Netherlands",
    format: [
      "recipient",
      "streetName streetNumber",
      "postalCode CITY",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{4}\s?[A-Z]{2}$/,
      description: "4 digits + space + 2 capital letters (5627 BX)"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Postal code uniquely identifies a street",
      "Shortened format possible: '5627 BX 1092' (postcode + number only)",
      "Two spaces between postal code and town (PostNL recommendation)",
      "Town name in CAPITALS",
      "Postbus = P.O. Box; Antwoordnummer = Freepost"
    ],
    example: `Jan Jansen
Boschdijk 1092
5627 BX  EINDHOVEN`
  },

  // ─── NEW ZEALAND ────────────────────────────────────────────
  NZ: {
    name: "New Zealand",
    format: [
      "recipient",
      "unit/streetNumber streetName",
      "suburb",
      "city postalCode"
    ],
    postalCodeFormat: {
      regex: /^\d{4}$/,
      description: "4 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "before",
    notes: [
      "One space between city and postcode",
      "No spaces or periods in PO Box or RD",
      "Wellington metro: use specific city name (Wellington, Lower Hutt, etc.), not metro name",
      "Suburb line only if different from city"
    ],
    example: `Mr John Smith
43 Vogel Street
Roslyn
Palmerston North 4414`
  },

  // ─── NORWAY ─────────────────────────────────────────────────
  NO: {
    name: "Norway",
    format: [
      "recipient",
      "streetName streetNumber",
      "postalCode city"
    ],
    postalCodeFormat: {
      regex: /^\d{4}$/,
      description: "4 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "4-digit postal code",
      "Flat/floor number is NOT part of the postal address",
      "Recipient name must be on the mailbox for delivery",
      "PO Box: 'Postboks' replaces street line, with different postal codes"
    ],
    example: `Kari Normann
Storgata 81A
6415 Molde`
  },

  // ─── OMAN ───────────────────────────────────────────────────
  OM: {
    name: "Oman",
    format: [
      "recipient",
      "wayNumber, houseNumber",
      "blockNumber",
      "area",
      "city"
    ],
    postalCodeFormat: {
      regex: /^\d{3}$/,
      description: "3 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "after",
    notes: [
      "Physical addresses only in major urban centers",
      "Way/block/building number system"
    ],
    example: `Ahmed Al-Busaidi
Way 2259, 2919
Block 222
Murtafaat Al Qurm
Muscat`
  },

  // ─── PAKISTAN ────────────────────────────────────────────────
  PK: {
    name: "Pakistan",
    format: [
      "recipient",
      "streetNumber, streetName",
      "unionCouncil, town",
      "CITY",
      "district",
      "postalCode",
      "province"
    ],
    postalCodeFormat: {
      regex: /^\d{5,6}$/,
      description: "5 or 6 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "before",
    notes: [
      "City name often in CAPITALS",
      "Province at the end"
    ],
    example: `Muhammad Abdullah Umar
15, M. A. Jinnah Road
Kharadar, Saddar
KARACHI
Karachi District
457700
Sindh`
  },

  // ─── PERU ───────────────────────────────────────────────────
  PE: {
    name: "Peru",
    format: [
      "recipient",
      "streetName, streetNumber",
      "unit",
      "district",
      "postalCode"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$|^Lima\s?\d{1,2}$/,
      description: "5 digits or 'Lima NN' for Lima districts"
    },
    postalCodePosition: "after",
    streetNumberPosition: "after",
    notes: [
      "Lima/Callao use postal codes or 'Lima NN' format",
      "Outside Lima: city (province) instead of postal code",
      "Dpto = departamento (apartment)"
    ],
    example: `Roberto Prada
Juan de Aliaga 230
Dpto 12
Magdalena del Mar
Lima 17`
  },

  // ─── PHILIPPINES ────────────────────────────────────────────
  PH: {
    name: "Philippines",
    format: [
      "recipient",
      "streetNumber streetName, neighborhood",
      "barangay, city",
      "postalCode PROVINCE"
    ],
    postalCodeFormat: {
      regex: /^\d{4}$/,
      description: "4 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "before",
    notes: [
      "Western conventions followed",
      "Metro Manila addresses use 'METRO MANILA' instead of province",
      "Barangay (village-level admin unit) often included",
      "Province name in CAPITALS"
    ],
    example: `Mr. Juan Dela Cruz
123 Rizal Ave., Santa Cruz
Manila
1014 METRO MANILA`
  },

  // ─── POLAND ─────────────────────────────────────────────────
  PL: {
    name: "Poland",
    format: [
      "recipient",
      "organization",
      "streetPrefix streetName streetNumber/unit",
      "postalCode CITY",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{2}-\d{3}$/,
      description: "2 digits, hyphen, 3 digits (00-902)"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Postal code: XX-XXX format",
      "ul. = Street (ulica), al. = Avenue (aleja), pl. = Square (plac)",
      "m. (mieszkanie) can be used instead of / for apartment numbers",
      "City name recommended in ALL CAPS",
      "PO Box: 'skr. poczt.' (skrytka pocztowa)"
    ],
    example: `Jan Kowalski
ul. Wiejska 4/6
00-902 WARSZAWA`
  },

  // ─── PORTUGAL ───────────────────────────────────────────────
  PT: {
    name: "Portugal",
    format: [
      "recipient",
      "streetName streetNumber floor side",
      "postalCode city",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{4}-\d{3}$/,
      description: "4 digits, hyphen, 3 digits (4000-000)"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Postal code: NNNN-NNN format",
      "Floor: ordinal number (2º = 2nd floor)",
      "Side: Esq. (left/esquerdo), Dir. (right/direito), or letter (A, B, C)",
      "CTT recommends spaces instead of commas between elements (for OCR)",
      "PO Box: 'Apartado' + number"
    ],
    example: `José Saramago
Rua da Liberdade, 34, 2º Esq.
4000-000 Porto`
  },

  // ─── QATAR ──────────────────────────────────────────────────
  QA: {
    name: "Qatar",
    format: [
      "recipient",
      "poBox",
      "city",
      "country"
    ],
    postalCodeFormat: {
      regex: null,
      description: "No postal codes used"
    },
    postalCodePosition: null,
    streetNumberPosition: null,
    notes: [
      "No postal codes",
      "Not all roads/buildings are numbered",
      "Q-Post delivers only to PO Boxes, not street addresses"
    ],
    example: `Mr. Ali Al-Matwi
P.O. Box 1714
Doha
Qatar`
  },

  // ─── ROMANIA ────────────────────────────────────────────────
  RO: {
    name: "Romania",
    format: [
      "recipient",
      "streetType streetName, nr. streetNumber",
      "bl. building, sc. entrance",
      "et. floor, ap. unit",
      "city, jud. county postalCode",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{6}$/,
      description: "6 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "after",
    notes: [
      "29 street types: str. (stradă), bd. (bulevard), al. (alee), etc.",
      "Building details: bl. (bloc), sc. (scara/entrance), et. (etaj/floor), ap. (apartament)",
      "Bucharest uses 'sector' (1-6) instead of county (jud.)",
      "6-digit postal code"
    ],
    example: `Mihail Ionescu
str. Pacienței, nr. 9
bl. U13A, sc. M
et. 7, ap. 96
Victoria, jud. Brașov, 505722`
  },

  // ─── RUSSIA ─────────────────────────────────────────────────
  RU: {
    name: "Russia",
    format: [
      "recipient",
      "streetName, streetNumber, unit",
      "city",
      "district",
      "region",
      "postalCode",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{6}$/,
      description: "6 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "after",
    notes: [
      "Cyrillic for domestic mail, Latin for international",
      "Moscow and Saint Petersburg: omit sub-region and region/oblast",
      "str. (stroyeniye) = subsidiary building number",
      "Microraion may replace street name in newer developments",
      "6-digit postal code"
    ],
    example: `Gusev, Ivan Sergeyevich
ul. Pobedy, d. 20, kv. 29
pos. Oktyabrskiy
Borskiy r-n
Nizhegorodskaya obl.
606480`
  },

  // ─── SAUDI ARABIA ───────────────────────────────────────────
  SA: {
    name: "Saudi Arabia",
    format: [
      "recipient",
      "buildingNumber streetName – neighborhood",
      "city postalCode additionalNumbers",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{5}(-\d{4})?$/,
      description: "5 digits, optionally followed by -4 additional digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "before",
    notes: [
      "Building number before street name",
      "Additional 4-digit code after postal code (12345-6789)",
      "Can be written in Arabic or English"
    ],
    example: `Mohammed Ali Al-Ahmed
8228 Imam Ali Road – Alsalam Neighbourhood
Riyadh 12345-6789
Kingdom of Saudi Arabia`
  },

  // ─── SERBIA ─────────────────────────────────────────────────
  RS: {
    name: "Serbia",
    format: [
      "recipient",
      "streetName streetNumber",
      "postalCode city",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$/,
      description: "5 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Continental European format",
      "5-digit postal code",
      "Optional PAK (6-digit code encoding town, street, and house number range)"
    ],
    example: `Petar Petrović
Krunska 5
11000 Beograd`
  },

  // ─── SINGAPORE ──────────────────────────────────────────────
  SG: {
    name: "Singapore",
    format: [
      "recipient",
      "blockNumber streetName",
      "floor-unit buildingName",
      "SINGAPORE postalCode"
    ],
    postalCodeFormat: {
      regex: /^\d{6}$/,
      description: "6 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "before",
    notes: [
      "6-digit postal code",
      "Floor and unit: #13-37 format",
      "'Blk' prefix for block number",
      "'SINGAPORE' prefix omitted for domestic mail",
      "Addresses usually in English"
    ],
    example: `Mr. M. Rajendran
Blk 35 Mandalay Road
#13-37 Mandalay Towers
SINGAPORE 308215`
  },

  // ─── SLOVAKIA ───────────────────────────────────────────────
  SK: {
    name: "Slovakia",
    format: [
      "recipient",
      "organization",
      "streetName streetNumber",
      "postalCode city",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{3}\s?\d{2}$/,
      description: "3 digits + space + 2 digits (845 45)"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Similar to Czech Republic",
      "Dual numbering: descriptive/orientation (3084/25)",
      "Name before company → personal delivery only"
    ],
    example: `Jozef Vymyslený
Firma s.r.o.
Nezábudková 3084/25
84545 Bratislava`
  },

  // ─── SLOVENIA ───────────────────────────────────────────────
  SI: {
    name: "Slovenia",
    format: [
      "organization",
      "recipient",
      "streetName streetNumber",
      "postalCode city"
    ],
    postalCodeFormat: {
      regex: /^\d{4}$/,
      description: "4 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "4-digit postal code; first digit = region area",
      "c. = cesta (street), ul. = ulica (road)",
      "g. = Mr (gospod), ga. = Mrs (gospa), gdč. = Miss (gospodična)",
      "Numbers can have letter suffixes (A, B, C)",
      "Large companies may have dedicated x5xx postal codes"
    ],
    example: `Cvet, d. o. o.
G. Janez Novak
Slovenska cesta 64 A
2241 Spodnji Duplek`
  },

  // ─── SPAIN ──────────────────────────────────────────────────
  ES: {
    name: "Spain",
    format: [
      "recipient",
      "streetType streetName, streetNumber, floor door",
      "postalCode city",
      "province"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$/,
      description: "5 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Floor + door: 5º B = 5th floor, door B",
      "Door sides: Izq. (left/izquierda), Dcha. (right/derecha)",
      "Street types: C. (calle), Av. (avenida), Paseo, etc.",
      "º suffix for floor (masculine), ª for door (feminine)"
    ],
    example: `Sr. Francisco Ansó García
Paseo de la Castellana, 185, 5º B
29001 Madrid
Madrid`
  },

  // ─── SRI LANKA ──────────────────────────────────────────────
  LK: {
    name: "Sri Lanka",
    format: [
      "recipient",
      "streetNumber streetName",
      "city",
      "postalCode",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$/,
      description: "5 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "before",
    notes: [
      "5-digit postal code",
      "Country line omitted for domestic mail",
      "Addresses in English and Sinhala"
    ],
    example: `Mr. A. L. Perera
201 Silkhouse Street
KANDY
20000`
  },

  // ─── SWEDEN ─────────────────────────────────────────────────
  SE: {
    name: "Sweden",
    format: [
      "recipient",
      "streetName streetNumber lgh unit",
      "postalCode city",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{3}\s?\d{2}$/,
      description: "5 digits, grouped 3+2 with space (112 01). SE- prefix for international."
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "5-digit postal code grouped as NNN NN",
      "SE- prefix for international mail",
      "'lgh' = lägenhet (apartment) + 4-digit apartment number",
      "Rural addresses: village name + farm name + number",
      "PO Box: 'Box' + number"
    ],
    example: `Anna Björklund
Storgatan 1
112 01 Stockholm`
  },

  // ─── SWITZERLAND ────────────────────────────────────────────
  CH: {
    name: "Switzerland",
    format: [
      "salutation",
      "recipient",
      "streetName streetNumber",
      "postalCode city canton",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{4}$/,
      description: "4 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "4-digit postal code",
      "Canton abbreviation (2 letters) only needed for ambiguous city names",
      "Multilingual: German, French, Italian, Romansh",
      "Salutation line (Herr/Frau or Monsieur/Madame) is common"
    ],
    example: `Herrn
Rudolf Weber
Marktplatz 1
4051 Basel`
  },

  // ─── TAIWAN ─────────────────────────────────────────────────
  TW: {
    name: "Taiwan",
    format: [
      "recipient",
      "floor, streetNumber, alley, lane, streetName",
      "district, city postalCode",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{3}(\d{2,3})?$/,
      description: "3 or 5-6 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "before",
    notes: [
      "Chinese format: BIG-ENDIAN (city → district → road → lane → alley → number → floor)",
      "English format: LITTLE-ENDIAN (floor → number → road → district → city)",
      "F. = Floor, No. = Number",
      "Lane/Alley system for addressing off main roads"
    ],
    example: `2F., No.2, Shifu Rd.
Xinyi Dist., Taipei City 11060
Taiwan`
  },

  // ─── TURKEY ─────────────────────────────────────────────────
  TR: {
    name: "Turkey",
    format: [
      "recipient",
      "organization",
      "neighborhood",
      "streetName buildingName streetNumber floor unit",
      "postalCode town district province"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$/,
      description: "5 digits"
    },
    postalCodePosition: "before",
    streetNumberPosition: "after",
    notes: [
      "Mahalle (neighbourhood) or village on its own line",
      "NO: = building number, K: = floor (kat), D: = flat (daire)",
      "5-digit postal code",
      "District and province separated by /"
    ],
    example: `AHMET KORKMAZ
ETİLER MAH.
BADEM SOK. TOPRAK APT. NO:13 K:4 D:8
34732 BEŞİKTAŞ / İSTANBUL`
  },

  // ─── UKRAINE ────────────────────────────────────────────────
  UA: {
    name: "Ukraine",
    format: [
      "recipient",
      "streetName, streetNumber, unit",
      "city",
      "district, region",
      "postalCode",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{5}$/,
      description: "5 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "after",
    notes: [
      "Cyrillic for domestic, Latin for international",
      "bud. = building (будинок), kv. = apartment (квартира)",
      "Microraion may replace street name in newer areas",
      "5-digit postal code"
    ],
    example: `Petrenko Ivan Leonidovych
vul. Shevchenka, bud. 17
m. Bila Tserkva
Kyivs'ka obl.
09117`
  },

  // ─── UNITED ARAB EMIRATES ───────────────────────────────────
  AE: {
    name: "United Arab Emirates",
    format: [
      "recipient",
      "poBox",
      "city",
      "country"
    ],
    postalCodeFormat: {
      regex: null,
      description: "No postal codes used"
    },
    postalCodePosition: null,
    streetNumberPosition: null,
    notes: [
      "No postal codes",
      "All postal mail delivered ONLY to PO Boxes",
      "Street addresses: include recipient phone number for delivery drivers",
      "Not all roads/buildings are numbered consistently"
    ],
    example: `Mr. Ali Al-Matwi
P.O. Box 1714
Dubai
United Arab Emirates`
  },

  // ─── UNITED KINGDOM ─────────────────────────────────────────
  GB: {
    name: "United Kingdom",
    format: [
      "recipient",
      "streetNumber streetName",
      "locality",
      "POST TOWN",
      "postalCode"
    ],
    postalCodeFormat: {
      regex: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/,
      description: "Alphanumeric: outward code (area + district) + space + inward code (sector + unit). E.g., SO31 4NG, EC1A 1BB"
    },
    postalCodePosition: "after",
    streetNumberPosition: "before",
    notes: [
      "Post town in BLOCK CAPITALS",
      "Locality only if needed to avoid ambiguity",
      "Postcode on its own line",
      "Royal Mail discourages indentation or comma-ending lines",
      "All lines should start from the same point (left-aligned)",
      "Postal county no longer required since 1996"
    ],
    example: `Mr A Smith
3a High Street
Hedge End
SOUTHAMPTON
SO31 4NG`
  },

  // ─── UNITED STATES ──────────────────────────────────────────
  US: {
    name: "United States",
    format: [
      "recipient",
      "streetNumber streetName streetType unit",
      "city, state postalCode"
    ],
    postalCodeFormat: {
      regex: /^\d{5}(-\d{4})?$/,
      description: "5 digits, optional +4 extension (92908 or 92908-4601)"
    },
    postalCodePosition: "after",
    streetNumberPosition: "before",
    notes: [
      "State: 2-letter abbreviation (CA, NY, TX, etc.)",
      "USPS prefers ALL CAPS, no punctuation except hyphen in ZIP+4",
      "ZIP Code may not align with city administrative boundaries",
      "Queens (NYC): hyphenated street numbers (123-45 Queens Blvd)",
      "Utah: grid-style street names (401 West 500 North)",
      "Puerto Rico: urbanization name may be included",
      "Military mail: APO/FPO/DPO with AE/AP/AA pseudo-states",
      "Territories formatted domestically: San Juan PR 00907"
    ],
    example: `JEREMY MARTINSON JR
455 LARKSPUR DR APT 23
BAVIERA CA 92908-4601`
  },

  // ─── VIETNAM ────────────────────────────────────────────────
  VN: {
    name: "Vietnam",
    format: [
      "recipient",
      "streetNumber streetName",
      "ward",
      "district",
      "city",
      "province",
      "country"
    ],
    postalCodeFormat: {
      regex: /^\d{6}$/,
      description: "6 digits"
    },
    postalCodePosition: "after",
    streetNumberPosition: "before",
    notes: [
      "Province optional if same as city name",
      "May include mother/father name for identification in rural areas",
      "phường = ward, quận = district, thành phố = city"
    ],
    example: `Mr Lê Văn Bình
number 123A Trần Hưng Đạo street
Nguyễn Du ward
Hai Bà Trưng district
Hà Nội city`
  }
};


// ═══════════════════════════════════════════════════════════════
// HELPER UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Look up a country's address format by ISO 3166-1 alpha-2 code.
 * @param code - ISO country code (e.g., "US", "DE", "JP")
 * @returns The format entry or null if not found
 */
export function getFormat(code: string): AddressFormatConfig | null {
  return ADDRESS_FORMATS[code.toUpperCase()] || null;
}

/**
 * Validate a postal code against the country's known pattern.
 * @param code - ISO country code
 * @param postalCode - The postal code to validate
 * @returns Validation result with valid flag and expected format description
 */
export function validatePostalCode(code: string, postalCode: string): { valid: boolean; expected: string } {
  const fmt = getFormat(code);
  if (!fmt || !fmt.postalCodeFormat.regex) {
    return { valid: true, expected: "No postal code required" };
  }
  return {
    valid: fmt.postalCodeFormat.regex.test(postalCode),
    expected: fmt.postalCodeFormat.description
  };
}

/**
 * Get a list of all supported country codes.
 */
export function supportedCountries(): string[] {
  return Object.keys(ADDRESS_FORMATS);
}

/**
 * Get countries that don't use postal codes.
 */
export function countriesWithoutPostalCodes(): string[] {
  return Object.entries(ADDRESS_FORMATS)
    .filter(([, v]) => v.postalCodeFormat.regex === null)
    .map(([k]) => k);
}

/**
 * Get countries where street number comes BEFORE the street name.
 */
export function countriesWithNumberFirst(): string[] {
  return Object.entries(ADDRESS_FORMATS)
    .filter(([, v]) => v.streetNumberPosition === "before")
    .map(([k]) => k);
}

/**
 * Get countries where street number comes AFTER the street name.
 */
export function countriesWithNumberLast(): string[] {
  return Object.entries(ADDRESS_FORMATS)
    .filter(([, v]) => v.streetNumberPosition === "after")
    .map(([k]) => k);
}
