import { describe, it, expect } from 'vitest';
import { generateGoogleCsv, csvField, googleDate } from '../csvExportService.js';
import type { ContactForVcard } from '../vcardGenerator.js';

const base = (overrides: Partial<ContactForVcard> = {}): ContactForVcard => ({
  firstName: null,
  lastName: null,
  displayName: '',
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
});

/** Parses the CSV back into rows of header → value, for readable assertions. */
function parse(csv: string): Array<Record<string, string>> {
  expect(csv.startsWith('﻿')).toBe(true);
  const text = csv.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map(cells => Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ''])));
}

describe('csvField', () => {
  it('leaves plain values alone', () => {
    expect(csvField('Ada')).toBe('Ada');
  });

  it('quotes values with commas, quotes, line breaks or edge spaces', () => {
    expect(csvField('Lovelace, Ada')).toBe('"Lovelace, Ada"');
    expect(csvField('the "Countess"')).toBe('"the ""Countess"""');
    expect(csvField('line one\nline two')).toBe('"line one\nline two"');
    expect(csvField(' padded')).toBe('" padded"');
  });
});

describe('googleDate', () => {
  it('writes full dates as YYYY-MM-DD', () => {
    expect(googleDate('1815-12-10')).toBe('1815-12-10');
    expect(googleDate('18151210')).toBe('1815-12-10');
  });

  it('writes dates without a year as --MM-DD, including Apple’s 1604 placeholder', () => {
    expect(googleDate('--12-10')).toBe('--12-10');
    expect(googleDate('--1210')).toBe('--12-10');
    expect(googleDate('16041210')).toBe('--12-10');
    expect(googleDate('1604-12-10')).toBe('--12-10');
  });

  it('passes anything else through', () => {
    expect(googleDate('Christmas')).toBe('Christmas');
  });
});

describe('generateGoogleCsv', () => {
  it('writes the base columns in Google’s order and one row per contact', () => {
    const csv = generateGoogleCsv([base({ firstName: 'Ada', lastName: 'Lovelace', displayName: 'Ada Lovelace' })]);
    const header = csv.slice(1).split('\r\n')[0];
    expect(header).toBe([
      'First Name', 'Middle Name', 'Last Name', 'Name Prefix', 'Name Suffix', 'Nickname',
      'Organization Name', 'Organization Title', 'Organization Department',
      'Birthday', 'Notes', 'Labels'
    ].join(','));
    expect(parse(csv)).toHaveLength(1);
  });

  it('maps names, organization, birthday, notes and groups', () => {
    const [row] = parse(generateGoogleCsv([base({
      firstName: 'Ada', middleName: 'King', lastName: 'Lovelace', namePrefix: 'Lady', nameSuffix: 'FRS',
      nickname: 'Countess', displayName: 'Ada Lovelace',
      company: 'Analytical Engines', title: 'Analyst', department: 'Research',
      birthday: '18151210', notes: 'Met at the Royal Society,\nLondon',
      categories: ['Friends', 'Mathematicians']
    })]));
    expect(row).toMatchObject({
      'First Name': 'Ada', 'Middle Name': 'King', 'Last Name': 'Lovelace',
      'Name Prefix': 'Lady', 'Name Suffix': 'FRS', 'Nickname': 'Countess',
      'Organization Name': 'Analytical Engines', 'Organization Title': 'Analyst',
      'Organization Department': 'Research',
      'Birthday': '1815-12-10', 'Notes': 'Met at the Royal Society,\nLondon',
      'Labels': '* myContacts ::: Friends ::: Mathematicians'
    });
  });

  it('puts the display name in First Name when the contact has no name or company', () => {
    const [row] = parse(generateGoogleCsv([base({ displayName: 'Front Desk' })]));
    expect(row['First Name']).toBe('Front Desk');
  });

  it('leaves First Name empty for a company without a person name', () => {
    const [row] = parse(generateGoogleCsv([base({ displayName: 'Acme', company: 'Acme', isCompany: true })]));
    expect(row['First Name']).toBe('');
    expect(row['Organization Name']).toBe('Acme');
  });

  it('numbers emails and phones up to the contact with the most, marking the primary with *', () => {
    const rows = parse(generateGoogleCsv([
      base({
        displayName: 'Ada',
        emails: [
          { email: 'ada@home.example', type: 'home', isPrimary: false },
          { email: 'ada@work.example', type: 'internet', extraTypes: 'work', isPrimary: true },
          { email: 'ada@old.example', type: 'internet', isPrimary: false }
        ],
        phones: [
          { phone: '+14155550100', phoneDisplay: '+1 415 555 0100', type: 'cell', isPrimary: true },
          { phone: '+14155550101', phoneDisplay: '+1 415 555 0101', type: 'work', extraTypes: 'fax', isPrimary: false },
          { phone: '+14155550102', phoneDisplay: '+1 415 555 0102', type: null, label: '_$!<Main>!$_', isPrimary: false }
        ]
      }),
      base({ displayName: 'Bob', emails: [{ email: 'bob@example.com', type: null, isPrimary: false }] })
    ]));
    expect(rows[0]).toMatchObject({
      'E-mail 1 - Label': 'Home', 'E-mail 1 - Value': 'ada@home.example',
      'E-mail 2 - Label': '* Work', 'E-mail 2 - Value': 'ada@work.example',
      'E-mail 3 - Label': '', 'E-mail 3 - Value': 'ada@old.example',
      'Phone 1 - Label': '* Mobile', 'Phone 1 - Value': '+1 415 555 0100',
      'Phone 2 - Label': 'Work Fax', 'Phone 2 - Value': '+1 415 555 0101',
      'Phone 3 - Label': 'Main', 'Phone 3 - Value': '+1 415 555 0102'
    });
    expect(rows[1]['E-mail 1 - Value']).toBe('bob@example.com');
    expect(rows[1]['E-mail 2 - Value']).toBe('');
    expect(rows[1]['Phone 1 - Value']).toBe('');
  });

  it('prefers a custom label over the type', () => {
    const [row] = parse(generateGoogleCsv([base({
      displayName: 'Ada',
      emails: [{ email: 'ada@x.example', type: 'internet', label: 'Newsletter', isPrimary: false }]
    })]));
    expect(row['E-mail 1 - Label']).toBe('Newsletter');
  });

  it('leaves archived details out', () => {
    const [row] = parse(generateGoogleCsv([base({
      displayName: 'Ada',
      phones: [
        { phone: '+1', phoneDisplay: '+1 old', type: 'cell', isPrimary: false, archivedAt: '2026-10-01' },
        { phone: '+2', phoneDisplay: '+2 new', type: 'cell', isPrimary: false }
      ]
    })]));
    expect(row['Phone 1 - Value']).toBe('+2 new');
    expect(row).not.toHaveProperty('Phone 2 - Value');
  });

  it('writes addresses as parts plus a formatted block', () => {
    const [row] = parse(generateGoogleCsv([base({
      displayName: 'Ada',
      addresses: [{
        type: 'home', street: '12 St James’s Square', city: 'London', state: null,
        postalCode: 'SW1Y 4JH', country: 'United Kingdom', poBox: 'PO 7', extended: 'Flat 2'
      }]
    })]));
    expect(row).toMatchObject({
      'Address 1 - Label': 'Home',
      'Address 1 - Street': '12 St James’s Square',
      'Address 1 - City': 'London',
      'Address 1 - PO Box': 'PO 7',
      'Address 1 - Region': '',
      'Address 1 - Postal Code': 'SW1Y 4JH',
      'Address 1 - Country': 'United Kingdom',
      'Address 1 - Extended Address': 'Flat 2'
    });
    expect(row['Address 1 - Formatted']).toContain('London');
    expect(row['Address 1 - Formatted']).toContain('\n');
  });

  it('writes websites and social profiles as Website columns', () => {
    const [row] = parse(generateGoogleCsv([base({
      displayName: 'Ada',
      urls: [{ url: 'https://ada.example', label: '_$!<HomePage>!$_', type: 'pref' }],
      socialProfiles: [
        { platform: 'linkedin', username: 'ada', profileUrl: 'https://www.linkedin.com/in/ada' },
        { platform: 'youtube.com', username: 'adatv', profileUrl: null }
      ]
    })]));
    expect(row).toMatchObject({
      'Website 1 - Label': 'HomePage', 'Website 1 - Value': 'https://ada.example',
      'Website 2 - Label': 'LinkedIn', 'Website 2 - Value': 'https://www.linkedin.com/in/ada',
      'Website 3 - Label': 'Youtube', 'Website 3 - Value': 'adatv'
    });
  });

  it('writes related people, dates and instant messages', () => {
    const [row] = parse(generateGoogleCsv([base({
      displayName: 'Ada',
      relatedPeople: [{ name: 'William King', relationship: 'spouse' }],
      dates: [{ date: '1835-07-08', label: '_$!<Anniversary>!$_' }],
      instantMessages: [{ service: 'WhatsApp', handle: '+14155550100', type: null }]
    })]));
    expect(row).toMatchObject({
      'Relation 1 - Label': 'Spouse', 'Relation 1 - Value': 'William King',
      'Event 1 - Label': 'Anniversary', 'Event 1 - Value': '1835-07-08',
      'Custom Field 1 - Label': 'WhatsApp', 'Custom Field 1 - Value': '+14155550100'
    });
  });

  it('writes only the header for no contacts', () => {
    expect(parse(generateGoogleCsv([]))).toEqual([]);
  });
});
