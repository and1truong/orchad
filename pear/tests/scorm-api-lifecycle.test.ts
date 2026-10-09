import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSCORM12API} from '../src/shared/scorm-runtime.ts';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {sharedDataManifest} from './scorm-sequencing-fixture.ts';
import {scorm12PrecedenceWrites, scorm2004PrecedenceWrites} from './scorm-api-precedence-vectors.ts';

// Original vectors: ADL 1.2 RTE §§3.3.2–3; 2004 RTE §§3.1.2–7.
for (const edition of ['1.2', '2004-2', '2004-3', '2004-4'] as const) {
  const old = edition === '1.2', names = old
    ? ['LMSInitialize', 'LMSGetValue', 'LMSSetValue', 'LMSCommit', 'LMSFinish', 'LMSGetLastError', 'LMSGetErrorString', 'LMSGetDiagnostic']
    : ['Initialize', 'GetValue', 'SetValue', 'Commit', 'Terminate', 'GetLastError', 'GetErrorString', 'GetDiagnostic'];
  const key = old ? 'cmi.core.lesson_location' : 'cmi.location';
  const make = (checkpoint: (state: any, finished: boolean) => unknown) => old ? createSCORM12API({checkpoint}) : createSCORM2004API({edition, checkpoint});

  test(edition + ': simultaneous invalid inputs retain session/access/type errors without coercion or state changes', () => {
    let coercions = 0; const checkpoints: any[] = [];
    const poison = {toString() {coercions++; throw Error('authored coercion');}, valueOf() {coercions++; throw Error('authored coercion');}};
    const malformed = [undefined, null, 0, poison, Symbol('authored')];
    const api: any = make((state, finished) => checkpoints.push({state: structuredClone(state), finished}));
    const call = (i: number, ...args: any[]) => api[names[i]](...args);
    const refused = (i: number, args: any[], error: string) => {
      assert.equal(call(i, ...args), i === 1 ? '' : 'false'); assert.equal(call(5), error);
      assert.equal(typeof call(6, error), 'string'); assert.equal(typeof call(7, ''), 'string'); assert.equal(call(5), error);
    };
    for (const value of malformed) {
      refused(1, [value], old ? '301' : '122'); refused(2, [value, poison], old ? '301' : '132');
      refused(3, [value], old ? '301' : '142'); refused(4, [value], old ? '301' : '112');
    }
    assert.equal(call(0, ''), 'true'); assert.equal(call(2, key, 'retained'), 'true');
    const writes = old ? scorm12PrecedenceWrites : scorm2004PrecedenceWrites;
    for (const [name, value, error] of writes) refused(2, [name, value], error);
    for (const value of malformed) {refused(1, [value], '201'); refused(2, [value, poison], '201'); refused(2, [key, value], '201'); refused(3, [value], '201'); refused(4, [value], '201');}
    assert.equal(call(1, key), 'retained'); assert.equal(checkpoints.length, 0);
    assert.equal(call(3, ''), 'true'); assert.equal(call(4, ''), 'true');
    assert.deepEqual(checkpoints.map(x => x.finished), [false, true]);
    for (const {state} of checkpoints) {assert.equal(old ? state.core.lesson_location : state.location, 'retained'); assert.equal(Object.keys(state.interactions).length, 0);}
    for (const value of malformed) {
      refused(0, [value], old ? '301' : '104'); refused(1, [value], old ? '301' : '123');
      refused(2, [value, poison], old ? '301' : '133'); refused(3, [value], old ? '301' : '143'); refused(4, [value], old ? '301' : '113');
    }
    assert.equal(coercions, 0); assert.equal(checkpoints.length, 2);
  });

  test(edition + ': eight-method communication/argument matrix preserves state and checkpoint count', () => {
    const checkpoints: any[] = [], api: any = make((state, finished) => {checkpoints.push({state, finished});});
    const call = (i: number, ...args: any[]) => api[names[i]](...args);
    const check = (i: number, args: any[], result: string, error: string) => {
      assert.equal(call(i, ...args), result, names[i] + JSON.stringify(args)); assert.equal(call(5), error);
      assert.equal(typeof call(6, error), 'string'); assert.ok(call(7, '').length); assert.equal(call(5), error);
    };
    assert.equal(Object.isFrozen(api), true); assert.deepEqual(Object.keys(api).sort(), names.toSorted());
    for (const argument of [' ', '\n', 'init', undefined, null, 0]) check(0, [argument], 'false', '201');
    check(1, [key], '', old ? '301' : '122'); check(2, [key, 'before'], 'false', old ? '301' : '132');
    check(3, [''], 'false', old ? '301' : '142'); check(4, [''], 'false', old ? '301' : '112');
    assert.equal(checkpoints.length, 0); check(0, [''], 'true', '0');
    check(0, [''], 'false', old ? '101' : '103'); check(2, [key, 'original'], 'true', '0');
    for (const bad of [undefined, null, 0, {}]) {check(1, [bad], '', '201'); check(2, [bad, 'replacement'], 'false', '201'); check(2, [key, bad], 'false', '201');}
    check(1, [''], '', old ? '201' : '301'); check(2, ['', 'replacement'], 'false', old ? '201' : '351');
    check(1, [key], 'original', '0');
    for (const argument of [' ', '\n', 'save', undefined, null, 0]) {check(3, [argument], 'false', '201'); check(4, [argument], 'false', '201');}
    assert.equal(checkpoints.length, 0); check(3, [''], 'true', '0'); check(4, [''], 'true', '0');
    assert.deepEqual(checkpoints.map(x => x.finished), [false, true]);
    for (const {state} of checkpoints) assert.equal(old ? state.core.lesson_location : state.location, 'original');
    // 1.2's post-finish refusals retain Pear's bounded 301 policy; 2004 has explicit state codes.
    check(0, [''], 'false', old ? '301' : '104'); check(1, [key], '', old ? '301' : '123');
    check(2, [key, 'after'], 'false', old ? '301' : '133'); check(3, [''], 'false', old ? '301' : '143'); check(4, [''], 'false', old ? '301' : '113');
    assert.equal(checkpoints.length, 2);
  });

  test(edition + ': throwing checkpoint acceptance returns synchronous failure and keeps communication retryable', () => {
    let throwQueue = true; const accepted: any[] = [], attempted: any[] = [];
    const api: any = make((state, finished) => {attempted.push({state, finished}); if (throwQueue) throw Error('queue unavailable'); accepted.push({state, finished});});
    const call = (i: number, ...args: any[]) => api[names[i]](...args);
    assert.equal(call(0, ''), 'true'); assert.equal(call(2, key, 'retained'), 'true');
    assert.equal(call(3, ''), 'false'); assert.equal(call(5), old ? '101' : '391');
    assert.equal(call(4, ''), 'false'); assert.equal(call(5), old ? '101' : '111');
    assert.equal(call(1, key), 'retained'); assert.equal(accepted.length, 0);
    throwQueue = false; assert.equal(call(3, ''), 'true'); assert.equal(call(4, ''), 'true');
    assert.deepEqual(attempted.map(x => x.finished), [false, true, false, true]); assert.deepEqual(attempted[0], attempted[2]); assert.deepEqual(attempted[1], attempted[3]);
    assert.deepEqual(accepted.map(x => x.finished), [false, true]); assert.equal(call(3, ''), 'false'); assert.equal(accepted.length, 2);
  });
}

test('2004-4: a throwing queue retains shared deltas for bound replay and exact receipt retry', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', sharedDataManifest()));
  try {
    const launch = f.launch(f.enroll()), b = f.player.bootstrap(launch.token); let unavailable = true, saved: any;
    const deltas: unknown[] = [];
    const api = createSCORM2004API({edition: '2004-4', state: b.state, sequencingTree: b.sequencingTree, sequencingSnapshot: b.sequencingSnapshot,
      checkpoint(state, finished, navigation, sharedData) {deltas.push(sharedData); if (unavailable) throw Error('queue unavailable'); saved = {state, finished, navigation, sharedData};}});
    assert.equal(api.Initialize(''), 'true'); assert.equal(api.SetValue('adl.data.0.store', 'retained notes'), 'true');
    assert.equal(api.Commit(''), 'false'); assert.equal(api.GetLastError(), '391'); assert.equal(api.Terminate(''), 'false'); assert.equal(api.GetLastError(), '111');
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 0);
    unavailable = false; assert.equal(api.Commit(''), 'true');
    const request = {sequence: 1, revision: b.revision, ...saved}, receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
    assert.deepEqual(deltas, Array.from({length: 3}, () => ({'urn:pear:shared-notes': 'retained notes'})));
    assert.equal(api.Terminate(''), 'true'); assert.deepEqual(deltas[3], {});
    f.player.checkpoint(launch.token, {sequence: 2, revision: b.revision + 1, ...saved});
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 2);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
  } finally {f.db.close();}
});
