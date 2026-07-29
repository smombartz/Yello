import { Type, Static } from '@sinclair/typebox';

// ============================================================
// Request Schemas
// ============================================================

export const ImportJobParamsSchema = Type.Object({
  id: Type.String()
});

export type ImportJobParams = Static<typeof ImportJobParamsSchema>;

// ============================================================
// Response Schemas
// ============================================================

export const ImportJobResultSchema = Type.Object({
  imported: Type.Number(),
  skipped: Type.Number(),
  failed: Type.Number(),
  photosProcessed: Type.Number(),
  errors: Type.Array(Type.Object({
    line: Type.Number(),
    reason: Type.String()
  }))
});

export const ImportJobSchema = Type.Object({
  id: Type.String(),
  kind: Type.String(),
  status: Type.Union([
    Type.Literal('pending'),
    Type.Literal('running'),
    Type.Literal('completed'),
    Type.Literal('failed')
  ]),
  filename: Type.Union([Type.String(), Type.Null()]),
  totalCards: Type.Number(),
  cardsProcessed: Type.Number(),
  importedCount: Type.Number(),
  skippedCount: Type.Number(),
  failedCount: Type.Number(),
  photosProcessed: Type.Number(),
  result: Type.Union([ImportJobResultSchema, Type.Null()]),
  errorMessage: Type.Union([Type.String(), Type.Null()]),
  startedAt: Type.Union([Type.String(), Type.Null()]),
  completedAt: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.Union([Type.String(), Type.Null()])
});

export type ImportJobResponse = Static<typeof ImportJobSchema>;

export const StartImportResponseSchema = Type.Object({
  jobId: Type.String()
});

export const ActiveImportJobResponseSchema = Type.Object({
  job: Type.Union([ImportJobSchema, Type.Null()])
});
