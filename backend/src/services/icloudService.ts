import { DAVClient, type DAVAddressBook, type DAVObject } from 'tsdav';
import { parseVcf, type ParsedContact } from './vcardParser.js';

export interface ICloudConnectionResult {
  success: boolean;
  error?: string;
  addressBookCount?: number;
}

export interface ICloudFetchResult {
  contacts: ParsedContact[];
  errors: Array<{ line: number; reason: string }>;
  total: number;
}

/**
 * Create a tsdav DAVClient configured for iCloud CardDAV.
 * Does NOT log in — call client.login() separately.
 */
export function buildICloudClient(email: string, appPassword: string): DAVClient {
  return new DAVClient({
    serverUrl: 'https://contacts.icloud.com',
    credentials: {
      username: email,
      password: appPassword,
    },
    authMethod: 'Basic',
    defaultAccountType: 'carddav',
  });
}

/**
 * Test whether the provided iCloud credentials are valid.
 */
export async function testICloudConnection(
  email: string,
  appPassword: string
): Promise<ICloudConnectionResult> {
  try {
    const client = buildICloudClient(email, appPassword);
    await client.login();
    const addressBooks = await client.fetchAddressBooks();
    return {
      success: true,
      addressBookCount: addressBooks.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Fetch all contacts from iCloud and parse them into ParsedContact[].
 */
export async function fetchICloudContacts(
  email: string,
  appPassword: string
): Promise<ICloudFetchResult> {
  const client = buildICloudClient(email, appPassword);
  await client.login();

  const addressBooks = await client.fetchAddressBooks();
  if (addressBooks.length === 0) {
    return { contacts: [], errors: [], total: 0 };
  }

  // Fetch vCards from all address books
  const allVCards: DAVObject[] = [];
  for (const book of addressBooks) {
    const vcards = await client.fetchVCards({ addressBook: book });
    allVCards.push(...vcards);
  }

  // Combine all vCard data into a single string for the parser
  const vcfContent = allVCards
    .map((obj) => obj.data)
    .filter((data): data is string => typeof data === 'string' && data.includes('BEGIN:VCARD'))
    .join('\n');

  if (!vcfContent) {
    return { contacts: [], errors: [], total: 0 };
  }

  const { contacts, errors } = parseVcf(vcfContent);
  return { contacts, errors, total: contacts.length };
}

/** One card in an iCloud address book, as the server stores it. */
export interface ICloudCard {
  /** Absolute URL of the card resource. */
  url: string;
  etag: string | null;
  /** The vCard text exactly as returned. */
  data: string;
}

/** A card's URL and etag, as an address-book listing gives them. */
export interface ICloudCardRef {
  url: string;
  etag: string | null;
}

interface DavResponse {
  href?: string;
  status?: number;
  props?: Record<string, unknown>;
  raw?: unknown;
}

/** A listing iCloud cut short: RFC 6352 marks it with a 507 response. */
const isTruncated = (responses: DavResponse[]) => responses.some(r => r.status === 507);

function toRefs(responses: DavResponse[], book: DAVAddressBook): ICloudCardRef[] {
  const self = book.url.replace(/\/$/, '');
  const refs = new Map<string, ICloudCardRef>();
  for (const res of responses) {
    if (!res.href || (res.status ?? 200) >= 400) continue;
    const url = new URL(res.href, book.url).href;
    if (url.replace(/\/$/, '') === self) continue;
    refs.set(url, { url, etag: (res.props?.getetag as string | undefined) ?? null });
  }
  return [...refs.values()];
}

/**
 * Every card URL in an address book with its etag. iCloud cuts a large
 * addressbook-query short (a 507 in the answer), so this lists with PROPFIND,
 * and when that is cut short too, pages through sync-collection, which iCloud
 * answers in parts until the whole book is listed.
 */
export async function listAddressBookCards(client: DAVClient, book: DAVAddressBook): Promise<ICloudCardRef[]> {
  const props = { 'd:getetag': {} };
  try {
    const responses = await client.propfind({ url: book.url, props, depth: '1' }) as DavResponse[];
    if (!isTruncated(responses)) return toRefs(responses, book);
  } catch { /* fall back to sync-collection */ }

  const all: DavResponse[] = [];
  let syncToken = '';
  for (let page = 0; page < 1000; page++) {
    const responses = await client.syncCollection({ url: book.url, props, syncLevel: 1, syncToken }) as DavResponse[];
    all.push(...responses);
    const raw = responses[0]?.raw as { multistatus?: { syncToken?: string } } | undefined;
    const next = raw?.multistatus?.syncToken;
    if (!isTruncated(responses) || !next || next === syncToken) return toRefs(all, book);
    syncToken = next;
  }
  throw new Error('iCloud kept the address book listing unfinished');
}

/** Cards fetched per CARDDAV:addressbook-multiget request. */
const MULTIGET_BATCH = 100;

/**
 * Streams every card of every address book, MULTIGET_BATCH at a time, so the
 * caller never holds the whole book (photos included) in memory at once.
 * Lists hrefs first (etags only), then multigets them in batches.
 */
export async function* streamICloudCards(
  client: DAVClient
): AsyncGenerator<{ addressBook: DAVAddressBook; cards: ICloudCard[]; requested: number }> {
  const addressBooks = await client.fetchAddressBooks();

  for (const addressBook of addressBooks) {
    const urls = (await listAddressBookCards(client, addressBook)).map(card => card.url);

    for (let i = 0; i < urls.length; i += MULTIGET_BATCH) {
      const batch = urls.slice(i, i + MULTIGET_BATCH);
      const objects = await client.fetchVCards({ addressBook, objectUrls: batch });
      const cards = objects
        .filter((obj): obj is DAVObject & { data: string } =>
          typeof obj.data === 'string' && obj.data.includes('BEGIN:VCARD'))
        .map(obj => ({ url: new URL(obj.url, addressBook.url).href, etag: obj.etag ?? null, data: obj.data }));
      yield { addressBook, cards, requested: batch.length };
    }
  }
}
