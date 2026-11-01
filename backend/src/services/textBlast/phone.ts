import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

export type NormalizedPhone = { e164: string } | { problem: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Turn whatever is in a phone cell into an E.164 number (or an iMessage email address).
 * Numbers without a +country code use `region`. Ported from TextBlast's normalize_phone.
 */
export function normalizePhone(raw: string, region: string): NormalizedPhone {
  let s = (raw ?? '').trim();
  if (!s) return { problem: 'no phone number' };
  if (s.includes('@')) {
    return EMAIL_RE.test(s) ? { e164: s.toLowerCase() } : { problem: 'not a valid email address' };
  }
  if (s.startsWith('00')) s = '+' + s.slice(2); // 0049... → +49...
  const international = s.startsWith('+');
  const parsed = parsePhoneNumberFromString(s, international ? undefined : (region as CountryCode));
  if (!parsed) return { problem: "can't read this number" };
  if (!parsed.isValid()) {
    return { problem: international ? 'not a valid number' : `not a valid number for ${region}; add the +country code` };
  }
  return { e164: parsed.number };
}
