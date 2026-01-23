import { Type, Static } from '@sinclair/typebox';
import { ContactDetailSchema } from './contact.js';

export const DeduplicationModeSchema = Type.Union([
  Type.Literal('email'),
  Type.Literal('phone'),
  Type.Literal('address'),
  Type.Literal('social'),
  Type.Literal('recommended')
]);

export const ConfidenceLevelSchema = Type.Union([
  Type.Literal('very_high'),
  Type.Literal('high'),
  Type.Literal('medium')
]);

export type ConfidenceLevel = Static<typeof ConfidenceLevelSchema>;

export type DeduplicationMode = Static<typeof DeduplicationModeSchema>;

export const DuplicatesQuerySchema = Type.Object({
  mode: DeduplicationModeSchema,
  limit: Type.Optional(Type.Number({ default: 50 })),
  offset: Type.Optional(Type.Number({ default: 0 })),
  confidence: Type.Optional(Type.String())
});

export type DuplicatesQuery = Static<typeof DuplicatesQuerySchema>;

export const DuplicateGroupSchema = Type.Object({
  id: Type.String(),
  matchingValue: Type.String(),
  matchingField: DeduplicationModeSchema,
  contacts: Type.Array(ContactDetailSchema),
  confidence: Type.Optional(ConfidenceLevelSchema),
  matchedCriteria: Type.Optional(Type.Array(Type.String()))
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
  social: Type.Number(),
  recommended: Type.Object({
    veryHigh: Type.Number(),
    high: Type.Number(),
    medium: Type.Number(),
    total: Type.Number()
  })
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
