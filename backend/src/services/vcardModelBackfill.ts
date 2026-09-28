import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import { parseSingleVcard, type ParsedContact } from './vcardParser.js';
import { insertContactDates, insertVcardProperties, paramsJson } from './vcardModelStore.js';
import { rebuildContactSearch } from './database.js';
import { hasRawVcardColumn } from './rawVcardRetirement.js';

/**
 * One-time repair for contacts imported before the database modelled every
 * vCard property. Their middle names, nicknames, labels, extra TYPEs, custom
 * dates and client metadata existed only inside raw_vcard; this re-parses the
 * stored card and fills what is missing, after which export no longer needs
 * raw_vcard at all.
 *
 * It only fills gaps and never overwrites a value the user has since set.
 * Name parts are taken only while first/last name still match the card, and a
 * department only while the company does, since those belong to the name or
 * company they were written with. Existing email/phone/address rows are
 * matched by value, so a row the user removed stays removed.
 *
 * Also clears the `pref` marker that older imports stored as a TYPE.
 */
export function backfillVcardModel(db: DatabaseType): void {
  const settings = db.prepare(
    'SELECT vcard_model_backfilled_at FROM user_settings WHERE id = 1'
  ).get() as { vcard_model_backfilled_at: string | null } | undefined;
  if (settings?.vcard_model_backfilled_at) return;

  // A database created after raw_vcard was retired has nothing to recover
  const contacts = (hasRawVcardColumn(db) ? db.prepare(`
    SELECT id, first_name, last_name, company, raw_vcard FROM contacts
    WHERE raw_vcard IS NOT NULL AND raw_vcard != ''
  `).all() : []) as Array<{
    id: number;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    raw_vcard: string;
  }>;

  const updateContact = db.prepare(`
    UPDATE contacts SET
      middle_name = COALESCE(middle_name, ?),
      name_prefix = COALESCE(name_prefix, ?),
      name_suffix = COALESCE(name_suffix, ?),
      nickname = COALESCE(nickname, ?),
      gender = COALESCE(gender, ?),
      department = COALESCE(department, ?),
      is_company = CASE WHEN ? = 1 THEN 1 ELSE is_company END,
      icloud_uid = COALESCE(icloud_uid, ?)
    WHERE id = ?
  `);

  const emailRows = db.prepare('SELECT id, email AS value FROM contact_emails WHERE contact_id = ?');
  const phoneRows = db.prepare('SELECT id, phone AS value FROM contact_phones WHERE contact_id = ?');
  const addressRows = db.prepare(`
    SELECT id, street, city, postal_code FROM contact_addresses WHERE contact_id = ?
  `);
  const urlRows = db.prepare('SELECT id, url AS value FROM contact_urls WHERE contact_id = ? AND label IS NULL');

  // A `pref` type is replaced by the card's real type; any other type is the user's
  const typedUpdate = (table: string) => db.prepare(`
    UPDATE ${table} SET
      type = CASE WHEN type IS NULL OR type = 'pref' THEN ? ELSE type END,
      extra_types = COALESCE(extra_types, ?),
      label = COALESCE(label, ?)
    WHERE id = ?
  `);
  const updateEmail = typedUpdate('contact_emails');
  const updatePhone = typedUpdate('contact_phones');
  const updateAddress = db.prepare(`
    UPDATE contact_addresses SET
      type = CASE WHEN type IS NULL OR type = 'pref' THEN ? ELSE type END,
      extra_types = COALESCE(extra_types, ?),
      label = COALESCE(label, ?),
      po_box = COALESCE(po_box, ?),
      extended = COALESCE(extended, ?),
      sublocality = COALESCE(sublocality, ?),
      subadministrative_area = COALESCE(subadministrative_area, ?),
      country_code = COALESCE(country_code, ?)
    WHERE id = ?
  `);
  const updateUrlLabel = db.prepare('UPDATE contact_urls SET label = ? WHERE id = ?');

  const hasDates = db.prepare('SELECT 1 FROM contact_dates WHERE contact_id = ? LIMIT 1');
  const hasProperties = db.prepare('SELECT 1 FROM contact_vcard_properties WHERE contact_id = ? LIMIT 1');

  db.transaction(() => {
    for (const contact of contacts) {
      let parsed: ParsedContact | null;
      try {
        parsed = parseSingleVcard(contact.raw_vcard);
      } catch {
        continue; // an unparseable card has nothing to recover
      }
      if (!parsed) continue;

      const sameName = same(parsed.firstName, contact.first_name) && same(parsed.lastName, contact.last_name);
      const sameCompany = same(parsed.company, contact.company);
      updateContact.run(
        sameName ? parsed.middleName ?? null : null,
        sameName ? parsed.namePrefix ?? null : null,
        sameName ? parsed.nameSuffix ?? null : null,
        parsed.nickname ?? null,
        parsed.gender ?? null,
        sameCompany ? parsed.department ?? null : null,
        parsed.isCompany ? 1 : 0,
        parsed.uid,
        contact.id
      );

      const emails = emailRows.all(contact.id) as Array<{ id: number; value: string }>;
      for (const email of parsed.emails) {
        const row = takeMatch(emails, r => r.value.toLowerCase() === email.email.toLowerCase());
        if (row) updateEmail.run(email.type, email.extraTypes ?? null, email.label ?? null, row.id);
      }

      const phones = phoneRows.all(contact.id) as Array<{ id: number; value: string }>;
      for (const phone of parsed.phones) {
        const row = takeMatch(phones, r => r.value === phone.phone);
        if (row) updatePhone.run(phone.type, phone.extraTypes ?? null, phone.label ?? null, row.id);
      }

      const addresses = addressRows.all(contact.id) as Array<{
        id: number;
        street: string | null;
        city: string | null;
        postal_code: string | null;
      }>;
      for (const address of parsed.addresses) {
        const row = takeMatch(addresses, r =>
          same(r.street, address.street) && same(r.city, address.city) && same(r.postal_code, address.postalCode)
        );
        if (row) {
          updateAddress.run(
            address.type, address.extraTypes ?? null, address.label ?? null,
            address.poBox ?? null, address.extended ?? null, address.sublocality ?? null,
            address.subadministrativeArea ?? null, address.countryCode ?? null, row.id
          );
        }
      }

      const urls = urlRows.all(contact.id) as Array<{ id: number; value: string }>;
      for (const url of parsed.urls) {
        if (!url.label) continue;
        const row = takeMatch(urls, r => r.value === url.url);
        if (row) updateUrlLabel.run(url.label, row.id);
      }

      if (!hasDates.get(contact.id)) insertContactDates(db, contact.id, parsed.dates ?? []);
      if (!hasProperties.get(contact.id)) insertVcardProperties(db, contact.id, parsed.extraProperties ?? []);

      // Nickname, middle name and department are searchable
      if (parsed.nickname || parsed.middleName || parsed.department) {
        rebuildContactSearch(db, contact.id);
      }
    }

    for (const table of ['contact_emails', 'contact_phones', 'contact_addresses']) {
      db.prepare(`UPDATE ${table} SET type = NULL WHERE type = 'pref'`).run();
    }

    db.prepare(`UPDATE user_settings SET vcard_model_backfilled_at = datetime('now') WHERE id = 1`).run();
  })();
}

/**
 * Second one-time repair, for what the first left in raw_vcard:
 * - leftover vCard parameters (X-APPLE-OMIT-YEAR on a birthday, TYPE=pref on a
 *   URL, X-USERID on a social profile, ...) onto the rows they belong to;
 * - categories after the first, which imports before 2026-09-27 dropped. Only
 *   when the contact holds the card's first category and none of the others —
 *   the signature of that bug. Had any of the others been imported, a missing
 *   one was removed by the user and stays removed;
 * - URL labels on rows that hold an empty label rather than NULL;
 * - a stray backslash before `;` or `,` in title and notes, left by ical.js,
 *   only where removing it gives exactly the card's value.
 */
export function backfillVcardModelV2(db: DatabaseType): void {
  const settings = db.prepare(
    'SELECT vcard_model_v2_backfilled_at FROM user_settings WHERE id = 1'
  ).get() as { vcard_model_v2_backfilled_at: string | null } | undefined;
  if (settings?.vcard_model_v2_backfilled_at) return;

  const contacts = hasRawVcardColumn(db)
    ? db.prepare(`
        SELECT id, title, notes, raw_vcard FROM contacts
        WHERE raw_vcard IS NOT NULL AND raw_vcard != ''
      `).all() as Array<{ id: number; title: string | null; notes: string | null; raw_vcard: string }>
    : [];

  const setContact = db.prepare(`
    UPDATE contacts SET vcard_params = COALESCE(vcard_params, ?), title = ?, notes = ? WHERE id = ?
  `);
  const categoryRows = db.prepare('SELECT category FROM contact_categories WHERE contact_id = ? ORDER BY id');
  const insertCategory = db.prepare('INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)');

  const emptyLabelUrls = db.prepare(`SELECT id, url FROM contact_urls WHERE contact_id = ? AND (label IS NULL OR label = '')`);
  const setUrlLabel = db.prepare('UPDATE contact_urls SET label = ? WHERE id = ?');

  const lower = (value: string | null | undefined) => (value ?? '').toLowerCase();

  type Row = Record<string, string | null> & { id: number };
  /**
   * Row matchers per table: the key that identifies a row, and optionally a
   * looser fallback for rows edited since import. Keys are computed here, not
   * in SQL, because SQLite's LOWER() folds ASCII only ("Ägypten").
   */
  const rowParams = (table: string, columns: string, key: (row: Row) => string, fallback = key) => ({
    rows: db.prepare(`SELECT id, ${columns} FROM ${table} WHERE contact_id = ? AND params IS NULL`),
    update: db.prepare(`UPDATE ${table} SET params = ? WHERE id = ?`),
    key,
    fallback
  });
  const tables = {
    emails: rowParams('contact_emails', 'email', r => lower(r.email)),
    phones: rowParams('contact_phones', 'phone', r => r.phone ?? ''),
    // An address cleanup may have normalised the postcode since import
    addresses: rowParams('contact_addresses', 'street, city, postal_code',
      r => `${lower(r.street)}|${lower(r.city)}|${lower(r.postal_code)}`,
      r => `${lower(r.street)}|${lower(r.city)}`),
    urls: rowParams('contact_urls', 'url', r => r.url ?? ''),
    ims: rowParams('contact_instant_messages', 'service, handle', r => `${lower(r.service)}|${r.handle}`),
    socials: rowParams('contact_social_profiles', 'profile_url', r => r.profile_url ?? ''),
    related: rowParams('contact_related_people', 'name', r => lower(r.name)),
    dates: rowParams('contact_dates', 'date', r => r.date ?? '')
  };
  const fill = (
    matcher: { rows: Statement<unknown[]>; update: Statement<unknown[]>; key: (row: Row) => string; fallback: (row: Row) => string },
    contactId: number,
    entries: Array<{ key: string; fallbackKey?: string; params: Record<string, string[]> | null | undefined }>
  ) => {
    const rows = (matcher.rows.all(contactId) as Row[])
      .map(row => ({ id: row.id, entry_key: matcher.key(row), fallback_key: matcher.fallback(row) }));
    const withParams = entries.filter(entry => entry.params);
    const unmatched = withParams.filter(entry => {
      const row = takeMatch(rows, r => r.entry_key === entry.key);
      if (row) matcher.update.run(paramsJson(entry.params), row.id);
      return !row;
    });
    for (const entry of unmatched) {
      const row = takeMatch(rows, r => r.fallback_key === (entry.fallbackKey ?? entry.key));
      if (row) matcher.update.run(paramsJson(entry.params), row.id);
    }
  };

  db.transaction(() => {
    for (const contact of contacts) {
      let parsed: ParsedContact | null;
      try {
        parsed = parseSingleVcard(contact.raw_vcard);
      } catch {
        continue;
      }
      if (!parsed) continue;

      const title = unstrayed(contact.title, parsed.title);
      const notes = unstrayed(contact.notes, parsed.notes);
      setContact.run(paramsJson(parsed.vcardParams), title, notes, contact.id);

      const existing = new Set((categoryRows.all(contact.id) as Array<{ category: string }>).map(r => lower(r.category)));
      const [first, ...rest] = parsed.categories;
      const cutOff = first !== undefined && rest.length > 0 &&
        existing.has(lower(first)) && rest.every(category => !existing.has(lower(category)));
      if (cutOff) {
        for (const category of rest) insertCategory.run(contact.id, category);
      }

      const urlsWithoutLabel = emptyLabelUrls.all(contact.id) as Array<{ id: number; url: string }>;
      for (const url of parsed.urls) {
        if (!url.label) continue;
        const row = takeMatch(urlsWithoutLabel, r => r.url === url.url);
        if (row) setUrlLabel.run(url.label, row.id);
      }

      fill(tables.emails, contact.id, parsed.emails.map(e => ({ key: lower(e.email), params: e.params })));
      fill(tables.phones, contact.id, parsed.phones.map(p => ({ key: p.phone, params: p.params })));
      fill(tables.addresses, contact.id, parsed.addresses.map(a => ({
        key: `${lower(a.street)}|${lower(a.city)}|${lower(a.postalCode)}`,
        fallbackKey: `${lower(a.street)}|${lower(a.city)}`,
        params: a.params
      })));
      fill(tables.urls, contact.id, parsed.urls.map(u => ({ key: u.url, params: u.params })));
      fill(tables.ims, contact.id, parsed.instantMessages.map(im => ({ key: `${lower(im.service)}|${im.handle}`, params: im.params })));
      fill(tables.socials, contact.id, parsed.socialProfiles.map(sp => ({ key: sp.url, params: sp.params })));
      fill(tables.related, contact.id, parsed.relatedPeople.map(rp => ({ key: lower(rp.name), params: rp.params })));
      fill(tables.dates, contact.id, (parsed.dates ?? []).map(d => ({ key: d.date, params: d.params })));

      if (cutOff || title !== contact.title || notes !== contact.notes) {
        rebuildContactSearch(db, contact.id);
      }
    }

    db.prepare(`UPDATE user_settings SET vcard_model_v2_backfilled_at = datetime('now') WHERE id = 1`).run();
  })();
}

/**
 * The stored value without the stray backslash ical.js left before `;` and
 * `,`, when that is exactly the card's value; otherwise the stored value.
 */
function unstrayed(stored: string | null, fromCard: string | null): string | null {
  if (!stored || !fromCard || stored === fromCard) return stored;
  const cleaned = stored.replace(/\\([;,])/g, '$1');
  return cleaned === fromCard ? cleaned : stored;
}

/** Equality of two optional text values, ignoring case and surrounding whitespace. */
function same(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

/** Removes and returns the first row matching, so each row pairs with one card entry. */
function takeMatch<T>(rows: T[], matches: (row: T) => boolean): T | undefined {
  const index = rows.findIndex(matches);
  return index === -1 ? undefined : rows.splice(index, 1)[0];
}
