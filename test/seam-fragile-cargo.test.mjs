import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { addCargo } from '../src/systems/cargo.js';
import {
  FRAGILE_CARGO_HARD_DELTA_V,
  applyFragileCargoImpact,
  fragileCargo,
  isFragileCommodity,
} from '../src/systems/fragileCargo.js';

const FRAGILE_ID = 'cmdty_crystal_silica';
const TOUGH_ID = 'cmdty_ore_iron';

test('crystal silica is fragile; iron ore is not', () => {
  assert.equal(isFragileCommodity(FRAGILE_ID), true);
  assert.equal(isFragileCommodity(TOUGH_ID), false);
});

test('a hard player impact cracks fragile hold and writes a receipt', () => {
  const state = createGameState(47);
  state.simTime = 12;
  state.tick = 720;
  assert.equal(addCargo(state, FRAGILE_ID, 20), 20);
  assert.equal(addCargo(state, TOUGH_ID, 10), 10);
  const bus = createBus();
  const lost = [];
  bus.on('cargo:fragileLost', (p) => lost.push(p));
  const system = Object.create(fragileCargo);
  system.init({ state, bus, helpers: {} });
  try {
    const receipt = system.onImpact({
      playerInvolved: true,
      playerDeltaV: FRAGILE_CARGO_HARD_DELTA_V + 10,
      simTime: 12,
      tick: 720,
      aId: 1,
      bId: 9,
    });
    assert.ok(receipt, 'hard impact must produce a loss receipt');
    assert.equal(receipt.event, 'fragile_cargo_impact');
    assert.ok(receipt.totalQty >= 1);
    assert.ok((state.player.cargo.items[FRAGILE_ID] || 0) < 20, 'fragile stack must shrink');
    assert.equal(state.player.cargo.items[TOUGH_ID], 10, 'iron is not fragile and must survive');
    assert.equal(lost.length, 1);
    assert.equal(state.fragileCargo.receipts.length, 1);
  } finally {
    bus.clear();
  }
});

test('a gentle bump does not crack fragile cargo', () => {
  const state = createGameState(48);
  addCargo(state, FRAGILE_ID, 20);
  const before = state.player.cargo.items[FRAGILE_ID];
  const receipt = applyFragileCargoImpact(state, {
    playerInvolved: true,
    playerDeltaV: FRAGILE_CARGO_HARD_DELTA_V - 1,
    simTime: 1,
  });
  assert.equal(receipt, null);
  assert.equal(state.player.cargo.items[FRAGILE_ID], before);
});
