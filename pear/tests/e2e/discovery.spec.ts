import {test,expect,type Page} from "@playwright/test";
async function login(page:Page,id:string){
 await page.goto("/");await page.getByLabel("Account",{exact:true}).fill(id);
 await page.getByLabel("Password",{exact:true}).fill(id+"-dev");
 await page.getByRole("button",{name:"Sign in",exact:true}).click();
 await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();
}
test("human reviews controlled discovery, intersects language filters and compares explicit published sources",async({page})=>{
 await login(page,"learner-a");
 const panel=page.getByRole("region",{name:"Advanced course discovery",exact:true});
 await panel.getByLabel("Exact provider",{exact:true}).fill("Pear Originals");
 await panel.getByLabel("Retrieval mode",{exact:true}).selectOption("concepts");
 await panel.getByLabel("Advanced search keywords",{exact:true}).fill("recover a lost response");
 await panel.getByRole("button",{name:"Search reviewed filters",exact:true}).click();
 await expect(panel.getByRole("heading",{name:"Reliable systems basics",exact:true})).toBeVisible();
 await panel.getByLabel("Discovery language",{exact:true}).selectOption("vi");
 await panel.getByRole("button",{name:"Search reviewed filters",exact:true}).click();
 await expect(panel.locator(".learning-row")).toHaveCount(0);
 await panel.getByLabel("Advanced search keywords",{exact:true}).fill("");
 await panel.getByLabel("Discovery language",{exact:true}).selectOption("");
 await panel.getByRole("button",{name:"Search reviewed filters",exact:true}).click();
 await panel.getByRole("checkbox",{name:"Compare Reliable systems basics",exact:true}).check();
 await panel.getByRole("checkbox",{name:"Compare Học tập có chủ đích",exact:true}).check();
 await panel.getByRole("button",{name:"Compare selected courses",exact:true}).click();
 await expect(panel.getByRole("table")).toBeVisible();
 await expect(panel.getByRole("table").locator("tbody tr")).toHaveCount(2);
 await expect(panel.getByRole("table")).toContainText("Unknown");
 await page.screenshot({path:"artifacts/discovery-reviewed-comparison.png",fullPage:true});
});
