import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': successful derived status reads reset earlier errors; support lookups and refused reads preserve correct codes', () => {
  const api = createSCORM2004API({edition});
  assert.equal(api.GetValue('cmi.completion_status'), ''); assert.equal(api.GetLastError(), '122');
  assert.equal(api.Initialize(''), 'true');
  for (const status of ['cmi.completion_status', 'cmi.success_status']) {
    for (const [key, code] of [['cmi.session_time', '405'], ['cmi.score.raw', '403'], ['cmi.unknown', '401'], ['cmi.learner_id._count', '301']]) {
      assert.equal(api.GetValue(key), ''); assert.equal(api.GetLastError(), code);
      assert.ok(api.GetErrorString(code)); api.GetDiagnostic(''); assert.equal(api.GetLastError(), code);
      assert.equal(api.GetValue(status), 'unknown'); assert.equal(api.GetLastError(), '0', status + ' after ' + key);
    }
    assert.equal(api.SetValue(status, 'forged'), 'false'); assert.equal(api.GetLastError(), '406');
    assert.equal(api.GetValue(status), 'unknown'); assert.equal(api.GetLastError(), '0');
  }
  assert.equal(api.SetValue('cmi.completion_status', 'completed'), 'true'); assert.equal(api.SetValue('cmi.success_status', 'passed'), 'true');
  assert.equal(api.GetValue('cmi.session_time'), ''); assert.equal(api.GetValue('cmi.completion_status'), 'completed'); assert.equal(api.GetLastError(), '0');
  assert.equal(api.GetValue('cmi.session_time'), ''); assert.equal(api.GetValue('cmi.success_status'), 'passed'); assert.equal(api.GetLastError(), '0');
  const derived = createSCORM2004API({edition, state: {completion_threshold: '0.5', progress_measure: '0.9', scaled_passing_score: '0.8', score: {scaled: '0.9'}}}); assert.equal(derived.Initialize(''), 'true');
  for (const [key, expected] of [['cmi.completion_status', 'completed'], ['cmi.success_status', 'passed']]) {assert.equal(derived.GetValue('cmi.session_time'), ''); assert.equal(derived.GetLastError(), '405'); assert.equal(derived.GetValue(key), expected); assert.equal(derived.GetLastError(), '0');}
  assert.equal(api.Terminate(''), 'true'); assert.equal(api.GetValue('cmi.completion_status'), ''); assert.equal(api.GetLastError(), '123');
});
