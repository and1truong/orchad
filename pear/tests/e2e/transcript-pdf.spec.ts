import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {transcriptFixture} from "../transcript-pdf-fixture.ts";
import {createApp} from "../../src/server/app.ts";
import {resolve} from "node:path";
test("own server transcript downloads via current cookie/epoch and keyboard in EN/VI without official learning changes",async({page})=>{
 test.setTimeout(90000);const f=transcriptFixture(2),origin="http://127.0.0.1:4378",before=JSON.stringify(f.db.prepare("SELECT * FROM enrollments ORDER BY id").all()),{app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 try{
  await app.listen({port:4378,host:"127.0.0.1"});await page.goto(origin);await page.getByLabel("Account",{exact:true}).fill("learner-a");await page.getByLabel("Password",{exact:true}).fill("learner-a-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();await page.getByRole("button",{name:"Transcript",exact:true}).click();
  const button=page.getByRole("button",{name:"Download original server transcript PDF",exact:true});await expect(button).toBeEnabled();const download=page.waitForEvent("download");await button.focus();await page.keyboard.press("Enter");const file=await download;expect(file.suggestedFilename()).toBe("pear-transcript.pdf");const path=await file.path();expect(path).toBeTruthy();const text=execFileSync("pdftotext",["-","-"],{input:readFileSync(path!),encoding:"utf8"});expect(text).toContain("Nguyễn Trường");expect(text).toContain("Nội dung gốc 0 <script>literal</script>");expect(text).toContain("Nội dung gốc 1 <script>literal</script>");expect(text).not.toContain("learner-b");expect(text).not.toContain("systems-basics");expect(text).toContain("Not accredited");expect(JSON.stringify(f.db.prepare("SELECT * FROM enrollments ORDER BY id").all())).toBe(before);expect(f.db.prepare("SELECT count(*) n FROM certificates").get()!.n).toBe(0);
  await page.getByLabel("Interface language",{exact:true}).selectOption("vi");await expect(page.getByRole("button",{name:"Tải PDF bảng ghi học tập gốc từ máy chủ",exact:true})).toBeVisible();
 }finally{await page.close();app.server.closeAllConnections();await app.close();f.db.close();}
});
