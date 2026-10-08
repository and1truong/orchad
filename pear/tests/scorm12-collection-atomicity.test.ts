import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm12API from 'scorm-again/scorm12';
import {createSCORM12API} from '../src/shared/scorm-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';

const invalidWrites = [
  ['cmi.objectives.0.score.raw', 'bad', '405'],
  ['cmi.objectives.0.score.raw', '101', '405'],
  ['cmi.objectives.0.unknown', 'x', '201'],
  ['cmi.interactions.0.type', 'invalid', '405'],
  ['cmi.interactions.0.result', 'invalid', '405'],
  ['cmi.interactions.0.unknown', 'x', '201'],
] as const;

test('1.2: rollback retains typed errors and state when Array.prototype.toReversed is unavailable', () => {
  const engine = new Scorm12API({logLevel: 'NONE'}); engine.LMSInitialize('');
  const before = structuredClone(engine.renderCMIToJSONObject().cmi), descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'toReversed')!;
  try {
    Object.defineProperty(Array.prototype, 'toReversed', {value: undefined});
    for (const [key, value, error] of invalidWrites) {
      assert.equal(engine.LMSSetValue(key, value), 'false'); assert.equal(engine.LMSGetLastError(), error);
      assert.deepEqual(engine.renderCMIToJSONObject().cmi, before);
    }
    assert.equal(engine.LMSSetValue('cmi.objectives.0.id', 'urn:pear:retry'), 'true');
  } finally {Object.defineProperty(Array.prototype, 'toReversed', descriptor);}
});

test('1.2: failed first collection writes retain exact errors, zero counts and the whole CMI state', () => {
  for (const [key, value, error] of invalidWrites) {
    const engine = new Scorm12API({logLevel: 'NONE'}); assert.equal(engine.LMSInitialize(''), 'true');
    const before = structuredClone(engine.renderCMIToJSONObject().cmi);
    for (let retry = 0; retry < 2; retry++) {
      assert.equal(engine.LMSSetValue(key, value), 'false', key); assert.equal(engine.LMSGetLastError(), error, key);
      assert.deepEqual(engine.renderCMIToJSONObject().cmi, before, key);
      assert.equal(engine.LMSGetValue('cmi.objectives._count'), '0'); assert.equal(engine.LMSGetValue('cmi.interactions._count'), '0');
    }
  }
});

test('1.2: failed next and nested appends preserve existing records; valid retry uses the same free index', () => {
  const engine = new Scorm12API({logLevel: 'NONE'}); engine.LMSInitialize('');
  assert.equal(engine.LMSSetValue('cmi.objectives.0.id', 'urn:pear:o'), 'true'); assert.equal(engine.LMSSetValue('cmi.objectives.0.score.raw', '50'), 'true');
  assert.equal(engine.LMSSetValue('cmi.interactions.0.id', 'urn:pear:q'), 'true'); assert.equal(engine.LMSSetValue('cmi.interactions.0.type', 'choice'), 'true');
  const before = structuredClone(engine.renderCMIToJSONObject().cmi);
  for (const [key, value, error] of [
    ['cmi.objectives.1.score.raw', 'bad', '405'],
    ['cmi.interactions.1.type', 'invalid', '405'],
    ['cmi.interactions.0.objectives.0.id', 'x'.repeat(256), '405'],
    ['cmi.interactions.0.correct_responses.0.unknown', 'a', '201'],
    ['cmi.objectives.0.score.raw', '101', '405'],
  ]) {
    assert.equal(engine.LMSSetValue(key, value), 'false', key); assert.equal(engine.LMSGetLastError(), error, key);
    assert.deepEqual(engine.renderCMIToJSONObject().cmi, before, key);
  }
  for (const [key, value] of [['cmi.objectives.1.id', 'urn:pear:next'], ['cmi.interactions.1.id', 'urn:pear:next'], ['cmi.interactions.0.objectives.0.id', 'urn:pear:nested'], ['cmi.interactions.0.correct_responses.0.pattern', 'a']]) assert.equal(engine.LMSSetValue(key, value), 'true', key);
  const after = engine.renderCMIToJSONObject().cmi as Record<string, any>;
  assert.deepEqual(Object.keys(after.objectives), ['0', '1']); assert.deepEqual(Object.keys(after.interactions), ['0', '1']);
  assert.deepEqual(Object.keys(after.interactions[0].objectives), ['0']); assert.deepEqual(Object.keys(after.interactions[0].correct_responses), ['0']);
});

test('1.2: trusted invalid preload rolls back the failed append while preserving earlier records', () => {
  const engine = new Scorm12API({logLevel: 'NONE'}); engine.loadFromJSON({objectives: {0: {id: 'urn:pear:o', score: {raw: '50'}}}});
  const before = structuredClone(engine.renderCMIToJSONObject().cmi);
  assert.throws(() => engine.loadFromJSON({objectives: {1: {score: {raw: 'bad'}}}}), /Incorrect Data Type/);
  assert.deepEqual(engine.renderCMIToJSONObject().cmi, before);
  engine.loadFromJSON({objectives: {1: {id: 'urn:pear:next'}}}); engine.LMSInitialize(''); assert.equal(engine.LMSGetValue('cmi.objectives._count'), '2');
});

test('1.2: failed writes never enter a durable bound checkpoint, exact retry or resumed state', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage('1.2', singleSCOManifest('1.2')));
  try {
    const binding = f.enroll(), launch = f.launch(binding); let saved: any;
    const api = createSCORM12API({state: f.player.bootstrap(launch.token).state, checkpoint(value) {saved = value;}}); assert.equal(api.LMSInitialize(''), 'true');
    for (const [key, value, error] of invalidWrites) {assert.equal(api.LMSSetValue(key, value), 'false'); assert.equal(api.LMSGetLastError(), error);}
    assert.equal(api.LMSSetValue('cmi.objectives.0.id', 'urn:pear:o'), 'true'); assert.equal(api.LMSSetValue('cmi.objectives.0.score.raw', '50'), 'true'); assert.equal(api.LMSSetValue('cmi.core.exit', 'suspend'), 'true');
    assert.equal(api.LMSCommit(''), 'true'); const request = {sequence: 1, revision: 0, state: saved, finished: false};
    const receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
    const stored = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string);
    assert.deepEqual(Object.keys(stored.objectives), ['0']); assert.deepEqual(stored.interactions, {}); assert.equal(stored.objectives[0].score.raw, '50');
    f.player.close(f.service.principal('learner-a'), launch.launchId, 'session-learner-a');
    const resumed = createSCORM12API({state: f.player.bootstrap(f.launch(binding).token).state}); resumed.LMSInitialize('');
    assert.equal(resumed.LMSGetValue('cmi.objectives._count'), '1'); assert.equal(resumed.LMSGetValue('cmi.interactions._count'), '0'); assert.equal(resumed.LMSGetValue('cmi.objectives.0.score.raw'), '50');
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
  } finally {f.db.close();}
});
