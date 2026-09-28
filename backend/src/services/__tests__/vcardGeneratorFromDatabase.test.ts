import { describe, it, expect } from 'vitest';
import { generateVcard, type ContactForVcard } from '../vcardGenerator.js';
import { parseVcf } from '../vcardParser.js';

/**
 * The export is built from the database alone: typed columns for everything
 * the schema models, contact_vcard_properties for every other property of the
 * imported card. The stored raw_vcard is never read.
 */
function baseContact(overrides: Partial<ContactForVcard> = {}): ContactForVcard {
  return {
    firstName: 'Ada',
    lastName: 'Lovelace',
    displayName: 'Ada Lovelace',
    company: null,
    title: null,
    notes: null,
    birthday: null,
    emails: [],
    phones: [],
    addresses: [],
    socialProfiles: [],
    categories: [],
    ...overrides
  };
}

/** Unfolded property lines of a generated card. */
function linesOf(vcard: string): string[] {
  return vcard.replace(/\r\n[ \t]/g, '').split('\r\n');
}

function groupOf(lines: string[], property: string): string | undefined {
  return lines.map(l => l.match(new RegExp(`^([^.;:]+)\\.${property}[;:]`))?.[1]).find(Boolean);
}

describe('generateVcard with the full vCard model', () => {
  it('writes every name part', () => {
    const lines = linesOf(generateVcard(baseContact({
      middleName: 'Augusta',
      namePrefix: 'Hon.',
      nameSuffix: 'FRS'
    })));

    expect(lines.filter(l => l.startsWith('N:'))).toEqual(['N:Lovelace;Ada;Augusta;Hon.;FRS']);
  });

  it('writes the department after the company', () => {
    const lines = linesOf(generateVcard(baseContact({ company: 'Analytical Engines', department: 'Research' })));

    expect(lines.filter(l => l.startsWith('ORG'))).toEqual(['ORG:Analytical Engines;Research']);
  });

  it('writes nickname, gender and the company flag', () => {
    const lines = linesOf(generateVcard(baseContact({ nickname: 'Countess', gender: 'Female', isCompany: true })));

    expect(lines).toContain('NICKNAME:Countess');
    expect(lines).toContain('X-GENDER:Female');
    expect(lines).toContain('X-ABShowAs:COMPANY');
  });

  it('writes every TYPE and never writes pref as a type', () => {
    const lines = linesOf(generateVcard(baseContact({
      phones: [
        { phone: '+442079460000', phoneDisplay: '+44 20 7946 0000', type: 'home', extraTypes: 'fax', isPrimary: false },
        { phone: '+12125550101', phoneDisplay: '+1 212 555 0101', type: 'pref', isPrimary: true }
      ]
    })));

    expect(lines.filter(l => l.startsWith('TEL'))).toEqual([
      'TEL;TYPE=HOME;TYPE=FAX:+44 20 7946 0000',
      'TEL;PREF=1:+1 212 555 0101'
    ]);
  });

  it('ties a label to its email, phone and address through an item group', () => {
    const lines = linesOf(generateVcard(baseContact({
      emails: [{ email: 'ada@old.example', type: 'home', label: 'Obsolete', isPrimary: true }],
      phones: [{ phone: '+12125550101', phoneDisplay: '+1 212 555 0101', type: 'cell', label: 'WhatsApp', isPrimary: true }],
      addresses: [{
        street: '1 St James Square', city: 'London', state: null, postalCode: 'SW1Y 4JH',
        country: 'UK', type: 'home', label: 'Town House', countryCode: 'gb'
      }]
    })));

    const [email, tel, adr] = [groupOf(lines, 'EMAIL'), groupOf(lines, 'TEL'), groupOf(lines, 'ADR')];
    expect(new Set([email, tel, adr]).size).toBe(3);
    expect(lines).toContain(`${email}.X-ABLabel:Obsolete`);
    expect(lines).toContain(`${tel}.X-ABLabel:WhatsApp`);
    expect(lines).toContain(`${adr}.X-ABLabel:Town House`);
    expect(lines).toContain(`${adr}.X-ABADR:gb`);
  });

  it('writes a custom date with its label', () => {
    const lines = linesOf(generateVcard(baseContact({
      dates: [{ date: '1835-07-08', label: '_$!<Anniversary>!$_' }]
    })));

    const group = groupOf(lines, 'X-ABDATE');
    expect(lines).toContain(`${group}.X-ABDATE:1835-07-08`);
    expect(lines).toContain(`${group}.X-ABLabel:_$!<Anniversary>!$_`);
  });

  it('writes the generic properties as they were imported', () => {
    const lines = linesOf(generateVcard(baseContact({
      extraProperties: [
        { group: null, name: 'PRODID', params: {}, value: '-//BusyApps//BusyContacts 2025.4.4//EN' },
        { group: null, name: 'X-ADDRESSING-GRAMMAR', params: { ENCODING: ['b'] }, value: 'YnBsaXN0' },
        { group: null, name: 'X-ODD', params: { 'X-NOTE': ['a:b'], 'X-BARE': [] }, value: 'v' }
      ]
    })));

    expect(lines).toContain('PRODID:-//BusyApps//BusyContacts 2025.4.4//EN');
    expect(lines).toContain('X-ADDRESSING-GRAMMAR;ENCODING=b:YnBsaXN0');
    expect(lines).toContain('X-ODD;X-NOTE="a:b";X-BARE:v');
  });

  it('gives generic grouped properties a group no generated property uses', () => {
    const lines = linesOf(generateVcard(baseContact({
      urls: [{ url: 'https://example.com/ada', label: 'Portfolio', type: null }],
      extraProperties: [
        { group: 'item1', name: 'IMPP', params: {}, value: 'x-apple:ada' },
        { group: 'item1', name: 'X-ABLABEL', params: {}, value: 'Private' }
      ]
    })));

    const [url, impp] = [groupOf(lines, 'URL'), groupOf(lines, 'IMPP')];
    expect(url).toBeDefined();
    expect(impp).toBeDefined();
    expect(url).not.toBe(impp);
    expect(lines).toContain(`${impp}.X-ABLABEL:Private`);
  });

  it('round-trips parameters no column holds', () => {
    const card = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Ada Lovelace',
      'N:Lovelace;Ada;;;',
      'BDAY;X-APPLE-OMIT-YEAR=1604:1604-12-10',
      'item1.URL;TYPE=pref:https://example.com/ada',
      'item1.X-ABLabel:Portfolio',
      'ADR;TYPE=HOME;TYPE=pref:;;1 St James Square;London;;SW1Y 4JH;UK',
      'X-SOCIALPROFILE;TYPE=twitter;X-USERID=12345;X-DISPLAYNAME="Ada, Countess":https://twitter.com/ada',
      'END:VCARD'
    ].join('\n');

    const [original] = parseVcf(card).contacts;
    expect(original.vcardParams).toEqual({ BDAY: { 'X-APPLE-OMIT-YEAR': ['1604'] } });
    expect(original.urls[0].params).toEqual({ TYPE: ['pref'] });
    expect(original.addresses[0].params).toEqual({ TYPE: ['pref'] });
    expect(original.socialProfiles[0].params).toEqual({ 'X-USERID': ['12345'], 'X-DISPLAYNAME': ['Ada, Countess'] });

    const lines = linesOf(generateVcard(baseContact({
      birthday: original.birthday,
      vcardParams: original.vcardParams,
      urls: original.urls,
      addresses: original.addresses,
      socialProfiles: original.socialProfiles.map(p => ({ ...p, profileUrl: p.url }))
    })));
    expect(lines).toContain('BDAY;X-APPLE-OMIT-YEAR=1604:16041210');
    expect(lines.find(l => l.includes('X-SOCIALPROFILE'))).toBe(
      'X-SOCIALPROFILE;TYPE=twitter;X-USERID=12345;X-DISPLAYNAME=Ada, Countess:https://twitter.com/ada'
    );

    const [again] = parseVcf(lines.join('\r\n')).contacts;
    expect(again.vcardParams).toEqual(original.vcardParams);
    expect(again.urls[0].params).toEqual(original.urls[0].params);
    expect(again.addresses[0].params).toEqual(original.addresses[0].params);
    expect(again.socialProfiles[0].params).toEqual(original.socialProfiles[0].params);
  });

  it('writes the stored uid', () => {
    const lines = linesOf(generateVcard(baseContact({ uid: 'stored-uid' })));

    expect(lines.filter(l => l.startsWith('UID'))).toEqual(['UID:stored-uid']);
  });

  it('round-trips a card with every modeled property through parse and generate', () => {
    const card = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'PRODID:-//BusyApps//BusyContacts 2025.4.4//EN',
      'N:Lovelace;Ada;Augusta;Hon.;FRS',
      'FN:Ada Lovelace',
      'NICKNAME:Countess',
      'X-GENDER:Female',
      'ORG:Analytical Engines;Research',
      'item1.EMAIL;TYPE=INTERNET;TYPE=OTHER;TYPE=pref:ada@old.example',
      'item1.X-ABLabel:Obsolete',
      'TEL;TYPE=HOME;TYPE=FAX:+44 20 7946 0000',
      'item2.ADR;TYPE=HOME:PO 7;Flat 2;1 St James Square;London;;SW1Y 4JH;UK',
      'item2.X-ABADR:gb',
      'item2.X-ABLabel:Town House',
      'item3.X-ABDATE:1835-07-08',
      'item3.X-ABLabel:_$!<Anniversary>!$_',
      'X-IMAGEHASH:abc123',
      'REV:2024-03-19T22:31:24Z',
      'UID:4bb11a808bd6e881',
      'END:VCARD'
    ].join('\n');

    const [original] = parseVcf(card).contacts;
    const [again] = parseVcf(generateVcard({
      ...original,
      emails: original.emails,
      phones: original.phones,
      addresses: original.addresses,
      socialProfiles: [],
      photoBase64: undefined,
      uid: original.uid
    })).contacts;

    const modeled = (c: typeof original) => ({
      name: [c.lastName, c.firstName, c.middleName, c.namePrefix, c.nameSuffix],
      nickname: c.nickname,
      gender: c.gender,
      org: [c.company, c.department],
      emails: c.emails,
      phones: c.phones,
      addresses: c.addresses,
      dates: c.dates,
      extras: c.extraProperties?.map(p => [p.name, p.value])
    });
    expect(modeled(again)).toEqual(modeled(original));
    expect(original.extraProperties?.map(p => p.name)).toEqual(['PRODID', 'X-IMAGEHASH', 'REV']);
    expect(original.emails[0]).toMatchObject({ type: 'internet', extraTypes: 'other', label: 'Obsolete' });
    expect(original.addresses[0]).toMatchObject({ poBox: 'PO 7', extended: 'Flat 2', countryCode: 'gb', label: 'Town House' });
  });
});

describe('generateVcard with blank rows', () => {
  it('writes no line for a phone or email row that holds no value', () => {
    const lines = linesOf(generateVcard(baseContact({
      emails: [
        { email: '', type: 'work', isPrimary: true },
        { email: 'ada@example.com', type: 'home', isPrimary: false }
      ],
      phones: [
        { phone: '', phoneDisplay: '', type: 'work', isPrimary: true },
        { phone: '+12125550101', phoneDisplay: '+1 212 555 0101', type: 'cell', isPrimary: false }
      ]
    })));

    expect(lines.filter(l => l.startsWith('EMAIL'))).toEqual(['EMAIL;TYPE=HOME:ada@example.com']);
    expect(lines.filter(l => l.startsWith('TEL'))).toEqual(['TEL;TYPE=CELL:+1 212 555 0101']);
  });
});

describe('generateVcard round trip', () => {
  it('returns text that contains vCard separators unchanged', () => {
    const { contacts } = parseVcf(generateVcard(baseContact({
      firstName: 'Ada; A.',
      lastName: 'Lovelace, Countess',
      displayName: 'Ada Lovelace; Countess, of Lovelace',
      company: 'Babbage; Sons, Ltd',
      title: 'Analyst; Writer, Translator \\ Editor',
      notes: 'First line; with separator\nSecond line, with comma \\ and backslash'
    })));

    expect(contacts[0]).toMatchObject({
      firstName: 'Ada; A.',
      lastName: 'Lovelace, Countess',
      displayName: 'Ada Lovelace; Countess, of Lovelace',
      company: 'Babbage; Sons, Ltd',
      title: 'Analyst; Writer, Translator \\ Editor',
      notes: 'First line; with separator\nSecond line, with comma \\ and backslash'
    });
  });

  it('returns a relationship in the capitalisation it was entered', () => {
    const { contacts } = parseVcf(generateVcard(baseContact({
      relatedPeople: [{ name: 'William King', relationship: 'Husband' }]
    })));

    expect(contacts[0].relatedPeople).toEqual([{ name: 'William King', relationship: 'Husband' }]);
  });

  it('returns every category', () => {
    const { contacts } = parseVcf(generateVcard(baseContact({
      categories: ['Work', 'Friends, Close', 'LinkedIn Connection']
    })));

    expect(contacts[0].categories).toEqual(['Work', 'Friends, Close', 'LinkedIn Connection']);
  });

  it('returns the social platform and username', () => {
    const { contacts } = parseVcf(generateVcard(baseContact({
      socialProfiles: [
        { platform: 'linkedin', username: 'ada-lovelace', profileUrl: 'https://www.linkedin.com/in/ada-lovelace' },
        { platform: 'twitter', username: 'love;lace,a:da', profileUrl: 'https://twitter.com/lovelace' }
      ]
    })));

    expect(contacts[0].socialProfiles).toEqual([
      { platform: 'linkedin', username: 'ada-lovelace', url: 'https://www.linkedin.com/in/ada-lovelace' },
      { platform: 'twitter', username: 'love;lace,a:da', url: 'https://twitter.com/lovelace' }
    ]);
  });

  it('returns URLs with their labels', () => {
    const { contacts } = parseVcf(generateVcard(baseContact({
      urls: [
        { url: 'https://example.com/ada', label: 'Portfolio', type: null },
        { url: 'https://example.org', label: null, type: 'work' },
        { url: 'https://example.net', label: 'Old, see: notes', type: null }
      ]
    })));

    expect(contacts[0].urls).toEqual([
      { url: 'https://example.com/ada', label: 'Portfolio', type: null },
      { url: 'https://example.org', label: null, type: 'work' },
      { url: 'https://example.net', label: 'Old, see: notes', type: null }
    ]);
  });

  it('returns instant messages', () => {
    const { contacts } = parseVcf(generateVcard(baseContact({
      instantMessages: [{ service: 'WhatsApp', handle: '+442075550100', type: 'home' }]
    })));

    expect(contacts[0].instantMessages).toEqual([
      { service: 'WhatsApp', handle: '+442075550100', type: 'home' }
    ]);
  });

  it('returns related people', () => {
    const { contacts } = parseVcf(generateVcard(baseContact({
      relatedPeople: [
        { name: 'Babbage, Charles', relationship: 'friend' },
        { name: 'Mary Somerville', relationship: null }
      ]
    })));

    expect(contacts[0].relatedPeople).toEqual([
      { name: 'Babbage, Charles', relationship: 'friend' },
      { name: 'Mary Somerville', relationship: null }
    ]);
  });

  it('returns the primary flag on the entry that carried it', () => {
    const { contacts } = parseVcf(generateVcard(baseContact({
      emails: [
        { email: 'first@example.com', type: 'work', isPrimary: false },
        { email: 'second@example.com', type: 'home', isPrimary: true }
      ]
    })));

    expect(contacts[0].emails.map(e => [e.email, e.isPrimary])).toEqual([
      ['first@example.com', false],
      ['second@example.com', true]
    ]);
  });

  it('returns the uid', () => {
    const { contacts } = parseVcf(generateVcard(baseContact({ uid: '4bb11a808bd6e881' })));

    expect(contacts[0].uid).toBe('4bb11a808bd6e881');
  });

  it('returns the LinkedIn enrichment', () => {
    const enrichment = {
      headline: 'Analyst; "Enchantress of Numbers"',
      followers_count: 1815,
      positions: '[{"title":"Analyst","companyName":"Analytical Engines"}]',
      about: 'Line one\nLine two'
    };

    const { contacts } = parseVcf(generateVcard(baseContact({ linkedinEnrichment: enrichment })));

    expect(contacts[0].linkedinEnrichment).toEqual({
      headline: 'Analyst; "Enchantress of Numbers"',
      followers_count: 1815,
      positions: '[{"title":"Analyst","companyName":"Analytical Engines"}]',
      about: 'Line one\nLine two'
    });
  });

  it('writes no enrichment property for a contact without enrichment', () => {
    const vcard = generateVcard(baseContact({ linkedinEnrichment: null }));

    expect(vcard).not.toContain('X-YELLO-LINKEDIN');
  });
});
