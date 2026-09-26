import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  bountyHunt,
  setBountyHuntEmptyQuietLatchForBench,
  getBountyHuntEmptyQuietLatchForBench,
} from '../src/systems/bountyHunt.js';
import { makeBountyHunterSpec } from '../src/data/bountyHunters.js';

function boot() {
  const state = createGameState(1491);
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
  bountyHunt.init({ state, bus, helpers, registry: null });
  return { state, helpers, ships, bus, player };
}

test('bounty hunt empty quiet latch arms and skips census', () => {
  assert.equal(getBountyHuntEmptyQuietLatchForBench(), true);
  const { state } = boot();
  setBountyHuntEmptyQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    bountyHunt.update(1 / 60, state);
  }
  assert.equal(state.bountyHuntRuntime?.emptyQuietLatched, true);
  assert.ok(bountyHunt._huntersQuiet);
  const membership = bountyHunt._huntersQuiet.membership;
  for (let i = 0; i < 10; i++) {
    state.tick++;
    bountyHunt.update(1 / 60, state);
  }
  assert.equal(state.bountyHuntRuntime?.emptyQuietLatched, true);
  assert.equal(bountyHunt._huntersQuiet.membership, membership);
});

test('bounty hunt empty quiet latch wakes on hunter spawn and normalizes', () => {
  const { state, helpers, ships } = boot();
  setBountyHuntEmptyQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    bountyHunt.update(1 / 60, state);
  }
  assert.equal(state.bountyHuntRuntime?.emptyQuietLatched, true);

  const spec = makeBountyHunterSpec({
    contractId: 'bounty:test',
    contractTargetId: state.playerId,
    pos: { x: 500, z: 500 },
  });
  const hunter = helpers.spawnEntity(spec);
  ships.push(hunter);
  if (state.entityIndex) {
    state.entityIndex.shipLike = ships;
    state.entityIndex.ships = ships;
    state.entityIndex.version = (state.entityIndex.version | 0) + 1;
  }
  // Spawn event should wake; also bump membership.
  if (typeof bountyHunt._onEntitySpawned === 'function') {
    bountyHunt._onEntitySpawned({ entity: hunter });
  }
  assert.equal(bountyHunt._huntersQuiet, null);

  state.tick++;
  bountyHunt.update(1 / 60, state);
  assert.equal(state.bountyHuntRuntime?.emptyQuietLatched, false);
  assert.equal(hunter.data.bountyHunt.role, 'hunter');
  assert.equal(hunter.data.ai.forcePlayerTarget, true);
});

test('bounty hunt empty quiet latch can disable for bench', () => {
  const { state } = boot();
  setBountyHuntEmptyQuietLatchForBench(false);
  assert.equal(getBountyHuntEmptyQuietLatchForBench(), false);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    bountyHunt.update(1 / 60, state);
  }
  assert.equal(state.bountyHuntRuntime?.emptyQuietLatched, undefined);
  assert.equal(bountyHunt._huntersQuiet, null);
  setBountyHuntEmptyQuietLatchForBench(true);
});
