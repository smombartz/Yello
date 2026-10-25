import fs from 'fs';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import {
  checkDeletionGate,
  confirmBackup,
  getBackup,
  listBackups,
  resolveBackupFile,
  startBackup,
  type BackupProvider
} from '../services/sync/remoteBackupService.js';
import {
  DEFAULT_WINDOW_DAYS,
  getLatestCutover,
  listCutoverItems,
  startCutoverPlan,
  type CutoverItemKind
} from '../services/sync/cutoverPlanner.js';
import { getSyncProviders, type SyncProvider } from '../services/sync/syncState.js';
import { openUserICloud, runICloudSync } from '../services/sync/icloudSyncEngine.js';
import { runGoogleSync } from '../services/sync/googleSyncEngine.js';
import { openGoogleRemote } from '../services/sync/googleRemote.js';
import { contactsScopeOf, getValidAccessToken } from '../services/googleAuthService.js';
import { isSyncRunning, updateProvider } from '../services/sync/syncRuntime.js';
import { isGroupVcard } from '../services/vcardParser.js';
import {
  CutoverError, effectiveResolution, isCutoverRunning, RESOLUTIONS, resolveAllCutoverItems,
  resolveCutoverItems, startCutoverApply
} from '../services/sync/cutoverApply.js';
import { RestoreError, startRestore, type RestoreMode } from '../services/sync/remoteRestore.js';
import { listRemoteVersions, RemoteVersionError, restoreRemoteVersion } from '../services/sync/remoteVersions.js';
import { runAllSyncs, scheduleSyncAfterEdit, syncIntervalMinutes } from '../services/sync/syncScheduler.js';
import { getUserDatabase } from '../services/userDatabase.js';

const PROVIDERS: BackupProvider[] = ['icloud', 'google'];
const ITEM_KINDS: CutoverItemKind[] = [
  'link', 'merged_duplicate', 'update', 'conflict', 'possible_match',
  'import', 'delete_remote', 'restore_review', 'create_remote', 'group_card'
];

const CONTENT_TYPES: Record<string, string> = {
  '.vcf': 'text/vcard; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.db': 'application/vnd.sqlite3'
};

export default async function syncRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {

  // GET /api/sync/status — per-provider sync state
  fastify.get('/status', async (request) => {
    const userId = request.user!.id;
    return {
      engineEnabled: process.env.SYNC_ENGINE === '1',
      intervalMinutes: syncIntervalMinutes(),
      running: PROVIDERS.filter(p => isSyncRunning(userId, p)),
      providers: getSyncProviders(getUserDatabase(userId))
    };
  });

  // The sync engine is switched on per deployment while it is being tested
  // (SYNC_ENGINE=1). Until the cutover ships, only an empty iCloud address
  // book can be enabled: every card already there would otherwise be
  // imported as a new contact.
  const engineEnabled = () => process.env.SYNC_ENGINE === '1';
  const engineOff = { error: 'The sync engine is not switched on for this server (SYNC_ENGINE=1).' };
  const providerBody = {
    type: 'object',
    required: ['provider'],
    properties: { provider: { type: 'string', enum: PROVIDERS }, confirmLargeChanges: { type: 'boolean' } }
  } as const;

  const runSync = (userId: number, provider: SyncProvider, options: { confirmLargeChanges?: boolean } = {}) =>
    provider === 'icloud'
      ? runICloudSync(userId, { trigger: 'manual', fullScan: true, ...options })
      : runGoogleSync(userId, { trigger: 'manual', ...options });

  // POST /api/sync/icloud/enable — start syncing with an EMPTY iCloud address book
  fastify.post('/icloud/enable', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!engineEnabled()) return reply.status(403).send(engineOff);
    const userId = request.user!.id;
    const db = getUserDatabase(userId);
    try {
      const remote = await openUserICloud(db);
      const listing = await remote.listCards();
      const cards = listing.length <= 50 ? await remote.fetchCards(listing.map(c => c.url)) : null;
      const contacts = cards ? cards.filter(c => !isGroupVcard(c.data)).length : listing.length;
      if (contacts > 0) {
        return reply.status(409).send({
          error: `This iCloud address book already holds ${contacts} contacts. Existing books are switched over by the cutover, not by enabling sync.`
        });
      }
      updateProvider(db, 'icloud', {
        enabled: 1, paused: 0, collection_url: remote.collectionUrl, ctag: null,
        cutover_completed_at: new Date().toISOString(), last_error: null
      });
      // The first run creates a card for every contact; enabling is the confirmation.
      return await runICloudSync(userId, { trigger: 'manual', remote, confirmLargeChanges: true });
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Could not enable iCloud sync' });
    }
  });

  // POST /api/sync/google/enable — start syncing with an EMPTY Google Contacts
  fastify.post('/google/enable', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!engineEnabled()) return reply.status(403).send(engineOff);
    const userId = request.user!.id;
    const db = getUserDatabase(userId);
    try {
      const token = await getValidAccessToken(userId);
      if (!token || await contactsScopeOf(token) !== 'write') {
        return reply.status(409).send({
          error: 'Yello needs full access to your Google Contacts. Grant it via /api/auth/google/contacts?write=1 first.',
          grantUrl: '/api/auth/google/contacts?write=1'
        });
      }
      const remote = openGoogleRemote(userId);
      const { people, nextSyncToken } = await remote.listChanges(null);
      const contacts = people.filter(p => !p.metadata?.deleted).length;
      if (contacts > 0) {
        return reply.status(409).send({
          error: `This Google account already holds ${contacts} contacts. Existing contacts are switched over by the cutover, not by enabling sync.`
        });
      }
      updateProvider(db, 'google', {
        enabled: 1, paused: 0, sync_token: nextSyncToken, cutover_completed_at: new Date().toISOString(), last_error: null
      });
      return await runGoogleSync(userId, { trigger: 'manual', remote, confirmLargeChanges: true });
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Could not enable Google sync' });
    }
  });

  for (const provider of PROVIDERS) {
    // POST /api/sync/:provider/disable — stop syncing (links are kept, nothing is deleted)
    fastify.post(`/${provider}/disable`, async (request) => {
      const db = getUserDatabase(request.user!.id);
      updateProvider(db, provider, { enabled: 0 });
      return { providers: getSyncProviders(db) };
    });

    // POST /api/sync/:provider/reset — forget the pairing entirely (after
    // testing with a spare account). Contacts are untouched; links, pending
    // remote deletions and the provider state are cleared.
    fastify.post(`/${provider}/reset`, async (request, reply) => {
      if (!engineEnabled()) return reply.status(403).send(engineOff);
      const db = getUserDatabase(request.user!.id);
      if (isSyncRunning(request.user!.id, provider)) return reply.status(409).send({ error: 'A sync is running' });
      db.transaction(() => {
        // Only the resource names sync wrote; ones from a Google import stay.
        if (provider === 'google') {
          db.prepare(`
            UPDATE contacts SET google_resource_name = NULL
            WHERE id IN (SELECT contact_id FROM contact_sync_links WHERE provider = 'google' AND remote_id = contacts.google_resource_name)
          `).run();
        }
        db.prepare('DELETE FROM contact_sync_links WHERE provider = ?').run(provider);
        db.prepare('DELETE FROM sync_tombstones WHERE provider = ?').run(provider);
        updateProvider(db, provider, {
          enabled: 0, paused: 0, collection_url: null, sync_token: null, ctag: null, last_error: null,
          consecutive_failures: 0, cutover_completed_at: null
        });
      })();
      return { providers: getSyncProviders(db) };
    });
  }

  // POST /api/sync/run — sync one provider now
  fastify.post<{ Body: { provider: SyncProvider; confirmLargeChanges?: boolean } }>('/run', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { body: providerBody }
  }, async (request, reply) => {
    if (!engineEnabled()) return reply.status(403).send(engineOff);
    const { provider, confirmLargeChanges } = request.body;
    return runSync(request.user!.id, provider, { confirmLargeChanges: !!confirmLargeChanges });
  });

  // POST /api/sync/run-all — sync every switched-over provider now, iCloud first
  fastify.post<{ Body: { confirmLargeChanges?: boolean } }>('/run-all', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    if (!engineEnabled()) return reply.status(403).send(engineOff);
    return runAllSyncs(request.user!.id, 'manual', { confirmLargeChanges: !!request.body?.confirmLargeChanges });
  });

  // POST /api/sync/pause, /api/sync/resume
  for (const action of ['pause', 'resume'] as const) {
    fastify.post<{ Body: { provider: SyncProvider } }>(`/${action}`, { schema: { body: providerBody } }, async (request) => {
      const db = getUserDatabase(request.user!.id);
      // A pause the user asks for replaces whatever paused it before.
      updateProvider(db, request.body.provider, action === 'pause' ? { paused: 1, last_error: null } : { paused: 0 });
      return { providers: getSyncProviders(db) };
    });
  }

  // GET /api/sync/remote-versions?contactId= — what sync overwrote or deleted for a contact
  fastify.get<{ Querystring: { contactId: number } }>('/remote-versions', {
    schema: { querystring: { type: 'object', required: ['contactId'], properties: { contactId: { type: 'integer' } } } }
  }, async (request) => {
    return { versions: listRemoteVersions(request.user!.id, request.query.contactId) };
  });

  // POST /api/sync/remote-versions/:id/restore — make the contact match that version again
  fastify.post<{ Params: { id: string } }>('/remote-versions/:id/restore', async (request, reply) => {
    try {
      const contactId = restoreRemoteVersion(request.user!.id, Number(request.params.id));
      scheduleSyncAfterEdit(request.user!.id, request.log);
      return { contactId };
    } catch (error) {
      return reply.status(error instanceof RemoteVersionError ? 409 : 500).send({ error: error instanceof Error ? error.message : 'Restore failed' });
    }
  });

  // GET /api/sync/runs — recent sync runs
  fastify.get<{ Querystring: { provider?: SyncProvider; limit?: number } }>('/runs', {
    schema: {
      querystring: {
        type: 'object',
        properties: { provider: { type: 'string', enum: PROVIDERS }, limit: { type: 'integer', minimum: 1, maximum: 200 } }
      }
    }
  }, async (request) => {
    const db = getUserDatabase(request.user!.id);
    const { provider, limit = 20 } = request.query;
    const runs = db.prepare(`
      SELECT * FROM sync_runs ${provider ? 'WHERE provider = ?' : ''} ORDER BY id DESC LIMIT ?
    `).all(...(provider ? [provider, limit] : [limit])) as Array<Record<string, unknown>>;
    return {
      running: PROVIDERS.filter(p => isSyncRunning(request.user!.id, p)),
      runs: runs.map(r => ({ ...r, errors: r.errors_json ? JSON.parse(r.errors_json as string) : [], errors_json: undefined }))
    };
  });

  // POST /api/sync/cutover/plan — compute the cutover preview (dry run) from
  // the latest verified backups, in the background. Read-only.
  fastify.post<{ Body: { windowDays?: number } }>('/cutover/plan', {
    config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        properties: { windowDays: { type: 'integer', minimum: 1, maximum: 3650 } }
      }
    }
  }, async (request, reply) => {
    try {
      const { id, promise } = startCutoverPlan(request.user!.id, request.body?.windowDays ?? DEFAULT_WINDOW_DAYS);
      promise.catch(err => request.log.error(err, 'Cutover plan crashed'));
      return reply.status(202).send({ id });
    } catch (error) {
      return reply.status(409).send({ error: error instanceof Error ? error.message : 'Preview already running' });
    }
  });

  // GET /api/sync/cutover/latest — the most recent preview and its summary
  fastify.get('/cutover/latest', async (request) => {
    return { cutover: getLatestCutover(request.user!.id), applying: isCutoverRunning(request.user!.id), choices: RESOLUTIONS };
  });

  const cutoverFailure = (reply: import('fastify').FastifyReply, error: unknown) =>
    reply.status(error instanceof CutoverError ? 409 : 500).send({ error: error instanceof Error ? error.message : 'Cutover failed' });

  // POST /api/sync/cutover/:id/resolve — the reviewer's choice per item (null = back to the default)
  fastify.post<{ Params: { id: string }; Body: { items: Array<{ id: number; resolution: string | null }> } }>('/cutover/:id/resolve', {
    schema: {
      body: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array', maxItems: 5000,
            items: { type: 'object', required: ['id', 'resolution'], properties: { id: { type: 'integer' }, resolution: { type: ['string', 'null'] } } }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      return { changed: resolveCutoverItems(request.user!.id, request.params.id, request.body.items) };
    } catch (error) {
      return cutoverFailure(reply, error);
    }
  });

  // POST /api/sync/cutover/:id/resolve-all — one choice for every item of a kind (null = all back to the suggestions)
  fastify.post<{ Params: { id: string }; Body: { kind?: CutoverItemKind; provider?: SyncProvider; resolution: string | null } }>('/cutover/:id/resolve-all', {
    schema: {
      body: {
        type: 'object',
        required: ['resolution'],
        properties: {
          kind: { type: 'string', enum: ITEM_KINDS },
          provider: { type: 'string', enum: PROVIDERS },
          resolution: { type: ['string', 'null'] }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { kind, provider, resolution } = request.body;
      return { changed: resolveAllCutoverItems(request.user!.id, request.params.id, { kind, provider }, resolution) };
    } catch (error) {
      return cutoverFailure(reply, error);
    }
  });

  // POST /api/sync/cutover/:id/apply — make the switch (or continue an unfinished one)
  fastify.post<{ Params: { id: string } }>('/cutover/:id/apply', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    if (!engineEnabled()) return reply.status(403).send(engineOff);
    try {
      const { promise } = await startCutoverApply(request.user!.id, request.params.id);
      promise.catch(err => request.log.error(err, 'Cutover apply crashed'));
      return reply.status(202).send({ started: true });
    } catch (error) {
      return cutoverFailure(reply, error);
    }
  });

  // GET /api/sync/cutover/:id/items — the preview's decisions, one list at a time
  fastify.get<{
    Params: { id: string };
    Querystring: { kind?: CutoverItemKind; provider?: BackupProvider; limit?: number; offset?: number };
  }>('/cutover/:id/items', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ITEM_KINDS },
          provider: { type: 'string', enum: PROVIDERS },
          limit: { type: 'integer', minimum: 1, maximum: 500 },
          offset: { type: 'integer', minimum: 0 }
        }
      }
    }
  }, async (request) => {
    const result = listCutoverItems(request.user!.id, request.params.id, request.query);
    return {
      ...result,
      items: result.items.map(item => ({ ...item, choices: RESOLUTIONS[item.kind] ?? [], effective: effectiveResolution(item) }))
    };
  });

  // GET /api/sync/backups — every backup, plus whether each provider may be
  // deleted from right now (the deletion gate)
  fastify.get('/backups', async (request) => {
    const userId = request.user!.id;
    return {
      backups: listBackups(userId),
      gates: Object.fromEntries(PROVIDERS.map(p => [p, checkDeletionGate(userId, p)]))
    };
  });

  // POST /api/sync/backups — start a backup of one provider in the background
  fastify.post<{ Body: { provider: BackupProvider } }>('/backups', {
    config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['provider'],
        properties: { provider: { type: 'string', enum: PROVIDERS } }
      }
    }
  }, async (request, reply) => {
    const userId = request.user!.id;
    try {
      const { id, promise } = startBackup(userId, request.body.provider);
      promise.then(
        m => request.log.info({ backup: m.id, status: m.status, contacts: m.remoteCount }, 'Remote backup finished'),
        err => request.log.error(err, 'Remote backup crashed')
      );
      return reply.status(202).send({ id });
    } catch (error) {
      return reply.status(409).send({ error: error instanceof Error ? error.message : 'Backup already running' });
    }
  });

  // POST /api/sync/backups/:id/restore — put a backup back into its address book (sync must be off)
  fastify.post<{ Params: { id: string }; Body: { mode?: RestoreMode } }>('/backups/:id/restore', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
    schema: { body: { type: 'object', properties: { mode: { type: 'string', enum: ['missing', 'all'] } } } }
  }, async (request, reply) => {
    try {
      const { promise } = startRestore(request.user!.id, request.params.id, request.body?.mode ?? 'missing');
      promise.then(r => request.log.info({ backup: request.params.id, ...r, errors: r.errors.length }, 'Restore finished'));
      return reply.status(202).send({ started: true });
    } catch (error) {
      return reply.status(error instanceof RestoreError ? 409 : 500).send({ error: error instanceof Error ? error.message : 'Restore failed' });
    }
  });

  // GET /api/sync/backups/:id
  fastify.get<{ Params: { id: string } }>('/backups/:id', async (request, reply) => {
    const backup = getBackup(request.user!.id, request.params.id);
    if (!backup) return reply.status(404).send({ error: 'Backup not found' });
    return backup;
  });

  // POST /api/sync/backups/:id/confirm — the user downloaded it or has their own
  fastify.post<{ Params: { id: string } }>('/backups/:id/confirm', async (request, reply) => {
    try {
      return confirmBackup(request.user!.id, request.params.id);
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Cannot confirm backup' });
    }
  });

  // GET /api/sync/backups/:id/files/:name — download one file of a backup
  fastify.get<{ Params: { id: string; name: string } }>('/backups/:id/files/:name', async (request, reply) => {
    const { id, name } = request.params;
    const filePath = resolveBackupFile(request.user!.id, id, name);
    if (!filePath || !fs.existsSync(filePath)) return reply.status(404).send({ error: 'File not found' });

    const extension = name.slice(name.lastIndexOf('.'));
    const downloadName = name === 'yello.db' ? `yello-${id}.db` : `${id}-${name.replace(/^(icloud|google)-/, '')}`;
    reply.header('Content-Type', CONTENT_TYPES[extension] ?? 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="${downloadName}"`);
    reply.header('Content-Length', fs.statSync(filePath).size);
    return reply.send(fs.createReadStream(filePath));
  });
}
