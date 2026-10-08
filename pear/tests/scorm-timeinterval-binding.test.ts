import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm12API from 'scorm-again/scorm12';
import Scorm2004API from 'scorm-again/scorm2004';
import {createSCORM12API} from '../src/shared/scorm-runtime.ts';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';

for (const edition of ['1.2', '2004-2', '2004-3', '2004-4'] as const) {
  const old = edition === '1.2', session = old ? 'cmi.core.session_time' : 'cmi.session_time';
  const valid = old ? ['00:00:00', '01:02:03.4', '123:45:56.78', '9999:59:59.99'] : ['P0D', 'P1Y3M2DT3H', 'PT000005H', 'PT100M', 'PT0.01S'];
  const invalid = old ? ['1:00:01', '12345:00:01', '00:00:01.123', '00:00:01x', '00:00:01\n'] : ['P', 'PT', 'P1W', 'P1.5Y', 'P1,5D', 'P1H', 'P1DT', 'PT1.001S', 'PT1Sx', 'PT1S\n'];
  test(edition + ': shared timeinterval binding rejects malformed durations before changing session/latency', () => {
    for (const facade of [false, true]) {
      const api: any = old ? facade ? createSCORM12API() : new Scorm12API({logLevel: 'NONE'}) : facade ? createSCORM2004API({edition}) : new Scorm2004API({logLevel: 'NONE'});
      const set = (key: string, value: string) => api[old ? 'LMSSetValue' : 'SetValue'](key, value);
      assert.equal(api[old ? 'LMSInitialize' : 'Initialize'](''), 'true');
      assert.equal(set('cmi.interactions.0.id', 'urn:pear:duration'), 'true');
      for (const value of valid) for (const key of [session, 'cmi.interactions.0.latency']) assert.equal(set(key, value), 'true', key + ': ' + value);
      const before = structuredClone(api.renderCMIToJSONObject ? api.renderCMIToJSONObject().cmi : null);
      for (const value of invalid) for (const key of [session, 'cmi.interactions.0.latency']) {
        assert.equal(set(key, value), 'false', key + ': ' + JSON.stringify(value));
        assert.equal(api[old ? 'LMSGetLastError' : 'GetLastError'](), old ? '405' : '406');
      }
      if (before) assert.deepEqual(api.renderCMIToJSONObject().cmi, before);
    }
  });
  test(edition + ': malformed latency checkpoints preserve revision, exact receipt and proof state', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
    try {
      const launch = f.launch(f.enroll()), b = f.player.bootstrap(launch.token); let state: any;
      const options = {state: b.state, checkpoint(value: any) {state = value;}};
      const api: any = old ? createSCORM12API(options) : createSCORM2004API({...options, edition});
      const set = (key: string, value: string) => api[old ? 'LMSSetValue' : 'SetValue'](key, value);
      assert.equal(api[old ? 'LMSInitialize' : 'Initialize'](''), 'true');
      assert.equal(set('cmi.interactions.0.id', 'urn:pear:duration'), 'true');
      assert.equal(set('cmi.interactions.0.latency', valid[1]), 'true');
      assert.equal(set(session, old ? '00:00:04' : 'PT4S'), 'true');
      assert.equal(api[old ? 'LMSCommit' : 'Commit'](''), 'true');
      const request = {sequence: 1, revision: 0, state, finished: false}, receipt = f.player.checkpoint(launch.token, request);
      for (const value of invalid) {
        const forged = structuredClone(state); forged.interactions[0].latency = value;
        assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: 1, state: forged}), /data model/);
        assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, 1);
        assert.equal(f.db.prepare('SELECT reported_seconds FROM scorm_sco_attempts').get()!.reported_seconds, 4);
        assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1);
        assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
        assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      }
    } finally {f.db.close();}
  });
}
