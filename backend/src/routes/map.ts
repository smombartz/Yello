import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getUserDatabase } from '../services/userDatabase.js';
import { getPhotoUrl } from '../services/photoProcessor.js';
import { geocodeAddress, isValidCoordinate } from '../services/geocoding.js';

interface MapMarker {
  contactId: number;
  displayName: string;
  photoUrl: string | null;
  latitude: number;
  longitude: number;
  city: string | null;
  country: string | null;
  type: string | null;
}

interface AddressRow {
  id: number;
  contact_id: number;
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  type: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoded_at: string | null;
}

interface ContactRow {
  id: number;
  display_name: string;
  photo_hash: string | null;
}

interface MapQuerystring {
  search?: string;
  category?: string;
}

export default async function mapRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // GET /api/map - Get all contacts with geocoded addresses for map display
  fastify.get<{ Querystring: MapQuerystring }>('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          category: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            markers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  contactId: { type: 'number' },
                  displayName: { type: 'string' },
                  photoUrl: { type: ['string', 'null'] },
                  latitude: { type: 'number' },
                  longitude: { type: 'number' },
                  city: { type: ['string', 'null'] },
                  country: { type: ['string', 'null'] },
                  type: { type: ['string', 'null'] }
                }
              }
            },
            totalContacts: { type: 'number' },
            geocodedCount: { type: 'number' }
          }
        }
      }
    }
  }, async (request, _reply) => {
    const { search, category } = request.query;
    const db = getUserDatabase(request.user!.id);

    // Build query to get contacts with geocoded addresses
    let contactIdsQuery = '';
    const params: (string | number)[] = [];

    if (search) {
      const escapedSearch = search.replace(/"/g, '""');
      const searchTerm = `"${escapedSearch}"*`;

      if (category) {
        contactIdsQuery = `
          SELECT DISTINCT c.id
          FROM contacts c
          INNER JOIN contact_categories cc ON c.id = cc.contact_id
          WHERE c.id IN (SELECT rowid FROM contacts_unified_fts WHERE contacts_unified_fts MATCH ?)
          AND cc.category = ?
        `;
        params.push(searchTerm, category);
      } else {
        contactIdsQuery = `
          SELECT DISTINCT c.id
          FROM contacts c
          WHERE c.id IN (SELECT rowid FROM contacts_unified_fts WHERE contacts_unified_fts MATCH ?)
        `;
        params.push(searchTerm);
      }
    } else if (category) {
      contactIdsQuery = `
        SELECT DISTINCT c.id
        FROM contacts c
        INNER JOIN contact_categories cc ON c.id = cc.contact_id
        WHERE cc.category = ?
      `;
      params.push(category);
    } else {
      contactIdsQuery = 'SELECT id FROM contacts';
    }

    // Get filtered contact IDs
    const contactIds = db.prepare(contactIdsQuery).all(...params) as Array<{ id: number }>;
    const contactIdSet = new Set(contactIds.map(c => c.id));

    if (contactIdSet.size === 0) {
      return { markers: [], totalContacts: 0, geocodedCount: 0 };
    }

    // Get all geocoded addresses for filtered contacts
    const placeholders = Array.from(contactIdSet).map(() => '?').join(',');
    const addresses = db.prepare(`
      SELECT
        a.id, a.contact_id, a.street, a.city, a.state, a.postal_code, a.country, a.type,
        a.latitude, a.longitude, a.geocoded_at,
        c.display_name, c.photo_hash
      FROM contact_addresses a
      INNER JOIN contacts c ON a.contact_id = c.id
      WHERE a.contact_id IN (${placeholders})
      AND a.latitude IS NOT NULL
      AND a.longitude IS NOT NULL
    `).all(...Array.from(contactIdSet)) as Array<AddressRow & ContactRow>;

    const markers: MapMarker[] = addresses
      .filter(a => isValidCoordinate(a.latitude, a.longitude))
      .map(a => ({
        contactId: a.contact_id,
        displayName: a.display_name,
        photoUrl: getPhotoUrl(a.photo_hash, 'small'),
        latitude: a.latitude!,
        longitude: a.longitude!,
        city: a.city,
        country: a.country,
        type: a.type
      }));

    // Count unique contacts with geocoded addresses
    const geocodedContactIds = new Set(markers.map(m => m.contactId));

    return {
      markers,
      totalContacts: contactIdSet.size,
      geocodedCount: geocodedContactIds.size
    };
  });

  // POST /api/map/geocode - Geocode addresses that don't have coordinates
  fastify.post<{ Body: { limit?: number } }>('/geocode', {
    schema: {
      body: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 50 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            processed: { type: 'number' },
            successful: { type: 'number' },
            failed: { type: 'number' },
            remaining: { type: 'number' }
          }
        }
      }
    }
  }, async (request, _reply) => {
    const { limit = 50 } = request.body;
    const db = getUserDatabase(request.user!.id);

    // Get addresses without geocoding
    const ungeocodedAddresses = db.prepare(`
      SELECT id, street, city, state, postal_code, country
      FROM contact_addresses
      WHERE latitude IS NULL
      AND (city IS NOT NULL OR street IS NOT NULL)
      LIMIT ?
    `).all(limit) as Array<{
      id: number;
      street: string | null;
      city: string | null;
      state: string | null;
      postal_code: string | null;
      country: string | null;
    }>;

    let successful = 0;
    let failed = 0;

    const updateStmt = db.prepare(`
      UPDATE contact_addresses
      SET latitude = ?, longitude = ?, geocoded_at = datetime('now')
      WHERE id = ?
    `);

    const markFailedStmt = db.prepare(`
      UPDATE contact_addresses
      SET geocoded_at = datetime('now')
      WHERE id = ?
    `);

    for (const address of ungeocodedAddresses) {
      const result = await geocodeAddress({
        street: address.street,
        city: address.city,
        state: address.state,
        postalCode: address.postal_code,
        country: address.country
      });

      if (result && isValidCoordinate(result.latitude, result.longitude)) {
        updateStmt.run(result.latitude, result.longitude, address.id);
        successful++;
      } else {
        // Mark as attempted so we don't retry indefinitely
        markFailedStmt.run(address.id);
        failed++;
      }
    }

    // Count remaining ungeocoded addresses
    const remaining = db.prepare(`
      SELECT COUNT(*) as count
      FROM contact_addresses
      WHERE latitude IS NULL
      AND geocoded_at IS NULL
      AND (city IS NOT NULL OR street IS NOT NULL)
    `).get() as { count: number };

    return {
      processed: ungeocodedAddresses.length,
      successful,
      failed,
      remaining: remaining.count
    };
  });

  // GET /api/map/stats - Get geocoding statistics
  fastify.get('/stats', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            totalAddresses: { type: 'number' },
            geocodedAddresses: { type: 'number' },
            failedAddresses: { type: 'number' },
            pendingAddresses: { type: 'number' }
          }
        }
      }
    }
  }, async (request, _reply) => {
    const db = getUserDatabase(request.user!.id);

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN latitude IS NOT NULL THEN 1 ELSE 0 END) as geocoded,
        SUM(CASE WHEN latitude IS NULL AND geocoded_at IS NOT NULL THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN latitude IS NULL AND geocoded_at IS NULL AND (city IS NOT NULL OR street IS NOT NULL) THEN 1 ELSE 0 END) as pending
      FROM contact_addresses
    `).get() as {
      total: number;
      geocoded: number;
      failed: number;
      pending: number;
    };

    return {
      totalAddresses: stats.total,
      geocodedAddresses: stats.geocoded,
      failedAddresses: stats.failed,
      pendingAddresses: stats.pending
    };
  });
}
