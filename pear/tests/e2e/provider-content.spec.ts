import {test,expect} from "@playwright/test";
import {fixture} from "../helpers.ts";
import {createApp} from "../../src/server/app.ts";
import {IntegrationCredentials} from "../../src/server/integration-credentials.ts";
import {ProviderCatalogService,type ProviderAdapter} from "../../src/server/provider-catalog.ts";
import {randomUUID} from "node:crypto";
import {resolve} from "node:path";
test("own provider metadata requires human review and a second click, retains separate history and hides revoked/current-identity content in EN/VI mobile",async({page})=>{
 test.setTimeout(90000);const f=fixture(),origin="http://127.0.0.1:4355",issued=new IntegrationCredentials(f.db).mutate(f.service.principal("admin"),{action:"issue",name:"Synthetic UI provider",reason:"No licensed provider connection",scopes:["catalog.read","catalog.write"],ttlDays:1,key:randomUUID(),revision:0}),policy:ProviderAdapter={id:"fixture-provider",tenant:"demo",clientId:issued.id,licenseUntil:new Date(Date.now()+86400000).toISOString(),metadataForModels:false,launchOrigin:"https://provider-fixture.invalid"},feed=new ProviderCatalogService(f.db,[policy]);
 feed.review(f.service.principal("admin"),{providerId:policy.id,enabled:true,rightsConfirmed:true,reason:"Synthetic browser fixture"});
 let sequence=0;const event=(action:string,data:any)=>feed.write("Bearer "+issued.token,policy.id,{profile:"pear-provider-metadata/1",id:randomUUID(),sequence:++sequence,sourceTime:new Date().toISOString(),action,data});
 event("upsert",{sourceId:"synthetic-source",version:1,title:"Synthetic entitled provider metadata",summary:"Metadata only; no official outcomes",language:"en",topic:"Reliability",intendedMinutes:15});event("grant",{sourceId:"synthetic-source",learnerId:"learner-a",validUntil:new Date(Date.now()+3600000).toISOString()});
 const {app}=await createApp({db:f.db,origin,developmentAuth:true,catalogFixture:true,catalogAdapters:[policy],staticRoot:resolve("dist")});
 async function login(user:string){await page.goto(origin);await page.getByLabel("Account",{exact:true}).fill(user);await page.getByLabel("Password",{exact:true}).fill(user+"-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();}
 try{
  await app.listen({port:4355,host:"127.0.0.1"});await login("learner-a");const region=page.getByRole("region",{name:"Provider content",exact:true});await expect(region.getByRole("heading",{name:"Synthetic entitled provider metadata",exact:true})).toBeVisible();await region.getByRole("button",{name:"Review provider item",exact:true}).click();
  const review=region.getByRole("region",{name:"Provider launch review",exact:true}),create=review.getByRole("button",{name:"Create provider launch",exact:true});await expect(create).toBeDisabled();await review.getByLabel("I confirm creating my provider launch record",{exact:true}).check();await create.click();const link=review.getByRole("link",{name:"Open provider content in a new tab",exact:true});await expect(link).toBeVisible();await expect(link).toHaveAttribute("rel","noopener noreferrer");await expect(link).toHaveAttribute("target","_blank");
  const href=await link.getAttribute("href");expect(href).toMatch(/^\/api\/provider-launch\//);const redirect=await page.request.get(origin+href,{maxRedirects:0});expect(redirect.status()).toBe(302);expect(redirect.headers().location).toBe("https://provider-fixture.invalid/content/synthetic-source");
  await expect(region.getByRole("list")).toContainText("Synthetic entitled provider metadata");expect(f.db.prepare("SELECT COUNT(*) AS n FROM provider_launches").get()!.n).toBe(1);expect(f.db.prepare("SELECT COUNT(*) AS n FROM enrollments").get()!.n).toBe(0);
  event("revoke",{sourceId:"synthetic-source",learnerId:"learner-a"});expect((await page.request.get(origin+href,{maxRedirects:0})).status()).toBe(403);await page.reload();await expect(region).toContainText("No currently entitled provider content is available.");await expect(region.getByRole("list")).toContainText("Provider metadata unavailable");
  await page.setViewportSize({width:390,height:844});await page.getByLabel("Interface language",{exact:true}).selectOption("vi");await expect(page.getByRole("heading",{name:"Nội dung nhà cung cấp",exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:"artifacts/provider-content-rights.png",fullPage:true});
  await page.getByLabel("Ngôn ngữ giao diện",{exact:true}).selectOption("en");await page.getByRole("button",{name:"Sign out",exact:true}).click();await login("learner-b");await expect(page.getByRole("region",{name:"Provider content",exact:true}).getByRole("list").getByRole("listitem")).toHaveCount(0);
  console.log("PROVIDER CONTENT ASSERTIONS COMPLETE");
 }finally{await page.close();app.server.closeAllConnections();await app.close();f.db.close();}
});
