// NXB-032 — a recovered unique module keeps its identity and condition through
// fitting and resale. owned.fittings[] owns occupancy; owned.fittedInstances owns
// the instance record (id + provenance/condition) of that occupancy.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ships as shipsPrototype } from '../src/systems/ships.js';
import { formatInstanceProvenance } from '../src/systems/shipLedger.js';

function makeHarness(seed = 1) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 12;
  state.tick = 720;
  state.playerId = 1;
  state.player.moduleInventory = [];
  state.player.researchedNodes = ['tech_drive_tuning'];
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 400, capMass: 1000 };
  // kestrel slots: weapon S, shield S, engine M, cargo S, mining S, utility S, thruster S
  state.player.ownedShips = [
    { defId: 'ship_kestrel', fittings: [null, null, null, null, null, null, null] },
  ];
  state.player.activeShipIndex = 0;
  const bus = createBus();
  const ships = { ...shipsPrototype };
  ships.init({ state, bus, helpers: {} });
  return { state, bus, ships };
}

const ENGINE_SLOT = 2;

test('NXB-032: fit -> unfit -> refit keeps the same instanceId and provenance', () => {
  const { state, ships } = makeHarness();
  assert.equal(ships.grantModule({
    defId: 'mod_engine_ion_m',
    reason: 'unique-wreck:wreck_test:choice',
    provenance: 'Recovered: Wreck of the Choir',
  }), true);
  const item = state.player.moduleInventory[0];
  const id = item.instanceId;
  assert.equal(item.provenance, 'Recovered: Wreck of the Choir');

  assert.equal(ships.fitModule({ shipIndex: 0, slotIndex: ENGINE_SLOT, instanceId: id }), true);
  assert.equal(state.player.moduleInventory.length, 0);
  const owned = state.player.ownedShips[0];
  assert.equal(owned.fittings[ENGINE_SLOT], 'mod_engine_ion_m');
  assert.equal(owned.fittedInstances[ENGINE_SLOT].instanceId, id);
  assert.equal(owned.fittedInstances[ENGINE_SLOT].provenance, 'Recovered: Wreck of the Choir');

  assert.equal(ships.unfitModule({ shipIndex: 0, slotIndex: ENGINE_SLOT }), true);
  assert.equal(state.player.moduleInventory.length, 1);
  assert.equal(state.player.moduleInventory[0].instanceId, id);
  assert.equal(state.player.moduleInventory[0].provenance, 'Recovered: Wreck of the Choir');
  assert.equal(formatInstanceProvenance(state.player.moduleInventory[0]), 'Recovered: Wreck of the Choir');
});

test('NXB-032: fitting over an occupied slot returns the displaced instance, not a copy', () => {
  const { state, ships } = makeHarness();
  ships.grantModule({ defId: 'mod_engine_ion_m', provenance: 'Recovered: Wreck A' });
  ships.grantModule({ defId: 'mod_engine_fusion_m' });
  const [a, b] = state.player.moduleInventory;

  assert.equal(ships.fitModule({ shipIndex: 0, slotIndex: ENGINE_SLOT, instanceId: a.instanceId }), true);
  assert.equal(ships.fitModule({ shipIndex: 0, slotIndex: ENGINE_SLOT, instanceId: b.instanceId }), true);

  const owned = state.player.ownedShips[0];
  assert.equal(owned.fittings[ENGINE_SLOT], 'mod_engine_fusion_m');
  assert.equal(owned.fittedInstances[ENGINE_SLOT].instanceId, b.instanceId);
  // A came back to the hold as the SAME instance — exactly one copy, provenance intact.
  assert.equal(state.player.moduleInventory.length, 1);
  assert.equal(state.player.moduleInventory[0].instanceId, a.instanceId);
  assert.equal(state.player.moduleInventory[0].provenance, 'Recovered: Wreck A');
});

test('NXB-032: selling a ship returns fitted instances with their identity intact', () => {
  const { state, ships } = makeHarness();
  state.player.ownedShips.push(
    { defId: 'ship_kestrel', fittings: [null, null, null, null, null, null, null] },
  );
  ships.grantModule({ defId: 'mod_engine_ion_m', provenance: 'Recovered: Wreck B' });
  const id = state.player.moduleInventory[0].instanceId;
  assert.equal(ships.fitModule({ shipIndex: 1, slotIndex: ENGINE_SLOT, instanceId: id }), true);

  assert.equal(ships.sellShip(1), true);
  assert.equal(state.player.ownedShips.length, 1);
  assert.equal(state.player.moduleInventory.length, 1);
  assert.equal(state.player.moduleInventory[0].instanceId, id);
  assert.equal(state.player.moduleInventory[0].provenance, 'Recovered: Wreck B');
});

test('NXB-032: legacy save without fittedInstances mints once, never duplicates', () => {
  const { state, ships } = makeHarness();
  // Simulate an old save: occupancy exists, no identity map.
  const owned = state.player.ownedShips[0];
  owned.fittings[ENGINE_SLOT] = 'mod_engine_ion_m';
  delete owned.fittedInstances;

  assert.equal(ships.unfitModule({ shipIndex: 0, slotIndex: ENGINE_SLOT }), true);
  assert.equal(state.player.moduleInventory.length, 1);
  const minted = state.player.moduleInventory[0];
  assert.equal(minted.defId, 'mod_engine_ion_m');
  assert.ok(minted.instanceId, 'minted a real id for the legacy occupancy');
  assert.equal(formatInstanceProvenance(minted), 'unrecorded');

  // Refit keeps that minted identity — still exactly one copy in the world.
  assert.equal(ships.fitModule({ shipIndex: 0, slotIndex: ENGINE_SLOT, instanceId: minted.instanceId }), true);
  assert.equal(state.player.moduleInventory.length, 0);
  assert.equal(state.player.ownedShips[0].fittedInstances[ENGINE_SLOT].instanceId, minted.instanceId);
});

test('NXB-032: serialized round-trip preserves fittedInstances (save shape)', () => {
  const { state, ships } = makeHarness();
  ships.grantModule({ defId: 'mod_engine_ion_m', provenance: 'Recovered: Wreck C' });
  const id = state.player.moduleInventory[0].instanceId;
  assert.equal(ships.fitModule({ shipIndex: 0, slotIndex: ENGINE_SLOT, instanceId: id }), true);

  const restored = JSON.parse(JSON.stringify(state.player.ownedShips));
  assert.equal(restored[0].fittedInstances[ENGINE_SLOT].instanceId, id);
  assert.equal(restored[0].fittedInstances[ENGINE_SLOT].provenance, 'Recovered: Wreck C');
});

test('NXB-032: a stale identity record cannot resurrect a cleared slot', () => {
  const { state, ships } = makeHarness();
  ships.grantModule({ defId: 'mod_engine_ion_m' });
  const id = state.player.moduleInventory[0].instanceId;
  ships.fitModule({ shipIndex: 0, slotIndex: ENGINE_SLOT, instanceId: id });

  const owned = state.player.ownedShips[0];
  // A direct writer (crafting/survival) clears occupancy bypassing unfitModule.
  owned.fittings[ENGINE_SLOT] = null;
  // Reconcile must drop the orphaned record — the module is gone, not unfit.
  assert.equal(ships._reconcileFittedInstance(owned, ENGINE_SLOT), null);
  assert.equal(owned.fittedInstances[ENGINE_SLOT], undefined);
});
