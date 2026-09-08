import { describe, it, expect } from 'vitest';
import { generateVcard, injectGeoIntoVcard, type ContactForVcard } from '../vcardGenerator.js';
import { parseVcf } from '../vcardParser.js';

function baseContact(overrides: Partial<ContactForVcard> = {}): ContactForVcard {
  return {
    firstName: 'John',
    lastName: 'Smith',
    displayName: 'John Smith',
    company: null,
    title: null,
    notes: null,
    birthday: null,
    emails: [],
    phones: [],
    addresses: [],
    socialProfiles: [],
    categories: [],
    ...overrides
  };
}

const BERLIN = {
  street: 'Unter den Linden 1',
  city: 'Berlin',
  state: null,
  postalCode: '10117',
  country: 'Germany',
  type: 'home'
};

describe('generateVcard GEO support', () => {
  it('emits grouped ADR/LABEL/GEO for a geocoded address', () => {
    const vcard = generateVcard(baseContact({
      addresses: [{ ...BERLIN, latitude: 52.5170365, longitude: 13.3888599 }]
    }));

    expect(vcard).toContain('item1.ADR;TYPE=HOME:');
    expect(vcard).toContain('item1.LABEL;TYPE=HOME:');
    expect(vcard).toContain('item1.GEO:52.5170365;13.3888599');
  });

  it('keeps ungeocoded addresses ungrouped without GEO', () => {
    const vcard = generateVcard(baseContact({
      addresses: [{ ...BERLIN, latitude: null, longitude: null }]
    }));

    expect(vcard).toContain('ADR;TYPE=HOME:');
    expect(vcard).not.toContain('item1.');
    expect(vcard).not.toContain('GEO:');
  });

  it('only groups the geocoded addresses in a mixed set', () => {
    const vcard = generateVcard(baseContact({
      addresses: [
        { ...BERLIN, latitude: null, longitude: null },
        {
          street: '1 Infinite Loop',
          city: 'Cupertino',
          state: 'CA',
          postalCode: '95014',
          country: 'USA',
          type: 'work',
          latitude: 37.3318,
          longitude: -122.0312
        }
      ]
    }));

    const lines = vcard.split('\r\n');
    expect(lines.some(l => l.startsWith('ADR;TYPE=HOME:'))).toBe(true);
    expect(lines.some(l => l.startsWith('item1.ADR;TYPE=WORK:'))).toBe(true);
    expect(lines).toContain('item1.GEO:37.3318;-122.0312');
    expect(vcard).not.toContain('item2.');
  });

  it('produces a vCard that still parses', () => {
    const vcard = generateVcard(baseContact({
      addresses: [{ ...BERLIN, latitude: 52.5170365, longitude: 13.3888599 }]
    }));

    const result = parseVcf(vcard);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].addresses).toHaveLength(1);
    expect(result.contacts[0].addresses[0].city).toBe('Berlin');
  });
});

describe('injectGeoIntoVcard', () => {
  const dbAddress = {
    street: 'Unter den Linden 1',
    city: 'Berlin',
    postalCode: '10117',
    latitude: 52.5170365,
    longitude: 13.3888599
  };

  it('adds GEO to an already-grouped ADR using its group', () => {
    const raw = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:John Smith',
      'item1.ADR;TYPE=HOME:;;Unter den Linden 1;Berlin;;10117;Germany',
      'END:VCARD'
    ].join('\r\n');

    const result = injectGeoIntoVcard(raw, [dbAddress]);
    const lines = result.split('\r\n');
    const adrIdx = lines.findIndex(l => l.startsWith('item1.ADR'));
    expect(lines[adrIdx + 1]).toBe('item1.GEO:52.5170365;13.3888599');
  });

  it('groups an ungrouped ADR (and its LABEL) with a new group', () => {
    const raw = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:John Smith',
      'ADR;TYPE=HOME:;;Unter den Linden 1;Berlin;;10117;Germany',
      'LABEL;TYPE=HOME:Unter den Linden 1\\n10117 Berlin\\nGermany',
      'END:VCARD'
    ].join('\r\n');

    const result = injectGeoIntoVcard(raw, [dbAddress]);
    const lines = result.split('\r\n');
    expect(lines).toContain('yello1.ADR;TYPE=HOME:;;Unter den Linden 1;Berlin;;10117;Germany');
    expect(lines).toContain('yello1.LABEL;TYPE=HOME:Unter den Linden 1\\n10117 Berlin\\nGermany');
    expect(lines).toContain('yello1.GEO:52.5170365;13.3888599');
  });

  it('replaces pre-existing GEO properties', () => {
    const raw = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:John Smith',
      'GEO:1.0;2.0',
      'item1.ADR;TYPE=HOME:;;Unter den Linden 1;Berlin;;10117;Germany',
      'item1.GEO:3.0;4.0',
      'END:VCARD'
    ].join('\r\n');

    const result = injectGeoIntoVcard(raw, [dbAddress]);
    expect(result).not.toContain('GEO:1.0;2.0');
    expect(result).not.toContain('GEO:3.0;4.0');
    expect(result).toContain('item1.GEO:52.5170365;13.3888599');
  });

  it('matches a folded ADR line', () => {
    const raw = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:John Smith',
      'item1.ADR;TYPE=HOME:;;Unter den Linden ',
      ' 1;Berlin;;10117;Germany',
      'END:VCARD'
    ].join('\r\n');

    const result = injectGeoIntoVcard(raw, [dbAddress]);
    expect(result).toContain('item1.GEO:52.5170365;13.3888599');
    // Folded raw lines are preserved as-is
    expect(result).toContain('item1.ADR;TYPE=HOME:;;Unter den Linden \r\n 1;Berlin;;10117;Germany');
  });

  it('falls back to positional matching when counts align', () => {
    const raw = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:John Smith',
      'item1.ADR;TYPE=HOME:;;Somewhere else entirely;Berlin;;99999;Germany',
      'END:VCARD'
    ].join('\r\n');

    const result = injectGeoIntoVcard(raw, [dbAddress]);
    expect(result).toContain('item1.GEO:52.5170365;13.3888599');
  });

  it('does not inject when no ADR matches and counts differ', () => {
    const raw = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:John Smith',
      'ADR;TYPE=HOME:;;Somewhere else;Munich;;80331;Germany',
      'ADR;TYPE=WORK:;;Also elsewhere;Hamburg;;20095;Germany',
      'END:VCARD'
    ].join('\r\n');

    const result = injectGeoIntoVcard(raw, [dbAddress]);
    expect(result).toBe(raw);
  });

  it('returns the vCard unchanged when no address has coordinates', () => {
    const raw = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:John Smith',
      'ADR;TYPE=HOME:;;Unter den Linden 1;Berlin;;10117;Germany',
      'END:VCARD'
    ].join('\r\n');

    const result = injectGeoIntoVcard(raw, [{ ...dbAddress, latitude: null, longitude: null }]);
    expect(result).toBe(raw);
  });

  it('avoids colliding with existing yello groups', () => {
    const raw = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:John Smith',
      'yello1.URL:https://example.com',
      'ADR;TYPE=HOME:;;Unter den Linden 1;Berlin;;10117;Germany',
      'END:VCARD'
    ].join('\r\n');

    const result = injectGeoIntoVcard(raw, [dbAddress]);
    expect(result).toContain('yello2.ADR;TYPE=HOME:');
    expect(result).toContain('yello2.GEO:52.5170365;13.3888599');
  });
});
