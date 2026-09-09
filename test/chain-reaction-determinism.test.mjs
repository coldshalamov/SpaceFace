// PQ-137.09 — the done-when, and the "deterministically" in it.
//
// "One deterministic 'prime one, sling it, watch the chain' scenario … produces >= 3 secondary
// consequences from one player action, deterministically (fixed seed), on the real physics path."
//
// Two runs of seed 4242 must hash identical. A bench whose numbers move between runs cannot tell
// anyone whether a change helped, which is how a project loses the ability to test itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { scenario } from '../scripts/lib/bench/scenarios/feel.chain_reaction.mjs';
import { canonicalStringify } from '../src/core/simSnapshot.js';

const SEED = 4242;
const CONSEQUENCES = 'Consequences or it is thin.';

function traceHash(result) {
  return createHash('sha256').update(canonicalStringify(result.eventTrace)).digest('hex');
}

test('feel.chain_reaction: one player action, three or more secondary consequences, twice the same', async (t) => {
  t.diagnostic('boots the real rapier-dynamic path twice; allow a minute');
  const first = await scenario.run(SEED);
  const second = await scenario.run(SEED);

  const m = first.metrics;
  assert.equal(m.playerActions, 1,
    'the count is only meaningful if exactly one thing the player did is upstream of it');
  assert.equal(m.primedBeforeSling, true,
    'the plate has to have stuck before the shove, or the "primed ship" premise is fiction');
  assert.ok(m.secondaryConsequences >= 3,
    `${CONSEQUENCES} — ${m.secondaryConsequences} secondary consequences from one shove: ${JSON.stringify(m.causalList)}`);
  assert.ok(m.distinctConsequenceKinds >= 2,
    'three copies of the same event is one consequence repeated, not a chain');
  assert.ok(m.slamDetonations >= 1, 'the primed ship must go off on the slam it was slung into');
  assert.ok(m.realPath && m.realPath.backend === 'rapier-dynamic' && m.realPath.sg02Ready === true,
    'a scenario that integrates its own physics is not a measurement');

  assert.equal(second.metrics.secondaryConsequences, m.secondaryConsequences,
    'the same seed must produce the same number of consequences');
  assert.deepEqual(second.metrics.causalList, m.causalList,
    'the same seed must produce the same causal list, in the same order');
  assert.equal(traceHash(second), traceHash(first),
    'fixed seeds or it did not happen: two runs of seed 4242 must hash identical');
});

test('feel.chain_reaction: the well converges craft into the authored band and primes what it grinds', async () => {
  const result = await scenario.run(SEED);
  const m = result.metrics;
  assert.ok(m.wellMeasured === true, 'the fields owner must actually have run (it is a no-op under node unless opted in)');
  assert.ok(m.wellConvergenceSpeed >= 30 && m.wellConvergenceSpeed <= 60,
    `a well converges ships to 30-60 WU/s relative; measured ${m.wellConvergenceSpeed}`);
  assert.ok(Math.abs(m.wellConvergenceSpeed - m.wellEquilibriumSpeed) < 10,
    'the measured convergence must agree with the law\'s own fixed point (strength / damping), not merely land in the band by luck');
  assert.ok(m.wellGrindPrimes >= 2,
    `${CONSEQUENCES} — a well that grinds two hulls together has cooked both of them`);
});
