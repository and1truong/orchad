import {ContentAccess} from "./content-access.ts";
import type {DatabaseSync} from "node:sqlite";
import type {Principal} from "../shared/model.ts";
import {IntegrationCredentials,tokenHash} from "./integration-credentials.ts";
import {reject,boundedPage} from "./errors.ts";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const verbs=["experienced","completed","passed","failed"] as const;
function object(value:any,keys:string[],required:string[]=[]){
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||required.some(k=>!Object.hasOwn(value,k)))reject("INVALID_ARGUMENT","Unsupported/missing xAPI profile attribute");
 return value;
}
function stable(v:any):string{return Array.isArray(v)?"["+v.map(stable).join(",")+"]":v&&typeof v==="object"?"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}":JSON.stringify(v);}
export class XAPIService{
 readonly credentials:IntegrationCredentials;
 constructor(readonly db:DatabaseSync,readonly origin:string){this.credentials=new IntegrationCredentials(db);}
 private validate(client:any,input:any){
  const s=object(input,["id","actor","verb","object","result","context","timestamp"],["id","actor","verb","object","context","timestamp"]);
  if(typeof s.id!=="string"||!uuid.test(s.id)||Buffer.byteLength(JSON.stringify(s))>8*1024)reject("INVALID_ARGUMENT","Explicit UUID and ≤8 KiB statement required");
  object(s.actor,["objectType","account"],["account"]);if(s.actor.objectType!==undefined&&s.actor.objectType!=="Agent")reject("INVALID_ARGUMENT","Only account Agent actors supported");
  object(s.actor.account,["homePage","name"],["homePage","name"]);
  if(s.actor.account.homePage!==this.origin+"/scim/v2"||typeof s.actor.account.name!=="string")reject("FORBIDDEN","Reviewed managed opaque actor required");
  const actor=this.db.prepare("SELECT u.*,a.active,a.role FROM scim_users u JOIN accounts a ON a.id=u.user_id AND a.tenant=u.tenant WHERE u.id=? AND u.tenant=? AND u.client_id=? AND u.deleted=0").get(s.actor.account.name,client.tenant,client.id) as any;
  if(!actor||!actor.active||actor.role!=="learner")reject("FORBIDDEN","Active same-client managed learner required");
  object(s.verb,["id"],["id"]);const verb=verbs.find(v=>s.verb.id==="http://adlnet.gov/expapi/verbs/"+v);if(!verb)reject("INVALID_ARGUMENT","Unsupported xAPI verb");
  object(s.object,["objectType","id"],["id"]);if(s.object.objectType!==undefined&&s.object.objectType!=="Activity")reject("INVALID_ARGUMENT","Only course Activity objects supported");
  if(typeof s.object.id!=="string"||!s.object.id.startsWith(this.origin+"/content/course/"))reject("FORBIDDEN","Authorized Pear course activity required");
  const match=/^([A-Za-z0-9_-]{1,64})\?version=([1-9]\d{0,5})$/.exec(s.object.id.slice((this.origin+"/content/course/").length));
  if(!match)reject("INVALID_ARGUMENT","Use exact versioned course Activity IRI");const courseId=match![1]!,version=Number(match![2]);
  const source=this.db.prepare("SELECT c.state,v.content FROM courses c JOIN course_versions v ON v.course_id=c.id WHERE c.id=? AND c.tenant=? AND v.version=?").get(courseId,client.tenant,version) as any;
  const enrolled=this.db.prepare("SELECT 1 FROM enrollments WHERE course_id=? AND tenant=? AND learner=? AND version=?").get(courseId,client.tenant,actor.user_id,version);
  if(!source||source.state!=="published"&&!enrolled)reject("FORBIDDEN","Authorized published or enrolled pinned course required");
  const learner=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1").get(actor.user_id,client.tenant) as unknown as Principal;
  new ContentAccess(this.db).requireVisible(learner,"course",courseId,JSON.parse(source.content));
  if(!enrolled)new ContentAccess(this.db).current(learner,"course",courseId);
  object(s.context,["registration"],["registration"]);if(typeof s.context.registration!=="string"||!uuid.test(s.context.registration))reject("INVALID_ARGUMENT","Explicit registration UUID required");
  if(typeof s.timestamp!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(s.timestamp)||!Number.isFinite(Date.parse(s.timestamp))||Date.parse(s.timestamp)>Date.now()+300000||Date.parse(s.timestamp)<0)reject("INVALID_ARGUMENT","Use valid UTC profile timestamp, at most five minutes ahead");
  const timestamp=new Date(s.timestamp).toISOString();if(timestamp!==s.timestamp&&timestamp.replace(".000Z","Z")!==s.timestamp)reject("INVALID_ARGUMENT","Invalid UTC calendar timestamp");
  if(s.result!==undefined){
   object(s.result,["completion","success","score","duration"]);
   for(const key of ["completion","success"])if(s.result[key]!==undefined&&typeof s.result[key]!=="boolean")reject("INVALID_ARGUMENT","Boolean result field required");
   if(s.result.score!==undefined){
    object(s.result.score,["scaled","raw","min","max"]);
    if(!Object.keys(s.result.score).length)reject("INVALID_ARGUMENT","Nonempty score required");
    for(const value of Object.values(s.result.score))if(typeof value!=="number"||!Number.isFinite(value))reject("INVALID_ARGUMENT","Finite score required");
    const score=s.result.score;
    if(score.scaled!==undefined&&(score.scaled< -1||score.scaled>1)||score.min!==undefined&&score.max!==undefined&&score.min>=score.max||score.raw!==undefined&&(score.min!==undefined&&score.raw<score.min||score.max!==undefined&&score.raw>score.max))reject("INVALID_ARGUMENT","Score bounds invalid");
   }
   if(s.result.duration!==undefined&&!(typeof s.result.duration==="string"&&/^PT(?=\d)(?:\d{1,3}H)?(?:\d{1,3}M)?(?:\d{1,3}(?:\.\d{1,3})?S)?$/.test(s.result.duration)))reject("INVALID_ARGUMENT","Only bounded PT hours/minutes/seconds durations supported");
  }
  if(verb==="completed"&&s.result?.completion!==true||verb==="passed"&&s.result?.success!==true||verb==="failed"&&s.result?.success!==false)reject("INVALID_ARGUMENT","Verb and reported result must agree");
  return {statement:{...s,id:s.id.toLowerCase(),context:{registration:s.context.registration.toLowerCase()}},actor,courseId,version,timestamp};
 }
 write(header:string|undefined,body:any){
  this.db.exec("BEGIN IMMEDIATE");
  try{
   const {principal,client}=this.credentials.authenticate(header,"xapi.write"),batch=Array.isArray(body)?body:[body];
   if(!batch.length||batch.length>5||Buffer.byteLength(JSON.stringify(batch))>32*1024)reject("INVALID_ARGUMENT","Supply 1–5 bounded statements");
   const validated=batch.map(s=>this.validate(client,s)),ids:string[]=[],changed=new Set<string>();
   for(const v of validated){
    const id=v.statement.id,hash=tokenHash(stable(v.statement)),old=this.db.prepare("SELECT * FROM xapi_statements WHERE id=?").get(id) as any;
    if(old){
     if(old.client_id!==client.id||old.tenant!==client.tenant)reject("FORBIDDEN","Statement ID unavailable");
     if(old.payload_hash!==hash)reject("IDEMPOTENCY_CONFLICT","Statement ID reused with changed payload");
     ids.push(id);continue;
    }
    if(Number((this.db.prepare("SELECT COUNT(*) AS n FROM xapi_statements WHERE client_id=?").get(client.id) as any).n)>=5000)reject("INVALID_ARGUMENT","Statement history quota reached");
    changed.add(v.actor.user_id);
    const stored=new Date().toISOString();
    this.db.prepare("INSERT INTO xapi_statements(id,tenant,client_id,user_id,course_id,version,registration,timestamp,stored,payload_hash,statement) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id,client.tenant,client.id,v.actor.user_id,v.courseId,v.version,v.statement.context.registration,v.timestamp,stored,hash,JSON.stringify(v.statement));
    this.db.prepare("INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)").run(client.tenant,principal.id,"library:"+client.tenant,"xapi_statement",JSON.stringify({clientId:client.id,statementId:id,managedActorId:v.actor.id,courseId:v.courseId,version:v.version}),stored);
    ids.push(id);
   }
   for(const user of changed)this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run("learning:"+client.tenant+":"+user);
   if(changed.size)this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run("library:"+client.tenant);
   this.db.exec("COMMIT");return ids;
  }catch(e){this.db.exec("ROLLBACK");throw e;}
 }
 private statement(row:any){return {...JSON.parse(row.statement),stored:row.stored,authority:{objectType:"Agent",account:{homePage:this.origin+"/integrations",name:row.client_id}},version:"1.0.3"};}
 read(header:string|undefined,query:any={}){
  const {client}=this.credentials.authenticate(header,"xapi.read");
  if(Object.keys(query).some(k=>!["statementId","registration","after","limit"].includes(k)))reject("INVALID_ARGUMENT","Unsupported xAPI profile query");
  if(query.statementId!==undefined){
   if(typeof query.statementId!=="string"||!uuid.test(query.statementId)||Object.keys(query).length!==1)reject("INVALID_ARGUMENT","Use a single statementId UUID query");
   const row=this.db.prepare("SELECT * FROM xapi_statements WHERE id=? AND tenant=? AND client_id=?").get(query.statementId.toLowerCase(),client.tenant,client.id);if(!row)reject("NOT_FOUND","Authorized statement unavailable");return this.statement(row);
  }
  const after=Number(query.after??0),limit=Number(query.limit??20);
  if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>20||query.registration!==undefined&&(typeof query.registration!=="string"||!uuid.test(query.registration)))reject("INVALID_ARGUMENT","Invalid profile cursor/registration");
  const rows=this.db.prepare("SELECT * FROM xapi_statements WHERE tenant=? AND client_id=? AND sequence>? AND (? IS NULL OR registration=?) ORDER BY sequence LIMIT ?").all(client.tenant,client.id,after,query.registration?.toLowerCase()??null,query.registration?.toLowerCase()??null,limit+1) as any[];
  const page=boundedPage(rows.map(r=>({sequence:r.sequence,statement:this.statement(r)})),0,limit),last=page.items.at(-1)?.sequence??after;
  return {statements:page.items.map(r=>r.statement),more:page.items.length<rows.length?"/integrations/xapi/1.0.3/statements?after="+last+"&limit="+limit+(query.registration?"&registration="+query.registration.toLowerCase():""):""};
 }
 learning(p:Principal,offset=0,limit=20){
  const live=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1").get(p.id,p.tenant) as any;
  if(!live||live.auth_version!==p.auth_version)reject("UNAUTHORIZED","Active learner required");
  const rows=this.db.prepare("SELECT * FROM xapi_statements WHERE tenant=? AND user_id=? ORDER BY timestamp,id").all(p.tenant,p.id) as any[],groups=new Map<string,any>();
  for(const row of rows){
   const key=row.course_id+":"+row.version+":"+row.registration,statement=JSON.parse(row.statement),old=groups.get(key)??{courseId:row.course_id,version:row.version,registration:row.registration,reportedCompletion:null,reportedSuccess:null,reportedScore:null,reportedDuration:null,statementCount:0};
   const result=statement.result??{};
   for(const [field,target] of [["completion","reportedCompletion"],["success","reportedSuccess"],["score","reportedScore"],["duration","reportedDuration"]])if(Object.hasOwn(result,field))old[target!]=result[field!];
   Object.assign(old,{lastStatementId:row.id,lastTimestamp:row.timestamp,statementCount:old.statementCount+1});groups.set(key,old);
  }
  return {...boundedPage([...groups.values()].sort((a,b)=>a.courseId.localeCompare(b.courseId)||a.registration.localeCompare(b.registration)),offset,limit),provenance:"External provider-reported activity; not Pear official completion, assessment score, observed timer or award credit",officialLearningChanged:false};
 }
}
