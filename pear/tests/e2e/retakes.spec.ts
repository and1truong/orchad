import {test,expect} from "@playwright/test";
import {fixture,data} from "../helpers.ts";
import {courses} from "../../src/server/seed.ts";
import {createApp} from "../../src/server/app.ts";
import {resolve} from "node:path";
test("human chooses reviewed latest course version for fresh learning while prior completion and certificate remain intact through reload",async({page})=>{
 test.setTimeout(90000);const f=fixture(),origin="http://127.0.0.1:4353",course=courses["systems-basics"],enrollmentId=data(f.call("learner-a","learning_enroll",{courseId:"systems-basics"})).enrollmentId;
 for(const l of course.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId,lessonId:l.id},"human"));
 const attemptId=data(f.call("learner-a","learning_start_attempt",{enrollmentId})).attemptId;for(const q of course.quiz.questions)data(f.call("learner-a","human_save_answer",{attemptId,questionId:q.id,answer:q.correct},"human"));data(f.call("learner-a","human_submit_attempt",{attemptId,confirmed:true},"human"));
 const original=f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(enrollmentId),attempts=f.db.prepare("SELECT * FROM attempts").all(),certificates=f.db.prepare("SELECT * FROM certificates").all();
 data(f.call("admin","learning_update_course",{courseId:"systems-basics",course:{...structuredClone(course),title:"Original latest reviewed course"}}));data(f.call("admin","learning_publish_course",{courseId:"systems-basics"}));
 const {app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 try{
  await app.listen({port:4353,host:"127.0.0.1"});await page.goto(origin);await page.getByLabel("Account",{exact:true}).fill("learner-a");await page.getByLabel("Password",{exact:true}).fill("learner-a-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();await page.getByRole("button",{name:"My learning",exact:true}).click();
  const retake=page.getByRole("region",{name:"Completed course retake",exact:true});await retake.getByRole("button",{name:"Review course retake",exact:true}).click();await expect(retake).toContainText("Prior completion, attempts and certificates remain unchanged");
  const confirm=retake.getByRole("button",{name:"Create fresh course retake",exact:true});await expect(confirm).toBeDisabled();await retake.getByLabel("Retake course version",{exact:true}).selectOption("latest");await retake.getByLabel("I choose this version for a fresh learning record.",{exact:true}).check();await confirm.click();await expect(retake.getByRole("status")).toContainText("Fresh learning record created");
  const fresh=f.db.prepare("SELECT * FROM enrollments WHERE retake_of=?").get(enrollmentId)!;expect(fresh.version).toBe(2);expect(fresh.status).toBe("in_progress");expect(fresh.completed_lessons).toBe("[]");
  await page.reload();await page.getByRole("button",{name:"My learning",exact:true}).click();const row=page.locator(".learning-row").filter({has:page.getByRole("heading",{name:"Original latest reviewed course",exact:true})});await expect(row).toContainText("Fresh course retake");await row.getByRole("button",{name:"Continue learning",exact:true}).click();await expect(page.getByRole("button",{name:"I have studied this lesson",exact:true})).toBeEnabled();
  await retake.getByRole("button",{name:"Review course retake",exact:true}).click();await expect(retake).toContainText("A retake already exists");await expect(retake.getByRole("button",{name:"Create fresh course retake",exact:true})).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.getByLabel("Interface language",{exact:true}).selectOption("vi");await expect(page.getByRole("region",{name:"Học lại khóa đã hoàn tất",exact:true})).toBeVisible();
  expect(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(enrollmentId)).toEqual(original);expect(f.db.prepare("SELECT * FROM attempts").all()).toEqual(attempts);expect(f.db.prepare("SELECT * FROM certificates").all()).toEqual(certificates);await page.screenshot({path:"artifacts/completed-course-retake.png",fullPage:true});console.log("retake assertions: complete");
 }finally{await page.close();app.server.closeAllConnections();await app.close();f.db.close();}
});
