import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {transcriptFixture} from "../transcript-pdf-fixture.ts";
import {createApp} from "../../src/server/app.ts";
import {resolve} from "node:path";
test("manager downloads server report with exact all-access/all-columns scope in real EN/VI browser without another learner",async({page})=>{
 test.setTimeout(90000);const f=transcriptFixture(1),origin="http://127.0.0.1:4380",before=JSON.stringify(f.db.prepare("SELECT * FROM enrollments ORDER BY id").all()),{app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 try{
  await app.listen({port:4380,host:"127.0.0.1"});await page.goto(origin);await page.getByLabel("Account",{exact:true}).fill("manager");await page.getByLabel("Password",{exact:true}).fill("manager-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();await page.getByRole("button",{name:"Administration",exact:true}).click();const report=page.getByRole("region",{name:"Report builder",exact:true});await expect(report).toContainText("Nội dung gốc 0");
  await report.getByLabel("Export rows",{exact:true}).selectOption("all");await report.getByLabel("Export columns",{exact:true}).selectOption("all");const button=report.getByRole("button",{name:"Download original server report PDF",exact:true});await expect(button).toBeEnabled();const download=page.waitForEvent("download");await button.click();const file=await download;expect(file.suggestedFilename()).toBe("pear-report.pdf");const path=await file.path();expect(path).toBeTruthy();const text=execFileSync("pdftotext",["-","-"],{input:readFileSync(path!),encoding:"utf8"});expect(text).toContain("Rows all · Columns all");expect(text).toContain("learnerId: learner-a");expect(text).toContain("Nguyễn Trường");expect(text).toContain("Nội dung gốc 0 <script>literal</script>");expect(text).not.toContain("learner-b");expect(text).not.toContain("systems-basics");expect(text).toContain("Not accredited");expect(JSON.stringify(f.db.prepare("SELECT * FROM enrollments ORDER BY id").all())).toBe(before);
  await page.getByLabel("Interface language",{exact:true}).selectOption("vi");await expect(page.getByRole("button",{name:"Tải PDF báo cáo gốc từ máy chủ",exact:true})).toBeVisible();
 }finally{await page.close();app.server.closeAllConnections();await app.close();f.db.close();}
});
