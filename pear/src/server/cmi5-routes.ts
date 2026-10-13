import Fastify, {type FastifyInstance} from 'fastify';
import {failure} from '@orchard/bridge-contract';
import type {Principal} from '../shared/model.ts';
import {parseUniqueJSON} from '../shared/json-unique.ts';
import {CMI5Service} from './cmi5.ts';
import {contentHostOrigins} from './scorm-content-host.ts';
import {packageLimits} from './scorm-package-reader.ts';
import {DomainError, reject} from './errors.ts';

function error(e:any,reply:any) {
  const code=e instanceof DomainError?e.code:'INTERNAL';
  return reply.code(code==='UNAUTHORIZED'?401:code==='FORBIDDEN'?403:code==='NOT_FOUND'?404:code==='STALE_CONTEXT'||code==='IDEMPOTENCY_CONFLICT'?409:code==='INTERNAL'?500:400).send(failure(code,code==='INTERNAL'?'cmi5 request failed':e.message));
}
export async function registerCMI5(app:FastifyInstance,service:CMI5Service,enabled:boolean,principal:(req:any)=>Principal) {
  const guard=async(_req:any,reply:any)=>{if(!enabled)return reply.code(403).send(failure('FORBIDDEN','cmi5 requires reviewed loopback content configuration'));};
  app.get('/api/cmi5/packages',async(req,reply)=>{try{const q=req.query as any;return {...service.list(principal(req),q.author==='true',Number(q.offset??0)),runtimeEnabled:enabled};}catch(e){return error(e,reply);}});
  app.get('/api/cmi5/packages/:id/activities',async(req,reply)=>{try{const q=req.query as any;return service.activities(principal(req),(req.params as any).id,Number(q.offset??0),q.author==='true');}catch(e){return error(e,reply);}});
  app.get('/api/cmi5/registrations',async(req,reply)=>{try{const q=req.query as any;return service.registrations(principal(req),q.admin==='true',Number(q.offset??0));}catch(e){return error(e,reply);}});
  app.get('/api/cmi5/learning-context',async(req,reply)=>{try{const {offset,...binding}=req.query as any;return {...service.learningContext(principal(req),binding,Number(offset??0)),runtimeEnabled:enabled};}catch(e){return error(e,reply);}});
  app.get('/api/cmi5/registrations/:id',async(req,reply)=>{try{return service.report(principal(req),(req.params as any).id,(req.query as any).admin==='true');}catch(e){return error(e,reply);}});
  app.get('/api/cmi5/registrations/:id/statements',async(req,reply)=>{try{const {admin,...q}=req.query as any;return service.evidence(principal(req),(req.params as any).id,q,admin==='true');}catch(e){return error(e,reply);}});
  app.post('/api/cmi5/review',{preHandler:guard},async(req,reply)=>{try{return service.review(principal(req),req.body);}catch(e){return error(e,reply);}});
  app.post('/api/cmi5/waive',{preHandler:guard},async(req,reply)=>{try{return service.waive(principal(req),req.body);}catch(e){return error(e,reply);}});
  app.post('/api/cmi5/launch',{preHandler:guard},async(req,reply)=>{try{return service.launch(principal(req),(req as any).session.token_hash,req.body);}catch(e){return error(e,reply);}});
  app.post('/api/cmi5/sessions/:id/close',{preHandler:guard},async(req,reply)=>{try{return service.close(principal(req),(req.params as any).id);}catch(e){return error(e,reply);}});
  app.get('/api/cmi5/packages/:id/export',async(req,reply)=>{try{const v=service.export(principal(req),(req.params as any).id);return reply.type(v.mime).header('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(v.filename)).send(v.bytes);}catch(e){return error(e,reply);}});
  await app.register(async scoped=>{
    scoped.addContentTypeParser('application/zip',{parseAs:'buffer',bodyLimit:packageLimits.archive},(_req,body,done)=>done(null,body));
    scoped.addContentTypeParser(['application/xml','text/xml'],{parseAs:'buffer',bodyLimit:packageLimits.manifest},(_req,body,done)=>done(null,body));
    scoped.post('/api/cmi5/import',{preHandler:guard,bodyLimit:packageLimits.archive},async(req,reply)=>{try{const q=req.query as any,mime=req.headers['content-type']?.split(';')[0];if(typeof q.filename !== 'string' || (q.filename.endsWith('.xml') ? !['application/xml','text/xml'].includes(mime??'') : mime !== 'application/zip'))reject('INVALID_ARGUMENT','Import media type must match ZIP/XML filename');return reply.code(201).send(await service.import(principal(req),{...q,confirmed:q.confirmed==='true',revision:Number(q.revision)},req.body as Buffer));}catch(e){return error(e,reply);}});
  });
}

export function createCMI5ContentHost(service:CMI5Service) {
  const origins=contentHostOrigins(service.pearOrigin,service.contentOrigin);
  if([origins.pearOrigin,origins.contentOrigin].some(o=>!['localhost','127.0.0.1','[::1]'].includes(new URL(o).hostname)))throw Error('cmi5 executable content requires reviewed loopback hosts');
  const app=Fastify({logger:false,bodyLimit:64*1024,trustProxy:false});
  app.setErrorHandler((e:any,_req,reply)=>{
    if(e.statusCode===400||e.statusCode===413)return reply.code(e.statusCode).send(failure('INVALID_ARGUMENT','Invalid cmi5 body'));
    return error(e,reply);
  });
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json',{parseAs:'string'},(req,body,done)=>{
    try{done(null,!String(body)&&(req.url.startsWith('/cmi5/fetch/')||req.method==='DELETE')?undefined:parseUniqueJSON(String(body)));}catch{const e:any=Error('Invalid JSON');e.statusCode=400;done(e);}
  });
  app.addContentTypeParser('application/x-www-form-urlencoded',{parseAs:'string'},(_req,body,done)=>done(null,body));
  app.addHook('onRequest',async(req,reply)=>{
    reply.header('Cache-Control','no-store').header('Referrer-Policy','no-referrer').header('X-Content-Type-Options','nosniff')
      .header('Cross-Origin-Resource-Policy','same-origin').header('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()')
      .header('Content-Security-Policy',"default-src 'none'; frame-ancestors "+origins.pearOrigin);
    if(req.headers.host!==origins.contentHost)reject('FORBIDDEN','Content Host mismatch');
    if(req.headers.cookie)reject('FORBIDDEN','Content host does not accept browser cookies');
    const origin=req.headers.origin,fetchRoute=/^\/cmi5\/fetch\/([^/?]+)$/.exec(req.url),xapi=req.url.startsWith('/cmi5/xapi/');
    if(req.method==='OPTIONS') {
      if(!xapi&&!fetchRoute)reject('FORBIDDEN','Only AU runtime requests allow preflight');
      const allowed=fetchRoute?service.fetchOrigin(fetchRoute[1]!)===origin:origin===origins.contentOrigin||service.remoteOrigins.includes(origin??'');
      const method=req.headers['access-control-request-method'],requested=String(req.headers['access-control-request-headers']??'').toLowerCase().split(',').map(h=>h.trim()).filter(Boolean);
      if(!origin||!allowed||!(fetchRoute?['POST']:['GET','HEAD','POST','PUT','DELETE']).includes(method??'')||requested.some(h=>!['authorization','content-type','x-experience-api-version','if-match','if-none-match'].includes(h)))reject('FORBIDDEN','Unreviewed cmi5 preflight');
      return reply.header('Access-Control-Allow-Origin',origin).header('Vary','Origin').header('Access-Control-Allow-Methods',fetchRoute?'POST':'GET, HEAD, POST, PUT, DELETE').header('Access-Control-Allow-Headers','Authorization, Content-Type, X-Experience-API-Version, If-Match, If-None-Match').code(204).send();
    }
    let allowedOrigin=origins.contentOrigin;
    if(xapi)allowedOrigin=service.sessionOrigin(service.authenticate(req.headers.authorization,req.url.startsWith('/cmi5/xapi/statements')));
    if(fetchRoute)allowedOrigin=service.fetchOrigin(fetchRoute[1]!)??origins.contentOrigin;
    if(origin!==undefined&&origin!==allowedOrigin)reject('FORBIDDEN','AU Origin does not match this session');
    if(!xapi&&!fetchRoute&&!['GET','HEAD'].includes(req.method)&&origin!==origins.contentOrigin)reject('FORBIDDEN','Same-origin AU request required');
    if(origin!==undefined&&(xapi||fetchRoute))reply.header('Access-Control-Allow-Origin',origin).header('Vary','Origin').header('Access-Control-Expose-Headers','ETag, Last-Modified, X-Experience-API-Version, X-Experience-API-Consistent-Through');
    if(!req.url.startsWith('/cmi5/xapi/')&&req.headers.authorization)reject('FORBIDDEN','Application credentials are not accepted');
  });
  app.addHook('preHandler',async(req,reply)=>{
    if(!req.url.startsWith('/cmi5/xapi/'))return;
    reply.header('X-Experience-API-Version','1.0.3');
    if(req.url.startsWith('/cmi5/xapi/statements'))reply.header('X-Experience-API-Consistent-Through',new Date().toISOString());
    if(req.headers['x-experience-api-version']!=='1.0.3')reject('INVALID_ARGUMENT','xAPI 1.0.3 header required');
    service.authenticate(req.headers.authorization,req.url.startsWith('/cmi5/xapi/statements'));
  });
  app.get('/health',async()=>({service:'pear-cmi5-content',profile:'pear-cmi5-quartz/2'}));
  app.options('/cmi5/xapi/*',async()=>{throw Error('Preflight guard did not complete');});
  app.options('/cmi5/fetch/:token',async()=>{throw Error('Preflight guard did not complete');});
  app.post('/cmi5/fetch/:token',async(req)=>service.fetch((req.params as any).token));
  app.get('/cmi5/content/:sessionId/files/*',async(req,reply)=>{
    const a=req.params as any, file=service.resource(a.sessionId,a['*']);
    reply.header('Content-Security-Policy',"sandbox allow-scripts allow-same-origin; default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; worker-src 'none'; frame-src 'self'; frame-ancestors "+origins.pearOrigin+' '+origins.contentOrigin+"; base-uri 'self'; form-action 'none'");
    return reply.type(file.mime).send(file.bytes);
  });
  app.get('/cmi5/xapi/about',async()=>({version:['1.0.3'],extensions:{'https://orchad.example/profiles/pear-cmi5-quartz/2':'cmi5 local and reviewed remote AU runtime; full LRS/cmi5 conformance and production remain open'}}));
  app.get('/cmi5/xapi/statements',async(req,reply)=>{const result=service.read(req.headers.authorization,req.query,req.headers['accept-language']);if(result.stored)reply.header('Last-Modified',new Date(result.stored).toUTCString());return result;});
  app.post('/cmi5/xapi/statements',async(req)=>{if(Object.keys(req.query as any).length)reject('INVALID_ARGUMENT','POST query unsupported');return service.write(req.headers.authorization,req.body);});
  app.put('/cmi5/xapi/statements',async(req,reply)=>{
    const q=req.query as any,b=req.body as any;
    if(Object.keys(q).length!==1||typeof q.statementId!=='string'||!b||Array.isArray(b)||b.id!==undefined&&(typeof b.id!=='string'||b.id.toLowerCase()!==q.statementId.toLowerCase()))reject('INVALID_ARGUMENT','Matching statementId required');
    service.write(req.headers.authorization,{...b,id:q.statementId});return reply.code(204).send();
  });
  registerCMI5Documents(app,service);
  app.get('/cmi5/xapi/agents',async(req)=>service.agent(req.headers.authorization,req.query));
  app.get('/cmi5/xapi/activities',async(req)=>service.activity(req.headers.authorization,req.query));
  return app;
}

function registerCMI5Documents(app:FastifyInstance,service:CMI5Service) {
  // Registration is awaited by Fastify readiness, including the inherited
  // Host/Origin/Basic/version hooks from the cookie-free listener.
  app.register(async documents=>{
    documents.removeContentTypeParser('application/json');documents.removeContentTypeParser('text/plain');
    documents.addContentTypeParser('*',{parseAs:'buffer',bodyLimit:32*1024},(_req,body,done)=>done(null,body));
    for(const [path,kind] of [['activities/state','state'],['agents/profile','agent'],['activities/profile','activity']] as const) {
      for(const method of ['GET','HEAD','PUT','POST','DELETE'] as const)documents.route({method,url:'/cmi5/xapi/'+path,exposeHeadRoute:false,handler:async(req,reply)=>{
        const v=kind==='state'?service.state(req.headers.authorization,req.query,req.method,req.body,req.headers):service.documentProfile(req.headers.authorization,req.query,kind,req.method,req.body,req.headers);
        if(v.contentType)reply.type(v.contentType);if(v.etag)reply.header('ETag',v.etag);if(v.updated)reply.header('Last-Modified',new Date(v.updated).toUTCString());
        if(v.preconditionFailed)return reply.code(412).send({error:'Document precondition failed'});
        if(v.preconditionRequired)return reply.code(409).send({error:'Read the current document and provide its ETag in If-Match'});
        if(v.notModified)return reply.code(304).send();
        if(req.method==='HEAD')return reply.code(200).send();
        if(req.method==='GET')return reply.type(v.contentType??'application/json').send(v.raw??v.body);
        return reply.code(204).send();
      }});
    }
  });
}
