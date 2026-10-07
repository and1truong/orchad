import type {FastifyInstance} from "fastify";
import type {Principal} from "../shared/model.ts";
import {XAPIService} from "./xapi.ts";
import {DomainError} from "./errors.ts";
import {parseUniqueJSON} from "../shared/json-unique.ts";
import {failure} from "@orchard/bridge-contract";
export async function registerXAPI(app:FastifyInstance,service:XAPIService,origin:string,enabled:boolean,principal:(req:any)=>Principal){
 const host=new URL(origin).host;
 const error=(e:any,reply:any)=>{const code=e instanceof DomainError?e.code:"INTERNAL";return reply.code(code==="UNAUTHORIZED"?401:code==="FORBIDDEN"?403:code==="NOT_FOUND"?404:code==="IDEMPOTENCY_CONFLICT"?409:code==="INTERNAL"?500:400).send(failure(code,code==="INTERNAL"?"Internal external activity error":e.message));};
 app.get("/api/external-activity",async(req,reply)=>{try{const q=req.query as any,offset=Number(q.offset??0);if(Object.keys(q).some(k=>k!=="offset")||!Number.isSafeInteger(offset)||offset<0)return reply.code(400).send(failure("INVALID_ARGUMENT","Invalid activity page"));return service.learning(principal(req),offset);}catch(e){return error(e,reply);}});
 await app.register(async scoped=>{
  scoped.setErrorHandler((e:any,_req,reply)=>reply.code(e.statusCode===413?413:e.statusCode===400?400:500).send(failure(e.statusCode===400||e.statusCode===413?"INVALID_ARGUMENT":"INTERNAL","Invalid or unavailable xAPI profile request")));
  scoped.removeContentTypeParser("application/json");
  scoped.addContentTypeParser("application/json",{parseAs:"string"},(_req,body,done)=>{try{done(null,parseUniqueJSON(String(body)));}catch{const e:any=Error("Invalid or duplicate xAPI JSON");e.statusCode=400;done(e);}});
  const guard=async(req:any,reply:any)=>{
   if(!enabled)return reply.code(404).send(failure("NOT_FOUND","xAPI profile is not configured"));
   if(req.headers.host!==host)return reply.code(403).send(failure("FORBIDDEN","Host mismatch"));
   reply.header("X-Experience-API-Version","1.0.3").header("Cache-Control","no-store");
   if(req.headers["x-experience-api-version"]!=="1.0.3")return reply.code(400).send(failure("INVALID_ARGUMENT","Only the frozen xAPI 1.0.3 profile is supported"));
   try{service.credentials.authenticate(req.headers.authorization,req.method==="GET"?"xapi.read":"xapi.write");}catch(e){return error(e,reply);}
  };
  scoped.get("/integrations/xapi/1.0.3/about",{preHandler:guard},async()=>({version:["1.0.3"],extensions:{"https://orchad.example/profiles/pear-xapi/1":"Restricted course/account statement profile; not full LRS conformance"}}));
  scoped.get("/integrations/xapi/1.0.3/statements",{preHandler:guard},async(req,reply)=>{try{return service.read(req.headers.authorization,req.query);}catch(e){return error(e,reply);}});
  scoped.post("/integrations/xapi/1.0.3/statements",{preHandler:guard},async(req,reply)=>{try{if(Object.keys(req.query as any).length)return reply.code(400).send(failure("INVALID_ARGUMENT","POST statement query is unsupported"));return service.write(req.headers.authorization,req.body);}catch(e){return error(e,reply);}});
  scoped.put("/integrations/xapi/1.0.3/statements",{preHandler:guard},async(req,reply)=>{
   try{const q=req.query as any,b=req.body as any;if(Object.keys(q).length!==1||typeof q.statementId!=="string"||!b||Array.isArray(b)||b.id!==undefined&&(typeof b.id!=="string"||b.id.toLowerCase()!==q.statementId.toLowerCase()))return reply.code(400).send(failure("INVALID_ARGUMENT","Matching single statementId required"));service.write(req.headers.authorization,{...b,id:q.statementId});return reply.code(204).send();}
   catch(e){return error(e,reply);}
  });
 });
}
