import type {FastifyInstance} from 'fastify';
import type {Principal} from '../shared/model.ts';
import {SCORMPackageService} from './scorm-package-service.ts';
import {packageLimits} from './scorm-package-reader.ts';
import {DomainError, reject} from './errors.ts';
import {failure} from '@orchard/bridge-contract';
import type {SCORMPlayerService} from './scorm-player-service.ts';

export async function registerSCORMEngine(app: FastifyInstance, packages: SCORMPackageService, enabled: boolean, principal: (req: any) => Principal, runtime?: {player: SCORMPlayerService; contentOrigin: string}) {
  const error = (e: any, reply: any) => {
    const code = e instanceof DomainError ? e.code : 'INTERNAL';
    return reply.code(code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : code === 'STALE_CONTEXT' || code === 'IDEMPOTENCY_CONFLICT' ? 409 : code === 'INTERNAL' ? 500 : 400).send(failure(code, code === 'INTERNAL' ? 'Internal package error' : e.message));
  };
  const guard = async (_req: any, reply: any) => {if (!enabled) return reply.code(403).send(failure('FORBIDDEN', 'SCORM engine is limited to reviewed loopback development fixtures'));};
  app.get('/api/scorm-engine/packages', async (req, reply) => {
    try {
      const q = req.query as any, offset = Number(q.offset ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0) reject('INVALID_ARGUMENT', 'Invalid package page');
      const p = principal(req), data = packages.list(p, q.author === 'true', offset);
      return {...data, items: data.items.map((row: any) => ({...row, playbackSupported: !!runtime && runtime.player.playbackSupported(row.id, row.version, p.tenant)})), importsEnabled: enabled, runtimeEnabled: !!runtime};
    } catch (e) {return error(e, reply);}
  });
  app.get('/api/scorm-engine/jobs/:id', async (req, reply) => {try {return packages.job(principal(req), (req.params as any).id);} catch (e) {return error(e, reply);}});
  app.post('/api/scorm-engine/launch', {preHandler: guard}, async (req, reply) => {
    try {
      if (!runtime) reject('FORBIDDEN', 'SCORM content host is not configured');
      const {token, ...result} = runtime!.player.launch(principal(req), (req as any).session.token_hash, req.body as any);
      return {...result, contentOrigin: runtime!.contentOrigin, url: runtime!.contentOrigin + '/launch/' + token};
    } catch(e) {return error(e, reply);}
  });
  app.get('/api/scorm-engine/player-context', async (req, reply) => {
    try {if (!runtime) reject('FORBIDDEN', 'SCORM content host is not configured'); return runtime!.player.context(principal(req), req.query as any);} catch(e) {return error(e, reply);}
  });
  app.post('/api/scorm-engine/retake', {preHandler: guard}, async (req, reply) => {
    try {if (!runtime) reject('FORBIDDEN', 'SCORM content host is not configured'); return runtime!.player.retake(principal(req), req.body as any);} catch(e) {return error(e, reply);}
  });
  app.get('/api/scorm-engine/launches/:id', async (req, reply) => {
    try {if (!runtime) reject('FORBIDDEN', 'SCORM content host is not configured'); return runtime!.player.status(principal(req), (req.params as any).id, (req as any).session.token_hash);} catch(e) {return error(e, reply);}
  });
  app.post('/api/scorm-engine/launches/:id/close', {preHandler: guard}, async (req, reply) => {
    try {if (!runtime) reject('FORBIDDEN', 'SCORM content host is not configured'); return runtime!.player.close(principal(req), (req.params as any).id, (req as any).session.token_hash);} catch(e) {return error(e, reply);}
  });
  app.post('/api/scorm-engine/review', {preHandler: guard}, async (req, reply) => {try {return packages.review(principal(req), req.body);} catch (e) {return error(e, reply);}});
  app.get('/api/scorm-engine/packages/:id/:version/export', {preHandler: guard}, async (req, reply) => {
    try {
      const a = req.params as any, version = Number(a.version);
      if (!Number.isSafeInteger(version) || version < 1) reject('INVALID_ARGUMENT', 'Exact version required');
      const value = packages.export(principal(req), a.id, version);
      return reply.type('application/zip').header('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(value.filename)).send(value.bytes);
    } catch (e) {return error(e, reply);}
  });
  await app.register(async scoped => {
    scoped.addContentTypeParser('application/zip', {parseAs: 'buffer', bodyLimit: packageLimits.archive}, (_req, body, done) => done(null, body));
    scoped.post('/api/scorm-engine/import', {preHandler: guard, bodyLimit: packageLimits.archive}, async (req, reply) => {
      try {
        const q = req.query as any;
        const result = packages.enqueue(principal(req), {...q, version: Number(q.version), revision: Number(q.revision), confirmed: q.confirmed === 'true'}, req.body as Buffer);
        void packages.run(result.jobId);
        return reply.code(202).send(result);
      } catch (e) {return error(e, reply);}
    });
  });
  app.addHook('onClose', async () => {await packages.drain();});
  if (enabled) {
    const pending = packages.db.prepare("SELECT id FROM scorm_import_jobs WHERE status IN('queued','running')").all() as {id: string}[];
    for (const job of pending) void packages.run(job.id);
  }
}
