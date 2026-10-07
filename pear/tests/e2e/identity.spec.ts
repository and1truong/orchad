import {test,expect} from "@playwright/test";
import {createApp} from "../../src/server/app.ts";
import {openDatabase} from "../../src/server/database.ts";
import {startIdentityFixture} from "../identity-fixture.ts";
import {resolve} from "node:path";
test("real browser SSO returns through a bound code flow, admin reviews a subject mapping and role claims cannot elevate learner",async({page})=>{
 test.setTimeout(60000);
 const origin="http://127.0.0.1:4316",db=openDatabase(":memory:",true),provider=await startIdentityFixture(origin+"/api/auth/callback");
 db.prepare("INSERT INTO identity_links VALUES(?,?,?,?,?)").run("demo",provider.config.issuer,"admin-subject","admin",new Date().toISOString());
 provider.controls.subject="admin-subject";
 const {app}=await createApp({db,origin,oidc:provider.config,identityFixture:true,developmentAuth:false,staticRoot:resolve("dist")});
 try{
  await app.listen({port:4316,host:"127.0.0.1"});await page.goto(origin);
  await expect(page.getByRole("button",{name:"Sign in",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Continue with organization SSO",exact:true}).click();
  await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Administration",exact:true}).click();
  const identity=page.getByRole("region",{name:"Organization identity settings",exact:true});
  await identity.getByLabel("Existing account ID",{exact:true}).fill("learner-a");
  await identity.getByLabel("Issuer subject",{exact:true}).fill("reviewed-learner");
  await identity.getByLabel("Identity mapping reason",{exact:true}).fill("Human-reviewed original fixture identity");
  await identity.getByRole("button",{name:"Save reviewed identity mapping",exact:true}).click();
  await expect(identity.getByRole("status")).toContainText("target sessions revoked");
  await page.getByRole("button",{name:"Sign out",exact:true}).click();
  provider.controls.subject="reviewed-learner";provider.controls.claims={roles:["admin"],role:"admin",tenant:"other",name:"Forged administrator"};
  await page.getByRole("button",{name:"Continue with organization SSO",exact:true}).click();
  await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Administration",exact:true})).toHaveCount(0);
  expect(await page.evaluate(async()=>(await (await fetch("/api/session")).json()).principal.role)).toBe("learner");
  expect(await page.evaluate(async()=>{
   const session=await (await fetch("/api/session")).json();
   return (await fetch("/api/identity-links",{headers:{"X-Pear-Epoch":session.sessionEpoch}})).status;
  })).toBe(403);
  const description=await page.evaluate(()=>window.agentBridgeV1!.describe());
  expect(description.tools.some(t=>/identity|oidc|human_submit/.test(t.name))).toBe(false);
  await page.screenshot({path:"artifacts/oidc-reviewed-role-boundary.png",fullPage:true});
 console.log("identity.spec.ts assertions: complete");
 }finally{await page.close();app.server.closeAllConnections();await app.close();await provider.close();db.close();}
});
