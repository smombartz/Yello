import { describe, it, expect } from 'vitest';
import { generateVcard, injectGeoIntoVcard, type ContactForVcard } from '../vcardGenerator.js';
import { parseVcf } from '../vcardParser.js';

/**
 * Export → import must preserve geocoding. Before GEO parsing existed the
 * coordinates were written on export and silently dropped on import, so a
 * round trip forced every address back through the paid geocoding API.
 */
function baseContact(overrides: Partial<ContactForVcard> = {}): ContactForVcard {
  return {
    firstName: 'Ada',
    lastName: 'Lovelace',
    displayName: 'Ada Lovelace',
    company: null,
    title: null,
    notes: null,
    birthday: null,
    emails: [],
    phones: [],
    addresses: [],
    socialProfiles: [],
    urls: [],
    categories: [],
    instantMessages: [],
    relatedPeople: [],
    photoHash: null,
    ...overrides
  } as ContactForVcard;
}

describe('GEO export/import round trip', () => {
  it('preserves coordinates through generateVcard', () => {
    const vcard = generateVcard(baseContact({
      addresses: [{
        street: '1 Infinite Loop',
        city: 'Cupertino',
        state: 'CA',
        postalCode: '95014',
        country: 'USA',
        type: 'home',
        latitude: 37.331741,
        longitude: -122.030333
      }]
    }));

    expect(vcard).toContain('item1.GEO:37.331741;-122.030333');

    const { contacts } = parseVcf(vcard);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].addresses[0].latitude).toBeCloseTo(37.331741);
    expect(contacts[0].addresses[0].longitude).toBeCloseTo(-122.030333);
  });

  it('keeps coordinates on the correct address when only some are geocoded', () => {
    const vcard = generateVcard(baseContact({
      addresses: [
        {
          street: '1 Ungeocoded Way', city: 'Nowhere', state: null,
          postalCode: null, country: null, type: 'work',
          latitude: null, longitude: null
        },
        {
          street: '2 Geocoded Rd', city: 'Somewhere', state: 'CA',
          postalCode: '90210', country: 'USA', type: 'home',
          latitude: 34.090009, longitude: -118.406497
        }
      ]
    }));

    const { contacts } = parseVcf(vcard);
    const addresses = contacts[0].addresses;

    expect(addresses).toHaveLength(2);
    expect(addresses[0].street).toBe('1 Ungeocoded Way');
    expect(addresses[0].latitude).toBeNull();
    expect(addresses[1].street).toBe('2 Geocoded Rd');
    expect(addresses[1].latitude).toBeCloseTo(34.090009);
  });

  it('preserves coordinates through injectGeoIntoVcard on a raw vCard', () => {
    // The default export path reuses each contact's stored raw_vcard and
    // injects current coordinates, rather than regenerating the card.
    const raw = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Grace Hopper',
      'N:Hopper;Grace;;;',
      'ADR;TYPE=HOME:;;1 Navy Yard;Arlington;VA;22202;USA',
      'END:VCARD'
    ].join('\r\n');

    const injected = injectGeoIntoVcard(raw, [{
      street: '1 Navy Yard',
      city: 'Arlington',
      postalCode: '22202',
      latitude: 38.870833,
      longitude: -77.056111
    }]);

    const { contacts } = parseVcf(injected);
    expect(contacts[0].addresses[0].latitude).toBeCloseTo(38.870833);
    expect(contacts[0].addresses[0].longitude).toBeCloseTo(-77.056111);
  });
});
