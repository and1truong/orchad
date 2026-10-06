import type {FastifyInstance} from "fastify";
import type {Principal} from "../shared/model.ts";
import {OutboxService} from "./outbox.ts";
import {DomainError,reject} from "./errors.ts";
import {failure} from "@orchard/bridge-contract";
export function registerOutbox(app:FastifyInstance,service:OutboxService,origin:string,principal:(req:any)=>Principal){
 const host=new URL(origin).host;
 function error(e:any,reply:any){const code=e instanceof DomainError?e.code:"INTERNAL",status=code==="UNAUTHORIZED"?401:code==="FORBIDDEN"?403:code==="STALE_CONTEXT"?409:code==="INTERNAL"?500:400;return reply.code(status).send(failure(code,code==="INTERNAL"?"Internal integration error":e.message));}
 const offset=(value:any)=>{const n=Number(value??0);if(!Number.isSafeInteger(n)||n<0)reject("INVALID_ARGUMENT","Invalid offset");return n;};
 app.get("/api/webhooks",async(req,reply)=>{try{return service.settings(principal(req),offset((req.query as any).offset));}catch(e){return error(e,reply);}});
 app.post("/api/webhooks",async(req,reply)=>{try{return service.mutate(principal(req),req.body);}catch(e){return error(e,reply);}});
 app.get("/api/webhooks/:id/deliveries",async(req,reply)=>{try{return service.deliveries(principal(req),(req.params as any).id,offset((req.query as any).offset));}catch(e){return error(e,reply);}});
 app.get("/integrations/v1/events",async(req,reply)=>{
  try{if(req.headers.host!==host)reject("FORBIDDEN","Host mismatch");return service.events(req.headers.authorization,req.query);}catch(e){return error(e,reply);}
 });
}
