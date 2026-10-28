import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import { rebuildContactSearch } from './database.js';
import { insertContactDates, paramsJson, saveVcardModelFields } from './vcardModelStore.js';
import { LINKEDIN_ENRICHMENT_COLUMNS } from './linkedinEnrichmentColumns.js';
import { archiveStateForStorage, normalizeArchivedPrimary } from './archivedDetails.js';
import type { ParsedContact } from './vcardParser.js';
import type { SyncField } from './sync/syncProjection.js';

/**
 * Writes a ParsedContact into the per-user database, either as a new contact
 * or merged into an existing one. Shared by the VCF import job, the iCloud
 * import route and the sync engine so every path writes the same columns.
 */

type ContactStatement = Statement<unknown[]>;

export interface ContactStatements {
  findByUid: ContactStatement;
  insertContact: ContactStatement;
  insertEmail: ContactStatement;
  insertPhone: ContactStatement;
  insertAddress: ContactStatement;
  insertCategory: ContactStatement;
  insertInstantMessage: ContactStatement;
  insertUrl: ContactStatement;
  insertRelatedPerson: ContactStatement;
  insertSocialProfile: ContactStatement;
  insertLinkedinEnrichment: ContactStatement;
  setPhotoHash: ContactStatement;
  upsertContactPhoto: ContactStatement;
}

/**
 * Prepared per batch rather than per job: the LRU cache in getUserDatabase can
 * close a handle out from under a long-running job, so callers re-acquire the
 * database (and therefore its statements) each batch.
 */
export function prepareContactStatements(db: DatabaseType): ContactStatements {
  return {
    findByUid: db.prepare('SELECT id FROM contacts WHERE icloud_uid = ? LIMIT 1'),

    insertContact: db.prepare(`
      INSERT INTO contacts (first_name, last_name, display_name, company, title, notes, birthday, photo_hash, icloud_uid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),

    insertEmail: db.prepare(`
      INSERT INTO contact_emails (contact_id, email, type, extra_types, label, params, is_primary, detail_archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),

    insertPhone: db.prepare(`
      INSERT INTO contact_phones (contact_id, phone, phone_display, country_code, type, extra_types, label, params, is_primary, detail_archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),

    // geocoded_at is stamped alongside imported coordinates so the address
    // cleanup queue (which treats geocoded_at IS NULL as pending) does not
    // re-geocode them through the paid HERE API.
    insertAddress: db.prepare(`
      INSERT INTO contact_addresses (
        contact_id, street, city, state, postal_code, country, type, extra_types, label,
        po_box, extended, sublocality, subadministrative_area, country_code, params,
        latitude, longitude, geocoded_at, detail_archived_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END, ?)
    `),

    insertCategory: db.prepare(`
      INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)
    `),

    insertInstantMessage: db.prepare(`
      INSERT INTO contact_instant_messages (contact_id, service, handle, type, params, detail_archived_at) VALUES (?, ?, ?, ?, ?, ?)
    `),

    insertUrl: db.prepare(`
      INSERT INTO contact_urls (contact_id, url, label, type, params, detail_archived_at) VALUES (?, ?, ?, ?, ?, ?)
    `),

    insertRelatedPerson: db.prepare(`
      INSERT INTO contact_related_people (contact_id, name, relationship, params) VALUES (?, ?, ?, ?)
    `),

    insertSocialProfile: db.prepare(`
      INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url, type, params, detail_archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),

    insertLinkedinEnrichment: db.prepare(`
      INSERT INTO linkedin_enrichment (contact_id, ${LINKEDIN_ENRICHMENT_COLUMNS.join(', ')})
      VALUES (?, ${LINKEDIN_ENRICHMENT_COLUMNS.map(() => '?').join(', ')})
    `),

    setPhotoHash: db.prepare('UPDATE contacts SET photo_hash = ? WHERE id = ?'),

    // Every vCard-borne photo (file import, iCloud) is source 'vcard': the
    // contact_photos CHECK only allows vcard/google/gravatar/linkedin.
    upsertContactPhoto: db.prepare(`
      INSERT INTO contact_photos (contact_id, source, local_hash, is_primary)
      VALUES (?, 'vcard', ?, 1)
      ON CONFLICT(contact_id, source) DO UPDATE SET
        local_hash = excluded.local_hash,
        fetched_at = CURRENT_TIMESTAMP
    `)
  };
}

/** Falls back to the last URL path segment, then the platform name. */
function socialUsername(profile: ParsedContact['socialProfiles'][number]): string {
  let username = profile.username;
  if (!username && profile.url) {
    const urlMatch = profile.url.match(/\/([^/]+)\/?$/);
    username = urlMatch ? urlMatch[1] : profile.platform;
  }
  return username || profile.platform;
}

type Stmts = ContactStatements;
type Email = ParsedContact['emails'][number];
type Phone = ParsedContact['phones'][number];
type Address = ParsedContact['addresses'][number];
type InstantMessage = ParsedContact['instantMessages'][number];
type Url = ParsedContact['urls'][number];
type RelatedPerson = ParsedContact['relatedPeople'][number];
type SocialProfile = ParsedContact['socialProfiles'][number];

// Every row is written through archiveStateForStorage, so an entry labelled
// Obsolete/Archived is stored archived (see archivedDetails.ts). Callers run
// normalizeArchivedPrimary afterwards.

function insertEmailRow(stmts: Stmts, contactId: number, email: Email): void {
  const { archivedAt, label } = archiveStateForStorage(email);
  stmts.insertEmail.run(
    contactId, email.email, email.type, email.extraTypes ?? null, label,
    paramsJson(email.params), email.isPrimary ? 1 : 0, archivedAt
  );
}

function insertPhoneRow(stmts: Stmts, contactId: number, phone: Phone): void {
  const { archivedAt, label } = archiveStateForStorage(phone);
  stmts.insertPhone.run(
    contactId, phone.phone, phone.phoneDisplay, phone.countryCode, phone.type,
    phone.extraTypes ?? null, label, paramsJson(phone.params), phone.isPrimary ? 1 : 0, archivedAt
  );
}

function insertAddressRow(stmts: Stmts, contactId: number, addr: Address): void {
  const { archivedAt, label } = archiveStateForStorage(addr);
  stmts.insertAddress.run(
    contactId,
    addr.street,
    addr.city,
    addr.state,
    addr.postalCode,
    addr.country,
    addr.type,
    addr.extraTypes ?? null,
    label,
    addr.poBox ?? null,
    addr.extended ?? null,
    addr.sublocality ?? null,
    addr.subadministrativeArea ?? null,
    addr.countryCode ?? null,
    paramsJson(addr.params),
    addr.latitude,
    addr.longitude,
    addr.latitude,
    archivedAt
  );
}

function insertInstantMessageRow(stmts: Stmts, contactId: number, im: InstantMessage): void {
  stmts.insertInstantMessage.run(contactId, im.service, im.handle, im.type, paramsJson(im.params), im.archivedAt ?? null);
}

function insertUrlRow(stmts: Stmts, contactId: number, url: Url): void {
  const { archivedAt, label } = archiveStateForStorage(url);
  stmts.insertUrl.run(contactId, url.url, label, url.type, paramsJson(url.params), archivedAt);
}

function insertRelatedPersonRow(stmts: Stmts, contactId: number, person: RelatedPerson): void {
  stmts.insertRelatedPerson.run(contactId, person.name, person.relationship, paramsJson(person.params));
}

function insertSocialProfileRow(stmts: Stmts, contactId: number, profile: SocialProfile): void {
  stmts.insertSocialProfile.run(
    contactId, profile.platform, socialUsername(profile), profile.url, null, paramsJson(profile.params), profile.archivedAt ?? null
  );
}

export interface InsertedContact {
  contactId: number;
  addressesGeotagged: number;
}

/**
 * Inserts one contact and all of its child rows. Must be called inside a
 * transaction; returns null if the card was skipped because its UID is
 * already in the database (pass skipExistingUid: false to insert anyway).
 */
export function insertParsedContact(
  stmts: ContactStatements,
  db: DatabaseType,
  contact: ParsedContact,
  options: { skipExistingUid?: boolean } = {}
): InsertedContact | null {
  // Stable-identifier dedupe: a re-import of the same export is a no-op for
  // any card carrying a UID we have already seen.
  if (contact.uid && options.skipExistingUid !== false) {
    const existing = stmts.findByUid.get(contact.uid) as { id: number } | undefined;
    if (existing) return null;
  }

  const result = stmts.insertContact.run(
    contact.firstName,
    contact.lastName,
    contact.displayName,
    contact.company,
    contact.title,
    contact.notes,
    contact.birthday,
    null,
    contact.uid
  );
  const contactId = result.lastInsertRowid as number;

  for (const email of contact.emails) insertEmailRow(stmts, contactId, email);
  for (const phone of contact.phones) insertPhoneRow(stmts, contactId, phone);

  let addressesGeotagged = 0;
  for (const addr of contact.addresses) {
    insertAddressRow(stmts, contactId, addr);
    if (addr.latitude !== null && addr.longitude !== null) addressesGeotagged++;
  }

  for (const category of contact.categories) stmts.insertCategory.run(contactId, category);
  for (const im of contact.instantMessages) insertInstantMessageRow(stmts, contactId, im);
  for (const url of contact.urls) insertUrlRow(stmts, contactId, url);
  for (const person of contact.relatedPeople) insertRelatedPersonRow(stmts, contactId, person);
  for (const profile of contact.socialProfiles) insertSocialProfileRow(stmts, contactId, profile);

  if (contact.linkedinEnrichment) {
    const enrichment = contact.linkedinEnrichment;
    const values = LINKEDIN_ENRICHMENT_COLUMNS.map(column => {
      const value = enrichment[column];
      return typeof value === 'string' || typeof value === 'number' ? value : null;
    });
    if (values.some(value => value !== null)) {
      stmts.insertLinkedinEnrichment.run(contactId, ...values);
    }
  }

  saveVcardModelFields(db, contactId, contact);
  normalizeArchivedPrimary(db, contactId);

  rebuildContactSearch(db, contactId);

  return { contactId, addressesGeotagged };
}

/** Scalar contact columns a merge can fill or, on an 'incoming' resolution, overwrite. */
export const MERGEABLE_SCALAR_FIELDS = [
  'first_name', 'last_name', 'company', 'title', 'birthday', 'notes',
  'middle_name', 'name_prefix', 'name_suffix', 'nickname', 'gender', 'department'
] as const;

export type MergeableScalarField = typeof MERGEABLE_SCALAR_FIELDS[number];
export type ConflictResolutions = Partial<Record<string, 'incoming' | 'existing'>>;

function incomingScalars(contact: ParsedContact): Record<MergeableScalarField, string | null> {
  return {
    first_name: contact.firstName,
    last_name: contact.lastName,
    company: contact.company,
    title: contact.title,
    birthday: contact.birthday,
    notes: contact.notes,
    middle_name: contact.middleName ?? null,
    name_prefix: contact.namePrefix ?? null,
    name_suffix: contact.nameSuffix ?? null,
    nickname: contact.nickname ?? null,
    gender: contact.gender ?? null,
    department: contact.department ?? null
  };
}

const lower = (value: string | null | undefined): string => (value || '').toLowerCase();

const ADDRESS_KEY_SQL =
  `LOWER(COALESCE(street, '')) || '|' || LOWER(COALESCE(city, '')) || '|' || LOWER(COALESCE(postal_code, ''))`;

function existingKeys(db: DatabaseType, sql: string, contactId: number): Set<string> {
  return new Set((db.prepare(sql).all(contactId) as Array<{ key: string }>).map(r => r.key));
}

/**
 * Merges an incoming card into an existing contact. Empty scalars are filled;
 * differing scalars change only on an 'incoming' resolution. Multi-value
 * fields are unioned by a normalised key, keeping the incoming row's labels
 * and parameters. Must be called inside a transaction. Photos are left to the
 * caller (processing them is async).
 */
export function mergeParsedIntoContact(
  stmts: ContactStatements,
  db: DatabaseType,
  existingContactId: number,
  incoming: ParsedContact,
  conflictResolutions: ConflictResolutions = {}
): void {
  const existingRow = db.prepare('SELECT * FROM contacts WHERE id = ?').get(existingContactId) as
    Record<string, unknown> | undefined;
  if (!existingRow) throw new Error(`Existing contact ${existingContactId} not found`);

  // Store the vCard UID on the existing contact if it doesn't have one, so
  // the next import matches this record exactly instead of by heuristics.
  if (incoming.uid && !existingRow.icloud_uid) {
    db.prepare('UPDATE contacts SET icloud_uid = ? WHERE id = ?').run(incoming.uid, existingContactId);
  }

  const incomingValues = incomingScalars(incoming);
  for (const field of MERGEABLE_SCALAR_FIELDS) {
    const incomingVal = incomingValues[field];
    const existingVal = existingRow[field] as string | null;
    if (!incomingVal) continue;
    if (!existingVal || (incomingVal !== existingVal && conflictResolutions[field] === 'incoming')) {
      db.prepare(`UPDATE contacts SET ${field} = ? WHERE id = ?`).run(incomingVal, existingContactId);
    }
  }

  const id = existingContactId;

  const emails = existingKeys(db, 'SELECT LOWER(email) AS key FROM contact_emails WHERE contact_id = ?', id);
  for (const e of incoming.emails) {
    if (!emails.has(lower(e.email))) { insertEmailRow(stmts, id, { ...e, isPrimary: false }); emails.add(lower(e.email)); }
  }

  const phones = existingKeys(db, 'SELECT phone AS key FROM contact_phones WHERE contact_id = ?', id);
  for (const p of incoming.phones) {
    if (!phones.has(p.phone)) { insertPhoneRow(stmts, id, { ...p, isPrimary: false }); phones.add(p.phone); }
  }

  const addressKey = (street: string | null, city: string | null, postal: string | null) =>
    `${lower(street)}|${lower(city)}|${lower(postal)}`;
  const addresses = existingKeys(
    db,
    `SELECT LOWER(COALESCE(street, '')) || '|' || LOWER(COALESCE(city, '')) || '|' || LOWER(COALESCE(postal_code, '')) AS key
     FROM contact_addresses WHERE contact_id = ?`,
    id
  );
  for (const a of incoming.addresses) {
    const key = addressKey(a.street, a.city, a.postalCode);
    if (!addresses.has(key)) { insertAddressRow(stmts, id, a); addresses.add(key); }
  }

  const socials = existingKeys(
    db,
    `SELECT LOWER(platform) || ':' || LOWER(username) AS key FROM contact_social_profiles WHERE contact_id = ?`,
    id
  );
  for (const sp of incoming.socialProfiles) {
    const key = `${lower(sp.platform)}:${lower(socialUsername(sp))}`;
    if (!socials.has(key)) { insertSocialProfileRow(stmts, id, sp); socials.add(key); }
  }

  const categories = existingKeys(db, 'SELECT LOWER(category) AS key FROM contact_categories WHERE contact_id = ?', id);
  for (const c of incoming.categories) {
    if (!categories.has(lower(c))) { stmts.insertCategory.run(id, c); categories.add(lower(c)); }
  }

  const urls = existingKeys(db, 'SELECT LOWER(url) AS key FROM contact_urls WHERE contact_id = ?', id);
  for (const u of incoming.urls) {
    if (!urls.has(lower(u.url))) { insertUrlRow(stmts, id, u); urls.add(lower(u.url)); }
  }

  const ims = existingKeys(
    db,
    `SELECT LOWER(service) || ':' || LOWER(handle) AS key FROM contact_instant_messages WHERE contact_id = ?`,
    id
  );
  for (const im of incoming.instantMessages) {
    const key = `${lower(im.service)}:${lower(im.handle)}`;
    if (!ims.has(key)) { insertInstantMessageRow(stmts, id, im); ims.add(key); }
  }

  const related = existingKeys(
    db,
    `SELECT LOWER(name) || ':' || LOWER(COALESCE(relationship, '')) AS key FROM contact_related_people WHERE contact_id = ?`,
    id
  );
  for (const rp of incoming.relatedPeople) {
    const key = `${lower(rp.name)}:${lower(rp.relationship)}`;
    if (!related.has(key)) { insertRelatedPersonRow(stmts, id, rp); related.add(key); }
  }

  const dates = existingKeys(
    db,
    `SELECT date || '|' || COALESCE(label, '') AS key FROM contact_dates WHERE contact_id = ?`,
    id
  );
  const newDates = (incoming.dates ?? []).filter(d => !dates.has(`${d.date}|${d.label ?? ''}`));
  insertContactDates(db, id, newDates);

  const names = db.prepare('SELECT first_name, last_name FROM contacts WHERE id = ?').get(id) as
    { first_name: string | null; last_name: string | null };
  const displayName = [names.first_name, names.last_name].filter(Boolean).join(' ') || incoming.displayName;
  db.prepare('UPDATE contacts SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(displayName, id);
  normalizeArchivedPrimary(db, id);

  rebuildContactSearch(db, id);
}

/**
 * Replaces whole field families of a contact with an incoming card's values
 * (sync: a family changed only on the remote side). Each family maps to its
 * columns or child table; child rows are replaced wholesale, keeping the
 * incoming labels and parameters. Geocoding survives on addresses whose
 * street, city and postcode are unchanged, and a related person keeps its
 * link to another contact while the name is the same. Archived rows are
 * Yello's alone (never synced): they are kept, and an incoming entry with an
 * archived row's value is skipped rather than added as an active duplicate.
 * Must be called inside a transaction. Photos are left to the caller.
 */
export function replaceContactFields(
  stmts: ContactStatements,
  db: DatabaseType,
  contactId: number,
  incoming: ParsedContact,
  families: SyncField[]
): void {
  const set = (assignments: Record<string, unknown>) => {
    const columns = Object.keys(assignments);
    db.prepare(`UPDATE contacts SET ${columns.map(c => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...columns.map(c => assignments[c] ?? null), contactId);
  };
  const clear = (table: string) => db.prepare(`DELETE FROM ${table} WHERE contact_id = ?`).run(contactId);
  const clearActive = (table: string) =>
    db.prepare(`DELETE FROM ${table} WHERE contact_id = ? AND detail_archived_at IS NULL`).run(contactId);
  /** Incoming entries whose key no archived row of the contact already holds. */
  const notArchived = <E>(table: string, keySql: string, entries: E[], keyOf: (entry: E) => string): E[] => {
    const archived = existingKeys(db, `SELECT ${keySql} AS key FROM ${table} WHERE contact_id = ? AND detail_archived_at IS NOT NULL`, contactId);
    return archived.size === 0 ? entries : entries.filter(entry => !archived.has(keyOf(entry)));
  };

  for (const family of families) {
    switch (family) {
      case 'name':
        set({
          first_name: incoming.firstName, last_name: incoming.lastName, middle_name: incoming.middleName,
          name_prefix: incoming.namePrefix, name_suffix: incoming.nameSuffix,
          display_name: incoming.displayName || [incoming.firstName, incoming.lastName].filter(Boolean).join(' ') || 'Unknown'
        });
        break;
      case 'nickname': set({ nickname: incoming.nickname }); break;
      case 'org': set({ company: incoming.company, title: incoming.title, department: incoming.department }); break;
      case 'notes': set({ notes: incoming.notes }); break;
      case 'birthday': set({ birthday: incoming.birthday }); break;
      case 'gender': set({ gender: incoming.gender }); break;
      case 'isCompany': set({ is_company: incoming.isCompany ? 1 : 0 }); break;
      case 'emails':
        clearActive('contact_emails');
        for (const e of notArchived('contact_emails', 'LOWER(email)', incoming.emails, e => lower(e.email))) {
          insertEmailRow(stmts, contactId, e);
        }
        break;
      case 'phones':
        clearActive('contact_phones');
        for (const p of notArchived('contact_phones', 'phone', incoming.phones, p => p.phone)) {
          insertPhoneRow(stmts, contactId, p);
        }
        break;
      case 'addresses': {
        const geo = new Map((db.prepare(`
          SELECT LOWER(COALESCE(street, '')) || '|' || LOWER(COALESCE(city, '')) || '|' || LOWER(COALESCE(postal_code, '')) AS key,
                 latitude, longitude
          FROM contact_addresses WHERE contact_id = ? AND latitude IS NOT NULL
        `).all(contactId) as Array<{ key: string; latitude: number; longitude: number }>).map(r => [r.key, r]));
        clearActive('contact_addresses');
        const incomingAddresses = notArchived('contact_addresses', ADDRESS_KEY_SQL, incoming.addresses,
          a => `${lower(a.street)}|${lower(a.city)}|${lower(a.postalCode)}`);
        for (const a of incomingAddresses) {
          const kept = a.latitude === null ? geo.get(`${lower(a.street)}|${lower(a.city)}|${lower(a.postalCode)}`) : undefined;
          insertAddressRow(stmts, contactId, kept ? { ...a, latitude: kept.latitude, longitude: kept.longitude } : a);
        }
        break;
      }
      case 'urls':
        clearActive('contact_urls');
        for (const u of notArchived('contact_urls', 'LOWER(url)', incoming.urls, u => lower(u.url))) {
          insertUrlRow(stmts, contactId, u);
        }
        break;
      case 'socials':
        clearActive('contact_social_profiles');
        for (const sp of notArchived('contact_social_profiles', `LOWER(platform) || ':' || LOWER(username)`, incoming.socialProfiles,
          sp => `${lower(sp.platform)}:${lower(socialUsername(sp))}`)) {
          insertSocialProfileRow(stmts, contactId, sp);
        }
        break;
      case 'ims':
        clearActive('contact_instant_messages');
        for (const im of notArchived('contact_instant_messages', `LOWER(service) || ':' || LOWER(handle)`, incoming.instantMessages,
          im => `${lower(im.service)}:${lower(im.handle)}`)) {
          insertInstantMessageRow(stmts, contactId, im);
        }
        break;
      case 'related': {
        const links = new Map((db.prepare(`
          SELECT LOWER(name) AS name, related_contact_id FROM contact_related_people
          WHERE contact_id = ? AND related_contact_id IS NOT NULL
        `).all(contactId) as Array<{ name: string; related_contact_id: number }>).map(r => [r.name, r.related_contact_id]));
        clear('contact_related_people');
        for (const rp of incoming.relatedPeople) {
          insertRelatedPersonRow(stmts, contactId, rp);
          const linked = links.get(lower(rp.name));
          if (linked) {
            db.prepare(`UPDATE contact_related_people SET related_contact_id = ? WHERE id = last_insert_rowid()`).run(linked);
          }
        }
        break;
      }
      case 'dates':
        clear('contact_dates');
        insertContactDates(db, contactId, incoming.dates ?? []);
        break;
      case 'categories':
        clear('contact_categories');
        for (const c of [...new Set(incoming.categories)]) stmts.insertCategory.run(contactId, c);
        break;
    }
  }

  normalizeArchivedPrimary(db, contactId);
  db.prepare('UPDATE contacts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(contactId);
  rebuildContactSearch(db, contactId);
}
