import {test,expect} from "@playwright/test";
import {fixture,data} from "../helpers.ts";
import {createApp} from "../../src/server/app.ts";
import {resolve} from "node:path";
test("admin assigns primary assessor in real UI; scoped assessor sees in-app notice and human evidence, EN/VI labels preserve literal evidence",async({page})=>{
 test.setTimeout(90000);const f=fixture(),origin="http://127.0.0.1:4367";
 const award={title:"Original UI primary award",summary:"Original practice",access:"tenant",unit:"credits",target:1,ongoing:false,moderatedExternal:true,primaryModeration:true,requirements:[{id:"practice",title:"Practice",required:true,credits:1,alternatives:[{kind:"external",id:"original-proof"}]}]};
 data(f.call("editor","learning_save_award",{collectionId:"ui-primary",award}));data(f.call("editor","learning_publish_collection",{collectionId:"ui-primary"}));data(f.call("admin","learning_set_award_assessor",{collectionId:"ui-primary",assessorId:"assessor",enabled:true}));
 const e=data(f.call("learner-a","learning_enroll_award",{collectionId:"ui-primary"})),record=data(f.call("learner-a","human_submit_external_record",{awardEnrollmentId:e.awardEnrollmentId,criterionPath:"practice",amount:1,evidence:"Original literal evidence <img src=x>",confirmed:true},"human"));
 const {app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 async function login(user:string){await page.goto(origin);await page.getByLabel("Account",{exact:true}).fill(user);await page.getByLabel("Password",{exact:true}).fill(user+"-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();}
 async function action(tool:string,click:()=>Promise<void>){const response=page.waitForResponse(r=>r.url().endsWith("/api/human/invoke")&&r.request().postDataJSON()?.toolName===tool);await click();expect((await(await response).json()).ok).toBe(true);}
 try{
  await app.listen({port:4367,host:"127.0.0.1"});await login("admin");await page.getByRole("button",{name:"Administration",exact:true}).click();
  await page.getByLabel("Moderation award ID",{exact:true}).fill("ui-primary");await action("learning_get_external_records",()=>page.getByRole("button",{name:"Load submissions",exact:true}).click());
  const form=page.getByRole("form",{name:"Primary assessor assignment",exact:true});await expect(form).toBeVisible();await expect(page.getByRole("button",{name:"Record moderation decision",exact:true})).toHaveCount(0);
  await form.getByLabel("Primary assessor account ID",{exact:true}).fill("assessor");await form.getByLabel("Primary assignment reason",{exact:true}).fill("Original UI assignment");await action("human_assign_external_assessor",()=>form.getByRole("button",{name:"Save primary assignment",exact:true}).click());await expect(form.getByLabel("Primary assessor account ID",{exact:true})).toHaveValue("assessor");
  expect(f.db.prepare("SELECT state FROM external_records WHERE id=?").get(record.recordId)!.state).toBe("pending");await page.getByRole("button",{name:"Sign out",exact:true}).click();await login("assessor");await page.getByRole("button",{name:"Administration",exact:true}).click();
  const notices=page.getByRole("region",{name:"Own assessment assignment notices",exact:true});await expect(notices).toContainText(record.recordId);await action("human_read_assessment_notice",()=>notices.getByRole("button",{name:"Mark assessment notice read",exact:true}).click());await expect(notices.getByRole("button",{name:"Mark assessment notice read",exact:true})).toHaveCount(0);
  await page.getByLabel("Moderation award ID",{exact:true}).fill("ui-primary");await action("learning_get_external_records",()=>page.getByRole("button",{name:"Load submissions",exact:true}).click());await expect(page.getByRole("button",{name:"Record moderation decision",exact:true})).toBeVisible();await expect(page.getByText("Original literal evidence <img src=x>",{exact:true})).toBeVisible();await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await page.getByLabel("Interface language",{exact:true}).selectOption("vi");await expect(page.getByRole("region",{name:"Thông báo phân công đánh giá của tôi",exact:true})).toBeVisible();await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:"artifacts/primary-assessor-assignment.png",fullPage:true});
 }finally{await page.close();app.server.closeAllConnections();await app.close();f.db.close();}
});
