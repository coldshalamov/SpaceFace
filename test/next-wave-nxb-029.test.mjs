// NXB-029 — a named loadout prepares owned equipment atomically across modules
// and the bomb rack: preview the whole diff, refuse missing/incompatible parts
// with the current fit intact, then commit through the ships + bombs owners.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ships as shipsPrototype } from '../src/systems/ships.js';
import { bombs as bombsPrototype } from '../src/systems/bombs.js';

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
  state.player.credits = 10000;
  // Docked at a berth with outfitting services — the rack intents' berth gate.
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  const bus = createBus();
  // Minimal credit writer honoring the economy commit-callback contract.
  bus.on('economy:chargeCredits', (req) => {
    if (!req || typeof req !== 'object') return;
    if (req.amount > 0 && state.player.credits < req.amount) { req.result = false; return; }
    if (typeof req.commit === 'function') req.commit();
    if (req.amount > 0) state.player.credits -= req.amount;
    req.result = true;
  });
  const ships = { ...shipsPrototype };
  const bombs = { ...bombsPrototype };
  ships.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  bombs.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return { state, bus, ships, bombs };
}

const ENGINE_SLOT = 2;

function setRack(state, cells, stock = {}) {
  state.bombs = state.bombs || {};
  state.bombs.rack = { sockets: cells.length, cells: cells.map((c) => (c ? { ...c } : null)) };
  state.bombs.stock = { ...stock };
}

test('NXB-029: a saved preset captures the rack layout as payload ids, not rounds', () => {
  const { state, ships } = makeHarness();
  setRack(state, [{ id: 'bomb_frag', count: 2 }, { id: 'bomb_emp', count: 0 }]);
  assert.equal(ships.saveLoadoutPreset({ shipIndex: 0, presetId: 'p_alpha' }), true);
  const preset = state.player.loadoutPresets.find((r) => r.id === 'p_alpha');
  assert.deepEqual(preset.rackPayloadIds, ['bomb_frag', 'bomb_emp']);
  assert.equal(preset.rackSockets, 2);
  assert.equal(preset.rackPayloadIds.join(',').match(/\d/), null, 'no round counts serialized');
});

test('NXB-029: apply commits modules and rack through their owners, conserving both', () => {
  const { state, ships } = makeHarness();
  setRack(state, [{ id: 'bomb_frag', count: 3 }, { id: 'bomb_emp', count: 1 }]);
  ships.grantModule({ defId: 'mod_engine_ion_m', provenance: 'Recovered: Wreck D' });
  ships.grantModule({ defId: 'mod_engine_fusion_m' });
  const ion = state.player.moduleInventory[0];
  const fus = state.player.moduleInventory[1];

  // Preset A: ion + frag lead cell. Preset B: fusion + emp lead cell.
  ships.fitModule({ shipIndex: 0, slotIndex: ENGINE_SLOT, instanceId: ion.instanceId });
  setRack(state, [{ id: 'bomb_frag', count: 3 }, { id: 'bomb_emp', count: 1 }]);
  assert.equal(ships.saveLoadoutPreset({ shipIndex: 0, presetId: 'p_alpha' }), true);
  ships.unfitModule({ shipIndex: 0, slotIndex: ENGINE_SLOT });
  ships.fitModule({ shipIndex: 0, slotIndex: ENGINE_SLOT, instanceId: fus.instanceId });
  setRack(state, [{ id: 'bomb_emp', count: 1 }, { id: 'bomb_frag', count: 3 }]);
  assert.equal(ships.saveLoadoutPreset({ shipIndex: 0, presetId: 'p_beta' }), true);

  // Back on alpha's hardware; apply alpha's build.
  ships.unfitModule({ shipIndex: 0, slotIndex: ENGINE_SLOT });
  ships.fitModule({ shipIndex: 0, slotIndex: ENGINE_SLOT, instanceId: ion.instanceId });
  setRack(state, [{ id: 'bomb_frag', count: 2 }, { id: 'bomb_emp', count: 1 }]);

  // Applying BETA: fusion moves in (from hold), ion goes back to the hold as itself.
  assert.equal(ships.applyLoadoutPreset({ shipIndex: 0, presetId: 'p_beta' }), true);
  const owned = state.player.ownedShips[0];
  assert.equal(owned.fittings[ENGINE_SLOT], 'mod_engine_fusion_m');
  assert.equal(owned.fittedInstances[ENGINE_SLOT].instanceId, fus.instanceId);
  const back = state.player.moduleInventory.find((m) => m.defId === 'mod_engine_ion_m');
  assert.equal(back.instanceId, ion.instanceId, 'displaced module keeps its instance');
  assert.equal(back.provenance, 'Recovered: Wreck D');
  // Rack: beta's layout (emp lead, frag second) committed through the bombs owner.
  assert.equal(state.bombs.rack.cells[0].id, 'bomb_emp');
  assert.equal(state.bombs.rack.cells[1].id, 'bomb_frag');
  const totalRounds = state.bombs.rack.cells.reduce((n, c) => n + (c ? c.count : 0), 0)
    + (state.bombs.stock.bomb_frag || 0) + (state.bombs.stock.bomb_emp || 0);
  assert.ok(totalRounds >= 4, `loaded ammunition conserved (got ${totalRounds})`);
});

test('NXB-029: a missing required module refuses the whole apply, rack included', () => {
  const { state, ships } = makeHarness();
  setRack(state, [{ id: 'bomb_frag', count: 3 }, null]);
  ships.grantModule({ defId: 'mod_engine_ion_m' });
  const ion = state.player.moduleInventory[0];
  ships.fitModule({ shipIndex: 0, slotIndex: ENGINE_SLOT, instanceId: ion.instanceId });
  assert.equal(ships.saveLoadoutPreset({ shipIndex: 0, presetId: 'p_alpha' }), true);
  // Player sells/jettisons the ion engine, then asks for the build back.
  ships.unfitModule({ shipIndex: 0, slotIndex: ENGINE_SLOT });
  state.player.moduleInventory.length = 0;
  const fittingsBefore = state.player.ownedShips[0].fittings.slice();
  const cellsBefore = JSON.stringify(state.bombs.rack.cells);

  assert.equal(ships.applyLoadoutPreset({ shipIndex: 0, presetId: 'p_alpha' }), false);
  assert.deepEqual(state.player.ownedShips[0].fittings, fittingsBefore, 'fit unchanged');
  assert.equal(JSON.stringify(state.bombs.rack.cells), cellsBefore, 'rack untouched');
});

test('NXB-029: an unplannable rack layout refuses before the module swap', () => {
  const { state, ships } = makeHarness();
  setRack(state, [{ id: 'bomb_frag', count: 3 }, null]);
  assert.equal(ships.saveLoadoutPreset({ shipIndex: 0, presetId: 'p_alpha' }), true);
  // Corrupt the stored layout — a family the catalog does not know.
  const preset = state.player.loadoutPresets.find((r) => r.id === 'p_alpha');
  preset.rackPayloadIds = ['bomb_not_real'];
  const fittingsBefore = state.player.ownedShips[0].fittings.slice();
  const cellsBefore = JSON.stringify(state.bombs.rack.cells);

  assert.equal(ships.applyLoadoutPreset({ shipIndex: 0, presetId: 'p_alpha' }), false);
  assert.deepEqual(state.player.ownedShips[0].fittings, fittingsBefore);
  assert.equal(JSON.stringify(state.bombs.rack.cells), cellsBefore);
});

test('NXB-029: repeated apply of the same preset is idempotent', () => {
  const { state, ships } = makeHarness();
  setRack(state, [{ id: 'bomb_frag', count: 3 }, null]);
  ships.grantModule({ defId: 'mod_engine_ion_m' });
  const ion = state.player.moduleInventory[0];
  ships.fitModule({ shipIndex: 0, slotIndex: ENGINE_SLOT, instanceId: ion.instanceId });
  assert.equal(ships.saveLoadoutPreset({ shipIndex: 0, presetId: 'p_alpha' }), true);
  assert.equal(ships.applyLoadoutPreset({ shipIndex: 0, presetId: 'p_alpha' }), true);
  assert.equal(ships.applyLoadoutPreset({ shipIndex: 0, presetId: 'p_alpha' }), true);
  const owned = state.player.ownedShips[0];
  assert.equal(owned.fittedInstances[ENGINE_SLOT].instanceId, ion.instanceId);
  assert.equal(state.player.moduleInventory.length, 0, 'no duplicated modules');
});
