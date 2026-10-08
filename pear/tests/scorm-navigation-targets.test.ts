import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {sequencingRuntime} from '../src/shared/scorm-sequencing-runtime.ts';
import {inspectSCORMPackage} from '../src/server/scorm-package-reader.ts';
import {saveSequencing, trustedSequencing, sequencingTree} from '../src/server/scorm-sequencing.ts';
import {multiFileManifest, multiFilePackage} from './scorm-package-fixture.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': target bindings preserve authored dots/Unicode/internal-name tokens and read-only validity', async () => {
  const target = 'Practice._hidden.initialized.jsonString.start_time.đ';
  const xml = multiFileManifest(edition).replace('identifier="practice"', 'identifier="' + target + '"').replace('<p:organization identifier="org">', '<p:organization identifier="org"><s:sequencing xmlns:s="http://www.imsglobal.org/xsd/imsss"><s:controlMode flow="true" choice="true"/></s:sequencing>');
  const manifest = (await inspectSCORMPackage(multiFilePackage(edition, xml))).manifest, tree = sequencingTree(manifest);
  const runtime = sequencingRuntime(tree); assert.equal(runtime.processNavigationRequest('start'), true);
  const scope = {attemptId: 'trusted-attempt', sha256: 'trusted-hash'}, historical = JSON.parse(saveSequencing(runtime, manifest, scope));
  historical.engine.adaptation = 'pear-scorm12-score-defaults-v15';
  const resumed = trustedSequencing(manifest, JSON.stringify(historical), scope); assert.equal(resumed.getSequencingState()?.currentActivity?.id, 'intro');
  assert.throws(() => trustedSequencing(manifest, JSON.stringify({...historical, engine: {...historical.engine, adaptation: 'unknown'}}), scope), /identity changed/);
  const api = createSCORM2004API({edition, sequencingTree: tree, sequencingSnapshot: runtime.serializeSequencingState()});
  assert.equal(api.Initialize(''), 'true');
  for (const kind of edition === '2004-4' ? ['choice', 'jump'] : ['choice']) {
    const key = 'adl.nav.request_valid.' + kind + '.{target=' + target + '}';
    assert.equal(api.GetValue(key), 'true', key); assert.equal(api.GetLastError(), '0');
    assert.equal(api.SetValue(key, 'false'), 'false'); assert.equal(api.GetLastError(), '404');
    assert.equal(api.GetValue(key), 'true'); assert.equal(api.GetLastError(), '0');
    assert.equal(api.GetValue('adl.nav.request_valid.' + kind + '.{target=missing.activity}'), 'false'); assert.equal(api.GetLastError(), '0');
    for (const bad of [key + '\n', key + '.constructor', key.replace(target, ''), 'adl.nav.request_valid.' + kind]) {
      assert.equal(api.GetValue(bad), 'false', bad); assert.equal(api.GetLastError(), '301', bad);
      assert.equal(api.SetValue(bad, 'true'), 'false'); assert.equal(api.GetLastError(), '404');
    }
  }
  assert.equal(api.GetValue('adl.nav.request_valid.choice.{target=missing\nactivity}'), 'false'); assert.equal(api.GetLastError(), '0');
  const choice = '{target=' + target + '}choice';
  for (const bad of [choice + '\n', choice + '\r', choice + '.junk', choice.replace(target, '')]) {assert.equal(api.SetValue('adl.nav.request', bad), 'false', bad); assert.equal(api.GetLastError(), '406', bad); assert.equal(api.GetValue('adl.nav.request'), '_none_');}
  assert.equal(api.SetValue('adl.nav.request', choice), 'true'); assert.equal(api.GetLastError(), '0'); assert.equal(api.GetValue('adl.nav.request'), choice);
  if (edition !== '2004-4') {assert.equal(api.GetValue('adl.nav.request_valid.jump.{target=' + target + '}'), ''); assert.equal(api.GetLastError(), '401');}
});
