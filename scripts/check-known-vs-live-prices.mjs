#!/usr/bin/env node
// BP-03.1 known_vs_live_prices verification.
//
// Guards the shipped price-memory seam without adding a second economy or map
// path: economy records visited-station quotes under state.player.marketMemory,
// and starmap reads that memory as stale/known map intel.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { economy } from '../src/systems/economy.js';
import { marketMemoryStationOverlays } from '../src/ui/screens/starmap.js';

const COMMODITY_ID = 'cmdty_ore_iron';

let sections = 0;

function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function installWorld(state, currentSectorId = 'sector_helios_prime') {
  state.world.currentSectorId = currentSectorId;
  state.world.sectors = Object.fromEntries(SECTORS.map((sector) => [sector.id, sector]));
}

function setQuote(market, commodityId, buy, sell) {
  market[commodityId] = market[commodityId] || {};
  Object.assign(market[commodityId], {
    buy,
    sell,
    lastBuy: buy,
    lastSell: sell,
    lastMid: Math.round((buy + sell) / 2),
    stock: 100,
    role: 'neutral',
  });
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in known-vs-live price memory path'); };
  Date.now = () => { throw new Error('Date.now in known-vs-live price memory path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testVisitedStationsOnly);
guarded(testSaveReloadAndAgeLabels);
testRuntimeScope();

console.log(`[check-known-vs-live-prices] PASS - ${sections} sections green`);

function testVisitedStationsOnly() {
  const sim = createSimulation({ seed: 5105, systems: [economy] });
  const state = sim.state;
  const econ = sim.registry.get('economy');
  installWorld(state);

  const helios = econ.ensureMarket('station_helios');
  setQuote(helios, COMMODITY_ID, 171, 180);
  state.simTime = 30;
  sim.bus.emit('dock:docked', { stationId: 'station_helios' });

  const ceres = econ.ensureMarket('station_ceres');
  setQuote(ceres, COMMODITY_ID, 190, 212);
  const forge = econ.ensureMarket('station_forge');
  setQuote(forge, COMMODITY_ID, 300, 999);

  assert.equal(state.player.marketMemory.station_helios[COMMODITY_ID].sell, 180,
    'docking at Helios should record the visible sell quote');
  assert.equal(state.player.marketMemory.station_ceres, undefined,
    'warming an undocked station market must not create player price memory');
  assert.equal(state.player.marketMemory.station_forge, undefined,
    'live market feed alone must not masquerade as visited memory');

  const overlays = marketMemoryStationOverlays(state, COMMODITY_ID);
  assert.deepEqual(overlays.map((entry) => entry.stationId), ['station_helios'],
    'starmap price-memory overlay should include only visited stations');
  assert.equal(overlays[0].sell, 180, 'overlay sell price comes from player memory');
  assert.equal(overlays[0].buy, 171, 'overlay buy price comes from player memory');
  assert.equal(overlays[0].ageLabel, 'fresh', 'newly recorded memory is labeled fresh');
  ok('visited station quotes record once and warmed live markets stay out of map memory');
}

function testSaveReloadAndAgeLabels() {
  const sim = createSimulation({ seed: 5105, systems: [economy] });
  const state = sim.state;
  const econ = sim.registry.get('economy');
  installWorld(state);

  const helios = econ.ensureMarket('station_helios');
  setQuote(helios, COMMODITY_ID, 171, 180);
  state.simTime = 0;
  sim.bus.emit('dock:docked', { stationId: 'station_helios' });

  const ceres = econ.ensureMarket('station_ceres');
  setQuote(ceres, COMMODITY_ID, 190, 212);
  state.simTime = 0;
  sim.bus.emit('dock:docked', { stationId: 'station_ceres' });

  const savedPlayer = JSON.parse(JSON.stringify(state.player));
  const loaded = createSimulation({ seed: 5105, systems: [economy] });
  installWorld(loaded.state);
  loaded.state.player = { ...loaded.state.player, ...savedPlayer };
  loaded.state.simTime = 65 * 60;

  const overlays = marketMemoryStationOverlays(loaded.state, COMMODITY_ID);
  const overlayIds = overlays.map((entry) => entry.stationId).sort();
  assert.deepEqual(overlayIds, ['station_ceres', 'station_helios'],
    'visited station memories survive a save/reload-style JSON round trip');

  const ceresOverlay = overlays.find((entry) => entry.stationId === 'station_ceres');
  assert.equal(ceresOverlay.sell, 212, 'Ceres overlay uses the saved sell quote, not a live recompute');
  assert.equal(ceresOverlay.ageLabel, '65 min', 'starmap overlay marks old visited quotes as stale memory');
  assert.equal(ceresOverlay.tint, 'old', '65-minute-old memory uses the old/stale tint bucket');
  assert.equal(ceresOverlay.commodityId, COMMODITY_ID, 'overlay remains scoped to the selected commodity');
  ok('price memory is persistent, commodity-scoped, and visibly stale');
}

function testRuntimeScope() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:known-vs-live-prices'], 'node scripts/check-known-vs-live-prices.mjs',
    'package exposes check:known-vs-live-prices');

  const economySrc = readFileSync(new URL('../src/systems/economy.js', import.meta.url), 'utf8');
  const starmapSrc = readFileSync(new URL('../src/ui/screens/starmap.js', import.meta.url), 'utf8');
  const galaxySrc = readFileSync(new URL('../src/ui/galaxyMap.js', import.meta.url), 'utf8');
  const sectorSimSrc = readFileSync(new URL('../src/systems/sectorSim.js', import.meta.url), 'utf8');

  assert.match(economySrc, /recordMarketMemory\(stationId, snapshot = null\)/,
    'economy must own the visited-station memory writer');
  assert.match(economySrc, /state\.player\.marketMemory/,
    'price memory must live under player state so it saves with the pilot');
  assert.match(starmapSrc, /export function marketMemoryStationOverlays/,
    'starmap must expose the read-only overlay builder');
  assert.match(starmapSrc, /No visited station price for this commodity/,
    'starmap copy must distinguish missing memory from live price certainty');
  assert.doesNotMatch(galaxySrc, /priceMemory|marketMemoryStationOverlays/,
    'this backend check must not wire galaxyMap UI directly');
  assert.doesNotMatch(sectorSimSrc, /marketMemory|priceMemory/,
    'price memory must not feed back into sectorSim/danger math');
  ok('runtime scope stays on the shipped economy writer and starmap reader');
}
