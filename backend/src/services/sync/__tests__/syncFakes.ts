import { unfoldLines } from '../../vcardParser.js';
import { PreconditionFailedError, type ICloudRemote, type RemoteCardData, type RemoteCardRef } from '../icloudRemote.js';
import { cardFilename } from '../icloudSyncEngine.js';
import { SyncTokenExpiredError, type GoogleRemote } from '../googleRemote.js';
import type { GooglePersonRaw } from '../googlePeople.js';
import type { GooglePersonBody } from '../googlePersonMapper.js';

/** In-memory stand-ins for iCloud and Google, shared by the sync engine tests. */

export const BOOK = 'https://p01-contacts.icloud.com/1234/carddavhome/card/';

/** An iCloud address book in memory, with etags, a ctag and 412s like the real one. */
export class FakeICloud implements ICloudRemote {
  readonly collectionUrl = BOOK;
  cards = new Map<string, { etag: string; data: string }>();
  private ctag = 1;
  private etagCounter = 1;
  /** Rewrites every stored card, the way iCloud adds its own properties. */
  rewrite: ((data: string) => string) | null = null;
  /** Called once before the next update is applied (to simulate a concurrent phone edit). */
  beforeNextUpdate: (() => void) | null = null;
  writes = { create: 0, update: 0, delete: 0 };

  private store(url: string, data: string): string {
    const etag = `"${this.etagCounter++}"`;
    this.cards.set(url, { etag, data: this.rewrite ? this.rewrite(data) : data });
    this.ctag++;
    return etag;
  }

  async getCtag() { return String(this.ctag); }
  async listCards(): Promise<RemoteCardRef[]> {
    return [...this.cards].map(([url, c]) => ({ url, etag: c.etag }));
  }
  async fetchCards(urls: string[]): Promise<RemoteCardData[]> {
    return urls.filter(u => this.cards.has(u)).map(url => ({ url, ...this.cards.get(url)! }));
  }
  async createCard(filename: string, data: string): Promise<RemoteCardRef> {
    const url = new URL(filename, BOOK).href;
    if (this.cards.has(url)) throw new PreconditionFailedError(url);
    this.writes.create++;
    return { url, etag: this.store(url, data) };
  }
  async updateCard(url: string, data: string, etag: string | null): Promise<RemoteCardRef> {
    if (this.beforeNextUpdate) { const hook = this.beforeNextUpdate; this.beforeNextUpdate = null; hook(); }
    const current = this.cards.get(url);
    if (!current) throw new Error(`404 ${url}`);
    if (etag && current.etag !== etag) throw new PreconditionFailedError(url);
    this.writes.update++;
    return { url, etag: this.store(url, data) };
  }
  async deleteCard(url: string, etag: string | null): Promise<void> {
    const current = this.cards.get(url);
    if (!current) return;
    if (etag && current.etag !== etag) throw new PreconditionFailedError(url);
    this.writes.delete++;
    this.cards.delete(url);
    this.ctag++;
  }

  async putCardAt(url: string, data: string, etag: string | null): Promise<RemoteCardRef> {
    const current = this.cards.get(url);
    if (etag === null && current) throw new PreconditionFailedError(url);
    if (etag !== null && current?.etag !== etag) throw new PreconditionFailedError(url);
    return { url, etag: this.store(url, data) };
  }

  // What the user does on the phone:
  phoneEdit(url: string, edit: (data: string) => string): void {
    this.store(url, edit(unfoldLines(this.cards.get(url)!.data)));
  }
  phoneAdd(filename: string, data: string): string {
    const url = new URL(filename, BOOK).href;
    this.store(url, data);
    return url;
  }
  phoneDelete(url: string): void {
    this.cards.delete(url);
    this.ctag++;
  }
  urlOf(uid: string): string {
    return new URL(cardFilename(uid), BOOK).href;
  }
  cardOf(uid: string): string {
    return unfoldLines(this.cards.get(this.urlOf(uid))!.data);
  }
}


// ─── Google ─────────────────────────────────────────────────────────────────

type Person = GooglePersonRaw & Record<string, unknown>;

const CONTACT_SOURCE = { source: { type: 'CONTACT' } };
const SOURCED_FIELDS = [
  'names', 'nicknames', 'organizations', 'biographies', 'birthdays', 'genders', 'emailAddresses',
  'phoneNumbers', 'addresses', 'urls', 'imClients', 'relations', 'events'
];

/**
 * A Google Contacts account in memory: etags, sync tokens that can expire,
 * per-field source metadata and canonical phone numbers, the way the People
 * API returns contacts.
 */
export class FakeGoogle implements GoogleRemote {
  people = new Map<string, Person>();
  private seq = 0;
  private nextId = 1;
  private log: Array<{ seq: number; name: string; deleted: boolean }> = [];
  expireTokens = false;
  /** Called once before the next updateContacts is applied (a concurrent Gmail edit). */
  beforeNextUpdate: (() => void) | null = null;
  calls = { create: 0, update: 0, delete: 0, photo: 0 };
  bodies: Array<Record<string, unknown>> = [];

  private touch(name: string, deleted = false): void {
    this.log.push({ seq: ++this.seq, name, deleted });
  }

  /** What Google stores for a body Yello (or Gmail) wrote. */
  private store(name: string, body: Record<string, unknown>, keep: Partial<Person> = {}): Person {
    const person: Person = { ...keep, resourceName: name, etag: `e${this.seq + 1}` } as Person;
    for (const field of SOURCED_FIELDS) {
      const values = body[field] as Array<Record<string, unknown>> | undefined;
      if (values?.length) {
        (person as Record<string, unknown>)[field] = values.map(v => ({
          ...v,
          ...(field === 'phoneNumbers' ? { canonicalForm: String(v.value).replace(/[^\d+]/g, '') } : {}),
          metadata: CONTACT_SOURCE
        }));
      } else {
        delete (person as Record<string, unknown>)[field];
      }
    }
    if (body.clientData) person.clientData = body.clientData;
    person.metadata = { sources: [{ type: 'CONTACT', updateTime: new Date().toISOString() }] };
    this.people.set(name, person);
    this.touch(name);
    return person;
  }

  async listChanges(syncToken: string | null) {
    if (syncToken && this.expireTokens) throw new SyncTokenExpiredError('Sync token is expired');
    const since = syncToken ? Number(syncToken.slice(1)) : null;
    let people: GooglePersonRaw[];
    if (since === null) {
      people = [...this.people.values()];
    } else {
      const names = [...new Set(this.log.filter(e => e.seq > since).map(e => e.name))];
      people = names.map(name => this.people.get(name) ?? { resourceName: name, metadata: { deleted: true } } as GooglePersonRaw);
    }
    return { people: structuredClone(people), nextSyncToken: `t${this.seq}`, full: since === null };
  }
  async getPeople(names: string[]) {
    return structuredClone(names.map(n => this.people.get(n)).filter((p): p is Person => !!p));
  }
  async createContacts(bodies: GooglePersonBody[]) {
    this.calls.create += bodies.length;
    this.bodies.push(...bodies);
    return bodies.map(body => structuredClone(this.store(`people/c${this.nextId++}`, body)));
  }
  async updateContacts(updates: Array<{ resourceName: string; etag: string | null; body: GooglePersonBody }>) {
    if (this.beforeNextUpdate) { const hook = this.beforeNextUpdate; this.beforeNextUpdate = null; hook(); }
    return updates.map(u => {
      const current = this.people.get(u.resourceName);
      if (!current) return new Error('Not found');
      if (u.etag && current.etag !== u.etag) return new PreconditionFailedError(u.resourceName);
      this.calls.update++;
      this.bodies.push(u.body);
      return structuredClone(this.store(u.resourceName, u.body, { photos: current.photos, memberships: current.memberships }));
    });
  }
  async deleteContacts(names: string[], onDeleted?: (batch: string[]) => void) {
    for (const name of names) {
      if (this.people.delete(name)) { this.calls.delete++; this.touch(name, true); }
    }
    onDeleted?.(names);
  }
  async updatePhoto(name: string, base64: string) {
    const person = this.people.get(name)!;
    this.calls.photo++;
    person.photos = [{ url: `https://lh3.googleusercontent.com/contact/${name}/${base64.length}-${this.seq}`, metadata: CONTACT_SOURCE }];
    person.etag = `e${this.seq + 1}`;
    this.touch(name);
    return structuredClone(person);
  }
  async deletePhoto(name: string) {
    const person = this.people.get(name)!;
    delete person.photos;
    this.touch(name);
    return structuredClone(person);
  }
  async downloadPhoto() {
    return 'R09PR0xFUEhPVE8=';
  }

  // What the user does in Gmail:
  gmailEdit(name: string, edit: (person: Person) => void): void {
    const person = structuredClone(this.people.get(name)!);
    edit(person);
    person.etag = `e${this.seq + 1}`;
    this.people.set(name, person);
    this.touch(name);
  }
  gmailAdd(person: Partial<Person>): string {
    const name = `people/g${this.nextId++}`;
    this.people.set(name, { ...person, resourceName: name, etag: `e${this.seq + 1}`, metadata: { sources: [{ type: 'CONTACT' }] } } as Person);
    this.touch(name);
    return name;
  }
  gmailDelete(name: string): void {
    this.people.delete(name);
    this.touch(name, true);
  }
}
