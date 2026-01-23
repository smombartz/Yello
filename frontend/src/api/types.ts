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

export interface ContactDetail {
  id: number;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  company: string | null;
  title: string | null;
  notes: string | null;
  emails: ContactEmail[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
  socialProfiles: ContactSocialProfile[];
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
export type DeduplicationMode = 'email' | 'phone' | 'address' | 'social';

export interface DuplicateGroup {
  id: string;
  matchingValue: string;
  matchingField: DeduplicationMode;
  contacts: ContactDetail[];
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
}

export interface MergeRequest {
  contactIds: number[];
  primaryContactId: number;
}

export interface MergeResponse {
  mergedContact: ContactDetail;
  deletedContactIds: number[];
}
