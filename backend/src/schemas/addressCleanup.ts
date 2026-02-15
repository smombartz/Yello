import { Type, Static } from '@sinclair/typebox';

// ============================================================
// Request Schemas
// ============================================================

export const AddressCleanupQuerySchema = Type.Object({
  limit: Type.Optional(Type.Number({ default: 50 })),
  offset: Type.Optional(Type.Number({ default: 0 }))
});

export type AddressCleanupQuery = Static<typeof AddressCleanupQuerySchema>;

export const AddressUpdateFieldsSchema = Type.Object({
  addressId: Type.Number(),
  street: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  city: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  state: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  postalCode: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  country: Type.Optional(Type.Union([Type.String(), Type.Null()]))
});

export const AddressFixSchema = Type.Object({
  contactId: Type.Number(),
  keepAddressIds: Type.Array(Type.Number()),
  removeAddressIds: Type.Array(Type.Number()),
  updatedAddress: Type.Optional(AddressUpdateFieldsSchema)
});

export const AddressFixRequestSchema = Type.Object({
  fixes: Type.Array(AddressFixSchema)
});

export type AddressFixRequest = Static<typeof AddressFixRequestSchema>;

export const AddressUpdateRequestSchema = Type.Object({
  addressId: Type.Number(),
  street: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  city: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  state: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  postalCode: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  country: Type.Optional(Type.Union([Type.String(), Type.Null()]))
});

export type AddressUpdateRequest = Static<typeof AddressUpdateRequestSchema>;

// ============================================================
// Response Schemas
// ============================================================

export const AddressCleanupSummaryResponseSchema = Type.Object({
  noStreetCount: Type.Number(),
  duplicateCount: Type.Number(),
  totalContacts: Type.Number()
});

export type AddressCleanupSummaryResponse = Static<typeof AddressCleanupSummaryResponseSchema>;

export const AddressRecordSchema = Type.Object({
  id: Type.Number(),
  contactId: Type.Number(),
  street: Type.Union([Type.String(), Type.Null()]),
  city: Type.Union([Type.String(), Type.Null()]),
  state: Type.Union([Type.String(), Type.Null()]),
  postalCode: Type.Union([Type.String(), Type.Null()]),
  country: Type.Union([Type.String(), Type.Null()]),
  type: Type.Union([Type.String(), Type.Null()]),
  isRecommended: Type.Boolean(),
  issues: Type.Array(Type.Union([Type.Literal('no_street'), Type.Literal('duplicate')]))
});

export const DuplicateConfidenceSchema = Type.Union([
  Type.Literal('exact'),
  Type.Literal('high'),
  Type.Literal('medium')
]);

export type DuplicateConfidenceType = Static<typeof DuplicateConfidenceSchema>;

export const AddressGroupSchema = Type.Object({
  fingerprint: Type.String(),
  addresses: Type.Array(AddressRecordSchema),
  confidence: Type.Optional(DuplicateConfidenceSchema)
});

export const AddressCleanupContactSchema = Type.Object({
  id: Type.Number(),
  displayName: Type.String(),
  company: Type.Union([Type.String(), Type.Null()]),
  photoHash: Type.Union([Type.String(), Type.Null()]),
  photoUrl: Type.Union([Type.String(), Type.Null()]),
  addressGroups: Type.Array(AddressGroupSchema)
});

export const AddressCleanupResponseSchema = Type.Object({
  contacts: Type.Array(AddressCleanupContactSchema),
  total: Type.Number()
});

export type AddressCleanupResponse = Static<typeof AddressCleanupResponseSchema>;

export const AddressFixResponseSchema = Type.Object({
  fixed: Type.Number(),
  removed: Type.Number()
});

export type AddressFixResponse = Static<typeof AddressFixResponseSchema>;

export const AddressUpdateResponseSchema = Type.Object({
  address: Type.Object({
    id: Type.Number(),
    contactId: Type.Number(),
    street: Type.Union([Type.String(), Type.Null()]),
    city: Type.Union([Type.String(), Type.Null()]),
    state: Type.Union([Type.String(), Type.Null()]),
    postalCode: Type.Union([Type.String(), Type.Null()]),
    country: Type.Union([Type.String(), Type.Null()]),
    type: Type.Union([Type.String(), Type.Null()])
  })
});

export type AddressUpdateResponse = Static<typeof AddressUpdateResponseSchema>;

export const AddressCleanupErrorSchema = Type.Object({
  error: Type.String()
});

// ============================================================
// Bulk Operations
// ============================================================

export const AddressCleanupBulkContactSchema = Type.Object({
  id: Type.Number(),
  keepAddressIds: Type.Array(Type.Number()),
  removeAddressIds: Type.Array(Type.Number())
});

export const AddressCleanupBulkResponseSchema = Type.Object({
  contacts: Type.Array(AddressCleanupBulkContactSchema),
  total: Type.Number()
});

export type AddressCleanupBulkResponse = Static<typeof AddressCleanupBulkResponseSchema>;

// ============================================================
// Normalize Schemas (Junk Address Removal)
// ============================================================

export const NormalizeSummaryResponseSchema = Type.Object({
  junkCount: Type.Number(),
  totalContacts: Type.Number()
});

export type NormalizeSummaryResponse = Static<typeof NormalizeSummaryResponseSchema>;

export const JunkAddressSchema = Type.Object({
  id: Type.Number(),
  contactId: Type.Number(),
  street: Type.Union([Type.String(), Type.Null()]),
  city: Type.Union([Type.String(), Type.Null()]),
  state: Type.Union([Type.String(), Type.Null()]),
  postalCode: Type.Union([Type.String(), Type.Null()]),
  country: Type.Union([Type.String(), Type.Null()]),
  type: Type.Union([Type.String(), Type.Null()]),
  issue: Type.Union([Type.Literal('no_street'), Type.Literal('empty'), Type.Literal('placeholder'), Type.Literal('missing_street')])
});

export const NormalizeContactSchema = Type.Object({
  id: Type.Number(),
  displayName: Type.String(),
  company: Type.Union([Type.String(), Type.Null()]),
  photoUrl: Type.Union([Type.String(), Type.Null()]),
  junkAddresses: Type.Array(JunkAddressSchema)
});

export const NormalizeResponseSchema = Type.Object({
  contacts: Type.Array(NormalizeContactSchema),
  total: Type.Number()
});

export type NormalizeResponse = Static<typeof NormalizeResponseSchema>;

export const NormalizeFixRequestSchema = Type.Object({
  addressIds: Type.Array(Type.Number())
});

export type NormalizeFixRequest = Static<typeof NormalizeFixRequestSchema>;

export const NormalizeFixResponseSchema = Type.Object({
  removed: Type.Number()
});

export type NormalizeFixResponse = Static<typeof NormalizeFixResponseSchema>;

export const NormalizeAllIdsResponseSchema = Type.Object({
  addressIds: Type.Array(Type.Number()),
  total: Type.Number()
});

export type NormalizeAllIdsResponse = Static<typeof NormalizeAllIdsResponseSchema>;

// ============================================================
// Duplicates Schemas (Within-Contact Duplicate Merging)
// ============================================================

export const DuplicatesConfidenceFilterSchema = Type.Union([
  Type.Literal('all'),
  Type.Literal('exact'),
  Type.Literal('high'),
  Type.Literal('medium')
]);

export type DuplicatesConfidenceFilterType = Static<typeof DuplicatesConfidenceFilterSchema>;

export const DuplicatesQuerySchema = Type.Object({
  limit: Type.Optional(Type.Number({ default: 50 })),
  offset: Type.Optional(Type.Number({ default: 0 })),
  confidence: Type.Optional(DuplicatesConfidenceFilterSchema)
});

export type DuplicatesQuery = Static<typeof DuplicatesQuerySchema>;

export const DuplicatesSummaryResponseSchema = Type.Object({
  duplicateCount: Type.Number(),
  totalContacts: Type.Number()
});

export type DuplicatesSummaryResponse = Static<typeof DuplicatesSummaryResponseSchema>;

export const DuplicatesContactSchema = Type.Object({
  id: Type.Number(),
  displayName: Type.String(),
  company: Type.Union([Type.String(), Type.Null()]),
  photoHash: Type.Union([Type.String(), Type.Null()]),
  photoUrl: Type.Union([Type.String(), Type.Null()]),
  addressGroups: Type.Array(AddressGroupSchema)
});

export const DuplicatesResponseSchema = Type.Object({
  contacts: Type.Array(DuplicatesContactSchema),
  total: Type.Number()
});

export type DuplicatesResponse = Static<typeof DuplicatesResponseSchema>;

// ============================================================
// Geocoding Schemas
// ============================================================

export const GeocodingStatusSchema = Type.Union([
  Type.Literal('pending'),
  Type.Literal('failed'),
  Type.Literal('geocoded')
]);

export type GeocodingStatusType = Static<typeof GeocodingStatusSchema>;

export const GeocodingFilterSchema = Type.Union([
  Type.Literal('all'),
  Type.Literal('pending'),
  Type.Literal('failed'),
  Type.Literal('geocoded')
]);

export type GeocodingFilterType = Static<typeof GeocodingFilterSchema>;

export const GeocodingSummaryResponseSchema = Type.Object({
  pending: Type.Number(),
  failed: Type.Number(),
  geocoded: Type.Number(),
  total: Type.Number()
});

export type GeocodingSummaryResponse = Static<typeof GeocodingSummaryResponseSchema>;

export const GeocodingAddressSchema = Type.Object({
  id: Type.Number(),
  contactId: Type.Number(),
  street: Type.Union([Type.String(), Type.Null()]),
  city: Type.Union([Type.String(), Type.Null()]),
  state: Type.Union([Type.String(), Type.Null()]),
  postalCode: Type.Union([Type.String(), Type.Null()]),
  country: Type.Union([Type.String(), Type.Null()]),
  type: Type.Union([Type.String(), Type.Null()]),
  latitude: Type.Union([Type.Number(), Type.Null()]),
  longitude: Type.Union([Type.Number(), Type.Null()]),
  geocodedAt: Type.Union([Type.String(), Type.Null()]),
  status: GeocodingStatusSchema
});

export const GeocodingContactSchema = Type.Object({
  id: Type.Number(),
  displayName: Type.String(),
  company: Type.Union([Type.String(), Type.Null()]),
  photoUrl: Type.Union([Type.String(), Type.Null()]),
  addresses: Type.Array(GeocodingAddressSchema)
});

export const GeocodingResponseSchema = Type.Object({
  contacts: Type.Array(GeocodingContactSchema),
  total: Type.Number()
});

export type GeocodingResponse = Static<typeof GeocodingResponseSchema>;

export const GeocodingQuerySchema = Type.Object({
  filter: Type.Optional(GeocodingFilterSchema),
  limit: Type.Optional(Type.Number({ default: 50 })),
  offset: Type.Optional(Type.Number({ default: 0 }))
});

export type GeocodingQuery = Static<typeof GeocodingQuerySchema>;

export const GeocodingRetryRequestSchema = Type.Object({
  addressIds: Type.Array(Type.Number())
});

export type GeocodingRetryRequest = Static<typeof GeocodingRetryRequestSchema>;

export const GeocodingBatchRequestSchema = Type.Object({
  limit: Type.Optional(Type.Number({ default: 50 }))
});

export type GeocodingBatchRequest = Static<typeof GeocodingBatchRequestSchema>;

export const GeocodingBatchResponseSchema = Type.Object({
  processed: Type.Number(),
  successful: Type.Number(),
  failed: Type.Number()
});

export type GeocodingBatchResponse = Static<typeof GeocodingBatchResponseSchema>;

export const GeocodingUpdateRequestSchema = Type.Object({
  addressId: Type.Number(),
  street: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  city: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  state: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  postalCode: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  country: Type.Optional(Type.Union([Type.String(), Type.Null()]))
});

export type GeocodingUpdateRequest = Static<typeof GeocodingUpdateRequestSchema>;

export const GeocodingUpdateResponseSchema = Type.Object({
  address: GeocodingAddressSchema
});

export type GeocodingUpdateResponse = Static<typeof GeocodingUpdateResponseSchema>;
