import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { cargo } from '../src/systems/cargo.js';

const SEED = 41;
const STATION_ID = 'station_helios';
const FOOD = 'cmdty_food';
const FAIL_KEYS = ['missionFailed', 'failed', 'dockDenied', 'denied', 'damage', 'hullDamage'];

function makeHarness(vel) {
  const state = createGameState(SEED);
  const bus = createBus();
  const player = {
    id: 1, type: 'ship', team: 0, alive: true, collides: true,
    pos: { x: 100, z: 50 }, vel: { x: vel.x, z: vel.z }, rot: 0,
    radius: 8, combatSpeed: 100, hull: 100, hullMax: 100,
    factionId: 'player', flags: {}, data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;

  const spawned = [];
  const spawnEntity = (spec) => {
    const entity = {
      ...spec,
      id: state.nextEntityId++,
      alive: true,
      pos: { ...(spec.pos || { x: 0, z: 0 }) },
      vel: { ...(spec.vel || { x: 0, z: 0 }) },
      data: spec.data ? { ...spec.data } : {},
      flags: spec.flags ? { ...spec.flags } : {},
    };
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    spawned.push(entity);
    bus.emit('entity:spawned', { id: entity.id, type: entity.type, entity });
    return entity;
  };
  const removeEntity = (id) => {
    const entity = state.entities.get(id);
    if (entity) entity.alive = false;
    state.entities.delete(id);
    const index = state.entityList.indexOf(entity);
    if (index >= 0) state.entityList.splice(index, 1);
  };

  const system = Object.create(cargo);
  system.init({ state, bus, helpers: { spawnEntity, removeEntity } });
  const spillReceipts = [];
  const jettisonReceipts = [];
  bus.on('cargo:hotDockSpill', (receipt) => spillReceipts.push(receipt));
  bus.on('cargo:jettisoned', (receipt) => jettisonReceipts.push(receipt));
  system.addCargo(FOOD, 4);
  return { state, bus, system, player, spawned, spillReceipts, jettisonReceipts };
}

function pods(harness) {
  return harness.spawned.filter((entity) => entity.type === 'payload' && entity.alive !== false);
}

function assertNoFailFields(harness) {
  for (const receipt of [...harness.spillReceipts, ...harness.jettisonReceipts]) {
    for (const key of FAIL_KEYS) assert.equal(key in receipt, false, `receipt must not carry ${key}`);
  }
  for (const key of FAIL_KEYS) {
    assert.equal(key in harness.state, false, `state must not carry ${key}`);
    assert.equal(key in harness.player, false, `player must not carry ${key}`);
  }
  assert.equal(harness.player.hull, 100);
}

test('a hot dock arrival spills two recoverable cargo pods', () => {
  const harness = makeHarness({ x: 25, z: 0 });
  try {
    harness.bus.emit('dock:docked', { stationId: STATION_ID });
    const spilled = pods(harness);
    assert.equal(spilled.length, 2);
    for (const pod of spilled) {
      assert.equal(pod.data.kind, 'cargo');
      assert.equal(pod.data.commodityId, FOOD);
      assert.equal(pod.data.amount, 1);
      assert.equal(pod.flags.persistent, true);
    }
    assert.equal(harness.state.player.cargo.items[FOOD], 2);
    assert.equal(harness.spillReceipts.length, 1);
    const receipt = harness.spillReceipts[0];
    assert.equal(receipt.stationId, STATION_ID);
    assert.equal(receipt.entrySpeed, 25);
    assert.equal(receipt.cruiseSpeed, 100);
    assert.equal(receipt.threshold, 20);
    assert.equal(receipt.fraction, 0.2);
    assert.equal(receipt.pods, 2);
    assert.equal(receipt.spilled[FOOD], 2);
    assert.deepEqual(Object.keys(receipt.spilled), [FOOD]);
    assert.equal(harness.jettisonReceipts.length, 2);
    assert.equal(harness.jettisonReceipts.reduce((sum, row) => sum + row.amount, 0), 2);
    for (const row of harness.jettisonReceipts) {
      assert.equal(row.commodityId, FOOD);
      assert.equal(row.amount, 1);
    }
    assertNoFailFields(harness);
    harness.bus.emit('dock:docked', { stationId: STATION_ID });
    assert.equal(pods(harness).length, 2);
    assert.equal(harness.spillReceipts.length, 1);
    assert.equal(harness.state.player.cargo.items[FOOD], 2);
  } finally {
    harness.system.destroy();
  }
});

test('a dock arrival at the legal speed keeps the hold sealed', () => {
  const harness = makeHarness({ x: 20, z: 0 });
  try {
    harness.bus.emit('dock:docked', { stationId: STATION_ID });
    assert.equal(pods(harness).length, 0);
    assert.equal(harness.state.player.cargo.items[FOOD], 4);
    assert.equal(harness.spillReceipts.length, 0);
    assert.equal(harness.jettisonReceipts.length, 0);
    assertNoFailFields(harness);
  } finally {
    harness.system.destroy();
  }
});
