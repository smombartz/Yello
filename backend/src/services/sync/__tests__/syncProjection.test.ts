import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSingleVcard, parseVcf } from '../../vcardParser.js';
import { generateVcard, YELLO_PRODID, type ContactForVcard } from '../../vcardGenerator.js';
import { getUserDatabase, closeAllUserDatabases } from '../../userDatabase.js';
import { insertParsedContact, prepareContactStatements } from '../../contactPersistence.js';
import { loadContactsForVcard } from '../../vcardExportService.js';
import {
  diffProjections, entriesMissingFrom, hashProjection, normalizeDate, normalizePhone,
  parsedToContactData, projectContact
} from '../syncProjection.js';
import { contactDataToPerson, personToContactData, YELLO_UID_CLIENT_KEY } from '../googlePersonMapper.js';
import type { GooglePersonRaw } from '../googlePeople.js';

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../docs');
// Real Apple/BusyContacts cards. (The "no photo" variants were trimmed by hand
// and keep a bare `PHOTO;;` line the parser rejects, so they are not used.)
const SAMPLE_CARDS = ['Sascha Mombartz.vcf', 'Rebeca Matthews.vcf']
  .map(name => path.join(DOCS, name))
  .filter(file => fs.existsSync(file));

function contact(overrides: Partial<ContactForVcard> = {}): ContactForVcard {
  return {
    firstName: 'Ada', lastName: 'Lovelace', displayName: 'Ada Lovelace', middleName: 'Augusta',
    namePrefix: 'Hon.', nameSuffix: null, nickname: 'Countess',
    company: 'Analytical Engines', title: 'Analyst', department: 'Research',
    notes: 'First programmer.\nLine two.', birthday: '1815-12-10', gender: 'female', isCompany: false,
    uid: 'ADA-UID-1',
    emails: [
      { email: 'ada@example.com', type: 'home', isPrimary: true },
      { email: 'ada@work.example', type: 'work', isPrimary: false }
    ],
    phones: [
      { phone: '+442071234567', phoneDisplay: '+44 20 7123 4567', type: 'cell', isPrimary: true },
      { phone: '+442079876543', phoneDisplay: '+44 20 7987 6543', type: 'work', extraTypes: 'fax', isPrimary: false }
    ],
    addresses: [{ street: '12 St James Square', city: 'London', state: null, postalCode: 'SW1Y 4JH', country: 'United Kingdom', type: 'home' }],
    urls: [{ url: 'https://ada.example/', label: null, type: 'homepage' }],
    socialProfiles: [{ platform: 'twitter', username: 'ada', profileUrl: 'https://twitter.com/ada' }],
    instantMessages: [{ service: 'skype', handle: 'ada.l', type: null }],
    relatedPeople: [{ name: 'Lord Byron', relationship: '_$!<Father>!$_' }],
    dates: [{ date: '1835-07-08', label: '_$!<Anniversary>!$_' }],
    categories: ['Friends', 'Mathematics'],
    ...overrides
  };
}

describe('syncProjection', () => {
  describe('normalisation', () => {
    it('treats formatting differences as equal', () => {
      const a = projectContact(contact(), 'icloud');
      const b = projectContact(contact({
        emails: [
          { email: ' ADA@work.example ', type: 'WORK', extraTypes: 'INTERNET', isPrimary: true },
          { email: 'Ada@Example.com', type: 'HOME', extraTypes: 'pref', isPrimary: false }
        ],
        phones: [
          { phone: '+44 (20) 7987-6543', phoneDisplay: 'x', type: 'FAX', extraTypes: 'WORK', isPrimary: false },
          { phone: '+44 20 7123 4567', phoneDisplay: 'x', type: null, label: '_$!<Mobile>!$_', isPrimary: false }
        ],
        notes: 'First programmer.\r\nLine two.  ',
        urls: [{ url: 'https://ADA.example', label: null, type: 'homepage' }]
      }), 'icloud');
      expect(diffProjections(a, b)).toEqual([]);
      expect(hashProjection(a)).toBe(hashProjection(b));
    });

    it('sees a real edit, in the family it belongs to', () => {
      const a = projectContact(contact(), 'icloud');
      const b = projectContact(contact({ title: 'Lead Analyst', categories: ['Friends'] }), 'icloud');
      expect(diffProjections(a, b)).toEqual(['org', 'categories']);
    });

    it('reads Apple year-less birthdays as year-less', () => {
      expect(normalizeDate('1604-03-14')).toBe('--03-14');
      expect(normalizeDate('--0314')).toBe('--03-14');
      expect(normalizeDate('19900314')).toBe('1990-03-14');
      expect(normalizePhone('+1 (212) 555-0101')).toBe('+12125550101');
    });

    it('leaves categories, the company flag and FN out of the Google projection, and sends socials as URLs', () => {
      const p = projectContact(contact({ isCompany: true }), 'google');
      expect(p.categories).toEqual([]);
      expect(p.isCompany).toBe(false);
      expect(p.name.display).toBeNull();
      expect(p.socials).toEqual([]);
      expect(p.urls).toContainEqual({ value: 'https://twitter.com/ada', type: 'twitter' });
    });

    it('finds entries one side has and the other lacks', () => {
      const base = projectContact(contact(), 'icloud');
      const incoming = projectContact(contact({
        emails: [...contact().emails, { email: 'new@example.com', type: 'other', isPrimary: false }]
      }), 'icloud');
      expect(entriesMissingFrom('emails', base, incoming)).toEqual([{ value: 'new@example.com', type: 'other' }]);
      expect(entriesMissingFrom('emails', incoming, base)).toEqual([]);
    });
  });

  describe('iCloud round trip', () => {
    it('a pushed card parses back to the same projection', () => {
      const original = contact();
      const card = generateVcard(original, { sync: { rev: '2026-10-25T10:00:00Z' } });
      expect(card).toContain(`PRODID:${YELLO_PRODID}`);
      expect(card).toContain('REV:2026-10-25T10:00:00Z');
      const back = parsedToContactData(parseSingleVcard(card)!);
      expect(diffProjections(projectContact(original, 'icloud'), projectContact(back, 'icloud'))).toEqual([]);
    });

    it('sync mode replaces the imported REV/PRODID and drops the LinkedIn blob', () => {
      const card = generateVcard(contact({
        extraProperties: [
          { group: null, name: 'PRODID', params: {}, value: '-//Apple Inc.//iPhone OS 17.0//EN' },
          { group: null, name: 'REV', params: {}, value: '2020-01-01T00:00:00Z' },
          { group: null, name: 'X-ADDRESSING-GRAMMAR', params: {}, value: 'abc' }
        ],
        linkedinEnrichment: { linkedin_headline: 'x' }
      }), { sync: { rev: '2026-10-25T10:00:00Z' } });
      expect(card).not.toContain('iPhone OS');
      expect(card).not.toContain('2020-01-01');
      expect(card).not.toContain('X-YELLO-LINKEDIN');
      expect(card).toContain('X-ADDRESSING-GRAMMAR:abc');
    });

    it.each(SAMPLE_CARDS)('sample card %s: card → Yello → card keeps its projection', file => {
      const parsed = parseVcf(fs.readFileSync(file, 'utf-8')).contacts[0];
      const asCard = parsedToContactData(parsed);
      const regenerated = parsedToContactData(parseSingleVcard(generateVcard(asCard, { sync: { rev: 'x' } }))!);
      expect(diffProjections(projectContact(asCard, 'icloud'), projectContact(regenerated, 'icloud'))).toEqual([]);
    });
  });

  describe('Yello database round trip', () => {
    let tmpDir: string;
    beforeAll(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-sync-projection-'));
      process.env.USER_DATA_PATH = tmpDir;
    });
    afterAll(() => {
      closeAllUserDatabases();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it.each(SAMPLE_CARDS)('sample card %s: imported into Yello it projects like the card itself', file => {
      const db = getUserDatabase(3);
      const parsed = parseVcf(fs.readFileSync(file, 'utf-8')).contacts[0];
      const stmts = prepareContactStatements(db);
      const { contactId } = db.transaction(() => insertParsedContact(stmts, db, parsed, { skipExistingUid: false }))()!;
      const [loaded] = loadContactsForVcard(db, { ids: [contactId], withoutEnrichment: true });

      for (const provider of ['icloud', 'google'] as const) {
        expect(diffProjections(projectContact(parsedToContactData(parsed), provider), projectContact(loaded.contact, provider)))
          .toEqual([]);
      }
    });
  });

  describe('Google mapping', () => {
    /** What Google returns for a contact Yello created: the body echoed with source metadata. */
    function echo(body: Record<string, unknown>): GooglePersonRaw {
      const withSource = (items: unknown) =>
        (items as Array<Record<string, unknown>> | undefined)?.map(item => ({ ...item, metadata: { source: { type: 'CONTACT' } } }));
      return {
        resourceName: 'people/c1',
        ...Object.fromEntries(Object.entries(body).map(([key, value]) => [key, withSource(value)])),
        phoneNumbers: (body.phoneNumbers as Array<{ value: string; type?: string }>).map(p => ({
          ...p, canonicalForm: normalizePhone(p.value), metadata: { source: { type: 'CONTACT' } }
        }))
      } as GooglePersonRaw;
    }

    it('a contact pushed to Google reads back to the same Google projection', () => {
      const original = contact();
      const person = contactDataToPerson(original);
      expect(person.clientData).toEqual([{ key: YELLO_UID_CLIENT_KEY, value: 'ADA-UID-1' }]);
      expect(person).not.toHaveProperty('memberships');

      const back = personToContactData(echo(person), { socialsFromUrls: true });
      expect(back.uid).toBe('ADA-UID-1');
      expect(diffProjections(projectContact(original, 'google'), projectContact(back, 'google'))).toEqual([]);
      expect(back.socialProfiles).toEqual([{ platform: 'twitter', username: 'ada', profileUrl: 'https://twitter.com/ada' }]);
    });

    it('maps Apple types and labels to Google types', () => {
      const person = contactDataToPerson(contact({
        phones: [
          { phone: '+1', phoneDisplay: '+1', type: 'iphone', isPrimary: true },
          { phone: '+2', phoneDisplay: '+2', type: 'home', extraTypes: 'fax', isPrimary: false },
          { phone: '+3', phoneDisplay: '+3', type: null, label: 'Boat', isPrimary: false }
        ],
        birthday: '1604-03-14'
      }));
      expect((person.phoneNumbers as Array<{ type: string }>).map(p => p.type)).toEqual(['mobile', 'homeFax', 'Boat']);
      expect(person.birthdays).toEqual([{ date: { month: 3, day: 14 } }]);
      expect((person.relations as Array<{ type: string }>)[0].type).toBe('father');
    });

    it('ignores values from the person’s own Google profile', () => {
      const person: GooglePersonRaw = {
        resourceName: 'people/c2',
        names: [
          { givenName: 'Profile', familyName: 'Name', metadata: { source: { type: 'PROFILE' } } },
          { givenName: 'Card', familyName: 'Name', metadata: { source: { type: 'CONTACT' } } }
        ],
        emailAddresses: [
          { value: 'public@profile.example', metadata: { source: { type: 'PROFILE' } } },
          { value: 'card@example.com', metadata: { source: { type: 'CONTACT' } } }
        ]
      };
      const data = personToContactData(person);
      expect(data.firstName).toBe('Card');
      expect(data.emails.map(e => e.email)).toEqual(['card@example.com']);
      expect(personToContactData(person, { allSources: true }).emails).toHaveLength(2);
    });
  });
});
