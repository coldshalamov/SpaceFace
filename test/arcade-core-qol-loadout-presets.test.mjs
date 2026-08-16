import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { save as savePrototype } from '../src/save/saveSystem.js';
import {
  LOADOUT_PRESET_LIMIT,
  normalizeLoadoutPresets,
  ships as shipsPrototype,
} from '../src/systems/ships.js';
import { presentLoadoutCapability } from '../src/ui/station/loadoutPresentation.js';

const UTILITY_SLOT = 5;
const CARGO_SLOT = 3;
const SCANNER = 'mod_cargo_scanner_s';
const MARKET = 'mod_market_data_s';
const CARGO_POD = 'mod_cargo_pod_m';

function cloneSystem(proto, extra = {}) {
  return Object.assign(Object.create(Object.getPrototypeOf(proto)), proto, extra);
}

function buildHarness({ docked = true, stationId = 'station_helios', fitted = MARKET, inventory = [SCANNER] } = {}) {
  const state = createGameState(0x5409);
  state.player.credits = 20_000;
  state.player.activeShipIndex = 0;
  state.player.ownedShips = [{
    defId: 'ship_kestrel',
    fittings: [null, null, null, null, null, fitted],
  }];
  state.player.moduleInventory = inventory.map((defId, index) => ({ instanceId: `mi_${index + 1}`, defId }));
  state.ui.docked = docked;
  state.ui.dockedStationId = stationId;
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  const ships = cloneSystem(shipsPrototype, { _instSeq: 0, _loadoutSeq: 0 });
  ships.init({ state, bus, helpers: {} });
  return { state, bus, ships, toasts };
}

test('loadout presets normalize to known hulls, preserve unavailable IDs, and honor the cap', () => {
  const rows = normalizeLoadoutPresets(
    Array.from({ length: LOADOUT_PRESET_LIMIT + 3 }, (_, index) => ({
      id: `preset_${index}`,
      name: index === 0 ? '  Tow   Work  ' : '',
      hullDefId: index === 1 ? 'ship_not_real' : 'ship_kestrel',
      fittings: [null, null, null, null, null, index === 2 ? 'not_real' : SCANNER],
      cargoPolicy: index === 3 ? 'reserve_quarter' : 'nope',
    })),
  );

  assert.equal(rows.length, LOADOUT_PRESET_LIMIT);
  assert.equal(rows[0].name, 'Tow Work');
  assert.equal(rows[0].cargoPolicy, 'carry_current');
  assert.equal(rows.some((row) => row.hullDefId === 'ship_not_real'), false);
  assert.equal(rows.find((row) => row.id === 'preset_2').fittings[UTILITY_SLOT], 'not_real');
  assert.match(
    presentLoadoutCapability('ship_kestrel', [null, null, null, null, null, SCANNER]),
    /fit with .*handling, .*operating mass, and a \d+u hold\./,
  );
});

test('loadout preset UI intents are station/outfitting gated', () => {
  const flight = buildHarness({ docked: false, stationId: null });
  flight.bus.emit('ui:saveLoadoutPreset', { shipIndex: 0, name: 'Survey' });
  assert.deepEqual(flight.state.player.loadoutPresets || [], []);
  assert.equal(flight.toasts.length, 1);
  assert.match(flight.toasts[0].text, /Dock|outfitting|shipyard/i);

  const dock = buildHarness();
  dock.bus.emit('ui:saveLoadoutPreset', { shipIndex: 0, name: 'Survey' });
  assert.equal(dock.state.player.loadoutPresets.length, 1);
  assert.equal(dock.state.player.loadoutPresets[0].name, 'Survey');
  assert.equal(dock.state.player.loadoutPresets[0].hullDefId, 'ship_kestrel');
  assert.equal(dock.state.player.loadoutPresets[0].fittings[UTILITY_SLOT], MARKET);
});

test('applying a preset swaps fitted and stored systems transactionally', () => {
  const h = buildHarness({ fitted: MARKET, inventory: [SCANNER] });
  h.state.player.loadoutPresets = [{
    id: 'survey',
    name: 'Survey',
    hullDefId: 'ship_kestrel',
    fittings: [null, null, null, null, null, SCANNER],
    cargoPolicy: 'carry_current',
  }];

  h.bus.emit('ui:applyLoadoutPreset', { shipIndex: 0, presetId: 'survey' });

  assert.equal(h.state.player.ownedShips[0].fittings[UTILITY_SLOT], SCANNER);
  assert.deepEqual(h.state.player.moduleInventory.map((item) => item.defId), [MARKET]);
  assert.equal(new Set(h.state.player.moduleInventory.map((item) => item.instanceId)).size, 1);
  assert.equal(h.toasts.at(-1).kind, 'success');
});

test('preset application refuses missing systems and cargo-overflow swaps without mutation', () => {
  const missing = buildHarness({ fitted: MARKET, inventory: [] });
  missing.state.player.loadoutPresets = [{
    id: 'survey',
    name: 'Survey',
    hullDefId: 'ship_kestrel',
    fittings: [null, null, null, null, null, SCANNER],
    cargoPolicy: 'carry_current',
  }];
  missing.bus.emit('ui:applyLoadoutPreset', { shipIndex: 0, presetId: 'survey' });
  assert.equal(missing.state.player.ownedShips[0].fittings[UTILITY_SLOT], MARKET);
  assert.deepEqual(missing.state.player.moduleInventory, []);
  assert.match(missing.toasts.at(-1).text, /Missing stored system/i);

  const unavailable = buildHarness({ fitted: MARKET, inventory: [SCANNER] });
  unavailable.state.player.loadoutPresets = [{
    id: 'retired-content',
    name: 'Old survey',
    hullDefId: 'ship_kestrel',
    fittings: [null, null, null, null, null, 'mod_no_longer_available'],
    cargoPolicy: 'carry_current',
  }];
  unavailable.bus.emit('ui:applyLoadoutPreset', { shipIndex: 0, presetId: 'retired-content' });
  assert.equal(unavailable.state.player.ownedShips[0].fittings[UTILITY_SLOT], MARKET);
  assert.deepEqual(unavailable.state.player.moduleInventory.map((item) => item.defId), [SCANNER]);
  assert.match(unavailable.toasts.at(-1).text, /Unavailable system.*mod_no_longer_available/i);

  const overflow = buildHarness({ fitted: null, inventory: [] });
  overflow.state.player.ownedShips[0].fittings[CARGO_SLOT] = CARGO_POD;
  overflow.state.player.cargo.items.cmdty_ore_iron = 70;
  overflow.state.player.cargo.usedVolume = 70;
  overflow.state.player.cargo.usedMass = 56;
  overflow.state.player.loadoutPresets = [{
    id: 'lean',
    name: 'Lean',
    hullDefId: 'ship_kestrel',
    fittings: [null, null, null, null, null, null],
    cargoPolicy: 'carry_current',
  }];
  overflow.bus.emit('ui:applyLoadoutPreset', { shipIndex: 0, presetId: 'lean' });
  assert.equal(overflow.state.player.ownedShips[0].fittings[CARGO_SLOT], CARGO_POD);
  assert.equal(overflow.state.player.moduleInventory.length, 0);
  assert.match(overflow.toasts.at(-1).text, /unload 30u first/i);

  const reserve = buildHarness({ fitted: MARKET, inventory: [] });
  reserve.state.player.cargo.usedVolume = 31;
  reserve.state.player.loadoutPresets = [{
    id: 'salvage-room',
    name: 'Salvage room',
    hullDefId: 'ship_kestrel',
    fittings: [null, null, null, null, null, MARKET],
    cargoPolicy: 'reserve_quarter',
  }];
  reserve.bus.emit('ui:applyLoadoutPreset', { shipIndex: 0, presetId: 'salvage-room' });
  assert.equal(reserve.state.player.ownedShips[0].fittings[UTILITY_SLOT], MARKET);
  assert.deepEqual(reserve.state.player.moduleInventory, []);
  assert.match(reserve.toasts.at(-1).text, /keeps 25%.*unload 1u first/i);
});

test('only the active hull can own the station action and Continue preserves bounded presets', () => {
  const h = buildHarness();
  h.state.player.ownedShips.push({
    defId: 'ship_kestrel',
    fittings: [null, null, null, null, null, SCANNER],
  });
  h.bus.emit('ui:saveLoadoutPreset', { shipIndex: 1, name: 'Inactive survey' });
  assert.equal((h.state.player.loadoutPresets || []).length, 0);
  assert.match(h.toasts.at(-1).text, /Make this hull active/i);

  for (let index = 0; index < LOADOUT_PRESET_LIMIT + 2; index += 1) {
    h.bus.emit('ui:saveLoadoutPreset', { shipIndex: 0, name: `Build ${index + 1}` });
  }
  assert.equal(h.state.player.loadoutPresets.length, LOADOUT_PRESET_LIMIT);

  const save = Object.create(savePrototype);
  save.init({ state: h.state, bus: h.bus, helpers: {}, registry: { get() { return null; } } });
  const savedPlayer = save._serializePlayer();
  h.state.player.loadoutPresets = [];
  save._restorePlayer(structuredClone(savedPlayer));
  assert.equal(h.state.player.loadoutPresets.length, LOADOUT_PRESET_LIMIT);
  assert.equal(h.state.player.loadoutPresets[0].name, 'Build 8');
});
