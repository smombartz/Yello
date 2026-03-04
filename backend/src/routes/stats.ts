import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getDatabase } from '../services/database.js';


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

interface RecentContact {
  id: number;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  photoHash: string | null;
}

interface GeographyStats {
  topCountries: Array<{ country: string; count: number }>;
  topCities: Array<{ city: string; country: string; count: number }>;
}

interface DashboardResponse {
  overview: OverviewStats;
  upcomingBirthdays: UpcomingBirthday[];
  recentlyAdded: RecentContact[];
  recentlyModified: RecentContact[];
  geography: GeographyStats;
}

function getOverviewStats(): OverviewStats {
  const db = getDatabase();

  const totalContacts = db.prepare(
    'SELECT COUNT(*) as count FROM contacts WHERE archived_at IS NULL'
  ).get() as { count: number };

  const totalCountries = db.prepare(
    `SELECT COUNT(DISTINCT country) as count
     FROM contact_addresses
     WHERE country IS NOT NULL AND country != ''`
  ).get() as { count: number };

  const totalCities = db.prepare(
    `SELECT COUNT(DISTINCT city) as count
     FROM contact_addresses
     WHERE city IS NOT NULL AND city != ''`
  ).get() as { count: number };

  const contactsWithPhotos = db.prepare(
    'SELECT COUNT(*) as count FROM contacts WHERE photo_hash IS NOT NULL AND archived_at IS NULL'
  ).get() as { count: number };

  const contactsWithBirthdays = db.prepare(
    'SELECT COUNT(*) as count FROM contacts WHERE birthday IS NOT NULL AND archived_at IS NULL'
  ).get() as { count: number };

  return {
    totalContacts: totalContacts.count,
    totalCountries: totalCountries.count,
    totalCities: totalCities.count,
    contactsWithPhotos: contactsWithPhotos.count,
    contactsWithBirthdays: contactsWithBirthdays.count,
  };
}

function getUpcomingBirthdays(): UpcomingBirthday[] {
  const db = getDatabase();

  // Get current date
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  // Get all contacts with birthdays (non-archived)
  const contacts = db.prepare(`
    SELECT id, display_name, birthday, photo_hash
    FROM contacts
    WHERE birthday IS NOT NULL AND archived_at IS NULL
  `).all() as Array<{ id: number; display_name: string; birthday: string; photo_hash: string | null }>;

  const upcomingBirthdays: UpcomingBirthday[] = [];

  for (const contact of contacts) {
    // Birthday format could be YYYY-MM-DD, --MM-DD, or MM-DD
    let birthdayMonth: number;
    let birthdayDay: number;

    const birthday = contact.birthday;
    if (birthday.startsWith('--')) {
      // Format: --MM-DD
      const parts = birthday.slice(2).split('-');
      birthdayMonth = parseInt(parts[0], 10);
      birthdayDay = parseInt(parts[1], 10);
    } else if (birthday.includes('-')) {
      // Format: YYYY-MM-DD
      const parts = birthday.split('-');
      birthdayMonth = parseInt(parts[1], 10);
      birthdayDay = parseInt(parts[2], 10);
    } else {
      // Unknown format, skip
      continue;
    }

    if (isNaN(birthdayMonth) || isNaN(birthdayDay)) continue;

    // Calculate days until birthday
    const thisYear = now.getFullYear();
    let birthdayThisYear = new Date(thisYear, birthdayMonth - 1, birthdayDay);

    // If the birthday has passed this year, calculate for next year
    if (birthdayThisYear < now) {
      birthdayThisYear = new Date(thisYear + 1, birthdayMonth - 1, birthdayDay);
    }

    const diffTime = birthdayThisYear.getTime() - now.getTime();
    const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Only include if within next 7 days
    if (daysUntil >= 0 && daysUntil <= 7) {
      upcomingBirthdays.push({
        id: contact.id,
        displayName: contact.display_name,
        birthday: `${String(birthdayMonth).padStart(2, '0')}-${String(birthdayDay).padStart(2, '0')}`,
        daysUntil,
        photoHash: contact.photo_hash,
      });
    }
  }

  // Sort by days until birthday
  upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);

  return upcomingBirthdays;
}

function getRecentlyAdded(): RecentContact[] {
  const db = getDatabase();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString();

  const contacts = db.prepare(`
    SELECT id, display_name, created_at, updated_at, photo_hash
    FROM contacts
    WHERE archived_at IS NULL AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 5
  `).all(sevenDaysAgoStr) as Array<{
    id: number;
    display_name: string;
    created_at: string;
    updated_at: string;
    photo_hash: string | null;
  }>;

  return contacts.map(c => ({
    id: c.id,
    displayName: c.display_name,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    photoHash: c.photo_hash,
  }));
}

function getRecentlyModified(): RecentContact[] {
  const db = getDatabase();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString();

  // Exclude contacts that were just created (to avoid duplication with recentlyAdded)
  const contacts = db.prepare(`
    SELECT id, display_name, created_at, updated_at, photo_hash
    FROM contacts
    WHERE archived_at IS NULL
      AND updated_at >= ?
      AND updated_at != created_at
    ORDER BY updated_at DESC
    LIMIT 5
  `).all(sevenDaysAgoStr) as Array<{
    id: number;
    display_name: string;
    created_at: string;
    updated_at: string;
    photo_hash: string | null;
  }>;

  return contacts.map(c => ({
    id: c.id,
    displayName: c.display_name,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    photoHash: c.photo_hash,
  }));
}

function getGeographyStats(): GeographyStats {
  const db = getDatabase();

  const topCountries = db.prepare(`
    SELECT country, COUNT(*) as count
    FROM contact_addresses
    WHERE country IS NOT NULL AND country != ''
    GROUP BY country
    ORDER BY count DESC
    LIMIT 5
  `).all() as Array<{ country: string; count: number }>;

  const topCities = db.prepare(`
    SELECT city, country, COUNT(*) as count
    FROM contact_addresses
    WHERE city IS NOT NULL AND city != ''
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

export default async function statsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // GET /api/stats/dashboard
  fastify.get<{ Reply: DashboardResponse }>(
    '/dashboard',
    async (_request, _reply) => {
    const overview = getOverviewStats();
    const upcomingBirthdays = getUpcomingBirthdays();
    const recentlyAdded = getRecentlyAdded();
    const recentlyModified = getRecentlyModified();
    const geography = getGeographyStats();

    return {
      overview,
      upcomingBirthdays,
      recentlyAdded,
      recentlyModified,
      geography,
    };
  });
}

