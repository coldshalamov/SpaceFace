import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  DIFFICULTY_PROFILES,
  difficultyDamageScale,
  difficultyEconomyRewardScale,
  difficultyEnemyAimErrorDeg,
  difficultyEncounterDelayScale,
  difficultyEncounterPressure,
  difficultyPresetValues,
  ironmanEnabled,
} from '../src/data/difficulty.js';
import { economy } from '../src/systems/economy.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { oneHandedAutoFaceTurn } from '../src/systems/flightV3.js';
import { resolveOneHandedFire } from '../src/systems/input.js';
import { weapons } from '../src/systems/weapons.js';

function stateFor(difficulty, overrides = {}) {
  return {
    playerId: 1,
    settings: {
      gameplay: { difficulty, ...overrides },
      accessibility: {},
    },
  };
}

test('Story, Pilot, Veteran, and Ironman are independent non-HP difficulty presets', () => {
  assert.deepEqual(Object.values(DIFFICULTY_PROFILES).map((row) => row.label),
    ['Story', 'Pilot', 'Veteran', 'Ironman']);
  assert.deepEqual(difficultyPresetValues('casual'), {
    difficulty: 'casual', encounterPressure: 0.7, enemyAccuracy: 0.65,
    economyEase: 1.3, ironman: false,
  });
  for (const id of Object.keys(DIFFICULTY_PROFILES)) {
    const state = stateFor(id);
    assert.equal(difficultyDamageScale(state, 1, 2), 1, `${id} never inflates player damage`);
    assert.equal(difficultyDamageScale(state, 2, 1), 1, `${id} never changes incoming damage`);
  }
  assert.ok(difficultyEncounterPressure(stateFor('casual'))
    < difficultyEncounterPressure(stateFor('ironman')));
  assert.ok(difficultyEncounterDelayScale(stateFor('casual'))
    > difficultyEncounterDelayScale(stateFor('ironman')));
  assert.ok(difficultyEnemyAimErrorDeg(stateFor('casual'))
    > difficultyEnemyAimErrorDeg(stateFor('ironman')));
  assert.ok(difficultyEconomyRewardScale(stateFor('casual'))
    > difficultyEconomyRewardScale(stateFor('ironman')));
  assert.equal(ironmanEnabled(stateFor('standard', { ironman: true })), true,
    'permadeath is independently toggleable outside the Ironman preset');
});

test('new careers expose the Pilot levers and both one-handed options explicitly', () => {
  const state = createGameState(56);
  assert.deepEqual({
    difficulty: state.settings.gameplay.difficulty,
    encounterPressure: state.settings.gameplay.encounterPressure,
    enemyAccuracy: state.settings.gameplay.enemyAccuracy,
    economyEase: state.settings.gameplay.economyEase,
    ironman: state.settings.gameplay.ironman,
  }, difficultyPresetValues('standard'));
  assert.equal(state.settings.accessibility.oneHandedAutoFace, false);
  assert.equal(state.settings.accessibility.oneHandedFireToggle, false);
});

test('the production director accrues and schedules combat pressure by the selected lever', () => {
  const accrue = (difficulty) => {
    const state = stateFor(difficulty);
    state.meta = { seed: 56 };
    state.player = { bounty: 0 };
    const host = Object.create(encounterDirector);
    host.player = () => ({ pos: { x: 0, z: 0 } });
    host._currentSectorId = () => 'sector_helios_prime';
    host.cargoValue = () => 0;
    const dir = { noise: { mining: 0 }, pressure: { combat: 0, civilian: 0 } };
    host._accrue(dir, state, 1);
    return dir.pressure.combat;
  };
  const story = accrue('casual');
  const pilot = accrue('standard');
  const ironman = accrue('ironman');
  assert.ok(story < pilot && pilot < ironman, { story, pilot, ironman });
});

function npcProjectileDirection(difficulty) {
  const definition = WEAPONS.find((row) => row.id === 'wpn_pulse_laser_s');
  assert.ok(definition);
  const runtime = {
    ...definition, defId: definition.id, slotIndex: 0, facing: 'front', facingAngle: 0,
    gimbalArc: 0, muzzleOffset: [0.8, 0], _cooldown: 0, _heat: 0,
  };
  const shooter = {
    id: 2, type: 'ship', alive: true, team: 1, factionId: 'faction_reach',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, cap: 100,
    data: { weapons: [runtime], combat: {} }, flags: {},
  };
  let projectile = null;
  const state = {
    ...stateFor(difficulty), tick: 0, simTime: 0, entityList: [shooter],
    entities: new Map([[shooter.id, shooter]]), combat: { beams: [] }, player: { targetId: null },
  };
  const host = Object.create(weapons);
  host.state = state;
  host.bus = { emit() {} };
  host.helpers = {
    getEntity(id) { return state.entities.get(id); },
    spawnEntity(spec) { projectile = { id: 10, alive: true, flags: {}, ...spec }; return projectile; },
  };
  host._byId = new Map(WEAPONS.map((row) => [row.id, row]));
  host._rng = () => 1;
  host._serviceProjectileWeapon(shooter, runtime, definition, false, 100, 1 / 60, state, 0, null, null);
  assert.ok(projectile);
  return Math.atan2(projectile.vel.z, projectile.vel.x);
}

test('enemy accuracy changes real projectile heading without changing its physical weapon packet', () => {
  const story = npcProjectileDirection('casual');
  const ironman = npcProjectileDirection('ironman');
  assert.ok(story > ironman, { story, ironman });
  const definition = WEAPONS.find((row) => row.id === 'wpn_pulse_laser_s');
  assert.equal(definition.dmg, 8);
  assert.equal(definition.projSpeed, 320);
});

test('economy ease scales actual reward writes but never refunds', () => {
  const grant = (difficulty, reason) => {
    const state = stateFor(difficulty);
    state.player = { credits: 0 };
    const receipts = [];
    const host = Object.create(economy);
    host.state = state;
    host.bus = { emit(type, payload) { receipts.push({ type, payload }); } };
    host.grantCredits(100, reason);
    return { credits: state.player.credits, receipt: receipts.at(-1)?.payload };
  };
  assert.equal(grant('casual', 'mission:test').credits, 130);
  assert.equal(grant('standard', 'mission:test').credits, 100);
  assert.equal(grant('ironman', 'mission:test').credits, 82);
  assert.equal(grant('casual', 'collateral_refund:test').credits, 100,
    'switching ease cannot multiply restored collateral');
});

test('one-handed fire latch is edge-driven and lifecycle-safe', () => {
  let runtime = resolveOneHandedFire({ enabled: true, physicalHeld: true });
  assert.equal(runtime.fire, true);
  runtime = resolveOneHandedFire({
    enabled: true, physicalHeld: false,
    previousPhysicalHeld: runtime.previousPhysicalHeld, latched: runtime.latched,
  });
  assert.equal(runtime.fire, true, 'release keeps the optional latch firing');
  runtime = resolveOneHandedFire({
    enabled: true, physicalHeld: true,
    previousPhysicalHeld: runtime.previousPhysicalHeld, latched: runtime.latched,
  });
  assert.equal(runtime.fire, false, 'the next press stops the latch');
  assert.deepEqual(resolveOneHandedFire({ enabled: false, physicalHeld: false, latched: true }), {
    fire: false, latched: false, previousPhysicalHeld: false,
  });
});

test('one-handed auto-face yields to manual yaw and only aligns an active travel vector', () => {
  const state = stateFor('standard');
  state.settings.accessibility.oneHandedAutoFace = true;
  const ship = { rot: 0, vel: { x: 0, z: 40 } };
  const assisted = oneHandedAutoFaceTurn(ship, { moveZ: 1, turnIntent: 0 }, state);
  assert.ok(assisted > 0.9, assisted);
  assert.equal(oneHandedAutoFaceTurn(ship, { moveZ: 1, turnIntent: -0.4 }, state), -0.4,
    'manual yaw always wins immediately');
  assert.equal(oneHandedAutoFaceTurn(ship, { moveZ: 0, turnIntent: 0 }, state), 0,
    'coasting without a travel command does not seize facing');
});
