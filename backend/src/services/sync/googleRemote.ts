import { getValidAccessToken } from '../googleAuthService.js';
import type { GooglePersonRaw } from './googlePeople.js';
import { MAPPED_PERSON_FIELDS, type GooglePersonBody } from './googlePersonMapper.js';
import { PreconditionFailedError, RemoteAuthError, RemoteRetryLaterError } from './syncRuntime.js';

/**
 * The user's Google Contacts as the sync engine sees it, over the People API.
 * The engine talks only to this interface, so tests run it against an
 * in-memory account.
 *
 * Every write carries the contact's etag: Google rejects it if the contact
 * changed since (FAILED_PRECONDITION → PreconditionFailedError). Mutations
 * are sent one at a time with a pause between them and retried with back-off
 * on 429, because the People API limits writes per user per minute.
 */

/** What sync reads: everything Yello maps, plus metadata (deleted flag, sources) and photos. */
export const SYNC_PERSON_FIELDS = [...MAPPED_PERSON_FIELDS, 'metadata', 'photos'].join(',');
const UPDATE_FIELDS = MAPPED_PERSON_FIELDS.join(',');

export class SyncTokenExpiredError extends Error {}

export interface GoogleChanges {
  people: GooglePersonRaw[];
  nextSyncToken: string | null;
  /** True when this is the full list (no sync token, or it had expired). */
  full: boolean;
}

export interface GoogleRemote {
  /** People changed since `syncToken` (deleted ones flagged metadata.deleted), or everyone when null. */
  listChanges(syncToken: string | null): Promise<GoogleChanges>;
  getPeople(resourceNames: string[]): Promise<GooglePersonRaw[]>;
  /** Results in input order; a failed entry is an Error. */
  createContacts(bodies: GooglePersonBody[]): Promise<Array<GooglePersonRaw | Error>>;
  /** Results in input order; an etag mismatch is a PreconditionFailedError. */
  updateContacts(updates: Array<{ resourceName: string; etag: string | null; body: GooglePersonBody }>): Promise<Array<GooglePersonRaw | Error>>;
  /** Deletes in small batches; `onDeleted` is told after each batch, so progress survives an interruption. */
  deleteContacts(resourceNames: string[], onDeleted?: (batch: string[]) => void): Promise<void>;
  updatePhoto(resourceName: string, base64: string): Promise<GooglePersonRaw>;
  deletePhoto(resourceName: string): Promise<GooglePersonRaw>;
  /** A contact photo's bytes as base64, or null. */
  downloadPhoto(url: string): Promise<string | null>;
}

const API = 'https://people.googleapis.com/v1';
const BATCH = 200;
/**
 * Deletes count one by one against a per-minute, per-user quota ("Write
 * requests (Contact Deletes and Contact Group Writes)"), so they go in small
 * batches; when the quota is used up the client waits for the next minute.
 */
const DELETE_BATCH = 50;

export interface GoogleRemoteOptions {
  /** Milliseconds between mutating requests (default 1100). */
  mutateIntervalMs?: number;
  /** Retries on 429/503 (default 4). */
  maxRetries?: number;
  /** First back-off delay, doubled on each retry (default 2000 ms). */
  backoffBaseMs?: number;
  /** Wait after a per-minute quota error (default 61 s), and how many such waits one request may take (default 30). */
  quotaWaitMs?: number;
  maxQuotaWaits?: number;
  fetchImpl?: typeof fetch;
}

interface ApiError {
  error?: { code?: number; status?: string; message?: string };
}

class PeopleApiRemote implements GoogleRemote {
  private lastMutation = 0;
  private readonly mutateIntervalMs: number;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly quotaWaitMs: number;
  private readonly maxQuotaWaits: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly getToken: () => Promise<string | null>, options: GoogleRemoteOptions = {}) {
    this.mutateIntervalMs = options.mutateIntervalMs ?? 1100;
    this.maxRetries = options.maxRetries ?? 4;
    this.backoffBaseMs = options.backoffBaseMs ?? 2000;
    this.quotaWaitMs = options.quotaWaitMs ?? 61_000;
    this.maxQuotaWaits = options.maxQuotaWaits ?? 30;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(method: string, path: string, body?: unknown, mutating = false): Promise<T> {
    let quotaWaits = 0;
    for (let attempt = 0; ; attempt++) {
      if (mutating) {
        const wait = this.lastMutation + this.mutateIntervalMs - Date.now();
        if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
        this.lastMutation = Date.now();
      }
      const token = await this.getToken();
      if (!token) throw new RemoteAuthError('Google is not connected any more. Sign in with Google again.');
      const response = await this.fetchImpl(`${API}/${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      if (response.ok) {
        const text = await response.text();
        return (text ? JSON.parse(text) : {}) as T;
      }

      const payload = await response.json().catch(() => ({})) as ApiError;
      const status = payload.error?.status ?? '';
      const message = payload.error?.message ?? `Google People API ${response.status}`;
      // A per-minute quota frees up within a minute: wait it out rather than give up.
      if (response.status === 429 && /per minute/i.test(message) && quotaWaits < this.maxQuotaWaits) {
        quotaWaits++;
        attempt--;
        console.log(`[sync] Google quota reached (${path.split('?')[0]}); waiting ${Math.round(this.quotaWaitMs / 1000)} s`);
        await new Promise(resolve => setTimeout(resolve, this.quotaWaitMs));
        continue;
      }
      if ((response.status === 429 || response.status === 503) && attempt < this.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, this.backoffBaseMs * 2 ** attempt));
        continue;
      }
      if (response.status === 429 || response.status === 503) throw new RemoteRetryLaterError(null, message);
      if (response.status === 401) throw new RemoteAuthError('Google refused the sign-in. Sign in with Google again.');
      if (response.status === 403) throw new RemoteAuthError('Yello may not change your Google Contacts. Grant full Contacts access under Tools.');
      if (response.status === 410 || /sync ?token/i.test(message) || status === 'EXPIRED_SYNC_TOKEN') throw new SyncTokenExpiredError(message);
      if (status === 'FAILED_PRECONDITION' || /etag/i.test(message)) throw new PreconditionFailedError(path);
      throw new Error(`${message} (${response.status})`);
    }
  }

  async listChanges(syncToken: string | null): Promise<GoogleChanges> {
    const people: GooglePersonRaw[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;
    do {
      const params = new URLSearchParams({ personFields: SYNC_PERSON_FIELDS, pageSize: '1000', requestSyncToken: 'true' });
      if (syncToken) params.set('syncToken', syncToken);
      if (pageToken) params.set('pageToken', pageToken);
      const page = await this.request<{ connections?: GooglePersonRaw[]; nextPageToken?: string; nextSyncToken?: string }>(
        'GET', `people/me/connections?${params}`
      );
      people.push(...(page.connections ?? []));
      pageToken = page.nextPageToken;
      nextSyncToken = page.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
    return { people, nextSyncToken, full: !syncToken };
  }

  async getPeople(resourceNames: string[]): Promise<GooglePersonRaw[]> {
    const people: GooglePersonRaw[] = [];
    for (let i = 0; i < resourceNames.length; i += BATCH) {
      const params = new URLSearchParams({ personFields: SYNC_PERSON_FIELDS });
      for (const name of resourceNames.slice(i, i + BATCH)) params.append('resourceNames', name);
      const result = await this.request<{ responses?: Array<{ person?: GooglePersonRaw; httpStatusCode?: number }> }>(
        'GET', `people:batchGet?${params}`
      );
      for (const r of result.responses ?? []) if (r.person && (r.httpStatusCode ?? 200) === 200) people.push(r.person);
    }
    return people;
  }

  async createContacts(bodies: GooglePersonBody[]): Promise<Array<GooglePersonRaw | Error>> {
    const results: Array<GooglePersonRaw | Error> = [];
    for (let i = 0; i < bodies.length; i += BATCH) {
      const chunk = bodies.slice(i, i + BATCH);
      const result = await this.request<{ createdPeople?: Array<{ person?: GooglePersonRaw; status?: { message?: string } }> }>(
        'POST', 'people:batchCreateContacts',
        { contacts: chunk.map(contactPerson => ({ contactPerson })), readMask: SYNC_PERSON_FIELDS },
        true
      );
      const created = result.createdPeople ?? [];
      chunk.forEach((_, j) => {
        const entry = created[j];
        results.push(entry?.person ?? new Error(entry?.status?.message ?? 'Google did not create the contact'));
      });
    }
    return results;
  }

  async updateContacts(
    updates: Array<{ resourceName: string; etag: string | null; body: GooglePersonBody }>
  ): Promise<Array<GooglePersonRaw | Error>> {
    const results: Array<GooglePersonRaw | Error> = [];
    for (let i = 0; i < updates.length; i += BATCH) {
      const chunk = updates.slice(i, i + BATCH);
      try {
        const result = await this.request<{ updateResult?: Record<string, { person?: GooglePersonRaw; status?: { message?: string } }> }>(
          'POST', 'people:batchUpdateContacts',
          {
            contacts: Object.fromEntries(chunk.map(u => [u.resourceName, { ...u.body, etag: u.etag ?? undefined }])),
            updateMask: UPDATE_FIELDS,
            readMask: SYNC_PERSON_FIELDS
          },
          true
        );
        for (const u of chunk) {
          const entry = result.updateResult?.[u.resourceName];
          results.push(entry?.person ?? new Error(entry?.status?.message ?? 'Google did not update the contact'));
        }
      } catch (error) {
        if (!(error instanceof PreconditionFailedError)) throw error;
        // One stale etag fails the whole batch: retry one by one to find it.
        for (const u of chunk) {
          try {
            const params = new URLSearchParams({ updatePersonFields: UPDATE_FIELDS, personFields: SYNC_PERSON_FIELDS });
            results.push(await this.request<GooglePersonRaw>(
              'PATCH', `${u.resourceName}:updateContact?${params}`, { ...u.body, etag: u.etag ?? undefined }, true
            ));
          } catch (single) {
            if (single instanceof PreconditionFailedError) results.push(new PreconditionFailedError(u.resourceName));
            else if (single instanceof RemoteAuthError || single instanceof RemoteRetryLaterError) throw single;
            else results.push(single as Error);
          }
        }
      }
    }
    return results;
  }

  async deleteContacts(resourceNames: string[], onDeleted?: (batch: string[]) => void): Promise<void> {
    for (let i = 0; i < resourceNames.length; i += DELETE_BATCH) {
      const batch = resourceNames.slice(i, i + DELETE_BATCH);
      await this.request('POST', 'people:batchDeleteContacts', { resourceNames: batch }, true);
      onDeleted?.(batch);
    }
  }

  async updatePhoto(resourceName: string, base64: string): Promise<GooglePersonRaw> {
    const result = await this.request<{ person: GooglePersonRaw }>(
      'PATCH', `${resourceName}:updateContactPhoto`, { photoBytes: base64, personFields: SYNC_PERSON_FIELDS }, true
    );
    return result.person;
  }

  async downloadPhoto(url: string): Promise<string | null> {
    const token = await this.getToken();
    const response = await this.fetchImpl(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer()).toString('base64');
  }

  async deletePhoto(resourceName: string): Promise<GooglePersonRaw> {
    const result = await this.request<{ person: GooglePersonRaw }>(
      'DELETE', `${resourceName}:deleteContactPhoto?personFields=${SYNC_PERSON_FIELDS}`, undefined, true
    );
    return result.person;
  }
}

/** The user's Google Contacts, with their stored (and refreshed) OAuth token. */
export function openGoogleRemote(userId: number, options: GoogleRemoteOptions = {}): GoogleRemote {
  return new PeopleApiRemote(() => getValidAccessToken(userId), options);
}

/** For tests: the People API client against a fake fetch. */
export function peopleApiRemoteForTests(getToken: () => Promise<string | null>, options: GoogleRemoteOptions): GoogleRemote {
  return new PeopleApiRemote(getToken, options);
}
