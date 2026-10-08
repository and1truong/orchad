import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm2004API from 'scorm-again/scorm2004';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
const fields = ['location', 'suspend_data'];
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': shared content snapshots omit untouched fields and restore explicitly cleared blanks', () => {
    const original = new Scorm2004API({logLevel: 'NONE'}); assert.equal(original.Initialize(''), 'true');
    const absent = original.renderCMIToJSONObject().cmi as Record<string, unknown>;
    for (const field of fields) {assert.equal(original.GetValue('cmi.' + field), ''); assert.equal(original.GetLastError(), '403'); assert.equal(Object.hasOwn(absent, field), false, field);}
    const shared = new Scorm2004API({logLevel: 'NONE'}); shared.loadFromJSON({location: '', suspend_data: ''});
    for (const api of [shared, createSCORM2004API({edition, state: {location: '', suspend_data: ''}})]) {
      assert.equal(api.Initialize(''), 'true');
      for (const field of fields) {assert.equal(api.GetValue('cmi.' + field), ''); assert.equal(api.GetLastError(), '0', field); assert.equal(api.SetValue('cmi.' + field, 'original'), 'true'); assert.equal(api.SetValue('cmi.' + field, ''), 'true'); assert.equal(api.SetValue('cmi.' + field, '\ud800'), 'false'); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue('cmi.' + field), ''); assert.equal(api.GetLastError(), '0');}
    }
    original.cmi.reset(); original.cmi.initialize();
    const reset = original.renderCMIToJSONObject().cmi as Record<string, unknown>;
    for (const field of fields) assert.equal(Object.hasOwn(reset, field), false, 'reset ' + field);
  });
  test(edition + ': content omission and supplied blank survive durable history, identical retry and close/resume', async () => {
    for (const supplied of [false, true]) {
      const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
      try {
        const binding = f.enroll(), launch = f.launch(binding), b = f.player.bootstrap(launch.token); let state: any;
        const api = createSCORM2004API({edition, state: b.state, checkpoint(value) {state = value;}}); assert.equal(api.Initialize(''), 'true');
        for (const field of fields) {
          if (supplied) {assert.equal(api.SetValue('cmi.' + field, 'original'), 'true'); assert.equal(api.SetValue('cmi.' + field, ''), 'true');}
          assert.equal(api.SetValue('cmi.' + field, '\ud800'), 'false'); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue('cmi.' + field), ''); assert.equal(api.GetLastError(), supplied ? '0' : '403');
        }
        assert.equal(api.SetValue('cmi.exit', 'suspend'), 'true'); assert.equal(api.Commit(''), 'true');
        for (const field of fields) assert.equal(Object.hasOwn(state, field), supplied, field);
        const request = {sequence: 1, revision: b.revision, state, finished: false}, receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
        for (const field of fields) assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: b.revision + 1, state: {...state, [field]: '\ud800'}}), /data model|quota/);
        assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, b.revision + 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
        const stored = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string);
        for (const field of fields) {assert.equal(Object.hasOwn(stored, field), supplied, field); if (supplied) assert.equal(stored[field], '');}
        f.player.close(f.service.principal('learner-a'), launch.launchId, 'session-learner-a'); const resumed = createSCORM2004API({edition, state: f.player.bootstrap(f.launch(binding).token).state}); assert.equal(resumed.Initialize(''), 'true');
        for (const field of fields) {assert.equal(resumed.GetValue('cmi.' + field), ''); assert.equal(resumed.GetLastError(), supplied ? '0' : '403', field);}
      } finally {f.db.close();}
    }
  });
}
