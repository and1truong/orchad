import {test,expect} from "@playwright/test";
import {fixture,data} from "../helpers.ts";
import {createApp} from "../../src/server/app.ts";
import {resolve} from "node:path";
test("manager report chart uses entire filtered authorized snapshot, reconciles counts, clears on changed filters and renders explanatory mobile labels",async({page})=>{
 test.setTimeout(90000);
 const f=fixture(),origin="http://127.0.0.1:4352";
 data(f.call("learner-a","learning_enroll",{courseId:"systems-basics"}));const overdue=data(f.call("learner-a","learning_enroll",{courseId:"learning-vi"})).enrollmentId;f.db.prepare("UPDATE enrollments SET due_date='2000-01-01T00:00:00.000Z' WHERE id=?").run(overdue);data(f.call("learner-b","learning_enroll",{courseId:"privacy-basics"}));
 const before=f.db.prepare("SELECT * FROM enrollments").all(),{app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 try{
  await app.listen({port:4352,host:"127.0.0.1"});await page.goto(origin);await page.getByLabel("Account",{exact:true}).fill("manager");await page.getByLabel("Password",{exact:true}).fill("manager-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();await page.getByRole("button",{name:"Administration",exact:true}).click();
  const reports=page.getByRole("region",{name:"Report builder",exact:true}),chart=reports.getByRole("figure",{name:"Filtered report status chart",exact:true});await expect(chart).toContainText("2 learning records");
  await expect(chart.getByRole("row",{name:/overdue/}).getByRole("cell").first()).toHaveText("1");await expect(chart.getByRole("row",{name:/in_progress/}).getByRole("cell").first()).toHaveText("1");await expect(chart).toContainText("not unique people");
  await reports.getByLabel("Report status",{exact:true}).selectOption("completed");await expect(chart).toContainText("0 learning records");await expect(chart).toContainText("No matching learning records.");
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.getByLabel("Interface language",{exact:true}).selectOption("vi");await expect(page.getByRole("figure",{name:"Biểu đồ trạng thái báo cáo đã lọc",exact:true})).toBeVisible();
  expect(f.db.prepare("SELECT * FROM enrollments").all()).toEqual(before);await page.screenshot({path:"artifacts/scoped-filtered-report-chart.png",fullPage:true});
 }finally{await page.close();app.server.closeAllConnections();await app.close();f.db.close();}
});
