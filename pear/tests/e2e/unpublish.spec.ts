import {test,expect} from "@playwright/test";
import {createApp} from "../../src/server/app.ts";
import {fixture,data} from "../helpers.ts";
import {resolve} from "node:path";
test("human unpublish persists withdrawal, keeps an enrolled learner reading and republish creates a new version",async({page})=>{
 const f=fixture(),origin="http://127.0.0.1:4323";
 const enrolled=data(f.call("learner-a","learning_enroll",{courseId:"systems-basics"}));
 const {app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 async function login(user:string){await page.goto(origin);await page.getByLabel("Account",{exact:true}).fill(user);await page.getByLabel("Password",{exact:true}).fill(user+"-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();}
 try{
  await app.listen({port:4323,host:"127.0.0.1"});await login("admin");await page.getByRole("button",{name:"Administration",exact:true}).click();
  const row=page.locator(".admin-courses .learning-row").filter({has:page.getByRole("heading",{name:"Reliable systems basics",exact:true})});
  await row.getByRole("button",{name:"Unpublish",exact:true}).click();await expect(page.getByRole("status")).toContainText("Unpublished");await expect(row).toContainText("draft");await expect(row.getByRole("button",{name:"Unpublish",exact:true})).toBeDisabled();
  await page.reload();await page.getByRole("button",{name:"Administration",exact:true}).click();await expect(row).toContainText("draft");
  await page.getByRole("button",{name:"Sign out",exact:true}).click();await login("learner-a");await page.getByRole("button",{name:"Explore",exact:true}).click();
  await expect(page.locator(".cards article").filter({has:page.getByRole("heading",{name:"Reliable systems basics",exact:true})})).toHaveCount(0);
  await page.getByRole("button",{name:"My learning",exact:true}).click();const learning=page.locator(".learning-row").filter({has:page.getByRole("heading",{name:"Reliable systems basics",exact:true})});
  await learning.getByRole("button",{name:"Continue learning",exact:true}).click();await expect(page.locator(".lesson-text")).toBeVisible();
  expect(f.db.prepare("SELECT version FROM enrollments WHERE id=?").get(enrolled.enrollmentId)!.version).toBe(1);
  await page.screenshot({path:"artifacts/unpublished-pinned-learning.png",fullPage:true});
  await page.getByRole("button",{name:"Sign out",exact:true}).click();await login("admin");await page.getByRole("button",{name:"Administration",exact:true}).click();
  await row.getByRole("button",{name:"Publish",exact:true}).click();await expect(row).toContainText("Published version 2");await expect(row.getByRole("button",{name:"Unpublish",exact:true})).toBeEnabled();
  expect(f.db.prepare("SELECT version FROM enrollments WHERE id=?").get(enrolled.enrollmentId)!.version).toBe(1);
 }finally{await app.close();f.db.close();}
});
