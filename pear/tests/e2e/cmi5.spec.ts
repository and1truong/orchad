import {test,expect,type Page} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdirSync,readFileSync} from 'node:fs';
import {fixture,data} from '../helpers.ts';
import {courses} from '../../src/server/seed.ts';
import {createApp} from '../../src/server/app.ts';
import {cmi5XML,cmi5ZIP} from '../cmi5-fixture.ts';
import {standaloneCMI5} from '../cmi5-packaging-fixture.ts';
import Fastify from 'fastify';
import {cmi5Script} from '../cmi5-fixture.ts';

async function login(page:Page,origin:string,user:string) {
  await page.goto(origin);await page.getByLabel('Account',{exact:true}).fill(user);await page.getByLabel('Password',{exact:true}).fill(user+'-dev');await page.getByRole('button',{name:'Sign in',exact:true}).click();
}
async function setup(port:number,remoteOrigins:string[] = []) {
  const f=fixture(),origin='http://127.0.0.1:'+port,contentOrigin='http://localhost:'+(port+1);
  const runtime=await createApp({db:f.db,origin,developmentAuth:true,cmi5ContentOrigin:contentOrigin,cmi5RemoteOrigins:remoteOrigins,staticRoot:resolve('dist')});
  await runtime.app.listen({host:'127.0.0.1',port});await runtime.cmi5ContentApp!.listen({host:'127.0.0.1',port:port+1});
  function publish(xml=cmi5XML()) {
    const p=f.service.principal('admin'),args=()=>({confirmed:true,key:crypto.randomUUID(),revision:f.service.context('admin','library:demo').revision});
    return runtime.cmi5.import(p,{...args(),filename:'original-cmi5.zip',provenance:'Self-authored original cmi5 fixture'},cmi5ZIP(xml)).then(pkg=>{
      runtime.cmi5.review(p,{...args(),packageId:pkg.packageId,sha256:pkg.sha256,action:'publish',reason:'Reviewed all original source files'});return pkg;
    });
  }
  return {...f,...runtime,origin,contentOrigin,publish,close:async()=>{runtime.app.server.closeAllConnections();runtime.cmi5ContentApp!.server.closeAllConnections();await runtime.app.close();f.db.close();}};
}
test('built admin imports, reviews, exports and revokes the exact cmi5 ZIP',async({page})=>{
  const s=await setup(4392),bytes=cmi5ZIP();try {
    await login(page,s.origin,'admin');await page.getByRole('button',{name:'Administration',exact:true}).click();const region=page.getByRole('region',{name:'cmi5 packages',exact:true});
    await region.getByLabel('cmi5 ZIP or XML',{exact:true}).setInputFiles({name:'original-cmi5.zip',mimeType:'application/zip',buffer:bytes});
    await region.getByLabel('cmi5 content rights and provenance',{exact:true}).fill('Self-authored original source');await region.getByLabel('I confirm cmi5 content rights and will review the exact package.',{exact:true}).check();
    await region.getByRole('button',{name:'Import cmi5 package',exact:true}).click();await expect(region.getByRole('article')).toContainText('quarantined');
    await region.getByLabel('cmi5 review reason',{exact:true}).fill('Reviewed exact source code, hash and rights');await region.getByRole('button',{name:'Publish reviewed cmi5 package',exact:true}).click();await expect(region.getByRole('article')).toContainText('published');
    const download=page.waitForEvent('download');await region.getByRole('button',{name:'Export original cmi5 package',exact:true}).click();expect(readFileSync((await (await download).path())!)).toEqual(bytes);
    await region.getByRole('button',{name:'Revoke cmi5 package',exact:true}).click();await expect(region.getByRole('article')).toContainText('revoked');
    mkdirSync('artifacts/cmi5',{recursive:true});await region.screenshot({path:'artifacts/cmi5/admin.png'});
  }finally{await page.close();await s.close();}
});
test('built learner resumes state, retries a lost statement ACK, completes two AUs and reconciles course satisfaction',async({page})=>{
  const s=await setup(4394);try {
    await s.publish();await login(page,s.origin,'learner-a');await page.getByRole('button',{name:'Imported packages',exact:true}).click();const region=page.getByRole('region',{name:'cmi5 packages',exact:true});
    await region.getByLabel("I consent to this cmi5 activity's reported tracking.",{exact:true}).check();await region.getByRole('button',{name:'Start Introduction',exact:true}).click();
    const frame=page.frameLocator('iframe[title="cmi5 activity"]');await expect(frame.getByRole('status')).toHaveText('Ready');await frame.getByRole('button',{name:'Save bookmark',exact:true}).click();await expect(frame.getByRole('status')).toHaveText('Bookmark saved');
    await region.getByRole('button',{name:'End cmi5 session',exact:true}).press('Enter');await expect(region.getByLabel('cmi5 report')).toContainText('Session abandoned');
    await region.getByRole('button',{name:'Resume Introduction',exact:true}).press('Enter');await expect(frame.getByRole('status')).toHaveText('Ready');await frame.getByRole('button',{name:'Restore bookmark',exact:true}).click();await expect(frame.getByRole('status')).toHaveText('Restored page 2');
    let lost=false;
    await page.route('**/cmi5/xapi/statements',async route=>{
      const packet=route.request().postDataJSON();if(!lost&&packet.verb?.id?.endsWith('/completed')){lost=true;const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');return;}await route.continue();
    });
    await frame.getByRole('button',{name:'Complete activity',exact:true}).click();await expect(frame.getByRole('status')).toContainText('Failed to fetch');await frame.getByRole('button',{name:'Complete activity',exact:true}).click();await expect(frame.getByRole('status')).toHaveText('Saved and terminated');expect(lost).toBe(true);
    await expect(region.getByLabel('cmi5 report')).toContainText('Introduction · Completed: true · Passed: true · Satisfied: true');
    await region.getByRole('button',{name:'Resume Practice',exact:true}).press('Enter');await expect(frame.getByRole('status')).toHaveText('Ready');await frame.getByRole('button',{name:'Complete activity',exact:true}).click();await expect(frame.getByRole('status')).toHaveText('Saved and terminated');
    await expect(region.getByLabel('cmi5 report')).toContainText('Course satisfaction: Satisfied');
    expect(s.db.prepare("SELECT COUNT(*) AS n FROM cmi5_statements WHERE source='au' AND verb='completed'").get()!.n).toBe(2);expect(s.db.prepare('SELECT COUNT(*) AS n FROM certificates').get()!.n).toBe(0);expect(s.db.prepare('SELECT COUNT(*) AS n FROM xapi_statements').get()!.n).toBe(0);
    mkdirSync('artifacts/cmi5',{recursive:true});await region.screenshot({path:'artifacts/cmi5/learner.png'});
  }finally{await page.close();await s.close();}
});
test('OwnWindow cmi5 AU runs in a separate browser window and logout revokes its credential',async({page})=>{
  const s=await setup(4396);let popup:Page|undefined;try {
    await s.publish(cmi5XML('OwnWindow'));await login(page,s.origin,'learner-a');await page.getByRole('button',{name:'Imported packages',exact:true}).click();const region=page.getByRole('region',{name:'cmi5 packages',exact:true});
    await region.getByLabel("I consent to this cmi5 activity's reported tracking.",{exact:true}).check();await region.getByRole('button',{name:'Start Introduction',exact:true}).click();
    const opened=page.waitForEvent('popup');await region.getByRole('link',{name:'Open cmi5 activity in a new window',exact:true}).click();popup=await opened;await expect(popup.getByRole('status')).toHaveText('Ready');expect(await popup.evaluate(()=>window.opener===null)).toBe(true);
    await page.getByRole('button',{name:'Sign out',exact:true}).click();await popup.getByRole('button',{name:'Save bookmark',exact:true}).click();await expect(popup.getByRole('status')).toHaveText('Save rejected');
  }finally{if(popup)await popup.close();await page.close();await s.close();}
});
test('built administration imports and exports standalone XML without losing its immutable source',async({page})=>{
  const s=await setup(4398),bytes=Buffer.from(standaloneCMI5());try {
    await login(page,s.origin,'admin');await page.getByRole('button',{name:'Administration',exact:true}).click();const region=page.getByRole('region',{name:'cmi5 packages',exact:true});
    await region.getByLabel('cmi5 ZIP or XML',{exact:true}).setInputFiles({name:'original.xml',mimeType:'application/xml',buffer:bytes});await region.getByLabel('cmi5 content rights and provenance',{exact:true}).fill('Original standalone XML');await region.getByLabel('I confirm cmi5 content rights and will review the exact package.',{exact:true}).check();
    await region.getByRole('button',{name:'Import cmi5 package',exact:true}).click();await expect(region.getByRole('article')).toContainText('quarantined');await region.getByLabel('cmi5 review reason',{exact:true}).fill('Reviewed XML and AU destinations');await region.getByRole('button',{name:'Publish reviewed cmi5 package',exact:true}).click();await expect(region.getByRole('article')).toContainText('published');
    const download=page.waitForEvent('download');await region.getByRole('button',{name:'Export original cmi5 package',exact:true}).click();expect(readFileSync((await (await download).path())!)).toEqual(bytes);
    await expect(region.getByRole('button',{name:'Preview Introduction',exact:true})).toBeDisabled();
  }finally{await page.close();await s.close();}
});
test('actual remote AU uses browser CORS to fetch credentials, initialize, save and terminate into a scoped Pear report',async({page})=>{
  const remoteOrigin='http://localhost:4440',remote=Fastify(),s=await setup(4442,[remoteOrigin]);let popup:Page|undefined;
  remote.get('/au.js',async(_req,reply)=>reply.type('text/javascript').send(cmi5Script));
  remote.get('/lessons/:name',async(_req,reply)=>reply.type('text/html').send('<!doctype html><h1>Original remote AU</h1><p id="status" role="status">Loading</p><button id="complete">Complete activity</button><button id="save">Save bookmark</button><button id="restore">Restore bookmark</button><button id="binary">Save and restore binary profile</button><script src="/au.js"></script>'));
  try {
    await remote.listen({host:'127.0.0.1',port:4440});const p=s.service.principal('admin'),args=()=>({confirmed:true,key:crypto.randomUUID(),revision:s.service.context('admin','library:demo').revision});
    const pkg=await s.cmi5.import(p,{...args(),filename:'remote.xml',provenance:'Original remote HTTP fixture'},Buffer.from(standaloneCMI5(remoteOrigin)));s.cmi5.review(p,{...args(),packageId:pkg.packageId,sha256:pkg.sha256,action:'publish',reason:'Reviewed own remote server and exact origin'});
    await login(page,s.origin,'learner-a');await page.getByRole('button',{name:'Imported packages',exact:true}).click();const region=page.getByRole('region',{name:'cmi5 packages',exact:true});await region.getByLabel("I consent to this cmi5 activity's reported tracking.",{exact:true}).check();await region.getByRole('button',{name:'Start Introduction',exact:true}).click();
    const opened=page.waitForEvent('popup');await region.getByRole('link',{name:'Open cmi5 activity in a new window',exact:true}).click();popup=await opened;await expect(popup.getByRole('status')).toHaveText('Ready');expect(new URL(popup.url()).origin).toBe(remoteOrigin);
    await popup.getByRole('button',{name:'Save and restore binary profile',exact:true}).click();await expect(popup.getByRole('status')).toHaveText('Binary profile restored');
    await popup.getByRole('button',{name:'Complete activity',exact:true}).click();await expect(popup.getByRole('status')).toHaveText('Saved and terminated');await expect(region.getByLabel('cmi5 report')).toContainText('Introduction · Completed: true · Passed: true · Satisfied: true');
    expect(await popup.evaluate(()=>window.opener===null)).toBe(true);expect(s.db.prepare('SELECT COUNT(*) AS n FROM certificates').get()!.n).toBe(0);
  }finally{if(popup)await popup.close();await page.close();remote.server.closeAllConnections();await remote.close();await s.close();}
});
test('built admin waives two AUs and the learner sees durable reasons and a Review-only launch without reported completion or credit',async({page})=>{
  const s=await setup(4444);try {
    await s.publish();await login(page,s.origin,'learner-a');await page.getByRole('button',{name:'Imported packages',exact:true}).click();
    let region=page.getByRole('region',{name:'cmi5 packages',exact:true});await region.getByLabel("I consent to this cmi5 activity's reported tracking.",{exact:true}).check();await region.getByRole('button',{name:'Start Introduction',exact:true}).click();
    await expect(page.frameLocator('iframe[title="cmi5 activity"]').getByRole('status')).toHaveText('Ready');await page.getByRole('button',{name:'Sign out',exact:true}).press('Enter');
    await login(page,s.origin,'admin');await page.getByRole('button',{name:'Administration',exact:true}).click();region=page.getByRole('region',{name:'cmi5 packages',exact:true});
    await region.getByRole('button',{name:'Original cmi5 course · Normal · learner-a',exact:true}).click();const report=region.getByLabel('cmi5 report');
    await report.getByLabel('cmi5 waiver reason',{exact:true}).selectOption('Administrative');await report.getByLabel('I confirm the alternative evidence for this cmi5 waiver.',{exact:true}).check();await report.getByRole('button',{name:'Waive Introduction',exact:true}).click();await expect(report).toContainText('Introduction · Completed: false · Passed: false · Satisfied: true · Waived: Administrative');
    await expect(report.getByLabel('I confirm the alternative evidence for this cmi5 waiver.',{exact:true})).not.toBeChecked();await report.getByLabel('cmi5 waiver reason',{exact:true}).selectOption('Equivalent Outside Activity');await report.getByLabel('I confirm the alternative evidence for this cmi5 waiver.',{exact:true}).check();await report.getByRole('button',{name:'Waive Practice',exact:true}).click();await expect(report).toContainText('Course satisfaction: Satisfied');await expect(report).toContainText('LMS waiver session');
    await page.getByRole('button',{name:'Sign out',exact:true}).click();await login(page,s.origin,'learner-a');await page.getByRole('button',{name:'Imported packages',exact:true}).click();region=page.getByRole('region',{name:'cmi5 packages',exact:true});await region.getByRole('button',{name:'Original cmi5 course · Normal',exact:true}).click();
    await expect(region.getByLabel('cmi5 report')).toContainText('Waived: Equivalent Outside Activity');await expect(region.getByRole('button',{name:'Waive Introduction',exact:true})).toHaveCount(0);
    await region.getByLabel("I consent to this cmi5 activity's reported tracking.",{exact:true}).check();await region.getByRole('button',{name:'Review Introduction',exact:true}).click();const frame=page.frameLocator('iframe[title="cmi5 activity"]');await expect(frame.getByRole('status')).toHaveText('Ready');await frame.getByRole('button',{name:'Complete activity',exact:true}).click();await expect(frame.getByRole('status')).toHaveText('Statement rejected: 400');
    expect(s.db.prepare("SELECT COUNT(*) AS n FROM cmi5_statements WHERE source='au' AND verb='completed'").get()!.n).toBe(0);expect(s.db.prepare("SELECT COUNT(*) AS n FROM cmi5_statements WHERE source='lms' AND verb='waived'").get()!.n).toBe(2);expect(s.db.prepare('SELECT COUNT(*) AS n FROM certificates').get()!.n).toBe(0);
  }finally{await page.close();await s.close();}
});
test('built enrolled cmi5 AUs project one exact lesson proof and the learner must still pass the real Pear quiz for a certificate',async({page})=>{
  const s=await setup(4446);try {
    const pkg=await s.publish(),course={...structuredClone(courses['learning-vi']),title:'Original cmi5 enrolled course',lessons:[{id:'package',title:'Original cmi5 package lesson',text:'Complete the original AUs',kind:'cmi5',prerequisiteIds:[],cmi5:{packageId:pkg.packageId,sha256:pkg.sha256,allowWaivers:false}}]};
    data(s.call('editor','learning_update_course',{courseId:'learning-vi',course}));data(s.call('editor','learning_publish_course',{courseId:'learning-vi'}));const enrollment=data(s.call('learner-a','learning_enroll',{courseId:'learning-vi'}));
    await login(page,s.origin,'learner-a');await page.getByRole('button',{name:'My learning',exact:true}).click();await page.locator('.learning-row').filter({has:page.getByRole('heading',{name:course.title,exact:true})}).getByRole('button',{name:'Continue learning',exact:true}).click();
    const player=page.getByRole('region',{name:'Enrolled cmi5 player',exact:true}),frame=page.frameLocator('iframe[title="Enrolled cmi5 activity"]');await expect(page.getByRole('button',{name:'I have studied this lesson',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Start assessment',exact:true})).toBeDisabled();
    await player.getByLabel('I consent to cmi5 progress tracking for this enrollment.',{exact:true}).check();await player.getByRole('button',{name:'Play or resume Introduction',exact:true}).click();await expect(frame.getByRole('status')).toHaveText('Ready');await frame.getByRole('button',{name:'Complete activity',exact:true}).click();await expect(frame.getByRole('status')).toHaveText('Saved and terminated');expect(s.db.prepare('SELECT COUNT(*) AS n FROM cmi5_completion_proofs').get()!.n).toBe(0);
    await player.getByRole('button',{name:'Close enrolled cmi5 activity',exact:true}).press('Enter');await player.getByRole('button',{name:'Play or resume Practice',exact:true}).press('Enter');await expect(frame.getByRole('status')).toHaveText('Ready');await frame.getByRole('button',{name:'Complete activity',exact:true}).click();await expect(frame.getByRole('status')).toHaveText('Saved and terminated');await expect(player).toContainText('cmi5 completion accepted.');
    await player.getByRole('button',{name:'Close enrolled cmi5 activity',exact:true}).press('Enter');expect(s.db.prepare('SELECT COUNT(*) AS n FROM cmi5_completion_proofs').get()!.n).toBe(1);expect(s.db.prepare('SELECT COUNT(*) AS n FROM certificates').get()!.n).toBe(0);await page.getByRole('button',{name:'Start assessment',exact:true}).press('Enter');await page.getByRole('radio',{name:/Tự giải thích rồi đối chiếu/}).check();await page.getByRole('button',{name:'Confirm and submit my answers',exact:true}).click();
    await expect.poll(()=>s.db.prepare('SELECT COUNT(*) AS n FROM certificates').get()!.n).toBe(1);expect(JSON.parse(String(s.db.prepare('SELECT completed_lessons FROM enrollments WHERE id=?').get(enrollment.enrollmentId)!.completed_lessons))).toEqual(['package']);
  }finally{await page.close();await s.close();}
});
