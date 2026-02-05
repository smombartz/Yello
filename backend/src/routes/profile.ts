import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../services/database.js';
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
} from '../schemas/profile.js';

interface ProfileRow {
  id: number;
  user_id: number;
  is_public: number;
  public_slug: string | null;
  avatar_url: string | null;
  first_name: string | null;
  last_name: string | null;
  tagline: string | null;
  company: string | null;
  title: string | null;
  website: string | null;
  linkedin: string | null;
  instagram: string | null;
  whatsapp: string | null;
  birthday: string | null;
  notes: string | null;
  visibility_json: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfileEmailRow {
  id: number;
  profile_id: number;
  email: string;
  type: string | null;
  is_primary: number;
}

interface ProfilePhoneRow {
  id: number;
  profile_id: number;
  phone: string;
  phone_display: string;
  country_code: string | null;
  type: string | null;
  is_primary: number;
}

interface ProfileAddressRow {
  id: number;
  profile_id: number;
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  type: string | null;
}

interface ProfileSocialLinkRow {
  id: number;
  profile_id: number;
  platform: string;
  username: string;
  profile_url: string | null;
}

// Get user from session helper
function getUserIdFromSession(request: FastifyRequest): number | null {
  const sessionId = request.cookies.session_id;
  if (!sessionId) return null;

  const db = getDatabase();

  const session = db.prepare(`
    SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')
  `).get(sessionId) as { user_id: number } | undefined;

  return session?.user_id || null;
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

// Get default visibility settings
function getDefaultVisibility(): ProfileVisibility {
  return {
    avatar: true,
    firstName: true,
    lastName: true,
    tagline: true,
    company: true,
    title: true,
    emails: {},
    phones: {},
    addresses: {},
    website: true,
    linkedin: true,
    instagram: true,
    whatsapp: true,
    otherSocialLinks: {},
    birthday: false,
  };
}

// Initialize tables for user profile
function ensureProfileTables(db: ReturnType<typeof getDatabase>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      is_public INTEGER DEFAULT 0,
      public_slug TEXT UNIQUE,
      avatar_url TEXT,
      first_name TEXT,
      last_name TEXT,
      tagline TEXT,
      company TEXT,
      title TEXT,
      website TEXT,
      linkedin TEXT,
      instagram TEXT,
      whatsapp TEXT,
      birthday TEXT,
      notes TEXT,
      visibility_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profile_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      type TEXT,
      is_primary INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS profile_phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      phone_display TEXT NOT NULL,
      country_code TEXT,
      type TEXT,
      is_primary INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS profile_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      street TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      country TEXT,
      type TEXT
    );

    CREATE TABLE IF NOT EXISTS profile_social_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      username TEXT NOT NULL,
      profile_url TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_profiles_public_slug ON user_profiles(public_slug);
    CREATE INDEX IF NOT EXISTS idx_profile_emails_profile_id ON profile_emails(profile_id);
    CREATE INDEX IF NOT EXISTS idx_profile_phones_profile_id ON profile_phones(profile_id);
    CREATE INDEX IF NOT EXISTS idx_profile_addresses_profile_id ON profile_addresses(profile_id);
    CREATE INDEX IF NOT EXISTS idx_profile_social_links_profile_id ON profile_social_links(profile_id);
  `);
}

// Get or create user profile
function getOrCreateProfile(db: ReturnType<typeof getDatabase>, userId: number): ProfileRow {
  let profile = db.prepare(`
    SELECT * FROM user_profiles WHERE user_id = ?
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

    profile = db.prepare(`
      SELECT * FROM user_profiles WHERE user_id = ?
    `).get(userId) as ProfileRow;
  }

  return profile;
}

// Build full profile response
function buildProfileResponse(
  db: ReturnType<typeof getDatabase>,
  profile: ProfileRow,
  baseUrl: string
): UserProfile {
  const emails = db.prepare(`
    SELECT * FROM profile_emails WHERE profile_id = ?
  `).all(profile.id) as ProfileEmailRow[];

  const phones = db.prepare(`
    SELECT * FROM profile_phones WHERE profile_id = ?
  `).all(profile.id) as ProfilePhoneRow[];

  const addresses = db.prepare(`
    SELECT * FROM profile_addresses WHERE profile_id = ?
  `).all(profile.id) as ProfileAddressRow[];

  const socialLinks = db.prepare(`
    SELECT * FROM profile_social_links WHERE profile_id = ?
  `).all(profile.id) as ProfileSocialLinkRow[];

  const visibility: ProfileVisibility = profile.visibility_json
    ? JSON.parse(profile.visibility_json)
    : getDefaultVisibility();

  return {
    isPublic: profile.is_public === 1,
    publicUrl: profile.is_public === 1 && profile.public_slug
      ? `${baseUrl}/p/${profile.public_slug}`
      : null,
    publicSlug: profile.public_slug,
    avatarUrl: profile.avatar_url,
    firstName: profile.first_name,
    lastName: profile.last_name,
    tagline: profile.tagline,
    company: profile.company,
    title: profile.title,
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
    website: profile.website,
    linkedin: profile.linkedin,
    instagram: profile.instagram,
    whatsapp: profile.whatsapp,
    otherSocialLinks: socialLinks.map((s): ProfileSocialLink => ({
      id: String(s.id),
      platform: s.platform,
      username: s.username,
      profileUrl: s.profile_url,
    })),
    birthday: profile.birthday,
    notes: profile.notes,
    visibility,
  };
}

export default async function profileRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  const db = getDatabase();
  ensureProfileTables(db);

  // GET /api/profile - Get current user's profile
  fastify.get('/', {
    schema: {
      response: {
        200: UserProfileSchema,
        401: { type: 'object', properties: { error: { type: 'string' } } },
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const profile = getOrCreateProfile(db, userId);
    const baseUrl = `${request.protocol}://${request.hostname}`;
    return buildProfileResponse(db, profile, baseUrl);
  });

  // PUT /api/profile - Update current user's profile
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
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const updates = request.body;
    const profile = getOrCreateProfile(db, userId);

    // Update main profile fields
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.isPublic !== undefined) {
      fields.push('is_public = ?');
      values.push(updates.isPublic ? 1 : 0);
    }
    if (updates.publicSlug !== undefined) {
      // Check slug is unique
      if (updates.publicSlug) {
        const existing = db.prepare('SELECT id FROM user_profiles WHERE public_slug = ? AND id != ?').get(updates.publicSlug, profile.id);
        if (existing) {
          return reply.status(400).send({ error: 'This URL is already taken' });
        }
      }
      fields.push('public_slug = ?');
      values.push(updates.publicSlug);
    }
    if (updates.avatarUrl !== undefined) {
      fields.push('avatar_url = ?');
      values.push(updates.avatarUrl);
    }
    if (updates.firstName !== undefined) {
      fields.push('first_name = ?');
      values.push(updates.firstName);
    }
    if (updates.lastName !== undefined) {
      fields.push('last_name = ?');
      values.push(updates.lastName);
    }
    if (updates.tagline !== undefined) {
      fields.push('tagline = ?');
      values.push(updates.tagline);
    }
    if (updates.company !== undefined) {
      fields.push('company = ?');
      values.push(updates.company);
    }
    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.website !== undefined) {
      fields.push('website = ?');
      values.push(updates.website);
    }
    if (updates.linkedin !== undefined) {
      fields.push('linkedin = ?');
      values.push(updates.linkedin);
    }
    if (updates.instagram !== undefined) {
      fields.push('instagram = ?');
      values.push(updates.instagram);
    }
    if (updates.whatsapp !== undefined) {
      fields.push('whatsapp = ?');
      values.push(updates.whatsapp);
    }
    if (updates.birthday !== undefined) {
      fields.push('birthday = ?');
      values.push(updates.birthday);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }
    if (updates.visibility !== undefined) {
      fields.push('visibility_json = ?');
      values.push(JSON.stringify(updates.visibility));
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(profile.id);
      const sql = `UPDATE user_profiles SET ${fields.join(', ')} WHERE id = ?`;
      db.prepare(sql).run(...values);
    }

    // Update emails (replace all)
    if (updates.emails !== undefined) {
      db.prepare('DELETE FROM profile_emails WHERE profile_id = ?').run(profile.id);
      const insertEmail = db.prepare(`
        INSERT INTO profile_emails (profile_id, email, type, is_primary)
        VALUES (?, ?, ?, ?)
      `);
      for (const email of updates.emails) {
        insertEmail.run(profile.id, email.email, email.type, email.isPrimary ? 1 : 0);
      }
    }

    // Update phones (replace all)
    if (updates.phones !== undefined) {
      db.prepare('DELETE FROM profile_phones WHERE profile_id = ?').run(profile.id);
      const insertPhone = db.prepare(`
        INSERT INTO profile_phones (profile_id, phone, phone_display, country_code, type, is_primary)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const phone of updates.phones) {
        insertPhone.run(profile.id, phone.phone, phone.phoneDisplay, phone.countryCode, phone.type, phone.isPrimary ? 1 : 0);
      }
    }

    // Update addresses (replace all)
    if (updates.addresses !== undefined) {
      db.prepare('DELETE FROM profile_addresses WHERE profile_id = ?').run(profile.id);
      const insertAddress = db.prepare(`
        INSERT INTO profile_addresses (profile_id, street, city, state, postal_code, country, type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const addr of updates.addresses) {
        insertAddress.run(profile.id, addr.street, addr.city, addr.state, addr.postalCode, addr.country, addr.type);
      }
    }

    // Update other social links (replace all)
    if (updates.otherSocialLinks !== undefined) {
      db.prepare('DELETE FROM profile_social_links WHERE profile_id = ?').run(profile.id);
      const insertSocial = db.prepare(`
        INSERT INTO profile_social_links (profile_id, platform, username, profile_url)
        VALUES (?, ?, ?, ?)
      `);
      for (const link of updates.otherSocialLinks) {
        insertSocial.run(profile.id, link.platform, link.username, link.profileUrl);
      }
    }

    // Fetch updated profile
    const updatedProfile = db.prepare(`
      SELECT * FROM user_profiles WHERE id = ?
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

    const profile = db.prepare(`
      SELECT * FROM user_profiles WHERE public_slug = ? AND is_public = 1
    `).get(slug) as ProfileRow | undefined;

    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }

    const baseUrl = `${request.protocol}://${request.hostname}`;
    const fullProfile = buildProfileResponse(db, profile, baseUrl);

    // Filter out non-visible fields based on visibility settings
    const visibility = fullProfile.visibility;
    const publicProfile: Partial<UserProfile> = {
      isPublic: true,
      publicUrl: fullProfile.publicUrl,
      publicSlug: fullProfile.publicSlug,
      avatarUrl: visibility.avatar ? fullProfile.avatarUrl : null,
      firstName: visibility.firstName ? fullProfile.firstName : null,
      lastName: visibility.lastName ? fullProfile.lastName : null,
      tagline: visibility.tagline ? fullProfile.tagline : null,
      company: visibility.company ? fullProfile.company : null,
      title: visibility.title ? fullProfile.title : null,
      emails: fullProfile.emails.filter(e => visibility.emails[e.email] !== false),
      phones: fullProfile.phones.filter(p => visibility.phones[p.phone] !== false),
      addresses: fullProfile.addresses.filter(a => a.id && visibility.addresses[a.id] !== false),
      website: visibility.website ? fullProfile.website : null,
      linkedin: visibility.linkedin ? fullProfile.linkedin : null,
      instagram: visibility.instagram ? fullProfile.instagram : null,
      whatsapp: visibility.whatsapp ? fullProfile.whatsapp : null,
      otherSocialLinks: fullProfile.otherSocialLinks.filter(s => s.id && visibility.otherSocialLinks[s.id] !== false),
      birthday: visibility.birthday ? fullProfile.birthday : null,
      notes: null, // Notes are always private
      visibility: getDefaultVisibility(), // Don't expose visibility settings
    };

    return publicProfile;
  });
}
