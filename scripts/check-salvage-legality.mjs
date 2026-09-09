// BP-01.1 packet SALVAGE_PERMIT_AND_FINES.
//
// Contract:
//   - Only military/classified wreck salvage maps to a restricted salvage commodity.
//   - Common debris remains ordinary salvage.
//   - The existing economy.runScan path catches/confiscates/fines restricted salvage.
//   - Blackmarket laundering clears the restricted cargo through the shipped sell path.
//   - No new fine path and no edits to economy.js/cargo.js/salvage.js.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { COMMODITIES } from '../src/data/commodities.js';
import { economy } from '../src/systems/economy.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/data/salvageLegality.js', import.meta.url)),
  'src/data/salvageLegality.js exists');

const dataMod = await import('../src/data/salvageLegality.js');
const {
  CLASSIFIED_SALVAGE_COMMODITY_ID,
  COMMON_SALVAGE_COMMODITY_ID,
  restrictedSalvageForWreck,
  salvagePoolForWreck,
  canLaunderSalvageAtStation,
} = dataMod;

assert.equal(CLASSIFIED_SALVAGE_COMMODITY_ID, 'cmdty_classified_salvage',
  'classified salvage commodity id is stable');

const classifiedDef = COMMODITIES.find((c) => c.id === CLASSIFIED_SALVAGE_COMMODITY_ID);
const commonDef = COMMODITIES.find((c) => c.id === COMMON_SALVAGE_COMMODITY_ID);
assert.ok(classifiedDef, 'classified salvage commodity exists in the economy catalog');
assert.equal(classifiedDef.category, 'salvage', 'classified salvage stays in the salvage category');
assert.equal(classifiedDef.legality, 'restricted', 'classified salvage uses shipped restricted scan tier');
assert.ok(classifiedDef.fineMult > 0, 'classified salvage has a fine multiplier');
assert.ok(commonDef && commonDef.legality === 'legal', 'ordinary salvage remains legal');

function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in salvage-legality path'); };
  Date.now = () => { throw new Error('Date.now in salvage-legality path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  const bus = {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, p) { emitted.push({ evt, p }); for (const fn of (handlers.get(evt) || []).slice()) fn(p); },
  };
  return { bus, emitted };
}

function makeWreck(wreckClass, parentType = 'debris') {
  return {
    id: 42,
    type: 'wreck',
    data: {
      parentType,
      wreckClass,
      salvagePool: { cmdty_scrap_metal: 2, cmdty_salvage_electronics: 2 },
    },
  };
}

function makeEconomyState(items) {
  return {
    meta: { seed: 505 },
    simTime: 10,
    playerId: 1,
    player: {
      credits: 5000,
      debt: 0,
      bounty: 0,
      cargo: {
        items: { ...items },
        capVolume: 100,
        capMass: 100,
        usedVolume: Object.values(items).reduce((a, b) => a + b, 0),
        usedMass: Object.values(items).reduce((a, b) => a + b, 0),
      },
      stats: {},
    },
    factions: { faction_scn: { rep: 0 }, faction_quiet: { rep: 0 } },
    entities: new Map(),
    world: { currentSectorId: 'sector_tethys_junction' },
    economy: { markets: {}, cycles: {}, econEvents: [], econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 }, marketIntel: {} },
  };
}

function initEconomy(state, bus) {
  const sys = { ...economy };
  sys.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  sys._rng = () => 0; // force the shipped scan roll to catch restricted cargo deterministically
  return sys;
}

guarded(testMilitaryWreckMapsToRestrictedCargoOnly);
guarded(testRestrictedSalvageUsesShippedScanFineAndConfiscation);
guarded(testBlackmarketLaunderingClearsRestrictedSalvage);

console.log('Salvage-legality checks OK');

function testMilitaryWreckMapsToRestrictedCargoOnly() {
  const military = makeWreck('military');
  const common = makeWreck('fresh');
  const parentMilitary = makeWreck(null, 'military');

  assert.equal(restrictedSalvageForWreck(military), true, 'military wreck class is restricted');
  assert.equal(restrictedSalvageForWreck(parentMilitary), true, 'military parentType is restricted');
  assert.equal(restrictedSalvageForWreck(common), false, 'fresh/common wrecks are not restricted');

  const militaryPool = salvagePoolForWreck(military, military.data.salvagePool);
  const commonPool = salvagePoolForWreck(common, common.data.salvagePool);
  assert.equal(militaryPool.cmdty_salvage_electronics, undefined,
    'military electronics are converted away from ordinary salvage');
  assert.equal(militaryPool[CLASSIFIED_SALVAGE_COMMODITY_ID], 2,
    'military salvage yields classified restricted cargo');
  assert.equal(commonPool[CLASSIFIED_SALVAGE_COMMODITY_ID], undefined,
    'common debris does not receive restricted cargo');
  assert.equal(commonPool.cmdty_salvage_electronics, 2,
    'common debris keeps ordinary salvage electronics');
}

function testRestrictedSalvageUsesShippedScanFineAndConfiscation() {
  const { bus, emitted } = makeBus();
  const state = makeEconomyState({ [CLASSIFIED_SALVAGE_COMMODITY_ID]: 3 });
  const sys = initEconomy(state, bus);
  const expectedFine = Math.round(classifiedDef.basePrice * 3 * 0.8);

  const result = sys.runScan({ security: 1, factionId: 'faction_scn', source: 'test' });

  assert.equal(result.found, true, 'economy.runScan catches the restricted salvage');
  assert.equal(result.fine, expectedFine, 'fine comes from shipped restricted FINE_MULT');
  assert.deepEqual(result.confiscated, [{ commodityId: CLASSIFIED_SALVAGE_COMMODITY_ID, qty: 3 }],
    'restricted salvage is confiscated by the shipped scanner');
  assert.equal(state.player.cargo.items[CLASSIFIED_SALVAGE_COMMODITY_ID], undefined,
    'restricted salvage removed from cargo by economy.removeFromCargo');
  assert.equal(state.player.credits, 5000 - expectedFine,
    'fine is charged by economy credits writer');
  assert.ok(emitted.some((e) => e.evt === 'contraband:scanned' && e.p.fine === expectedFine),
    'scan emits the shipped contraband:scanned payload');
  assert.ok(emitted.some((e) => e.evt === 'faction:repDelta' && e.p.factionId === 'faction_scn' && e.p.reason === 'contraband'),
    'scan emits the shipped faction consequence');
  assert.equal(emitted.some((e) => e.evt === 'salvage:fined' || e.evt === 'salvage:permitFine'), false,
    'no new salvage-specific fine path is invented');
}

function testBlackmarketLaunderingClearsRestrictedSalvage() {
  const { bus } = makeBus();
  const state = makeEconomyState({ [CLASSIFIED_SALVAGE_COMMODITY_ID]: 2 });
  const sys = initEconomy(state, bus);

  assert.equal(canLaunderSalvageAtStation('station_smuggler'), true,
    'known blackmarket station is a laundering station');
  sys.ensureMarket('station_smuggler');
  assert.ok(state.economy.markets.station_smuggler[CLASSIFIED_SALVAGE_COMMODITY_ID],
    'blackmarket market lists classified salvage through shipped market tolerance');
  const sold = sys.execute('station_smuggler', CLASSIFIED_SALVAGE_COMMODITY_ID, 'sell', 2);
  assert.equal(sold.ok, true, 'blackmarket sell path accepts classified salvage');
  assert.equal(state.player.cargo.items[CLASSIFIED_SALVAGE_COMMODITY_ID], undefined,
    'selling at blackmarket clears the restricted cargo before any scan');
  assert.equal(sys.illicitCargo(state).length, 0, 'no restricted cargo remains after laundering sale');
}
