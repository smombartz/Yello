import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getDatabase } from '../services/database.js';
import { getPhotoUrl } from '../services/photoProcessor.js';
import {
  ContactListQuerySchema,
  ContactListQuery,
  ContactIdParamsSchema,
  ContactIdParams,
  ContactListResponseSchema,
  ContactDetailSchema,
  ContactCountResponseSchema,
  ContactNotFoundSchema
} from '../schemas/contact.js';

interface ContactRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  company: string | null;
  title: string | null;
  notes: string | null;
  photo_hash: string | null;
  raw_vcard: string | null;
  created_at: string;
  updated_at: string;
}

interface ContactListRow {
  id: number;
  display_name: string;
  company: string | null;
  photo_hash: string | null;
  primary_email: string | null;
  primary_phone: string | null;
}

interface EmailRow {
  id: number;
  contact_id: number;
  email: string;
  type: string | null;
  is_primary: number;
}

interface PhoneRow {
  id: number;
  contact_id: number;
  phone: string;
  phone_display: string;
  type: string | null;
  is_primary: number;
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
}

interface CountRow {
  count: number;
}

export default async function contactsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // GET /api/contacts/count
  fastify.get('/count', {
    schema: {
      response: {
        200: ContactCountResponseSchema
      }
    }
  }, async (_request, _reply) => {
    const db = getDatabase();
    const result = db.prepare('SELECT COUNT(*) as count FROM contacts').get() as CountRow;
    return { total: result.count };
  });

  // GET /api/contacts
  fastify.get<{ Querystring: ContactListQuery }>('/', {
    schema: {
      querystring: ContactListQuerySchema,
      response: {
        200: ContactListResponseSchema
      }
    }
  }, async (request, _reply) => {
    const { page = 1, limit = 50, search } = request.query;
    const db = getDatabase();
    const offset = (page - 1) * limit;

    let contacts: ContactListRow[];
    let total: number;

    if (search) {
      // Use FTS5 for search with prefix matching
      const searchTerm = `${search}*`;

      const countResult = db.prepare(`
        SELECT COUNT(*) as count
        FROM contacts c
        WHERE c.id IN (SELECT rowid FROM contacts_fts WHERE contacts_fts MATCH ?)
      `).get(searchTerm) as CountRow;
      total = countResult.count;

      contacts = db.prepare(`
        SELECT
          c.id,
          c.display_name,
          c.company,
          c.photo_hash,
          (SELECT email FROM contact_emails WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_email,
          (SELECT phone_display FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_phone
        FROM contacts c
        WHERE c.id IN (SELECT rowid FROM contacts_fts WHERE contacts_fts MATCH ?)
        ORDER BY c.last_name, c.first_name, c.display_name
        LIMIT ? OFFSET ?
      `).all(searchTerm, limit, offset) as ContactListRow[];
    } else {
      const countResult = db.prepare('SELECT COUNT(*) as count FROM contacts').get() as CountRow;
      total = countResult.count;

      contacts = db.prepare(`
        SELECT
          c.id,
          c.display_name,
          c.company,
          c.photo_hash,
          (SELECT email FROM contact_emails WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_email,
          (SELECT phone_display FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_phone
        FROM contacts c
        ORDER BY c.last_name, c.first_name, c.display_name
        LIMIT ? OFFSET ?
      `).all(limit, offset) as ContactListRow[];
    }

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    return {
      contacts: contacts.map(row => ({
        id: row.id,
        displayName: row.display_name,
        company: row.company,
        primaryEmail: row.primary_email,
        primaryPhone: row.primary_phone,
        photoUrl: getPhotoUrl(row.photo_hash, 'thumbnail')
      })),
      total,
      page,
      totalPages
    };
  });

  // GET /api/contacts/:id
  fastify.get<{ Params: ContactIdParams }>('/:id', {
    schema: {
      params: ContactIdParamsSchema,
      response: {
        200: ContactDetailSchema,
        404: ContactNotFoundSchema
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const db = getDatabase();

    const contact = db.prepare(`
      SELECT
        id, first_name, last_name, display_name, company, title, notes,
        photo_hash, raw_vcard, created_at, updated_at
      FROM contacts
      WHERE id = ?
    `).get(id) as ContactRow | undefined;

    if (!contact) {
      return reply.status(404).send({ error: 'Contact not found' });
    }

    const emails = db.prepare(`
      SELECT id, contact_id, email, type, is_primary
      FROM contact_emails
      WHERE contact_id = ?
    `).all(id) as EmailRow[];

    const phones = db.prepare(`
      SELECT id, contact_id, phone, phone_display, type, is_primary
      FROM contact_phones
      WHERE contact_id = ?
    `).all(id) as PhoneRow[];

    const addresses = db.prepare(`
      SELECT id, contact_id, street, city, state, postal_code, country, type
      FROM contact_addresses
      WHERE contact_id = ?
    `).all(id) as AddressRow[];

    return {
      id: contact.id,
      firstName: contact.first_name,
      lastName: contact.last_name,
      displayName: contact.display_name,
      company: contact.company,
      title: contact.title,
      notes: contact.notes,
      photoHash: contact.photo_hash,
      rawVcard: contact.raw_vcard,
      createdAt: contact.created_at,
      updatedAt: contact.updated_at,
      emails: emails.map(e => ({
        id: e.id,
        contactId: e.contact_id,
        email: e.email,
        type: e.type,
        isPrimary: e.is_primary === 1
      })),
      phones: phones.map(p => ({
        id: p.id,
        contactId: p.contact_id,
        phone: p.phone,
        phoneDisplay: p.phone_display,
        type: p.type,
        isPrimary: p.is_primary === 1
      })),
      addresses: addresses.map(a => ({
        id: a.id,
        contactId: a.contact_id,
        street: a.street,
        city: a.city,
        state: a.state,
        postalCode: a.postal_code,
        country: a.country,
        type: a.type
      })),
      photoUrl: getPhotoUrl(contact.photo_hash, 'medium')
    };
  });
}
