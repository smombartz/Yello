import { describe, it, expect } from 'vitest';
import { parseVcf } from '../vcardParser.js';

const VCARD_SIMPLE = `BEGIN:VCARD
VERSION:3.0
FN:John Smith
N:Smith;John;;;
EMAIL;TYPE=work:john@example.com
TEL;TYPE=cell:+1-555-123-4567
END:VCARD`;

const VCARD_MULTI = `BEGIN:VCARD
VERSION:3.0
FN:John Smith
N:Smith;John;;;
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Jane Doe
N:Doe;Jane;;;
END:VCARD`;

describe('vcardParser', () => {
  it('should parse a simple vCard', () => {
    const result = parseVcf(VCARD_SIMPLE);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].displayName).toBe('John Smith');
    expect(result.contacts[0].firstName).toBe('John');
    expect(result.contacts[0].lastName).toBe('Smith');
  });

  it('should parse email addresses', () => {
    const result = parseVcf(VCARD_SIMPLE);
    expect(result.contacts[0].emails).toHaveLength(1);
    expect(result.contacts[0].emails[0].email).toBe('john@example.com');
    expect(result.contacts[0].emails[0].type).toBe('work');
  });

  it('should parse phone numbers', () => {
    const result = parseVcf(VCARD_SIMPLE);
    expect(result.contacts[0].phones).toHaveLength(1);
    expect(result.contacts[0].phones[0].phone).toMatch(/\+1555/);
  });

  it('should parse multiple vCards', () => {
    const result = parseVcf(VCARD_MULTI);
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].displayName).toBe('John Smith');
    expect(result.contacts[1].displayName).toBe('Jane Doe');
  });

  it('should handle malformed vCards gracefully', () => {
    const malformed = `BEGIN:VCARD
VERSION:3.0
END:VCARD`;
    const result = parseVcf(malformed);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
