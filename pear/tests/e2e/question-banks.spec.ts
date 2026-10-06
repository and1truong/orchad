import {test,expect} from "@playwright/test";
import {fixture,data} from "../helpers.ts";
import {courses} from "../../src/server/seed.ts";
import {createApp} from "../../src/server/app.ts";
import {resolve} from "node:path";
test("human publishes a reusable bank, selects questions for a draft, reviews pinned provenance and explicitly detaches for manual editing",async({page})=>{
 test.setTimeout(90000);
 const f=fixture(),origin="http://127.0.0.1:4351",course={...structuredClone(courses["systems-basics"]),title:"Original bank target"};
 data(f.call("editor","learning_create_course",{courseId:"bank-source-ui",course:{...course,title:"Original bank source"}}));data(f.call("editor","learning_create_course",{courseId:"bank-target-ui",course}));data(f.call("editor","learning_publish_course",{courseId:"bank-target-ui"}));data(f.call("learner-a","learning_enroll",{courseId:"bank-target-ui"}));
 const enrollmentBefore=f.db.prepare("SELECT * FROM enrollments").all(),{app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 try{
  await app.listen({port:4351,host:"127.0.0.1"});await page.goto(origin);await page.getByLabel("Account",{exact:true}).fill("editor");await page.getByLabel("Password",{exact:true}).fill("editor-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();await page.getByRole("button",{name:"Administration",exact:true}).click();
  const banks=page.getByRole("region",{name:"Reusable question banks",exact:true}),publish=banks.getByRole("form",{name:"Publish question bank",exact:true});
  await publish.getByLabel("Question bank ID",{exact:true}).fill("bank-ui");await publish.getByLabel("Question bank title",{exact:true}).fill("Original browser bank");await publish.getByLabel("Bank source course ID",{exact:true}).fill("bank-source-ui");await publish.getByLabel("Question bank audience",{exact:true}).selectOption("tenant");await publish.getByRole("button",{name:"Publish bank version",exact:true}).click();await expect(banks.getByRole("status")).toContainText("Bank version published");
  const row=banks.locator("article").filter({has:banks.getByRole("heading",{name:"Original browser bank",exact:true})});await row.getByRole("button",{name:"Choose bank questions",exact:true}).click();
  const apply=banks.getByRole("form",{name:"Apply question bank",exact:true});await apply.getByLabel(/q-write ·/).uncheck();await apply.getByLabel("Bank target course ID",{exact:true}).fill("bank-target-ui");await apply.getByRole("button",{name:"Apply selected bank version",exact:true}).click();await expect(banks.getByRole("status")).toContainText("Reopen the target course draft");
  const target=page.locator(".admin-courses .learning-row").filter({has:page.getByRole("heading",{name:"Original bank target",exact:true})});await target.getByRole("button",{name:"Edit draft",exact:true}).click();const editor=page.getByRole("region",{name:"Course authoring",exact:true});await expect(editor).toContainText("Pinned question bank");await expect(editor.getByRole("group",{name:"Question 2",exact:true})).toHaveCount(0);await expect(editor.getByLabel("First quiz question",{exact:true})).toBeDisabled();
  await editor.getByRole("button",{name:"Save draft",exact:true}).click();await expect(page.getByRole("status").filter({hasText:"Draft saved"})).toBeVisible();await target.getByRole("button",{name:"Publish",exact:true}).click();await expect(target).toContainText("Published version 2");
  expect(f.db.prepare("SELECT * FROM enrollments").all()).toEqual(enrollmentBefore);expect(JSON.parse(String(f.db.prepare("SELECT content FROM course_versions WHERE course_id='bank-target-ui' AND version=2").get()!.content)).quiz.questionBankRef.version).toBe(1);
  await row.getByRole("button",{name:"Retire question bank",exact:true}).click();await expect(row).toContainText("retired");await expect(row.getByRole("button",{name:"Choose bank questions",exact:true})).toBeDisabled();
  await target.getByRole("button",{name:"Edit draft",exact:true}).click();await editor.getByRole("button",{name:"Detach bank for manual question edits",exact:true}).click();await expect(editor.getByLabel("First quiz question",{exact:true})).toBeEnabled();
  await page.getByLabel("Interface language",{exact:true}).selectOption("vi");await expect(page.getByRole("heading",{name:"Ngân hàng câu hỏi tái sử dụng",exact:true})).toBeVisible();await page.screenshot({path:"artifacts/versioned-question-bank.png",fullPage:true});
 }finally{await app.close();f.db.close();}
});
