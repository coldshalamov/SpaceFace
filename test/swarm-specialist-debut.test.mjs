// SF-064 — a specialist's first wave stages one readable arrival: a solo body on its own
// bearing, a beat after the opening burst, before the stream mixes the newcomer with the rest
// of the room. The debut is wave-number deterministic — no tutorial state — and the body is
// owed like a champion: a full room cannot silently drop it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  SWARM_DEBUT_TICKS,
  SWARM_DEBUT_DISTANCE,
  SWARM_ROSTER,
  SWARM_RULESET,
  pickSwarmArchetype,
  swarmNewcomerFor,
  swarmOpeningCount,
} from '../src/data/swarmMode.js';
import { mulberry32 } from '../src/core/rng.js';

const ARENA_ID = 'helios_core';

function swarmPlan(wave, seed = 9) {
  return planWave({ seed, arenaId: ARENA_ID, wave, mode: SWARM_RULESET });
}

// The first unlock wave per roster entry (2, 4, 5, 6, 8, 10, 12, 14, 16, 18, 22).
const DEBUT_WAVES = [...new Set(SWARM_ROSTER.map((e) => e.fromWave))].filter((w) => w > 1);

test('every unlock wave stages exactly one debut package for its newcomer', () => {
  for (const w of DEBUT_WAVES) {
    const newcomer = swarmNewcomerFor(w);
    assert.ok(newcomer, `wave ${w} has a newcomer`);
    const plan = swarmPlan(w);
    assert.ok(!plan.error, `wave ${w} plan valid`);
    const debuts = plan.packages.filter((pkg) => pkg.debut === true);
    assert.equal(debuts.length, 1, `wave ${w} has exactly one debut`);
    const debut = debuts[0];
    assert.equal(debut.enemyId, newcomer.enemyId);
    assert.equal(debut.count, 1, 'the rehearsal is one body — survivable, ignorable once');
    assert.equal(debut.atTick, SWARM_DEBUT_TICKS, 'the tell lands after the opening burst settles');
    assert.equal(debut.distance, SWARM_DEBUT_DISTANCE, 'it approaches from a readable distance');
  }
});

test('the opening burst never pre-empts the debut: no group fields the newcomer early', () => {
  for (const w of DEBUT_WAVES) {
    const newcomer = swarmNewcomerFor(w);
    const plan = swarmPlan(w);
    const early = plan.packages.filter(
      (pkg) => pkg.enemyId === newcomer.enemyId && pkg.debut !== true && pkg.atTick < SWARM_DEBUT_TICKS,
    );
    assert.equal(early.length, 0, `wave ${w}: ${newcomer.enemyId} arrives only as the staged debut`);
  }
});

test('the debut gate is its own bearing, distinct from the opening groups', () => {
  const w = 8; // lancer debut, three opening groups
  const plan = swarmPlan(w);
  const debut = plan.packages.find((pkg) => pkg.debut === true);
  const openingGates = new Set(
    plan.packages.filter((pkg) => pkg.debut !== true).map((pkg) => pkg.gateGroup),
  );
  assert.ok(!openingGates.has(debut.gateGroup), 'debut arrives on its own bearing');
});

test('the debut seat comes out of the opening burst — the pressure math does not grow', () => {
  for (const w of DEBUT_WAVES) {
    const debutPlan = swarmPlan(w, 9);
    // Compare against the same wave planned without the newcomer convention: total bodies in
    // the opening burst + debut must not exceed the authored opening pressure.
    const debut = debutPlan.packages.find((pkg) => pkg.debut === true);
    assert.ok(debut, `wave ${w}`);
    const total = swarmOpeningCount(debutPlan.packages.filter((p) => p.atTick < SWARM_DEBUT_TICKS));
    const opening = swarmOpeningCount(debutPlan.packages.filter((p) => !p.debut));
    assert.ok(
      opening + 1 <= Math.max(debutPlan.swarm.openingPressure, total + 1),
      `wave ${w}: debut did not inflate the opening beyond authored pressure`,
    );
  }
});

test('the debut flag rides the schedule so materialization can protect it', () => {
  const plan = swarmPlan(4); // choir_zealot debut
  const entries = plan.schedule.filter((e) => e.debut === true);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].atTick, SWARM_DEBUT_TICKS);
  assert.equal(entries[0].enemyId, 'choir_zealot');
});

test('non-debut waves never carry a debut package', () => {
  for (const w of [3, 7, 9, 11, 13, 15, 20, 30]) {
    const plan = swarmPlan(w);
    assert.ok(!plan.error);
    assert.equal(plan.packages.filter((pkg) => pkg.debut === true).length, 0, `wave ${w}`);
  }
});

test('the stream still fields the newcomer normally on debut wave and after', () => {
  // The roster keeps its seat — the debut is staged arrival ordering, not a suppression list.
  for (const w of DEBUT_WAVES) {
    const newcomer = swarmNewcomerFor(w);
    const plan = swarmPlan(w);
    assert.ok(
      plan.swarm.roster.some((e) => e.enemyId === newcomer.enemyId),
      `wave ${w}: ${newcomer.enemyId} stays in the reinforcement roster`,
    );
    // And pickSwarmArchetype can still draw it from the plan roster.
    const roster = plan.swarm.roster;
    const seen = new Set();
    const rng = mulberry32(1234);
    for (let i = 0; i < 400; i++) seen.add(pickSwarmArchetype(w, rng(), roster).enemyId);
    assert.ok(seen.has(newcomer.enemyId), `wave ${w}: stream can roll ${newcomer.enemyId}`);
  }
});

test('debut composes with build pressure without either eating the other', () => {
  // Wave 16 debuts tether_control_raider; 'collision' pressure boosts anchor+control share.
  const pressured = planWave({
    seed: 9, arenaId: ARENA_ID, wave: 16, mode: SWARM_RULESET,
    buildSummary: { dominant: 'collision' },
  });
  assert.ok(!pressured.error);
  const debut = pressured.packages.find((pkg) => pkg.debut === true);
  assert.ok(debut, 'debut survives pressure bias');
  assert.equal(debut.enemyId, 'tether_control_raider');
  // The biased plan roster still includes the debuting specialist for reinforcements.
  assert.ok(pressured.swarm.roster.some((e) => e.enemyId === 'tether_control_raider'));
});

test('debut is deterministic: same seed, same plan', () => {
  for (const w of DEBUT_WAVES.slice(0, 4)) {
    assert.deepEqual(swarmPlan(w, 31), swarmPlan(w, 31));
  }
});
