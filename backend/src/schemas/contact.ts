import { Type, Static } from '@sinclair/typebox';

export const ContactListQuerySchema = Type.Object({
  page: Type.Optional(Type.Number({ default: 1 })),
  limit: Type.Optional(Type.Number({ default: 50 })),
  search: Type.Optional(Type.String()),
  category: Type.Optional(Type.String())
});

export type ContactListQuery = Static<typeof ContactListQuerySchema>;

export const ContactIdParamsSchema = Type.Object({
  id: Type.Number()
});

export type ContactIdParams = Static<typeof ContactIdParamsSchema>;

export const ContactEmailSchema = Type.Object({
  id: Type.Number(),
  contactId: Type.Number(),
  email: Type.String(),
  type: Type.Union([Type.String(), Type.Null()]),
  isPrimary: Type.Boolean()
});

export const ContactPhoneSchema = Type.Object({
  id: Type.Number(),
  contactId: Type.Number(),
  phone: Type.String(),
  phoneDisplay: Type.String(),
  countryCode: Type.Union([Type.String(), Type.Null()]),
  type: Type.Union([Type.String(), Type.Null()]),
  isPrimary: Type.Boolean()
});

export const ContactAddressSchema = Type.Object({
  id: Type.Number(),
  contactId: Type.Number(),
  street: Type.Union([Type.String(), Type.Null()]),
  city: Type.Union([Type.String(), Type.Null()]),
  state: Type.Union([Type.String(), Type.Null()]),
  postalCode: Type.Union([Type.String(), Type.Null()]),
  country: Type.Union([Type.String(), Type.Null()]),
  type: Type.Union([Type.String(), Type.Null()])
});

export const ContactSocialProfileSchema = Type.Object({
  id: Type.Number(),
  contactId: Type.Number(),
  platform: Type.String(),
  username: Type.String(),
  profileUrl: Type.Union([Type.String(), Type.Null()]),
  type: Type.Union([Type.String(), Type.Null()])
});

export const ContactCategorySchema = Type.Object({
  id: Type.Number(),
  contactId: Type.Number(),
  category: Type.String()
});

export const ContactInstantMessageSchema = Type.Object({
  id: Type.Number(),
  contactId: Type.Number(),
  service: Type.String(),
  handle: Type.String(),
  type: Type.Union([Type.String(), Type.Null()])
});

export const ContactUrlSchema = Type.Object({
  id: Type.Number(),
  contactId: Type.Number(),
  url: Type.String(),
  label: Type.Union([Type.String(), Type.Null()]),
  type: Type.Union([Type.String(), Type.Null()])
});

export const ContactRelatedPersonSchema = Type.Object({
  id: Type.Number(),
  contactId: Type.Number(),
  name: Type.String(),
  relationship: Type.Union([Type.String(), Type.Null()])
});

export const ContactListItemSchema = Type.Object({
  id: Type.Number(),
  displayName: Type.String(),
  company: Type.Union([Type.String(), Type.Null()]),
  primaryEmail: Type.Union([Type.String(), Type.Null()]),
  primaryPhone: Type.Union([Type.String(), Type.Null()]),
  primaryPhoneCountryCode: Type.Union([Type.String(), Type.Null()]),
  photoUrl: Type.Union([Type.String(), Type.Null()])
});

export const ContactListResponseSchema = Type.Object({
  contacts: Type.Array(ContactListItemSchema),
  total: Type.Number(),
  page: Type.Number(),
  totalPages: Type.Number()
});

export const ContactDetailSchema = Type.Object({
  id: Type.Number(),
  firstName: Type.Union([Type.String(), Type.Null()]),
  lastName: Type.Union([Type.String(), Type.Null()]),
  displayName: Type.String(),
  company: Type.Union([Type.String(), Type.Null()]),
  title: Type.Union([Type.String(), Type.Null()]),
  notes: Type.Union([Type.String(), Type.Null()]),
  birthday: Type.Union([Type.String(), Type.Null()]),
  photoHash: Type.Union([Type.String(), Type.Null()]),
  rawVcard: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  emails: Type.Array(ContactEmailSchema),
  phones: Type.Array(ContactPhoneSchema),
  addresses: Type.Array(ContactAddressSchema),
  socialProfiles: Type.Array(ContactSocialProfileSchema),
  categories: Type.Array(ContactCategorySchema),
  instantMessages: Type.Array(ContactInstantMessageSchema),
  urls: Type.Array(ContactUrlSchema),
  relatedPeople: Type.Array(ContactRelatedPersonSchema),
  photoUrl: Type.Union([Type.String(), Type.Null()])
});

export const ContactCountResponseSchema = Type.Object({
  total: Type.Number()
});

export const ContactNotFoundSchema = Type.Object({
  error: Type.String()
});

// Contact IDs endpoint (for bulk selection)
export const ContactIdsQuerySchema = Type.Object({
  search: Type.Optional(Type.String())
});

export type ContactIdsQuery = Static<typeof ContactIdsQuerySchema>;

export const ContactIdsResponseSchema = Type.Object({
  contactIds: Type.Array(Type.Number())
});

// Groups endpoint
export const GroupSchema = Type.Object({
  category: Type.String(),
  contactCount: Type.Number()
});

export const GroupsResponseSchema = Type.Object({
  groups: Type.Array(GroupSchema)
});
