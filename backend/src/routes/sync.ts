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

const PROVIDERS: BackupProvider[] = ['icloud', 'google'];

const CONTENT_TYPES: Record<string, string> = {
  '.vcf': 'text/vcard; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.db': 'application/vnd.sqlite3'
};

export default async function syncRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {

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
