import type { Database as DatabaseType } from 'better-sqlite3';

/**
 * Person, company or generic.
 *
 * - `contacts.is_company` is Apple's "Show as Company" flag (X-ABShowAs:COMPANY).
 *   It syncs with iCloud; Google has no such flag.
 * - `contacts.kind` is what the user picked in Yello (person, company or
 *   generic), NULL until they pick. Generic (Front Desk, Support line, Taxi)
 *   is Yello-only: it syncs as a normal card.
 * - A contact nobody picked, with a company name but no first or last name,
 *   counts as a company (auto-detected). Auto-detection never writes
 *   `is_company`, so nothing reaches iCloud until the user picks Company.
 */

export const CONTACT_KINDS = ['person', 'company', 'generic'] as const;
export type ContactKind = typeof CONTACT_KINDS[number];

/** SQL for contact `c`'s kind: 'person', 'company' or 'generic'. Needs the alias `c`. */
export const EFFECTIVE_KIND_SQL = `(CASE
  WHEN c.is_company = 1 THEN 'company'
  WHEN c.kind IN ('person', 'generic') THEN c.kind
  WHEN c.kind IS NULL
    AND TRIM(COALESCE(c.first_name, '')) = ''
    AND TRIM(COALESCE(c.last_name, '')) = ''
    AND TRIM(COALESCE(c.company, '')) <> '' THEN 'company'
  ELSE 'person'
END)`;

/** Column values for a picked kind. Only Company sets the synced flag. */
export function kindColumns(kind: ContactKind): { is_company: number; kind: ContactKind } {
  return { is_company: kind === 'company' ? 1 : 0, kind };
}

/** Records the user's pick. Bumps updated_at so the change syncs. */
export function setContactKind(db: DatabaseType, contactId: number, kind: ContactKind): boolean {
  const cols = kindColumns(kind);
  const result = db.prepare(`
    UPDATE contacts SET is_company = ?, kind = ?, updated_at = datetime('now') WHERE id = ?
  `).run(cols.is_company, cols.kind, contactId);
  return result.changes > 0;
}
