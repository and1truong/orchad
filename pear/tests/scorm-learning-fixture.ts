import {fixture, data} from './helpers.ts';
import {courses} from '../src/server/seed.ts';
import {SCORMPackageService} from '../src/server/scorm-package-service.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
import {multiFilePackage, multiFileManifest} from './scorm-package-fixture.ts';
import {createSCORM12API} from '../src/shared/scorm-runtime.ts';
import type {SCORMReference} from '../src/shared/model.ts';

export async function scormLearningFixture(path?: string, bytes = multiFilePackage('1.2', multiFileManifest().replace('<p:title>Practice</p:title>', '<p:title>Practice</p:title><runtime:prerequisites type="aicc_script">intro</runtime:prerequisites>'))) {
  const f = fixture(path), packages = new SCORMPackageService(f.db), admin = f.service.principal('admin');
  const job = packages.enqueue(admin, {filename: 'original-learning.zip', provenance: 'Self-authored learning fixture', version: 1, confirmed: true, revision: 0, key: 'learning-import'}, bytes);
  await packages.run(job.jobId); const pkg = packages.list(admin, true).items[0]!;
  packages.review(admin, {packageId: pkg.id, version: 1, sha256: pkg.sha256, action: 'publish', reason: 'Reviewed original activities', confirmed: true, revision: f.service.context('admin', 'library:demo').revision, key: 'learning-publish'});
  const player = new SCORMPlayerService(f.db, new SCORMLearningBindings(f.db, f.service));
  for (const user of ['learner-a', 'learner-b', 'admin']) f.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run('session-' + user, user, 'csrf', Date.now() + 86400000, 0);
  const ref: SCORMReference = {packageId: pkg.id, version: 1, sha256: pkg.sha256, completion: 'passed', minimumScore: 80};
  const course = (reference = ref) => ({...structuredClone(courses['learning-vi']), title: 'Original SCORM course', lessons: [{id: 'practice', title: 'Package lesson', text: 'Complete all original SCOs.', kind: 'scorm', prerequisiteIds: [], scorm: reference}]});
  const publishCourse = () => {data(f.call('editor', 'learning_update_course', {courseId: 'learning-vi', course: course()})); return data(f.call('editor', 'learning_publish_course', {courseId: 'learning-vi'}));};
  publishCourse();
  function launch(binding?: Record<string, unknown>, scoId?: string, mode: 'normal' | 'preview' = 'normal', user = 'learner-a') {
    return player.launch(f.service.principal(user), 'session-' + user, {packageId: pkg.id, version: 1, mode, confirmed: true, revision: f.service.context(user, 'learning:demo:' + user).revision, key: crypto.randomUUID(), ...(binding ? {binding} : {}), ...(scoId ? {scoId} : {})});
  }
  function checkpoint(launch: ReturnType<typeof player.launch>, status = 'passed', score = '90', finished = true, bookmark = 'own-progress') {
    const seed = player.bootstrap(launch.token); let state: any;
    const api = createSCORM12API({state: seed.state, checkpoint(data) {state = data;}});
    api.LMSInitialize('');
    for (const [key, value] of Object.entries({'cmi.core.lesson_status': status, 'cmi.core.score.raw': score, 'cmi.core.score.min': '0', 'cmi.core.score.max': '100', 'cmi.core.session_time': '00:00:20', 'cmi.core.lesson_location': bookmark, 'cmi.core.exit': 'suspend'})) if (api.LMSSetValue(key, value) !== 'true') throw Error(key);
    if ((finished ? api.LMSFinish('') : api.LMSCommit('')) !== 'true') throw Error('Fixture API rejected checkpoint');
    const request = {sequence: seed.sequence + 1, revision: seed.revision, state, finished};
    return {request, result: player.checkpoint(launch.token, request)};
  }
  function enroll() {return {enrollmentId: data(f.call('learner-a', 'learning_enroll', {courseId: 'learning-vi'})).enrollmentId, lessonId: 'practice'};}
  function quiz(enrollmentId: string) {
    const attemptId = data(f.call('learner-a', 'learning_start_attempt', {enrollmentId})).attemptId;
    data(f.call('learner-a', 'human_save_answer', {attemptId, questionId: 'q-practice', answer: 1}, 'human'));
    return data(f.call('learner-a', 'human_submit_attempt', {attemptId, confirmed: true}, 'human'));
  }
  return {...f, pkg, ref, packages, player, course, publishCourse, launch, checkpoint, enroll, quiz};
}
