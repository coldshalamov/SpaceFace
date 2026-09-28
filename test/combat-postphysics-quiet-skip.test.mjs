import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { actions } from '../src/systems/actions.js';
import {
  getCombatKernel,
  setCombatPrePhysicsQuietLatchForBench,
  setCombatPostPhysicsQuietSkipForBench,
  getCombatPostPhysicsQuietSkipForBench,
} from '../src/combat/kernel.js';

function boot(n = 24) {
  const state = createGameState(1550 + n);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  state.runtime = { profileId: 'production' };
  state.meta = { seed: 1550 + n };
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const ships = [player];
  for (let i = 0; i < n; i++) {
    const e = helpers.spawnEntity({
      type: 'ship',
      pos: { x: 400 + i * 20, z: (i % 5) * 30 },
      vel: { x: 0, z: 0 },
      radius: 8, mass: 10, hull: 80, hullMax: 80, collides: true, team: 0,
      data: { ai: { passive: true } },
    });
    e.physicsSleeping = true;
    ships.push(e);
  }
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    state.entityIndex.__spacefaceEntityIndexV1 = true;
    state.entityIndex.ships = ships;
    state.entityIndex.shipLike = ships;
    state.entityIndex.version = (state.entityIndex.version | 0) + 1;
  }
  const ctx = { state, bus, helpers, registry: null };
  const act = Object.assign({}, actions);
  act.init(ctx);
  const kernel = getCombatKernel(ctx);
  return { state, bus, helpers, player, ships, act, kernel, ctx };
}

function step(act, kernel, state) {
  state.tick++;
  state.simTime += 1 / 60;
  act.update(1 / 60, state);
  kernel.postPhysics();
  return state.combatRuntime;
}

test('postPhysics quiet skip engages when prePhysics latch armed', () => {
  setCombatPrePhysicsQuietLatchForBench(true);
  setCombatPostPhysicsQuietSkipForBench(true);
  assert.equal(getCombatPostPhysicsQuietSkipForBench(), true);
  const { state, act, kernel } = boot();
  const rt = step(act, kernel, state);
  assert.equal(rt.quietLatched, true);
  assert.equal(rt.postPhysicsQuietSkipped, true);
  const rt2 = step(act, kernel, state);
  assert.equal(rt2.quietLatched, true);
  assert.equal(rt2.postPhysicsQuietSkipped, true);
});

test('membership bump wakes prePhysics latch then postPhysics skip re-arms', () => {
  setCombatPrePhysicsQuietLatchForBench(true);
  setCombatPostPhysicsQuietSkipForBench(true);
  const { state, act, kernel } = boot();
  step(act, kernel, state);
  assert.equal(state.combatRuntime.postPhysicsQuietSkipped, true);
  state.entityIndex.version++;
  step(act, kernel, state);
  // Quiet rescan re-arms both.
  assert.equal(state.combatRuntime.quietLatched, true);
  assert.equal(state.combatRuntime.postPhysicsQuietSkipped, true);
});

test('routeDamage clears postPhysics quiet skip', () => {
  setCombatPrePhysicsQuietLatchForBench(true);
  setCombatPostPhysicsQuietSkipForBench(true);
  const { state, act, kernel, helpers, ships } = boot();
  step(act, kernel, state);
  assert.equal(state.combatRuntime.postPhysicsQuietSkipped, true);
  const target = ships[1];
  helpers.routeCombatDamage({
    attackerId: state.playerId,
    targetId: target.id,
    packet: { channels: { kinetic: 1 }, heat: 2 },
  });
  assert.equal(state.combatRuntime.quietLatched, false);
  assert.equal(state.combatRuntime.postPhysicsQuietSkipped, false);
  // postPhysics after wake must walk (not skip)
  state.tick++;
  state.simTime += 1 / 60;
  act.update(1 / 60, state);
  // heat still present → latch not re-armed → skip false
  kernel.postPhysics();
  assert.equal(state.combatRuntime.postPhysicsQuietSkipped, false);
});

test('bench toggle disables postPhysics quiet skip', () => {
  setCombatPrePhysicsQuietLatchForBench(true);
  setCombatPostPhysicsQuietSkipForBench(false);
  const { state, act, kernel } = boot(8);
  step(act, kernel, state);
  assert.equal(state.combatRuntime?.quietLatched, true);
  assert.equal(state.combatRuntime?.postPhysicsQuietSkipped, false);
  setCombatPostPhysicsQuietSkipForBench(true);
});

test('dirtyWakeOk: heat then cool re-arms postPhysics skip', () => {
  setCombatPrePhysicsQuietLatchForBench(true);
  setCombatPostPhysicsQuietSkipForBench(true);
  const { state, act, kernel, helpers, ships } = boot();
  step(act, kernel, state);
  assert.equal(state.combatRuntime.postPhysicsQuietSkipped, true);
  helpers.routeCombatDamage({
    attackerId: state.playerId,
    targetId: ships[1].id,
    packet: { channels: { kinetic: 0.1 }, heat: 0.5 },
  });
  assert.equal(state.combatRuntime.postPhysicsQuietSkipped, false);
  // Drain heat by stepping many quiet ticks
  for (let i = 0; i < 120; i++) step(act, kernel, state);
  assert.equal(state.combatRuntime.quietLatched, true);
  assert.equal(state.combatRuntime.postPhysicsQuietSkipped, true);
});
