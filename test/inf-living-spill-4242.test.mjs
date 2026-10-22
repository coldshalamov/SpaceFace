// A hard hit spills living samples and the unbroken lens. Seed 4242.
// Iron ore and a gate handshake stay in the hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { addCargo } from '../src/systems/cargo.js';
import {
  FRAGILE_CARGO_HARD_DELTA_V,
  fragileCargo,
  fragileCargoReadout,
  isFragileCommodity,
} from '../src/systems/fragileCargo.js';

function boot() {
  const state = createGameState(4242);
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
  const helpers = {
    spawnEntity(spec) {
      const id = nextId++;
      const entity = {
        id, alive: true, type: spec.type || 'pickup', team: 0,
        pos: { x: 0, y: 0, z: 0, ...(spec.pos || {}) },
        vel: { x: 0, y: 0, z: 0, ...(spec.vel || {}) },
        rot: 0, radius: 3, mass: 0.1, hull: 1, hullMax: 1,
        data: spec.data || {},
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const system = Object.create(fragileCargo);
  system.init({ state, bus, helpers });
  return { state, bus, system };
}

test('seed 4242: living samples and the lens crack; a handshake and iron do not', () => {
  assert.equal(isFragileCommodity('cmdty_spore_catalyst'), true);
  assert.equal(isFragileCommodity('cmdty_live_specimen'), true);
  assert.equal(isFragileCommodity('cmdty_filament_sample'), true);
  assert.equal(isFragileCommodity('cmdty_unbroken_lens'), true);
  assert.equal(isFragileCommodity('cmdty_gate_handshake'), false);
  assert.equal(isFragileCommodity('cmdty_ore_iron'), false);

  const { state, bus, system } = boot();
  try {
    assert.equal(addCargo(state, 'cmdty_spore_catalyst', 8), 8);
    assert.equal(addCargo(state, 'cmdty_ore_iron', 6), 6);
    assert.equal(addCargo(state, 'cmdty_gate_handshake', 1), 1);
    const before = fragileCargoReadout(state).map((row) => row.commodityId);
    assert.ok(before.includes('cmdty_spore_catalyst'));
    assert.equal(before.includes('cmdty_ore_iron'), false);

    const receipt = system.onImpact({
      playerInvolved: true,
      playerDeltaV: FRAGILE_CARGO_HARD_DELTA_V + 10,
      simTime: 40,
      tick: 2400,
      aId: 1,
      bId: 9,
    });
    assert.ok(receipt);
    assert.equal(receipt.items.length, 1);
    assert.equal(receipt.items[0].commodityId, 'cmdty_spore_catalyst');
    assert.ok(receipt.totalSpilledQty >= 1);
    const pods = state.entityList.filter((entity) => entity.type === 'pickup');
    assert.equal(pods.length, receipt.spillPods);
    assert.equal(pods[0].data.commodityId, 'cmdty_spore_catalyst');
    assert.equal(pods[0].data.fragileSpill, true);
    assert.equal(state.player.cargo.items.cmdty_ore_iron, 6);
    assert.equal(state.player.cargo.items.cmdty_gate_handshake, 1);
    assert.ok(state.player.cargo.items.cmdty_spore_catalyst < 8);
  } finally {
    bus.clear();
  }
});
