/**
 * Google Contacts CSV export
 * ==========================
 * Writes contacts as a CSV in the layout Google Contacts exports (and so
 * imports): fixed name/organization columns, then numbered groups such as
 * "E-mail 1 - Label" / "E-mail 1 - Value". Each numbered group has as many
 * slots as the contact with the most entries needs.
 *
 * Built from the same ContactForVcard that the VCF export uses. Archived
 * details are left out, and so are photos (Google's CSV only takes a URL).
 * Social profiles go into Website columns and instant messages into Custom
 * Field columns, which is where Google itself keeps them.
 */

import { formatAddress } from './addressFormatter.js';
import { activeOnly } from './archivedDetails.js';
import type { ContactForVcard } from './vcardGenerator.js';

/** Quotes a value when it holds a comma, quote, line break or edge space (RFC 4180). */
export function csvField(value: string): string {
  return /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** A stored date as Google writes it: YYYY-MM-DD, or --MM-DD without a year. */
export function googleDate(value: string): string {
  const noYear = value.match(/^--(\d{2})-?(\d{2})$/);
  if (noYear) return `--${noYear[1]}-${noYear[2]}`;
  const full = value.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (!full) return value;
  // 1604 is Apple's placeholder year for a date entered without one.
  return full[1] === '1604' ? `--${full[2]}-${full[3]}` : `${full[1]}-${full[2]}-${full[3]}`;
}

/** Apple's built-in labels come wrapped as _$!<Main>!$_. */
function unwrapLabel(label: string | null | undefined): string {
  const trimmed = label?.trim() ?? '';
  return trimmed.match(/^_\$!<(.*)>!\$_$/)?.[1].trim() ?? trimmed;
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const TYPE_LABELS: Record<string, string> = {
  home: 'Home', work: 'Work', other: 'Other',
  cell: 'Mobile', mobile: 'Mobile', iphone: 'Mobile',
  main: 'Main', pager: 'Pager', fax: 'Fax'
};

/** vCard TYPE values that say nothing a person would read as a label. */
const SILENT_TYPES = new Set(['internet', 'pref', 'voice', 'x400']);

/** The label a Google CSV shows: the custom label, or one read from the TYPE values. */
function entryLabel(entry: { type?: string | null; extraTypes?: string | null; label?: string | null }): string {
  const custom = unwrapLabel(entry.label);
  if (custom) return custom;
  const types = [entry.type, ...(entry.extraTypes?.split(',') ?? [])]
    .map(t => t?.trim().toLowerCase() ?? '')
    .filter(t => t && !SILENT_TYPES.has(t));
  if (types.includes('fax')) {
    const place = types.find(t => t === 'home' || t === 'work');
    return place ? `${TYPE_LABELS[place]} Fax` : 'Fax';
  }
  const first = types[0];
  return first ? TYPE_LABELS[first] ?? capitalize(first) : '';
}

/** Google marks the primary entry by starting its label with "* ". */
const primaryLabel = (label: string, isPrimary: boolean) => (isPrimary ? `* ${label || 'Other'}` : label);

const SOCIAL_NAMES: Record<string, string> = {
  linkedin: 'LinkedIn', github: 'GitHub', youtube: 'Youtube', x: 'X', tiktok: 'TikTok'
};

function socialLabel(platform: string): string {
  const name = platform.trim().toLowerCase().replace(/\.(com|co|net|org)$/, '');
  return SOCIAL_NAMES[name] ?? capitalize(name);
}

/** One numbered group: its column suffixes and the values per slot of a contact. */
interface Group {
  name: string;
  fields: string[];
  slots: (contact: ContactForVcard) => string[][];
}

const GROUPS: Group[] = [
  {
    name: 'E-mail',
    fields: ['Label', 'Value'],
    slots: c => activeOnly(c.emails).map(e => [primaryLabel(entryLabel(e), e.isPrimary), e.email])
  },
  {
    name: 'Phone',
    fields: ['Label', 'Value'],
    slots: c => activeOnly(c.phones).map(p => [primaryLabel(entryLabel(p), p.isPrimary), p.phoneDisplay || p.phone])
  },
  {
    name: 'Address',
    fields: ['Label', 'Formatted', 'Street', 'City', 'PO Box', 'Region', 'Postal Code', 'Country', 'Extended Address'],
    slots: c => activeOnly(c.addresses).map(a => {
      const hasParts = a.street || a.city || a.state || a.postalCode || a.country;
      const formatted = hasParts ? formatAddress(a, { includeCountry: true }).lines.join('\n') : '';
      return [
        entryLabel(a), formatted, a.street ?? '', a.city ?? '', a.poBox ?? '', a.state ?? '',
        a.postalCode ?? '', a.country ?? '', a.extended ?? ''
      ];
    })
  },
  {
    name: 'Relation',
    fields: ['Label', 'Value'],
    slots: c => (c.relatedPeople ?? []).map(r => [capitalize(unwrapLabel(r.relationship)), r.name])
  },
  {
    name: 'Website',
    fields: ['Label', 'Value'],
    slots: c => [
      ...activeOnly(c.urls ?? []).map(u => [entryLabel(u), u.url]),
      ...activeOnly(c.socialProfiles)
        .filter(s => s.profileUrl || s.username)
        .map(s => [socialLabel(s.platform), s.profileUrl || s.username || ''])
    ]
  },
  {
    name: 'Event',
    fields: ['Label', 'Value'],
    slots: c => (c.dates ?? []).map(d => [capitalize(unwrapLabel(d.label)), googleDate(d.date)])
  },
  {
    name: 'Custom Field',
    fields: ['Label', 'Value'],
    slots: c => activeOnly(c.instantMessages ?? []).map(im => [im.service, im.handle])
  }
];

const BASE_COLUMNS = [
  'First Name', 'Middle Name', 'Last Name', 'Name Prefix', 'Name Suffix', 'Nickname',
  'Organization Name', 'Organization Title', 'Organization Department',
  'Birthday', 'Notes', 'Labels'
];

function baseValues(c: ContactForVcard): string[] {
  const hasName = c.firstName || c.middleName || c.lastName;
  // A contact with neither a person name nor a company still needs a name in Google.
  const firstName = c.firstName ?? (!hasName && !c.company ? c.displayName : '');
  return [
    firstName, c.middleName ?? '', c.lastName ?? '', c.namePrefix ?? '', c.nameSuffix ?? '', c.nickname ?? '',
    c.company ?? '', c.title ?? '', c.department ?? '',
    c.birthday ? googleDate(c.birthday) : '', c.notes ?? '',
    ['* myContacts', ...c.categories].join(' ::: ')
  ];
}

/** The contacts as one Google Contacts CSV: UTF-8 BOM (for Excel), CRLF rows. */
export function generateGoogleCsv(contacts: ContactForVcard[]): string {
  const perContact = contacts.map(c => GROUPS.map(g => g.slots(c)));
  const slotCounts = GROUPS.map((_, i) => Math.max(0, ...perContact.map(groups => groups[i].length)));

  const header = [...BASE_COLUMNS];
  GROUPS.forEach((group, i) => {
    for (let n = 1; n <= slotCounts[i]; n++) {
      header.push(...group.fields.map(field => `${group.name} ${n} - ${field}`));
    }
  });

  const rows = contacts.map((contact, c) => {
    const cells = baseValues(contact);
    GROUPS.forEach((group, i) => {
      for (let n = 0; n < slotCounts[i]; n++) {
        cells.push(...(perContact[c][i][n] ?? group.fields.map(() => '')));
      }
    });
    return cells;
  });

  return '﻿' + [header, ...rows].map(cells => cells.map(csvField).join(',')).join('\r\n') + '\r\n';
}
