import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
export function transcriptFixture(count=16){
 const f=fixture(),entries:string[]=[];f.db.prepare("UPDATE accounts SET name='Nguyễn Trường' WHERE id='learner-a'").run();
 for(let i=0;i<count;i++){const courseId="transcript-original-"+i,course={...structuredClone(courses["learning-vi"]),title:"Nội dung gốc "+i+" <script>literal</script>"};data(f.call("editor","learning_create_course",{courseId,course}));data(f.call("editor","learning_publish_course",{courseId}));entries.push(data(f.call("learner-a","learning_enroll",{courseId})).enrollmentId);}
 data(f.call("learner-b","learning_enroll",{courseId:"systems-basics"}));
 return {...f,entries};
}
