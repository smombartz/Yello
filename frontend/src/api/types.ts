export interface ContactListItem {
  id: number;
  displayName: string;
  company: string | null;
  title: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  primaryPhoneCountryCode: string | null;
  photoUrl: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
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

export interface LinkedInEnrichment {
  linkedinFirstName: string | null;
  linkedinLastName: string | null;
  headline: string | null;
  about: string | null;
  jobTitle: string | null;
  companyName: string | null;
  companyLinkedinUrl: string | null;
  industry: string | null;
  location: string | null;
  country: string | null;
  followersCount: number | null;
  education: string[] | null;
  skills: string[] | null;
  photoLinkedin: string | null;
  enrichedAt: string | null;
  positions: Array<{title: string; companyName?: string; locationName?: string; startDate?: string; endDate?: string}> | null;
  certifications: Array<{name: string; authority?: string}> | null;
  languages: Array<{name: string; proficiency?: string}> | null;
  honors: Array<{title: string; issuer?: string; description?: string}> | null;
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
  linkedinEnrichment: LinkedInEnrichment | null;
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

export type DuplicateAddressConfidence = 'exact' | 'high' | 'medium';

export interface AddressGroup {
  fingerprint: string;
  addresses: AddressWithIssues[];
  confidence?: DuplicateAddressConfidence;
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

// User Profile types
export interface ProfileVisibility {
  avatar: boolean;
  firstName: boolean;
  lastName: boolean;
  tagline: boolean;
  company: boolean;
  title: boolean;
  emails: Record<string, boolean>;
  phones: Record<string, boolean>;
  addresses: Record<string, boolean>;
  website: boolean;
  linkedin: boolean;
  instagram: boolean;
  whatsapp: boolean;
  otherSocialLinks: Record<string, boolean>;
  birthday: boolean;
}

export interface ProfileEmail {
  email: string;
  type: string | null;
  isPrimary: boolean;
}

export interface ProfilePhone {
  phone: string;
  phoneDisplay: string;
  countryCode: string | null;
  type: string | null;
  isPrimary: boolean;
}

export interface ProfileAddress {
  id?: string;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  type: string | null;
}

export interface ProfileSocialLink {
  id?: string;
  platform: string;
  username: string;
  profileUrl: string | null;
}

// Linked contact info (when profile is linked to a contact)
export interface LinkedContact {
  id: number;
  displayName: string;
  photoUrl: string | null;
}

export interface UserProfile {
  // Linked contact (if profile is linked to a contact)
  linkedContactId: number | null;
  linkedContact: LinkedContact | null;

  isPublic: boolean;
  publicUrl: string | null;
  publicSlug: string | null;
  avatarUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  tagline: string | null;
  company: string | null;
  title: string | null;
  emails: ProfileEmail[];
  phones: ProfilePhone[];
  addresses: ProfileAddress[];
  website: string | null;
  linkedin: string | null;
  instagram: string | null;
  whatsapp: string | null;
  otherSocialLinks: ProfileSocialLink[];
  birthday: string | null;
  notes: string | null;
  visibility: ProfileVisibility;
}

// Contact search result for linking
export interface ContactSearchResult {
  id: number;
  displayName: string;
  photoUrl: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
}

export interface UpdateUserProfileRequest {
  isPublic?: boolean;
  publicSlug?: string | null;
  avatarUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  tagline?: string | null;
  company?: string | null;
  title?: string | null;
  emails?: ProfileEmail[];
  phones?: ProfilePhone[];
  addresses?: ProfileAddress[];
  website?: string | null;
  linkedin?: string | null;
  instagram?: string | null;
  whatsapp?: string | null;
  otherSocialLinks?: ProfileSocialLink[];
  birthday?: string | null;
  notes?: string | null;
  visibility?: ProfileVisibility;
}

// LinkedIn Enrichment types
export interface LinkedInEnrichmentSummary {
  configured: boolean;
  totalWithLinkedIn: number;
  alreadyEnriched: number;
  pendingEnrichment: number;
  totalContacts: number;
  enriched: number;
  readyToEnrich: number;
  noLinkedIn: number;
  failed: number;
}

export interface EnrichmentCategoryContact {
  id: number;
  displayName: string;
  company: string | null;
  linkedinUrl: string | null;
  errorReason: string | null;
  enrichedAt: string | null;
}

export interface EnrichmentCategoryResponse {
  category: string;
  total: number;
  contacts: EnrichmentCategoryContact[];
}

export interface LinkedInEnrichmentProgress {
  current: number;
  total: number;
  succeeded: number;
  failed: number;
  currentContact?: string;
}

export interface EnrichedContactInfo {
  contactId: number;
  contactName: string;
  headline: string | null;
  jobTitle: string | null;
  companyName: string | null;
}

export interface LinkedInEnrichmentResult {
  succeeded: number;
  failed: number;
  errors: Array<{ contactId: number; contactName: string; reason: string }>;
  enrichedContacts: EnrichedContactInfo[];
}

// Email History
export interface EmailHistoryItem {
  id: number;
  gmailMessageId: string;
  threadId: string;
  subject: string | null;
  date: string;
  direction: 'inbound' | 'outbound';
  snippet: string | null;
}

export interface EmailHistoryStats {
  total: number;
  avgPerMonth: number;
  last30Days: number;
}

export interface EmailHistoryResponse {
  emails: EmailHistoryItem[];
  stats: EmailHistoryStats;
  hasMore: boolean;
  nextCursor: string | null;
  lastSyncedAt: string | null;
}

export interface EmailSyncResult {
  synced: number;
  total: number;
}

export interface EmailRefreshAllResult {
  contactsRefreshed: number;
  emailsSynced: number;
  errors: number;
}
