import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {TelemetryService} from "../src/server/telemetry.ts";
import {createApp} from "../src/server/app.ts";
import {freshReport} from "../src/shared/reports.ts";
const enrollment=(f:ReturnType<typeof fixture>,user="learner-a")=>data(f.call(user,"learning_enroll",{courseId:"learning-vi"})).enrollmentId;
test("study timer credits only bounded server intervals and cannot alter learning, score, certificate or personal revision",()=>{
  const f=fixture();let now=Date.parse("2026-01-01T00:00:00Z");const t=new TelemetryService(f.db,()=>now);
  try {
    const id=enrollment(f),p=f.service.principal("learner-a"),before=JSON.stringify(f.db.prepare("SELECT * FROM enrollments").all());
    const revision=f.service.context(p.id).revision;
    let s=t.act(p,"session-a",{action:"start",kind:"course",targetId:id});
    assert.equal(s.totalSeconds,0);now+=15000;
    s=t.act(p,"session-a",{action:"pulse",kind:"course",targetId:id,token:s.token});
    assert.equal(s.totalSeconds,15);now+=31000;
    s=t.act(p,"session-a",{action:"pulse",kind:"course",targetId:id,token:s.token});
    assert.equal(s.totalSeconds,15);now-=1000;
    s=t.act(p,"session-a",{action:"pulse",kind:"course",targetId:id,token:s.token});
    assert.equal(s.totalSeconds,15);now+=10000;
    const stopped=t.act(p,"session-a",{action:"stop",kind:"course",targetId:id,token:s.token});
    assert.equal(stopped.totalSeconds,24);assert.equal(stopped.active,false);
    assert.throws(()=>t.act(p,"session-a",{action:"stop",kind:"course",targetId:id,token:s.token}),/lease changed/);
    assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM enrollments").all()),before);
    assert.equal(f.service.context(p.id).revision,revision);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM attempts").get()!.n,0);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM certificates").get()!.n,0);
    const row=data(f.call(p.id,"learning_get_transcript")).items[0];
    assert.equal(row.observedSeconds,24);assert.ok(row.estimatedMinutes>0);assert.equal(row.score,null);assert.equal(row.progress,0);
    const spec={...freshReport(),columns:["learnerId","estimatedMinutes","observedSeconds"] as any};
    assert.equal(data(f.call("manager","learning_report_preview",{spec})).items[0].observedSeconds,24);
    f.db.exec("UPDATE accounts SET manager_id=NULL WHERE id='learner-a'");
    assert.equal(data(f.call("manager","learning_report_preview",{spec})).total,0);
    const exported=data(f.call("admin","learning_export_report",{spec,rows:"filtered",columns:"visible"}));
    assert.ok(exported.csv.includes("24"));
  }finally{f.db.close();}
});
test("one lease per learner prevents overlapping tab totals, wrong session/owner/tenant and revoked authority fail closed",()=>{
  const f=fixture();let now=100000;const t=new TelemetryService(f.db,()=>now);
  try {
    const id=enrollment(f),p=f.service.principal("learner-a");
    const first=t.act(p,"one",{action:"start",kind:"course",targetId:id});
    now+=15000;const second=t.act(p,"two",{action:"start",kind:"course",targetId:id});
    assert.throws(()=>t.act(p,"one",{action:"pulse",kind:"course",targetId:id,token:first.token}),/lease changed/);
    assert.throws(()=>t.act(p,"one",{action:"pulse",kind:"course",targetId:id,token:second.token}),/lease changed/);
    for(const user of ["learner-b","manager","admin","editor","assessor","outsider"])
      assert.throws(()=>t.get(f.service.principal(user),"course",id),/Own active/);
    now+=15000;assert.equal(t.act(p,"two",{action:"pulse",kind:"course",targetId:id,token:second.token}).totalSeconds,15);
    f.db.exec("UPDATE accounts SET active=0,auth_version=auth_version+1 WHERE id='learner-a'");
    assert.throws(()=>t.act(p,"two",{action:"pulse",kind:"course",targetId:id,token:second.token}),/authority changed/);
    assert.equal(f.db.prepare("SELECT elapsed_ms FROM study_totals").get()!.elapsed_ms,15000);
  }finally{f.db.close();}
});
test("timer audit failure rolls back lease and elapsed totals; cancelled obligations cannot continue",()=>{
  const f=fixture();let now=100000;const t=new TelemetryService(f.db,()=>now);
  try {
    const id=enrollment(f),p=f.service.principal("learner-a");
    f.db.exec("CREATE TRIGGER fail_timer BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
    assert.throws(()=>t.act(p,"s",{action:"start",kind:"course",targetId:id}),/audit unavailable/);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM study_totals").get()!.n,0);
    f.db.exec("DROP TRIGGER fail_timer");
    const s=t.act(p,"s",{action:"start",kind:"course",targetId:id});now+=10000;
    f.db.exec("CREATE TRIGGER fail_timer BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
    assert.throws(()=>t.act(p,"s",{action:"stop",kind:"course",targetId:id,token:s.token}),/audit unavailable/);
    assert.equal(t.get(p,"course",id).totalSeconds,0);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM study_sessions").get()!.n,1);
    f.db.exec("DROP TRIGGER fail_timer");
    f.db.prepare("UPDATE enrollments SET assignment_state='cancelled' WHERE id=?").run(id);
    assert.throws(()=>t.act(p,"s",{action:"pulse",kind:"course",targetId:id,token:s.token}),/Own active/);
  }finally{f.db.close();}
});
test("standalone timer stays pinned after retirement; restart discards gaps and preserves separate item totals",async()=>{
  const {mkdtempSync,rmSync}=await import("node:fs"),{tmpdir}=await import("node:os"),{join}=await import("node:path");
  const dir=mkdtempSync(join(tmpdir(),"pear-study-"));let f=fixture(join(dir,"study.sqlite")),now=100000;
  try {
    const item={title:"Study original",summary:"Original fixture",language:"en",provider:"Pear",license:"self-authored",aiProcessingAllowed:false,kind:"text",text:"Only human original"};
    data(f.call("editor","learning_create_content_item",{itemId:"study-item",item}));
    data(f.call("editor","learning_publish_content_item",{itemId:"study-item"}));
    const id=data(f.call("learner-a","learning_enroll_item",{itemId:"study-item"})).itemEnrollmentId;
    let t=new TelemetryService(f.db,()=>now),p=f.service.principal("learner-a");
    const s=t.act(p,"s",{action:"start",kind:"item",targetId:id});now+=15000;
    t.act(p,"s",{action:"pulse",kind:"item",targetId:id,token:s.token});
    data(f.call("editor","learning_retire_content_item",{itemId:"study-item"}));
    f.db.close();f=fixture(join(dir,"study.sqlite"));t=new TelemetryService(f.db,()=>now);p=f.service.principal("learner-a");now+=60000;
    assert.equal(t.act(p,"s",{action:"pulse",kind:"item",targetId:id,token:s.token}).totalSeconds,15);
    assert.equal(data(f.call("learner-a","learning_get_transcript")).items[0].observedSeconds,15);
    assert.equal(data(f.call("learner-a","learning_get_transcript")).items[0].estimatedMinutes,null);
    assert.equal(f.db.prepare("SELECT completed_at FROM item_enrollments WHERE id=?").get(id)!.completed_at,null);
    assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);
  }finally{f.db.close();rmSync(dir,{recursive:true,force:true});}
});
test("timer HTTP retains cookie/epoch/CSRF boundaries, rejects client durations and exposes no agent write",async()=>{
  const f=fixture(),origin="http://127.0.0.1:4314",{app}=await createApp({db:f.db,origin,developmentAuth:true});
  try {
    const id=enrollment(f);
    const response=await app.inject({method:"POST",url:"/api/login",headers:{host:"127.0.0.1:4314",origin},payload:{username:"learner-a",password:"learner-a-dev"}});
    assert.equal(response.statusCode,200);const login=response.json(),headers={host:"127.0.0.1:4314",origin,cookie:String(response.headers["set-cookie"]).split(";")[0],"x-csrf-token":login.csrf,"x-pear-epoch":login.sessionEpoch};
    const payload={action:"start",kind:"course",targetId:id};
    for(const override of [{"x-csrf-token":""},{"x-pear-epoch":"stale"},{origin:"http://evil.test"}]) {
      const r=await app.inject({method:"POST",url:"/api/study-timer",headers:{...headers,...override},payload});
      assert.ok([403,409].includes(r.statusCode));
    }
    assert.equal((await app.inject({method:"POST",url:"/api/study-timer",headers,payload:{...payload,elapsedSeconds:99999}})).statusCode,400);
    const started=await app.inject({method:"POST",url:"/api/study-timer",headers,payload});assert.equal(started.statusCode,200);
    assert.equal((await app.inject({method:"GET",url:"/api/study-timer?kind=course&targetId="+id,headers})).json().totalSeconds,0);
    assert.equal(f.call("learner-a","human_study_timer_start",{kind:"course",targetId:id}).error?.code,"FORBIDDEN");
    const description=f.service.description("learner-a");assert.equal(description.tools.some(t=>t.name.includes("study_timer")),false);
    await app.inject({method:"POST",url:"/api/logout",headers,payload:{}});
    assert.equal((await app.inject({method:"POST",url:"/api/study-timer",headers,payload:{...payload,action:"pulse",token:started.json().token}})).statusCode,401);
  }finally{await app.close();f.db.close();}
});
