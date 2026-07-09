/**
 * One-time backfill: rebuild the unified full-text search index for every
 * per-user database.
 *
 * Run this after changing `buildSearchableText` (backend/src/services/database.ts)
 * so existing contacts pick up the newly indexed fields (LinkedIn enrichment,
 * email domains, URLs). New/edited contacts are reindexed automatically on
 * write, so this only needs to run once.
 *
 * Usage:
 *   npx tsx src/scripts/reindexSearch.ts
 */

import fs from 'fs';
import path from 'path';
import { getUserDatabase, closeUserDatabase } from '../services/userDatabase.js';
import { rebuildAllContactSearch } from '../services/database.js';

export function reindexAllUsers(userDataPath: string): void {
  if (!fs.existsSync(userDataPath)) {
    console.log(`User data path not found: ${path.resolve(userDataPath)} — nothing to reindex.`);
    return;
  }

  const entries = fs.readdirSync(userDataPath, { withFileTypes: true });
  let userCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const userId = Number(entry.name);
    if (!Number.isInteger(userId)) continue; // skip non-numeric dirs

    const dbPath = path.join(userDataPath, entry.name, 'contacts.db');
    if (!fs.existsSync(dbPath)) continue; // skip dirs without a contacts DB

    const db = getUserDatabase(userId);
    const before = (db.prepare('SELECT COUNT(*) AS n FROM contacts').get() as { n: number }).n;

    rebuildAllContactSearch(db);

    const indexed = (db.prepare('SELECT COUNT(*) AS n FROM contacts_unified_fts').get() as { n: number }).n;
    console.log(`User ${userId}: reindexed ${indexed}/${before} contact(s)`);

    closeUserDatabase(userId);
    userCount++;
  }

  console.log(`Done. Reindexed ${userCount} user database(s).`);
}

// --- CLI entry point ---
if (process.argv[1] && (process.argv[1].endsWith('reindexSearch.ts') || process.argv[1].endsWith('reindexSearch.js'))) {
  const userDataPath = process.env.USER_DATA_PATH || './data/users';

  console.log('=== Rebuild search index ===');
  console.log(`User Data: ${path.resolve(userDataPath)}`);
  reindexAllUsers(userDataPath);
}
