import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {scormFixture,zip,manifest,sco} from "./scorm-fixture.ts";
import {crc32,inspectSCORM,readSCORMZip,parseManifest} from "../src/server/scorm-archive.ts";
import {emptySCORMState,validSCORMState,scormTime} from "../src/shared/scorm-state.ts";
import {createApp} from "../src/server/app.ts";
import {data} from "./helpers.ts";
const state=()=>({...emptySCORMState(),"cmi.core.lesson_status":"completed","cmi.core.lesson_location":"step-2","cmi.suspend_data":"private-resume","cmi.core.score.raw":"90","cmi.core.session_time":"0000:01:00.00","cmi.core.exit":"suspend"});
test("bounded original stored/deflated ZIP validates CRC, manifest profile and exact import/export bytes",()=>{
 assert.equal(crc32(Buffer.from("123456789")),0xcbf43926);
 for(const method of [0,8]){
  const bytes=zip([{name:"imsmanifest.xml",data:Buffer.from(manifest),method},{name:"index.html",data:Buffer.from(sco),method}]),inspected=inspectSCORM(bytes);
  assert.equal(inspected.profile,"pear-scorm12-inline/1");assert.equal(inspected.title,"Original inline SCORM fixture");assert.equal(inspected.html,sco);assert.equal(readSCORMZip(bytes).size,2);
 }
 const s=scormFixture();try{assert.deepEqual(s.scorm.export(s.admin,s.imported.id).bytes,s.bytes);assert.equal(s.scorm.export(s.admin,s.imported.id).sha256,inspectSCORM(s.bytes).sha256);}finally{s.db.close();}
});
test("archives reject traversal, duplicate entries, encryption, symlinks, descriptor/ZIP64 forms, overlap/CRC corruption and expansion bombs",()=>{
 for(const entries of [
  [{name:"../imsmanifest.xml",data:Buffer.from(manifest)},{name:"index.html",data:Buffer.from(sco)}],
  [{name:"imsmanifest.xml",data:Buffer.from(manifest)},{name:"imsmanifest.xml",data:Buffer.from(manifest)}],
  [{name:"imsmanifest.xml",data:Buffer.from(manifest)},{name:"index.html",data:Buffer.from(sco),method:8,trailing:Buffer.from("hidden")}],
  [{name:"imsmanifest.xml",data:Buffer.from(manifest)},{name:"index.html",data:Buffer.from(sco),flags:1}],
  [{name:"imsmanifest.xml",data:Buffer.from(manifest)},{name:"index.html",data:Buffer.from(sco),flags:8}],
  [{name:"imsmanifest.xml",data:Buffer.from(manifest)},{name:"index.html",data:Buffer.from(sco),external:((0o120777<<16)>>>0)}],
  [{name:"imsmanifest.xml",data:Buffer.from(manifest)},{name:"index.html",data:Buffer.from("A".repeat(1024*1024)),method:8}]
 ])assert.throws(()=>readSCORMZip(zip(entries)));
 const original=zip(),badCRC=Buffer.from(original);badCRC[30+"imsmanifest.xml".length]^=1;assert.throws(()=>readSCORMZip(badCRC),/CRC/);
 const overlap=Buffer.from(original),directory=overlap.readUInt32LE(overlap.length-6);overlap.writeUInt32LE(1,directory+42);assert.throws(()=>readSCORMZip(overlap));
 assert.throws(()=>readSCORMZip(Buffer.concat([Buffer.from("prefix"),original])));assert.throws(()=>readSCORMZip(Buffer.alloc(8*1024*1024+1)));
 const zip64=Buffer.from(original);zip64.writeUInt32LE(0xffffffff,zip64.length-6);assert.throws(()=>readSCORMZip(zip64));
});
test("manifest profile rejects entities, unsafe external resources, unsupported version/multiple SCOs and malformed XML rather than guessing",()=>{
 for(const xml of [manifest.replace("1.2</schemaversion>","2004 4th Edition</schemaversion>"),manifest.replace('href="index.html"','href="https://evil.example/sco"'),manifest.replace("<metadata>","<!DOCTYPE manifest><metadata>"),manifest.replace("Original SCO","Original &amp; SCO"),manifest.replace('identifier="sco-item"','identifier="sco-item" identifier="duplicate"'),manifest.replace("</resources>","<resource identifier=\"extra\"/></resources>"),manifest.replace("</organizations>","</invalid>")]){
  assert.throws(()=>inspectSCORM(zip([{name:"imsmanifest.xml",data:Buffer.from(xml)},{name:"index.html",data:Buffer.from(sco)}])));
 }
 assert.throws(()=>parseManifest(Buffer.from([0xff,0xfe])));assert.throws(()=>parseManifest(Buffer.from("<manifest>".repeat(9)+"</manifest>".repeat(9))));
});
test("imports quarantine executable bytes; review requires content role/hash/CAS/exact retry and audit rollback preserves history",()=>{
 const s=scormFixture();try{
  assert.equal(s.scorm.list(s.learner).items.length,0);assert.throws(()=>s.start(),/not accepting|Quarantined/);
  for(const id of ["manager","assessor","learner-a","outsider"])assert.throws(()=>s.scorm.review(s.service.principal(id),{action:"publish"}),/administrator/);
  assert.throws(()=>s.publish({sha256:"wrong"}),/hash/);assert.throws(()=>s.publish({revision:999}),/context changed/);
  const revision=s.service.context("admin","library:demo").revision;
  s.db.exec("CREATE TRIGGER reject_scorm_audit BEFORE INSERT ON audit WHEN NEW.tool LIKE 'human_scorm_%' BEGIN SELECT RAISE(ABORT,'package audit failed'); END");
  assert.throws(()=>s.publish(),/audit failed/);assert.equal(s.scorm.list(s.admin,true).items[0].state,"quarantined");assert.equal(s.service.context("admin","library:demo").revision,revision);
  s.db.exec("DROP TRIGGER reject_scorm_audit");const args={action:"publish",packageId:s.imported.id,sha256:s.imported.sha256,confirmed:true,reason:"Reviewed",key:"publish-once",revision},result=s.scorm.review(s.admin,args);
  assert.deepEqual(s.scorm.review(s.admin,{...args,revision:999}),result);assert.throws(()=>s.scorm.review(s.admin,{...args,reason:"changed"}),/changed/);
  assert.equal(s.scorm.list(s.learner).items[0].state,"published");
  assert.throws(()=>s.scorm.export(s.learner,s.imported.id),/administrator/);
  assert.throws(()=>s.scorm.list(s.service.principal("outsider"),true),/administrator/);
 }finally{s.db.close();}
});
test("launch leases bind own session/record/nonce and expiring ticket without exposing runtime body or ticket in model catalogs",()=>{
 const s=scormFixture();try{
  s.publish();const launch=s.start(),ticket=new URL(launch.url!,"http://127.0.0.1:4314").searchParams.get("ticket")!;
  assert.equal(s.scorm.launch(s.learner,"fixture-session",launch.launchId,ticket).entry,"ab-initio");
  assert.throws(()=>s.scorm.launch(s.learner,"other-session",launch.launchId,ticket),/launch/);
  assert.throws(()=>s.scorm.launch(s.service.principal("learner-b"),"fixture-session",launch.launchId,ticket),/Own/);
  assert.throws(()=>s.scorm.launch(s.learner,"fixture-session",launch.launchId,"wrong"),/ticket/);
  s.db.prepare("UPDATE scorm_launches SET ticket_expires=0 WHERE id=?").run(launch.launchId);assert.throws(()=>s.scorm.launch(s.learner,"fixture-session",launch.launchId,ticket),/ticket/);
  const model=data(s.call("learner-a","learning_search_packages"));for(const value of ["html","nonce","url","bytes","ticket","private-resume"])assert.equal(JSON.stringify(model).includes('"'+value+'"'),false);
  const descriptor=s.service.description("learner-a","learning:demo:learner-a");assert.equal(descriptor.tools.some(t=>/scorm_commit|scorm_start|scorm_import/.test(t.name)),false);
 }finally{s.db.close();}
});
test("package runtime state uses CAS/exact retry, bounded cumulative reported time and private suspend data with zero official learning effects",()=>{
 const s=scormFixture();try{
  s.publish();const launch=s.start(),args={launchId:launch.launchId,recordId:launch.recordId,nonce:launch.nonce,recordRevision:0,state:state(),key:"commit-once"};
  const result=s.scorm.commit(s.learner,"fixture-session",args);assert.equal(result.reportedSeconds,60);assert.equal(result.recordRevision,1);assert.equal(result.officialLearningChanged,false);
  assert.deepEqual(s.scorm.commit(s.learner,"fixture-session",args),result);
  assert.throws(()=>s.scorm.commit(s.learner,"fixture-session",{...args,state:{...args.state,"cmi.core.score.raw":"91"}}),/changed/);
  assert.throws(()=>s.scorm.commit(s.learner,"fixture-session",{...args,key:"stale-key"}),/state changed/);
  const second=s.scorm.commit(s.learner,"fixture-session",{...args,key:"same-time",recordRevision:1});assert.equal(second.reportedSeconds,60);
  assert.throws(()=>s.scorm.commit(s.learner,"fixture-session",{...args,key:"backwards",recordRevision:2,state:{...state(),"cmi.core.session_time":"0000:00:30.00"}}),/backwards/);
  const model=data(s.call("learner-a","learning_get_my_package_records"));assert.equal(model.items[0].reportedStatus,"completed");assert.equal(JSON.stringify(model).includes("private-resume"),false);assert.equal(JSON.stringify(model).includes("step-2"),false);
  for(const table of ["enrollments","attempts","certificates","study_totals"])assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM "+table).get()!.n,0);
  assert.equal(s.scorm.records(s.service.principal("learner-b")).items.length,0);
 }finally{s.db.close();}
});
test("live account revocation and new launch rotation block previous commit retry before dedup; restart resumes private persisted state",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-scorm-")),path=join(dir,"package.sqlite");let s=scormFixture(path);
 try{
  s.publish();const launch=s.start(),args={launchId:launch.launchId,recordId:launch.recordId,nonce:launch.nonce,recordRevision:0,state:state(),key:"durable-commit"};s.scorm.commit(s.learner,"fixture-session",args);
  const packageId=s.imported.id,recordId=launch.recordId;s.db.close();s=scormFixture(path);
  const reopened=s.scorm.start(s.learner,"new-session",{packageId,confirmed:true,key:"resume",revision:s.service.context("learner-a","learning:demo:learner-a").revision}),ticket=new URL(reopened.url!,"http://127.0.0.1:4314").searchParams.get("ticket")!,value=s.scorm.launch(s.learner,"new-session",reopened.launchId,ticket);
  assert.equal(value.entry,"resume");assert.equal(value.state["cmi.suspend_data"],"private-resume");assert.equal(value.state["cmi.core.session_time"],"0000:00:00.00");assert.equal(value.recordId,recordId);
  assert.throws(()=>s.scorm.commit(s.learner,"fixture-session",args),/launch/);
  const next={launchId:reopened.launchId,nonce:reopened.nonce,recordId,recordRevision:1,state:{...state(),"cmi.core.session_time":"0000:00:45.00"},key:"new-session-commit"};
  assert.equal(s.scorm.commit(s.learner,"new-session",next).reportedSeconds,105);
  s.db.prepare("UPDATE accounts SET active=0,auth_version=auth_version+1 WHERE id='learner-a'").run();assert.throws(()=>s.scorm.commit(s.learner,"new-session",next),/Active/);
  assert.deepEqual(s.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{s.db.close();rmSync(dir,{recursive:true,force:true});}
});
test("retirement prevents new launches while retaining own reviewed immutable package history and uncertain start cannot replay tickets",()=>{
 const s=scormFixture();try{
  s.publish();const revision=s.service.context("learner-a","learning:demo:learner-a").revision,launch=s.start("learner-a","fixture-session",{key:"launch-once",revision});
  const recovered=s.start("learner-a","fixture-session",{key:"launch-once",revision:999});assert.equal(recovered.recordId,launch.recordId);assert.equal(recovered.url,null);assert.equal(recovered.nonce,null);assert.equal(recovered.launchUnavailable,true);
  s.scorm.review(s.admin,{action:"retire",packageId:s.imported.id,sha256:s.imported.sha256,confirmed:true,reason:"Reviewed retirement",key:"retire",revision:s.service.context("admin","library:demo").revision});
  assert.equal(s.scorm.list(s.learner).items.length,0);assert.throws(()=>s.start("learner-b"),/not accepting/);
  const resumed=s.start();assert.equal(resumed.recordId,launch.recordId);assert.equal(s.scorm.records(s.learner).items[0].packageState,"retired");
 }finally{s.db.close();}
});
test("state profile rejects arbitrary data, score/time values and audit failure rolls runtime commit/revisions back",()=>{
 const s=scormFixture();try{
  assert.equal(validSCORMState(state()),true);assert.equal(scormTime("0169:00:00.00"),null);
  for(const input of [{...state(),arbitrary:"admin"},{...state(),"cmi.core.score.raw":"999"},{...state(),"cmi.core.session_time":"bad"},{...state(),"cmi.core.lesson_status":"mastered"},{...state(),"cmi.suspend_data":"x".repeat(4097)}])assert.equal(validSCORMState(input),false);
  s.publish();const launch=s.start(),before=s.service.context("learner-a","learning:demo:learner-a").revision;
  s.db.exec("CREATE TRIGGER reject_commit BEFORE INSERT ON audit WHEN NEW.tool='human_scorm_commit' BEGIN SELECT RAISE(ABORT,'runtime audit failed'); END");
  assert.throws(()=>s.scorm.commit(s.learner,"fixture-session",{launchId:launch.launchId,nonce:launch.nonce,recordId:launch.recordId,recordRevision:0,state:state(),key:"rollback-runtime"}),/audit failed/);
  assert.equal(s.scorm.records(s.learner).items[0].revision,0);assert.equal(s.scorm.records(s.learner).items[0].reportedSeconds,0);assert.equal(s.service.context("learner-a","learning:demo:learner-a").revision,before);
 }finally{s.db.close();}
});
test("real HTTP package import/review/export/launch binds Host, CSRF, epoch, ticket and production gate with opaque CSP",async()=>{
 const s=scormFixture();let app:any;try{
  const origin="http://127.0.0.1:4314",base={host:"127.0.0.1:4314",origin};({app}=await createApp({db:s.db,origin,developmentAuth:true}));
  async function login(id:string){const r=await app.inject({method:"POST",url:"/api/login",headers:base,payload:{username:id,password:id+"-dev"}});assert.equal(r.statusCode,200);return {...base,cookie:String(r.headers["set-cookie"]).split(";")[0]!,"x-csrf-token":r.json().csrf,"x-pear-epoch":r.json().sessionEpoch};}
  const admin=await login("admin"),query=new URLSearchParams({filename:"http-original.zip",language:"en",confirmed:"true",key:"http-import",revision:String(s.service.context("admin","library:demo").revision)}),url="/api/scorm/import?"+query;
  assert.equal((await app.inject({method:"POST",url,headers:{...admin,"content-type":"application/zip","x-csrf-token":"bad"},payload:s.bytes})).statusCode,403);
  const imported=await app.inject({method:"POST",url,headers:{...admin,"content-type":"application/zip"},payload:s.bytes});assert.equal(imported.statusCode,200);assert.equal(imported.json().state,"quarantined");
  const reviewed=await app.inject({method:"POST",url:"/api/scorm/review",headers:admin,payload:{action:"publish",packageId:imported.json().id,sha256:imported.json().sha256,confirmed:true,reason:"Reviewed actual HTTP original",key:"http-publish",revision:s.service.context("admin","library:demo").revision}});assert.equal(reviewed.statusCode,200);
  const exported=await app.inject({url:"/api/scorm/packages/"+imported.json().id+"/export",headers:admin});assert.deepEqual(exported.rawPayload,s.bytes);
  const learner=await login("learner-a"),started=await app.inject({method:"POST",url:"/api/scorm/start",headers:learner,payload:{packageId:imported.json().id,confirmed:true,key:"http-launch",revision:s.service.context("learner-a","learning:demo:learner-a").revision}});assert.equal(started.statusCode,200);
  const launch=await app.inject({url:started.json().url,headers:{...base,cookie:learner.cookie}});assert.equal(launch.statusCode,200);assert.match(String(launch.headers["content-security-policy"]),/sandbox allow-scripts/);assert.match(String(launch.headers["content-security-policy"]),/connect-src 'none'/);assert.match(launch.body,/LMSInitialize/);
  assert.equal((await app.inject({url:started.json().url,headers:await login("learner-b")})).statusCode,403);
  await app.close();({app}=await createApp({db:s.db,origin}));
  assert.equal((await app.inject({method:"POST",url,headers:{...admin,"content-type":"application/zip"},payload:s.bytes})).statusCode,403);
 }finally{if(app)await app.close();s.db.close();}
});
