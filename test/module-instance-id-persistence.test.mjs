import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ships as shipsProto } from '../src/systems/ships.js';

const SAVED_DEF_ID = 'mod_cargo_scanner_s';
const COLLECTED_DEF_ID = 'mod_market_data_s';
const KESTREL_UTILITY_SLOT = 5;

function collectLooseModule(system, state, bus, defId) {
  bus.emit('pickup:collected', {
    collectorId: state.playerId,
    kind: 'module',
    commodityId: defId,
    amount: 1,
  });
  return state.player.moduleInventory.at(-1);
}

async function continueThenCollect(tag) {
  const beforeState = createGameState(201);
  beforeState.playerId = 1;
  const beforeBus = createBus();
  const beforeModule = await import(`../src/systems/cargo.js?${tag}-before-continue`);
  const beforeCargo = Object.assign({}, beforeModule.cargo);
  beforeCargo.init({ state: beforeState, bus: beforeBus, helpers: {} });
  const savedItem = collectLooseModule(beforeCargo, beforeState, beforeBus, SAVED_DEF_ID);

  // A fresh module import models a new process, while the JSON copy models the player save payload.
  const restoredInventory = JSON.parse(JSON.stringify(beforeState.player.moduleInventory));
  const afterState = createGameState(201);
  afterState.playerId = 1;
  afterState.player.moduleInventory = restoredInventory;
  afterState.player.ownedShips = [{
    defId: 'ship_kestrel',
    fittings: Array(6).fill(null),
  }];
  const afterBus = createBus();
  const afterModule = await import(`../src/systems/cargo.js?${tag}-after-continue`);
  const afterCargo = Object.assign({}, afterModule.cargo);
  afterCargo.init({ state: afterState, bus: afterBus, helpers: {} });
  const collectedItem = collectLooseModule(afterCargo, afterState, afterBus, COLLECTED_DEF_ID);

  return { afterState, afterBus, savedItem, collectedItem };
}

test('a loose module collected after Continue cannot reuse an existing mi_N instance ID', async () => {
  const { afterState, savedItem, collectedItem } = await continueThenCollect('unique-id');

  assert.equal(savedItem.instanceId, 'mi_1', 'legacy mi_N IDs remain valid save data');
  assert.notEqual(collectedItem.instanceId, savedItem.instanceId);
  assert.equal(new Set(afterState.player.moduleInventory.map((item) => item.instanceId)).size, 2);
});

test('fitting the post-Continue pickup consumes that exact module, not the first restored match', async () => {
  const { afterState, afterBus, savedItem, collectedItem } = await continueThenCollect('fit-target');
  const ships = Object.assign({}, shipsProto);
  ships.init({ state: afterState, bus: afterBus, helpers: {} });

  assert.equal(ships.fitModule({
    slotIndex: KESTREL_UTILITY_SLOT,
    instanceId: collectedItem.instanceId,
  }), true);
  assert.equal(afterState.player.ownedShips[0].fittings[KESTREL_UTILITY_SLOT], COLLECTED_DEF_ID);
  assert.deepEqual(afterState.player.moduleInventory, [savedItem]);
});
