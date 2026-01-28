import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getDatabase } from '../services/database.js';
import { getPhotoUrl } from '../services/photoProcessor.js';
import {
  ContactListQuerySchema,
  ContactListQuery,
  ContactIdParamsSchema,
  ContactIdParams,
  ContactIdsQuerySchema,
  ContactIdsQuery,
  ContactListResponseSchema,
  ContactDetailSchema,
  ContactCountResponseSchema,
  ContactIdsResponseSchema,
  ContactNotFoundSchema,
  GroupsResponseSchema,
  UpdateContactBodySchema,
  UpdateContactBody
} from '../schemas/contact.js';

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
  primary_phone_country_code: string | null;
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
  country_code: string | null;
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

interface SocialProfileRow {
  id: number;
  contact_id: number;
  platform: string;
  username: string;
  profile_url: string | null;
  type: string | null;
}

interface CategoryRow {
  id: number;
  contact_id: number;
  category: string;
}

interface InstantMessageRow {
  id: number;
  contact_id: number;
  service: string;
  handle: string;
  type: string | null;
}

interface UrlRow {
  id: number;
  contact_id: number;
  url: string;
  label: string | null;
  type: string | null;
}

interface RelatedPersonRow {
  id: number;
  contact_id: number;
  name: string;
  relationship: string | null;
}

interface CountRow {
  count: number;
}

interface GroupRow {
  category: string;
  contactCount: number;
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

  // GET /api/contacts/groups - Get all categories with contact counts
  fastify.get('/groups', {
    schema: {
      response: {
        200: GroupsResponseSchema
      }
    }
  }, async (_request, _reply) => {
    const db = getDatabase();
    const groups = db.prepare(`
      SELECT category, COUNT(DISTINCT contact_id) as contactCount
      FROM contact_categories
      GROUP BY category
      ORDER BY category
    `).all() as GroupRow[];

    return { groups };
  });

  // GET /api/contacts/ids - Get all contact IDs for bulk selection
  fastify.get<{ Querystring: ContactIdsQuery }>('/ids', {
    schema: {
      querystring: ContactIdsQuerySchema,
      response: {
        200: ContactIdsResponseSchema
      }
    }
  }, async (request, _reply) => {
    const { search } = request.query;
    const db = getDatabase();

    let contactIds: number[];

    if (search) {
      // Use FTS5 for search with prefix matching
      // Escape double quotes and wrap in quotes for FTS5 phrase matching
      const escapedSearch = search.replace(/"/g, '""');
      const searchTerm = `"${escapedSearch}"*`;

      const rows = db.prepare(`
        SELECT c.id
        FROM contacts c
        WHERE c.id IN (SELECT rowid FROM contacts_unified_fts WHERE contacts_unified_fts MATCH ?)
        ORDER BY c.last_name, c.first_name, c.display_name
      `).all(searchTerm) as { id: number }[];

      contactIds = rows.map(r => r.id);
    } else {
      const rows = db.prepare(`
        SELECT id
        FROM contacts
        ORDER BY last_name, first_name, display_name
      `).all() as { id: number }[];

      contactIds = rows.map(r => r.id);
    }

    return { contactIds };
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
    const { page = 1, limit = 50, search, category } = request.query;
    const db = getDatabase();
    const offset = (page - 1) * limit;

    let contacts: ContactListRow[];
    let total: number;

    // Build category join and condition if filtering by category
    const categoryJoin = category
      ? 'INNER JOIN contact_categories cc ON c.id = cc.contact_id'
      : '';
    const categoryCondition = category ? 'cc.category = ?' : '';

    if (search) {
      // Use FTS5 for search with prefix matching
      // Escape double quotes and wrap in quotes for FTS5 phrase matching
      const escapedSearch = search.replace(/"/g, '""');
      const searchTerm = `"${escapedSearch}"*`;

      const ftsCondition = 'c.id IN (SELECT rowid FROM contacts_unified_fts WHERE contacts_unified_fts MATCH ?)';
      const whereClause = category
        ? `WHERE ${ftsCondition} AND ${categoryCondition}`
        : `WHERE ${ftsCondition}`;

      const countParams = category ? [searchTerm, category] : [searchTerm];
      const countResult = db.prepare(`
        SELECT COUNT(DISTINCT c.id) as count
        FROM contacts c
        ${categoryJoin}
        ${whereClause}
      `).get(...countParams) as CountRow;
      total = countResult.count;

      const queryParams = category ? [searchTerm, category, limit, offset] : [searchTerm, limit, offset];
      contacts = db.prepare(`
        SELECT DISTINCT
          c.id,
          c.display_name,
          c.company,
          c.photo_hash,
          (SELECT email FROM contact_emails WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_email,
          (SELECT phone_display FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_phone,
          (SELECT country_code FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_phone_country_code
        FROM contacts c
        ${categoryJoin}
        ${whereClause}
        ORDER BY c.last_name, c.first_name, c.display_name
        LIMIT ? OFFSET ?
      `).all(...queryParams) as ContactListRow[];
    } else if (category) {
      const countResult = db.prepare(`
        SELECT COUNT(DISTINCT c.id) as count
        FROM contacts c
        ${categoryJoin}
        WHERE ${categoryCondition}
      `).get(category) as CountRow;
      total = countResult.count;

      contacts = db.prepare(`
        SELECT DISTINCT
          c.id,
          c.display_name,
          c.company,
          c.photo_hash,
          (SELECT email FROM contact_emails WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_email,
          (SELECT phone_display FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_phone,
          (SELECT country_code FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_phone_country_code
        FROM contacts c
        ${categoryJoin}
        WHERE ${categoryCondition}
        ORDER BY c.last_name, c.first_name, c.display_name
        LIMIT ? OFFSET ?
      `).all(category, limit, offset) as ContactListRow[];
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
          (SELECT phone_display FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_phone,
          (SELECT country_code FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_phone_country_code
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
        primaryPhoneCountryCode: row.primary_phone_country_code,
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
        id, first_name, last_name, display_name, company, title, notes, birthday,
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
      SELECT id, contact_id, phone, phone_display, country_code, type, is_primary
      FROM contact_phones
      WHERE contact_id = ?
    `).all(id) as PhoneRow[];

    const addresses = db.prepare(`
      SELECT id, contact_id, street, city, state, postal_code, country, type
      FROM contact_addresses
      WHERE contact_id = ?
    `).all(id) as AddressRow[];

    const socialProfiles = db.prepare(`
      SELECT id, contact_id, platform, username, profile_url, type
      FROM contact_social_profiles
      WHERE contact_id = ?
    `).all(id) as SocialProfileRow[];

    const categories = db.prepare(`
      SELECT id, contact_id, category
      FROM contact_categories
      WHERE contact_id = ?
    `).all(id) as CategoryRow[];

    const instantMessages = db.prepare(`
      SELECT id, contact_id, service, handle, type
      FROM contact_instant_messages
      WHERE contact_id = ?
    `).all(id) as InstantMessageRow[];

    const urls = db.prepare(`
      SELECT id, contact_id, url, label, type
      FROM contact_urls
      WHERE contact_id = ?
    `).all(id) as UrlRow[];

    const relatedPeople = db.prepare(`
      SELECT id, contact_id, name, relationship
      FROM contact_related_people
      WHERE contact_id = ?
    `).all(id) as RelatedPersonRow[];

    return {
      id: contact.id,
      firstName: contact.first_name,
      lastName: contact.last_name,
      displayName: contact.display_name,
      company: contact.company,
      title: contact.title,
      notes: contact.notes,
      birthday: contact.birthday,
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
        countryCode: p.country_code,
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
      socialProfiles: socialProfiles.map(s => ({
        id: s.id,
        contactId: s.contact_id,
        platform: s.platform,
        username: s.username,
        profileUrl: s.profile_url,
        type: s.type
      })),
      categories: categories.map(c => ({
        id: c.id,
        contactId: c.contact_id,
        category: c.category
      })),
      instantMessages: instantMessages.map(im => ({
        id: im.id,
        contactId: im.contact_id,
        service: im.service,
        handle: im.handle,
        type: im.type
      })),
      urls: urls.map(u => ({
        id: u.id,
        contactId: u.contact_id,
        url: u.url,
        label: u.label,
        type: u.type
      })),
      relatedPeople: relatedPeople.map(rp => ({
        id: rp.id,
        contactId: rp.contact_id,
        name: rp.name,
        relationship: rp.relationship
      })),
      photoUrl: getPhotoUrl(contact.photo_hash, 'medium')
    };
  });

  // PUT /api/contacts/:id - Update a contact
  fastify.put<{ Params: ContactIdParams; Body: UpdateContactBody }>('/:id', {
    schema: {
      params: ContactIdParamsSchema,
      body: UpdateContactBodySchema,
      response: {
        200: ContactDetailSchema,
        404: ContactNotFoundSchema
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const updates = request.body;
    const db = getDatabase();

    // Check if contact exists
    const existingContact = db.prepare('SELECT id FROM contacts WHERE id = ?').get(id) as { id: number } | undefined;
    if (!existingContact) {
      return reply.status(404).send({ error: 'Contact not found' });
    }

    // Build the display name if first/last names are being updated
    let displayName = updates.displayName;
    if (!displayName && (updates.firstName !== undefined || updates.lastName !== undefined)) {
      const currentContact = db.prepare('SELECT first_name, last_name, display_name FROM contacts WHERE id = ?').get(id) as {
        first_name: string | null;
        last_name: string | null;
        display_name: string;
      };
      const firstName = updates.firstName !== undefined ? updates.firstName : currentContact.first_name;
      const lastName = updates.lastName !== undefined ? updates.lastName : currentContact.last_name;
      displayName = [firstName, lastName].filter(Boolean).join(' ') || currentContact.display_name;
    }

    // Update main contact fields
    const contactFields: string[] = [];
    const contactValues: (string | null)[] = [];

    if (updates.firstName !== undefined) {
      contactFields.push('first_name = ?');
      contactValues.push(updates.firstName);
    }
    if (updates.lastName !== undefined) {
      contactFields.push('last_name = ?');
      contactValues.push(updates.lastName);
    }
    if (displayName !== undefined) {
      contactFields.push('display_name = ?');
      contactValues.push(displayName);
    }
    if (updates.company !== undefined) {
      contactFields.push('company = ?');
      contactValues.push(updates.company);
    }
    if (updates.title !== undefined) {
      contactFields.push('title = ?');
      contactValues.push(updates.title);
    }
    if (updates.notes !== undefined) {
      contactFields.push('notes = ?');
      contactValues.push(updates.notes);
    }
    if (updates.birthday !== undefined) {
      contactFields.push('birthday = ?');
      contactValues.push(updates.birthday);
    }

    // Always update the updated_at timestamp
    contactFields.push('updated_at = datetime(\'now\')');

    if (contactFields.length > 0) {
      const updateSql = `UPDATE contacts SET ${contactFields.join(', ')} WHERE id = ?`;
      db.prepare(updateSql).run(...contactValues, id);
    }

    // Update emails (delete all and re-insert)
    if (updates.emails !== undefined) {
      db.prepare('DELETE FROM contact_emails WHERE contact_id = ?').run(id);
      const insertEmail = db.prepare(`
        INSERT INTO contact_emails (contact_id, email, type, is_primary)
        VALUES (?, ?, ?, ?)
      `);
      for (const email of updates.emails) {
        insertEmail.run(id, email.email, email.type, email.isPrimary ? 1 : 0);
      }
    }

    // Update phones (delete all and re-insert)
    if (updates.phones !== undefined) {
      db.prepare('DELETE FROM contact_phones WHERE contact_id = ?').run(id);
      const insertPhone = db.prepare(`
        INSERT INTO contact_phones (contact_id, phone, phone_display, country_code, type, is_primary)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const phone of updates.phones) {
        insertPhone.run(id, phone.phone, phone.phoneDisplay, phone.countryCode, phone.type, phone.isPrimary ? 1 : 0);
      }
    }

    // Update addresses (delete all and re-insert)
    if (updates.addresses !== undefined) {
      db.prepare('DELETE FROM contact_addresses WHERE contact_id = ?').run(id);
      const insertAddress = db.prepare(`
        INSERT INTO contact_addresses (contact_id, street, city, state, postal_code, country, type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const addr of updates.addresses) {
        insertAddress.run(id, addr.street, addr.city, addr.state, addr.postalCode, addr.country, addr.type);
      }
    }

    // Update social profiles (delete all and re-insert)
    if (updates.socialProfiles !== undefined) {
      db.prepare('DELETE FROM contact_social_profiles WHERE contact_id = ?').run(id);
      const insertSocial = db.prepare(`
        INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url, type)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const profile of updates.socialProfiles) {
        insertSocial.run(id, profile.platform, profile.username, profile.profileUrl, profile.type);
      }
    }

    // Update categories (delete all and re-insert)
    if (updates.categories !== undefined) {
      db.prepare('DELETE FROM contact_categories WHERE contact_id = ?').run(id);
      const insertCategory = db.prepare(`
        INSERT INTO contact_categories (contact_id, category)
        VALUES (?, ?)
      `);
      for (const cat of updates.categories) {
        insertCategory.run(id, cat.category);
      }
    }

    // Update instant messages (delete all and re-insert)
    if (updates.instantMessages !== undefined) {
      db.prepare('DELETE FROM contact_instant_messages WHERE contact_id = ?').run(id);
      const insertIM = db.prepare(`
        INSERT INTO contact_instant_messages (contact_id, service, handle, type)
        VALUES (?, ?, ?, ?)
      `);
      for (const im of updates.instantMessages) {
        insertIM.run(id, im.service, im.handle, im.type);
      }
    }

    // Update URLs (delete all and re-insert)
    if (updates.urls !== undefined) {
      db.prepare('DELETE FROM contact_urls WHERE contact_id = ?').run(id);
      const insertUrl = db.prepare(`
        INSERT INTO contact_urls (contact_id, url, label, type)
        VALUES (?, ?, ?, ?)
      `);
      for (const url of updates.urls) {
        insertUrl.run(id, url.url, url.label, url.type);
      }
    }

    // Update related people (delete all and re-insert)
    if (updates.relatedPeople !== undefined) {
      db.prepare('DELETE FROM contact_related_people WHERE contact_id = ?').run(id);
      const insertRelated = db.prepare(`
        INSERT INTO contact_related_people (contact_id, name, relationship)
        VALUES (?, ?, ?)
      `);
      for (const person of updates.relatedPeople) {
        insertRelated.run(id, person.name, person.relationship);
      }
    }

    // Fetch and return the updated contact (reuse the GET logic)
    const contact = db.prepare(`
      SELECT
        id, first_name, last_name, display_name, company, title, notes, birthday,
        photo_hash, raw_vcard, created_at, updated_at
      FROM contacts
      WHERE id = ?
    `).get(id) as ContactRow;

    const emails = db.prepare(`
      SELECT id, contact_id, email, type, is_primary
      FROM contact_emails
      WHERE contact_id = ?
    `).all(id) as EmailRow[];

    const phones = db.prepare(`
      SELECT id, contact_id, phone, phone_display, country_code, type, is_primary
      FROM contact_phones
      WHERE contact_id = ?
    `).all(id) as PhoneRow[];

    const addresses = db.prepare(`
      SELECT id, contact_id, street, city, state, postal_code, country, type
      FROM contact_addresses
      WHERE contact_id = ?
    `).all(id) as AddressRow[];

    const socialProfiles = db.prepare(`
      SELECT id, contact_id, platform, username, profile_url, type
      FROM contact_social_profiles
      WHERE contact_id = ?
    `).all(id) as SocialProfileRow[];

    const categories = db.prepare(`
      SELECT id, contact_id, category
      FROM contact_categories
      WHERE contact_id = ?
    `).all(id) as CategoryRow[];

    const instantMessages = db.prepare(`
      SELECT id, contact_id, service, handle, type
      FROM contact_instant_messages
      WHERE contact_id = ?
    `).all(id) as InstantMessageRow[];

    const urls = db.prepare(`
      SELECT id, contact_id, url, label, type
      FROM contact_urls
      WHERE contact_id = ?
    `).all(id) as UrlRow[];

    const relatedPeople = db.prepare(`
      SELECT id, contact_id, name, relationship
      FROM contact_related_people
      WHERE contact_id = ?
    `).all(id) as RelatedPersonRow[];

    return {
      id: contact.id,
      firstName: contact.first_name,
      lastName: contact.last_name,
      displayName: contact.display_name,
      company: contact.company,
      title: contact.title,
      notes: contact.notes,
      birthday: contact.birthday,
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
        countryCode: p.country_code,
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
      socialProfiles: socialProfiles.map(s => ({
        id: s.id,
        contactId: s.contact_id,
        platform: s.platform,
        username: s.username,
        profileUrl: s.profile_url,
        type: s.type
      })),
      categories: categories.map(c => ({
        id: c.id,
        contactId: c.contact_id,
        category: c.category
      })),
      instantMessages: instantMessages.map(im => ({
        id: im.id,
        contactId: im.contact_id,
        service: im.service,
        handle: im.handle,
        type: im.type
      })),
      urls: urls.map(u => ({
        id: u.id,
        contactId: u.contact_id,
        url: u.url,
        label: u.label,
        type: u.type
      })),
      relatedPeople: relatedPeople.map(rp => ({
        id: rp.id,
        contactId: rp.contact_id,
        name: rp.name,
        relationship: rp.relationship
      })),
      photoUrl: getPhotoUrl(contact.photo_hash, 'medium')
    };
  });
}
