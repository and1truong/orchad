import {test,expect,type Page} from "@playwright/test";
async function login(page:Page,id:string){
  await page.goto("/");await page.getByLabel("Account",{exact:true}).fill(id);
  await page.getByLabel("Password",{exact:true}).fill(id+"-dev");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();
}
test("human opts into a study timer, pauses and reloads a persisted measurement without official progress",async({page})=>{
  await login(page,"admin");
  await page.getByRole("button",{name:"Administration",exact:true}).click();
  const user=page.getByRole("form",{name:"User editor",exact:true});
  await user.getByLabel("User ID",{exact:true}).fill("e2e-study-timer");
  await user.getByLabel("User name",{exact:true}).fill("Study timer learner");
  await user.getByRole("button",{name:"Save user",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Study timer learner",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Sign out",exact:true}).click();
  await login(page,"e2e-study-timer");
  const course=page.locator("article").filter({has:page.getByRole("heading",{name:"Reliable systems basics",exact:true})});
  await course.getByRole("button",{name:"Enroll",exact:true}).click();
  await page.getByRole("button",{name:"My learning",exact:true}).click();
  await page.getByRole("button",{name:"Continue learning",exact:true}).click();
  const timer=page.getByRole("region",{name:"Optional study timer",exact:true});
  await expect(timer).toContainText("0 seconds");
  await timer.getByRole("button",{name:"Start study timer",exact:true}).click();
  await expect(timer).toContainText("Running");
  await expect.poll(async()=>{
    const text=await timer.innerText();return Number(/Study timer: (\d+) seconds/.exec(text)?.[1]??0);
  },{timeout:25000}).toBeGreaterThan(0);
  await timer.getByRole("button",{name:"Pause study timer",exact:true}).click();
  await expect(timer).toContainText("Paused");
  const seconds=Number(/Study timer: (\d+) seconds/.exec(await timer.innerText())![1]);
  await expect(page.locator(".learning-row")).toContainText("0/2");
  await page.reload();await page.getByRole("button",{name:"My learning",exact:true}).click();
  await page.getByRole("button",{name:"Continue learning",exact:true}).click();
  await expect(timer).toContainText(seconds+" seconds");
  await expect(timer.getByRole("button",{name:"Start study timer",exact:true})).toBeEnabled();
  await expect(page.getByRole("button",{name:"Start assessment",exact:true})).toBeDisabled();
  await page.screenshot({path:"artifacts/opt-in-study-timer.png",fullPage:true});
});
