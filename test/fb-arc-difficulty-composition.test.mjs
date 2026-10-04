// FB-026 — the scored arc's curve is composition, not hit points.
//
// The gap this pins: levelForWave used to climb to 10 by wave 30, so scaleCombatant silently
// multiplied hull/armor/shield/damage to 2.08x — an HP inflation knob §33 forbids — while
// difficultyDamageScale ALSO applied the adventure profile (0.50 in / 1.15 out) inside runs
// even though defeatMercyScale already exempted survival. Now: level is flat, the curve lives
// in composeArcWave package counts / bearings / batch gaps, and no damage scale reaches a run.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  DIFFICULTY_PROFILES,
  difficultyDamageScale,
  difficultyProfile,
} from '../src/data/difficulty.js';
import { actIndexForWave, composeArcWave, difficultyForWave, SPAWN_BUDGET_DEFAULT_MAX } from '../src/data/survivalActs.js';
import { peakConcurrentDemand } from '../src/data/survivalWaves.js';
import { makeEnemySpawnSpec, scaleCombatant } from '../src/systems/combat.js';
import { levelForWave } from '../src/systems/waveMaterialization.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const SEED = 4242;
const ARENA = 'helios_core';

function planFor(wave) {
  const plan = planWave({
    seed: SEED,
    arenaId: ARENA,
    wave,
    act: actIndexForWave(wave),
    difficulty: difficultyForWave(wave),
    mutators: [],
    buildSummary: null,
  });
  assert.notEqual(plan.ok, false, `wave ${wave} must plan: ${JSON.stringify(plan.issues || [])}`);
  return plan;
}

function bodyTotal(plan) {
  return plan.packages.reduce((sum, pkg) => sum + pkg.count, 0);
}

test('the level ladder is flat — no wave ever inflates hull through scaleCombatant', () => {
  for (const wave of [1, 2, 3, 10, 11, 20, 21, 30, 31, 60, 300, 999]) {
    assert.equal(levelForWave(wave), 1, `wave ${wave} stays at level 1`);
  }
  // The multiplier itself is reachable only through level — prove the knob is gone at the
  // deepest authored wave rather than trusting the call site.
  const late = scaleCombatant({ hull: 100, armor: 10, shield: 5 }, levelForWave(30));
  assert.equal(late.hull, 100);
  assert.equal(late.armor, 10);
  assert.equal(late.shield, 5);
  assert.equal(late.dmgMult, 1, 'damage is not a difficulty lever either');
});

test('wave-30 materialization fields wave-1 hull for the same archetype', () => {
  const pos = { x: 100, z: 50 };
  const early = makeEnemySpawnSpec('wasp_swarmer', levelForWave(1), pos);
  const late = makeEnemySpawnSpec('wasp_swarmer', levelForWave(30), pos);
  assert.equal(late.hull, early.hull, 'hull does not inflate down the arc');
  assert.equal(late.armorMax, early.armorMax);
  assert.equal(late.shieldMax, early.shieldMax);
  assert.equal(late.data.level, early.data.level ?? 1);
});

test('the curve moved into cadence and bearings — same bodies, faster and wider', () => {
  // Waves 1 / 11 / 21 are the same template slot re-asked by acts I / II / III.
  const w1 = planFor(1);
  const w11 = planFor(11);
  const w21 = planFor(21);
  assert.equal(bodyTotal(w11), bodyTotal(w1), 'act II fields the template bodies');
  assert.equal(bodyTotal(w21), bodyTotal(w1), 'act III fields the template bodies');
  const gatesOf = (plan) => new Set(plan.packages.map((pkg) => pkg.gateGroup)).size;
  assert.ok(gatesOf(w11) >= gatesOf(w1), 'act II never narrows the bearings');
  assert.ok(gatesOf(w21) >= gatesOf(w1), 'act III never narrows the bearings');
  assert.ok(peakConcurrentDemand(w21.packages) <= SPAWN_BUDGET_DEFAULT_MAX,
    'composition stays inside the shared 24-body peak budget');
});

test('later acts re-ask the wave through different bearings', () => {
  // The seeded door pick already varies per wave, so compare the pure composer on ONE input:
  // the same package re-asked by act II vs act III must rotate to different doors.
  const input = [{
    atTick: 0, gateGroup: 'front', role: 'mass', enemyId: 'wasp_swarmer',
    count: 6, batchSize: 6, batchGapTicks: 0,
  }];
  const base = { packages: input, blockingRoles: ['mass'], arenaPhase: 'idle', objective: { kind: 'resolve_hostiles' } };
  const act2 = composeArcWave({ ...base, wave: 11 });
  const act3 = composeArcWave({ ...base, wave: 21 });
  assert.notEqual(act2.packages[0].gateGroup, 'front', 'act II rotates the door');
  assert.notEqual(act3.packages[0].gateGroup, 'front', 'act III rotates the door');
  assert.notEqual(act2.packages[0].gateGroup, act3.packages[0].gateGroup, 'each act reads a different bearing');
});

test('batch cadence tightens with the act rather than hull', () => {
  // Template wave 3 fields a trickled mass pack (batchGapTicks 45). The same slot at act III
  // must arrive faster — the pressure is in the schedule, never in the bodies.
  const gapOf = (plan) => plan.packages
    .filter((pkg) => pkg.batchGapTicks > 0)
    .map((pkg) => pkg.batchGapTicks);
  const early = gapOf(planFor(3));
  const late = gapOf(planFor(23));
  assert.ok(early.length > 0 && late.length > 0, 'both waves carry trickled packages');
  assert.ok(
    Math.min(...late) < Math.min(...early),
    `act III batches arrive tighter (${Math.min(...late)} < ${Math.min(...early)})`,
  );
});

test('an authored elite keeps its authored count — the cadence moves around it', () => {
  // Wave 30 is the finale: the boss crown swaps the hull, but the elite package count
  // stays authored and only the chaff around it grows.
  const eliteCount = (plan) => plan.packages
    .filter((pkg) => pkg.role === 'elite')
    .reduce((sum, pkg) => sum + pkg.count, 0);
  assert.equal(eliteCount(planFor(10)), 1);
  assert.equal(eliteCount(planFor(30)), 1, 'the finale still fields ONE elite');
  assert.equal(bodyTotal(planFor(30)), bodyTotal(planFor(10)),
    'and the room around it is the same bodies, asked faster and wider');
  const eliteInput = [{
    atTick: 0, gateGroup: 'front', role: 'elite', enemyId: 'mirrorjaw_foreman',
    count: 1, batchSize: 1, batchGapTicks: 90,
  }];
  const eliteBase = { packages: eliteInput, blockingRoles: ['elite'], arenaPhase: 'idle', objective: { kind: 'resolve_hostiles' } };
  assert.equal(composeArcWave({ ...eliteBase, wave: 21 }).packages[0].batchGapTicks, 90,
    'act pressure never tightens the elite cadence');
});

test('a live survival run is exempt from the damage profile in both directions', () => {
  const state = createGameState(SEED);
  state.run = createRunState({ kind: 'survival', seed: SEED });
  state.run.phase = 'active';
  state.playerId = 'player-1';
  assert.equal(difficultyProfile(state).id, 'standard', 'the soft profile is the baseline this pins against');

  assert.equal(difficultyDamageScale(state, 'npc', 'player-1'), 1,
    'the profile cannot soften incoming damage inside a run');
  assert.equal(difficultyDamageScale(state, 'player-1', 'npc'), 1,
    'nor boost outgoing damage inside a run');

  // The exemption is scoped to the run: outside one, the profile still applies exactly.
  state.run.phase = 'inactive';
  assert.equal(difficultyDamageScale(state, 'npc', 'player-1'),
    DIFFICULTY_PROFILES.standard.playerIncomingDamage);
  assert.equal(difficultyDamageScale(state, 'player-1', 'npc'),
    DIFFICULTY_PROFILES.standard.playerOutgoingDamage);
});
