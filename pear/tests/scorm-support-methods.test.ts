import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';

// ADL RTE 3.1.5: support methods preserve error state; unknown parameters return empty.
const codes = ['0', '101', '102', '103', '104', '111', '112', '113', '122', '123', '132', '133', '142', '143', '201', '301', '351', '391', '401', '402', '403', '404', '405', '406', '407', '408'];
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': support lookups address the requested error in every communication state', () => {
  let checkpoints = 0;
  const api = createSCORM2004API({edition, checkpoint() {checkpoints++;}});
  function support(expected: string) {
    assert.equal(api.GetLastError(), expected);
    const current = api.GetDiagnostic('');
    assert.ok(current.length > 0 && current.length <= 255);
    assert.equal(api.GetDiagnostic(expected), current);
    for (const code of codes) {
      const message = api.GetErrorString(code), diagnostic = api.GetDiagnostic(code);
      assert.ok(message.length > 0 && message.length <= 255, code);
      assert.ok(diagnostic.length > 0 && diagnostic.length <= 255, code);
      assert.equal(api.GetLastError(), expected);
    }
    for (const unknown of ['unknown', '999', '65536', '406suffix']) {
      assert.equal(api.GetDiagnostic(unknown), '', unknown);
      assert.equal(api.GetErrorString(unknown), '', unknown);
      assert.equal(api.GetLastError(), expected);
    }
    if (expected !== '406') assert.notEqual(api.GetDiagnostic('406'), current);
  }
  assert.equal(api.GetValue('cmi.location'), ''); support('122');
  assert.equal(api.Initialize(''), 'true'); support('0');
  assert.equal(api.SetValue('cmi.suspend_data', '\ud800'), 'false'); support('406');
  assert.equal(api.SetValue('cmi.location', 'original'), 'true'); support('0');
  assert.equal(api.GetValue('cmi.unknown'), ''); support('401');
  assert.equal(api.Commit(''), 'true'); support('0');
  assert.equal(api.Terminate(''), 'true'); support('0');
  assert.equal(api.SetValue('cmi.location', 'replacement'), 'false'); support('133');
  assert.equal(checkpoints, 2);
});
