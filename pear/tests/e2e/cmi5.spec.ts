import {test,expect,type Page} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdirSync,readFileSync} from 'node:fs';
import {fixture} from '../helpers.ts';
import {createApp} from '../../src/server/app.ts';
import {cmi5XML,cmi5ZIP} from '../cmi5-fixture.ts';

async function login(page:Page,origin:string,user:string) {
  await page.goto(origin);await page.getByLabel('Account',{exact:true}).fill(user);await page.getByLabel('Password',{exact:true}).fill(user+'-dev');await page.getByRole('button',{name:'Sign in',exact:true}).click();
}
async function setup(port:number) {
  const f=fixture(),origin='http://127.0.0.1:'+port,contentOrigin='http://localhost:'+(port+1);
  const runtime=await createApp({db:f.db,origin,developmentAuth:true,cmi5ContentOrigin:contentOrigin,staticRoot:resolve('dist')});
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
    await region.getByLabel('cmi5 ZIP',{exact:true}).setInputFiles({name:'original-cmi5.zip',mimeType:'application/zip',buffer:bytes});
    await region.getByLabel('cmi5 content rights and provenance',{exact:true}).fill('Self-authored original source');await region.getByLabel('I confirm cmi5 content rights and will review the exact package.',{exact:true}).check();
    await region.getByRole('button',{name:'Import cmi5 package',exact:true}).click();await expect(region.getByRole('article')).toContainText('quarantined');
    await region.getByLabel('cmi5 review reason',{exact:true}).fill('Reviewed exact source code, hash and rights');await region.getByRole('button',{name:'Publish reviewed cmi5 package',exact:true}).click();await expect(region.getByRole('article')).toContainText('published');
    const download=page.waitForEvent('download');await region.getByRole('button',{name:'Export original cmi5 ZIP',exact:true}).click();expect(readFileSync((await (await download).path())!)).toEqual(bytes);
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
