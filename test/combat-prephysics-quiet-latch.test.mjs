import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { actions } from '../src/systems/actions.js';
import {
  getCombatKernel,
  setCombatPrePhysicsQuietLatchForBench,
  getCombatPrePhysicsQuietLatchForBench,
} from '../src/combat/kernel.js';

function boot(n = 24) {
  const state = createGameState(1540 + n);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  state.runtime = { profileId: 'production' };
  state.meta = { seed: 1540 + n };
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

function step(act, state) {
  state.tick++;
  state.simTime += 1 / 60;
  act.update(1 / 60, state);
  return state.combatRuntime;
}

test('quiet latch engages on idle combat roster', () => {
  setCombatPrePhysicsQuietLatchForBench(true);
  assert.equal(getCombatPrePhysicsQuietLatchForBench(), true);
  const { state, act } = boot();
  const rt = step(act, state);
  assert.equal(rt.quietLatched, true);
  const rt2 = step(act, state);
  assert.equal(rt2.quietLatched, true);
});

test('membership bump wakes quiet latch then re-arms', () => {
  setCombatPrePhysicsQuietLatchForBench(true);
  const { state, act } = boot();
  step(act, state);
  assert.equal(state.combatRuntime.quietLatched, true);
  state.entityIndex.version++;
  step(act, state);
  // Still quiet after rescan — re-arms.
  assert.equal(state.combatRuntime.quietLatched, true);
});

test('combat action request wakes quiet latch', () => {
  setCombatPrePhysicsQuietLatchForBench(true);
  const { state, act, helpers, player } = boot();
  step(act, state);
  assert.equal(state.combatRuntime.quietLatched, true);
  // Unknown action still goes through requestAction wake wrapper.
  helpers.requestCombatAction({
    actorId: player.id,
    actionId: '__missing_action_for_wake__',
  });
  assert.equal(state.combatRuntime.quietLatched, false);
  step(act, state);
  // Idle again — re-arms after quiet census.
  assert.equal(state.combatRuntime.quietLatched, true);
});

test('routeDamage wakes quiet latch', () => {
  setCombatPrePhysicsQuietLatchForBench(true);
  const { state, act, helpers, ships } = boot();
  step(act, state);
  assert.equal(state.combatRuntime.quietLatched, true);
  const target = ships[1];
  helpers.routeCombatDamage({
    attackerId: state.playerId,
    targetId: target.id,
    packet: { channels: { kinetic: 1 }, heat: 2 },
  });
  assert.equal(state.combatRuntime.quietLatched, false);
});

test('rescan catch-all wakes on an un-woken mutation', () => {
  setCombatPrePhysicsQuietLatchForBench(true);
  const { state, act, ships } = boot();
  step(act, state);
  assert.equal(state.combatRuntime.quietLatched, true);
  // Direct heat write — bypasses every wake wrapper (routeDamage/statuses).
  const rt = state.combat.entities[ships[1].id];
  assert.ok(rt, 'combatant runtime exists after first walk');
  rt.heat = 9;
  step(act, state);
  // Still inside the 0.5 s window: latch holds, heat untouched.
  assert.equal(state.combatRuntime.quietLatched, true);
  assert.equal(rt.heat, 9);
  // Past rescanAt the catch-all census runs the full walk → busy → wake + cool.
  state.simTime += 0.6;
  step(act, state);
  assert.equal(state.combatRuntime.quietLatched, false);
  assert.ok(rt.heat < 9, `rescan walk cooled heat, got ${rt.heat}`);
});

test('bench toggle disables latch', () => {
  setCombatPrePhysicsQuietLatchForBench(false);
  const { state, act } = boot(8);
  step(act, state);
  assert.equal(state.combatRuntime?.quietLatched, false);
  setCombatPrePhysicsQuietLatchForBench(true);
});
