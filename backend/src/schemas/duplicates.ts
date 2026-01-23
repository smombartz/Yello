import { Type, Static } from '@sinclair/typebox';
import { ContactDetailSchema } from './contact.js';

export const DeduplicationModeSchema = Type.Union([
  Type.Literal('email'),
  Type.Literal('phone'),
  Type.Literal('address'),
  Type.Literal('social')
]);

export type DeduplicationMode = Static<typeof DeduplicationModeSchema>;

export const DuplicatesQuerySchema = Type.Object({
  mode: DeduplicationModeSchema,
  limit: Type.Optional(Type.Number({ default: 50 })),
  offset: Type.Optional(Type.Number({ default: 0 }))
});

export type DuplicatesQuery = Static<typeof DuplicatesQuerySchema>;

export const DuplicateGroupSchema = Type.Object({
  id: Type.String(),
  matchingValue: Type.String(),
  matchingField: DeduplicationModeSchema,
  contacts: Type.Array(ContactDetailSchema)
});

export const DuplicateGroupsResponseSchema = Type.Object({
  groups: Type.Array(DuplicateGroupSchema),
  totalGroups: Type.Number(),
  limit: Type.Number(),
  offset: Type.Number()
});

export const DuplicateSummarySchema = Type.Object({
  email: Type.Number(),
  phone: Type.Number(),
  address: Type.Number(),
  social: Type.Number()
});

export const MergeRequestSchema = Type.Object({
  contactIds: Type.Array(Type.Number(), { minItems: 2 }),
  primaryContactId: Type.Number()
});

export type MergeRequest = Static<typeof MergeRequestSchema>;

export const MergeResponseSchema = Type.Object({
  mergedContact: ContactDetailSchema,
  deletedContactIds: Type.Array(Type.Number())
});
