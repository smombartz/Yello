import fs from 'fs';
import path from 'path';
import type { Database as DatabaseType } from 'better-sqlite3';
import { getUserPhotosPath } from './userDatabase.js';
import { generateVcard, type ContactForVcard } from './vcardGenerator.js';
import { LINKEDIN_ENRICHMENT_COLUMNS } from './linkedinEnrichmentColumns.js';
import { loadVcardProperties, parseParamsJson } from './vcardModelStore.js';

interface ContactRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  company: string | null;
  title: string | null;
  notes: string | null;
  birthday: string | null;
  photo_hash: string | null;
  icloud_uid: string | null;
  middle_name: string | null;
  name_prefix: string | null;
  name_suffix: string | null;
  nickname: string | null;
  gender: string | null;
  department: string | null;
  is_company: number | null;
  vcard_params: string | null;
}

interface TypedRow {
  type: string | null;
  extra_types: string | null;
  label: string | null;
  params: string | null;
}

/** Reads a user's medium-size contact photo as base64, or null when missing. */
export function contactPhotoReader(userId: number): (photoHash: string) => string | null {
  return photoHash => {
    try {
      const photoPath = path.join(getUserPhotosPath(userId), 'medium', photoHash.slice(0, 2), `${photoHash}.jpg`);
      return fs.readFileSync(photoPath).toString('base64');
    } catch {
      return null;
    }
  };
}

/**
 * Exports every non-archived contact (or, with `archived`, every archived one)
 * as one VCF document, built from the database. `readPhotoBase64` returns the
 * JPEG for a photo hash, or null when the file is missing, in which case the
 * card is written without a photo.
 */
export function exportContactsAsVcf(
  db: DatabaseType,
  readPhotoBase64: (photoHash: string) => string | null,
  options: { archived?: boolean } = {}
): string {
  const contacts = db.prepare(`
    SELECT id, first_name, last_name, display_name, company, title, notes, birthday,
           photo_hash, icloud_uid, middle_name, name_prefix, name_suffix, nickname,
           gender, department, is_company, vcard_params
    FROM contacts
    WHERE archived_at IS ${options.archived ? 'NOT NULL' : 'NULL'}
    ORDER BY ${options.archived ? 'archived_at DESC, id' : 'id'}
  `).all() as ContactRow[];

  const emails = db.prepare(`
    SELECT email, type, extra_types, label, params, is_primary FROM contact_emails WHERE contact_id = ? ORDER BY id
  `);
  const phones = db.prepare(`
    SELECT phone, phone_display, type, extra_types, label, params, is_primary FROM contact_phones WHERE contact_id = ? ORDER BY id
  `);
  const addresses = db.prepare(`
    SELECT street, city, state, postal_code, country, type, extra_types, label, params,
           po_box, extended, sublocality, subadministrative_area, country_code, latitude, longitude
    FROM contact_addresses WHERE contact_id = ? ORDER BY id
  `);
  const socialProfiles = db.prepare(`
    SELECT platform, username, profile_url, params FROM contact_social_profiles WHERE contact_id = ? ORDER BY id
  `);
  const categories = db.prepare(`
    SELECT category FROM contact_categories WHERE contact_id = ? ORDER BY id
  `);
  const urls = db.prepare(`
    SELECT url, label, type, params FROM contact_urls WHERE contact_id = ? ORDER BY id
  `);
  const instantMessages = db.prepare(`
    SELECT service, handle, type, params FROM contact_instant_messages WHERE contact_id = ? ORDER BY id
  `);
  const relatedPeople = db.prepare(`
    SELECT name, relationship, params FROM contact_related_people WHERE contact_id = ? ORDER BY id
  `);
  const dates = db.prepare(`
    SELECT date, label, params FROM contact_dates WHERE contact_id = ? ORDER BY id
  `);
  const enrichment = db.prepare(`
    SELECT ${LINKEDIN_ENRICHMENT_COLUMNS.join(', ')} FROM linkedin_enrichment WHERE contact_id = ?
  `);

  const typed = (row: TypedRow) => ({
    type: row.type,
    extraTypes: row.extra_types,
    label: row.label,
    params: parseParamsJson(row.params)
  });
  /** Parses the `params` column of each row in place of the JSON text. */
  const withParams = <R extends { params: string | null }>(rows: R[]) =>
    rows.map(row => ({ ...row, params: parseParamsJson(row.params) }));

  function buildContactForVcard(contact: ContactRow): ContactForVcard {
    const photoBase64 = contact.photo_hash ? readPhotoBase64(contact.photo_hash) : null;

    // Only the columns that hold something travel; the rest import as NULL anyway.
    const enrichmentRow = enrichment.get(contact.id) as Record<string, unknown> | undefined;
    const linkedinEnrichment = enrichmentRow
      ? Object.fromEntries(Object.entries(enrichmentRow).filter(([, value]) => value !== null))
      : null;

    return {
      firstName: contact.first_name,
      lastName: contact.last_name,
      displayName: contact.display_name,
      company: contact.company,
      title: contact.title,
      notes: contact.notes,
      birthday: contact.birthday,
      middleName: contact.middle_name,
      namePrefix: contact.name_prefix,
      nameSuffix: contact.name_suffix,
      nickname: contact.nickname,
      gender: contact.gender,
      department: contact.department,
      isCompany: contact.is_company === 1,
      uid: contact.icloud_uid,
      emails: (emails.all(contact.id) as Array<TypedRow & { email: string; is_primary: number }>)
        .map(e => ({ email: e.email, ...typed(e), isPrimary: e.is_primary === 1 })),
      phones: (phones.all(contact.id) as Array<TypedRow & { phone: string; phone_display: string; is_primary: number }>)
        .map(p => ({ phone: p.phone, phoneDisplay: p.phone_display, ...typed(p), isPrimary: p.is_primary === 1 })),
      addresses: (addresses.all(contact.id) as Array<TypedRow & {
        street: string | null;
        city: string | null;
        state: string | null;
        postal_code: string | null;
        country: string | null;
        po_box: string | null;
        extended: string | null;
        sublocality: string | null;
        subadministrative_area: string | null;
        country_code: string | null;
        latitude: number | null;
        longitude: number | null;
      }>).map(a => ({
        street: a.street,
        city: a.city,
        state: a.state,
        postalCode: a.postal_code,
        country: a.country,
        ...typed(a),
        poBox: a.po_box,
        extended: a.extended,
        sublocality: a.sublocality,
        subadministrativeArea: a.subadministrative_area,
        countryCode: a.country_code,
        latitude: a.latitude,
        longitude: a.longitude
      })),
      socialProfiles: (socialProfiles.all(contact.id) as Array<{ platform: string; username: string | null; profile_url: string | null; params: string | null }>)
        .map(s => ({ platform: s.platform, username: s.username, profileUrl: s.profile_url, params: parseParamsJson(s.params) })),
      categories: (categories.all(contact.id) as Array<{ category: string }>).map(c => c.category),
      urls: withParams(urls.all(contact.id) as Array<{ url: string; label: string | null; type: string | null; params: string | null }>),
      instantMessages: withParams(instantMessages.all(contact.id) as Array<{ service: string; handle: string; type: string | null; params: string | null }>),
      relatedPeople: withParams(relatedPeople.all(contact.id) as Array<{ name: string; relationship: string | null; params: string | null }>),
      dates: withParams(dates.all(contact.id) as Array<{ date: string; label: string | null; params: string | null }>),
      vcardParams: parseParamsJson<Record<string, Record<string, string[]>>>(contact.vcard_params),
      extraProperties: loadVcardProperties(db, contact.id),
      linkedinEnrichment,
      ...(photoBase64 ? { photoBase64 } : {})
    };
  }

  return contacts.map(contact => generateVcard(buildContactForVcard(contact))).join('\r\n');
}
