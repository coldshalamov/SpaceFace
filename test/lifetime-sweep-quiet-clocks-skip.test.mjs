import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import {
  core,
  setLifetimeSweepQuietClocksSkipForBench,
  getLifetimeSweepQuietClocksSkipForBench,
} from '../src/core/coreSystem.js';
import { beginDirtyTick, markDirty, DIRTY } from '../src/core/dirtyJournal.js';

function bootQuiet() {
  const state = createGameState(901);
  state.mode = 'flight';
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  core._publishPresentation = () => {};
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 1,
  });
  state.playerId = player.id;
  player.ttl = Infinity;
  for (let i = 0; i < 8; i++) {
    const e = helpers.spawnEntity({
      type: 'ship', pos: { x: 100 + i * 10, z: 40 }, vel: { x: 0, z: 0 },
      radius: 8, mass: 10, hull: 80, hullMax: 80, collides: true, team: 2,
    });
    e.physicsSleeping = true;
    e.ttl = Infinity;
  }
  if (state.entityIndex) state.entityIndex.ready = true;
  return { state, helpers, player };
}

test('quiet clocks skip defaults ON for production bench flag', () => {
  assert.equal(getLifetimeSweepQuietClocksSkipForBench(), true);
});

test('quiet Ceres Infinity-ttl movers skip clocks walk without dropping corpses', () => {
  setLifetimeSweepQuietClocksSkipForBench(true);
  const { state } = bootQuiet();
  for (let i = 0; i < 12; i++) {
    beginDirtyTick(state, state.tick++);
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
  }
  const alive = [...state.entities.values()].filter((e) => e.alive);
  assert.ok(alive.length >= 9, `expected quiet fleet still alive, got ${alive.length}`);
});

test('projectile TTL still expires when short-lived lane is non-empty (dirty-wake)', () => {
  setLifetimeSweepQuietClocksSkipForBench(true);
  const { state, helpers } = bootQuiet();
  for (let i = 0; i < 6; i++) {
    beginDirtyTick(state, state.tick++);
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
  }
  const proj = helpers.spawnEntity({
    type: 'projectile', pos: { x: 2, z: 0 }, vel: { x: 80, z: 0 },
    radius: 1, mass: 1, hull: 1, hullMax: 1, collides: true, team: 1,
  });
  proj.ttl = 0.2;
  for (let i = 0; i < 30; i++) {
    beginDirtyTick(state, state.tick++);
    state.simTime += 1 / 60;
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
  }
  const still = state.entities.get(proj.id);
  assert.ok(!still || still.alive === false, 'projectile must expire via clocks path');
});

test('shipLike despawnAt fail-open restores clocks path', () => {
  setLifetimeSweepQuietClocksSkipForBench(true);
  const { state } = bootQuiet();
  for (let i = 0; i < 4; i++) {
    beginDirtyTick(state, state.tick++);
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
  }
  const npc = [...state.entities.values()].find((e) => e.type === 'ship' && e.id !== state.playerId);
  assert.ok(npc);
  npc.data = npc.data || {};
  npc.data.despawnAt = state.simTime + 0.05;
  for (let i = 0; i < 20; i++) {
    beginDirtyTick(state, state.tick++);
    state.simTime += 1 / 60;
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
  }
  const still = state.entities.get(npc.id);
  assert.ok(!still || still.alive === false, 'despawnAt ship must expire');
});

test('bench flag OFF restores always-walk clocks (projectile TTL still works)', () => {
  setLifetimeSweepQuietClocksSkipForBench(false);
  const { state, helpers } = bootQuiet();
  const proj = helpers.spawnEntity({
    type: 'projectile', pos: { x: 3, z: 0 }, vel: { x: 50, z: 0 },
    radius: 1, mass: 1, hull: 1, hullMax: 1, collides: true, team: 1,
  });
  proj.ttl = 0.15;
  for (let i = 0; i < 30; i++) {
    beginDirtyTick(state, state.tick++);
    state.simTime += 1 / 60;
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
  }
  const still = state.entities.get(proj.id);
  assert.ok(!still || still.alive === false);
  setLifetimeSweepQuietClocksSkipForBench(true);
});
