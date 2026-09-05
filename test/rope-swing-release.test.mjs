// B7 rope-swing instrument: real-path attachment/SG-02 owners, 100 WU line, 1.5x cruise.
// Does not pin today's unmet stiffness/retention — those belong on the bench bars.
import test from 'node:test';
import assert from 'node:assert/strict';

import { discoverScenarioModules, listVerbScenarios } from '../scripts/lib/bench/verbBench.mjs';
import { scenario } from '../scripts/lib/bench/scenarios/feel.rope_swing_release.mjs';

const SEED = 4242;
const LONG = { timeout: 180_000 };

test('feel.rope_swing_release exports the contracted scenario shape', () => {
  assert.equal(scenario.id, 'feel.rope_swing_release');
  assert.equal(typeof scenario.label, 'string');
  assert.equal(typeof scenario.run, 'function');
});

test('discovery replaces the inline toy by the feel.rope_swing_release module', async () => {
  const discovered = await discoverScenarioModules();
  const spec = discovered.get('feel.rope_swing_release');
  assert.ok(spec, 'Swing around a huge asteroid and let go flying.');
  assert.equal(spec.module, 'feel.rope_swing_release.mjs');
  assert.equal(spec.run, scenario.run);
  const merged = await listVerbScenarios();
  const row = merged.find((s) => s.id === 'feel.rope_swing_release');
  assert.equal(row.run, scenario.run, 'the discovered module must dispatch, not the inline integrator');
});

test('the instrument measures the real path around a 100 WU line at 1.5x cruise', LONG, async () => {
  const result = await scenario.run(SEED);
  const m = result.metrics;
  assert.ok(m, 'The rope is a rope.');
  assert.ok(m.realPath, 'metrics.realPath is required');
  assert.equal(m.realPath.sg02Ready, true, 'SG-02 dynamic authority must be ready — a stand-in would report false');
  assert.equal(m.realPath.backend, 'rapier-dynamic');
  assert.ok(m.owners, 'liveness/ownership proof is required');
  assert.equal(m.owners.sg02Ready, true);
  assert.equal(m.owners.combatSystem || m.owners.actionsSystem, true, 'the attachment owner must have run');
  assert.equal(m.owners.tetherGameplaySystem, true, 'the tether gameplay owner must be registered');
  assert.ok(Number.isFinite(m.cruiseSpeed) && m.cruiseSpeed > 0, 'cruise must be the live governed number, not a hard-coded 195');
  assert.notEqual(m.cruiseSpeed, 195);
  assert.ok(Number.isFinite(m.authoredLength) && Math.abs(m.authoredLength - 100) < 0.05, `standard 100 WU line, got ${m.authoredLength}`);
  assert.ok(m.anchorMass > 1800, 'the anchor must be a clearly identified heavy');
  const bars = Array.isArray(m.bars) ? m.bars.filter((row) => row && row.bar === 'B7') : [];
  assert.equal(bars.length, 3, 'peak stretch, line held, and 5 s retention must each be a clause');
  for (const row of bars) {
    assert.equal(typeof row.unit, 'string');
    assert.equal(typeof row.met, 'boolean');
    if (row.unmeasured === true) {
      assert.equal(row.value, null, 'UNMEASURED must carry null, not a toy 10.27 %');
      assert.equal(row.met, false);
    } else {
      assert.equal(typeof row.value, 'number');
      assert.ok(Number.isFinite(row.value));
    }
  }
  // PQ-137.07 changed the guts: the line's stiffness now rises with the coupled load (mu * v_t^2 / r),
  // so the swing the contract names stays inside 5 % of the line. The bar is met on the real path.
  const stretch = bars.find((row) => /stretch/i.test(row.label || row.clause || ''));
  assert.equal(m.barMet, true,
    'The rope is a rope: a 1.5x cruise swing on a 100 WU line stretches < 10 % and holds, and release keeps >= 95 % of tangential speed 5 s later — "Swing around a huge asteroid and let go flying."');
  if (stretch && typeof stretch.value === 'number') {
    assert.ok(stretch.value < 0.10, `peak stretch ${stretch.value} must stay under the contract's 10 % (was 0.163 before the load-scaled stiffness)`);
  }
});

test('feel.rope_swing_release is deterministic on a fixed seed', LONG, async () => {
  const a = await scenario.run(SEED);
  const b = await scenario.run(SEED);
  assert.equal(
    JSON.stringify(a.metrics),
    JSON.stringify(b.metrics),
    'Fixed seeds or it did not happen — the same seed must produce the same number',
  );
});
