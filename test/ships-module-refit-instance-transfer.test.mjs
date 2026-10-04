// NXI-125: Refitting an instance does not create a second owned copy
// Fit, remove and refit the same module: total ownership remains one.
// Valid duplicates are preserved and not destroyed.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ships as shipsProto, buildSlotList } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const UTILITY_DEF = 'mod_cargo_scanner_s';
const KESTREL_UTILITY_SLOT = 5;

function boot() {
  const state = createGameState(250);
  state.playerId = 1;
  state.player.credits = 100_000;
  state.player.moduleInventory = [];
  const kestrelSlots = buildSlotList(SHIP_BY_ID.get('ship_kestrel'));
  state.player.ownedShips = [{
    defId: 'ship_kestrel',
    fittings: Array(kestrelSlots.length).fill(null),
  }];
  state.player.activeShipIndex = 0;
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';

  const bus = createBus();
  const ships = Object.assign({}, shipsProto);
  ships.init({ state, bus, helpers: {} });
  return { state, bus, ships };
}

function countTotalOwned(state, defId) {
  let count = 0;
  for (const ship of state.player.ownedShips || []) {
    for (const fitted of ship.fittings || []) {
      if (fitted === defId) count++;
    }
  }
  for (const item of state.player.moduleInventory || []) {
    if (item && item.defId === defId) count++;
  }
  return count;
}

test('NXI-125: fit, unfit, and refit the same module maintains total ownership of 1', () => {
  const { state, bus, ships } = boot();

  // Buy one module directly into slot
  const bought = ships.buyModule({ defId: UTILITY_DEF, shipIndex: 0, fitSlotIndex: KESTREL_UTILITY_SLOT });
  assert.equal(bought, true);
  assert.equal(state.player.ownedShips[0].fittings[KESTREL_UTILITY_SLOT], UTILITY_DEF);
  assert.equal(state.player.moduleInventory.length, 0);
  assert.equal(countTotalOwned(state, UTILITY_DEF), 1);

  // Unfit module -> moves to inventory
  const unfit = ships.unfitModule({ shipIndex: 0, slotIndex: KESTREL_UTILITY_SLOT });
  assert.equal(unfit, true);
  assert.equal(state.player.ownedShips[0].fittings[KESTREL_UTILITY_SLOT], null);
  assert.equal(state.player.moduleInventory.length, 1);
  const held = state.player.moduleInventory[0];
  assert.equal(held.defId, UTILITY_DEF);
  assert.equal(countTotalOwned(state, UTILITY_DEF), 1);

  // Refit the same module using its instanceId
  const refit = ships.fitModule({ shipIndex: 0, slotIndex: KESTREL_UTILITY_SLOT, instanceId: held.instanceId });
  assert.equal(refit, true);
  assert.equal(state.player.ownedShips[0].fittings[KESTREL_UTILITY_SLOT], UTILITY_DEF);
  assert.equal(state.player.moduleInventory.length, 0, 'inventory is empty after refit');
  assert.equal(countTotalOwned(state, UTILITY_DEF), 1, 'total ownership must remain exactly one');
});

test('NXI-125: valid duplicate modules are preserved and neither duplicated nor destroyed', () => {
  const { state, bus, ships } = boot();

  // Give player two instances of the same module in inventory
  const inst1 = ships.nextInstanceId();
  const inst2 = ships.nextInstanceId();
  state.player.moduleInventory.push({ instanceId: inst1, defId: UTILITY_DEF });
  state.player.moduleInventory.push({ instanceId: inst2, defId: UTILITY_DEF });
  assert.equal(countTotalOwned(state, UTILITY_DEF), 2);

  // Fit the first instance into slot 5
  const fit1 = ships.fitModule({ shipIndex: 0, slotIndex: KESTREL_UTILITY_SLOT, instanceId: inst1 });
  assert.equal(fit1, true);
  assert.equal(state.player.ownedShips[0].fittings[KESTREL_UTILITY_SLOT], UTILITY_DEF);
  assert.equal(state.player.moduleInventory.length, 1);
  assert.equal(state.player.moduleInventory[0].instanceId, inst2, 'second instance remains in inventory');
  assert.equal(countTotalOwned(state, UTILITY_DEF), 2, 'total ownership of duplicate modules remains 2');

  // Unfit first instance
  const unfit1 = ships.unfitModule({ shipIndex: 0, slotIndex: KESTREL_UTILITY_SLOT });
  assert.equal(unfit1, true);
  assert.equal(state.player.moduleInventory.length, 2, 'both instances now in inventory');
  assert.equal(countTotalOwned(state, UTILITY_DEF), 2);
});
