import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { getUserDatabase } from '../services/userDatabase.js';
import { MESSAGE_CHANNELS, autoMatchHandles } from '../services/messageMatching.js';
import {
  IngestError, ingestActivity, getSources, getTopContacts, listHandles, linkHandles, ignoreHandles,
  unlinkHandles, acceptAllSuggestions, clearChannel, getContactMessageStats,
} from '../services/messageActivityService.js';
import { startGmailScan, markStaleGmailScan } from '../services/gmailActivityService.js';

/**
 * Top contacts: message activity per person across Gmail, iMessage,
 * WhatsApp, Instagram and LinkedIn (services/messageActivityService.ts).
 * /handles/* can add a phone, email or profile to a contact, so that prefix
 * is in syncScheduler's EDITING_PREFIXES.
 */

const ChannelSchema = Type.Union(MESSAGE_CHANNELS.map(c => Type.Literal(c)));
const DaySchema = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
const HandleKindSchema = Type.Union([
  Type.Literal('phone'), Type.Literal('email'), Type.Literal('username'), Type.Literal('url'), Type.Literal('opaque'),
]);

/** Big enough for a year of daily counts from a busy iMessage history */
const INGEST_BODY_LIMIT = 25 * 1024 * 1024;

const IngestBodySchema = Type.Object({
  channel: ChannelSchema,
  from: DaySchema,
  to: DaySchema,
  handles: Type.Array(Type.Object({
    handle: Type.String({ minLength: 1, maxLength: 500 }),
    kind: Type.Optional(HandleKindSchema),
    displayName: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
  }), { maxItems: 100_000 }),
  activity: Type.Array(Type.Object({
    handle: Type.String({ minLength: 1, maxLength: 500 }),
    day: DaySchema,
    sent: Type.Optional(Type.Integer({ minimum: 0 })),
    received: Type.Optional(Type.Integer({ minimum: 0 })),
    group: Type.Optional(Type.Integer({ minimum: 0 })),
  }), { maxItems: 500_000 }),
  final: Type.Optional(Type.Boolean()),
});
type IngestBody = Static<typeof IngestBodySchema>;

const TopQuerySchema = Type.Object({
  mode: Type.Optional(Type.Union([Type.Literal('score'), Type.Literal('count')])),
  window: Type.Optional(Type.Union([Type.Literal('30'), Type.Literal('90'), Type.Literal('365'), Type.Literal('all')])),
  channel: Type.Optional(ChannelSchema),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  today: Type.Optional(DaySchema),
});
type TopQuery = Static<typeof TopQuerySchema>;

const HandlesQuerySchema = Type.Object({
  status: Type.Optional(Type.Union([Type.Literal('unmatched'), Type.Literal('matched'), Type.Literal('ignored')])),
  channel: Type.Optional(ChannelSchema),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  /** messages: busiest first; suggestions: people with a name match first, then busiest */
  sort: Type.Optional(Type.Union([Type.Literal('messages'), Type.Literal('suggestions')])),
});
type HandlesQuery = Static<typeof HandlesQuerySchema>;

const HandleRefsSchema = Type.Array(Type.Object({ channel: ChannelSchema, handle: Type.String({ minLength: 1 }) }),
  { minItems: 1, maxItems: 1000 });

const LinkBodySchema = Type.Object({
  handles: HandleRefsSchema,
  contactId: Type.Integer(),
  addToContact: Type.Optional(Type.Boolean()),
});
type LinkBody = Static<typeof LinkBodySchema>;

const RefsBodySchema = Type.Object({ handles: HandleRefsSchema });
type RefsBody = Static<typeof RefsBodySchema>;

const AcceptBodySchema = Type.Object({ channel: Type.Optional(ChannelSchema) });
type AcceptBody = Static<typeof AcceptBodySchema>;

const GmailScanBodySchema = Type.Object({ timeZone: Type.Optional(Type.String({ maxLength: 100 })) });
type GmailScanBody = Static<typeof GmailScanBodySchema>;

const ChannelParamsSchema = Type.Object({ channel: ChannelSchema });
type ChannelParams = Static<typeof ChannelParamsSchema>;

export default async function messagesRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions): Promise<void> {
  // GET /api/messages/sources — status and totals per channel
  fastify.get('/sources', async (request) => {
    const db = getUserDatabase(request.user!.id);
    markStaleGmailScan(db, request.user!.id);
    return { sources: getSources(db) };
  });

  // POST /api/messages/activity — daily counts from the desktop app or an export
  fastify.post<{ Body: IngestBody }>('/activity', {
    bodyLimit: INGEST_BODY_LIMIT,
    schema: { body: IngestBodySchema },
  }, async (request, reply) => {
    try {
      return ingestActivity(getUserDatabase(request.user!.id), request.body);
    } catch (err) {
      if (err instanceof IngestError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  // DELETE /api/messages/sources/:channel — forget a channel's imported data
  fastify.delete<{ Params: ChannelParams }>('/sources/:channel', {
    schema: { params: ChannelParamsSchema },
  }, async (request) => {
    clearChannel(getUserDatabase(request.user!.id), request.params.channel);
    return { ok: true };
  });

  // POST /api/messages/gmail/scan — count Gmail in the background
  fastify.post<{ Body: GmailScanBody }>('/gmail/scan', {
    schema: { body: GmailScanBodySchema },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const db = getUserDatabase(userId);
    try {
      const run = await startGmailScan(db, userId, request.body?.timeZone || 'UTC');
      run().catch(err => request.log.error({ err }, 'Gmail activity scan failed'));
      return reply.code(202).send({ started: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'gmail_scope_required') return reply.code(403).send({ error: 'gmail_scope_required' });
      if (message === 'no_token') return reply.code(400).send({ error: 'no_token' });
      if (message === 'already_running') return reply.code(409).send({ error: 'already_running' });
      throw err;
    }
  });

  // GET /api/messages/top?mode=score|count&window=30|90|365|all&channel=
  fastify.get<{ Querystring: TopQuery }>('/top', {
    schema: { querystring: TopQuerySchema },
  }, async (request) => {
    const { mode = 'score', window = 'all', channel, limit = 50, offset = 0, today } = request.query;
    const db = getUserDatabase(request.user!.id);
    autoMatchHandles(db);
    return getTopContacts(db, {
      mode, channel, limit, offset, today,
      windowDays: window === 'all' ? null : Number(window),
    });
  });

  // GET /api/messages/handles?status=unmatched|matched|ignored&channel=
  fastify.get<{ Querystring: HandlesQuery }>('/handles', {
    schema: { querystring: HandlesQuerySchema },
  }, async (request) => {
    const { status = 'unmatched', channel, limit = 50, offset = 0, sort = 'messages' } = request.query;
    return listHandles(getUserDatabase(request.user!.id), { status, channel, limit, offset, sort });
  });

  // POST /api/messages/handles/link { handles, contactId, addToContact }
  fastify.post<{ Body: LinkBody }>('/handles/link', {
    schema: { body: LinkBodySchema },
  }, async (request, reply) => {
    const { handles, contactId, addToContact = true } = request.body;
    try {
      return linkHandles(getUserDatabase(request.user!.id), handles, contactId, addToContact);
    } catch (err) {
      if (err instanceof IngestError) return reply.code(404).send({ error: err.message });
      throw err;
    }
  });

  // POST /api/messages/handles/ignore { handles }
  fastify.post<{ Body: RefsBody }>('/handles/ignore', { schema: { body: RefsBodySchema } }, async (request) => {
    return { updated: ignoreHandles(getUserDatabase(request.user!.id), request.body.handles) };
  });

  // POST /api/messages/handles/unlink { handles }
  fastify.post<{ Body: RefsBody }>('/handles/unlink', { schema: { body: RefsBodySchema } }, async (request) => {
    return { updated: unlinkHandles(getUserDatabase(request.user!.id), request.body.handles) };
  });

  // POST /api/messages/handles/accept-suggestions { channel? }
  fastify.post<{ Body: AcceptBody }>('/handles/accept-suggestions', { schema: { body: AcceptBodySchema } }, async (request) => {
    return { updated: acceptAllSuggestions(getUserDatabase(request.user!.id), request.body?.channel) };
  });

  // GET /api/messages/contacts/:id — one contact's message summary
  fastify.get<{ Params: { id: string } }>('/contacts/:id', {
    schema: { params: Type.Object({ id: Type.String({ pattern: '^\\d+$' }) }) },
  }, async (request) => {
    return getContactMessageStats(getUserDatabase(request.user!.id), Number(request.params.id));
  });
}
