import { Type, Static } from '@sinclair/typebox';
import { ContactDetailSchema } from './contact.js';

// ============================================================
// Request Schemas
// ============================================================

export const ArchiveContactsBodySchema = Type.Object({
  contactIds: Type.Array(Type.Number(), { minItems: 1 })
});

export type ArchiveContactsBody = Static<typeof ArchiveContactsBodySchema>;

export const UnarchiveContactsBodySchema = Type.Object({
  contactIds: Type.Array(Type.Number(), { minItems: 1 })
});

export type UnarchiveContactsBody = Static<typeof UnarchiveContactsBodySchema>;

export const DeleteArchivedBodySchema = Type.Object({
  contactIds: Type.Array(Type.Number(), { minItems: 1 })
});

export type DeleteArchivedBody = Static<typeof DeleteArchivedBodySchema>;

export const ArchivedListQuerySchema = Type.Object({
  limit: Type.Optional(Type.Number({ default: 50 })),
  offset: Type.Optional(Type.Number({ default: 0 }))
});

export type ArchivedListQuery = Static<typeof ArchivedListQuerySchema>;

// ============================================================
// Response Schemas
// ============================================================

export const ArchivedContactSchema = Type.Intersect([
  ContactDetailSchema,
  Type.Object({
    archivedAt: Type.String()
  })
]);

export const ArchivedListResponseSchema = Type.Object({
  contacts: Type.Array(ArchivedContactSchema),
  total: Type.Number(),
  limit: Type.Number(),
  offset: Type.Number()
});

export const ArchivedCountResponseSchema = Type.Object({
  count: Type.Number()
});

export const ArchiveResponseSchema = Type.Object({
  archivedCount: Type.Number()
});

export const UnarchiveResponseSchema = Type.Object({
  unarchivedCount: Type.Number()
});

export const DeleteArchivedResponseSchema = Type.Object({
  deletedCount: Type.Number()
});

export const ArchiveErrorSchema = Type.Object({
  error: Type.String()
});
