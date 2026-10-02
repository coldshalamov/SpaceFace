// SF-068 — a boss round is ammunition, not escorts as chores.
//
// The champion is the work, so the round around it is composed, not padded: the opening chaff
// draws only from the light pursuer roles the room's berm, mines and pull can be fed, the
// stream keeps bending light so the reduced swarm stays ammunition, and the quota/concurrency
// shrink because the boss itself is the fight. Boss progress is still honest damage — the
// champion is a real cohort body that must be defeated, never a minion-count gate.

import test from 'node:test';
import assert from 'node:assert/strict';

import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  SWARM_BOSS_ROTATION,
  SWARM_FODDER_ROLES,
  SWARM_RULESET,
  isSwarmBossWave,
  swarmConcurrent,
  swarmQuota,
  swarmRosterFor,
} from '../src/data/swarmMode.js';

const SEED = 4242;
const ARENA = 'helios_core';

function swarmPlan(wave, opts = {}) {
  return planWave({ seed: SEED, arenaId: ARENA, wave, mode: SWARM_RULESET, ...opts });
}

test('a boss wave fields its champion at tick 0 and owes it as a real kill', () => {
  const plan = swarmPlan(10);
  assert.ok(!plan.error);
  assert.equal(plan.arenaPhase, 'boss');
  assert.equal(plan.objective.kind, 'boss');
  assert.equal(plan.swarm.boss, true);
  assert.equal(plan.swarm.requireBoss, true,
    'the champion is a real cohort body — never a vulnerable-only-after-minions flag');
  const champions = plan.packages.filter((pkg) => pkg.champion === true);
  assert.equal(champions.length, 1);
  assert.equal(champions[0].enemyId, 'dreadnought_boss');
  assert.equal(champions[0].atTick, 0, 'the capital leads the wave, not trails it');
  // The flag rides the schedule so materialization owes it like a debut.
  assert.ok(plan.schedule.some((e) => e.champion === true));
});

test('the champion rotation walks the roster clock — four shapes, no silhouette debuted as boss', () => {
  const expected = ['iron_maw', 'corsair_wing', 'the_anvil', 'quiet_choir'];
  for (const [i, wave] of [10, 20, 30, 40].entries()) {
    const plan = swarmPlan(wave);
    assert.equal(plan.swarm.bossId, expected[i], `wave ${wave}`);
    assert.equal(plan.swarm.bossRoom, SWARM_BOSS_ROTATION[i].room);
    const championIds = plan.packages.filter((p) => p.champion === true).map((p) => p.enemyId);
    const rosterIds = new Set(swarmRosterFor(wave).map((e) => e.enemyId));
    for (const id of championIds) {
      assert.ok(
        rosterIds.has(id) || id === 'dreadnought_boss',
        `wave ${wave} champion ${id} must be an archetype the player already met`,
      );
    }
  }
  const plan = swarmPlan(50);
  assert.equal(plan.swarm.bossId, 'iron_maw', 'the rotation loops after the fourth');
});

test('the opening chaff is pure ammunition — light pursuer roles only', () => {
  for (const wave of [10, 20, 30]) {
    const plan = swarmPlan(wave);
    const chaff = plan.packages.filter(
      (pkg) => !pkg.champion && !pkg.debut && !pkg.wall,
    );
    assert.ok(chaff.length > 0, `wave ${wave} still fields a reduced swarm`);
    for (const pkg of chaff) {
      assert.ok(
        SWARM_FODDER_ROLES.includes(pkg.role),
        `wave ${wave} opening ${pkg.enemyId}/${pkg.role} is escort work, not ammunition`,
      );
      assert.ok(pkg.atTick <= 48, 'the ammunition arrives with the champion, not after');
    }
  }
});

test('the stream keeps feeding light bodies on a boss wave — fodder share bends up', () => {
  const plan = swarmPlan(10);
  const stream = plan.swarm.roster;
  const legal = swarmRosterFor(10);
  assert.equal(stream.length, legal.length, 'every unlocked role keeps its seat');
  for (const entry of stream) {
    const base = legal.find((e) => e.enemyId === entry.enemyId);
    if (SWARM_FODDER_ROLES.includes(entry.role)) {
      assert.ok(entry.weight > base.weight, `${entry.enemyId} fodder share should bend up`);
    } else {
      assert.equal(entry.weight, base.weight, `${entry.enemyId} share should be untouched`);
    }
  }
});

test('the swarm is reduced, not inflated — quota and concurrency shrink, hull untouched', () => {
  const plan = swarmPlan(10);
  assert.equal(plan.swarm.killTarget, swarmQuota(10));
  assert.equal(plan.swarm.concurrent, swarmConcurrent(10));
  assert.ok(plan.swarm.concurrent <= 18, 'a boss room holds fewer bodies so the capital is legible');
  assert.ok(plan.swarm.killTarget > 0, 'the swarm is reduced, not removed — chaff still flows');
  assert.equal(plan.swarm.level, 1, 'no stat inflation — the shape changed, not the numbers');
});

test('a non-boss wave keeps the plain roster, and heavies_only owns its room outright', () => {
  const plain = swarmPlan(9);
  const legal = swarmRosterFor(9);
  assert.equal(plain.swarm.massGap, undefined);
  assert.ok(!plain.swarm.boss);
  for (const entry of plain.swarm.roster) {
    const base = legal.find((e) => e.enemyId === entry.enemyId);
    assert.equal(entry.weight, base.weight, `${entry.enemyId} unbent on an ordinary wave`);
  }
  assert.equal(plain.swarm.roster.some(
    (e) => !SWARM_FODDER_ROLES.includes(e.role),
  ), true, 'a plain wave keeps its heavies in the stream');

  const heavy = swarmPlan(10, { mutators: ['heavies_only'] });
  assert.ok(!heavy.error);
  for (const entry of heavy.swarm.roster) {
    assert.ok(!SWARM_FODDER_ROLES.includes(entry.role),
      `heavies_only must own the room: ${entry.enemyId} is light`);
  }
  for (const pkg of heavy.packages) {
    assert.ok(!SWARM_FODDER_ROLES.includes(pkg.role) || pkg.champion === true,
      `heavies_only rewrote ${pkg.enemyId} like every other package`);
  }
});

test('build pressure outranks the ammunition bend — the run read wins', () => {
  const plan = swarmPlan(20, { buildSummary: { dominant: 'collision' } });
  assert.ok(!plan.error);
  assert.equal(plan.swarm.buildPressure, 'collision');
  const legal = swarmRosterFor(20);
  const wasp = plan.swarm.roster.find((e) => e.enemyId === 'wasp_swarmer');
  const baseWasp = legal.find((e) => e.enemyId === 'wasp_swarmer');
  assert.equal(wasp.weight, baseWasp.weight,
    'under build pressure the fodder bend does not stack on top');
  // But the build read still lands: the roles that test a collision build carry the pressure scale.
  const anchor = plan.swarm.roster.find((e) => e.role === 'anchor');
  const baseAnchor = legal.find((e) => e.role === 'anchor');
  assert.ok(anchor.weight > baseAnchor.weight, 'the testing roles still carry their bend');
});

test('boss plans are deterministic — same seed, same composition', () => {
  for (const wave of [10, 20, 30, 40]) {
    const a = swarmPlan(wave);
    const b = swarmPlan(wave);
    assert.deepEqual(a.packages, b.packages, `wave ${wave} packages drifted`);
    assert.deepEqual(a.swarm.roster, b.swarm.roster);
  }
});
