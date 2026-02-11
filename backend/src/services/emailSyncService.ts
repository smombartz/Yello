import { getDatabase } from './database.js';
import { getValidAccessToken } from './googleAuthService.js';

// Gmail API types
interface GmailMessageListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailMessageHeader {
  name: string;
  value: string;
}

interface GmailMessagePayload {
  headers: GmailMessageHeader[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  historyId: string;
  payload: GmailMessagePayload;
  snippet: string;
  internalDate: string;
}

interface GmailHistoryResponse {
  history?: Array<{
    id: string;
    messagesAdded?: Array<{ message: { id: string; threadId: string } }>;
  }>;
  historyId: string;
  nextPageToken?: string;
}

// Database row types
interface ContactEmailRow {
  email: string;
}

interface EmailHistoryRow {
  id: number;
  contact_id: number;
  gmail_message_id: string;
  thread_id: string;
  subject: string | null;
  date: string;
  direction: string;
  snippet: string | null;
  synced_at: string;
}

interface ContactSyncInfo {
  gmail_history_id: string | null;
  gmail_last_sync_at: string | null;
}

export interface EmailHistoryItem {
  id: number;
  gmailMessageId: string;
  threadId: string;
  subject: string | null;
  date: string;
  direction: 'inbound' | 'outbound';
  snippet: string | null;
}

export interface EmailHistoryStats {
  total: number;
  avgPerMonth: number;
  last30Days: number;
}

export interface EmailHistoryResponse {
  emails: EmailHistoryItem[];
  stats: EmailHistoryStats;
  hasMore: boolean;
  nextCursor: string | null;
  lastSyncedAt: string | null;
}

export interface SyncResult {
  synced: number;
  total: number;
  error?: string;
}

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

/**
 * Make a Gmail API request with the user's access token.
 * Returns null if the token lacks Gmail scope (triggers re-auth).
 */
async function gmailFetch<T>(accessToken: string, path: string): Promise<{ data: T | null; scopeError: boolean }> {
  const response = await fetch(`${GMAIL_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 403 || response.status === 401) {
    const body = await response.text();
    if (body.includes('insufficientPermissions')) {
      return { data: null, scopeError: true };
    }
    // Don't treat "API not enabled" or other 403s as scope errors
    throw new Error(`Gmail API error: ${response.status} ${body}`);
  }

  if (!response.ok) {
    throw new Error(`Gmail API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as T;
  return { data, scopeError: false };
}

/**
 * Fetch full message metadata from Gmail API.
 */
async function fetchMessageMetadata(accessToken: string, messageId: string): Promise<GmailMessage | null> {
  const result = await gmailFetch<GmailMessage>(
    accessToken,
    `/messages/${messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Date`
  );
  return result.data;
}

/**
 * Extract email address from a header value like "John Doe <john@example.com>" or "john@example.com"
 */
function extractEmailAddresses(headerValue: string): string[] {
  const addresses: string[] = [];
  // Match email patterns in angle brackets or standalone
  const regex = /<?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>?/g;
  let match;
  while ((match = regex.exec(headerValue)) !== null) {
    addresses.push(match[1].toLowerCase());
  }
  return addresses;
}

/**
 * Get a header value from a Gmail message.
 */
function getHeader(message: GmailMessage, name: string): string {
  const header = message.payload.headers.find(
    h => h.name.toLowerCase() === name.toLowerCase()
  );
  return header?.value || '';
}

/**
 * Full sync: fetch all emails for a contact from Gmail.
 */
export async function fullSyncContact(
  userId: number,
  contactId: number,
  onProgress?: (processed: number, total: number) => void
): Promise<SyncResult> {
  const db = getDatabase();

  // Get user's access token
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return { synced: 0, total: 0, error: 'no_token' };
  }

  // Get the user's own email to determine direction
  const userRow = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!userRow) {
    return { synced: 0, total: 0, error: 'user_not_found' };
  }
  const userEmail = userRow.email.toLowerCase();

  // Get all email addresses for this contact
  const contactEmails = db.prepare(
    'SELECT email FROM contact_emails WHERE contact_id = ?'
  ).all(contactId) as ContactEmailRow[];

  if (contactEmails.length === 0) {
    return { synced: 0, total: 0, error: 'no_email_addresses' };
  }

  const emailAddresses = contactEmails.map(e => e.email.toLowerCase());

  // Build Gmail search query: from:addr1 OR to:addr1 OR from:addr2 OR to:addr2
  const queryParts = emailAddresses.flatMap(addr => [`from:${addr}`, `to:${addr}`]);
  const query = queryParts.join(' OR ');

  // Clear existing history for this contact (full re-sync)
  db.prepare('DELETE FROM contact_emails_history WHERE contact_id = ?').run(contactId);

  // Paginate through all messages
  let pageToken: string | undefined;
  let allMessageIds: Array<{ id: string; threadId: string }> = [];
  let latestHistoryId: string | null = null;

  // First, collect all message IDs
  do {
    const path = `/messages?q=${encodeURIComponent(query)}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const result = await gmailFetch<GmailMessageListResponse>(accessToken, path);

    if (result.scopeError) {
      return { synced: 0, total: 0, error: 'gmail_scope_required' };
    }

    if (!result.data) {
      break;
    }

    if (result.data.messages) {
      allMessageIds = allMessageIds.concat(result.data.messages);
    }

    pageToken = result.data.nextPageToken;
  } while (pageToken);

  const totalMessages = allMessageIds.length;
  let processedCount = 0;
  let syncedCount = 0;

  // Process messages in batches of 20
  const BATCH_SIZE = 20;
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO contact_emails_history
      (contact_id, gmail_message_id, thread_id, subject, date, direction, snippet)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < allMessageIds.length; i += BATCH_SIZE) {
    const batch = allMessageIds.slice(i, i + BATCH_SIZE);

    // Fetch metadata for each message in the batch
    const messages = await Promise.all(
      batch.map(msg => fetchMessageMetadata(accessToken, msg.id))
    );

    const insertBatch = db.transaction(() => {
      for (const message of messages) {
        if (!message) continue;

        // Track latest history ID
        if (!latestHistoryId || BigInt(message.historyId) > BigInt(latestHistoryId)) {
          latestHistoryId = message.historyId;
        }

        const subject = getHeader(message, 'Subject') || null;
        const fromHeader = getHeader(message, 'From');
        const date = new Date(parseInt(message.internalDate)).toISOString();

        // Determine direction
        const fromAddresses = extractEmailAddresses(fromHeader);
        const direction = fromAddresses.some(a => a === userEmail) ? 'outbound' : 'inbound';

        const result = insertStmt.run(
          contactId,
          message.id,
          message.threadId,
          subject,
          date,
          direction,
          message.snippet || null
        );

        if (result.changes > 0) {
          syncedCount++;
        }
      }
    });
    insertBatch();

    processedCount += batch.length;
    onProgress?.(processedCount, totalMessages);
  }

  // Update contact's sync state
  db.prepare(`
    UPDATE contacts
    SET gmail_history_id = ?, gmail_last_sync_at = datetime('now')
    WHERE id = ?
  `).run(latestHistoryId, contactId);

  return { synced: syncedCount, total: totalMessages };
}

/**
 * Incremental sync: fetch only new emails since last sync.
 */
export async function incrementalSyncContact(
  userId: number,
  contactId: number
): Promise<SyncResult> {
  const db = getDatabase();

  // Get contact's sync state
  const syncInfo = db.prepare(
    'SELECT gmail_history_id, gmail_last_sync_at FROM contacts WHERE id = ?'
  ).get(contactId) as ContactSyncInfo | undefined;

  if (!syncInfo?.gmail_history_id) {
    // Never synced before — do a full sync
    return fullSyncContact(userId, contactId);
  }

  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return { synced: 0, total: 0, error: 'no_token' };
  }

  const userRow = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!userRow) {
    return { synced: 0, total: 0, error: 'user_not_found' };
  }
  const userEmail = userRow.email.toLowerCase();

  // Get contact's email addresses for filtering
  const contactEmails = db.prepare(
    'SELECT email FROM contact_emails WHERE contact_id = ?'
  ).all(contactId) as ContactEmailRow[];
  const emailAddresses = new Set(contactEmails.map(e => e.email.toLowerCase()));

  if (emailAddresses.size === 0) {
    return { synced: 0, total: 0 };
  }

  // Fetch history since last sync
  let pageToken: string | undefined;
  let newMessageIds: Array<{ id: string; threadId: string }> = [];
  let latestHistoryId = syncInfo.gmail_history_id;

  try {
    do {
      const path = `/history?startHistoryId=${syncInfo.gmail_history_id}&historyTypes=messageAdded${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const result = await gmailFetch<GmailHistoryResponse>(accessToken, path);

      if (result.scopeError) {
        return { synced: 0, total: 0, error: 'gmail_scope_required' };
      }

      if (!result.data) break;

      latestHistoryId = result.data.historyId;

      if (result.data.history) {
        for (const entry of result.data.history) {
          if (entry.messagesAdded) {
            newMessageIds = newMessageIds.concat(
              entry.messagesAdded.map(m => m.message)
            );
          }
        }
      }

      pageToken = result.data.nextPageToken;
    } while (pageToken);
  } catch (error) {
    // History ID may be too old — Gmail returns 404. Fall back to full sync.
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('404')) {
      return fullSyncContact(userId, contactId);
    }
    throw error;
  }

  if (newMessageIds.length === 0) {
    // Update sync timestamp even if no new messages
    db.prepare(`
      UPDATE contacts SET gmail_history_id = ?, gmail_last_sync_at = datetime('now') WHERE id = ?
    `).run(latestHistoryId, contactId);
    return { synced: 0, total: 0 };
  }

  // Fetch metadata and filter to this contact's emails
  let syncedCount = 0;
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO contact_emails_history
      (contact_id, gmail_message_id, thread_id, subject, date, direction, snippet)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const msg of newMessageIds) {
    const message = await fetchMessageMetadata(accessToken, msg.id);
    if (!message) continue;

    // Check if this message involves the contact
    const fromAddresses = extractEmailAddresses(getHeader(message, 'From'));
    const toAddresses = extractEmailAddresses(getHeader(message, 'To'));
    const ccAddresses = extractEmailAddresses(getHeader(message, 'Cc'));
    const allAddresses = [...fromAddresses, ...toAddresses, ...ccAddresses];

    const involvesContact = allAddresses.some(a => emailAddresses.has(a));
    if (!involvesContact) continue;

    const subject = getHeader(message, 'Subject') || null;
    const date = new Date(parseInt(message.internalDate)).toISOString();
    const direction = fromAddresses.some(a => a === userEmail) ? 'outbound' : 'inbound';

    const result = insertStmt.run(
      contactId,
      message.id,
      message.threadId,
      subject,
      date,
      direction,
      message.snippet || null
    );

    if (result.changes > 0) {
      syncedCount++;
    }
  }

  // Update sync state
  db.prepare(`
    UPDATE contacts SET gmail_history_id = ?, gmail_last_sync_at = datetime('now') WHERE id = ?
  `).run(latestHistoryId, contactId);

  return { synced: syncedCount, total: newMessageIds.length };
}

/**
 * Get email history for a contact with stats.
 */
export function getContactEmailHistory(
  contactId: number,
  limit: number = 10,
  cursor?: string
): EmailHistoryResponse {
  const db = getDatabase();

  // Get sync info
  const syncInfo = db.prepare(
    'SELECT gmail_last_sync_at FROM contacts WHERE id = ?'
  ).get(contactId) as { gmail_last_sync_at: string | null } | undefined;

  // Get total count
  const countResult = db.prepare(
    'SELECT COUNT(*) as count FROM contact_emails_history WHERE contact_id = ?'
  ).get(contactId) as { count: number };

  const total = countResult.count;

  if (total === 0) {
    return {
      emails: [],
      stats: { total: 0, avgPerMonth: 0, last30Days: 0 },
      hasMore: false,
      nextCursor: null,
      lastSyncedAt: syncInfo?.gmail_last_sync_at || null,
    };
  }

  // Get emails with cursor-based pagination
  let rows: EmailHistoryRow[];
  if (cursor) {
    rows = db.prepare(`
      SELECT * FROM contact_emails_history
      WHERE contact_id = ? AND date < ?
      ORDER BY date DESC
      LIMIT ?
    `).all(contactId, cursor, limit + 1) as EmailHistoryRow[];
  } else {
    rows = db.prepare(`
      SELECT * FROM contact_emails_history
      WHERE contact_id = ?
      ORDER BY date DESC
      LIMIT ?
    `).all(contactId, limit + 1) as EmailHistoryRow[];
  }

  const hasMore = rows.length > limit;
  const emails = rows.slice(0, limit);
  const nextCursor = hasMore && emails.length > 0
    ? emails[emails.length - 1].date
    : null;

  // Calculate stats
  const last30DaysResult = db.prepare(`
    SELECT COUNT(*) as count FROM contact_emails_history
    WHERE contact_id = ? AND date > datetime('now', '-30 days')
  `).get(contactId) as { count: number };

  // Calculate average per month
  const dateRange = db.prepare(`
    SELECT
      MIN(date) as earliest,
      MAX(date) as latest
    FROM contact_emails_history
    WHERE contact_id = ?
  `).get(contactId) as { earliest: string; latest: string };

  let avgPerMonth = 0;
  if (dateRange.earliest && dateRange.latest) {
    const earliestDate = new Date(dateRange.earliest);
    const latestDate = new Date(dateRange.latest);
    const monthsDiff = Math.max(
      1,
      (latestDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    );
    avgPerMonth = Math.round((total / monthsDiff) * 10) / 10;
  }

  return {
    emails: emails.map(row => ({
      id: row.id,
      gmailMessageId: row.gmail_message_id,
      threadId: row.thread_id,
      subject: row.subject,
      date: row.date,
      direction: row.direction as 'inbound' | 'outbound',
      snippet: row.snippet,
    })),
    stats: {
      total,
      avgPerMonth,
      last30Days: last30DaysResult.count,
    },
    hasMore,
    nextCursor,
    lastSyncedAt: syncInfo?.gmail_last_sync_at || null,
  };
}

/**
 * Get all contact IDs that have been synced (for incremental refresh on login).
 */
export function getSyncedContactIds(): number[] {
  const db = getDatabase();
  const rows = db.prepare(
    'SELECT id FROM contacts WHERE gmail_last_sync_at IS NOT NULL'
  ).all() as Array<{ id: number }>;
  return rows.map(r => r.id);
}
