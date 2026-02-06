import { Type, Static } from '@sinclair/typebox';

// Visibility settings for each field
export const ProfileVisibilitySchema = Type.Object({
  avatar: Type.Boolean({ default: true }),
  firstName: Type.Boolean({ default: true }),
  lastName: Type.Boolean({ default: true }),
  tagline: Type.Boolean({ default: true }),
  company: Type.Boolean({ default: true }),
  title: Type.Boolean({ default: true }),
  emails: Type.Record(Type.String(), Type.Boolean()), // key = email address
  phones: Type.Record(Type.String(), Type.Boolean()), // key = phone number
  addresses: Type.Record(Type.String(), Type.Boolean()), // key = address id or fingerprint
  website: Type.Boolean({ default: true }),
  linkedin: Type.Boolean({ default: true }),
  instagram: Type.Boolean({ default: true }),
  whatsapp: Type.Boolean({ default: true }),
  otherSocialLinks: Type.Record(Type.String(), Type.Boolean()),
  birthday: Type.Boolean({ default: false }),
});

export type ProfileVisibility = Static<typeof ProfileVisibilitySchema>;

// Email with visibility
export const ProfileEmailSchema = Type.Object({
  email: Type.String(),
  type: Type.Union([Type.String(), Type.Null()]),
  isPrimary: Type.Boolean(),
});

export type ProfileEmail = Static<typeof ProfileEmailSchema>;

// Phone with visibility
export const ProfilePhoneSchema = Type.Object({
  phone: Type.String(),
  phoneDisplay: Type.String(),
  countryCode: Type.Union([Type.String(), Type.Null()]),
  type: Type.Union([Type.String(), Type.Null()]),
  isPrimary: Type.Boolean(),
});

export type ProfilePhone = Static<typeof ProfilePhoneSchema>;

// Address
export const ProfileAddressSchema = Type.Object({
  id: Type.Optional(Type.String()), // Used as key for visibility
  street: Type.Union([Type.String(), Type.Null()]),
  city: Type.Union([Type.String(), Type.Null()]),
  state: Type.Union([Type.String(), Type.Null()]),
  postalCode: Type.Union([Type.String(), Type.Null()]),
  country: Type.Union([Type.String(), Type.Null()]),
  type: Type.Union([Type.String(), Type.Null()]),
});

export type ProfileAddress = Static<typeof ProfileAddressSchema>;

// Social link
export const ProfileSocialLinkSchema = Type.Object({
  id: Type.Optional(Type.String()),
  platform: Type.String(),
  username: Type.String(),
  profileUrl: Type.Union([Type.String(), Type.Null()]),
});

export type ProfileSocialLink = Static<typeof ProfileSocialLinkSchema>;

// Linked contact info (when profile is linked to a contact)
export const LinkedContactSchema = Type.Object({
  id: Type.Number(),
  displayName: Type.String(),
  photoUrl: Type.Union([Type.String(), Type.Null()]),
});

export type LinkedContact = Static<typeof LinkedContactSchema>;

// Full user profile response
export const UserProfileSchema = Type.Object({
  // Linked contact (if profile is linked to a contact)
  linkedContactId: Type.Union([Type.Number(), Type.Null()]),
  linkedContact: Type.Union([LinkedContactSchema, Type.Null()]),

  // Public card settings
  isPublic: Type.Boolean({ default: false }),
  publicUrl: Type.Union([Type.String(), Type.Null()]),
  publicSlug: Type.Union([Type.String(), Type.Null()]),

  // Basic info (from linked contact or profile_* tables)
  avatarUrl: Type.Union([Type.String(), Type.Null()]),
  firstName: Type.Union([Type.String(), Type.Null()]),
  lastName: Type.Union([Type.String(), Type.Null()]),
  tagline: Type.Union([Type.String(), Type.Null()]), // 3-word self-description
  company: Type.Union([Type.String(), Type.Null()]),
  title: Type.Union([Type.String(), Type.Null()]),

  // Contact info
  emails: Type.Array(ProfileEmailSchema),
  phones: Type.Array(ProfilePhoneSchema),
  addresses: Type.Array(ProfileAddressSchema),

  // Social/web presence
  website: Type.Union([Type.String(), Type.Null()]),
  linkedin: Type.Union([Type.String(), Type.Null()]),
  instagram: Type.Union([Type.String(), Type.Null()]),
  whatsapp: Type.Union([Type.String(), Type.Null()]),
  otherSocialLinks: Type.Array(ProfileSocialLinkSchema),

  // Personal
  birthday: Type.Union([Type.String(), Type.Null()]),
  notes: Type.Union([Type.String(), Type.Null()]), // Private, not shown on public card

  // Visibility settings
  visibility: ProfileVisibilitySchema,
});

export type UserProfile = Static<typeof UserProfileSchema>;

// Update request
export const UpdateUserProfileSchema = Type.Partial(Type.Omit(UserProfileSchema, ['publicUrl', 'linkedContact']));

export type UpdateUserProfile = Static<typeof UpdateUserProfileSchema>;

// Contact search result for linking
export const ContactSearchResultSchema = Type.Object({
  id: Type.Number(),
  displayName: Type.String(),
  photoUrl: Type.Union([Type.String(), Type.Null()]),
  primaryEmail: Type.Union([Type.String(), Type.Null()]),
  primaryPhone: Type.Union([Type.String(), Type.Null()]),
});

export type ContactSearchResult = Static<typeof ContactSearchResultSchema>;

// Link profile to contact request
export const LinkProfileToContactSchema = Type.Object({
  contactId: Type.Number(),
});

export type LinkProfileToContact = Static<typeof LinkProfileToContactSchema>;
