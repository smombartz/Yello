import type { Database as DatabaseType } from 'better-sqlite3';
import { parseGroupedRelatedNames } from './vcardParser.js';
import { hasRawVcardColumn } from './rawVcardRetirement.js';

/**
 * One-time repair for contacts imported before grouped X-ABRELATEDNAMES lines
 * (`item1.X-ABRELATEDNAMES` + `item1.X-ABLabel`, the form Apple writes) were
 * read. Those related people were stored only inside raw_vcard, which the
 * export no longer replays, so they are copied into contact_related_people.
 *
 * Only grouped lines are recovered: ungrouped ones were always imported, so a
 * missing row for one of those means the user removed it. The marker in
 * user_settings keeps this from running again and undoing later removals.
 */
export function backfillGroupedRelatedNames(db: DatabaseType): void {
  const settings = db.prepare(
    'SELECT related_names_backfilled_at FROM user_settings WHERE id = 1'
  ).get() as { related_names_backfilled_at: string | null } | undefined;
  if (settings?.related_names_backfilled_at) return;

  // A database created after raw_vcard was retired has nothing to recover
  const contacts = hasRawVcardColumn(db)
    ? db.prepare(`
        SELECT id, raw_vcard FROM contacts WHERE raw_vcard LIKE '%.X-ABRELATEDNAMES%'
      `).all() as Array<{ id: number; raw_vcard: string }>
    : [];

  const existingNames = db.prepare('SELECT name FROM contact_related_people WHERE contact_id = ?');
  const insert = db.prepare(
    'INSERT INTO contact_related_people (contact_id, name, relationship) VALUES (?, ?, ?)'
  );

  db.transaction(() => {
    for (const contact of contacts) {
      const known = new Set(
        (existingNames.all(contact.id) as Array<{ name: string }>).map(r => r.name.trim().toLowerCase())
      );
      for (const person of parseGroupedRelatedNames(contact.raw_vcard)) {
        const key = person.name.toLowerCase();
        if (known.has(key)) continue;
        insert.run(contact.id, person.name, person.relationship);
        known.add(key);
      }
    }
    db.prepare(`UPDATE user_settings SET related_names_backfilled_at = datetime('now') WHERE id = 1`).run();
  })();
}
