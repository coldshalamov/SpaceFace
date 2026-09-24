// Shipworks outfitting — the hold's way back into a slot. unfitModule strands an owned module in
// player.moduleInventory; the chooser's "In your hold" rows emit ui:fitModule with the row's
// instanceId and the VIEWED hull's index (fleet view outfits the ship on screen, not always the
// active one). The intent has been subscribed since the backend shipped — this pins the wiring.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ships as shipsProto, buildSlotList } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));

const HERE = dirname(fileURLToPath(import.meta.url));
const UTILITY_DEF = 'mod_cargo_scanner_s';
const UTILITY_DEF_2 = 'mod_market_data_s';
const KESTREL_UTILITY_SLOT = 5;

function boot(defIds = ['ship_kestrel']) {
  const state = createGameState(151);
  state.playerId = 1;
  state.player.credits = 1_000_000;
  state.player.moduleInventory = [];
  state.player.ownedShips = defIds.map((defId) => ({
    defId,
    fittings: Array(buildSlotList(SHIP_BY_ID.get(defId)).length).fill(null),
  }));
  state.player.activeShipIndex = 0;
  // The outfit gate opens at a berth with shipyard/module_craft service.
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  const bus = createBus();
  const ships = Object.assign({}, shipsProto);
  ships.init({ state, bus, helpers: {} });
  return { state, bus, ships };
}

test('unfit strands the module in the hold; ui:fitModule with the row instanceId brings it back', () => {
  const { state, bus } = boot();
  state.player.ownedShips[0].fittings[KESTREL_UTILITY_SLOT] = UTILITY_DEF;

  bus.emit('ui:unfitModule', { shipIndex: 0, slotIndex: KESTREL_UTILITY_SLOT });
  assert.equal(state.player.ownedShips[0].fittings[KESTREL_UTILITY_SLOT], null);
  assert.equal(state.player.moduleInventory.length, 1, 'the removed module lands in the hold');
  const held = state.player.moduleInventory[0];
  assert.equal(held.defId, UTILITY_DEF);
  assert.ok(held.instanceId, 'the hold row carries the instanceId the fit intent needs');

  bus.emit('ui:fitModule', {
    shipIndex: 0,
    slotIndex: KESTREL_UTILITY_SLOT,
    instanceId: held.instanceId,
  });
  assert.equal(state.player.ownedShips[0].fittings[KESTREL_UTILITY_SLOT], UTILITY_DEF);
  assert.equal(state.player.moduleInventory.length, 0, 'the consumed instance leaves the hold');
});

test('the chooser outfits the viewed hull — fit/unfit/buy honor shipIndex, never the active ship by default', () => {
  const { state, bus } = boot(['ship_kestrel', 'ship_kestrel']);
  state.player.moduleInventory.push({ instanceId: 'mi_held_1', defId: UTILITY_DEF });

  bus.emit('ui:fitModule', { shipIndex: 1, slotIndex: KESTREL_UTILITY_SLOT, instanceId: 'mi_held_1' });
  assert.equal(state.player.ownedShips[1].fittings[KESTREL_UTILITY_SLOT], UTILITY_DEF,
    'shipIndex lands the fit on the viewed hull');
  assert.equal(state.player.ownedShips[0].fittings[KESTREL_UTILITY_SLOT], null,
    'the active hull is untouched');
  assert.equal(state.player.moduleInventory.length, 0);

  bus.emit('ui:unfitModule', { shipIndex: 1, slotIndex: KESTREL_UTILITY_SLOT });
  assert.equal(state.player.ownedShips[1].fittings[KESTREL_UTILITY_SLOT], null);
  assert.equal(state.player.moduleInventory.length, 1);

  bus.emit('ui:buyModule', { defId: UTILITY_DEF_2, fitSlotIndex: KESTREL_UTILITY_SLOT, shipIndex: 1 });
  assert.equal(state.player.ownedShips[1].fittings[KESTREL_UTILITY_SLOT], UTILITY_DEF_2,
    'a buy-and-fit on the viewed hull does not leak onto the active hull');
  assert.equal(state.player.ownedShips[0].fittings[KESTREL_UTILITY_SLOT], null);
});

test('the chooser emits ui:fitModule for hold rows — shipIndex, slot, and instanceId all present', () => {
  const src = readFileSync(join(HERE, '../src/ui/station/screens/shipworks.js'), 'utf8');
  // The dead seam was exactly this: unfit emitted, fit never did. Pin all three payload fields
  // and the wrong-ship discipline on the sibling intents in the same handler.
  assert.ok(/data-fit-inv/.test(src), 'hold rows carry a fit verb');
  assert.ok(/emit\('ui:fitModule',\s*\{[^}]*shipIndex:\s*viewIdx[^}]*instanceId/s.test(src),
    'ui:fitModule carries the viewed hull and the row instanceId');
  assert.ok(/emit\('ui:unfitModule',\s*\{[^}]*shipIndex:\s*viewIdx/s.test(src),
    'ui:unfitModule outfits the viewed hull, not always the active one');
  assert.ok(/emit\('ui:buyModule',\s*\{[^}]*shipIndex:\s*viewIdx/s.test(src),
    'ui:buyModule fits the viewed hull, not always the active one');
  // Refusals are rendered in words, never silently omitted or left as dead buttons.
  assert.ok(/stationShopOffer\(d,\s*shopStationId\)/.test(src),
    'hold rows refuse research-locked modules the way the backend does');
  assert.ok(/mountRefusal\(slot,\s*d\)/.test(src),
    'hold rows refuse right-size/wrong-mount weapons in words like the buy list');
  assert.ok(/typeof item\.instanceId !== 'string'/.test(src),
    'rows without a usable instanceId never become a dead Fit button');
});
