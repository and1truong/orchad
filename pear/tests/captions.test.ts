import {test} from "node:test";
import assert from "node:assert/strict";
import {parseCaptions} from "../src/shared/captions.ts";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
const original="WEBVTT\n\nfirst\n00:00.000 --> 00:01.000\nOriginal English caption\n\nsecond\n00:00.500 --> 00:02.000\nOverlapping cues are permitted\n";
function upload(f:ReturnType<typeof fixture>,mime:string,bytes:Buffer,key:string=crypto.randomUUID()){
 return f.service.media.upload(f.service.principal("editor"),{filename:mime==="text/vtt"?"original.vtt":"original.wav",mime,key,
  revision:String(f.service.context("editor","library:demo").revision),confirmed:"true"},bytes);
}
function setup(f:ReturnType<typeof fixture>){
 const wav=Buffer.alloc(12);wav.write("RIFF");wav.write("WAVE",8);
 const media=upload(f,"audio/wav",wav),caption=upload(f,"text/vtt",Buffer.from(original));
 const item={title:"Caption original",summary:"Original source",language:"en",provider:"Original",license:"self-authored",aiProcessingAllowed:true,
  kind:"audio",text:"Original reading",transcript:"Original accessible transcript",assetId:media.id,
  captions:[{assetId:caption.id,language:"en",label:"English original"}]};
 data(f.call("editor","learning_create_content_item",{itemId:"caption-item",item}));
 data(f.call("editor","learning_publish_content_item",{itemId:"caption-item"}));
 return {media,caption,item};
}
test("plain-text WebVTT profile parses BOM/CRLF, Unicode, optional IDs and ordered overlapping cues",()=>{
 const cues=parseCaptions("\uFEFF"+original.replaceAll("\n","\r\n"));
 assert.equal(cues.length,2);assert.equal(cues[1]!.start,500);assert.equal(cues[1]!.end,2000);
 assert.equal(parseCaptions("WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nLuyện nhớ chủ động\n")[0]!.text,"Luyện nhớ chủ động");
});
test("caption parser rejects malformed/unbounded timings, duplicate IDs, markup and unsupported styles/settings",()=>{
 for(const invalid of [
  original.replace("00:01.000","00:00.000"),original.replace("second","first"),
  original.replace("00:00.500","00:00.000").replace("00:00.000 --> 00:01.000","00:01.000 --> 00:02.000"),
  original.replace("Original English caption","<script>bad</script>"),original.replace("00:01.000","00:01.000 align:start"),
  "WEBVTT\n\nSTYLE\n::cue {color:red}\n",original.replace("00:01.000","25:00:00.000"),
  original.replace("Original English caption","x".repeat(1001)),original.replace("00:01.000","00:61.000"),
  original.replace("Original English caption","x\u0000x"),"WEBVTT\n\n",
  "WEBVTT\n\n"+Array.from({length:201},(_,i)=>"00:00.000 --> 00:01.000\ncue "+i).join("\n\n")
 ])assert.throws(()=>parseCaptions(invalid));
});
test("caption uploads preserve signature/quota/authority/CAS and rollback invalid text before storing any bytes",()=>{
 const f=fixture();try{
  const caption=upload(f,"text/vtt",Buffer.from(original),"caption-key");
  assert.equal(upload(f,"text/vtt",Buffer.from(original),"caption-key").id,caption.id);
  const revision=f.service.context("editor","library:demo").revision;
  for(const invalid of [Buffer.from([255]),Buffer.from("not captions"),Buffer.alloc(65537,65)])assert.throws(()=>upload(f,"text/vtt",invalid));
  assert.equal(f.service.context("editor","library:demo").revision,revision);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM assets").get()!.n,1);
  assert.throws(()=>f.service.media.upload(f.service.principal("learner-a"),{filename:"x.vtt",mime:"text/vtt",key:"deny",revision:"0",confirmed:"true"},Buffer.from(original)),/Content author/);
 }finally{f.db.close();}
});
test("published and pinned caption reads enforce tenant/enrollment/prerequisite/version scope and remain human-only identifiers",()=>{
 const f=fixture();try{
  const {caption,item}=setup(f),p=f.service.principal("learner-a");
  assert.equal(f.service.media.read(p,caption.id,{itemId:"caption-item",version:1}).id,caption.id);
  assert.throws(()=>f.service.media.read(p,caption.id,{}),/authorized/);
  assert.throws(()=>f.service.media.read(f.service.principal("outsider"),caption.id,{itemId:"caption-item",version:1}),/denied/);
  const tracked=data(f.call("learner-a","learning_enroll_item",{itemId:"caption-item"}));
  assert.equal(JSON.stringify(data(f.call("learner-a","learning_get_item_enrollment",{itemEnrollmentId:tracked.itemEnrollmentId}))).includes(caption.id),false);
  const course=structuredClone(courses["systems-basics"]);course.lessons[1]={...course.lessons[1],kind:"audio",assetId:item.assetId,transcript:item.transcript,captions:item.captions as any};
  data(f.call("editor","learning_create_course",{courseId:"caption-course",course}));
  data(f.call("editor","learning_publish_course",{courseId:"caption-course"}));
  const e=data(f.call("learner-a","learning_enroll",{courseId:"caption-course"}));
  assert.throws(()=>f.service.media.read(p,caption.id,{enrollmentId:e.enrollmentId,lessonId:"capacity"}),/authorized/);
  data(f.call("learner-a","human_complete_lesson",{enrollmentId:e.enrollmentId,lessonId:"retry"},"human"));
  assert.equal(f.service.media.read(p,caption.id,{enrollmentId:e.enrollmentId,lessonId:"capacity"}).id,caption.id);
  assert.equal(JSON.stringify(data(f.call("learner-a","learning_get_lesson",{enrollmentId:e.enrollmentId,lessonId:"capacity"}))).includes(caption.id),false);
  assert.ok(JSON.stringify(data(f.call("learner-a","learning_get_lesson",{enrollmentId:e.enrollmentId,lessonId:"capacity"},"human"))).includes(caption.id));
  data(f.call("editor","learning_retire_content_item",{itemId:"caption-item"}));
  assert.throws(()=>f.service.media.read(p,caption.id,{itemId:"caption-item",version:1}),/authorized/);
  assert.equal(f.service.media.read(p,caption.id,{itemEnrollmentId:tracked.itemEnrollmentId}).id,caption.id);
  assert.throws(()=>f.service.media.read(f.service.principal("learner-b"),caption.id,{itemEnrollmentId:tracked.itemEnrollmentId}),/authorized/);
 }finally{f.db.close();}
});
test("caption metadata validates kinds, language uniqueness, tenant assets and snapshots reusable source tracks",()=>{
 const f=fixture();try{
  const {item,caption}=setup(f);
  for(const changed of [{...item,kind:"text"},{...item,assetId:undefined},{...item,captions:[...item.captions,...item.captions]},
   {...item,captions:[{...item.captions[0],label:" "}]},{...item,captions:[{...item.captions[0],assetId:item.assetId}]}]){
   assert.equal(f.call("editor","learning_update_content_item",{itemId:"caption-item",item:changed}).ok,false);
  }
  const course=structuredClone(courses["systems-basics"]);course.lessons[0].contentRef={itemId:"caption-item",version:1};
  (course.lessons[0] as any).captions=[{assetId:"caller-forgery",language:"vi",label:"Forged"}];
  data(f.call("editor","learning_create_course",{courseId:"reused-caption",course}));
  data(f.call("editor","learning_publish_course",{courseId:"reused-caption"}));
  const pinned=JSON.parse((f.db.prepare("SELECT content FROM course_versions WHERE course_id='reused-caption' AND version=1").get() as any).content);
  assert.equal(pinned.lessons[0].captions[0].assetId,caption.id);
  const changed=upload(f,"text/vtt",Buffer.from(original.replace("Original English caption","Changed original")));
  data(f.call("editor","learning_update_content_item",{itemId:"caption-item",item:{...item,captions:[{...item.captions[0],assetId:changed.id}]}}));
  data(f.call("editor","learning_publish_content_item",{itemId:"caption-item"}));
  assert.equal(pinned.lessons[0].captions[0].assetId,caption.id);
  assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{f.db.close();}
});

test("caption HTTP returns authorized text/vtt bytes and rejects wrong session epochs, owners and revoked sessions",async()=>{
 const {createApp}=await import("../src/server/app.ts"),f=fixture(),origin="http://127.0.0.1:4314";
 const {app}=await createApp({db:f.db,origin,developmentAuth:true});
 const login=async(id:string)=>{
  const r=await app.inject({method:"POST",url:"/api/login",headers:{host:"127.0.0.1:4314",origin},payload:{username:id,password:id+"-dev"}});
  assert.equal(r.statusCode,200);const body=r.json();
  return {host:"127.0.0.1:4314",origin,cookie:String(r.headers["set-cookie"]).split(";")[0]!,"x-pear-epoch":body.sessionEpoch};
 };
 try{
  const {caption}=setup(f),headers=await login("learner-a"),url="/api/assets/"+caption.id+"?itemId=caption-item&version=1";
  const r=await app.inject({url,headers});assert.equal(r.statusCode,200);assert.match(String(r.headers["content-type"]),/^text\/vtt/);
  assert.equal(r.body,original);assert.match(String(r.headers["content-disposition"]),/attachment/);
  assert.equal((await app.inject({url,headers:{...headers,"x-pear-epoch":"wrong"}})).statusCode,409);
  assert.equal((await app.inject({url:"/api/assets/"+caption.id,headers})).statusCode,403);
  assert.equal((await app.inject({url,headers:await login("outsider")})).statusCode,403);
  f.db.prepare("UPDATE accounts SET auth_version=auth_version+1 WHERE id='learner-a'").run();
  assert.equal((await app.inject({url,headers})).statusCode,401);
 }finally{await app.close();f.db.close();}
});
