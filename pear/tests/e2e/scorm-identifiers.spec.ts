import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';
import {validIdentifiers, invalidIdentifiers} from '../scorm-identifier-vectors.ts';
import {validURNs, invalidURNs} from '../scorm-urn-vectors.ts';
import {validSchemeReferences, invalidSchemeReferences} from '../scorm-uri-scheme-vectors.ts';
import {validFragmentReferences, invalidFragmentReferences} from '../scorm-uri-fragment-vectors.ts';
import {validAuthorityReferences, invalidAuthorityReferences, validLegacyAuthorityReferences, invalidLegacyAuthorityReferences} from '../scorm-uri-authority-vectors.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': built URI bindings and full-capacity choice survive lost ACK and close/resume', async ({page}) => {
  const valid = [...validIdentifiers, ...validURNs, ...validSchemeReferences, ...validFragmentReferences, ...(edition === '2004-2' ? validLegacyAuthorityReferences : validAuthorityReferences)], invalid = [...invalidIdentifiers, ...invalidURNs, ...invalidSchemeReferences, ...invalidFragmentReferences, ...(edition === '2004-2' ? invalidLegacyAuthorityReferences : invalidAuthorityReferences)], fullIndex = valid.length;
  const script = `const valid=${JSON.stringify(valid)},invalid=${JSON.stringify(invalid)},api=parent.API_1484_11;
    for(const [i,value] of valid.entries()){const base='cmi.interactions.'+i;
      if(api.GetValue('cmi.entry')==='resume'&&api.GetValue(base+'.id')!==(i===0?'urn:pear:replacement':value))throw Error('ID resume');
      if(api.SetValue(base+'.id',value)!=='true'||api.SetValue(base+'.type','likert')!=='true')throw Error('ID dependency');
      for(const suffix of ['.learner_response','.correct_responses.0.pattern']){
        if(api.SetValue(base+suffix,value)!=='true')throw Error('valid URI');
        for(const bad of invalid)if(api.SetValue(base+suffix,bad)!=='false'||api.GetLastError()!=='406'||api.GetValue(base+suffix)!==value)throw Error('invalid URI');
      }
    }
    if(api.SetValue('cmi.interactions.0.id','urn:pear:replacement')!=='true'||api.GetValue('cmi.interactions.0.id')!=='urn:pear:replacement'||api.GetValue('cmi.interactions.0.learner_response')!==valid[0]||api.GetValue('cmi.interactions.0.correct_responses.0.pattern')!==valid[0])throw Error('ID replacement retains response');
    for(const bad of ['bad%','1:invalid','a\\n'])if(api.SetValue('cmi.interactions.0.id',bad)!=='false'||api.GetLastError()!=='406'||api.GetValue('cmi.interactions.0.id')!=='urn:pear:replacement')throw Error('ID replacement refusal');
    const full=Array.from({length:36},(_,i)=>String(i).padStart(2,'0')+'a'.repeat(3998)).join('[,]'),base='cmi.interactions.${fullIndex}';
    if(api.GetValue('cmi.entry')==='resume'&&api.GetValue(base+'.learner_response')!==full)throw Error('full choice resume');
    if(api.SetValue(base+'.id','urn:pear:full-choice')!=='true'||api.SetValue(base+'.type','choice')!=='true')throw Error('choice dependency');
    for(const suffix of ['.learner_response','.correct_responses.0.pattern'])if(api.SetValue(base+suffix,full)!=='true')throw Error('full choice');
    const second=base+'.correct_responses.1.pattern',third=base+'.correct_responses.2.pattern';
    if(api.GetValue('cmi.entry')==='resume'&&api.GetValue(second)!=='b[,]a')throw Error('choice set order resume');
    if(api.SetValue(second,'a[,]b')!=='true')throw Error('distinct choice set');
    for(const key of [third,base+'.correct_responses.0.pattern'])if(api.SetValue(key,'b[,]a')!=='false'||api.GetLastError()!=='351'||api.GetValue(base+'.correct_responses._count')!=='2'||api.GetValue(base+'.correct_responses.0.pattern')!==full||api.GetValue(second)!=='a[,]b')throw Error('choice set duplicate rollback');
    if(api.SetValue(second,'b[,]a')!=='true'||api.GetValue(second)!=='b[,]a')throw Error('same-index authored order');
    document.getElementById('entry').textContent='URI bindings verified';`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); f.enroll();
  const origin = 'http://127.0.0.1:4346', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4347', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4347, host: '127.0.0.1'}); await app.listen({port: 4346, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), outer = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = outer.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('URI bindings verified', {exact: true})).toBeVisible();
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
    for (const [i, value] of valid.entries()) expect(stored.interactions[i].id).toBe(i === 0 ? 'urn:pear:replacement' : value);
    expect(stored.interactions[fullIndex].learner_response.length).toBe(144105); expect(stored.interactions[fullIndex].correct_responses[0].pattern).toBe(stored.interactions[fullIndex].learner_response);
    expect(stored.interactions[fullIndex].correct_responses[1].pattern).toBe('b[,]a'); expect(Object.keys(stored.interactions[fullIndex].correct_responses)).toHaveLength(2);
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('URI bindings verified', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
