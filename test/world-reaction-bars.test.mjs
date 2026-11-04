// PQ-186.00 "Bars as checks" — B10, the world-reacts bar, as a sentence-messaged check.
// The scenario (world.reaction_trio) measures the live patrol/cargo/civilian reactions; this
// check asserts the computed verdicts with FEEL_CONTRACT §B's own sentence as the message.
import test from 'node:test';
import assert from 'node:assert/strict';

import { scenario, clauseWreckDrift } from '../scripts/lib/bench/scenarios/world.reaction_trio.mjs';

const SEED = 4242;
const LONG = { timeout: 180_000 };

// One literal, verbatim from FEEL_CONTRACT §B — the coverage contract
// (test/feel-bars-contract.test.mjs) source-scans this file for the exact quote.
const B10_SENTENCE = `Within 10 s of a kill in a patrol's sight, the patrol makes a visible stay-with-wreck / chase choice. Spilled cargo attracts an NPC within 30 s. Civilians within 300 WU of gunfire change course within 3 s.`;

test('world.reaction_trio exports the contracted scenario shape', () => {
  assert.equal(scenario.id, 'world.reaction_trio');
  assert.equal(typeof scenario.label, 'string');
  assert.equal(typeof scenario.run, 'function');
});

test('B10 the world reacts: every clause meets the contract on the real path', LONG, async () => {
  const result = await scenario.run(SEED);
  const bars = result && result.metrics && Array.isArray(result.metrics.bars)
    ? result.metrics.bars.filter((row) => row && row.bar === 'B10')
    : [];
  // The three clauses B10's sentence names. The fourth B10 row (wreck momentum) is PQ-138.03
  // riding the same scenario — it is asserted below under its own claim, not B10's sentence.
  const SENTENCE_CLAUSES = [
    'patrol decides stay-or-chase after a witnessed kill',
    'a live NPC reaches spilled cargo',
    'a civilian within 300 WU of gunfire changes course',
  ];
  const named = SENTENCE_CLAUSES.map((label) =>
    bars.find((row) => row.label === label));
  for (const [i, row] of named.entries()) {
    assert.ok(row,
      `${B10_SENTENCE} — clause "${SENTENCE_CLAUSES[i]}" must print (got ${bars.length} rows)`);
    if (row.unmeasured === true) {
      assert.fail(`${B10_SENTENCE} — clause "${row.label}" is UNMEASURED; a missing listener must be built, not excused`);
    }
    assert.equal(row.met, true,
      `${B10_SENTENCE} — clause "${row.label}" measured ${row.value} ${row.unit}`);
  }
  const rider = bars.find((row) => /wreck keeps the momentum/.test(row.label || ''));
  assert.ok(rider && typeof rider.met === 'boolean',
    'PQ-138.03 (a wreck keeps the momentum of the ship that died) rides this scenario and must still print a verdict');
  if (rider.unmeasured !== true) {
    assert.equal(rider.met, true,
      `PQ-138.03: ${rider.label} measured ${rider.value} ${rider.unit}`);
  }
  const patrol = result.metrics.patrolChoice;
  assert.equal(patrol.witnessPresentAtDeath, true, 'arrival patrol witnesses the actual kill');
  assert.ok(patrol.witnessDistanceAtDeathWU <= 450);
  assert.ok(patrol.decidedAtS <= 10);
  assert.notEqual(patrol.holderId, patrol.chaserId, 'distinct live responders split hold/chase');

  const drift = result.metrics.wreckDrift;
  assert.equal(drift.unmeasured, false);
  assert.equal(drift.inherited, true, 'the real native admission inherits pose, velocity, spin, mass and linear momentum');
  assert.equal(drift.sameNativeBody, true, 'the admitted native record survives the entire coast');
  assert.equal(drift.sameBody, true, 'the same marker-bound entity and occupant survive the entire coast');
  assert.equal(drift.admission.id, drift.wreckId);
  assert.equal(drift.final.id, drift.wreckId);
  assert.equal(drift.final.generation, drift.admission.generation);
  assert.equal(drift.final.mass, drift.death.mass);
  assert.notEqual(drift.victimId, drift.wreckId);
  assert.ok(drift.killHits > 0, 'combat owns the kill; the scenario does not emit synthetic deaths');
  assert.ok(Math.abs(drift.coastSeconds - 2) < 1e-9);
  assert.ok(drift.stagedClearanceWU > 80 && drift.clearanceAtDeathWU > 80);
  assert.equal(drift.contactSamples, 0, 'the retention reading is collision-clear at native skins');
  assert.deepEqual(drift.impacts, []);
  assert.ok(drift.speedRetainedPct >= 80, 'the two-second 80% momentum bar is unchanged');
});

test('B10d keeps real populated-bay collisions and never borrows a nearby wreck', LONG, async () => {
  const crowded = await clauseWreckDrift(SEED, { collisionClear: false });
  assert.equal(crowded.unmeasured, false, 'the actual victim-bound wreck reached native admission');
  assert.equal(crowded.inherited, true, 'transfer works before later contacts');
  assert.ok(crowded.impacts.some(p => p.otherType === 'ship' && p.impulse > 0),
    'the populated bay retains genuine native collision aftermath');
  assert.equal(crowded.sameBody, false, 'the real collision destroys this finite wreck');
  assert.equal(crowded.final, null, 'a dead wreck is not replaced with an unrelated nearest hull');
  assert.equal(crowded.speedRetainedPct, null);
  assert.equal(crowded.met, false);

  const silent = await clauseWreckDrift(SEED, { stimulus: false });
  assert.equal(silent.killHits, 0);
  assert.equal(silent.markerId, null);
  assert.equal(silent.wreckId, null, 'ambient wrecks cannot satisfy the no-kill control');
  assert.equal(silent.admission, null);
  assert.equal(silent.met, false);
});

test('world.reaction_trio is deterministic on a fixed seed', LONG, async () => {
  const a = await scenario.run(SEED);
  const b = await scenario.run(SEED);
  assert.equal(
    JSON.stringify(a.metrics),
    JSON.stringify(b.metrics),
    'fixed seeds or it did not happen — the same seed must produce the same number',
  );
});
