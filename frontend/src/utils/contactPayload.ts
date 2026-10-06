import type {
  ContactEmail, ContactPhone, ContactAddress, ContactSocialProfile, ContactCategory,
  ContactInstantMessage, ContactUrl, ContactRelatedPerson, UpdateContactRequest,
} from '../api/types';
import { socialProfileFromUrl } from './contactFormatters';

export interface ContactFormLists {
  emails: ContactEmail[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
  socialProfiles: ContactSocialProfile[];
  categories: ContactCategory[];
  instantMessages: ContactInstantMessage[];
  urls: ContactUrl[];
  relatedPeople: ContactRelatedPerson[];
}

type ContactLists = Required<Pick<UpdateContactRequest,
  'emails' | 'phones' | 'addresses' | 'socialProfiles' | 'categories' | 'instantMessages' | 'urls' | 'relatedPeople'>>;

const has = (value: string | null | undefined): value is string => !!value?.trim();

const truncate = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 40 ? `${trimmed.slice(0, 39)}…` : trimmed;
};

/**
 * Turns the edit form's lists into the save payload. A row left completely
 * empty is skipped. A row with some data but no main value (an email type with
 * no address, say) is never dropped: it lands in `problems`, and callers refuse
 * to save until it is filled in or removed. Saving replaces each list
 * wholesale, so a dropped row would be deleted from the database.
 */
export function buildContactLists(form: ContactFormLists): { lists: ContactLists; problems: string[] } {
  const problems: string[] = [];

  const collect = <T, R>(
    items: T[],
    section: string,
    fields: (item: T) => Array<string | null | undefined>,
    missing: (item: T) => string | null,
    toPayload: (item: T) => R,
  ): R[] => items.flatMap(item => {
    const filled = fields(item).filter(has);
    if (filled.length === 0) return [];
    const problem = missing(item);
    if (problem) {
      problems.push(`${section} “${truncate(filled[0])}” ${problem}.`);
      return [];
    }
    return [toPayload(item)];
  });

  const lists: ContactLists = {
    phones: collect(form.phones, 'Phone',
      p => [p.phone, p.type],
      p => (has(p.phone) ? null : 'has no phone number'),
      p => ({ phone: p.phone, phoneDisplay: p.phoneDisplay, countryCode: p.countryCode, type: p.type, isPrimary: p.isPrimary })),

    emails: collect(form.emails, 'Email',
      e => [e.email, e.type],
      e => (has(e.email) ? null : 'has no email address'),
      e => ({ email: e.email, type: e.type, isPrimary: e.isPrimary })),

    addresses: collect(form.addresses, 'Address',
      a => [a.street, a.city, a.state, a.postalCode, a.country, a.type],
      a => ([a.street, a.city, a.state, a.postalCode, a.country].some(has) ? null : 'has no address filled in'),
      a => ({ street: a.street, city: a.city, state: a.state, postalCode: a.postalCode, country: a.country, type: a.type })),

    // A URL alone is enough: platform and username are derived from it.
    socialProfiles: collect(form.socialProfiles, 'Social link',
      s => [s.profileUrl, s.platform, s.username, s.type],
      s => (has(s.profileUrl) || (has(s.platform) && has(s.username)) ? null : 'needs a profile URL, or both a platform and a username'),
      s => {
        const fromUrl = has(s.profileUrl) ? socialProfileFromUrl(s.profileUrl) : null;
        return {
          platform: has(s.platform) ? s.platform : fromUrl!.platform,
          username: has(s.username) ? s.username : fromUrl!.username,
          profileUrl: s.profileUrl,
          type: s.type,
        };
      }),

    categories: collect(form.categories, 'Category',
      c => [c.category],
      () => null,
      c => ({ category: c.category })),

    instantMessages: collect(form.instantMessages, 'Instant message',
      im => [im.handle, im.service, im.type],
      im => (!has(im.handle) ? 'has no handle' : !has(im.service) ? 'has no service (Skype, AIM…)' : null),
      im => ({ service: im.service, handle: im.handle, type: im.type })),

    urls: collect(form.urls, 'Web link',
      u => [u.url, u.label, u.type],
      u => (has(u.url) ? null : 'has no URL'),
      u => ({ url: u.url, label: u.label, type: u.type })),

    relatedPeople: collect(form.relatedPeople, 'Related person',
      rp => [rp.name, rp.relationship],
      rp => (has(rp.name) ? null : 'has no name'),
      rp => ({ name: rp.name, relationship: rp.relationship, relatedContactId: rp.relatedContactId ?? null })),
  };

  return { lists, problems };
}
