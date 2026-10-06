import {test,expect} from "@playwright/test";
import {xapiFixture} from "../xapi-fixture.ts";
import {createApp} from "../../src/server/app.ts";
import {IdentityService} from "../../src/server/identity.ts";
import {startIdentityFixture} from "../identity-fixture.ts";
import {resolve} from "node:path";
test("real xAPI client reports completed activity; SSO learner sees disclosed external results with no official completion or certificate",async({page,request})=>{
 const origin="http://127.0.0.1:4320",f=xapiFixture(undefined,origin),provider=await startIdentityFixture(origin+"/api/auth/callback");
 new IdentityService(f.db,provider.config,origin,true).link(f.p,{action:"link",userId:f.internal,subject:"original-external-learner",reason:"Reviewed original fixture actor",key:"xapi-browser-mapping",revision:f.service.context("admin","library:demo").revision});
 provider.controls.subject="original-external-learner";
 const {app}=await createApp({db:f.db,origin,oidc:provider.config,identityFixture:true,scimEnabled:true,xapiEnabled:true,developmentAuth:false,staticRoot:resolve("dist")});
 try{
  await app.listen({port:4320,host:"127.0.0.1"});
  const headers={authorization:f.header,"X-Experience-API-Version":"1.0.3"},statement=f.statement();
  expect((await request.post(origin+"/integrations/xapi/1.0.3/statements",{headers,data:statement})).status()).toBe(200);
  expect((await request.post(origin+"/integrations/xapi/1.0.3/statements",{headers,data:statement})).status()).toBe(200);
  const older=f.statement({timestamp:"2026-10-05T11:00:00.000Z",verb:{id:"http://adlnet.gov/expapi/verbs/experienced"},result:{completion:false,score:{raw:0}}});
  expect((await request.post(origin+"/integrations/xapi/1.0.3/statements",{headers,data:older})).status()).toBe(200);
  await page.goto(origin);await page.getByRole("button",{name:"Continue with organization SSO",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"My learning",exact:true}).click();
  const activity=page.getByRole("region",{name:"External reported activity",exact:true});
  await expect(activity.getByRole("heading",{name:"systems-basics · v1",exact:true})).toBeVisible();
  await expect(activity.getByText(/Reported completion: Yes/)).toBeVisible();await expect(activity.getByText(/Statement count: 2/)).toBeVisible();
  await expect(activity.getByText(/separate from Pear official completion/)).toBeVisible();
  for(const table of ["enrollments","attempts","certificates","study_totals"])expect(f.db.prepare("SELECT COUNT(*) AS n FROM "+table).get()!.n).toBe(0);
  expect(f.db.prepare("SELECT COUNT(*) AS n FROM xapi_statements").get()!.n).toBe(2);
  const descriptor=await page.evaluate(()=>window.agentBridgeV1!.describe());expect(descriptor.tools.some(t=>/xapi_statement|set_score|human_submit/.test(t.name))).toBe(false);
  await page.screenshot({path:"artifacts/xapi-reported-official-separation.png",fullPage:true});
 }finally{console.log("xAPI fixture cleanup: Pear close");await app.close();console.log("xAPI fixture cleanup: identity close");await provider.close();console.log("xAPI fixture cleanup: database close");f.db.close();console.log("xAPI fixture cleanup: complete");}
});
