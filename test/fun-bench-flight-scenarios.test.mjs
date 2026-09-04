// PQ-137.10 (flight half): the missing flight scenarios print their numbers.
import test from 'node:test';
import assert from 'node:assert/strict';

import { scenario as reversal } from '../scripts/lib/bench/scenarios/feel.reversal_course.mjs';
import { scenario as crossing } from '../scripts/lib/bench/scenarios/feel.screen_crossing.mjs';
import { scenario as earned } from '../scripts/lib/bench/scenarios/feel.earned_speed_kept.mjs';

const LONG = { timeout: 180_000 };

test('the three flight feel modules export the contracted scenario shape', () => {
  const expected = [
    { spec: reversal, id: 'feel.reversal_course' },
    { spec: crossing, id: 'feel.screen_crossing' },
    { spec: earned, id: 'feel.earned_speed_kept' },
  ];
  for (const { spec, id } of expected) {
    assert.equal(typeof spec.id, 'string', `${id} must export a string id`);
    assert.equal(spec.id, id, `id must be exactly ${id}`);
    assert.equal(typeof spec.label, 'string', `${id} must export a string label`);
    assert.equal(typeof spec.run, 'function', `${id} must export run(seed)`);
  }
});

test('feel.screen_crossing is deterministic on a fixed seed', LONG, async () => {
  const a = await crossing.run(4242);
  const b = await crossing.run(4242);
  assert.equal(
    JSON.stringify(a.metrics),
    JSON.stringify(b.metrics),
    'fixed seeds or it did not happen — the same seed must produce the same number',
  );
});

// FEEL_CONTRACT B3, as rewritten by the taste director on 2026-09-03, has five measurable clauses:
// the crossing time at cruise, the depth growth at 2x and at 3x cruise, that the opening is
// monotonic, and the hull's smallest share of frame width.
const B3_CLAUSES = 5;

test('B3 prints every clause as a number in player units', LONG, async () => {
  const result = await crossing.run(4242);
  const bars = result && result.metrics && Array.isArray(result.metrics.bars)
    ? result.metrics.bars.filter((row) => row && row.bar === 'B3')
    : [];
  assert.equal(
    bars.length,
    B3_CLAUSES,
    '"Zip around, stay in control of the combat area" — B3 must print every clause as a number',
  );
  for (const row of bars) {
    assert.equal(
      typeof row.value,
      'number',
      '"Zip around, stay in control of the combat area" — B3 must print every clause as a number',
    );
    assert.ok(
      Number.isFinite(row.value),
      '"Zip around, stay in control of the combat area" — B3 must print every clause as a number',
    );
    assert.equal(typeof row.unit, 'string');
    assert.ok(row.unit.length > 0, 'every B3 clause must carry a non-empty unit');
    assert.equal(typeof row.met, 'boolean', 'every B3 clause must carry a boolean met verdict');
  }
});

test('B3 real-path clauses all meet their FEEL_CONTRACT thresholds', LONG, async () => {
  const result = await crossing.run(4242);
  const metrics = result && result.metrics ? result.metrics : {};
  const bars = Array.isArray(metrics.bars)
    ? metrics.bars.filter((row) => row && row.bar === 'B3')
    : [];
  assert.equal(
    bars.length,
    B3_CLAUSES,
    '"Zip around, stay in control of the combat area" — B3 must print every real-path clause',
  );
  for (const row of bars) {
    assert.equal(
      row.met,
      true,
      `"Zip around, stay in control of the combat area" — ${row.label} must meet (got ${row.value} ${row.unit})`,
    );
  }
  assert.ok(
    metrics.crossingAtCruiseS >= 1.2,
    `cruise crossing must be >= 1.2 s (got ${metrics.crossingAtCruiseS})`,
  );
  assert.ok(
    metrics.depthGrowthAt2x >= 1.5,
    `depth growth at 2x cruise must be >= 1.5x (got ${metrics.depthGrowthAt2x})`,
  );
  assert.ok(
    metrics.depthGrowthAt3x >= 2.5,
    `depth growth at 3x cruise must be >= 2.5x (got ${metrics.depthGrowthAt3x})`,
  );
  assert.equal(
    metrics.openingMonotonic,
    true,
    'visible depth must grow monotonically from cruise to 3x cruise',
  );
  assert.ok(
    metrics.minHullFramePct >= 4,
    `starter hull must stay >= 4% of frame width (got ${metrics.minHullFramePct})`,
  );
});
