import {test,expect} from "@playwright/test";
import {awardItemsFixture} from "../award-items-fixture.ts";
import {createApp} from "../../src/server/app.ts";
import {resolve} from "node:path";
test("actual EN award chooses pinned standalone reading and separate VI human confirmation derives truthful award credit",async({page})=>{
 test.setTimeout(90000);const f=awardItemsFixture(),origin="http://127.0.0.1:4384",{app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 async function write(tool:string,click:()=>Promise<void>){const response=page.waitForResponse(r=>r.url().endsWith("/api/human/invoke")&&r.request().postDataJSON()?.toolName===tool);await click();const result=await(await response).json();expect(result.ok,JSON.stringify(result.error)).toBe(true);}
 try{
  await app.listen({port:4384,host:"127.0.0.1"});await page.goto(origin);await page.getByLabel("Account",{exact:true}).fill("learner-a");await page.getByLabel("Password",{exact:true}).fill("learner-a-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Programs",exact:true}).click();const programs=page.getByRole("region",{name:"Programs",exact:true});await expect(programs).toContainText("Only real human-confirmed reading");expect(f.db.prepare("SELECT completed_at FROM award_enrollments WHERE id=?").get(f.e.awardEnrollmentId)!.completed_at).toBeNull();
  await write("learning_enroll_item",()=>programs.getByRole("button",{name:"Study standalone item for this award",exact:true}).click());const tracked=page.getByRole("region",{name:"Standalone learning",exact:true});await tracked.getByRole("button",{name:"Open tracked item",exact:true}).click();const reader=page.getByRole("region",{name:"Standalone item reader",exact:true});await expect(reader).toContainText("Original learner-confirmed standalone reading.");
  await page.getByLabel("Interface language",{exact:true}).selectOption("vi");const vi=page.getByRole("region",{name:"Trình đọc nội dung độc lập",exact:true}),confirm=vi.getByRole("button",{name:"Xác nhận đã đọc nội dung độc lập",exact:true});await expect(confirm).toBeDisabled();await vi.getByLabel("Tôi xác nhận đã học phiên bản nội dung độc lập này.",{exact:true}).check();await write("human_complete_item",()=>confirm.click());await expect(confirm).toBeDisabled();
  const award=f.db.prepare("SELECT * FROM award_enrollments WHERE id=?").get(f.e.awardEnrollmentId)!;expect(award.completed_at).toBeTruthy();expect(award.certificate_id).toBeTruthy();expect(f.db.prepare("SELECT count(*) n FROM attempts").get()!.n).toBe(0);expect(f.db.prepare("SELECT count(*) n FROM certificates").get()!.n).toBe(0);expect(f.db.prepare("SELECT completed_at FROM item_enrollments").get()!.completed_at).toBeTruthy();
  await page.getByRole("button",{name:"Chương trình",exact:true}).click();await expect(page.getByRole("region",{name:"Chương trình",exact:true})).toContainText("2 / 2");
 }finally{await page.close();app.server.closeAllConnections();await app.close();f.db.close();}
});
