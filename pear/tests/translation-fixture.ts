import {fixture,data} from "./helpers.ts";
import {TranslationService} from "../src/server/translations.ts";
export function translationFixture(path?:string){
 const f=fixture(path),translations=new TranslationService(f.db),admin=f.service.principal("admin"),learner=f.service.principal("learner-a");
 if(!f.db.prepare("SELECT 1 FROM courses WHERE id='systems-vi'").get()){
  const original=JSON.parse((f.db.prepare("SELECT content FROM course_versions WHERE course_id='systems-basics' AND version=1").get() as any).content);
  const course={...original,title:"Nền tảng hệ thống tin cậy",summary:"Tài liệu tự soạn về retry và giới hạn tài nguyên.",language:"vi",lessons:[
   {id:"retry",title:"Giới hạn retry",kind:"text",text:"Giới hạn số lần retry, thêm jitter và thời hạn. Đối soát khóa thao tác gốc trước khi thử ghi lại.",prerequisiteIds:[]},
   {id:"capacity",title:"Bảo vệ tài nguyên",kind:"text",text:"Giới hạn số yêu cầu đồng thời và từ chối quá tải sớm.",prerequisiteIds:["retry"]}
  ],quiz:{passScore:100,maxAttempts:2,questions:[
   {id:"q-retry",prompt:"Điều gì giới hạn retry?",options:["Retry không giới hạn","Ngân sách, jitter và thời hạn"],correct:1},
   {id:"q-write",prompt:"Trước khi thử ghi lại cần làm gì?",options:["Đoán rollback","Đối soát khóa thao tác gốc"],correct:1}
  ]}};
  data(f.call("admin","learning_create_course",{courseId:"systems-vi",course}));
  data(f.call("admin","learning_publish_course",{courseId:"systems-vi"}));
 }
 const args=(extra:any={})=>({action:"link",kind:"course",originalId:"systems-basics",sourceId:"systems-vi",originalVersion:1,sourceVersion:1,provenance:"human_authored",qualityReview:"Original fixture text checked by a human; no provider translation claim",reason:"Reviewed original derivative",key:crypto.randomUUID(),revision:f.service.context("admin","library:demo").revision,...extra});
 const link=(extra:any={})=>translations.mutate(admin,args(extra));
 return {...f,translations,admin,learner,args,link};
}
