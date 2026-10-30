import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { Database as DatabaseType } from 'better-sqlite3';
import { getUserDatabase } from '../services/userDatabase.js';


interface OverviewStats {
  totalContacts: number;
  totalCountries: number;
  totalCities: number;
  contactsWithPhotos: number;
  contactsWithBirthdays: number;
}

interface UpcomingBirthday {
  id: number;
  displayName: string;
  birthday: string;
  daysUntil: number;
  photoHash: string | null;
}

/** added/imported/synced come from `contacts.created_via`; see CREATION_KIND_SQL. */
type RecentKind = 'added' | 'imported' | 'synced' | 'updated' | 'archived';

interface RecentChange {
  id: number;
  displayName: string;
  photoHash: string | null;
  kind: RecentKind;
  /** When the change happened, ISO UTC with `Z` */
  at: string;
  createdVia: string | null;
}

interface GeographyStats {
  topCountries: Array<{ country: string; count: number }>;
  topCities: Array<{ city: string; country: string; count: number }>;
}

interface DashboardResponse {
  overview: OverviewStats;
  upcomingBirthdays: UpcomingBirthday[];
  recent: RecentChange[];
  /** Contacts in the Recent window, including those past the card's limit */
  recentTotal: number;
  geography: GeographyStats;
}

function getOverviewStats(db: DatabaseType): OverviewStats {

  const totalContacts = db.prepare(
    'SELECT COUNT(*) as count FROM contacts WHERE archived_at IS NULL'
  ).get() as { count: number };

  const totalCountries = db.prepare(
    `SELECT COUNT(DISTINCT country) as count
     FROM contact_addresses
     WHERE country IS NOT NULL AND country != '' AND detail_archived_at IS NULL`
  ).get() as { count: number };

  const totalCities = db.prepare(
    `SELECT COUNT(DISTINCT city) as count
     FROM contact_addresses
     WHERE city IS NOT NULL AND city != '' AND detail_archived_at IS NULL`
  ).get() as { count: number };

  const contactsWithPhotos = db.prepare(
    'SELECT COUNT(*) as count FROM contacts WHERE photo_hash IS NOT NULL AND archived_at IS NULL'
  ).get() as { count: number };

  const contactsWithBirthdays = db.prepare(
    "SELECT COUNT(*) as count FROM contacts WHERE birthday IS NOT NULL AND birthday != '' AND archived_at IS NULL"
  ).get() as { count: number };

  return {
    totalContacts: totalContacts.count,
    totalCountries: totalCountries.count,
    totalCities: totalCities.count,
    contactsWithPhotos: contactsWithPhotos.count,
    contactsWithBirthdays: contactsWithBirthdays.count,
  };
}

/** The dashboard card lists birthdays from today up to this many days ahead. */
export const UPCOMING_BIRTHDAY_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Month and day of a stored birthday, in any format we store or import:
 * `--MM-DD` (no year), `YYYY-MM-DD`, `YYYYMMDD`, or `MM-DD`.
 * Returns null for anything unparseable.
 */
export function parseBirthdayMonthDay(birthday: string): { month: number; day: number } | null {
  const value = birthday.trim();
  const match =
    value.match(/^--(\d{1,2})-?(\d{1,2})$/) ??
    value.match(/^\d{4}-(\d{1,2})-(\d{1,2})/) ??
    value.match(/^\d{4}(\d{2})(\d{2})$/) ??
    value.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

/**
 * Whole days from `today` until the next occurrence of month/day; 0 when it is today.
 * Counted on calendar dates (UTC day numbers) so the time of day and DST never shift it.
 * A Feb 29 birthday falls on Mar 1 in non-leap years.
 */
export function daysUntilBirthday(
  month: number,
  day: number,
  today: { year: number; month: number; day: number }
): number {
  const start = Date.UTC(today.year, today.month - 1, today.day);
  let next = Date.UTC(today.year, month - 1, day);
  if (next < start) next = Date.UTC(today.year + 1, month - 1, day);
  return Math.round((next - start) / MS_PER_DAY);
}

/**
 * The caller's local date from `?today=YYYY-MM-DD`, so "today" matches the user's calendar
 * rather than the server's (UTC). Falls back to the server's date.
 */
function resolveToday(param: string | undefined): { year: number; month: number; day: number } {
  const match = param?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year, month, day };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** Every non-archived contact with a parseable birthday, soonest first. */
export function getAllBirthdays(
  db: DatabaseType,
  today: { year: number; month: number; day: number }
): UpcomingBirthday[] {
  const contacts = db.prepare(`
    SELECT id, display_name, birthday, photo_hash
    FROM contacts
    WHERE birthday IS NOT NULL AND birthday != '' AND archived_at IS NULL
  `).all() as Array<{ id: number; display_name: string; birthday: string; photo_hash: string | null }>;

  const birthdays: UpcomingBirthday[] = [];
  for (const contact of contacts) {
    const parsed = parseBirthdayMonthDay(contact.birthday);
    if (!parsed) continue;
    birthdays.push({
      id: contact.id,
      displayName: contact.display_name,
      birthday: contact.birthday,
      daysUntil: daysUntilBirthday(parsed.month, parsed.day, today),
      photoHash: contact.photo_hash,
    });
  }

  birthdays.sort((a, b) =>
    a.daysUntil - b.daysUntil || a.displayName.localeCompare(b.displayName)
  );
  return birthdays;
}

/** The dashboard's Recent card covers this many days, and shows at most this many contacts. */
export const DASHBOARD_RECENT_DAYS = 7;
const DASHBOARD_RECENT_LIMIT = 12;
/** The Recent page shows at most this many contacts per kind. */
const RECENT_PAGE_LIMIT_PER_KIND = 300;
/**
 * An edit counts as an update only this long after creation (in days), so the writes an
 * import makes right after inserting (photos, search index) don't read as edits.
 */
const UPDATE_GRACE_DAYS = 5 / (24 * 60);

const IMPORT_ORIGINS = ['vcf_import', 'icloud_import', 'google_import', 'linkedin_import'];
const SYNC_ORIGINS = ['icloud_sync', 'google_sync'];

/** SQL for the kind of a contact's creation, from `created_via` (NULL → added). */
const CREATION_KIND_SQL = `CASE
  WHEN created_via IN (${IMPORT_ORIGINS.map(o => `'${o}'`).join(', ')}) THEN 'imported'
  WHEN created_via IN (${SYNC_ORIGINS.map(o => `'${o}'`).join(', ')}) THEN 'synced'
  ELSE 'added' END`;

/** SQL turning a stored UTC timestamp (`YYYY-MM-DD HH:MM:SS` or ISO) into ISO with `Z`. */
const isoUtc = (column: string) => `strftime('%Y-%m-%dT%H:%M:%SZ', ${column})`;

type RecentRow = {
  id: number;
  display_name: string;
  photo_hash: string | null;
  created_via: string | null;
  kind: RecentKind;
  at: string;
};

function toRecentChange(row: RecentRow): RecentChange {
  return {
    id: row.id,
    displayName: row.display_name,
    photoHash: row.photo_hash,
    kind: row.kind,
    at: row.at,
    createdVia: row.created_via,
  };
}

/**
 * Dashboard Recent card: active contacts added, imported, synced or edited in the last
 * `days` days, newest first, one entry per contact (its latest change).
 */
export function getDashboardRecent(
  db: DatabaseType,
  days = DASHBOARD_RECENT_DAYS,
  limit = DASHBOARD_RECENT_LIMIT
): { recent: RecentChange[]; total: number } {
  const since = `-${days} days`;
  const where = `
    archived_at IS NULL AND (
      julianday(created_at) >= julianday('now', @since) OR
      (julianday(updated_at) >= julianday('now', @since)
        AND julianday(updated_at) - julianday(created_at) > @grace)
    )`;
  const rows = db.prepare(`
    SELECT id, display_name, photo_hash, created_via,
      CASE WHEN julianday(updated_at) - julianday(created_at) > @grace THEN 'updated'
           ELSE ${CREATION_KIND_SQL} END AS kind,
      ${isoUtc('CASE WHEN julianday(updated_at) - julianday(created_at) > @grace THEN updated_at ELSE created_at END')} AS at
    FROM contacts
    WHERE ${where}
    ORDER BY max(julianday(created_at), julianday(COALESCE(updated_at, created_at))) DESC, id DESC
    LIMIT @limit
  `).all({ since, grace: UPDATE_GRACE_DAYS, limit }) as RecentRow[];
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM contacts WHERE ${where}`)
    .get({ since, grace: UPDATE_GRACE_DAYS }) as { total: number };
  return { recent: rows.map(toRecentChange), total };
}

/**
 * Recent page: every change in the last `days` days, by kind. A contact can appear under
 * several kinds (imported, then edited). Each kind keeps its `limitPerKind` newest.
 */
export function getRecentChanges(
  db: DatabaseType,
  days: number,
  limitPerKind = RECENT_PAGE_LIMIT_PER_KIND
): { counts: Record<RecentKind, number>; changes: RecentChange[] } {
  const since = `-${days} days`;
  const rows = db.prepare(`
    WITH events AS (
      SELECT id, display_name, photo_hash, created_via, ${CREATION_KIND_SQL} AS kind, created_at AS at
      FROM contacts
      WHERE julianday(created_at) >= julianday('now', @since)
      UNION ALL
      SELECT id, display_name, photo_hash, created_via, 'updated', updated_at
      FROM contacts
      WHERE archived_at IS NULL
        AND julianday(updated_at) >= julianday('now', @since)
        AND julianday(updated_at) - julianday(created_at) > @grace
      UNION ALL
      SELECT id, display_name, photo_hash, created_via, 'archived', archived_at
      FROM contacts
      WHERE archived_at IS NOT NULL AND julianday(archived_at) >= julianday('now', @since)
    ),
    ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY kind ORDER BY julianday(at) DESC, id DESC) AS rn,
        COUNT(*) OVER (PARTITION BY kind) AS kind_total
      FROM events
    )
    SELECT id, display_name, photo_hash, created_via, kind, ${isoUtc('at')} AS at, kind_total
    FROM ranked
    WHERE rn <= @limit
    ORDER BY julianday(at) DESC, id DESC
  `).all({ since, grace: UPDATE_GRACE_DAYS, limit: limitPerKind }) as Array<RecentRow & { kind_total: number }>;

  const counts: Record<RecentKind, number> = { added: 0, imported: 0, synced: 0, updated: 0, archived: 0 };
  for (const row of rows) counts[row.kind] = row.kind_total;
  return { counts, changes: rows.map(toRecentChange) };
}

function getGeographyStats(db: DatabaseType): GeographyStats {

  const topCountries = db.prepare(`
    SELECT country, COUNT(*) as count
    FROM contact_addresses
    WHERE country IS NOT NULL AND country != '' AND detail_archived_at IS NULL
    GROUP BY country
    ORDER BY count DESC
    LIMIT 5
  `).all() as Array<{ country: string; count: number }>;

  const topCities = db.prepare(`
    SELECT city, country, COUNT(*) as count
    FROM contact_addresses
    WHERE city IS NOT NULL AND city != '' AND detail_archived_at IS NULL
    GROUP BY city, country
    ORDER BY count DESC
    LIMIT 5
  `).all() as Array<{ city: string; country: string; count: number }>;

  return {
    topCountries,
    topCities: topCities.map(c => ({
      city: c.city,
      country: c.country || '',
      count: c.count,
    })),
  };
}

const todayQuerySchema = {
  querystring: {
    type: 'object',
    properties: {
      today: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    },
  },
} as const;

export default async function statsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // GET /api/stats/dashboard
  fastify.get<{ Querystring: { today?: string }; Reply: DashboardResponse }>(
    '/dashboard',
    { schema: todayQuerySchema },
    async (request, _reply) => {
    const db = getUserDatabase(request.user!.id);
    const today = resolveToday(request.query.today);
    const overview = getOverviewStats(db);
    const upcomingBirthdays = getAllBirthdays(db, today)
      .filter((b) => b.daysUntil <= UPCOMING_BIRTHDAY_DAYS);
    const { recent, total: recentTotal } = getDashboardRecent(db);
    const geography = getGeographyStats(db);

    return {
      overview,
      upcomingBirthdays,
      recent,
      recentTotal,
      geography,
    };
  });

  // GET /api/stats/birthdays: every birthday, soonest first
  fastify.get<{ Querystring: { today?: string }; Reply: { birthdays: UpcomingBirthday[] } }>(
    '/birthdays',
    { schema: todayQuerySchema },
    async (request) => {
      const db = getUserDatabase(request.user!.id);
      return { birthdays: getAllBirthdays(db, resolveToday(request.query.today)) };
    }
  );

  // GET /api/stats/recent?days=30: contacts added, imported, synced, updated or archived lately
  fastify.get<{
    Querystring: { days?: number };
    Reply: { days: number; counts: Record<RecentKind, number>; changes: RecentChange[] };
  }>(
    '/recent',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: { days: { type: 'integer', minimum: 1, maximum: 365, default: 30 } },
        },
      },
    },
    async (request) => {
      const db = getUserDatabase(request.user!.id);
      const days = request.query.days ?? 30;
      return { days, ...getRecentChanges(db, days) };
    }
  );
}
