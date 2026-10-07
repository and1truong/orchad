import type {FastifyInstance} from "fastify";
import type {Principal} from "../shared/model.ts";
import {SCORMService} from "./scorm.ts";
import {renderSCORM} from "./scorm-render.ts";
import {DomainError,reject} from "./errors.ts";
import {failure} from "@orchard/bridge-contract";
export async function registerSCORM(app:FastifyInstance,service:SCORMService,origin:string,enabled:boolean,principal:(req:any)=>Principal){
 const error=(e:any,reply:any)=>{const code=e instanceof DomainError?e.code:"INTERNAL";return reply.code(code==="UNAUTHORIZED"?401:code==="FORBIDDEN"?403:code==="NOT_FOUND"?404:code==="STALE_CONTEXT"||code==="IDEMPOTENCY_CONFLICT"?409:code==="INTERNAL"?500:400).send(failure(code,code==="INTERNAL"?"Internal package error":e.message));};
 const offset=(req:any)=>{const n=Number(req.query.offset??0);if(!Number.isSafeInteger(n)||n<0)reject("INVALID_ARGUMENT","Invalid package page");return n;};
 const guard=async(_req:any,reply:any)=>{if(!enabled)return reply.code(403).send(failure("FORBIDDEN","Production package scanning/storage/runtime adapter is not configured"));};
 app.get("/api/scorm/packages",async(req,reply)=>{try{return {...service.list(principal(req),(req.query as any).author==="true",offset(req)),runtimeEnabled:enabled};}catch(e){return error(e,reply);}});
 app.get("/api/scorm/records",async(req,reply)=>{try{return service.records(principal(req),offset(req));}catch(e){return error(e,reply);}});
 app.post("/api/scorm/review",{preHandler:guard},async(req,reply)=>{try{return service.review(principal(req),req.body);}catch(e){return error(e,reply);}});
 app.get("/api/scorm/packages/:id/export",{preHandler:guard},async(req,reply)=>{try{const value=service.export(principal(req),(req.params as any).id);return reply.type("application/zip").header("Content-Disposition","attachment; filename*=UTF-8''"+encodeURIComponent(value.filename)).send(value.bytes);}catch(e){return error(e,reply);}});
 app.post("/api/scorm/start",{preHandler:guard},async(req,reply)=>{try{return service.start(principal(req),(req as any).session.token_hash,req.body);}catch(e){return error(e,reply);}});
 app.post("/api/scorm/commit",{preHandler:guard},async(req,reply)=>{try{return service.commit(principal(req),(req as any).session.token_hash,req.body);}catch(e){return error(e,reply);}});
 app.get("/api/scorm/launch/:id",{preHandler:guard},async(req,reply)=>{try{const q=req.query as any;if(Object.keys(q).join(",")!=="ticket")reject("FORBIDDEN","Bound launch ticket required");const value=service.launch(principal(req),(req as any).session.token_hash,(req.params as any).id,q.ticket);return reply.type("text/html; charset=utf-8").send(renderSCORM(value,origin));}catch(e){return error(e,reply);}});
 await app.register(async scoped=>{
  scoped.addContentTypeParser("application/zip",{parseAs:"buffer",bodyLimit:8*1024*1024},(_req,body,done)=>done(null,body));
  scoped.post("/api/scorm/import",{preHandler:guard,bodyLimit:8*1024*1024},async(req,reply)=>{
   try{const q=req.query as any;if(!Buffer.isBuffer(req.body)||req.headers["content-type"]!=="application/zip"||Object.keys(q).some(k=>!["filename","language","confirmed","key","revision"].includes(k)))reject("INVALID_ARGUMENT","Reviewed binary ZIP upload required");
    return service.import(principal(req),{...q,revision:Number(q.revision),confirmed:q.confirmed==="true"},req.body);
   }catch(e){return error(e,reply);}
  });
 });
}
