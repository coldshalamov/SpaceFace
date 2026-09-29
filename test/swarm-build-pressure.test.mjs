// SF-072 — build pressure that tests rather than hard-counters.
// Draft picks feed an authoritative buildSummary; the swarm plan bends roster share toward the
// roles that test the dominant family without removing any role, raising quota, or touching
// hull values. The banner names what the room brought.
import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeRunBuild, verbBuildFamily } from '../src/data/runModifiers.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { SWARM_ROSTER, SWARM_RULESET, pickSwarmArchetype, swarmRosterFor } from '../src/data/swarmMode.js';

const ARENA_ID = 'helios_core';

function swarmPlan(wave, buildSummary, seed = 9) {
  return planWave({
    seed,
    arenaId: ARENA_ID,
    wave,
    mode: SWARM_RULESET,
    buildSummary: buildSummary ?? null,
  });
}

function modifier(verb, wave = 5) {
  return { kind: 'weapon', offerId: verb.toLowerCase(), verb, defId: 'mod_x', wave };
}

test('summarizeRunBuild tallies families and picks a dominant', () => {
  const s = summarizeRunBuild([
    modifier('Throw'), modifier('Ram'), modifier('Volume'),
  ]);
  assert.equal(s.dominant, 'collision');
  assert.deepEqual(s.tally, { collision: 2, orbit: 1, chain: 0 });
  assert.equal(s.picks, 3);
});

test('summarizeRunBuild: a tie goes to the most recent pick, not catalog order', () => {
  const a = summarizeRunBuild([modifier('Throw'), modifier('Volume')]);
  assert.equal(a.dominant, 'orbit', 'orbit bought last');
  const b = summarizeRunBuild([modifier('Volume'), modifier('Throw')]);
  assert.equal(b.dominant, 'collision', 'collision bought last');
});

test('summarizeRunBuild: defensive-only and empty builds have no dominant', () => {
  assert.equal(summarizeRunBuild([modifier('Screen'), modifier('Harden')]).dominant, null);
  assert.equal(summarizeRunBuild([]).dominant, null);
  assert.equal(summarizeRunBuild(null).dominant, null);
  assert.equal(summarizeRunBuild([{ kind: 'weapon', verb: 'NotAVerb', defId: 'x', wave: 1 }]).dominant, null);
});

test('verbBuildFamily only names real verbs', () => {
  assert.equal(verbBuildFamily('Throw'), 'collision');
  assert.equal(verbBuildFamily('Screen'), null);
  assert.equal(verbBuildFamily(''), null);
  assert.equal(verbBuildFamily(undefined), null);
});

test('a pressured swarm wave bends roster share toward the testing roles', () => {
  // Wave 8+: anchors (control) and cutters exist in the unlocked roster so the bias has a target.
  const plain = swarmPlan(16, null);
  const pressured = swarmPlan(16, { dominant: 'collision' });
  assert.ok(!plain.error && !pressured.error, 'both plans legal');

  const plainById = new Map(plain.swarm.roster.map((e) => [e.enemyId, e]));
  for (const entry of pressured.swarm.roster) {
    const base = plainById.get(entry.enemyId);
    assert.ok(base, `roster still fields ${entry.enemyId}`);
    const roles = ['anchor', 'control'];
    if (roles.includes(entry.role)) {
      assert.ok(entry.weight > base.weight, `${entry.enemyId} share grew`);
    } else {
      assert.equal(entry.weight, base.weight, `${entry.enemyId} share untouched`);
    }
  }
  assert.equal(pressured.swarm.buildPressure, 'collision');
  assert.ok(pressured.swarm.pressureLine.length > 0);
});

test('build pressure never removes a role and never inflates quota or concurrency', () => {
  for (const dominant of ['collision', 'orbit', 'chain']) {
    const plain = swarmPlan(24, null);
    const pressured = swarmPlan(24, { dominant });
    assert.equal(pressured.swarm.roster.length, plain.swarm.roster.length, `${dominant} roster size kept`);
    assert.equal(pressured.swarm.killTarget, plain.swarm.killTarget);
    assert.equal(pressured.swarm.concurrent, plain.swarm.concurrent);
    assert.equal(pressured.swarm.level, plain.swarm.level);
    // Every static roster seat is still represented — emphasis, never an omission.
    for (const row of swarmRosterFor(24)) {
      assert.ok(
        pressured.swarm.roster.some((e) => e.enemyId === row.enemyId),
        `${row.enemyId} still spawnable`,
      );
    }
  }
});

test('an early wave without the testing roles simply does not bend', () => {
  // Wave 1: roster is wasp-only; no anchor/control/reach/support exists to lean on.
  const plain = swarmPlan(1, null);
  const pressured = swarmPlan(1, { dominant: 'collision' });
  assert.deepEqual(pressured.swarm.roster, plain.swarm.roster);
  assert.equal(pressured.swarm.buildPressure, undefined);
});

test('heavies_only mutator overrides pressure rather than stacking it', () => {
  const plan = planWave({
    seed: 9, arenaId: ARENA_ID, wave: 20, mode: SWARM_RULESET,
    mutators: ['heavies_only'], buildSummary: { dominant: 'chain' },
  });
  assert.ok(!plan.error);
  assert.equal(plan.swarm.buildPressure, undefined);
  assert.equal(plan.swarm.pressureLine, undefined);
});

test('heavies_only stream fields heavies from wave 1, unbent by build pressure', () => {
  // The mutator roster is plan-authoritative: it declares its own unlock timing, so the
  // reinforcement gate must not collapse it back to fodder on early waves.
  const early = planWave({
    seed: 4, arenaId: ARENA_ID, wave: 3, mode: SWARM_RULESET,
    mutators: ['heavies_only'], buildSummary: { dominant: 'orbit' },
  });
  assert.ok(!early.error);
  const HEAVY_IDS = new Set(['bruiser_brawler', 'corsair_raider', 'field_anchor_controller']);
  assert.ok(early.swarm.roster.length >= 3);
  for (const entry of early.swarm.roster) assert.ok(HEAVY_IDS.has(entry.enemyId));
  for (let i = 0; i < 200; i++) {
    const pick = pickSwarmArchetype(3, i / 200, early.swarm.roster);
    assert.ok(HEAVY_IDS.has(pick.enemyId), `wave-3 heavies_only stream picked ${pick.enemyId}`);
  }
  // Pressure must not leak into the opening composition either: a pressured heavies wave
  // fields exactly what an unpressured one does.
  const pressed = planWave({
    seed: 4, arenaId: ARENA_ID, wave: 3, mode: SWARM_RULESET,
    mutators: ['heavies_only'], buildSummary: null,
  });
  assert.deepEqual(early.packages, pressed.packages);
});

test('a debut wave under heavies_only stages the arrival as a heavy', () => {
  // Wave 2 is the Reaver's debut; under heavies_only the lone staged arrival still happens —
  // own bearing, own beat — but the mutator owns the body.
  const plan = planWave({
    seed: 7, arenaId: ARENA_ID, wave: 2, mode: SWARM_RULESET,
    mutators: ['heavies_only'],
  });
  assert.ok(!plan.error);
  const debut = plan.packages.find((pkg) => pkg.debut === true);
  assert.ok(debut, 'debut package missing under heavies_only');
  assert.equal(debut.enemyId, 'bruiser_brawler');
  assert.equal(debut.role, 'anchor');
  assert.equal(debut.count, 1);
});

test('pressure changes the bodies a wave fields, deterministically', () => {
  // The biased roster feeds the opening packages too: same seed, different composition.
  // Wave 23 is past every unlock and is neither a mass-gap round (its opening is deliberately
  // fodder-first regardless of build) nor a debut — a plain wave where pressure owns the mix.
  const dominantHits = (plan) => plan.packages.filter(
    (pkg) => !pkg.champion && ['anchor', 'control', 'reach', 'support', 'elite'].includes(pkg.role),
  ).length;
  let differed = false;
  for (let seed = 1; seed <= 20 && !differed; seed++) {
    const a = swarmPlan(23, null, seed);
    const b = swarmPlan(23, { dominant: 'collision' }, seed);
    if (dominantHits(b) !== dominantHits(a)) differed = true;
    // Always deterministic: same input → same plan.
    assert.deepEqual(swarmPlan(23, { dominant: 'collision' }, seed).packages, b.packages);
  }
  assert.ok(differed, 'at least one seed fields a different opening mix under pressure');
});

test('unknown dominant is a no-op; every plan stays valid', () => {
  const a = swarmPlan(10, null);
  const b = swarmPlan(10, { dominant: 'rail' });
  assert.deepEqual(b.swarm.roster, a.swarm.roster);
  assert.ok(!b.error);
});
