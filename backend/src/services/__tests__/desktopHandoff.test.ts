import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHash, randomBytes } from 'crypto';
import {
  isValidChallenge,
  createHandoffCode,
  consumeHandoffCode,
  renderHandoffPage,
  HANDOFF_CODE_TTL_MS,
} from '../desktopHandoff.js';

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

describe('desktopHandoff', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isValidChallenge', () => {
    it('accepts a base64url SHA-256 digest', () => {
      expect(isValidChallenge(pkcePair().challenge)).toBe(true);
    });

    it('rejects wrong length, bad characters and non-strings', () => {
      expect(isValidChallenge('abc')).toBe(false);
      expect(isValidChallenge('a'.repeat(44))).toBe(false);
      expect(isValidChallenge('+'.repeat(43))).toBe(false);
      expect(isValidChallenge(undefined)).toBe(false);
    });
  });

  it('returns the user and redirect path for the matching verifier', () => {
    const { verifier, challenge } = pkcePair();
    const code = createHandoffCode(42, challenge, '/dashboard');

    expect(consumeHandoffCode(code, verifier)).toEqual({ userId: 42, redirectPath: '/dashboard' });
  });

  it('is single use', () => {
    const { verifier, challenge } = pkcePair();
    const code = createHandoffCode(42, challenge, '/dashboard');

    consumeHandoffCode(code, verifier);
    expect(consumeHandoffCode(code, verifier)).toBeNull();
  });

  it('burns the code when the verifier is wrong', () => {
    const { verifier, challenge } = pkcePair();
    const code = createHandoffCode(42, challenge, '/dashboard');

    expect(consumeHandoffCode(code, pkcePair().verifier)).toBeNull();
    expect(consumeHandoffCode(code, verifier)).toBeNull();
  });

  it('rejects an expired code', () => {
    vi.useFakeTimers();
    const { verifier, challenge } = pkcePair();
    const code = createHandoffCode(42, challenge, '/dashboard');

    vi.advanceTimersByTime(HANDOFF_CODE_TTL_MS + 1);
    expect(consumeHandoffCode(code, verifier)).toBeNull();
  });

  it('rejects an unknown code', () => {
    expect(consumeHandoffCode('nope', pkcePair().verifier)).toBeNull();
  });

  it('renders a page that links to the yello:// deep link', () => {
    const html = renderHandoffPage('abc123');
    expect(html).toContain('url=yello://auth?code=abc123');
    expect(html).toContain('href="yello://auth?code=abc123"');
    expect(html).not.toContain('<script');
  });
});
