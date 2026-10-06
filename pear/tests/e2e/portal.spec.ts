import {test,expect} from "@playwright/test";
import {fixture} from "../helpers.ts";
import {createApp} from "../../src/server/app.ts";
import {resolve} from "node:path";
test("admin portal presentation persists, renders literal text, reaches only own organization and never appears as editor settings",async({page})=>{
 test.setTimeout(90000);const f=fixture(),origin="http://127.0.0.1:4354",{app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 async function login(user:string){await page.goto(origin);await page.getByLabel("Account",{exact:true}).fill(user);await page.getByLabel("Password",{exact:true}).fill(user+"-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();}
 try{
  await app.listen({port:4354,host:"127.0.0.1"});await login("admin");await page.getByRole("button",{name:"Administration",exact:true}).click();const settings=page.getByRole("region",{name:"Organization portal settings",exact:true});
  await settings.getByLabel("Portal display name",{exact:true}).fill("Original organization academy");await settings.getByLabel("Portal tagline",{exact:true}).fill("<img src=x onerror=alert(1)>");await settings.getByLabel("Portal color palette",{exact:true}).selectOption("navy");await settings.getByRole("button",{name:"Save organization portal settings",exact:true}).click();await expect(settings.getByRole("status")).toContainText("Organization portal settings saved");
  const brand=page.getByLabel("Organization learning portal",{exact:true});await expect(brand).toContainText("Original organization academy");await expect(brand).toContainText("<img src=x onerror=alert(1)>");await expect(brand.locator("img")).toHaveCount(0);
  await page.reload();await expect(brand).toContainText("Original organization academy");await page.getByRole("button",{name:"Sign out",exact:true}).click();await login("editor");await expect(brand).toContainText("Original organization academy");await page.getByRole("button",{name:"Administration",exact:true}).click();await expect(settings).toHaveCount(0);
  await page.getByRole("button",{name:"Sign out",exact:true}).click();await login("outsider");await expect(brand).not.toContainText("Original organization academy");await expect(brand).toContainText("Pear");
  await page.getByRole("button",{name:"Sign out",exact:true}).click();await login("admin");await page.getByRole("button",{name:"Administration",exact:true}).click();await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.getByLabel("Interface language",{exact:true}).selectOption("vi");await expect(page.getByRole("heading",{name:"Thiết lập portal tổ chức",exact:true})).toBeVisible();await page.screenshot({path:"artifacts/organization-portal-settings.png",fullPage:true});
 }finally{await page.close();app.server.closeAllConnections();await app.close();f.db.close();}
});
