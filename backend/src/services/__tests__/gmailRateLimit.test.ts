import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPacer, isRateLimitError } from '../gmailActivityService.js';

// The error a Top contacts scan hit (body as Gmail sends it, pretty-printed)
const PER_MINUTE_QUOTA = `Gmail API error: 403 {
  "error": {
    "code": 403,
    "message": "Quota exceeded for quota metric 'Queries' and limit 'Previous quota: Units per minute per user' of service 'gmail.googleapis.com' for consumer 'project_number:688969661981'.",
    "errors": [
      {
        "message": "Quota exceeded for quota metric 'Queries' and limit 'Previous quota: Units per minute per user' of service 'gmail.googleapis.com' for consumer 'project_number:688969661981'.",
        "domain": "usageLimits"
      }
    ]
  }
}`;

describe('isRateLimitError', () => {
  it('treats the per-minute quota 403 as rate limiting', () => {
    expect(isRateLimitError(PER_MINUTE_QUOTA)).toBe(true);
  });

  it('treats 429 and rateLimitExceeded 403s as rate limiting', () => {
    expect(isRateLimitError('Gmail API error: 429 Too Many Requests')).toBe(true);
    expect(isRateLimitError('Gmail API error: 403 {"reason": "userRateLimitExceeded"}')).toBe(true);
    expect(isRateLimitError('Gmail API error: 403 {"reason": "rateLimitExceeded"}')).toBe(true);
  });

  it('does not retry daily limits or other 403s', () => {
    expect(isRateLimitError('Gmail API error: 403 {"reason": "dailyLimitExceeded", "message": "Quota exceeded"}')).toBe(false);
    expect(isRateLimitError('Gmail API error: 403 {"message": "Gmail API has not been used in project"}')).toBe(false);
    expect(isRateLimitError('Gmail API error: 404 rateLimitExceeded')).toBe(false);
  });
});

describe('createPacer', () => {
  afterEach(() => vi.useRealTimers());

  it('spaces request starts evenly, even when called in parallel', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const pacer = createPacer(10); // one every 100 ms
    const starts: number[] = [];
    const all = Promise.all([0, 1, 2, 3].map(() => pacer.wait().then(() => starts.push(Date.now()))));
    await vi.runAllTimersAsync();
    await all;
    expect(starts).toEqual([0, 100, 200, 300]);
  });

  it('pause holds back the next request', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const pacer = createPacer(10);
    await pacer.wait();
    pacer.pause(5_000);
    const next = pacer.wait().then(() => Date.now());
    await vi.runAllTimersAsync();
    expect(await next).toBe(5_000);
  });
});
