import { Type, Static } from '@sinclair/typebox';

// ============================================================
// Request Schemas
// ============================================================

export const InvalidLinksSearchRequestSchema = Type.Object({
  patterns: Type.Array(Type.String(), { minItems: 1 })
});

export type InvalidLinksSearchRequest = Static<typeof InvalidLinksSearchRequestSchema>;

export const InvalidLinksRemoveRequestSchema = Type.Object({
  patterns: Type.Array(Type.String(), { minItems: 1 })
});

export type InvalidLinksRemoveRequest = Static<typeof InvalidLinksRemoveRequestSchema>;

// ============================================================
// Response Schemas
// ============================================================

export const InvalidLinkMatchSchema = Type.Object({
  contactId: Type.Number(),
  contactName: Type.String(),
  source: Type.Union([Type.Literal('social_profiles'), Type.Literal('urls')]),
  platform: Type.Union([Type.String(), Type.Null()]),
  value: Type.String(),
  recordId: Type.Number()
});

export const InvalidLinksSearchResponseSchema = Type.Object({
  matches: Type.Array(InvalidLinkMatchSchema),
  totalCount: Type.Number()
});

export type InvalidLinksSearchResponse = Static<typeof InvalidLinksSearchResponseSchema>;

export const InvalidLinksRemoveResponseSchema = Type.Object({
  deletedCount: Type.Number(),
  deletedFromSocialProfiles: Type.Number(),
  deletedFromUrls: Type.Number()
});

export type InvalidLinksRemoveResponse = Static<typeof InvalidLinksRemoveResponseSchema>;

export const InvalidLinksErrorSchema = Type.Object({
  error: Type.String()
});
