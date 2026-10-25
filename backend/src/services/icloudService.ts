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
    const listing = await client.addressBookQuery({
      url: addressBook.url,
      props: { 'd:getetag': {} },
      depth: '1',
    });
    const urls = listing
      .map(res => res.href ?? '')
      .filter(Boolean)
      .map(href => new URL(href, addressBook.url).href)
      .filter(url => url.replace(/\/$/, '') !== addressBook.url.replace(/\/$/, ''));

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
