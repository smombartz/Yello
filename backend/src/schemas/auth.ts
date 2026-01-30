import { Type, Static } from '@sinclair/typebox';

export const ProfileImageSchema = Type.Object({
  id: Type.Number(),
  source: Type.Union([
    Type.Literal('user_uploaded'),
    Type.Literal('google'),
    Type.Literal('google_contacts'),
    Type.Literal('gravatar'),
  ]),
  url: Type.Union([Type.String(), Type.Null()]),
  isPrimary: Type.Boolean(),
});

export const UserSchema = Type.Object({
  id: Type.Number(),
  googleId: Type.String(),
  email: Type.String(),
  name: Type.Union([Type.String(), Type.Null()]),
  avatarUrl: Type.Union([Type.String(), Type.Null()]),
  profileImages: Type.Array(ProfileImageSchema),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export type User = Static<typeof UserSchema>;

export const AuthMeResponseSchema = Type.Object({
  user: Type.Union([UserSchema, Type.Null()]),
  isAuthenticated: Type.Boolean(),
});

export type AuthMeResponse = Static<typeof AuthMeResponseSchema>;

export const AuthErrorSchema = Type.Object({
  error: Type.String(),
});

export type AuthError = Static<typeof AuthErrorSchema>;
