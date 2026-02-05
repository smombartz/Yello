export interface ContactListItem {
  id: number;
  displayName: string;
  company: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  primaryPhoneCountryCode: string | null;
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
  countryCode: string | null;
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

export interface ContactIdsResponse {
  contactIds: number[];
}

export interface ImportResult {
  imported: number;
  failed: number;
  photosProcessed: number;
  errors: Array<{ line: number; reason: string }>;
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

export interface MergeConflictValue {
  contactId: number;
  contactName: string;
  value: string;
}

export interface MergeConflict {
  field: string;
  values: MergeConflictValue[];
}

export interface MergePreviewResponse {
  conflicts: MergeConflict[];
  contacts: ContactDetail[];
}

export interface MergeRequest {
  contactIds: number[];
  primaryContactId: number;
  resolutions?: Record<string, string | null>;
}

export interface MergeResponse {
  mergedContact: ContactDetail;
  deletedContactIds: number[];
}

// Cleanup types
export type CleanupMode = 'empty' | 'problematic' | 'social-links' | 'invalid-links' | 'addresses';

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

// Groups types
export interface Group {
  category: string;
  contactCount: number;
}

export interface GroupsResponse {
  groups: Group[];
}

// Update contact types
export interface UpdateContactEmail {
  email: string;
  type: string | null;
  isPrimary: boolean;
}

export interface UpdateContactPhone {
  phone: string;
  phoneDisplay: string;
  countryCode: string | null;
  type: string | null;
  isPrimary: boolean;
}

export interface UpdateContactAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  type: string | null;
}

export interface UpdateContactSocialProfile {
  platform: string;
  username: string;
  profileUrl: string | null;
  type: string | null;
}

export interface UpdateContactCategory {
  category: string;
}

export interface UpdateContactInstantMessage {
  service: string;
  handle: string;
  type: string | null;
}

export interface UpdateContactUrl {
  url: string;
  label: string | null;
  type: string | null;
}

export interface UpdateContactRelatedPerson {
  name: string;
  relationship: string | null;
}

export interface UpdateContactRequest {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string;
  company?: string | null;
  title?: string | null;
  notes?: string | null;
  birthday?: string | null;
  emails?: UpdateContactEmail[];
  phones?: UpdateContactPhone[];
  addresses?: UpdateContactAddress[];
  socialProfiles?: UpdateContactSocialProfile[];
  categories?: UpdateContactCategory[];
  instantMessages?: UpdateContactInstantMessage[];
  urls?: UpdateContactUrl[];
  relatedPeople?: UpdateContactRelatedPerson[];
}

export interface CreateContactRequest {
  firstName?: string | null;
  lastName?: string | null;
  displayName: string;
  company?: string | null;
  title?: string | null;
  notes?: string | null;
  birthday?: string | null;
  emails?: UpdateContactEmail[];
  phones?: UpdateContactPhone[];
  addresses?: UpdateContactAddress[];
  socialProfiles?: UpdateContactSocialProfile[];
  categories?: UpdateContactCategory[];
  instantMessages?: UpdateContactInstantMessage[];
  urls?: UpdateContactUrl[];
  relatedPeople?: UpdateContactRelatedPerson[];
}

// Settings types
export interface UserSettings {
  name: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  website: string | null;
  linkedinUrl: string | null;
}

export interface UpdateUserSettingsRequest {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
}

// Social Links Cleanup types
export interface SocialLinksSummary {
  crossContact: number;
  withinContact: number;
}

export interface SocialUrlIssue {
  id: number;
  url: string;
  platform: string;
  username: string;
}

export interface WithinContactIssue {
  contactId: number;
  displayName: string;
  photoUrl: string | null;
  socialUrls: SocialUrlIssue[];
}

export interface SocialLinksWithinContactResponse {
  contacts: WithinContactIssue[];
  total: number;
  limit: number;
  offset: number;
}

export interface SocialLinksFixAllResponse {
  migrated: number;
  deleted: number;
}

// Invalid Links Cleanup types
export interface InvalidLinkMatch {
  contactId: number;
  contactName: string;
  source: 'social_profiles' | 'urls';
  platform: string | null;
  value: string;
  recordId: number;
}

export interface InvalidLinksSearchResponse {
  matches: InvalidLinkMatch[];
  totalCount: number;
}

export interface InvalidLinksRemoveResponse {
  deletedCount: number;
  deletedFromSocialProfiles: number;
  deletedFromUrls: number;
}

// Address Cleanup types (legacy combined view)
export interface AddressCleanupSummary {
  noStreetCount: number;
  duplicateCount: number;
  totalContacts: number;
}

export interface AddressWithIssues {
  id: number;
  contactId: number;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  type: string | null;
  isRecommended: boolean;
  issues: ('no_street' | 'duplicate')[];
}

export interface AddressGroup {
  fingerprint: string;
  addresses: AddressWithIssues[];
}

export interface AddressCleanupContact {
  id: number;
  displayName: string;
  company: string | null;
  photoHash: string | null;
  photoUrl: string | null;
  addressGroups: AddressGroup[];
}

export interface AddressCleanupResponse {
  contacts: AddressCleanupContact[];
  total: number;
}

export interface AddressFix {
  contactId: number;
  keepAddressIds: number[];
  removeAddressIds: number[];
}

export interface AddressFixResponse {
  fixed: number;
  removed: number;
}

export interface AddressCleanupBulkContact {
  id: number;
  keepAddressIds: number[];
  removeAddressIds: number[];
}

export interface AddressCleanupBulkResponse {
  contacts: AddressCleanupBulkContact[];
  total: number;
}

// Address Normalize types (junk address removal)
export type JunkIssueType = 'no_street' | 'empty' | 'placeholder' | 'missing_street';

export interface JunkAddress {
  id: number;
  contactId: number;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  type: string | null;
  issue: JunkIssueType;
}

export interface NormalizeContact {
  id: number;
  displayName: string;
  company: string | null;
  photoUrl: string | null;
  junkAddresses: JunkAddress[];
}

export interface NormalizeSummary {
  junkCount: number;
  totalContacts: number;
}

export interface NormalizeResponse {
  contacts: NormalizeContact[];
  total: number;
}

export interface NormalizeFixResponse {
  removed: number;
}

export interface NormalizeAllIdsResponse {
  addressIds: number[];
  total: number;
}

// Address Duplicates types (within-contact duplicate merging)
export interface DuplicatesSummary {
  duplicateCount: number;
  totalContacts: number;
}

export interface DuplicatesContact {
  id: number;
  displayName: string;
  company: string | null;
  photoHash: string | null;
  photoUrl: string | null;
  addressGroups: AddressGroup[];
}

export interface DuplicatesResponse {
  contacts: DuplicatesContact[];
  total: number;
}

// Address Geocoding types
export type GeocodingStatus = 'pending' | 'failed' | 'geocoded';

export type GeocodingFilter = 'all' | 'pending' | 'failed' | 'geocoded';

export interface GeocodingSummary {
  pending: number;
  failed: number;
  geocoded: number;
  total: number;
}

export interface GeocodingAddress {
  id: number;
  contactId: number;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  type: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodedAt: string | null;
  status: GeocodingStatus;
}

export interface GeocodingContact {
  id: number;
  displayName: string;
  company: string | null;
  photoUrl: string | null;
  addresses: GeocodingAddress[];
}

export interface GeocodingResponse {
  contacts: GeocodingContact[];
  total: number;
}

export interface GeocodingBatchResult {
  processed: number;
  successful: number;
  failed: number;
}

export interface GeocodingUpdateResponse {
  address: GeocodingAddress;
}
