/**
 * Name Matching Service
 *
 * Provides conservative name matching for contact deduplication.
 * Supports:
 * - Normalization (lowercase, trim, collapse spaces)
 * - Common nickname mappings
 * - Reversed name handling (e.g., "John Smith" = "Smith John")
 *
 * Does NOT support phonetic/soundex, typo tolerance, or partial string matching.
 */

/**
 * Nickname mapping - maps each name variant to a canonical form.
 * All names that should match share the same canonical form.
 *
 * Note: Some nicknames like "pat" or "chris" could theoretically apply to
 * multiple names, but in practice they're most commonly associated with
 * one gender. We map them to their most common association.
 */
const NICKNAMES: Record<string, string> = {
  // John variants
  john: 'john',
  jon: 'john',
  jonathan: 'john',
  johnny: 'john',
  johnnie: 'john',

  // Michael variants
  michael: 'michael',
  mike: 'michael',
  mikey: 'michael',
  mick: 'michael',
  mickey: 'michael',

  // William variants
  william: 'william',
  will: 'william',
  bill: 'william',
  billy: 'william',
  willy: 'william',
  liam: 'william',

  // Robert variants
  robert: 'robert',
  rob: 'robert',
  robbie: 'robert',
  bob: 'robert',
  bobby: 'robert',
  bert: 'robert',

  // James variants
  james: 'james',
  jim: 'james',
  jimmy: 'james',
  jamie: 'james',

  // Richard variants
  richard: 'richard',
  rick: 'richard',
  ricky: 'richard',
  dick: 'richard',
  rich: 'richard',
  richie: 'richard',

  // Thomas variants
  thomas: 'thomas',
  tom: 'thomas',
  tommy: 'thomas',
  thom: 'thomas',

  // Charles variants
  charles: 'charles',
  charlie: 'charles',
  chuck: 'charles',
  chas: 'charles',

  // David variants
  david: 'david',
  dave: 'david',
  davey: 'david',
  davie: 'david',

  // Joseph variants
  joseph: 'joseph',
  joe: 'joseph',
  joey: 'joseph',

  // Daniel variants
  daniel: 'daniel',
  dan: 'daniel',
  danny: 'daniel',

  // Matthew variants
  matthew: 'matthew',
  matt: 'matthew',
  matty: 'matthew',

  // Anthony variants
  anthony: 'anthony',
  tony: 'anthony',

  // Christopher variants
  christopher: 'christopher',
  chris: 'christopher',
  kit: 'christopher',

  // Andrew variants
  andrew: 'andrew',
  andy: 'andrew',
  drew: 'andrew',

  // Steven/Stephen variants
  steven: 'steven',
  stephen: 'steven',
  steve: 'steven',
  stevie: 'steven',

  // Edward variants
  edward: 'edward',
  ed: 'edward',
  eddie: 'edward',
  ted: 'edward',
  teddy: 'edward',
  ned: 'edward',

  // Benjamin variants
  benjamin: 'benjamin',
  ben: 'benjamin',
  benny: 'benjamin',
  benji: 'benjamin',

  // Nicholas variants
  nicholas: 'nicholas',
  nick: 'nicholas',
  nicky: 'nicholas',

  // Alexander variants
  alexander: 'alexander',
  alex: 'alexander',
  alec: 'alexander',

  // Samuel variants
  samuel: 'samuel',
  sam: 'samuel',
  sammy: 'samuel',

  // Patrick variants
  patrick: 'patrick',
  paddy: 'patrick',

  // Peter variants
  peter: 'peter',
  pete: 'peter',

  // Gregory variants
  gregory: 'gregory',
  greg: 'gregory',

  // Timothy variants
  timothy: 'timothy',
  tim: 'timothy',
  timmy: 'timothy',

  // Kenneth variants
  kenneth: 'kenneth',
  ken: 'kenneth',
  kenny: 'kenneth',

  // Ronald variants
  ronald: 'ronald',
  ron: 'ronald',
  ronnie: 'ronald',

  // Donald variants
  donald: 'donald',
  don: 'donald',
  donnie: 'donald',

  // Raymond variants
  raymond: 'raymond',
  ray: 'raymond',

  // Gerald variants
  gerald: 'gerald',
  gerry: 'gerald',
  jerry: 'gerald',

  // Lawrence variants
  lawrence: 'lawrence',
  larry: 'lawrence',

  // Harold variants
  harold: 'harold',
  hal: 'harold',

  // Henry variants
  henry: 'henry',
  hank: 'henry',
  harry: 'henry',

  // Walter variants
  walter: 'walter',
  walt: 'walter',
  wally: 'walter',

  // Female names

  // Elizabeth variants
  elizabeth: 'elizabeth',
  liz: 'elizabeth',
  lizzy: 'elizabeth',
  lizzie: 'elizabeth',
  beth: 'elizabeth',
  betsy: 'elizabeth',
  betty: 'elizabeth',
  eliza: 'elizabeth',

  // Jennifer variants
  jennifer: 'jennifer',
  jenny: 'jennifer',
  jen: 'jennifer',
  jenn: 'jennifer',

  // Margaret variants
  margaret: 'margaret',
  maggie: 'margaret',
  meg: 'margaret',
  peggy: 'margaret',
  marge: 'margaret',
  margie: 'margaret',
  madge: 'margaret',

  // Katherine/Catherine variants
  katherine: 'katherine',
  catherine: 'katherine',
  kate: 'katherine',
  katie: 'katherine',
  kathy: 'katherine',
  cathy: 'katherine',
  cat: 'katherine',

  // Patricia variants
  patricia: 'patricia',
  pat: 'patricia',
  patty: 'patricia',
  patsy: 'patricia',
  tricia: 'patricia',
  trish: 'patricia',

  // Rebecca variants
  rebecca: 'rebecca',
  becky: 'rebecca',
  becca: 'rebecca',

  // Susan variants
  susan: 'susan',
  sue: 'susan',
  suzy: 'susan',
  suzie: 'susan',
  susie: 'susan',

  // Victoria variants
  victoria: 'victoria',
  vicky: 'victoria',
  vickie: 'victoria',
  tori: 'victoria',

  // Christine/Christina variants
  christine: 'christine',
  christina: 'christine',
  chrissy: 'christine',
  tina: 'christine',

  // Deborah variants
  deborah: 'deborah',
  debra: 'deborah',
  deb: 'deborah',
  debbie: 'deborah',

  // Dorothy variants
  dorothy: 'dorothy',
  dot: 'dorothy',
  dottie: 'dorothy',

  // Jessica variants
  jessica: 'jessica',
  jess: 'jessica',
  jessie: 'jessica',

  // Amanda variants
  amanda: 'amanda',
  mandy: 'amanda',

  // Samantha variants
  samantha: 'samantha',

  // Alexandra variants
  alexandra: 'alexandra',
  alexa: 'alexandra',
  sandy: 'alexandra',

  // Abigail variants
  abigail: 'abigail',
  abby: 'abigail',
  gail: 'abigail',

  // Jacqueline variants
  jacqueline: 'jacqueline',
  jackie: 'jacqueline',

  // Megan variants
  megan: 'megan',
  meggie: 'megan',

  // Kimberly variants
  kimberly: 'kimberly',
  kim: 'kimberly',
  kimmy: 'kimberly',

  // Stephanie variants
  stephanie: 'stephanie',
  steph: 'stephanie',

  // Melissa variants
  melissa: 'melissa',
  mel: 'melissa',
  missy: 'melissa',

  // Michelle variants
  michelle: 'michelle',
  shelly: 'michelle',

  // Barbara variants
  barbara: 'barbara',
  barb: 'barbara',
  barbie: 'barbara',

  // Nancy variants
  nancy: 'nancy',
  nan: 'nancy',
};

/**
 * Normalizes a name by converting to lowercase, trimming whitespace,
 * and collapsing multiple spaces into single spaces.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Gets the canonical form of a name for nickname matching.
 * Returns the canonical form if the name is a known nickname, otherwise returns the name itself.
 */
function getCanonicalName(name: string): string {
  const normalized = normalizeName(name);
  return NICKNAMES[normalized] ?? normalized;
}

/**
 * Splits a full name into individual name parts.
 */
function getNameParts(fullName: string): string[] {
  return normalizeName(fullName).split(' ').filter(part => part.length > 0);
}

/**
 * Checks if two sets of name parts match (considering nicknames).
 * Both sets must have the same parts (in any order) for a match.
 */
function namePartsMatch(parts1: string[], parts2: string[]): boolean {
  if (parts1.length !== parts2.length) {
    return false;
  }

  // Get canonical forms for all parts
  const canonical1 = parts1.map(getCanonicalName).sort();
  const canonical2 = parts2.map(getCanonicalName).sort();

  // Compare sorted canonical forms
  for (let i = 0; i < canonical1.length; i++) {
    if (canonical1[i] !== canonical2[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if two names match using conservative matching rules:
 * - Exact match (after normalization)
 * - Nickname matching (john = jonathan, mike = michael, etc.)
 * - Reversed name handling ("John Smith" = "Smith John")
 *
 * Does NOT perform phonetic matching, typo tolerance, or partial matching.
 *
 * @param name1 - First name to compare
 * @param name2 - Second name to compare
 * @returns true if the names match, false otherwise
 */
export function namesMatch(name1: string, name2: string): boolean {
  // Handle empty/null cases
  if (!name1 || !name2) {
    return false;
  }

  const normalized1 = normalizeName(name1);
  const normalized2 = normalizeName(name2);

  // Exact match after normalization
  if (normalized1 === normalized2) {
    return true;
  }

  // Get name parts
  const parts1 = getNameParts(name1);
  const parts2 = getNameParts(name2);

  // Single name comparison (just first name or just last name)
  if (parts1.length === 1 && parts2.length === 1) {
    return getCanonicalName(parts1[0]) === getCanonicalName(parts2[0]);
  }

  // Multi-part name comparison (handles nicknames and reversed order)
  return namePartsMatch(parts1, parts2);
}
