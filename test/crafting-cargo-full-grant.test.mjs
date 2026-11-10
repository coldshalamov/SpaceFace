import test from 'node:test';
import assert from 'node:assert/strict';

import { crafting } from '../src/systems/crafting.js';
import { addCargo } from '../src/systems/cargo.js';

function boot(capVolume = 40) {
  const toasts = [];
  const state = {
    player: {
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume, capMass: capVolume },
      researchedNodes: [],
      moduleInventory: [],
    },
    crafting: { queues: {} },
    ui: { dockedStationId: 'station_helios' },
  };
  const inst = Object.create(crafting);
  inst.init({
    state,
    bus: { emit(name, payload) { if (name === 'toast') toasts.push(payload); } },
    registry: { get() { return null; } },
  });
  return { state, inst, toasts };
}

test('queued commodity grant waits instead of destroying the product into a full hold', () => {
  const { state, inst } = boot(2);
  addCargo(state, 'cmdty_silicate', 2);
  state.crafting.queues.station_helios = {
    bpId: 'bp_refine_metals',
    elapsed: 1,
    total: 1,
    done: false,
    stationId: 'station_helios',
  };

  inst.update(0.1, state);
  assert.ok(state.crafting.queues.station_helios, 'job stays queued while the hold is full');
  assert.equal(state.player.cargo.items.cmdty_refined_metals, undefined);
  assert.equal(state.player.cargo.items.cmdty_silicate, 2);

  state.player.cargo.items = {};
  state.player.cargo.usedVolume = 0;
  state.player.cargo.usedMass = 0;
  inst.update(0.1, state);
  assert.equal(state.crafting.queues.station_helios, null);
  assert.equal(state.player.cargo.items.cmdty_refined_metals, 2);
});

test('instant refine refuses when the finished goods cannot fit after the swap', () => {
  const { state, inst, toasts } = boot(4);
  addCargo(state, 'cmdty_ore_iron', 3);
  addCargo(state, 'cmdty_ore_titanium', 1);
  state.player.cargo.capVolume = 0.4;
  state.player.cargo.usedVolume = 4;
  assert.equal(inst.build('bp_refine_metals', 'station_helios'), false);
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 3);
  assert.equal(state.player.cargo.items.cmdty_ore_titanium, 1);
  assert.ok(toasts.some((row) => /cannot take the finished goods/i.test(row.text)));
});
