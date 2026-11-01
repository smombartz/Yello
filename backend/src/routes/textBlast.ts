import { FastifyInstance, FastifyPluginOptions, FastifyReply } from 'fastify';
import { getUserDatabase } from '../services/userDatabase.js';
import { buildRecipients, BuildInput } from '../services/textBlast/recipients.js';
import { normalizePhone } from '../services/textBlast/phone.js';
import {
  BLAST_STATUSES, BlastStatus, LIMIT_RANGE, RECIPIENT_STATUSES, RecipientStatus,
  createBlast, deleteBlast, getBlast, getLimits, listBlasts, rerunBlast, sendCounts, setBlastStatus, setLimits, setRecipientStatus, setSkipped,
} from '../services/textBlast/store.js';

/**
 * Text Blast: personal 1:1 texts sent through Messages by the desktop app
 * (docs/plans/2026-10-31-text-blast.md). The backend builds recipient lists and keeps
 * each person's status; the desktop app does the sending and reports back here.
 * Nothing here changes contacts, so it isn't in syncScheduler's EDITING_PREFIXES.
 */

const MAX_CSV_BYTES = 5 * 1024 * 1024;

const buildInputSchema = {
  type: 'object',
  required: ['template', 'country'],
  properties: {
    groups: { type: 'array', items: { type: 'string' }, maxItems: 200, default: [] },
    csv: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          required: ['name', 'text'],
          properties: { name: { type: 'string', maxLength: 300 }, text: { type: 'string', maxLength: MAX_CSV_BYTES } },
        },
      ],
    },
    template: { type: 'string', maxLength: 5000 },
    country: { type: 'string', pattern: '^[A-Z]{2}$' },
    phoneOverrides: { type: 'object', additionalProperties: { type: 'string' } },
  },
} as const;

type IdParams = { id: string };
type RecipientParams = { id: string; rid: string };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function notFound(reply: FastifyReply) {
  return reply.status(404).send({ error: 'Blast not found' });
}

function badRequest(reply: FastifyReply, error: unknown) {
  return reply.status(400).send({ error: error instanceof Error ? error.message : String(error) });
}

export default async function textBlastRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions): Promise<void> {
  const bodyLimit = MAX_CSV_BYTES + 1024 * 1024;

  // POST /api/text-blasts/preview: resolve groups + CSV into recipients with their texts (stateless).
  fastify.post<{ Body: BuildInput }>('/preview', {
    bodyLimit,
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: { body: buildInputSchema },
  }, async (request, reply) => {
    try {
      return buildRecipients(getUserDatabase(request.user!.id), request.body);
    } catch (error) {
      return badRequest(reply, error);
    }
  });

  // POST /api/text-blasts: create a draft from the same input the preview used.
  // The list is rebuilt here, so what's stored is exactly what the server would send.
  fastify.post<{ Body: BuildInput & { simulate?: boolean; excludeKeys?: string[] } }>('/', {
    bodyLimit,
    schema: {
      body: {
        ...buildInputSchema,
        properties: {
          ...buildInputSchema.properties,
          simulate: { type: 'boolean', default: false },
          excludeKeys: { type: 'array', items: { type: 'string' }, default: [] },
        },
      },
    },
  }, async (request, reply) => {
    const db = getUserDatabase(request.user!.id);
    const { simulate = false, excludeKeys = [], ...input } = request.body;
    try {
      const excluded = new Set(excludeKeys);
      const { recipients, csv } = buildRecipients(db, input);
      const id = createBlast(db, {
        template: input.template,
        country: input.country,
        simulate,
        sources: { groups: input.groups ?? [], csvName: csv?.name ?? null },
        recipients: recipients.filter((r) => !excluded.has(r.key)),
      });
      return { blast: getBlast(db, id) };
    } catch (error) {
      return badRequest(reply, error);
    }
  });

  // GET /api/text-blasts/normalize?phone=&country=: the test number, in the form Messages gets.
  fastify.get<{ Querystring: { phone?: string; country?: string } }>('/normalize', async (request) => {
    const country = /^[A-Z]{2}$/.test(request.query.country ?? '') ? request.query.country! : 'US';
    return normalizePhone(request.query.phone ?? '', country);
  });

  // GET /api/text-blasts: history, newest first (no recipients).
  fastify.get('/', async (request) => ({ blasts: listBlasts(getUserDatabase(request.user!.id)) }));

  // GET /api/text-blasts/sent-today?since=<ISO local midnight>: attempts toward the daily and hourly limits.
  // { count, cap } is the day; { hourCount, hourCap, hourResetAt } the last 60 minutes.
  fastify.get<{ Querystring: { since?: string } }>('/sent-today', async (request) => {
    const parsed = request.query.since ? new Date(request.query.since) : null;
    const since = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(Date.now() - 24 * 3600 * 1000);
    return sendCounts(getUserDatabase(request.user!.id), since.toISOString());
  });

  // GET /api/text-blasts/settings: the send limits.
  fastify.get('/settings', async (request) => ({ limits: getLimits(getUserDatabase(request.user!.id)) }));

  // PUT /api/text-blasts/settings { daily, hourly }: change the send limits.
  fastify.put<{ Body: { daily: number; hourly: number } }>('/settings', {
    schema: {
      body: {
        type: 'object',
        required: ['daily', 'hourly'],
        additionalProperties: false,
        properties: {
          daily: { type: 'integer', minimum: LIMIT_RANGE.daily[0], maximum: LIMIT_RANGE.daily[1] },
          hourly: { type: 'integer', minimum: LIMIT_RANGE.hourly[0], maximum: LIMIT_RANGE.hourly[1] },
        },
      },
    },
  }, async (request) => ({ limits: setLimits(getUserDatabase(request.user!.id), request.body) }));

  // GET /api/text-blasts/:id: one blast with every recipient.
  fastify.get<{ Params: IdParams }>('/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    const blast = id && getBlast(getUserDatabase(request.user!.id), id);
    return blast ? { blast } : notFound(reply);
  });

  // DELETE /api/text-blasts/:id (not while it's running)
  fastify.delete<{ Params: IdParams }>('/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    const db = getUserDatabase(request.user!.id);
    if (!id || !getBlast(db, id, false)) return notFound(reply);
    if (!deleteBlast(db, id)) return reply.status(409).send({ error: 'Stop the blast before deleting it.' });
    return { ok: true };
  });

  // POST /api/text-blasts/:id/status { status }: the desktop app marks running/stopped/finished.
  fastify.post<{ Params: IdParams; Body: { status: BlastStatus } }>('/:id/status', {
    schema: { body: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: [...BLAST_STATUSES] } } } },
  }, async (request, reply) => {
    const id = parseId(request.params.id);
    const db = getUserDatabase(request.user!.id);
    if (!id || !setBlastStatus(db, id, request.body.status)) return notFound(reply);
    return { blast: getBlast(db, id, false) };
  });

  // POST /api/text-blasts/:id/recipients/:rid/status: written before and after every send.
  fastify.post<{ Params: RecipientParams; Body: { status: RecipientStatus; service?: string | null; note?: string | null } }>(
    '/:id/recipients/:rid/status', {
      config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: [...RECIPIENT_STATUSES] },
            service: { type: ['string', 'null'], maxLength: 20 },
            note: { type: ['string', 'null'], maxLength: 1000 },
          },
        },
      },
    }, async (request, reply) => {
      const id = parseId(request.params.id);
      const rid = parseId(request.params.rid);
      const recipient = id && rid && setRecipientStatus(getUserDatabase(request.user!.id), id, rid, request.body);
      return recipient ? { recipient } : reply.status(404).send({ error: 'Recipient not found' });
    });

  // POST /api/text-blasts/:id/recipients/skip { ids, skipped }: untick / re-tick people.
  fastify.post<{ Params: IdParams; Body: { ids: number[]; skipped: boolean } }>('/:id/recipients/skip', {
    schema: {
      body: {
        type: 'object',
        required: ['ids', 'skipped'],
        properties: { ids: { type: 'array', items: { type: 'integer' }, maxItems: 5000 }, skipped: { type: 'boolean' } },
      },
    },
  }, async (request, reply) => {
    const id = parseId(request.params.id);
    const db = getUserDatabase(request.user!.id);
    if (!id || !getBlast(db, id, false)) return notFound(reply);
    return { changed: setSkipped(db, id, request.body.ids, request.body.skipped) };
  });

  // POST /api/text-blasts/:id/rerun { template, simulate }: same people, new message, new draft.
  fastify.post<{ Params: IdParams; Body: { template: string; simulate?: boolean } }>('/:id/rerun', {
    schema: {
      body: {
        type: 'object',
        required: ['template'],
        properties: { template: { type: 'string', minLength: 1, maxLength: 5000 }, simulate: { type: 'boolean', default: false } },
      },
    },
  }, async (request, reply) => {
    const id = parseId(request.params.id);
    const db = getUserDatabase(request.user!.id);
    const newId = id && rerunBlast(db, id, request.body.template, request.body.simulate ?? false);
    return newId ? { blast: getBlast(db, newId) } : notFound(reply);
  });
}
