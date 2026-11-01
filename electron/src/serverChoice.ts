import * as fs from 'fs';
import * as path from 'path';
import { setServerTarget, type ServerTarget } from './config';

// Remembers the admin's server choice in server.json in the app's data folder
// (~/Library/Application Support/Yello). `adminSeen` is set once the Yello page
// reports the admin is signed in; it reveals the Server menu.

interface StoredChoice {
  target: ServerTarget;
  adminSeen: boolean;
}

let file: string | null = null;
let stored: StoredChoice = { target: 'railway', adminSeen: false };

function save(): void {
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(stored, null, 2));
  } catch {
    // Not fatal: the choice just isn't remembered
  }
}

/** Reads server.json from `dir` and applies the saved server. Call once at startup. */
export function loadServerChoice(dir: string): StoredChoice {
  file = path.join(dir, 'server.json');
  stored = { target: 'railway', adminSeen: false };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<StoredChoice>;
    stored = {
      target: raw.target === 'local' ? 'local' : 'railway',
      adminSeen: raw.adminSeen === true,
    };
  } catch {
    // First launch or unreadable: Railway
  }
  setServerTarget(stored.target);
  return { ...stored };
}

export function saveServerTarget(target: ServerTarget): void {
  stored.target = target;
  setServerTarget(target);
  save();
}

/** Returns true when this call is the one that set it. */
export function markAdminSeen(): boolean {
  if (stored.adminSeen) return false;
  stored.adminSeen = true;
  save();
  return true;
}

export function adminSeen(): boolean {
  return stored.adminSeen;
}
