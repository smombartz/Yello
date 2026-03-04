import { getDatabase } from './database.js';
import { getValidAccessToken } from './googleAuthService.js';
import {
  gmailFetch,
  fetchMessageMetadata,
  extractEmailAddresses,
  getHeader,
  GmailMessageListResponse,
} from './emailSyncService.js';

export interface DiscoveredContact {
  contactId: number;
  displayName: string;
  email: string;
  messageCount: number;
  lastEmailDate: string;
}

export interface DiscoveryResult {
  contacts: DiscoveredContact[];
  scannedMessages: number;
}

export interface GmailSyncSummary {
  totalWithEmail: number;
  synced: number;
  notSynced: number;
}

/**
 * Get summary of Gmail sync status across all contacts.
 */
export function getGmailSyncSummary(): GmailSyncSummary {
  const db = getDatabase();

  const totalWithEmail = (db.prepare(`
    SELECT COUNT(DISTINCT c.id) as count
    FROM contacts c
    INNER JOIN contact_emails ce ON ce.contact_id = c.id
    WHERE c.archived_at IS NULL
  `).get() as { count: number }).count;

  const synced = (db.prepare(`
    SELECT COUNT(DISTINCT c.id) as count
    FROM contacts c
    INNER JOIN contact_emails ce ON ce.contact_id = c.id
    WHERE c.archived_at IS NULL AND c.gmail_last_sync_at IS NOT NULL
  `).get() as { count: number }).count;

  return {
    totalWithEmail,
    synced,
    notSynced: totalWithEmail - synced,
  };
}

/**
 * Discover which contacts the user emails most recently or most frequently
 * by scanning Gmail messages.
 */
export async function discoverContacts(
  userId: number,
  strategy: 'recent' | 'frequent',
  scanDepth: number = 500
): Promise<DiscoveryResult> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    throw new Error('no_token');
  }

  const db = getDatabase();

  // Get user's own email to exclude from results
  const userRow = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!userRow) {
    throw new Error('user_not_found');
  }
  const userEmail = userRow.email.toLowerCase();

  // Build a lookup: email → { contactId, displayName }
  const contactEmailRows = db.prepare(`
    SELECT ce.email, c.id as contact_id, c.display_name
    FROM contact_emails ce
    INNER JOIN contacts c ON c.id = ce.contact_id
    WHERE c.archived_at IS NULL
  `).all() as Array<{ email: string; contact_id: number; display_name: string }>;

  const emailToContact = new Map<string, { contactId: number; displayName: string }>();
  for (const row of contactEmailRows) {
    emailToContact.set(row.email.toLowerCase(), {
      contactId: row.contact_id,
      displayName: row.display_name,
    });
  }

  // Scan Gmail messages
  const emailStats = new Map<string, { count: number; lastDate: string }>();
  let pageToken: string | undefined;
  let scannedMessages = 0;

  do {
    const path = `/messages?maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const result = await gmailFetch<GmailMessageListResponse>(accessToken, path);

    if (result.scopeError) {
      throw new Error('gmail_scope_required');
    }

    if (!result.data?.messages) break;

    // Fetch metadata for this batch (in parallel batches of 20)
    const BATCH_SIZE = 20;
    for (let i = 0; i < result.data.messages.length; i += BATCH_SIZE) {
      const batch = result.data.messages.slice(i, i + BATCH_SIZE);
      const messages = await Promise.all(
        batch.map(msg => fetchMessageMetadata(accessToken, msg.id))
      );

      for (const message of messages) {
        if (!message) continue;
        scannedMessages++;

        const fromAddresses = extractEmailAddresses(getHeader(message, 'From'));
        const toAddresses = extractEmailAddresses(getHeader(message, 'To'));
        const ccAddresses = extractEmailAddresses(getHeader(message, 'Cc'));
        const allAddresses = [...new Set([...fromAddresses, ...toAddresses, ...ccAddresses])];
        const date = new Date(parseInt(message.internalDate)).toISOString();

        for (const addr of allAddresses) {
          if (addr === userEmail) continue;

          const existing = emailStats.get(addr);
          if (existing) {
            existing.count++;
            if (date > existing.lastDate) {
              existing.lastDate = date;
            }
          } else {
            emailStats.set(addr, { count: 1, lastDate: date });
          }
        }
      }
    }

    pageToken = result.data.nextPageToken;
  } while (pageToken && scannedMessages < scanDepth);

  // Match against known contacts and aggregate per contact
  const contactStats = new Map<number, {
    displayName: string;
    email: string;
    messageCount: number;
    lastEmailDate: string;
  }>();

  for (const [email, stats] of emailStats) {
    const contact = emailToContact.get(email);
    if (!contact) continue;

    const existing = contactStats.get(contact.contactId);
    if (existing) {
      existing.messageCount += stats.count;
      if (stats.lastDate > existing.lastEmailDate) {
        existing.lastEmailDate = stats.lastDate;
        existing.email = email;
      }
    } else {
      contactStats.set(contact.contactId, {
        displayName: contact.displayName,
        email,
        messageCount: stats.count,
        lastEmailDate: stats.lastDate,
      });
    }
  }

  // Sort based on strategy
  const contacts: DiscoveredContact[] = Array.from(contactStats.entries()).map(
    ([contactId, stats]) => ({ contactId, ...stats })
  );

  if (strategy === 'recent') {
    contacts.sort((a, b) => b.lastEmailDate.localeCompare(a.lastEmailDate));
  } else {
    contacts.sort((a, b) => b.messageCount - a.messageCount);
  }

  return { contacts, scannedMessages };
}
