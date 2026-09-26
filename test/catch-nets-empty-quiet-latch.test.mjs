import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  lootShards,
  setCatchNetsEmptyQuietLatchForBench,
  getCatchNetsEmptyQuietLatchForBench,
} from '../src/systems/lootShards.js';

function boot() {
  const state = createGameState(1461);
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
  for (let i = 0; i < 8; i++) {
    ships.push(helpers.spawnEntity({
      type: 'ship',
      pos: { x: 80 + i * 15, z: 40 },
      vel: { x: 0, z: 0 },
      radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 1,
      data: { ai: { passive: true } },
    }));
  }
  const payloads = [];
  for (let i = 0; i < 6; i++) {
    payloads.push(helpers.spawnEntity({
      type: 'payload',
      pos: { x: 20 + i * 5, z: -30 },
      radius: 4, mass: 5, hull: 1, hullMax: 1, collides: true,
      data: { payloadType: 'civilian_manifest', commodityId: 'ore_iron', amount: 1 },
    }));
  }
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    state.entityIndex.__spacefaceEntityIndexV1 = true;
    state.entityIndex.ships = ships;
    state.entityIndex.shipLike = ships;
    state.entityIndex.stations = [];
    state.entityIndex.wrecks = [];
    state.entityIndex.payloads = payloads;
    state.entityIndex.pickups = [];
    state.entityIndex.version = 1;
  }
  lootShards.init({ state, bus, helpers, registry: null });
  return { state, helpers, payloads, ships };
}

test('catch-nets empty quiet latch arms and skips census', () => {
  assert.equal(getCatchNetsEmptyQuietLatchForBench(), true);
  const { state } = boot();
  setCatchNetsEmptyQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    lootShards.update(1 / 60, state);
  }
  assert.equal(state.lootShardsRuntime?.catchNetsQuietLatched, true);
  assert.ok(lootShards._catchNetsQuiet);
  const membership = lootShards._catchNetsQuiet.membership;
  for (let i = 0; i < 10; i++) {
    state.tick++;
    lootShards.update(1 / 60, state);
  }
  assert.equal(state.lootShardsRuntime?.catchNetsQuietLatched, true);
  assert.equal(lootShards._catchNetsQuiet.membership, membership);
});

test('catch-nets empty quiet latch wakes on net+pod and catches', () => {
  const { state, helpers, payloads } = boot();
  setCatchNetsEmptyQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    lootShards.update(1 / 60, state);
  }
  assert.equal(state.lootShardsRuntime?.catchNetsQuietLatched, true);

  const net = helpers.spawnEntity({
    type: 'payload',
    pos: { x: 10, z: 10 },
    radius: 8, mass: 10, hull: 1, hullMax: 1, collides: true,
    data: { outlawCatchNet: true, payloadType: 'outlaw_catch_net' },
  });
  payloads.push(net);
  state.entityIndex.payloads = payloads;
  state.entityIndex.version = (state.entityIndex.version | 0) + 1;

  const pod = helpers.spawnEntity({
    type: 'payload',
    pos: { x: 11, z: 10 },
    radius: 4, mass: 20, hull: 1, hullMax: 1, collides: true,
    data: { payloadType: 'jettisoned_cargo', commodityId: 'ore_iron', amount: 2 },
  });
  payloads.push(pod);
  state.entityIndex.payloads = payloads;
  state.entityIndex.version = (state.entityIndex.version | 0) + 1;

  for (let i = 0; i < 4; i++) {
    state.tick++;
    lootShards.update(1 / 60, state);
  }
  assert.equal(state.lootShardsRuntime?.catchNetsQuietLatched, false);
  assert.equal(pod.data.caughtByNet, true);
  assert.equal(pod.data.caughtByNetId, net.id);
});

test('catch-nets empty quiet latch can be disabled for bench', () => {
  const { state } = boot();
  setCatchNetsEmptyQuietLatchForBench(false);
  assert.equal(getCatchNetsEmptyQuietLatchForBench(), false);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    lootShards.update(1 / 60, state);
  }
  assert.notEqual(state.lootShardsRuntime?.catchNetsQuietLatched, true);
  setCatchNetsEmptyQuietLatchForBench(true);
});
