import { Type, Static } from '@sinclair/typebox';

export const ProfileImageSourceEnum = Type.Union([
  Type.Literal('user_uploaded'),
  Type.Literal('google'),
  Type.Literal('google_contacts'),
  Type.Literal('gravatar'),
]);

export type ProfileImageSource = Static<typeof ProfileImageSourceEnum>;

export const ProfileImageSchema = Type.Object({
  id: Type.Number(),
  userId: Type.Number(),
  source: ProfileImageSourceEnum,
  originalUrl: Type.Union([Type.String(), Type.Null()]),
  localHash: Type.Union([Type.String(), Type.Null()]),
  isPrimary: Type.Boolean(),
  fetchedAt: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export type ProfileImage = Static<typeof ProfileImageSchema>;

export const ProfileImageListSchema = Type.Array(ProfileImageSchema);

export const ProfileImageWithUrlSchema = Type.Object({
  id: Type.Number(),
  userId: Type.Number(),
  source: ProfileImageSourceEnum,
  originalUrl: Type.Union([Type.String(), Type.Null()]),
  url: Type.Union([Type.String(), Type.Null()]),
  isPrimary: Type.Boolean(),
  fetchedAt: Type.String(),
});

export type ProfileImageWithUrl = Static<typeof ProfileImageWithUrlSchema>;
