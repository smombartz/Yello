export interface ContactListItem {
  id: number;
  displayName: string;
  company: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  photoUrl: string | null;
}

export interface ContactEmail {
  email: string;
  type: string | null;
  isPrimary: boolean;
}

export interface ContactPhone {
  phone: string;
  phoneDisplay: string;
  type: string | null;
  isPrimary: boolean;
}

export interface ContactAddress {
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

export interface ContactDetail {
  id: number;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  company: string | null;
  title: string | null;
  notes: string | null;
  birthday: string | null;
  emails: ContactEmail[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
  socialProfiles: ContactSocialProfile[];
  categories: ContactCategory[];
  instantMessages: ContactInstantMessage[];
  urls: ContactUrl[];
  relatedPeople: ContactRelatedPerson[];
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactListResponse {
  contacts: ContactListItem[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ImportResult {
  imported: number;
  failed: number;
  photosProcessed: number;
  errors: Array<{ line: number; reason: string }>;
}

// Deduplication types
export type DeduplicationMode = 'email' | 'phone' | 'address' | 'social' | 'recommended';

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
  social: number;
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

// Cleanup types
export type CleanupMode = 'empty' | 'problematic';

export type EmptyContactType = 'truly_empty' | 'name_only';

export type ProblematicContactType = 'many_domains' | 'same_domain';

export interface CleanupContact extends ContactDetail {
  issueType: EmptyContactType | ProblematicContactType;
  issueDetails?: string;
}

export interface CleanupResponse {
  contacts: CleanupContact[];
  total: number;
  limit: number;
  offset: number;
}

export interface CleanupSummary {
  empty: {
    trulyEmpty: number;
    nameOnly: number;
    total: number;
  };
  problematic: {
    manyDomains: number;
    sameDomain: number;
    total: number;
  };
}

export interface DeleteContactsResponse {
  deletedCount: number;
}

export interface CleanupIdsResponse {
  contactIds: number[];
}

// Archive types
export interface ArchivedContact extends ContactDetail {
  archivedAt: string;
}

export interface ArchivedListResponse {
  contacts: ArchivedContact[];
  total: number;
  limit: number;
  offset: number;
}

export interface ArchivedCountResponse {
  count: number;
}

export interface ArchiveResponse {
  archivedCount: number;
}

export interface UnarchiveResponse {
  unarchivedCount: number;
}

export interface DeleteArchivedResponse {
  deletedCount: number;
}
