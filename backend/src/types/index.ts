export interface Contact {
  id: number;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  company: string | null;
  title: string | null;
  notes: string | null;
  birthday: string | null;
  photoHash: string | null;
  rawVcard: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactEmail {
  id: number;
  contactId: number;
  email: string;
  type: string | null;
  isPrimary: boolean;
}

export interface ContactPhone {
  id: number;
  contactId: number;
  phone: string;
  phoneDisplay: string;
  countryCode: string | null;
  type: string | null;
  isPrimary: boolean;
}

export interface ContactAddress {
  id: number;
  contactId: number;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  type: string | null;
}

export interface ContactSocialProfile {
  id: number;
  contactId: number;
  platform: string;
  username: string;
  profileUrl: string | null;
  type: string | null;
}

export interface ContactCategory {
  id: number;
  contactId: number;
  category: string;
}

export interface ContactInstantMessage {
  id: number;
  contactId: number;
  service: string;
  handle: string;
  type: string | null;
}

export interface ContactUrl {
  id: number;
  contactId: number;
  url: string;
  label: string | null;
  type: string | null;
}

export interface ContactRelatedPerson {
  id: number;
  contactId: number;
  name: string;
  relationship: string | null;
}

export interface ContactListItem {
  id: number;
  displayName: string;
  company: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  photoUrl: string | null;
}

export interface ContactDetail extends Contact {
  emails: ContactEmail[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
  socialProfiles: ContactSocialProfile[];
  categories: ContactCategory[];
  instantMessages: ContactInstantMessage[];
  urls: ContactUrl[];
  relatedPeople: ContactRelatedPerson[];
  photoUrl: string | null;
}

// Deduplication types
export type DeduplicationMode = 'email' | 'phone' | 'address' | 'social-links' | 'recommended';

export type ConfidenceLevel = 'very_high' | 'high' | 'medium';

export interface DuplicateGroup {
  id: string;
  matchingValue: string;
  matchingField: DeduplicationMode;
  contacts: ContactDetail[];
  confidence?: ConfidenceLevel;
  matchedCriteria?: string[];
}

export interface DuplicateGroupsResponse {
  groups: DuplicateGroup[];
  totalGroups: number;
  limit: number;
  offset: number;
}

export interface DuplicateSummary {
  email: number;
  phone: number;
  address: number;
  socialLinks: number;
  recommended: {
    veryHigh: number;
    high: number;
    medium: number;
    total: number;
  };
}

export interface MergeRequest {
  contactIds: number[];
  primaryContactId: number;
}

export interface MergeResponse {
  mergedContact: ContactDetail;
  deletedContactIds: number[];
}
