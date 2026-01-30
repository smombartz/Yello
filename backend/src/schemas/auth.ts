import { Type, Static } from '@sinclair/typebox';

export const UserSchema = Type.Object({
  id: Type.Number(),
  googleId: Type.String(),
  email: Type.String(),
  name: Type.Union([Type.String(), Type.Null()]),
  avatarUrl: Type.Union([Type.String(), Type.Null()]),
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
