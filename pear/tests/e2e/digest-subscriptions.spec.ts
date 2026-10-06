import {test,expect} from "@playwright/test";
import {fixture,data} from "../helpers.ts";
import {createApp} from "../../src/server/app.ts";
import {resolve} from "node:path";
test("learner reviews own in-app schedule, deterministic job creates a private notification, then reads, disables and deletes in EN/VI without learning effects",async({page})=>{
 test.setTimeout(90000);const f=fixture(),origin="http://127.0.0.1:4359";
 data(f.call("learner-a","learning_enroll",{courseId:"systems-basics"}));
 const before=f.db.prepare("SELECT * FROM enrollments").all();
 const {app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 const write=(tool:string)=>page.waitForResponse(response=>response.url().endsWith("/api/human/invoke")&&response.request().postDataJSON()?.toolName===tool);
 try{
  await app.listen({port:4359,host:"127.0.0.1"});await page.goto(origin);await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();await page.getByRole("button",{name:"My learning",exact:true}).click();
  let panel=page.getByRole("region",{name:"Scheduled in-app digest",exact:true});
  await expect(panel).toContainText("Digest schedule disabled");await expect(panel.getByRole("button",{name:"Save digest schedule",exact:true})).toBeDisabled();
  await panel.getByLabel("Enable my in-app digest",{exact:true}).check();await panel.getByLabel("Schedule time zone",{exact:true}).fill("Asia/Ho_Chi_Minh");await panel.getByLabel("Digest budget minutes",{exact:true}).fill("1");
  for(const day of ["Saturday","Sunday"])await panel.getByLabel(day,{exact:true}).check();
  await panel.getByLabel("I reviewed this own in-app schedule and retention",{exact:true}).check();let response=write("human_save_digest_preferences");await panel.getByRole("button",{name:"Save digest schedule",exact:true}).click();expect((await(await response).json()).ok).toBe(true);await expect(panel).toContainText("Digest schedule enabled");
  const due=f.db.prepare("SELECT next_run FROM digest_subscriptions WHERE learner='learner-a'").get()!.next_run as string;
  expect(f.service.digestSubscriptions.runBackground(due).generated).toBe(1);expect(f.service.digestSubscriptions.runBackground(due).generated).toBe(0);
  await page.reload();await page.getByRole("button",{name:"My learning",exact:true}).click();panel=page.getByRole("region",{name:"Scheduled in-app digest",exact:true});const history=panel.getByLabel("Own digest notifications",{exact:true});
  await expect(history).toContainText("Reliable systems basics");await expect(history.getByRole("heading",{name:"Digest notification",exact:true})).toHaveCount(1);
  response=write("human_read_digest_notification");await history.getByRole("button",{name:"Mark digest read",exact:true}).click();expect((await(await response).json()).ok).toBe(true);await expect(history).toContainText("Notification read");
  expect(data(f.call("learner-b","human_get_digest_notifications",{},"human")).total).toBe(0);expect(f.db.prepare("SELECT * FROM enrollments").all()).toEqual(before);
  await page.setViewportSize({width:390,height:844});await page.getByLabel("Interface language",{exact:true}).selectOption("vi");
  panel=page.getByRole("region",{name:"Digest theo lịch trong ứng dụng",exact:true});await expect(panel.getByRole("button",{name:"Lưu lịch digest",exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:"artifacts/reviewed-in-app-digest.png",fullPage:true});
  await panel.getByLabel("Bật digest của tôi trong ứng dụng",{exact:true}).uncheck();await panel.getByLabel("Tôi đã xem lại lịch trong ứng dụng và thời hạn lưu của mình",{exact:true}).check();response=write("human_save_digest_preferences");await panel.getByRole("button",{name:"Lưu lịch digest",exact:true}).click();expect((await(await response).json()).ok).toBe(true);await expect(panel).toContainText("Đã tắt lịch digest");expect(f.db.prepare("SELECT next_run FROM digest_subscriptions WHERE learner='learner-a'").get()!.next_run).toBe(null);
  page.once("dialog",dialog=>void dialog.accept());response=write("human_delete_digest_history");await panel.getByRole("button",{name:"Xóa lịch sử digest của tôi",exact:true}).click();expect((await(await response).json()).ok).toBe(true);await expect(panel).toContainText("Không có thông báo digest được lưu");
  expect(f.db.prepare("SELECT * FROM enrollments").all()).toEqual(before);expect(f.db.prepare("SELECT COUNT(*) AS n FROM digest_notifications").get()!.n).toBe(0);
  await page.getByLabel("Ngôn ngữ giao diện",{exact:true}).selectOption("en");console.log("SCHEDULED DIGEST ASSERTIONS COMPLETE");
 }finally{await page.close();app.server.closeAllConnections();await app.close();f.db.close();}
});
