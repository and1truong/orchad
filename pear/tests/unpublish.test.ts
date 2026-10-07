import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
const item={title:"Withdrawable original",summary:"Original fixture",language:"en",provider:"Pear Originals",license:"self-authored",aiProcessingAllowed:true,kind:"text",text:"Pinned original body"};
const award={title:"Withdrawable award",summary:"Original",access:"tenant",unit:"credits",target:1,ongoing:false,moderatedExternal:false,requirements:[{id:"practice",title:"Original practice",required:true,credits:1,alternatives:[{kind:"external",id:"practice"}]}]};
function prepare(f:ReturnType<typeof fixture>){
 data(f.call("admin","learning_create_content_item",{itemId:"withdraw-item",item}));
 data(f.call("admin","learning_publish_content_item",{itemId:"withdraw-item"}));
 data(f.call("admin","learning_save_award",{collectionId:"withdraw-award",award}));
 data(f.call("admin","learning_publish_collection",{collectionId:"withdraw-award"}));
}
test("unpublish withdraws new enrollment/discovery/references while immutable learner pins continue and republish advances version",()=>{
 const f=fixture();try{
  prepare(f);
  const course=data(f.call("learner-a","learning_enroll",{courseId:"systems-basics"})).enrollmentId;
  const standalone=data(f.call("learner-a","learning_enroll_item",{itemId:"withdraw-item",version:1})).itemEnrollmentId;
  const program=data(f.call("learner-a","learning_enroll_award",{collectionId:"withdraw-award"})).awardEnrollmentId;
  const pins=f.db.prepare("SELECT course_id,version FROM enrollments WHERE id=?").get(course);
  for(const [tool,args] of [["learning_unpublish_course",{courseId:"systems-basics"}],["learning_unpublish_content_item",{itemId:"withdraw-item"}],["learning_unpublish_collection",{collectionId:"withdraw-award"}]] as const)data(f.call("admin",tool,args));
  assert.equal(data(f.call("learner-b","learning_search")).items.some((x:any)=>x.id==="systems-basics"),false);
  assert.equal(data(f.call("learner-b","learning_search_items")).items.some((x:any)=>x.id==="withdraw-item"),false);
  assert.equal(data(f.call("learner-b","learning_search_collections")).items.some((x:any)=>x.id==="withdraw-award"),false);
  for(const [tool,args] of [["learning_enroll",{courseId:"systems-basics"}],["learning_enroll_item",{itemId:"withdraw-item",version:1}],["learning_enroll_award",{collectionId:"withdraw-award"}]] as const)assert.equal(f.call("learner-b",tool,args).ok,false);
  assert.equal(f.call("admin","learning_assign",{courseId:"systems-basics",learnerId:"learner-b",dueDate:null}).ok,false);
  data(f.call("admin","learning_save_playlist",{collectionId:"invalid-reference",playlist:{title:"Unavailable reference",summary:"Original",access:"tenant",items:[{kind:"course",id:"systems-basics"}]}}));
  assert.equal(f.call("admin","learning_publish_collection",{collectionId:"invalid-reference"}).ok,false);
  data(f.call("admin","learning_save_playlist",{collectionId:"invalid-item-reference",playlist:{title:"Unavailable item",summary:"Original",access:"tenant",items:[{kind:"item",id:"withdraw-item"}]}}));
  assert.equal(f.call("admin","learning_publish_collection",{collectionId:"invalid-item-reference"}).ok,false);
  data(f.call("learner-a","learning_get_progress",{enrollmentId:course}));
  assert.equal(data(f.call("learner-a","learning_get_item_enrollment",{itemEnrollmentId:standalone},"human")).item.text,item.text);
  data(f.call("learner-a","human_complete_item",{itemEnrollmentId:standalone,confirmed:true},"human"));
  data(f.call("learner-a","human_submit_external_record",{awardEnrollmentId:program,criterionPath:"practice",amount:1,evidence:"Own original practice",confirmed:true},"human"));
  assert.equal(f.db.prepare("SELECT completed_at FROM award_enrollments WHERE id=?").get(program)!.completed_at!==null,true);
  data(f.call("admin","learning_publish_course",{courseId:"systems-basics"}));data(f.call("admin","learning_publish_content_item",{itemId:"withdraw-item"}));data(f.call("admin","learning_publish_collection",{collectionId:"withdraw-award"}));
  assert.deepEqual(f.db.prepare("SELECT course_id,version FROM enrollments WHERE id=?").get(course),pins);
  assert.equal(data(f.call("learner-b","learning_enroll",{courseId:"systems-basics"})).version,2);
  assert.equal(data(f.call("learner-b","learning_enroll_item",{itemId:"withdraw-item",version:2})).version,2);
  assert.equal(f.db.prepare("SELECT version FROM award_enrollments WHERE id=?").get(data(f.call("learner-b","learning_enroll_award",{collectionId:"withdraw-award"})).awardEnrollmentId)!.version,2);
  for(const topic of ["content.unpublished","item.unpublished","collection.unpublished"])assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM integration_events WHERE topic=?").get(topic)!.n,1);
  assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{f.db.close();}
});
test("unpublish requires live author scope and CAS; exact retries preserve newer publications and audit failures roll back state/events/revision",()=>{
 const f=fixture();try{
  prepare(f);
  for(const user of ["learner-a","manager","assessor","outsider"])assert.equal(f.call(user,"learning_unpublish_course",{courseId:"systems-basics"}).ok,false);
  assert.equal(f.call("outsider","learning_unpublish_content_item",{itemId:"withdraw-item"}).ok,false);
  assert.equal(f.call("admin","learning_unpublish_collection",{collectionId:"guess"}).ok,false);
  const revision=f.service.context("admin","library:demo").revision;
  const envelope={idempotencyKey:"withdraw-retry",expectedRevision:revision};
  const first=f.call("admin","learning_unpublish_content_item",{itemId:"withdraw-item"},"bridge",envelope);data(first);
  assert.equal(f.call("admin","learning_unpublish_content_item",{itemId:"withdraw-item"}).error?.code,"INVALID_ARGUMENT");
  data(f.call("admin","learning_publish_content_item",{itemId:"withdraw-item"}));
  const before=f.service.context("admin","library:demo").revision;
  assert.deepEqual(f.call("admin","learning_unpublish_content_item",{itemId:"withdraw-item"},"bridge",envelope),first);
  assert.equal(f.db.prepare("SELECT state FROM content_items WHERE id='withdraw-item'").get()!.state,"published");
  assert.equal(f.service.context("admin","library:demo").revision,before);
  assert.equal(f.call("admin","learning_unpublish_course",{courseId:"systems-basics"},"bridge",{expectedRevision:revision,idempotencyKey:"stale-withdraw"}).error?.code,"STALE_CONTEXT");
  const events=f.db.prepare("SELECT COUNT(*) AS n FROM integration_events").get()!.n;
  f.db.exec("CREATE TRIGGER deny_withdraw_audit BEFORE INSERT ON audit WHEN NEW.tool LIKE 'learning_unpublish_%' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  for(const [tool,args,table,id] of [["learning_unpublish_course",{courseId:"systems-basics"},"courses","systems-basics"],["learning_unpublish_content_item",{itemId:"withdraw-item"},"content_items","withdraw-item"],["learning_unpublish_collection",{collectionId:"withdraw-award"},"collections","withdraw-award"]] as const){
   assert.equal(f.call("admin",tool,args).error?.code,"INTERNAL");
   assert.equal(f.db.prepare("SELECT state FROM "+table+" WHERE id=?").get(id)!.state,"published");
   assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM integration_events").get()!.n,events);
   assert.equal(f.service.context("admin","library:demo").revision,before);
  }
  f.db.exec("DROP TRIGGER deny_withdraw_audit");
  f.db.prepare("UPDATE accounts SET role='learner' WHERE id='admin'").run();
  assert.equal(f.call("admin","learning_unpublish_content_item",{itemId:"withdraw-item"},"bridge",envelope).error?.code,"FORBIDDEN");
 }finally{f.db.close();}
});
