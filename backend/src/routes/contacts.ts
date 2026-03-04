import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getDatabase, rebuildContactSearch } from '../services/database.js';
import { getPhotoUrl } from '../services/photoProcessor.js';
import { detectMergeConflicts, mergeContactsWithResolutions } from '../services/mergeService.js';
import { geocodeAddress, isValidCoordinate } from '../services/geocoding.js';
import { generateVcard, type ContactForVcard } from '../services/vcardGenerator.js';
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
  UpdateContactBody,
  CreateContactBodySchema,
  CreateContactBody
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
  title: string | null;
  photo_hash: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  primary_phone_country_code: string | null;
  linkedin_url: string | null;
  website_url: string | null;
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
    const { page = 1, limit = 50, search, category, sort = 'name-asc', filter } = request.query;
    const db = getDatabase();
    const offset = (page - 1) * limit;

    // Build query parts dynamically
    const joins: string[] = [];
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    // Category filter
    if (category) {
      joins.push('INNER JOIN contact_categories cc ON c.id = cc.contact_id');
      conditions.push('cc.category = ?');
      params.push(category);
    }

    // FTS search
    if (search) {
      const escapedSearch = search.replace(/"/g, '""');
      const searchTerm = `"${escapedSearch}"*`;
      conditions.push('c.id IN (SELECT rowid FROM contacts_unified_fts WHERE contacts_unified_fts MATCH ?)');
      params.push(searchTerm);
    }

    // Parse filters
    const activeFilters = filter ? filter.split(',').map(f => f.trim()).filter(Boolean) : [];
    for (const f of activeFilters) {
      switch (f) {
        case 'has-photo': conditions.push('c.photo_hash IS NOT NULL'); break;
        case 'no-photo': conditions.push('c.photo_hash IS NULL'); break;
        case 'has-email': conditions.push('EXISTS (SELECT 1 FROM contact_emails WHERE contact_id = c.id)'); break;
        case 'no-email': conditions.push('NOT EXISTS (SELECT 1 FROM contact_emails WHERE contact_id = c.id)'); break;
        case 'has-phone': conditions.push('EXISTS (SELECT 1 FROM contact_phones WHERE contact_id = c.id)'); break;
        case 'no-phone': conditions.push('NOT EXISTS (SELECT 1 FROM contact_phones WHERE contact_id = c.id)'); break;
        case 'has-address': conditions.push('EXISTS (SELECT 1 FROM contact_addresses WHERE contact_id = c.id)'); break;
        case 'no-address': conditions.push('NOT EXISTS (SELECT 1 FROM contact_addresses WHERE contact_id = c.id)'); break;
        case 'has-birthday': conditions.push('c.birthday IS NOT NULL'); break;
        case 'no-birthday': conditions.push('c.birthday IS NULL'); break;
        case 'has-enrichment': conditions.push('EXISTS (SELECT 1 FROM linkedin_enrichment WHERE contact_id = c.id)'); break;
        case 'no-enrichment': conditions.push('NOT EXISTS (SELECT 1 FROM linkedin_enrichment WHERE contact_id = c.id)'); break;
        case 'has-instagram': conditions.push("EXISTS (SELECT 1 FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'instagram')"); break;
        case 'no-instagram': conditions.push("NOT EXISTS (SELECT 1 FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'instagram')"); break;
        case 'has-linkedin': conditions.push("EXISTS (SELECT 1 FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'linkedin')"); break;
        case 'no-linkedin': conditions.push("NOT EXISTS (SELECT 1 FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'linkedin')"); break;
      }
    }

    // Last-contacted sort needs a join
    let lastContactedSelect = '';
    if (sort === 'last-contacted') {
      joins.push('LEFT JOIN (SELECT contact_id, MAX(date) as last_contact_date FROM contact_emails_history GROUP BY contact_id) lc ON lc.contact_id = c.id');
      lastContactedSelect = ', lc.last_contact_date';
    }

    // Build ORDER BY
    let orderBy: string;
    switch (sort) {
      case 'name-desc': orderBy = 'c.last_name DESC, c.first_name DESC, c.display_name DESC'; break;
      case 'newest': orderBy = 'c.created_at DESC'; break;
      case 'oldest': orderBy = 'c.created_at ASC'; break;
      case 'updated': orderBy = 'c.updated_at DESC'; break;
      case 'last-contacted': orderBy = 'CASE WHEN lc.last_contact_date IS NULL THEN 1 ELSE 0 END, lc.last_contact_date DESC'; break;
      default: orderBy = 'c.last_name, c.first_name, c.display_name'; break;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const joinClause = joins.join('\n        ');

    // Count query
    const countResult = db.prepare(`
      SELECT COUNT(DISTINCT c.id) as count
      FROM contacts c
      ${joinClause}
      ${whereClause}
    `).get(...params) as CountRow;
    const total = countResult.count;

    // Data query
    const queryParams = [...params, limit, offset];
    const contacts = db.prepare(`
      SELECT DISTINCT
        c.id,
        c.display_name,
        c.company,
        c.title,
        c.photo_hash,
        (SELECT email FROM contact_emails WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_email,
        (SELECT phone_display FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_phone,
        (SELECT country_code FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_phone_country_code,
        (SELECT profile_url FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'linkedin' LIMIT 1) as linkedin_url,
        (SELECT url FROM contact_urls WHERE contact_id = c.id LIMIT 1) as website_url
        ${lastContactedSelect}
      FROM contacts c
      ${joinClause}
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...queryParams) as ContactListRow[];

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    return {
      contacts: contacts.map(row => ({
        id: row.id,
        displayName: row.display_name,
        company: row.company,
        title: row.title,
        primaryEmail: row.primary_email,
        primaryPhone: row.primary_phone,
        primaryPhoneCountryCode: row.primary_phone_country_code,
        photoUrl: getPhotoUrl(row.photo_hash, 'thumbnail'),
        linkedinUrl: row.linkedin_url,
        websiteUrl: row.website_url
      })),
      total,
      page,
      totalPages
    };
  });

  // POST /api/contacts - Create a new contact
  fastify.post<{ Body: CreateContactBody }>('/', {
    schema: {
      body: CreateContactBodySchema,
      response: {
        201: ContactDetailSchema,
        400: ContactNotFoundSchema
      }
    }
  }, async (request, reply) => {
    const data = request.body;
    const db = getDatabase();

    // Insert main contact
    const insertContact = db.prepare(`
      INSERT INTO contacts (first_name, last_name, display_name, company, title, notes, birthday, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const result = insertContact.run(
      data.firstName || null,
      data.lastName || null,
      data.displayName,
      data.company || null,
      data.title || null,
      data.notes || null,
      data.birthday || null
    );

    const contactId = result.lastInsertRowid as number;

    // Insert emails
    if (data.emails && data.emails.length > 0) {
      const insertEmail = db.prepare(`
        INSERT INTO contact_emails (contact_id, email, type, is_primary)
        VALUES (?, ?, ?, ?)
      `);
      for (const email of data.emails) {
        insertEmail.run(contactId, email.email, email.type, email.isPrimary ? 1 : 0);
      }
    }

    // Insert phones
    if (data.phones && data.phones.length > 0) {
      const insertPhone = db.prepare(`
        INSERT INTO contact_phones (contact_id, phone, phone_display, country_code, type, is_primary)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const phone of data.phones) {
        insertPhone.run(contactId, phone.phone, phone.phoneDisplay, phone.countryCode, phone.type, phone.isPrimary ? 1 : 0);
      }
    }

    // Insert addresses
    if (data.addresses && data.addresses.length > 0) {
      const insertAddress = db.prepare(`
        INSERT INTO contact_addresses (contact_id, street, city, state, postal_code, country, type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const updateGeocode = db.prepare(`
        UPDATE contact_addresses
        SET latitude = ?, longitude = ?, geocoded_at = datetime('now')
        WHERE id = ?
      `);

      for (const addr of data.addresses) {
        const addrResult = insertAddress.run(contactId, addr.street, addr.city, addr.state, addr.postalCode, addr.country, addr.type);
        const addressId = addrResult.lastInsertRowid;

        // Geocode in background
        geocodeAddress({
          street: addr.street,
          city: addr.city,
          state: addr.state,
          postalCode: addr.postalCode,
          country: addr.country
        }).then(coords => {
          if (coords && isValidCoordinate(coords.latitude, coords.longitude)) {
            updateGeocode.run(coords.latitude, coords.longitude, addressId);
          }
        }).catch(err => {
          console.error('Background geocoding error:', err);
        });
      }
    }

    // Insert social profiles
    if (data.socialProfiles && data.socialProfiles.length > 0) {
      const insertSocial = db.prepare(`
        INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url, type)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const profile of data.socialProfiles) {
        insertSocial.run(contactId, profile.platform, profile.username, profile.profileUrl, profile.type);
      }
    }

    // Insert categories
    if (data.categories && data.categories.length > 0) {
      const insertCategory = db.prepare(`
        INSERT INTO contact_categories (contact_id, category)
        VALUES (?, ?)
      `);
      for (const cat of data.categories) {
        insertCategory.run(contactId, cat.category);
      }
    }

    // Insert instant messages
    if (data.instantMessages && data.instantMessages.length > 0) {
      const insertIM = db.prepare(`
        INSERT INTO contact_instant_messages (contact_id, service, handle, type)
        VALUES (?, ?, ?, ?)
      `);
      for (const im of data.instantMessages) {
        insertIM.run(contactId, im.service, im.handle, im.type);
      }
    }

    // Insert URLs
    if (data.urls && data.urls.length > 0) {
      const insertUrl = db.prepare(`
        INSERT INTO contact_urls (contact_id, url, label, type)
        VALUES (?, ?, ?, ?)
      `);
      for (const url of data.urls) {
        insertUrl.run(contactId, url.url, url.label, url.type);
      }
    }

    // Insert related people
    if (data.relatedPeople && data.relatedPeople.length > 0) {
      const insertRelated = db.prepare(`
        INSERT INTO contact_related_people (contact_id, name, relationship)
        VALUES (?, ?, ?)
      `);
      for (const person of data.relatedPeople) {
        insertRelated.run(contactId, person.name, person.relationship);
      }
    }

    // Update FTS5 index for search
    rebuildContactSearch(db, contactId);

    // Fetch and return the created contact
    const contact = db.prepare(`
      SELECT
        id, first_name, last_name, display_name, company, title, notes, birthday,
        photo_hash, raw_vcard, created_at, updated_at
      FROM contacts
      WHERE id = ?
    `).get(contactId) as ContactRow;

    const emails = db.prepare(`
      SELECT id, contact_id, email, type, is_primary
      FROM contact_emails
      WHERE contact_id = ?
    `).all(contactId) as EmailRow[];

    const phones = db.prepare(`
      SELECT id, contact_id, phone, phone_display, country_code, type, is_primary
      FROM contact_phones
      WHERE contact_id = ?
    `).all(contactId) as PhoneRow[];

    const addresses = db.prepare(`
      SELECT id, contact_id, street, city, state, postal_code, country, type
      FROM contact_addresses
      WHERE contact_id = ?
    `).all(contactId) as AddressRow[];

    const socialProfiles = db.prepare(`
      SELECT id, contact_id, platform, username, profile_url, type
      FROM contact_social_profiles
      WHERE contact_id = ?
    `).all(contactId) as SocialProfileRow[];

    const categories = db.prepare(`
      SELECT id, contact_id, category
      FROM contact_categories
      WHERE contact_id = ?
    `).all(contactId) as CategoryRow[];

    const instantMessages = db.prepare(`
      SELECT id, contact_id, service, handle, type
      FROM contact_instant_messages
      WHERE contact_id = ?
    `).all(contactId) as InstantMessageRow[];

    const urls = db.prepare(`
      SELECT id, contact_id, url, label, type
      FROM contact_urls
      WHERE contact_id = ?
    `).all(contactId) as UrlRow[];

    const relatedPeople = db.prepare(`
      SELECT id, contact_id, name, relationship
      FROM contact_related_people
      WHERE contact_id = ?
    `).all(contactId) as RelatedPersonRow[];

    reply.status(201);
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

    // Fetch LinkedIn enrichment data if available
    interface LinkedInEnrichmentRow {
      linkedin_first_name: string | null;
      linkedin_last_name: string | null;
      headline: string | null;
      about: string | null;
      job_title: string | null;
      company_name: string | null;
      company_linkedin_url: string | null;
      industry: string | null;
      country: string | null;
      location: string | null;
      followers_count: number | null;
      education: string | null;
      skills: string | null;
      photo_linkedin: string | null;
      enriched_at: string | null;
      positions: string | null;
      certifications: string | null;
      languages: string | null;
      honors: string | null;
    }

    const enrichment = db.prepare(`
      SELECT linkedin_first_name, linkedin_last_name, headline, about,
             job_title, company_name, company_linkedin_url, industry,
             country, location, followers_count, education, skills,
             photo_linkedin, enriched_at, positions, certifications,
             languages, honors
      FROM linkedin_enrichment WHERE contact_id = ?
    `).get(id) as LinkedInEnrichmentRow | undefined;

    // Fetch contact photos from all sources
    const contactPhotos = db.prepare(`
      SELECT id, source, original_url, local_hash, is_primary
      FROM contact_photos
      WHERE contact_id = ?
      ORDER BY is_primary DESC, fetched_at ASC
    `).all(id) as Array<{ id: number; source: string; original_url: string | null; local_hash: string | null; is_primary: number }>;

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
      photoUrl: getPhotoUrl(contact.photo_hash, 'medium'),
      photos: contactPhotos.map(p => ({
        id: p.id,
        source: p.source,
        url: getPhotoUrl(p.local_hash, 'thumbnail'),
        isPrimary: p.is_primary === 1,
      })),
      linkedinEnrichment: enrichment ? {
        linkedinFirstName: enrichment.linkedin_first_name,
        linkedinLastName: enrichment.linkedin_last_name,
        headline: enrichment.headline,
        about: enrichment.about,
        jobTitle: enrichment.job_title,
        companyName: enrichment.company_name,
        companyLinkedinUrl: enrichment.company_linkedin_url,
        industry: enrichment.industry,
        country: enrichment.country,
        location: enrichment.location,
        followersCount: enrichment.followers_count,
        education: enrichment.education ? JSON.parse(enrichment.education) : null,
        skills: enrichment.skills ? (() => {
          const parsed = JSON.parse(enrichment.skills);
          if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
            const names = [...new Set(parsed.map((s: { name: string }) => s.name).filter(Boolean))];
            return names.slice(0, 20);
          }
          return parsed;
        })() : null,
        photoLinkedin: enrichment.photo_linkedin,
        enrichedAt: enrichment.enriched_at,
        positions: enrichment.positions ? JSON.parse(enrichment.positions) : null,
        certifications: enrichment.certifications ? JSON.parse(enrichment.certifications) : null,
        languages: enrichment.languages ? JSON.parse(enrichment.languages) : null,
        honors: enrichment.honors ? JSON.parse(enrichment.honors) : null,
      } : null
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

    // Update addresses (delete all and re-insert, then geocode in background)
    if (updates.addresses !== undefined) {
      db.prepare('DELETE FROM contact_addresses WHERE contact_id = ?').run(id);
      const insertAddress = db.prepare(`
        INSERT INTO contact_addresses (contact_id, street, city, state, postal_code, country, type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const updateGeocode = db.prepare(`
        UPDATE contact_addresses
        SET latitude = ?, longitude = ?, geocoded_at = datetime('now')
        WHERE id = ?
      `);

      for (const addr of updates.addresses) {
        const result = insertAddress.run(id, addr.street, addr.city, addr.state, addr.postalCode, addr.country, addr.type);
        const addressId = result.lastInsertRowid;

        // Geocode in background (don't await to keep response fast)
        geocodeAddress({
          street: addr.street,
          city: addr.city,
          state: addr.state,
          postalCode: addr.postalCode,
          country: addr.country
        }).then(coords => {
          if (coords && isValidCoordinate(coords.latitude, coords.longitude)) {
            updateGeocode.run(coords.latitude, coords.longitude, addressId);
          }
        }).catch(err => {
          console.error('Background geocoding error:', err);
        });
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

    // Fetch LinkedIn enrichment data if available
    interface LinkedInEnrichmentRow {
      linkedin_first_name: string | null;
      linkedin_last_name: string | null;
      headline: string | null;
      about: string | null;
      job_title: string | null;
      company_name: string | null;
      company_linkedin_url: string | null;
      industry: string | null;
      country: string | null;
      location: string | null;
      followers_count: number | null;
      education: string | null;
      skills: string | null;
      photo_linkedin: string | null;
      enriched_at: string | null;
      positions: string | null;
      certifications: string | null;
      languages: string | null;
      honors: string | null;
    }

    const enrichment = db.prepare(`
      SELECT linkedin_first_name, linkedin_last_name, headline, about,
             job_title, company_name, company_linkedin_url, industry,
             country, location, followers_count, education, skills,
             photo_linkedin, enriched_at, positions, certifications,
             languages, honors
      FROM linkedin_enrichment WHERE contact_id = ?
    `).get(id) as LinkedInEnrichmentRow | undefined;

    // Fetch contact photos from all sources
    const contactPhotos = db.prepare(`
      SELECT id, source, original_url, local_hash, is_primary
      FROM contact_photos
      WHERE contact_id = ?
      ORDER BY is_primary DESC, fetched_at ASC
    `).all(id) as Array<{ id: number; source: string; original_url: string | null; local_hash: string | null; is_primary: number }>;

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
      photoUrl: getPhotoUrl(contact.photo_hash, 'medium'),
      photos: contactPhotos.map(p => ({
        id: p.id,
        source: p.source,
        url: getPhotoUrl(p.local_hash, 'thumbnail'),
        isPrimary: p.is_primary === 1,
      })),
      linkedinEnrichment: enrichment ? {
        linkedinFirstName: enrichment.linkedin_first_name,
        linkedinLastName: enrichment.linkedin_last_name,
        headline: enrichment.headline,
        about: enrichment.about,
        jobTitle: enrichment.job_title,
        companyName: enrichment.company_name,
        companyLinkedinUrl: enrichment.company_linkedin_url,
        industry: enrichment.industry,
        country: enrichment.country,
        location: enrichment.location,
        followersCount: enrichment.followers_count,
        education: enrichment.education ? JSON.parse(enrichment.education) : null,
        skills: enrichment.skills ? (() => {
          const parsed = JSON.parse(enrichment.skills);
          if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
            const names = [...new Set(parsed.map((s: { name: string }) => s.name).filter(Boolean))];
            return names.slice(0, 20);
          }
          return parsed;
        })() : null,
        photoLinkedin: enrichment.photo_linkedin,
        enrichedAt: enrichment.enriched_at,
        positions: enrichment.positions ? JSON.parse(enrichment.positions) : null,
        certifications: enrichment.certifications ? JSON.parse(enrichment.certifications) : null,
        languages: enrichment.languages ? JSON.parse(enrichment.languages) : null,
        honors: enrichment.honors ? JSON.parse(enrichment.honors) : null,
      } : null
    };
  });

  // GET /api/contacts/:id/photos - Get all photos for a contact
  fastify.get<{ Params: ContactIdParams }>('/:id/photos', {
    schema: {
      params: ContactIdParamsSchema,
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const db = getDatabase();

    const contact = db.prepare('SELECT id FROM contacts WHERE id = ?').get(id);
    if (!contact) {
      return reply.status(404).send({ error: 'Contact not found' });
    }

    const photos = db.prepare(`
      SELECT id, source, original_url, local_hash, is_primary
      FROM contact_photos
      WHERE contact_id = ?
      ORDER BY is_primary DESC, fetched_at ASC
    `).all(id) as Array<{ id: number; source: string; original_url: string | null; local_hash: string | null; is_primary: number }>;

    return photos.map(p => ({
      id: p.id,
      source: p.source,
      url: getPhotoUrl(p.local_hash, 'thumbnail'),
      isPrimary: p.is_primary === 1,
    }));
  });

  // POST /api/contacts/:id/photos/:photoId/primary - Set a photo as primary
  fastify.post<{ Params: { id: string; photoId: string } }>('/:id/photos/:photoId/primary', {
    schema: {
      params: {
        type: 'object',
        required: ['id', 'photoId'],
        properties: {
          id: { type: 'string' },
          photoId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const contactId = parseInt(request.params.id, 10);
    const photoId = parseInt(request.params.photoId, 10);

    if (isNaN(contactId) || isNaN(photoId)) {
      return reply.status(400).send({ error: 'Invalid ID' });
    }

    const db = getDatabase();

    // Verify the photo belongs to this contact
    const photo = db.prepare(`
      SELECT id, local_hash FROM contact_photos WHERE id = ? AND contact_id = ?
    `).get(photoId, contactId) as { id: number; local_hash: string | null } | undefined;

    if (!photo) {
      return reply.status(404).send({ error: 'Photo not found' });
    }

    db.transaction(() => {
      // Remove primary from all contact's photos
      db.prepare('UPDATE contact_photos SET is_primary = 0 WHERE contact_id = ?').run(contactId);
      // Set new primary
      db.prepare('UPDATE contact_photos SET is_primary = 1 WHERE id = ?').run(photoId);
      // Update contacts.photo_hash to match the selected photo
      if (photo.local_hash) {
        db.prepare('UPDATE contacts SET photo_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(photo.local_hash, contactId);
      }
    })();

    return { success: true };
  });

  // POST /api/contacts/merge/preview - Check for conflicts before merging
  fastify.post<{ Body: { contactIds: number[] } }>('/merge/preview', {
    schema: {
      body: {
        type: 'object',
        required: ['contactIds'],
        properties: {
          contactIds: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            conflicts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  values: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        contactId: { type: 'number' },
                        contactName: { type: 'string' },
                        value: { type: 'string' }
                      }
                    }
                  }
                }
              }
            },
            contacts: {
              type: 'array',
              items: ContactDetailSchema
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { contactIds } = request.body;

    try {
      const result = detectMergeConflicts(contactIds);
      return result;
    } catch (error) {
      fastify.log.error(error, 'Merge conflict detection failed');
      return reply.status(500).send({ error: 'Contact merge failed. Please try again.' });
    }
  });

  // POST /api/contacts/merge - Merge contacts with optional conflict resolutions
  fastify.post<{
    Body: {
      contactIds: number[];
      primaryContactId: number;
      resolutions?: Record<string, string | null>;
    }
  }>('/merge', {
    schema: {
      body: {
        type: 'object',
        required: ['contactIds', 'primaryContactId'],
        properties: {
          contactIds: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2
          },
          primaryContactId: { type: 'number' },
          resolutions: {
            type: 'object',
            additionalProperties: { type: ['string', 'null'] }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            mergedContact: ContactDetailSchema,
            deletedContactIds: {
              type: 'array',
              items: { type: 'number' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { contactIds, primaryContactId, resolutions } = request.body;

    try {
      const result = mergeContactsWithResolutions(contactIds, primaryContactId, resolutions);
      return result;
    } catch (error) {
      fastify.log.error(error, 'Contact merge failed');
      return reply.status(500).send({ error: 'Contact update failed. Please try again.' });
    }
  });

  // GET /api/contacts/export/vcf - Export all contacts as VCF
  // Query params:
  //   regenerate=true - Regenerate vCards from DB fields with country-formatted addresses
  fastify.get<{
    Querystring: { regenerate?: string }
  }>('/export/vcf', async (request, reply) => {
    const db = getDatabase();
    const regenerate = request.query.regenerate === 'true';

    let vcfContent: string;

    if (regenerate) {
      // Regenerate vCards from database fields
      const contacts = db.prepare(`
        SELECT
          id, first_name, last_name, display_name, company, title, notes, birthday
        FROM contacts
        WHERE archived_at IS NULL
      `).all() as Array<{
        id: number;
        first_name: string | null;
        last_name: string | null;
        display_name: string;
        company: string | null;
        title: string | null;
        notes: string | null;
        birthday: string | null;
      }>;

      const vcards: string[] = [];

      for (const contact of contacts) {
        // Fetch related data
        const emails = db.prepare(`
          SELECT email, type, is_primary FROM contact_emails WHERE contact_id = ?
        `).all(contact.id) as Array<{ email: string; type: string | null; is_primary: number }>;

        const phones = db.prepare(`
          SELECT phone, phone_display, type, is_primary FROM contact_phones WHERE contact_id = ?
        `).all(contact.id) as Array<{ phone: string; phone_display: string; type: string | null; is_primary: number }>;

        const addresses = db.prepare(`
          SELECT street, city, state, postal_code, country, type FROM contact_addresses WHERE contact_id = ?
        `).all(contact.id) as Array<{
          street: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country: string | null;
          type: string | null;
        }>;

        const socialProfiles = db.prepare(`
          SELECT platform, username, profile_url FROM contact_social_profiles WHERE contact_id = ?
        `).all(contact.id) as Array<{ platform: string; username: string | null; profile_url: string | null }>;

        const categories = db.prepare(`
          SELECT name FROM contact_categories WHERE contact_id = ?
        `).all(contact.id) as Array<{ name: string }>;

        const contactForVcard: ContactForVcard = {
          firstName: contact.first_name,
          lastName: contact.last_name,
          displayName: contact.display_name,
          company: contact.company,
          title: contact.title,
          notes: contact.notes,
          birthday: contact.birthday,
          emails: emails.map(e => ({
            email: e.email,
            type: e.type,
            isPrimary: e.is_primary === 1
          })),
          phones: phones.map(p => ({
            phone: p.phone,
            phoneDisplay: p.phone_display,
            type: p.type,
            isPrimary: p.is_primary === 1
          })),
          addresses: addresses.map(a => ({
            street: a.street,
            city: a.city,
            state: a.state,
            postalCode: a.postal_code,
            country: a.country,
            type: a.type
          })),
          socialProfiles: socialProfiles.map(s => ({
            platform: s.platform,
            username: s.username,
            profileUrl: s.profile_url
          })),
          categories: categories.map(c => c.name)
        };

        vcards.push(generateVcard(contactForVcard));
      }

      vcfContent = vcards.join('\r\n');
    } else {
      // Return original raw_vcard data (existing behavior)
      const contacts = db.prepare(`
        SELECT raw_vcard FROM contacts WHERE raw_vcard IS NOT NULL AND archived_at IS NULL
      `).all() as Array<{ raw_vcard: string }>;

      vcfContent = contacts.map(c => c.raw_vcard).join('\n');
    }

    reply.header('Content-Type', 'text/vcard');
    reply.header('Content-Disposition', 'attachment; filename="contacts.vcf"');
    return vcfContent;
  });

  // DELETE /api/contacts/all - Delete all contacts (danger zone)
  fastify.delete('/all', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            deletedCount: { type: 'number' }
          }
        }
      }
    }
  }, async (_request, _reply) => {
    const db = getDatabase();

    const countResult = db.prepare('SELECT COUNT(*) as count FROM contacts').get() as { count: number };
    const count = countResult.count;

    db.prepare('DELETE FROM contacts').run();
    db.prepare('DELETE FROM contacts_unified_fts').run();

    return { deletedCount: count };
  });
}
