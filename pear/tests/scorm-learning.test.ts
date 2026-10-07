import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage, multiFileManifest} from './scorm-package-fixture.ts';
import {fixture, data} from './helpers.ts';
import {prerequisite} from '../src/server/scorm-activities.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
import {publishBindingAward, awardDefinition, ownAward, courseChange, groupDefinition} from './award-binding-fixture.ts';

test('AICC prerequisites parse bounded logical, status, set and threshold expressions without executing source', () => {
  const states = new Map([['a', 'passed'], ['b', 'failed'], ['block', 'completed']]);
  for (const expression of ['a & ~b', '(b | a) & block', 'a="passed" & b<>"passed"', '2*{a,b,block}', '{a,block}', 'a | b & block']) assert.equal(prerequisite(expression, states), true, expression);
  for (const expression of ['{a,b}', '3*{a,b,block}', '~(a | b)', 'a="completed"']) assert.equal(prerequisite(expression, states), false, expression);
  for (const expression of ['unknown', 'a && b', '0*{a}', 'a="forged"', 'globalThis.process.exit()', 'a < b', 'a | unknown', '('.repeat(33) + 'a' + ')'.repeat(33)]) assert.throws(() => prerequisite(expression, states), /prerequisite/i, expression);
});

test('multi-SCO state is isolated; prerequisites and all-SCO Finish/score policy gate exact lesson completion and quiz certificates', async () => {
  const f = await scormLearningFixture();
  try {
    const binding = f.enroll();
    assert.equal(f.call('learner-a', 'human_complete_lesson', binding, 'human').ok, false);
    assert.equal(f.call('learner-a', 'learning_start_attempt', {enrollmentId: binding.enrollmentId}).ok, false);
    assert.throws(() => f.launch(binding, 'practice'), /prerequisites/);
    const first = f.launch(binding, 'intro');
    assert.throws(() => new SCORMPlayerService(f.db).bootstrap(first.token), /authorization adapter/);
    f.checkpoint(first, 'passed', '90', false, 'intro-bookmark');
    assert.throws(() => f.launch(binding, 'practice'), /prerequisites/);
    f.checkpoint(first, 'passed', '90', true, 'intro-bookmark');
    assert.equal(f.player.context(f.service.principal('learner-a'), binding).completed, false);
    const second = f.launch(binding, 'practice');
    assert.equal(f.player.bootstrap(second.token).state.core.entry, 'ab-initio');
    assert.notEqual(f.player.bootstrap(second.token).state.core.lesson_location, 'intro-bookmark');
    assert.throws(() => f.player.resource(first.token, 'assets/player.js'), /closed/);
    assert.equal(f.checkpoint(second, 'passed', '60').result.officialLearningChanged, false);
    const retry = f.launch(binding, 'practice');
    const saved = f.checkpoint(retry, 'passed', '90');
    assert.equal(saved.result.officialLearningChanged, true);
    assert.deepEqual(f.player.checkpoint(retry.token, saved.request), saved.result);
    const proof = JSON.parse(String(f.db.prepare('SELECT evidence FROM scorm_completion_proofs').get()!.evidence));
    assert.equal(proof.sha256, f.pkg.sha256); assert.deepEqual(proof.scos.map((s: any) => s.scoId), ['intro', 'practice']);
    assert.deepEqual(proof.scos.map((s: any) => s.seconds), [20, 40]);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 1);
    assert.equal(f.db.prepare('SELECT count(*) n FROM certificates').get()!.n, 0);
    assert.equal(data(f.call('learner-a', 'learning_get_lesson', binding, 'human')).completed, true);
    assert.equal(f.quiz(binding.enrollmentId).passed, true);
    assert.equal(f.db.prepare('SELECT count(*) n FROM certificates').get()!.n, 1);
    assert.throws(() => f.db.exec("UPDATE scorm_completion_proofs SET evidence='{}'"), /immutable/);
    assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {f.db.close();}
});

test('practice and admin preview never project learning; learner cannot forge a package pin, binding key or preview enrollment', async () => {
  const f = await scormLearningFixture();
  try {
    const binding = f.enroll();
    for (const mode of ['normal', 'preview'] as const) {
      const user = mode === 'preview' ? 'admin' : 'learner-a';
      for (const sco of ['intro', 'practice']) assert.equal(f.checkpoint(f.launch(undefined, sco, mode, user)).result.officialLearningChanged, false);
    }
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    assert.equal(data(f.call('learner-a', 'learning_get_lesson', binding, 'human')).completed, false);
    assert.throws(() => f.launch({...binding, arbitrary: true}, 'intro'), /context/);
    assert.throws(() => f.launch(binding, 'intro', 'preview'), /normal/);
    assert.throws(() => f.launch({...binding, enrollmentId: 'wrong'}, 'intro'), /Enrollment/);
    const bad = f.course({...f.ref, sha256: '0'.repeat(64)});
    assert.equal(f.call('editor', 'learning_update_course', {courseId: 'learning-vi', course: bad}).ok, false);
    assert.equal(f.call('editor', 'learning_update_course', {courseId: 'learning-vi', course: f.course({...f.ref, packageId: 'wrong'})}).ok, false);
  } finally {f.db.close();}
});

test('completion, runtime, revision, audit and receipt roll back together when projection audit fails', async () => {
  const f = await scormLearningFixture();
  try {
    const binding = f.enroll(); f.checkpoint(f.launch(binding, 'intro'));
    const launch = f.launch(binding, 'practice'), before = f.service.context('learner-a').revision;
    f.db.exec("CREATE TRIGGER reject_scorm_projection BEFORE INSERT ON audit WHEN NEW.tool='runtime_scorm_learning_completion' BEGIN SELECT RAISE(ABORT,'projection audit failed'); END");
    assert.throws(() => f.checkpoint(launch), /projection audit failed/);
    assert.equal(f.db.prepare('SELECT finished FROM scorm_sco_attempts WHERE sco_id=\'practice\'').get()!.finished, 0);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    assert.equal(f.service.context('learner-a').revision, before);
    assert.equal(data(f.call('learner-a', 'learning_get_lesson', binding, 'human')).completed, false);
    f.db.exec('DROP TRIGGER reject_scorm_projection'); assert.equal(f.checkpoint(launch).result.officialLearningChanged, true);
  } finally {f.db.close();}
});

test('live course audience and package revocation are rechecked before checkpoint replay, bootstrap and resource reads', async () => {
  const f = await scormLearningFixture();
  try {
    const binding = f.enroll(), launch = f.launch(binding, 'intro'), saved = f.checkpoint(launch, 'incomplete', '90', false);
    data(f.call('admin', 'learning_save_group', {groupId: 'scorm-access', group: groupDefinition(['learner-b'])}));
    data(f.call('editor', 'learning_update_course', {courseId: 'learning-vi', course: {...f.course(), access: 'groups', groupIds: ['scorm-access']}}));
    data(f.call('editor', 'learning_publish_course', {courseId: 'learning-vi'}));
    for (const action of [() => f.player.checkpoint(launch.token, saved.request), () => f.player.bootstrap(launch.token), () => f.player.resource(launch.token, 'assets/player.js')]) assert.throws(action, /audience|access|visible/i);
    data(f.call('admin', 'learning_save_group', {groupId: 'scorm-access', group: groupDefinition()}));
    assert.deepEqual(f.player.checkpoint(launch.token, saved.request), saved.result);
    f.db.exec("UPDATE scorm_engine_versions SET state='retired'");
    assert.equal(f.player.bootstrap(f.launch(binding, 'intro').token).state.core.entry, 'resume');
    assert.equal(f.call('learner-b', 'learning_enroll', {courseId: 'learning-vi'}).ok, false);
    f.db.exec("UPDATE scorm_engine_versions SET state='revoked'");
    assert.throws(() => f.launch(binding, 'intro'), /pin/);
  } finally {f.db.close();}
});

test('standalone SCORM retake creates an empty registration and preserves previous proof/history without allowing attestation', async () => {
  const f = await scormLearningFixture();
  try {
    const item = {title: 'Original SCORM item', summary: 'Self-authored standalone engine item', language: 'en', provider: 'Pear Originals', license: 'self-authored', aiProcessingAllowed: true, kind: 'scorm', text: 'Complete the package.', scorm: f.ref};
    data(f.call('editor', 'learning_create_content_item', {itemId: 'engine-item', item})); data(f.call('editor', 'learning_publish_content_item', {itemId: 'engine-item'}));
    const old = data(f.call('learner-a', 'learning_enroll_item', {itemId: 'engine-item'})), binding = {itemEnrollmentId: old.itemEnrollmentId};
    assert.equal(f.call('learner-a', 'human_complete_item', {...binding, confirmed: true}, 'human').ok, false);
    f.checkpoint(f.launch(binding, 'intro')); const launch = f.launch(binding, 'practice'); assert.equal(f.checkpoint(launch).result.officialLearningChanged, true);
    const proof = f.db.prepare('SELECT * FROM scorm_completion_proofs').get(), prior = f.db.prepare('SELECT * FROM item_enrollments').get();
    const fresh = data(f.call('learner-a', 'human_retake_completed_item', {...binding, version: 1, confirmed: true}, 'human'));
    assert.throws(() => f.player.resource(launch.token, 'assets/player.js'), /successor/);
    const next = f.launch({itemEnrollmentId: fresh.itemEnrollmentId}, 'intro'), seed = f.player.bootstrap(next.token);
    assert.equal(seed.state.core.entry, 'ab-initio'); assert.equal(seed.state.core.total_time, '00:00:00');
    assert.equal(f.db.prepare('SELECT completed_at FROM item_enrollments WHERE id=?').get(fresh.itemEnrollmentId)!.completed_at, null);
    assert.deepEqual(f.db.prepare('SELECT * FROM item_enrollments WHERE id=?').get(old.itemEnrollmentId), prior);
    assert.deepEqual(f.db.prepare('SELECT * FROM scorm_completion_proofs').get(), proof);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_registrations').get()!.n, 2);
  } finally {f.db.close();}
});

test('nested award criterion bindings keep independent package attempts, pins and certificates; reviewed requalification invalidates old capabilities', async () => {
  const f = await scormLearningFixture();
  try {
    const child = (title: string) => awardDefinition(title, {target: 1, requirements: [awardDefinition().requirements[0]]});
    publishBindingAward(f, 'scorm-old', child('Original old SCORM child'));
    f.publishCourse(); publishBindingAward(f, 'scorm-new', child('Original new SCORM child'));
    publishBindingAward(f, 'scorm-root', awardDefinition('Original two SCORM pins', {target: 3, requirements: [{id: 'old', title: 'Old SCORM pin', required: true, credits: 1, alternatives: [{kind: 'award', id: 'scorm-old'}]}, {id: 'new', title: 'New SCORM pin', required: true, credits: 1, alternatives: [{kind: 'award', id: 'scorm-new'}]}, {id: 'external', title: 'Separate practice', required: true, credits: 1, alternatives: [{kind: 'external', id: 'practice'}]}]}));
    const e = data(f.call('learner-a', 'learning_enroll_award', {collectionId: 'scorm-root'})), base = {awardEnrollmentId: e.awardEnrollmentId, courseId: 'learning-vi'};
    const a = {...base, criterionPath: 'old/scorm-old@1/course'}, b = {...base, criterionPath: 'new/scorm-new@1/course'};
    const first = data(f.call('learner-a', 'learning_enroll_award_course', a)), second = data(f.call('learner-a', 'learning_enroll_award_course', b));
    assert.notEqual(first.enrollmentId, second.enrollmentId); assert.notEqual(first.version, second.version);
    const one = {enrollmentId: first.enrollmentId, lessonId: 'practice'}, two = {enrollmentId: second.enrollmentId, lessonId: 'practice'};
    f.checkpoint(f.launch(one, 'intro')); const old = f.launch(one, 'practice'); f.checkpoint(old); f.quiz(first.enrollmentId);
    assert.equal(ownAward(f, e.awardEnrollmentId).earned, 1);
    assert.equal(data(f.call('learner-a', 'learning_get_lesson', two, 'human')).completed, false);
    f.checkpoint(f.launch(two, 'intro')); f.checkpoint(f.launch(two, 'practice')); f.quiz(second.enrollmentId);
    assert.equal(ownAward(f, e.awardEnrollmentId).earned, 2);
    const proof = f.db.prepare('SELECT * FROM scorm_completion_proofs ORDER BY registration_id').all(), certs = f.db.prepare('SELECT * FROM certificates ORDER BY id').all();
    const fresh = data(f.call('learner-a', 'human_requalify_award_course', courseChange(f, a, second.version), 'human'));
    assert.throws(() => f.player.resource(old.token, 'assets/player.js'), /current bound/);
    const launch = f.launch({enrollmentId: fresh.enrollmentId, lessonId: 'practice'}, 'intro'); assert.equal(f.player.bootstrap(launch.token).state.core.entry, 'ab-initio');
    assert.deepEqual(f.db.prepare('SELECT * FROM scorm_completion_proofs ORDER BY registration_id').all(), proof);
    assert.deepEqual(f.db.prepare('SELECT * FROM certificates ORDER BY id').all(), certs);
  } finally {f.db.close();}
});

test('acknowledged bound completion and exact replay survive database and runtime reopen', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pear-scorm-learning-')), path = join(dir, 'pear.sqlite');
  const f = await scormLearningFixture(path), binding = f.enroll(); f.checkpoint(f.launch(binding, 'intro'));
  const launch = f.launch(binding, 'practice'), saved = f.checkpoint(launch); f.db.close();
  const reopened = fixture(path), player = new SCORMPlayerService(reopened.db, new SCORMLearningBindings(reopened.db, reopened.service));
  try {
    assert.deepEqual(player.checkpoint(launch.token, saved.request), saved.result);
    assert.equal(data(reopened.call('learner-a', 'learning_get_lesson', binding, 'human')).completed, true);
    assert.equal(reopened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 1);
    assert.deepEqual(reopened.db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {reopened.db.close(); rmSync(dir, {recursive: true, force: true});}
});

test('assigned award cycles and live coordinator changes are checked at every capability use; later cycle starts empty', async () => {
  const f = await scormLearningFixture();
  try {
    publishBindingAward(f, 'scorm-assigned', awardDefinition('Original assigned SCORM', {target: 1, requirements: [awardDefinition().requirements[0]]}));
    const start = new Date(Date.now() - 31 * 86400000).toISOString(), plan = {title: 'Original SCORM award cycles', targetKind: 'award', targetId: 'scorm-assigned', audienceKind: 'individuals', learnerIds: ['learner-a'], groupId: '', membership: 'fixed', startsAt: start, repeatDays: 30, endAt: null, dueKind: 'none', fixedDueAt: null, rollingDays: 0};
    data(f.call('manager', 'learning_save_assignment_plan', {planId: 'scorm-cycles', plan, reason: 'Original SCORM cycle fixture'})); f.service.assignments.runBackground(start);
    const old = f.db.prepare("SELECT e.* FROM award_enrollments e JOIN assignment_cycles c ON c.id=e.assignment_cycle_id WHERE c.plan_id='scorm-cycles' ORDER BY c.run_at").get() as any;
    const address = {awardEnrollmentId: old.id, criterionPath: 'course', courseId: 'learning-vi'}, enrolled = data(f.call('learner-a', 'learning_enroll_award_course', address)), binding = {enrollmentId: enrolled.enrollmentId, lessonId: 'practice'};
    const launch = f.launch(binding, 'intro'), saved = f.checkpoint(launch, 'incomplete', '90', false);
    f.db.exec("UPDATE accounts SET active=0 WHERE id='manager'");
    assert.throws(() => f.player.checkpoint(launch.token, saved.request)); assert.throws(() => f.player.resource(launch.token, 'assets/player.js'));
    f.db.exec("UPDATE accounts SET active=1 WHERE id='manager'");
    assert.deepEqual(f.player.checkpoint(launch.token, saved.request), saved.result);
    f.checkpoint(launch); f.checkpoint(f.launch(binding, 'practice')); f.quiz(binding.enrollmentId);
    const priorProof = f.db.prepare('SELECT * FROM scorm_completion_proofs').get(), certificate = f.db.prepare('SELECT * FROM certificates').get();
    f.service.assignments.runBackground(new Date(Date.parse(start) + 30 * 86400000).toISOString());
    const next = f.db.prepare("SELECT e.* FROM award_enrollments e JOIN assignment_cycles c ON c.id=e.assignment_cycle_id WHERE c.plan_id='scorm-cycles' AND e.id!=?").get(old.id) as any;
    assert.ok(next); assert.equal(next.completed_at, null);
    const fresh = data(f.call('learner-a', 'learning_enroll_award_course', {...address, awardEnrollmentId: next.id})), nextBinding = {enrollmentId: fresh.enrollmentId, lessonId: 'practice'};
    const seed = f.player.bootstrap(f.launch(nextBinding, 'intro').token); assert.equal(seed.state.core.entry, 'ab-initio'); assert.equal(seed.state.core.total_time, '00:00:00');
    assert.deepEqual(f.db.prepare('SELECT * FROM scorm_completion_proofs').get(), priorProof); assert.deepEqual(f.db.prepare('SELECT * FROM certificates').get(), certificate);
    assert.equal(f.player.context(f.service.principal('learner-a'), nextBinding).completed, false);
  } finally {f.db.close();}
});

test('populated v45 upgrade preserves accepted practice CMI and registration, without inventing learning completion', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pear-scorm-v45-')), path = join(dir, 'pear.sqlite'), f = await scormLearningFixture(path);
  const launch = f.launch(undefined, 'intro'); f.checkpoint(launch, 'passed', '90', false);
  const state = f.db.prepare('SELECT runtime_state,revision,reported_seconds FROM scorm_sco_attempts').get(), registrations = f.db.prepare('SELECT * FROM scorm_registrations').all();
  f.db.exec('DROP TABLE scorm_completion_proofs; DROP TABLE scorm_learning_bindings; DROP INDEX scorm_enrollment_tenant; DROP INDEX scorm_item_enrollment_tenant; ALTER TABLE scorm_sco_attempts DROP COLUMN finished; DELETE FROM schema_version WHERE version=46'); f.db.close();
  const reopened = fixture(path);
  try {
    assert.deepEqual(reopened.db.prepare('SELECT runtime_state,revision,reported_seconds FROM scorm_sco_attempts').get(), state);
    assert.deepEqual(reopened.db.prepare('SELECT * FROM scorm_registrations').all(), registrations);
    assert.equal(reopened.db.prepare('SELECT finished FROM scorm_sco_attempts').get()!.finished, 0);
    assert.equal(reopened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    assert.deepEqual(reopened.db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {reopened.db.close(); rmSync(dir, {recursive: true, force: true});}
});

test('explicit failed-attempt reset is exact, audited and idempotent; new attempt is empty and completed bound proof requires enrollment retake', async () => {
  const f = await scormLearningFixture();
  try {
    const binding = f.enroll(), prior = f.launch(binding, 'intro'); f.checkpoint(prior, 'failed', '30');
    const before = f.db.prepare('SELECT * FROM scorm_sco_attempts').all(), a = {registrationId: prior.registrationId, attemptId: prior.attemptId, confirmed: true, revision: f.service.context('learner-a').revision, key: 'original-scorm-retake'};
    assert.throws(() => f.player.retake(f.service.principal('learner-b'), a), /Own/);
    assert.throws(() => f.player.retake(f.service.principal('learner-a'), {...a, confirmed: false}), /confirm/);
    f.db.exec("CREATE TRIGGER reject_scorm_retake BEFORE INSERT ON audit WHEN NEW.tool='human_scorm_engine_retake' BEGIN SELECT RAISE(ABORT,'retake audit failed'); END");
    assert.throws(() => f.player.retake(f.service.principal('learner-a'), a), /retake audit failed/);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_attempts').get()!.n, 1);
    f.db.exec('DROP TRIGGER reject_scorm_retake');
    const result = f.player.retake(f.service.principal('learner-a'), a); assert.equal(result.attemptNumber, 2);
    assert.deepEqual(f.player.retake(f.service.principal('learner-a'), a), result);
    assert.throws(() => f.player.retake(f.service.principal('learner-a'), {...a, attemptId: 'wrong'}), /payload/);
    assert.throws(() => f.player.resource(prior.token, 'assets/player.js'), /closed/);
    const next = f.launch(binding, 'intro'); assert.equal(next.attemptId, result.attemptId); assert.equal(f.player.bootstrap(next.token).state.core.entry, 'ab-initio'); assert.equal(f.player.bootstrap(next.token).state.core.total_time, '00:00:00');
    f.checkpoint(next); const final = f.launch(binding, 'practice'); f.checkpoint(final);
    assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts WHERE attempt_id=?').all(prior.attemptId), before);
    assert.throws(() => f.player.retake(f.service.principal('learner-a'), {...a, attemptId: final.attemptId, key: 'completed-retake', revision: f.service.context('learner-a').revision}), /fresh authorized/);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 1);
  } finally {f.db.close();}
});

test('course module prerequisites gate SCORM capabilities and pinned reusable items override caller-supplied package/policy', async () => {
  const f = await scormLearningFixture();
  try {
    const item = {title: 'Original reusable SCORM', summary: 'Original reusable package', language: 'en', provider: 'Pear Originals', license: 'self-authored', aiProcessingAllowed: true, kind: 'scorm', text: 'Read the package.', scorm: f.ref};
    data(f.call('editor', 'learning_create_content_item', {itemId: 'shared-engine', item})); data(f.call('editor', 'learning_publish_content_item', {itemId: 'shared-engine'}));
    const course = {...f.course(), lessons: [{id: 'reading', title: 'Original prerequisite', text: 'Own prerequisite.', kind: 'text', prerequisiteIds: []}, {...f.course().lessons[0], kind: 'text', contentRef: {itemId: 'shared-engine', version: 1}, scorm: {...f.ref, sha256: '0'.repeat(64), completion: 'completed_or_passed'}}], modules: [{id: 'first', title: 'First module', lessonIds: ['reading'], prerequisiteIds: []}, {id: 'engine', title: 'Engine module', lessonIds: ['practice'], prerequisiteIds: ['first']}]};
    data(f.call('editor', 'learning_update_course', {courseId: 'learning-vi', course})); data(f.call('editor', 'learning_publish_course', {courseId: 'learning-vi'}));
    const binding = f.enroll(); assert.throws(() => f.launch(binding, 'intro'), /prerequisite lessons/);
    data(f.call('learner-a', 'human_complete_lesson', {enrollmentId: binding.enrollmentId, lessonId: 'reading'}, 'human'));
    const lesson = data(f.call('learner-a', 'learning_get_lesson', binding, 'human')); assert.deepEqual(lesson.scorm, f.ref); assert.equal(lesson.policy, 'scorm_evidence_and_quiz');
    const launch = f.launch(binding, 'intro'); assert.equal(f.player.bootstrap(launch.token).state.core.entry, 'ab-initio');
    const bridge = data(f.call('learner-a', 'learning_get_lesson', binding)); assert.equal(bridge.scorm, undefined); assert.equal(JSON.stringify(bridge).includes(launch.token), false);
  } finally {f.db.close();}
});


test('manifest launch data and mastery/time fields remain LMS-owned; real engine applies mastery only at durable Finish', async () => {
  const xml = multiFileManifest().replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><runtime:datafromlms> original launch data </runtime:datafromlms><runtime:masteryscore>80</runtime:masteryscore><runtime:maxtimeallowed>00:30:00</runtime:maxtimeallowed><runtime:timelimitaction>continue,message</runtime:timelimitaction>');
  const f = await scormLearningFixture(undefined, multiFilePackage('1.2', xml));
  try {
    const launch = f.launch(undefined, 'intro'), seed = f.player.bootstrap(launch.token);
    assert.equal(seed.state.launch_data, ' original launch data '); assert.equal(seed.state.student_data.mastery_score, '80'); assert.equal(seed.state.student_data.max_time_allowed, '00:30:00'); assert.equal(seed.state.student_data.time_limit_action, 'continue,message');
    const saved = f.checkpoint(launch, 'passed', '70', false); assert.equal(f.player.status(f.service.principal('learner-a'), launch.launchId, 'session-learner-a').runtime_state.core.lesson_status, 'passed');
    f.checkpoint(launch, 'passed', '70', true); assert.equal(f.player.status(f.service.principal('learner-a'), launch.launchId, 'session-learner-a').runtime_state.core.lesson_status, 'failed');
    const next = f.launch(undefined, 'intro'), current = f.player.bootstrap(next.token);
    assert.throws(() => f.player.checkpoint(next.token, {sequence: 1, revision: current.revision, finished: false, state: {...saved.request.state, core: current.state.core, student_data: {...current.state.student_data, mastery_score: '0'}}}), /Server-owned/);
    f.checkpoint(next, 'incomplete', '90', true); assert.equal(f.player.status(f.service.principal('learner-a'), next.launchId, 'session-learner-a').runtime_state.core.lesson_status, 'incomplete');
    const completed = f.launch(undefined, 'intro'); f.checkpoint(completed, 'completed', '90', true); assert.equal(f.player.status(f.service.principal('learner-a'), completed.launchId, 'session-learner-a').runtime_state.core.lesson_status, 'passed');
  } finally {f.db.close();}
});
