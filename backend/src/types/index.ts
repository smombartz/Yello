export interface Contact {
  id: number;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  company: string | null;
  title: string | null;
  notes: string | null;
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
  photoUrl: string | null;
}
