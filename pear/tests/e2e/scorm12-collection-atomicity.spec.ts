import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';

for (const edition of ['1.2'] as const) test(edition + ': built failed collection writes survive lost ACK and close/resume', async ({page}) => {
  const script = `{const api=parent.API,prior=api.LMSGetValue('cmi.objectives._count');
    const reverse=Object.getOwnPropertyDescriptor(parent.Array.prototype,'toReversed');
    Object.defineProperty(parent.Array.prototype,'toReversed',{value:undefined,configurable:true});
    try{for(const [key,value,error] of [
      ['cmi.objectives.'+prior+'.score.raw','bad','405'],
      ['cmi.objectives.'+prior+'.score.raw','101','405'],
      ['cmi.objectives.'+prior+'.unknown','x','201'],
      ['cmi.interactions.0.type','invalid','405'],
      ['cmi.interactions.0.unknown','x','201']
    ]){if(api.LMSSetValue(key,value)!=='false'||api.LMSGetLastError()!==error)throw Error('rejected write '+key);
      if(api.LMSGetValue('cmi.objectives._count')!==prior||api.LMSGetValue('cmi.interactions._count')!=='0')throw Error('failed write changed count');
    }
    }finally{if(reverse)Object.defineProperty(parent.Array.prototype,'toReversed',reverse);else delete parent.Array.prototype.toReversed;}
    if(prior==='0'){if(api.LMSSetValue('cmi.objectives.0.id','urn:pear:o')!=='true'||api.LMSSetValue('cmi.objectives.0.score.raw','50')!=='true')throw Error('valid retry');}
    if(api.LMSGetValue('cmi.objectives.0.score.raw')!=='50'||api.LMSGetValue('cmi.objectives._count')!=='1')throw Error('original objective');
    document.getElementById('entry').textContent='SCORM 1.2 atomicity verified';}`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); f.enroll();
  const origin = 'http://127.0.0.1:4756', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4757', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4757, host: '127.0.0.1'}); await app.listen({port: 4756, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), outer = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = outer.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('SCORM 1.2 atomicity verified', {exact: true})).toBeVisible();
    // pipwerks commits its initial incomplete status before this explicit save.
    await expect(player.getByRole('status')).toContainText('saved by the server');
    const initialRevision = Number(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision);
    const initialReceipts = Number(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n);
    let dropped = false, original = '';
    await page.route('**/launch/*/checkpoint', async route => {
      const payload = route.request().postData()!;
      if (!dropped) {original = payload; dropped = true; const response = await route.fetch(); expect(response.ok()).toBe(true); await route.abort();}
      else {expect(payload).toBe(original); await route.continue();}
    });
    await sco.getByRole('button', {name: 'Store licensed progress', exact: true}).click(); await expect(outer.getByRole('status')).toContainText('has not been acknowledged');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(initialRevision + 1);
    await player.getByRole('button', {name: 'Retry engine checkpoint', exact: true}).click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(initialRevision + 1);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n).toBe(initialReceipts + 1); await page.unroute('**/launch/*/checkpoint');
    const stored = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string);
    expect(Object.keys(stored.objectives)).toEqual(['0']); expect(stored.objectives[0].score.raw).toBe('50'); expect(stored.interactions).toEqual({});
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('SCORM 1.2 atomicity verified', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
