import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  lawSecurity,
  setCustomsConesEmptyQuietLatchForBench,
  getCustomsConesEmptyQuietLatchForBench,
  customsScanConeOf,
} from '../src/systems/lawSecurity.js';

function boot() {
  const state = createGameState(1451);
  state.mode = 'flight';
  state.tick = 0;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
  });
  state.playerId = player.id;
  const ships = [player];
  for (let i = 0; i < 12; i++) {
    ships.push(helpers.spawnEntity({
      type: 'ship',
      pos: { x: 80 + i * 15, z: 40 },
      vel: { x: 0, z: 0 },
      radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 1,
      data: { ai: { passive: true } },
    }));
  }
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    state.entityIndex.__spacefaceEntityIndexV1 = true;
    state.entityIndex.ships = ships;
    state.entityIndex.shipLike = ships;
    state.entityIndex.stations = [];
    state.entityIndex.wrecks = [];
    state.entityIndex.payloads = [];
    state.entityIndex.pickups = [];
    state.entityIndex.version = 1;
  }
  lawSecurity.init({ state, bus, helpers, registry: null });
  return { state, helpers };
}

test('customs cones empty quiet latch arms and skips census', () => {
  assert.equal(getCustomsConesEmptyQuietLatchForBench(), true);
  const { state } = boot();
  setCustomsConesEmptyQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    lawSecurity.update(1 / 60, state);
  }
  assert.equal(state.lawSecurityRuntime?.customsConesQuietLatched, true);
  assert.ok(lawSecurity._customsConesQuiet);
  const membership = lawSecurity._customsConesQuiet.membership;
  for (let i = 0; i < 10; i++) {
    state.tick++;
    lawSecurity.update(1 / 60, state);
  }
  assert.equal(state.lawSecurityRuntime?.customsConesQuietLatched, true);
  assert.equal(lawSecurity._customsConesQuiet.membership, membership);
});

test('customs cones empty quiet latch wakes on customs scanner spawn', () => {
  const { state, helpers } = boot();
  setCustomsConesEmptyQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    lawSecurity.update(1 / 60, state);
  }
  assert.equal(state.lawSecurityRuntime?.customsConesQuietLatched, true);
  const scanner = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 40, z: 40 },
    vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 2,
    data: { customsScanner: true, role: 'customs', defId: 'customs_cutter' },
  });
  state.entityIndex.ships.push(scanner);
  state.entityIndex.shipLike.push(scanner);
  state.entityIndex.version++;
  state.tick++;
  lawSecurity.update(1 / 60, state);
  assert.equal(state.lawSecurityRuntime?.customsConesQuietLatched, false);
  assert.ok(customsScanConeOf(scanner));
});

test('customs cones empty quiet latch bench toggle restores census', () => {
  const { state } = boot();
  setCustomsConesEmptyQuietLatchForBench(true);
  for (let i = 0; i < 3; i++) {
    state.tick++;
    lawSecurity.update(1 / 60, state);
  }
  assert.equal(state.lawSecurityRuntime?.customsConesQuietLatched, true);
  setCustomsConesEmptyQuietLatchForBench(false);
  state.tick++;
  lawSecurity.update(1 / 60, state);
  assert.equal(getCustomsConesEmptyQuietLatchForBench(), false);
  // Re-enable for other tests
  setCustomsConesEmptyQuietLatchForBench(true);
});
