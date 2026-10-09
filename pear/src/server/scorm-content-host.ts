import Fastify from 'fastify';
import {randomBytes} from 'node:crypto';
import type {SCORMPlayerService} from './scorm-player-service.ts';
import {DomainError} from './errors.ts';
import {scorm2004CheckpointLimit, scorm2004CheckpointMaxBytes} from '../shared/scorm2004-runtime.ts';

export function contentHostOrigins(pearOrigin: string, contentOrigin: string) {
  const pear = new URL(pearOrigin), content = new URL(contentOrigin);
  for (const url of [pear, content]) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Canonical HTTP(S) origin required');
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Remote content requires HTTPS');
  }
  // Ports alone do not isolate cookies; use distinct cookie hostnames, too.
  if (pear.hostname === content.hostname) throw new Error('SCORM content requires a separate hostname from Pear');
  return {pearOrigin: pear.origin, contentOrigin: content.origin, contentHost: content.host};
}

export function createSCORMContentHost(options: {pearOrigin: string; contentOrigin: string; player?: SCORMPlayerService; runtimeBundle?: Buffer}) {
  const origins = contentHostOrigins(options.pearOrigin, options.contentOrigin);
  if (options.player && (!options.runtimeBundle?.length || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(origins.contentOrigin).hostname) || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(origins.pearOrigin).hostname))) throw Error('Executable SCORM content requires a built runtime and loopback fixture hosts');
  const app = Fastify({logger: false, bodyLimit: 544 * 1024, trustProxy: false});
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer')
      .header('X-Content-Type-Options', 'nosniff').header('Cross-Origin-Resource-Policy', 'same-origin')
      .header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
      .header('Content-Security-Policy', "default-src 'none'; frame-ancestors " + origins.pearOrigin);
    if (req.headers.host !== origins.contentHost) return reply.code(403).send({error: 'Unrecognized content host'});
    if (req.headers.cookie || req.headers.authorization) return reply.code(403).send({error: 'Content host does not accept application credentials'});
  });
  app.addHook('onSend', async (_req, reply, payload) => {
    const location = reply.getHeader('Location');
    if (reply.statusCode >= 300 && reply.statusCode < 400 && location !== undefined) {
      let allowed = false;
      try {const target = new URL(String(location), origins.contentOrigin); allowed = target.origin === origins.contentOrigin && !target.username && !target.password;} catch {}
      if (!allowed) {
        reply.code(403).removeHeader('Location').type('application/json');
        return JSON.stringify({error: 'Cross-origin content redirect denied'});
      }
    }
    return payload;
  });
  app.get('/health', async () => ({service: 'pear-scorm-content', runtimeEnabled: !!options.player}));
  if (options.player && options.runtimeBundle) {
    const player = options.player;
    app.setErrorHandler((error, _req, reply) => {
      if (error instanceof Error && 'statusCode' in error && error.statusCode === 413) return reply.code(413).send({error: 'INVALID_ARGUMENT'});
      const code = error instanceof DomainError ? error.code : 'INTERNAL';
      reply.code(code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : code === 'STALE_CONTEXT' || code === 'IDEMPOTENCY_CONFLICT' ? 409 : code === 'INVALID_ARGUMENT' ? 400 : 500).send({error: code});
    });
    app.get('/runtime.js', async (_req, reply) => reply.type('text/javascript; charset=utf-8').send(options.runtimeBundle));
    app.get('/launch/:token', async (req, reply) => {
      const token = (req.params as any).token, bootstrap = player.bootstrap(token), endpoint = '/launch/' + token;
      const match = bootstrap.href.match(/^([^?#]*)([?#].*)?$/)!;
      let suffix = match[2] ?? '';
      if (bootstrap.parameters) {const param = bootstrap.parameters.replace(/^[?&]/, ''); const hash = suffix.indexOf('#'), fragment = hash >= 0 ? suffix.slice(hash) : ''; const query = hash >= 0 ? suffix.slice(0, hash) : suffix; suffix = query + (query.includes('?') ? '&' : '?') + param + fragment;}
      const config = {...bootstrap, pearOrigin: origins.pearOrigin, endpoint, href: endpoint + '/files/' + match[1]!.split('/').map(encodeURIComponent).join('/') + suffix};
      const nonce = randomBytes(24).toString('base64url');
      reply.header('Content-Security-Policy', "sandbox allow-scripts allow-same-origin; default-src 'none'; script-src 'self' 'nonce-" + nonce + "'; style-src 'unsafe-inline'; connect-src 'self'; worker-src 'none'; frame-src 'self'; frame-ancestors " + origins.pearOrigin + "; base-uri 'none'; form-action 'none'");
      return reply.type('text/html; charset=utf-8').send('<!doctype html><html><head><meta charset="utf-8"><title>SCORM content player</title></head><body><p id="scorm-status" role="status"></p><button id="scorm-retry" hidden>Retry package checkpoint</button><button id="scorm-asset-continue" hidden>Continue content</button><button id="scorm-asset-end" hidden>End content session</button><iframe id="scorm-sco" title="SCORM SCO" sandbox="allow-scripts' + (bootstrap.kind === 'asset' ? '' : ' allow-same-origin') + '" style="width:100%;height:80vh;border:0"></iframe><script type="application/json" id="scorm-bootstrap" nonce="' + nonce + '">' + JSON.stringify(config).replace(/</g, '\\u003c') + '</script><script nonce="' + nonce + '" src="/runtime.js"></script></body></html>');
    });
    app.get('/launch/:token/files/*', async (req, reply) => {
      const a = req.params as any, value = player.resource(a.token, a['*']);
      if (value.kind === 'asset') reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
      reply.header('Content-Security-Policy', "sandbox allow-scripts" + (value.kind === 'asset' ? '' : ' allow-same-origin') + "; default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; worker-src 'none'; frame-src 'self'; frame-ancestors " + origins.pearOrigin + ' ' + origins.contentOrigin + "; base-uri 'self'; form-action 'none'");
      reply.header('Accept-Ranges', 'bytes');
      if (req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range), length = value.bytes.length;
        let start = 0, end = length - 1;
        if (match) {
          if (!match[1]) {const suffix = Number(match[2]); start = Math.max(0, length - suffix); if (!Number.isSafeInteger(suffix) || suffix <= 0) start = length;}
          else {start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end);}
        }
        if (!match || !match[1] && !match[2] || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= length) return reply.code(416).header('Content-Range', 'bytes */' + length).send();
        return reply.code(206).header('Content-Range', `bytes ${start}-${end}/${length}`).type(value.mime).send(value.bytes.subarray(start, end + 1));
      }
      return reply.type(value.mime).send(value.bytes);
    });
    app.post('/launch/:token/advance', async (req, reply) => {
      if (req.headers.origin !== origins.contentOrigin || req.headers['content-type']?.split(';')[0] !== 'application/json') return reply.code(403).send({error: 'Content-origin JSON required'});
      return player.advanceAsset((req.params as any).token, req.body);
    });
    app.post('/launch/:token/checkpoint', {bodyLimit: scorm2004CheckpointMaxBytes + 32 * 1024}, async (req, reply) => {
      if (req.headers.origin !== origins.contentOrigin || req.headers['content-type']?.split(';')[0] !== 'application/json') return reply.code(403).send({error: 'Content-origin JSON required'});
      const body = req.body as any, limit = scorm2004CheckpointLimit(body?.state);
      if (Buffer.byteLength(JSON.stringify(body)) > limit + 32 * 1024 || Buffer.byteLength(JSON.stringify({state: body?.state, sharedData: body?.sharedData, interactionWrites: body?.interactionWrites})) > limit) return reply.code(413).send({error: 'INVALID_ARGUMENT'});
      return player.checkpoint((req.params as any).token, req.body);
    });
  }
  app.setNotFoundHandler(async (_req, reply) => reply.code(403).send({error: 'SCORM package runtime is not configured'}));
  return app;
}
