import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSCORM12API} from '../src/shared/scorm-runtime.ts';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';

for (const edition of ['1.2', '2004-2', '2004-3', '2004-4'] as const) test(edition + ': unsupported support parameters are empty without coercion, errors, state or queue changes', () => {
  const old = edition === '1.2', prefix = old ? 'LMS' : '', get = old ? 'cmi.core.lesson_location' : 'cmi.location'; let checkpoints = 0, coercions = 0;
  const options = {checkpoint() {checkpoints++;}}, api: any = old ? createSCORM12API(options) : createSCORM2004API({edition, ...options});
  const unknown: unknown[] = ['unknown', '999', '65536', '403suffix', '403\n', '0403', '__proto__', 'constructor', 'toString', null, undefined, NaN, -1, 0.5, [], {}, Symbol('code'), {toString() {coercions++; throw Error('untrusted coercion');}, valueOf() {coercions++; throw Error('untrusted coercion');}}];
  const check = () => {
    const error = api[prefix + 'GetLastError']();
    for (const value of unknown) for (const method of ['GetErrorString', 'GetDiagnostic']) {assert.equal(api[prefix + method](value), ''); assert.equal(api[prefix + 'GetLastError'](), error);}
    for (const method of ['GetErrorString', 'GetDiagnostic']) {assert.ok(api[prefix + method]('403')); assert.equal(api[prefix + method](403), api[prefix + method]('403'));}
    assert.equal(api[prefix + 'GetDiagnostic'](''), api[prefix + 'GetDiagnostic'](error)); assert.equal(api[prefix + 'GetLastError'](), error); assert.equal(coercions, 0);
  };
  assert.equal(api[prefix + 'GetValue'](get), ''); check();
  assert.equal(api[prefix + 'Initialize'](''), 'true'); assert.equal(api[prefix + 'SetValue'](get, 'Original'), 'true'); assert.equal(api[prefix + 'SetValue'](get, null), 'false'); check();
  assert.equal(api[prefix + 'GetValue'](get), 'Original'); assert.equal(api[prefix + 'Commit'](''), 'true'); check();
  assert.equal(api[old ? 'LMSFinish' : 'Terminate'](''), 'true'); assert.equal(api[prefix + 'GetValue'](get), ''); check();
  assert.equal(checkpoints, 2);
});
