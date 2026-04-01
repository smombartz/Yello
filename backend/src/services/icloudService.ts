import { DAVClient, DAVObject } from 'tsdav';
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
