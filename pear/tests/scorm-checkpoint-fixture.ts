import assert from 'node:assert/strict';
import type {scormLearningFixture} from './scorm-learning-fixture.ts';
import {createSCORM2004API, type SCORM2004Edition} from '../src/shared/scorm2004-runtime.ts';

export function sequenceCheckpoint(f: Awaited<ReturnType<typeof scormLearningFixture>>, launch: ReturnType<typeof f.launch>, values: Record<string, string>, finished = true) {
  const b = f.player.bootstrap(launch.token); let state: any, navigation = '_none_', sharedData: Record<string, string> | undefined;
  const api = createSCORM2004API({edition: b.standard as SCORM2004Edition, state: b.state, sequencingTree: b.sequencingTree, sequencingSnapshot: b.sequencingSnapshot, checkpoint(s, _finished, nav, writes) {state = s; navigation = nav; sharedData = writes;}});
  assert.equal(api.Initialize(''), 'true');
  for (const [key, value] of Object.entries(values)) assert.equal(api.SetValue(key, value), 'true', key + ': ' + api.GetDiagnostic(''));
  assert.equal(finished ? api.Terminate('') : api.Commit(''), 'true', api.GetDiagnostic(''));
  return {state, navigation, finished, sequence: b.sequence + 1, revision: b.revision, ...(sharedData && Object.keys(sharedData).length ? {sharedData} : {})};
}
