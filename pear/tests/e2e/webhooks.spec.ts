import {test,expect} from "@playwright/test";
import {createServer} from "node:http";
import {createApp} from "../../src/server/app.ts";
import {openDatabase} from "../../src/server/database.ts";
import {verifyWebhook} from "../../src/shared/webhook-signature.ts";
import {resolve} from "node:path";
test("admin reviews a pinned endpoint, actual signed event arrives, delivery is inspectable and disabled subscription cannot send",async({page})=>{
 const origin="http://127.0.0.1:4318",secret="c".repeat(64),received:any[]=[],receiver=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk.toString();
  if(!verifyWebhook(secret,req.headers["x-pear-timestamp"],req.headers["x-pear-signature"],body)){res.writeHead(401);res.end();return;}
  received.push(JSON.parse(body));res.writeHead(200);res.end();
 });
 await new Promise<void>(resolve=>receiver.listen(0,"127.0.0.1",resolve));const url="http://127.0.0.1:"+(receiver.address() as any).port+"/events",db=openDatabase(":memory:",true);
 const {app,service,outbox}=await createApp({db,origin,developmentAuth:true,identityFixture:true,webhookEndpoints:[{id:"browser-fixture",url,secret}],staticRoot:resolve("dist")});
 try{
  await app.listen({port:4318,host:"127.0.0.1"});await page.goto(origin);
  await page.getByLabel("Account",{exact:true}).fill("admin");await page.getByLabel("Password",{exact:true}).fill("admin-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await page.getByRole("button",{name:"Administration",exact:true}).click();
  const region=page.getByRole("region",{name:"Reviewed webhook delivery",exact:true});
  await region.getByLabel("Reviewed endpoint",{exact:true}).selectOption("browser-fixture");
  await region.getByLabel("Webhook review reason",{exact:true}).fill("Reviewed original local receiver");
  await region.getByRole("button",{name:"Subscribe reviewed endpoint",exact:true}).click();
  await expect(region.getByRole("button",{name:"Inspect delivery status",exact:true})).toBeVisible();
  const context=service.context("learner-a","learning:demo:learner-a");
  const enrollment=service.invoke("learner-a",{requestId:crypto.randomUUID(),documentId:context.documentId,toolName:"learning_enroll",arguments:{courseId:"systems-basics"},expectedRevision:context.revision,idempotencyKey:"browser-event"},"human");
  expect(enrollment.ok).toBe(true);await outbox.run();expect(received).toHaveLength(1);expect(received[0].topic).toBe("enrollment.created");
  await region.getByRole("button",{name:"Inspect delivery status",exact:true}).click();
  await expect(region.getByText(/delivered/)).toBeVisible();
  const description=await page.evaluate(()=>window.agentBridgeV1!.describe());expect(description.tools.some(t=>/webhook|integration|credential/.test(t.name))).toBe(false);
  await region.getByRole("button",{name:"Disable event delivery",exact:true}).click();
  await expect(region.getByRole("button",{name:"Disable event delivery",exact:true})).toBeDisabled();
  const next=service.context("learner-b","learning:demo:learner-b");
  expect(service.invoke("learner-b",{requestId:crypto.randomUUID(),documentId:next.documentId,toolName:"learning_enroll",arguments:{courseId:"systems-basics"},expectedRevision:next.revision,idempotencyKey:"disabled-event"},"human").ok).toBe(true);
  await outbox.run();expect(received).toHaveLength(1);
  await page.screenshot({path:"artifacts/webhook-reviewed-delivery.png",fullPage:true});
 }finally{await app.close();db.close();await new Promise<void>((resolve,reject)=>receiver.close(e=>e?reject(e):resolve()));}
});
