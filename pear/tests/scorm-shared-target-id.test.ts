import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectSCORMPackage} from '../src/server/scorm-package-reader.ts';
import {sharedDataManifest, systemSharedDataManifest, sequencingPackage} from './scorm-sequencing-fixture.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
import {fixture} from './helpers.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
const wrap = (xml: string, ws = ' &#x9;&#xA;&#xD; ') => xml.replace(/targetID="([^"]*)"/g, (_, id) => 'targetID="' + ws + id + ws + '"');
const key = 'urn:pear:shared-notes';
for (const [scope, make] of [['local', sharedDataManifest], ['system', systemSharedDataManifest]] as const) {
  test(scope + ': shared target anyURI XML whitespace normalizes at import while authored bytes/hash and logical bounds remain exact', async () => {
    for (const ws of [' ', '&#x9;', '&#xA;', '&#xD;', ' &#x9;&#xA;&#xD; ']) {
      const xml = make(), authored = wrap(xml, ws), bytes = sequencingPackage('2004-4', authored);
      const canonical = await inspectSCORMPackage(sequencingPackage('2004-4', xml)), parsed = await inspectSCORMPackage(bytes);
      assert.deepEqual(parsed.manifest, canonical.manifest); assert.equal(parsed.files.get('imsmanifest.xml')?.toString(), authored); assert.equal(parsed.sha256, createHash('sha256').update(bytes).digest('hex'));
    }
    const long = 'urn:pear:' + 'x'.repeat(3991), xml = make().replaceAll(key, long);
    assert.deepEqual((await inspectSCORMPackage(sequencingPackage('2004-4', wrap(xml)))).manifest, (await inspectSCORMPackage(sequencingPackage('2004-4', xml))).manifest);
  });
  test(scope + ': shared target XML normalization retains blank/internal/non-XML/control/overbudget and normalized-duplicate refusal', async () => {
    const unusedValid = make().replace('</p:organizations>', '<p:organization identifier="unused"><p:title>Unused</p:title><p:item identifier="unused-item" identifierref="sco1"><p:title>Unused</p:title><runtime:data><runtime:map targetID="valid-unused"/></runtime:data></p:item></p:organization></p:organizations>');
    assert.equal((await inspectSCORMPackage(sequencingPackage('2004-4', unusedValid))).manifest.standard, '2004-4');
    for (const value of ['', ' &#x9;&#xA;&#xD; ', '&#xA0;' + key, key + '&#xFEFF;', 'urn:pear:shared notes', 'urn:pear:shared&#x9;notes', key + '&#x7F;', 'urn:pear:' + 'x'.repeat(3992)]) {
      const xml = make().replace('targetID="' + key + '"', 'targetID="' + value + '"');
      await assert.rejects(inspectSCORMPackage(sequencingPackage('2004-4', xml)), /Unsupported/);
      const unused = make().replace('</p:organizations>', '<p:organization identifier="unused"><p:title>Unused</p:title><p:item identifier="unused-item" identifierref="sco1"><p:title>Unused</p:title><runtime:data><runtime:map targetID="' + value + '"/></runtime:data></p:item></p:organization></p:organizations>');
      await assert.rejects(inspectSCORMPackage(sequencingPackage('2004-4', unused)), /Unsupported/);
    }
    const duplicate = make().replace('</runtime:data>', '<runtime:map targetID=" &#x9;' + key + '&#xA; "/></runtime:data>');
    await assert.rejects(inspectSCORMPackage(sequencingPackage('2004-4', duplicate)), /Unsupported/);
  });
  test(scope + ': normalized shared target exact retry and SQLite resume preserve per-SCO permissions, learner isolation and one official proof', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pear-shared-target-')), path = join(dir, 'db.sqlite'), f = await scormLearningFixture(path, sequencingPackage('2004-4', wrap(make())));
    let opened: ReturnType<typeof fixture> | undefined;
    try {
      const binding = f.enroll(), first = f.launch(binding), before = f.player.bootstrap(first.token);
      const api = createSCORM2004API({edition: '2004-4', state: before.state, sequencingTree: before.sequencingTree, sequencingSnapshot: before.sequencingSnapshot}); api.Initialize('');
      assert.equal(api.GetValue('adl.data.0.id'), key); assert.equal(api.SetValue('adl.data.0.id', 'forged'), 'false'); assert.equal(api.GetLastError(), '404');
      const request = sequenceCheckpoint(f, first, {'adl.data.0.store': 'normalized-notes 🦉', 'adl.data.1.store': 'private-writer-secret', 'cmi.location': 'shared-target-page', 'cmi.exit': 'suspend'}, false);
      const rows = () => ({attempts: f.db.prepare('SELECT * FROM scorm_sco_attempts').all(), receipts: f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(), stores: f.db.prepare('SELECT * FROM scorm_system_data').all()});
      const original = rows(); assert.throws(() => f.player.checkpoint(first.token, {...request, sharedData: {[' ' + key + ' ']: 'forged'}}), /cannot write|Mapped system/); assert.deepEqual(rows(), original);
      const receipt = f.player.checkpoint(first.token, request); assert.deepEqual(f.player.checkpoint(first.token, request), receipt); assert.equal(receipt.officialLearningChanged, false);
      if (scope === 'system') {const store = f.db.prepare('SELECT * FROM scorm_system_data WHERE target_id=?').get(key)!; assert.equal(store.store, 'normalized-notes 🦉'); assert.equal(store.revision, 1);}
      f.db.close(); opened = fixture(path); const player = new SCORMPlayerService(opened.db, new SCORMLearningBindings(opened.db, opened.service)), live = {...f, ...opened, player};
      assert.deepEqual(player.checkpoint(first.token, request), receipt); player.close(opened.service.principal('learner-a'), first.launchId, 'session-learner-a');
      const launch = (user = 'learner-a') => player.launch(opened!.service.principal(user), 'session-' + user, {packageId: f.pkg.id, version: 1, mode: 'normal', ...(user === 'learner-a' ? {binding} : {}), confirmed: true, revision: opened!.service.context(user, 'learning:demo:' + user).revision, key: crypto.randomUUID()});
      const resumed = launch(), b = player.bootstrap(resumed.token); assert.equal(b.state.location, 'shared-target-page'); assert.equal(b.state.entry, 'resume'); assert.deepEqual(b.sequencingTree, before.sequencingTree); assert.ok(!b.sequencingSnapshot!.includes('normalized-notes')); assert.ok(!player.bootstrap(launch('learner-b').token).sequencingSnapshot!.includes('normalized-notes'));
      assert.equal(player.checkpoint(resumed.token, sequenceCheckpoint(live, resumed, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'})).officialLearningChanged, false);
      const next = launch(), reader = player.bootstrap(next.token), runtime = createSCORM2004API({edition: '2004-4', state: reader.state, sequencingTree: reader.sequencingTree, sequencingSnapshot: reader.sequencingSnapshot}); runtime.Initialize('');
      assert.equal(runtime.GetValue('adl.data.0.id'), key); assert.equal(runtime.GetValue('adl.data.0.store'), 'normalized-notes 🦉'); assert.equal(runtime.SetValue('adl.data.0.store', 'forged'), 'false'); assert.equal(runtime.GetLastError(), '404'); assert.ok(!reader.sequencingSnapshot!.includes('private-writer-secret'));
      const end = sequenceCheckpoint(live, next, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'});
      assert.throws(() => player.checkpoint(next.token, {...end, sharedData: {[key]: 'forged'}}), /cannot write|Mapped system/); const final = player.checkpoint(next.token, end); assert.equal(final.officialLearningChanged, true); assert.deepEqual(player.checkpoint(next.token, end), final);
      assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 1); assert.equal(opened.db.prepare('SELECT count(*) n FROM certificates').get()!.n, 0);
      if (scope === 'system') assert.equal(opened.db.prepare('SELECT revision FROM scorm_system_data WHERE target_id=?').get(key)!.revision, 1);
    } finally {opened ? opened.db.close() : f.db.close(); rmSync(dir, {recursive: true, force: true});}
  });
}
