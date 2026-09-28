import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  flybyFocus,
  setFlybyFocusEmptyQuietLatchForBench,
  getFlybyFocusEmptyQuietLatchForBench,
} from '../src/systems/flybyFocus.js';

function boot(opts = {}) {
  const state = createGameState(1521);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 120, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
  });
  state.playerId = player.id;
  const ships = [player];
  for (let i = 0; i < 48; i++) {
    ships.push(helpers.spawnEntity({
      type: 'ship',
      pos: { x: 800 + i * 40, z: i * 20 },
      vel: { x: 0, z: 0 },
      radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 0,
      data: { ai: { passive: true } },
    }));
  }
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    state.entityIndex.__spacefaceEntityIndexV1 = true;
    state.entityIndex.ships = ships;
    state.entityIndex.shipLike = ships;
    state.entityIndex.version = 1;
  }
  const system = Object.assign({}, flybyFocus);
  system.init({ state, bus, helpers, registry: null });
  return { state, helpers, ships, bus, player, system };
}

function step(system, state, n = 1) {
  for (let i = 0; i < n; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    system.update(1 / 60, state);
  }
}

test('flyby focus empty quiet latch arms and skips census', () => {
  assert.equal(getFlybyFocusEmptyQuietLatchForBench(), true);
  const { state, system } = boot();
  setFlybyFocusEmptyQuietLatchForBench(true);
  step(system, state, 5);
  assert.equal(state.flybyFocusRuntime?.emptyQuietLatched, true);
  assert.ok(system._pickQuiet);
  const membership = system._pickQuiet.membership;
  step(system, state, 10);
  assert.equal(state.flybyFocusRuntime?.emptyQuietLatched, true);
  assert.equal(system._pickQuiet.membership, membership);
});

test('flyby focus empty quiet latch wakes on closing hostile spawn and starts lease', () => {
  const { state, helpers, ships, system, player } = boot();
  setFlybyFocusEmptyQuietLatchForBench(true);
  step(system, state, 5);
  assert.equal(state.flybyFocusRuntime?.emptyQuietLatched, true);

  // Closing head-on pass: relative ~140, closing ~140, range 160, TTC ~1.1s.
  const foe = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 160, z: 0 },
    vel: { x: -20, z: 0 },
    radius: 12, mass: 60, hull: 80, hullMax: 80, collides: true, team: 1,
    data: {
      ai: { archetype: 'pirate' },
      combat: { targetId: player.id, lockTarget: player.id },
      weapons: [{ id: 'wpn_test' }],
    },
  });
  ships.push(foe);
  if (state.entityIndex) {
    state.entityIndex.ships = ships;
    state.entityIndex.shipLike = ships;
    state.entityIndex.version = (state.entityIndex.version | 0) + 1;
  }
  // Bus spawn listener may already have woken; force wake for harnesses without emit.
  system.noteFlybyWake();
  step(system, state, 1);
  assert.equal(state.flybyFocusRuntime?.emptyQuietLatched, false);
  assert.equal(state.player.flybyFocus.active, true);
  assert.equal(state.player.flybyFocus.targetId, foe.id);
});

test('flyby focus empty quiet latch bench toggle restores census', () => {
  const { state, system } = boot();
  setFlybyFocusEmptyQuietLatchForBench(true);
  step(system, state, 5);
  assert.equal(state.flybyFocusRuntime?.emptyQuietLatched, true);
  setFlybyFocusEmptyQuietLatchForBench(false);
  step(system, state, 1);
  assert.equal(system._pickQuiet, null);
  // Restore production default for other suites.
  setFlybyFocusEmptyQuietLatchForBench(true);
});
