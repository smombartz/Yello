import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import type { Database as DatabaseType } from 'better-sqlite3';
import { getUserDatabase } from '../services/userDatabase.js';
import { getAuthDatabase } from '../services/authDatabase.js';
import { rebuildContactSearch } from '../services/database.js';
import { getPhotoUrl } from '../services/photoProcessor.js';
import {
  UserProfileSchema,
  UpdateUserProfileSchema,
  UpdateUserProfile,
  UserProfile,
  ProfileEmail,
  ProfilePhone,
  ProfileAddress,
  ProfileSocialLink,
  ProfileVisibility,
  ContactSearchResultSchema,
  ContactSearchResult,
  LinkProfileToContactSchema,
  LinkProfileToContact,
  LinkedContact,
} from '../schemas/profile.js';

interface ProfileRow {
  id: number;
  user_id: number;
  linked_contact_id: number | null;
  is_public: number;
  public_slug: string | null;
  tagline: string | null;
  notes: string | null;
  visibility_json: string | null;
  created_at: string;
  updated_at: string;
}

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
}

interface ContactListRow {
  id: number;
  display_name: string;
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
}

interface UrlRow {
  id: number;
  contact_id: number;
  url: string;
  label: string | null;
}

// Ensure the auth DB has a profile_slugs mapping table for public profile lookups
function ensureProfileSlugTable(): void {
  const authDb = getAuthDatabase();
  authDb.exec(`
    CREATE TABLE IF NOT EXISTS profile_slugs (
      slug TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

// Sync a profile slug to the auth DB mapping table
function syncProfileSlug(userId: number, slug: string | null): void {
  const authDb = getAuthDatabase();
  ensureProfileSlugTable();
  // Remove any existing slug for this user
  authDb.prepare('DELETE FROM profile_slugs WHERE user_id = ?').run(userId);
  // Insert new slug if present
  if (slug) {
    authDb.prepare('INSERT OR REPLACE INTO profile_slugs (slug, user_id) VALUES (?, ?)').run(slug, userId);
  }
}

// Lookup user_id by public slug from the auth DB
function lookupUserIdBySlug(slug: string): number | null {
  const authDb = getAuthDatabase();
  ensureProfileSlugTable();
  const row = authDb.prepare('SELECT user_id FROM profile_slugs WHERE slug = ?').get(slug) as { user_id: number } | undefined;
  return row?.user_id ?? null;
}

// Generate a unique slug for public profile URL
function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let slug = '';
  for (let i = 0; i < 8; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

// Get default visibility settings - all fields hidden by default for privacy
function getDefaultVisibility(): ProfileVisibility {
  return {
    avatar: false,
    firstName: false,
    lastName: false,
    tagline: false,
    company: false,
    title: false,
    emails: {},
    phones: {},
    addresses: {},
    website: false,
    linkedin: false,
    instagram: false,
    whatsapp: false,
    otherSocialLinks: {},
    birthday: false,
  };
}

// Initialize tables for user profile
function ensureProfileTables(db: DatabaseType): void {
  // Check if table exists first
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='user_profiles'
  `).get();

  if (!tableExists) {
    // Fresh install - create table with all columns including linked_contact_id
    db.exec(`
      CREATE TABLE user_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        linked_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
        is_public INTEGER DEFAULT 0,
        public_slug TEXT UNIQUE,
        tagline TEXT,
        notes TEXT,
        visibility_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
      CREATE INDEX idx_user_profiles_public_slug ON user_profiles(public_slug);
      CREATE INDEX idx_user_profiles_linked_contact ON user_profiles(linked_contact_id);
    `);
  } else {
    // Table exists - check if we need to migrate
    const tableInfo = db.prepare("PRAGMA table_info(user_profiles)").all() as Array<{ name: string }>;
    const hasLinkedContactId = tableInfo.some(col => col.name === 'linked_contact_id');

    if (!hasLinkedContactId) {
      console.log('Adding linked_contact_id column to user_profiles...');
      db.exec(`
        ALTER TABLE user_profiles ADD COLUMN linked_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_user_profiles_linked_contact ON user_profiles(linked_contact_id);
      `);
    }

    // Drop legacy columns now that profiles link to contacts
    const legacyColumns = ['first_name', 'last_name', 'company', 'title',
                           'website', 'linkedin', 'instagram', 'whatsapp',
                           'birthday', 'avatar_url'];

    for (const col of legacyColumns) {
      if (tableInfo.some(c => c.name === col)) {
        try {
          db.exec(`ALTER TABLE user_profiles DROP COLUMN ${col}`);
          console.log(`Dropped legacy column: ${col}`);
        } catch (e) {
          // Column might be in use or SQLite version doesn't support DROP COLUMN
        }
      }
    }
  }
}

// Get or create user profile
function getOrCreateProfile(db: DatabaseType, userId: number): ProfileRow {
  let profile = db.prepare(`
    SELECT id, user_id, linked_contact_id, is_public, public_slug, tagline, notes, visibility_json, created_at, updated_at
    FROM user_profiles WHERE user_id = ?
  `).get(userId) as ProfileRow | undefined;

  if (!profile) {
    // Create new profile with a unique slug
    let slug: string;
    let attempts = 0;
    do {
      slug = generateSlug();
      const existing = db.prepare('SELECT id FROM user_profiles WHERE public_slug = ?').get(slug);
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    db.prepare(`
      INSERT INTO user_profiles (user_id, public_slug, visibility_json)
      VALUES (?, ?, ?)
    `).run(userId, slug, JSON.stringify(getDefaultVisibility()));

    // Sync slug to auth DB for public lookup
    syncProfileSlug(userId, slug);

    profile = db.prepare(`
      SELECT id, user_id, linked_contact_id, is_public, public_slug, tagline, notes, visibility_json, created_at, updated_at
      FROM user_profiles WHERE user_id = ?
    `).get(userId) as ProfileRow;
  }

  return profile;
}

// Get linked contact info
function getLinkedContactInfo(db: DatabaseType, contactId: number): LinkedContact | null {
  const contact = db.prepare(`
    SELECT id, display_name, photo_hash FROM contacts WHERE id = ?
  `).get(contactId) as { id: number; display_name: string; photo_hash: string | null } | undefined;

  if (!contact) return null;

  return {
    id: contact.id,
    displayName: contact.display_name,
    photoUrl: getPhotoUrl(contact.photo_hash, 'small'),
  };
}

// Get contact details for profile
function getContactData(db: DatabaseType, contactId: number) {
  const contact = db.prepare(`
    SELECT id, first_name, last_name, display_name, company, title, notes, birthday, photo_hash
    FROM contacts WHERE id = ?
  `).get(contactId) as ContactRow | undefined;

  if (!contact) return null;

  const emails = db.prepare(`
    SELECT id, contact_id, email, type, is_primary FROM contact_emails WHERE contact_id = ?
  `).all(contactId) as EmailRow[];

  const phones = db.prepare(`
    SELECT id, contact_id, phone, phone_display, country_code, type, is_primary FROM contact_phones WHERE contact_id = ?
  `).all(contactId) as PhoneRow[];

  const addresses = db.prepare(`
    SELECT id, contact_id, street, city, state, postal_code, country, type FROM contact_addresses WHERE contact_id = ?
  `).all(contactId) as AddressRow[];

  const socialProfiles = db.prepare(`
    SELECT id, contact_id, platform, username, profile_url FROM contact_social_profiles WHERE contact_id = ?
  `).all(contactId) as SocialProfileRow[];

  const urls = db.prepare(`
    SELECT id, contact_id, url, label FROM contact_urls WHERE contact_id = ?
  `).all(contactId) as UrlRow[];

  // Extract social links from URLs and social profiles
  let website: string | null = null;
  let linkedin: string | null = null;
  let instagram: string | null = null;
  let whatsapp: string | null = null;
  const otherSocialLinks: ProfileSocialLink[] = [];

  // Check URLs for website
  for (const url of urls) {
    if (url.label?.toLowerCase() === 'website' || url.label?.toLowerCase() === 'homepage') {
      website = url.url;
    } else if (url.url.includes('linkedin.com')) {
      linkedin = url.url;
    } else if (url.url.includes('instagram.com')) {
      instagram = url.url.includes('instagram.com/') ? url.url.split('instagram.com/')[1]?.split('/')[0] || null : null;
    }
  }

  // Check social profiles
  for (const sp of socialProfiles) {
    const platform = sp.platform.toLowerCase();
    if (platform === 'linkedin') {
      linkedin = sp.profile_url || `https://linkedin.com/in/${sp.username}`;
    } else if (platform === 'instagram') {
      instagram = sp.username;
    } else if (platform === 'whatsapp') {
      whatsapp = sp.username;
    } else {
      otherSocialLinks.push({
        id: String(sp.id),
        platform: sp.platform,
        username: sp.username,
        profileUrl: sp.profile_url,
      });
    }
  }

  return {
    firstName: contact.first_name,
    lastName: contact.last_name,
    displayName: contact.display_name,
    company: contact.company,
    title: contact.title,
    birthday: contact.birthday,
    avatarUrl: getPhotoUrl(contact.photo_hash, 'medium'),
    emails: emails.map((e): ProfileEmail => ({
      email: e.email,
      type: e.type,
      isPrimary: e.is_primary === 1,
    })),
    phones: phones.map((p): ProfilePhone => ({
      phone: p.phone,
      phoneDisplay: p.phone_display,
      countryCode: p.country_code,
      type: p.type,
      isPrimary: p.is_primary === 1,
    })),
    addresses: addresses.map((a): ProfileAddress => ({
      id: String(a.id),
      street: a.street,
      city: a.city,
      state: a.state,
      postalCode: a.postal_code,
      country: a.country,
      type: a.type,
    })),
    website,
    linkedin,
    instagram,
    whatsapp,
    otherSocialLinks,
  };
}

// Build full profile response
function buildProfileResponse(
  db: DatabaseType,
  profile: ProfileRow,
  baseUrl: string
): UserProfile {
  const visibility: ProfileVisibility = profile.visibility_json
    ? JSON.parse(profile.visibility_json)
    : getDefaultVisibility();

  // If linked to a contact, get data from contact
  if (profile.linked_contact_id) {
    const linkedContact = getLinkedContactInfo(db, profile.linked_contact_id);
    const contactData = getContactData(db, profile.linked_contact_id);

    if (contactData && linkedContact) {
      return {
        linkedContactId: profile.linked_contact_id,
        linkedContact,
        isPublic: profile.is_public === 1,
        publicUrl: profile.is_public === 1 && profile.public_slug
          ? `${baseUrl}/p/${profile.public_slug}`
          : null,
        publicSlug: profile.public_slug,
        avatarUrl: contactData.avatarUrl,
        firstName: contactData.firstName,
        lastName: contactData.lastName,
        tagline: profile.tagline,
        company: contactData.company,
        title: contactData.title,
        emails: contactData.emails,
        phones: contactData.phones,
        addresses: contactData.addresses,
        website: contactData.website,
        linkedin: contactData.linkedin,
        instagram: contactData.instagram,
        whatsapp: contactData.whatsapp,
        otherSocialLinks: contactData.otherSocialLinks,
        birthday: contactData.birthday,
        notes: profile.notes,
        visibility,
      };
    }
  }

  // Not linked - return empty profile
  return {
    linkedContactId: null,
    linkedContact: null,
    isPublic: profile.is_public === 1,
    publicUrl: profile.is_public === 1 && profile.public_slug
      ? `${baseUrl}/p/${profile.public_slug}`
      : null,
    publicSlug: profile.public_slug,
    avatarUrl: null,
    firstName: null,
    lastName: null,
    tagline: profile.tagline,
    company: null,
    title: null,
    emails: [],
    phones: [],
    addresses: [],
    website: null,
    linkedin: null,
    instagram: null,
    whatsapp: null,
    otherSocialLinks: [],
    birthday: null,
    notes: profile.notes,
    visibility,
  };
}

export default async function profileRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // Helper to get user DB with profile tables ensured
  function getProfileDb(userId: number): DatabaseType {
    const db = getUserDatabase(userId);
    ensureProfileTables(db);
    return db;
  }

  // GET /api/profile - Get current user's profile
  fastify.get('/', {
    schema: {
      response: {
        200: UserProfileSchema,
        401: { type: 'object', properties: { error: { type: 'string' } } },
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const db = getProfileDb(userId);

    const profile = getOrCreateProfile(db, userId);
    const baseUrl = `${request.protocol}://${request.hostname}`;
    return buildProfileResponse(db, profile, baseUrl);
  });

  // GET /api/profile/contacts/search - Search contacts for linking
  fastify.get<{ Querystring: { q: string } }>('/contacts/search', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', minLength: 1 }
        },
        required: ['q']
      },
      response: {
        200: {
          type: 'array',
          items: ContactSearchResultSchema
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { q: string } }>, reply: FastifyReply) => {
    const userId = request.user!.id;
    const db = getProfileDb(userId);

    const { q } = request.query;
    const escapedSearch = q.replace(/"/g, '""');
    const searchTerm = `"${escapedSearch}"*`;

    const contacts = db.prepare(`
      SELECT DISTINCT
        c.id,
        c.display_name,
        c.photo_hash,
        (SELECT email FROM contact_emails WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_email,
        (SELECT phone_display FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_phone
      FROM contacts c
      WHERE c.id IN (SELECT rowid FROM contacts_unified_fts WHERE contacts_unified_fts MATCH ?)
      ORDER BY c.last_name, c.first_name, c.display_name
      LIMIT 10
    `).all(searchTerm) as ContactListRow[];

    return contacts.map((c): ContactSearchResult => ({
      id: c.id,
      displayName: c.display_name,
      photoUrl: getPhotoUrl(c.photo_hash, 'small'),
      primaryEmail: c.primary_email,
      primaryPhone: c.primary_phone,
    }));
  });

  // POST /api/profile/link - Link profile to a contact
  fastify.post<{ Body: LinkProfileToContact }>('/link', {
    schema: {
      body: LinkProfileToContactSchema,
      response: {
        200: UserProfileSchema,
        400: { type: 'object', properties: { error: { type: 'string' } } },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      }
    }
  }, async (request: FastifyRequest<{ Body: LinkProfileToContact }>, reply: FastifyReply) => {
    const userId = request.user!.id;
    const db = getProfileDb(userId);

    const { contactId } = request.body;

    // Verify contact exists
    const contact = db.prepare('SELECT id FROM contacts WHERE id = ?').get(contactId);
    if (!contact) {
      return reply.status(404).send({ error: 'Contact not found' });
    }

    const profile = getOrCreateProfile(db, userId);

    // Update profile to link to contact
    db.prepare(`
      UPDATE user_profiles
      SET linked_contact_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(contactId, profile.id);

    // Fetch updated profile
    const updatedProfile = db.prepare(`
      SELECT id, user_id, linked_contact_id, is_public, public_slug, tagline, notes, visibility_json, created_at, updated_at
      FROM user_profiles WHERE id = ?
    `).get(profile.id) as ProfileRow;

    const baseUrl = `${request.protocol}://${request.hostname}`;
    return buildProfileResponse(db, updatedProfile, baseUrl);
  });

  // POST /api/profile/unlink - Unlink profile from contact
  fastify.post('/unlink', {
    schema: {
      response: {
        200: UserProfileSchema,
        401: { type: 'object', properties: { error: { type: 'string' } } },
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const db = getProfileDb(userId);

    const profile = getOrCreateProfile(db, userId);

    // Update profile to unlink from contact
    db.prepare(`
      UPDATE user_profiles
      SET linked_contact_id = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(profile.id);

    // Fetch updated profile
    const updatedProfile = db.prepare(`
      SELECT id, user_id, linked_contact_id, is_public, public_slug, tagline, notes, visibility_json, created_at, updated_at
      FROM user_profiles WHERE id = ?
    `).get(profile.id) as ProfileRow;

    const baseUrl = `${request.protocol}://${request.hostname}`;
    return buildProfileResponse(db, updatedProfile, baseUrl);
  });

  // POST /api/profile/create-contact - Create a new contact and link it to profile
  fastify.post<{ Body: { displayName: string } }>('/create-contact', {
    schema: {
      body: {
        type: 'object',
        properties: {
          displayName: { type: 'string', minLength: 1 }
        },
        required: ['displayName']
      },
      response: {
        200: UserProfileSchema,
        401: { type: 'object', properties: { error: { type: 'string' } } },
      }
    }
  }, async (request: FastifyRequest<{ Body: { displayName: string } }>, reply: FastifyReply) => {
    const userId = request.user!.id;
    const db = getProfileDb(userId);

    const { displayName } = request.body;

    // Parse display name into first/last
    const parts = displayName.trim().split(/\s+/);
    const firstName = parts[0] || null;
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;

    // Create new contact
    const result = db.prepare(`
      INSERT INTO contacts (first_name, last_name, display_name, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(firstName, lastName, displayName);

    const contactId = result.lastInsertRowid as number;

    // Update FTS index
    rebuildContactSearch(db, contactId);

    // Link profile to the new contact
    const profile = getOrCreateProfile(db, userId);
    db.prepare(`
      UPDATE user_profiles
      SET linked_contact_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(contactId, profile.id);

    // Fetch updated profile
    const updatedProfile = db.prepare(`
      SELECT id, user_id, linked_contact_id, is_public, public_slug, tagline, notes, visibility_json, created_at, updated_at
      FROM user_profiles WHERE id = ?
    `).get(profile.id) as ProfileRow;

    const baseUrl = `${request.protocol}://${request.hostname}`;
    return buildProfileResponse(db, updatedProfile, baseUrl);
  });

  // PUT /api/profile - Update current user's profile (and linked contact)
  fastify.put<{ Body: UpdateUserProfile }>('/', {
    schema: {
      body: UpdateUserProfileSchema,
      response: {
        200: UserProfileSchema,
        401: { type: 'object', properties: { error: { type: 'string' } } },
        500: { type: 'object', properties: { error: { type: 'string' } } },
      }
    }
  }, async (request: FastifyRequest<{ Body: UpdateUserProfile }>, reply: FastifyReply) => {
    const userId = request.user!.id;
    const db = getProfileDb(userId);

    const updates = request.body;
    const profile = getOrCreateProfile(db, userId);

    // Update profile-specific fields (visibility, public settings, tagline, notes)
    const profileFields: string[] = [];
    const profileValues: (string | number | null)[] = [];

    if (updates.isPublic !== undefined) {
      profileFields.push('is_public = ?');
      profileValues.push(updates.isPublic ? 1 : 0);
    }
    if (updates.publicSlug !== undefined) {
      // Check slug is unique
      if (updates.publicSlug) {
        const existing = db.prepare('SELECT id FROM user_profiles WHERE public_slug = ? AND id != ?').get(updates.publicSlug, profile.id);
        if (existing) {
          return reply.status(400).send({ error: 'This URL is already taken' });
        }
      }
      profileFields.push('public_slug = ?');
      profileValues.push(updates.publicSlug);
    }
    if (updates.tagline !== undefined) {
      profileFields.push('tagline = ?');
      profileValues.push(updates.tagline);
    }
    if (updates.notes !== undefined) {
      profileFields.push('notes = ?');
      profileValues.push(updates.notes);
    }
    if (updates.visibility !== undefined) {
      profileFields.push('visibility_json = ?');
      profileValues.push(JSON.stringify(updates.visibility));
    }

    if (profileFields.length > 0) {
      profileFields.push("updated_at = datetime('now')");
      profileValues.push(profile.id);
      const sql = `UPDATE user_profiles SET ${profileFields.join(', ')} WHERE id = ?`;
      db.prepare(sql).run(...profileValues);
    }

    // Sync slug to auth DB if it changed
    if (updates.publicSlug !== undefined) {
      syncProfileSlug(userId, updates.publicSlug);
    }

    // If linked to a contact, update the contact directly
    if (profile.linked_contact_id) {
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
      if (updates.company !== undefined) {
        contactFields.push('company = ?');
        contactValues.push(updates.company);
      }
      if (updates.title !== undefined) {
        contactFields.push('title = ?');
        contactValues.push(updates.title);
      }
      if (updates.birthday !== undefined) {
        contactFields.push('birthday = ?');
        contactValues.push(updates.birthday);
      }

      // Update display name if first or last name changed
      if (updates.firstName !== undefined || updates.lastName !== undefined) {
        const currentContact = db.prepare('SELECT first_name, last_name FROM contacts WHERE id = ?').get(profile.linked_contact_id) as {
          first_name: string | null;
          last_name: string | null;
        };
        const newFirstName = updates.firstName !== undefined ? updates.firstName : currentContact.first_name;
        const newLastName = updates.lastName !== undefined ? updates.lastName : currentContact.last_name;
        const displayName = [newFirstName, newLastName].filter(Boolean).join(' ') || 'Unnamed';
        contactFields.push('display_name = ?');
        contactValues.push(displayName);
      }

      if (contactFields.length > 0) {
        contactFields.push("updated_at = datetime('now')");
        contactValues.push(String(profile.linked_contact_id));
        const sql = `UPDATE contacts SET ${contactFields.join(', ')} WHERE id = ?`;
        db.prepare(sql).run(...contactValues);
      }

      // Update emails (replace all)
      if (updates.emails !== undefined) {
        db.prepare('DELETE FROM contact_emails WHERE contact_id = ?').run(profile.linked_contact_id);
        const insertEmail = db.prepare(`
          INSERT INTO contact_emails (contact_id, email, type, is_primary)
          VALUES (?, ?, ?, ?)
        `);
        for (const email of updates.emails) {
          insertEmail.run(profile.linked_contact_id, email.email, email.type, email.isPrimary ? 1 : 0);
        }
      }

      // Update phones (replace all)
      if (updates.phones !== undefined) {
        db.prepare('DELETE FROM contact_phones WHERE contact_id = ?').run(profile.linked_contact_id);
        const insertPhone = db.prepare(`
          INSERT INTO contact_phones (contact_id, phone, phone_display, country_code, type, is_primary)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const phone of updates.phones) {
          insertPhone.run(profile.linked_contact_id, phone.phone, phone.phoneDisplay, phone.countryCode, phone.type, phone.isPrimary ? 1 : 0);
        }
      }

      // Update addresses (replace all)
      if (updates.addresses !== undefined) {
        db.prepare('DELETE FROM contact_addresses WHERE contact_id = ?').run(profile.linked_contact_id);
        const insertAddress = db.prepare(`
          INSERT INTO contact_addresses (contact_id, street, city, state, postal_code, country, type)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const addr of updates.addresses) {
          insertAddress.run(profile.linked_contact_id, addr.street, addr.city, addr.state, addr.postalCode, addr.country, addr.type);
        }
      }

      // Update social profiles for linkedin, instagram, whatsapp
      if (updates.linkedin !== undefined || updates.instagram !== undefined || updates.whatsapp !== undefined) {
        // Remove existing linkedin, instagram, whatsapp
        db.prepare(`
          DELETE FROM contact_social_profiles
          WHERE contact_id = ? AND LOWER(platform) IN ('linkedin', 'instagram', 'whatsapp')
        `).run(profile.linked_contact_id);

        const insertSocial = db.prepare(`
          INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url)
          VALUES (?, ?, ?, ?)
        `);

        if (updates.linkedin) {
          const username = updates.linkedin.includes('linkedin.com/in/')
            ? updates.linkedin.split('linkedin.com/in/')[1]?.split('/')[0] || updates.linkedin
            : updates.linkedin;
          insertSocial.run(profile.linked_contact_id, 'LinkedIn', username, updates.linkedin);
        }
        if (updates.instagram) {
          insertSocial.run(profile.linked_contact_id, 'Instagram', updates.instagram, `https://instagram.com/${updates.instagram}`);
        }
        if (updates.whatsapp) {
          insertSocial.run(profile.linked_contact_id, 'WhatsApp', updates.whatsapp, null);
        }
      }

      // Update other social links
      if (updates.otherSocialLinks !== undefined) {
        // Remove non-standard social profiles
        db.prepare(`
          DELETE FROM contact_social_profiles
          WHERE contact_id = ? AND LOWER(platform) NOT IN ('linkedin', 'instagram', 'whatsapp')
        `).run(profile.linked_contact_id);

        const insertSocial = db.prepare(`
          INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url)
          VALUES (?, ?, ?, ?)
        `);
        for (const link of updates.otherSocialLinks) {
          insertSocial.run(profile.linked_contact_id, link.platform, link.username, link.profileUrl);
        }
      }

      // Update website URL
      if (updates.website !== undefined) {
        db.prepare(`
          DELETE FROM contact_urls WHERE contact_id = ? AND (LOWER(label) = 'website' OR LOWER(label) = 'homepage')
        `).run(profile.linked_contact_id);

        if (updates.website) {
          db.prepare(`
            INSERT INTO contact_urls (contact_id, url, label, type)
            VALUES (?, ?, 'Website', 'website')
          `).run(profile.linked_contact_id, updates.website);
        }
      }

      // Rebuild contact search index
      rebuildContactSearch(db, profile.linked_contact_id);
    }

    // Fetch updated profile
    const updatedProfile = db.prepare(`
      SELECT id, user_id, linked_contact_id, is_public, public_slug, tagline, notes, visibility_json, created_at, updated_at
      FROM user_profiles WHERE id = ?
    `).get(profile.id) as ProfileRow;

    const baseUrl = `${request.protocol}://${request.hostname}`;
    return buildProfileResponse(db, updatedProfile, baseUrl);
  });

  // GET /api/profile/public/:slug - Get public profile by slug (no auth required)
  fastify.get<{ Params: { slug: string } }>('/public/:slug', {
    schema: {
      params: {
        type: 'object',
        properties: {
          slug: { type: 'string' }
        },
        required: ['slug']
      },
      response: {
        200: UserProfileSchema,
        404: { type: 'object', properties: { error: { type: 'string' } } },
      }
    }
  }, async (request: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
    const { slug } = request.params;

    // Look up user ID from auth DB slug mapping
    const userId = lookupUserIdBySlug(slug);
    if (!userId) {
      return reply.status(404).send({ error: 'Profile not found' });
    }

    const db = getProfileDb(userId);

    const profile = db.prepare(`
      SELECT id, user_id, linked_contact_id, is_public, public_slug, tagline, notes, visibility_json, created_at, updated_at
      FROM user_profiles WHERE public_slug = ? AND is_public = 1
    `).get(slug) as ProfileRow | undefined;

    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }

    const baseUrl = `${request.protocol}://${request.hostname}`;
    const fullProfile = buildProfileResponse(db, profile, baseUrl);

    // Filter out non-visible fields based on visibility settings
    const visibility = fullProfile.visibility;
    const publicProfile: UserProfile = {
      linkedContactId: null, // Don't expose linked contact info publicly
      linkedContact: null,
      isPublic: true,
      publicUrl: fullProfile.publicUrl,
      publicSlug: fullProfile.publicSlug,
      avatarUrl: visibility.avatar ? fullProfile.avatarUrl : null,
      firstName: visibility.firstName ? fullProfile.firstName : null,
      lastName: visibility.lastName ? fullProfile.lastName : null,
      tagline: visibility.tagline ? fullProfile.tagline : null,
      company: visibility.company ? fullProfile.company : null,
      title: visibility.title ? fullProfile.title : null,
      emails: fullProfile.emails.filter(e => visibility.emails[e.email] === true),
      phones: fullProfile.phones.filter(p => visibility.phones[p.phone] === true),
      addresses: fullProfile.addresses.filter(a => a.id && visibility.addresses[a.id] === true),
      website: visibility.website ? fullProfile.website : null,
      linkedin: visibility.linkedin ? fullProfile.linkedin : null,
      instagram: visibility.instagram ? fullProfile.instagram : null,
      whatsapp: visibility.whatsapp ? fullProfile.whatsapp : null,
      otherSocialLinks: fullProfile.otherSocialLinks.filter(s => s.id && visibility.otherSocialLinks[s.id] === true),
      birthday: visibility.birthday ? fullProfile.birthday : null,
      notes: null, // Notes are always private
      visibility: getDefaultVisibility(), // Don't expose visibility settings
    };

    return publicProfile;
  });
}
