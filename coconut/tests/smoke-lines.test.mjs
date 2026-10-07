import {test} from 'node:test';
import assert from 'node:assert/strict';
import {smokeLines} from '../scripts/smoke-lines.mjs';
test('native acceptance preserves ready/binding markers across every stderr chunk boundary', () => {
  const input = Buffer.from('WebKit warning\nCOCONUT_SMOKE:recv:ready\nCOCONUT_SMOKE:send:binding\r\n');
  for (let split = 0; split <= input.length; split++) {
    const markers = [], consume = smokeLines(line => markers.push(line));
    consume(input.subarray(0, split)); consume(input.subarray(split));
    assert.deepEqual(markers, ['COCONUT_SMOKE:recv:ready', 'COCONUT_SMOKE:send:binding']);
  }
  const markers = [], consume = smokeLines(line => markers.push(line));
  for (const byte of input) consume(Buffer.from([byte]));
  assert.equal(markers.length, 2);
});
