import {test,expect} from "@playwright/test";
import {fixture,data} from "../helpers.ts";
import {courses} from "../../src/server/seed.ts";
import {createApp} from "../../src/server/app.ts";
import {resolve} from "node:path";
test("author audience persists through reload, hides learner discovery and can be explicitly published for the organization",async({page})=>{
 test.setTimeout(90000);
 const f=fixture(),origin="http://127.0.0.1:4325",course={...structuredClone(courses["systems-basics"]),title:"Original audience fixture",access:"author" as const};
 data(f.call("editor","learning_create_course",{courseId:"audience-ui",course}));data(f.call("editor","learning_publish_course",{courseId:"audience-ui"}));
 const {app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 async function login(user:string){await page.goto(origin);await page.getByLabel("Account",{exact:true}).fill(user);await page.getByLabel("Password",{exact:true}).fill(user+"-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();}
 try{
  await app.listen({port:4325,host:"127.0.0.1"});await login("learner-a");await page.getByRole("button",{name:"Explore",exact:true}).click();await expect(page.locator(".cards article").filter({has:page.getByRole("heading",{name:course.title,exact:true})})).toHaveCount(0);
  await page.getByRole("button",{name:"Sign out",exact:true}).click();await login("editor");await page.getByRole("button",{name:"Administration",exact:true}).click();
  const row=page.locator(".admin-courses .learning-row").filter({has:page.getByRole("heading",{name:course.title,exact:true})});await row.getByRole("button",{name:"Edit draft",exact:true}).click();
  const editor=page.getByRole("region",{name:"Course authoring",exact:true});await expect(editor.getByLabel("Content audience",{exact:true})).toHaveValue("author");
  await page.reload();await page.getByRole("button",{name:"Administration",exact:true}).click();await row.getByRole("button",{name:"Edit draft",exact:true}).click();await expect(editor.getByLabel("Content audience",{exact:true})).toHaveValue("author");
  await editor.getByLabel("Content audience",{exact:true}).selectOption("tenant");await editor.getByRole("button",{name:"Save draft",exact:true}).click();await expect(page.getByRole("status")).toContainText("Draft saved");await row.getByRole("button",{name:"Publish",exact:true}).click();await expect(row).toContainText("Published version 2");
  await page.screenshot({path:"artifacts/content-audience-authoring.png",fullPage:true});
  await page.getByRole("button",{name:"Sign out",exact:true}).click();await login("learner-a");await page.getByRole("button",{name:"Explore",exact:true}).click();await expect(page.locator(".cards article").filter({has:page.getByRole("heading",{name:course.title,exact:true})})).toHaveCount(1);
  expect(f.db.prepare("SELECT content FROM course_versions WHERE course_id='audience-ui' AND version=1").get()!.content).toContain('"access":"author"');
 console.log("content audience assertions: complete");
 }finally{await page.close();app.server.closeAllConnections();await app.close();f.db.close();console.log("content audience cleanup: complete");}
});
