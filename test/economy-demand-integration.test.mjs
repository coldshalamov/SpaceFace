import assert from 'node:assert/strict';
import test from 'node:test';

import { economy } from '../src/systems/economy.js';
import { predictPriceCurve } from '../src/systems/economyCycles.js';
import { COMMODITIES } from '../src/data/commodities.js';

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

function sectorField() {
  return {
    nodes: {
      sector_helios_prime: {
        danger: 0.58, pricePressure: 0.04,
        influence: { faction_scn: 0.54, faction_reach: 0.46 },
        dominantFactionId: 'faction_scn', dominantInfluence: 0.54, contestMargin: 0.08,
        trend: { danger: 0, pricePressure: 0, influence: 0 },
        driver: { danger: 'contested_space', pricePressure: 'market_balance', influence: 'border_contest' },
      },
    },
  };
}

function boot({ war = true } = {}) {
  const bus = makeBus();
  const state = {
    mode: 'flight', simTime: 0, meta: { seed: 0x5face },
    player: {
      credits: 10000,
      cargo: { items: {}, capVolume: 100, usedVolume: 0 },
      marketMemory: {}, tradeLedger: [], tradeLots: {},
    },
    economy: {},
    conflicts: { 'faction_reach:faction_scn': { state: war ? 'war' : 'cold', tension: war ? 90 : 0 } },
    sectorSim: { field: sectorField() },
    world: { currentSectorId: 'sector_helios_prime', sectors: { sector_helios_prime: { owner: 'faction_scn' } } },
    ui: {}, nav: {}, entities: new Map(), entityList: [],
  };
  const econ = { ...economy };
  econ.init({ state, bus, helpers: {}, registry: { get: () => null } });
  econ.newGame();
  return { state, bus, econ };
}

function settleCycle(state, stationId, commodityId) {
  const cycle = state.economy.cycles[stationId][commodityId];
  Object.assign(cycle, {
    regime: 'stable', family: 'stable', phase: 0, frequency: 1,
    amplitude: 0, bias: 0, slope: 0, a: 0, b: 0, c: 0,
    amp2: 0, amp3: 0, regimeStartT: 0, regimeEndT: 1000,
  });
}

test('board, history, forecast, and executable quote share one demand-adjusted price composition', () => {
  const { state, econ } = boot({ war: false });
  const stationId = 'station_helios';
  const commodityId = 'cmdty_weapons';
  settleCycle(state, stationId, commodityId);
  // Exercise the real coarse state transition after the formula baseline has settled.
  state.conflicts['faction_reach:faction_scn'] = { state: 'war', tension: 90 };
  econ.refreshStationDemand(stationId);

  const entry = state.economy.markets[stationId][commodityId];
  const quote = econ.quote(stationId, commodityId, 'buy', 1);
  const forecast = predictPriceCurve(state, stationId, commodityId, 2, 5);
  assert.ok(entry.demandMult > 1);
  assert.ok(entry.demandDrivers.some((driver) => driver.id === 'war-footing'));
  assert.equal(entry.history.at(-1).mid, entry.lastMid);
  assert.equal(forecast[0].mid, entry.lastMid);
  assert.ok(Math.abs(quote.unitAvg - entry.lastBuy) / entry.lastBuy < 0.01,
    `one-unit executable quote ${quote.unitAvg} should agree with displayed buy ${entry.lastBuy}`);

  economy._instance = null;
});

test('persistent demand responds to averaged conflict state and ignores visible entity count', () => {
  const warRun = boot({ war: true });
  const calmRun = boot({ war: false });
  const stationId = 'station_helios';
  const commodityId = 'cmdty_weapons';
  for (const run of [warRun, calmRun]) {
    settleCycle(run.state, stationId, commodityId);
    run.econ.refreshStationDemand(stationId);
  }
  // Rich visible life is presentation only; changing this list must not enter the averaged quote.
  warRun.state.entityList = Array.from({ length: 500 }, (_, index) => ({ id: `visual_${index}`, type: 'ship' }));
  warRun.econ.refreshStationDemand(stationId);

  const warEntry = warRun.state.economy.markets[stationId][commodityId];
  const calmEntry = calmRun.state.economy.markets[stationId][commodityId];
  assert.ok(warEntry.lastMid > calmEntry.lastMid);
  assert.equal(warEntry.demandMult, 1.22);
  assert.equal(calmEntry.demandMult, 1);

  warRun.state.conflicts['faction_reach:faction_scn'].state = 'cold';
  warRun.state.simTime += 5;
  warRun.econ.econTick(5, warRun.state);
  assert.equal(warEntry.demandMult, 1, 'the next coarse economy tick removes a resolved war premium');
  economy._instance = null;
});

test('save restoration rebuilds derived demand after faction and sector owners restore', () => {
  const original = boot({ war: true });
  const stationId = 'station_helios';
  const commodityId = 'cmdty_weapons';
  settleCycle(original.state, stationId, commodityId);
  original.econ.refreshStationDemand(stationId);
  const before = original.econ.quote(stationId, commodityId, 'buy', 4);
  const saved = structuredClone(original.econ.serialize());

  const restored = boot({ war: false });
  restored.econ.deserialize(saved);
  // Match the real save order: economy restores first, then factions/sectorSim, then save:loaded.
  restored.state.conflicts = structuredClone(original.state.conflicts);
  restored.state.sectorSim.field = structuredClone(original.state.sectorSim.field);
  restored.bus.emit('save:loaded', { slot: 'demand-integration' });
  const after = restored.econ.quote(stationId, commodityId, 'buy', 4);

  assert.equal(restored.state.economy.markets[stationId][commodityId].demandMult, 1.22);
  assert.equal(after.total, before.total);
  assert.equal(after.unitAvg, before.unitAvg);
  economy._instance = null;
});

test('save restoration does not turn stale remote intel into a live market observation', () => {
  const original = boot({ war: true });
  const stationId = 'station_helios';
  const remoteStationId = 'station_ceres_prime';
  original.econ.ensureMarket(remoteStationId);
  original.state.simTime = 240;
  original.state.player.marketMemory[remoteStationId] = {
    cmdty_weapons: {
      buy: 144,
      sell: 132,
      seenAt: 45,
      demandMult: 1,
      demandDrivers: [],
    },
  };
  original.state.economy.marketIntel[remoteStationId] = {
    seenAtT: 45,
    snapshot: {
      cmdty_weapons: {
        buy: 144,
        sell: 132,
        demandMult: 1,
        demandDrivers: [],
      },
    },
  };
  const saved = structuredClone(original.econ.serialize());

  const restored = boot({ war: false });
  restored.econ.deserialize(saved);
  restored.state.player.marketMemory = structuredClone(original.state.player.marketMemory);
  restored.state.conflicts = structuredClone(original.state.conflicts);
  restored.state.sectorSim.field = structuredClone(original.state.sectorSim.field);
  restored.state.simTime = 240;
  restored.bus.emit('save:loaded', { slot: 'demand-intel-age' });

  assert.equal(restored.state.economy.marketIntel[remoteStationId].seenAtT, 45,
    'loading must not make a remote quote newly observed');
  assert.equal(restored.state.player.marketMemory[remoteStationId].cmdty_weapons.seenAt, 45,
    'player memory keeps the actual observation time');
  assert.equal(restored.state.player.marketMemory[remoteStationId].cmdty_weapons.sell, 132,
    'player memory keeps the observed quote rather than receiving hidden live state');

  economy._instance = null;
});

test('sector offline catch-up reconciles demand after the real save listener order', () => {
  const restored = boot({ war: true });
  const stationId = 'station_helios';
  const commodityId = 'cmdty_medical';
  const entry = restored.state.economy.markets[stationId][commodityId];

  // In the registry, economy handles save:loaded before sectorSim performs its offline catch-up.
  restored.bus.emit('save:loaded', { slot: 'offline-demand-order' });
  assert.ok(Math.abs(entry.demandMult - 1.14) < 1e-9,
    'the pre-catch-up field contains only the war premium');

  // sectorSim mutates its averaged field and then emits this receipt. Economy must reconcile from
  // that post-catch-up state instead of waiting for a later five-second tick or Market open.
  const helios = restored.state.sectorSim.field.nodes.sector_helios_prime;
  helios.pricePressure = 0.60;
  helios.driver = {
    ...helios.driver,
    danger: 'infrastructure_disruption',
    pricePressure: 'infrastructure_disruption',
  };
  restored.bus.emit('sectorsim:offlineSummary', { elapsedSec: 86_400, days: 1 });

  assert.ok(Math.abs(entry.demandMult - 1.34) < 1e-9,
    'war and blockade demand are both current immediately');
  assert.deepEqual(entry.demandDrivers.map((driver) => driver.id), ['war-footing', 'blockade-relief']);
  economy._instance = null;
});

test('restore reseeds only omitted synthetic histories after authoritative demand settles', () => {
  const stationId = 'station_helios';
  const commodityId = 'cmdty_weapons';
  const def = COMMODITIES.find((commodity) => commodity.id === commodityId);

  const original = boot({ war: true });
  settleCycle(original.state, stationId, commodityId);
  original.econ.refreshStationDemand(stationId);
  const originalEntry = original.state.economy.markets[stationId][commodityId];
  const originalCycle = original.state.economy.cycles[stationId][commodityId];
  original.econ.seedPriceHistory(originalEntry, def, originalCycle, original.state.simTime);
  const savedWithoutHistory = structuredClone(original.econ.serialize());
  assert.equal(savedWithoutHistory.markets[stationId][0].length, 6,
    'an unobserved market saves no derived chart cache');

  const restored = boot({ war: false });
  restored.econ.deserialize(savedWithoutHistory);
  const restoredEntry = restored.state.economy.markets[stationId][commodityId];
  const preOwnerRestoreMid = restoredEntry.history.at(-1).mid;
  restored.state.conflicts = structuredClone(original.state.conflicts);
  restored.state.sectorSim.field = structuredClone(original.state.sectorSim.field);
  restored.bus.emit('save:loaded', { slot: 'synthetic-history' });

  assert.ok(restoredEntry.lastMid > preOwnerRestoreMid,
    'restored authoritative war state changes the live quote from the pre-restore seed');
  assert.equal(restoredEntry.history.at(-1).mid, restoredEntry.lastMid,
    'the omitted synthetic history is reseeded from the authoritative post-restore demand');

  const durable = boot({ war: true });
  const durableEntry = durable.state.economy.markets[stationId][commodityId];
  durableEntry.history = [{ t: -5, mid: 1_234 }, { t: 0, mid: 1_235 }];
  durable.state.economy.marketIntel[stationId] = { snapshot: {}, seenAtT: 0 };
  const savedWithHistory = structuredClone(durable.econ.serialize());
  const durableRestored = boot({ war: false });
  durableRestored.econ.deserialize(savedWithHistory);
  durableRestored.state.conflicts = structuredClone(durable.state.conflicts);
  durableRestored.state.sectorSim.field = structuredClone(durable.state.sectorSim.field);
  durableRestored.bus.emit('save:loaded', { slot: 'durable-history' });
  assert.deepEqual(
    durableRestored.state.economy.markets[stationId][commodityId].history,
    durableEntry.history,
    'a genuinely observed chart remains exact lived history rather than being formula-reseeded',
  );
  economy._instance = null;
});
