import assert from 'node:assert/strict';
import test from 'node:test';

import {
  governingRegime, regimeFactorAt, regimeCurveAt,
  REGIME_CELL_S, REGIME_FACTOR_LO, REGIME_FACTOR_HI,
} from '../src/economy/marketModel.js';

// ECON-BUILD-1 — the seeded regime grid hands regimes over with a bounded crossfade
// instead of snapping the chart. This pins the same continuity contract the retired
// wave engine's blendFrom/blendEndT carried: factor is continuous at the handover
// instant, the mid-blend sample is the exact lerp of outgoing and incoming curves,
// and after the window the fresh regime rules alone — all of it derived from
// (seed, station, good, t), so a reload evaluates identically without saved state.

const SEED = 'arcade-continuity';
const STATION = 'station_ceres';
const GOOD = 'cmdty_medical';

// A run whose startT sits inside live sim time: far enough out that real regime
// runs exist, close enough that the blend window is easy to sample.
function freshRun() {
  for (let t = REGIME_CELL_S; t < REGIME_CELL_S * 24; t += REGIME_CELL_S) {
    const run = governingRegime(SEED, STATION, GOOD, t);
    if (run && run.startT > 0 && governingRegime(SEED, STATION, GOOD, run.startT - 1) !== run) {
      return run;
    }
  }
  return null;
}

test('regime handover carries a bounded crossfade instead of snapping the chart', () => {
  const run = freshRun();
  assert.ok(run, 'a later seeded regime run exists with a real handover');
  assert.ok(run.blendS >= 120 && run.blendS <= 300,
    `crossfade window stays in the authored 2-5 min band (got ${run.blendS}s)`);
  const prev = governingRegime(SEED, STATION, GOOD, run.startT - 1);
  const T0 = run.startT;

  // Continuity at the seam: the first blended sample equals the outgoing curve's exit.
  const justBefore = regimeCurveAt(prev, T0 - 1e-6);
  const atSeam = regimeFactorAt(SEED, STATION, GOOD, T0);
  assert.ok(Math.abs(atSeam - regimeCurveAt(prev, T0)) < 1e-9,
    'the factor at the handover instant is the outgoing curve, not a jump');
  assert.ok(Math.abs(atSeam - justBefore) < 0.02,
    'the factor is continuous across the boundary (no visible snap)');

  // Mid-blend is the exact lerp of the outgoing curve continued forward and the fresh curve.
  const midT = T0 + run.blendS / 2;
  const expected = regimeCurveAt(prev, midT)
    + (regimeCurveAt(run, midT) - regimeCurveAt(prev, midT)) * 0.5;
  assert.ok(Math.abs(regimeFactorAt(SEED, STATION, GOOD, midT) - expected) < 1e-9,
    'mid-blend is the lerp of the continued old curve and the fresh curve');

  // Past the window the fresh regime rules alone.
  const after = T0 + run.blendS + 1;
  assert.ok(Math.abs(regimeFactorAt(SEED, STATION, GOOD, after) - regimeCurveAt(run, after)) < 1e-9,
    'the crossfade ends exactly on the fresh formula');
});

test('the seeded factor is evaluation-order independent — no saved regime state', () => {
  const run = freshRun();
  const t = run.startT + run.blendS * 0.37;
  // Evaluating the future before the present must not change either answer: the
  // regime grid is a closed form of (seed, station, good, t), not a rolled stream.
  const futureFirst = regimeFactorAt(SEED, STATION, GOOD, t + 4000);
  const nowSecond = regimeFactorAt(SEED, STATION, GOOD, t);
  const nowFirst = regimeFactorAt(SEED, STATION, GOOD, t);
  const futureSecond = regimeFactorAt(SEED, STATION, GOOD, t + 4000);
  assert.equal(futureFirst, futureSecond);
  assert.equal(nowFirst, nowSecond);
  assert.ok(Number.isFinite(nowFirst) && nowFirst > 0);
  assert.ok(nowFirst >= REGIME_FACTOR_LO && nowFirst <= REGIME_FACTOR_HI,
    'the evaluated factor stays inside the authored band');
});

test('every listing on a station blends independently but deterministically', () => {
  const a = governingRegime(SEED, STATION, 'cmdty_ore_iron', 3600);
  const a2 = governingRegime(SEED, STATION, 'cmdty_ore_iron', 3600);
  const b = governingRegime(SEED, STATION, 'cmdty_medical', 3600);
  assert.deepEqual(a, a2, 'same draw reproduces the identical run');
  assert.ok(a && b, 'both listings resolve a governing regime');
  assert.notDeepEqual(
    { kind: a.kind, startT: a.startT, params: a.params },
    { kind: b.kind, startT: b.startT, params: b.params },
    'two goods on one station ride different seeded runs',
  );
});
