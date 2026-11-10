// INFERENCE VERB-09 — Helios Station is a standing local source of impulse charges.
//
// Done-check: "A new game can buy `cmdty_impulse_charge` at Helios Station."
// Production slice: the capital's `military` secondary role makes it a genuine producer of
// impulse charges, so the starter station deepens/cheapens local stock for the combat verb
// instead of relying on the neutral every-commodity listing.
//
// Run: node --test test/inference-verb-09-helios-impulse-charge.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REGIONAL_ECONOMY_PROFILES,
  getRegionalEconomyProfile,
  MAX_LINES_PER_SIDE,
} from '../src/data/regionalEconomyProfiles.js';
import {
  pressureRecipesForRegion,
  validateRegionalSupplyCatalog,
  REGIONAL_CAUSE_TAGS,
} from '../src/economy/regionalSupply.js';
import { economy } from '../src/systems/economy.js';

const SECTOR = 'sector_helios_prime';
const STATION = 'station_helios';
const CMDTY = 'cmdty_impulse_charge';
const LOT_UNITS = 16; // economyDerived.js reference lot for cmdty_impulse_charge

function makeBus() {
  const handlers = new Map();
  return {
    on(event, handler) {
      const list = handlers.get(event) || [];
      list.push(handler);
      handlers.set(event, list);
      return () => this.off(event, handler);
    },
    off(event, handler) {
      handlers.set(event, (handlers.get(event) || []).filter((entry) => entry !== handler));
    },
    emit(event, payload) {
      for (const handler of [...(handlers.get(event) || [])]) handler(payload);
    },
  };
}

function boot() {
  const bus = makeBus();
  const state = {
    mode: 'flight', simTime: 0, meta: { seed: 0x5face },
    player: {
      credits: 10000,
      cargo: { items: {}, capVolume: 100, usedVolume: 0 },
      marketMemory: {}, tradeLedger: [], tradeLots: {},
    },
    economy: {},
    conflicts: {},
    sectorSim: { field: { nodes: {} } },
    world: { currentSectorId: SECTOR, sectors: { [SECTOR]: { owner: 'faction_scn' } } },
    ui: {}, nav: {}, entities: new Map(), entityList: [],
  };
  const econ = { ...economy };
  econ.init({ state, bus, helpers: {}, registry: { get: () => null } });
  econ.newGame();
  return { state, bus, econ };
}

test('Helios profile authors impulse charges as a produced line', () => {
  const helios = REGIONAL_ECONOMY_PROFILES.find((p) => p.sectorId === SECTOR);
  assert.ok(helios, 'Helios regional profile exists');
  const line = helios.produces.find((entry) => entry.commodityId === CMDTY);
  assert.ok(line, 'Helios produces cmdty_impulse_charge');
  assert.ok(line.weight > 0 && line.weight <= 1, 'produce line carries a positive weight');
  assert.ok(
    helios.produces.length <= MAX_LINES_PER_SIDE,
    `produces stays within the ${MAX_LINES_PER_SIDE}-line recipe cap`,
  );

  const result = validateRegionalSupplyCatalog();
  if (!result.ok) console.error(result.errors.join('\n'));
  assert.equal(result.ok, true, 'authored catalog validates against live commodity/station roles');
});

test('the authored profile materializes as a route-surplus produce recipe at Helios', () => {
  const recipes = pressureRecipesForRegion(SECTOR);
  const recipe = recipes.find((r) => r.commodityId === CMDTY);
  assert.ok(recipe, 'a pressure recipe exists for cmdty_impulse_charge');
  assert.equal(recipe.role, 'produce');
  assert.equal(recipe.stationId, STATION);
  assert.equal(recipe.sectorId, SECTOR);
  assert.equal(recipe.causeTag, REGIONAL_CAUSE_TAGS.ROUTE_SURPLUS);
  assert.equal(recipe.identityTag, REGIONAL_CAUSE_TAGS.REGIONAL_PRODUCTION);
  assert.ok(recipe.pressure < 0, 'produce pressure is negative (local surplus / cheaper stock)');
  assert.ok(recipe.units >= 1, 'recipe carries at least one stock-pressure unit');
});

test('a fresh game can buy a full impulse-charge lot at Helios, and it stays supplyable', () => {
  const { state, econ } = boot();
  try {
    const getEntry = () => state.economy.markets[STATION] && state.economy.markets[STATION][CMDTY];

    const entry = getEntry();
    assert.ok(entry, 'Helios trades cmdty_impulse_charge on a new game');

    const openingQuote = econ.quote(STATION, CMDTY, 'buy', LOT_UNITS);
    assert.equal(openingQuote.ok, true, 'new game can buy a full reference lot');
    assert.ok(openingQuote.unitAvg > 0 && openingQuote.total > 0);
    assert.ok(entry.stock >= LOT_UNITS, 'opening stock covers a full lot');

    // Simulate half an hour of the live economic tick; the authored produce recipe keeps the
    // local book at or above the neutral floor rather than draining it.
    const openStock = entry.stock;
    for (let i = 0; i < 360; i++) {
      state.simTime += 5;
      econ.econTick(5, state);
    }
    assert.ok(entry.stock >= LOT_UNITS, 'stock still covers a full lot after 30 simulated minutes');
    assert.ok(entry.stock >= openStock, 'regional production does not drain the starter listing');

    const laterQuote = econ.quote(STATION, CMDTY, 'buy', LOT_UNITS);
    assert.equal(laterQuote.ok, true, 'still buyable after the region settles');
  } finally {
    economy._instance = null;
  }
});
