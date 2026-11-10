import assert from 'node:assert/strict';
import test from 'node:test';

import {
  _test,
  createCycle,
  cycleFactorAt,
  deserializeCycles,
  maybeAdvanceRegime,
  rawCycleFactorAt,
  serializeCycles,
} from '../src/systems/economyCycles.js';
import { COMMODITIES } from '../src/data/commodities.js';

const T0 = 2000; // the old regime expires exactly here

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sine regime whose raw exit value (~0.75) sits well inside the factor band, so the
// phase-bias target is never clamp-distorted in the assertions below.
function makeExpiredCycle() {
  return {
    cmdtyId: 'cmdty_medical',
    regime: 'sine', family: 'sine',
    phase: 0.7, frequency: 0.0021, amplitude: 0.26, bias: 0.01,
    slope: 0, a: 0, b: 0, c: 0, pivot: 0.5,
    amp2: 0, freq2: 0.0036, phase2: 0,
    amp3: 0, freq3: 0.005, phase3: 0,
    regimeStartT: 0, regimeEndT: T0,
  };
}

function pureOf(cycle) {
  const pure = { ...cycle };
  delete pure.blendFrom;
  delete pure.blendStartT;
  delete pure.blendEndT;
  return pure;
}

test('regime re-roll records a bounded crossfade instead of snapping the chart', () => {
  const def = COMMODITIES.find((c) => c.id === 'cmdty_medical');
  const old = makeExpiredCycle();
  const next = maybeAdvanceRegime(old, mulberry32(7), T0);

  assert.notEqual(next, old, 'an expired regime re-rolls');
  assert.equal(next.regimeStartT, T0, 'the fresh regime starts at the roll time');
  assert.ok(next.blendFrom && typeof next.blendFrom === 'object',
    'the re-roll carries the outgoing formula for the crossfade');
  assert.equal(next.blendStartT, T0);
  const blendS = next.blendEndT - next.blendStartT;
  assert.ok(blendS >= _test.REGIME_BLEND_MIN_S && blendS <= _test.REGIME_BLEND_MAX_S,
    `crossfade window stays in the authored 2-5 min band (got ${blendS}s)`);

  // Continuity at the seam: the first blended sample equals the old regime's exit factor.
  assert.ok(Math.abs(cycleFactorAt(next, T0) - cycleFactorAt(old, T0)) < 1e-12,
    'the factor is continuous across the re-roll instant');

  // Mid-blend is the exact lerp of the two live curves; past the window it is the pure new one.
  const pure = pureOf(next);
  const midT = (next.blendStartT + next.blendEndT) / 2;
  const expectedMid = 0.5 * (cycleFactorAt(old, midT) + cycleFactorAt(pure, midT));
  assert.ok(Math.abs(cycleFactorAt(next, midT) - expectedMid) < 1e-12,
    'mid-blend is the lerp of the continued old curve and the fresh curve');
  assert.ok(Math.abs(cycleFactorAt(next, next.blendEndT) - cycleFactorAt(pure, next.blendEndT)) < 1e-12,
    'the crossfade ends exactly on the fresh formula');
  assert.ok(Math.abs(cycleFactorAt(next, next.blendEndT + 1) - cycleFactorAt(pure, next.blendEndT + 1)) < 1e-12,
    'after the window the fresh formula rules alone');
});

test('the fresh wave phase is biased toward the price the old regime ended on', () => {
  const def = COMMODITIES.find((c) => c.id === 'cmdty_medical');
  const old = makeExpiredCycle();
  const target = rawCycleFactorAt(old, T0);
  let improved = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const next = maybeAdvanceRegime(old, mulberry32(seed), T0);
    const replay = createCycle(mulberry32(seed), def, T0); // same draws, no bias
    assert.equal(next.regime, replay.regime, 'the bias consumes no extra rng draws');
    const errBiased = Math.abs(rawCycleFactorAt(next, T0) - target);
    const errUnbiased = Math.abs(rawCycleFactorAt(replay, T0) - target);
    assert.ok(errBiased <= errUnbiased + 1e-9,
      `seed ${seed}: biased opening (${errBiased.toFixed(6)}) must beat or match unbiased (${errUnbiased.toFixed(6)})`);
    if (errUnbiased - errBiased > 1e-6) improved++;
  }
  assert.ok(improved > 0, 'the phase bias measurably moves the opening value for some rolls');
});

test('finished blend state is pruned and the re-roll stays deterministic per seed', () => {
  const old = makeExpiredCycle();
  const a = maybeAdvanceRegime(old, mulberry32(3), T0);
  const b = maybeAdvanceRegime(old, mulberry32(3), T0);
  assert.deepEqual(a, b, 'identical seeds produce identical re-rolls');

  const afterBlend = a.blendEndT + 10; // still inside the new regime (>= 25 min)
  const pruned = maybeAdvanceRegime(a, mulberry32(4), afterBlend);
  assert.notEqual(pruned, a, 'the first tick past the window drops the dead blend snapshot');
  assert.equal(pruned.blendFrom, null);
  assert.equal(maybeAdvanceRegime(pruned, mulberry32(5), afterBlend), pruned,
    'pruning happens once, not every tick');
  assert.ok(Math.abs(cycleFactorAt(pruned, afterBlend) - cycleFactorAt(pureOf(a), afterBlend)) < 1e-12,
    'pruning never changes the evaluated factor');
});

test('blend state survives a save/load round trip and legacy rows load unblended', () => {
  const old = makeExpiredCycle();
  const blending = maybeAdvanceRegime(old, mulberry32(11), T0);

  const saved = serializeCycles({ economy: { cycles: { station_test: { cmdty_medical: blending } } } });
  const row = saved.station_test[0];
  assert.ok(Array.isArray(row) && row.length >= 23, 'an in-blend cycle packs its blend tail');
  const restored = { economy: { cycles: {} } };
  deserializeCycles(restored, saved);
  const back = restored.economy.cycles.station_test.cmdty_medical;
  assert.equal(back.blendFrom.family, blending.blendFrom.family,
    'the outgoing formula family survives the round trip');
  assert.equal(back.blendStartT, blending.blendStartT);
  assert.equal(back.blendEndT, blending.blendEndT);
  const midT = (blending.blendStartT + blending.blendEndT) / 2;
  assert.ok(Math.abs(cycleFactorAt(back, midT) - cycleFactorAt(blending, midT)) < 1e-12,
    'a reloaded mid-blend cycle evaluates identically — no jump on reload');

  const plain = serializeCycles({ economy: { cycles: { station_test: { cmdty_medical: old } } } });
  assert.equal(plain.station_test[0].length, 20, 'cycles outside a blend keep the 20-entry row');
  const restoredPlain = { economy: { cycles: {} } };
  deserializeCycles(restoredPlain, plain);
  assert.equal(restoredPlain.economy.cycles.station_test.cmdty_medical.blendFrom ?? null, null,
    'legacy rows load without blend state');
});

test('a non-positive formula still re-rolls immediately', () => {
  const invalid = {
    ...makeExpiredCycle(),
    family: 'falling', regime: 'falling', amplitude: 0, bias: 0, slope: -2,
    regimeStartT: T0 - 1, regimeEndT: T0 + 600,
  };
  assert.ok(rawCycleFactorAt(invalid, T0) <= 0,
    'fixture forces a formula that would make a price non-positive');
  const next = maybeAdvanceRegime(invalid, mulberry32(9), T0);
  assert.notEqual(next, invalid, 'the safety re-roll fires before regime expiry');
  assert.ok(Number.isFinite(cycleFactorAt(next, T0)) && cycleFactorAt(next, T0) > 0,
    'the replacement quotes a finite positive factor immediately');
});
