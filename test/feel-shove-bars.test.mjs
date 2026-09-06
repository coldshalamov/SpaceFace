// PQ-186.00 "Bars as checks" — B4 and B5, the shove bars, as sentence-messaged checks.
// The scenario computes the verdicts from raw numbers (scripts/lib/bench/feelBars.mjs doctrine:
// bench-internal pass booleans are never copied as verdicts); this check asserts those verdicts
// with FEEL_CONTRACT §B's own sentences as the assertion messages.
import test from 'node:test';
import assert from 'node:assert/strict';

import { scenario } from '../scripts/lib/bench/scenarios/feel.shove_magnitude.mjs';

const SEED = 4242;
const LONG = { timeout: 180_000 };

// One literal per sentence, verbatim from FEEL_CONTRACT §B — the coverage contract
// (test/feel-bars-contract.test.mjs) source-scans these files for the exact quote.
const B4_SENTENCE = `The dedicated shove weapon changes a light hostile's velocity by ≥ 30 % of its cruise per hit. The starter gun changes it by ≥ 5 % per hit. A light hostile already at cruise gets faster when shoved along its motion.`;
const B5_SENTENCE = `2 s after a shove-weapon hit, a light hostile is ≥ 1 screen depth off the line it was flying and has not fired.`;

function barsFor(result, barId) {
  const bars = result && result.metrics && Array.isArray(result.metrics.bars)
    ? result.metrics.bars.filter((row) => row && row.bar === barId)
    : [];
  return bars;
}

test('feel.shove_magnitude exports the contracted scenario shape', () => {
  assert.equal(scenario.id, 'feel.shove_magnitude');
  assert.equal(typeof scenario.label, 'string');
  assert.equal(typeof scenario.run, 'function');
});

test('B4 shove magnitude meets the contract on the real path', LONG, async () => {
  const result = await scenario.run(SEED);
  const bars = barsFor(result, 'B4');
  assert.ok(bars.length >= 3,
    `${B4_SENTENCE} — the starter gun, the shove weapon and the along-motion clause must each print (got ${bars.length})`);
  for (const row of bars) {
    assert.equal(row.met, true,
      `${B4_SENTENCE} — clause "${row.label}" measured ${row.value} ${row.unit}`);
  }
});

test('B5 shove displacement meets the contract on the real path', LONG, async () => {
  const result = await scenario.run(SEED);
  const bars = barsFor(result, 'B5');
  assert.ok(bars.length >= 2,
    `${B5_SENTENCE} — the displacement clause and the has-not-fired clause must each print (got ${bars.length})`);
  for (const row of bars) {
    assert.equal(row.met, true,
      `${B5_SENTENCE} — clause "${row.label}" measured ${row.value} ${row.unit}`);
  }
});

test('feel.shove_magnitude is deterministic on a fixed seed', LONG, async () => {
  const a = await scenario.run(SEED);
  const b = await scenario.run(SEED);
  assert.equal(
    JSON.stringify(a.metrics),
    JSON.stringify(b.metrics),
    'fixed seeds or it did not happen — the same seed must produce the same number',
  );
});
