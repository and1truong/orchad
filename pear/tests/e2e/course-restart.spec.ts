import {test,expect} from "@playwright/test";
import {courseRestartFixture} from "../course-restart-fixture.ts";
import {createApp} from "../../src/server/app.ts";
import {resolve} from "node:path";
test("learner explicitly reviews full changed course and starts latest from zero in real EN/VI browser while old failed work stays intact",async({page})=>{
 test.setTimeout(90000);const f=courseRestartFixture(),origin="http://127.0.0.1:4381",before=f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),{app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 try{
  await app.listen({port:4381,host:"127.0.0.1"});await page.goto(origin);await page.getByLabel("Account",{exact:true}).fill("learner-a");await page.getByLabel("Password",{exact:true}).fill("learner-a-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();await page.getByRole("button",{name:"My learning",exact:true}).click();
  const region=page.getByRole("region",{name:"Fresh latest course review",exact:true});await region.getByRole("button",{name:"Review fresh latest course restart",exact:true}).click();const form=region.getByRole("form",{name:"Fresh course restart confirmation",exact:true});await expect(form).toContainText("Original latest full course");await expect(form).toContainText("Original reviewed full course change");const start=form.getByRole("button",{name:"Start latest course from zero",exact:true});await expect(start).toBeDisabled();await form.getByLabel("I reviewed the latest course and choose a fresh start with no carried progress.",{exact:true}).check();
  const response=page.waitForResponse(r=>r.url().endsWith("/api/human/invoke")&&r.request().postDataJSON()?.toolName==="human_restart_latest_course");await start.click();expect((await(await response).json()).ok).toBe(true);await expect(form).toHaveCount(0);await expect(page.getByRole("heading",{name:"Original latest full course",exact:true})).toBeVisible();
  const row=f.db.prepare("SELECT * FROM enrollments WHERE retake_of=?").get(f.e.enrollmentId)!;expect(row.version).toBe(2);expect(row.completed_lessons).toBe("[]");expect(row.status).toBe("in_progress");expect(f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId)).toEqual(before);expect(f.db.prepare("SELECT count(*) n FROM certificates").get()!.n).toBe(0);
  await page.getByLabel("Interface language",{exact:true}).selectOption("vi");await expect(page.getByRole("button",{name:"Xem xét học bản khóa mới nhất từ đầu",exact:true})).toBeVisible();
 }finally{await page.close();app.server.closeAllConnections();await app.close();f.db.close();}
});
