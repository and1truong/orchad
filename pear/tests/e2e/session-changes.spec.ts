import {test,expect} from "@playwright/test";
import {fixture,data} from "../helpers.ts";
import {courses} from "../../src/server/seed.ts";
import {createApp} from "../../src/server/app.ts";
import {resolve} from "node:path";
test("human reschedules and cancels a published session; learner reads own notice, explicitly rebooks and downloads cancelled calendar",async({page})=>{
 test.setTimeout(90000);
 page.on("pageerror",e=>console.error("session lifecycle page error: "+e.message));
 const f=fixture(),origin="http://127.0.0.1:4349",start=Date.now()+86400000,definition={id:"session-change-ui",startsAt:new Date(start).toISOString(),endsAt:new Date(start+3600000).toISOString(),cutoffAt:new Date(start-3600000).toISOString(),timezone:"Asia/Ho_Chi_Minh",capacity:2,location:"Original room"};
 const course={...structuredClone(courses["systems-basics"]),title:"Original changed workshop",lessons:[{id:"event",title:"Changed workshop",text:"Attend with the human instructor",kind:"event" as const,prerequisiteIds:[],sessions:[definition]}]};
 data(f.call("editor","learning_create_course",{courseId:"session-change-ui",course}));data(f.call("editor","learning_publish_course",{courseId:"session-change-ui"}));
 const enrollmentId=data(f.call("learner-a","learning_enroll",{courseId:"session-change-ui"})).enrollmentId;
 data(f.call("learner-a","learning_book_session",{enrollmentId,lessonId:"event",sessionId:definition.id}));
 const {app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 async function login(user:string){await page.goto(origin);await page.getByLabel("Account",{exact:true}).fill(user);await page.getByLabel("Password",{exact:true}).fill(user+"-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();}
 async function manage(){await page.getByRole("button",{name:"Administration",exact:true}).click();const region=page.getByRole("region",{name:"Session schedule management",exact:true});await region.getByLabel("Session course ID",{exact:true}).fill("session-change-ui");await region.getByRole("button",{name:"Load course sessions",exact:true}).click();await expect(region).toContainText("session-change-ui");await region.getByRole("button",{name:"Change session schedule",exact:true}).click();const form=region.getByRole("form",{name:"Session change",exact:true});try{await expect(form).toBeVisible({timeout:5000});}catch(e){console.error("session lifecycle rendered region: "+(await region.innerText()).slice(0,6000));throw e;}return form;}
 async function resume(){await page.getByRole("button",{name:"My learning",exact:true}).click();await page.locator(".learning-row").filter({has:page.getByRole("heading",{name:course.title,exact:true})}).getByRole("button",{name:"Continue learning",exact:true}).click();return page.getByRole("region",{name:"Blended lesson",exact:true});}
 try{
  await app.listen({port:4349,host:"127.0.0.1"});await login("editor");let change=await manage();await change.getByLabel("Session action",{exact:true}).selectOption("reschedule");
  await change.getByLabel("Session start",{exact:true}).fill(new Date(start+86400000).toISOString());await change.getByLabel("Session end",{exact:true}).fill(new Date(start+86400000+3600000).toISOString());await change.getByLabel("Booking cutoff",{exact:true}).fill(new Date(start+86400000-3600000).toISOString());
  await change.getByLabel("Session change reason",{exact:true}).fill("Instructor moved the workshop");await change.getByLabel("Confirm cancellation of existing bookings",{exact:true}).check();await change.getByRole("button",{name:"Apply session change",exact:true}).click();await expect(change).toHaveCount(0);
  await expect(page.getByRole("region",{name:"Session schedule management",exact:true})).toContainText("0 active bookings");await page.getByRole("button",{name:"Sign out",exact:true}).click();
  await login("learner-a");await page.getByRole("button",{name:"Notifications",exact:true}).click();const notices=page.getByRole("region",{name:"Session change notices",exact:true});await expect(notices).toContainText("Session schedule changed");await notices.getByRole("button",{name:"Mark session notice read",exact:true}).click();await expect(notices).toContainText("Session notice read");
  let player=await resume();await expect(player).toContainText("Booking · cancelled");await player.getByRole("button",{name:"Book session",exact:true}).click();await expect(player).toContainText("Booking · booked");
  await page.getByRole("button",{name:"Sign out",exact:true}).click();await login("editor");change=await manage();await change.getByLabel("Session action",{exact:true}).selectOption("cancel");await change.getByLabel("Session change reason",{exact:true}).fill("Workshop cancelled by instructor");await change.getByLabel("Confirm cancellation of existing bookings",{exact:true}).check();await change.getByRole("button",{name:"Apply session change",exact:true}).click();await expect(change).toHaveCount(0);
  await page.getByRole("button",{name:"Sign out",exact:true}).click();await login("learner-a");player=await resume();await expect(player).toContainText("Session cancelled");await expect(player.getByRole("button",{name:"Book session",exact:true})).toBeDisabled();await expect(player.getByRole("button",{name:"Cancel booking",exact:true})).toHaveCount(0);
  const downloaded=page.waitForEvent("download");await player.getByRole("button",{name:"Download cancelled calendar",exact:true}).last().click();expect((await downloaded).suggestedFilename()).toBe("pear-session.ics");
  await page.getByLabel("Interface language",{exact:true}).selectOption("vi");await expect(page.getByRole("button",{name:"Tải lịch đã hủy",exact:true}).last()).toBeVisible();
  await page.screenshot({path:"artifacts/session-change-cancelled.png",fullPage:true});expect(f.db.prepare("SELECT COUNT(*) AS n FROM event_session_changes").get()!.n).toBe(2);expect(f.db.prepare("SELECT completed_lessons FROM enrollments WHERE id=?").get(enrollmentId)!.completed_lessons).toBe("[]");
 }finally{await app.close();f.db.close();}
});
