import type { DAVAddressBook, DAVClient } from 'tsdav';
import { buildICloudClient } from '../icloudService.js';
import { PreconditionFailedError, RemoteAuthError, RemoteRetryLaterError } from './syncRuntime.js';

/**
 * The iCloud address book as the sync engine sees it. The engine talks only
 * to this interface, so tests run it against an in-memory book.
 *
 * Writes are conditional: a create fails if the card already exists, an
 * update or delete fails (PreconditionFailedError) if the card changed since
 * the etag the engine last saw, so a concurrent edit on the phone is never
 * overwritten blind.
 */

export interface RemoteCardRef {
  url: string;
  etag: string | null;
}

export interface RemoteCardData extends RemoteCardRef {
  data: string;
}

export interface ICloudRemote {
  /** The address book's URL (its "collection"). */
  readonly collectionUrl: string;
  /** Changes whenever anything in the book changes (CardDAV getctag); null if the server has none. */
  getCtag(): Promise<string | null>;
  /** Every card URL in the book with its etag. */
  listCards(): Promise<RemoteCardRef[]>;
  fetchCards(urls: string[]): Promise<RemoteCardData[]>;
  /** Creates a card at `<collection>/<filename>`; returns its URL and etag (etag may be unknown). */
  createCard(filename: string, data: string): Promise<RemoteCardRef>;
  updateCard(url: string, data: string, etag: string | null): Promise<RemoteCardRef>;
  deleteCard(url: string, etag: string | null): Promise<void>;
  /** Writes a card at an exact URL (restore): created if `etag` is null, else overwritten if unchanged. */
  putCardAt(url: string, data: string, etag: string | null): Promise<RemoteCardRef>;
}

export { PreconditionFailedError, RemoteAuthError, RemoteRetryLaterError };

/** Cards per addressbook-multiget request. */
const MULTIGET_BATCH = 100;

function checkResponse(response: Response, url: string): void {
  if (response.ok) return;
  if (response.status === 412) throw new PreconditionFailedError(url);
  if (response.status === 401 || response.status === 403) {
    throw new RemoteAuthError(`iCloud refused the credentials (${response.status}). Reconnect iCloud with a new app-specific password.`);
  }
  if (response.status === 503 || response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new RemoteRetryLaterError(Number.isFinite(retryAfter) ? retryAfter : null, `iCloud is busy (${response.status})`);
  }
  throw new Error(`iCloud ${response.status} for ${url}`);
}

/** The book sync writes to: iCloud's default "card" book, else the first one. */
export function pickAddressBook(books: DAVAddressBook[], preferredUrl?: string | null): DAVAddressBook | null {
  if (preferredUrl) {
    const preferred = books.find(b => b.url === preferredUrl);
    if (preferred) return preferred;
  }
  return books.find(b => /\/card\/?$/.test(b.url)) ?? books[0] ?? null;
}

class TsdavICloudRemote implements ICloudRemote {
  constructor(private readonly client: DAVClient, private readonly book: DAVAddressBook) {}

  get collectionUrl(): string {
    return this.book.url;
  }

  async getCtag(): Promise<string | null> {
    const [response] = await this.client.propfind({
      url: this.book.url,
      props: { 'cs:getctag': {} },
      depth: '0'
    });
    const ctag = (response?.props as Record<string, unknown> | undefined)?.getctag;
    return typeof ctag === 'string' || typeof ctag === 'number' ? String(ctag) : null;
  }

  async listCards(): Promise<RemoteCardRef[]> {
    const listing = await this.client.addressBookQuery({ url: this.book.url, props: { 'd:getetag': {} }, depth: '1' });
    const self = this.book.url.replace(/\/$/, '');
    return listing
      .filter(res => res.href)
      .map(res => ({
        url: new URL(res.href!, this.book.url).href,
        etag: ((res.props as Record<string, unknown> | undefined)?.getetag as string | undefined) ?? null
      }))
      .filter(card => card.url.replace(/\/$/, '') !== self);
  }

  async fetchCards(urls: string[]): Promise<RemoteCardData[]> {
    const cards: RemoteCardData[] = [];
    for (let i = 0; i < urls.length; i += MULTIGET_BATCH) {
      const objects = await this.client.fetchVCards({
        addressBook: this.book,
        objectUrls: urls.slice(i, i + MULTIGET_BATCH).map(url => new URL(url).pathname)
      });
      for (const obj of objects) {
        if (typeof obj.data === 'string' && obj.data.includes('BEGIN:VCARD')) {
          cards.push({ url: new URL(obj.url, this.book.url).href, etag: obj.etag ?? null, data: obj.data });
        }
      }
    }
    return cards;
  }

  async createCard(filename: string, data: string): Promise<RemoteCardRef> {
    const url = new URL(filename, this.book.url).href;
    const response = await this.client.createVCard({ addressBook: this.book, vCardString: data, filename });
    checkResponse(response, url);
    return { url, etag: response.headers.get('etag') };
  }

  async updateCard(url: string, data: string, etag: string | null): Promise<RemoteCardRef> {
    const response = await this.client.updateVCard({ vCard: { url, data, etag: etag ?? undefined } });
    checkResponse(response, url);
    return { url, etag: response.headers.get('etag') };
  }

  async putCardAt(url: string, data: string, etag: string | null): Promise<RemoteCardRef> {
    const response = etag
      ? await this.client.updateVCard({ vCard: { url, data, etag } })
      : await this.client.createObject({
          url, data, headers: { 'content-type': 'text/vcard; charset=utf-8', 'If-None-Match': '*' }
        });
    checkResponse(response, url);
    return { url, etag: response.headers.get('etag') };
  }

  async deleteCard(url: string, etag: string | null): Promise<void> {
    const response = await this.client.deleteVCard({ vCard: { url, etag: etag ?? undefined } });
    // Already gone is as good as deleted.
    if (response.status === 404) return;
    checkResponse(response, url);
  }
}

/** Logs in and opens the address book sync uses. */
export async function openICloudRemote(email: string, appPassword: string, preferredUrl?: string | null): Promise<ICloudRemote> {
  const client = buildICloudClient(email, appPassword);
  try {
    await client.login();
  } catch (error) {
    throw new RemoteAuthError(`Could not sign in to iCloud: ${error instanceof Error ? error.message : String(error)}`);
  }
  const book = pickAddressBook(await client.fetchAddressBooks(), preferredUrl);
  if (!book) throw new Error('This iCloud account has no address book');
  return new TsdavICloudRemote(client, book);
}
