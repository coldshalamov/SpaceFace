import test from 'node:test';
import assert from 'node:assert/strict';

import { salvage } from '../src/systems/salvage.js';

test('the cradle names Stellarite Ore when the core is delivered, seed 4242', () => {
  const log = [];
  const state = {
    simTime: 80,
    tick: 4800,
    mode: 'flight',
    meta: { seed: 4242 },
    world: { currentSectorId: 'sector_ceres_belt' },
    player: { credits: 0 },
  };
  const sys = Object.create(salvage);
  sys.state = state;
  sys.bus = { emit(name, payload) { log.push({ name, payload }); } };
  const core = { id: 'core-1', alive: true, pos: { x: 0, z: 0 } };
  const pocket = {
    id: 'pocket-1',
    cradleId: 'cradle-1',
    commodityId: 'cmdty_ore_einsteinium',
    poolQty: 4,
    integrity: 1,
    phase: 'hauling',
  };
  sys._deliverSortPocket(pocket, core, { id: 'cradle-1' }, state);
  assert.equal(core.alive, false);
  assert.equal(state.player.salvageBay.items.cmdty_ore_einsteinium, 4);
  const toast = log.find((event) => event.name === 'toast');
  assert.equal(
    toast.payload.text,
    'Cradle took the core — 4u Stellarite Ore to the bay (100% integrity).',
  );
  assert.doesNotMatch(toast.payload.text, /einsteinium|cmdty_/);
});
