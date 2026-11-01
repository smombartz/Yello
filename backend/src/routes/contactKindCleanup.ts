import type { Database as DatabaseType } from 'better-sqlite3';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { getUserDatabase } from '../services/userDatabase.js';
import { getPhotoUrl } from '../services/photoProcessor.js';
import { setContactKind } from '../services/contactKind.js';
import { suggestKind, type KindSuggestion } from '../services/contactKindSuggestions.js';
import { ContactKindSchema } from '../schemas/contact.js';

/**
 * Cleanup's "Company or Generic" tab: contacts the keyword rules
 * (services/contactKindSuggestions.ts) think are a company or generic.
 * Lives under /api/cleanup, so applying a kind triggers a sync.
 */

const SuggestedKindSchema = Type.Union([Type.Literal('company'), Type.Literal('generic')]);

const SummarySchema = Type.Object({
  company: Type.Number(),
  generic: Type.Number(),
  total: Type.Number()
});

const ListQuerySchema = Type.Object({
  kind: Type.Optional(SuggestedKindSchema),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200, default: 50 })),
  offset: Type.Optional(Type.Number({ minimum: 0, default: 0 }))
});
type ListQuery = Static<typeof ListQuerySchema>;

const SuggestionSchema = Type.Object({
  id: Type.Number(),
  displayName: Type.String(),
  company: Type.Union([Type.String(), Type.Null()]),
  title: Type.Union([Type.String(), Type.Null()]),
  primaryEmail: Type.Union([Type.String(), Type.Null()]),
  photoUrl: Type.Union([Type.String(), Type.Null()]),
  suggestedKind: SuggestedKindSchema,
  confidence: Type.Union([Type.Literal('strong'), Type.Literal('likely')]),
  reasons: Type.Array(Type.String())
});

const ListResponseSchema = Type.Object({
  contacts: Type.Array(SuggestionSchema),
  total: Type.Number()
});

const ApplyBodySchema = Type.Object({
  items: Type.Array(Type.Object({ id: Type.Number(), kind: ContactKindSchema }), { minItems: 1, maxItems: 5000 })
});
type ApplyBody = Static<typeof ApplyBodySchema>;

const ApplyAllBodySchema = Type.Object({
  kind: Type.Optional(SuggestedKindSchema),
  excludeIds: Type.Optional(Type.Array(Type.Number()))
});
type ApplyAllBody = Static<typeof ApplyAllBodySchema>;

const ApplyResponseSchema = Type.Object({ updated: Type.Number() });

interface CandidateRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  company: string | null;
  title: string | null;
  photo_hash: string | null;
  emails: string | null;
}

type Suggestion = KindSuggestion & { row: CandidateRow };

/**
 * Every current suggestion, strong ones first, then by name. Candidates are
 * active contacts the user never picked a kind for and that aren't flagged as
 * a company already. In memory: a few thousand contacts is cheap.
 */
function findSuggestions(db: DatabaseType): Suggestion[] {
  const rows = db.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.display_name, c.company, c.title, c.photo_hash,
      (SELECT GROUP_CONCAT(email, char(10)) FROM contact_emails
        WHERE contact_id = c.id AND detail_archived_at IS NULL) AS emails
    FROM contacts c
    WHERE c.archived_at IS NULL AND c.kind IS NULL AND COALESCE(c.is_company, 0) = 0
  `).all() as CandidateRow[];

  const suggestions: Suggestion[] = [];
  for (const row of rows) {
    const suggestion = suggestKind({
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      company: row.company,
      emails: row.emails ? row.emails.split('\n') : []
    });
    if (suggestion) suggestions.push({ ...suggestion, row });
  }
  return suggestions.sort((a, b) =>
    (a.confidence === b.confidence ? 0 : a.confidence === 'strong' ? -1 : 1)
    || a.row.display_name.localeCompare(b.row.display_name, undefined, { sensitivity: 'base' }));
}

function applyKinds(db: DatabaseType, items: ApplyBody['items']): number {
  let updated = 0;
  db.transaction(() => {
    for (const item of items) if (setContactKind(db, item.id, item.kind)) updated++;
  })();
  return updated;
}

export default async function contactKindCleanupRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // GET /api/cleanup/contact-kind/summary
  fastify.get('/summary', {
    schema: { response: { 200: SummarySchema } }
  }, async (request) => {
    const suggestions = findSuggestions(getUserDatabase(request.user!.id));
    const company = suggestions.filter(s => s.kind === 'company').length;
    return { company, generic: suggestions.length - company, total: suggestions.length };
  });

  // GET /api/cleanup/contact-kind/suggestions?kind=company&limit=50&offset=0
  fastify.get<{ Querystring: ListQuery }>('/suggestions', {
    schema: { querystring: ListQuerySchema, response: { 200: ListResponseSchema } }
  }, async (request) => {
    const { kind, limit = 50, offset = 0 } = request.query;
    const db = getUserDatabase(request.user!.id);
    const matching = findSuggestions(db).filter(s => !kind || s.kind === kind);
    const page = matching.slice(offset, offset + limit);
    const primaryEmail = db.prepare(`
      SELECT email FROM contact_emails WHERE contact_id = ? AND detail_archived_at IS NULL
      ORDER BY is_primary DESC, id LIMIT 1
    `);
    return {
      contacts: page.map(s => ({
        id: s.row.id,
        displayName: s.row.display_name,
        company: s.row.company,
        title: s.row.title,
        primaryEmail: (primaryEmail.get(s.row.id) as { email: string } | undefined)?.email ?? null,
        photoUrl: getPhotoUrl(s.row.photo_hash, 'small'),
        suggestedKind: s.kind,
        confidence: s.confidence,
        reasons: s.reasons
      })),
      total: matching.length
    };
  });

  // POST /api/cleanup/contact-kind/apply  { items: [{ id, kind }] }
  fastify.post<{ Body: ApplyBody }>('/apply', {
    schema: { body: ApplyBodySchema, response: { 200: ApplyResponseSchema } }
  }, async (request) => {
    const db = getUserDatabase(request.user!.id);
    return { updated: applyKinds(db, request.body.items) };
  });

  // POST /api/cleanup/contact-kind/apply-all  { kind?, excludeIds? }
  // Applies every current suggestion as suggested, recomputed here so the
  // browser needn't send thousands of ids. excludeIds are the rows it skipped.
  fastify.post<{ Body: ApplyAllBody }>('/apply-all', {
    schema: { body: ApplyAllBodySchema, response: { 200: ApplyResponseSchema } }
  }, async (request) => {
    const { kind, excludeIds = [] } = request.body;
    const db = getUserDatabase(request.user!.id);
    const skipped = new Set(excludeIds);
    const items = findSuggestions(db)
      .filter(s => (!kind || s.kind === kind) && !skipped.has(s.row.id))
      .map(s => ({ id: s.row.id, kind: s.kind }));
    return { updated: items.length ? applyKinds(db, items) : 0 };
  });
}
