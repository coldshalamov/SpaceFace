// NXI-128 — consume (sale/craft) takes the selected instance, not an arbitrary duplicate.
//
// When two valid instances share a catalog id, eating "the first match" can destroy a
// recovered/worn record while a pristine twin sits untouched. consumeOneModule now:
//   1. honors an explicit { instanceId } selection exactly (mismatched/wrong-id refuses),
//   2. defaults to the plainest duplicate — a pristine catalog copy goes before an
//      identity-bearing instance, so the recorded one survives,
//   3. routes a fitted consume through ships.takeFittedModuleInstance so the fitted
//      record is eaten by its owner instead of orphaned on a null slot.
import test from 'node:test';
import assert from 'node:assert/strict';

import { crafting } from '../src/systems/crafting.js';
import { ships as shipsProto, buildSlotList } from '../src/systems/ships.js';
import { instanceIdentityText } from '../src/systems/shipLedger.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { SHIPS } from '../src/data/ships.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));

function bootCrafting() {
  const state = { player: { moduleInventory: [], ownedShips: [] }, crafting: { queues: {} } };
  const inst = Object.create(crafting);
  inst.init({ state, bus: { emit() {} }, registry: { get() { return null; } } });
  return { state, inst };
}

function bootShips() {
  const state = createGameState(4242);
  state.playerId = 1;
  state.player.moduleInventory = [];
  state.player.ownedShips = [{
    defId: 'ship_kestrel',
    fittings: Array(buildSlotList(SHIP_BY_ID.get('ship_kestrel')).length).fill(null),
    fittedInstances: {},
  }];
  state.player.activeShipIndex = 0;
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  const bus = createBus();
  const ships = Object.assign({}, shipsProto);
  ships.init({ state, bus, helpers: {} });
  return { state, bus, ships };
}

test('loose consume keeps the recorded instance and eats its anonymous twin', () => {
  const { state, inst } = bootCrafting();
  const recovered = { instanceId: 'i_recovered', defId: 'mod_a', provenance: 'Recovered: wreck of the Pale Kestrel', condition: 'worn' };
  const pristine = { instanceId: 'i_pristine', defId: 'mod_a' };
  // The identity-bearing record sits FIRST — first-match would eat it; the new default must not.
  state.player.moduleInventory.push(recovered, pristine);

  const consumed = inst.consumeOneModule(state.player, 'mod_a');
  assert.equal(consumed.instanceId, 'i_pristine', 'the plain duplicate is consumed');
  assert.equal(state.player.moduleInventory.length, 1);
  assert.equal(state.player.moduleInventory[0].instanceId, 'i_recovered',
    'instance B survives with condition/provenance intact');
  assert.equal(instanceIdentityText(state.player.moduleInventory[0]), 'Recovered: wreck of the Pale Kestrel · worn');
});

test('an explicit instanceId selection consumes exactly that record — or refuses', () => {
  const { state, inst } = bootCrafting();
  state.player.moduleInventory.push(
    { instanceId: 'i_a', defId: 'mod_a', provenance: 'Recovered: Old Faithful' },
    { instanceId: 'i_b', defId: 'mod_a' },
  );
  const consumed = inst.consumeOneModule(state.player, 'mod_a', { instanceId: 'i_a' });
  assert.equal(consumed.instanceId, 'i_a', 'the selected instance is the one consumed');
  assert.equal(state.player.moduleInventory[0].instanceId, 'i_b');

  // A selection naming a different def — or no live instance — refuses instead of drifting.
  state.player.moduleInventory.push({ instanceId: 'i_c', defId: 'mod_b' });
  assert.equal(inst.consumeOneModule(state.player, 'mod_a', { instanceId: 'i_c' }), null,
    'selected instance of the wrong def cannot answer');
  assert.equal(inst.consumeOneModule(state.player, 'mod_a', { instanceId: 'i_ghost' }), null,
    'a dead selection cannot consume an arbitrary duplicate');
  assert.equal(state.player.moduleInventory.length, 2, 'refusals consume nothing');
});

test('a fitted consume eats the record the slot carried — no orphan on a null fitting', () => {
  const { state, ships } = bootShips();
  const p = state.player;
  const owned = p.ownedShips[p.activeShipIndex];
  const slotIndex = 5; // kestrel utility slot (same as the NXI-127 fixture)
  const defId = 'mod_cargo_scanner_s';
  p.moduleInventory.push({
    instanceId: 'mi_fitted', defId,
    provenance: 'recovered from wreck', condition: 0.62,
  });
  assert.equal(ships.fitModule({ shipIndex: 0, slotIndex, instanceId: 'mi_fitted' }), true);
  assert.equal(owned.fittedInstances[slotIndex].instanceId, 'mi_fitted');

  const inst = Object.create(crafting);
  inst.init({
    state,
    bus: { emit() {} },
    registry: { get: (name) => (name === 'ships' ? ships : null) },
  });

  const consumed = inst.consumeOneModule(p, defId);
  assert.ok(consumed, 'the fitted instance is consumable');
  assert.equal(consumed.instanceId, 'mi_fitted',
    'the exact slot record leaves — not a minted stand-in for the same defId');
  assert.equal(consumed.provenance, 'recovered from wreck');
  assert.equal(owned.fittings[slotIndex], null);
  assert.equal(owned.fittedInstances[slotIndex], undefined,
    'no stale identity record remains under a null occupancy');

  // Neighbor: unfit still returns the record to the hold through its own owner path.
  p.moduleInventory.push({ instanceId: 'mi_second', defId });
  assert.equal(ships.fitModule({ shipIndex: 0, slotIndex, instanceId: 'mi_second' }), true);
  assert.equal(ships.unfitModule({ shipIndex: 0, slotIndex }), true);
  assert.ok(p.moduleInventory.some((m) => m && m.instanceId === 'mi_second'),
    'unfit still lands the same record in the hold');
});
