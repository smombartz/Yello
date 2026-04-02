import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mapGooglePersonToParsedContact,
  fetchGoogleContacts,
  downloadGooglePhoto,
  type GoogleParsedContact,
} from '../services/googlePeopleService';

describe('mapGooglePersonToParsedContact', () => {
  it('maps a fully populated Google person to GoogleParsedContact', () => {
    const person = {
      resourceName: 'people/c123456789',
      names: [{ givenName: 'John', familyName: 'Doe', displayName: 'John Doe' }],
      emailAddresses: [
        { value: 'john@work.com', type: 'work' },
        { value: 'john@home.com', type: 'home' },
      ],
      phoneNumbers: [
        { value: '+14155551234', type: 'mobile' },
        { value: '(212) 555-9876', type: 'work' },
      ],
      addresses: [
        {
          streetAddress: '123 Main St',
          city: 'San Francisco',
          region: 'CA',
          postalCode: '94105',
          country: 'US',
          type: 'home',
        },
      ],
      organizations: [{ name: 'Acme Corp', title: 'Engineer' }],
      biographies: [{ value: 'Some notes about John' }],
      birthdays: [{ date: { year: 1990, month: 5, day: 15 } }],
      urls: [{ value: 'https://johndoe.com', type: 'homepage' }],
      photos: [
        {
          url: 'https://lh3.googleusercontent.com/photo123',
          metadata: { primary: true, source: { type: 'CONTACT' } },
        },
      ],
    };

    const result = mapGooglePersonToParsedContact(person);

    expect(result.googleResourceName).toBe('people/c123456789');
    expect(result.firstName).toBe('John');
    expect(result.lastName).toBe('Doe');
    expect(result.displayName).toBe('John Doe');
    expect(result.company).toBe('Acme Corp');
    expect(result.title).toBe('Engineer');
    expect(result.notes).toBe('Some notes about John');
    expect(result.birthday).toBe('1990-05-15');
    expect(result.rawVcard).toBe('');
    expect(result.photoBase64).toBeNull();
    expect(result.photoUrl).toBe('https://lh3.googleusercontent.com/photo123');

    // Emails
    expect(result.emails).toHaveLength(2);
    expect(result.emails[0]).toEqual({ email: 'john@work.com', type: 'work', isPrimary: true });
    expect(result.emails[1]).toEqual({ email: 'john@home.com', type: 'home', isPrimary: false });

    // Phones
    expect(result.phones).toHaveLength(2);
    expect(result.phones[0].phone).toBe('+14155551234');
    expect(result.phones[0].type).toBe('mobile');
    expect(result.phones[0].isPrimary).toBe(true);
    expect(result.phones[1].type).toBe('work');

    // Addresses
    expect(result.addresses).toHaveLength(1);
    expect(result.addresses[0]).toEqual({
      street: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'US',
      type: 'home',
    });

    // URLs
    expect(result.urls).toHaveLength(1);
    expect(result.urls[0]).toEqual({ url: 'https://johndoe.com', label: null, type: 'homepage' });

    // Empty arrays for fields Google doesn't provide
    expect(result.categories).toEqual([]);
    expect(result.instantMessages).toEqual([]);
    expect(result.relatedPeople).toEqual([]);
    expect(result.socialProfiles).toEqual([]);
  });

  it('maps a minimal contact with name only', () => {
    const person = {
      resourceName: 'people/c999',
      names: [{ givenName: 'Jane' }],
    };

    const result = mapGooglePersonToParsedContact(person);

    expect(result.googleResourceName).toBe('people/c999');
    expect(result.firstName).toBe('Jane');
    expect(result.lastName).toBeNull();
    expect(result.displayName).toBe('Jane');
    expect(result.company).toBeNull();
    expect(result.title).toBeNull();
    expect(result.notes).toBeNull();
    expect(result.birthday).toBeNull();
    expect(result.emails).toEqual([]);
    expect(result.phones).toEqual([]);
    expect(result.addresses).toEqual([]);
    expect(result.urls).toEqual([]);
    expect(result.photoUrl).toBeNull();
    expect(result.photoBase64).toBeNull();
    expect(result.rawVcard).toBe('');
  });

  it('falls back to email as displayName when no name is present', () => {
    const person = {
      resourceName: 'people/c555',
      emailAddresses: [{ value: 'noname@example.com', type: 'other' }],
    };

    const result = mapGooglePersonToParsedContact(person);

    expect(result.firstName).toBeNull();
    expect(result.lastName).toBeNull();
    expect(result.displayName).toBe('noname@example.com');
    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].isPrimary).toBe(true);
  });

  it('formats birthday without year as --MM-DD', () => {
    const person = {
      resourceName: 'people/c777',
      names: [{ givenName: 'Alex', familyName: 'Smith' }],
      birthdays: [{ date: { month: 12, day: 3 } }],
    };

    const result = mapGooglePersonToParsedContact(person);

    expect(result.birthday).toBe('--12-03');
  });

  it('skips default silhouette photos', () => {
    const person = {
      resourceName: 'people/c888',
      names: [{ givenName: 'Bob' }],
      photos: [
        {
          url: 'https://lh3.googleusercontent.com/default-user=s100',
          metadata: { primary: true, source: { type: 'CONTACT' } },
        },
      ],
    };

    const result = mapGooglePersonToParsedContact(person);
    expect(result.photoUrl).toBeNull();
  });

  it('skips DOMAIN_PROFILE photos', () => {
    const person = {
      resourceName: 'people/c889',
      names: [{ givenName: 'Corporate' }],
      photos: [
        {
          url: 'https://lh3.googleusercontent.com/photo456',
          metadata: { primary: true, source: { type: 'DOMAIN_PROFILE' } },
        },
      ],
    };

    const result = mapGooglePersonToParsedContact(person);
    expect(result.photoUrl).toBeNull();
  });
});

describe('fetchGoogleContacts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches contacts with pagination', async () => {
    const page1 = {
      connections: [
        {
          resourceName: 'people/c1',
          names: [{ givenName: 'Alice', displayName: 'Alice' }],
        },
      ],
      nextPageToken: 'token2',
      totalItems: 2,
    };
    const page2 = {
      connections: [
        {
          resourceName: 'people/c2',
          names: [{ givenName: 'Bob', displayName: 'Bob' }],
        },
      ],
      totalItems: 2,
    };

    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => (callCount === 1 ? page1 : page2),
        };
      }),
    );

    const result = await fetchGoogleContacts('test-token');

    expect(result).toHaveLength(2);
    expect(result[0].googleResourceName).toBe('people/c1');
    expect(result[1].googleResourceName).toBe('people/c2');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws GOOGLE_TOKEN_EXPIRED on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
      })),
    );

    await expect(fetchGoogleContacts('bad-token')).rejects.toBe('GOOGLE_TOKEN_EXPIRED');
  });

  it('throws GOOGLE_CONTACTS_SCOPE_REQUIRED on 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
      })),
    );

    await expect(fetchGoogleContacts('no-scope-token')).rejects.toBe(
      'GOOGLE_CONTACTS_SCOPE_REQUIRED',
    );
  });
});

describe('downloadGooglePhoto', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads photo and returns base64 string', async () => {
    const fakeBuffer = new ArrayBuffer(4);
    const view = new Uint8Array(fakeBuffer);
    view.set([0x89, 0x50, 0x4e, 0x47]); // PNG header bytes

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => fakeBuffer,
      })),
    );

    const result = await downloadGooglePhoto(
      'https://lh3.googleusercontent.com/photo123',
      'test-token',
    );

    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
    // Verify the Authorization header was passed
    expect(fetch).toHaveBeenCalledWith(
      'https://lh3.googleusercontent.com/photo123',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
  });

  it('returns null on failed download', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
      })),
    );

    const result = await downloadGooglePhoto(
      'https://lh3.googleusercontent.com/missing',
      'test-token',
    );

    expect(result).toBeNull();
  });
});
