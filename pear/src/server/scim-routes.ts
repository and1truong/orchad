import type {FastifyInstance} from "fastify";
import type {DatabaseSync} from "node:sqlite";
import {SCIMService,SCIMError,userURN,groupURN} from "./scim.ts";
import {DomainError} from "./errors.ts";
import {failure} from "@orchard/bridge-contract";
const messages="urn:ietf:params:scim:api:messages:2.0:",core="urn:ietf:params:scim:schemas:core:2.0:";
export function registerSCIM(app:FastifyInstance,db:DatabaseSync,origin:string,enabled:boolean,principal:(req:any)=>any){
 const service=new SCIMService(db,origin),host=new URL(origin).host;
 function error(e:any,reply:any){
  const status=e instanceof SCIMError?e.status:e instanceof DomainError?e.code==="UNAUTHORIZED"?401:e.code==="FORBIDDEN"?403:400:500;
  return reply.code(status).type("application/scim+json").send({schemas:[messages+"Error"],status:String(status),detail:status===500?"Internal provisioning error":e.message,...(e instanceof SCIMError&&e.scimType?{scimType:e.scimType}:{})});
 }
 app.addContentTypeParser("application/scim+json",{parseAs:"string"},(_req,body,done)=>{try{done(null,JSON.parse(String(body)));}catch{const e:any=Error("Invalid SCIM JSON");e.statusCode=400;done(e);}});
 app.get("/api/provisioning-clients",async(req,reply)=>{
  try{const p=principal(req);const query=req.query as any;const offset=Number(query.offset??0);if(!Number.isSafeInteger(offset)||offset<0)throw new SCIMError(400,"Invalid offset");
   return {...service.credentials.list(p,offset),enabled};
  }catch(e){return reply.code(e instanceof DomainError&&e.code==="FORBIDDEN"?403:400).send(failure(e instanceof DomainError?e.code:"INVALID_ARGUMENT",(e as Error).message));}
 });
 app.post("/api/provisioning-clients",async(req,reply)=>{
  try{if(!enabled)throw new SCIMError(403,"Provisioning is not configured");return service.credentials.mutate(principal(req),req.body);}
  catch(e){return reply.code(e instanceof SCIMError?e.status:e instanceof DomainError?e.code==="FORBIDDEN"?403:e.code==="UNAUTHORIZED"?401:e.code==="STALE_CONTEXT"?409:400:500).send(failure(e instanceof DomainError?e.code:e instanceof SCIMError?"FORBIDDEN":"INTERNAL",e instanceof DomainError||e instanceof SCIMError?(e as Error).message:"Internal credential error"));}
 });
 const guard=async(req:any,reply:any)=>{
  try{if(!enabled)throw new SCIMError(404,"Provisioning is not configured");if(req.headers.host!==host)throw new SCIMError(403,"Host mismatch");
   // Cookies never authenticate this machine API; each operation rechecks the bearer inside its transaction.
   service.credentials.authenticate(req.headers.authorization,req.method==="GET"?"provisioning.read":"provisioning.write");
  }catch(e){return error(e,reply);}
 };
 const schemas=[
  {schemas:[core+"Schema"],id:userURN,name:"User",description:"Pear reviewed core User profile",attributes:[
   {name:"userName",type:"string",multiValued:false,required:true,caseExact:false,mutability:"readWrite",returned:"default",uniqueness:"server"},
   {name:"displayName",type:"string",multiValued:false,required:false,mutability:"readWrite",returned:"default",uniqueness:"none"},
   {name:"active",type:"boolean",multiValued:false,required:false,mutability:"readWrite",returned:"default",uniqueness:"none"},
   {name:"preferredLanguage",type:"string",multiValued:false,required:false,canonicalValues:["en","vi"],mutability:"readWrite",returned:"default",uniqueness:"none"},
   {name:"externalId",type:"string",multiValued:false,required:false,caseExact:true,mutability:"readWrite",returned:"default",uniqueness:"none"}]},
  {schemas:[core+"Schema"],id:groupURN,name:"Group",description:"Pear managed static groups",attributes:[
   {name:"displayName",type:"string",multiValued:false,required:true,mutability:"readWrite",returned:"default",uniqueness:"none"},
   {name:"members",type:"complex",multiValued:true,required:false,mutability:"readWrite",returned:"default",uniqueness:"none",subAttributes:[{name:"value",type:"string",multiValued:false,required:true,caseExact:true,mutability:"immutable",returned:"default",uniqueness:"none"}]},
   {name:"externalId",type:"string",multiValued:false,required:false,mutability:"readWrite",returned:"default",uniqueness:"none"}]}
 ];
 const resourceTypes=[{schemas:[core+"ResourceType"],id:"User",name:"User",endpoint:"/Users",schema:userURN},{schemas:[core+"ResourceType"],id:"Group",name:"Group",endpoint:"/Groups",schema:groupURN}];
 const list=(Resources:any[])=>({schemas:[messages+"ListResponse"],totalResults:Resources.length,startIndex:1,itemsPerPage:Resources.length,Resources});
 app.get("/scim/v2/ServiceProviderConfig",{preHandler:guard},async(_req,reply)=>reply.type("application/scim+json").send({
  schemas:[core+"ServiceProviderConfig"],documentationUri:origin+"/scim/v2/Schemas",patch:{supported:true},bulk:{supported:false,maxOperations:0,maxPayloadSize:0},filter:{supported:true,maxResults:20},changePassword:{supported:false},sort:{supported:false},etag:{supported:true},
  authenticationSchemes:[{type:"oauthbearertoken",name:"Reviewed scoped bearer",description:"Human-issued, expiring, client-owned provisioning credentials",primary:true}]
 }));
 for(const [path,values] of [["Schemas",schemas],["ResourceTypes",resourceTypes]] as const){
  app.get("/scim/v2/"+path,{preHandler:guard},async(_req,reply)=>reply.type("application/scim+json").send(list([...values])));
  app.get("/scim/v2/"+path+"/:id",{preHandler:guard},async(req,reply)=>{const value=values.find(v=>v.id===(req.params as any).id);return value?reply.type("application/scim+json").send(value):error(new SCIMError(404,"Metadata unavailable"),reply);});
 }
 for(const kind of ["Users","Groups"]){
  app.get("/scim/v2/"+kind,{preHandler:guard},async(req,reply)=>{try{return reply.type("application/scim+json").send(service.read(req.headers.authorization,kind,undefined,req.query));}catch(e){return error(e,reply);}});
  app.get("/scim/v2/"+kind+"/:id",{preHandler:guard},async(req,reply)=>{try{const value=service.read(req.headers.authorization,kind,(req.params as any).id);return reply.header("ETag",value.meta.version).type("application/scim+json").send(value);}catch(e){return error(e,reply);}});
  for(const method of ["POST","PUT","PATCH","DELETE"] as const)app.route({method,url:"/scim/v2/"+kind+(method==="POST"?"":"/:id"),preHandler:guard,handler:async(req,reply)=>{
   try{const result=service.mutate(req.headers.authorization,kind,(req.params as any).id,method,req.body,req.headers["if-match"],req.headers["idempotency-key"] as string|undefined);
    if(result.body)reply.header("ETag",result.body.meta.version).header("Location",result.body.meta.location);
    return reply.code(result.status).type("application/scim+json").send(result.body??undefined);
   }catch(e){return error(e,reply);}
  }});
 }
}
