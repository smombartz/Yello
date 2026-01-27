/**
 * Standalone script to migrate phone records to new format with country codes
 * Run with: npx tsx src/scripts/migratePhones.ts
 */

import Database from 'better-sqlite3';
import { parsePhoneNumber } from 'libphonenumber-js';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || './data/contacts.db';

console.log(`Opening database at: ${path.resolve(dbPath)}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Parse a phone number and return formatted display and country code
 */
function parsePhoneForMigration(rawPhone: string): { phoneDisplay: string; countryCode: string | null } {
  try {
    // Try parsing with US as default region
    const parsed = parsePhoneNumber(rawPhone, 'US');
    if (parsed) {
      // Get international format: +1 201 555 0123
      const international = parsed.formatInternational();
      // Clean up any parentheses or dashes, ensure single spaces
      const phoneDisplay = international
        .replace(/[()-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        phoneDisplay,
        countryCode: parsed.country || null
      };
    }
  } catch {
    // Fall through to raw value
  }

  // Return original format if parsing fails
  return { phoneDisplay: rawPhone, countryCode: null };
}

// Ensure country_code column exists
const phonesTableInfo = db.prepare("PRAGMA table_info(contact_phones)").all() as Array<{ name: string }>;
const hasCountryCode = phonesTableInfo.some(col => col.name === 'country_code');

if (!hasCountryCode) {
  console.log('Adding country_code column to contact_phones table...');
  db.exec(`
    ALTER TABLE contact_phones ADD COLUMN country_code TEXT DEFAULT NULL;
  `);
}

// Get all phone records
const phones = db.prepare(`
  SELECT id, phone, phone_display FROM contact_phones
`).all() as Array<{ id: number; phone: string; phone_display: string }>;

console.log(`Found ${phones.length} phone records to process`);

let updated = 0;
let failed = 0;
let unchanged = 0;

const updateStmt = db.prepare(`
  UPDATE contact_phones
  SET phone_display = ?, country_code = ?
  WHERE id = ?
`);

const migrateAll = db.transaction(() => {
  for (const phoneRecord of phones) {
    // Try to parse the stored E.164 phone number first
    let result = parsePhoneForMigration(phoneRecord.phone);

    // If that didn't yield a country code, try the display format
    if (!result.countryCode && phoneRecord.phone_display) {
      const altResult = parsePhoneForMigration(phoneRecord.phone_display);
      if (altResult.countryCode) {
        result = altResult;
      }
    }

    if (result.countryCode || result.phoneDisplay !== phoneRecord.phone_display) {
      updateStmt.run(result.phoneDisplay, result.countryCode, phoneRecord.id);
      console.log(`  Updated: "${phoneRecord.phone_display}" → "${result.phoneDisplay}" (${result.countryCode || 'unknown'})`);
      updated++;
    } else {
      console.log(`  Unchanged: "${phoneRecord.phone_display}" (could not parse)`);
      unchanged++;
    }
  }
});

migrateAll();

console.log('\n=== Migration Complete ===');
console.log(`  Updated: ${updated}`);
console.log(`  Unchanged: ${unchanged}`);
console.log(`  Total: ${phones.length}`);

db.close();
