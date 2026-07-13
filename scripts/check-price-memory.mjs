#!/usr/bin/env node

import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { missions } from '../src/systems/missions.js';
import {
  bulkHaulPayoutForChunk,
  mining,
  richCorePlan,
} from '../src/systems/mining.js';
import {
  bestKnownSellFor,
  formatBestKnownSellLine,
} from '../src/ui/screens/market.js';
import { marketMemoryStationOverlays } from '../src/ui/screens/starmap.js';
import { buildSlotList, fits, getDerivedStats } from '../src/systems/ships.js';

const ROLE_MODULES = [
  'mod_ram_plate',
  'mod_winch_hd',
  'mod_charge_rack',
  'mod_drill_amp',
  'mod_survey_suite',
  'mod_smuggler_hold',
];

function installWorld(state, currentSectorId = 'sector_helios_prime') {
  state.world.currentSectorId = currentSectorId;
  state.world.sectors = Object.fromEntries(SECTORS.map((sector) => [sector.id, sector]));
}

function setQuote(market, commodityId, buy, sell) {
  market[commodityId] = market[commodityId] || {};
  market[commodityId].lastBuy = buy;
  market[commodityId].lastSell = sell;
  market[commodityId].buy = buy;
  market[commodityId].sell = sell;
}

function checkPriceMemory() {
  const sim = createSimulation({ seed: 5105, systems: [economy] });
  const state = sim.state;
  installWorld(state);
  const econ = sim.registry.get('economy');
  const cid = 'cmdty_ore_iron';

  const helios = econ.ensureMarket('station_helios');
  setQuote(helios, cid, 171, 180);
  state.simTime = 0;
  sim.bus.emit('dock:docked', { stationId: 'station_helios' });

  const ceres = econ.ensureMarket('station_ceres');
  setQuote(ceres, cid, 190, 212);
  state.simTime = 0;
  sim.bus.emit('dock:docked', { stationId: 'station_ceres' });

  const forge = econ.ensureMarket('station_forge');
  setQuote(forge, cid, 300, 999);

  const savedPlayer = JSON.parse(JSON.stringify(state.player));
  const loaded = createSimulation({ seed: 5105, systems: [economy] });
  installWorld(loaded.state);
  loaded.state.player = { ...loaded.state.player, ...savedPlayer };
  loaded.state.simTime = 14 * 60;

  assert.equal(loaded.state.player.marketMemory.station_helios[`${cid}`].sell, 180,
    'dock memory should survive a save/reload-style JSON round trip');
  assert.equal(loaded.state.player.marketMemory.station_ceres[`${cid}`].sell, 212,
    'second docked station memory should survive reload');

  const overlays = marketMemoryStationOverlays(loaded.state, cid);
  const overlayIds = overlays.map((entry) => entry.stationId).sort();
  assert.deepEqual(overlayIds, ['station_ceres', 'station_helios'],
    'starmap memory overlays must include only visited stations');
  assert(!overlayIds.includes('station_forge'), 'warmed but unvisited station must not render as price memory');

  const best = bestKnownSellFor(loaded.state, cid, 'station_helios');
  const line = formatBestKnownSellLine(loaded.state, best);
  assert.equal(best.stationId, 'station_ceres', 'best known sell should pick the recorded highest visited sell price');
  assert.equal(line, 'Best known sell: 212 cr - Ceres Refinery (14 min ago, 1 jump)',
    'best-known line should match recorded memory exactly');
}

function bootMining(seed = 6206) {
  const sim = createSimulation({ seed, systems: [cargo, mining] });
  const state = sim.state;
  state.mode = 'flight';
  installWorld(state, 'sector_ceres_belt');
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 200, capMass: 400 };
  const player = sim.spawn({
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    hull: 100,
    hullMax: 100,
    collides: true,
    data: { fittings: [] },
  });
  state.playerId = player.id;
  return { sim, state, miningSys: sim.registry.get('mining') };
}

function findRichCoreAsteroid(seed) {
  for (let i = 0; i < 500; i++) {
    const ast = { id: 'rich_check_' + i, data: { tier: 1 } };
    const plan = richCorePlan(seed, ast, null);
    if (plan.hasCore) return { ast, plan };
  }
  throw new Error('could not find deterministic rich-core asteroid');
}

function checkRichCore() {
  const seed = 6206;
  const { ast, plan } = findRichCoreAsteroid(seed);
  assert.deepEqual(richCorePlan(seed, ast, null), plan, 'rich core plan must be deterministic per seed and asteroid id');

  const hit = bootMining(seed);
  const hitCore = {
    id: 'core-hit',
    asteroidId: ast.id,
    commodityId: plan.commodityId,
    multiplier: plan.multiplier,
    windowPct: plan.windowPct,
    durationS: 3.5,
    resolved: false,
  };
  hit.state.player.mining = { richCore: hitCore };
  const hitResult = hit.miningSys._resolveRichCore(hitCore, 0.5);
  assert(hitResult.hit, 'release at ring center should hit');
  assert(hitResult.qty >= 3 && hitResult.qty <= 8, 'rich-core hit should pay 3-8x rare ore');
  assert.equal(hit.state.player.cargo.items[plan.commodityId], hitResult.qty,
    'rich-core hit should place the rare ore in cargo');

  const miss = bootMining(seed);
  const fizzle = [];
  miss.sim.bus.on('mining:richCoreFizzle', (p) => fizzle.push(p));
  miss.sim.bus.on('audio:cue', (p) => { if (p && p.id === 'mining_core_fizzle') fizzle.push(p); });
  const missCore = {
    id: 'core-miss',
    asteroidId: ast.id,
    commodityId: plan.commodityId,
    multiplier: plan.multiplier,
    windowPct: plan.windowPct,
    durationS: 3.5,
    resolved: false,
  };
  miss.state.player.mining = { richCore: missCore };
  const missResult = miss.miningSys._resolveRichCore(missCore, 0);
  assert.equal(missResult.hit, false, 'release outside the ring should miss');
  assert.equal(missResult.qty, 0, 'rich-core miss should pay zero ore');
  assert.equal(miss.state.player.cargo.items[plan.commodityId] || 0, 0, 'miss must not add cargo');
  assert.equal(fizzle.length, 2, 'miss should emit one fizzle event and one fizzle cue');
}

function checkBulkHaul() {
  const sim = createSimulation({ seed: 7307, systems: [economy, missions, mining, cargo] });
  const state = sim.state;
  installWorld(state, 'sector_ceres_belt');
  state.mode = 'flight';
  state.player.credits = 1000;
  const player = sim.spawn({
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    hull: 100,
    hullMax: 100,
    collides: true,
    data: { fittings: [] },
  });
  state.playerId = player.id;
  sim.spawn({
    type: 'station',
    pos: { x: 80, z: 0 },
    radius: 18,
    collides: true,
    data: { stationId: 'station_ceres', stationTypeId: 'refinery', name: 'Ceres Refinery' },
  });
  const chunk = sim.spawn({
    type: 'asteroid',
    pos: { x: 30, z: 0 },
    radius: 12,
    mass: 100,
    hull: 20,
    hullMax: 20,
    collides: true,
    data: {
      isChunk: true,
      bulkMassU: 25,
      yieldU: 25,
      commodityId: 'cmdty_ore_iron',
      basePrice: 28,
      typeId: 'ast_metallic',
    },
  });
  state.player.tether = { targetId: chunk.id };
  const mission = {
    id: 'm_bulk_check',
    type: 'bulk_haul',
    stationId: 'station_beltout',
    factionId: 'faction_dmc',
    params: { massU: 25, cmdtyId: 'cmdty_ore_iron' },
    objectiveProgress: 0,
    objectiveTarget: 25,
    acceptedAt_s: 0,
    deadline_s: 9999,
    reward_cr: 0,
    collateral_cr: 0,
    riskTier: 1,
    destStationId: 'station_ceres',
    destSectorId: 'sector_ceres_belt',
    distance: 600,
    targetEntityIds: [],
    needsTargets: false,
    status: 'active',
    title: 'Bulk Haul Check',
    chainNextSeed: null,
  };
  state.missions.active.push(mission);
  const completed = [];
  sim.bus.on('mission:completed', (p) => completed.push(p));
  const expected = bulkHaulPayoutForChunk(chunk).credits;
  sim.bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert(Math.abs(state.player.credits - (1000 + expected)) <= 1,
    'bulk-haul delivery should pay mass * basePrice * 0.8 minus 6% fee');
  assert.equal(chunk.alive, false, 'bulk-haul chunk should be consumed by refinery delivery');
  assert.equal(completed.length, 1, 'bulk-haul contract should complete through mission events');
  assert.equal(completed[0].type, 'bulk_haul', 'completed mission payload should carry bulk_haul type');
}

function firstFittingFor(def) {
  for (const ship of SHIPS) {
    const slots = buildSlotList(ship);
    const idx = slots.findIndex((slot) => fits(slot, def));
    if (idx < 0) continue;
    const fittings = new Array(slots.length).fill(null);
    fittings[idx] = def.id;
    return { ship, fittings };
  }
  return null;
}

function changedKeys(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const key of keys) {
    if (typeof a[key] === 'object' || typeof b[key] === 'object') continue;
    if (a[key] !== b[key]) out.push(key);
  }
  return out;
}

function checkRoleModules() {
  const byId = new Map(MODULES.map((m) => [m.id, m]));
  const expected = {
    mod_ram_plate: { ramSelfDamageMult: 0.40, ramDamageDealtMult: 1.80 },
    mod_winch_hd: { tetherReelRateMult: 1.80, tetherSpoolMult: 1.50 },
    mod_charge_rack: { impulseChargeCapacity: 8 },
    mod_drill_amp: { richCoreRingPctBonus: 0.04 },
    mod_survey_suite: { scannerRadiusMult: 1.50, pingPersistMult: 2.00 },
    mod_smuggler_hold: { hiddenCargoPct: 0.20 },
  };
  assert.deepEqual(ROLE_MODULES.map((id) => byId.get(id).price), [6000, 12000, 18000, 24000, 30000, 38000],
    'role-kit prices should ladder 6k -> 38k');
  for (const id of ROLE_MODULES) {
    const mod = byId.get(id);
    assert(mod, `${id} should exist`);
    assert(mod.price > 0 && !mod.requiresTech, `${id} should be directly purchasable`);
    const fit = firstFittingFor(mod);
    assert(fit, `${id} should fit at least one existing hull slot`);
    assert((mod.energyDraw || 0) <= fit.ship.energyRegen, `${id} should fit within an existing power budget`);
    for (const [field, value] of Object.entries(expected[id])) {
      assert.equal(mod.mods && mod.mods[field], value, `${id} missing exact ${field} effect`);
    }
    const before = getDerivedStats(fit.ship.id, []);
    const after = getDerivedStats(fit.ship.id, fit.fittings);
    assert(changedKeys(before, after).length > 0, `${id} should change derived stats measurably when fitted`);
    if (id === 'mod_winch_hd') {
      assert.equal('tetherBreakMult' in mod.mods, false,
        'winch strength must have one source: max-folded tetherSpoolMult');
      assert.equal(after.tetherReelRateMult, 1.80, 'winch reel-rate effect must reach live derived stats');
      assert.equal(after.tetherSpoolMult, 1.50, 'winch spool strength must reach live derived stats');
    }
  }
}

checkPriceMemory();
checkRichCore();
checkBulkHaul();
checkRoleModules();

console.log('Price memory / economy progression checks OK');
