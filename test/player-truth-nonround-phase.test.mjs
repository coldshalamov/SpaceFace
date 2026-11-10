import test from 'node:test';
import assert from 'node:assert/strict';
import { flightPhaseSample } from '../scripts/player-truth/checks.mjs';
import { summarizeBodyOcclusion } from '../scripts/player-truth/readability.mjs';

test('nonround flight cannot be discarded by the inactive survival placeholder', () => {
  const sample = { mode: 'flight', roundMode: false, run: { kind: 'survival', ph: 'inactive' },
    e: [[7, 7, 0, 0, 0, 0, 640, 360, 8, 3, 1, 4]], px: { bodyOcclusion: {
      version: 1, method: 'native-opaque-id-depth', rows: [
        { id: 7, cls: 'station', ty: 4, status: 'measured', pixels: 0 },
      ],
    } } };
  assert.equal(flightPhaseSample(sample, { meta: { rounds: false } }), true);
  assert.equal(summarizeBodyOcclusion([sample]).get('station|4').n, 1);
  assert.equal(flightPhaseSample(sample, { meta: { rounds: true } }), false);
  assert.equal(summarizeBodyOcclusion([{ ...sample, roundMode: true }]).size, 0);
  assert.equal(flightPhaseSample({ ...sample, run: { ph: 'draft' } }, { meta: { rounds: false } }), false);
});
