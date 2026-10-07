import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import {createApp} from "../src/server/app.ts";
const original={id:"changed-workshop",startsAt:"2026-11-01T01:30:00-04:00",endsAt:"2026-11-01T01:30:00-05:00",cutoffAt:"2026-10-31T22:00:00-04:00",timezone:"America/New_York",capacity:2,location:"Private room",joinUrl:"https://meet.example.test/private"};
const replacement={...original,startsAt:"2026-11-02T10:00:00-05:00",endsAt:"2026-11-02T11:00:00-05:00",cutoffAt:"2026-11-02T09:00:00-05:00",capacity:1,location:"Rescheduled private room"};
function setup(f:ReturnType<typeof fixture>,access:"tenant"|"author"="tenant"){
 const course={...structuredClone(courses["systems-basics"]),access,lessons:[{id:"event",title:"Original workshop",text:"Attend with the human instructor",kind:"event" as const,prerequisiteIds:[],sessions:[original]}]};
 data(f.call("editor","learning_create_course",{courseId:"session-lifecycle",course}));data(f.call("editor","learning_publish_course",{courseId:"session-lifecycle"}));data(f.call("editor","learning_set_course_assessor",{courseId:"session-lifecycle",assessorId:"assessor",enabled:true}));
 return {course,enroll:(user:string)=>data(f.call(user,"learning_enroll",{courseId:"session-lifecycle"})).enrollmentId,book:(user:string,id:string)=>data(f.call(user,"learning_book_session",{enrollmentId:id,lessonId:"event",sessionId:original.id}))};
}
test("reschedule atomically cancels pinned bookings, produces private own notices and stable cancelled calendars, then requires capacity-checked explicit rebooking",()=>{
 const f=fixture(),clock=Date.now;Date.now=()=>Date.parse("2026-10-30T12:00:00Z");
 try{
  const s=setup(f),a=s.enroll("learner-a"),b=s.enroll("learner-b"),ba=s.book("learner-a",a),bb=s.book("learner-b",b),before=String(f.db.prepare("SELECT content FROM course_versions WHERE course_id='session-lifecycle' AND version=1").get()!.content),learnerRevision=f.service.context("learner-a").revision;
  const args={sessionId:original.id,action:"reschedule",reason:"Instructor changed the room and time",session:replacement},overrides={expectedRevision:f.service.context("assessor","library:demo").revision,idempotencyKey:"reschedule-original"};
  const changed=data(f.call("assessor","learning_change_session",args,"bridge",overrides));assert.equal(changed.cancelledBookings,2);assert.equal(changed.sessionRevision,1);assert.equal(changed.officialLearningChanged,false);
  assert.deepEqual(data(f.call("assessor","learning_change_session",args,"bridge",overrides)),changed);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM event_session_changes").get()!.n,1);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM session_notices").get()!.n,2);
  assert.equal(f.service.context("learner-a").revision,learnerRevision+1);assert.equal(String(f.db.prepare("SELECT content FROM course_versions WHERE course_id='session-lifecycle' AND version=1").get()!.content),before);
  assert.deepEqual(JSON.parse(String(f.db.prepare("SELECT completed_lessons FROM enrollments WHERE id=?").get(a)!.completed_lessons)),[]);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM certificates").get()!.n,0);
  const own=data(f.call("learner-a","learning_get_session_notices"));assert.equal(own.items.length,1);assert.equal(own.items[0].data.previousBookingId,ba.bookingId);assert.equal(JSON.stringify(own).includes(bb.bookingId),false);
  assert.equal(f.call("learner-b","learning_read_session_notice",{noticeId:own.items[0].id}).ok,false);
  data(f.call("learner-a","learning_read_session_notice",{noticeId:own.items[0].id}));assert.ok(data(f.call("learner-a","learning_get_session_notices")).items[0].readAt);
  const oldCalendar=f.service.blended.calendar(f.service.principal("learner-a"),ba.bookingId);assert.match(oldCalendar,/STATUS:CANCELLED/);assert.match(oldCalendar,/SEQUENCE:1/);assert.match(oldCalendar,/DTSTART:20261101T053000Z/);assert.match(oldCalendar,new RegExp("UID:"+ba.bookingId+"@pear"));
  Date.now=()=>Date.parse("2026-10-30T13:00:00Z");assert.equal(f.service.blended.calendar(f.service.principal("learner-a"),ba.bookingId),oldCalendar);
  assert.throws(()=>f.service.blended.calendar(f.service.principal("learner-b"),ba.bookingId),/scope/);
  const human=data(f.call("learner-a","learning_get_blended_lesson",{enrollmentId:a,lessonId:"event"},"human"));assert.equal(human.sessions[0].startsAt,replacement.startsAt);assert.equal(human.bookings[0].state,"cancelled");
  const bridge=data(f.call("learner-a","learning_get_blended_lesson",{enrollmentId:a,lessonId:"event"}));assert.equal(JSON.stringify(bridge).includes(replacement.location),false);assert.equal(JSON.stringify(bridge).includes("https://meet"),false);
  const newBooking=s.book("learner-a",a);assert.equal(newBooking.sessionRevision,1);assert.notEqual(newBooking.bookingId,ba.bookingId);assert.equal(f.call("learner-b","learning_book_session",{enrollmentId:b,lessonId:"event",sessionId:original.id}).ok,false);
  assert.match(f.service.blended.calendar(f.service.principal("learner-a"),newBooking.bookingId),/DTSTART:20261102T150000Z/);
  Date.now=()=>Date.parse("2026-11-02T15:01:00Z");
  assert.equal(f.call("assessor","human_mark_attendance",{bookingId:ba.bookingId,present:true,reason:"Old booking cancelled"},"human").ok,false);
  data(f.call("assessor","human_mark_attendance",{bookingId:newBooking.bookingId,present:true,reason:"Instructor observed the rescheduled session"},"human"));
  assert.equal(f.call("assessor","learning_change_session",{sessionId:original.id,action:"cancel",reason:"Too late"}).ok,false);
  assert.deepEqual(JSON.parse(String(f.db.prepare("SELECT completed_lessons FROM enrollments WHERE id=?").get(a)!.completed_lessons)),["event"]);assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{Date.now=clock;f.db.close();}
});
test("future cancellation and reopening preserve attendance boundaries, CAS keys and live delegated scope; private courses suppress integration facts",()=>{
 const f=fixture(),clock=Date.now;Date.now=()=>Date.parse("2026-10-30T12:00:00Z");
 try{
  const s=setup(f,"author"),a=s.enroll("editor"),booked=s.book("editor",a),args={sessionId:original.id,action:"cancel",reason:"Instructor unavailable"},overrides={expectedRevision:f.service.context("assessor","library:demo").revision,idempotencyKey:"cancel-original"};
  for(const user of ["learner-a","manager","outsider"])assert.equal(f.call(user,"learning_change_session",args).ok,false);
  assert.equal(f.call("assessor","learning_change_session",{...args,session:replacement}).ok,false);
  const cancelled=data(f.call("assessor","learning_change_session",args,"bridge",overrides));assert.equal(cancelled.state,"cancelled");assert.equal(cancelled.cancelledBookings,1);
  assert.equal(f.call("editor","learning_book_session",{enrollmentId:a,lessonId:"event",sessionId:original.id}).ok,false);
  assert.equal(f.call("assessor","learning_change_session",args).ok,false);
  assert.equal(f.call("assessor","learning_change_session",{...args,reason:"Changed payload"},"bridge",overrides).ok,false);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM integration_events WHERE topic='session.changed'").get()!.n,0);
  data(f.call("editor","learning_set_course_assessor",{courseId:"session-lifecycle",assessorId:"assessor",enabled:false}));
  assert.equal(f.call("assessor","learning_change_session",args,"bridge",overrides).ok,false);assert.equal(f.call("assessor","learning_get_session_changes",{courseId:"session-lifecycle"}).ok,false);
  assert.equal(data(f.call("editor","learning_get_session_changes",{courseId:"session-lifecycle"})).items[0].state,"cancelled");
  data(f.call("editor","learning_change_session",{sessionId:original.id,action:"reschedule",reason:"Reopened at reviewed time",session:replacement}));assert.equal(s.book("editor",a).sessionRevision,2);
  assert.match(f.service.blended.calendar(f.service.principal("editor"),booked.bookingId),/STATUS:CANCELLED/);
 }finally{Date.now=clock;f.db.close();}
});
test("invalid times, stale revisions and audit failures roll back changes, seats, notices, workspace revisions, outbox and keys together",()=>{
 const f=fixture(),clock=Date.now;Date.now=()=>Date.parse("2026-10-30T12:00:00Z");
 try{
  const s=setup(f),a=s.enroll("learner-a"),book=s.book("learner-a",a),args={sessionId:original.id,action:"reschedule",reason:"Reviewed move",session:replacement};
  const before=f.service.context("learner-a").revision,events=f.db.prepare("SELECT COUNT(*) AS n FROM integration_events").get()!.n,overrides={expectedRevision:f.service.context("editor","library:demo").revision,idempotencyKey:"rollback-session"};
  for(const session of [{...replacement,timezone:"Bad/Zone"},{...replacement,endsAt:replacement.startsAt},{...replacement,cutoffAt:"2026-10-29T00:00:00Z"},{...replacement,id:"different-session"},{...replacement,joinUrl:"javascript:alert(1)"}])assert.equal(f.call("editor","learning_change_session",{...args,session}).ok,false);
  assert.equal(f.call("editor","learning_change_session",args,"bridge",{...overrides,expectedRevision:99999}).ok,false);
  f.db.exec("CREATE TRIGGER fail_session_audit BEFORE INSERT ON audit WHEN NEW.tool='learning_change_session' BEGIN SELECT RAISE(ABORT,'Audit unavailable'); END");
  assert.equal(f.call("editor","learning_change_session",args,"bridge",overrides).ok,false);
  assert.equal(f.db.prepare("SELECT state FROM bookings WHERE id=?").get(book.bookingId)!.state,"booked");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM event_session_changes").get()!.n,0);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM session_notices").get()!.n,0);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM integration_events").get()!.n,events);
  assert.equal(f.service.context("learner-a").revision,before);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM idempotency WHERE key='rollback-session'").get()!.n,0);
  f.db.exec("DROP TRIGGER fail_session_audit");data(f.call("editor","learning_change_session",args,"bridge",overrides));
  const emitted=JSON.parse(String(f.db.prepare("SELECT data FROM integration_events WHERE topic='session.changed'").get()!.data));assert.deepEqual(Object.keys(emitted).sort(),["courseId","kind","lessonId","sessionId","sessionRevision"].sort());assert.equal(JSON.stringify(emitted).includes("room"),false);
 }finally{Date.now=clock;f.db.close();}
});
test("real HTTP requires scoped cookie authority and CSRF for changes; notice acknowledgement and cancelled calendar remain own-only",async()=>{
 const f=fixture(),clock=Date.now;Date.now=()=>Date.parse("2026-10-30T12:00:00Z");let app:any;
 try{
  const s=setup(f),a=s.enroll("learner-a"),book=s.book("learner-a",a),origin="http://127.0.0.1:4314";
  ({app}=await createApp({db:f.db,origin,developmentAuth:true}));
  async function auth(user:string){const login=await app.inject({method:"POST",url:"/api/login",headers:{host:"127.0.0.1:4314",origin},payload:{username:user,password:user+"-dev"}});assert.equal(login.statusCode,200);return {host:"127.0.0.1:4314",origin,cookie:String(login.headers["set-cookie"]).split(";")[0],"x-csrf-token":login.json().csrf,"x-pear-epoch":login.json().sessionEpoch};}
  const editor=await auth("editor"),payload={requestId:"http-session",documentId:"library:demo",toolName:"learning_change_session",arguments:{sessionId:original.id,action:"cancel",reason:"Actual route review"},expectedRevision:f.service.context("editor","library:demo").revision,idempotencyKey:"http-session"};
  assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers:{...editor,"x-csrf-token":"wrong"},payload})).statusCode,403);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM event_session_changes").get()!.n,0);
  const changed=await app.inject({method:"POST",url:"/api/human/invoke",headers:editor,payload});assert.equal(changed.statusCode,200);assert.equal(changed.json().data.cancelledBookings,1);
  const own=await auth("learner-a"),other=await auth("learner-b"),notice=f.db.prepare("SELECT id FROM session_notices WHERE learner='learner-a'").get()!.id;
  const read={requestId:"notice",documentId:"learning:demo:learner-b",toolName:"learning_read_session_notice",arguments:{noticeId:notice},expectedRevision:f.service.context("learner-b").revision,idempotencyKey:"notice-other"};
  assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers:other,payload:read})).statusCode,403);
  const denied=await app.inject({url:"/api/bookings/"+book.bookingId+"/calendar",headers:other});assert.equal(denied.statusCode,403);
  const calendar=await app.inject({url:"/api/bookings/"+book.bookingId+"/calendar",headers:own});assert.equal(calendar.statusCode,200);assert.match(calendar.body,/STATUS:CANCELLED/);assert.match(calendar.body,/UID:/);
 }finally{if(app)await app.close();Date.now=clock;f.db.close();}
});
