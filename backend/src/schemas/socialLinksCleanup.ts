import { Type, Static } from '@sinclair/typebox';
import { ContactDetailSchema } from './contact.js';

// ============================================================
// Request Schemas
// ============================================================

export const SocialLinksCrossContactQuerySchema = Type.Object({
  limit: Type.Optional(Type.Number({ default: 50 })),
  offset: Type.Optional(Type.Number({ default: 0 })),
  platform: Type.Optional(Type.String())
});

export type SocialLinksCrossContactQuery = Static<typeof SocialLinksCrossContactQuerySchema>;

export const SocialLinksWithinContactQuerySchema = Type.Object({
  limit: Type.Optional(Type.Number({ default: 50 })),
  offset: Type.Optional(Type.Number({ default: 0 }))
});

export type SocialLinksWithinContactQuery = Static<typeof SocialLinksWithinContactQuerySchema>;

// ============================================================
// Response Schemas
// ============================================================

export const SocialLinksSummaryResponseSchema = Type.Object({
  crossContact: Type.Number(),
  withinContact: Type.Number()
});

export type SocialLinksSummaryResponse = Static<typeof SocialLinksSummaryResponseSchema>;

export const DuplicateGroupSchema = Type.Object({
  id: Type.String(),
  matchingValue: Type.String(),
  matchingField: Type.String(),
  contacts: Type.Array(ContactDetailSchema),
  confidence: Type.Optional(Type.String()),
  matchedCriteria: Type.Optional(Type.Array(Type.String()))
});

export const SocialLinksCrossContactResponseSchema = Type.Object({
  groups: Type.Array(DuplicateGroupSchema),
  totalGroups: Type.Number(),
  limit: Type.Number(),
  offset: Type.Number()
});

export type SocialLinksCrossContactResponse = Static<typeof SocialLinksCrossContactResponseSchema>;

export const SocialUrlSchema = Type.Object({
  id: Type.Number(),
  url: Type.String(),
  platform: Type.String(),
  username: Type.String()
});

export const WithinContactIssueSchema = Type.Object({
  contactId: Type.Number(),
  displayName: Type.String(),
  photoUrl: Type.Union([Type.String(), Type.Null()]),
  socialUrls: Type.Array(SocialUrlSchema)
});

export const SocialLinksWithinContactResponseSchema = Type.Object({
  contacts: Type.Array(WithinContactIssueSchema),
  total: Type.Number(),
  limit: Type.Number(),
  offset: Type.Number()
});

export type SocialLinksWithinContactResponse = Static<typeof SocialLinksWithinContactResponseSchema>;

export const SocialLinksFixAllResponseSchema = Type.Object({
  migrated: Type.Number(),
  deleted: Type.Number()
});

export type SocialLinksFixAllResponse = Static<typeof SocialLinksFixAllResponseSchema>;

export const SocialLinksErrorSchema = Type.Object({
  error: Type.String()
});

// ============================================================
// All Groups (for Merge All feature)
// ============================================================

export const SocialLinksCrossContactAllGroupsQuerySchema = Type.Object({
  platform: Type.Optional(Type.String())
});

export type SocialLinksCrossContactAllGroupsQuery = Static<typeof SocialLinksCrossContactAllGroupsQuerySchema>;

export const SocialLinksCrossContactGroupLightSchema = Type.Object({
  id: Type.String(),
  contactIds: Type.Array(Type.Number()),
  primaryContactId: Type.Number()
});

export const SocialLinksCrossContactAllGroupsResponseSchema = Type.Object({
  groups: Type.Array(SocialLinksCrossContactGroupLightSchema),
  totalGroups: Type.Number()
});

export type SocialLinksCrossContactAllGroupsResponse = Static<typeof SocialLinksCrossContactAllGroupsResponseSchema>;
