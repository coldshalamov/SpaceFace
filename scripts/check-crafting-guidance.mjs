import assert from 'node:assert/strict';

import { BLUEPRINT_BY_ID } from '../src/data/blueprints.js';
import { crafting, craftingMaterialBlockerText } from '../src/systems/crafting.js';

function makeCtx(playerPatch = {}) {
  const toasts = [];
  const state = {
    player: {
      researchedNodes: [],
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 50, capMass: 50 },
      moduleInventory: [],
      ownedShips: [],
      ...playerPatch,
    },
    crafting: { queues: {} },
    ui: { dockedStationId: 'station_forge' },
  };
  const bus = {
    emit(event, payload) {
      if (event === 'toast') toasts.push(payload);
    },
  };
  crafting.init({
    state,
    bus,
    registry: { get() { return null; } },
  });
  return { state, toasts };
}

const refineMetals = BLUEPRINT_BY_ID.get('bp_refine_metals');
assert.equal(
  craftingMaterialBlockerText(refineMetals, [
    { id: 'cmdty_ore_iron', need: 3, have: 2 },
    { id: 'cmdty_ore_titanium', need: 1, have: 1 },
  ]),
  'Need 1 Iron Ore for Refine Metals',
  'crafting material blockers must name the missing commodity and blueprint',
);

let ctx = makeCtx({
  cargo: { items: { cmdty_ore_iron: 2, cmdty_ore_titanium: 1 }, usedVolume: 3, usedMass: 3, capVolume: 50, capMass: 50 },
});
assert.equal(crafting.build('bp_refine_metals', 'station_forge'), false);
assert.equal(ctx.toasts.at(-1).text, 'Need 1 Iron Ore for Refine Metals');
assert.doesNotMatch(ctx.toasts.at(-1).text, /cmdty_|Not enough materials/);

ctx = makeCtx({
  researchedNodes: ['tech_deflector_theory'],
  cargo: {
    items: { cmdty_comp_circuitry: 2, cmdty_alloys: 2, cmdty_quantum_cores: 1 },
    usedVolume: 5,
    usedMass: 5,
    capVolume: 50,
    capMass: 50,
  },
});
assert.equal(crafting.build('bp_aug_shield_s_to_m', 'station_forge'), false);
assert.equal(ctx.toasts.at(-1).text, 'Need a Shield Booster S to augment');
assert.doesNotMatch(ctx.toasts.at(-1).text, /mod_/);

console.log('Crafting guidance OK - direct build failures name missing materials and source modules.');
