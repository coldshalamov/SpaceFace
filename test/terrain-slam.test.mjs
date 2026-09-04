// B6 terrain slam instrument: same absolute speed for the heavy, independent damage/helm
// receipts, fail-closed missing proof. Does not pin today's unmet damage half.
import test from 'node:test';
import assert from 'node:assert/strict';

import { scenario } from '../scripts/lib/bench/scenarios/feel.terrain_slam.mjs';

const SEED = 4242;
const LONG = { timeout: 180_000 };

function b6Bars(result) {
  const bars = result && result.metrics && Array.isArray(result.metrics.bars)
    ? result.metrics.bars.filter((row) => row && row.bar === 'B6')
    : [];
  return bars;
}

test('feel.terrain_slam exports the contracted scenario shape', () => {
  assert.equal(scenario.id, 'feel.terrain_slam');
  assert.equal(typeof scenario.label, 'string');
  assert.equal(typeof scenario.run, 'function');
});

test('the Atlas flies the light case\'s same absolute speed, not 0.76 of Atlas cruise', LONG, async () => {
  const result = await scenario.run(SEED);
  const m = result.metrics;
  assert.equal(
    m.sameAbsoluteSpeed,
    true,
    'Slam them into asteroids. A heavy at the same speed — same WU/s, not a fraction of its own cruise.',
  );
  assert.ok(Number.isFinite(m.light75AbsoluteSpeed) && m.light75AbsoluteSpeed > 0);
  assert.ok(Number.isFinite(m.heavy75CommandedSpeed));
  assert.ok(
    Math.abs(m.heavy75CommandedSpeed - m.light75AbsoluteSpeed) <= 0.05,
    `Atlas commanded ${m.heavy75CommandedSpeed} WU/s; light flew ${m.light75AbsoluteSpeed} WU/s`,
  );
  assert.ok(Number.isFinite(m.heavy75OwnCruise) && m.heavy75OwnCruise > 0);
  assert.ok(
    Number.isFinite(m.heavy75OwnCruiseFraction),
    'Atlas must report its own-cruise fraction separately from the matched absolute speed',
  );
  assert.ok(
    Math.abs(m.heavy75OwnCruiseFraction - 0.76) > 0.02,
    `Atlas own-cruise fraction must not be the light 0.76 throttle (got ${m.heavy75OwnCruiseFraction})`,
  );
});

test('damage and helm receipts are independent, and missing proof cannot pass', LONG, async () => {
  const result = await scenario.run(SEED);
  const m = result.metrics;
  const bars = b6Bars(result);
  assert.equal(
    bars.length,
    5,
    'A light hostile meeting rock at ≥ 50 % of cruise loses ≥ 60 % of hull and its helm; at ≥ 75 % of cruise it dies. A heavy at the same speed loses ≤ 15 % and keeps its helm.',
  );
  assert.equal(m.light50DamageProof, true, 'light 50 % must carry a damage receipt');
  assert.equal(m.light50HelmProof, true, 'light 50 % must carry a helm receipt');
  assert.equal(m.light75DamageProof, true, 'light 76 % must carry a damage receipt');
  assert.equal(m.heavy75DamageProof, true, 'a heavy that keeps helm must still publish its damage receipt');
  assert.equal(m.heavy75HelmProof, true, 'heavy keep-helm needs a consequence receipt, not an inferred false');
  assert.ok(
    Number.isFinite(m.heavy75ConsequenceImpactDamage) || m.heavy75ConsequenceImpactDamage === 0
      || Number.isFinite(m.heavy75ShieldAbsorbed),
    'heavy damage must be measured even when helm is kept',
  );
  for (const row of bars) {
    assert.equal(typeof row.met, 'boolean');
    if (row.unmeasured === true) {
      assert.equal(row.value, null, 'UNMEASURED must not fill zero');
      assert.equal(row.met, false, 'UNMEASURED never passes');
    }
  }
  assert.equal(m.realPath.sg02Ready, true);
  assert.equal(m.realPath.backend, 'rapier-dynamic');
});

test('feel.terrain_slam is deterministic on a fixed seed', LONG, async () => {
  const a = await scenario.run(SEED);
  const b = await scenario.run(SEED);
  assert.equal(
    JSON.stringify(a.metrics),
    JSON.stringify(b.metrics),
    'Fixed seeds or it did not happen — the same seed must produce the same number',
  );
});
