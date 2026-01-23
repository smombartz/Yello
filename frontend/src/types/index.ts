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
  display: string;
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
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactsResponse {
  contacts: ContactListItem[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ImportResponse {
  imported: number;
  failed: number;
  photosProcessed: number;
  errors: Array<{ line: number; reason: string }>;
}
