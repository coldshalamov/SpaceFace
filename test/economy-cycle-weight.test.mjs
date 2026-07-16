import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CYCLE_WEIGHT,
  cycleFactorAt,
  rawCycleFactorAt,
} from '../src/systems/economyCycles.js';

function sineCycle(phase) {
  return {
    cmdtyId: 'cmdty_medical',
    regime: 'sine', family: 'sine',
    phase, frequency: 1, amplitude: 0.28, bias: 0,
    slope: 0, a: 0, b: 0, c: 0, pivot: 0.5,
    amp2: 0, freq2: 1.7, phase2: 0,
    amp3: 0, freq3: 2.4, phase3: 0,
    regimeStartT: 0, regimeEndT: 1000,
  };
}

test('cycle weight demotes the formula wave to a short-term overlay', () => {
  assert.equal(CYCLE_WEIGHT, 0.5);

  const high = sineCycle(Math.PI / 2);
  const low = sineCycle(-Math.PI / 2);
  assert.ok(Math.abs(rawCycleFactorAt(high, 0) - 1.28) < 1e-9);
  assert.ok(Math.abs(rawCycleFactorAt(low, 0) - 0.72) < 1e-9);
  assert.ok(Math.abs(cycleFactorAt(high, 0) - 1.14) < 1e-9);
  assert.ok(Math.abs(cycleFactorAt(low, 0) - 0.86) < 1e-9);
});
