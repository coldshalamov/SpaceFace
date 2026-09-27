import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { addCargo } from '../src/systems/cargo.js';
import {
  FRAGILE_CARGO_HARD_DELTA_V,
  FRAGILE_CARGO_SPILL_MAX_PODS,
  FRAGILE_CARGO_SPILL_TTL_S,
  fragileCargo,
  fragileCargoReadout,
  isFragileCommodity,
} from '../src/systems/fragileCargo.js';

const TRADE_FRAGILE = [
  'cmdty_medical',
  'cmdty_art',
  'cmdty_microchips',
  'cmdty_quantum_cores',
  'cmdty_luxury_goods',
  'cmdty_electronics',
];

function boot(withSpawner = true) {
  const state = createGameState(5150);
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 40;
  state.tick = 2400;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 100, y: 0, z: 200 }, vel: { x: 20, y: 0, z: 0 }, rot: 0,
    radius: 8, mass: 12, hull: 100, hullMax: 100, data: {},
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  let nextId = 100;
  const helpers = withSpawner ? {
    spawnEntity(spec) {
      const id = nextId++;
      const entity = {
        id,
        alive: true,
        type: spec.type || 'pickup',
        team: spec.team ?? 0,
        pos: { x: 0, y: 0, z: 0, ...(spec.pos || {}) },
        vel: { x: 0, y: 0, z: 0, ...(spec.vel || {}) },
        rot: 0,
        radius: spec.radius || 3,
        mass: spec.mass || 0.1,
        hull: spec.hull ?? 1,
        hullMax: spec.hullMax ?? 1,
        data: spec.data || {},
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  } : {};
  const system = Object.create(fragileCargo);
  system.init({ state, bus, helpers });
  return { state, bus, system, player };
}

function teardown(bus) {
  bus.clear();
}

function impact(system, deltaV = FRAGILE_CARGO_HARD_DELTA_V + 10) {
  return system.onImpact({
    playerInvolved: true,
    playerDeltaV: deltaV,
    simTime: 40,
    tick: 2400,
    aId: 1,
    bId: 9,
  });
}

test('fragile trade goods crack; plain goods do not', () => {
  for (const id of TRADE_FRAGILE) assert.equal(isFragileCommodity(id), true, id);
  assert.equal(isFragileCommodity('cmdty_ore_iron'), false);
  assert.equal(isFragileCommodity('cmdty_food'), false);
  assert.equal(isFragileCommodity('cmdty_crystal_silica'), true);
});

test('a hard impact spills half the crack as scoopable pods', () => {
  const { state, bus, system } = boot();
  try {
    assert.equal(addCargo(state, 'cmdty_crystal_silica', 20), 20);
    assert.equal(addCargo(state, 'cmdty_ore_iron', 10), 10);
    const receipt = impact(system);
    assert.ok(receipt);
    assert.ok(receipt.totalQty >= 1);
    assert.ok(receipt.totalSpilledQty >= 1);
    assert.equal(receipt.totalQty, receipt.totalSpilledQty + receipt.totalShatteredQty);
    assert.equal(receipt.spillPods, receipt.spillPodIds.length);
    assert.ok(receipt.spillPods >= 1);
    const pods = state.entityList.filter((e) => e.type === 'pickup');
    assert.equal(pods.length, receipt.spillPods);
    assert.equal(pods[0].data.kind, 'cargo');
    assert.equal(pods[0].data.commodityId, 'cmdty_crystal_silica');
    assert.equal(pods[0].data.fragileSpill, true);
    assert.equal(state.player.cargo.items.cmdty_ore_iron, 10);
  } finally {
    teardown(bus);
  }
});

test('spilled pods inherit ship momentum plus a deltaV-scaled scatter kick', () => {
  const { state, bus, system } = boot();
  try {
    addCargo(state, 'cmdty_medical', 20);
    const deltaV = FRAGILE_CARGO_HARD_DELTA_V + 10;
    impact(system, deltaV);
    const pods = state.entityList.filter((e) => e.type === 'pickup');
    assert.ok(pods.length >= 1);
    // Player runs +x at 20: pod vel is half momentum plus the ring kick.
    const expected = 6 + deltaV * 0.4;
    for (const pod of pods) {
      const kick = Math.hypot(pod.vel.x - 10, pod.vel.z - 0);
      assert.ok(Math.abs(kick - expected) < 0.01, `kick ${kick}`);
    }
  } finally {
    teardown(bus);
  }
});

test('fragile spill pods sublimate on a short fuse', () => {
  const { state, bus, system } = boot();
  try {
    addCargo(state, 'cmdty_art', 10);
    impact(system);
    const pods = state.entityList.filter((e) => e.type === 'pickup');
    assert.ok(pods.length >= 1);
    for (const pod of pods) {
      assert.equal(pod.data.despawnAt, 40 + FRAGILE_CARGO_SPILL_TTL_S);
    }
  } finally {
    teardown(bus);
  }
});

test('even a single-unit crack spills its pod', () => {
  const { state, bus, system } = boot();
  try {
    addCargo(state, 'cmdty_quantum_cores', 2);
    const receipt = impact(system, FRAGILE_CARGO_HARD_DELTA_V + 1);
    assert.ok(receipt);
    assert.equal(receipt.totalQty, 1);
    assert.equal(receipt.totalSpilledQty, 1);
    assert.equal(receipt.totalShatteredQty, 0);
    assert.equal(receipt.spillPods, 1);
  } finally {
    teardown(bus);
  }
});

test('the spill caps at four pods; the rest shatters', () => {
  const { state, bus, system } = boot();
  try {
    for (const id of TRADE_FRAGILE) addCargo(state, id, 8);
    const receipt = impact(system);
    assert.ok(receipt);
    assert.equal(receipt.items.length, 6);
    assert.equal(receipt.spillPods, FRAGILE_CARGO_SPILL_MAX_PODS);
    assert.ok(receipt.totalShatteredQty > 0);
    const capped = receipt.items.filter((item) => item.spilled === 0);
    assert.ok(capped.length >= 2);
  } finally {
    teardown(bus);
  }
});

test('without a spawner the crack degrades to an all-shatter receipt', () => {
  const { state, bus, system } = boot(false);
  try {
    addCargo(state, 'cmdty_crystal_silica', 20);
    const receipt = impact(system);
    assert.ok(receipt);
    assert.equal(receipt.totalSpilledQty, 0);
    assert.equal(receipt.spillPods, 0);
    assert.deepEqual(receipt.spillPodIds, []);
    assert.equal(receipt.totalShatteredQty, receipt.totalQty);
    for (const item of receipt.items) {
      assert.equal(item.spilled, 0);
      assert.equal(item.shattered, item.qty);
    }
  } finally {
    teardown(bus);
  }
});

test('spill geometry is deterministic per seed and tick', () => {
  const first = boot();
  const second = boot();
  try {
    addCargo(first.state, 'cmdty_luxury_goods', 20);
    addCargo(second.state, 'cmdty_luxury_goods', 20);
    impact(first.system);
    impact(second.system);
    const pa = first.state.entityList.filter((e) => e.type === 'pickup');
    const pb = second.state.entityList.filter((e) => e.type === 'pickup');
    assert.equal(pa.length, pb.length);
    assert.ok(pa.length >= 1);
    for (let i = 0; i < pa.length; i++) {
      assert.equal(pa[i].pos.x, pb[i].pos.x);
      assert.equal(pa[i].pos.z, pb[i].pos.z);
      assert.equal(pa[i].vel.x, pb[i].vel.x);
      assert.equal(pa[i].vel.z, pb[i].vel.z);
    }
  } finally {
    teardown(first.bus);
    teardown(second.bus);
  }
});

test('the hold readout flags fragile trade goods for UI consumers', () => {
  const { state, bus } = boot();
  try {
    addCargo(state, 'cmdty_medical', 5);
    addCargo(state, 'cmdty_food', 5);
    const readout = fragileCargoReadout(state);
    assert.equal(readout.length, 1);
    assert.equal(readout[0].commodityId, 'cmdty_medical');
    assert.equal(readout[0].glyph.token, 'fragile');
  } finally {
    teardown(bus);
  }
});
