// FB-048 — the cargo deck reports the real FIFO cost basis of the hold, not a hardcoded zero.
import assert from 'node:assert/strict';
import test from 'node:test';

import { __cargoDeckInternals } from '../src/ui/navigation/cargoDeck.js';

const { heldCargoLots } = __cargoDeckInternals;

function stateWith(items, tradeLots) {
  return {
    player: {
      cargo: { items, capVolume: 100, usedVolume: 0 },
      tradeLots,
    },
  };
}

test('cost basis is the FIFO average of surviving buy lots', () => {
  // Two buys at different prices: 10u@100 + 10u@200 → basis 150.
  const state = stateWith(
    { cmdty_ore_iron: 20 },
    { cmdty_ore_iron: [{ qty: 10, unit: 100 }, { qty: 10, unit: 200 }] },
  );
  const [lot] = heldCargoLots(state);
  assert.equal(lot.units, 20);
  assert.equal(lot.costBasis, 150);
});

test('a partially consumed queue prices the surviving lots', () => {
  // Sold the cheap 10 already; the held 10 all came from the 200 buy.
  const state = stateWith(
    { cmdty_ore_iron: 10 },
    { cmdty_ore_iron: [{ qty: 10, unit: 200 }] },
  );
  const [lot] = heldCargoLots(state);
  assert.equal(lot.costBasis, 200);
});

test('cargo with no recorded buy lots reports zero basis, not a guess', () => {
  const state = stateWith({ cmdty_ore_iron: 5 }, {});
  const [lot] = heldCargoLots(state);
  assert.equal(lot.costBasis, 0);
});

test('a corrupt lots bag fails closed instead of throwing', () => {
  const state = stateWith(
    { cmdty_ore_iron: 4 },
    { cmdty_ore_iron: [{ qty: 'x' }, null, { qty: 4, unit: 50 }] },
  );
  const [lot] = heldCargoLots(state);
  assert.equal(lot.costBasis, 50);
});
