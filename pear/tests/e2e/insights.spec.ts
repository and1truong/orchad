import {test,expect} from "@playwright/test";
import {createApp} from "../../src/server/app.ts";
import {fixture,data} from "../helpers.ts";
import {courses} from "../../src/server/seed.ts";
import {resolve} from "node:path";
test("learner requests own explained insight metrics and pinned sources; account switch clears results and Vietnamese labels persist",async({page})=>{
 test.setTimeout(90000);
 const f=fixture(),origin="http://127.0.0.1:4350",course={...structuredClone(courses["systems-basics"]),title:"Original insight source",discovery:{skills:["Original reliability"],industries:[],outcomes:[],accessibility:{features:[],provenance:"author_declared" as const}}};
 data(f.call("editor","learning_create_course",{courseId:"insights-ui",course}));data(f.call("editor","learning_publish_course",{courseId:"insights-ui"}));data(f.call("learner-a","learning_enroll",{courseId:"insights-ui"}));data(f.call("learner-b","learning_enroll",{courseId:"learning-vi"}));
 const before=f.db.prepare("SELECT * FROM enrollments").all(),{app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 async function login(user:string){await page.goto(origin);await page.getByLabel("Account",{exact:true}).fill(user);await page.getByLabel("Password",{exact:true}).fill(user+"-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();}
 try{
  await app.listen({port:4350,host:"127.0.0.1"});await login("learner-a");await page.getByRole("button",{name:"My learning",exact:true}).click();const insights=page.getByRole("region",{name:"My learning insights",exact:true});await expect(insights.getByLabel("Own insight results",{exact:true})).toHaveCount(0);await insights.getByRole("button",{name:"Read my learning insights",exact:true}).click();
  const result=insights.getByLabel("Own insight results",{exact:true});await expect(result).toContainText("Original reliability");await expect(result).toContainText("Original insight source");await expect(result).toContainText("insights-ui");await expect(result).toContainText("not mastery");await expect(result).not.toContainText("Học tập có chủ đích");
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:"artifacts/own-learning-insights.png",fullPage:true});
  await page.getByRole("button",{name:"Sign out",exact:true}).click();await login("learner-b");await page.getByRole("button",{name:"My learning",exact:true}).click();await expect(insights.getByLabel("Own insight results",{exact:true})).toHaveCount(0);await insights.getByRole("button",{name:"Read my learning insights",exact:true}).click();await expect(insights.getByLabel("Own insight results",{exact:true})).not.toContainText("Original insight source");
  await page.getByLabel("Interface language",{exact:true}).selectOption("vi");await expect(page.getByRole("heading",{name:"Thông tin việc học của tôi",exact:true})).toBeVisible();expect(f.db.prepare("SELECT * FROM enrollments").all()).toEqual(before);
 }finally{await app.close();f.db.close();}
});
