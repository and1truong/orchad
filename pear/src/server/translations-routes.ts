import type {FastifyInstance} from "fastify";
import type {Principal} from "../shared/model.ts";
import {TranslationService} from "./translations.ts";
import {DomainError,reject} from "./errors.ts";
import {failure} from "@orchard/bridge-contract";
export function registerTranslations(app:FastifyInstance,service:TranslationService,principal:(req:any)=>Principal){
 function error(e:any,reply:any){const code=e instanceof DomainError?e.code:"INTERNAL";return reply.code(code==="UNAUTHORIZED"?401:code==="FORBIDDEN"?403:code==="NOT_FOUND"?404:code==="STALE_CONTEXT"?409:code==="INTERNAL"?500:400).send(failure(code,code==="INTERNAL"?"Internal translation error":e.message));}
 app.get("/api/translations",async(req,reply)=>{try{const offset=Number((req.query as any).offset??0);if(!Number.isSafeInteger(offset)||offset<0)reject("INVALID_ARGUMENT","Invalid offset");return service.settings(principal(req),offset);}catch(e){return error(e,reply);}});
 app.post("/api/translations",async(req,reply)=>{try{return service.mutate(principal(req),req.body);}catch(e){return error(e,reply);}});
}
