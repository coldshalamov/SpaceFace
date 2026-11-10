// PQ-137.06 — terrain crumple from real pre-solve closing speed, on the live Rapier path.
import test from 'node:test';
import assert from 'node:assert/strict';

import { runVerbBench } from '../scripts/lib/bench/verbBench.mjs';

const SEED = 4242;
const LONG = { timeout: 300_000 };
const BOUNDED_DV = 40;
const DV_EPS = 1e-6;

function b6Bars(run) {
  const bars = run && run.metrics && Array.isArray(run.metrics.bars)
    ? run.metrics.bars.filter((row) => row && row.bar === 'B6')
    : [];
  return bars;
}

function assertBoundedDv(label, value) {
  assert.ok(Number.isFinite(value), `${label} contact Δv must be a number`);
  assert.ok(
    Math.abs(value - BOUNDED_DV) <= DV_EPS,
    `${label} keeps the solver's 40 WU/s structural-give Δv (got ${value})`,
  );
}

test('real Rapier terrain crumple is deterministic and meets every B6 clause', LONG, async () => {
  const first = await runVerbBench({ seeds: [SEED], scenarioIds: ['feel.terrain_slam'] });
  const second = await runVerbBench({ seeds: [SEED], scenarioIds: ['feel.terrain_slam'] });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.runs.length, 1);
  assert.equal(second.runs.length, 1);
  const a = first.runs[0];
  const b = second.runs[0];
  assert.equal(a.runError, undefined, a.runError || 'first feel.terrain_slam run must succeed');
  assert.equal(b.runError, undefined, b.runError || 'second feel.terrain_slam run must succeed');
  assert.equal(a.runHash, b.runHash, 'two seed-4242 runs must hash identically');
  assert.deepEqual(a.metrics, b.metrics, 'two seed-4242 runs must print the same metrics');

  const m = a.metrics;
  const bars = b6Bars(a);
  assert.equal(bars.length, 5, 'B6 is five clauses: light hull, light helm, light death, heavy hull, heavy helm');
  for (const row of bars) {
    assert.equal(row.unmeasured, undefined, `${row.label} must not fail closed as UNMEASURED`);
    assert.equal(row.met, true, `${row.label} must be met`);
  }

  assert.equal(m.realPath && m.realPath.backend, 'rapier-dynamic');
  assert.equal(m.realPath && m.realPath.sg02Ready, true);
  assert.equal(m.light50ClosingProof, true, 'light 50 % must carry producer preSolveClosingSpeed');
  assert.equal(m.closingProof, true, 'light 76 % must carry producer preSolveClosingSpeed');
  assert.equal(m.heavy75ClosingProof, true, 'Atlas must carry producer preSolveClosingSpeed');
  assert.equal(m.light50ClosingAgreement, true,
    `producer ${m.light50PreSolveClosingSpeed} vs independent ${m.light50IndependentClosingSpeed} must agree within 0.5 WU/s`);
  assert.equal(m.closingAgreement, true,
    `producer ${m.preSolveClosingSpeed} vs independent ${m.independentClosingSpeed} must agree within 0.5 WU/s`);
  assert.equal(m.heavy75ClosingAgreement, true,
    `Atlas producer ${m.heavy75PreSolveClosingSpeed} vs independent ${m.heavy75IndependentClosingSpeed} must agree within 0.5 WU/s`);

  assertBoundedDv('light 50 %', m.light50ContactDeltaV);
  assertBoundedDv('light 76 %', m.contactDeltaV);
  assertBoundedDv('Atlas', m.heavy75ContactDeltaV);

  assert.equal(m.light50DamageProof, true);
  assert.equal(m.light50HelmProof, true);
  assert.ok(m.light50HullLostFraction >= 0.6,
    `A light hostile meeting rock at ≥ 50 % of cruise loses ≥ 60 % of hull (got ${m.light50HullLostFraction})`);
  assert.equal(m.light50LostHelm, true, 'the light 50 % slam takes the helm');

  assert.equal(m.light75DamageProof, true);
  assert.equal(m.light75HelmProof, true);
  assert.equal(m.isLethal, true, 'A light hostile at ≥ 75 % of cruise dies');
  assert.equal(m.light75TumbleMeasurable, true, 'Wasp 76 % death still publishes a measurable tumble');

  assert.equal(m.heavy75DamageProof, true);
  assert.equal(m.heavy75HelmProof, true);
  assert.ok(m.heavy75HullLostFraction <= 0.15,
    `A heavy at the same speed loses ≤ 15 % hull (got ${m.heavy75HullLostFraction})`);
  assert.equal(m.heavy75KeptHelm, true, 'A heavy at the same speed keeps its helm');
  assert.equal(m.barMet, true, 'Slam them into asteroids.');
});
