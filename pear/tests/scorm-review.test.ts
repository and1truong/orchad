import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {sequencingManifest} from './scorm-sequencing-fixture.ts';
import {multiFileManifest, multiFilePackage} from './scorm-package-fixture.ts';
import {inspectSCORMPackage, packageURI} from '../src/server/scorm-package-reader.ts';
import {sequencingTree} from '../src/server/scorm-sequencing.ts';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {openDatabase} from '../src/server/database.ts';
import {createApp} from '../src/server/app.ts';

test('finalized resource pins reject delete, replace and insertion throughout the lifecycle', async () => {
  const f = await scormLearningFixture();
  try {
    const original = f.db.prepare('SELECT * FROM scorm_engine_resources ORDER BY path').all();
    for (const state of ['published', 'retired', 'revoked']) {
      f.db.prepare('UPDATE scorm_engine_versions SET state=?').run(state);
      assert.throws(() => f.db.exec('DELETE FROM scorm_engine_resources'), /immutable/);
      for (const statement of ['INSERT', 'INSERT OR REPLACE']) assert.throws(() => f.db.prepare(statement + ' INTO scorm_engine_resources VALUES(?,?,?,?,?,?)').run(f.pkg.id, 1, 'demo', 'lessons/intro.html', Buffer.from('changed'), 'text/html'), /immutable/);
      assert.throws(() => f.db.prepare('INSERT INTO scorm_engine_resources VALUES(?,?,?,?,?,?)').run(f.pkg.id, 1, 'demo', 'extra.html', Buffer.from('extra'), 'text/html'), /immutable/);
      assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_resources ORDER BY path').all(), original);
    }
  } finally {f.db.close();}
});

test('populated schema 47 upgrades resource guards without changing pinned state or private resume history', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'scorm-resource-upgrade-')), path = join(directory, 'pear.sqlite'), f = await scormLearningFixture(path);
  try {
    f.checkpoint(f.launch(f.enroll(), 'intro'), 'incomplete', '30', false, 'migration-bookmark');
    const resources = f.db.prepare('SELECT * FROM scorm_engine_resources ORDER BY path').all(), states = f.db.prepare('SELECT * FROM scorm_sco_attempts').all();
    f.db.exec('DROP TRIGGER scorm_engine_resource_no_delete; DROP TRIGGER scorm_engine_resource_finalized_insert; DELETE FROM schema_version WHERE version=48'); f.db.close();
    const db = openDatabase(path, false);
    try {
      assert.equal(db.prepare('SELECT max(version) n FROM schema_version').get()!.n, 50);
      assert.deepEqual(db.prepare('SELECT * FROM scorm_engine_resources ORDER BY path').all(), resources); assert.deepEqual(db.prepare('SELECT * FROM scorm_sco_attempts').all(), states);
      assert.throws(() => db.exec('DELETE FROM scorm_engine_resources'), /immutable/); assert.equal(db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    } finally {db.close();}
  } finally {try {f.db.close();} catch {} rmSync(directory, {recursive: true, force: true});}
});

test('learner listing omits administrator review/provenance fields on the authenticated HTTP endpoint', async () => {
  const f = await scormLearningFixture(), origin = 'http://127.0.0.1:4314', {app} = await createApp({db: f.db, origin, developmentAuth: true});
  try {
    f.db.prepare('UPDATE scorm_engine_versions SET review_reason=?, provenance=?').run('private-review-note', 'private-provenance-note');
    assert.equal(f.packages.list(f.service.principal('admin'), true).items[0]!.review_reason, 'private-review-note');
    const login = await app.inject({method: 'POST', url: '/api/login', headers: {host: '127.0.0.1:4314', origin}, payload: {username: 'learner-a', password: 'learner-a-dev'}}), value = login.json();
    const headers = {host: '127.0.0.1:4314', cookie: String(login.headers['set-cookie']).split(';')[0]!, 'x-pear-epoch': value.sessionEpoch};
    const response = await app.inject({url: '/api/scorm-engine/packages?author=false', headers}); assert.equal(response.statusCode, 200);
    const row = response.json().items[0]; assert.equal('review_reason' in row, false); assert.equal('provenance' in row, false); assert.equal(response.body.includes('private-'), false);
    assert.equal((await app.inject({url: '/api/scorm-engine/packages?author=true', headers})).statusCode, 403);
  } finally {await app.close(); f.db.close();}
});

test('pre-retake launch idempotency receipt cannot open or mutate a preserved historical attempt', async () => {
  const f = await scormLearningFixture(), p = f.service.principal('learner-a'), binding = f.enroll();
  try {
    const args = {packageId: f.pkg.id, version: 1, mode: 'normal' as const, confirmed: true, revision: f.service.context('learner-a').revision, key: 'pre-retake-launch', binding, scoId: 'intro'};
    const old = f.player.launch(p, 'session-learner-a', args); f.checkpoint(old, 'failed', '30');
    const next = f.player.retake(p, {registrationId: old.registrationId, attemptId: old.attemptId, confirmed: true, revision: f.service.context('learner-a').revision, key: 'retake-review'});
    const state = f.db.prepare('SELECT * FROM scorm_sco_attempts').all(), caps = f.db.prepare('SELECT * FROM scorm_engine_launches').all(), revision = f.service.context('learner-a').revision, audits = f.db.prepare('SELECT count(*) n FROM audit').get()!.n;
    assert.throws(() => f.player.launch(p, 'session-learner-a', args), /superseded/);
    assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').all(), state); assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_launches').all(), caps);
    assert.equal(f.service.context('learner-a').revision, revision); assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get()!.n, audits); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    const freshArgs = {...args, revision, key: 'current-attempt-launch'}, fresh = f.player.launch(p, 'session-learner-a', freshArgs); assert.equal(fresh.attemptId, next.attemptId);
    assert.equal(f.player.launch(p, 'session-learner-a', freshArgs).attemptId, next.attemptId);
    assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts WHERE attempt_id=?').all(old.attemptId), state);
  } finally {f.db.close();}
});

test('root xml:base normalizes inside the package while concrete/escaping resource URIs still fail', async () => {
  for (const xml of [multiFileManifest().replace('<p:manifest ', '<p:manifest xml:base="./" '), multiFileManifest().replace('<p:resources>', '<p:resources xml:base="./">'), multiFileManifest().replace('<p:resources>', '<p:resources xml:base="assets/../">')]) {
    const parsed = await inspectSCORMPackage(multiFilePackage('1.2', xml)); assert.equal(parsed.manifest.resources[0]!.href, 'lessons/intro.html');
  }
  assert.throws(() => packageURI('', './'), /unsafe/); assert.throws(() => packageURI('', '../', true), /escapes/);
  await assert.rejects(() => inspectSCORMPackage(multiFilePackage('1.2', multiFileManifest().replace('<p:manifest ', '<p:manifest xml:base="../" '))), /escapes/);
});

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': ADL namespace objective scope accepts local/system scopes and refuses malformed definitions', async () => {
    for (const local of ['false', '0']) {const parsed = await inspectSCORMPackage(multiFilePackage(edition, sequencingManifest(edition).replace('a:objectivesGlobalToSystem="false"', 'a:objectivesGlobalToSystem="' + local + '"'))); assert.equal(parsed.manifest.objectivesGlobalToSystem, false); assert.ok(sequencingTree(parsed.manifest));}
    const global = await inspectSCORMPackage(multiFilePackage(edition, sequencingManifest(edition).replace('a:objectivesGlobalToSystem="false"', 'a:objectivesGlobalToSystem="true"'))); assert.equal(global.manifest.objectivesGlobalToSystem, true); assert.ok(sequencingTree(global.manifest));
    await assert.rejects(() => inspectSCORMPackage(multiFilePackage(edition, sequencingManifest(edition).replace('a:objectivesGlobalToSystem="false"', 'a:objectivesGlobalToSystem="invalid"'))), /objective scope/);
    await assert.rejects(() => inspectSCORMPackage(multiFilePackage(edition, sequencingManifest(edition).replace('a:objectivesGlobalToSystem="false"', 'a:objectivesGlobalToSystem="false" objectivesGlobalToSystem="true"'))), /conflicting/);
  });
  test(edition + ': flow-only unopened sessions start at the first deliverable SCO and never bypass choice denial', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, sequencingManifest(edition).replace('choice="true"', 'choice="false"'))), binding = f.enroll(), p = f.service.principal('learner-a');
    try {
      const context = f.player.context(p, binding); assert.equal(context.activities.find(a => a.id === 'intro')!.available, true); assert.equal(context.activities.find(a => a.id === 'practice')!.available, false);
      assert.throws(() => f.launch(binding, 'practice'), /denies|prerequisites/); const launch = f.launch(binding, 'intro'), b = f.player.bootstrap(launch.token); assert.equal(launch.scoId, 'intro');
      let state: any; const api = createSCORM2004API({edition, state: b.state, sequencingTree: b.sequencingTree, sequencingSnapshot: b.sequencingSnapshot, checkpoint(value) {state = value;}}); assert.equal(api.Initialize(''), 'true');
      for (const [key, value] of Object.entries({'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'})) assert.equal(api.SetValue(key, value), 'true');
      assert.equal(api.Terminate(''), 'true'); const result = f.player.checkpoint(launch.token, {sequence: 1, revision: 0, state, finished: true, navigation: 'continue'}); assert.equal(result.nextScoId, 'practice');
      assert.equal(f.launch(binding, 'practice').scoId, 'practice'); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    } finally {f.db.close();}
  });
  test(edition + ': restored navigation is visible to the SCO and retained by subsequent Commit', () => {
    for (const navigation of ['exit', 'suspendAll', '_none_']) {
      let committed = ''; const api = createSCORM2004API({edition, navigation, checkpoint(_state, _finished, nav) {committed = nav;}});
      assert.equal(api.Initialize(''), 'true'); assert.equal(api.GetValue('adl.nav.request'), navigation); assert.equal(api.GetLastError(), '0'); assert.equal(api.Commit(''), 'true'); assert.equal(committed, navigation);
    }
  });
}
