import { describe, it, expect } from 'vitest';
import { peopleApiRemoteForTests, SyncTokenExpiredError } from '../googleRemote.js';
import { PreconditionFailedError, RemoteAuthError } from '../syncRuntime.js';

interface Call { method: string; url: string; body: unknown }

/** A scripted fetch: each handler answers the next matching request. */
function fakeFetch(handlers: Array<(call: Call) => { status: number; json?: unknown } | null>) {
  const calls: Call[] = [];
  const impl = (async (input: string, init?: RequestInit) => {
    const call = { method: init?.method ?? 'GET', url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    for (const handler of handlers) {
      const answer = handler(call);
      if (answer) {
        return new Response(answer.json === undefined ? '' : JSON.stringify(answer.json), { status: answer.status });
      }
    }
    return new Response(JSON.stringify({ error: { message: 'unexpected' } }), { status: 500 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const remoteWith = (impl: typeof fetch) =>
  peopleApiRemoteForTests(async () => 'token', { fetchImpl: impl, mutateIntervalMs: 0, backoffBaseMs: 0, quotaWaitMs: 0 });

describe('People API client', () => {
  it('pages through connections and returns the sync token', async () => {
    const { impl, calls } = fakeFetch([
      c => (c.url.includes('pageToken=p2') ? { status: 200, json: { connections: [{ resourceName: 'people/c2' }], nextSyncToken: 'T2' } } : null),
      c => (c.url.includes('connections') ? { status: 200, json: { connections: [{ resourceName: 'people/c1' }], nextPageToken: 'p2' } } : null)
    ]);
    const result = await remoteWith(impl).listChanges(null);
    expect(result.people.map(p => p.resourceName)).toEqual(['people/c1', 'people/c2']);
    expect(result.nextSyncToken).toBe('T2');
    expect(result.full).toBe(true);
    expect(calls[0].url).toContain('requestSyncToken=true');
    expect(calls[0].url).toContain('personFields=');
  });

  it('reports an expired sync token', async () => {
    const { impl } = fakeFetch([() => ({ status: 410, json: { error: { status: 'EXPIRED_SYNC_TOKEN', message: 'Sync token is expired' } } })]);
    await expect(remoteWith(impl).listChanges('old')).rejects.toBeInstanceOf(SyncTokenExpiredError);
  });

  it('falls back to single updates when one etag in a batch is stale', async () => {
    const { impl, calls } = fakeFetch([
      c => (c.url.endsWith('people:batchUpdateContacts') ? { status: 400, json: { error: { status: 'FAILED_PRECONDITION', message: 'etag mismatch' } } } : null),
      c => (c.url.includes('people/c1:updateContact') ? { status: 200, json: { resourceName: 'people/c1', etag: 'new' } } : null),
      c => (c.url.includes('people/c2:updateContact') ? { status: 400, json: { error: { status: 'FAILED_PRECONDITION', message: 'etag mismatch' } } } : null)
    ]);
    const results = await remoteWith(impl).updateContacts([
      { resourceName: 'people/c1', etag: 'a', body: { names: [] } },
      { resourceName: 'people/c2', etag: 'stale', body: { names: [] } }
    ]);
    expect((results[0] as { etag: string }).etag).toBe('new');
    expect(results[1]).toBeInstanceOf(PreconditionFailedError);
    expect(calls.filter(c => c.method === 'PATCH')).toHaveLength(2);
    expect((calls[0].body as { updateMask: string }).updateMask).not.toContain('memberships');
  });

  it('retries a rate-limited write', async () => {
    let attempts = 0;
    const { impl } = fakeFetch([
      c => (c.url.endsWith('people:batchCreateContacts')
        ? (++attempts < 3 ? { status: 429, json: { error: { message: 'quota' } } } : { status: 200, json: { createdPeople: [{ person: { resourceName: 'people/c9' } }] } })
        : null)
    ]);
    const [created] = await remoteWith(impl).createContacts([{ names: [{ givenName: 'A' }] }]);
    expect((created as { resourceName: string }).resourceName).toBe('people/c9');
    expect(attempts).toBe(3);
  });

  it('waits out a per-minute quota instead of giving up, and deletes in small batches', async () => {
    let calls = 0;
    const { impl } = fakeFetch([
      c => {
        if (!c.url.endsWith('people:batchDeleteContacts')) return null;
        calls++;
        // Every third request runs into the per-minute quota.
        return calls % 3 === 0
          ? { status: 429, json: { error: { status: 'RESOURCE_EXHAUSTED', message: "Quota exceeded for quota metric 'Write requests (Contact Deletes and Contact Group Writes)' and limit '... per minute per user'" } } }
          : { status: 200, json: {} };
      }
    ]);
    const names = Array.from({ length: 120 }, (_, i) => `people/c${i}`);
    const batches: number[] = [];
    await remoteWith(impl).deleteContacts(names, batch => batches.push(batch.length));
    expect(batches).toEqual([50, 50, 20]);
    expect(calls).toBe(4); // three batches, one of them retried after the quota wait
  });

  it('turns a missing permission into an auth error', async () => {
    const { impl } = fakeFetch([() => ({ status: 403, json: { error: { message: 'insufficient scope' } } })]);
    await expect(remoteWith(impl).deleteContacts(['people/c1'])).rejects.toBeInstanceOf(RemoteAuthError);
  });
});
