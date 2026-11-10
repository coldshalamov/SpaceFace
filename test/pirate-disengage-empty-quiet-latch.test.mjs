import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  pirateDisengage,
  setPirateDisengageEmptyQuietLatchForBench,
  getPirateDisengageEmptyQuietLatchForBench,
} from '../src/systems/pirateDisengage.js';

function boot() {
  const state = createGameState(1501);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
  });
  state.playerId = player.id;
  const ships = [player];
  for (let i = 0; i < 48; i++) {
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
    state.entityIndex.version = 1;
  }
  pirateDisengage.init({ state, bus, helpers, registry: null });
  return { state, helpers, ships, bus, player };
}

test('pirate disengage empty quiet latch arms and skips dual census', () => {
  assert.equal(getPirateDisengageEmptyQuietLatchForBench(), true);
  const { state } = boot();
  setPirateDisengageEmptyQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    pirateDisengage.update(1 / 60, state);
  }
  assert.equal(state.pirateDisengageRuntime?.emptyQuietLatched, true);
  assert.ok(pirateDisengage._combatantsQuiet);
  const membership = pirateDisengage._combatantsQuiet.membership;
  for (let i = 0; i < 10; i++) {
    state.tick++;
    pirateDisengage.update(1 / 60, state);
  }
  assert.equal(state.pirateDisengageRuntime?.emptyQuietLatched, true);
  assert.equal(pirateDisengage._combatantsQuiet.membership, membership);
});

test('pirate disengage empty quiet latch wakes on pirate spawn', () => {
  const { state, helpers, ships } = boot();
  setPirateDisengageEmptyQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    pirateDisengage.update(1 / 60, state);
  }
  assert.equal(state.pirateDisengageRuntime?.emptyQuietLatched, true);

  const pirate = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 500, z: 500 },
    vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 1,
    data: { ai: { role: 'pirate', squadId: 'raid:test' }, role: 'pirate' },
  });
  ships.push(pirate);
  if (state.entityIndex) {
    state.entityIndex.shipLike = ships;
    state.entityIndex.ships = ships;
    state.entityIndex.version = (state.entityIndex.version | 0) + 1;
  }
  if (typeof pirateDisengage._onEntitySpawned === 'function') {
    pirateDisengage._onEntitySpawned({ entity: pirate });
  }
  assert.equal(pirateDisengage._combatantsQuiet, null);

  state.tick++;
  pirateDisengage.update(1 / 60, state);
  assert.equal(state.pirateDisengageRuntime?.emptyQuietLatched, false);
  assert.equal(pirateDisengage._combatantsQuiet, null);
});

test('pirate disengage empty quiet latch can disable for bench', () => {
  const { state } = boot();
  setPirateDisengageEmptyQuietLatchForBench(false);
  assert.equal(getPirateDisengageEmptyQuietLatchForBench(), false);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    pirateDisengage.update(1 / 60, state);
  }
  assert.equal(state.pirateDisengageRuntime?.emptyQuietLatched, undefined);
  assert.equal(pirateDisengage._combatantsQuiet, null);
  setPirateDisengageEmptyQuietLatchForBench(true);
});
