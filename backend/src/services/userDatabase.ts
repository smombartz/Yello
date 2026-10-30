import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { backfillGroupedRelatedNames } from './relatedNamesBackfill.js';
import { backfillVcardModel, backfillVcardModelV2 } from './vcardModelBackfill.js';
import { retireRawVcards } from './rawVcardRetirement.js';
import { ARCHIVABLE_TABLES, archiveObsoleteLabels } from './archivedDetails.js';

const MAX_CACHE_SIZE = 50;

/**
 * LRU cache entry for a user database connection.
 * The Map insertion order tracks recency: most recently used entries
 * are moved to the end via delete + re-insert.
 */
const cache = new Map<number, DatabaseType>();

/** SQL expression yielding a random RFC 4122 v4 UUID, upper-cased like Apple's. */
const NEW_UID_SQL = `upper(
  hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
  substr('89AB', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))
)`;

/**
 * Returns the base path for user data directories.
 */
function getUserDataPath(): string {
  return process.env.USER_DATA_PATH || './data/users';
}

/**
 * Returns a better-sqlite3 database instance for the given user.
 * Creates the database and all contact-related tables if it doesn't exist.
 * Uses an LRU cache with max 50 connections.
 */
export function getUserDatabase(userId: number): DatabaseType {
  // Check cache - if found, move to end (most recently used)
  const existing = cache.get(userId);
  if (existing) {
    cache.delete(userId);
    cache.set(userId, existing);
    return existing;
  }

  // Evict oldest entry if cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value!;
    const oldestDb = cache.get(oldestKey)!;
    try {
      oldestDb.close();
    } catch {
      // Ignore close errors on eviction
    }
    cache.delete(oldestKey);
  }

  const basePath = getUserDataPath();
  const userDir = path.join(basePath, String(userId));
  const dbPath = path.join(userDir, 'contacts.db');

  // Ensure user directory exists
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT,
      last_name TEXT,
      display_name TEXT NOT NULL,
      company TEXT,
      title TEXT,
      notes TEXT,
      birthday TEXT,
      photo_hash TEXT,
      middle_name TEXT,
      name_prefix TEXT,
      name_suffix TEXT,
      nickname TEXT,
      gender TEXT,
      department TEXT,
      is_company INTEGER DEFAULT 0,
      vcard_params TEXT,
      placeholder_name TEXT,
      archived_at DATETIME DEFAULT NULL,
      gmail_history_id TEXT DEFAULT NULL,
      gmail_last_sync_at TEXT DEFAULT NULL,
      created_via TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      type TEXT,
      extra_types TEXT,
      label TEXT,
      is_primary INTEGER DEFAULT 0,
      params TEXT,
      detail_archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS contact_phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      phone_display TEXT NOT NULL,
      country_code TEXT DEFAULT NULL,
      type TEXT,
      extra_types TEXT,
      label TEXT,
      is_primary INTEGER DEFAULT 0,
      params TEXT,
      detail_archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS contact_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      street TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      country TEXT,
      type TEXT,
      extra_types TEXT,
      label TEXT,
      po_box TEXT,
      extended TEXT,
      sublocality TEXT,
      subadministrative_area TEXT,
      country_code TEXT,
      latitude REAL DEFAULT NULL,
      longitude REAL DEFAULT NULL,
      geocoded_at TEXT DEFAULT NULL,
      params TEXT,
      detail_archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS contact_social_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      username TEXT NOT NULL,
      profile_url TEXT,
      type TEXT,
      params TEXT,
      detail_archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS contact_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      category TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contact_instant_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      service TEXT NOT NULL,
      handle TEXT NOT NULL,
      type TEXT,
      params TEXT,
      detail_archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS contact_urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      label TEXT,
      type TEXT,
      params TEXT,
      detail_archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS contact_related_people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      relationship TEXT,
      params TEXT
    );

    -- Custom dates (X-ABDATE, ANNIVERSARY). label is kept as written, e.g.
    -- Apple's _$!<Anniversary>!$_, so it survives a round trip.
    CREATE TABLE IF NOT EXISTS contact_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      label TEXT,
      params TEXT
    );

    -- Every vCard property with no typed home above (PRODID, REV, X-IMAGEHASH,
    -- X-ADDRESSING-GRAMMAR, unknown X- properties, ...), one row per line.
    CREATE TABLE IF NOT EXISTS contact_vcard_properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      group_name TEXT,
      name TEXT NOT NULL,
      params TEXT,
      value TEXT NOT NULL
    );

    -- FTS5 virtual tables
    CREATE VIRTUAL TABLE IF NOT EXISTS contacts_fts USING fts5(
      display_name,
      company,
      content='contacts',
      content_rowid='id',
      tokenize='porter unicode61',
      prefix='2 3'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
      email,
      content='contact_emails',
      content_rowid='id'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS contacts_unified_fts USING fts5(
      searchable_text,
      content='',
      contentless_delete=1,
      tokenize="unicode61 tokenchars '@.'"
    );

    -- FTS triggers for contacts
    CREATE TRIGGER IF NOT EXISTS contacts_ai AFTER INSERT ON contacts BEGIN
      INSERT INTO contacts_fts(rowid, display_name, company)
      VALUES (new.id, new.display_name, new.company);
    END;

    CREATE TRIGGER IF NOT EXISTS contacts_ad AFTER DELETE ON contacts BEGIN
      INSERT INTO contacts_fts(contacts_fts, rowid, display_name, company)
      VALUES('delete', old.id, old.display_name, old.company);
    END;

    CREATE TRIGGER IF NOT EXISTS contacts_au AFTER UPDATE OF display_name, company ON contacts BEGIN
      INSERT INTO contacts_fts(contacts_fts, rowid, display_name, company)
      VALUES('delete', old.id, old.display_name, old.company);
      INSERT INTO contacts_fts(rowid, display_name, company)
      VALUES (new.id, new.display_name, new.company);
    END;

    -- FTS triggers for emails
    CREATE TRIGGER IF NOT EXISTS emails_ai AFTER INSERT ON contact_emails BEGIN
      INSERT INTO emails_fts(rowid, email) VALUES (new.id, new.email);
    END;

    CREATE TRIGGER IF NOT EXISTS emails_ad AFTER DELETE ON contact_emails BEGIN
      INSERT INTO emails_fts(emails_fts, rowid, email) VALUES('delete', old.id, old.email);
    END;

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_contacts_display_name ON contacts(display_name);
    CREATE INDEX IF NOT EXISTS idx_contacts_last_name ON contacts(last_name, first_name);
    CREATE INDEX IF NOT EXISTS idx_contacts_archived_at ON contacts(archived_at);
    CREATE INDEX IF NOT EXISTS idx_contact_emails_contact_id ON contact_emails(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_phones_contact_id ON contact_phones(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_addresses_contact_id ON contact_addresses(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_social_profiles_contact_id ON contact_social_profiles(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_social_profiles_platform_username ON contact_social_profiles(platform, username);
    CREATE INDEX IF NOT EXISTS idx_contact_emails_email_lower ON contact_emails(email COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_contact_phones_phone ON contact_phones(phone);
    CREATE INDEX IF NOT EXISTS idx_contact_addresses_composite ON contact_addresses(street, city, postal_code);
    CREATE INDEX IF NOT EXISTS idx_contact_addresses_geocoded ON contact_addresses(latitude, longitude) WHERE latitude IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_contact_categories_contact_id ON contact_categories(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_instant_messages_contact_id ON contact_instant_messages(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_urls_contact_id ON contact_urls(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_related_people_contact_id ON contact_related_people(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_dates_contact_id ON contact_dates(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_vcard_properties_contact_id ON contact_vcard_properties(contact_id, position);
    CREATE INDEX IF NOT EXISTS idx_contact_vcard_properties_name ON contact_vcard_properties(name);

    -- User settings (single row)
    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT,
      email TEXT,
      phone TEXT,
      avatar_url TEXT,
      website TEXT,
      linkedin_url TEXT,
      icloud_email TEXT,
      icloud_app_password TEXT,
      apify_api_token TEXT,
      apify_username TEXT,
      related_names_backfilled_at TEXT,
      vcard_model_backfilled_at TEXT,
      vcard_model_v2_backfilled_at TEXT,
      raw_vcards_archived_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO user_settings (id) VALUES (1);

    -- LinkedIn enrichment
    CREATE TABLE IF NOT EXISTS linkedin_enrichment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
      linkedin_first_name TEXT,
      linkedin_last_name TEXT,
      headline TEXT,
      about TEXT,
      job_title TEXT,
      company_name TEXT,
      company_linkedin_url TEXT,
      industry TEXT,
      country TEXT,
      location TEXT,
      followers_count INTEGER,
      education TEXT,
      skills TEXT,
      photo_linkedin TEXT,
      positions TEXT,
      certifications TEXT,
      languages TEXT,
      honors TEXT,
      enriched_at TEXT,
      raw_response TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_linkedin_enrichment_contact_id ON linkedin_enrichment(contact_id);

    -- LinkedIn enrichment failures
    CREATE TABLE IF NOT EXISTS linkedin_enrichment_failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
      error_reason TEXT NOT NULL,
      attempted_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_linkedin_enrichment_failures_contact_id ON linkedin_enrichment_failures(contact_id);

    -- Contact email history (Gmail sync)
    CREATE TABLE IF NOT EXISTS contact_emails_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      gmail_message_id TEXT NOT NULL UNIQUE,
      thread_id TEXT NOT NULL,
      subject TEXT,
      date TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
      snippet TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_email_history_contact ON contact_emails_history(contact_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_email_history_gmail_id ON contact_emails_history(gmail_message_id);

    -- Contact photos (multi-source)
    CREATE TABLE IF NOT EXISTS contact_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('vcard', 'google', 'gravatar', 'linkedin')),
      original_url TEXT,
      local_hash TEXT,
      is_primary INTEGER DEFAULT 0,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_contact_photos_contact_id ON contact_photos(contact_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_photos_contact_source ON contact_photos(contact_id, source);

    -- Background import jobs. Large VCF files are staged to disk and processed
    -- in batches by an in-process worker; this row is the durable progress
    -- record the frontend polls, and cards_processed doubles as the resume
    -- offset if the container restarts mid-import.
    CREATE TABLE IF NOT EXISTS import_jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'vcf',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
      filename TEXT,
      file_path TEXT,
      file_size INTEGER,
      total_cards INTEGER DEFAULT 0,
      cards_processed INTEGER DEFAULT 0,
      imported_count INTEGER DEFAULT 0,
      skipped_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      photos_processed INTEGER DEFAULT 0,
      addresses_geotagged INTEGER DEFAULT 0,
      result TEXT,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON import_jobs(created_at DESC);
  `);

  // iCloud credentials migration (for existing databases)
  try {
    db.exec(`ALTER TABLE user_settings ADD COLUMN icloud_email TEXT`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE user_settings ADD COLUMN icloud_app_password TEXT`);
  } catch { /* column already exists */ }

  // Apify API key migration (for existing databases)
  try {
    db.exec(`ALTER TABLE user_settings ADD COLUMN apify_api_token TEXT`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE user_settings ADD COLUMN apify_username TEXT`);
  } catch { /* column already exists */ }

  // Google Contacts sync migration (for existing databases)
  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN google_resource_name TEXT`);
  } catch { /* column already exists */ }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contacts_google_resource ON contacts(google_resource_name) WHERE google_resource_name IS NOT NULL`);
  } catch { /* index already exists */ }
  try {
    db.exec(`ALTER TABLE user_settings ADD COLUMN google_contacts_last_synced DATETIME`);
  } catch { /* column already exists */ }

  // iCloud/vCard UID migration — stable identifier so re-imports match exactly
  // instead of relying on email/phone heuristics.
  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN icloud_uid TEXT`);
  } catch { /* column already exists */ }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contacts_icloud_uid ON contacts(icloud_uid) WHERE icloud_uid IS NOT NULL`);
  } catch { /* index already exists */ }

  // Merged-identity record — the vCard UIDs and Google resource names of
  // contacts merged into another one. Remote address books still hold those
  // cards, so sync and the cutover use this to recognise them as the
  // surviving contact instead of as new people.
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_merged_identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('uid', 'google_resource_name')),
      value TEXT NOT NULL,
      merged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (kind, value)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_contact_merged_identities_contact ON contact_merged_identities(contact_id)`);

  // Sync with iCloud / Google (docs/plans/2026-10-25-yello-source-of-truth-sync.md).
  // contact_sync_links ties a contact to its card in each remote address book
  // and holds what both sides looked like at the last sync, so a change on
  // either side can be told apart from the other.
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_sync_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('icloud', 'google')),
      remote_id TEXT,
      remote_uid TEXT,
      etag TEXT,
      local_hash TEXT,
      remote_hash TEXT,
      local_snapshot TEXT,
      remote_snapshot TEXT,
      local_photo_hash TEXT,
      remote_photo_hash TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending_create', 'deleted', 'error')),
      last_error TEXT,
      last_pulled_at TEXT,
      last_pushed_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (provider, remote_id),
      UNIQUE (contact_id, provider)
    );

    CREATE TABLE IF NOT EXISTS sync_tombstones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL CHECK (provider IN ('icloud', 'google')),
      remote_id TEXT NOT NULL,
      remote_uid TEXT,
      etag TEXT,
      display_name TEXT,
      reason TEXT NOT NULL DEFAULT 'contact_deleted',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      remote_deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sync_tombstones_pending ON sync_tombstones(provider) WHERE remote_deleted_at IS NULL;

    -- A hard-deleted contact (merge, empty archive, delete-all) leaves a
    -- tombstone per remote card, so sync deletes the card there too instead
    -- of importing it back as new.
    CREATE TRIGGER IF NOT EXISTS contacts_bd_sync BEFORE DELETE ON contacts BEGIN
      INSERT INTO sync_tombstones (provider, remote_id, remote_uid, etag, display_name)
      SELECT provider, remote_id, remote_uid, etag, OLD.display_name
      FROM contact_sync_links
      WHERE contact_id = OLD.id AND remote_id IS NOT NULL AND status IN ('active', 'error');
    END;

    CREATE TABLE IF NOT EXISTS sync_providers (
      provider TEXT PRIMARY KEY CHECK (provider IN ('icloud', 'google')),
      enabled INTEGER NOT NULL DEFAULT 0,
      paused INTEGER NOT NULL DEFAULT 0,
      collection_url TEXT,
      sync_token TEXT,
      ctag TEXT,
      last_run_at TEXT,
      last_success_at TEXT,
      last_error TEXT,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      cutover_completed_at TEXT,
      lock_holder TEXT,
      lock_until TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO sync_providers (provider) VALUES ('icloud'), ('google');

    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL CHECK (provider IN ('icloud', 'google')),
      trigger TEXT NOT NULL CHECK (trigger IN ('cutover', 'scheduled', 'manual', 'local_edit')),
      status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'paused')),
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      pulled_created INTEGER NOT NULL DEFAULT 0,
      pulled_updated INTEGER NOT NULL DEFAULT 0,
      pulled_archived INTEGER NOT NULL DEFAULT 0,
      pushed_created INTEGER NOT NULL DEFAULT 0,
      pushed_updated INTEGER NOT NULL DEFAULT 0,
      pushed_deleted INTEGER NOT NULL DEFAULT 0,
      conflicts INTEGER NOT NULL DEFAULT 0,
      errors_json TEXT
    );

    -- Remote versions sync overwrote or deleted, kept so they can be restored.
    CREATE TABLE IF NOT EXISTS sync_remote_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER REFERENCES sync_runs(id) ON DELETE SET NULL,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      provider TEXT NOT NULL CHECK (provider IN ('icloud', 'google')),
      remote_id TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('conflict_yello_won', 'remote_delete', 'pre_update', 'cutover_conflict', 'cutover_delete')),
      payload TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      restored_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sync_remote_versions_contact ON sync_remote_versions(contact_id);

    -- The one-time switch to Yello as source of truth: a plan (dry run) per row,
    -- its decisions in sync_cutover_items.
    CREATE TABLE IF NOT EXISTS sync_cutovers (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('planning', 'planned', 'applying', 'pushing', 'done', 'failed', 'aborted')),
      window_days INTEGER NOT NULL,
      icloud_backup_id TEXT,
      google_backup_id TEXT,
      summary_json TEXT,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sync_cutover_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cutover_id TEXT NOT NULL REFERENCES sync_cutovers(id) ON DELETE CASCADE,
      provider TEXT CHECK (provider IN ('icloud', 'google')),
      kind TEXT NOT NULL CHECK (kind IN (
        'link', 'merged_duplicate', 'update', 'conflict', 'possible_match',
        'import', 'delete_remote', 'restore_review', 'create_remote', 'group_card'
      )),
      remote_id TEXT,
      remote_uid TEXT,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      display_name TEXT,
      field TEXT,
      yello_value TEXT,
      remote_value TEXT,
      yello_ts TEXT,
      remote_ts TEXT,
      reason TEXT,
      suggested TEXT,
      resolution TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sync_cutover_items_kind ON sync_cutover_items(cutover_id, kind);
  `);

  // contacts_fts holds only display_name and company, so its update trigger is
  // limited to those columns. Older databases have it on every UPDATE, which
  // also fired for the UID trigger below before contacts_ai had indexed the
  // row, and the FTS 'delete' of a row it never held corrupts the index.
  const ftsUpdateTrigger = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'contacts_au'").get() as
    { sql: string } | undefined;
  if (ftsUpdateTrigger && !/UPDATE\s+OF/i.test(ftsUpdateTrigger.sql)) {
    db.exec(`
      DROP TRIGGER contacts_au;
      CREATE TRIGGER contacts_au AFTER UPDATE OF display_name, company ON contacts BEGIN
        INSERT INTO contacts_fts(contacts_fts, rowid, display_name, company)
        VALUES('delete', old.id, old.display_name, old.company);
        INSERT INTO contacts_fts(rowid, display_name, company)
        VALUES (new.id, new.display_name, new.company);
      END;
    `);
  }

  // Every contact carries a vCard UID: it names the contact's card in iCloud
  // and is written to Google as clientData. Contacts created before this, or
  // by a path that sets none, get a random one (uppercase, as Apple writes them).
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS contacts_ai_uid AFTER INSERT ON contacts WHEN NEW.icloud_uid IS NULL BEGIN
      UPDATE contacts SET icloud_uid = ${NEW_UID_SQL} WHERE id = NEW.id;
    END;
  `);

  // Imported-GEO migration — vCards carrying per-address coordinates (this
  // app's own exports do) now keep them instead of forcing a re-geocode.
  try {
    db.exec(`ALTER TABLE import_jobs ADD COLUMN addresses_geotagged INTEGER DEFAULT 0`);
  } catch { /* column already exists */ }

  // Related-contact linking migration — nullable FK so a related person can
  // point at a real contact while free-text names keep a NULL link.
  try {
    db.exec(`ALTER TABLE contact_related_people ADD COLUMN related_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL`);
  } catch { /* column already exists */ }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contact_related_people_related_contact_id ON contact_related_people(related_contact_id) WHERE related_contact_id IS NOT NULL`);
  } catch { /* index already exists */ }

  // Grouped related-names backfill — marker column plus the one-time repair
  // itself, for contacts imported before grouped X-ABRELATEDNAMES were read.
  try {
    db.exec(`ALTER TABLE user_settings ADD COLUMN related_names_backfilled_at TEXT`);
  } catch { /* column already exists */ }
  backfillGroupedRelatedNames(db);

  // Full vCard model — columns for person data the schema used to leave in
  // raw_vcard, plus the one-time backfill that recovers them from it.
  for (const statement of [
    `ALTER TABLE contacts ADD COLUMN middle_name TEXT`,
    `ALTER TABLE contacts ADD COLUMN name_prefix TEXT`,
    `ALTER TABLE contacts ADD COLUMN name_suffix TEXT`,
    `ALTER TABLE contacts ADD COLUMN nickname TEXT`,
    `ALTER TABLE contacts ADD COLUMN gender TEXT`,
    `ALTER TABLE contacts ADD COLUMN department TEXT`,
    `ALTER TABLE contacts ADD COLUMN is_company INTEGER DEFAULT 0`,
    // How the contact got here (manual, vcf_import, icloud_sync, ...), for the Recent page
    `ALTER TABLE contacts ADD COLUMN created_via TEXT`,
    `ALTER TABLE contact_emails ADD COLUMN extra_types TEXT`,
    `ALTER TABLE contact_emails ADD COLUMN label TEXT`,
    `ALTER TABLE contact_phones ADD COLUMN extra_types TEXT`,
    `ALTER TABLE contact_phones ADD COLUMN label TEXT`,
    `ALTER TABLE contact_addresses ADD COLUMN extra_types TEXT`,
    `ALTER TABLE contact_addresses ADD COLUMN label TEXT`,
    `ALTER TABLE contact_addresses ADD COLUMN po_box TEXT`,
    `ALTER TABLE contact_addresses ADD COLUMN extended TEXT`,
    `ALTER TABLE contact_addresses ADD COLUMN sublocality TEXT`,
    `ALTER TABLE contact_addresses ADD COLUMN subadministrative_area TEXT`,
    `ALTER TABLE contact_addresses ADD COLUMN country_code TEXT`,
    `ALTER TABLE user_settings ADD COLUMN vcard_model_backfilled_at TEXT`,
    // Leftover vCard parameters (X-APPLE-OMIT-YEAR, TYPE=pref on a URL, ...)
    `ALTER TABLE contacts ADD COLUMN vcard_params TEXT`,
    // Stand-in name of a card that had none (its company, email or phone)
    `ALTER TABLE contacts ADD COLUMN placeholder_name TEXT`,
    ...['contact_emails', 'contact_phones', 'contact_addresses', 'contact_social_profiles',
      'contact_instant_messages', 'contact_urls', 'contact_related_people', 'contact_dates']
      .map(table => `ALTER TABLE ${table} ADD COLUMN params TEXT`),
    `ALTER TABLE user_settings ADD COLUMN vcard_model_v2_backfilled_at TEXT`,
    `ALTER TABLE user_settings ADD COLUMN raw_vcards_archived_at TEXT`,
    // Archived details (an old number or address): kept, but not synced
    ...ARCHIVABLE_TABLES.map(table => `ALTER TABLE ${table} ADD COLUMN detail_archived_at TEXT`)
  ]) {
    try {
      db.exec(statement);
    } catch { /* column already exists */ }
  }
  backfillVcardModel(db);
  backfillVcardModelV2(db);

  // With every property modeled, the imported originals move out of the
  // database into a verified archive file, and the column is dropped. Must
  // run after the backfills above, which read raw_vcard.
  retireRawVcards(db, path.join(getUserDataPath(), String(userId), 'archive'));

  // UID backfill — after the raw_vcard backfills above, which recover the
  // card's own UID where one exists; only contacts still without one get a
  // random UID.
  try {
    db.exec(`ALTER TABLE user_settings ADD COLUMN contact_uids_backfilled_at TEXT`);
  } catch { /* column already exists */ }
  const uidMarker = db.prepare('SELECT contact_uids_backfilled_at FROM user_settings WHERE id = 1').get() as
    { contact_uids_backfilled_at: string | null } | undefined;
  if (!uidMarker?.contact_uids_backfilled_at) {
    db.transaction(() => {
      db.exec(`UPDATE contacts SET icloud_uid = ${NEW_UID_SQL} WHERE icloud_uid IS NULL OR icloud_uid = ''`);
      db.exec(`UPDATE user_settings SET contact_uids_backfilled_at = datetime('now') WHERE id = 1`);
    })();
  }

  // Details labelled Obsolete/Archived (Apple's way of marking a stale number)
  // become archived details; idempotent, as converted rows lose the label.
  archiveObsoleteLabels(db);

  cache.set(userId, db);
  return db;
}

/**
 * Returns the photos directory path for a user, creating it if needed.
 */
export function getUserPhotosPath(userId: number): string {
  const basePath = getUserDataPath();
  const photosDir = path.join(basePath, String(userId), 'photos');

  if (!fs.existsSync(photosDir)) {
    fs.mkdirSync(photosDir, { recursive: true });
  }

  return photosDir;
}

/**
 * Returns the staged-imports directory for a user, creating it if needed.
 * Uploaded VCF files live here while a background import job consumes them.
 */
export function getUserImportsPath(userId: number): string {
  const basePath = getUserDataPath();
  const importsDir = path.join(basePath, String(userId), 'imports');

  if (!fs.existsSync(importsDir)) {
    fs.mkdirSync(importsDir, { recursive: true });
  }

  return importsDir;
}

/**
 * Returns the backups directory for a user, creating it if needed. Each
 * backup of a remote address book (iCloud, Google) is a subdirectory here.
 */
export function getUserBackupsPath(userId: number): string {
  const backupsDir = path.join(getUserDataPath(), String(userId), 'backups');

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  return backupsDir;
}

/**
 * Returns the user IDs that have a data directory on disk. Used by the boot
 * sweep to find interrupted import jobs — there is no cross-user index, so the
 * only way to enumerate tenants is the filesystem.
 */
export function listUserIds(): number[] {
  const basePath = getUserDataPath();
  if (!fs.existsSync(basePath)) return [];

  return fs
    .readdirSync(basePath, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => Number(entry.name))
    .filter(id => Number.isInteger(id) && id > 0);
}

/**
 * Closes a specific user's database connection and removes it from the cache.
 */
export function closeUserDatabase(userId: number): void {
  const db = cache.get(userId);
  if (db) {
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
    cache.delete(userId);
  }
}

/**
 * Closes all cached user database connections.
 */
export function closeAllUserDatabases(): void {
  for (const [userId, db] of cache) {
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
  }
  cache.clear();
}
