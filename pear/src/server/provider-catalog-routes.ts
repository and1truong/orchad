import type {FastifyInstance} from "fastify";
import {ProviderCatalogService} from "./provider-catalog.ts";
import {DomainError} from "./errors.ts";
import {parseUniqueJSON} from "../shared/json-unique.ts";
import {failure} from "@orchard/bridge-contract";
export async function registerProviderCatalog(app:FastifyInstance,service:ProviderCatalogService,origin:string,enabled:boolean){
 const error=(e:any,reply:any)=>{const c=e instanceof DomainError?e.code:"INTERNAL";return reply.code(c==="UNAUTHORIZED"?401:c==="FORBIDDEN"?403:c==="NOT_FOUND"?404:c==="STALE_CONTEXT"||c==="IDEMPOTENCY_CONFLICT"?409:c==="INTERNAL"?500:400).send(failure(c,c==="INTERNAL"?"Provider catalog unavailable":e.message));};
 await app.register(async scoped=>{
  scoped.setErrorHandler((e:any,_req,reply)=>reply.code(e.statusCode===413?413:e.statusCode===400?400:500).send(failure(e.statusCode===400||e.statusCode===413?"INVALID_ARGUMENT":"INTERNAL","Invalid or unavailable provider profile request")));
  scoped.removeContentTypeParser("application/json");
  scoped.addContentTypeParser("application/json",{parseAs:"string"},(_req,body,done)=>{try{done(null,parseUniqueJSON(String(body)));}catch{const e:any=Error("Invalid or duplicate provider JSON");e.statusCode=400;done(e);}});
  const guard=async(req:any,reply:any)=>{
   if(!enabled)return reply.code(404).send(failure("NOT_FOUND","Provider catalog profile is not configured"));
   if(req.headers.host!==new URL(origin).host)return reply.code(403).send(failure("FORBIDDEN","Host mismatch"));
   reply.header("Cache-Control","no-store");
  };
  scoped.post("/integrations/catalog/1/:provider/events",{preHandler:guard,bodyLimit:16384},async(req,reply)=>{try{if(Object.keys(req.query as any).length)return reply.code(400).send(failure("INVALID_ARGUMENT","Event query unsupported"));return service.write(req.headers.authorization,(req.params as any).provider,req.body);}catch(e){return error(e,reply);}});
  scoped.get("/integrations/catalog/1/:provider/events",{preHandler:guard},async(req,reply)=>{try{const q=req.query as any;if(Object.keys(q).some(k=>k!=="offset")||q.offset!==undefined&&!/^\d+$/.test(q.offset))return reply.code(400).send(failure("INVALID_ARGUMENT","Invalid reconciliation page"));return service.reconcile(req.headers.authorization,(req.params as any).provider,Number(q.offset??0));}catch(e){return error(e,reply);}});
 });
}
