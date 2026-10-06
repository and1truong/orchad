import {test,expect} from "@playwright/test";
import {shareFixture,offerArgs} from "../collection-sharing-fixture.ts";
import {data} from "../helpers.ts";
import {createApp} from "../../src/server/app.ts";
import {resolve} from "node:path";
test("Vietnamese human diagnostic preserves English wire and rejects foreign reference without official mutation",async({page})=>{
 test.setTimeout(90000);const f=shareFixture(),origin="http://127.0.0.1:4374";
 data(f.call("admin","human_offer_original_collection",offerArgs,"human"));
 const {app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 try{
  await app.listen({port:4374,host:"127.0.0.1"});await page.goto(origin);
  await page.getByLabel("Account",{exact:true}).fill("receiver");await page.getByLabel("Password",{exact:true}).fill("receiver-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();await page.getByRole("button",{name:"Administration",exact:true}).click();
  await page.getByLabel("Interface language",{exact:true}).selectOption("vi");
  const form=page.getByRole("form",{name:"Xem xét bản sao cấu hình gốc",exact:true});await expect(form).toContainText(f.award.title);await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await form.getByLabel("Mã nội dung bên nhận có quyền dùng",{exact:true}).fill("share-source-course");await form.getByLabel("Phiên bản nội dung bên nhận đã xem xét",{exact:true}).fill("1");await form.getByLabel("Tôi đã xem xét cấu hình gốc này và quyền dùng nội dung bên nhận.",{exact:true}).check();
  const before=JSON.stringify(f.db.prepare("SELECT * FROM workspaces WHERE id='library:other'").get()),response=page.waitForResponse(r=>r.url().endsWith("/api/human/invoke")&&r.request().postDataJSON()?.toolName==="human_accept_original_collection_offer");
  await form.getByRole("button",{name:"Tạo bản nháp cấu hình gốc đã xem xét",exact:true}).click();const result=await(await response).json();expect(result.ok).toBe(false);expect(result.error.code).toBe("STALE_CONTEXT");expect(result.error.message).toBe("Destination reference is unavailable or version changed");
  await expect(page.getByRole("alert").filter({hasText:"STALE_CONTEXT: Nội dung tham chiếu ở bên nhận không khả dụng hoặc phiên bản đã thay đổi."})).toBeVisible();
  expect(JSON.stringify(f.db.prepare("SELECT * FROM workspaces WHERE id='library:other'").get())).toBe(before);expect(f.db.prepare("SELECT 1 FROM collections WHERE id='share-receiver-award'").get()).toBe(undefined);expect(f.db.prepare("SELECT state FROM original_collection_offers").get()!.state).toBe("pending");
 }finally{await page.close();app.server.closeAllConnections();await app.close();f.db.close();}
});
