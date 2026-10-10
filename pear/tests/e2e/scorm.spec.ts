import {test,expect} from "@playwright/test";
import {createApp} from "../../src/server/app.ts";
import {fixture} from "../helpers.ts";
import {zip} from "../scorm-fixture.ts";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
test("human imports and reviews original ZIP; isolated SCO persists and resumes private reported state without official learning credit",async({page})=>{
 test.setTimeout(60000);
 const f=fixture(),origin="http://127.0.0.1:4321",bytes=zip();
 const {app}=await createApp({db:f.db,origin,developmentAuth:true,staticRoot:resolve("dist"),scormContent:{origin:"http://localhost:4322",runtimeBundle:readFileSync("dist/scorm/runtime.js")}});
 async function login(id:string){await page.getByLabel("Account",{exact:true}).fill(id);await page.getByLabel("Password",{exact:true}).fill(id+"-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();}
 try{
  await app.listen({port:4321,host:"127.0.0.1"});await page.goto(origin);await login("admin");await page.getByRole("button",{name:"Administration",exact:true}).click();
  const author=page.getByRole("region",{name:"Imported package administration",exact:true});
  await author.getByLabel("Self-authored SCORM ZIP",{exact:true}).setInputFiles({name:"original-inline.zip",mimeType:"application/zip",buffer:bytes});
  await author.getByLabel("I confirm self-authored rights and will review the exact package code.",{exact:true}).check();
  await author.getByRole("button",{name:"Import package into quarantine",exact:true}).click();await expect(author.getByRole("status")).toContainText("imported into quarantine");
  await expect(author.getByRole("article")).toContainText("quarantined");
  await author.getByLabel("Package code review reason",{exact:true}).fill("Human-reviewed original inline fixture; only separate reported tracking");
  await author.getByRole("button",{name:"Publish reviewed package",exact:true}).click();await expect(author.getByRole("article")).toContainText("published");
  const downloading=page.waitForEvent("download");await author.getByRole("button",{name:"Export original package ZIP",exact:true}).click();const download=await downloading;
  expect(readFileSync((await download.path())!)).toEqual(bytes);
  await page.getByRole("button",{name:"Sign out",exact:true}).click();await login("learner-a");await page.getByRole("button",{name:"Imported packages",exact:true}).click();
  const packages=page.getByRole("region",{name:"Imported package learning",exact:true});
  await packages.getByLabel("I consent to this package's separate reported tracking.",{exact:true}).check();
  await packages.getByRole("button",{name:"Launch package with separate tracking",exact:true}).click();
  const sco=page.frameLocator('iframe[title="Isolated SCORM package"]');
  await expect(sco.getByText("Entry: ab-initio",{exact:true})).toBeVisible();await expect(sco.getByText("Parent cookies and bridge are isolated",{exact:true})).toBeVisible();
  await sco.getByRole("button",{name:"Save package progress",exact:true}).click();await expect(packages.getByRole("status")).toContainText("saved by the server");
  const saved=f.db.prepare("SELECT * FROM scorm_records WHERE learner='learner-a'").get() as any;
  expect(saved.revision).toBe(1);expect(saved.reported_seconds).toBe(60);expect(JSON.parse(saved.state)["cmi.core.score.raw"]).toBe("90");
  const before=JSON.stringify(saved);
  await page.evaluate(()=>window.postMessage({kind:"pear-scorm12-commit",launchId:"forged",nonce:"forged",recordId:"forged",recordRevision:0,key:"forged",state:{}},"*"));
  await sco.getByRole("button",{name:"Finish package",exact:true}).click();await expect(sco.getByText("Finish: true",{exact:true})).toBeVisible();
  expect(JSON.stringify(f.db.prepare("SELECT * FROM scorm_records WHERE learner='learner-a'").get())).toBe(before);
  await packages.getByRole("button",{name:"Close package",exact:true}).click();
  await page.reload();await page.getByRole("button",{name:"Imported packages",exact:true}).click();await packages.getByLabel("I consent to this package's separate reported tracking.",{exact:true}).check();
  await packages.getByRole("button",{name:"Resume saved package",exact:true}).click();
  await expect(sco.getByText("Entry: resume",{exact:true})).toBeVisible();await expect(sco.getByText("Resume location: step-2; data: original-resume",{exact:true})).toBeVisible();
  for(const table of ["enrollments","attempts","certificates","study_totals"])expect(f.db.prepare("SELECT COUNT(*) AS n FROM "+table).get()!.n).toBe(0);
  const descriptor=await page.evaluate(()=>window.agentBridgeV1!.describe());expect(descriptor.tools.some(t=>/scorm_commit|scorm_start|scorm_import/.test(t.name))).toBe(false);
  await page.screenshot({path:"artifacts/scorm-isolated-reported-resume.png",fullPage:true});
 console.log("scorm.spec.ts assertions: complete");
 }finally{await page.close();app.server.closeAllConnections();await app.close();f.db.close();}
});
