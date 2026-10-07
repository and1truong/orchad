import Fastify from 'fastify';

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

export function createSCORMContentHost(options: {pearOrigin: string; contentOrigin: string}) {
  const origins = contentHostOrigins(options.pearOrigin, options.contentOrigin);
  const app = Fastify({logger: false, bodyLimit: 128 * 1024, trustProxy: false});
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer')
      .header('X-Content-Type-Options', 'nosniff').header('Cross-Origin-Resource-Policy', 'same-origin')
      .header('Content-Security-Policy', "default-src 'none'; frame-ancestors " + origins.pearOrigin);
    if (req.headers.host !== origins.contentHost) return reply.code(403).send({error: 'Unrecognized content host'});
    if (req.headers.cookie || req.headers.authorization) return reply.code(403).send({error: 'Content host does not accept application credentials'});
  });
  app.get('/health', async () => ({service: 'pear-scorm-content', runtimeEnabled: false}));
  app.setNotFoundHandler(async (_req, reply) => reply.code(403).send({error: 'SCORM package runtime is not configured'}));
  return app;
}
