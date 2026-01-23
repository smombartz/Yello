import { Type, Static } from '@sinclair/typebox';
import { ContactDetailSchema } from './contact.js';

// ============================================================
// Type Schemas
// ============================================================

export const CleanupModeSchema = Type.Union([
  Type.Literal('empty'),
  Type.Literal('problematic')
]);

export type CleanupMode = Static<typeof CleanupModeSchema>;

export const EmptyContactTypeSchema = Type.Union([
  Type.Literal('truly_empty'),
  Type.Literal('name_only')
]);

export type EmptyContactType = Static<typeof EmptyContactTypeSchema>;

export const ProblematicContactTypeSchema = Type.Union([
  Type.Literal('many_domains'),
  Type.Literal('same_domain')
]);

export type ProblematicContactType = Static<typeof ProblematicContactTypeSchema>;

// ============================================================
// Request Schemas
// ============================================================

export const CleanupQuerySchema = Type.Object({
  mode: CleanupModeSchema,
  limit: Type.Optional(Type.Number({ default: 50 })),
  offset: Type.Optional(Type.Number({ default: 0 })),
  types: Type.Optional(Type.String()), // Comma-separated list of types
  threshold: Type.Optional(Type.Number({ default: 3 })) // For problematic mode: domain threshold
});

export type CleanupQuery = Static<typeof CleanupQuerySchema>;

export const CleanupSummaryQuerySchema = Type.Object({
  threshold: Type.Optional(Type.Number({ default: 3 }))
});

export type CleanupSummaryQuery = Static<typeof CleanupSummaryQuerySchema>;

export const DeleteContactsBodySchema = Type.Object({
  contactIds: Type.Array(Type.Number(), { minItems: 1 })
});

export type DeleteContactsBody = Static<typeof DeleteContactsBodySchema>;

// ============================================================
// Response Schemas
// ============================================================

export const CleanupContactSchema = Type.Intersect([
  ContactDetailSchema,
  Type.Object({
    issueType: Type.Union([EmptyContactTypeSchema, ProblematicContactTypeSchema]),
    issueDetails: Type.Optional(Type.String())
  })
]);

export const CleanupResponseSchema = Type.Object({
  contacts: Type.Array(CleanupContactSchema),
  total: Type.Number(),
  limit: Type.Number(),
  offset: Type.Number()
});

export const CleanupSummaryResponseSchema = Type.Object({
  empty: Type.Object({
    trulyEmpty: Type.Number(),
    nameOnly: Type.Number(),
    total: Type.Number()
  }),
  problematic: Type.Object({
    manyDomains: Type.Number(),
    sameDomain: Type.Number(),
    total: Type.Number()
  })
});

export const DeleteContactsResponseSchema = Type.Object({
  deletedCount: Type.Number()
});

export const CleanupErrorSchema = Type.Object({
  error: Type.String()
});
