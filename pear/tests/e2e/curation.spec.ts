import {test,expect,type Page} from "@playwright/test";
async function login(page:Page,id:string){
 await page.goto("/");await page.getByLabel("Account",{exact:true}).fill(id);
 await page.getByLabel("Password",{exact:true}).fill(id+"-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();
 await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();
}
test("human promotes original content, reviews retirement impact, finds an explicit replacement and retains pinned reading",async({page})=>{
 await login(page,"editor");await page.getByRole("button",{name:"Administration",exact:true}).click();
 const library=page.getByRole("region",{name:"Reusable content library",exact:true});
 for(const [id,title,body] of [
  ["e2e-curation-source","Curation original source","Original pinned curation body."],
  ["e2e-curation-replacement","Curation reviewed alternative","Replacement body chosen explicitly."]
 ]){
  await library.getByLabel("Item ID",{exact:true}).fill(id);
  await library.getByLabel("Item title",{exact:true}).fill(title);
  await library.getByLabel("Item summary",{exact:true}).fill("Self-authored lifecycle fixture");
  await library.getByRole("textbox",{name:"Item text",exact:true}).fill(body);
  await library.getByRole("button",{name:"Save item draft",exact:true}).click();
  const row=library.locator(".learning-row").filter({has:page.getByRole("heading",{name:title,exact:true})});
  await row.getByRole("button",{name:"Publish item",exact:true}).click();
  await expect(row).toContainText("Published version 1");
  await library.getByRole("button",{name:"New item",exact:true}).click();
 }
 const curation=page.getByRole("region",{name:"Content curation",exact:true});
 await curation.getByLabel("Curation content type",{exact:true}).selectOption("item");
 await curation.getByLabel("Curation content ID",{exact:true}).fill("e2e-curation-source");
 await curation.getByLabel("Organization featured",{exact:true}).check();
 await curation.getByLabel("Curation change reason",{exact:true}).fill("Reviewed original organization content");
 await curation.getByRole("button",{name:"Save curation policy",exact:true}).click();
 await expect(curation.getByRole("status")).toContainText("Curation saved");
 await page.getByRole("button",{name:"Sign out",exact:true}).click();await login(page,"learner-a");
 const picks=page.getByRole("region",{name:"Organization curated content",exact:true});
 await expect(picks).toContainText("Curation original source");
 await picks.getByRole("button",{name:"Preview organization pick",exact:true}).click();
 const reader=page.getByRole("region",{name:"Standalone item reader",exact:true});
 await reader.getByRole("button",{name:"Track this standalone version",exact:true}).click();
 await expect(reader).toContainText("Tracked · In progress");
 await page.getByRole("button",{name:"Sign out",exact:true}).click();await login(page,"editor");
 await page.getByRole("button",{name:"Administration",exact:true}).click();
 await curation.getByLabel("Curation content type",{exact:true}).selectOption("item");
 await curation.getByLabel("Curation content ID",{exact:true}).fill("e2e-curation-source");
 await curation.getByLabel("Replacement content ID",{exact:true}).fill("e2e-curation-replacement");
 await curation.getByLabel("Curation change reason",{exact:true}).fill("Reviewed pinned learner impact");
 await expect(curation.getByRole("button",{name:"Retire with reviewed replacement",exact:true})).toBeDisabled();
 await curation.getByRole("button",{name:"Preview retirement impact",exact:true}).click();
 await expect(curation).toContainText("1 pinned enrollments");
 await curation.getByRole("button",{name:"Retire with reviewed replacement",exact:true}).click();
 await expect(curation.getByRole("status")).toContainText("existing learning preserved");
 await page.getByRole("button",{name:"Sign out",exact:true}).click();await login(page,"learner-a");
 await expect(picks).not.toContainText("Curation original source");
 const alternatives=picks.getByRole("form",{name:"Retired content alternatives",exact:true});
 await alternatives.getByLabel("Retired content type",{exact:true}).selectOption("item");
 await alternatives.getByLabel("Retired content ID",{exact:true}).fill("e2e-curation-source");
 await alternatives.getByRole("button",{name:"Find reviewed alternative",exact:true}).click();
 await picks.getByRole("button",{name:"Preview reviewed alternative",exact:true}).click();
 await expect(reader).toContainText("Replacement body chosen explicitly.");
 await expect(reader).not.toContainText("Original pinned curation body.");
 await page.getByRole("button",{name:"My learning",exact:true}).click();
 const tracked=page.getByRole("region",{name:"Standalone learning",exact:true}).locator(".learning-row")
  .filter({has:page.getByRole("heading",{name:"Curation original source",exact:true})});
 await tracked.getByRole("button",{name:"Open tracked item",exact:true}).click();
 await expect(reader).toContainText("Original pinned curation body.");
 await expect(reader).not.toContainText("Replacement body chosen explicitly.");
 await page.screenshot({path:"artifacts/curation-pinned-retirement.png",fullPage:true});
});
