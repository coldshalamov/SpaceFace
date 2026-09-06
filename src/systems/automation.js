// Automation & passive-income system — the anti-idle build-up layer.
// Contract: ARCHITECTURE §0.5 (seeded RNG), §0.6 (single-writer credits — emit
// economy:grant/chargeCredits, never write player.credits), §2.3 step 12 (runs after
// economy+mining, before UI), §3.9 (state.automation schema), §4.4 (master event table),
// design/specs/08-automation-passive-income-anti-idle-layer.md.
//
// THREE ACCRUAL TYPES:
//   - Mining DRONES: continuous mineRate*count*dt into a SHARED group buffer (capped at bufferCap).
//     Buffer is realized to credits on Recall (collect/bank). Fuel bleeds while the group is
//     operating; fuel=0 strands the machine in place. Purchased equipment is never deleted for a
//     routine fuel shortage (PQ-177.07).
//   - Hired TRADERS: discrete. cycleProgress += dt/cycleTime; on a completed cycle, credit the
//     spread profit (read live via economy.priceOf/quote), roll a danger-scaled loss, and emit
//     economy:applyTradePressure so the route self-limits. upkeep drains regardless.
//   - OUTPOSTS: continuous production into a capped storage buffer; if autoSell, the local market
//     buys the surplus at a 20% penalty each minute. Raidable on a 600s interval.
//
// THE SIGNATURE MECHANIC — GLOBAL PASSIVE CAP (spec risk #1): most passive credits still pass
// through creditPassive()'s per-minute token bucket. Programmed-miner depot sales (drone:program)
// are the proven exception (PQ-177.07): physical throughput, storage, fuel, and destination demand
// are the primary bound, and those sales settle at the quoted total without the bucket haircut.
//
// Pure-data deps only (no 'three'). Reads economy via the registry (priceOf/quote/getMarket),
// danger from the SECTORS catalog (dangerIndex), the player tier from player.droneTierCap.
import { DRONES, TRADERS, OUTPOSTS, AUTO_BALANCE } from '../data/automation.js';
import { TECH_NODES } from '../data/tech.js';
import { SECTORS, dangerIndex } from '../data/sectors.js';
import { drawSeeded, hash32 } from '../core/rng.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { tickProgram, assignTemplate, clearTemplate, TEMPLATES } from './alphabet.js';
import { ASTEROIDS } from '../data/mining.js';
import {
  addToShipment,
  commitShipmentSale,
  ensureShipment,
  shipmentQty,
  shipmentUsed,
} from './cargoCustody.js';
import {
  applyFuelShortage,
  boundDemandQty,
  isFuelStranded,
  isThroughputSettledSource,
  migrateDroneOperation,
  operatingCostPerMin,
  recordGrossUnits,
  recordRealisedSale,
  resumeAfterFuel,
  stampOperation,
} from './automationOperations.js';
import {
  WING_ORDER,
  WING_ORDER_SCOPE,
  legacyFleetOrderFor,
  makeRecipientWingOrder,
  makeWingOrderCommand,
  normalizeLiveWingOrder,
  normalizePersistedWingOrder,
} from '../data/wingOrders.js';
import { isHostileForAI } from '../ai/engagementAuthority.js';
import { droneBayCompatibleSlotCount, droneBayCountForFittings } from './ships.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const compareStableId = (left, right) => {
  const a = String(left && left.id != null ? left.id : left);
  const b = String(right && right.id != null ? right.id : right);
  return a < b ? -1 : a > b ? 1 : 0;
};

// Static lookups (built once).
const DRONE_BY_ID = new Map(DRONES.map((d) => [d.id, d]));
const TRADER_BY_ID = new Map(TRADERS.map((t) => [t.id, t]));
const OUTPOST_BY_ID = new Map(OUTPOSTS.map((o) => [o.id, o]));
const TECH_BY_ID = new Map(TECH_NODES.map((node) => [node.id, node]));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const ASTEROID_BY_ID = new Map(ASTEROIDS.map((a) => [a.id, a]));
const AUTOMATION_RECORD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/;
const COMMON_ORES = ['cmdty_ore_iron', 'cmdty_ore_copper', 'cmdty_ore_titanium', 'cmdty_ore_platinoid'];
const TRADER_SHIP_DEF = Object.freeze({
  trader_hauler_l: 'ship_mule',
  trader_freighter_m: 'ship_mule',
  trader_bulk_h: 'ship_atlas',
});
const OUTPOST_VISUAL_BY_DEF = Object.freeze({
  outpost_refinery: Object.freeze({
    placeId: 'place_claim_outpost_refinery',
    claimSpecId: 'spec_refinery',
  }),
  outpost_fuelsynth: Object.freeze({
    placeId: 'place_claim_outpost_refinery',
    claimSpecId: 'spec_refinery',
  }),
  outpost_habhub: Object.freeze({
    placeId: 'place_claim_outpost_relay',
    claimSpecId: 'spec_relay',
  }),
});

/** Keep persisted automation identities stable when valid, and replace malformed identities with
 * a caller-supplied canonical fallback before UI/data-ref consumers can observe them. */
export function normalizeAutomationRecordId(value, fallback = null) {
  const candidate = typeof value === 'string'
    ? value.trim()
    : (Number.isSafeInteger(value) ? String(value) : '');
  if (candidate && AUTOMATION_RECORD_ID_RE.test(candidate)) return candidate;
  const safeFallback = typeof fallback === 'string' ? fallback.trim() : '';
  return safeFallback && AUTOMATION_RECORD_ID_RE.test(safeFallback) ? safeFallback : null;
}

function normalizeAutomationRecordList(value, prefix) {
  const list = Array.isArray(value) ? value : [];
  const used = new Set();
  const out = [];
  for (let index = 0; index < list.length; index += 1) {
    const record = list[index];
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    const baseFallback = `${prefix}_${index + 1}`;
    let id = normalizeAutomationRecordId(record.id, baseFallback) || baseFallback;
    let suffix = 2;
    while (used.has(id)) id = `${baseFallback}_${suffix++}`;
    record.id = id;
    used.add(id);
    out.push(record);
  }
  return out;
}

/**
 * Resolve the active hull's durable drone capacity.
 *
 * Existing drone groups are never removed when a refit or ship swap lowers capacity; callers use
 * `available` only to authorize a new purchase. Research ids are deduplicated and resolved through
 * the canonical tech catalog so malformed save entries cannot inflate the multiplier.
 */
export function droneBayCapacityForState(state = {}) {
  const player = state && state.player;
  const ownedShips = player && Array.isArray(player.ownedShips) ? player.ownedShips : [];
  const activeShipIndex = player && player.activeShipIndex;
  const activeShip = Number.isInteger(activeShipIndex)
    && activeShipIndex >= 0
    && activeShipIndex < ownedShips.length
    ? ownedShips[activeShipIndex]
    : null;
  const bayCount = activeShip && typeof activeShip.defId === 'string'
    ? droneBayCountForFittings(activeShip.defId, activeShip.fittings)
    : 0;
  const compatibleSlotCount = activeShip && typeof activeShip.defId === 'string'
    ? droneBayCompatibleSlotCount(activeShip.defId)
    : 0;

  let extraPerBay = 0;
  const researched = new Set(player && Array.isArray(player.researchedNodes)
    ? player.researchedNodes.filter((id) => typeof id === 'string')
    : []);
  const droneControlResearched = researched.has('tech_drone_control');
  if (droneControlResearched) {
    for (const id of researched) {
      const node = TECH_BY_ID.get(id);
      const value = node && node.unlocks && node.unlocks.extraDronePerBay;
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) continue;
      const next = extraPerBay + value;
      if (Number.isSafeInteger(next)) extraPerBay = next;
    }
  }

  const perBay = 1 + extraPerBay;
  const rawCapacity = bayCount * perBay;
  const capacity = Number.isSafeInteger(rawCapacity) && rawCapacity >= 0 ? rawCapacity : 0;
  const groups = state && state.automation && Array.isArray(state.automation.drones)
    ? state.automation.drones
    : [];
  const used = groups.length;
  return Object.freeze({
    bayCount,
    compatibleSlotCount,
    droneControlResearched,
    extraPerBay,
    perBay,
    capacity,
    used,
    available: Math.max(0, capacity - used),
  });
}

// stationId -> { sectorId, factionId, type, position } from the SECTORS graph (same resolve
// pattern economy uses — dock/UI hands us station ids, sectors own the geometry).
const STATION_SECTOR = new Map();
const ALL_STATIONS = [];
for (const sec of SECTORS) {
  for (const st of sec.stations || []) {
    STATION_SECTOR.set(st.id, {
      name: st.name,
      sectorId: sec.id,
      sectorName: sec.name,
      factionId: st.factionId,
      type: st.type,
      position: sec.position,
    });
    ALL_STATIONS.push({ id: st.id, name: st.name, type: st.type, sectorId: sec.id, sectorName: sec.name, position: sec.position });
  }
}

// A nominal ore commodity drone buffers bank as, with a fallback value when no market exists.
const DRONE_ORE_ID = 'cmdty_ore_iron';
const DRONE_ORE_FALLBACK_VALUE = 28; // cmdty_ore_iron basePrice (informational fallback)

// Cadences (s).
const OUTPOST_RAID_INTERVAL_S = 600;
const OUTPOST_AUTOSELL_INTERVAL_S = 60;
const OFFSCREEN_NETWORK_INTERVAL_S = 60;

// ---- mining-drone FLYING-ENTITY tuning (real type:'drone' entities that orbit/seek asteroids) ----
const DRONE_ENTITY_RADIUS = 2.4;      // wu collision radius of a single drone mesh
const DRONE_SPEED = 130;              // wu/s cruise toward the targeted asteroid
const DRONE_ACCEL = 7.0;              // velocity lerp rate toward the desired heading (1/s)
const DRONE_MINE_RANGE = 34;          // wu standoff at which the drone "chips" the rock
const DRONE_ORBIT_GAP = 14;           // wu added to the asteroid radius for the standoff ring
const DRONE_SPREAD = 26;              // wu spacing so multiple drones in a group fan out
const ASTEROID_QUERY_RADIUS_PAD = 64;

// Loss/raid tuning (spec Formulas).
const TRADER_LOSS_CAP = 0.35;
const OUTPOST_RAID_CAP = 0.5;
const HOTNESS_GAIN = 0.05;     // per consecutive cycle on the same route
const HOTNESS_DECAY = 0.1;     // per minute when idle
const ROUTE_FUEL_PER_WU = 0.4; // cr per wu (sector-position distance proxy)
const SECTOR_POS_TO_WU = 600;  // sector graph spacing -> rough wu so route fuel is non-trivial
const OUTPOST_AUTOSELL_MULT = 0.8; // local surplus sale penalty.

export const AUTOMATION_PASSIVE_TUNING = Object.freeze({
  droneOreId: DRONE_ORE_ID,
  droneOreFallbackValue: DRONE_ORE_FALLBACK_VALUE,
  outpostAutosellMult: OUTPOST_AUTOSELL_MULT,
});

// Offline catch-up receipt schema (summary event + meta.lastOfflineReceipt).
export const OFFLINE_RECEIPT_SCHEMA_ID = 'spaceface.automationOfflineReceipt.v1';
// Hard upper bound strictly below 1 so presence always out-earns offline for the same gross.
export const OFFLINE_EFF_MAX = 0.999;

export function passiveCapPerMinForTier(balance = AUTO_BALANCE, tier = 1) {
  const bal = balance || AUTO_BALANCE;
  const ref = bal.activeRefByTier || AUTO_BALANCE.activeRefByTier || [];
  const maxTier = Math.max(1, ref.length);
  const safeTier = clamp(Math.round(tier) || 1, 1, maxTier);
  const active = ref[safeTier - 1] || ref[0] || 0;
  const frac = bal.passiveCapFrac != null ? bal.passiveCapFrac
    : (AUTO_BALANCE.passiveCapFrac != null ? AUTO_BALANCE.passiveCapFrac : 0.45);
  return active * frac;
}

export function creditPassiveFromBudget(grossAmount, capBudget) {
  const gross = Math.max(0, grossAmount || 0);
  const budget = Math.max(0, capBudget || 0);
  const take = Math.min(gross, budget);
  return {
    credited: Math.round(take),
    debitedBudget: take,
    remainingBudget: budget - take,
    overflow: Math.max(0, gross - take),
  };
}

// Clamp offline efficiency to [0, OFFLINE_EFF_MAX] so offline never matches or beats presence.
export function clampOfflineEff(eff, defaultEff = 0.6) {
  const fallback = Number.isFinite(defaultEff) ? defaultEff : 0.6;
  const raw = Number.isFinite(eff) ? eff : fallback;
  return clamp(raw, 0, OFFLINE_EFF_MAX);
}

// Resolve wall-clock elapsed for offline catch-up. Negative / non-finite fail closed (0 elapsed).
export function resolveOfflineElapsed(lastTickMs, nowMs, offlineCapSec = 14400) {
  const cap = Number.isFinite(offlineCapSec) && offlineCapSec > 0 ? offlineCapSec : 14400;
  if (!Number.isFinite(lastTickMs) || lastTickMs <= 0) {
    return { elapsedSec: 0, rawSec: 0, capped: false, failClosed: 'no_baseline' };
  }
  if (!Number.isFinite(nowMs)) {
    return { elapsedSec: 0, rawSec: 0, capped: false, failClosed: 'bad_now' };
  }
  const rawSec = (nowMs - lastTickMs) / 1000;
  if (!(rawSec > 0)) {
    return {
      elapsedSec: 0,
      rawSec,
      capped: false,
      failClosed: rawSec < 0 ? 'negative_wall' : 'zero_elapsed',
    };
  }
  const elapsedSec = Math.min(rawSec, cap);
  return {
    elapsedSec,
    rawSec,
    capped: rawSec > cap,
    failClosed: null,
  };
}

// Size the passive token bucket for a multi-minute offline window (cap/min * minutes).
export function offlineCapBudgetForElapsed(passiveCapPerMin, elapsedSec) {
  const cap = Math.max(0, passiveCapPerMin || 0);
  const elapsed = Math.max(0, elapsedSec || 0);
  return cap * (elapsed / 60);
}

// Apply offlineEff then the passive per-window cap. Pure; no side effects.
export function settleOfflinePassive({ grossCr = 0, offlineEff = 0.6, capBudget = 0 } = {}) {
  const eff = clampOfflineEff(offlineEff);
  const gross = Math.max(0, grossCr || 0);
  const grossOffline = gross * eff;
  const settlement = creditPassiveFromBudget(grossOffline, capBudget);
  return {
    offlineEff: eff,
    grossCr: gross,
    grossOfflineCr: grossOffline,
    credited: settlement.credited,
    overflowDropped: settlement.overflow,
    remainingBudget: settlement.remainingBudget,
    debitedBudget: settlement.debitedBudget,
    // Presence earns full gross through the same cap; offline is strictly lower when eff < 1 and gross > 0.
    presenceAdvantage: eff < 1,
  };
}

export function buildOfflineReceipt(parts = {}) {
  const receipt = {
    schemaId: OFFLINE_RECEIPT_SCHEMA_ID,
    windowStartMs: parts.windowStartMs || 0,
    nowMs: parts.nowMs || 0,
    elapsedSec: Math.round(parts.elapsedSec || 0),
    rawElapsedSec: Math.round(parts.rawElapsedSec || 0),
    elapsedCapped: !!parts.elapsedCapped,
    failClosed: parts.failClosed || null,
    skipped: !!parts.skipped,
    skipReason: parts.skipReason || null,
    offlineEff: parts.offlineEff != null ? parts.offlineEff : 0,
    passiveCapPerMin: parts.passiveCapPerMin || 0,
    capBudgetCr: parts.capBudgetCr || 0,
    grossCr: Math.round(parts.grossCr || 0),
    grossOfflineCr: Math.round(parts.grossOfflineCr || 0),
    credited: Math.round(parts.credited || 0),
    overflowDropped: Math.round(parts.overflowDropped || 0),
    droneCr: Math.round(parts.droneCr || 0),
    traderCr: Math.round(parts.traderCr || 0),
    outpostCr: Math.round(parts.outpostCr || 0),
    cycles: parts.cycles || 0,
    lost: parts.lost || 0,
    upkeep: Math.round(parts.upkeep || 0),
    upkeepCharged: Math.round(parts.upkeepCharged || 0),
    upkeepUnpaid: Math.round(parts.upkeepUnpaid || 0),
    distressed: !!parts.distressed,
    // Offline never emits economy:applyTradePressure (owner-safe: economy sole market writer).
    tradePressureEvents: parts.tradePressureEvents != null ? parts.tradePressureEvents : 0,
    ownerSafePressure: parts.ownerSafePressure !== false,
    grantIntentsOnly: parts.grantIntentsOnly !== false,
  };
  return receipt;
}

export function droneGrossCrPerMin(def, orePrice, count = 1) {
  return Math.round(((def && def.mineRate) || 0) * (count || 1) * 60 * (orePrice || 0));
}

export function outpostOutputGoodId(def) {
  return def && def.recipe && def.recipe.output ? Object.keys(def.recipe.output)[0] : DRONE_ORE_ID;
}

export function outpostGrossValue(def, quantity, orePriceForGood) {
  const qty = Math.max(0, quantity || 0);
  if (def && def.recipe && def.recipe.passive) return qty;
  const goodId = outpostOutputGoodId(def);
  const price = typeof orePriceForGood === 'function' ? orePriceForGood(goodId) : orePriceForGood;
  return qty * (price || 0) * OUTPOST_AUTOSELL_MULT;
}

export function outpostGrossCrPerMin(def, orePriceForGood, opts = {}) {
  const level = opts.level || 1;
  const outRate = opts.outRate != null
    ? opts.outRate
    : ((def && def.outRate) || 0) * Math.pow(1.6, level - 1);
  return Math.round(outpostGrossValue(def, outRate * 60, orePriceForGood));
}

// Pure coarse production planner shared by live ticks and offline catch-up. The planner knows
// recipe ratios and storage capacity, but nothing about drones, UI, entities, or wall time.
export function planOutpostProduction({
  recipe = null,
  requestedOutput = 0,
  storageRoom = Infinity,
  availableByGood = {},
} = {}) {
  const requested = Math.max(0, Number(requestedOutput) || 0);
  const room = Number.isFinite(storageRoom) ? Math.max(0, storageRoom) : Infinity;
  const targetOutput = Math.min(requested, room);
  const inputs = recipe && recipe.inputs && typeof recipe.inputs === 'object'
    ? Object.entries(recipe.inputs)
      .filter(([, amount]) => Number(amount) > 0)
      .sort(([a], [b]) => compareStableId(a, b))
    : [];
  const output = recipe && recipe.output && typeof recipe.output === 'object'
    ? Object.entries(recipe.output).find(([, amount]) => Number(amount) > 0)
    : null;
  const outputPerBatch = output ? Number(output[1]) : 1;

  if (!(targetOutput > 0)) {
    return {
      produced: 0,
      consumedByGood: {},
      missingByGood: {},
      limitingGoodId: null,
      status: room <= 0 ? 'storage_full' : 'idle',
    };
  }

  // Passive facilities intentionally have no feedstock contract. Preserve that authored behavior.
  if (recipe && recipe.passive) {
    return {
      produced: targetOutput,
      consumedByGood: {},
      missingByGood: {},
      limitingGoodId: null,
      status: 'producing',
    };
  }

  // Missing or malformed recipe data must fail closed. Treating an absent input/output contract as
  // passive would silently recreate the produce-from-nothing bug this planner exists to prevent.
  if (!recipe || inputs.length === 0 || !output) {
    return {
      produced: 0,
      consumedByGood: {},
      missingByGood: {},
      limitingGoodId: null,
      status: 'invalid_recipe',
    };
  }

  const requestedBatches = targetOutput / outputPerBatch;
  let possibleBatches = requestedBatches;
  let limitingGoodId = null;
  for (const [goodId, amountPerBatchRaw] of inputs) {
    const amountPerBatch = Number(amountPerBatchRaw);
    const available = Math.max(0, Number(availableByGood[goodId]) || 0);
    const byInput = available / amountPerBatch;
    if (byInput < possibleBatches) {
      possibleBatches = byInput;
      limitingGoodId = goodId;
    }
  }

  const batches = Math.max(0, Math.min(requestedBatches, possibleBatches));
  const produced = batches * outputPerBatch;
  const consumedByGood = {};
  const missingByGood = {};
  for (const [goodId, amountPerBatchRaw] of inputs) {
    const amountPerBatch = Number(amountPerBatchRaw);
    const consumed = Math.min(
      Math.max(0, Number(availableByGood[goodId]) || 0),
      batches * amountPerBatch,
    );
    consumedByGood[goodId] = consumed;
    const neededForRequest = requestedBatches * amountPerBatch;
    const missing = Math.max(0, neededForRequest - Math.max(0, Number(availableByGood[goodId]) || 0));
    if (missing > 1e-9) missingByGood[goodId] = missing;
  }

  return {
    produced,
    consumedByGood,
    missingByGood,
    limitingGoodId,
    status: produced + 1e-9 < targetOutput ? 'starved' : 'producing',
  };
}

export function traderProfitPerCycle(def, buyA, sellB, opts = {}) {
  const spread = Math.max(0, (sellB || 0) - (buyA || 0));
  const hotPenalty = opts.hotPenalty != null ? opts.hotPenalty : (1 - 0.5 * (opts.hotness || 0));
  const units = opts.units != null ? opts.units : ((def && def.cargoVol) || 0);
  const tradeEff = def && def.tradeEff != null ? def.tradeEff : 0.9;
  return Math.max(0, units * spread * tradeEff * hotPenalty - (opts.routeFuelCost || 0));
}

export const automation = {
  name: 'automation',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._registry = ctx.registry || null;
    automation._instance = this;

    const state = this.state;
    if (!state.automation) state.automation = makeDefaultAutomation();
    this._normalizeAutomation(state.automation);

    // Per-minute token bucket for the passive cap (transient — rebuilt at runtime, refilled per tick).
    this._capBudget = 0;
    // Cadence accumulators (transient).
    this._outpostRaidAccum = 0;
    this._outpostSellAccum = 0;
    this._nextId = 1;
    this._asteroidScratch = [];
    this._diag = {
      asteroidSpatialQueries: 0,
      asteroidCandidates: 0,
      alphabetSpatialQueries: 0,
      alphabetCandidates: 0,
    };
    this._programCtx = makeProgramContext(this);
    this._saveRestoring = false;

    // Dedicated seeded RNG stream (§0.5) for loss/raid rolls so they don't disturb other streams.
    this._initRng();

    const bus = this.bus;
    // Single intent channel from the AutomationPanel UI (§4.4 ui:fleetOrder). The panel multiplexes
    // every button (buyDrone/hireTrader/buildOutpost/recall/assignRoute/dismiss/decommission/order*/
    // assignFleet) through this one event; `order` is the verb we switch on.
    bus.on('ui:fleetOrder', (p) => { if (p) this.handleOrder(p); });
    bus.on('ui:wingOrder', (p) => { if (p) this.handleWingOrder(p); });

    // Combat dealing damage to one of our assets (drone group / outpost / fleet ship).
    bus.on('combat:hitAsset', (p) => { if (p) this.onHitAsset(p); });

    // Save restore re-enters the saved sector before automation.deserialize() runs. Suppress
    // presence during that interval so structures from the previous run cannot flash into view.
    bus.on('save:restoring', () => {
      this._saveRestoring = true;
      for (const o of this.state.automation.outposts) this._releaseOutpostEntity(o);
    });
    // Offline catch-up: when a save is loaded, simulate the elapsed-away window once, then
    // materialize only the restored current-sector ledger.
    bus.on('save:loaded', () => {
      this._saveRestoring = false;
      this.runOfflineCatchup();
      this._syncOutpostPresence(this.state.automation);
    });
    bus.on('save:error', () => {
      if (!this._saveRestoring) return;
      this._saveRestoring = false;
      this._syncOutpostPresence(this.state.automation);
    });
    bus.on('game:started', () => {
      this._saveRestoring = false;
      // G2: stamp sim-time baseline, never wall-clock.
      this.meta().lastTickTime = simTimeMs(this.state);
    });

    // Hard sector exit: world despawns sector-scoped entities — release live drone hulls and drop
    // ids (they re-spawn from the group when the player returns). Continuous free-flight membership
    // preserves live drone identity / task / route / progress across Voronoi handoffs (M2-C1).
    bus.on('sector:exit', (p) => {
      // The off-screen cadence bucket describes the sector set that was remote during the elapsed
      // partial minute. Settle that exact set before current-sector membership changes; otherwise
      // the next sector can inherit time accrued before the handoff and receive/miss production.
      this._flushOffscreenNetworkBeforeSectorTransition(p && p.sectorId);
      if (p && (p.continuous || p.noTeleport)) return;
      for (const g of this.state.automation.drones) this._releaseDroneEntities(g);
      for (const o of this.state.automation.outposts) this._releaseOutpostEntity(o);
    });
    // Continuous enter: adopt sector membership for still-live drone groups. No spawn, no task/
    // route/program/cargo reset — identity stays on the live entity ids (M2-C1).
    bus.on('sector:enter', (p) => {
      this._onContinuousDroneMembership(p);
      if (this._saveRestoring) return;
      this._syncOutpostPresence(this.state.automation);
    });

    // Tech can raise the drone tier cap → just affects gating/cap; nothing to do eagerly.
  },

  /** Soft handoff: live drone groups follow current sector membership without teardown or re-spawn. */
  _onContinuousDroneMembership(p) {
    if (!(p && (p.continuous || p.noTeleport))) return;
    const sid = p.sectorId || (this.state.world && this.state.world.currentSectorId) || null;
    if (!sid || !this.state.automation || !this.state.automation.drones) return;
    for (const g of this.state.automation.drones) {
      if (this._hasLiveDroneEntities(g)) g.sectorId = sid;
    }
  },

  // ------------------------------------------------------------------------------------------
  // PER-TICK UPDATE (§2.3 step 12). Order: refill cap bucket → drones → traders → outposts →
  // upkeep drain → distress/repossession. Credits only ever move through creditPassive()/upkeep.
  // ------------------------------------------------------------------------------------------
  update(dt, state) {
    const a = state.automation;
    if (!a) return;
    if (!(dt > 0)) return;
    ensureAutomationRuntime(this);
    resetAutomationDiagnostics(this._diag);

    // Refill the per-minute cap token bucket: capLimit/60 per second, clamped to [0, capLimit].
    const capLimit = this.passiveCapPerMin();
    this._capBudget = clamp(this._capBudget + (capLimit / 60) * dt, 0, capLimit > 0 ? capLimit : 0);

    this._updateDrones(dt, a);
    this._updateTraders(dt, a);
    this._updateOffscreenNetwork(dt, a);
    this._updateOutposts(dt, a);
    this._drainUpkeep(dt, a);

    // G2: authoritative tick stamp is sim-time only (deterministic across run speeds).
    this.meta().lastTickTime = simTimeMs(state);
    state.automationRuntime = state.automationRuntime || {};
    state.automationRuntime.diagnostics = this._diag;
  },

  // ------------------------------------------------------------------------------------------
  // DRONES — REAL flying entities. Each deployed group owns N type:'drone' entities that orbit
  // and seek the nearest live asteroid, chip ore (inline mining math), and bank it to the SHARED
  // capped buffer. Fuel bleeds while active; fuel=0 strands the group in place until refuel.
  // Purchased equipment is never deleted for a routine fuel shortage (PQ-177.07).
  //
  // The per-second mine RATE is still authored by AUTO_BALANCE/DRONES.mineRate (def.mineRate*count)
  // so balance is untouched — the flying entities are the *vehicle* for that yield, gated on the
  // drone actually being in range of a rock (so an empty field starves the group, the spec's
  // "fly to a field" intent). When the player isn't in the drone's home sector the world has no
  // live asteroids loaded, so we fall back to the abstract accrual (entities only exist in-sector).
  // ------------------------------------------------------------------------------------------
  _updateDrones(dt, a) {
    const curSector = (this.state.world && this.state.world.currentSectorId) || null;
    for (let i = a.drones.length - 1; i >= 0; i--) {
      const g = a.drones[i];
      const def = DRONE_BY_ID.get(g.defId) || g;
      if (g.status === 'distressed') { this._parkDroneEntities(g); continue; } // frozen until upkeep paid
      if (isFuelStranded(g)) {
        this._strandForFuel(g, def, { toast: false });
        continue;
      }

      g.oreType = g.oreType || DRONE_ORE_ID;

      // Continuous membership / mid-task sector cross (M2-C1): if live hulls still exist after a
      // free-flight handoff, adopt current sector membership — never soft-reset task/route/ids by
      // releasing just because g.sectorId lagged the player bubble. Abstract away-from-field path
      // only when there are no live entities left for this group. Runs before program+legacy paths.
      if (g.sectorId !== curSector) {
        if (this._hasLiveDroneEntities(g)) g.sectorId = curSector;
        else if (g.entityIds && g.entityIds.length) g.entityIds = [];
      }

      // Away-sector groups are aggregated with their local outposts once per minute. Keeping them
      // out of the fixed tick preserves the observable-when-present / averaged-when-absent contract.
      if (g.sectorId !== curSector) continue;

      // PROGRAM PATH (V2 §4 / cut-list #28): if the group has an assigned alphabet template,
      // run it instead of the legacy mine-to-buffer loop. PQ-177.06: ore lands in the operation
      // shipment, never the player hold. Depot sales move that shipment once, with a receipt.
      if (g.program && TEMPLATES[g.program.templateId]) {
        this._runProgrammedGroup(g, def, dt, curSector);
        if (this._burnOperatingFuel(g, def, dt)) continue;
        g.status = 'program';
        continue;
      }

      const cap = g.bufferCap || def.bufferCap || 0;
      const room = cap - (g.buffer || 0);

      // Drive the visible drone entities (only meaningful in the group's home sector, where the
      // field is loaded). Returns true if at least one drone is actually on a rock this tick.
      const onRock = (g.sectorId === curSector)
        ? this._steerDroneEntities(g, def, dt, room > 0)
        : false;

      // Mine into the shared buffer at the authored rate. In-sector the drones must be on a rock;
      // out-of-sector (abstract) we accrue as before so away-from-field passive income still works.
      if (room > 0 && (onRock || g.sectorId !== curSector)) {
        const mined = Math.min((def.mineRate || 0) * (g.count || 1) * dt, room);
        g.buffer = (g.buffer || 0) + mined;
      }

      if (this._burnOperatingFuel(g, def, dt)) continue;
      g.status = (g.buffer || 0) >= cap - 1e-6 ? 'idle' : 'mining';
      g.ratePerMin = this._droneRatePerMin(g, def);
    }
  },

  // Run a drone group's alphabet program (V2 §4 / cut-list #28). Provides the callbacks the
  // alphabet runtime needs: steerTo, mineIntoCargo (operation shipment), sellMinedCargo (credits
  // via the passive funnel from that shipment only). Mines the same authored rate as the legacy
  // path. The player hold is never a worker's inventory.
  _runProgrammedGroup(g, def, dt, curSector) {
    // ensure entities exist (same spawn as legacy)
    if ((!g.entityIds || !g.entityIds.length) && g.sectorId === curSector) this._spawnDroneEntities(g, def);
    ensureAutomationRuntime(this);
    const ctx = this._programCtx;
    ctx.state = this.state;
    ctx.helpers = this.helpers;
    ctx.group = g;
    ctx.def = def;
    ctx.curSector = curSector;
    ctx.diagnostics = this._diag;
    tickProgram(g, ctx, dt);
    this._syncProgrammedOperation(g, def, curSector);
  },

  // Steer every live entity in the group toward a beacon; returns true when the lead entity is
  // "at" the beacon (within arrival range). Reuses the legacy _driveDrone steering.
  _steerGroupTo(g, def, beacon, dt, curSector) {
    if (!beacon || g.sectorId !== curSector || !g.entityIds || !g.entityIds.length) return false;
    const getEnt = (this.helpers && this.helpers.getEntity) || ((id) => this.state.entities.get(id));
    const target = { x: beacon.x, z: beacon.z };
    let lead = null;
    for (const id of g.entityIds) {
      const e = getEnt(id);
      if (!e || !e.alive) continue;
      lead = e;
      this._driveDrone(e, target, dt, false);
    }
    if (!lead) return false;
    // arrival threshold scales with target type (rocks need a standoff; stations/depot closer)
    const arriveR = beacon.entity && beacon.entity.type === 'asteroid'
      ? (beacon.entity.radius || 6) + 14 + 34   // standoff + mine range
      : 60;
    const dx = lead.pos.x - target.x, dz = lead.pos.z - target.z;
    return (dx * dx + dz * dz) < arriveR * arriveR;
  },

  // Mine into the OPERATION shipment at the authored rate (capped by the group's buffer).
  // Whole units only enter the shipment; sub-unit progress lives on a per-group carry.
  _programMineIntoCargo(g, def, dt) {
    ensureShipment(g);
    const cap = Math.max(0, Number(g.bufferCap || def.bufferCap) || 0) || 40;
    const rate = Math.max(0, (def.mineRate || 0.8) * Math.max(1, Number(g.count) || 1));
    g._programMineCarry = (Number(g._programMineCarry) || 0) + rate * Math.max(0, Number(dt) || 0);
    const want = Math.floor(g._programMineCarry + 1e-9);
    if (want <= 0) return;
    const oreId = g.oreType || DRONE_ORE_ID;
    const added = addToShipment(g, oreId, want, cap);
    if (added > 0) {
      g._programMineCarry = Math.max(0, g._programMineCarry - added);
      recordGrossUnits(g, added);
      const rock = this._nearestAsteroid(this._playerPos(), 600);
      this.bus.emit('mining:tick', { contactPos: rock ? rock.pos : this._playerPos(), oreType: oreId });
      return;
    }
    g._programMineCarry = Math.min(g._programMineCarry, 1);
  },

  // Sell the operation shipment at the depot. Never reads or writes the player hold.
  // Station price is quoted at this call. A pending intent survives save/reload so a retry
  // returns the same receipt instead of paying twice.
  _programSellCargo(g, stationId) {
    ensureShipment(g);
    const oreId = g.oreType || DRONE_ORE_ID;
    let pending = g.pendingSale;
    if (pending && pending.intentId && g.saleReceipts && g.saleReceipts[pending.intentId]) {
      const sealed = g.saleReceipts[pending.intentId];
      g.pendingSale = null;
      g._lastSaleBlock = null;
      return { ok: true, duplicate: true, receipt: sealed.receipt };
    }
    const have = shipmentQty(g, oreId);
    if (have <= 0) {
      g.pendingSale = null;
      g._lastSaleBlock = null;
      return null;
    }
    const dest = (pending && pending.stationId) || stationId || null;
    if (!dest) {
      g._lastSaleBlock = 'blocked_lane';
      return { ok: false, reason: 'blocked_lane' };
    }
    if (!pending || pending.good !== oreId || !(pending.quantity > 0)) {
      g.saleSeq = (g.saleSeq | 0) + 1;
      pending = g.pendingSale = {
        intentId: `drone-sale:${g.id}:${g.saleSeq}`,
        stationId: dest,
        good: oreId,
        quantity: have,
      };
    }
    const quote = this._quoteOperationSale(pending.stationId || dest, pending.good, Math.min(pending.quantity | 0, have));
    const qty = boundDemandQty(Math.min(pending.quantity | 0, have), quote);
    if (qty <= 0) {
      const reason = quote && quote.saturated ? 'demand_saturation' : 'poor_destination';
      g._lastSaleBlock = reason;
      return { ok: false, reason };
    }
    pending.quantity = qty;
    pending.stationId = pending.stationId || dest;
    const plan = {
      intentId: pending.intentId,
      stationId: pending.stationId,
      good: pending.good,
      quantity: qty,
      unitPrice: quote.unitAvg,
      total: quote.unitAvg * qty,
      quoteVersion: quote.quoteVersion,
    };
    const result = commitShipmentSale(g, plan, () => this.creditPassive(plan.total, 'drone:program'));
    if (result && result.ok && !result.duplicate) {
      g._lastSaleBlock = null;
      const def = DRONE_BY_ID.get(g.defId) || g;
      recordRealisedSale(g, {
        stationId: plan.stationId,
        quantity: plan.quantity,
        unitPrice: plan.unitPrice,
        credited: result.receipt && result.receipt.credited,
        operatingCostPerMin: operatingCostPerMin(def.upkeepPerMin, 'running'),
      });
      if (plan.stationId) {
        this.bus.emit('economy:applyTradePressure', {
          stationId: plan.stationId,
          good: plan.good,
          vol: plan.quantity,
        });
      }
    }
    return result;
  },

  _quoteOperationSale(stationId, commodityId, qty) {
    const quantity = Math.max(0, Math.floor(Number(qty) || 0));
    if (!stationId || quantity <= 0) {
      return { unitAvg: 0, total: 0, quoteVersion: 0, fillable: 0, saturated: true };
    }
    const econ = this._economy();
    if (econ && typeof econ.quote === 'function') {
      const q = econ.quote(stationId, commodityId, 'sell', quantity);
      if (q && q.ok) {
        const unit = Math.max(0, Math.round(Number(q.unitAvg) || 0));
        return {
          unitAvg: unit,
          total: Math.max(0, Math.round(Number(q.total != null ? q.total : unit * quantity) || 0)),
          quoteVersion: unit,
          fillable: unit > 0 ? quantity : 0,
          saturated: unit <= 0,
        };
      }
    }
    const unitFromStation = this._stationPrice(stationId, commodityId, 'sell', quantity);
    const unit = Math.max(0, Math.round(Number(unitFromStation) || 0));
    return {
      unitAvg: unit,
      total: unit * quantity,
      quoteVersion: unit,
      fillable: unit > 0 ? quantity : 0,
      saturated: unit <= 0,
    };
  },


  // Spawn the visible flying drones for a freshly deployed group near the nearest asteroid field.
  // Best-effort: needs the core spawnEntity helper and the group's home sector loaded.
  // Continuous handoff must never stack a second wave on an already-live group (M2-C1).
  _spawnDroneEntities(g, def) {
    const spawn = this.helpers && this.helpers.spawnEntity;
    if (!spawn) return;
    if (this._hasLiveDroneEntities(g)) return;
    const count = Math.max(1, g.count || 1);
    const origin = this._droneFieldOrigin(g, def);
    g.entityIds = g.entityIds || [];
    for (let k = 0; k < count; k++) {
      // fan the drones out around the field origin so they don't stack on one point
      const ang = (k / count) * Math.PI * 2;
      const pos = { x: origin.x + Math.cos(ang) * DRONE_SPREAD, z: origin.z + Math.sin(ang) * DRONE_SPREAD };
      // collides:false on purpose — physics' pickup branch treats any colliding type:'drone' as a
      // collector and would silently vacuum (and destroy) the player's loose ore pickups with a
      // non-player collectorId. These drones are steered manually to a standoff, so they need no
      // physical collision; their group-level durability is the attention cost (fuel/distress).
      const ent = spawn({
        type: 'drone', team: 0, factionId: 'faction_player',
        pos, rot: ang,
        radius: DRONE_ENTITY_RADIUS, mass: 6, collides: false,
        hull: def.durabilityMax || 40, hullMax: def.durabilityMax || 40,
        maxSpeed: DRONE_SPEED, drag: 1.4,
        data: { kind: 'mining_drone', groupId: g.id, targetAstId: null },
      });
      if (ent) g.entityIds.push(ent.id);
    }
  },

  // Where the group's drones congregate: the nearest live asteroid (field) to the deploy point,
  // else the player's position (deploy-range anchor), else the stored origin.
  _droneFieldOrigin(g, def) {
    const anchor = g.originPos || this._playerPos() || { x: 0, z: 0 };
    const rock = this._nearestAsteroid(anchor, (def && def.deployRange) || 400);
    if (rock) return { x: rock.pos.x, z: rock.pos.z };
    return { x: anchor.x, z: anchor.z };
  },

  // Steer each live drone entity toward the nearest live asteroid and chip ore when in range.
  // Returns true if at least one drone is currently on a rock (so the group should accrue).
  _steerDroneEntities(g, def, dt, wantOre) {
    if (!g.entityIds || !g.entityIds.length) { this._spawnDroneEntities(g, def); }
    if (!g.entityIds || !g.entityIds.length) return false;
    const getEnt = (this.helpers && this.helpers.getEntity) || ((id) => this.state.entities.get(id));
    let anyOnRock = false;
    const alive = [];
    for (const id of g.entityIds) {
      const e = getEnt(id);
      if (!e || !e.alive) continue;     // lost (combat/despawn) — pruned from the group
      alive.push(id);

      // (re)acquire the nearest live asteroid within the deploy range of the drone itself.
      let ast = e.data && e.data.targetAstId != null ? getEnt(e.data.targetAstId) : null;
      if (!ast || !ast.alive || ast.type !== 'asteroid' || (ast.data && ast.data.respawnAt != null)) {
        ast = this._nearestAsteroid(e.pos, ((def && def.deployRange) || 400) * 1.6);
        e.data.targetAstId = ast ? ast.id : null;
      }

      if (!ast) { this._driveDrone(e, e.pos, dt, true); continue; } // no rock: drift/idle in place

      const dx = ast.pos.x - e.pos.x, dz = ast.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      const standoff = (ast.radius || 6) + DRONE_ORBIT_GAP;
      if (dist > standoff + DRONE_MINE_RANGE) {
        // cruise toward a standoff point just off the rock surface
        const tx = ast.pos.x - (dx / dist) * standoff, tz = ast.pos.z - (dz / dist) * standoff;
        this._driveDrone(e, { x: tx, z: tz }, dt, false);
      } else {
        // in range: face the rock, ease to a hover, and chip ore into the shared buffer.
        e.rot = Math.atan2(dz, dx); e.angVel = 0;
        e.vel.x *= Math.max(0, 1 - DRONE_ACCEL * dt);
        e.vel.z *= Math.max(0, 1 - DRONE_ACCEL * dt);
        anyOnRock = true;
        if (wantOre) this._chipAsteroid(ast, def, dt);
      }
    }
    if (alive.length !== g.entityIds.length) g.entityIds = alive;
    return anyOnRock;
  },

  // Move a drone entity toward a world point by easing its velocity (physics integrates position;
  // renderer rotates by -rot, so point the nose, +X, along travel).
  _driveDrone(e, target, dt, brake) {
    const dx = target.x - e.pos.x, dz = target.z - e.pos.z;
    const d = Math.hypot(dx, dz) || 1e-4;
    const want = brake ? 0 : DRONE_SPEED;
    const vx = (dx / d) * want, vz = (dz / d) * want;
    const k = Math.min(1, DRONE_ACCEL * dt);
    e.vel.x += (vx - e.vel.x) * k;
    e.vel.z += (vz - e.vel.z) * k;
    const sp = Math.hypot(e.vel.x, e.vel.z);
    if (sp > DRONE_SPEED) { const s = DRONE_SPEED / sp; e.vel.x *= s; e.vel.z *= s; }
    if (sp > 1) { e.rot = Math.atan2(e.vel.z, e.vel.x); e.angVel = 0; }
  },

  // Inline mining: shave ore-HP off the rock and emit a mining-style yield pulse (cosmetic/feedback).
  // Sim-affecting yield is the group's authored buffer accrual (kept in _updateDrones), so this only
  // depletes the field + drives VFX — it never double-credits ore. Deterministic (no RNG draw here).
  _chipAsteroid(ast, def, dt) {
    const d = ast.data || (ast.data = {});
    const hpMax = d.oreHPMax || d.oreHP || ast.hullMax || 1;
    if (d.oreHPMax == null) d.oreHPMax = hpMax;
    if (d.oreHP == null) d.oreHP = (ast.hull != null && ast.hull > 0) ? ast.hull : hpMax;
    const dps = (def.mineRate || 0.8) * 14; // chip speed ~ proportional to the drone's mine rate
    const before = d.oreHP;
    d.oreHP = Math.max(0, d.oreHP - dps * dt);
    ast.hull = d.oreHP;
    if (d.oreHP < before) {
      this.bus.emit('mining:tick', { contactPos: { x: ast.pos.x, z: ast.pos.z }, oreType: DRONE_ORE_ID });
    }
    if (d.oreHP <= 0 && ast.alive) {
      const respawn = (d.respawnSec != null ? d.respawnSec : 120);
      d.respawnAt = (this.state.simTime || 0) + respawn; // world repopulates
      ast.alive = false;
      this.bus.emit('asteroid:destroyed', { id: ast.id, typeId: d.typeId || null, pos: { x: ast.pos.x, z: ast.pos.z } });
    }
  },

  _nearestAsteroid(pos, range) {
    ensureAutomationRuntime(this);
    const fallback = (this.state.entityIndex && this.state.entityIndex.asteroids) || this.state.entityList;
    if (!fallback || !pos) return null;
    const list = queryNearbyEntities(
      this.state,
      pos,
      (range || 1e9) + ASTEROID_QUERY_RADIUS_PAD,
      this._asteroidScratch,
      fallback,
    );
    if (list === this._asteroidScratch) this._diag.asteroidSpatialQueries++;
    this._diag.asteroidCandidates += list.length;
    let best = null, bestD2 = (range || 1e9) * (range || 1e9);
    for (const e of list) {
      if (!e.alive || e.type !== 'asteroid') continue;
      if (e.data && e.data.respawnAt != null) continue; // mined-out
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = e; }
    }
    return best;
  },

  _playerPos() {
    const p = (this.helpers && this.helpers.player && this.helpers.player())
      || (this.state.entities && this.state.entities.get(this.state.playerId));
    return p ? { x: p.pos.x, z: p.pos.z } : null;
  },

  // True when the group still owns at least one live flying drone entity. Continuous handoff
  // uses this to distinguish soft membership (keep task/route/identity) from abstract unload.
  _hasLiveDroneEntities(g) {
    if (!g || !g.entityIds || !g.entityIds.length) return false;
    const getEnt = (this.helpers && this.helpers.getEntity) || ((id) => this.state.entities.get(id));
    const alive = [];
    for (const id of g.entityIds) {
      const e = getEnt(id);
      if (e && e.alive) alive.push(id);
    }
    if (alive.length !== g.entityIds.length) g.entityIds = alive;
    return alive.length > 0;
  },

  // Despawn a group's flying drones (recall / loss / hard sector exit). Marks entities dead (swept
  // end-of-step) and clears the id list so a later re-entry re-spawns them. Continuous free-flight
  // membership must not call this solely because sectorId lagged (M2-C1).
  _releaseDroneEntities(g) {
    if (!g || !g.entityIds || !g.entityIds.length) return;
    const getEnt = (this.helpers && this.helpers.getEntity) || ((id) => this.state.entities.get(id));
    for (const id of g.entityIds) { const e = getEnt(id); if (e) e.alive = false; }
    g.entityIds = [];
  },

  _updateOffscreenNetwork(dt, a) {
    a.accumulators = a.accumulators || {};
    a.accumulators.offscreenNetworkS = Math.max(0,
      (Number(a.accumulators.offscreenNetworkS) || 0) + dt);
    while (a.accumulators.offscreenNetworkS + 1e-9 >= OFFSCREEN_NETWORK_INTERVAL_S) {
      a.accumulators.offscreenNetworkS -= OFFSCREEN_NETWORK_INTERVAL_S;
      this._settleOffscreenNetwork(OFFSCREEN_NETWORK_INTERVAL_S, a);
    }
  },

  _flushOffscreenNetworkBeforeSectorTransition(exitingSectorId = null) {
    const a = this.state.automation;
    if (!a) return;
    a.accumulators = a.accumulators || {};
    const pending = Math.max(0, Number(a.accumulators.offscreenNetworkS) || 0);
    if (pending > 1e-9) {
      this._settleOffscreenNetwork(pending, a, exitingSectorId || undefined);
    }
    a.accumulators.offscreenNetworkS = 0;
  },

  _settleOffscreenNetwork(elapsed, a, currentSectorIdOverride = undefined) {
    const currentSectorId = currentSectorIdOverride !== undefined
      ? currentSectorIdOverride
      : (this.state.world && this.state.world.currentSectorId || null);

    // Aggregate extraction into a temporary streaming supply. Production consumes it before the
    // physical drone buffer cap is applied, matching what repeated live ticks would deliver.
    const strandFuel = (g) => {
      this._strandForFuel(g, DRONE_BY_ID.get(g.defId) || g, { toast: false });
    };
    const exhaustedBeforeWork = [];
    const exhaustedAfterWork = [];
    for (let i = a.drones.length - 1; i >= 0; i--) {
      const g = a.drones[i];
      if (!g || g.sectorId === currentSectorId || g.status === 'distressed') continue;
      if (isFuelStranded(g)) {
        strandFuel(g);
        continue;
      }
      const def = DRONE_BY_ID.get(g.defId) || g;
      g.oreType = g.oreType || DRONE_ORE_ID;
      // Alphabet steps resolve live beacons, steer rendered entities, and may touch the current
      // player's cargo. None of those are valid proxies for a remote sector. Keep the assignment
      // intact and park it until the logistics phase provides a program-aware averaged route model.
      if (g.program && TEMPLATES[g.program.templateId]) {
        g.status = 'program';
        continue;
      }
      const fuelRate = Math.max(0, Number(def.fuelRate) || 0);
      const activeSec = fuelRate > 0
        ? Math.min(elapsed, Math.max(0, Number(g.fuel) || 0) / fuelRate)
        : elapsed;

      g.buffer = Math.max(0, Number(g.buffer) || 0)
        + Math.max(0, Number(def.mineRate) || 0) * Math.max(1, Number(g.count) || 1) * activeSec;
      g.ratePerMin = this._droneRatePerMin(g, def);

      g.fuel = Math.max(0, (Number(g.fuel) || 0) - fuelRate * activeSec);
      if (g.fuel <= 0) {
        (activeSec > 1e-9 ? exhaustedAfterWork : exhaustedBeforeWork).push(g);
      }
    }

    // A group with no operating time waits in place; its hold is not a refinery feed.
    for (const g of exhaustedBeforeWork) strandFuel(g);

    const orderedOutposts = a.outposts
      .filter((o) => o && o.sectorId !== currentSectorId)
      .slice()
      .sort(compareStableId);
    for (const o of orderedOutposts) {
      const def = OUTPOST_BY_ID.get(o.defId) || o;
      this._advanceOutpost(o, def, elapsed, a);
    }

    // A group that worked during this cadence delivers its final fuel-bounded batch first, then
    // waits in place. Fuel shortage never deletes the purchased machine.
    for (const g of exhaustedAfterWork) strandFuel(g);

    // Only residual ore occupies the drone's physical buffer after the coarse transfer settles.
    for (const g of a.drones) {
      if (!g || g.sectorId === currentSectorId || g.status === 'distressed' || g.status === 'stranded'
        || (g.program && TEMPLATES[g.program.templateId])) continue;
      const def = DRONE_BY_ID.get(g.defId) || g;
      const cap = Math.max(0, Number(g.bufferCap || def.bufferCap) || 0);
      g.buffer = Math.min(cap, Math.max(0, Number(g.buffer) || 0));
      g.status = g.buffer >= cap - 1e-6 ? 'idle' : 'mining';
    }
  },

  // Outposts remain coarse ledger records everywhere, but materialize one authored place entity
  // while their home sector is the player's current sector.
  _syncOutpostPresence(a, { reconcile = true } = {}) {
    if (this._saveRestoring) return;
    if (!a || !Array.isArray(a.outposts)) return;
    const currentSectorId = this.state.world && this.state.world.currentSectorId || null;
    for (const o of a.outposts) {
      if (currentSectorId && o.sectorId === currentSectorId) this._spawnOutpostEntity(o, reconcile);
      else if (reconcile || o.entityId != null) this._releaseOutpostEntity(o, reconcile);
    }
  },

  _spawnOutpostEntity(o, reconcile = true) {
    if (!o) return null;
    const spawn = this.helpers && this.helpers.spawnEntity;
    if (!spawn) return null;

    this._ensureOutpostPosition(o);

    const tracked = this._getRuntimeEntity(o.entityId);
    if (tracked && tracked.alive !== false && tracked.data
      && tracked.data.automationOutpostId === o.id && !reconcile) {
      this._placeOutpostEntity(tracked, o);
      return tracked;
    }
    if (o.entityId != null) delete o.entityId;

    // Reconcile from the entity list as well as the transient id. This makes repeated enter/load
    // events idempotent and cleans up a duplicate if an earlier partial transition spawned twice.
    const live = ((this.state && this.state.entityList) || [])
      .filter((entity) => entity && entity.alive !== false
        && entity.data && entity.data.automationOutpostId === o.id);
    if (live.length) {
      const canonical = tracked && live.includes(tracked) ? tracked : live[0];
      o.entityId = canonical.id;
      this._placeOutpostEntity(canonical, o);
      for (const duplicate of live) {
        if (duplicate !== canonical) this._removeRuntimeEntity(duplicate);
      }
      return canonical;
    }

    const visual = OUTPOST_VISUAL_BY_DEF[o.defId]
      || { placeId: 'place_claim_outpost_base', claimSpecId: null };
    const entity = spawn({
      type: 'fx',
      team: 0,
      factionId: 'faction_player',
      pos: { x: Number(o.pos && o.pos.x) || 0, z: Number(o.pos && o.pos.z) || 0 },
      rot: this._outpostOrientation(o),
      radius: 24,
      mass: 1e6,
      collides: false,
      homeSectorId: o.sectorId,
      data: {
        kind: 'automation_outpost',
        automationOutpostId: o.id,
        defId: o.defId,
        sectorId: o.sectorId,
        homeSectorId: o.sectorId,
        placeId: visual.placeId,
        landmarkGlb: visual.placeId,
        claimSpecId: visual.claimSpecId,
        claimOwned: true,
      },
    });
    if (entity) o.entityId = entity.id;
    return entity || null;
  },

  _releaseOutpostEntity(o, reconcile = true) {
    if (!o) return;
    const ids = new Set();
    if (o.entityId != null) ids.add(o.entityId);
    if (reconcile) {
      for (const entity of (this.state && this.state.entityList) || []) {
        if (entity && entity.alive !== false && entity.data
          && entity.data.automationOutpostId === o.id) ids.add(entity.id);
      }
    }
    if (!ids.size) return;
    for (const id of ids) {
      const entity = this._getRuntimeEntity(id);
      if (entity) this._removeRuntimeEntity(entity);
    }
    delete o.entityId;
  },

  _getRuntimeEntity(id) {
    if (id == null) return null;
    if (this.helpers && this.helpers.getEntity) return this.helpers.getEntity(id);
    return this.state.entities && this.state.entities.get(id) || null;
  },

  _removeRuntimeEntity(entity) {
    if (!entity) return;
    if (this.helpers && this.helpers.removeEntity) this.helpers.removeEntity(entity.id);
    else entity.alive = false;
  },

  _placeOutpostEntity(entity, o) {
    if (!entity || !o || !o.pos) return;
    entity.pos = entity.pos || { x: 0, z: 0 };
    entity.pos.x = Number(o.pos.x) || 0;
    entity.pos.z = Number(o.pos.z) || 0;
  },

  _ensureOutpostPosition(o) {
    const x = Number(o && o.pos && o.pos.x);
    const z = Number(o && o.pos && o.pos.z);
    if (Number.isFinite(x) && Number.isFinite(z) && (Math.abs(x) > 1e-6 || Math.abs(z) > 1e-6)) return;
    const currentSectorId = this.state.world && this.state.world.currentSectorId || null;
    if (!currentSectorId || o.sectorId !== currentSectorId) return;
    o.pos = this._outpostDeploymentPos(o.defId, o.id);
  },

  _outpostOrientation(o) {
    const seed = this.state.meta && this.state.meta.seed || 1;
    return (hash32(seed, o.sectorId, o.id, o.defId, 'outpost-orientation') / 0xFFFFFFFF) * Math.PI * 2;
  },

  _outpostDeploymentPos(defId, outpostId) {
    const world = this.state.world || {};
    const fields = world.activeSector && world.activeSector.fields || [];
    const player = this._playerPos();
    const field = fields
      .filter((entry) => entry && entry.center
        && Number.isFinite(entry.center.x) && Number.isFinite(entry.center.z))
      .sort((left, right) => {
        if (!player) return compareStableId(left, right);
        const ld = Math.hypot(left.center.x - player.x, left.center.z - player.z);
        const rd = Math.hypot(right.center.x - player.x, right.center.z - player.z);
        return ld - rd || compareStableId(left, right);
      })[0] || null;
    const fieldNearPlayer = field && (!player
      || Math.hypot(field.center.x - player.x, field.center.z - player.z) <= 512);
    const asteroid = player ? this._nearestAsteroid(player, 800) : null;
    const anchor = (asteroid && asteroid.pos)
      || (fieldNearPlayer && field.center)
      || player
      || (field && field.center)
      || world.entryPoint
      || { x: 0, z: 0 };
    const seed = this.state.meta && this.state.meta.seed || 1;
    const angle = (hash32(seed, world.currentSectorId, outpostId, defId, 'outpost-position') / 0xFFFFFFFF) * Math.PI * 2;
    const offset = (asteroid || fieldNearPlayer) ? 88 : 112;
    return {
      x: Number(anchor.x || 0) + Math.cos(angle) * offset,
      z: Number(anchor.z || 0) + Math.sin(angle) * offset,
    };
  },

  // Distressed or fuel-stranded group: stop the drones in place (don't despawn — they resume
  // when upkeep is paid or fuel returns).
  _parkDroneEntities(g) {
    if (!g || !g.entityIds || !g.entityIds.length) return;
    const getEnt = (this.helpers && this.helpers.getEntity) || ((id) => this.state.entities.get(id));
    for (const id of g.entityIds) { const e = getEnt(id); if (e && e.alive) { e.vel.x = 0; e.vel.z = 0; } }
  },

  _burnOperatingFuel(g, def, dt) {
    if (!g || isFuelStranded(g) || g.status === 'distressed') return isFuelStranded(g);
    const rate = Math.max(0, Number(def && def.fuelRate) || 1);
    g.fuel = Math.max(0, (Number(g.fuel) || 0) - rate * Math.max(0, Number(dt) || 0));
    if (g.fuel > 0) {
      g._fuelStrandNotified = false;
      return false;
    }
    this._strandForFuel(g, def, { toast: true });
    return true;
  },

  _strandForFuel(g, def, { toast = false } = {}) {
    this._parkDroneEntities(g);
    applyFuelShortage(g);
    g.ratePerMin = 0;
    const stored = shipmentUsed(g);
    const cap = Math.max(0, Number(g.bufferCap || (def && def.bufferCap)) || 0);
    stampOperation(g, {
      fuel: 0,
      distressed: false,
      hasRock: true,
      hasDepot: true,
      shipmentUsed: stored,
      shipmentCap: cap,
      grossUnits: g.operation && g.operation.grossUnits,
      lastSale: g.operation && g.operation.lastSale,
      upkeepPerMin: 0,
    });
    if (toast && !g._fuelStrandNotified) {
      g._fuelStrandNotified = true;
      this.bus.emit('toast', {
        text: 'Drone out of fuel — waiting. The machine is still here.',
        kind: 'warn',
        ttl: 4,
      });
    }
  },

  _syncProgrammedOperation(g, def, curSector) {
    ensureShipment(g);
    const cap = Math.max(0, Number(g.bufferCap || (def && def.bufferCap)) || 0) || 40;
    const stored = shipmentUsed(g);
    const rock = this._nearestAsteroid(g.originPos || this._playerPos(), (def && def.deployRange) || 400);
    const depot = this._homeStation();
    const step = g.program && TEMPLATES[g.program.templateId]
      ? (TEMPLATES[g.program.templateId].steps[(g.programState && g.programState.pc) || 0] || {})
      : {};
    let programStep = 'mine';
    if (step.op === 'move' && step.target === 'depot') programStep = 'haul';
    else if (step.op === 'interact' || step.verb === 'sell') programStep = 'sell';
    const block = g._lastSaleBlock;
    const demandOpen = block !== 'demand_saturation';
    const quoteOk = block !== 'poor_destination';
    const hasDepot = !!depot && block !== 'blocked_lane';
    const bay = droneBayCapacityForState(this.state);
    const orePrice = this._orePrice(g.oreType || DRONE_ORE_ID);
    const grossValuePerMin = (def.mineRate || 0) * Math.max(1, Number(g.count) || 1) * 60 * (orePrice || 0);
    const op = stampOperation(g, {
      fuel: Number(g.fuel) || 0,
      distressed: g.status === 'distressed',
      hasRock: !!rock || g.sectorId !== curSector,
      hasDepot,
      shipmentUsed: stored,
      shipmentCap: cap,
      quoteOk,
      demandOpen,
      bayFull: bay.available <= 0,
      programStep,
      upkeepPerMin: def.upkeepPerMin || 0,
      grossUnits: g.operation && g.operation.grossUnits,
      lastSale: g.operation && g.operation.lastSale,
      grossValuePerMin: isFuelStranded(g) ? 0 : grossValuePerMin,
    });
    g.ratePerMin = op && op.operatingState === 'running' ? grossValuePerMin : 0;
  },

  // Buffer realized to credits only on recall (collect/bank). Display rate is the gross mine value
  // converted to cr/min (pre-cap; the header shows the headline, the cap bar shows throttling).
  _droneRatePerMin(g, def) {
    const orePrice = this._orePrice(g.oreType || DRONE_ORE_ID);
    return droneGrossCrPerMin(def, orePrice, g.count || 1);
  },

  _droneBufferValue(g) {
    const oreId = g.oreType || DRONE_ORE_ID;
    const shipped = shipmentQty(g, oreId);
    return Math.round(((g.buffer || 0) + shipped) * this._orePrice(oreId));
  },

  // ------------------------------------------------------------------------------------------
  // TRADERS — discrete cycle profit on a 2-station route, danger-scaled loss roll, self-limiting.
  // ------------------------------------------------------------------------------------------
  _updateTraders(dt, a) {
    for (let i = a.traders.length - 1; i >= 0; i--) {
      const t = a.traders[i];
      const def = TRADER_BY_ID.get(t.defId) || t;
      if (t.status === 'distressed') continue;
      if (!t.route || !t.route.from || !t.route.to) { t.status = 'idle'; t.ratePerMin = 0; continue; }

      t.cycleProgress = (t.cycleProgress || 0) + dt / (def.cycleTime || 180);
      t.status = 'enroute';

      if (t.cycleProgress >= 1) {
        t.cycleProgress -= 1;
        this._completeTraderCycle(t, def, a, i);
        if (i >= a.traders.length || a.traders[i] !== t) continue; // trader was lost
      }
      // cache a net cr/min estimate for the panel header (profit/cycle minus upkeep), cap-agnostic.
      const profit = this._estTraderProfit(t, def);
      t.lastEstProfit = profit;
      t.ratePerMin = Math.round(profit / ((def.cycleTime || 180) / 60));
    }
  },

  _completeTraderCycle(t, def, a, idx) {
    const profit = this._computeTraderProfit(t, def);
    t.lastCycleProfit = Math.round(profit);
    // hotness rises each consecutive cycle on the same route (forces re-routing — the management cost)
    t.hotness = clamp((t.hotness || 0) + HOTNESS_GAIN, 0, 1);

    if (profit > 0) {
      this.creditPassive(profit, 'trader');
      // self-limit: each cycle pushes prices so the next spread shrinks (§ spec).
      this._applyTradePressure(t);
    }
    this.bus.emit('automation:traderCycleCompleted', {
      kind: 'trader', id: t.id, defId: t.defId,
    });

    // danger-scaled loss roll
    const pLoss = this._traderLossProb(t, def, a);
    if (this._rng() < pLoss) {
      const value = def.hireCost || 0;
      a.traders.splice(idx, 1);
      this._loseAsset('trader', t, value, this._routeSectorId(t));
      // spawn a pirate encounter flag in the route sector (composes with combat/spawn).
      this.bus.emit('spawn:request', {
        entityType: 'pirate', sectorId: this._routeSectorId(t),
        position: null, tags: ['ambush', 'trader_kill'], refId: t.id,
      });
    }
  },

  // profit = cargoVol * max(0, sellB - buyA) * tradeEff - routeFuelCost  (spec Formula).
  _computeTraderProfit(t, def) {
    const good = t.route.good || DRONE_ORE_ID;
    const buyA = this._stationPrice(t.route.from, good, 'buy', def.cargoVol);
    const sellB = this._stationPrice(t.route.to, good, 'sell', def.cargoVol);
    // hotness collapses the realized spread (route fatigue), on top of the economy's price move.
    return traderProfitPerCycle(def, buyA, sellB, { hotness: t.hotness || 0, routeFuelCost: this._routeFuelCost(t) });
  },

  // cheap pre-roll estimate for the header (no qty-impact integral, just last prices).
  _estTraderProfit(t, def) {
    const econ = this._economy();
    const good = t.route.good || DRONE_ORE_ID;
    const buyA = econ ? (econ.priceOf(t.route.from, good, 'buy') || 0) : 0;
    const sellB = econ ? (econ.priceOf(t.route.to, good, 'sell') || 0) : 0;
    return traderProfitPerCycle(def, buyA, sellB, { hotness: t.hotness || 0, routeFuelCost: this._routeFuelCost(t) });
  },

  _routeFuelCost(t) {
    const dist = this._routeDistWu(t);
    return dist * ROUTE_FUEL_PER_WU;
  },

  _routeDistWu(t) {
    const ia = STATION_SECTOR.get(t.route.from), ib = STATION_SECTOR.get(t.route.to);
    if (!ia || !ib || !ia.position || !ib.position) return 1 * SECTOR_POS_TO_WU;
    const dx = (ia.position.x - ib.position.x), dy = (ia.position.y - ib.position.y);
    return (Math.hypot(dx, dy) || 1) * SECTOR_POS_TO_WU;
  },

  // pLoss = clamp(baseLoss * dangerMult * hotnessMult * speedMult / guardMult, 0, 0.35).
  // speedMult: a faster hauler (lower cycleTime) outruns danger — per-encounter survival advantage
  // (V2 §33 "faster ship means less chance of damage"). Derived relative to the slowest trader so the
  // fastest hauler (180s) gets ~40% reduction and the slowest (320s) gets none.
  _traderLossProb(t, def, a) {
    const danger = this._routeDanger(t);
    const dangerMult = 1 + danger * 2;
    const hotnessMult = 1 + (t.hotness || 0);
    const guardMult = 1 + 0.5 * this._guardCountFor('trader', t.id, a);
    const cycleTime = (def && def.cycleTime) || 320;
    const speedMult = clamp((320 - cycleTime) / 320 * 0.4, 0, 0.4);   // 0..0.4 reduction
    return clamp((def.baseLossPerCycle || 0.02) * dangerMult * hotnessMult * (1 - speedMult) / guardMult, 0, TRADER_LOSS_CAP);
  },

  _routeDanger(t) {
    const sid = this._routeSectorId(t);
    // Prefer the sectorSim danger resolver (drifted security) when available so live trader-loss
    // rolls reflect the current world state, not just the static catalog. Falls back to static
    // dangerIndex when sectorSim isn't present (e.g. unit tests, pre-init).
    if (this._dangerResolver) {
      try { const d = this._dangerResolver(sid); if (typeof d === 'number') return d; } catch (_) { /* fall through */ }
    }
    const sec = SECTOR_BY_ID.get(sid);
    return sec ? dangerIndex(sec) : 0.1;
  },

  _routeSectorId(t) {
    const info = STATION_SECTOR.get(t.route && t.route.to);
    return info ? info.sectorId : (this.state.world && this.state.world.currentSectorId) || 'sector_helios_prime';
  },

  _applyTradePressure(t) {
    const good = t.route.good || DRONE_ORE_ID;
    const vol = TRADER_BY_ID.get(t.defId) ? TRADER_BY_ID.get(t.defId).cargoVol : (t.cargoVol || 80);
    // buy depletes A's stock (vol negative), sell floods B's stock (vol positive) — economy moves both.
    this.bus.emit('economy:applyTradePressure', { stationId: t.route.from, good, vol: -vol });
    this.bus.emit('economy:applyTradePressure', { stationId: t.route.to, good, vol: +vol });
  },

  // ------------------------------------------------------------------------------------------
  // OUTPOSTS — continuous production into capped storage; periodic autosell + raid roll.
  // ------------------------------------------------------------------------------------------
  _updateOutposts(dt, a) {
    if (!a.outposts.length) return;
    const currentSectorId = this.state.world && this.state.world.currentSectorId || null;
    // Stable id order makes shared-feed allocation reproducible even if a save or UI reorders rows.
    const ordered = a.outposts
      .filter((o) => o && o.sectorId === currentSectorId)
      .slice()
      .sort(compareStableId);
    for (const o of ordered) {
      const def = OUTPOST_BY_ID.get(o.defId) || o;
      this._advanceOutpost(o, def, dt, a);
    }

    // periodic autosell (every 60s) — banks the surplus through the capped funnel.
    this._outpostSellAccum += dt;
    while (this._outpostSellAccum >= OUTPOST_AUTOSELL_INTERVAL_S) {
      this._outpostSellAccum -= OUTPOST_AUTOSELL_INTERVAL_S;
      this._outpostAutosell(a);
    }
    // periodic raid roll (every 600s).
    this._outpostRaidAccum += dt;
    while (this._outpostRaidAccum >= OUTPOST_RAID_INTERVAL_S) {
      this._outpostRaidAccum -= OUTPOST_RAID_INTERVAL_S;
      this._outpostRaids(a);
    }
  },

  _outpostRatePerMin(o, def, outRate) {
    // Hab/trade hub generates credits directly; production outposts bank goods at the local price -20%.
    return outpostGrossCrPerMin(def, (goodId) => this._orePrice(goodId), { outRate, level: o.level || 1 });
  },

  _advanceOutpost(o, def, dt, a) {
    if (o.status === 'distressed') return null;
    if (o.status === 'raided') {
      const blockedS = Math.min(Math.max(0, dt), Math.max(0, Number(o.raidCooldown) || 0));
      o.raidCooldown = Math.max(0, (Number(o.raidCooldown) || 0) - blockedS);
      if (o.raidCooldown > 0) return null;
      o.status = 'producing';
      const productiveS = Math.max(0, dt - blockedS);
      return productiveS > 1e-9 ? this._produceOutpost(o, def, productiveS, a) : null;
    }
    return this._produceOutpost(o, def, dt, a);
  },

  _produceOutpost(o, def, dt, a) {
    const level = o.level || 1;
    const authoredRate = (def.outRate || 0) * Math.pow(1.6, level - 1);
    const cap = (def.storageCap || 0) * Math.pow(1.7, level - 1);
    const room = Math.max(0, cap - (o.storage || 0));
    const recipe = def.recipe || o.recipe || null;
    const availableByGood = this._availableOutpostInputs(o, recipe, a);
    const requestedOutput = Math.max(0, authoredRate * dt);
    const plan = planOutpostProduction({ recipe, requestedOutput, storageRoom: room, availableByGood });

    this._consumeOutpostInputs(o, plan.consumedByGood, a);
    o.storage = Math.min(cap, Math.max(0, (o.storage || 0) + plan.produced));
    o.storageCap = cap;
    o.status = plan.status === 'storage_full' ? 'storage_full' : plan.status;
    const actualRate = dt > 0 ? plan.produced / dt : 0;
    o.ratePerMin = this._outpostRatePerMin(o, def, actualRate);
    o.production = {
      status: o.status,
      outputGoodId: recipe && recipe.passive ? 'credits' : outpostOutputGoodId(def),
      requestedRate: authoredRate,
      actualRate,
      consumedByGood: plan.consumedByGood,
      missingByGood: plan.missingByGood,
      limitingGoodId: plan.limitingGoodId,
      localFeeders: (a.drones || []).filter((g) => (
        g && g.sectorId === o.sectorId && g.status !== 'distressed'
        && g.status !== 'stranded'
        && !(g.program && TEMPLATES[g.program.templateId])
      )).length,
    };
    return plan;
  },

  _outpostFeedGroups(o, goodId, a) {
    return (a.drones || [])
      .filter((g) => (
        g
        && g.sectorId === o.sectorId
        && g.status !== 'distressed'
        && g.status !== 'stranded'
        && !(g.program && TEMPLATES[g.program.templateId])
        && (goodId == null || (g.oreType || DRONE_ORE_ID) === goodId)
        && (g.buffer || 0) > 0
      ))
      .sort(compareStableId);
  },

  _availableOutpostInputs(o, recipe, a) {
    const available = {};
    for (const goodId of Object.keys((recipe && recipe.inputs) || {}).sort()) {
      available[goodId] = this._outpostFeedGroups(o, goodId, a)
        .reduce((sum, g) => sum + Math.max(0, Number(g.buffer) || 0), 0);
    }
    return available;
  },

  _consumeOutpostInputs(o, consumedByGood, a) {
    for (const goodId of Object.keys(consumedByGood || {}).sort()) {
      let remaining = Math.max(0, Number(consumedByGood[goodId]) || 0);
      for (const g of this._outpostFeedGroups(o, goodId, a)) {
        if (!(remaining > 1e-9)) break;
        const take = Math.min(Math.max(0, Number(g.buffer) || 0), remaining);
        g.buffer = Math.max(0, (Number(g.buffer) || 0) - take);
        remaining -= take;
      }
    }
  },

  _outpostAutosell(a) {
    for (const o of a.outposts) {
      if (!o.autoSell) continue;
      if (o.status === 'distressed' || o.status === 'raided') continue;
      const def = OUTPOST_BY_ID.get(o.defId) || o;
      const sellable = o.storage || 0;
      if (sellable <= 0) continue;
      const income = outpostGrossValue(def, sellable, (goodId) => this._orePrice(goodId));
      o.storage = 0;
      if (income > 0) this.creditPassive(income, 'outpost');
    }
  },

  _outpostRaids(a) {
    for (let i = 0; i < a.outposts.length; i++) {
      const o = a.outposts[i];
      if (o.status === 'distressed') continue;
      const sec = SECTOR_BY_ID.get(o.sectorId);
      const danger = sec ? dangerIndex(sec) : 0;
      if (danger <= 0) continue;
      const def = OUTPOST_BY_ID.get(o.defId) || o;
      const level = o.level || 1;
      const defense = (def.defense || 0) + 15 * (level - 1);
      const guard = this._guardCountFor('outpost', o.id, a) > 0 ? 1.8 : 1;
      const defenseMult = (defense / 20) * guard;
      const pRaid = clamp(danger * 0.4 / (defenseMult || 1), 0, OUTPOST_RAID_CAP);
      if (this._rng() < pRaid) {
        const lossVol = (o.storage || 0) * 0.7;
        o.storage = (o.storage || 0) * 0.3;
        o.status = 'raided';
        o.raidCooldown = 300;
        this.bus.emit('automation:outpostRaided', { outpostId: o.id, sectorId: o.sectorId, lossVol: Math.round(lossVol) });
        this.bus.emit('toast', { text: `Outpost raided in ${prettySector(o.sectorId)} (-${Math.round(lossVol)} goods)`, kind: 'warn', ttl: 4 });
      }
    }
  },

  // ------------------------------------------------------------------------------------------
  // UPKEEP — sum upkeep/min, drain per tick via the accumulator; distress + repossession.
  // ------------------------------------------------------------------------------------------
  _drainUpkeep(dt, a) {
    const upkeepPerMin = this.totalUpkeepPerMin(a);
    if (upkeepPerMin <= 0) {
      // idle hotness decay for traders that completed no cycle this window.
      this._decayHotness(dt, a);
      return;
    }
    a.accumulators.upkeepDebt = (a.accumulators.upkeepDebt || 0) + (upkeepPerMin / 60) * dt;
    const credits = (this.state.player && this.state.player.credits) | 0;
    const whole = Math.floor(a.accumulators.upkeepDebt);
    if (whole >= 1) {
      if (credits >= whole) {
        a.accumulators.upkeepDebt -= whole;
        this.bus.emit('economy:chargeCredits', { amount: whole, reason: 'automation:upkeep' });
        this._undistressAll(a); // paid → assets recover
        a.meta.graceTimer = 0;
      } else {
        // can't pay: pay what we can, distress everything, start the grace timer.
        if (credits > 0) {
          a.accumulators.upkeepDebt -= credits;
          this.bus.emit('economy:chargeCredits', { amount: credits, reason: 'automation:upkeep' });
        }
        this._distressAll(a);
        a.meta.graceTimer = (a.meta.graceTimer || 0) + dt;
        const grace = (a.balance && a.balance.distressGraceSec) || 120;
        if (a.meta.graceTimer >= grace) { a.meta.graceTimer = 0; this._repossessOne(a); }
      }
    }
    this._decayHotness(dt, a);
  },

  _decayHotness(dt, a) {
    const perTick = (HOTNESS_DECAY / 60) * dt;
    for (const t of a.traders) {
      if (t.status === 'idle' || !t.route) t.hotness = Math.max(0, (t.hotness || 0) - perTick);
    }
  },

  totalUpkeepPerMin(a) {
    a = a || this.state.automation;
    let sum = 0;
    for (const g of a.drones) sum += this._upkeepOf(DRONE_BY_ID, g);
    for (const t of a.traders) sum += this._upkeepOf(TRADER_BY_ID, t);
    for (const o of a.outposts) {
      const def = OUTPOST_BY_ID.get(o.defId) || o;
      sum += (def.upkeepPerMin || 0) * Math.pow(1.5, (o.level || 1) - 1);
    }
    return sum;
  },

  _upkeepOf(map, inst) {
    if (inst && (inst.status === 'stranded' || isFuelStranded(inst))) return 0;
    const def = map.get(inst.defId);
    return (def ? def.upkeepPerMin : inst.upkeepPerMin) || 0;
  },

  _distressAll(a) {
    for (const list of [a.drones, a.traders, a.outposts]) {
      for (const x of list) {
        if (x.status !== 'distressed') { x._prevStatus = x.status; x.status = 'distressed'; this.bus.emit('automation:assetDistressed', { kind: kindOf(list, a), id: x.id }); }
      }
    }
  },

  _undistressAll(a) {
    for (const list of [a.drones, a.traders, a.outposts]) {
      for (const x of list) {
        if (x.status === 'distressed') { x.status = x._prevStatus || 'idle'; delete x._prevStatus; }
      }
    }
  },

  // Repossess one (lowest-value) distressed asset — a soft failure, never a hard wipe (spec).
  _repossessOne(a) {
    const candidates = [];
    for (const g of a.drones) candidates.push({ kind: 'drone', inst: g, val: (DRONE_BY_ID.get(g.defId) || {}).cost || 0, list: a.drones });
    for (const t of a.traders) candidates.push({ kind: 'trader', inst: t, val: (TRADER_BY_ID.get(t.defId) || {}).hireCost || 0, list: a.traders });
    for (const o of a.outposts) candidates.push({ kind: 'outpost', inst: o, val: (OUTPOST_BY_ID.get(o.defId) || {}).buildCost || 0, list: a.outposts });
    if (!candidates.length) return;
    candidates.sort((x, y) => x.val - y.val);
    const pick = candidates[0];
    const idx = pick.list.indexOf(pick.inst);
    if (pick.kind === 'outpost') this._releaseOutpostEntity(pick.inst);
    if (idx >= 0) pick.list.splice(idx, 1);
    this.bus.emit('automation:assetRepossessed', { kind: pick.kind, id: pick.inst.id });
    this.bus.emit('toast', { text: `Asset repossessed (unpaid upkeep): ${pick.kind}`, kind: 'error', ttl: 4 });
  },

  // ------------------------------------------------------------------------------------------
  // THE CAP FUNNEL — every passive credit passes through here (spec risk #1).
  // Per-minute token bucket: income up to the bucket pays full; overflow is crushed to overflowEff.
  // ------------------------------------------------------------------------------------------
  creditPassive(grossAmount, source) {
    let gross = Math.max(0, grossAmount);
    if (gross <= 0) return 0;
    if (isThroughputSettledSource(source)) return this._creditThroughput(gross, source);
    const settlement = creditPassiveFromBudget(gross, this._capBudget);
    this._capBudget = settlement.remainingBudget;
    // HARD CLAMP (not the spec's overflowEff credit): the spec's `credited = cap + (net-cap)*0.25`
    // clause is mathematically incompatible with the cap for sustained large gross — 25% of a big
    // lump dwarfs the cap and breaks the upper bound (verified: a full build credited 310/min vs a
    // 250 active rate). The spec's VERIFICATION TARGET (net/min <= passiveCapFrac*A(T), strictly
    // below active play) is the binding constraint, so overflow above the per-minute bucket is
    // dropped rather than credited. This guarantees passive net/min <= capLimit <= active at every
    // tier. (A pending-overflow reservoir was rejected: under sustained over-cap income it never
    // drains, grows unboundedly, and — being serialized in accumulators — would breach the cap in a
    // later session.)
    const credited = settlement.credited;
    if (credited <= 0) return 0;
    this.bus.emit('economy:grantCredits', { amount: credited, reason: 'automation:' + (source || 'passive') });
    this.meta().totalPassiveEarnedLifetime = (this.meta().totalPassiveEarnedLifetime || 0) + credited;
    const stats = this.state.player && this.state.player.stats;
    if (stats) stats.totalPassiveEarnedLifetime = (stats.totalPassiveEarnedLifetime || 0) + credited;
    this.bus.emit('automation:incomeCredited', { amount: credited, source: source || 'passive' });
    return credited;
  },

  _creditThroughput(grossAmount, source) {
    const credited = Math.round(Math.max(0, grossAmount || 0));
    if (credited <= 0) return 0;
    this.bus.emit('economy:grantCredits', { amount: credited, reason: 'automation:' + (source || 'throughput') });
    this.meta().totalPassiveEarnedLifetime = (this.meta().totalPassiveEarnedLifetime || 0) + credited;
    const stats = this.state.player && this.state.player.stats;
    if (stats) stats.totalPassiveEarnedLifetime = (stats.totalPassiveEarnedLifetime || 0) + credited;
    this.bus.emit('automation:incomeCredited', { amount: credited, source: source || 'throughput' });
    return credited;
  },

  passiveCapPerMin() {
    return passiveCapPerMinForTier(this.balance(), this.playerTier());
  },

  // Matches the panel's _playerTier(): clamp(droneTierCap, 1, 5) so the enforced cap == the shown cap.
  playerTier() {
    const cap = (this.state.player && this.state.player.droneTierCap) || 1;
    return clamp(Math.round(cap) || 1, 1, 5);
  },

  // ------------------------------------------------------------------------------------------
  // UI INTENT HANDLER — ui:fleetOrder {shipId, order, targetRef, kind}. The panel multiplexes
  // every action through `order`. Purchases carry targetRef=defId and shipId=null; asset orders
  // carry shipId=instanceId (or, for assignFleet, targetRef=owned-ship index).
  // ------------------------------------------------------------------------------------------
  handleOrder(p) {
    const order = p.order;
    switch (order) {
      case 'buyDrone': return this.buyDrone(p.targetRef);
      case 'recall': return this.recallDrone(p.shipId);
      case 'refuel': return this.refuelDrone(p.shipId);
      case 'hireTrader': return this.hireTrader(p.targetRef);
      case 'assignRoute': return this.reroute(p.shipId);
      case 'dismiss': return this.dismissTrader(p.shipId);
      case 'buildOutpost': return this.buildOutpost(p.targetRef);
      case 'decommission': return this.decommissionOutpost(p.shipId);
      case 'assignFleet': return this.assignFleet(p.targetRef);
      case 'orderEscort': return this.setFleetOrder(p.shipId, 'escort', p.targetRef);
      case 'orderMine': return this.setFleetOrder(p.shipId, 'mine', p.targetRef);
      case 'orderRecall': return this.setFleetOrder(p.shipId, 'idle', p.targetRef);
      // Wingman command radial (Micro-Loops): "attack my target" / "defend me". targetRef carries the
      // player's current target id (attack) so wingmen.js can point the live wing at it.
      case 'orderAttack': return this.setFleetOrder(p.shipId, 'attack', p.targetRef);
      case 'orderGuard': return this.setFleetOrder(p.shipId, 'guard', p.targetRef);
      // V2 §4 / cut-list #28: assign an alphabet template to a drone group (program it). targetRef
      // is the templateId ('mine_to_depot' | 'patrol_guard' | 'scout_report'); null/'' clears it.
      case 'assignProgram': return this.assignProgram(p.shipId, p.targetRef);
      default: return false;
    }
  },

  handleWingOrder(p) {
    const requestedOrder = String(p && p.order || '');
    const validOrder = Object.values(WING_ORDER).includes(requestedOrder);
    const meta = this.meta();
    meta.wingCommandSeq = Math.max(0, Number.isInteger(meta.wingCommandSeq) ? meta.wingCommandSeq : 0) + 1;
    const command = makeWingOrderCommand({
      order: validOrder ? requestedOrder : WING_ORDER.REGROUP,
      scope: p && p.scope,
      selectedWingmanId: p && p.selectedWingmanId,
      targetId: p && p.targetId,
      issuedTick: Number.isInteger(this.state.tick) ? this.state.tick : 0,
      sequence: meta.wingCommandSeq,
      seed: this.state.meta && this.state.meta.seed,
    });
    const fleet = (this.state.automation.fleet || []).slice()
      .sort((a, b) => String(a && a.id).localeCompare(String(b && b.id)));
    let recipients = fleet;
    if (command.scope === WING_ORDER_SCOPE.SELECTED) {
      recipients = fleet.filter((row) => row && row.id === command.selectedWingmanId);
    }
    const acceptedRecipientIds = [];
    const blockedRecipients = [];
    if (!validOrder) {
      blockedRecipients.push({ recipientId: null, reason: 'order_invalid' });
      recipients = [];
    } else if (command.scope === WING_ORDER_SCOPE.SELECTED && recipients.length === 0) {
      blockedRecipients.push({ recipientId: command.selectedWingmanId, reason: 'recipient_missing' });
    }

    const player = this.state.entities && this.state.entities.get(this.state.playerId);
    const target = command.targetId == null || !this.state.entities
      ? null : this.state.entities.get(command.targetId);
    const sectorId = this.state.world && this.state.world.currentSectorId || null;
    for (const fs of recipients) {
      const live = fs && fs._liveId != null && this.state.entities
        ? this.state.entities.get(fs._liveId) : null;
      let reason = null;
      if (!live || live.alive === false) reason = 'not_deployed';
      else if (command.order === WING_ORDER.ATTACK
        && (!target || target.alive === false || !isHostileForAI(this.state, player, target))) {
        reason = target && target.alive !== false ? 'target_not_hostile' : 'target_missing';
      }
      if (reason) {
        blockedRecipients.push({ recipientId: fs.id, reason });
        continue;
      }
      fs.wingOrder = makeRecipientWingOrder(command, {
        anchor: command.order === WING_ORDER.HOLD ? live.pos : null,
        sectorId,
      });
      fs.order = legacyFleetOrderFor(command.order);
      fs.targetRef = command.order === WING_ORDER.ATTACK
        ? { kind: 'ref', refId: command.targetId } : null;
      fs.redeployTimer = 0;
      fs.status = command.order;
      acceptedRecipientIds.push(fs.id);
    }

    const payload = Object.freeze({
      commandId: command.id,
      order: command.order,
      scope: command.scope,
      targetId: command.targetId,
      acceptedRecipientIds: Object.freeze(acceptedRecipientIds),
      blockedRecipients: Object.freeze(blockedRecipients.map((row) => Object.freeze(row))),
      text: acceptedRecipientIds.length
        ? `Executing ${command.order.toUpperCase()} ${acceptedRecipientIds.length}/${acceptedRecipientIds.length + blockedRecipients.length}`
        : `${command.order.toUpperCase()} blocked`,
    });
    if (acceptedRecipientIds.length) this.bus.emit('wingOrder:accepted', payload);
    if (blockedRecipients.length) this.bus.emit('wingOrder:blocked', payload);
    this.bus.emit('wingOrder:status', payload);
    const acknowledgement = acceptedRecipientIds.length === 0 ? 'UNABLE'
      : blockedRecipients.length ? 'PARTIAL' : command.order.toUpperCase();
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'comms', text: acknowledgement, kind: 'wingOrder', id: command.id });
    }
    return payload;
  },

  // Assign (or clear) an alphabet program on a drone group. The drone then runs the template
  // instead of the legacy mine-to-buffer loop — mining into real cargo + selling at a depot.
  assignProgram(droneId, templateId) {
    const g = this.state.automation.drones.find((x) => x.id === droneId);
    if (!g) return false;
    if (!templateId) { clearTemplate(g); this.toast('Drone program cleared (legacy mode)', 'info'); return true; }
    if (!TEMPLATES[templateId]) { this.toast('Unknown program: ' + templateId, 'error'); return false; }
    assignTemplate(g, templateId);
    this.bus.emit('automation:programAssigned', {
      kind: 'drone', id: g.id, defId: g.defId, templateId,
      sectorId: g.sectorId || null,
    });
    this.toast('Drone program: ' + TEMPLATES[templateId].name, 'success');
    return true;
  },

  // ---- DRONES ----
  buyDrone(defId) {
    const def = DRONE_BY_ID.get(defId);
    if (!def) return false;
    if (def.tier > this.playerTier()) { this.toast('Drone tier locked', 'error'); return false; }
    const bay = droneBayCapacityForState(this.state);
    if (bay.compatibleSlotCount <= 0) {
      this.toast(bay.droneControlResearched
        ? 'Switch to a hull with an L utility slot for Drone Bay L'
        : 'Research Drone Control, then switch to an L-utility hull', 'error');
      return false;
    }
    if (!bay.droneControlResearched) {
      this.toast('Research Drone Control before fitting Drone Bay L', 'error');
      return false;
    }
    if (bay.capacity <= 0) {
      this.toast('Fit a Drone Bay L on the active ship first', 'error');
      return false;
    }
    if (bay.used >= bay.capacity) {
      this.toast(`Drone Bay at capacity (${bay.used}/${bay.capacity})`, 'error');
      return false;
    }
    if (!this._charge(def.cost, 'buy:' + defId)) return false;
    const ppos = this._playerPos();
    const g = {
      id: this._allocId(), defId, count: 1, tier: def.tier,
      sectorId: (this.state.world && this.state.world.currentSectorId) || 'sector_helios_prime',
      fieldId: this._currentFieldId(), oreType: this._currentOreId(),
      originPos: ppos ? { x: ppos.x, z: ppos.z } : { x: 0, z: 0 }, // deploy-range anchor for the field seek
      buffer: 0, bufferCap: def.bufferCap, fuel: def.fuelMax, fuelMax: def.fuelMax,
      durability: def.durabilityMax, durabilityMax: def.durabilityMax,
      autoReturn: false, status: 'mining', ratePerMin: 0, entityIds: [],
    };
    this.state.automation.drones.push(g);
    this._spawnDroneEntities(g, def); // materialize the real flying drones near the nearest field
    this.bus.emit('asset:deployed', { kind: 'drone', id: g.id, defId: g.defId, sectorId: g.sectorId });
    this.toast(`Drone deployed (${prettySector(g.sectorId)})`, 'success');
    return true;
  },

  recallDrone(id) {
    const a = this.state.automation;
    const idx = a.drones.findIndex((g) => g.id === id);
    if (idx < 0) return false;
    const g = a.drones[idx];
    const value = this._droneBufferValue(g);
    if (value > 0) this.creditPassive(value, 'drone'); // bank the buffer through the cap funnel
    if (g.shipment) g.shipment.items = {};
    g.pendingSale = null;
    // refuel cost on recall (attention cost): (fuelMax - fuel)*0.5 cr
    const def = DRONE_BY_ID.get(g.defId) || g;
    const refuel = Math.round(((def.fuelMax || 0) - (g.fuel || 0)) * 0.5);
    if (refuel > 0) this._charge(refuel, 'drone:refuel');
    this._releaseDroneEntities(g); // despawn the flying drones
    a.drones.splice(idx, 1);
    this.toast(`Drone recalled (+${value} cr ore, -${refuel} cr fuel)`, 'success');
    return true;
  },

  refuelDrone(id) {
    const g = this.state.automation.drones.find((x) => x.id === id);
    if (!g) return false;
    const def = DRONE_BY_ID.get(g.defId) || g;
    const max = def.fuelMax || g.fuelMax || 0;
    const need = Math.max(0, max - (Number(g.fuel) || 0));
    if (need <= 0) return true;
    const cost = Math.round(need * 0.5);
    if (cost > 0 && !this._charge(cost, 'drone:refuel')) return false;
    resumeAfterFuel(g, max, def.upkeepPerMin || 0);
    g._fuelStrandNotified = false;
    if (g.program && TEMPLATES[g.program.templateId]) {
      this._syncProgrammedOperation(g, def, (this.state.world && this.state.world.currentSectorId) || g.sectorId);
    } else {
      g.status = (g.buffer || 0) >= (g.bufferCap || def.bufferCap || 0) - 1e-6 ? 'idle' : 'mining';
      g.ratePerMin = this._droneRatePerMin(g, def);
    }
    this.toast(`Drone refueled (-${cost} cr). Work resumes.`, 'success');
    return true;
  },

  // ---- TRADERS ----
  hireTrader(defId) {
    const def = TRADER_BY_ID.get(defId);
    if (!def) return false;
    if (!this._charge(def.hireCost, 'hire:' + defId)) return false;
    const good = this._currentOreId();
    const t = {
      id: this._allocId(), defId, tier: def.tier,
      route: this._pickRoute(), good,
      cycleProgress: 0, cycleTime: def.cycleTime, cargoVol: def.cargoVol,
      lastCycleProfit: 0, upkeepPerMin: def.upkeepPerMin, hotness: 0,
      status: 'enroute', ratePerMin: 0,
    };
    if (t.route) t.route.good = good;
    this.state.automation.traders.push(t);
    this.bus.emit('asset:deployed', { kind: 'trader', id: t.id, defId: t.defId });
    this.toast(`Trader hired — route ${routeLabel(t.route)}`, 'success');
    return true;
  },

  // Re-roll the trade route (the panel "Route" button — no station picker, so we auto-pick a fresh
  // profitable pair and reset hotness, which is the in-fiction "re-route" management action).
  reroute(id) {
    const t = this.state.automation.traders.find((x) => x.id === id);
    if (!t) return false;
    t.route = this._pickRoute(t.route);
    if (t.route) t.route.good = this._currentOreId();
    t.hotness = 0;
    t.status = 'enroute';
    this.toast(`Trader re-routed — ${routeLabel(t.route)}`, 'info');
    return true;
  },

  dismissTrader(id) {
    const a = this.state.automation;
    const idx = a.traders.findIndex((x) => x.id === id);
    if (idx < 0) return false;
    a.traders.splice(idx, 1);
    this.toast('Trader dismissed', 'info');
    return true;
  },

  // Pick a 2-station A->B route: A produces our good cheaply, B consumes it dearly. Falls back to
  // any two distinct stations. Deterministic-ish (price-driven), avoids re-picking the same pair.
  _pickRoute(avoid) {
    const econ = this._economy();
    const good = this._currentOreId();
    let bestA = null, bestB = null, bestBuy = Infinity, bestSell = -Infinity;
    for (const st of ALL_STATIONS) {
      if (econ && econ.getMarket) econ.getMarket(st.id); // warm the market so a price exists
      const buy = econ ? (econ.priceOf(st.id, good, 'buy') || 0) : 0;
      const sell = econ ? (econ.priceOf(st.id, good, 'sell') || 0) : 0;
      if (buy > 0 && buy < bestBuy) { bestBuy = buy; bestA = st.id; }
      if (sell > bestSell) { bestSell = sell; bestB = st.id; }
    }
    if (!bestA || !bestB || bestA === bestB) {
      // fallback: first two distinct stations
      bestA = ALL_STATIONS[0] && ALL_STATIONS[0].id;
      bestB = (ALL_STATIONS.find((s) => s.id !== bestA) || {}).id || bestA;
    }
    if (avoid && avoid.from === bestA && avoid.to === bestB) {
      const alt = ALL_STATIONS.find((s) => s.id !== bestA && s.id !== bestB);
      if (alt) bestB = alt.id;
    }
    return { from: bestA, to: bestB, good };
  },

  // ---- OUTPOSTS ----
  buildOutpost(defId) {
    const def = OUTPOST_BY_ID.get(defId);
    if (!def) return false;
    if (!this._charge(def.buildCost, 'build:' + defId)) return false;
    const id = this._allocId();
    const o = {
      id, defId, level: 1,
      sectorId: (this.state.world && this.state.world.currentSectorId) || 'sector_helios_prime',
      pos: this._outpostDeploymentPos(defId, id), recipeId: defId,
      storage: 0, storageCap: def.storageCap, defense: def.defense,
      upkeepPerMin: def.upkeepPerMin, autoSell: true, raidCooldown: 0,
      status: 'producing', ratePerMin: 0,
    };
    this.state.automation.outposts.push(o);
    this._syncOutpostPresence(this.state.automation);
    // Enrich payload with stable defId so story/campaign sidecar can tag specialization.
    // automation remains sole outpost deployer — no second ownership system.
    this.bus.emit('asset:deployed', { kind: 'outpost', id: o.id, defId: def.id || defId });
    this.toast(`Outpost established in ${prettySector(o.sectorId)}`, 'success');
    return true;
  },

  decommissionOutpost(id) {
    const a = this.state.automation;
    const idx = a.outposts.findIndex((o) => o.id === id);
    if (idx < 0) return false;
    this._releaseOutpostEntity(a.outposts[idx]);
    a.outposts.splice(idx, 1);
    this.toast('Outpost decommissioned', 'info');
    return true;
  },

  // ---- FLEET ----
  assignFleet(ownedShipIndex) {
    const a = this.state.automation;
    const cap = this.fleetCap();
    if (a.fleet.length >= cap) { this.toast('Fleet at capacity', 'error'); return false; }
    const owned = (this.state.player && this.state.player.ownedShips) || [];
    const i = Number(ownedShipIndex);
    const ship = owned[i];
    if (!ship) return false;
    const fs = {
      id: this._allocId(), shipDefId: ship.defId, defId: ship.defId,
      name: ship.customName || null, order: 'escort', targetRef: null,
      wingOrder: normalizeLiveWingOrder({ kind: WING_ORDER.SCREEN }),
      redeployTimer: 0, hp: 1, hullPct: 1, status: 'escort',
    };
    a.fleet.push(fs);
    this.toast('Wingman assigned', 'success');
    return true;
  },

  setFleetOrder(id, order, targetRef) {
    const fs = this.state.automation.fleet.find((x) => x.id === id);
    if (!fs) return false;
    fs.order = order;
    fs.targetRef = targetRef != null ? { kind: 'ref', refId: targetRef } : null;
    fs.redeployTimer = 2; // brief redeploy delay (spec)
    fs.status = order;
    if (order === 'attack' || order === 'guard' || order === 'escort' || order === 'idle') {
      fs.wingOrder = normalizeLiveWingOrder({
        kind: order,
        targetId: order === 'attack' && targetRef != null ? targetRef : null,
      }, this.state.world && this.state.world.currentSectorId, order);
    }
    return true;
  },

  fleetCap() {
    const a = this.state.automation;
    const byTier = (a.balance && a.balance.fleetCapByTier) || AUTO_BALANCE.fleetCapByTier || [2, 3, 4, 6, 8];
    const cap = byTier[this.playerTier() - 1] || byTier[0];
    a.fleetCap = cap;
    return cap;
  },

  // Count guard-order fleet ships protecting a given asset (cuts loss/raid probability).
  // The UI/system exposes fleet orders as 'escort' with a targetRef; treat that as guarding.
  _guardCountFor(kind, assetId, a) {
    a = a || this.state.automation;
    let n = 0;
    for (const fs of a.fleet) {
      if ((fs.order === 'guard' || fs.order === 'escort') && fs.targetRef && fs.targetRef.refId == assetId) n++;
    }
    return n;
  },

  // ------------------------------------------------------------------------------------------
  // COMBAT DAMAGE TO ASSETS — drone durability / outpost/fleet hp; may trigger LOST.
  // ------------------------------------------------------------------------------------------
  onHitAsset(p) {
    const a = this.state.automation;
    const dmg = p.damage || 0;
    if (p.assetKind === 'drone') {
      const idx = a.drones.findIndex((g) => g.id === p.assetId);
      if (idx < 0) return;
      const g = a.drones[idx];
      g.durability = Math.max(0, (g.durability || 0) - dmg);
      if (g.durability <= 0) { this._releaseDroneEntities(g); this._loseAsset('drone', g, this._droneBufferValue(g), g.sectorId); a.drones.splice(idx, 1); }
    } else if (p.assetKind === 'fleet') {
      const fs = a.fleet.find((x) => x.id === p.assetId);
      if (!fs) return;
      fs.hp = Math.max(0, (fs.hp || 1) - dmg / 100);
      fs.hullPct = fs.hp;
      if (fs.hp <= 0) { const i = a.fleet.indexOf(fs); if (i >= 0) a.fleet.splice(i, 1); this._loseAsset('fleet', fs, 0, p.sectorId || (this.state.world && this.state.world.currentSectorId)); }
    }
  },

  _loseAsset(kind, inst, value, sectorId) {
    const shipDefId = kind === 'fleet'
      ? (inst.shipDefId || inst.defId || null)
      : (kind === 'trader' ? (TRADER_SHIP_DEF[inst.defId] || null) : null);
    this.meta().lostAssetsLog.push({ kind, id: inst.id, value: value || 0, t: this.state.simTime || 0 });
    this.bus.emit('automation:assetLost', {
      kind,
      id: inst.id,
      value: value || 0,
      sectorId: sectorId || null,
      shipDefId,
    });
    this.bus.emit('toast', { text: `${kind} lost${sectorId ? ' in ' + prettySector(sectorId) : ''}`, kind: 'error', ttl: 4 });
  },

  // ------------------------------------------------------------------------------------------
  // OFFLINE / AWAY CATCH-UP (spec): one coarse pass over elapsed time, capped + offlineEff-scaled.
  // Deterministic cap accounting, idempotent re-entry, grant/charge intents only, owner-safe
  // pressure (no economy:applyTradePressure — markets stay economy-owned).
  // G2: offline catch-up is deterministic. Elapsed sources (first match):
  //   1. opts.offlineElapsedSec — injected seconds
  //   2. a.meta.pendingOfflineElapsedSec — serialized / host-pre-set
  //   3. opts.nowMs + lastTickTime — test harness wall-window injection
  //   4. wall-clock Date.now() ONLY when settings.gameplay.wallClockOfflineProgress === true
  //   5. otherwise zero elapsed (sim-time stamp equality → no idle grant)
  // opts.nowMs remains injectable for tests; production lab/deterministic runs leave wall-clock OFF.
  // ------------------------------------------------------------------------------------------
  runOfflineCatchup(opts = {}) {
    const a = this.state.automation;
    if (!a) return null;
    this.meta(); // ensure meta bag
    const bal = a.balance || AUTO_BALANCE;
    const resolvedNow = resolveAutomationOfflineNow(this.state, a, opts);
    const now = resolvedNow.nowMs;
    const windowStart = (a.meta && a.meta.lastTickTime) || 0;

    // Bootstrap: no baseline yet — stamp now, no credits (fail closed).
    if (!windowStart) {
      a.meta.lastTickTime = now;
      const receipt = buildOfflineReceipt({
        windowStartMs: 0, nowMs: now, failClosed: 'no_baseline', skipped: true, skipReason: 'no_baseline',
      });
      a.meta.lastOfflineReceipt = receipt;
      this.bus.emit('automation:offlineSummary', receipt);
      return receipt;
    }

    // Idempotent re-load / double save:loaded: same window start already settled → no second grant.
    if (a.meta.lastOfflineWindowStart === windowStart) {
      const prior = a.meta.lastOfflineReceipt || buildOfflineReceipt({
        windowStartMs: windowStart, nowMs: now, skipped: true, skipReason: 'idempotent',
      });
      const receipt = buildOfflineReceipt({
        ...prior,
        windowStartMs: windowStart,
        nowMs: now,
        skipped: true,
        skipReason: 'idempotent',
        credited: 0,
        upkeepCharged: 0,
        upkeepUnpaid: 0,
        tradePressureEvents: 0,
        ownerSafePressure: true,
        grantIntentsOnly: true,
      });
      a.meta.lastOfflineReceipt = receipt;
      a.meta.lastTickTime = now;
      this.bus.emit('automation:offlineSummary', receipt);
      return receipt;
    }

    const capSec = bal.offlineCapSec != null ? bal.offlineCapSec : 14400;
    const resolved = resolveOfflineElapsed(windowStart, now, capSec);

    // Fail closed on negative/non-finite wall time; stamp clock so we don't spin.
    if (resolved.failClosed) {
      a.meta.lastTickTime = now;
      a.meta.lastOfflineWindowStart = windowStart;
      const receipt = buildOfflineReceipt({
        windowStartMs: windowStart,
        nowMs: now,
        elapsedSec: 0,
        rawElapsedSec: resolved.rawSec,
        failClosed: resolved.failClosed,
        skipped: true,
        skipReason: resolved.failClosed,
        tradePressureEvents: 0,
        ownerSafePressure: true,
        grantIntentsOnly: true,
      });
      a.meta.lastOfflineReceipt = receipt;
      this.bus.emit('automation:offlineSummary', receipt);
      return receipt;
    }

    const elapsed = resolved.elapsedSec;
    // Sub-second absence is a no-op (still mark window so double-fire is idempotent).
    if (elapsed < 1) {
      a.meta.lastTickTime = now;
      a.meta.lastOfflineWindowStart = windowStart;
      const receipt = buildOfflineReceipt({
        windowStartMs: windowStart,
        nowMs: now,
        elapsedSec: elapsed,
        rawElapsedSec: resolved.rawSec,
        elapsedCapped: resolved.capped,
        skipped: true,
        skipReason: 'elapsed_lt_1',
        offlineEff: clampOfflineEff(bal.offlineEff != null ? bal.offlineEff : 0.6),
        tradePressureEvents: 0,
        ownerSafePressure: true,
        grantIntentsOnly: true,
      });
      a.meta.lastOfflineReceipt = receipt;
      this.bus.emit('automation:offlineSummary', receipt);
      return receipt;
    }

    // Claim this window before side effects so a re-entrant call cannot double-grant.
    a.meta.lastOfflineWindowStart = windowStart;
    a.meta.lastTickTime = now;

    const offlineEff = clampOfflineEff(bal.offlineEff != null ? bal.offlineEff : 0.6);
    const passiveCapPerMin = this.passiveCapPerMin();
    // Size the cap bucket to the WHOLE elapsed window (cap/min * minutes), not one minute.
    const capBudget = offlineCapBudgetForElapsed(passiveCapPerMin, elapsed);
    this._capBudget = capBudget;

    let droneCr = 0, traderCr = 0, outpostCr = 0, cycles = 0, lost = 0;

    // Accrue upkeep from the roster that existed during the offline window, before coarse
    // settlement can retire exhausted or lost assets. Legacy drone groups pay through their
    // fuel-bounded operating lifetime; retained/programmed/distressed drones, traders, and
    // outposts pay for the whole capped window. Trader loss is intentionally settled after the
    // window, so an aggregate survival roll cannot also become an upkeep-evasion roll.
    let offlineUpkeep = 0;
    for (const g of a.drones) {
      const def = DRONE_BY_ID.get(g.defId) || g;
      const isLegacyWorker = g.status !== 'distressed'
        && !(g.program && TEMPLATES[g.program.templateId]);
      const fuelRate = Math.max(0, Number(def.fuelRate) || 0);
      const ownedSec = isLegacyWorker && fuelRate > 0
        ? Math.min(elapsed, Math.max(0, Number(g.fuel) || 0) / fuelRate)
        : elapsed;
      offlineUpkeep += this._upkeepOf(DRONE_BY_ID, g) * (ownedSec / 60);
    }
    for (const t of a.traders) {
      offlineUpkeep += this._upkeepOf(TRADER_BY_ID, t) * (elapsed / 60);
    }
    for (const o of a.outposts) {
      const def = OUTPOST_BY_ID.get(o.defId) || o;
      const perMin = (def.upkeepPerMin || 0) * Math.pow(1.5, (o.level || 1) - 1);
      offlineUpkeep += perMin * (elapsed / 60);
    }

    // Settle the abstract drone -> facility -> sale network in bounded minute slices. This is not
    // per-entity simulation: it is the same coarse node ledger used while a sector is absent. The
    // cadence matters because auto-sell frees facility storage each minute; a single four-hour
    // storage clamp would silently erase valid throughput.
    for (const g of a.drones) {
      if (g && isFuelStranded(g) && g.status !== 'distressed') {
        this._strandForFuel(g, DRONE_BY_ID.get(g.defId) || g, { toast: false });
      }
    }
    const legacyDrones = a.drones.filter((g) => (
      g
      && g.status !== 'distressed'
      && g.status !== 'stranded'
      && !isFuelStranded(g)
      && !(g.program && TEMPLATES[g.program.templateId])
    ));
    const orderedOutposts = [...a.outposts].sort(compareStableId);
    const parkOfflineDrone = ({ g, def }) => {
      this._strandForFuel(g, def, { toast: false });
      const coarseIndex = legacyDrones.indexOf(g);
      if (coarseIndex >= 0) legacyDrones.splice(coarseIndex, 1);
    };
    let networkRemainingS = elapsed;
    while (networkRemainingS > 1e-9) {
      const stepS = Math.min(OFFSCREEN_NETWORK_INTERVAL_S, networkRemainingS);

      // Keep the whole streamed supply available until local outposts consume it. The physical
      // drone buffer cap applies only to the residual after the production network settles.
      const exhaustedBeforeWork = [];
      const exhaustedAfterWork = [];
      for (const g of legacyDrones) {
        const def = DRONE_BY_ID.get(g.defId) || g;
        const fuelRate = Math.max(0, Number(def.fuelRate) || 0);
        const activeSec = fuelRate > 0
          ? Math.min(stepS, Math.max(0, Number(g.fuel) || 0) / fuelRate)
          : stepS;
        const mined = Math.max(0, Number(def.mineRate) || 0)
          * Math.max(1, Number(g.count) || 1) * activeSec;
        g.buffer = Math.max(0, Number(g.buffer) || 0) + mined;
        g.fuel = Math.max(0, (Number(g.fuel) || 0) - fuelRate * activeSec);
        if (g.fuel <= 0) {
          (activeSec > 1e-9 ? exhaustedAfterWork : exhaustedBeforeWork).push({ g, def });
        }
      }

      // A group with no active time waits with its hold; facilities do not siphon a stranded machine.
      for (const exhausted of exhaustedBeforeWork) parkOfflineDrone(exhausted);

      // Same-sector recipe consumers compete in stable ledger-id order.
      for (const o of orderedOutposts) {
        if (o.status === 'distressed') continue;
        const def = OUTPOST_BY_ID.get(o.defId) || o;
        this._advanceOutpost(o, def, stepS, a);
      }

      // Facilities take the final streamed ore, then the machine waits in place.
      for (const exhausted of exhaustedAfterWork) parkOfflineDrone(exhausted);

      // Mirror the live minute-cadence auto-sell without emitting market pressure off-screen.
      for (const o of orderedOutposts) {
        if (!o.autoSell || o.status === 'distressed' || o.status === 'raided') continue;
        const def = OUTPOST_BY_ID.get(o.defId) || o;
        const sellable = Math.max(0, Number(o.storage) || 0);
        if (sellable <= 0) continue;
        outpostCr += outpostGrossValue(def, sellable, (goodId) => this._orePrice(goodId));
        o.storage = 0;
        if (o.status === 'storage_full') o.status = 'producing';
        if (o.production && o.production.status === 'storage_full') {
          o.production.status = 'producing';
        }
      }

      networkRemainingS -= stepS;
    }

    // Realize only raw feedstock left after local production has consumed its inputs.
    for (const g of legacyDrones) {
      const def = DRONE_BY_ID.get(g.defId) || g;
      const residual = Math.min(
        Math.max(0, Number(g.bufferCap || def.bufferCap) || 0),
        Math.max(0, Number(g.buffer) || 0),
      );
      const value = residual * this._orePrice(g.oreType || DRONE_ORE_ID);
      g.buffer = 0;
      droneCr += value;
    }

    // traders: complete floor(elapsed/cycleTime) cycles with one aggregated survival roll.
    // Owner-safe pressure: do NOT emit economy:applyTradePressure offline (economy sole market writer).
    for (let i = a.traders.length - 1; i >= 0; i--) {
      const t = a.traders[i];
      const def = TRADER_BY_ID.get(t.defId) || t;
      if (!t.route || t.status === 'distressed') continue;
      const n = Math.floor(elapsed / (def.cycleTime || 180));
      if (n <= 0) continue;
      const pLoss = this._traderLossProb(t, def, a);
      const survival = Math.pow(1 - pLoss, n);
      if (this._rng() >= survival) { // aggregated loss
        a.traders.splice(i, 1);
        this._loseAsset('trader', t, def.hireCost || 0, this._routeSectorId(t));
        lost++;
        continue;
      }
      const per = this._computeTraderProfit(t, def);
      traderCr += Math.max(0, per) * n;
      cycles += n;
      // hotness rises for completed offline cycles (management cost preserved)
      t.hotness = clamp((t.hotness || 0) + HOTNESS_GAIN * Math.min(n, 8), 0, 1);
    }

    const grossCr = droneCr + traderCr + outpostCr;
    const settlement = settleOfflinePassive({ grossCr, offlineEff, capBudget });
    this._capBudget = settlement.remainingBudget;
    // creditPassive uses the residual bucket; pass pre-scaled grossOffline so offlineEff is not applied twice.
    // We emit grantCredits ourselves here (via creditPassive) with the already-capped credited amount.
    let credited = 0;
    if (settlement.credited > 0) {
      // Bypass second offlineEff: feed credited amount as a hard grant through the funnel with infinite
      // remaining? No — settlement already applied the window cap. Emit grant intent only via bus.
      this.bus.emit('economy:grantCredits', { amount: settlement.credited, reason: 'automation:offline' });
      this.meta().totalPassiveEarnedLifetime = (this.meta().totalPassiveEarnedLifetime || 0) + settlement.credited;
      const stats = this.state.player && this.state.player.stats;
      if (stats) stats.totalPassiveEarnedLifetime = (stats.totalPassiveEarnedLifetime || 0) + settlement.credited;
      this.bus.emit('automation:incomeCredited', { amount: settlement.credited, source: 'offline' });
      credited = settlement.credited;
    }

    // deduct upkeep for the elapsed window, clamped to available credits; distress unpaid remainder.
    // Read credits for affordability only — never write player.credits (economy is sole writer).
    const upkeep = Math.round(offlineUpkeep);
    const playerCredits = (this.state.player && this.state.player.credits) || 0;
    const charge = Math.min(upkeep, Math.max(0, playerCredits));
    const unpaid = upkeep - charge;
    if (charge > 0) this.bus.emit('economy:chargeCredits', { amount: charge, reason: 'automation:upkeep:offline' });
    let distressed = false;
    if (unpaid > 0) {
      this._distressAll(a);
      distressed = true;
      this.bus.emit('toast', { text: `Offline upkeep underpaid by ${unpaid} cr; assets distressed`, kind: 'warn', ttl: 4 });
    }

    const receipt = buildOfflineReceipt({
      windowStartMs: windowStart,
      nowMs: now,
      elapsedSec: elapsed,
      rawElapsedSec: resolved.rawSec,
      elapsedCapped: resolved.capped,
      failClosed: null,
      skipped: false,
      offlineEff: settlement.offlineEff,
      passiveCapPerMin,
      capBudgetCr: capBudget,
      grossCr,
      grossOfflineCr: settlement.grossOfflineCr,
      credited,
      overflowDropped: settlement.overflowDropped,
      droneCr: droneCr * settlement.offlineEff,
      traderCr: traderCr * settlement.offlineEff,
      outpostCr: outpostCr * settlement.offlineEff,
      cycles,
      lost,
      upkeep,
      upkeepCharged: charge,
      upkeepUnpaid: unpaid,
      distressed,
      tradePressureEvents: 0,
      ownerSafePressure: true,
      grantIntentsOnly: true,
    });
    a.meta.lastOfflineReceipt = receipt;
    this.bus.emit('automation:offlineSummary', receipt);

    const hrs = (elapsed / 3600).toFixed(1);
    if (credited > 0 || cycles > 0 || lost > 0 || distressed) {
      this.bus.emit('toast', {
        text: `While away (${hrs}h): +${credited} cr, ${cycles} cycles${lost ? `, ${lost} lost` : ''}`,
        kind: 'info',
        ttl: 6,
      });
    }
    return receipt;
  },

  // ------------------------------------------------------------------------------------------
  // OFFSCREEN SECTOR-SIM RISK PASS (ADR-0002 / V2 §33): sectorSim calls this once per day-tick with
  // an effective-danger resolver so trader/outpost losses in non-current sectors roll against the
  // drifted danger, not the static catalog. It owns state.automation (sole writer) and reuses the
  // existing _traderLossProb / _outpostRaid / _loseAsset machinery — no parallel loss path.
  //
  // days        = in-game days to advance
  // dangerFor   = (sectorId) => effective dangerIndex 0..1, provided by sectorSim
  // Returns the number of assets lost this pass (for telemetry).
  // ------------------------------------------------------------------------------------------
  offscreenRiskPass(days, dangerFor) {
    const a = this.state.automation;
    if (!a) return 0;
    // Install the resolver so _routeDanger (and _outpostRaids via the same hook) read drifted danger.
    const prevResolver = this._dangerResolver;
    this._dangerResolver = typeof dangerFor === 'function' ? dangerFor : null;
    let lost = 0;
    try {
      // Only assets whose route/sector is NOT the player's current sector are at offscreen risk —
      // assets in the current sector are already tick-simulated (view boundary = simulation boundary).
      const currentId = (this.state.world && this.state.world.currentSectorId) || null;

      // Traders: one aggregated survival roll over `days` worth of cycles (mirrors runOfflineCatchup).
      for (let i = a.traders.length - 1; i >= 0; i--) {
        const t = a.traders[i];
        const def = TRADER_BY_ID.get(t.defId) || t;
        if (!t.route) continue;
        const routeSector = this._routeSectorId(t);
        if (routeSector === currentId) continue;       // in-view: handled by the live tick
        const cycleTime = (def && def.cycleTime) || 180;
        const daySeconds = 600;
        const n = Math.max(1, Math.floor((days * daySeconds) / cycleTime));
        const pLoss = this._traderLossProb(t, def, a);
        const survival = Math.pow(1 - pLoss, n);
        if (this._rng() >= survival) {
          a.traders.splice(i, 1);
          this._loseAsset('trader', t, def.hireCost || 0, routeSector);
          lost++;
        }
      }

      // Outposts: a danger-driven raid roll scaled by `days` (mirrors _outpostRaids probability
      // shape but aggregated). A raided outpost loses a fraction of stored output, not the asset.
      for (const o of a.outposts) {
        if (o.sectorId === currentId) continue;        // in-view
        if (o.status === 'distressed' || o.status === 'raided') continue;
        const danger = dangerFor ? (dangerFor(o.sectorId) || 0) : 0;
        if (danger <= 0) continue;
        const def = OUTPOST_BY_ID.get(o.defId) || o;
        const level = o.level || 1;
        const defense = (def.defense || 0) + 15 * (level - 1);
        const guard = this._guardCountFor('outpost', o.id, a) > 0 ? 1.8 : 1;
        const defenseMult = (defense / 20) * guard;
        const pRaidPerDay = clamp(danger * 0.4 / (defenseMult || 1), 0, 0.5);
        const pRaid = 1 - Math.pow(1 - pRaidPerDay, days);
        if (this._rng() < pRaid) {
          // Lose ~25% of stored volume — raid, not destruction (outpost survives, status flags it).
          const lossVol = Math.floor((o.storage || 0) * 0.25);
          if (lossVol > 0) {
            o.storage = Math.max(0, (o.storage || 0) - lossVol);
            o.status = 'raided';
            o.raidCooldown = 600;                      // matches _outpostRaids cooldown
            this.bus.emit('automation:outpostRaided', { outpostId: o.id, sectorId: o.sectorId, lossVol });
          }
        }
      }
    } finally {
      this._dangerResolver = prevResolver;             // always restore (live tick keeps static danger)
    }
    return lost;
  },

  // ------------------------------------------------------------------------------------------
  // helpers / glue
  // ------------------------------------------------------------------------------------------
  balance() { return (this.state.automation && this.state.automation.balance) || AUTO_BALANCE; },
  meta() {
    const a = this.state.automation;
    if (!a.meta) {
      a.meta = {
        lastTickTime: 0, totalPassiveEarnedLifetime: 0, lostAssetsLog: [], rngSeed: 0,
        lastOfflineWindowStart: 0, lastOfflineReceipt: null,
      };
    }
    if (!a.meta.lostAssetsLog) a.meta.lostAssetsLog = [];
    if (a.meta.lastOfflineWindowStart == null) a.meta.lastOfflineWindowStart = 0;
    if (a.meta.lastOfflineReceipt === undefined) a.meta.lastOfflineReceipt = null;
    return a.meta;
  },

  _economy() { return (this._registry && this._registry.get) ? this._registry.get('economy') : null; },

  // Best-effort live price for a commodity at a station (buy=A cost, sell=B proceeds); falls back to
  // the closed-form quote, then to the nominal ore value, so a trader never silently earns 0.
  _stationPrice(stationId, commodityId, side, qty) {
    const econ = this._economy();
    if (econ) {
      if (econ.quote) {
        const q = econ.quote(stationId, commodityId, side, Math.max(1, Math.floor(qty || 1)));
        if (q && q.ok && q.unitAvg > 0) return q.unitAvg;
      }
      if (econ.priceOf) { const p = econ.priceOf(stationId, commodityId, side); if (p) return p; }
    }
    return DRONE_ORE_FALLBACK_VALUE;
  },

  // Nominal per-unit value for an ore/good (best market price at the home station, else basePrice).
  _orePrice(commodityId) {
    const econ = this._economy();
    if (econ && econ.priceOf) {
      const home = this._homeStation();
      if (home) { const p = econ.priceOf(home, commodityId, 'sell'); if (p) return p; }
    }
    return DRONE_ORE_FALLBACK_VALUE;
  },

  _homeStation() {
    const sid = (this.state.world && this.state.world.currentSectorId) || 'sector_helios_prime';
    const sec = SECTOR_BY_ID.get(sid);
    const st = sec && sec.stations && sec.stations[0];
    return st ? st.id : (ALL_STATIONS[0] && ALL_STATIONS[0].id) || null;
  },

  _currentFieldId() {
    const af = this.state.world && this.state.world.activeSector;
    const f = af && af.fields && af.fields[0];
    return f ? f.id : null;
  },

  _currentOreId() {
    const fields = this.state.world && this.state.world.activeSector && this.state.world.activeSector.fields;
    if (fields && fields.length) {
      const f = fields[0];
      const def = ASTEROID_BY_ID.get(f.type);
      if (def && def.oreTable) {
        const authoredGoods = Object.entries(def.oreTable)
          .filter(([, weight]) => Number(weight) > 0)
          .sort((left, right) => (Number(right[1]) - Number(left[1]))
            || compareStableId(left[0], right[0]));
        if (authoredGoods.length) {
          // A deployed group is the only local feed source facilities can currently consume. When
          // this field can yield an input required by a same-sector outpost, connect that authored
          // supply chain first. Otherwise retain the established metal-ore preference where one
          // exists, then fall back to the field's dominant authored commodity. This stays
          // deterministic without inventing resources absent from the field.
          const sectorId = (this.state.world && this.state.world.currentSectorId) || null;
          const requiredInputs = new Set();
          const localOutposts = ((this.state.automation && this.state.automation.outposts) || [])
            .filter((o) => o && o.sectorId === sectorId)
            .slice()
            .sort(compareStableId);
          for (const o of localOutposts) {
            const outpostDef = OUTPOST_BY_ID.get(o.defId) || o;
            const recipe = outpostDef.recipe || o.recipe;
            for (const goodId of Object.keys((recipe && recipe.inputs) || {}).sort()) {
              requiredInputs.add(goodId);
            }
          }
          const requiredGood = authoredGoods.find(([goodId]) => requiredInputs.has(goodId));
          const legacyOre = authoredGoods.find(([goodId]) => goodId.includes('_ore_'));
          return (requiredGood || legacyOre || authoredGoods[0])[0];
        }
      }
    }
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const sid = (this.state.world && this.state.world.currentSectorId) || '';
    return COMMON_ORES[hash32(seed, sid) % COMMON_ORES.length];
  },

  // charge with an affordability guard (chargeCredits clamps silently at 0 and won't report failure).
  _charge(amount, reason) {
    amount = Math.round(amount || 0);
    if (amount <= 0) return true;
    if (((this.state.player && this.state.player.credits) | 0) < amount) { this.toast('Insufficient credits', 'error'); return false; }
    this.bus.emit('economy:chargeCredits', { amount, reason: 'automation:' + reason });
    return true;
  },

  toast(text, kind) { this.bus.emit('toast', { text, kind: kind || 'info', ttl: 3 }); },

  _allocId() { return 'au_' + (this._nextId++); },

  // ---- seeded RNG (§0.5) — loss/raid rolls; deterministic + reproducible across save/offline ----
  _initRng(reset = false) {
    const state = this.state;
    const seed = (state.meta && state.meta.seed) || 1;
    if (!state.automation.meta) state.automation.meta = {};
    if (reset || !Number.isFinite(state.automation.meta.rngSeed) || (state.automation.meta.rngSeed >>> 0) === 0) {
      state.automation.meta.rngSeed = hash32(seed, 'automation');
    }
    const fn = () => this._rng();
    Object.defineProperty(fn, 'seed', { get: () => (this.state.automation && this.state.automation.meta && this.state.automation.meta.rngSeed) || 0 });
    state.automation.rng = fn;
    this.rng = fn;
  },

  _rng() {
    if (!this.state.automation) this.state.automation = makeDefaultAutomation();
    if (!this.state.automation.meta) this.state.automation.meta = {};
    return drawSeeded(this.state.automation.meta, 'rngSeed', hash32(this.state.meta && this.state.meta.seed, 'automation'));
  },

  // Heal a deserialized / partial automation tree to the full schema (§3.9).
  _normalizeAutomation(a) {
    a.drones = normalizeAutomationRecordList(a.drones, 'drone');
    // entityIds are runtime-only; a fresh load/normalize starts with none so they re-spawn in-sector.
    for (const g of a.drones) {
      g.entityIds = [];
      migrateDroneOperation(g);
    }
    a.traders = normalizeAutomationRecordList(a.traders, 'trader');
    a.outposts = normalizeAutomationRecordList(a.outposts, 'outpost');
    for (const o of a.outposts) delete o.entityId;
    a.fleet = normalizeAutomationRecordList(a.fleet, 'fleet');
    const sectorId = this.state && this.state.world && this.state.world.currentSectorId || null;
    for (const fs of a.fleet) {
      fs.wingOrder = normalizePersistedWingOrder(fs.wingOrder, sectorId, fs.order);
      fs.order = legacyFleetOrderFor(fs.wingOrder.kind);
      fs.targetRef = fs.wingOrder.kind === WING_ORDER.ATTACK && fs.wingOrder.targetId != null
        ? { kind: 'ref', refId: fs.wingOrder.targetId } : null;
    }
    if (a.fleetCap == null) a.fleetCap = 0;
    a.balance = Object.assign({}, AUTO_BALANCE, a.balance || {});
    a.accumulators = a.accumulators || { creditBuffer: 0, upkeepDebt: 0 };
    if (a.accumulators.upkeepDebt == null) a.accumulators.upkeepDebt = 0;
    if (a.accumulators.creditBuffer == null) a.accumulators.creditBuffer = 0;
    if (a.accumulators.offscreenNetworkS == null) a.accumulators.offscreenNetworkS = 0;
    a.meta = a.meta || {};
    if (a.meta.lastTickTime == null) a.meta.lastTickTime = 0;
    if (a.meta.totalPassiveEarnedLifetime == null) a.meta.totalPassiveEarnedLifetime = 0;
    if (!a.meta.lostAssetsLog) a.meta.lostAssetsLog = [];
    if (a.meta.rngSeed == null) a.meta.rngSeed = 0;
    if (a.meta.lastOfflineWindowStart == null) a.meta.lastOfflineWindowStart = 0;
    if (a.meta.lastOfflineReceipt === undefined) a.meta.lastOfflineReceipt = null;
    if (a.meta.pendingOfflineElapsedSec !== null && a.meta.pendingOfflineElapsedSec !== undefined
      && !Number.isFinite(a.meta.pendingOfflineElapsedSec)) {
      a.meta.pendingOfflineElapsedSec = null;
    }
    if (!Number.isInteger(a.meta.wingCommandSeq) || a.meta.wingCommandSeq < 0) a.meta.wingCommandSeq = 0;
  },

  // ------------------------------------------------------------------------------------------
  // newGame / save-load (§4.5 — save key 'automation', order 9)
  // ------------------------------------------------------------------------------------------
  newGame() {
    if (this.state.automation && Array.isArray(this.state.automation.outposts)) {
      for (const o of this.state.automation.outposts) this._releaseOutpostEntity(o);
    }
    this.state.automation = makeDefaultAutomation();
    this._normalizeAutomation(this.state.automation);
    this._initRng(true);
    // G2: sim-time baseline only.
    this.state.automation.meta.lastTickTime = simTimeMs(this.state);
    this._nextId = 1;
    this._capBudget = 0;
    this._outpostRaidAccum = 0;
    this._outpostSellAccum = 0;
  },

  serialize() {
    const a = this.state.automation;
    // G2: stamp lastTickTime from sim-time (never Date.now). Wall-clock idle rewards
    // require host-injected pendingOfflineElapsedSec or wallClockOfflineProgress + explicit now.
    a.meta.lastTickTime = simTimeMs(this.state);
    // entityIds are live runtime ids (don't survive save/load or sector unload) → strip them; the
    // flying drones re-spawn from the group on the next in-sector tick.
    const drones = a.drones.map((g) => { const { entityIds, ...rest } = g; return rest; });
    const outposts = a.outposts.map((o) => { const { entityId, ...rest } = o; return rest; });
    // Fleet entries carry a transient _liveId (the live wingman entity id, set by systems/wingmen.js
    // on spawn). It doesn't survive save/load (entity ids are per-session) → strip it like drone
    // entityIds so a reloaded save doesn't reference a dead/stale entity.
    const sectorId = this.state.world && this.state.world.currentSectorId || null;
    const fleet = a.fleet.map((fs) => {
      const { _liveId, ...rest } = fs;
      const wingOrder = normalizePersistedWingOrder(fs.wingOrder, sectorId, fs.order);
      return { ...rest, order: legacyFleetOrderFor(wingOrder.kind), targetRef: null, wingOrder };
    });
    return {
      drones, traders: a.traders, outposts, fleet,
      fleetCap: a.fleetCap, balance: a.balance, accumulators: a.accumulators,
      meta: {
        lastTickTime: a.meta.lastTickTime,
        totalPassiveEarnedLifetime: a.meta.totalPassiveEarnedLifetime,
        lostAssetsLog: a.meta.lostAssetsLog,
        rngSeed: a.meta.rngSeed,
        // Offline idempotency + last receipt (plain JSON — re-load must not double-grant).
        lastOfflineWindowStart: a.meta.lastOfflineWindowStart || 0,
        lastOfflineReceipt: a.meta.lastOfflineReceipt || null,
        // Explicit offline elapsed (host may set before save:loaded); never derived from Date.now.
        pendingOfflineElapsedSec: Number.isFinite(a.meta.pendingOfflineElapsedSec)
          ? a.meta.pendingOfflineElapsedSec
          : null,
        wingCommandSeq: a.meta.wingCommandSeq || 0,
      },
      nextId: this._nextId,
    };
  },

  deserialize(data) {
    if (!data) return;
    if (this.state.automation && Array.isArray(this.state.automation.outposts)) {
      for (const o of this.state.automation.outposts) this._releaseOutpostEntity(o);
    }
    const a = this.state.automation = Object.assign(makeDefaultAutomation(), data);
    this._normalizeAutomation(a);
    this._nextId = data.nextId || (a.drones.length + a.traders.length + a.outposts.length + a.fleet.length + 1);
    this._initRng(); // rebuild the rng fn from the restored rngSeed → deterministic continuation
    this._capBudget = 0;
    this._outpostRaidAccum = 0;
    this._outpostSellAccum = 0;
    // runOfflineCatchup() runs on the subsequent save:loaded event.
  },
};

// ---- module-scope helpers -----------------------------------------------------------------------
function ensureAutomationRuntime(host) {
  if (!host._asteroidScratch) host._asteroidScratch = [];
  if (!host._programCtx) host._programCtx = makeProgramContext(host);
  if (!host._diag) {
    host._diag = {
      asteroidSpatialQueries: 0,
      asteroidCandidates: 0,
      alphabetSpatialQueries: 0,
      alphabetCandidates: 0,
    };
  }
  if (host._diag.alphabetSpatialQueries == null) host._diag.alphabetSpatialQueries = 0;
  if (host._diag.alphabetCandidates == null) host._diag.alphabetCandidates = 0;
}

function resetAutomationDiagnostics(diag) {
  if (!diag) return;
  diag.asteroidSpatialQueries = 0;
  diag.asteroidCandidates = 0;
  diag.alphabetSpatialQueries = 0;
  diag.alphabetCandidates = 0;
}

function makeProgramContext(host) {
  return {
    state: null,
    helpers: null,
    group: null,
    def: null,
    curSector: null,
    diagnostics: null,
    steerTo(beacon, ddt) {
      return host._steerGroupTo(this.group, this.def, beacon, ddt, this.curSector);
    },
    mineIntoCargo(ddt) {
      return host._programMineIntoCargo(this.group, this.def, ddt);
    },
    sellMinedCargo(stationId) {
      return host._programSellCargo(this.group, stationId);
    },
    operationFull() {
      const g = this.group;
      const def = this.def || {};
      const cap = Math.max(0, Number(g.bufferCap || def.bufferCap) || 0) || 40;
      return shipmentUsed(g) >= cap - 1e-9;
    },
  };
}

function makeDefaultAutomation() {
  return {
    drones: [], traders: [], outposts: [], fleet: [],
    fleetCap: 0,
    balance: Object.assign({}, AUTO_BALANCE),
    accumulators: { creditBuffer: 0, upkeepDebt: 0 },
    meta: {
      lastTickTime: 0, totalPassiveEarnedLifetime: 0, lostAssetsLog: [], rngSeed: 0,
      lastOfflineWindowStart: 0, lastOfflineReceipt: null, pendingOfflineElapsedSec: null,
    },
  };
}

/**
 * G2: sim-time in milliseconds (same unit as historical lastTickTime wall stamps).
 * Used for authoritative tick/serialize baselines — never wall-clock.
 */
function simTimeMs(state) {
  const t = state && Number.isFinite(state.simTime) ? state.simTime : 0;
  return Math.max(0, t * 1000);
}

/**
 * Resolve "now" for offline catch-up without uncontrolled Date.now() in deterministic runs.
 * Wall-clock is gated: settings.gameplay.wallClockOfflineProgress === true (OFF by default
 * in lab/deterministic hosts). Tests inject opts.nowMs; hosts may set pendingOfflineElapsedSec.
 *
 * When offlineElapsedSec / pendingOfflineElapsedSec is provided, synthesizes a nowMs that
 * yields that elapsed against lastTickTime so resolveOfflineElapsed stays unit-compatible.
 */
function resolveAutomationOfflineNow(state, automation, opts = {}) {
  const windowStart = (automation && automation.meta && automation.meta.lastTickTime) || 0;

  // Explicit elapsed seconds (host/test) → synthesize now relative to baseline.
  if (Number.isFinite(opts.offlineElapsedSec)) {
    const elapsed = Math.max(0, opts.offlineElapsedSec);
    return { nowMs: windowStart + elapsed * 1000, source: 'opts.offlineElapsedSec' };
  }
  const pending = automation && automation.meta && automation.meta.pendingOfflineElapsedSec;
  if (Number.isFinite(pending)) {
    // Consume pending so a second save:loaded cannot double-apply.
    automation.meta.pendingOfflineElapsedSec = null;
    return { nowMs: windowStart + Math.max(0, pending) * 1000, source: 'pendingOfflineElapsedSec' };
  }
  if (Number.isFinite(opts.nowMs)) {
    return { nowMs: opts.nowMs, source: 'opts.nowMs' };
  }
  // Wall-clock idle rewards: opt-in only (production hosts may enable; lab leaves OFF).
  if (wallClockOfflineProgressEnabled(state, opts)) {
    const wall = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
    return { nowMs: wall, source: 'wall-clock' };
  }
  // Deterministic default: "now" is current sim-time → near-zero elapsed after save/load.
  return { nowMs: simTimeMs(state), source: 'simTime' };
}

/**
 * Wall-clock offline progress is OFF unless explicitly enabled.
 * Lab/deterministic runs must leave this false so two identical runs at different wall speeds
 * produce identical authoritative/save state.
 */
function wallClockOfflineProgressEnabled(state, opts = {}) {
  if (opts.wallClockOffline === true) return true;
  if (opts.wallClockOffline === false) return false;
  const gp = state && state.settings && state.settings.gameplay;
  return !!(gp && gp.wallClockOfflineProgress === true);
}

function kindOf(list, a) {
  if (list === a.drones) return 'drone';
  if (list === a.traders) return 'trader';
  if (list === a.outposts) return 'outpost';
  return 'asset';
}

function titleCaseWords(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettySector(id) {
  const sector = SECTOR_BY_ID.get(id);
  return (sector && sector.name) || titleCaseWords(String(id || '').replace(/^sector_/, ''));
}

function routeLabel(route) {
  if (!route) return 'idle';
  return `${prettyStation(route.from)} → ${prettyStation(route.to)}`;
}

function prettyStation(id) {
  const station = STATION_SECTOR.get(id);
  return (station && station.name) || titleCaseWords(String(id || '?').replace(/^station_/, ''));
}
