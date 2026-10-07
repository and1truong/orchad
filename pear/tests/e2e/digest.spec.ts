import {test,expect} from "@playwright/test";
import {createApp} from "../../src/server/app.ts";
import {fixture,data} from "../helpers.ts";
import {resolve} from "node:path";
test("learner explicitly requests own bounded digest with chosen zone and budget; official records stay unchanged",async({page})=>{
 test.setTimeout(60000);
 const f=fixture(),origin="http://127.0.0.1:4324";
 const own=data(f.call("learner-a","learning_enroll",{courseId:"systems-basics"}));
 f.db.prepare("UPDATE enrollments SET due_date='2000-01-01T00:00:00.000Z' WHERE id=?").run(own.enrollmentId);
 data(f.call("learner-b","learning_enroll",{courseId:"learning-vi"}));
 const before=f.db.prepare("SELECT * FROM enrollments").all();
 const {app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 try{
  await app.listen({port:4324,host:"127.0.0.1"});await page.goto(origin);await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"My learning",exact:true}).click();
  const digest=page.getByRole("region",{name:"My learning digest",exact:true});await expect(digest.getByLabel("Digest results",{exact:true})).toHaveCount(0);
  await digest.getByLabel("Time budget in minutes",{exact:true}).fill("1");await digest.getByLabel("Digest time zone",{exact:true}).fill("Asia/Ho_Chi_Minh");
  await digest.getByRole("button",{name:"Read my digest",exact:true}).click();
  const results=digest.getByLabel("Digest results",{exact:true});await expect(results.getByRole("heading",{name:"Reliable systems basics",exact:true})).toBeVisible();await expect(results).toContainText("Overdue");await expect(results).toContainText("Asia/Ho_Chi_Minh");await expect(results).toContainText("longer than whole-content budget");await expect(results).toContainText("remaining time");
  await expect(results.getByRole("heading",{name:"Học tập có chủ đích",exact:true})).toHaveCount(0);
  expect(f.db.prepare("SELECT * FROM enrollments").all()).toEqual(before);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:"artifacts/own-on-demand-digest.png",fullPage:true});
  await digest.getByLabel("Digest time zone",{exact:true}).fill("Mars/Unknown");await digest.getByRole("button",{name:"Read my digest",exact:true}).click();await expect(digest.getByRole("alert")).toContainText("IANA");await expect(digest.getByLabel("Digest results",{exact:true})).toHaveCount(0);
  console.log("digest assertions: complete");
 }finally{await page.close();app.server.closeAllConnections();await app.close();f.db.close();console.log("digest cleanup: complete");}
});
