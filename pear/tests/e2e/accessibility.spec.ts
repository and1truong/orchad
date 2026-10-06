import {test,expect,type Page} from "@playwright/test";
import {createApp} from "../../src/server/app.ts";
import {fixture} from "../helpers.ts";
import {resolve} from "node:path";
test("mobile, tablet and desktop reflow; keyboard skip/navigation/lesson/quiz and semantic landmarks have recorded evidence",async({page},testInfo)=>{
 const f=fixture(),origin="http://127.0.0.1:4322",checks:any[]=[];
 const {app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist")});
 async function login(id:string){await page.getByLabel("Account",{exact:true}).fill(id);await page.getByLabel("Password",{exact:true}).fill(id+"-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();}
 async function reflow(surface:string){const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));expect(layout.scroll,surface+" must reflow without page-level horizontal scrolling").toBeLessThanOrEqual(layout.width+1);checks.push({surface,...layout});}
 async function keyboardButton(name:string){const button=page.getByRole("button",{name,exact:true});await expect(button).toBeEnabled();await button.focus();await expect(button).toBeFocused();await page.keyboard.press("Enter");}
 try{
  await app.listen({port:4322,host:"127.0.0.1"});await page.goto(origin);await login("learner-a");
  await expect(page.getByRole("main")).toHaveCount(1);await expect(page.getByRole("navigation",{name:"Learning navigation",exact:true})).toBeVisible();expect(await page.locator("html").getAttribute("lang")).toBe("en");
  await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();});await page.keyboard.press("Control+Home");await page.keyboard.press("Tab");
  const skip=page.getByRole("link",{name:"Skip to learning content",exact:true});await skip.focus();await expect(skip).toBeFocused();await expect(skip).toBeInViewport();await page.keyboard.press("Enter");await expect(page.getByRole("main")).toBeFocused();
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:960});await keyboardButton("Explore");await expect(page.getByRole("button",{name:"Explore",exact:true})).toHaveAttribute("aria-current","page");await reflow("catalog-"+width);
   for(const name of ["My learning","Programs","Imported packages","Notifications","Transcript","Learning preferences"]){await keyboardButton(name);await expect(page.locator("main h1")).toBeFocused();await reflow(name+"-"+width);}
  }
  await page.setViewportSize({width:390,height:844});await keyboardButton("Explore");
  await page.getByLabel("Content language").selectOption("vi");
  await expect(page.locator(".cards article")).toHaveCount(1);await keyboardButton("Enroll");await expect(page.getByRole("heading",{name:"Học tập có chủ đích",exact:true})).toBeVisible();
  await keyboardButton("Continue learning");await expect(page.locator(".lesson-text")).toBeVisible();
  await keyboardButton("I have studied this lesson");await expect(page.getByRole("button",{name:"Lesson acknowledged ✓",exact:true})).toBeDisabled();await keyboardButton("Start assessment");
  const answer=page.getByLabel("Tự giải thích rồi đối chiếu",{exact:true});await answer.focus();await page.keyboard.press("Space");await expect(answer).toBeChecked();
  await keyboardButton("Confirm and submit my answers");await expect(page.getByRole("status")).toContainText("Score: 100%");
  await reflow("keyboard-completed-learning-390");await page.screenshot({path:"artifacts/accessibility-keyboard-mobile.png",fullPage:true});
  await keyboardButton("Sign out");await login("admin");await keyboardButton("Administration");
  for(const width of [320,768,1440]){await page.setViewportSize({width,height:960});await expect(page.getByRole("heading",{name:"Create course draft",exact:true})).toBeVisible();await reflow("administration-"+width);}
  await testInfo.attach("accessibility-evidence",{body:JSON.stringify({checks,keyboard:["skip link","current navigation and focus","lesson acknowledgment","radio choice and official human submission"],semantics:await page.getByRole("main").ariaSnapshot(),limits:["Chromium synthetic journeys only","Not a WCAG conformance audit","Manual screen reader, contrast and third-party media audit not run"]},null,2),contentType:"application/json"});
 }finally{await app.close();f.db.close();}
});
