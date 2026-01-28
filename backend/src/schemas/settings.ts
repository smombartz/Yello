import { Type, Static } from '@sinclair/typebox';

export const UserSettingsSchema = Type.Object({
  name: Type.Union([Type.String(), Type.Null()]),
  email: Type.Union([Type.String(), Type.Null()]),
  phone: Type.Union([Type.String(), Type.Null()]),
  avatarUrl: Type.Union([Type.String(), Type.Null()]),
  website: Type.Union([Type.String(), Type.Null()]),
  linkedinUrl: Type.Union([Type.String(), Type.Null()]),
});

export type UserSettings = Static<typeof UserSettingsSchema>;

export const UpdateUserSettingsSchema = Type.Partial(UserSettingsSchema);

export type UpdateUserSettings = Static<typeof UpdateUserSettingsSchema>;
