// U9 (WF-07) — the Triangulation Suite is a real capability milestone: a fitted suite tightens the
// anomaly bearing solver from the default three pulses to two, authored per-candidate configs
// always win, and without the module nothing changes.
import assert from 'node:assert/strict';
import test from 'node:test';

import { MODULES } from '../src/data/modules.js';
import { sumFittedModuleMod } from '../src/core/fittedModules.js';
import { effectiveAnomalyRequiredPings, recordAnomalyBearing } from '../src/systems/scanner.js';

const SUITE_ID = 'mod_triangulation_suite_s';
const ORIGIN_A = { x: 0, z: 0 };
const ORIGIN_B = { x: 400, z: 0 };
const TARGET = { x: 200, z: -800 };

function stateWithSuite(fitted) {
  const entity = { data: { fittings: fitted ? [SUITE_ID] : [] } };
  return { playerId: 7, entities: new Map([[7, entity]]) };
}

// Two accepted bearings from separated origins with a wide angle — a complete fix at 2 required.
function ping(previous, origin, requiredPings) {
  return recordAnomalyBearing(previous, origin, TARGET, { requiredPings }, 0);
}

test('the suite ships as a purchasable utility with the behavioral mod', () => {
  const def = MODULES.find((row) => row.id === SUITE_ID);
  assert.ok(def, 'module def exists');
  assert.equal(def.slotType, 'utility');
  assert.equal(def.mods.anomalyPingReduction, 1);
  assert.equal(def.requiresTech, 'tech_long_range_survey');
  assert.equal(sumFittedModuleMod(stateWithSuite(true), 'anomalyPingReduction'), 1);
  assert.equal(sumFittedModuleMod(stateWithSuite(false), 'anomalyPingReduction'), 0);
});

test('with the suite fitted the solver requires two pulses, not the default three', () => {
  // The scanner passes requiredPings = max(2, 3 - reduction) = 2 when the suite is fitted.
  const first = ping(null, ORIGIN_A, 2);
  const second = ping(first.record, ORIGIN_B, 2);
  assert.equal(second.record.sampleCount ?? second.sampleCount, 2);
  assert.equal(second.record.revealed, true, 'two wide bearings reveal the anomaly');
  assert.equal(second.record.requiredPings, 2);
});

test('without the suite the default three-pulse fix still needs three accepted bearings', () => {
  const first = ping(null, ORIGIN_A, 3);
  const second = ping(first.record, ORIGIN_B, 3);
  assert.equal(second.record.revealed, false, 'two bearings are not enough at the default');
  assert.equal(second.record.requiredPings, 3);
  const third = ping(second.record, { x: 0, z: 400 }, 3);
  assert.equal(third.record.revealed, true, 'the third distinct bearing completes the default fix');
});

test('precedence: the suite reduces the default count, genuinely custom counts win untouched', () => {
  // The live Resonance Obelisk authors requiredPings: 3 explicitly — the same as the default —
  // so the suite must still reduce it. A deliberately different authored count wins.
  assert.equal(effectiveAnomalyRequiredPings(3, 1), 2, 'authored default-3 is reducible');
  assert.equal(effectiveAnomalyRequiredPings(undefined, 1), 2, 'omitted count is reducible');
  assert.equal(effectiveAnomalyRequiredPings(3, 0), 3, 'no suite, no change');
  assert.equal(effectiveAnomalyRequiredPings(5, 1), 5, 'an authored non-default count wins');
  assert.equal(effectiveAnomalyRequiredPings(2, 1), 2, 'the floor holds');
});
