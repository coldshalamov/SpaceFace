// economy system — stock-based market economy + SOLE writer of state.player.credits.
// Contract: ARCHITECTURE §0.6 (single-writer credits), §0.12/§0.13 (cargo: volume is the only
// hard cap), §3.6 (economy schema), §4.4 (master event table), design/specs/03-economy-trading.md.
//
// MODEL (reconciled with the spec's worked-route shape — see "PRICING NOTE" below):
//   Each station S owns a market: cmdtyId -> MarketEntry {stock, equilibrium, baseEq, role,
//   lastMid, lastBuy, lastSell, eventMods}. Price is a pure function of (stock / baseEq):
//     mid = basePrice * clamp((stock/baseEq)^(-elasticity), 0.40, 2.60)
//   - baseEq      = pricing reference (baseEqDefault * sizeFactor). At stock==baseEq, mid==basePrice.
//   - equilibrium = stock DRIFT TARGET (role- & event-modified). Producers drift stock ABOVE baseEq
//                   (surplus -> cheap, they sell what they make); consumers drift BELOW (shortage ->
//                   dear, they buy what they need). This surplus/shortage gradient is what makes
//                   A->B routes profitable. Role factors are intentionally milder than the 1.x
//                   2.0/0.35 pair so freestyle freight cannot compound unbounded while missions
//                   and discovery routes still read as profitable.
//   Buy = mid*(1+spread/2), Sell = mid*(1-spread/2). Large trades move stock unit-by-unit (closed-
//   form integral of the price curve), so each route has a capacity sweet spot (diminishing margin).
//
//   PRICING NOTE: §3.6's literal `effectiveEq = baseEq*roleFactor*...` used as BOTH the price
//   reference AND the drift target collapses every market to basePrice (stock drifts to eq, price
//   uses eq -> ratio 1). The worked-route shape (producer cheap, consumer dear; large lots self-
//   impact) only holds when the price reference is the FIXED baseEq and the role multiplies the
//   stock target. We honor the schema field names (equilibrium = role-modified drift target,
//   baseEq = fixed reference). Absolute early ROI is now moderated for M3 career parity.
import { COMMODITIES } from '../data/commodities.js';
import { SECTORS } from '../data/sectors.js';
import { drawSeeded, hash32 } from '../core/rng.js';
import { addCargo, isUnsellableCargo, removeCargo } from './cargo.js';
import {
  getCycle as getCycleCore, cycleFactorAt, maybeAdvanceRegime, createCycle,
  serializeCycles, deserializeCycles, applyCycleToMid,
} from './economyCycles.js';
import {
  hiddenHoldCapacity,
  remainingIllicit,
  scanChance,
  hotUntilActive,
  HOT_DURATION_S,
} from '../economy/customsRisk.js';
import { allRegionalPressureRecipes } from '../economy/regionalSupply.js';
import { applyPersistentDemand, effectiveDemandFor } from '../economy/demandModel.js';
import { priceModForState } from './factions.js';

// ---- tunables (design/specs/03 "Formulas") ------------------------------------------------
// M3 courier/freight balance (2026-07): produce=2.0 / consume=0.35 at baseEq=1000 left a permanent
// ~85% freestyle margin with <1% price impact on starter-scale lots, so same-sector arbitrage
// compounded through 90 minutes (saleProceeds dominated missions). Causal levers (not Courier tax):
//   1) milder produce/consume stock targets compress structural route spreads;
//   2) moderately shallower baseEq makes freighter lots move the book (capacity sweet spot);
//   3) slightly slower drift keeps flooded/drained lanes cooler between hauls.
const BASE_EQ_DEFAULT = 720;       // was 1000; still deep enough for early hauls, thin enough for impact
const ROLE_FACTOR = { produce: 1.58, consume: 0.50, none: 0 };
const SIZE_FACTOR = { S: 0.5, M: 1, L: 2 };
const PRICE_MULT_LO = 0.40, PRICE_MULT_HI = 2.60;
const SPREAD_BASE = 0.085;         // mild house edge (was 0.08)
const SPREAD_LO = 0.04, SPREAD_HI = 0.40;
const FRONTIER_SPREAD_BONUS = 0.06; // low-wealth stations widen the spread up to +6%
const DRIFT_RATE = 0.0006;         // per-second; half-life ~19 min (was ~11.6): lanes cool between hauls
const ECON_TICK_S = 5;             // economy ticks every 5s of sim time
const EVENT_INTERVAL_S = 90;       // average seconds between spontaneous economic events (game-wide)
const EQ_MULT_CLAMP = [0.25, 4.0]; // clamp net event/propagation eq multiplier per (station,cmdty)
const MAX_EVENTS_PER_STATION = 3;
// The chart samples every 15 seconds and keeps roughly sixteen minutes. A new campaign is
// pre-seeded from the live formula, so the first dock reads like a market with a past rather than
// a blank instrument waiting for the player to stand around.
const HISTORY_SAMPLE_S = 15;
const HISTORY_POINT_LIMIT = 64;
const HISTORY_SPAN_S = HISTORY_SAMPLE_S * (HISTORY_POINT_LIMIT - 1);
const HISTORY_REGIME_AGE_MIN_S = HISTORY_SPAN_S + HISTORY_SAMPLE_S * 4;
const HISTORY_REGIME_AGE_MAX_S = HISTORY_SPAN_S + HISTORY_SAMPLE_S * 18;
const BASE_SCAN = 0.25;            // p_scan = clamp(BASE_SCAN*(1+security) - cloak, 0.02, 0.95)
const SCAN_LO = 0.02, SCAN_HI = 0.95;
const FINE_MULT = { legal: 0, restricted: 0.8, illegal: 1.2, contraband: 1.5 };
const REP_HIT_LO = 2, REP_HIT_HI = 25;
const BRIBE_FRAC = 0.30;
export const TRADE_LEDGER_MAX = 10;
const REGIONAL_PRESSURE_RECIPES = Object.freeze(
  Object.values(allRegionalPressureRecipes()).flat(),
);

export const ECONOMY_PRICE_TUNING = Object.freeze({
  baseEqDefault: BASE_EQ_DEFAULT,
  roleFactor: Object.freeze({ ...ROLE_FACTOR }),
  sizeFactor: Object.freeze({ ...SIZE_FACTOR }),
  priceMultLo: PRICE_MULT_LO,
  priceMultHi: PRICE_MULT_HI,
  spreadBase: SPREAD_BASE,
  spreadLo: SPREAD_LO,
  spreadHi: SPREAD_HI,
});

// service prices (per unit) — used by ui:service refuel/repair/ammo
const FUEL_UNIT_CR = 6;            // cr per fuel unit
const REPAIR_HP_CR = 0.9;          // cr per hull/armor point restored
const AMMO_UNIT_CR = 12;           // cr per munition
export const SERVICE_PRICES = Object.freeze({
  fuelCrPerUnit: FUEL_UNIT_CR,
  repairCrPerHp: REPAIR_HP_CR,
  ammoCrPerUnit: AMMO_UNIT_CR,
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round = Math.round;

// ---- static lookups (built once) ----------------------------------------------------------
const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

// station id -> { type, size, factionId, sectorId, tier, neighbors:[sectorId] } from the SECTORS graph.
// (world is the runtime owner of sectors, but dock:docked only hands us a stationId, so we resolve
//  the station's profile straight from the data catalog — same pattern ships/cargo use.)
const STATION_INFO = new Map();
for (const sec of SECTORS) {
  for (const st of sec.stations || []) {
    STATION_INFO.set(st.id, {
      type: st.type, size: st.size || 'M', factionId: st.factionId,
      sectorId: sec.id, tier: sec.tier || 0, neighbors: sec.neighbors || [], security: sec.security,
      marketEquilibriumFactors: st.marketEquilibriumFactors || null,
    });
  }
}

/** Resolve a station's info, preferring a runtime content.sectors registry if present. */
function stationInfo(state, stationId) {
  const reg = state && state.content && state.content.sectors;
  if (reg) {
    const list = Array.isArray(reg) ? reg : Object.values(reg);
    for (const sec of list) {
      for (const st of sec.stations || []) {
        if (st.id === stationId) {
          return { type: st.type, size: st.size || 'M', factionId: st.factionId,
                   sectorId: sec.id, tier: sec.tier || 0, neighbors: sec.neighbors || [], security: sec.security,
                   marketEquilibriumFactors: st.marketEquilibriumFactors || null };
        }
      }
    }
  }
  return STATION_INFO.get(stationId) || null;
}

function commodityDef(state, id) {
  const reg = state && state.content && state.content.commodities;
  if (reg) {
    const c = Array.isArray(reg) ? reg.find((x) => x.id === id) : reg[id];
    if (c) return c;
  }
  return CMDTY_BY_ID.get(id) || null;
}

/** A station tolerates contraband/illegal goods iff it is a blackmarket (smuggler/pirate den). */
function toleratesContraband(info) {
  return !!(info && info.type === 'blackmarket');
}

/** Role of a commodity for a station type: 'produce' if the type makes it, 'consume' if it uses
 *  it, else 'none'. produce wins ties (a station that both makes and uses a good is a net seller). */
function roleFor(def, stationType) {
  if (!def) return 'none';
  if ((def.producedBy || []).includes(stationType)) return 'produce';
  if ((def.consumedBy || []).includes(stationType)) return 'consume';
  return 'none';
}

// ---- price math ---------------------------------------------------------------------------
export function priceMult(stock, baseEq, elasticity) {
  return clamp(Math.pow(Math.max(stock, 1) / baseEq, -elasticity), PRICE_MULT_LO, PRICE_MULT_HI);
}

/** Closed-form average mid over a stock interval [sLo, sHi] (the price-impact integral).
 *  mid(s) = basePrice * baseEq^el * s^(-el); ∫ s^-el ds = s^(1-el)/(1-el).
 *  avg = basePrice*baseEq^el/((1-el)*ΔN) * (sHi^(1-el) - sLo^(1-el)); el==1 -> ln form. */
export function avgMid(basePrice, baseEq, el, sLo, sHi) {
  sLo = Math.max(sLo, 1); sHi = Math.max(sHi, sLo);
  const N = sHi - sLo;
  if (N <= 0) return basePrice * priceMult(sLo, baseEq, el);
  if (Math.abs(1 - el) < 1e-6) {
    return (basePrice * Math.pow(baseEq, el) / N) * Math.log(sHi / sLo);
  }
  const coef = basePrice * Math.pow(baseEq, el) / ((1 - el) * N);
  return coef * (Math.pow(sHi, 1 - el) - Math.pow(sLo, 1 - el));
}

/** Product of active eventMod multipliers on a market entry for a given field. */
function eventModMult(entry, field) {
  let m = 1;
  const mods = entry.eventMods;
  if (mods) for (let i = 0; i < mods.length; i++) if (mods[i].field === field) m *= mods[i].mult;
  return m;
}

export function economyBaseEqForSize(size) {
  return BASE_EQ_DEFAULT * (SIZE_FACTOR[size] || 1);
}

export function economyStockTargetForRole(role, baseEq = BASE_EQ_DEFAULT) {
  return baseEq * (ROLE_FACTOR[role] || 0);
}

/** Resolve a listing's authored drift target without changing its shared price curve. */
export function economyEquilibriumForListing(info, commodityId, role, baseEq = BASE_EQ_DEFAULT) {
  const authoredFactor = Number(info && info.marketEquilibriumFactors
    && info.marketEquilibriumFactors[commodityId]);
  if (Number.isFinite(authoredFactor) && authoredFactor > 0) {
    return baseEq * clamp(authoredFactor, 0.01, 4);
  }
  return role === 'none' ? baseEq : economyStockTargetForRole(role, baseEq);
}

export function economyMidPrice(def, stock, baseEq = BASE_EQ_DEFAULT) {
  if (!def) return 0;
  return def.basePrice * priceMult(stock, baseEq, def.elasticity);
}

export function economySpotPriceForRole(def, role, side = 'mid', opts = {}) {
  const baseEq = opts.baseEq || BASE_EQ_DEFAULT;
  const stock = opts.stock != null ? opts.stock : economyStockTargetForRole(role, baseEq);
  const spread = opts.spread != null ? opts.spread : SPREAD_BASE;
  const mid = economyMidPrice(def, stock, baseEq);
  if (side === 'buy') return mid * (1 + spread / 2);
  if (side === 'sell') return mid * (1 - spread / 2);
  return mid;
}

/** Effective stock drift target = equilibrium * event mods * mild cycle pull.
 *  Cycle motion is applied directly to mid in recomputePrices (charts need it);
 *  stock only soft-tracks so produce/consume roles stay authoritative. */
function effectiveEq(entry, state, stationId, cmdtyId) {
  const m = clamp(eventModMult(entry, 'equilibrium'), EQ_MULT_CLAMP[0], EQ_MULT_CLAMP[1]);
  const cycle = state && state.economy && state.economy.cycles
    ? getCycleCore(state, stationId, cmdtyId, cycleRngFor(state, stationId, cmdtyId), state.simTime || 0)
    : null;
  const cf = cycle ? cycleFactorAt(cycle, state.simTime || 0) : 1;
  // Soft structural pull: 70% role equilibrium + 30% cycle-scaled, so hauling still matters
  // but formula waves do not empty/flood stock on their own.
  const soft = 0.70 + 0.30 * cf;
  return entry.equilibrium * m * soft;
}

function cycleRngFor(state, stationId, cmdtyId) {
  if (economy._instance && typeof economy._instance._rng === 'function') {
    return () => economy._instance._rng();
  }
  const seedOwner = { seed: hash32(state && state.meta && state.meta.seed, 'economy-cycle', stationId, cmdtyId) };
  return () => drawSeeded(seedOwner, 'seed', seedOwner.seed);
}

/** Effective spread for a market entry (base * event spread mods * frontier penalty), clamped. */
function spreadOf(entry, frontierPenalty) {
  const ev = eventModMult(entry, 'spread');
  return clamp(SPREAD_BASE * ev * (1 + (frontierPenalty || 0)), SPREAD_LO, SPREAD_HI);
}

function pricePointAt(entry, def, cycle, t) {
  const stockMid = economyMidPrice(def, entry.stock, entry.baseEq);
  const persistentMid = applyPersistentDemand(stockMid, entry && entry.demandMult);
  const mid = Math.max(1, round(cycle
    ? applyCycleToMid(def.basePrice, persistentMid, cycle, t)
    : persistentMid));
  // The chart only needs its mid-price trace; current bid/ask remains on the listing. Keeping
  // snapshots this small preserves a long lived history without bloating save files.
  return { t: Number(t) || 0, mid };
}

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  // Current saves pack [time, mid, time, mid, ...]. This avoids tens of thousands of tiny
  // objects in the autosave capture/structured-clone path. Older object-per-point saves remain
  // accepted indefinitely so this storage optimization does not require a destructive migration.
  if (raw.length > 0 && typeof raw[0] === 'number') {
    const pairCount = Math.min(HISTORY_POINT_LIMIT, Math.floor(raw.length / 2));
    const start = raw.length - pairCount * 2;
    for (let i = Math.max(0, start - (start % 2)); i + 1 < raw.length; i += 2) {
      const t = Number(raw[i]);
      const mid = Math.max(1, round(Number(raw[i + 1]) || 0));
      if (Number.isFinite(t) && mid > 0) out.push({ t, mid });
    }
    return out;
  }
  const start = Math.max(0, raw.length - HISTORY_POINT_LIMIT);
  for (let i = start; i < raw.length; i++) {
    const p = raw[i];
    const mid = Math.max(1, round(Number(p && (p.mid != null ? p.mid : p)) || 0));
    const t = Number(p && p.t);
    if (Number.isFinite(t) && mid > 0) out.push({ t, mid });
  }
  return out;
}

function serializeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const count = Math.min(HISTORY_POINT_LIMIT, raw.length);
  const out = new Array(count * 2);
  let cursor = 0;
  for (let i = raw.length - count; i < raw.length; i++) {
    const point = raw[i];
    const t = Number(point && point.t);
    const mid = Math.max(1, round(Number(point && (point.mid != null ? point.mid : point)) || 0));
    if (!Number.isFinite(t) || !(mid > 0)) continue;
    out[cursor++] = t;
    out[cursor++] = mid;
  }
  out.length = cursor;
  return out;
}

const MARKET_ROLE_CODE = Object.freeze({ none: 0, produce: 1, consume: 2 });
const MARKET_ROLE_FROM_CODE = Object.freeze(['none', 'produce', 'consume']);

function serializeEventMods(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out = new Array(raw.length * 3);
  let cursor = 0;
  for (const mod of raw) {
    if (!mod || !mod.field) continue;
    out[cursor++] = mod.field;
    out[cursor++] = Number(mod.mult) || 1;
    out[cursor++] = mod.eventId == null ? null : mod.eventId;
  }
  out.length = cursor;
  return out;
}

function deserializeEventMods(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (raw[0] && typeof raw[0] === 'object') return raw.slice();
  const out = [];
  for (let i = 0; i + 2 < raw.length; i += 3) {
    if (!raw[i]) continue;
    out.push({ field: raw[i], mult: Number(raw[i + 1]) || 1, eventId: raw[i + 2] });
  }
  return out;
}

function serializeMarketRow(cid, entry, preserveHistory) {
  const row = [
    cid,
    entry.stock,
    entry.equilibrium,
    entry.baseEq,
    MARKET_ROLE_CODE[entry.role] ?? 0,
    serializeEventMods(entry.eventMods),
  ];
  if (preserveHistory) row.push(serializeHistory(entry.history));
  return row;
}

function deserializeMarketRow(cid, raw) {
  if (!Array.isArray(raw)) {
    return {
      cid,
      stock: raw && raw.stock,
      equilibrium: raw && raw.equilibrium,
      baseEq: raw && raw.baseEq,
      role: raw && raw.role,
      eventMods: raw && raw.eventMods,
      history: raw && raw.history,
    };
  }
  return {
    cid: raw[0] || cid,
    stock: raw[1],
    equilibrium: raw[2],
    baseEq: raw[3],
    role: MARKET_ROLE_FROM_CODE[raw[4]] || 'none',
    eventMods: deserializeEventMods(raw[5]),
    history: raw[6],
  };
}

function ensurePlayerMarketMemory(player) {
  if (!player) return {};
  if (!player.marketMemory || typeof player.marketMemory !== 'object' || Array.isArray(player.marketMemory)) {
    player.marketMemory = {};
  }
  return player.marketMemory;
}

function ensurePlayerTradeState(player) {
  if (!player) return { ledger: [], lots: {} };
  if (!Array.isArray(player.tradeLedger)) player.tradeLedger = [];
  if (!player.tradeLots || typeof player.tradeLots !== 'object' || Array.isArray(player.tradeLots)) player.tradeLots = {};
  return { ledger: player.tradeLedger, lots: player.tradeLots };
}

function nextTradeSequence(player, ledger) {
  const persisted = Number.isSafeInteger(player.tradeReceiptSeq) && player.tradeReceiptSeq > 0
    ? player.tradeReceiptSeq
    : 0;
  let retained = 0;
  for (const entry of ledger) {
    const sequence = Number(entry && entry.tradeSequence);
    if (Number.isSafeInteger(sequence) && sequence > retained) retained = sequence;
  }
  const sequence = Math.max(persisted, retained) + 1;
  player.tradeReceiptSeq = sequence;
  return sequence;
}

// ---------------------------------------------------------------------------------------------

export const economy = {
  name: 'economy',
  // serialize() owns every returned branch, so saveSystem can avoid cloning the populated market
  // payload a second time during the single-task autosave capture.
  saveSnapshotOwned: true,

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._registry = ctx.registry || null;
    this._lastDockedStation = null;
    this._syntheticHistoryKeys = new Set();
    economy._instance = this; // so exported quote()/execute() reach the live system

    const state = this.state, bus = this.bus;
    if (!state.economy) state.economy = { markets: {}, cycles: {}, econEvents: [], econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 }, marketIntel: {} };
    if (!state.economy.markets) state.economy.markets = {};
    if (!state.economy.cycles) state.economy.cycles = {};
    if (!state.economy.econEvents) state.economy.econEvents = [];
    if (!state.economy.econClock) state.economy.econClock = { accumulator: 0, lastTickT: 0, ticksElapsed: 0 };
    if (!state.economy.marketIntel) state.economy.marketIntel = {};
    ensurePlayerMarketMemory(state.player);
    ensurePlayerTradeState(state.player);
    if (!Number.isFinite(state.economy.rngSeed) || (state.economy.rngSeed >>> 0) === 0) state.economy.rngSeed = hash32(state.meta && state.meta.seed, 'economy');
    this._nextEventId = 1;
    this._eventAccumulator = 0;

    // dedicated seeded RNG stream (§0.5) so scan checks + event rolls don't disturb other streams.
    this.resetRng();

    // ---- SOLE credits writer (§0.6) -------------------------------------------------------
    bus.on('economy:grantCredits', (p) => this.grantCredits((p && p.amount) || 0, p && p.reason));
    bus.on('economy:chargeCredits', (p) => this.chargeCredits((p && p.amount) || 0, p && p.reason));

    // ---- trade intents from UI ------------------------------------------------------------
    bus.on('ui:buy', (p) => { if (p) this.handleTrade(p.commodityId, 'buy', p.qty); });
    bus.on('ui:sell', (p) => { if (p) this.handleTrade(p.commodityId, 'sell', p.qty); });
    bus.on('economy:marketOpened', (p) => {
      if (!p || !p.stationId) return;
      this.refreshStationDemand(p.stationId);
      this.snapshotIntel(p.stationId);
    });
    bus.on('map:sectorCharted', (p) => {
      if (p && p.source === 'survey' && p.sectorId) this.seedMemoryFromSurvey(p.sectorId);
    });

    // ---- NPC / passive-income trades route through the same execute path (self-balancing) --
    // NPC / drone trades move market stock (their activity shifts prices — the whole point of a
    // living economy) but must NOT touch the player's wallet or cargo. Previously both routed
    // through execute(), which hardcodes isPlayer=true and debits/credits state.player — a latent
    // bug where an NPC "sale" literally paid the player. Now they use the stock-only pressure path
    // (applyStockPressure), the same path automation uses, so NPCs are real economic actors without
    // a wallet-coupling accident. (Audit cut-list #2.)
    bus.on('aiTrader:requestTrade', (p) => {
      if (!p) return;
      this.applyStockPressure(p.stationId, p.commodityId, p.side, p.qty);
    });
    bus.on('miningDrone:sellOre', (p) => {
      if (!p) return;
      this.applyStockPressure(p.stationId, p.commodityId || p.good, 'sell', p.qty);
    });
    bus.on('economy:applyTradePressure', (p) => { // automation pressure: nudge stock without crediting
      if (!p) return; const side = (p.vol || 0) >= 0 ? 'sell' : 'buy';
      this.applyStockPressure(p.stationId, p.good || p.commodityId, side, Math.abs(p.vol || 0));
    });

    // ---- station markets populated on dock + sector entry ---------------------------------
    bus.on('dock:docked', (p) => {
      if (p && p.stationId) { this._lastDockedStation = p.stationId; this.ensureStationMarkets(p.stationId); this.snapshotIntel(p.stationId); }
    });
    bus.on('dock:undocked', () => { this._lastDockedStation = null; });
    bus.on('sector:enter', (p) => this.populateSector(p));

    // ---- services (refuel / repair / ammo) ------------------------------------------------
    bus.on('ui:service', (p) => { if (p) this.handleService(p); });

    // ---- contraband scanning (jump-gate use / patrol proximity) ---------------------------
    bus.on('sim:jumpGate', (p) => this.runScan(p || {}));
    bus.on('jump:start', (p) => this.runScan({ security: this.currentSecurity(), via: p && p.via, source: 'jump' }));
    bus.on('patrol:proximity', (p) => this.runScan(p || {}));
    bus.on('contraband:bribe', (p) => this.payBribe(p || {}));

    // ---- event injection from other systems (missions, combat) ----------------------------
    bus.on('mission:forceEvent', (p) => { if (p) this.injectEvent(p); });
    bus.on('combat:baseDestroyed', (p) => this.onBaseDestroyed(p || {}));
    // Save owners restore after economy. Rebuild this derived read model only after factions and
    // sectorSim have restored their authoritative conflict/field state.
    bus.on('save:loaded', () => this.refreshAllPersistentDemand({ reseedSynthetic: true }));
    // Registry listener order places economy before sectorSim. If offline catch-up crosses a
    // blockade/surplus threshold, this receipt arrives after the field mutation and reconciles the
    // same derived quotes and omitted chart caches immediately.
    bus.on('sectorsim:offlineSummary', () => this.refreshAllPersistentDemand({ reseedSynthetic: true }));
  },

  // -------------------------------------------------------------------------------------------
  // ECONOMY TICK (5s) — drift, age events, propagate, recompute cached prices, emit economy:tick.
  // -------------------------------------------------------------------------------------------
  update(dt, state) {
    const clock = state.economy.econClock;
    clock.accumulator += dt;
    // spontaneous event scheduler (game-wide Poisson-ish: ~1 per EVENT_INTERVAL_S)
    this._eventAccumulator += dt;
    while (clock.accumulator >= ECON_TICK_S) {
      clock.accumulator -= ECON_TICK_S;
      this.econTick(ECON_TICK_S, state);
    }
  },

  econTick(tickDt, state) {
    const econ = state.economy;
    const clock = econ.econClock;
    clock.ticksElapsed++;
    clock.lastTickT = state.simTime;

    // 1) age / expire eventMods + active events
    this.ageEvents(state);

    // 2) maybe spawn a spontaneous event (rate-limited by elapsed real seconds)
    while (this._eventAccumulator >= EVENT_INTERVAL_S) {
      this._eventAccumulator -= EVENT_INTERVAL_S;
      this.rollSpontaneousEvent(state);
    }

    // Authored regional production/consumption enters through the existing stock authority.
    // Recipe units are per simulated minute, so the identity pressure stays gentle and bounded.
    const regionalPressureListings = this.applyRegionalSupply(tickDt, { deferDerivedRefresh: true });

    // 3) drift every station+commodity stock toward effectiveEq, recompute cached prices
    const markets = econ.markets;
    const demandProjectionCache = new Map();
    for (const sid in markets) {
      const market = markets[sid];
      const info = stationInfo(state, sid);
      const frontier = info ? this.frontierPenalty(info) : 0;
      for (const cid in market) {
        const entry = market[cid];
        const def = commodityDef(state, cid);
        if (!def) continue;
        this.refreshListingDemand(entry, def, sid, info, demandProjectionCache);
        // advance hidden formula regime (rare re-roll of equation family + coeffs)
        const cycle = getCycleCore(state, sid, cid, () => this._rng(), state.simTime);
        // Regional stock pressure used to refresh this observation before the listing pass and then
        // have its live quote immediately replaced below. Preserve that pre-drift chart observation
        // exactly, but share the demand/cycle/price work already owned by this pass.
        if (regionalPressureListings && regionalPressureListings.get(sid)?.has(cid)) {
          this.recomputePrices(entry, def, frontier, cycle, state.simTime);
          this.recordPriceHistory(entry, def, cycle, state.simTime, true);
        }
        const nextCycle = maybeAdvanceRegime(cycle, () => this._rng(), state.simTime);
        if (nextCycle !== cycle) {
          state.economy.cycles[sid][cid] = nextCycle;
        }
        const liveCycle = state.economy.cycles[sid][cid] || nextCycle || cycle;
        const eff = effectiveEq(entry, state, sid, cid);
        const driftMod = eventModMult(entry, 'drift'); // BLOCKADE freezes drift (mult 0.1)
        // stock' = clamp(stock + DRIFT_RATE*driftMod*(eff - stock)*dt, 0, cap)
        entry.stock = Math.max(0, entry.stock + DRIFT_RATE * driftMod * (eff - entry.stock) * tickDt);
        this.recomputePrices(entry, def, frontier, liveCycle, state.simTime);
        this.recordPriceHistory(entry, def, liveCycle, state.simTime);
      }
    }

    // The docked exchange is a live feed. Remote intel remains intentionally stale until revisited.
    if (this._lastDockedStation && markets[this._lastDockedStation]) {
      this.snapshotIntel(this._lastDockedStation);
    }

    // 4) propagate event pressure to neighbour stations (along the sector graph)
    this.propagateEvents(state);

    this.bus.emit('economy:tick', { t: state.simTime, ticksElapsed: clock.ticksElapsed });
  },

  applyRegionalSupply(tickDt, options = null) {
    const minuteShare = Math.max(0, Number(tickDt) || 0) / 60;
    if (!(minuteShare > 0)) return null;
    const deferDerivedRefresh = options && options.deferDerivedRefresh === true;
    const touchedListings = deferDerivedRefresh ? new Map() : null;
    for (const recipe of REGIONAL_PRESSURE_RECIPES) {
      if (!recipe.stationId || !(recipe.units > 0)) continue;
      this.applyStockPressure(
        recipe.stationId,
        recipe.commodityId,
        recipe.role === 'consume' ? 'buy' : 'sell',
        recipe.units * minuteShare,
        deferDerivedRefresh ? { deferDerivedRefresh: true, touchedListings } : null,
      );
    }
    return touchedListings;
  },

  /**
   * Cache lastMid/lastBuy/lastSell from stock mid × cycle formula.
   * cycle/simTime optional — without them mid is pure stock (init before cycles exist).
   * Final mid is always a positive integer credit value.
   */
  recomputePrices(entry, def, frontierPenalty, cycle = null, simTime = 0) {
    const stockMid = economyMidPrice(def, entry.stock, entry.baseEq);
    const persistentMid = applyPersistentDemand(stockMid, entry && entry.demandMult);
    const midRaw = cycle
      ? applyCycleToMid(def.basePrice, persistentMid, cycle, simTime)
      : persistentMid;
    const mid = Math.max(1, round(midRaw));
    const spread = spreadOf(entry, frontierPenalty);
    entry.lastMid = mid;
    entry.lastBuy = Math.max(1, round(mid * (1 + spread / 2)));
    // Sell floor 1; keep buy > sell when mid is tiny.
    entry.lastSell = Math.max(1, Math.min(entry.lastBuy - 1, round(mid * (1 - spread / 2))));
    if (entry.lastSell < 1) entry.lastSell = 1;
    if (entry.lastBuy <= entry.lastSell) entry.lastBuy = entry.lastSell + 1;
    return entry;
  },

  /** Resolve the live cycle (if any) and recompute mid/buy/sell for a station listing. */
  recomputeLivePrices(entry, def, stationId, commodityId) {
    const state = this.state;
    const frontier = this.frontierPenaltyFor(state, stationId);
    if (!state || !state.economy) return this.recomputePrices(entry, def, frontier);
    this.refreshListingDemand(entry, def, stationId);
    const cycle = getCycleCore(
      state,
      stationId,
      commodityId,
      () => (typeof this._rng === 'function' ? this._rng() : 0.5),
      state.simTime || 0,
    );
    return this.recomputePrices(entry, def, frontier, cycle, state.simTime || 0);
  },

  /** Seed and retain the player-visible history from the actual formula state. */
  seedPriceHistory(entry, def, cycle, simTime) {
    const now = Number(simTime) || 0;
    entry.history = [];
    for (let i = 0; i < HISTORY_POINT_LIMIT; i++) {
      const t = now - HISTORY_SPAN_S + i * HISTORY_SAMPLE_S;
      entry.history.push(pricePointAt(entry, def, cycle, t));
    }
    return entry.history;
  },

  /** Record one bounded chart point; forced calls replace the same-timestamp point after a trade. */
  recordPriceHistory(entry, def, cycle, simTime, force = false) {
    const now = Number(simTime) || 0;
    if (!Array.isArray(entry.history) || entry.history.length < 2) {
      this.seedPriceHistory(entry, def, cycle, now);
      return entry.history;
    }
    const history = entry.history;
    const last = history[history.length - 1];
    if (!force && last && (now - Number(last.t)) < HISTORY_SAMPLE_S) return history;
    const point = pricePointAt(entry, def, cycle, now);
    if (last && Math.abs(Number(last.t) - now) < 0.001) history[history.length - 1] = point;
    else history.push(point);
    if (history.length > HISTORY_POINT_LIMIT) history.splice(0, history.length - HISTORY_POINT_LIMIT);
    return history;
  },

  /** Add an immediate point after a player or automation trade changes the quote. */
  recordLivePriceHistory(entry, def, stationId, commodityId, force = true) {
    const state = this.state;
    const cycle = getCycleCore(
      state,
      stationId,
      commodityId,
      () => (typeof this._rng === 'function' ? this._rng() : 0.5),
      state.simTime || 0,
    );
    return this.recordPriceHistory(entry, def, cycle, state.simTime || 0, force);
  },

  /** Frontier (low-wealth) stations widen the spread. Derived from sector security. */
  frontierPenalty(info) {
    const sec = (info && info.security != null) ? info.security : 0.7;
    // low security -> up to +FRONTIER_SPREAD_BONUS
    return clamp((1 - sec) * FRONTIER_SPREAD_BONUS, 0, FRONTIER_SPREAD_BONUS);
  },

  /** Rebuild one derived demand cache from factions + the averaged sector field. */
  refreshListingDemand(entry, def, stationId, resolvedInfo = undefined, projectionCache = null) {
    if (!entry || !def) return false;
    const info = resolvedInfo === undefined ? stationInfo(this.state, stationId) : resolvedInfo;
    const sectorId = info && info.sectorId;
    let result;
    if (projectionCache instanceof Map) {
      let sectorCache = projectionCache.get(sectorId);
      if (!sectorCache) {
        sectorCache = new Map();
        projectionCache.set(sectorId, sectorCache);
      }
      result = sectorCache.get(def.id);
      if (!result) {
        result = effectiveDemandFor({ state: this.state, sectorId, commodity: def });
        sectorCache.set(def.id, result);
      }
    } else {
      result = effectiveDemandFor({ state: this.state, sectorId, commodity: def });
    }
    const nextMult = Number(result.multiplier) || 1;
    const nextDrivers = Array.isArray(result.drivers) ? result.drivers.map((driver) => ({ ...driver })) : [];
    const changed = Math.abs((Number(entry.demandMult) || 1) - nextMult) > 1e-9
      || JSON.stringify(entry.demandDrivers || []) !== JSON.stringify(nextDrivers);
    entry.demandMult = nextMult;
    entry.demandDrivers = nextDrivers;
    return changed;
  },

  /** Refresh a station atomically so its board, executable quotes, history, and route intel agree. */
  refreshStationDemand(stationId, { recordHistory = true } = {}) {
    const state = this.state;
    const market = state && state.economy && state.economy.markets && state.economy.markets[stationId];
    if (!market) return false;
    const frontier = this.frontierPenaltyFor(state, stationId);
    let changed = false;
    for (const cid in market) {
      const entry = market[cid];
      const def = commodityDef(state, cid);
      if (!entry || !def) continue;
      const listingChanged = this.refreshListingDemand(entry, def, stationId);
      const cycle = getCycleCore(state, stationId, cid, () => this._rng(), state.simTime || 0);
      this.recomputePrices(entry, def, frontier, cycle, state.simTime || 0);
      if (listingChanged && recordHistory) {
        this.recordPriceHistory(entry, def, cycle, state.simTime || 0, true);
      }
      changed = listingChanged || changed;
    }
    return changed;
  },

  /** Save/load rebuilds derived quotes without inventing observations or history transitions. */
  refreshAllPersistentDemand({ reseedSynthetic = false } = {}) {
    const state = this.state;
    const markets = state && state.economy && state.economy.markets || {};
    for (const stationId of Object.keys(markets)) {
      this.refreshStationDemand(stationId, { recordHistory: false });
    }
    if (reseedSynthetic) this.reseedSyntheticPriceHistories();
  },

  /** Rebuild only chart caches omitted from saves; genuinely observed histories remain untouched. */
  reseedSyntheticPriceHistories() {
    const keys = this._syntheticHistoryKeys;
    if (!(keys instanceof Set) || !keys.size) return 0;
    const state = this.state;
    let count = 0;
    for (const key of keys) {
      const divider = key.indexOf('\u001f');
      if (divider < 1) continue;
      const stationId = key.slice(0, divider);
      const commodityId = key.slice(divider + 1);
      const entry = state.economy && state.economy.markets
        && state.economy.markets[stationId] && state.economy.markets[stationId][commodityId];
      const def = commodityDef(state, commodityId);
      if (!entry || !def) continue;
      const cycle = getCycleCore(state, stationId, commodityId, () => this._rng(), state.simTime || 0);
      this.seedPriceHistory(entry, def, cycle, state.simTime || 0);
      count++;
    }
    return count;
  },

  // -------------------------------------------------------------------------------------------
  // MARKET CONSTRUCTION
  // -------------------------------------------------------------------------------------------
  /** Lazily build the market for one station from its type's produce/consume profile.
   *  ensureMarket(stationId, stationTypeId?) — typeId optional; resolved from data if omitted. */
  ensureMarket(stationId, stationTypeId, size) {
    const state = this.state;
    const markets = state.economy.markets;
    if (markets[stationId]) return markets[stationId];
    const info = stationInfo(state, stationId);
    const type = stationTypeId || (info && info.type) || 'trade_hub';
    const sz = size || (info && info.size) || 'M';
    const baseEqRef = economyBaseEqForSize(sz); // fixed pricing reference
    const allowContraband = toleratesContraband(info);

    const market = {};
    for (const def of COMMODITIES) {
      const role = roleFor(def, type);
      // Every legal commodity trades at every station — role only drives price/stock target, not
      // availability. A 'none'-role commodity (e.g. iron ore at a military station) still gets an
      // entry so the player can always sell what they mined/bought. Contraband/illegal goods stay
      // gated to blackmarket-tolerant stations (that is a design-correct restriction, not a filter).
      if (def.legality === 'contraband' || def.legality === 'illegal') {
        if (!allowContraband) continue;
      }
      // 'none'-role goods have no produce/consume pull, so drift them toward a neutral baseEq stock
      // (price settles near basePrice; player can both buy and sell). Produce/consume keep their
      // role-driven surplus/shortage targets so A->B routes stay profitable.
      const equilibrium = economyEquilibriumForListing(info, def.id, role, baseEqRef);
      const stock = equilibrium;                                 // start at rest
      const entry = {
        stock, equilibrium, baseEq: baseEqRef, role,
        lastMid: 0, lastBuy: 0, lastSell: 0, eventMods: [],
        demandMult: 1, demandDrivers: [],
      };
      const frontier = info ? this.frontierPenalty(info) : 0;
      // seed the hidden formula cycle first so the opening mid includes the wave
      if (!state.economy.cycles) state.economy.cycles = {};
      if (!state.economy.cycles[stationId]) state.economy.cycles[stationId] = {};
      const now = state.simTime || 0;
      // Every market begins with a formula already in progress. That lets the chart expose a
      // learnable current trend on the very first dock instead of faking one in the UI.
      const historyAge = HISTORY_REGIME_AGE_MIN_S
        + this._rng() * (HISTORY_REGIME_AGE_MAX_S - HISTORY_REGIME_AGE_MIN_S);
      const cycle = createCycle(() => this._rng(), def, now - historyAge);
      cycle.cmdtyId = def.id;
      state.economy.cycles[stationId][def.id] = cycle;
      this.refreshListingDemand(entry, def, stationId);
      this.recomputePrices(entry, def, frontier, cycle, now);
      this.seedPriceHistory(entry, def, cycle, now);
      market[def.id] = entry;
    }
    markets[stationId] = market;
    return market;
  },

  /** Build markets for all stations whose ids we are told about (a single station). */
  ensureStationMarkets(stationId) { return this.ensureMarket(stationId); },

  /** On sector:enter, build markets for every station present so prices are warm. */
  populateSector(payload) {
    const state = this.state;
    const sectorId = payload && payload.sectorId;
    let stations = (payload && payload.sector && payload.sector.stations) || null;
    if (!stations && sectorId) {
      const sec = (state.content && state.content.sectors && (Array.isArray(state.content.sectors)
        ? state.content.sectors.find((s) => s.id === sectorId)
        : state.content.sectors[sectorId]))
        || SECTORS.find((s) => s.id === sectorId);
      stations = sec && sec.stations;
    }
    if (!stations) return;
    for (const st of stations) this.ensureMarket(st.id, st.type, st.size);
  },

  /** Cache a price snapshot for the map / route-planner UI (marketIntel). */
  snapshotIntel(stationId) {
    const state = this.state;
    const market = state.economy.markets[stationId];
    if (!market) return;
    const snapshot = {};
    for (const cid in market) {
      const e = market[cid];
      snapshot[cid] = {
        mid: e.lastMid, buy: e.lastBuy, sell: e.lastSell, stock: e.stock, role: e.role,
        demandMult: Number(e.demandMult) || 1,
        demandDrivers: Array.isArray(e.demandDrivers) ? e.demandDrivers.map((driver) => ({ ...driver })) : [],
      };
    }
    state.economy.marketIntel[stationId] = { snapshot, seenAtT: state.simTime };
    this.recordMarketMemory(stationId, snapshot);
  },

  /**
   * Convert one purchased sector survey into bounded, explicitly lower-confidence price memory.
   * This is the only non-dock writer: it sees exactly the stations named by the purchased sector,
   * takes one snapshot, and never installs live remote intel or an updating subscription.
   */
  seedMemoryFromSurvey(sectorId) {
    const state = this.state;
    const registry = state && state.content && state.content.sectors;
    const sectors = registry ? (Array.isArray(registry) ? registry : Object.values(registry)) : SECTORS;
    const sector = sectors.find((entry) => entry && entry.id === sectorId);
    if (!sector) return { stationCount: 0, listingCount: 0 };

    let stationCount = 0;
    let listingCount = 0;
    for (const station of sector.stations || []) {
      if (!station || !station.id) continue;
      const market = this.ensureMarket(station.id, station.type, station.size);
      const memory = this.recordMarketMemory(station.id, market, { source: 'survey' });
      if (!memory) continue;
      stationCount++;
      listingCount += Object.keys(memory).length;
    }
    return { stationCount, listingCount };
  },

  /** Player-facing price memory: dock observations plus purchased survey snapshots, saved on player. */
  recordMarketMemory(stationId, snapshot = null, options = null) {
    const state = this.state;
    if (!stationId || !state || !state.player) return null;
    const market = snapshot || (state.economy && state.economy.markets && state.economy.markets[stationId]);
    if (!market) return null;
    const source = options && options.source === 'survey' ? 'survey' : null;
    const memory = ensurePlayerMarketMemory(state.player);
    const stationMemory = memory[stationId] || (memory[stationId] = {});
    for (const cid in market) {
      const e = market[cid];
      if (!e) continue;
      const buy = e.buy != null ? e.buy : e.lastBuy;
      const sell = e.sell != null ? e.sell : e.lastSell;
      if (!Number.isFinite(Number(buy)) && !Number.isFinite(Number(sell))) continue;
      const prior = stationMemory[cid];
      // A real visit is stronger knowledge than a survey packet. Duplicate/replayed chart events
      // may refresh survey-grade memory, but can never downgrade a direct dock observation.
      if (source === 'survey' && prior && prior.source !== 'survey') continue;
      const record = {
        buy: Math.round(Number(buy) || 0),
        sell: Math.round(Number(sell) || 0),
        seenAt: Math.max(0, Number(state.simTime) || 0),
        demandMult: Number(e.demandMult) || 1,
        demandDrivers: Array.isArray(e.demandDrivers) ? e.demandDrivers.map((driver) => ({ ...driver })) : [],
      };
      if (source) record.source = source;
      stationMemory[cid] = record;
    }
    return stationMemory;
  },

  // -------------------------------------------------------------------------------------------
  // QUOTE / EXECUTE  (the public trade API; UI calls quote() live, execute() on confirm)
  // -------------------------------------------------------------------------------------------
  /** quote(stationId, cmdtyId, side, qty) -> { ok, unitAvg, total, priceImpactPct, stockAfter,
   *  legalityWarning, reason } — pure (does not mutate). side = 'buy' | 'sell'. */
  quote(stationId, commodityId, side, qty) {
    const state = this.state;
    qty = Math.max(0, Math.floor(qty || 0));
    const market = state.economy.markets[stationId] || this.ensureMarket(stationId);
    const entry = market && market[commodityId];
    const def = commodityDef(state, commodityId);
    if (!entry || !def) return { ok: false, reason: 'untraded', unitAvg: 0, total: 0, priceImpactPct: 0, stockAfter: entry ? entry.stock : 0 };
    if (side === 'sell' && isUnsellableCargo(state, commodityId)) {
      return {
        ok: false, reason: 'mission_cargo_locked', unitAvg: entry.lastSell || 0, total: 0,
        priceImpactPct: 0, stockAfter: entry.stock,
      };
    }
    const info = stationInfo(state, stationId);
    const standing = priceModForState(state, info && info.factionId);
    const stationTier = info ? Math.max(0, Number(info.tier) || 0) : 0;
    const marketTier = Math.max(0, Number(def.marketTier) || 0);
    // Low-tier ports buy valuable finds from the player but do not create an infinite local
    // supply of resources that only occur deeper in the world. This preserves discovery value
    // and stops starter markets from becoming risk-free rare-ore vending machines.
    if (side === 'buy' && marketTier > stationTier) {
      return {
        ok: false, reason: 'tier_unavailable', unitAvg: entry.lastBuy * standing.buy, total: 0,
        priceImpactPct: 0, stockAfter: entry.stock, marketTier, stationTier,
        legalityWarning: def.legality !== 'legal' ? def.legality : null,
      };
    }
    if (qty <= 0) {
      const u = side === 'buy' ? entry.lastBuy * standing.buy : entry.lastSell * standing.sell;
      return { ok: false, reason: 'qty', unitAvg: u, total: 0, priceImpactPct: 0, stockAfter: entry.stock, legalityWarning: def.legality !== 'legal' ? def.legality : null };
    }
    const frontier = info ? this.frontierPenalty(info) : 0;
    const spread = spreadOf(entry, frontier);
    const el = def.elasticity;
    const cycle = getCycleCore(
      state,
      stationId,
      commodityId,
      () => (typeof this._rng === 'function' ? this._rng() : 0.5),
      state.simTime || 0,
    );
    const tNow = state.simTime || 0;
    let avgMidPrice, stockAfter;
    if (side === 'buy') {
      const sHi = entry.stock, sLo = Math.max(1, entry.stock - qty);
      avgMidPrice = avgMid(def.basePrice, entry.baseEq, el, sLo, sHi);
      stockAfter = sLo;
    } else { // sell floods stock up
      const sLo = entry.stock, sHi = entry.stock + qty;
      avgMidPrice = avgMid(def.basePrice, entry.baseEq, el, sLo, sHi);
      stockAfter = sHi;
    }
    // Market fundamentals share the chart/lastMid formula. Standing then personalizes the
    // executable quote; Choice A can remove only an above-base buy markup.
    avgMidPrice = applyPersistentDemand(avgMidPrice, entry.demandMult);
    avgMidPrice = applyCycleToMid(def.basePrice, avgMidPrice, cycle, tNow);
    const standingPriceMultiplier = side === 'buy' ? standing.buy : standing.sell;
    const marketUnitAvg = side === 'buy' ? avgMidPrice * (1 + spread / 2) : avgMidPrice * (1 - spread / 2);
    const unitAvg = marketUnitAvg * standingPriceMultiplier;
    const total = round(unitAvg * qty);
    const beforeMid = applyCycleToMid(
      def.basePrice,
      applyPersistentDemand(economyMidPrice(def, entry.stock, entry.baseEq), entry.demandMult),
      cycle,
      tNow,
    );
    const afterMid = applyCycleToMid(
      def.basePrice,
      applyPersistentDemand(economyMidPrice(def, stockAfter, entry.baseEq), entry.demandMult),
      cycle,
      tNow,
    );
    const priceImpactPct = beforeMid > 0 ? ((afterMid - beforeMid) / beforeMid) * 100 : 0;
    return {
      ok: true, stationId, commodityId, side, qty,
      unitAvg, total,
      priceImpactPct, stockAfter,
      standingPriceMultiplier,
      stationSurchargeWaived: side === 'buy' && standing.surchargeWaived,
      legalityWarning: def.legality !== 'legal' ? def.legality : null,
    };
  },

  /** execute(stationId, cmdtyId, side, qty) -> { ok, qty, unitAvg, total, profit?, reason }.
   *  Validate-then-apply (transactional): a failed credit/cargo/stock check changes nothing. */
  execute(stationId, commodityId, side, qty) {
    const state = this.state;
    qty = Math.max(0, Math.floor(qty || 0));
    // Enforce sealed-freight authority at execution as well as quote. This is the final shared
    // boundary for every station UI (legacy and Orbital Command) and keeps a stale or custom quote
    // adapter from turning mission cargo into credits.
    if (side === 'sell' && isUnsellableCargo(state, commodityId)) {
      return { ok: false, reason: 'mission_cargo_locked' };
    }
    const q = this.quote(stationId, commodityId, side, qty);
    if (!q.ok) return { ok: false, reason: q.reason || 'invalid' };
    const market = state.economy.markets[stationId];
    const entry = market && market[commodityId];
    const def = commodityDef(state, commodityId);
    if (!entry || !def) return { ok: false, reason: 'untraded' };

    const isPlayer = true; // current callers (ui:buy/sell) act on the player hold
    const cargoSys = this.registryGet && this.registryGet('cargo');

    if (side === 'buy') {
      if (entry.stock - qty < 1) qty = Math.max(0, Math.floor(entry.stock - 1)); // can't drain below 1u
      if (qty <= 0) return { ok: false, reason: 'no_stock' };
      // re-quote at the (possibly reduced) qty
      const qq = this.quote(stationId, commodityId, 'buy', qty);
      const total = round(qq.total);
      if ((state.player.credits | 0) < total) return { ok: false, reason: 'credits', need: total };
      // cargo volume check (volume is the ONLY hard cap §0.13)
      const free = state.player.cargo.capVolume - state.player.cargo.usedVolume;
      const canFit = Math.floor(free / (def.volPerU > 0 ? def.volPerU : 1));
      if (canFit < qty) qty = canFit;
      if (qty <= 0) return { ok: false, reason: 'cargo_full' };
      const fq = this.quote(stationId, commodityId, 'buy', qty);
      const cost = round(fq.total);
      if ((state.player.credits | 0) < cost) return { ok: false, reason: 'credits', need: cost };
      // APPLY
      const added = this.addToCargo(cargoSys, state, commodityId, qty);
      if (added <= 0) return { ok: false, reason: 'cargo_full' };
      const realQty = added;
      const realCost = realQty === qty ? cost : round(this.quote(stationId, commodityId, 'buy', realQty).total);
      entry.stock = Math.max(1, entry.stock - realQty);
      this.chargeCredits(realCost, 'trade:buy:' + commodityId);
      this.recomputeLivePrices(entry, def, stationId, commodityId);
      this.recordLivePriceHistory(entry, def, stationId, commodityId);
      const unitAvg = realCost / realQty;
      this.afterTrade(state, stationId, commodityId, 'buy', realQty, unitAvg, realCost, fq.priceImpactPct, def);
      return { ok: true, qty: realQty, unitAvg, total: realCost, priceImpactPct: fq.priceImpactPct };
    } else {
      // SELL — need the stock in cargo
      const have = state.player.cargo.items[commodityId] || 0;
      if (have <= 0) return { ok: false, reason: 'no_cargo' };
      if (qty > have) qty = have;
      const fq = this.quote(stationId, commodityId, 'sell', qty);
      const gross = round(fq.total);
      // APPLY
      const removed = this.removeFromCargo(cargoSys, state, commodityId, qty);
      if (removed <= 0) return { ok: false, reason: 'no_cargo' };
      const realQty = removed;
      const realGross = realQty === qty ? gross : round(this.quote(stationId, commodityId, 'sell', realQty).total);
      entry.stock = entry.stock + realQty;
      this.grantCredits(realGross, 'trade:sell:' + commodityId);
      this.recomputeLivePrices(entry, def, stationId, commodityId);
      this.recordLivePriceHistory(entry, def, stationId, commodityId);
      const unitAvg = realGross / realQty;
      const receipt = this.afterTrade(
        state,
        stationId,
        commodityId,
        'sell',
        realQty,
        unitAvg,
        realGross,
        fq.priceImpactPct,
        def,
      );
      const profit = receipt ? receipt.profit : 0;
      return { ok: true, qty: realQty, unitAvg, total: realGross, priceImpactPct: fq.priceImpactPct, profit };
    }
  },

  frontierPenaltyFor(state, stationId) {
    const info = stationInfo(state, stationId);
    return info ? this.frontierPenalty(info) : 0;
  },

  /** Add to player cargo via the canonical single-writer cargo helper (§0.6). Returns accepted qty. */
  addToCargo(_cargoSys, state, commodityId, qty) {
    return addCargo(state, commodityId, qty);
  },

  /** Remove from player cargo via the canonical single-writer cargo helper. Returns removed qty. */
  removeFromCargo(_cargoSys, state, commodityId, qty) {
    return removeCargo(state, commodityId, qty);
  },

  /** Common post-trade bookkeeping: stats, intel refresh, emit economy:tradeCompleted. */
  afterTrade(state, stationId, commodityId, side, qty, unitAvg, total, priceImpactPct, def) {
    const info = stationInfo(state, stationId);
    const receipt = this.recordTradeLedger(state, stationId, commodityId, side, qty, unitAvg, total, def);
    const profit = side === 'sell' && receipt ? receipt.profit : null;
    const stats = state.player.stats;
    if (stats) {
      stats.tradesCount = (stats.tradesCount || 0) + 1;
      if (profit != null) {
        stats.lifetimeProfit = (stats.lifetimeProfit || 0) + profit;
        if (profit > (stats.biggestSingleProfit || 0)) stats.biggestSingleProfit = profit;
      }
      if (def && def.legality !== 'legal') stats.smuggledValue = (stats.smuggledValue || 0) + Math.abs(total);
    }
    this.snapshotIntel(stationId);
    this.bus.emit('economy:tradeCompleted', {
      stationId, commodityId, side, qty, unitAvg, total,
      priceImpactPct, profit: profit != null ? profit : undefined,
      factionId: info ? info.factionId : null,
      receiptId: receipt && receipt.receiptId,
      tradeSequence: receipt && receipt.tradeSequence,
      seenAt: receipt && receipt.seenAt,
    });
    return receipt;
  },

  recordTradeLedger(state, stationId, commodityId, side, qty, unitAvg, total, def) {
    const player = state && state.player;
    if (!player || !commodityId || qty <= 0) return null;
    const { ledger, lots } = ensurePlayerTradeState(player);
    const cleanQty = Math.max(0, Math.floor(Number(qty) || 0));
    const cleanUnit = Number(unitAvg) || 0;
    let basisUnit = cleanUnit;
    let marginPerUnit = 0;
    let profitCr = 0;
    if (side === 'buy') {
      const queue = lots[commodityId] || (lots[commodityId] = []);
      queue.push({ qty: cleanQty, unit: cleanUnit });
    } else if (side === 'sell') {
      basisUnit = this.consumeTradeLots(lots, commodityId, cleanQty, def);
      marginPerUnit = cleanUnit - basisUnit;
      profitCr = Math.round(marginPerUnit * cleanQty);
    }
    const tradeSequence = nextTradeSequence(player, ledger);
    const seed = (Number(state && state.meta && state.meta.seed) >>> 0) || 1;
    const entry = {
      receiptId: `trade:${seed.toString(36)}:${tradeSequence.toString(36)}`,
      tradeSequence,
      stationId,
      commodityId,
      side,
      qty: cleanQty,
      unit: Math.round(cleanUnit),
      buyUnit: Math.round(basisUnit),
      marginPerUnit: Math.round(marginPerUnit),
      profit: profitCr,
      seenAt: Math.max(0, Number(state.simTime) || 0),
      total: Math.round(Number(total) || 0),
    };
    ledger.unshift(entry);
    if (ledger.length > TRADE_LEDGER_MAX) ledger.length = TRADE_LEDGER_MAX;
    return entry;
  },

  consumeTradeLots(lots, commodityId, qty, def) {
    const queue = lots[commodityId] || (lots[commodityId] = []);
    let remaining = Math.max(0, Math.floor(Number(qty) || 0));
    let cost = 0;
    let covered = 0;
    while (remaining > 0 && queue.length) {
      const lot = queue[0];
      const take = Math.min(remaining, Math.max(0, Math.floor(Number(lot.qty) || 0)));
      if (take <= 0) { queue.shift(); continue; }
      cost += take * (Number(lot.unit) || 0);
      covered += take;
      remaining -= take;
      lot.qty -= take;
      if (lot.qty <= 0) queue.shift();
    }
    if (remaining > 0) {
      const fallback = def && Number(def.basePrice) || 0;
      cost += remaining * fallback;
      covered += remaining;
    }
    return covered > 0 ? cost / covered : (def && Number(def.basePrice) || 0);
  },

  /** UI/NPC entry: validate against the docked station context then execute. */
  handleTrade(commodityId, side, qty) {
    const state = this.state;
    const stationId = this.dockedStationId();
    if (!stationId) {
      this.bus.emit('toast', { text: 'Not docked', kind: 'error', ttl: 2 });
      this.bus.emit('economy:tradeFailed', {
        stationId: null,
        commodityId,
        side,
        qty: Math.max(0, Math.floor(Number(qty) || 0)),
        reason: 'not_docked',
      });
      return;
    }
    const res = this.execute(stationId, commodityId, side, qty);
    if (!res.ok) {
      const msg = res.reason === 'credits' ? 'Insufficient credits'
        : res.reason === 'cargo_full' ? 'Cargo hold full'
        : res.reason === 'no_cargo' ? 'Nothing to sell'
        : res.reason === 'mission_cargo_locked' ? 'Sealed contract cargo cannot be sold'
        : res.reason === 'no_stock' ? 'Station out of stock'
        : 'Trade failed';
      this.bus.emit('toast', { text: msg, kind: 'error', ttl: 2 });
      this.bus.emit('economy:tradeFailed', {
        stationId,
        commodityId,
        side,
        qty: Math.max(0, Math.floor(Number(qty) || 0)),
        reason: res.reason || 'invalid',
        need: res.need,
      });
    }
    return res;
  },

  /** Move stock without crediting anyone (automation trade pressure). */
  applyStockPressure(stationId, commodityId, side, qty, options = null) {
    const state = this.state;
    const market = state.economy.markets[stationId] || this.ensureMarket(stationId);
    const entry = market && market[commodityId];
    const def = commodityDef(state, commodityId);
    if (!entry || !def || !(qty > 0)) return;
    if (side === 'buy') entry.stock = Math.max(1, entry.stock - qty);
    else entry.stock = entry.stock + qty;
    if (options && options.deferDerivedRefresh === true) {
      // Keep cycle creation and its RNG position identical to the immediate stock-pressure path.
      getCycleCore(state, stationId, commodityId, () => this._rng(), state.simTime || 0);
      if (options.touchedListings instanceof Map) {
        let stationListings = options.touchedListings.get(stationId);
        if (!stationListings) {
          stationListings = new Set();
          options.touchedListings.set(stationId, stationListings);
        }
        stationListings.add(commodityId);
      }
      return;
    }
    this.recomputeLivePrices(entry, def, stationId, commodityId);
    this.recordLivePriceHistory(entry, def, stationId, commodityId);
  },

  // -------------------------------------------------------------------------------------------
  // CREDITS — SOLE WRITER (§0.6). Everyone else emits economy:grant/chargeCredits.
  // -------------------------------------------------------------------------------------------
  grantCredits(amount, reason) {
    amount = Math.round(amount || 0);
    if (amount <= 0) return this.state.player.credits;
    const p = this.state.player;
    p.credits = Math.max(0, (p.credits | 0) + amount);
    this.bus.emit('credits:changed', { delta: amount, reason: reason || 'grant', total: p.credits });
    return p.credits;
  },

  chargeCredits(amount, reason) {
    amount = Math.round(amount || 0);
    if (amount <= 0) return this.state.player.credits;
    const p = this.state.player;
    const before = p.credits | 0;
    p.credits = Math.max(0, before - amount); // clamp ≥0 (§ spec)
    const delta = p.credits - before;          // actual change (may be smaller if it floored at 0)
    this.bus.emit('credits:changed', { delta, reason: reason || 'charge', total: p.credits });
    return p.credits;
  },

  // -------------------------------------------------------------------------------------------
  // SERVICES — refuel / repair / ammo (ui:service {type, amount}).
  // -------------------------------------------------------------------------------------------
  handleService(p) {
    const state = this.state;
    const type = p.type;
    if (type === 'refuel') {
      const fuel = state.fuel || (state.fuel = { current: 0, max: 100 });
      const want = p.amount != null ? p.amount : (fuel.max - fuel.current);
      const units = Math.max(0, Math.min(want, fuel.max - fuel.current));
      const cost = round(units * FUEL_UNIT_CR);
      if (units <= 0) return;
      const credits = state.player.credits | 0;
      const realUnits = credits < cost ? Math.max(0, Math.min(units, Math.floor(credits / FUEL_UNIT_CR))) : units;
      if (realUnits <= 0) { this.bus.emit('toast', { text: 'Insufficient credits for fuel', kind: 'error', ttl: 2 }); return; }
      const realCost = round(realUnits * FUEL_UNIT_CR);
      this.chargeCredits(realCost, 'service:refuel');
      fuel.current = Math.min(fuel.max, fuel.current + realUnits);
      this.bus.emit('fuel:changed', { current: fuel.current, max: fuel.max });
      this.bus.emit('toast', { text: `${realUnits < units ? 'Partial refuel' : 'Refueled'} (${round(realUnits)}u, ${realCost}cr)`, kind: realUnits < units ? 'warn' : 'success', ttl: 2 });
    } else if (type === 'repair') {
      const e = state.entities && state.entities.get(state.playerId);
      if (!e) return;
      const missHull = Math.max(0, (e.hullMax || 0) - (e.hull || 0));
      const missArmor = Math.max(0, (e.armorMax || 0) - (e.armorHp || 0));
      const totalMiss = missHull + missArmor;
      if (totalMiss <= 0.5) { this.bus.emit('toast', { text: 'Hull already intact', kind: 'info', ttl: 2 }); return; }
      const cost = round(totalMiss * REPAIR_HP_CR);
      const credits = state.player.credits | 0;
      if (credits < cost) {
        // partial repair up to what the player can afford
        const frac = cost > 0 ? credits / cost : 0;
        e.hull = Math.min(e.hullMax, (e.hull || 0) + missHull * frac);
        e.armorHp = Math.min(e.armorMax, (e.armorHp || 0) + missArmor * frac);
        this.chargeCredits(credits, 'service:repair');
        this.bus.emit('toast', { text: 'Partial repair (out of credits)', kind: 'warn', ttl: 2 });
      } else {
        e.hull = e.hullMax; e.armorHp = e.armorMax;
        this.chargeCredits(cost, 'service:repair');
        this.bus.emit('toast', { text: `Repaired (${cost}cr)`, kind: 'success', ttl: 2 });
      }
    } else if (type === 'ammo') {
      const units = Math.max(0, Math.floor(p.amount || 0));
      if (units <= 0) return;
      const cost = round(units * AMMO_UNIT_CR);
      if ((state.player.credits | 0) < cost) { this.bus.emit('toast', { text: 'Insufficient credits for munitions', kind: 'error', ttl: 2 }); return; }
      // ammo is tracked as a cargo commodity (cmdty_munitions) so it integrates with the hold.
      const added = this.addToCargo(this.registryGet && this.registryGet('cargo'), state, 'cmdty_munitions', units);
      if (added <= 0) { this.bus.emit('toast', { text: 'Cargo hold full', kind: 'error', ttl: 2 }); return; }
      const realCost = round(added * AMMO_UNIT_CR);
      this.chargeCredits(realCost, 'service:ammo');
      this.bus.emit('toast', { text: `Bought ${added} munitions (${realCost}cr)`, kind: 'success', ttl: 2 });
    } else if (type === 'insurance') {
      const ins = state.player.insurance || (state.player.insurance = { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: null });
      const enable = !!p.amount;
      if (enable) {
        if (ins.insuredModules) { this.bus.emit('toast', { text: 'Hull insurance already active', kind: 'info', ttl: 2 }); return; }
        const cost = Math.max(0, Math.round(ins.deductibleCr || 0));
        if ((state.player.credits | 0) < cost) { this.bus.emit('toast', { text: 'Insufficient credits for insurance', kind: 'error', ttl: 2 }); return; }
        if (cost) this.chargeCredits(cost, 'service:insurance');
        ins.insuredModules = true;
        ins.lastStationId = (state.ui && state.ui.dockedStationId) || this._lastDockedStation || ins.lastStationId;
        this.bus.emit('toast', { text: `Hull insurance active (${cost}cr)`, kind: 'success', ttl: 2 });
      } else {
        if (!ins.insuredModules) { this.bus.emit('toast', { text: 'Hull insurance already inactive', kind: 'info', ttl: 2 }); return; }
        ins.insuredModules = false;
        this.bus.emit('toast', { text: 'Hull insurance cancelled', kind: 'info', ttl: 2 });
      }
    }
  },

  // -------------------------------------------------------------------------------------------
  // CONTRABAND SCAN & FINES
  // -------------------------------------------------------------------------------------------
  /** Active fitted smuggling capabilities. Derived ship stats are the live authority; the
   * efficiency bag remains a migration fallback for older saves/tools. */
  smugglingCapabilities(state) {
    const entity = state.entities && state.entities.get && state.entities.get(state.playerId);
    const derived = entity && entity.data && entity.data.derived || {};
    const legacy = state.player && state.player.efficiencyMods || {};
    return {
      hiddenCargoPct: clamp(Number(derived.hiddenCargoPct != null ? derived.hiddenCargoPct : legacy.hiddenCargoPct) || 0, 0, 1),
      scannerCloak: clamp(Number(derived.scannerCloak != null ? derived.scannerCloak : legacy.scannerCloak) || 0, 0, 1),
    };
  },

  /** List scan-exposed illicit stacks currently in the hold: [{ commodityId, qty, def }]. */
  illicitCargo(state) {
    const all = [];
    const items = state.player.cargo.items;
    for (const id in items) {
      const def = commodityDef(state, id);
      if (def && def.legality && def.legality !== 'legal') all.push({ commodityId: id, qty: items[id], def });
    }
    if (!all.length) return all;
    const caps = this.smugglingCapabilities(state);
    const hiddenCapacity = hiddenHoldCapacity({
      capVolume: state.player.cargo.capVolume,
      hiddenCargoPct: caps.hiddenCargoPct,
    });
    if (!(hiddenCapacity > 0)) return all;
    return remainingIllicit({ stacks: all, hiddenCapacity }).exposedStacks.map((stack) => ({
      commodityId: stack.commodityId,
      qty: stack.qty,
      def: commodityDef(state, stack.commodityId),
    }));
  },

  currentSecurity() {
    const state = this.state;
    const sid = state.world && state.world.currentSectorId;
    const sec = sid && (SECTORS.find((s) => s.id === sid));
    return sec ? sec.security : 0.5;
  },

  scannerCloak(state) {
    return this.smugglingCapabilities(state).scannerCloak;
  },

  /** Run a scan check against any contraband in the hold. Emits player:scannedByPatrol + (if found)
   *  contraband:scanned + faction:repDelta. Fines via chargeCredits; confiscates cargo. */
  runScan(p) {
    const state = this.state;
    const illicit = this.illicitCargo(state);
    const hasContraband = illicit.length > 0;
    this.bus.emit('player:scannedByPatrol', { hasContraband });
    if (!hasContraband) return { found: false };
    const security = p.security != null ? p.security : this.currentSecurity();
    const cloak = (p.scannerCloak != null ? p.scannerCloak : this.scannerCloak(state));
    const factionId = p.factionId || (p.patrolId && this.factionOfEntity(p.patrolId)) || this.scanningFaction(state);
    const hotMap = state.player.customsHotUntil || null;
    const hot = hotUntilActive(hotMap, state.simTime, factionId);
    const pScan = scanChance({ security, cloak, hot });
    const roll = this._rng();
    if (roll > pScan) {
      if (factionId) {
        if (!state.player.customsHotUntil || typeof state.player.customsHotUntil !== 'object') {
          state.player.customsHotUntil = {};
        }
        state.player.customsHotUntil[factionId] = Math.max(
          Number(state.player.customsHotUntil[factionId]) || 0,
          state.simTime + HOT_DURATION_S,
        );
      }
      return { found: false }; // evaded; this faction's gates remember the run
    }
    // CAUGHT — compute fine, confiscate, rep hit
    let fine = 0;
    const confiscated = [];
    let units = 0;
    for (const stack of illicit) {
      const mult = FINE_MULT[stack.def.legality] != null ? FINE_MULT[stack.def.legality] : (stack.def.fineMult || 1);
      fine += stack.def.basePrice * stack.qty * mult;
      confiscated.push({ commodityId: stack.commodityId, qty: stack.qty });
      units += stack.qty;
    }
    fine = round(fine);
    // confiscate the goods
    const cargoSys = this.registryGet && this.registryGet('cargo');
    for (const stack of illicit) this.removeFromCargo(cargoSys, state, stack.commodityId, stack.qty);
    // charge fine; unpaid remainder -> debt + bounty
    const credits = state.player.credits | 0;
    if (credits >= fine) {
      this.chargeCredits(fine, 'fine:contraband');
    } else {
      const unpaid = fine - credits;
      if (credits > 0) this.chargeCredits(credits, 'fine:contraband');
      state.player.debt = (state.player.debt || 0) + unpaid;
      state.player.bounty = (state.player.bounty || 0) + round(unpaid * 0.5);
    }
    // reputation hit with the scanning faction
    const repHit = -clamp(fine / 2000, REP_HIT_LO, REP_HIT_HI);
    if (factionId) this.bus.emit('faction:repDelta', { factionId, delta: round(repHit), reason: 'contraband' });
    this.bus.emit('contraband:scanned', {
      stationId: p.stationId || null, patrolId: p.patrolId || null,
      found: true, fine, confiscated, factionId: factionId || null, units,
      bribeCost: round(fine * BRIBE_FRAC),
    });
    return { found: true, fine, confiscated, factionId, repHit };
  },

  /** Bribe instead of full fine: pay 30% of the fine, keep some standing. */
  payBribe(p) {
    const fine = p.fine || 0;
    const cost = round(fine * BRIBE_FRAC);
    if ((this.state.player.credits | 0) < cost) { this.bus.emit('toast', { text: 'Cannot afford bribe', kind: 'error', ttl: 2 }); return { ok: false }; }
    this.chargeCredits(cost, 'bribe:contraband');
    return { ok: true, cost };
  },

  factionOfEntity(id) {
    const e = this.state.entities && this.state.entities.get(id);
    return e ? e.factionId : null;
  },

  /** The faction that owns customs in the current sector (defaults to SCN — the lawful navy). */
  scanningFaction(state) {
    const sid = state.world && state.world.currentSectorId;
    const sec = sid && SECTORS.find((s) => s.id === sid);
    return (sec && sec.factionId) || 'faction_scn';
  },

  // -------------------------------------------------------------------------------------------
  // ECONOMIC EVENTS
  // -------------------------------------------------------------------------------------------
  /** Inject a typed economic event onto (stationId, commodityId|'*'). type: shortage|boom|blockade|piracy. */
  injectEvent(p) {
    const state = this.state;
    const type = (p.type || 'shortage').toLowerCase();
    const stationId = p.stationId;
    if (!stationId) return null;
    this.ensureMarket(stationId);
    const market = state.economy.markets[stationId];
    if (!market) return null;
    const commodityId = p.commodityId || '*';
    const duration = p.duration || 120;
    const id = 'evt_' + (this._nextEventId++);
    // event field mods per type
    const mods = []; // {field, mult}
    let pressure = 0;
    if (type === 'shortage') { mods.push({ field: 'equilibrium', mult: 0.30 }, { field: 'spread', mult: 1.5 }); pressure = 0.7; }
    else if (type === 'boom') { mods.push({ field: 'equilibrium', mult: 2.0 }); pressure = 0.5; }
    else if (type === 'blockade') { mods.push({ field: 'drift', mult: 0.1 }, { field: 'spread', mult: 1.8 }); pressure = 0.6; }
    else if (type === 'piracy' || type === 'piracy_spike') { mods.push({ field: 'spread', mult: 1.4 }); pressure = 0.4; }
    else { mods.push({ field: 'equilibrium', mult: 0.5 }); pressure = 0.3; }

    const ev = { id, type, stationId, commodityId, field: mods[0].field, mult: mods[0].mult, startT: state.simTime, duration, pressure, mods };
    state.economy.econEvents.push(ev);
    // attach mods to the affected entries
    this.applyEventMods(market, commodityId, mods, id);
    this.bus.emit('economy:eventStarted', { eventId: id, type, stationId, commodityId, duration });
    return ev;
  },

  applyEventMods(market, commodityId, mods, eventId) {
    const apply = (entry) => { for (const m of mods) entry.eventMods.push({ field: m.field, mult: m.mult, eventId }); };
    if (commodityId === '*') { for (const cid in market) apply(market[cid]); }
    else if (market[commodityId]) apply(market[commodityId]);
  },

  /** Age active events; expire those past duration and strip their mods; emit eventEnded. */
  ageEvents(state) {
    const events = state.economy.econEvents;
    if (!events || !events.length) return;
    const keep = [];
    for (const ev of events) {
      if (state.simTime - ev.startT >= ev.duration) {
        // expire: remove its mods from every market entry
        const market = state.economy.markets[ev.stationId];
        if (market) {
          for (const cid in market) {
            const mods = market[cid].eventMods;
            if (mods && mods.length) market[cid].eventMods = mods.filter((m) => m.eventId !== ev.id);
          }
        }
        this.bus.emit('economy:eventEnded', { eventId: ev.id });
      } else {
        keep.push(ev);
      }
    }
    state.economy.econEvents = keep;
  },

  /** Roll a spontaneous event on a random known market (seeded). */
  rollSpontaneousEvent(state) {
    const stationIds = Object.keys(state.economy.markets);
    if (!stationIds.length) return;
    // cap simultaneous active events per station
    const rng = () => this._rng();
    const sid = stationIds[Math.floor(rng() * stationIds.length)];
    const active = state.economy.econEvents.filter((e) => e.stationId === sid).length;
    if (active >= MAX_EVENTS_PER_STATION) return;
    const market = state.economy.markets[sid];
    const cids = Object.keys(market);
    if (!cids.length) return;
    const cid = cids[Math.floor(rng() * cids.length)];
    const types = ['shortage', 'boom', 'blockade', 'piracy'];
    const type = types[Math.floor(rng() * types.length)];
    const duration = 90 + Math.floor(rng() * 120); // 90..210s
    this.injectEvent({ type, stationId: sid, commodityId: cid, duration });
  },

  /** Bleed event price-pressure to neighbouring stations along the sector graph (one hop). */
  propagateEvents(state) {
    const events = state.economy.econEvents;
    if (!events || !events.length) return;
    for (const ev of events) {
      if (ev.type !== 'shortage' && ev.type !== 'boom') continue;
      const info = stationInfo(state, ev.stationId);
      if (!info) continue;
      const hopPressure = ev.pressure * 0.35; // one hop decay
      if (hopPressure < 0.05) continue;
      // find stations in neighbour sectors that trade the same commodity
      for (const nSec of info.neighbors) {
        const sec = SECTORS.find((s) => s.id === nSec);
        if (!sec) continue;
        for (const st of sec.stations || []) {
          const market = state.economy.markets[st.id];
          if (!market) continue;
          const targets = ev.commodityId === '*' ? Object.keys(market) : [ev.commodityId];
          for (const cid of targets) {
            const entry = market[cid];
            if (!entry) continue;
            // shortage raises neighbour eq toward shortage (lowers stock target slightly),
            // boom raises demand. Express as a transient equilibrium nudge mod, refreshed each tick
            // (we don't persist propagation mods — recompute the blended target instead).
            // Economic pressure propagates one hop: a shortage makes neighbours scarcer (traders
            // rush supply toward the shortage, draining local stock); a boom floods neighbours too
            // (oversupply spills over). The sign was previously -1 for BOTH branches (bug: boom
            // propagated as a shortage). Now boom pushes neighbour stock UP, shortage pushes it DOWN.
            const dir = ev.type === 'shortage' ? -1 : +1;
            const nudge = entry.stock * 0.01 * hopPressure * dir;
            entry.stock = Math.max(1, entry.stock + nudge);
          }
        }
      }
    }
  },

  onBaseDestroyed(p) {
    if (p.type !== 'pirate_base' && p.stationType !== 'blackmarket') return;
    const events = this.state.economy.econEvents;
    // end piracy events tied to this station, then trigger a contraband shortage there
    for (const ev of events.slice()) {
      if (ev.type === 'piracy' && ev.stationId === p.stationId) {
        ev.duration = 0; // expire next tick
      }
    }
    if (p.stationId) this.injectEvent({ type: 'shortage', stationId: p.stationId, commodityId: 'cmdty_narcotics', duration: 240 });
  },

  // -------------------------------------------------------------------------------------------
  // helpers / glue
  // -------------------------------------------------------------------------------------------
  dockedStationId() {
    const state = this.state;
    if (state.ui && state.ui.dockedStationId) return state.ui.dockedStationId;
    if (this._lastDockedStation) return this._lastDockedStation;
    return null;
  },

  /** registry lookup (set lazily; some builds expose ctx.registry). */
  registryGet(name) {
    if (this._registry && this._registry.get) return this._registry.get(name);
    return null;
  },

  /** public getters for UI / route-planner. */
  getMarket(stationId) {
    return this.state.economy.markets[stationId] || this.ensureMarket(stationId);
  },
  priceOf(stationId, commodityId, side) {
    const m = this.getMarket(stationId);
    const e = m && m[commodityId];
    if (!e) return null;
    const info = stationInfo(this.state, stationId);
    const standing = priceModForState(this.state, info && info.factionId);
    const raw = side === 'buy' ? e.lastBuy * standing.buy : e.lastSell * standing.sell;
    return Math.max(1, round(raw));
  },

  // -------------------------------------------------------------------------------------------
  // new game / save-load
  // -------------------------------------------------------------------------------------------
  resetRng() {
    const state = this.state;
    const seed = (state.meta && state.meta.seed) || 1;
    state.economy.rngSeed = hash32(seed, 'economy');
    this._installRngFunction();
  },

  _installRngFunction() {
    const fn = () => this._rng();
    Object.defineProperty(fn, 'seed', { get: () => (this.state.economy && this.state.economy.rngSeed) || 0 });
    this.state.economy.rng = fn;
    this.rng = fn;
  },

  _rng() {
    if (!this.state.economy) this.state.economy = {};
    return drawSeeded(this.state.economy, 'rngSeed', hash32(this.state.meta && this.state.meta.seed, 'economy'));
  },

  newGame() {
    const state = this.state;
    state.economy.markets = {};
    state.economy.cycles = {};
    state.economy.econEvents = [];
    state.economy.econClock = { accumulator: 0, lastTickT: 0, ticksElapsed: 0 };
    state.economy.marketIntel = {};
    state.player.marketMemory = {};
    state.player.tradeLedger = [];
    state.player.tradeLots = {};
    state.player.tradeReceiptSeq = 0;
    this.resetRng();
    this._nextEventId = 1;
    this._eventAccumulator = 0;
    this._syntheticHistoryKeys = new Set();
    // warm the home sector's markets so prices exist before first dock
    const home = (state.world && state.world.currentSectorId) || 'sector_helios_prime';
    const sec = SECTORS.find((s) => s.id === home);
    if (sec) for (const st of sec.stations || []) this.ensureMarket(st.id, st.type, st.size);
  },

  /** Serialize stock, formula state, and bounded player-visible market history. */
  serialize() {
    const econ = this.state.economy;
    const markets = {};
    // Price history is derived from the saved stock + cycle for stations the player has never
    // inspected. Preserve the exact lived trace only where it can be player knowledge. This keeps
    // an explored market continuous while avoiding ~90k invisible history points in a populated
    // galaxy autosave; deserialize already reseeds any omitted trace from the authoritative curve.
    const durableHistoryStations = new Set([
      ...Object.keys(econ.marketIntel || {}),
      ...Object.keys(this.state.player && this.state.player.marketMemory || {}),
    ]);
    if (this._lastDockedStation) durableHistoryStations.add(this._lastDockedStation);
    for (const sid in econ.markets) {
      const m = econ.markets[sid]; const out = [];
      const preserveHistory = durableHistoryStations.has(sid);
      for (const cid in m) {
        out.push(serializeMarketRow(cid, m[cid], preserveHistory));
      }
      markets[sid] = out;
    }
    return {
      markets,
      cycles: serializeCycles(this.state),
      econEvents: (econ.econEvents || []).map((e) => ({
        ...e,
        mods: Array.isArray(e && e.mods) ? e.mods.map((mod) => ({ ...mod })) : [],
      })),
      econClock: { ...econ.econClock },
      marketIntel: cloneSaveTree(econ.marketIntel || {}),
      rngSeed: econ.rngSeed,
      nextEventId: this._nextEventId,
      eventAccumulator: Number.isFinite(this._eventAccumulator) ? this._eventAccumulator : 0,
    };
  },

  deserialize(data) {
    if (!data) return;
    const econ = this.state.economy;
    this._syntheticHistoryKeys = new Set();
    // Restore formula state before pricing so mid includes the saved wave, not a fresh invent.
    deserializeCycles(this.state, data.cycles);
    econ.markets = {};
    for (const sid in (data.markets || {})) {
      const m = data.markets[sid]; const out = {};
      const rows = Array.isArray(m)
        ? m.map((row) => deserializeMarketRow(null, row))
        : Object.entries(m).map(([cid, entry]) => deserializeMarketRow(cid, entry));
      for (const e of rows) {
        const cid = e.cid;
        if (!cid) continue;
        const def = commodityDef(this.state, cid);
        const entry = {
          stock: e.stock, equilibrium: e.equilibrium, baseEq: e.baseEq, role: e.role,
          lastMid: 0, lastBuy: 0, lastSell: 0, eventMods: deserializeEventMods(e.eventMods),
        };
        if (def) {
          this.recomputeLivePrices(entry, def, sid, cid);
          const cycle = getCycleCore(this.state, sid, cid, () => this._rng(), this.state.simTime || 0);
          const restoredHistory = sanitizeHistory(e.history);
          if (restoredHistory.length >= 2) entry.history = restoredHistory;
          else {
            this.seedPriceHistory(entry, def, cycle, this.state.simTime || 0);
            this._syntheticHistoryKeys.add(`${sid}\u001f${cid}`);
          }
        }
        out[cid] = entry;
      }
      econ.markets[sid] = out;
    }
    econ.econEvents = (data.econEvents || []).map((e) => ({ ...e }));
    econ.econClock = data.econClock || { accumulator: 0, lastTickT: 0, ticksElapsed: 0 };
    econ.marketIntel = data.marketIntel || {};
    econ.rngSeed = (Number.isFinite(data.rngSeed) && (data.rngSeed >>> 0) !== 0)
      ? data.rngSeed >>> 0
      : hash32(this.state.meta && this.state.meta.seed, 'economy');
    this._nextEventId = data.nextEventId || 1;
    this._eventAccumulator = Number.isFinite(data.eventAccumulator) ? data.eventAccumulator : 0;
    this._installRngFunction();
  },
};

function cloneSaveTree(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneSaveTree);
  const out = {};
  for (const key of Object.keys(value)) out[key] = cloneSaveTree(value[key]);
  return out;
}

// ---- exported public API (UI & other systems call without the bus) --------------------------
export function quote(stationId, commodityId, side, qty) {
  return economy._instance ? economy._instance.quote(stationId, commodityId, side, qty) : { ok: false, reason: 'no_economy' };
}
export function execute(stationId, commodityId, side, qty) {
  return economy._instance ? economy._instance.execute(stationId, commodityId, side, qty) : { ok: false, reason: 'no_economy' };
}
export function getCycle(stationId, commodityId) {
  return economy._instance ? economy._instance.getCycle(stationId, commodityId) : null;
}
economy.getCycle = function (stationId, commodityId) {
  const state = this.state;
  if (!state || !state.economy) return null;
  return getCycleCore(state, stationId, commodityId, () => this._rng(), state.simTime || 0);
};
