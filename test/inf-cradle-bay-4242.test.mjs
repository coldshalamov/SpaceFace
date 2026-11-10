// Seed 4242 — a cradle that cannot fit the core keeps the body and the unpaid units.
import test from 'node:test';
import assert from 'node:assert/strict';

import { salvage } from '../src/systems/salvage.js';

function harness(usedVolume) {
  const log = [];
  const state = {
    simTime: 90,
    tick: 5400,
    mode: 'flight',
    meta: { seed: 4242 },
    world: { currentSectorId: 'sector_ceres_belt' },
    player: {
      credits: 0,
      cargo: { capVolume: 20, usedVolume: 0, items: {} },
      salvageBay: { items: {}, usedVolume },
    },
  };
  const sys = Object.create(salvage);
  sys.state = state;
  sys.bus = { emit(name, payload) { log.push({ name, payload }); } };
  return { state, sys, log };
}

test('a full bay keeps the core and the units the cradle could not take, seed 4242', () => {
  const { state, sys, log } = harness(600);
  const core = { id: 'core-1', alive: true, pos: { x: 0, z: 0 } };
  const pocket = {
    id: 'pocket-full',
    cradleId: 'cradle-1',
    commodityId: 'cmdty_salvage_electronics',
    poolQty: 5,
    integrity: 1,
    phase: 'free',
  };
  sys._deliverSortPocket(pocket, core, { id: 'cradle-1' }, state);
  assert.equal(core.alive, true);
  assert.equal(pocket.phase, 'free');
  assert.equal(pocket.poolQty, 5);
  assert.equal(pocket.integrity, 1);
  assert.equal(state.player.salvageBay.items.cmdty_salvage_electronics, undefined);
  const toast = log.find((event) => event.name === 'toast');
  assert.equal(toast.payload.text, 'Cradle held the core — no room in the bay. 5u stay on the core.');
  assert.equal(log.some((event) => event.name === 'salvage:sortDelivered'), false);

  const spoken = log.length;
  sys._deliverSortPocket(pocket, core, { id: 'cradle-1' }, state);
  assert.equal(log.length, spoken);
  assert.equal(core.alive, true);
  assert.equal(pocket.poolQty, 5);
});

test('a short bay keeps the overflow on the live core until there is room, seed 4242', () => {
  // Salvage electronics are 0.6 a unit. 599.4 used leaves room for one against the 600 floor.
  const { state, sys, log } = harness(599.4);
  const core = { id: 'core-2', alive: true, pos: { x: 0, z: 0 } };
  const pocket = {
    id: 'pocket-part',
    cradleId: 'cradle-1',
    commodityId: 'cmdty_salvage_electronics',
    poolQty: 5,
    integrity: 1,
    phase: 'free',
  };
  sys._deliverSortPocket(pocket, core, { id: 'cradle-1' }, state);
  assert.equal(state.player.salvageBay.items.cmdty_salvage_electronics, 1);
  assert.equal(core.alive, true);
  assert.equal(pocket.phase, 'free');
  assert.equal(pocket.poolQty, 4);
  assert.equal(pocket.integrity, 1);
  const toast = log.find((event) => event.name === 'toast');
  assert.equal(
    toast.payload.text,
    'Cradle held the core — the bay took 1u and 4u are still on it.',
  );

  state.player.salvageBay.items = {};
  state.player.salvageBay.usedVolume = 0;
  sys._deliverSortPocket(pocket, core, { id: 'cradle-1' }, state);
  assert.equal(core.alive, false);
  assert.equal(pocket.phase, 'delivered');
  assert.equal(state.player.salvageBay.items.cmdty_salvage_electronics, 4);
  assert.equal(log.filter((event) => event.name === 'salvage:sortDelivered').length, 1);
});
