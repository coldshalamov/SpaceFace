// Crucible A-list contracts: bank stone, pack pursuit, light cookoff, stream gun,
// arena/champion answers, door unlocks, boss circuit, endless continue.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BANK_STONE_MATERIAL, withBankStone } from '../src/core/surfaceContact.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  SWARM_BOSS_ROTATION,
  swarmDoctrineStamp,
  swarmOpeningPackages,
} from '../src/data/swarmMode.js';
import { FOUNDRY_ARENA_ID, debrisLayoutForArena } from '../src/systems/swarmArena.js';
import { planArenaInstall } from '../src/systems/survivalArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { LIGHT_COOKOFF, lightCookoffEligible, lightCookoffHits } from '../src/combat/lightCookoff.js';
import {
  canContinueSurvivalEndless,
  continueSurvivalEndless,
} from '../src/systems/survivalEndless.js';
import {
  availableOptions,
  fullyUnlockedProfile,
  isModeAvailable,
  isStarterAvailable,
} from '../src/systems/survivalUnlocks.js';
import { SURVIVAL_BOSS_CIRCUIT_LENGTH } from '../src/systems/survivalCircuit.js';
import { normalizeCrucibleRuleset } from '../src/ui/crucibleLaunch.js';

const ARENAS = [
  'helios_core',
  'lagrange_crucible',
  'cinder_sluice',
  'cryo_drift',
  'storm_lattice',
];

test('bank stone is a reflect surface and campaign rock is not stamped', () => {
  const stamped = withBankStone({ typeId: 'asteroid' });
  assert.equal(stamped.surfaceMaterial, BANK_STONE_MATERIAL);
  assert.equal(stamped.surfaceMaterial, 'bank_stone');
  assert.ok(debrisLayoutForArena(FOUNDRY_ARENA_ID).target >= 10);
});

test('swarm mass pursues; an Adventure wasp stays on flyby', () => {
  const wasp = ENEMY_TYPES.find((row) => row.id === 'wasp_swarmer');
  assert.equal(wasp.combatDoctrineId, 'interceptor_flyby');
  assert.equal(swarmDoctrineStamp('wasp_swarmer', { swarm: true }), 'pack_pursuit');
  assert.equal(swarmDoctrineStamp('choir_zealot', { swarm: true }), 'pack_pursuit');
  assert.equal(swarmDoctrineStamp('wasp_swarmer', { swarm: false }), null);
  assert.equal(swarmDoctrineStamp('lancer_sniper', { swarm: true }), null);
  assert.equal(swarmDoctrineStamp('corsair_raider', { swarm: true, champion: true }), 'brawler_commit');
});

test('pack pursuit stays inside the fight and never breaks away', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 4242 });
  const perception = {
    self: {
      id: 2, team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
      activity: { kind: 'attack_run', anchor: { x: 0, z: 0 }, leashRadius: 2200 },
      roe: 'weapons_free',
    },
    contacts: [{
      id: 1, kind: 'ship', hostile: true, alive: true, valid: true,
      visible: true, confidence: 1, pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 },
      threat: 2, mobilityBand: 'high',
    }],
    events: [],
  };
  let last = null;
  for (let tick = 0; tick < 400; tick++) {
    last = runtime.update({ tick, entityId: 2, doctrineId: 'pack_pursuit', perception });
    assert.ok(last, 'doctrine keeps a snapshot');
    assert.ok(last.preferredRange <= 160, `range left the neighborhood: ${last.preferredRange}`);
    assert.notEqual(last.phase, 'extend');
    assert.notEqual(last.phase, 'breakaway');
    assert.notEqual(last.maneuverKind, 'retreat');
  }
  assert.equal(last.phase, 'press');
  assert.equal(last.fireWindow, true);
});

test('a packed light death hurts a neighbor and an isolated death hits nobody', () => {
  const origin = {
    id: 1,
    type: 'ship',
    alive: false,
    mass: 16,
    pos: { x: 0, z: 0 },
    data: { runCohort: 'survival', shipClass: 'fighter' },
  };
  const state = { run: { kind: 'survival' }, playerId: 9 };
  assert.equal(lightCookoffEligible(state, { ...origin, alive: true }), true);
  assert.equal(lightCookoffEligible({ run: { kind: 'adventure' } }, origin), false);
  assert.equal(lightCookoffEligible(state, { ...origin, mass: 80, data: { ...origin.data, shipClass: 'capital' } }), false);
  const packed = lightCookoffHits(origin, [
    { id: 2, type: 'ship', alive: true, pos: { x: 18, z: 0 } },
    { id: 9, type: 'ship', alive: true, pos: { x: 10, z: 0 } },
  ], { playerId: 9 });
  assert.equal(packed.length, 1);
  assert.equal(packed[0].id, 2);
  assert.ok(packed[0].damage > 0);
  assert.ok(packed[0].damage < 40);
  assert.equal(lightCookoffHits(origin, [
    { id: 3, type: 'ship', alive: true, pos: { x: 120, z: 0 } },
  ]).length, 0);
  assert.ok(LIGHT_COOKOFF.damage < 20);
});

test('Ricochet stream is 12-16 rounds per second and the shared autocannon stays at 4', () => {
  const stream = WEAPONS.find((row) => row.id === 'wpn_bank_stream_m');
  const cannon = WEAPONS.find((row) => row.id === 'wpn_autocannon_m');
  assert.ok(stream.rof >= 12 && stream.rof <= 16);
  assert.ok(Math.abs(stream.dps - cannon.dps) < 8);
  assert.equal(cannon.rof, 4);
});

test('five door arenas and four champions each change the room', () => {
  const notes = ARENAS.map((arenaId) => planArenaInstall({
    arenaId, arenaPhase: 'loose_plate', wave: 1, seed: 4242, laneGate: 'front',
  }).note);
  assert.equal(new Set(notes).size, ARENAS.length, notes.join(' | '));
  const rooms = SWARM_BOSS_ROTATION.map((boss) => planArenaInstall({
    arenaId: 'helios_core', arenaPhase: 'boss', bossRoom: boss.room, wave: 10, seed: 4242, laneGate: 'front',
  }).note);
  assert.equal(new Set(rooms).size, SWARM_BOSS_ROTATION.length, rooms.join(' | '));
  const wing = swarmOpeningPackages(20, () => 0.2).filter((pkg) => pkg.champion);
  assert.ok(wing.length >= 1);
  assert.ok(wing.every((pkg) => pkg.gateGroup === wing[0].gateGroup));
  const choir = swarmOpeningPackages(40, () => 0.2).filter((pkg) => pkg.enemyId === 'quiet_ghost');
  assert.ok(choir[0].distance > 200);
});

test('seed 4242 swarm opening names the bank, the pursuit, and a neighbor hit', () => {
  const plan = planWave({ seed: 4242, arenaId: 'helios_core', wave: 1, ruleset: 'swarm' });
  assert.notEqual(plan.ok, false);
  const neighbor = lightCookoffHits(
    { id: 1, pos: { x: 0, z: 0 } },
    [{ id: 2, type: 'ship', alive: true, pos: { x: 16, z: 0 } }],
  )[0];
  const line = {
    seed: 4242,
    bank: withBankStone({}).surfaceMaterial,
    foundryRocks: debrisLayoutForArena('helios_core').target,
    fodder: swarmDoctrineStamp('wasp_swarmer', { swarm: true }),
    orbit: 130,
    neighborDamage: Number(neighbor.damage.toFixed(2)),
    wave: plan.swarm && plan.swarm.wave,
  };
  console.log(`[crucible-a-list] ${JSON.stringify(line)}`);
  assert.equal(line.bank, 'bank_stone');
  assert.equal(line.fodder, 'pack_pursuit');
  assert.ok(line.neighborDamage > 0);
  assert.ok(line.foundryRocks >= 10);
});

test('fresh profile launches the public kits and not a locked one; circuit waits on wave 10', () => {
  assert.equal(isStarterAvailable(null, 'ricochet_runner'), true);
  assert.equal(isStarterAvailable(null, 'energy_baseline'), true);
  assert.equal(isStarterAvailable(null, 'kinetic_baseline'), true);
  assert.equal(isStarterAvailable(null, 'web_weaver'), false);
  assert.equal(isModeAvailable(null, 'boss_circuit'), false);
  const full = fullyUnlockedProfile();
  assert.equal(isStarterAvailable(full, 'web_weaver'), true);
  assert.equal(isModeAvailable(full, 'boss_circuit'), true);
  assert.equal(availableOptions(null).modes.includes('boss_circuit'), false);
  assert.equal(normalizeCrucibleRuleset('boss_circuit'), 'boss_circuit');
  assert.equal(SURVIVAL_BOSS_CIRCUIT_LENGTH, 5);
});

test('Continue flips Gauntlet to endless only from the wave-30 refit', () => {
  const ready = { run: { kind: 'survival', phase: 'refit', ruleset: 'scored', wave: 30 } };
  assert.equal(canContinueSurvivalEndless(ready), true);
  assert.equal(continueSurvivalEndless(ready), true);
  assert.equal(ready.run.ruleset, 'endless');
  assert.equal(canContinueSurvivalEndless({
    run: { kind: 'survival', phase: 'refit', ruleset: 'swarm', wave: 30 },
  }), false);
  assert.equal(canContinueSurvivalEndless({
    run: { kind: 'survival', phase: 'refit', ruleset: 'scored', wave: 20 },
  }), false);
  assert.equal(canContinueSurvivalEndless({
    run: { kind: 'survival', phase: 'active', ruleset: 'scored', wave: 30 },
  }), false);
  assert.equal(continueSurvivalEndless({
    run: { kind: 'survival', phase: 'active', ruleset: 'scored', wave: 30 },
  }), false);
});
