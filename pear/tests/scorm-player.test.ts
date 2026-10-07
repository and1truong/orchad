import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture} from './helpers.ts';
import {singleSCOPackage, singleSCOManifest} from './scorm-player-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {SCORMPackageService} from '../src/server/scorm-package-service.ts';
import {SCORMPlayerService, scorm12LaunchProfile} from '../src/server/scorm-player-service.ts';
import {createSCORM12API} from '../src/shared/scorm-runtime.ts';
import {createSCORMContentHost} from '../src/server/scorm-content-host.ts';
import {inspectSCORMPackage} from '../src/server/scorm-package-reader.ts';
import {createApp} from '../src/server/app.ts';

async function playerFixture(path?: string) {
  const f = fixture(path), packages = new SCORMPackageService(f.db), player = new SCORMPlayerService(f.db), admin = f.service.principal('admin');
  const job = packages.enqueue(admin, {filename: 'original-player.zip', provenance: 'Self-authored player fixture', version: 1, confirmed: true, revision: 0, key: 'player-import'}, singleSCOPackage());
  await packages.run(job.jobId);
  const pkg = packages.list(admin, true).items[0]!;
  packages.review(admin, {packageId: pkg.id, version: 1, sha256: pkg.sha256, action: 'publish', reason: 'Reviewed exact original source', confirmed: true, revision: f.service.context('admin', 'library:demo').revision, key: 'player-publish'});
  for (const user of ['learner-a', 'learner-b', 'admin']) f.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run('session-' + user, user, 'csrf', Date.now() + 86400000, 0);
  const launch = (user = 'learner-a', mode: 'normal' | 'preview' = 'normal') => player.launch(f.service.principal(user), 'session-' + user, {packageId: pkg.id, version: 1, mode, confirmed: true, revision: f.service.context(user, 'learning:demo:' + user).revision, key: crypto.randomUUID()});
  return {...f, packages, player, pkg, launch};
}
function snapshot(state: Record<string, any>, change?: (api: ReturnType<typeof createSCORM12API>) => void) {
  let value: any;
  const api = createSCORM12API({state, checkpoint(data) {value = data;}});
  assert.equal(api.LMSInitialize(''), 'true');
  change?.(api); assert.equal(api.LMSCommit(''), 'true'); return value;
}

test('real SCORM 1.2 runtime persists interactions, score, suspend/resume and cumulative time exactly once', async () => {
  const f = await playerFixture();
  try {
    const launch = f.launch(), initial = f.player.bootstrap(launch.token);
    assert.equal(initial.state.core.entry, 'ab-initio');
    let state = snapshot(initial.state, api => {
      for (const [key, value] of Object.entries({'cmi.core.lesson_location': 'page-2', 'cmi.suspend_data': 'original-data', 'cmi.core.exit': 'suspend', 'cmi.core.lesson_status': 'incomplete', 'cmi.core.session_time': '00:00:30', 'cmi.core.score.raw': '85', 'cmi.interactions.0.id': 'q1', 'cmi.interactions.0.type': 'choice', 'cmi.interactions.0.student_response': 'a', 'cmi.interactions.0.result': 'correct', 'cmi.objectives.0.id': 'objective-1', 'cmi.objectives.0.status': 'passed'})) assert.equal(api.LMSSetValue(key, value), 'true', key);
    });
    const request = {sequence: 1, revision: 0, state, finished: false}, saved = f.player.checkpoint(launch.token, request);
    assert.deepEqual(f.player.checkpoint(launch.token, request), saved);
    assert.equal(saved.revision, 1);
    assert.throws(() => f.player.checkpoint(launch.token, {...request, finished: true}), /payload changed/);
    state = {...state, core: {...state.core, session_time: '00:01:00'}};
    f.player.checkpoint(launch.token, {sequence: 2, revision: 1, state, finished: true});
    assert.equal(f.player.status(f.service.principal('learner-a'), launch.launchId, 'session-learner-a').reported_seconds, 60);
    const resumed = f.launch(), bootstrap = f.player.bootstrap(resumed.token);
    assert.equal(bootstrap.state.core.entry, 'resume'); assert.equal(bootstrap.state.core.total_time, '00:01:00');
    assert.equal(bootstrap.state.core.session_time, '00:00:00'); assert.equal(bootstrap.state.suspend_data, 'original-data');
    assert.equal(bootstrap.state.interactions['0'].student_response, 'a'); assert.equal(bootstrap.state.objectives['0'].status, 'passed');
    assert.throws(() => f.player.resource(launch.token, 'lessons/intro.html'), /closed/);
    const next = snapshot(bootstrap.state, api => {api.LMSSetValue('cmi.core.session_time', '00:00:10'); api.LMSSetValue('cmi.core.lesson_status', 'passed');});
    f.player.checkpoint(resumed.token, {sequence: 1, revision: 2, state: next, finished: true});
    const result = f.player.status(f.service.principal('learner-a'), resumed.launchId, 'session-learner-a');
    assert.equal(result.reported_seconds, 70); assert.equal(result.runtime_state.core.lesson_status, 'passed');
    for (const table of ['enrollments', 'attempts', 'certificates', 'study_totals']) assert.equal(f.db.prepare('SELECT count(*) AS n FROM ' + table).get()?.n, 0);
  } finally {f.db.close();}
});

test('checkpoint validation rejects forged authority, invalid data, stale revisions and audit partial writes', async () => {
  const f = await playerFixture();
  try {
    const launch = f.launch(), state = snapshot(f.player.bootstrap(launch.token).state), request = {sequence: 1, revision: 0, state, finished: false};
    for (const change of [
      {...state, core: {...state.core, student_id: 'learner-b'}},
      {...state, core: {...state.core, score: {...state.core.score, raw: 'not-a-number'}}},
      {...state, suspend_data: 'x'.repeat(4097)}, {...state, unknown: 'field'}, {...state, comments: 42},
      {...state, interactions: {'0': {id: 'q', type: 'unsupported'}}},
    ]) assert.throws(() => f.player.checkpoint(launch.token, {...request, state: change}));
    assert.throws(() => f.player.checkpoint(launch.token, {...request, revision: 99}), /revision/);
    f.db.exec("CREATE TRIGGER reject_engine_checkpoint BEFORE INSERT ON audit WHEN NEW.tool='runtime_scorm_engine_checkpoint' BEGIN SELECT RAISE(ABORT,'audit failed'); END");
    assert.throws(() => f.player.checkpoint(launch.token, request), /audit failed/);
    assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()?.revision, 0);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM scorm_engine_checkpoints').get()?.n, 0);
    f.db.exec('DROP TRIGGER reject_engine_checkpoint'); f.player.checkpoint(launch.token, request);
    assert.throws(() => f.player.status(f.service.principal('learner-b'), launch.launchId, 'session-learner-b'), /Own/);
    f.player.close(f.service.principal('learner-a'), launch.launchId, 'session-learner-a');
    assert.throws(() => f.player.checkpoint(launch.token, request), /closed/);
  } finally {f.db.close();}
});

test('capabilities recheck account, preview role, original session, retirement, revocation and expiry before replay', async () => {
  const f = await playerFixture();
  try {
    const preview = f.launch('admin', 'preview'), previewState = f.player.bootstrap(preview.token).state;
    assert.equal(previewState.core.lesson_mode, 'browse'); assert.equal(previewState.core.credit, 'no-credit');
    f.db.exec("UPDATE accounts SET role='learner' WHERE id='admin'"); assert.throws(() => f.player.resource(preview.token, 'lessons/intro.html'), /administrator/);
    const launch = f.launch(), state = snapshot(f.player.bootstrap(launch.token).state), request = {sequence: 1, revision: 0, state, finished: false};
    f.player.checkpoint(launch.token, request);
    f.db.exec("UPDATE scorm_engine_versions SET state='retired'"); assert.match(f.player.resource(launch.token, 'lessons/intro.html').bytes.toString(), /Original engine SCO/);
    f.db.exec("UPDATE scorm_engine_versions SET state='revoked'"); assert.throws(() => f.player.checkpoint(launch.token, request), /unavailable/);
    f.db.exec("UPDATE scorm_engine_versions SET state='published'; UPDATE accounts SET auth_version=auth_version+1 WHERE id='learner-a'"); assert.throws(() => f.player.checkpoint(launch.token, request), /authorization/);
    const other = f.launch('learner-b'); f.db.exec("DELETE FROM sessions WHERE principal='learner-b'"); assert.throws(() => f.player.bootstrap(other.token), /session ended/);
    f.db.exec('UPDATE scorm_engine_launches SET expires=0'); assert.throws(() => f.player.resource(launch.token, 'lessons/intro.html'), /expired/);
  } finally {f.db.close();}
});

test('acknowledged state and idempotent checkpoint receipts survive database and runtime restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pear-engine-player-')), path = join(directory, 'pear.sqlite');
  const f = await playerFixture(path), launch = f.launch(), state = snapshot(f.player.bootstrap(launch.token).state, api => {api.LMSSetValue('cmi.suspend_data', 'durable-restart'); api.LMSSetValue('cmi.core.session_time', '00:00:12');});
  const request = {sequence: 1, revision: 0, state, finished: false}, result = f.player.checkpoint(launch.token, request);
  f.db.close(); const reopened = fixture(path), player = new SCORMPlayerService(reopened.db);
  try {
    assert.deepEqual(player.checkpoint(launch.token, request), result);
    assert.equal(player.bootstrap(launch.token).state.suspend_data, 'durable-restart');
    assert.equal(player.status(reopened.service.principal('learner-a'), launch.launchId, 'session-learner-a').reported_seconds, 12);
    assert.equal(reopened.db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {reopened.db.close(); rmSync(directory, {recursive: true, force: true});}
});

test('content host serves capability-scoped assets and refuses application credentials and forged origins', async () => {
  const f = await playerFixture(), launch = f.launch(), content = createSCORMContentHost({pearOrigin: 'http://127.0.0.1:4338', contentOrigin: 'http://localhost:4339', player: f.player, runtimeBundle: Buffer.from('/* fixture runtime */')});
  const base = '/launch/' + launch.token, host = 'localhost:4339';
  try {
    const bootstrap = await content.inject({url: base, headers: {host}}); assert.equal(bootstrap.statusCode, 200);
    assert.match(bootstrap.headers['content-security-policy'] as string, /sandbox allow-scripts allow-same-origin/);
    assert.equal(bootstrap.headers['access-control-allow-origin'], undefined);
    assert.equal((await content.inject({url: base, headers: {host, cookie: 'pear-session=private'}})).statusCode, 403);
    assert.equal((await content.inject({url: base, headers: {host: '127.0.0.1:4339'}})).statusCode, 403);
    assert.equal((await content.inject({url: base + '/files/assets/style.css', headers: {host}})).statusCode, 200);
    const range = await content.inject({url: base + '/files/assets/style.css', headers: {host, range: 'bytes=0-5'}});
    assert.equal(range.statusCode, 206); assert.equal(range.body, 'body{c');
    assert.equal((await content.inject({url: base + '/files/assets/style.css', headers: {host, range: 'bytes=0-2,4-6'}})).statusCode, 416);
    assert.equal((await content.inject({url: base + '/files/../outside', headers: {host}})).statusCode, 403);
    const state = snapshot(f.player.bootstrap(launch.token).state), request = {sequence: 1, revision: 0, state, finished: false};
    assert.equal((await content.inject({url: base + '/checkpoint', method: 'POST', headers: {host, origin: 'http://127.0.0.1:4338'}, payload: request})).statusCode, 403);
    assert.equal((await content.inject({url: base + '/checkpoint', method: 'POST', headers: {host, origin: 'http://localhost:4339'}, payload: request})).statusCode, 200);
  } finally {await content.close(); f.db.close();}
});

test('player refuses unimplemented multi-SCO, 2004 and prerequisite semantics instead of flattening them', async () => {
  for (const bytes of [multiFilePackage(), multiFilePackage('2004-4'), singleSCOPackage(singleSCOManifest().replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><runtime:prerequisites type="aicc_script">other</runtime:prerequisites>'))]) {
    const inspected = await inspectSCORMPackage(bytes); assert.throws(() => scorm12LaunchProfile(inspected.manifest), /currently supports/);
  }
});

test('authenticated launch endpoints retain CSRF/session epoch boundaries and production runtime disablement', async () => {
  const f = await playerFixture(), origin = 'http://127.0.0.1:4338', scormContent = {origin: 'http://localhost:4339', runtimeBundle: Buffer.from('/* HTTP fixture bundle */')};
  const {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, scormContent});
  try {
    const login = await app.inject({url: '/api/login', method: 'POST', headers: {host: '127.0.0.1:4338', origin}, payload: {username: 'learner-a', password: 'learner-a-dev'}});
    const session = login.json(), headers = {host: '127.0.0.1:4338', origin, cookie: String(login.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': session.csrf, 'x-pear-epoch': session.sessionEpoch};
    const payload = {packageId: f.pkg.id, version: 1, mode: 'normal', confirmed: true, revision: 0, key: 'http-launch'};
    const send = (h: any, data = payload) => app.inject({url: '/api/scorm-engine/launch', method: 'POST', headers: h, payload: data});
    assert.equal((await send({...headers, 'x-csrf-token': 'wrong'})).statusCode, 403);
    assert.equal((await send({...headers, 'x-pear-epoch': 'wrong'})).statusCode, 409);
    assert.equal((await send(headers, {...payload, mode: 'preview'})).statusCode, 403);
    const result = await send(headers); assert.equal(result.statusCode, 200);
    const launch = result.json(); assert.equal(launch.token, undefined); assert.match(launch.url, /^http:\/\/localhost:4339\/launch\//);
    const resource = new URL(launch.url).pathname + '/files/lessons/intro.html';
    assert.equal((await content!.inject({url: resource, headers: {host: 'localhost:4339'}})).statusCode, 200);
    await app.inject({url: '/api/logout', method: 'POST', headers});
    assert.equal((await content!.inject({url: resource, headers: {host: 'localhost:4339'}})).statusCode, 401);
    await assert.rejects(createApp({db: f.db, origin, scormContent}), /loopback development/);
  } finally {await app.close(); f.db.close();}
});
