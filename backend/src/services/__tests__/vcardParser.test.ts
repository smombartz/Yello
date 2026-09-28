import { describe, it, expect } from 'vitest';
import zlib from 'zlib';
import { parseVcf } from '../vcardParser.js';

function card(...lines: string[]): string {
  return ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Ada Lovelace', 'N:Lovelace;Ada;;;', ...lines, 'END:VCARD'].join('\n');
}

const VCARD_SIMPLE = `BEGIN:VCARD
VERSION:3.0
FN:John Smith
N:Smith;John;;;
EMAIL;TYPE=work:john@example.com
TEL;TYPE=cell:+1-555-123-4567
END:VCARD`;

const VCARD_MULTI = `BEGIN:VCARD
VERSION:3.0
FN:John Smith
N:Smith;John;;;
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Jane Doe
N:Doe;Jane;;;
END:VCARD`;

describe('vcardParser', () => {
  it('should parse a simple vCard', () => {
    const result = parseVcf(VCARD_SIMPLE);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].displayName).toBe('John Smith');
    expect(result.contacts[0].firstName).toBe('John');
    expect(result.contacts[0].lastName).toBe('Smith');
  });

  it('should parse email addresses', () => {
    const result = parseVcf(VCARD_SIMPLE);
    expect(result.contacts[0].emails).toHaveLength(1);
    expect(result.contacts[0].emails[0].email).toBe('john@example.com');
    expect(result.contacts[0].emails[0].type).toBe('work');
  });

  it('should parse phone numbers', () => {
    const result = parseVcf(VCARD_SIMPLE);
    expect(result.contacts[0].phones).toHaveLength(1);
    expect(result.contacts[0].phones[0].phone).toMatch(/\+1555/);
  });

  it('should parse multiple vCards', () => {
    const result = parseVcf(VCARD_MULTI);
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].displayName).toBe('John Smith');
    expect(result.contacts[1].displayName).toBe('Jane Doe');
  });

  it('should handle malformed vCards gracefully', () => {
    const malformed = `BEGIN:VCARD
VERSION:3.0
END:VCARD`;
    const result = parseVcf(malformed);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('vcardParser primary flag', () => {
  it('marks the first email primary when none is flagged', () => {
    const { contacts } = parseVcf(card(
      'EMAIL;TYPE=WORK:first@example.com',
      'EMAIL;TYPE=HOME:second@example.com'
    ));

    expect(contacts[0].emails.map(e => e.isPrimary)).toEqual([true, false]);
  });

  it('marks the TYPE=pref email primary even when it is not first', () => {
    const { contacts } = parseVcf(card(
      'EMAIL;TYPE=WORK:first@example.com',
      'EMAIL;TYPE=INTERNET;TYPE=pref:second@example.com'
    ));

    expect(contacts[0].emails.map(e => e.isPrimary)).toEqual([false, true]);
  });

  it('marks the PREF=1 phone primary even when it is not first', () => {
    const { contacts } = parseVcf(card(
      'TEL;TYPE=CELL:+1 212 555 0101',
      'TEL;TYPE=WORK;PREF=1:+1 212 555 0102'
    ));

    expect(contacts[0].phones.map(p => p.isPrimary)).toEqual([false, true]);
  });

  it('keeps a single primary when several entries are flagged', () => {
    const { contacts } = parseVcf(card(
      'EMAIL;TYPE=pref:first@example.com',
      'EMAIL;TYPE=pref:second@example.com'
    ));

    expect(contacts[0].emails.map(e => e.isPrimary)).toEqual([true, false]);
  });
});

describe('vcardParser text escaping', () => {
  it('unescapes a semicolon in the title and the note', () => {
    const { contacts } = parseVcf(card('TITLE:CEO\\; Founder', 'NOTE:Likes tea\\; dislikes coffee'));

    expect(contacts[0].title).toBe('CEO; Founder');
    expect(contacts[0].notes).toBe('Likes tea; dislikes coffee');
  });

  it('reads an escaped backslash followed by a semicolon as both characters', () => {
    const { contacts } = parseVcf(card('TITLE:path C:\\\\\\; done'));

    expect(contacts[0].title).toBe('path C:\\; done');
  });
});

describe('vcardParser categories', () => {
  it('reads every category of a contact that has several', () => {
    const { contacts } = parseVcf(card('CATEGORIES:Work,LinkedIn Connection,Saturday Peg'));

    expect(contacts[0].categories).toEqual(['Work', 'LinkedIn Connection', 'Saturday Peg']);
  });

  it('keeps a category that contains an escaped comma whole', () => {
    const { contacts } = parseVcf(card('CATEGORIES:Friends\\, Close,Work'));

    expect(contacts[0].categories).toEqual(['Friends, Close', 'Work']);
  });

  it('reads categories spread over several lines', () => {
    const { contacts } = parseVcf(card('CATEGORIES:Work', 'CATEGORIES:Family'));

    expect(contacts[0].categories).toEqual(['Work', 'Family']);
  });
});

describe('vcardParser social profiles', () => {
  it('reads the platform from X-SERVICE, the form earlier exports wrote', () => {
    const { contacts } = parseVcf(card(
      'X-SOCIALPROFILE;X-SERVICE=linkedin;X-USER=ada:https://www.linkedin.com/in/ada'
    ));

    expect(contacts[0].socialProfiles).toEqual([
      { platform: 'linkedin', username: 'ada', url: 'https://www.linkedin.com/in/ada' }
    ]);
  });

  it('reads a grouped X-SOCIALPROFILE line', () => {
    const { contacts } = parseVcf(card(
      'item3.X-SOCIALPROFILE;TYPE=twitter;X-USER=ada:https://twitter.com/ada'
    ));

    expect(contacts[0].socialProfiles).toEqual([
      { platform: 'twitter', username: 'ada', url: 'https://twitter.com/ada' }
    ]);
  });

  it('reads a quoted X-USER that contains a separator', () => {
    const { contacts } = parseVcf(card(
      'X-SOCIALPROFILE;TYPE=twitter;X-USER="a;d:a":https://twitter.com/ada'
    ));

    expect(contacts[0].socialProfiles).toEqual([
      { platform: 'twitter', username: 'a;d:a', url: 'https://twitter.com/ada' }
    ]);
  });
});

describe('vcardParser related people', () => {
  it('reads a grouped related name and takes the relationship from its label', () => {
    const { contacts } = parseVcf(card(
      'item1.X-ABRELATEDNAMES:Leo Lovelace',
      'item1.X-ABLabel:_$!<Child>!$_',
      'item2.X-ABRELATEDNAMES;TYPE=pref:Mary Somerville',
      'item2.X-ABLabel:Mentor'
    ));

    // Apple's built-in labels are lower-cased; a custom label is kept as written.
    expect(contacts[0].relatedPeople).toEqual([
      { name: 'Leo Lovelace', relationship: 'child' },
      // pref has no column on related people, so it is kept as a leftover parameter
      { name: 'Mary Somerville', relationship: 'Mentor', params: { TYPE: ['pref'] } }
    ]);
  });

  it('keeps the capitalisation of a relationship given as TYPE', () => {
    const { contacts } = parseVcf(card('X-ABRELATEDNAMES;TYPE=Husband:William King'));

    expect(contacts[0].relatedPeople).toEqual([{ name: 'William King', relationship: 'Husband' }]);
  });

  it('unescapes the name', () => {
    const { contacts } = parseVcf(card('X-ABRELATEDNAMES;TYPE=friend:Babbage\\, Charles'));

    expect(contacts[0].relatedPeople).toEqual([
      { name: 'Babbage, Charles', relationship: 'friend' }
    ]);
  });
});

describe('vcardParser LinkedIn enrichment', () => {
  function enrichmentLine(payload: unknown): string {
    return `X-YELLO-LINKEDIN:${zlib.gzipSync(JSON.stringify(payload)).toString('base64')}`;
  }

  it('decodes the X-YELLO-LINKEDIN payload', () => {
    const { contacts } = parseVcf(card(
      enrichmentLine({ headline: 'Analyst', followers_count: 12, skills: '[{"name":"Maths"}]' })
    ));

    expect(contacts[0].linkedinEnrichment).toEqual({
      headline: 'Analyst',
      followers_count: 12,
      skills: '[{"name":"Maths"}]'
    });
  });

  it('is null when the card carries no enrichment', () => {
    const { contacts } = parseVcf(card('EMAIL:ada@example.com'));

    expect(contacts[0].linkedinEnrichment).toBeNull();
  });

  it('ignores a corrupt payload instead of failing the card', () => {
    const { contacts, errors } = parseVcf(card('X-YELLO-LINKEDIN:not-a-gzip-payload'));

    expect(errors).toEqual([]);
    expect(contacts[0].displayName).toBe('Ada Lovelace');
    expect(contacts[0].linkedinEnrichment).toBeNull();
  });

  it('keeps the payload out of the stored raw card', () => {
    const { contacts } = parseVcf(card('NICKNAME:Countess', enrichmentLine({ headline: 'Analyst' })));

    expect(contacts[0].rawVcard).not.toContain('X-YELLO-LINKEDIN');
    expect(contacts[0].rawVcard).toContain('NICKNAME:Countess');
    expect(contacts[0].rawVcard).toContain('END:VCARD');
  });
});
