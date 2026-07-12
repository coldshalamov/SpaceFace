#!/usr/bin/env node
// check-career-earnings-benchmark.mjs — M3 truthful career earnings hard gate.
//
// Sustained 30-minute Hauler / Hunter / Prospector routes using live economy, cargo,
// commodities, ships, mining, mission, field-depletion, service, and gate-toll data/kernels.
// Not a warning-only DPS/profit estimator: every credit and cargo unit is applied through
// live execute / grantCredits / chargeCredits / addCargo / removeCargo paths.
//
// Run: node scripts/check-career-earnings-benchmark.mjs
// Exit 0 only when all career routes and conservation assertions pass.
// Does not edit production balance; a red gate means live numbers are out of band.

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { createSimulation } from '../src/core/sim.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { AUTO_BALANCE } from '../src/data/automation.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { planGateScene } from '../src/data/gateControl.js';
import { ASTEROIDS, BEAMS, RECIPES } from '../src/data/mining.js';
import { MISSION_TUNING, MISSION_TYPES } from '../src/data/missions.js';
import { MODULES } from '../src/data/modules.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { SECTORS, dangerTier } from '../src/data/sectors.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { TECH_NODES } from '../src/data/tech.js';
import { ORIGIN_ROLE_KITS } from '../src/careers/origins/careerOriginContracts.js';
import {
  FIELD_DEPLETION_RECOVERY_PER_S,
  fieldMemoryReadout,
  recordFieldExtraction,
  recoverFieldDepletion,
  richnessMultiplierForDepletion,
} from '../src/systems/fieldDepletion.js';
import { cargo as cargoSystem, addCargo, removeCargo } from '../src/systems/cargo.js';
import { economy as economySystem, SERVICE_PRICES } from '../src/systems/economy.js';
import { bulkHaulPayoutForChunk, BULK_HAUL_MIN_U } from '../src/systems/mining.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import {
  buildSlotList,
  fits,
  fittingsFromDefaultModules,
  getDerivedStats,
} from '../src/systems/ships.js';

assert.equal(typeof window, 'undefined', 'career earnings benchmark must run headless');

// ---- guard: no Math.random / wall-clock in the sim path ------------------------------------
const _MathRandom = Math.random;
const _DateNow = Date.now;
const _PerfNow = performance.now.bind(performance);
let wallClockBlocked = false;
function blockNondeterminism() {
  wallClockBlocked = true;
  Math.random = () => { throw new Error('Math.random forbidden in career earnings benchmark'); };
  Date.now = () => { throw new Error('Date.now forbidden in career earnings benchmark'); };
}
function restoreNondeterminism() {
  wallClockBlocked = false;
  Math.random = _MathRandom;
  Date.now = _DateNow;
}

// ---- constants ----------------------------------------------------------------------------
// The package gate invokes both canonical windows. A single invocation stays useful for diagnosis.
const minutesArgIndex = process.argv.indexOf('--minutes');
const requestedMinutes = minutesArgIndex >= 0 ? Number(process.argv[minutesArgIndex + 1]) : NaN;
let HORIZON_S = Math.max(60, (Number.isFinite(requestedMinutes) ? requestedMinutes * 60
  : Number(process.env.SPACEFACE_CAREER_HORIZON_S)) || 30 * 60);
const SEED_HAULER = 0xC4EE_A001;
const SEED_HUNTER = 0xC4EE_B002;
const SEED_PROSPECTOR = 0xC4EE_C003;

// A(T) bands from AUTO_BALANCE.activeRefByTier + SPEC2/05 ladder (not today's output).
// Early career (first 90 min) maps to T1. Sustained 30-min routes must be playable, not free.
const A_TIER = AUTO_BALANCE.activeRefByTier;
const A_T1 = A_TIER[0]; // 250 — competent active cr/min at tier 1
const A_T2 = A_TIER[1]; // 600
// Dead: under 15% of A(T1). Dominant sustained: over 2.5× A(T1) after real costs/stock.
const BAND_DEAD_FRAC = 0.15;
const BAND_LO_FRAC = 0.25;   // minimum healthy sustained floor
const BAND_HI_FRAC = 2.5;    // max plausible sustained (price impact + travel + sinks)
const BAND_CROSS_MAX = 3.5;  // max/min across the three careers
// Ladder: freighter ~4 h at A(T1) ⇒ 30 min should not buy a freighter from profit alone.
const LADDER_FREIGHTER_PRICE = (SHIPS.find((s) => s.id === 'ship_mule') || {}).price || 35000;
const LADDER_MAX_30MIN_FRAC_OF_FREIGHTER = 0.55; // 30 min profit < 55% of freighter (4 h target)

const EARLY_CMDTY_MAX_BASE = 200; // no exotic/gem starter arbitrage
const DOCK_OVERHEAD_S = 18;       // dock/undock/market UI friction (fixed, not RNG)
const MINING_TRANSIT_S = 35;      // field ↔ station hop inside sector
const COMBAT_APPROACH_S = 25;     // acquire + close
const REPAIR_FRAC_OF_DAMAGE = 0.55; // competent pilot takes partial damage

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
const TECH_BY_ID = new Map(TECH_NODES.map((node) => [node.id, node]));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const STATION_TO_SECTOR = new Map();
const STATION_BY_ID = new Map();
for (const sec of SECTORS) {
  for (const st of sec.stations || []) {
    STATION_TO_SECTOR.set(st.id, sec);
    STATION_BY_ID.set(st.id, st);
  }
}

const round = (n) => Math.round(Number(n) || 0);
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);
const fmt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : String(n));

// ---- adapters (documented in every receipt) -----------------------------------------------
// ADAPTER travel:distance — mirrors src/systems/missions.js sectorDistanceWu (private) using
// live SECTORS positions + the same scale/clamp constants.
function sectorDistanceWu(aSectorId, bSectorId) {
  if (!aSectorId || !bSectorId || aSectorId === bSectorId) return 600;
  const a = SECTOR_BY_ID.get(aSectorId);
  const b = SECTOR_BY_ID.get(bSectorId);
  if (!a || !b || !a.position || !b.position) return 1800;
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  return clamp(600 + Math.hypot(dx, dy) * 650, 600, 6000);
}

// ADAPTER travel:time — live MISSION_TUNING.cruiseSpeedRef (missions travel term).
function travelTimeS(aSectorId, bSectorId) {
  const dist = sectorDistanceWu(aSectorId, bSectorId);
  const cruise = MISSION_TUNING.cruiseSpeedRef || 140;
  return dist / cruise;
}

// ADAPTER travel:stationTime — actual authored station positions for same-sector work. The
// missions distance floor is for board generation and would make Belt Outpost ↔ Ceres Refinery
// look like a 600wu hop even though the shipped positions are ~2440wu apart.
function stationTravelTimeS(aStationId, bStationId) {
  const a = STATION_BY_ID.get(aStationId);
  const b = STATION_BY_ID.get(bStationId);
  if (!a || !b || !a.pos || !b.pos) {
    return travelTimeS(STATION_TO_SECTOR.get(aStationId)?.id, STATION_TO_SECTOR.get(bStationId)?.id);
  }
  const distance = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
  return distance / (MISSION_TUNING.cruiseSpeedRef || 140);
}

// ADAPTER travel:highSecToll — mirrors src/systems/world.js _gateToll (private):
// security > 0.6 → round(50 + 200 * security).
function highSecGateToll(sector) {
  if (!sector) return 0;
  return sector.security > 0.6 ? Math.round(50 + 200 * sector.security) : 0;
}

// ADAPTER travel:sceneToll — live planGateScene (src/data/gateControl.js).
function sceneTollForJump(seed, fromSectorId, toSectorId, dayIndex, wanted = false) {
  const to = SECTOR_BY_ID.get(toSectorId);
  if (!to) return { tollAmount: 0, type: 'silent', adapters: ['gateControl.planGateScene'] };
  const scene = planGateScene(seed, fromSectorId, toSectorId, dayIndex, {
    factionId: to.factionId,
    security: to.security,
    wanted,
  });
  return {
    tollAmount: scene.tollAmount || 0,
    type: scene.type,
    adapters: ['gateControl.planGateScene'],
  };
}

function routeToll(seed, fromSectorId, toSectorId, dayIndex, wanted = false) {
  if (!fromSectorId || !toSectorId || fromSectorId === toSectorId) {
    return { amount: 0, sceneType: 'none', crossedGate: false };
  }
  const destination = SECTOR_BY_ID.get(toSectorId);
  const scene = sceneTollForJump(seed, fromSectorId, toSectorId, dayIndex, wanted);
  return {
    amount: highSecGateToll(destination) + scene.tollAmount,
    sceneType: scene.type,
    crossedGate: true,
  };
}

// ADAPTER mission:reward — live MISSION_TUNING.BASE * distance/risk/value family
// (src/systems/missions.js _rollOffer reward block).
function missionRewardCr(typeId, distanceWu, riskTier, fValue, fFaction = 1, fTime = 1) {
  const base = (MISSION_TUNING.BASE && MISSION_TUNING.BASE[typeId]) || 100;
  const fDist = 1 + distanceWu / (MISSION_TUNING.distDivisor || 2000);
  const fRisk = (MISSION_TUNING.RISK_MULT && MISSION_TUNING.RISK_MULT[riskTier]) || 1;
  return round(base * fDist * fRisk * fValue * fFaction * fTime);
}

// ADAPTER mission:time — live time_limit construction without slack padding for "completed
// competent" duration: travel + taskTime (task constants from missions type table / _rollParams).
function missionWorkTimeS(distanceWu, taskTimeS) {
  const travel = distanceWu / (MISSION_TUNING.cruiseSpeedRef || 140);
  return travel + taskTimeS;
}

// ---- sim bootstrap ------------------------------------------------------------------------
function bootSim(seed) {
  const sim = createSimulation({ seed, systems: [economySystem, cargoSystem] });
  const state = sim.state;
  state.mode = 'flight';
  state.meta = state.meta || {};
  state.meta.seed = seed >>> 0;
  state.player.credits = NEW_GAME.credits;
  state.player.cargo = {
    items: {},
    usedVolume: 0,
    usedMass: 0,
    capVolume: NEW_GAME.cargoCapacity,
    capMass: 60,
  };
  state.player.stats = state.player.stats || {
    tradesCount: 0, lifetimeProfit: 0, biggestSingleProfit: 0, smuggledValue: 0,
  };
  state.player.researchPoints = NEW_GAME.researchPoints || 0;
  state.player.researchedNodes = (NEW_GAME.researchedNodes || []).slice();
  state.simTime = 0;
  state.world = state.world || {};
  state.world.currentSectorId = NEW_GAME.startingSectorId;
  // Economy markets populate lazily via ensureMarket / execute.
  return {
    sim,
    state,
    econ: sim.registry.get('economy'),
    bus: sim.bus,
  };
}

function setHull(state, shipId) {
  const ship = SHIP_BY_ID.get(shipId);
  if (!ship) throw new Error(`unknown ship ${shipId}`);
  state.player.cargo.capVolume = ship.cargo;
  // mass cap is soft; keep proportional to cargo for receipt honesty
  state.player.cargo.capMass = Math.max(60, Math.round(ship.cargo * 1.5));
  return ship;
}

function advanceEconomy(ctx, dt) {
  const d = Math.max(0, Number(dt) || 0);
  if (d <= 0) return;
  // Live economy.update advances the 5s econ tick accumulator (drift, cycles, regional pressure).
  ctx.econ.update(d, ctx.state);
  ctx.state.simTime = (ctx.state.simTime || 0) + d;
  // Field recovery uses pure exported kernel when prospector has state.
  recoverFieldDepletion(ctx.state, d);
}

function chargeRouteToll(ctx, amount, reason) {
  const cr = round(amount);
  if (cr <= 0) return 0;
  ctx.econ.chargeCredits(cr, reason);
  return cr;
}

function inventoryUnits(cargo) {
  let n = 0;
  for (const id of Object.keys(cargo.items || {})) n += cargo.items[id] | 0;
  return n;
}

function emptyReceiptBase(career, seed, ship, equipment) {
  return {
    career,
    seed,
    horizonS: HORIZON_S,
    startingCapital: NEW_GAME.credits,
    endingCapital: 0,
    netCredits: 0,
    creditsPerMin: 0,
    completedLoops: 0,
    shipId: ship.id,
    shipName: ship.name,
    cargoCapacity: ship.cargo,
    equipment,
    ownedInventoryStart: {},
    ownedInventoryEnd: {},
    saleProceeds: 0,
    purchaseSpend: 0,
    repairCost: 0,
    ammoCost: 0,
    refineryCost: 0,
    missionCost: 0,
    missionProceeds: 0,
    tollCost: 0,
    travelTimeS: 0,
    marketExhaustion: false,
    adapters: [],
    loops: [],
    defects: [],
  };
}

function loadoutPlan(career, phase = 'starter') {
  const kit = ORIGIN_ROLE_KITS[career];
  if (!kit) return null;
  const starter = phase !== 'mid';
  if (career === 'hauler') {
    return {
      shipId: starter ? NEW_GAME.shipId : 'ship_mule',
      required: starter
        ? [...NEW_GAME.fittedModules, kit.defId]
        : ['wpn_pulse_laser_s', 'mod_engine_ion_m', 'mod_shield_booster_s', kit.defId],
      minCargo: starter ? 40 : 120,
    };
  }
  if (career === 'hunter') {
    return {
      shipId: starter ? NEW_GAME.shipId : 'ship_wasp',
      required: starter
        ? [...NEW_GAME.fittedModules, kit.defId]
        : ['wpn_pulse_laser_s', 'wpn_autocannon_s', 'mod_engine_ion_m', 'mod_shield_booster_s', kit.defId],
      minCargo: starter ? 40 : 10,
    };
  }
  return {
    shipId: starter ? NEW_GAME.shipId : 'ship_pelican',
    required: starter
      ? [...NEW_GAME.fittedModules, kit.defId]
      : ['wpn_pulse_laser_s', 'mod_mining_laser_s', 'mod_engine_ion_m', 'mod_shield_booster_s', kit.defId],
    minCargo: starter ? 40 : 55,
  };
}

function assessLoadoutViability(career, phase = 'starter') {
  const plan = loadoutPlan(career, phase);
  const ship = plan && SHIP_BY_ID.get(plan.shipId);
  if (!plan || !ship) return { viable: false, reason: 'missing_plan_or_hull' };
  const fittings = fittingsFromDefaultModules(plan.shipId, plan.required);
  const fittedIds = fittings.filter(Boolean);
  const slots = buildSlotList(ship);
  const kit = MODULE_BY_ID.get(ORIGIN_ROLE_KITS[career].defId);
  const requiredDefs = plan.required.map((id) => MODULE_BY_ID.get(id) || WEAPON_BY_ID.get(id)).filter(Boolean);
  const missing = plan.required.filter((id) => !fittedIds.includes(id));
  const player = {
    cargo: { usedMass: career === 'hauler' ? Math.min(ship.cargo, plan.minCargo) : 0 },
    efficiencyMods: {},
  };
  const derived = getDerivedStats(plan.shipId, fittings, player);
  const utilityFit = slots.some((slot) => slot.type === 'utility' && fits(slot, kit))
    && fittedIds.includes(kit.id);
  const kinetic = requiredDefs.find((def) => def.slotType === 'weapon'
    && (def.damageType === 'kinetic' || def.damageType === 'explosive'));
  const ammoUnitsPerFight = kinetic ? Math.ceil(8 * Math.max(1, kinetic.rof || 1)) : 0;
  const ammoDef = CMDTY_BY_ID.get('cmdty_munitions');
  const ammoReserve = {
    required: ammoUnitsPerFight > 0,
    unitsPerFight: ammoUnitsPerFight,
    cargoVolume: r2(ammoUnitsPerFight * (ammoDef && ammoDef.volPerU || 1)),
    serviceCost: round(ammoUnitsPerFight * SERVICE_PRICES.ammoCrPerUnit),
  };
  const researchGates = unresolvedTech([ship, ...requiredDefs], {
    player: { researchedNodes: NEW_GAME.researchedNodes || [] },
  });
  return {
    viable: missing.length === 0 && utilityFit && derived.cargoCap >= plan.minCargo
      && derived.operationalMass > 0 && derived.maxSpeed > 0,
    career,
    phase,
    shipId: plan.shipId,
    required: plan.required,
    fittedIds,
    missing,
    roleKitId: kit && kit.id,
    utilityFit,
    cargoCap: derived.cargoCap,
    minimumCargo: plan.minCargo,
    operationalMass: r2(derived.operationalMass),
    maxSpeed: r2(derived.maxSpeed),
    capRegen: r2(derived.capRegen),
    continuousDrain: r2(derived.continuousDrain),
    ammoReserve,
    researchGates,
  };
}

function unresolvedTech(defs, state) {
  const researched = new Set(state.player.researchedNodes || []);
  const missing = [];
  for (const def of defs) {
    if (!def || !def.requiresTech || researched.has(def.requiresTech)) continue;
    if (!missing.includes(def.requiresTech)) missing.push(def.requiresTech);
  }
  return missing.map((techId) => {
    const node = TECH_BY_ID.get(techId);
    return {
      techId,
      credits: node && node.cost && node.cost.credits || 0,
      researchPoints: node && node.cost && node.cost.rp || 0,
    };
  });
}

// ---- HAULER -------------------------------------------------------------------------------
function runHauler() {
  const seed = SEED_HAULER;
  const adapters = [
    'createSimulation(economy,cargo)',
    'economy.ensureMarket/quote/execute',
    'cargo hard volume cap',
    'travel:distance (missions sectorDistanceWu mirror)',
    'travel:time (MISSION_TUNING.cruiseSpeedRef)',
    'travel:stationTime (authored station positions)',
    'travel:highSecToll (world._gateToll mirror)',
    'travel:sceneToll (planGateScene)',
    'economy.update time advance (live drift + price impact)',
    'commodity marketTier: low-tier stations cannot vend deep-resource finds, but still buy them',
  ];
  const ctx = bootSim(seed);
  const starter = setHull(ctx.state, NEW_GAME.shipId);
  const midShip = SHIP_BY_ID.get('ship_mule');
  const receipt = emptyReceiptBase('hauler', seed, starter, {
    phase: 'starter→mid if capital allows',
    starterShip: starter.id,
    midShip: midShip && midShip.id,
    fitted: NEW_GAME.fittedModules.slice(),
  });
  receipt.adapters = adapters;
  receipt.ownedInventoryStart = { ...ctx.state.player.cargo.items };

  const buyStationId = 'station_beltout';  // mining producer
  const sellStationId = 'station_ceres'; // refinery consumer
  const buySector = STATION_TO_SECTOR.get(buyStationId);
  const sellSector = STATION_TO_SECTOR.get(sellStationId);
  ctx.econ.ensureMarket(buyStationId);
  ctx.econ.ensureMarket(sellStationId);

  // Progression contract: Ceres is tier 1, while Platinoid is a tier-3 find. Starter markets may
  // buy a discovered unit from the player, but cannot mint a risk-free supply for repeat hauling.
  const deepBuy = ctx.econ.quote(buyStationId, 'cmdty_ore_platinoid', 'buy', 1);
  const deepSell = ctx.econ.quote(sellStationId, 'cmdty_ore_platinoid', 'sell', 1);
  if (deepBuy.ok || deepBuy.reason !== 'tier_unavailable' || deepBuy.stationTier !== 1 || deepBuy.marketTier !== 3) {
    receipt.defects.push(`market_tier_buy_gate_failed:${JSON.stringify(deepBuy)}`);
  }
  if (!deepSell.ok) receipt.defects.push(`market_tier_liquidation_failed:${deepSell.reason || 'unknown'}`);

  // Deterministic early-career commodity pick from live quotes (no exotics). Long windows retire
  // a route when its real bid/ask spread collapses, then choose the next still-profitable lane.
  const exhaustedCommodityIds = new Set();
  const selectBestRoute = () => {
    let selected = null;
    for (const c of COMMODITIES) {
      if (c.legality !== 'legal' || c.basePrice > EARLY_CMDTY_MAX_BASE
        || exhaustedCommodityIds.has(c.id)) continue;
      const qb = ctx.econ.quote(buyStationId, c.id, 'buy', 1);
      const qs = ctx.econ.quote(sellStationId, c.id, 'sell', 1);
      if (!qb.ok || !qs.ok) continue;
      const margin = qs.unitAvg - qb.unitAvg;
      if (!(margin > 0)) continue;
      if (!selected || margin > selected.margin) {
        selected = { cmdtyId: c.id, name: c.name, margin, buy: qb.unitAvg, sell: qs.unitAvg, basePrice: c.basePrice, vol: c.volPerU };
      }
    }
    return selected;
  };
  let best = selectBestRoute();
  if (!best) {
    receipt.defects.push('no_positive_early_career_route');
    finalizeReceipt(receipt, ctx);
    return receipt;
  }
  receipt.route = {
    buyStationId,
    sellStationId,
    commodityId: best.cmdtyId,
    commodityName: best.name,
    initialBuy: r2(best.buy),
    initialSell: r2(best.sell),
    initialMargin: r2(best.margin),
  };
  receipt.routeHistory = [{ ...receipt.route, startedAtS: 0 }];

  let t = 0;
  let loops = 0;
  let marketExhaustion = false;
  let upgraded = false;
  let cargoCreated = 0;
  let cargoDestroyed = 0;
  const dayIndex = 0;

  // Start at Helios (NEW_GAME) — first leg to buy station.
  let currentSectorId = NEW_GAME.startingSectorId;
  let currentStationId = null;

  while (t < HORIZON_S) {
    const ship = upgraded && midShip ? midShip : starter;
    const cap = ship.cargo;
    ctx.state.player.cargo.capVolume = cap;

    // Travel buy station
    const leg1 = (currentStationId
      ? stationTravelTimeS(currentStationId, buyStationId)
      : travelTimeS(currentSectorId, buySector.id)) + DOCK_OVERHEAD_S;
    if (t + leg1 > HORIZON_S) break;
    const toll1 = routeToll(seed, currentSectorId, buySector.id, dayIndex).amount;
    receipt.tollCost += chargeRouteToll(ctx, toll1, `gate_toll:hauler:${loops}:to_buy`);
    advanceEconomy(ctx, leg1);
    t += leg1;
    receipt.travelTimeS += leg1;
    currentSectorId = buySector.id;
    currentStationId = buyStationId;

    const liveBuy = ctx.econ.quote(buyStationId, best.cmdtyId, 'buy', 1);
    const liveSell = ctx.econ.quote(sellStationId, best.cmdtyId, 'sell', 1);
    const liveMargin = liveBuy.ok && liveSell.ok ? liveSell.unitAvg - liveBuy.unitAvg : -Infinity;
    if (!(liveMargin > 0)) {
      marketExhaustion = true;
      exhaustedCommodityIds.add(best.cmdtyId);
      const replacement = selectBestRoute();
      if (!replacement) {
        receipt.loops.push({
          loop: loops, fail: 'all_early_routes_exhausted', t: r1(t),
          retiredCommodityId: best.cmdtyId, liveMargin: r2(liveMargin),
        });
        break;
      }
      receipt.routeHistory.push({
        buyStationId, sellStationId, commodityId: replacement.cmdtyId,
        commodityName: replacement.name, initialBuy: r2(replacement.buy),
        initialSell: r2(replacement.sell), initialMargin: r2(replacement.margin),
        startedAtS: r1(t), retiredCommodityId: best.cmdtyId,
      });
      best = replacement;
    }

    // Buy as many units as credits + cargo + stock allow (live execute).
    const freeVol = ctx.state.player.cargo.capVolume - ctx.state.player.cargo.usedVolume;
    const volPer = best.vol > 0 ? best.vol : 1;
    let want = Math.floor(freeVol / volPer);
    const entry = ctx.state.economy.markets[buyStationId][best.cmdtyId];
    const stockAvail = Math.max(0, Math.floor((entry && entry.stock) - 1));
    if (stockAvail <= 0) {
      marketExhaustion = true;
      receipt.loops.push({ loop: loops, fail: 'no_stock_at_buy', stock: entry && entry.stock });
      break;
    }
    want = Math.min(want, stockAvail);
    // affordability probe via quote
    while (want > 0) {
      const q = ctx.econ.quote(buyStationId, best.cmdtyId, 'buy', want);
      if (q.ok && q.total <= (ctx.state.player.credits | 0)) break;
      want = Math.floor(want * 0.85);
    }
    if (want <= 0) {
      receipt.loops.push({ loop: loops, fail: 'cannot_afford_or_fit', credits: ctx.state.player.credits });
      break;
    }
    const stockBeforeBuy = entry.stock;
    const buyRes = ctx.econ.execute(buyStationId, best.cmdtyId, 'buy', want);
    if (!buyRes.ok) {
      if (buyRes.reason === 'no_stock') marketExhaustion = true;
      receipt.loops.push({ loop: loops, fail: buyRes.reason || 'buy_failed' });
      break;
    }
    cargoCreated += buyRes.qty;
    receipt.purchaseSpend += buyRes.total;
    const stockAfterBuy = entry.stock;

    // Travel sell station
    const leg2 = stationTravelTimeS(buyStationId, sellStationId) + DOCK_OVERHEAD_S;
    if (t + leg2 > HORIZON_S) {
      // stuck with cargo; no free liquidation
      receipt.loops.push({
        loop: loops,
        partial: true,
        bought: buyRes.qty,
        buyTotal: buyRes.total,
        buyImpactPct: r2(buyRes.priceImpactPct),
        note: 'horizon_before_sell',
      });
      break;
    }
    const toll2 = routeToll(seed, currentSectorId, sellSector.id, dayIndex).amount;
    receipt.tollCost += chargeRouteToll(ctx, toll2, `gate_toll:hauler:${loops}:to_sell`);
    advanceEconomy(ctx, leg2);
    t += leg2;
    receipt.travelTimeS += leg2;
    currentSectorId = sellSector.id;
    currentStationId = sellStationId;

    const have = ctx.state.player.cargo.items[best.cmdtyId] || 0;
    const sellEntry = ctx.state.economy.markets[sellStationId][best.cmdtyId];
    const stockBeforeSell = sellEntry.stock;
    const sellRes = ctx.econ.execute(sellStationId, best.cmdtyId, 'sell', have);
    if (!sellRes.ok) {
      receipt.loops.push({ loop: loops, fail: sellRes.reason || 'sell_failed', have });
      break;
    }
    cargoDestroyed += sellRes.qty;
    receipt.saleProceeds += sellRes.total;
    loops += 1;
    receipt.loops.push({
      loop: loops,
      t: r1(t),
      bought: buyRes.qty,
      buyUnitAvg: r2(buyRes.unitAvg),
      buyTotal: buyRes.total,
      buyImpactPct: r2(buyRes.priceImpactPct),
      stockBuy: { before: r1(stockBeforeBuy), after: r1(stockAfterBuy) },
      sold: sellRes.qty,
      sellUnitAvg: r2(sellRes.unitAvg),
      sellTotal: sellRes.total,
      sellImpactPct: r2(sellRes.priceImpactPct),
      stockSell: { before: r1(stockBeforeSell), after: r1(sellEntry.stock) },
      creditsAfter: ctx.state.player.credits | 0,
      shipId: ship.id,
      tolls: toll1 + toll2,
    });

    // Mid-career upgrade: buy Mule when capital allows (pays ship price, gains cargo capacity).
    if (!upgraded && midShip && (ctx.state.player.credits | 0) >= midShip.price) {
      ctx.econ.chargeCredits(midShip.price, 'shipyard:ship_mule');
      setHull(ctx.state, midShip.id);
      upgraded = true;
      receipt.equipment.upgradedAtLoop = loops;
      receipt.equipment.upgradeCost = midShip.price;
      receipt.purchaseSpend += midShip.price;
    }
  }

  receipt.completedLoops = loops;
  receipt.marketExhaustion = marketExhaustion;
  receipt.inventoryCreated = cargoCreated;
  receipt.inventoryRemoved = cargoDestroyed;
  receipt.inventoryDelta = inventoryUnits(ctx.state.player.cargo);
  receipt.elapsedS = r1(t);
  receipt.equipment.activePhase = upgraded ? 'mid' : 'starter';
  receipt.equipment.plannedMidLoadout = assessLoadoutViability('hauler', 'mid');
  receipt.loadoutViability = assessLoadoutViability('hauler', receipt.equipment.activePhase);
  finalizeReceipt(receipt, ctx);
  return receipt;
}

// ---- HUNTER -------------------------------------------------------------------------------
function runHunter() {
  const seed = SEED_HUNTER;
  const adapters = [
    'createSimulation(economy,cargo)',
    'MISSION_TUNING.BASE/RISK_MULT reward family',
    'ENEMY_TYPES EHP + WEAPONS dps combat-time kernel',
    'SERVICE_PRICES repair/ammo',
    'economy.grantCredits / chargeCredits',
    'travel:distance/time/toll adapters',
    'economy.update time advance',
  ];
  const ctx = bootSim(seed);
  const starter = setHull(ctx.state, NEW_GAME.shipId);
  const midShip = SHIP_BY_ID.get('ship_wasp');
  const starterWpn = WEAPON_BY_ID.get('wpn_pulse_laser_s');
  const midWpn = WEAPON_BY_ID.get('wpn_autocannon_s');
  const earlyEnemy = ENEMY_TYPES.find((e) => e.id === 'wasp_swarmer');
  const midEnemy = ENEMY_TYPES.find((e) => e.id === 'lancer_sniper');

  const receipt = emptyReceiptBase('hunter', seed, starter, {
    phase: 'starter→mid if capital allows',
    starterShip: starter.id,
    starterWeapon: starterWpn && starterWpn.id,
    midShip: midShip && midShip.id,
    midWeapon: midWpn && midWpn.id,
    earlyEnemy: earlyEnemy && earlyEnemy.id,
    midEnemy: midEnemy && midEnemy.id,
  });
  receipt.adapters = adapters;
  receipt.ownedInventoryStart = { ...ctx.state.player.cargo.items };

  const homeSectorId = NEW_GAME.startingSectorId;
  const huntSectorId = 'sector_ceres_belt';
  const huntSector = SECTOR_BY_ID.get(huntSectorId);
  const bountyType = MISSION_TYPES.find((def) => def.type === 'bounty_hunt');
  const bountyRiskLo = bountyType?.riskTierRange?.[0] ?? 0;
  const bountyRiskHi = bountyType?.riskTierRange?.[1] ?? 4;
  const riskTier = clamp(Math.max(dangerTier(huntSector || {}), bountyRiskLo), bountyRiskLo, bountyRiskHi);
  // Deterministic mid-band targetStrength (missions _rollParams bounty: 1.2 + risk*0.5 + rng*0.6)
  const targetStrengthEarly = 1.2 + riskTier * 0.5 + 0.3;
  const targetStrengthMid = 1.2 + Math.min(4, riskTier + 1) * 0.5 + 0.3;
  const distance = sectorDistanceWu(homeSectorId, huntSectorId);

  let t = 0;
  let loops = 0;
  let completedMissions = 0;
  let failedMissions = 0;
  let upgraded = false;
  let currentSectorId = homeSectorId;
  const dayIndex = 0;
  let ammoPurchased = 0;
  let ammoConsumed = 0;

  // Optional: buy starter ammo buffer for kinetic mid weapon (not free inventory).
  function ensureAmmo(units) {
    if (units <= 0) return 0;
    const cost = round(units * SERVICE_PRICES.ammoCrPerUnit);
    if ((ctx.state.player.credits | 0) < cost) return 0;
    const added = addCargo(ctx.state, 'cmdty_munitions', units);
    if (added <= 0) return 0;
    const real = round(added * SERVICE_PRICES.ammoCrPerUnit);
    ctx.econ.chargeCredits(real, 'service:ammo');
    receipt.ammoCost += real;
    receipt.purchaseSpend += real;
    ammoPurchased += added;
    return added;
  }

  while (t < HORIZON_S) {
    const useMid = upgraded;
    const enemy = useMid ? midEnemy : earlyEnemy;
    const weapon = useMid ? midWpn : starterWpn;
    if (!enemy || !weapon) {
      receipt.defects.push('missing_enemy_or_weapon_data');
      break;
    }

    // Travel to hunt sector
    const legOut = travelTimeS(currentSectorId, huntSectorId) + COMBAT_APPROACH_S;
    if (t + legOut > HORIZON_S) break;
    const tollOut = routeToll(seed, currentSectorId, huntSectorId, dayIndex).amount;
    receipt.tollCost += chargeRouteToll(ctx, tollOut, `gate_toll:hunter:${loops}:out`);
    advanceEconomy(ctx, legOut);
    t += legOut;
    receipt.travelTimeS += legOut;
    currentSectorId = huntSectorId;

    // Combat duration from live EHP / DPS (no free kills).
    const [levelLo, levelHi] = huntSector?.enemyLevel || [1, 1];
    const enemyLevel = Math.round((levelLo + levelHi) / 2);
    const enemySpec = makeEnemySpawnSpec(enemy.id, enemyLevel, { x: 0, z: 0 });
    const ehp = (enemySpec.hull || 0) + (enemySpec.armorHp || 0) + (enemySpec.shield || 0);
    const dps = weapon.dps || 1;
    const fightS = Math.max(8, ehp / dps);
    // Enemy return fire → hull damage → repair sink (SERVICE_PRICES).
    const enemyDps = (enemySpec.data?.weapons || []).reduce((sum, w) => {
      const dmg = Number(w.dmg) || 0;
      const rof = Number(w.rof) || 0;
      if (rof === 0) return sum + (Number(w.dps) || dmg);
      return sum + dmg * rof;
    }, 0);
    const damageTaken = enemyDps * fightS * REPAIR_FRAC_OF_DAMAGE;
    const repairCr = round(damageTaken * SERVICE_PRICES.repairCrPerHp);

    // Ammo for kinetic mid weapon only (pulse laser is energy).
    let ammoThis = 0;
    if (weapon.damageType === 'kinetic' || weapon.damageType === 'explosive') {
      const shots = Math.ceil(fightS * (weapon.rof || 1));
      const spent = Math.min(shots, ctx.state.player.cargo.items.cmdty_munitions || 0);
      if (spent > 0) {
        removeCargo(ctx.state, 'cmdty_munitions', spent);
        ammoThis = spent;
        ammoConsumed += spent;
      } else {
        // must purchase munitions to fire kinetic — no free ammo
        const bought = ensureAmmo(Math.max(8, shots));
        if (bought > 0) {
          const use = Math.min(shots, ctx.state.player.cargo.items.cmdty_munitions || 0);
          removeCargo(ctx.state, 'cmdty_munitions', use);
          ammoThis = use;
          ammoConsumed += use;
        } else if ((weapon.damageType === 'kinetic' || weapon.damageType === 'explosive') && upgraded) {
          // cannot complete mid kinetic fight without ammo
          receipt.loops.push({ loop: loops, fail: 'no_ammo', t: r1(t) });
          break;
        }
      }
    }

    advanceEconomy(ctx, fightS);
    t += fightS;

    // Mission payout via live formula (bounty_hunt); credits only through economy writer.
    const strength = useMid ? targetStrengthMid : targetStrengthEarly;
    const reward = missionRewardCr('bounty_hunt', distance, riskTier, strength, 1, 1);
    // Bounty board also pays enemy.bountyCr as kill bonus when present (live enemy data).
    const killBonus = enemySpec.data?.bountyCr || 0;
    // Mission counterplay: a deterministic fraction of marks break contact or force withdrawal.
    // The attempt still consumes travel, toll, time, and repair; failed writs pay nothing.
    const missionSucceeded = (hash32(seed, 'hunter_counterplay', loops + 1) % 7) !== 0;
    const gross = missionSucceeded ? reward + killBonus : 0;

    // Repair before collecting (station services on return) — cost reserved.
    // Apply repair charge now so capital stays honest mid-route.
    if (repairCr > 0) {
      const can = Math.min(repairCr, ctx.state.player.credits | 0);
      if (can > 0) {
        ctx.econ.chargeCredits(can, 'service:repair');
        receipt.repairCost += can;
      }
    }

    ctx.econ.grantCredits(gross, `mission:bounty_hunt:${loops}`);
    receipt.missionProceeds += gross;
    if (missionSucceeded) completedMissions += 1;
    else failedMissions += 1;

    // Return home (dock + board refresh overhead)
    const legHome = travelTimeS(currentSectorId, homeSectorId) + DOCK_OVERHEAD_S;
    if (t + legHome > HORIZON_S) {
      // reward already paid in-field; travel incomplete is fine
      loops += 1;
      receipt.loops.push({
        loop: loops, t: r1(t), reward: missionSucceeded ? reward : 0,
        killBonus: missionSucceeded ? killBonus : 0, outcome: missionSucceeded ? 'completed' : 'countered',
        fightS: r1(fightS), ehp, dps,
        damageTaken: r1(damageTaken), repairCr, ammoThis, partialReturn: true,
        enemyId: enemy.id, weaponId: weapon.id, creditsAfter: ctx.state.player.credits | 0,
      });
      break;
    }
    const homeSec = SECTOR_BY_ID.get(homeSectorId);
    const tollHome = routeToll(seed, currentSectorId, homeSectorId, dayIndex).amount;
    receipt.tollCost += chargeRouteToll(ctx, tollHome, `gate_toll:hunter:${loops}:home`);
    advanceEconomy(ctx, legHome);
    t += legHome;
    receipt.travelTimeS += legHome;
    currentSectorId = homeSectorId;

    loops += 1;
    receipt.loops.push({
      loop: loops,
      t: r1(t),
      reward: missionSucceeded ? reward : 0,
      killBonus: missionSucceeded ? killBonus : 0,
      outcome: missionSucceeded ? 'completed' : 'countered',
      fightS: r1(fightS),
      ehp,
      dps,
      damageTaken: r1(damageTaken),
      repairCr,
      ammoThis,
      enemyId: enemy.id,
      enemyLevel,
      weaponId: weapon.id,
      riskTier,
      targetStrength: r2(strength),
      creditsAfter: ctx.state.player.credits | 0,
    });

    // Mid upgrade: Wasp + autocannon when affordable (ship + weapon prices from live data).
    if (!upgraded && midShip && midWpn) {
      const need = midShip.price + midWpn.price;
      if ((ctx.state.player.credits | 0) >= need) {
        const techGates = unresolvedTech([midShip, midWpn], ctx.state);
        if (techGates.length) {
          receipt.equipment.upgradeBlockedBy = {
            kind: 'research',
            gates: techGates,
            availableCredits: ctx.state.player.credits | 0,
            availableResearchPoints: ctx.state.player.researchPoints || 0,
          };
        } else {
          ctx.econ.chargeCredits(midShip.price, 'shipyard:ship_wasp');
          ctx.econ.chargeCredits(midWpn.price, 'outfitting:wpn_autocannon_s');
          receipt.purchaseSpend += midShip.price + midWpn.price;
          setHull(ctx.state, midShip.id);
          ensureAmmo(40);
          upgraded = true;
          receipt.equipment.upgradedAtLoop = loops;
          receipt.equipment.upgradeCost = need;
        }
      }
    }
  }

  receipt.completedLoops = completedMissions;
  receipt.missionAttempts = loops;
  receipt.failedMissions = failedMissions;
  receipt.inventoryCreated = ammoPurchased;
  receipt.inventoryRemoved = ammoConsumed;
  receipt.missionCost = 0; // no collateral on bounty_hunt
  receipt.elapsedS = r1(t);
  receipt.marketExhaustion = false;
  receipt.equipment.activePhase = upgraded ? 'mid' : 'starter';
  receipt.equipment.plannedMidLoadout = assessLoadoutViability('hunter', 'mid');
  receipt.loadoutViability = assessLoadoutViability('hunter', receipt.equipment.activePhase);
  finalizeReceipt(receipt, ctx);
  return receipt;
}

// ---- PROSPECTOR ---------------------------------------------------------------------------
function runProspector() {
  const seed = SEED_PROSPECTOR;
  const adapters = [
    'createSimulation(economy,cargo)',
    'MODULES/BEAMS mining dps + ASTEROIDS hp/yield tables',
    'fieldDepletion.recordFieldExtraction / richnessMultiplierForDepletion',
    'economy.execute sell (real stock + price impact)',
    'RECIPES refinery fee (optional refine when profitable)',
    'bulkHaulPayoutForChunk kernel (receipt cross-check only)',
    'travel intra-sector + highSec/scene tolls on sector hops',
    'economy.update + recoverFieldDepletion',
  ];
  const ctx = bootSim(seed);
  const starter = setHull(ctx.state, NEW_GAME.shipId);
  const midShip = SHIP_BY_ID.get('ship_pelican');
  const starterBeam = MODULE_BY_ID.get('mod_mining_laser_s') || BEAMS.find((b) => b.id === 'beam_mk1');
  const midBeam = MODULE_BY_ID.get('mod_mining_beam_m') || BEAMS.find((b) => b.id === 'beam_mk2');
  const fieldIds = ['f_helios_starter', 'f_helios_outer'];
  let fieldIndex = 0;
  let fieldId = fieldIds[fieldIndex];
  const fieldSectorId = 'sector_helios_prime';
  const sellStationId = 'station_helios';
  const refineStationId = 'station_ceres';
  const ast = ASTEROIDS.find((a) => a.id === 'ast_common_rock');

  const receipt = emptyReceiptBase('prospector', seed, starter, {
    phase: 'starter→mid if capital allows',
    starterShip: starter.id,
    starterBeam: starterBeam && (starterBeam.id || 'beam_mk1'),
    midShip: midShip && midShip.id,
    midBeam: midBeam && (midBeam.id || 'beam_mk2'),
    fieldIds: fieldIds.slice(),
    asteroidType: ast && ast.id,
  });
  receipt.adapters = adapters;
  receipt.ownedInventoryStart = { ...ctx.state.player.cargo.items };

  ctx.econ.ensureMarket(sellStationId);
  ctx.econ.ensureMarket(refineStationId);
  ctx.state.world.currentSectorId = fieldSectorId;

  // Deterministic asteroid sizing from seed (hash, not Math.random).
  const rng = mulberry32(hash32(seed, 'prospector', fieldId));
  const hpLo = ast.hp[0];
  const hpHi = ast.hp[1];
  const yLo = ast.yieldU[0];
  const yHi = ast.yieldU[1];

  let t = 0;
  let loops = 0;
  let upgraded = false;
  let marketExhaustion = false;
  let cargoCreated = 0;
  let cargoDestroyed = 0;
  let asteroidsMined = 0;
  let currentSectorId = fieldSectorId;
  const dayIndex = 0;

  // Pick primary ore from asteroid table (highest weight) — no free rare swaps.
  let primaryOre = 'cmdty_silicate';
  let bestW = -1;
  for (const oreId of Object.keys(ast.oreTable || {})) {
    const w = ast.oreTable[oreId];
    if (w > bestW) { bestW = w; primaryOre = oreId; }
  }

  while (t < HORIZON_S) {
    const openingReadout = fieldMemoryReadout(ctx.state, fieldId);
    if (openingReadout.band === 'depleted') {
      marketExhaustion = true;
      const nextFieldId = fieldIds[fieldIndex + 1];
      const rotationS = MINING_TRANSIT_S * 2;
      if (!nextFieldId || t + rotationS > HORIZON_S) {
        receipt.loops.push({
          loop: loops, fail: 'all_local_fields_depleted', fieldId, t: r1(t),
        });
        break;
      }
      advanceEconomy(ctx, rotationS);
      t += rotationS;
      receipt.travelTimeS += rotationS;
      fieldIndex += 1;
      fieldId = nextFieldId;
      receipt.fieldRotations = receipt.fieldRotations || [];
      receipt.fieldRotations.push({ from: openingReadout.fieldId, to: fieldId, atS: r1(t) });
    }
    const beam = upgraded && midBeam ? midBeam : starterBeam;
    const ship = upgraded && midShip ? midShip : starter;
    ctx.state.player.cargo.capVolume = ship.cargo;
    const dps = beam.dps || 18;

    // One asteroid extraction cycle at the field.
    const u = rng();
    const rockHp = hpLo + (hpHi - hpLo) * u;
    const rockYield = yLo + (yHi - yLo) * rng();
    const readout = fieldMemoryReadout(ctx.state, fieldId);
    const richness = readout.richnessMult != null ? readout.richnessMult : 1;
    const yieldU = Math.max(1, Math.floor(rockYield * richness));
    const mineS = rockHp / dps;
    // Seam mastery assumed competent on-seam (SEAM_YIELD_OFF not applied — on-seam work).
    const cycleMineS = mineS + MINING_TRANSIT_S * 0.35;

    if (t + cycleMineS > HORIZON_S) break;
    advanceEconomy(ctx, cycleMineS);
    t += cycleMineS;

    // Live field depletion ledger (no infinite belt).
    recordFieldExtraction(ctx.state, {
      fieldId,
      sectorId: fieldSectorId,
      extractedU: yieldU,
      simTime: ctx.state.simTime,
      asteroidId: `${fieldId}:ast_${asteroidsMined}`,
      tick: asteroidsMined,
    });
    asteroidsMined += 1;

    // Cargo gain only through addCargo (volume-capped).
    const added = addCargo(ctx.state, primaryOre, yieldU);
    cargoCreated += added;
    if (added <= 0) {
      // hold full → sell run
    }

    const free = ctx.state.player.cargo.capVolume - ctx.state.player.cargo.usedVolume;
    const holdFull = free < 1;
    const timeToSell = holdFull || (ctx.state.player.cargo.usedVolume >= ship.cargo * 0.85);

    if (!timeToSell) continue;

    // Optional refine at Ceres when recipe is affordable and mid-career.
    const oreHave = ctx.state.player.cargo.items[primaryOre] || 0;
    let refined = false;
    if (upgraded && primaryOre === 'cmdty_ore_iron' && oreHave >= 2) {
      const recipe = RECIPES.find((r) => r.id === 'recipe_refine_iron');
      if (recipe) {
        const batches = Math.floor(oreHave / 2);
        const fee = batches * (recipe.fee || 0);
        const refineTime = batches * (recipe.timeS || 0) + travelTimeS(fieldSectorId, STATION_TO_SECTOR.get(refineStationId).id) + DOCK_OVERHEAD_S;
        if (t + refineTime <= HORIZON_S && (ctx.state.player.credits | 0) >= fee && batches > 0) {
          // travel to refinery
          const refSec = STATION_TO_SECTOR.get(refineStationId);
          const tollR = routeToll(seed, currentSectorId, refSec.id, dayIndex).amount;
          receipt.tollCost += chargeRouteToll(ctx, tollR, `gate_toll:prospect:${loops}:refine`);
          advanceEconomy(ctx, refineTime);
          t += refineTime;
          receipt.travelTimeS += refineTime;
          currentSectorId = refSec.id;
          // consume ore, pay fee, produce refined (not free inventory — 2:1 recipe)
          const removed = removeCargo(ctx.state, primaryOre, batches * 2);
          cargoDestroyed += removed;
          const outQty = Math.floor(removed / 2);
          if (fee > 0) {
            ctx.econ.chargeCredits(fee, 'refinery:recipe_refine_iron');
            receipt.refineryCost += fee;
          }
          const made = addCargo(ctx.state, 'cmdty_refined_metals', outQty);
          cargoCreated += made;
          // sell refined at forge/fab demand would be better; sell at helios for simplicity
          refined = true;
        }
      }
    }

    // Sell at Helios market via live execute.
    const sellSec = STATION_TO_SECTOR.get(sellStationId);
    const legSell = travelTimeS(currentSectorId, sellSec.id) + DOCK_OVERHEAD_S;
    if (t + legSell > HORIZON_S) {
      receipt.loops.push({ loop: loops, fail: 'horizon_before_sell', cargo: { ...ctx.state.player.cargo.items } });
      break;
    }
    const tollS = routeToll(seed, currentSectorId, sellSec.id, dayIndex).amount;
    receipt.tollCost += chargeRouteToll(ctx, tollS, `gate_toll:prospect:${loops}:sell`);
    advanceEconomy(ctx, legSell);
    t += legSell;
    receipt.travelTimeS += legSell;
    currentSectorId = sellSec.id;

    const sellIds = Object.keys(ctx.state.player.cargo.items || {});
    let loopProceeds = 0;
    let loopSold = 0;
    for (const cid of sellIds) {
      if (cid === 'cmdty_munitions') continue;
      const qty = ctx.state.player.cargo.items[cid] || 0;
      if (qty <= 0) continue;
      const market = ctx.state.economy.markets[sellStationId];
      const entry = market && market[cid];
      const stockBefore = entry ? entry.stock : 0;
      const res = ctx.econ.execute(sellStationId, cid, 'sell', qty);
      if (!res.ok) {
        if (res.reason === 'untraded') continue;
        continue;
      }
      cargoDestroyed += res.qty;
      loopSold += res.qty;
      loopProceeds += res.total;
      receipt.saleProceeds += res.total;
      receipt.loops.push({
        loop: loops + 1,
        t: r1(t),
        soldId: cid,
        sold: res.qty,
        unitAvg: r2(res.unitAvg),
        total: res.total,
        impactPct: r2(res.priceImpactPct),
        stock: { before: r1(stockBefore), after: r1(entry && entry.stock) },
        field: fieldMemoryReadout(ctx.state, fieldId),
        beamId: beam.id,
        shipId: ship.id,
        refined,
        creditsAfter: ctx.state.player.credits | 0,
      });
    }
    if (loopSold <= 0) {
      marketExhaustion = true;
      break;
    }
    loops += 1;

    // Return to field
    const legField = travelTimeS(currentSectorId, fieldSectorId) + MINING_TRANSIT_S * 0.5;
    if (t + legField > HORIZON_S) break;
    advanceEconomy(ctx, legField);
    t += legField;
    receipt.travelTimeS += legField;
    currentSectorId = fieldSectorId;

    // Mid upgrade: Pelican + mining beam M when affordable.
    if (!upgraded && midShip && midBeam) {
      const beamPrice = midBeam.price || 22000;
      const need = midShip.price + beamPrice;
      if ((ctx.state.player.credits | 0) >= need) {
        const techGates = unresolvedTech([midShip, midBeam], ctx.state);
        if (techGates.length) {
          receipt.equipment.upgradeBlockedBy = {
            kind: 'research',
            gates: techGates,
            availableCredits: ctx.state.player.credits | 0,
            availableResearchPoints: ctx.state.player.researchPoints || 0,
          };
        } else {
          ctx.econ.chargeCredits(midShip.price, 'shipyard:ship_pelican');
          ctx.econ.chargeCredits(beamPrice, 'outfitting:mod_mining_beam_m');
          receipt.purchaseSpend += midShip.price + beamPrice;
          setHull(ctx.state, midShip.id);
          upgraded = true;
          receipt.equipment.upgradedAtLoop = loops;
          receipt.equipment.upgradeCost = need;
        }
      }
    }

    // Cross-check bulk haul kernel is wired (not used as free reward).
    if (yieldU > BULK_HAUL_MIN_U) {
      const chk = bulkHaulPayoutForChunk({
        mass: yieldU,
        data: { isChunk: true, bulkMassU: yieldU, commodityId: primaryOre },
      });
      receipt.bulkHaulKernelSample = chk;
    }
  }

  receipt.completedLoops = loops;
  receipt.marketExhaustion = marketExhaustion || (fieldMemoryReadout(ctx.state, fieldId).band === 'depleted');
  receipt.inventoryCreated = cargoCreated;
  receipt.inventoryRemoved = cargoDestroyed;
  receipt.inventoryDelta = inventoryUnits(ctx.state.player.cargo);
  receipt.asteroidsMined = asteroidsMined;
  receipt.fieldFinal = fieldMemoryReadout(ctx.state, fieldId);
  receipt.fieldFinals = fieldIds.map((id) => fieldMemoryReadout(ctx.state, id));
  receipt.elapsedS = r1(t);
  receipt.fieldRecoveryPerS = FIELD_DEPLETION_RECOVERY_PER_S;
  receipt.equipment.activePhase = upgraded ? 'mid' : 'starter';
  receipt.equipment.plannedMidLoadout = assessLoadoutViability('prospector', 'mid');
  receipt.loadoutViability = assessLoadoutViability('prospector', receipt.equipment.activePhase);
  finalizeReceipt(receipt, ctx);
  return receipt;
}

function finalizeReceipt(receipt, ctx) {
  receipt.endingCapital = ctx.state.player.credits | 0;
  receipt.netCredits = receipt.endingCapital - receipt.startingCapital;
  receipt.assetPurchases = Math.max(0, Number(receipt.equipment?.upgradeCost) || 0);
  receipt.earnedValue = receipt.netCredits + receipt.assetPurchases;
  const elapsedMin = Math.max(receipt.elapsedS || HORIZON_S, 1) / 60;
  // Rate over the full 30-min career window (not wall-clock; not partial early-exit padding).
  const windowMin = HORIZON_S / 60;
  receipt.cashCreditsPerMin = r2(receipt.netCredits / windowMin);
  receipt.creditsPerMin = r2(receipt.earnedValue / windowMin);
  receipt.creditsPerMinActive = r2(receipt.earnedValue / elapsedMin);
  receipt.ownedInventoryEnd = { ...ctx.state.player.cargo.items };
  receipt.elapsedS = receipt.elapsedS != null ? receipt.elapsedS : HORIZON_S;
}

// ---- assertions ---------------------------------------------------------------------------
function assertCareer(receipt, bands) {
  const fails = [];
  const warns = [];

  if (!Number.isFinite(receipt.endingCapital) || receipt.endingCapital < 0) {
    fails.push(`impossible_capital ending=${receipt.endingCapital}`);
  }
  if (receipt.startingCapital !== NEW_GAME.credits) {
    fails.push(`starting_capital_mismatch ${receipt.startingCapital}!=${NEW_GAME.credits}`);
  }
  if (receipt.netCredits < 0) {
    fails.push(`negative_route net=${receipt.netCredits}`);
  }
  if (receipt.completedLoops <= 0) {
    fails.push(`dead_route completedLoops=${receipt.completedLoops}`);
  }
  if (receipt.creditsPerMin < bands.dead) {
    fails.push(`dead_income ${receipt.creditsPerMin} cr/min < ${bands.dead} (15% A(T1))`);
  } else if (receipt.creditsPerMin < bands.lo) {
    fails.push(`below_healthy_band ${receipt.creditsPerMin} cr/min < ${bands.lo} (25% A(T1))`);
  }
  if (receipt.creditsPerMin > bands.hi) {
    fails.push(`implausible_dominant ${receipt.creditsPerMin} cr/min > ${bands.hi} (2.5× A(T1))`);
  }
  // Ladder: the 30-minute checkpoint must not buy a freighter alone. The 90-minute window is
  // allowed to cross that threshold, but still has the same sustained-income dominance ceiling.
  if (HORIZON_S <= 30 * 60
    && receipt.earnedValue > LADDER_FREIGHTER_PRICE * LADDER_MAX_30MIN_FRAC_OF_FREIGHTER) {
    fails.push(
      `ladder_too_fast earnedValue=${receipt.earnedValue} > ${Math.round(LADDER_FREIGHTER_PRICE * LADDER_MAX_30MIN_FRAC_OF_FREIGHTER)} `
      + `(${LADDER_MAX_30MIN_FRAC_OF_FREIGHTER * 100}% of freighter ${LADDER_FREIGHTER_PRICE})`,
    );
  }
  // Inventory conservation: end units ≤ created − removed + start (allow 0 start).
  const endU = inventoryUnits({ items: receipt.ownedInventoryEnd });
  const startU = inventoryUnits({ items: receipt.ownedInventoryStart });
  if (receipt.inventoryCreated != null && receipt.inventoryRemoved != null) {
    const expectedMax = startU + receipt.inventoryCreated - receipt.inventoryRemoved;
    if (endU > expectedMax + 0) {
      fails.push(`inventory_creation end=${endU} > expectedMax=${expectedMax}`);
    }
  }
  // No free starting cargo.
  if (startU !== 0) fails.push(`free_start_inventory units=${startU}`);
  if (!receipt.loadoutViability || !receipt.loadoutViability.viable) {
    fails.push(`unviable_loadout ${JSON.stringify(receipt.loadoutViability || null)}`);
  }
  if (!receipt.equipment || !receipt.equipment.plannedMidLoadout
    || !receipt.equipment.plannedMidLoadout.viable) {
    fails.push(`unviable_planned_mid_loadout ${JSON.stringify(receipt.equipment && receipt.equipment.plannedMidLoadout || null)}`);
  }

  if (HORIZON_S >= 90 * 60) {
    if ((receipt.elapsedS || 0) < HORIZON_S * 0.95) {
      fails.push(`window_not_sustained elapsed=${receipt.elapsedS} horizon=${HORIZON_S}`);
    }
    if (receipt.career === 'hauler' && (!receipt.routeHistory || receipt.routeHistory.length < 2)) {
      fails.push('hauler_never_rotated_exhausted_market');
    }
    if (receipt.career === 'prospector' && (!receipt.fieldRotations || receipt.fieldRotations.length < 1)) {
      fails.push('prospector_never_rotated_depleted_field');
    }
    if (receipt.career === 'hunter') {
      const blocked = receipt.equipment && receipt.equipment.upgradeBlockedBy;
      const plannedGates = receipt.equipment.plannedMidLoadout.researchGates || [];
      if (receipt.equipment.upgradedAtLoop != null
        || !plannedGates.some((gate) => gate.techId === 'tech_combat_basics')
        || (blocked && blocked.kind !== 'research')) {
        fails.push('hunter_bypassed_or_failed_to_report_research_gate');
      }
      const ammo = receipt.equipment.plannedMidLoadout.ammoReserve;
      if (!ammo.required || ammo.unitsPerFight <= 0 || ammo.serviceCost <= 0) {
        fails.push('hunter_mid_loadout_omits_ammunition_risk');
      }
      if (!(receipt.repairCost > 0) || !(receipt.failedMissions > 0)) {
        fails.push('hunter_route_omits_repair_or_counterplay_risk');
      }
    }
  }

  // Capital path: never ended below zero after any completed loop (spot check).
  for (const loop of receipt.loops || []) {
    if (loop.creditsAfter != null && loop.creditsAfter < 0) {
      fails.push(`negative_mid_capital loop=${loop.loop}`);
    }
  }

  receipt.assertionFails = fails;
  receipt.assertionWarns = warns;
  receipt.ok = fails.length === 0;
  return receipt;
}

function assertCrossCareer(receipts, bands) {
  const rates = receipts.map((r) => r.creditsPerMin).filter((n) => Number.isFinite(n) && n > 0);
  const fails = [];
  if (rates.length === 3) {
    const mn = Math.min(...rates);
    const mx = Math.max(...rates);
    const ratio = mn > 0 ? mx / mn : Infinity;
    if (ratio > BAND_CROSS_MAX) {
      fails.push(`cross_career_skew max/min=${r2(ratio)} > ${BAND_CROSS_MAX} (${mx} vs ${mn} cr/min)`);
    }
  } else {
    fails.push('cross_career_incomplete_rates');
  }
  // No single career may exceed A(T2) sustained on starter-constrained 30 min (too strong).
  for (const r of receipts) {
    if (r.creditsPerMin > A_T2 * 1.25) {
      fails.push(`${r.career} exceeds 1.25×A(T2)=${A_T2 * 1.25} at ${r.creditsPerMin} cr/min`);
    }
  }
  const roleKits = new Set(receipts.map((receipt) => receipt.loadoutViability && receipt.loadoutViability.roleKitId));
  if (roleKits.size !== 3 || roleKits.has(undefined)) {
    fails.push('career_loadout_identity_flattened_or_missing');
  }
  return { ok: fails.length === 0, fails, bands };
}

// ---- main ---------------------------------------------------------------------------------
const t0 = _PerfNow();
let hauler;
let hunter;
let prospector;
let cross;
const bands = {
  A_T1,
  A_T2,
  A_tierTable: A_TIER.slice(),
  dead: r2(A_T1 * BAND_DEAD_FRAC),
  lo: r2(A_T1 * BAND_LO_FRAC),
  hi: r2(A_T1 * BAND_HI_FRAC),
  crossMax: BAND_CROSS_MAX,
  ladderFreighter: LADDER_FREIGHTER_PRICE,
  ladderMax30mNet: round(LADDER_FREIGHTER_PRICE * LADDER_MAX_30MIN_FRAC_OF_FREIGHTER),
};

try {
  blockNondeterminism();
  hauler = assertCareer(runHauler(), bands);
  hunter = assertCareer(runHunter(), bands);
  prospector = assertCareer(runProspector(), bands);
  cross = assertCrossCareer([hauler, hunter, prospector], bands);
} catch (err) {
  restoreNondeterminism();
  console.error('[check-career-earnings-benchmark] RUNTIME_FAIL', err && err.stack || err);
  process.exit(1);
} finally {
  restoreNondeterminism();
}

const elapsedMs = r1(_PerfNow() - t0);
const allOk = hauler.ok && hunter.ok && prospector.ok && cross.ok && elapsedMs < 15000;

// Human table
const HR = '-'.repeat(96);
console.log(HR);
console.log(`SpaceFace M3 career earnings benchmark — sustained ${HORIZON_S / 60} min (truthful live kernels)`);
console.log(`A(T)=activeRefByTier [${A_TIER.join(', ')}]  band cr/min: dead<${bands.dead}  healthy[${bands.lo},${bands.hi}]  cross≤${BAND_CROSS_MAX}×`);
if (HORIZON_S <= 30 * 60) {
  console.log(`Ladder guard: 30m net ≤ ${bands.ladderMax30mNet} cr (${LADDER_MAX_30MIN_FRAC_OF_FREIGHTER * 100}% of freighter ${LADDER_FREIGHTER_PRICE})`);
} else {
  console.log('Ladder guard: 90m may purchase one legal role upgrade; research gates remain binding.');
}
console.log(HR);
console.log(
  pad('career', 12)
  + padL('start', 8)
  + padL('end', 8)
  + padL('net', 8)
  + padL('cr/min', 8)
  + padL('loops', 7)
  + padL('travelS', 9)
  + padL('tolls', 7)
  + padL('repair', 8)
  + padL('ammo', 6)
  + padL('refine', 7)
  + padL('sales', 9)
  + padL('exhaust', 8)
  + '  status',
);
for (const r of [hauler, hunter, prospector]) {
  console.log(
    pad(r.career, 12)
    + padL(fmt(r.startingCapital), 8)
    + padL(fmt(r.endingCapital), 8)
    + padL(fmt(r.netCredits), 8)
    + padL(r1(r.creditsPerMin), 8)
    + padL(r.completedLoops, 7)
    + padL(r1(r.travelTimeS), 9)
    + padL(fmt(r.tollCost), 7)
    + padL(fmt(r.repairCost), 8)
    + padL(fmt(r.ammoCost), 6)
    + padL(fmt(r.refineryCost), 7)
    + padL(fmt(r.saleProceeds), 9)
    + padL(r.marketExhaustion ? 'yes' : 'no', 8)
    + '  ' + (r.ok ? 'PASS' : 'FAIL'),
  );
}
console.log(HR);
for (const r of [hauler, hunter, prospector]) {
  if (r.assertionFails && r.assertionFails.length) {
    console.log(`  FAIL ${r.career}: ${r.assertionFails.join('; ')}`);
  }
  if (r.route) {
    console.log(`  hauler route: ${r.route.commodityId} ${r.route.buyStationId}→${r.route.sellStationId} margin0=${r.route.initialMargin}`);
  }
  if (r.fieldFinal) {
    console.log(`  prospector field: band=${r.fieldFinal.band} depletion=${r.fieldFinal.depletion} richness=${r.fieldFinal.richnessMult} extractedU=${r.fieldFinal.extractedU}`);
  }
  if (r.equipment && r.equipment.upgradedAtLoop != null) {
    console.log(`  ${r.career} upgraded at loop ${r.equipment.upgradedAtLoop} cost=${r.equipment.upgradeCost}`);
  }
}
if (!cross.ok) console.log(`  FAIL cross: ${cross.fails.join('; ')}`);
console.log(`  runtime ${elapsedMs} ms (budget 15000)`);

// Causal constants when red
function causalHints(receipts) {
  const hints = [];
  for (const r of receipts) {
    if (r.ok) continue;
    if (r.career === 'hauler') {
      hints.push('hauler: src/data/commodities.js basePrice/elasticity; economy ROLE_FACTOR/SPREAD; ship cargo in ships.js; NEW_GAME.credits');
    }
    if (r.career === 'hunter') {
      hints.push('hunter: MISSION_TUNING.BASE.bounty_hunt + RISK_MULT; ENEMY_TYPES.hull/bountyCr; WEAPONS.dps; SERVICE_PRICES.repairCrPerHp');
    }
    if (r.career === 'prospector') {
      hints.push('prospector: MODULES mod_mining_laser_s.dps; ASTEROIDS hp/yieldU/oreTable; FIELD_DEPLETION_*; commodity basePrice; RECIPES.fee');
    }
  }
  if (!cross.ok) {
    hints.push('cross: AUTO_BALANCE.activeRefByTier anchors; relative mission vs trade vs mining throughput');
  }
  return hints;
}

const report = {
  gate: 'check-career-earnings-benchmark',
  ok: allOk,
  elapsedMs,
  horizonS: HORIZON_S,
  bands,
  beforeTuning: {
    note: 'Truthful measured numbers — production files were NOT tuned by this gate.',
    hauler: summarize(hauler),
    hunter: summarize(hunter),
    prospector: summarize(prospector),
    cross,
  },
  careers: {
    hauler: stripLoops(hauler),
    hunter: stripLoops(hunter),
    prospector: stripLoops(prospector),
  },
  causalConstantsIfRed: allOk ? [] : causalHints([hauler, hunter, prospector]),
  adaptersDocumented: true,
};

function summarize(r) {
  return {
    career: r.career,
    ok: r.ok,
    startingCapital: r.startingCapital,
    endingCapital: r.endingCapital,
    netCredits: r.netCredits,
    creditsPerMin: r.creditsPerMin,
    completedLoops: r.completedLoops,
    travelTimeS: r1(r.travelTimeS),
    tollCost: r.tollCost,
    repairCost: r.repairCost,
    ammoCost: r.ammoCost,
    refineryCost: r.refineryCost,
    purchaseSpend: r.purchaseSpend,
    saleProceeds: r.saleProceeds,
    marketExhaustion: r.marketExhaustion,
    shipId: r.shipId,
    cargoCapacity: r.cargoCapacity,
    fails: r.assertionFails || [],
    route: r.route || null,
    fieldFinal: r.fieldFinal || null,
    equipment: r.equipment,
  };
}

function stripLoops(r) {
  // Keep loop count small in JSON: first 3 + last 2
  const loops = r.loops || [];
  const kept = loops.length <= 5 ? loops : [...loops.slice(0, 3), { elided: loops.length - 5 }, ...loops.slice(-2)];
  return { ...r, loops: kept };
}

console.log(JSON.stringify(report, null, 2));

if (!allOk) {
  console.error('[check-career-earnings-benchmark] FAIL');
  process.exit(1);
}
console.log('[check-career-earnings-benchmark] PASS');
process.exit(0);
