import {test,expect} from "@playwright/test";
import {createApp} from "../../src/server/app.ts";
import {translationFixture} from "../translation-fixture.ts";
import {data} from "../helpers.ts";
import {resolve} from "node:path";
test("human reviews an authored language variant; learner sees one identity, chooses a disclosed preview and keeps existing learning",async({page})=>{
 const f=translationFixture(),origin="http://127.0.0.1:4319";
 const enrolled=data(f.call("learner-a","learning_enroll",{courseId:"systems-basics"}));
 data(f.call("learner-a","human_complete_lesson",{enrollmentId:enrolled.enrollmentId,lessonId:"retry"},"human"));
 const before=JSON.stringify(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(enrolled.enrollmentId));
 const {app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 async function login(id:string){await page.getByLabel("Account",{exact:true}).fill(id);await page.getByLabel("Password",{exact:true}).fill(id+"-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();}
 try{
  await app.listen({port:4319,host:"127.0.0.1"});await page.goto(origin);await login("admin");
  await page.getByRole("button",{name:"Administration",exact:true}).click();
  const review=page.getByRole("region",{name:"Translation review settings",exact:true});
  await review.getByLabel("Original content ID",{exact:true}).fill("systems-basics");
  await review.getByLabel("Derivative content ID",{exact:true}).fill("systems-vi");
  await review.getByLabel("Human translation quality review",{exact:true}).fill("Original fixture derivative reviewed; no automatic translation claim");
  await review.getByLabel("Translation review reason",{exact:true}).fill("Human-approved original language variants");
  await review.getByRole("button",{name:"Link reviewed language variant",exact:true}).click();
  await expect(review.getByRole("button",{name:"Disable reviewed variant",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Sign out",exact:true}).click();await login("learner-a");
  const previews=page.getByRole("region",{name:"Course preview",exact:true});
  const original=page.getByRole("article").filter({has:page.getByRole("heading",{name:"Reliable systems basics",exact:true})});
  await original.getByRole("button",{name:"Preview",exact:true}).click();
  const variants=previews.getByRole("region",{name:"Reviewed content language variants",exact:true});
  await variants.getByLabel("Preferred variant language",{exact:true}).selectOption("vi");
  await expect(variants.getByText("Preferred reviewed variant",{exact:true})).toBeVisible();
  await variants.getByRole("button",{name:"Preview this language variant",exact:true}).last().click();
  await expect(previews.getByRole("heading",{name:"Nền tảng hệ thống tin cậy",exact:true})).toBeVisible();
  await expect(previews.getByText("Human-authored derivative reviewed by a human",{exact:false})).toBeVisible();
  expect(JSON.stringify(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(enrolled.enrollmentId))).toBe(before);
  expect(f.db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE learner='learner-a'").get()!.n).toBe(1);
  expect(f.db.prepare("SELECT COUNT(*) AS n FROM certificates").get()!.n).toBe(0);
  await page.screenshot({path:"artifacts/reviewed-language-identity.png",fullPage:true});
 }finally{await app.close();f.db.close();}
});
