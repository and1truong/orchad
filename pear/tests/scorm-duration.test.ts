import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sequencingManifest, collectionManifest} from './scorm-sequencing-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
import {inspectSCORMPackage} from '../src/server/scorm-package-reader.ts';
import {sequencingTree} from '../src/server/scorm-sequencing.ts';
const xml = (edition: '2004-2' | '2004-3' | '2004-4', key: string, seconds = 10) => sequencingManifest(edition).replace('<p:title>Introduction</p:title><s:sequencing>', `<p:title>Introduction</p:title><s:sequencing><s:limitConditions ${key}="PT${seconds}S"/>`);
const snapshot = (f: any) => JSON.parse(JSON.parse(String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts ORDER BY attempt_number DESC LIMIT 1').get()!.sequencing_state)).snapshot);
for(const edition of ['2004-2','2004-3','2004-4'] as const) test(`${edition}: calendar-only active reopen checks both leaf and ancestor windows without requiring a new clock snapshot`,async t=>{
  const begin=Date.parse('2026-10-08T00:00:00Z'),end=begin+10000;
  t.mock.timers.enable({apis:['Date'],now:begin});
  try {for(const parent of [false,true]) {
    const limits='<s:limitConditions beginTimeLimit="2026-10-08T00:00:00Z" endTimeLimit="2026-10-08T00:00:10Z"/>';
    const manifest=parent?sequencingManifest(edition).replace('<s:controlMode flow="true" choice="true" forwardOnly="true"/>','<s:controlMode flow="true" choice="true" forwardOnly="true"/>'+limits):sequencingManifest(edition).replace('<p:title>Introduction</p:title><s:sequencing>','<p:title>Introduction</p:title><s:sequencing>'+limits);
    t.mock.timers.setTime(begin);const f=await scormLearningFixture(undefined,multiFilePackage(edition,manifest));
    try {
      const binding=f.enroll(),first=f.launch(binding);f.player.close(f.service.principal('learner-a'),first.launchId,'session-learner-a');
      assert.equal(snapshot(f).pearDurationClock,undefined);
      for(const now of [begin,end]) {t.mock.timers.setTime(now);const reopened=f.launch(binding);assert.equal(reopened.scoId,'intro');f.player.close(f.service.principal('learner-a'),reopened.launchId,'session-learner-a');}
      const launches=f.db.prepare('SELECT count(*) n FROM scorm_engine_launches').get()!.n;
      for(const now of [end+1,begin-1]) {t.mock.timers.setTime(now);for(const sco of [undefined,'intro']) assert.throws(()=>f.launch(binding,sco),/denies|prerequisite/);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_launches').get()!.n,launches);}
      assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);
    } finally {f.db.close();}
  }} finally {t.mock.timers.reset();}
});
for (const edition of ['2004-2','2004-3','2004-4'] as const) test(`${edition}: absolute vs experienced clocks persist through suspend and cannot use forged reported time`, async t => {
  for (const key of ['attemptAbsoluteDurationLimit','attemptExperiencedDurationLimit']) {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, xml(edition,key)));
    t.mock.timers.enable({apis: ['Date'], now: new Date('2026-10-07T00:00:00Z')});
    try {
      const binding = f.enroll(), first = f.launch(binding); assert.equal(f.player.bootstrap(first.token).state.max_time_allowed, key === 'attemptAbsoluteDurationLimit' ? 'PT10S' : '');
      t.mock.timers.tick(2000);
      const request = sequenceCheckpoint(f, first, {'cmi.completion_status': 'incomplete', 'cmi.session_time': 'PT1000S', 'cmi.exit': 'suspend', 'adl.nav.request': 'suspendAll'});
      const receipt = f.player.checkpoint(first.token, request); assert.deepEqual(f.player.checkpoint(first.token, request), receipt);
      const suspended = snapshot(f).pearDurationClock.rows.intro; assert.equal(suspended.absolute,2000); assert.equal(suspended.experienced,2000);
      t.mock.timers.tick(20000);
      if (key === 'attemptAbsoluteDurationLimit') assert.throws(() => f.launch(binding), /prerequisite|denies/);
      else {const next = f.launch(binding), resumed = snapshot(f).pearDurationClock.rows.intro; assert.equal(resumed.absolute,22000); assert.equal(resumed.experienced,2000); assert.equal(resumed.attempt,1); assert.equal(f.player.bootstrap(next.token).state.entry,'resume');}
      assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);
    } finally {f.db.close(); t.mock.timers.reset();}
  }
});

test('all four duration definitions validate in collections/unselected organizations; inline groups replace defaults', async () => {
  for (const key of ['attemptAbsoluteDurationLimit','attemptExperiencedDurationLimit','activityAbsoluteDurationLimit','activityExperiencedDurationLimit']) {
    const collection = collectionManifest().replace('<s:sequencing ID="shared-0">', `<s:sequencing ID="shared-0"><s:limitConditions ${key}="P1DT2H3M4.05S"/>`).replace('<s:sequencing IDRef="shared-0"/>','<s:sequencing IDRef="shared-0"><s:limitConditions/></s:sequencing>');
    const tree: Record<string, any> = sequencingTree((await inspectSCORMPackage(multiFilePackage('2004-4',collection))).manifest); assert.equal(tree[key],undefined);
    for (const value of ['-PT1S','P','PT','P1M','P1Y','P1W','PT1.001S','PT999999999999999S','PT1e3S','']) await assert.rejects(inspectSCORMPackage(multiFilePackage('2004-4',sequencingManifest().replace('</p:organizations>', `<p:organization identifier="unused"><p:title>Unused</p:title><s:sequencing><s:limitConditions ${key}="${value}"/></s:sequencing></p:organization></p:organizations>`))),/Unsupported|malformed/);
  }
});

test('zero duration/count means no first delivery; untracked leaves ignore authored limits', async () => {
  for (const key of ['attemptAbsoluteDurationLimit','attemptExperiencedDurationLimit','activityAbsoluteDurationLimit','activityExperiencedDurationLimit','attemptLimit']) for (const untracked of [false,true]) {
    const manifest = xml('2004-4',key,0).replace(`${key}="PT0S"`, `${key}="${key === 'attemptLimit' ? '0' : 'PT0S'}"`).replace('<s:limitConditions', (untracked ? '<s:deliveryControls tracked="false"/>' : '') + '<s:limitConditions');
    const f = await scormLearningFixture(undefined,multiFilePackage('2004-4',manifest));
    try {const binding=f.enroll(); if (untracked) assert.equal(f.launch(binding).scoId,'intro'); else {assert.throws(()=>f.launch(binding,'intro'),/prerequisite|denies/); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_registrations').get()!.n,0);}} finally {f.db.close();}
  }
});

test('experienced clock pauses on human close; absolute continues; wall-clock rollback never grants time', async t => {
  for (const key of ['attemptAbsoluteDurationLimit','attemptExperiencedDurationLimit']) {
    const f = await scormLearningFixture(undefined,multiFilePackage('2004-4',xml('2004-4',key,10)));
    t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-07T00:00:00Z')});
    try {
      const binding=f.enroll(), first=f.launch(binding); t.mock.timers.tick(2000); f.player.checkpoint(first.token,sequenceCheckpoint(f,first,{'cmi.completion_status':'incomplete','cmi.exit':'suspend','cmi.session_time':'PT800S'},false));
      f.player.close(f.service.principal('learner-a'),first.launchId,'session-learner-a'); const closed=snapshot(f).pearDurationClock; assert.equal(closed.paused,true); assert.equal(closed.rows.intro.experienced,2000);
      t.mock.timers.tick(5000); const resumed=f.launch(binding), after=snapshot(f).pearDurationClock.rows.intro; assert.equal(after.absolute,7000); assert.equal(after.experienced,2000);
      t.mock.timers.setTime(new Date('2026-10-07T00:00:01Z').getTime()); f.player.checkpoint(resumed.token,sequenceCheckpoint(f,resumed,{'cmi.completion_status':'incomplete'},false)); assert.equal(snapshot(f).pearDurationClock.rows.intro.absolute,7000);
      t.mock.timers.setTime(new Date('2026-10-07T00:00:10Z').getTime());
      const context=f.player.context(f.service.principal('learner-a'),binding); assert.equal(context.activities.find(a=>a.id==='intro')!.available,key!=='attemptAbsoluteDurationLimit');
      assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);
    } finally {f.db.close();t.mock.timers.reset();}
  }
});

test('duration state resets for technical retry while activity totals continue, and audit rollback cannot spend clock state', async t => {
  const {retryManifest}=await import('./scorm-sequencing-fixture.ts');
  for (const key of ['attemptAbsoluteDurationLimit','attemptExperiencedDurationLimit','activityAbsoluteDurationLimit','activityExperiencedDurationLimit']) {
    const manifest=retryManifest('2004-4').replace('<s:limitConditions attemptLimit="3"/>',`<s:limitConditions attemptLimit="3" ${key}="PT10S"/>`);
    const f=await scormLearningFixture(undefined,multiFilePackage('2004-4',manifest)); t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-07T00:00:00Z')});
    try {
      const binding=f.enroll(), first=f.launch(binding);t.mock.timers.tick(4000);
      const request=sequenceCheckpoint(f,first,{'cmi.completion_status':'completed','cmi.success_status':'failed','cmi.score.scaled':'0.4','adl.nav.request':'exit'});
      const before=f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state;
      f.db.exec("CREATE TRIGGER duration_audit_failure BEFORE INSERT ON audit WHEN NEW.tool='runtime_scorm_engine_checkpoint' BEGIN SELECT RAISE(ABORT,'duration audit failure'); END");assert.throws(()=>f.player.checkpoint(first.token,request),/duration audit failure/); assert.equal(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state,before);assert.equal(f.db.prepare('SELECT sequence FROM scorm_engine_launches').get()!.sequence,0);f.db.exec('DROP TRIGGER duration_audit_failure');
      const receipt=f.player.checkpoint(first.token,request);assert.equal(receipt.nextScoId,'intro');assert.deepEqual(f.player.checkpoint(first.token,request),receipt);
      const retry=snapshot(f).pearDurationClock.rows.intro; assert.equal(retry.attempt,2);assert.equal(retry.absolute,0);assert.equal(retry.experienced,0);assert.equal(retry.activityAbsolute,4000);assert.equal(retry.activityExperienced,4000);
      assert.equal(snapshot(f).pearDurationClock.paused,true);
      // Simulate a lost finish response followed by delayed close/relaunch.
      t.mock.timers.tick(2000);assert.deepEqual(f.player.checkpoint(first.token,request),receipt);
      f.player.close(f.service.principal('learner-a'),first.launchId,'session-learner-a');t.mock.timers.tick(1000);
      const next=f.launch(binding);t.mock.timers.tick(6000);f.player.checkpoint(next.token,sequenceCheckpoint(f,next,{'cmi.completion_status':'incomplete'},false));
      const state=snapshot(f).pearDurationClock.rows.intro;assert.equal(state.absolute,9000);assert.equal(state.experienced,6000);assert.equal(state.activityAbsolute,13000);assert.equal(state.activityExperienced,10000);
      assert.equal(f.player.context(f.service.principal('learner-a'),binding).activities.find(a=>a.id==='intro')!.available,key.startsWith('attempt'));
    } finally {f.db.close();t.mock.timers.reset();}
  }
});

test('trusted clocks and exact receipts survive real database/server reopen', async t => {
  const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
  const {fixture}=await import('./helpers.ts'),{SCORMPlayerService}=await import('../src/server/scorm-player-service.ts'),{SCORMLearningBindings}=await import('../src/server/scorm-learning-bindings.ts');
  const directory=mkdtempSync(join(tmpdir(),'pear-duration-')),path=join(directory,'db.sqlite');
  const f=await scormLearningFixture(path,multiFilePackage('2004-4',xml('2004-4','attemptExperiencedDurationLimit',10)));
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-07T00:00:00Z')});
  const binding=f.enroll(),first=f.launch(binding);t.mock.timers.tick(2000);const request=sequenceCheckpoint(f,first,{'cmi.completion_status':'incomplete','cmi.exit':'suspend','adl.nav.request':'suspendAll'}),receipt=f.player.checkpoint(first.token,request);f.db.close();
  const opened=fixture(path),player=new SCORMPlayerService(opened.db,new SCORMLearningBindings(opened.db,opened.service));
  try {
    t.mock.timers.tick(20000);assert.deepEqual(player.checkpoint(first.token,request),receipt);
    const next=player.launch(opened.service.principal('learner-a'),'session-learner-a',{packageId:f.pkg.id,version:1,binding,mode:'normal',confirmed:true,revision:opened.service.context('learner-a','learning:demo:learner-a').revision,key:crypto.randomUUID()});
    const clock=JSON.parse(player.bootstrap(next.token).sequencingSnapshot!).pearDurationClock.rows.intro;assert.equal(clock.attempt,1);assert.equal(clock.absolute,22000);assert.equal(clock.experienced,2000);assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);
  } finally {opened.db.close();rmSync(directory,{recursive:true,force:true});t.mock.timers.reset();}
});

test('finished navigation does not charge an unexposed successor during lost response and delayed close', async t => {
  const manifest=sequencingManifest().replaceAll('<s:sequencing>', '<s:sequencing><s:limitConditions attemptExperiencedDurationLimit="PT10S"/>');
  const f=await scormLearningFixture(undefined,multiFilePackage('2004-4',manifest));t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-07T00:00:00Z')});
  try {
    const binding=f.enroll(),first=f.launch(binding);t.mock.timers.tick(2000);
    const request=sequenceCheckpoint(f,first,{'cmi.completion_status':'completed','cmi.success_status':'passed','cmi.score.scaled':'0.9','adl.nav.request':'continue'});
    const receipt=f.player.checkpoint(first.token,request);assert.equal(receipt.nextScoId,'practice');assert.equal(snapshot(f).pearDurationClock.paused,true);
    t.mock.timers.tick(20000);assert.deepEqual(f.player.checkpoint(first.token,request),receipt);
    f.player.close(f.service.principal('learner-a'),first.launchId,'session-learner-a');t.mock.timers.tick(20000);
    const next=f.launch(binding);assert.equal(next.scoId,'practice');assert.equal(snapshot(f).pearDurationClock.rows.practice.experienced,0);assert.equal(snapshot(f).pearDurationClock.rows.practice.absolute,40000);
    t.mock.timers.tick(1000);f.player.checkpoint(next.token,sequenceCheckpoint(f,next,{'cmi.completion_status':'incomplete'},false));assert.equal(snapshot(f).pearDurationClock.rows.practice.experienced,1000);
  } finally {f.db.close();t.mock.timers.reset();}
});

test('experienced exposure is capped by the live launch deadline while absolute wall time continues', async t => {
  const f=await scormLearningFixture(undefined,multiFilePackage('2004-4',xml('2004-4','attemptExperiencedDurationLimit',10000)));t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-07T00:00:00Z')});
  try {const binding=f.enroll(),first=f.launch(binding);t.mock.timers.tick(2000);f.player.checkpoint(first.token,sequenceCheckpoint(f,first,{'cmi.completion_status':'incomplete'},false));t.mock.timers.tick(2*3600*1000-2000);assert.throws(()=>f.player.bootstrap(first.token),/expired/);const next=f.launch(binding),clock=JSON.parse(f.player.bootstrap(next.token).sequencingSnapshot!).pearDurationClock.rows.intro;assert.equal(clock.absolute,7200000);assert.equal(clock.experienced,3600000);assert.equal(clock.attempt,1);}finally{f.db.close();t.mock.timers.reset();}
});

test('host parent duration denies stale continuation without persisting CMI, time, navigation or proof', async t => {
  const manifest=sequencingManifest().replace('<s:controlMode flow="true" choice="true" forwardOnly="true"/>','<s:controlMode flow="true" choice="true" forwardOnly="true"/><s:limitConditions activityAbsoluteDurationLimit="PT10S"/>');
  const f=await scormLearningFixture(undefined,multiFilePackage('2004-4',manifest));t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-07T00:00:00Z')});
  try {const first=f.launch(f.enroll()),request=sequenceCheckpoint(f,first,{'cmi.completion_status':'completed','cmi.success_status':'passed','cmi.score.scaled':'0.9','cmi.session_time':'PT500S','adl.nav.request':'continue'});t.mock.timers.tick(10000);assert.throws(()=>f.player.checkpoint(first.token,request),/denies navigation|rejected Terminate/);assert.equal(f.db.prepare('SELECT sequence FROM scorm_engine_launches').get()!.sequence,0);assert.equal(f.db.prepare('SELECT reported_seconds FROM scorm_sco_attempts').get()!.reported_seconds,0);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,0);}finally{f.db.close();t.mock.timers.reset();}
});
