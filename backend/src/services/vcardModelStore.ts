import type { Database as DatabaseType } from 'better-sqlite3';
import type { ParsedContact, ParsedDate, ParsedVcardProperty, VcardParams } from './vcardParser.js';

/** Leftover vCard parameters as stored in a `params` column: JSON, or NULL when none. */
export function paramsJson(params: VcardParams | Record<string, VcardParams> | null | undefined): string | null {
  return params && Object.keys(params).length > 0 ? JSON.stringify(params) : null;
}

export function parseParamsJson<T = VcardParams>(json: string | null | undefined): T | null {
  return json ? JSON.parse(json) as T : null;
}

/**
 * Writes the parts of a parsed card that live outside the contacts INSERT and
 * the email/phone/address rows: extra name parts and person fields, custom
 * dates, and every property with no typed home. Shared by the VCF importer,
 * the iCloud import, and the raw_vcard backfill so they store a card the same way.
 */
export function saveVcardModelFields(db: DatabaseType, contactId: number, contact: ParsedContact): void {
  db.prepare(`
    UPDATE contacts SET
      middle_name = ?, name_prefix = ?, name_suffix = ?, nickname = ?,
      gender = ?, department = ?, is_company = ?, vcard_params = ?
    WHERE id = ?
  `).run(
    contact.middleName ?? null,
    contact.namePrefix ?? null,
    contact.nameSuffix ?? null,
    contact.nickname ?? null,
    contact.gender ?? null,
    contact.department ?? null,
    contact.isCompany ? 1 : 0,
    paramsJson(contact.vcardParams),
    contactId
  );

  insertContactDates(db, contactId, contact.dates ?? []);
  insertVcardProperties(db, contactId, contact.extraProperties ?? []);
}

export function insertContactDates(db: DatabaseType, contactId: number, dates: ParsedDate[]): void {
  const insert = db.prepare('INSERT INTO contact_dates (contact_id, date, label, params) VALUES (?, ?, ?, ?)');
  for (const date of dates) {
    insert.run(contactId, date.date, date.label, paramsJson(date.params));
  }
}

export function insertVcardProperties(db: DatabaseType, contactId: number, properties: ParsedVcardProperty[]): void {
  const insert = db.prepare(`
    INSERT INTO contact_vcard_properties (contact_id, position, group_name, name, params, value)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  properties.forEach((property, position) => {
    const params = Object.keys(property.params).length > 0 ? JSON.stringify(property.params) : null;
    insert.run(contactId, position, property.group, property.name, params, property.value);
  });
}

/** Reads a contact's generic properties back in card order. */
export function loadVcardProperties(db: DatabaseType, contactId: number): ParsedVcardProperty[] {
  const rows = db.prepare(`
    SELECT group_name, name, params, value FROM contact_vcard_properties
    WHERE contact_id = ? ORDER BY position, id
  `).all(contactId) as Array<{ group_name: string | null; name: string; params: string | null; value: string }>;

  return rows.map(row => ({
    group: row.group_name,
    name: row.name,
    params: row.params ? JSON.parse(row.params) as Record<string, string[]> : {},
    value: row.value
  }));
}

/** Columns of child rows that only a vCard import fills, and the value that identifies a row. */
const ENTRY_ANNOTATIONS = {
  contact_emails: { key: 'LOWER(email)', columns: ['extra_types', 'label', 'params'] },
  contact_phones: { key: 'phone', columns: ['extra_types', 'label', 'params'] },
  contact_addresses: {
    key: `LOWER(COALESCE(street, '')) || '|' || LOWER(COALESCE(city, '')) || '|' || LOWER(COALESCE(postal_code, ''))`,
    columns: ['extra_types', 'label', 'po_box', 'extended', 'sublocality', 'subadministrative_area', 'country_code', 'params']
  },
  contact_urls: { key: 'url', columns: ['params'] },
  contact_instant_messages: { key: `LOWER(service) || '|' || handle`, columns: ['params'] },
  contact_social_profiles: { key: `LOWER(COALESCE(profile_url, username))`, columns: ['params'] },
  contact_related_people: { key: 'LOWER(name)', columns: ['params'] }
} as const;

/**
 * Edits replace a contact's child rows wholesale, from forms that know
 * nothing of labels, extra TYPEs, Apple's address hints or leftover parameters. Call this
 * before the replacement and the returned function after it: each re-inserted
 * row that still has the same value gets its annotations back, so an edit
 * elsewhere on the contact does not silently strip them.
 */
export function preserveEntryAnnotations(db: DatabaseType, contactId: number): () => void {
  const snapshots = Object.entries(ENTRY_ANNOTATIONS).map(([table, { key, columns }]) => ({
    table,
    key,
    columns,
    rows: db.prepare(`
      SELECT ${key} AS entry_key, ${columns.join(', ')} FROM ${table}
      WHERE contact_id = ? AND (${columns.map(c => `${c} IS NOT NULL`).join(' OR ')})
    `).all(contactId) as Array<Record<string, string | null>>
  }));

  return () => {
    for (const { table, key, columns, rows } of snapshots) {
      if (rows.length === 0) continue;
      const current = db.prepare(`SELECT id, ${key} AS entry_key FROM ${table} WHERE contact_id = ?`)
        .all(contactId) as Array<{ id: number; entry_key: string }>;
      const update = db.prepare(`
        UPDATE ${table} SET ${columns.map(c => `${c} = COALESCE(${c}, ?)`).join(', ')} WHERE id = ?
      `);
      for (const row of current) {
        const index = rows.findIndex(saved => saved.entry_key === row.entry_key);
        if (index === -1) continue;
        const [saved] = rows.splice(index, 1);
        update.run(...columns.map(c => saved[c]), row.id);
      }
    }
  };
}

/**
 * Carries a secondary contact's vCard-only data onto the merge survivor:
 * person fields fill the survivor's empty ones, custom dates are added unless
 * already present. Generic properties are not carried — they are client
 * metadata (PRODID, REV, ...) of a card that no longer exists.
 */
export function mergeVcardModelFields(db: DatabaseType, primaryId: number, secondaryId: number): void {
  db.prepare(`
    UPDATE contacts SET
      middle_name = COALESCE(contacts.middle_name, s.middle_name),
      name_prefix = COALESCE(contacts.name_prefix, s.name_prefix),
      name_suffix = COALESCE(contacts.name_suffix, s.name_suffix),
      nickname = COALESCE(contacts.nickname, s.nickname),
      gender = COALESCE(contacts.gender, s.gender),
      department = COALESCE(contacts.department, s.department),
      vcard_params = COALESCE(contacts.vcard_params, s.vcard_params)
    FROM (SELECT * FROM contacts WHERE id = ?) AS s
    WHERE contacts.id = ?
  `).run(secondaryId, primaryId);

  db.prepare(`
    INSERT INTO contact_dates (contact_id, date, label, params)
    SELECT ?, s.date, s.label, s.params FROM contact_dates s
    WHERE s.contact_id = ? AND NOT EXISTS (
      SELECT 1 FROM contact_dates p
      WHERE p.contact_id = ? AND p.date = s.date AND COALESCE(p.label, '') = COALESCE(s.label, '')
    )
  `).run(primaryId, secondaryId, primaryId);
}

interface DetailWithEntries {
  id: number;
  emails: Array<{ id: number }>;
  phones: Array<{ id: number }>;
  addresses: Array<{ id: number }>;
}

type EntryAnnotations = { label: string | null; extraTypes: string | null };

/**
 * Adds the vCard-only fields to a contact detail response: person fields,
 * custom dates, generic properties (read-only), and each email/phone/address
 * row's label and extra TYPEs.
 */
export function withVcardFields<T extends DetailWithEntries>(db: DatabaseType, detail: T) {
  const contact = db.prepare(`
    SELECT middle_name, name_prefix, name_suffix, nickname, gender, department, is_company
    FROM contacts WHERE id = ?
  `).get(detail.id) as {
    middle_name: string | null;
    name_prefix: string | null;
    name_suffix: string | null;
    nickname: string | null;
    gender: string | null;
    department: string | null;
    is_company: number | null;
  } | undefined;

  const annotations = (table: string) => new Map(
    (db.prepare(`SELECT id, label, extra_types FROM ${table} WHERE contact_id = ?`)
      .all(detail.id) as Array<{ id: number; label: string | null; extra_types: string | null }>)
      .map(row => [row.id, { label: row.label, extraTypes: row.extra_types }])
  );
  const annotate = <E extends { id: number }>(entries: E[], byId: Map<number, EntryAnnotations>) =>
    entries.map(entry => ({ ...entry, ...(byId.get(entry.id) ?? { label: null, extraTypes: null }) }));

  const addressDetails = new Map(
    (db.prepare(`
      SELECT id, po_box, extended, sublocality, subadministrative_area, country_code
      FROM contact_addresses WHERE contact_id = ?
    `).all(detail.id) as Array<{
      id: number;
      po_box: string | null;
      extended: string | null;
      sublocality: string | null;
      subadministrative_area: string | null;
      country_code: string | null;
    }>).map(row => [row.id, {
      poBox: row.po_box,
      extended: row.extended,
      sublocality: row.sublocality,
      subadministrativeArea: row.subadministrative_area,
      addressCountryCode: row.country_code
    }])
  );

  return {
    ...detail,
    middleName: contact?.middle_name ?? null,
    namePrefix: contact?.name_prefix ?? null,
    nameSuffix: contact?.name_suffix ?? null,
    nickname: contact?.nickname ?? null,
    gender: contact?.gender ?? null,
    department: contact?.department ?? null,
    isCompany: contact?.is_company === 1,
    emails: annotate(detail.emails, annotations('contact_emails')),
    phones: annotate(detail.phones, annotations('contact_phones')),
    addresses: annotate(detail.addresses, annotations('contact_addresses'))
      .map(address => ({ ...address, ...addressDetails.get(address.id) })),
    dates: db.prepare('SELECT id, date, label FROM contact_dates WHERE contact_id = ? ORDER BY id')
      .all(detail.id) as Array<{ id: number; date: string; label: string | null }>,
    extraProperties: loadVcardProperties(db, detail.id)
  };
}
