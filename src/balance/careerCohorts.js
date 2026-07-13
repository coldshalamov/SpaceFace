// M3 career cohort harness (repair) — independent career×horizon strategies using live
// economy / cargo / ships / factions seams where feasible.
//
// Authority policy:
//   LIVE  — registered systems + their bus/event writers (credits, cargo, shipyard, tech spend,
//           trade rep, field-depletion kernels, economy services when player entity exists).
//   ADAPTER / WARNING — mission board accept/complete, full combat sim, recon RP grants without
//           missions system. These are labeled, never used to justify production balance tuning.
//
// Determinism: state.rng + simTime only; Math.random / Date.now blocked while running.

import { createSimulation } from '../core/sim.js';
import { hash32, mulberry32 } from '../core/rng.js';
import { snapshotSimState, canonicalStringify } from '../core/simSnapshot.js';
import { AUTO_BALANCE } from '../data/automation.js';
import { COMMODITIES } from '../data/commodities.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { planGateScene } from '../data/gateControl.js';
import { ASTEROIDS, BEAMS } from '../data/mining.js';
import { MISSION_TUNING, MISSION_TYPES } from '../data/missions.js';
import { MODULES } from '../data/modules.js';
import { NEW_GAME } from '../data/newGameDefaults.js';
import { SECTORS, dangerTier } from '../data/sectors.js';
import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';
import { TECH_NODES } from '../data/tech.js';
import { ORIGIN_ROLE_KITS } from '../careers/origins/careerOriginContracts.js';
import {
  HAULER_STEP_PARAMS,
  HAULER_ROLE_HULL_DEF_ID,
} from '../careers/ladders/haulerLadderDefs.js';
import { HUNTER_ROLE_HULL_DEF_ID } from '../careers/ladders/hunterLadderDefs.js';
import { PROSPECTOR_ROLE_HULL_DEF_ID } from '../careers/ladders/prospectorLadderDefs.js';
import {
  fieldMemoryReadout,
  recordFieldExtraction,
  recoverFieldDepletion,
} from '../systems/fieldDepletion.js';
import { cargo as cargoSystem, addCargo, removeCargo } from '../systems/cargo.js';
import { economy as economySystem, SERVICE_PRICES } from '../systems/economy.js';
import { ships as shipsSystem, makeShipEntitySpec, fittingsFromDefaultModules, getDerivedStats, buildSlotList, fits } from '../systems/ships.js';
import { factions as factionsSystem } from '../systems/factions.js';
import { makeEnemySpawnSpec } from '../systems/combat.js';

export const CAREER_COHORT_SCHEMA = 'spaceface.m3.careerCohorts.v2';
export const CAREER_IDS = Object.freeze(['hauler', 'hunter', 'prospector']);
export const DEFAULT_HORIZONS_MIN = Object.freeze([30, 60, 90]);

export const SEED_BY_CAREER = Object.freeze({
  hauler: 0xC0B0_A001,
  hunter: 0xC0B0_B002,
  prospector: 0xC0B0_C003,
});

const A_T1 = AUTO_BALANCE.activeRefByTier[0]; // 250
const EARLY_CMDTY_MAX_BASE = 200;
const DOCK_OVERHEAD_S = 18;
const MINING_TRANSIT_S = 35;
const COMBAT_APPROACH_S = 25;
const REPAIR_FRAC_OF_DAMAGE = 0.55;
const DEATH_DOWNTIME_S = 90;

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
const TECH_BY_ID = new Map(TECH_NODES.map((n) => [n.id, n]));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const STATION_TO_SECTOR = new Map();
const STATION_BY_ID = new Map();
for (const sec of SECTORS) {
  for (const st of sec.stations || []) {
    STATION_TO_SECTOR.set(st.id, sec);
    STATION_BY_ID.set(st.id, st);
  }
}

/** Career-specific rate bands (cr/min of earnedValue over that independent horizon). */
export const CAREER_BANDS = Object.freeze({
  hauler: Object.freeze({
    dead: round2(A_T1 * 0.20),
    lo: round2(A_T1 * 0.45),
    hi: round2(A_T1 * 2.4),
    note: 'Live market arbitrage; capacity + exhaustion bind',
  }),
  hunter: Object.freeze({
    dead: round2(A_T1 * 0.12),
    lo: round2(A_T1 * 0.25),
    hi: round2(A_T1 * 1.6),
    note: 'Bounty payouts are MISSION_TUNING adapters (warning); repair uses live economy services',
    bountyAdapter: true,
  }),
  prospector: Object.freeze({
    dead: round2(A_T1 * 0.12),
    lo: round2(A_T1 * 0.28),
    hi: round2(A_T1 * 1.5),
    note: 'Live sell + field depletion; mine TTK from beam/asteroid data',
  }),
});

export function round(n) { return Math.round(Number(n) || 0); }
export function round1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
export function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ---- nondeterminism guard ---------------------------------------------------
const _MathRandom = Math.random;
const _DateNow = Date.now;
let _blocked = false;

export function blockNondeterminism() {
  if (_blocked) return;
  _blocked = true;
  Math.random = () => { throw new Error('Math.random forbidden in career cohort'); };
  Date.now = () => { throw new Error('Date.now forbidden in career cohort'); };
}

export function restoreNondeterminism() {
  if (!_blocked) return;
  _blocked = false;
  Math.random = _MathRandom;
  Date.now = _DateNow;
}

// ---- travel math (data-grounded adapters; documented) -----------------------
export function sectorDistanceWu(aSectorId, bSectorId) {
  if (!aSectorId || !bSectorId || aSectorId === bSectorId) return 600;
  const a = SECTOR_BY_ID.get(aSectorId);
  const b = SECTOR_BY_ID.get(bSectorId);
  if (!a || !b || !a.position || !b.position) return 1800;
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  return clamp(600 + Math.hypot(dx, dy) * 650, 600, 6000);
}

export function travelTimeS(aSectorId, bSectorId) {
  return sectorDistanceWu(aSectorId, bSectorId) / (MISSION_TUNING.cruiseSpeedRef || 140);
}

export function stationTravelTimeS(aStationId, bStationId) {
  const a = STATION_BY_ID.get(aStationId);
  const b = STATION_BY_ID.get(bStationId);
  if (!a || !b || !a.pos || !b.pos) {
    return travelTimeS(STATION_TO_SECTOR.get(aStationId)?.id, STATION_TO_SECTOR.get(bStationId)?.id);
  }
  return Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) / (MISSION_TUNING.cruiseSpeedRef || 140);
}

function highSecGateToll(sector) {
  if (!sector) return 0;
  return sector.security > 0.6 ? Math.round(50 + 200 * sector.security) : 0;
}

function routeTollAmount(seed, fromSectorId, toSectorId, dayIndex = 0) {
  if (!fromSectorId || !toSectorId || fromSectorId === toSectorId) return 0;
  const to = SECTOR_BY_ID.get(toSectorId);
  const scene = planGateScene(seed, fromSectorId, toSectorId, dayIndex, {
    factionId: to && to.factionId,
    security: to && to.security,
    wanted: false,
  });
  return highSecGateToll(to) + (scene.tollAmount || 0);
}

/** Mission reward formula mirror — ADAPTER (missions.js board/complete not invoked). */
export function missionRewardCrAdapter(typeId, distanceWu, riskTier, fValue) {
  const base = (MISSION_TUNING.BASE && MISSION_TUNING.BASE[typeId]) || 100;
  const fDist = 1 + distanceWu / (MISSION_TUNING.distDivisor || 2000);
  const fRisk = (MISSION_TUNING.RISK_MULT && MISSION_TUNING.RISK_MULT[riskTier]) || 1;
  return round(base * fDist * fRisk * fValue);
}

// ---- sim bootstrap (live systems) -------------------------------------------
function bootSim(seed) {
  const sim = createSimulation({
    seed,
    systems: [economySystem, cargoSystem, shipsSystem, factionsSystem],
  });
  const state = sim.state;
  const bus = sim.bus;
  const econ = sim.registry.get('economy');
  const ships = sim.registry.get('ships');
  const factions = sim.registry.get('factions');

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
    tradesCount: 0, lifetimeProfit: 0, biggestSingleProfit: 0, smuggledValue: 0, kills: 0, missionsDone: 0,
  };
  state.simTime = 0;
  state.world = state.world || {};
  state.world.currentSectorId = NEW_GAME.startingSectorId;

  // Live ships newGame + player entity so repair services and cargo caps recompute correctly.
  ships.newGame();
  const kit = null; // career kits applied after origin choice; fittings from NEW_GAME
  const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules.slice());
  state.player.ownedShips[0].fittings = fittings;
  const ent = sim.helpers.spawnEntity(makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0,
    isPlayer: true,
    player: state.player,
    fittings,
    pos: { x: 0, z: 0 },
  }));
  state.playerId = ent.id;
  ships.recomputeEntity(ent.id, fittings);

  if (factions && typeof factions.newGame === 'function') factions.newGame();
  // Seed NEW_GAME faction rep into live faction records after newGame defaults.
  for (const [fid, rep] of Object.entries(NEW_GAME.factionRep || {})) {
    if (!state.factions[fid]) continue;
    const delta = (rep | 0) - (state.factions[fid].rep | 0);
    if (delta) bus.emit('faction:repDelta', { factionId: fid, delta, reason: 'new_game_seed' });
  }

  const ownedWeapons = new Set(
    (NEW_GAME.fittedModules || []).filter((id) => WEAPON_BY_ID.has(id)),
  );
  const ownedModules = new Set(
    (NEW_GAME.fittedModules || []).filter((id) => MODULE_BY_ID.has(id)),
  );

  return {
    sim, state, bus, econ, ships, factions, seed: seed >>> 0,
    ownedWeapons, ownedModules,
    hullDamageHp: 0, // outstanding unrepaired hull damage (persists between fights)
    currentShipId: NEW_GAME.shipId,
  };
}

function playerEntity(ctx) {
  return ctx.state.entities.get(ctx.state.playerId) || null;
}

function activeFittings(ctx) {
  const owned = ctx.ships.ownedShip();
  return (owned && owned.fittings) || [];
}

function setActiveHull(ctx, shipId) {
  const ship = SHIP_BY_ID.get(shipId);
  if (!ship) return false;
  ctx.state.player.cargo.capVolume = ship.cargo;
  ctx.state.player.cargo.capMass = Math.max(60, Math.round(ship.cargo * 1.5));
  ctx.currentShipId = shipId;
  const e = playerEntity(ctx);
  if (e && e.data) {
    e.data.defId = shipId;
    ctx.ships.recomputeEntity(e.id, activeFittings(ctx));
  }
  return true;
}

/**
 * Advance sim time authority: economy.update + field recovery + state.simTime.
 * Every action/travel/dock/recovery path must go through this (or tryTravel which does).
 */
function advanceTime(ctx, dt, budget, bucket = 'actionS') {
  const d = Math.max(0, Number(dt) || 0);
  if (d <= 0) return 0;
  ctx.econ.update(d, ctx.state);
  recoverFieldDepletion(ctx.state, d);
  ctx.state.simTime = (ctx.state.simTime || 0) + d;
  budget.simS += d;
  if (bucket && budget[bucket] != null) budget[bucket] += d;
  return d;
}

/**
 * Affordability-gated toll charge. Live chargeCredits clamps to 0; we refuse travel instead.
 * Returns { ok, charged }.
 */
function tryChargeToll(ctx, amount, reason, costs) {
  const cr = round(amount);
  if (cr <= 0) return { ok: true, charged: 0 };
  const have = ctx.state.player.credits | 0;
  if (have < cr) return { ok: false, charged: 0, have, need: cr };
  const before = have;
  ctx.econ.chargeCredits(cr, reason);
  const after = ctx.state.player.credits | 0;
  if (before - after !== cr) {
    // Should not happen after affordability gate; treat as deny.
    return { ok: false, charged: before - after, have: before, need: cr };
  }
  costs.tollCost += cr;
  return { ok: true, charged: cr };
}

/**
 * Travel only if toll is fully affordable. On deny: no sector change, no time advance for the leg.
 */
function tryTravel(ctx, {
  fromSectorId, toSectorId, travelS, reason, seed, costs, budget, dayIndex = 0,
}) {
  const toll = routeTollAmount(seed, fromSectorId, toSectorId, dayIndex);
  const pay = tryChargeToll(ctx, toll, reason, costs);
  if (!pay.ok) {
    return {
      ok: false,
      reason: 'unaffordable_toll',
      toll,
      have: pay.have,
      need: pay.need,
    };
  }
  advanceTime(ctx, travelS, budget, 'travelS');
  ctx.state.world.currentSectorId = toSectorId;
  return { ok: true, toll: pay.charged, travelS };
}

function emptyBudget() {
  return { simS: 0, travelS: 0, actionS: 0, dockS: 0, recoveryS: 0, idleS: 0 };
}

function emptyCosts() {
  return {
    tollCost: 0, repairCost: 0, ammoCost: 0, missionCost: 0,
    insuranceCost: 0, researchSpend: 0, refineryCost: 0,
  };
}

function inventoryUnits(items) {
  let n = 0;
  for (const id of Object.keys(items || {})) n += items[id] | 0;
  return n;
}

function shipEquity(shipId) {
  const ship = SHIP_BY_ID.get(shipId);
  if (!ship) return 0;
  return ship.price > 0 ? ship.price : (ship.buyback || 0);
}

function cargoMarketValue(ctx, stationId) {
  let total = 0;
  for (const [cid, qty] of Object.entries(ctx.state.player.cargo.items || {})) {
    if (!qty) continue;
    const q = ctx.econ.quote(stationId, cid, 'sell', qty);
    if (q && q.ok) total += q.total;
    else total += (CMDTY_BY_ID.get(cid)?.basePrice || 0) * qty;
  }
  return round(total);
}

function markBottleneck(receipt, code, detail) {
  receipt.bottlenecks = receipt.bottlenecks || [];
  if (!receipt.bottlenecks.some((b) => b.code === code)) {
    receipt.bottlenecks.push({ code, detail: detail || code });
  }
}

function markAdapter(receipt, code, detail) {
  receipt.adaptersUsed = receipt.adaptersUsed || [];
  if (!receipt.adaptersUsed.some((a) => a.code === code)) {
    receipt.adaptersUsed.push({ code, detail: detail || code, authority: 'adapter_warning' });
  }
}

/**
 * Apply damage to live player entity hull and optionally repair via economy service.
 * Partial repair leaves remaining damage (hullDamageHp + entity hull fraction).
 */
function applyCombatDamageAndRepair(ctx, damageHp, costs, budget) {
  const e = playerEntity(ctx);
  const dmg = Math.max(0, Number(damageHp) || 0);
  if (e && e.hullMax > 0) {
    e.hull = Math.max(0, (e.hull ?? e.hullMax) - dmg);
    ctx.hullDamageHp = Math.max(0, e.hullMax - e.hull);
  } else {
    ctx.hullDamageHp = (ctx.hullDamageHp || 0) + dmg;
  }

  // Dock-side repair attempt through live economy handleService when entity exists.
  if (e && ctx.hullDamageHp > 0.5) {
    const beforeHull = e.hull;
    const beforeCredits = ctx.state.player.credits | 0;
    ctx.bus.emit('ui:service', { type: 'repair' });
    const afterCredits = ctx.state.player.credits | 0;
    const spent = beforeCredits - afterCredits;
    if (spent > 0) costs.repairCost += spent;
    ctx.hullDamageHp = Math.max(0, (e.hullMax || 0) - (e.hull || 0));
    // Service is instant in economy; still spend a dock beat for the action clock.
    advanceTime(ctx, 6, budget, 'dockS');
    return {
      damageHp: dmg,
      repairedHp: Math.max(0, (e.hull || 0) - beforeHull),
      remainingHp: ctx.hullDamageHp,
      spent,
      readiness: e.hullMax > 0 ? round2(e.hull / e.hullMax) : 1,
    };
  }
  return {
    damageHp: dmg,
    repairedHp: 0,
    remainingHp: ctx.hullDamageHp,
    spent: 0,
    readiness: e && e.hullMax > 0 ? round2(e.hull / e.hullMax) : Math.max(0, 1 - ctx.hullDamageHp / 100),
  };
}

function tryBuyShipLive(ctx, defId, receipt, costs) {
  const def = SHIP_BY_ID.get(defId);
  if (!def) return false;
  const creditsBefore = ctx.state.player.credits | 0;
  const ok = ctx.ships.buyShip({ defId, setActive: true });
  if (!ok) return false;
  const creditsAfter = ctx.state.player.credits | 0;
  const price = def.price || 0;
  receipt.purchaseSpend = (receipt.purchaseSpend || 0) + (creditsBefore - creditsAfter);
  receipt.equipment = receipt.equipment || {};
  receipt.equipment.purchases = receipt.equipment.purchases || [];
  receipt.equipment.purchases.push({
    kind: 'ship', id: defId, price, reason: `buyShip:${defId}`,
    atS: round1(ctx.state.simTime), creditsBefore, creditsAfter,
    authority: 'ships.buyShip',
  });
  receipt.equipment.upgradeCost = (receipt.equipment.upgradeCost || 0) + price;
  setActiveHull(ctx, defId);
  // Transfer owned modules list for tracking; fittings on new hull start empty from buyShip.
  return true;
}

function tryUnlockTechLive(ctx, nodeId, receipt, costs) {
  const node = TECH_BY_ID.get(nodeId);
  if (!node) return false;
  const creditsBefore = ctx.state.player.credits | 0;
  const ok = ctx.ships.unlockTech(nodeId);
  if (!ok) return false;
  const spent = creditsBefore - (ctx.state.player.credits | 0);
  costs.researchSpend += spent;
  receipt.purchaseSpend = (receipt.purchaseSpend || 0) + spent;
  receipt.researchUnlocks = receipt.researchUnlocks || [];
  receipt.researchUnlocks.push({
    techId: nodeId, atS: round1(ctx.state.simTime), credits: spent,
    rp: node.cost && node.cost.rp || 0, authority: 'ships.unlockTech',
  });
  return true;
}

function ownedWeaponIds(ctx) {
  // Prefer fittings + tracked inventory of purchased weapons.
  const fromFit = activeFittings(ctx).filter((id) => id && WEAPON_BY_ID.has(id));
  const set = new Set([...ctx.ownedWeapons, ...fromFit]);
  return set;
}

function pickOwnedWeapon(ctx, preferredIds) {
  const owned = ownedWeaponIds(ctx);
  for (const id of preferredIds) {
    if (owned.has(id) && WEAPON_BY_ID.has(id)) return WEAPON_BY_ID.get(id);
  }
  // Fall back to any owned weapon.
  for (const id of owned) {
    if (WEAPON_BY_ID.has(id)) return WEAPON_BY_ID.get(id);
  }
  return WEAPON_BY_ID.get('wpn_pulse_laser_s') || null;
}

function finalizeReceipt(receipt, ctx, costs, budget, horizonS) {
  const shipId = ctx.currentShipId || NEW_GAME.shipId;
  const ship = SHIP_BY_ID.get(shipId);
  const endingCapital = ctx.state.player.credits | 0;
  const assetPurchases = Math.max(0, Number(receipt.equipment && receipt.equipment.upgradeCost) || 0);
  const netCredits = endingCapital - receipt.startingCapital;
  const earnedValue = netCredits + assetPurchases + (costs.researchSpend || 0);
  const windowMin = Math.max(horizonS, 1) / 60;
  const elapsedS = round1(ctx.state.simTime);
  const cargoValue = cargoMarketValue(ctx, 'station_helios');
  const equity = shipEquity(shipId);
  Object.assign(receipt, {
    endingCapital,
    netCredits,
    earnedValue,
    netWorth: endingCapital + equity + cargoValue,
    cargoValue,
    shipEquity: equity,
    assetPurchases,
    cashCreditsPerMin: round2(netCredits / windowMin),
    creditsPerMin: round2(earnedValue / windowMin),
    creditsPerMinActive: round2(earnedValue / Math.max(elapsedS / 60, 1 / 60)),
    ownedInventoryEnd: { ...ctx.state.player.cargo.items },
    elapsedS,
    shipId,
    shipName: ship && ship.name,
    cargoCapacity: ship && ship.cargo,
    researchPoints: ctx.state.player.researchPoints || 0,
    researchedNodes: (ctx.state.player.researchedNodes || []).slice(),
    ownedWeapons: [...ownedWeaponIds(ctx)],
    hullDamageHp: round1(ctx.hullDamageHp || 0),
    readiness: (() => {
      const e = playerEntity(ctx);
      return e && e.hullMax > 0 ? round2(e.hull / e.hullMax) : 1;
    })(),
    tollCost: costs.tollCost,
    repairCost: costs.repairCost,
    ammoCost: costs.ammoCost,
    missionCost: costs.missionCost,
    insuranceCost: costs.insuranceCost,
    researchSpend: costs.researchSpend,
    refineryCost: costs.refineryCost,
    time: {
      simS: round1(budget.simS),
      travelS: round1(budget.travelS),
      actionS: round1(budget.actionS),
      dockS: round1(budget.dockS),
      recoveryS: round1(budget.recoveryS),
      idleS: round1(budget.idleS),
    },
    // Independent-horizon integrity: time and rate are for THIS run only.
    horizonS,
    horizonMin: horizonS / 60,
  });
  return receipt;
}

export function assessLoadoutViability(career, phase = 'starter') {
  const kit = ORIGIN_ROLE_KITS[career];
  if (!kit) return { viable: false };
  const starter = phase === 'starter';
  let plan;
  if (career === 'hauler') {
    plan = {
      shipId: starter ? NEW_GAME.shipId : HAULER_ROLE_HULL_DEF_ID,
      required: starter
        ? [...NEW_GAME.fittedModules, kit.defId]
        : ['wpn_pulse_laser_s', 'mod_engine_ion_m', 'mod_shield_booster_s', kit.defId],
      minCargo: starter ? 40 : 120,
    };
  } else if (career === 'hunter') {
    plan = {
      shipId: starter ? NEW_GAME.shipId : HUNTER_ROLE_HULL_DEF_ID,
      required: starter
        ? [...NEW_GAME.fittedModules, kit.defId]
        : ['wpn_pulse_laser_s', 'wpn_autocannon_s', 'mod_engine_ion_m', 'mod_shield_booster_s', kit.defId],
      minCargo: starter ? 40 : 10,
    };
  } else {
    plan = {
      shipId: starter ? NEW_GAME.shipId : PROSPECTOR_ROLE_HULL_DEF_ID,
      required: starter
        ? [...NEW_GAME.fittedModules, kit.defId]
        : ['wpn_pulse_laser_s', 'mod_mining_laser_s', 'mod_engine_ion_m', 'mod_shield_booster_s', kit.defId],
      minCargo: starter ? 40 : 55,
    };
  }
  const ship = SHIP_BY_ID.get(plan.shipId);
  if (!ship) return { viable: false };
  const fittings = fittingsFromDefaultModules(plan.shipId, plan.required);
  const fittedIds = fittings.filter(Boolean);
  const slots = buildSlotList(ship);
  const kitDef = MODULE_BY_ID.get(kit.defId);
  const missing = plan.required.filter((id) => !fittedIds.includes(id));
  const derived = getDerivedStats(plan.shipId, fittings, {
    cargo: { usedMass: career === 'hauler' ? Math.min(ship.cargo, plan.minCargo) : 0 },
    efficiencyMods: {},
  });
  const utilityFit = slots.some((slot) => slot.type === 'utility' && fits(slot, kitDef))
    && fittedIds.includes(kit.defId);
  return {
    viable: missing.length === 0 && utilityFit && derived.cargoCap >= plan.minCargo
      && derived.operationalMass > 0 && derived.maxSpeed > 0,
    career, phase, shipId: plan.shipId, required: plan.required, fittedIds, missing,
    roleKitId: kit.defId, utilityFit, cargoCap: derived.cargoCap,
  };
}

// ---- HAULER (live trade) ----------------------------------------------------
function runHauler(horizonS, options = {}) {
  const seed = options.seed != null ? options.seed : SEED_BY_CAREER.hauler;
  const ctx = bootSim(seed);
  const costs = emptyCosts();
  const budget = emptyBudget();
  const kit = ORIGIN_ROLE_KITS.hauler;
  if (kit) ctx.ownedModules.add(kit.defId);

  const midShip = SHIP_BY_ID.get(HAULER_ROLE_HULL_DEF_ID);
  const bonded = HAULER_STEP_PARAMS.bonded_convoy;
  const receipt = {
    career: 'hauler', seed, horizonS,
    startingCapital: NEW_GAME.credits,
    purchaseSpend: 0, saleProceeds: 0, missionProceeds: 0,
    completedLoops: 0, completedContracts: 0, failedContracts: 0,
    equipment: {
      activePhase: 'starter',
      roleHullDefId: HAULER_ROLE_HULL_DEF_ID,
      purchases: [],
    },
    liveSeams: [
      'economy.ensureMarket/quote/execute',
      'cargo add/remove via execute',
      'ships.buyShip',
      'factions via economy:tradeCompleted',
      'economy.update time authority',
    ],
    loops: [], routeHistory: [], bottlenecks: [], adaptersUsed: [], defects: [],
  };

  const buyStationId = 'station_beltout';
  const sellStationId = 'station_ceres';
  const buySector = STATION_TO_SECTOR.get(buyStationId);
  const sellSector = STATION_TO_SECTOR.get(sellStationId);
  ctx.econ.ensureMarket(buyStationId);
  ctx.econ.ensureMarket(sellStationId);

  const exhausted = new Set();
  const selectRoute = () => {
    let best = null;
    for (const c of COMMODITIES) {
      if (c.legality !== 'legal' || c.basePrice > EARLY_CMDTY_MAX_BASE || exhausted.has(c.id)) continue;
      const qb = ctx.econ.quote(buyStationId, c.id, 'buy', 1);
      const qs = ctx.econ.quote(sellStationId, c.id, 'sell', 1);
      if (!qb.ok || !qs.ok) continue;
      const margin = qs.unitAvg - qb.unitAvg;
      if (!(margin > 0)) continue;
      if (!best || margin > best.margin) {
        best = { cmdtyId: c.id, name: c.name, margin, buy: qb.unitAvg, sell: qs.unitAvg, vol: c.volPerU };
      }
    }
    return best;
  };

  let best = selectRoute();
  if (!best) {
    receipt.defects.push('no_positive_early_career_route');
    finalizeReceipt(receipt, ctx, costs, budget, horizonS);
    receipt.loadoutViability = assessLoadoutViability('hauler', 'starter');
    return receipt;
  }
  receipt.route = {
    buyStationId, sellStationId, commodityId: best.cmdtyId,
    initialMargin: round2(best.margin),
  };
  receipt.routeHistory.push({ ...receipt.route, startedAtS: 0 });

  let t = 0;
  let loops = 0;
  let upgraded = false;
  let cargoCreated = 0;
  let cargoDestroyed = 0;
  let currentSectorId = NEW_GAME.startingSectorId;
  let currentStationId = null;

  while (t < horizonS) {
    // Bonded collateral contract — ladder params; credits via live economy.
    if (loops > 0 && loops % 8 === 0 && bonded && (bonded.collateralCr || 0) > 0) {
      const coll = bonded.collateralCr;
      if ((ctx.state.player.credits | 0) >= coll) {
        ctx.econ.chargeCredits(coll, 'mission:collateral:bonded_convoy');
        costs.missionCost += coll;
        receipt.purchaseSpend += coll;
        const escortS = travelTimeS(currentSectorId, bonded.destSectorId) + DOCK_OVERHEAD_S * 2;
        if (t + escortS > horizonS) {
          receipt.failedContracts += 1;
          markBottleneck(receipt, 'deadline_collateral', 'Bonded convoy incomplete at horizon');
          break;
        }
        const move = tryTravel(ctx, {
          fromSectorId: currentSectorId,
          toSectorId: bonded.destSectorId,
          travelS: escortS,
          reason: `gate_toll:hauler:bonded:${loops}`,
          seed, costs, budget,
        });
        if (!move.ok) {
          // Collateral already taken; cannot complete — fail contract, stay put.
          receipt.failedContracts += 1;
          markBottleneck(receipt, 'unaffordable_toll', `Bonded travel denied toll=${move.toll}`);
          // Refund not automatic — bond burned on inability to complete.
          advanceTime(ctx, DOCK_OVERHEAD_S, budget, 'dockS');
          t = ctx.state.simTime;
          continue;
        }
        t = ctx.state.simTime;
        currentSectorId = bonded.destSectorId;
        const success = escortS <= (bonded.deadlineSlackS || 420)
          && (hash32(seed, 'hauler_bonded', loops) % 5) !== 0;
        if (success) {
          ctx.econ.grantCredits(coll + (bonded.baseRewardCr || 0), 'mission:bonded_convoy');
          receipt.missionProceeds += bonded.baseRewardCr || 0;
          receipt.completedContracts += 1;
          markAdapter(receipt, 'bonded_reward_adapter', 'Bonded reward amount from ladder defs, not missions board');
        } else {
          receipt.failedContracts += 1;
          markBottleneck(receipt, 'bonded_fail', 'Bonded convoy failed; collateral kept');
        }
        loops += 1;
        receipt.completedLoops = loops;
        continue;
      }
    }

    const leg1S = (currentStationId
      ? stationTravelTimeS(currentStationId, buyStationId)
      : travelTimeS(currentSectorId, buySector.id)) + DOCK_OVERHEAD_S;
    if (t + leg1S > horizonS) break;
    const move1 = tryTravel(ctx, {
      fromSectorId: currentSectorId,
      toSectorId: buySector.id,
      travelS: leg1S,
      reason: `gate_toll:hauler:${loops}:to_buy`,
      seed, costs, budget,
    });
    if (!move1.ok) {
      markBottleneck(receipt, 'unaffordable_toll', `Buy-leg denied need=${move1.need} have=${move1.have}`);
      // Idle/recover credits? Without income we stop.
      break;
    }
    t = ctx.state.simTime;
    currentSectorId = buySector.id;
    currentStationId = buyStationId;

    const liveBuy = ctx.econ.quote(buyStationId, best.cmdtyId, 'buy', 1);
    const liveSell = ctx.econ.quote(sellStationId, best.cmdtyId, 'sell', 1);
    const liveMargin = liveBuy.ok && liveSell.ok ? liveSell.unitAvg - liveBuy.unitAvg : -Infinity;
    if (!(liveMargin > 0)) {
      exhausted.add(best.cmdtyId);
      markBottleneck(receipt, 'spread_collapse', `Route ${best.cmdtyId} collapsed`);
      const next = selectRoute();
      if (!next) {
        markBottleneck(receipt, 'market_exhaustion', 'All early routes exhausted');
        break;
      }
      receipt.routeHistory.push({
        commodityId: next.cmdtyId, initialMargin: round2(next.margin),
        startedAtS: round1(t), retiredCommodityId: best.cmdtyId,
      });
      best = next;
    }

    const ship = SHIP_BY_ID.get(ctx.currentShipId) || SHIP_BY_ID.get(NEW_GAME.shipId);
    ctx.state.player.cargo.capVolume = ship.cargo;
    const freeVol = ctx.state.player.cargo.capVolume - ctx.state.player.cargo.usedVolume;
    const volPer = best.vol > 0 ? best.vol : 1;
    let want = Math.floor(freeVol / volPer);
    const entry = ctx.state.economy.markets[buyStationId][best.cmdtyId];
    const stockAvail = Math.max(0, Math.floor((entry && entry.stock) - 1));
    if (stockAvail <= 0) {
      markBottleneck(receipt, 'no_stock', 'Buy station stock exhausted');
      break;
    }
    want = Math.min(want, stockAvail);
    while (want > 0) {
      const q = ctx.econ.quote(buyStationId, best.cmdtyId, 'buy', want);
      if (q.ok && q.total <= (ctx.state.player.credits | 0)) break;
      want = Math.floor(want * 0.85);
    }
    if (want <= 0) {
      markBottleneck(receipt, 'capital_bind', 'Cannot afford next buy lot');
      break;
    }
    const buyRes = ctx.econ.execute(buyStationId, best.cmdtyId, 'buy', want);
    if (!buyRes.ok) {
      receipt.loops.push({ loop: loops, fail: buyRes.reason || 'buy_failed' });
      break;
    }
    cargoCreated += buyRes.qty;
    receipt.purchaseSpend += buyRes.total;
    // Market action advances action time through time authority.
    advanceTime(ctx, 8, budget, 'actionS');
    t = ctx.state.simTime;

    const leg2S = stationTravelTimeS(buyStationId, sellStationId) + DOCK_OVERHEAD_S;
    if (t + leg2S > horizonS) {
      receipt.loops.push({ loop: loops, partial: true, bought: buyRes.qty, note: 'horizon_before_sell' });
      break;
    }
    const move2 = tryTravel(ctx, {
      fromSectorId: currentSectorId,
      toSectorId: sellSector.id,
      travelS: leg2S,
      reason: `gate_toll:hauler:${loops}:to_sell`,
      seed, costs, budget,
    });
    if (!move2.ok) {
      markBottleneck(receipt, 'unaffordable_toll', `Sell-leg denied; cargo stranded`);
      break;
    }
    t = ctx.state.simTime;
    currentSectorId = sellSector.id;
    currentStationId = sellStationId;

    const have = ctx.state.player.cargo.items[best.cmdtyId] || 0;
    const sellRes = ctx.econ.execute(sellStationId, best.cmdtyId, 'sell', have);
    if (!sellRes.ok) {
      receipt.loops.push({ loop: loops, fail: sellRes.reason || 'sell_failed' });
      break;
    }
    cargoDestroyed += sellRes.qty;
    receipt.saleProceeds += sellRes.total;
    advanceTime(ctx, 8, budget, 'actionS');
    t = ctx.state.simTime;
    loops += 1;
    receipt.completedLoops = loops;
    receipt.completedContracts += 1;
    receipt.loops.push({
      loop: loops, t: round1(t), bought: buyRes.qty, sold: sellRes.qty,
      buyTotal: buyRes.total, sellTotal: sellRes.total,
      creditsAfter: ctx.state.player.credits | 0, shipId: ctx.currentShipId,
    });

    if (!upgraded && midShip && (ctx.state.player.credits | 0) >= midShip.price) {
      if (tryBuyShipLive(ctx, midShip.id, receipt, costs)) {
        upgraded = true;
        receipt.equipment.activePhase = 'mule';
        receipt.equipment.upgradedAtLoop = loops;
      }
    }
  }

  receipt.marketExhaustion = exhausted.size > 0;
  receipt.inventoryCreated = cargoCreated;
  receipt.inventoryRemoved = cargoDestroyed;
  receipt.equipment.activePhase = upgraded ? 'mule' : 'starter';
  receipt.equipment.plannedMidLoadout = assessLoadoutViability('hauler', 'mid');
  receipt.loadoutViability = assessLoadoutViability('hauler', upgraded ? 'mid' : 'starter');
  finalizeReceipt(receipt, ctx, costs, budget, horizonS);
  return receipt;
}

// ---- HUNTER -----------------------------------------------------------------
function runHunter(horizonS, options = {}) {
  const seed = options.seed != null ? options.seed : SEED_BY_CAREER.hunter;
  const forceDeathAtLoop = options.forceDeathAtLoop != null ? options.forceDeathAtLoop : 6;
  const ctx = bootSim(seed);
  const costs = emptyCosts();
  const budget = emptyBudget();
  const kit = ORIGIN_ROLE_KITS.hunter;
  if (kit) ctx.ownedModules.add(kit.defId);

  const midShip = SHIP_BY_ID.get(HUNTER_ROLE_HULL_DEF_ID);
  const midWpn = WEAPON_BY_ID.get('wpn_autocannon_s');
  const earlyEnemy = ENEMY_TYPES.find((e) => e.id === 'wasp_swarmer');
  const midEnemy = ENEMY_TYPES.find((e) => e.id === 'lancer_sniper');

  const receipt = {
    career: 'hunter', seed, horizonS,
    startingCapital: NEW_GAME.credits,
    purchaseSpend: 0, saleProceeds: 0, missionProceeds: 0,
    completedLoops: 0, completedContracts: 0, failedContracts: 0,
    deaths: 0, failedMissions: 0,
    equipment: {
      activePhase: 'starter',
      roleHullDefId: HUNTER_ROLE_HULL_DEF_ID,
      purchases: [],
    },
    liveSeams: [
      'economy.grantCredits/chargeCredits',
      'economy ui:service repair (proportional)',
      'ships.unlockTech / buyShip when RP+capital allow',
      'cargo munitions via addCargo/removeCargo',
    ],
    loops: [], bottlenecks: [], adaptersUsed: [], defects: [], researchUnlocks: [],
  };
  markAdapter(receipt, 'bounty_reward_adapter',
    'Bounty credits use MISSION_TUNING.BASE formula; missions board accept/complete not invoked (missions.js foreign dirty)');
  markAdapter(receipt, 'combat_ttk_adapter',
    'Fight duration from enemy EHP / owned weapon DPS; full combat system not stepped');

  const homeSectorId = NEW_GAME.startingSectorId;
  const huntSectorId = 'sector_ceres_belt';
  const huntSector = SECTOR_BY_ID.get(huntSectorId);
  const bountyType = MISSION_TYPES.find((def) => def.type === 'bounty_hunt');
  const bountyRiskLo = bountyType?.riskTierRange?.[0] ?? 0;
  const bountyRiskHi = bountyType?.riskTierRange?.[1] ?? 4;
  const riskTier = clamp(Math.max(dangerTier(huntSector || {}), bountyRiskLo), bountyRiskLo, bountyRiskHi);
  const distance = sectorDistanceWu(homeSectorId, huntSectorId);

  let t = 0;
  let loops = 0;
  let completedMissions = 0;
  let failedMissions = 0;
  let upgraded = false;
  let techUnlocked = (ctx.state.player.researchedNodes || []).includes('tech_combat_basics');
  let currentSectorId = homeSectorId;
  let deathDone = false;

  function ensureAmmo(units) {
    if (units <= 0) return 0;
    const cost = round(units * SERVICE_PRICES.ammoCrPerUnit);
    if ((ctx.state.player.credits | 0) < cost) return 0;
    const added = addCargo(ctx.state, 'cmdty_munitions', units);
    if (added <= 0) return 0;
    const real = round(added * SERVICE_PRICES.ammoCrPerUnit);
    if ((ctx.state.player.credits | 0) < real) {
      // Roll back cargo if we can't pay — no free munitions.
      removeCargo(ctx.state, 'cmdty_munitions', added);
      return 0;
    }
    ctx.econ.chargeCredits(real, 'service:ammo');
    costs.ammoCost += real;
    receipt.purchaseSpend += real;
    return added;
  }

  while (t < horizonS) {
    // Attempt live tech unlock only when RP already present (no fabricated RP grants).
    if (!techUnlocked) {
      const node = TECH_BY_ID.get('tech_combat_basics');
      if (node && (ctx.state.player.researchPoints || 0) >= (node.cost.rp || 0)
        && (ctx.state.player.credits | 0) >= (node.cost.credits || 0)) {
        if (tryUnlockTechLive(ctx, 'tech_combat_basics', receipt, costs)) {
          techUnlocked = true;
          receipt.equipment.activePhase = 'researched';
        }
      } else if (node && (ctx.state.player.researchPoints || 0) < (node.cost.rp || 0)) {
        markBottleneck(receipt, 'rp_gate',
          'Combat Basics needs research points; missions RP writer not registered (foreign dirty)');
      }
    }

    // Prefer owned weapons only. Never fire autocannon unless owned.
    const preferred = upgraded && midWpn && ownedWeaponIds(ctx).has(midWpn.id)
      ? [midWpn.id, 'wpn_pulse_laser_s']
      : ['wpn_pulse_laser_s'];
    const weapon = pickOwnedWeapon(ctx, preferred);
    const enemy = (upgraded && midEnemy) ? midEnemy : earlyEnemy;
    if (!weapon || !enemy) {
      receipt.defects.push('missing_owned_weapon_or_enemy');
      break;
    }
    if (weapon.id === 'wpn_autocannon_s' && !ownedWeaponIds(ctx).has('wpn_autocannon_s')) {
      receipt.defects.push('used_unowned_autocannon');
      break;
    }

    const legOut = travelTimeS(currentSectorId, huntSectorId) + COMBAT_APPROACH_S;
    if (t + legOut > horizonS) break;
    const moveOut = tryTravel(ctx, {
      fromSectorId: currentSectorId,
      toSectorId: huntSectorId,
      travelS: legOut,
      reason: `gate_toll:hunter:${loops}:out`,
      seed, costs, budget,
    });
    if (!moveOut.ok) {
      markBottleneck(receipt, 'unaffordable_toll', `Hunt outbound denied need=${moveOut.need}`);
      break;
    }
    t = ctx.state.simTime;
    currentSectorId = huntSectorId;

    const [levelLo, levelHi] = huntSector?.enemyLevel || [1, 1];
    const enemyLevel = Math.round((levelLo + levelHi) / 2);
    const enemySpec = makeEnemySpawnSpec(enemy.id, enemyLevel, { x: 0, z: 0 });
    const ehp = (enemySpec.hull || 0) + (enemySpec.armorHp || 0) + (enemySpec.shield || 0);
    // Readiness reduces effective DPS when damaged.
    const e = playerEntity(ctx);
    const readiness = e && e.hullMax > 0 ? Math.max(0.25, e.hull / e.hullMax) : Math.max(0.25, 1 - (ctx.hullDamageHp || 0) / 200);
    const dps = (weapon.dps || 1) * readiness;
    const fightS = Math.max(8, ehp / Math.max(dps, 0.1));
    const enemyDps = (enemySpec.data?.weapons || []).reduce((sum, w) => {
      const dmg = Number(w.dmg) || 0;
      const rof = Number(w.rof) || 0;
      if (rof === 0) return sum + (Number(w.dps) || dmg);
      return sum + dmg * rof;
    }, 0);

    // Controlled death recovery once.
    if (!deathDone && loops + 1 === forceDeathAtLoop) {
      deathDone = true;
      receipt.deaths = 1;
      const e2 = playerEntity(ctx);
      if (e2) e2.hull = 0;
      ctx.hullDamageHp = e2 ? e2.hullMax : 100;
      const munis = ctx.state.player.cargo.items.cmdty_munitions || 0;
      if (munis > 0) removeCargo(ctx.state, 'cmdty_munitions', munis);
      const insurance = Math.min(
        round(shipEquity(ctx.currentShipId) * 0.35) || 500,
        ctx.state.player.credits | 0,
      );
      if (insurance > 0) {
        ctx.econ.chargeCredits(insurance, 'service:insurance_recovery');
        costs.insuranceCost += insurance;
      }
      // Respawn at home with partial hull (insurance does not full-heal).
      if (e2 && e2.hullMax) {
        e2.hull = e2.hullMax * 0.35;
        ctx.hullDamageHp = e2.hullMax - e2.hull;
      }
      advanceTime(ctx, DEATH_DOWNTIME_S, budget, 'recoveryS');
      t = ctx.state.simTime;
      currentSectorId = homeSectorId;
      ctx.state.world.currentSectorId = homeSectorId;
      receipt.failedContracts += 1;
      failedMissions += 1;
      receipt.loops.push({
        loop: loops + 1, t: round1(t), outcome: 'death_recovery',
        insurance, readiness: e2 && e2.hullMax ? round2(e2.hull / e2.hullMax) : 0.35,
        creditsAfter: ctx.state.player.credits | 0,
      });
      markBottleneck(receipt, 'death_recovery', 'Controlled death with insurance downtime; residual hull damage');
      continue;
    }

    if (weapon.damageType === 'kinetic' || weapon.damageType === 'explosive') {
      const shots = Math.ceil(fightS * (weapon.rof || 1));
      let have = ctx.state.player.cargo.items.cmdty_munitions || 0;
      if (have < shots) ensureAmmo(Math.max(8, shots - have));
      have = ctx.state.player.cargo.items.cmdty_munitions || 0;
      const use = Math.min(shots, have);
      if (use > 0) removeCargo(ctx.state, 'cmdty_munitions', use);
      if (use < shots * 0.5 && upgraded) {
        markBottleneck(receipt, 'ammo_starvation', 'Insufficient munitions for kinetic fight');
        // Still attempt with reduced effectiveness — already reflected by partial ammo; continue.
      }
    }

    advanceTime(ctx, fightS, budget, 'actionS');
    t = ctx.state.simTime;

    const damageTaken = enemyDps * fightS * REPAIR_FRAC_OF_DAMAGE;
    const repairInfo = applyCombatDamageAndRepair(ctx, damageTaken, costs, budget);
    t = ctx.state.simTime;

    const strength = 1.2 + riskTier * 0.5 + 0.3;
    const reward = missionRewardCrAdapter('bounty_hunt', distance, riskTier, strength);
    const killBonus = enemySpec.data?.bountyCr || 0;
    const missionSucceeded = (hash32(seed, 'hunter_counterplay', loops + 1) % 7) !== 0;
    // Counterplay + readiness: damaged pilots fail more often when readiness is low.
    const readinessFail = repairInfo.readiness < 0.5 && (hash32(seed, 'readiness_fail', loops + 1) % 3) === 0;
    const success = missionSucceeded && !readinessFail;
    const gross = success ? reward + killBonus : 0;
    if (gross > 0) {
      ctx.econ.grantCredits(gross, `mission:bounty_hunt:${loops}`);
      receipt.missionProceeds += gross;
      completedMissions += 1;
      receipt.completedContracts += 1;
      // Live rep intent for lawful bounty (SCN).
      ctx.bus.emit('faction:repDelta', { factionId: 'faction_scn', delta: 1, reason: 'bounty_complete_adapter' });
    } else {
      failedMissions += 1;
      receipt.failedContracts += 1;
    }

    const legHome = travelTimeS(currentSectorId, homeSectorId) + DOCK_OVERHEAD_S;
    if (t + legHome > horizonS) {
      loops += 1;
      receipt.completedLoops = completedMissions;
      receipt.loops.push({
        loop: loops, t: round1(t), outcome: success ? 'completed' : 'countered',
        reward: success ? reward : 0, partialReturn: true,
        weaponId: weapon.id, readiness: repairInfo.readiness,
        remainingDamage: repairInfo.remainingHp,
        creditsAfter: ctx.state.player.credits | 0,
      });
      break;
    }
    const moveHome = tryTravel(ctx, {
      fromSectorId: currentSectorId,
      toSectorId: homeSectorId,
      travelS: legHome,
      reason: `gate_toll:hunter:${loops}:home`,
      seed, costs, budget,
    });
    if (!moveHome.ok) {
      markBottleneck(receipt, 'unaffordable_toll', 'Home leg denied');
      loops += 1;
      break;
    }
    t = ctx.state.simTime;
    currentSectorId = homeSectorId;

    loops += 1;
    receipt.completedLoops = completedMissions;
    receipt.loops.push({
      loop: loops, t: round1(t),
      outcome: success ? 'completed' : 'countered',
      reward: success ? reward : 0, killBonus: success ? killBonus : 0,
      fightS: round1(fightS), weaponId: weapon.id, enemyId: enemy.id,
      readiness: repairInfo.readiness, remainingDamage: round1(repairInfo.remainingHp),
      repairSpent: repairInfo.spent,
      creditsAfter: ctx.state.player.credits | 0,
    });

    // Wasp hull via live ships.buyShip only when tech unlocked + affordable.
    if (!upgraded && techUnlocked && midShip) {
      if ((ctx.state.player.credits | 0) >= midShip.price) {
        if (tryBuyShipLive(ctx, midShip.id, receipt, costs)) {
          upgraded = true;
          receipt.equipment.activePhase = 'wasp';
          receipt.equipment.upgradedAtLoop = loops;
          // Optional autocannon: buy only through ships.buyModule if affordable.
          if (midWpn && (ctx.state.player.credits | 0) >= (midWpn.price || 0)
            && ctx.ships.isUnlocked(midWpn)) {
            const before = ctx.state.player.credits | 0;
            if (ctx.ships.buyModule({ defId: midWpn.id })) {
              ctx.ownedWeapons.add(midWpn.id);
              const spent = before - (ctx.state.player.credits | 0);
              receipt.purchaseSpend += spent;
              receipt.equipment.purchases.push({
                kind: 'weapon', id: midWpn.id, price: midWpn.price,
                reason: 'buyModule:wpn_autocannon_s', atS: round1(t),
                authority: 'ships.buyModule',
              });
              ensureAmmo(40);
            }
          }
        }
      } else {
        markBottleneck(receipt, 'capital_for_wasp', `Need ${midShip.price}cr for Wasp`);
      }
    } else if (!techUnlocked) {
      receipt.equipment.upgradeBlockedBy = {
        kind: 'research',
        gates: [{ techId: 'tech_combat_basics', ...((TECH_BY_ID.get('tech_combat_basics') || {}).cost || {}) }],
        availableResearchPoints: ctx.state.player.researchPoints || 0,
      };
    }
  }

  receipt.failedMissions = failedMissions;
  receipt.missionAttempts = loops;
  receipt.equipment.activePhase = upgraded ? 'wasp' : techUnlocked ? 'researched' : 'starter';
  receipt.equipment.plannedMidLoadout = assessLoadoutViability('hunter', 'mid');
  receipt.loadoutViability = assessLoadoutViability('hunter', upgraded ? 'mid' : 'starter');
  finalizeReceipt(receipt, ctx, costs, budget, horizonS);
  return receipt;
}

// ---- PROSPECTOR -------------------------------------------------------------
function runProspector(horizonS, options = {}) {
  const seed = options.seed != null ? options.seed : SEED_BY_CAREER.prospector;
  const ctx = bootSim(seed);
  const costs = emptyCosts();
  const budget = emptyBudget();
  const kit = ORIGIN_ROLE_KITS.prospector;
  if (kit) ctx.ownedModules.add(kit.defId);

  const midShip = SHIP_BY_ID.get(PROSPECTOR_ROLE_HULL_DEF_ID);
  const starterBeam = MODULE_BY_ID.get('mod_mining_laser_s') || BEAMS.find((b) => b.id === 'beam_mk1');
  const midBeam = MODULE_BY_ID.get('mod_mining_beam_m');
  const fieldIds = ['f_helios_starter', 'f_helios_outer'];
  let fieldIndex = 0;
  let fieldId = fieldIds[fieldIndex];
  const fieldSectorId = 'sector_helios_prime';
  const sellStationId = 'station_helios';
  const ast = ASTEROIDS.find((a) => a.id === 'ast_common_rock');

  const receipt = {
    career: 'prospector', seed, horizonS,
    startingCapital: NEW_GAME.credits,
    purchaseSpend: 0, saleProceeds: 0, missionProceeds: 0,
    completedLoops: 0, completedContracts: 0, failedContracts: 0,
    equipment: {
      activePhase: 'starter',
      roleHullDefId: PROSPECTOR_ROLE_HULL_DEF_ID,
      currentShipId: NEW_GAME.shipId,
      ownedMiningModules: starterBeam ? [starterBeam.id] : [],
      purchases: [],
      beamM: {
        id: midBeam && midBeam.id,
        price: midBeam && midBeam.price || 0,
        researchGates: midBeam && midBeam.requiresTech
          ? [{ techId: midBeam.requiresTech }]
          : [],
        acquired: false,
        granted: false,
      },
    },
    liveSeams: [
      'fieldDepletion.recordFieldExtraction/recover',
      'cargo addCargo/removeCargo',
      'economy.execute sell',
      'ships.buyShip pelican',
      'economy.update time authority',
    ],
    loops: [], fieldRotations: [], bottlenecks: [], adaptersUsed: [], defects: [],
  };
  markAdapter(receipt, 'mine_ttk_adapter',
    'Mine duration from beam.dps / asteroid.hp tables; mining system update loop not stepped');

  ctx.econ.ensureMarket(sellStationId);
  ctx.state.world.currentSectorId = fieldSectorId;

  const rng = mulberry32(hash32(seed, 'prospector', fieldId));
  const hpLo = ast.hp[0];
  const hpHi = ast.hp[1];
  const yLo = ast.yieldU[0];
  const yHi = ast.yieldU[1];

  let t = 0;
  let loops = 0;
  let upgraded = false;
  let cargoCreated = 0;
  let cargoDestroyed = 0;
  let asteroidsMined = 0;
  let currentSectorId = fieldSectorId;
  let marketExhaustion = false;

  let primaryOre = 'cmdty_silicate';
  let bestW = -1;
  for (const oreId of Object.keys(ast.oreTable || {})) {
    const w = ast.oreTable[oreId];
    if (w > bestW) { bestW = w; primaryOre = oreId; }
  }

  // Owned mining module only.
  const ownedMining = () => {
    const ids = receipt.equipment.ownedMiningModules || [];
    for (const id of ids) {
      const def = MODULE_BY_ID.get(id);
      if (def) return def;
    }
    return starterBeam;
  };

  while (t < horizonS) {
    const opening = fieldMemoryReadout(ctx.state, fieldId);
    if (opening.band === 'depleted') {
      marketExhaustion = true;
      markBottleneck(receipt, 'field_depleted', `Field ${fieldId} depleted`);
      const nextIdx = (fieldIndex + 1) % fieldIds.length;
      const nextId = fieldIds[nextIdx];
      const rotationS = MINING_TRANSIT_S * 2;
      const nextReadout = fieldMemoryReadout(ctx.state, nextId);
      if (nextId === fieldId || nextReadout.band === 'depleted' || t + rotationS > horizonS) {
        receipt.loops.push({ loop: loops, fail: 'all_local_fields_depleted', t: round1(t) });
        break;
      }
      advanceTime(ctx, rotationS, budget, 'travelS');
      t = ctx.state.simTime;
      fieldIndex = nextIdx;
      fieldId = nextId;
      receipt.fieldRotations.push({ from: opening.fieldId, to: fieldId, atS: round1(t) });
    }

    const beam = ownedMining();
    const ship = SHIP_BY_ID.get(ctx.currentShipId);
    ctx.state.player.cargo.capVolume = ship.cargo;
    const dps = beam.dps || 18;

    const rockHp = hpLo + (hpHi - hpLo) * rng();
    const rockYield = yLo + (yHi - yLo) * rng();
    const readout = fieldMemoryReadout(ctx.state, fieldId);
    const richness = readout.richnessMult != null ? readout.richnessMult : 1;
    const yieldU = Math.max(1, Math.floor(rockYield * richness));
    const mineS = rockHp / dps;
    const cycleMineS = mineS + MINING_TRANSIT_S * 0.35;
    if (t + cycleMineS > horizonS) break;

    advanceTime(ctx, cycleMineS, budget, 'actionS');
    // Split accounting: mining is action; intra-field hop portion already in cycleMineS — travel portion:
    budget.travelS += MINING_TRANSIT_S * 0.35;
    budget.actionS -= MINING_TRANSIT_S * 0.35;
    t = ctx.state.simTime;

    recordFieldExtraction(ctx.state, {
      fieldId, sectorId: fieldSectorId, extractedU: yieldU,
      simTime: ctx.state.simTime, asteroidId: `${fieldId}:ast_${asteroidsMined}`, tick: asteroidsMined,
    });
    asteroidsMined += 1;
    cargoCreated += addCargo(ctx.state, primaryOre, yieldU);

    const free = ctx.state.player.cargo.capVolume - ctx.state.player.cargo.usedVolume;
    const timeToSell = free < 1 || ctx.state.player.cargo.usedVolume >= ship.cargo * 0.85;
    if (!timeToSell) continue;

    const sellSec = STATION_TO_SECTOR.get(sellStationId);
    const legSell = travelTimeS(currentSectorId, sellSec.id) + DOCK_OVERHEAD_S;
    if (t + legSell > horizonS) {
      receipt.loops.push({ loop: loops, fail: 'horizon_before_sell' });
      break;
    }
    const moveSell = tryTravel(ctx, {
      fromSectorId: currentSectorId,
      toSectorId: sellSec.id,
      travelS: legSell,
      reason: `gate_toll:prospect:${loops}:sell`,
      seed, costs, budget,
    });
    if (!moveSell.ok) {
      markBottleneck(receipt, 'unaffordable_toll', 'Sell leg denied');
      break;
    }
    t = ctx.state.simTime;
    currentSectorId = sellSec.id;

    let loopSold = 0;
    for (const cid of Object.keys(ctx.state.player.cargo.items || {})) {
      if (cid === 'cmdty_munitions') continue;
      const qty = ctx.state.player.cargo.items[cid] || 0;
      if (qty <= 0) continue;
      const res = ctx.econ.execute(sellStationId, cid, 'sell', qty);
      if (!res.ok) continue;
      cargoDestroyed += res.qty;
      loopSold += res.qty;
      receipt.saleProceeds += res.total;
    }
    advanceTime(ctx, 8, budget, 'actionS');
    t = ctx.state.simTime;
    if (loopSold <= 0) {
      marketExhaustion = true;
      markBottleneck(receipt, 'sell_blocked', 'Station would not buy cargo');
      break;
    }
    loops += 1;
    receipt.completedLoops = loops;
    receipt.completedContracts += 1;
    receipt.loops.push({
      loop: loops, t: round1(t), sold: loopSold,
      field: fieldMemoryReadout(ctx.state, fieldId),
      beamId: beam.id, shipId: ctx.currentShipId,
      creditsAfter: ctx.state.player.credits | 0,
    });

    const legField = travelTimeS(currentSectorId, fieldSectorId) + MINING_TRANSIT_S * 0.5;
    if (t + legField > horizonS) break;
    const moveField = tryTravel(ctx, {
      fromSectorId: currentSectorId,
      toSectorId: fieldSectorId,
      travelS: legField,
      reason: `gate_toll:prospect:${loops}:field`,
      seed, costs, budget,
    });
    if (!moveField.ok) {
      markBottleneck(receipt, 'unaffordable_toll', 'Return-to-field denied');
      break;
    }
    t = ctx.state.simTime;
    currentSectorId = fieldSectorId;

    if (!upgraded && midShip && (ctx.state.player.credits | 0) >= midShip.price) {
      if (tryBuyShipLive(ctx, midShip.id, receipt, costs)) {
        upgraded = true;
        receipt.equipment.activePhase = 'pelican';
        receipt.equipment.currentShipId = midShip.id;
        receipt.equipment.upgradedAtLoop = loops;
      }
    }

    // Beam M only if researched + owned purchase path; otherwise stay gated.
    if (upgraded && midBeam && midBeam.requiresTech
      && !(ctx.state.player.researchedNodes || []).includes(midBeam.requiresTech)) {
      markBottleneck(receipt, 'beam_m_research', 'Beam M gated by research');
      receipt.equipment.beamM.blockedBy = { kind: 'research', techId: midBeam.requiresTech };
    }
  }

  receipt.marketExhaustion = marketExhaustion
    || fieldMemoryReadout(ctx.state, fieldId).band === 'depleted';
  receipt.inventoryCreated = cargoCreated;
  receipt.inventoryRemoved = cargoDestroyed;
  receipt.asteroidsMined = asteroidsMined;
  receipt.fieldFinal = fieldMemoryReadout(ctx.state, fieldId);
  receipt.fieldFinals = fieldIds.map((id) => fieldMemoryReadout(ctx.state, id));
  receipt.equipment.activePhase = upgraded ? 'pelican' : 'starter';
  receipt.equipment.plannedMidLoadout = assessLoadoutViability('prospector', 'mid');
  receipt.loadoutViability = assessLoadoutViability('prospector', upgraded ? 'mid' : 'starter');
  finalizeReceipt(receipt, ctx, costs, budget, horizonS);
  return receipt;
}

// ---- assertions -------------------------------------------------------------
export function assertCareerReceipt(receipt, bands = null) {
  const careerBands = bands || CAREER_BANDS[receipt.career];
  const fails = [];
  const warns = [];
  const horizonS = receipt.horizonS;

  if (!Number.isFinite(receipt.endingCapital) || receipt.endingCapital < 0) {
    fails.push(`impossible_capital ending=${receipt.endingCapital}`);
  }
  if (receipt.startingCapital !== NEW_GAME.credits) {
    fails.push(`starting_capital_mismatch`);
  }
  if (receipt.completedLoops <= 0 && (receipt.completedContracts || 0) <= 0) {
    fails.push(`dead_route loops=${receipt.completedLoops}`);
  }
  // Independent horizon rate (not shared 90m rate).
  if (receipt.creditsPerMin < careerBands.dead) {
    fails.push(`dead_income ${receipt.creditsPerMin} < ${careerBands.dead} (${receipt.career})`);
  } else if (receipt.creditsPerMin < careerBands.lo) {
    // Soft: warn below healthy, hard-fail only if dead.
    warns.push(`below_healthy_band ${receipt.creditsPerMin} < ${careerBands.lo}`);
  }
  if (receipt.creditsPerMin > careerBands.hi) {
    fails.push(`implausible_dominant ${receipt.creditsPerMin} > ${careerBands.hi} (${receipt.career})`);
  }
  // Time authority: every completed action should have advanced sim time.
  if ((receipt.time && receipt.time.simS || 0) < horizonS * 0.5 && (receipt.completedLoops || 0) > 0) {
    fails.push(`time_authority_short simS=${receipt.time && receipt.time.simS} horizon=${horizonS}`);
  }
  if ((receipt.time && receipt.time.travelS || 0) <= 0 && (receipt.completedLoops || 0) > 2) {
    fails.push('travel_time_not_accounted');
  }
  if ((receipt.time && receipt.time.actionS || 0) <= 0 && (receipt.completedLoops || 0) > 2) {
    fails.push('action_time_not_accounted');
  }
  // Constraint: unaffordable travel must not silently succeed with zero credits mid-route negatives.
  for (const loop of receipt.loops || []) {
    if (loop.creditsAfter != null && loop.creditsAfter < 0) fails.push(`negative_mid_capital loop=${loop.loop}`);
  }
  if (receipt.career === 'hunter') {
    if ((receipt.ownedWeapons || []).includes('wpn_autocannon_s') === false) {
      // Must not have used autocannon without ownership — checked via defects
    }
    if ((receipt.defects || []).includes('used_unowned_autocannon')) {
      fails.push('used_unowned_autocannon');
    }
    if (horizonS >= 60 * 60) {
      if (!(receipt.repairCost > 0) && !(receipt.insuranceCost > 0) && !(receipt.deaths > 0)) {
        warns.push('hunter_low_risk_exposure');
      }
      if (!((receipt.failedContracts || 0) > 0 || (receipt.failedMissions || 0) > 0)) {
        warns.push('hunter_no_failure_counterplay');
      }
    }
    // Death recovery must not full-heal at the moment of respawn (insurance residual damage).
    if (receipt.deaths > 0) {
      const deathLoop = (receipt.loops || []).find((l) => l.outcome === 'death_recovery');
      if (!deathLoop) fails.push('death_recovery_unlogged');
      else if (!(deathLoop.readiness < 0.99)) fails.push('death_recovery_full_heal_on_respawn');
    }
  }
  if (receipt.career === 'prospector' && horizonS >= 90 * 60) {
    const hull = (receipt.equipment.purchases || []).filter((p) => p.id === 'ship_pelican');
    if (hull.length === 1) {
      if (hull[0].atS <= 30 * 60 || hull[0].atS > 85 * 60) {
        fails.push('prospector_pelican_window');
      }
    }
    // Not required to buy pelican — prices restored; only assert if purchased.
    if (receipt.equipment.beamM && receipt.equipment.beamM.acquired) {
      fails.push('prospector_beam_m_should_stay_research_gated');
    }
  }
  if (!receipt.loadoutViability || !receipt.loadoutViability.viable) {
    fails.push('unviable_loadout');
  }

  receipt.assertionFails = fails;
  receipt.assertionWarns = warns;
  receipt.ok = fails.length === 0 && !(receipt.defects && receipt.defects.length);
  return receipt;
}

/**
 * Cross-career report: identity + loadouts. Does NOT use a loose 3.5× ceiling as a pass gate.
 * Large rate spreads are reported as info/warn only.
 */
export function assertCrossCareer(receiptsByCareerHorizon) {
  const fails = [];
  const warns = [];
  const kits = new Set();
  const hulls = new Set();
  for (const career of CAREER_IDS) {
    const r90 = receiptsByCareerHorizon[career] && receiptsByCareerHorizon[career][90];
    if (!r90) {
      fails.push(`missing_90m_${career}`);
      continue;
    }
    if (r90.loadoutViability) kits.add(r90.loadoutViability.roleKitId);
    if (r90.equipment) hulls.add(r90.equipment.roleHullDefId);
  }
  if (kits.size !== 3) fails.push('career_loadout_identity_flattened');
  if (hulls.size !== 3) fails.push('role_hull_targets_not_distinct');

  // Report disparity at each horizon without a hide-the-problem cross ceiling.
  const disparity = {};
  for (const m of DEFAULT_HORIZONS_MIN) {
    const rates = CAREER_IDS.map((c) => {
      const r = receiptsByCareerHorizon[c] && receiptsByCareerHorizon[c][m];
      return r ? r.creditsPerMin : null;
    }).filter((n) => Number.isFinite(n) && n > 0);
    if (rates.length === 3) {
      const mn = Math.min(...rates);
      const mx = Math.max(...rates);
      const ratio = mn > 0 ? mx / mn : Infinity;
      disparity[m] = { min: mn, max: mx, ratio: round2(ratio) };
      // Info only — identities may diverge; flag extreme >6× as warn, not pass-hack.
      if (ratio > 6) warns.push(`extreme_cross_disparity_${m}m ratio=${round2(ratio)}`);
    }
  }
  return { ok: fails.length === 0, fails, warns, disparity };
}

export function runCareerStrategy(careerId, options = {}) {
  const horizonMin = options.horizonMin != null ? options.horizonMin : 90;
  const horizonS = options.horizonS != null ? options.horizonS : horizonMin * 60;
  const opts = { ...options, horizonMin };
  if (careerId === 'hauler') return runHauler(horizonS, opts);
  if (careerId === 'hunter') return runHunter(horizonS, opts);
  if (careerId === 'prospector') return runProspector(horizonS, opts);
  throw new Error(`unknown career ${careerId}`);
}

/**
 * Nine independent career×horizon cohorts. Each cell is a fresh sim from new-game capital.
 */
export function runCareerCohorts(options = {}) {
  const horizonsMin = options.horizonsMin || [...DEFAULT_HORIZONS_MIN];
  blockNondeterminism();
  try {
    const cells = {};
    const table = [];
    for (const careerId of CAREER_IDS) {
      cells[careerId] = {};
      for (const m of horizonsMin) {
        const receipt = runCareerStrategy(careerId, {
          horizonMin: m,
          seed: (options.seeds && options.seeds[careerId]) || SEED_BY_CAREER[careerId],
          forceDeathAtLoop: options.includeFailure === false ? -1 : 6,
        });
        assertCareerReceipt(receipt, CAREER_BANDS[careerId]);
        cells[careerId][m] = receipt;
        table.push({
          career: careerId,
          minutes: m,
          credits: receipt.endingCapital,
          netWorth: receipt.netWorth,
          earnedValue: receipt.earnedValue,
          creditsPerMin: receipt.creditsPerMin,
          completedLoops: receipt.completedLoops,
          completedContracts: receipt.completedContracts,
          failedContracts: receipt.failedContracts,
          shipId: receipt.shipId,
          phase: receipt.equipment && receipt.equipment.activePhase,
          travelS: receipt.time && receipt.time.travelS,
          actionS: receipt.time && receipt.time.actionS,
          bottlenecks: receipt.bottlenecks || [],
          adaptersUsed: receipt.adaptersUsed || [],
          ok: receipt.ok,
          assertionFails: receipt.assertionFails || [],
          assertionWarns: receipt.assertionWarns || [],
        });
      }
    }

    const cross = assertCrossCareer(cells);

    // Determinism: re-run each 30m cell.
    const determinism = {};
    for (const careerId of CAREER_IDS) {
      const a = runCareerStrategy(careerId, {
        horizonMin: 30, forceDeathAtLoop: -1,
        seed: SEED_BY_CAREER[careerId],
      });
      const b = runCareerStrategy(careerId, {
        horizonMin: 30, forceDeathAtLoop: -1,
        seed: SEED_BY_CAREER[careerId],
      });
      const equal = a.endingCapital === b.endingCapital
        && a.completedLoops === b.completedLoops
        && a.creditsPerMin === b.creditsPerMin
        && a.earnedValue === b.earnedValue;
      determinism[careerId] = { equal, a: digest(a), b: digest(b) };
    }

    // Snapshot serialization (audit surface) — NOT a save/reload resume claim.
    // Proves snapshotSimState is stable for a mid-run state; does not assert resume equality.
    const snapProbe = runCareerStrategy('prospector', { horizonMin: 15, forceDeathAtLoop: -1 });
    // Rebuild a short sim and snapshot player/economy slice for stability of the seam itself.
    const snapCtx = bootSim(SEED_BY_CAREER.prospector);
    advanceTime(snapCtx, 60, emptyBudget(), 'actionS');
    const snap1 = canonicalStringify(snapshotSimState(snapCtx.state));
    const snap2 = canonicalStringify(snapshotSimState(snapCtx.state));
    const snapshotSeam = {
      seam: 'src/core/simSnapshot.js#snapshotSimState',
      stable: snap1 === snap2,
      note: 'Audit snapshot stability only. Full saveSystem serialize/deserialize resume is not exercised (saveSystem.js excluded). No reload-equivalence claim is made.',
      reloadClaimed: false,
    };

    const allCellsOk = CAREER_IDS.every((c) => horizonsMin.every((m) => cells[c][m].ok));
    const detOk = CAREER_IDS.every((c) => determinism[c].equal);
    const ok = allCellsOk && cross.ok && detOk && snapshotSeam.stable;

    const authorityMatrix = {
      live: [
        'economy.quote/execute/grantCredits/chargeCredits/update',
        'cargo via economy execute + addCargo/removeCargo',
        'ships.newGame/buyShip/unlockTech/buyModule',
        'factions.applyRep via faction:repDelta + tradeCompleted',
        'fieldDepletion kernels',
        'economy ui:service repair (proportional to credits)',
      ],
      adapter_warning: [
        'mission bounty rewards (MISSION_TUNING formula; board not used)',
        'combat TTK (EHP/DPS; combat system not stepped)',
        'mine TTK (beam/asteroid tables; mining update not stepped)',
        'gate toll amount (planGateScene + high-sec formula mirror)',
        'travel duration (MISSION_TUNING.cruiseSpeedRef + positions)',
      ],
      excluded_foreign_dirty: [
        'missions.js accept/complete/RP writer',
        'modules.js / weapons.js data edits',
        'saveSystem.js serialize/load resume',
      ],
      balanceTuning: 'none — production ship/tech prices left at pre-task values; adapters cannot justify retunes',
    };

    // Prefer 90m cells as "careers" summary for back-compat readers.
    const careers = {};
    for (const c of CAREER_IDS) careers[c] = cells[c][Math.max(...horizonsMin)];

    return {
      schema: CAREER_COHORT_SCHEMA,
      ok,
      horizonsMin: horizonsMin.slice(),
      bands: CAREER_BANDS,
      cells,
      careers,
      table,
      cross,
      determinism,
      snapshotSeam,
      authorityMatrix,
      residualSeams: buildResidualSeams(cells, authorityMatrix),
      upgradePaths: Object.fromEntries(CAREER_IDS.map((c) => {
        const r = careers[c];
        return [c, {
          roleHull: r.equipment.roleHullDefId,
          phase: r.equipment.activePhase,
          purchases: r.equipment.purchases || [],
          researchUnlocks: r.researchUnlocks || [],
          firstPurchaseAtS: (r.equipment.purchases && r.equipment.purchases[0] && r.equipment.purchases[0].atS) || null,
        }];
      })),
    };
  } finally {
    restoreNondeterminism();
  }
}

function digest(r) {
  return {
    career: r.career,
    endingCapital: r.endingCapital,
    earnedValue: r.earnedValue,
    creditsPerMin: r.creditsPerMin,
    completedLoops: r.completedLoops,
    shipId: r.shipId,
    phase: r.equipment && r.equipment.activePhase,
  };
}

function buildResidualSeams(cells, authorityMatrix) {
  const seams = [...authorityMatrix.adapter_warning.map((d) => ({
    area: 'adapter', status: 'warning_only', detail: d,
  }))];
  seams.push({
    area: 'balance_tuning',
    status: 'restored_pre_task',
    detail: 'Mule 35000 / Wasp 28000 / Combat Basics 6000+10RP restored; no retune without live mission RP+combat authority',
  });
  for (const c of CAREER_IDS) {
    const r = cells[c][90];
    if (!r) continue;
    for (const b of r.bottlenecks || []) {
      seams.push({ area: `bottleneck:${c}`, status: 'measured', detail: b.code });
    }
  }
  return seams;
}

export function summarizeCohortReport(report) {
  const slimCells = {};
  for (const c of CAREER_IDS) {
    slimCells[c] = {};
    for (const m of report.horizonsMin) {
      const r = report.cells[c][m];
      slimCells[c][m] = {
        ok: r.ok,
        endingCapital: r.endingCapital,
        earnedValue: r.earnedValue,
        creditsPerMin: r.creditsPerMin,
        netWorth: r.netWorth,
        completedLoops: r.completedLoops,
        completedContracts: r.completedContracts,
        failedContracts: r.failedContracts,
        shipId: r.shipId,
        phase: r.equipment && r.equipment.activePhase,
        purchases: r.equipment && r.equipment.purchases,
        time: r.time,
        bottlenecks: r.bottlenecks,
        adaptersUsed: r.adaptersUsed,
        assertionFails: r.assertionFails,
        assertionWarns: r.assertionWarns,
        hullDamageHp: r.hullDamageHp,
        readiness: r.readiness,
        ownedWeapons: r.ownedWeapons,
        researchedNodes: r.researchedNodes,
        researchPoints: r.researchPoints,
        deaths: r.deaths || 0,
        liveSeams: r.liveSeams,
      };
    }
  }
  return {
    schema: report.schema,
    ok: report.ok,
    horizonsMin: report.horizonsMin,
    bands: report.bands,
    table: report.table,
    cells: slimCells,
    cross: report.cross,
    determinism: Object.fromEntries(
      Object.entries(report.determinism || {}).map(([k, v]) => [k, { equal: v.equal }]),
    ),
    snapshotSeam: report.snapshotSeam,
    authorityMatrix: report.authorityMatrix,
    residualSeams: report.residualSeams,
    upgradePaths: report.upgradePaths,
  };
}
