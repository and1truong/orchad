import {test,expect} from "@playwright/test";
import {createApp} from "../../src/server/app.ts";
import {openDatabase} from "../../src/server/database.ts";
import {resolve} from "node:path";
test("human reviews a one-time scoped credential and a real SCIM client creates, deactivates and reconciles without bridge authority",async({page,request})=>{
 const origin="http://127.0.0.1:4317",db=openDatabase(":memory:",true);
 const {app}=await createApp({db,origin,identityFixture:true,scimEnabled:true,developmentAuth:true,staticRoot:resolve("dist")});
 try{
  await app.listen({port:4317,host:"127.0.0.1"});await page.goto(origin);
  await page.getByLabel("Account",{exact:true}).selectOption("admin");await page.getByLabel("Password",{exact:true}).fill("admin-dev");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await page.getByRole("button",{name:"Administration",exact:true}).click();
  const region=page.getByRole("region",{name:"Provisioning credentials",exact:true});
  await region.getByLabel("Provisioning client name",{exact:true}).fill("Original browser fixture");
  await region.getByLabel("Provisioning review reason",{exact:true}).fill("Human-reviewed machine scope");
  await region.getByLabel("Allow provisioning writes",{exact:true}).check();
  await region.getByRole("button",{name:"Issue reviewed credential",exact:true}).click();
  const secret=region.getByTestId("provisioning-secret");await expect(secret).toBeVisible();const token=await secret.textContent();expect(token).toMatch(/^pear_[a-f0-9]{64}$/);
  const headers={authorization:"Bearer "+token,"content-type":"application/scim+json","idempotency-key":"browser-original"};
  const create=await request.post(origin+"/scim/v2/Users",{headers,data:{userName:"browser-scim",displayName:"Original learner",active:true}});
  expect(create.status()).toBe(201);const user=await create.json();
  const repeat=await request.post(origin+"/scim/v2/Users",{headers,data:{userName:"browser-scim",displayName:"Original learner",active:true}});
  expect(await repeat.json()).toEqual(user);
  const patch=await request.patch(origin+"/scim/v2/Users/"+user.id,{headers:{authorization:"Bearer "+token,"content-type":"application/scim+json","if-match":user.meta.version},data:{schemas:["urn:ietf:params:scim:api:messages:2.0:PatchOp"],Operations:[{op:"replace",path:"active",value:false}]}});
  expect(patch.status()).toBe(200);expect((await patch.json()).active).toBe(false);
  expect(db.prepare("SELECT COUNT(*) AS n FROM identity_links").get()!.n).toBe(0);
  const description=await page.evaluate(()=>window.agentBridgeV1!.describe());expect(description.tools.some(t=>/scim|integration|credential/.test(t.name))).toBe(false);
  await region.getByRole("button",{name:"Hide provisioning secret",exact:true}).click();await expect(secret).toHaveCount(0);
  await page.reload();await page.getByRole("button",{name:"Administration",exact:true}).click();
  const reloaded=page.getByRole("region",{name:"Provisioning credentials",exact:true});
  await expect(reloaded.getByTestId("provisioning-secret")).toHaveCount(0);
  await reloaded.getByLabel("Provisioning review reason",{exact:true}).fill("Reviewed revocation");
  await reloaded.getByRole("button",{name:"Revoke provisioning credential",exact:true}).click();
  await expect(reloaded.getByRole("button",{name:"Revoke provisioning credential",exact:true})).toBeDisabled();
  expect((await request.get(origin+"/scim/v2/Users",{headers:{authorization:"Bearer "+token}})).status()).toBe(401);
  await page.screenshot({path:"artifacts/scim-reviewed-revocation.png",fullPage:true});
 }finally{await app.close();db.close();}
});
