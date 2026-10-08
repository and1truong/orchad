import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm12API from 'scorm-again/scorm12';
import {createSCORM12API} from '../src/shared/scorm-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';

test('1.2: fresh core and new objective score components are blank until explicitly set', () => {
  const api = createSCORM12API(); assert.equal(api.LMSInitialize(''), 'true');
  assert.equal(api.LMSSetValue('cmi.objectives.0.id', 'urn:pear:o'), 'true');
  for (const base of ['cmi.core.score', 'cmi.objectives.0.score']) for (const field of ['raw', 'min', 'max']) {
    assert.equal(api.LMSGetValue(base + '.' + field), '', base + '.' + field); assert.equal(api.LMSGetLastError(), '0');
    assert.equal(api.LMSSetValue(base + '.' + field, '80'), 'true'); assert.equal(api.LMSGetValue(base + '.' + field), '80');
    assert.equal(api.LMSSetValue(base + '.' + field, ''), 'true'); assert.equal(api.LMSGetValue(base + '.' + field), '');
  }
});

test('1.2: shared score reset clears max along with raw/min; explicit trusted preload remains exact', () => {
  const engine = new Scorm12API({logLevel: 'NONE'});
  engine.loadFromJSON({core: {score: {raw: '75', min: '5', max: '80'}}, objectives: {0: {id: 'urn:pear:o', score: {raw: '50', min: '0', max: '100'}}}});
  engine.LMSInitialize(''); assert.equal(engine.LMSGetValue('cmi.core.score.max'), '80'); assert.equal(engine.LMSGetValue('cmi.objectives.0.score.max'), '100');
  engine.reset(); engine.LMSInitialize('');
  for (const field of ['raw', 'min', 'max']) assert.equal(engine.LMSGetValue('cmi.core.score.' + field), '');
  assert.equal(engine.LMSGetValue('cmi.objectives._count'), '0');
});

test('1.2: blank score defaults survive bound checkpoint/retry/resume; later reported max is preserved', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage('1.2', singleSCOManifest('1.2')));
  try {
    const binding = f.enroll(), launch = f.launch(binding); let saved: any;
    const api = createSCORM12API({state: f.player.bootstrap(launch.token).state, checkpoint(value) {saved = value;}}); assert.equal(api.LMSInitialize(''), 'true');
    assert.equal(api.LMSSetValue('cmi.objectives.0.id', 'urn:pear:o'), 'true'); assert.equal(api.LMSSetValue('cmi.core.exit', 'suspend'), 'true'); assert.equal(api.LMSCommit(''), 'true');
    for (const score of [saved.core.score, saved.objectives[0].score]) assert.deepEqual(score, {raw: '', min: '', max: ''});
    const request = {sequence: 1, revision: 0, state: saved, finished: false}, receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
    f.player.close(f.service.principal('learner-a'), launch.launchId, 'session-learner-a'); const next = f.launch(binding);
    const resumed = createSCORM12API({state: f.player.bootstrap(next.token).state, checkpoint(value) {saved = value;}}); resumed.LMSInitialize('');
    assert.equal(resumed.LMSGetValue('cmi.core.score.max'), ''); assert.equal(resumed.LMSGetValue('cmi.objectives.0.score.max'), '');
    assert.equal(resumed.LMSSetValue('cmi.core.score.max', '80'), 'true'); assert.equal(resumed.LMSSetValue('cmi.objectives.0.score.max', '90'), 'true'); assert.equal(resumed.LMSCommit(''), 'true');
    f.player.checkpoint(next.token, {sequence: 1, revision: 1, state: saved, finished: false});
    const stored = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string);
    assert.equal(stored.core.score.max, '80'); assert.equal(stored.objectives[0].score.max, '90');
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
  } finally {f.db.close();}
});
