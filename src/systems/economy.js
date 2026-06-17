// economy system — stock-based market economy + SOLE writer of state.player.credits.
// Contract: ARCHITECTURE §0.6 (single-writer credits), §0.12/§0.13 (cargo: volume is the only
// hard cap), §3.6 (economy schema), §4.4 (master event table), design/specs/03-economy-trading.md.
//
// MODEL (reconciled with the spec's worked-route anchor — see "PRICING NOTE" below):
//   Each station S owns a market: cmdtyId -> MarketEntry {stock, equilibrium, baseEq, role,
//   lastMid, lastBuy, lastSell, eventMods}. Price is a pure function of (stock / baseEq):
//     mid = basePrice * clamp((stock/baseEq)^(-elasticity), 0.40, 2.60)
//   - baseEq      = pricing reference (baseEqDefault * sizeFactor). At stock==baseEq, mid==basePrice.
//   - equilibrium = stock DRIFT TARGET (role- & event-modified). Producers drift stock ABOVE baseEq
//                   (surplus -> cheap, they sell what they make); consumers drift BELOW (shortage ->
//                   dear, they buy what they need). This surplus/shortage gradient is what makes
//                   A->B routes profitable.
//   Buy = mid*(1+spread/2), Sell = mid*(1-spread/2). Large trades move stock unit-by-unit (closed-
//   form integral of the price curve), so each route has a capacity sweet spot (diminishing margin).
//
//   PRICING NOTE: §3.6's literal `effectiveEq = baseEq*roleFactor*...` used as BOTH the price
//   reference AND the drift target collapses every market to basePrice (stock drifts to eq, price
//   uses eq -> ratio 1). The spec's own worked route (refinery produce mid 62.2, fab consume mid
//   146; 40u ~2.5k / 200u ~10k / 800u ~19k profit, 80-90% ROI early) only reproduces when the
//   price reference is the FIXED baseEq and the role multiplies the stock target. We honor the
//   schema field names (equilibrium = role-modified drift target, baseEq = fixed reference) and
//   reproduce the anchor numbers. Verified numerically.
import { COMMODITIES } from '../data/commodities.js';
import { SECTORS } from '../data/sectors.js';
import { addCargo, removeCargo } from './cargo.js';

// ---- tunables (design/specs/03 "Formulas") ------------------------------------------------
const BASE_EQ_DEFAULT = 1000;      // baseEq before sizeFactor
const ROLE_FACTOR = { produce: 2.0, consume: 0.35, none: 0 };
const SIZE_FACTOR = { S: 0.5, M: 1, L: 2 };
const PRICE_MULT_LO = 0.40, PRICE_MULT_HI = 2.60;
const SPREAD_BASE = 0.08;          // 8% house edge
const SPREAD_LO = 0.04, SPREAD_HI = 0.40;
const FRONTIER_SPREAD_BONUS = 0.06; // low-wealth stations widen the spread up to +6%
const DRIFT_RATE = 0.006;          // per-second; half-life ~ln2/0.006 ~= 1.9 min over a 5s tick
const ECON_TICK_S = 5;             // economy ticks every 5s of sim time
const EVENT_INTERVAL_S = 90;       // average seconds between spontaneous economic events (game-wide)
const EQ_MULT_CLAMP = [0.25, 4.0]; // clamp net event/propagation eq multiplier per (station,cmdty)
const MAX_EVENTS_PER_STATION = 3;
const BASE_SCAN = 0.25;            // p_scan = clamp(BASE_SCAN*(1+security) - cloak, 0.02, 0.95)
const SCAN_LO = 0.02, SCAN_HI = 0.95;
const FINE_MULT = { legal: 0, restricted: 0.8, illegal: 1.2, contraband: 1.5 };
const REP_HIT_LO = 2, REP_HIT_HI = 25;
const BRIBE_FRAC = 0.30;

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

// station id -> { type, size, factionId, sectorId, neighbors:[sectorId] } from the SECTORS graph.
// (world is the runtime owner of sectors, but dock:docked only hands us a stationId, so we resolve
//  the station's profile straight from the data catalog — same pattern ships/cargo use.)
const STATION_INFO = new Map();
for (const sec of SECTORS) {
  for (const st of sec.stations || []) {
    STATION_INFO.set(st.id, {
      type: st.type, size: st.size || 'M', factionId: st.factionId,
      sectorId: sec.id, neighbors: sec.neighbors || [], security: sec.security,
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
                   sectorId: sec.id, neighbors: sec.neighbors || [], security: sec.security };
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
function priceMult(stock, baseEq, elasticity) {
  return clamp(Math.pow(Math.max(stock, 1) / baseEq, -elasticity), PRICE_MULT_LO, PRICE_MULT_HI);
}

/** Closed-form average mid over a stock interval [sLo, sHi] (the price-impact integral).
 *  mid(s) = basePrice * baseEq^el * s^(-el); ∫ s^-el ds = s^(1-el)/(1-el).
 *  avg = basePrice*baseEq^el/((1-el)*ΔN) * (sHi^(1-el) - sLo^(1-el)); el==1 -> ln form. */
function avgMid(basePrice, baseEq, el, sLo, sHi) {
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

/** Effective stock drift target = equilibrium (role*size*BASE_EQ) * event eq mods, clamped. */
function effectiveEq(entry) {
  const m = clamp(eventModMult(entry, 'equilibrium'), EQ_MULT_CLAMP[0], EQ_MULT_CLAMP[1]);
  return entry.equilibrium * m;
}

/** Effective spread for a market entry (base * event spread mods * frontier penalty), clamped. */
function spreadOf(entry, frontierPenalty) {
  const ev = eventModMult(entry, 'spread');
  return clamp(SPREAD_BASE * ev * (1 + (frontierPenalty || 0)), SPREAD_LO, SPREAD_HI);
}

// ---------------------------------------------------------------------------------------------

export const economy = {
  name: 'economy',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._registry = ctx.registry || null;
    this._lastDockedStation = null;
    economy._instance = this; // so exported quote()/execute() reach the live system

    const state = this.state, bus = this.bus;
    if (!state.economy) state.economy = { markets: {}, econEvents: [], econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 }, marketIntel: {} };
    if (!state.economy.markets) state.economy.markets = {};
    if (!state.economy.econEvents) state.economy.econEvents = [];
    if (!state.economy.econClock) state.economy.econClock = { accumulator: 0, lastTickT: 0, ticksElapsed: 0 };
    if (!state.economy.marketIntel) state.economy.marketIntel = {};
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

    // ---- NPC / passive-income trades route through the same execute path (self-balancing) --
    bus.on('aiTrader:requestTrade', (p) => { if (p) this.execute(p.stationId, p.commodityId, p.side, p.qty); });
    bus.on('miningDrone:sellOre', (p) => { if (p) this.execute(p.stationId, p.commodityId || p.good, 'sell', p.qty); });
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

    // 3) drift every station+commodity stock toward effectiveEq, recompute cached prices
    const markets = econ.markets;
    for (const sid in markets) {
      const market = markets[sid];
      const info = stationInfo(state, sid);
      const frontier = info ? this.frontierPenalty(info) : 0;
      for (const cid in market) {
        const entry = market[cid];
        const def = commodityDef(state, cid);
        if (!def) continue;
        const eff = effectiveEq(entry);
        const driftMod = eventModMult(entry, 'drift'); // BLOCKADE freezes drift (mult 0.1)
        // stock' = clamp(stock + DRIFT_RATE*driftMod*(eff - stock)*dt, 0, cap)
        entry.stock = Math.max(0, entry.stock + DRIFT_RATE * driftMod * (eff - entry.stock) * tickDt);
        this.recomputePrices(entry, def, frontier);
      }
    }

    // 4) propagate event pressure to neighbour stations (along the sector graph)
    this.propagateEvents(state);

    this.bus.emit('economy:tick', { t: state.simTime, ticksElapsed: clock.ticksElapsed });
  },

  /** Cache lastMid/lastBuy/lastSell on an entry from its current stock. */
  recomputePrices(entry, def, frontierPenalty) {
    const mid = def.basePrice * priceMult(entry.stock, entry.baseEq, def.elasticity);
    const spread = spreadOf(entry, frontierPenalty);
    entry.lastMid = mid;
    entry.lastBuy = round(mid * (1 + spread / 2));
    entry.lastSell = round(mid * (1 - spread / 2));
    return entry;
  },

  /** Frontier (low-wealth) stations widen the spread. Derived from sector security. */
  frontierPenalty(info) {
    const sec = (info && info.security != null) ? info.security : 0.7;
    // low security -> up to +FRONTIER_SPREAD_BONUS
    return clamp((1 - sec) * FRONTIER_SPREAD_BONUS, 0, FRONTIER_SPREAD_BONUS);
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
    const sizeFactor = SIZE_FACTOR[sz] || 1;
    const baseEqRef = BASE_EQ_DEFAULT * sizeFactor; // fixed pricing reference
    const allowContraband = toleratesContraband(info);

    const market = {};
    for (const def of COMMODITIES) {
      const role = roleFor(def, type);
      if (role === 'none') continue;                  // commodity not traded here (hidden)
      // contraband/illegal only appears at blackmarket-tolerant stations
      if (def.legality === 'contraband' || def.legality === 'illegal') {
        if (!allowContraband) continue;
      }
      const equilibrium = baseEqRef * (ROLE_FACTOR[role] || 0); // stock drift target
      const stock = equilibrium;                                 // start at rest
      const entry = {
        stock, equilibrium, baseEq: baseEqRef, role,
        lastMid: 0, lastBuy: 0, lastSell: 0, eventMods: [],
      };
      const frontier = info ? this.frontierPenalty(info) : 0;
      this.recomputePrices(entry, def, frontier);
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
      snapshot[cid] = { mid: e.lastMid, buy: e.lastBuy, sell: e.lastSell, stock: e.stock, role: e.role };
    }
    state.economy.marketIntel[stationId] = { snapshot, seenAtT: state.simTime };
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
    if (qty <= 0) {
      const u = side === 'buy' ? entry.lastBuy : entry.lastSell;
      return { ok: false, reason: 'qty', unitAvg: u, total: 0, priceImpactPct: 0, stockAfter: entry.stock, legalityWarning: def.legality !== 'legal' ? def.legality : null };
    }
    const info = stationInfo(state, stationId);
    const frontier = info ? this.frontierPenalty(info) : 0;
    const spread = spreadOf(entry, frontier);
    const el = def.elasticity;
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
    const unitAvg = side === 'buy' ? avgMidPrice * (1 + spread / 2) : avgMidPrice * (1 - spread / 2);
    const total = round(unitAvg * qty);
    const beforeMid = def.basePrice * priceMult(entry.stock, entry.baseEq, el);
    const afterMid = def.basePrice * priceMult(stockAfter, entry.baseEq, el);
    const priceImpactPct = beforeMid > 0 ? ((afterMid - beforeMid) / beforeMid) * 100 : 0;
    return {
      ok: true, stationId, commodityId, side, qty,
      unitAvg, total,
      priceImpactPct, stockAfter,
      legalityWarning: def.legality !== 'legal' ? def.legality : null,
    };
  },

  /** execute(stationId, cmdtyId, side, qty) -> { ok, qty, unitAvg, total, profit?, reason }.
   *  Validate-then-apply (transactional): a failed credit/cargo/stock check changes nothing. */
  execute(stationId, commodityId, side, qty) {
    const state = this.state;
    qty = Math.max(0, Math.floor(qty || 0));
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
      this.recomputePrices(entry, def, this.frontierPenaltyFor(state, stationId));
      const unitAvg = realCost / realQty;
      this.afterTrade(state, stationId, commodityId, 'buy', realQty, unitAvg, realCost, fq.priceImpactPct, def, null);
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
      this.recomputePrices(entry, def, this.frontierPenaltyFor(state, stationId));
      const unitAvg = realGross / realQty;
      // profit estimate: sale proceeds minus the goods' base value (for stats/ledger)
      const profit = round(realGross - def.basePrice * realQty);
      this.afterTrade(state, stationId, commodityId, 'sell', realQty, unitAvg, realGross, fq.priceImpactPct, def, profit);
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
  afterTrade(state, stationId, commodityId, side, qty, unitAvg, total, priceImpactPct, def, profit) {
    const info = stationInfo(state, stationId);
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
    });
  },

  /** UI/NPC entry: validate against the docked station context then execute. */
  handleTrade(commodityId, side, qty) {
    const state = this.state;
    const stationId = this.dockedStationId();
    if (!stationId) { this.bus.emit('toast', { text: 'Not docked', kind: 'error', ttl: 2 }); return; }
    const res = this.execute(stationId, commodityId, side, qty);
    if (!res.ok) {
      const msg = res.reason === 'credits' ? 'Insufficient credits'
        : res.reason === 'cargo_full' ? 'Cargo hold full'
        : res.reason === 'no_cargo' ? 'Nothing to sell'
        : res.reason === 'no_stock' ? 'Station out of stock'
        : 'Trade failed';
      this.bus.emit('toast', { text: msg, kind: 'error', ttl: 2 });
    }
    return res;
  },

  /** Move stock without crediting anyone (automation trade pressure). */
  applyStockPressure(stationId, commodityId, side, qty) {
    const state = this.state;
    const market = state.economy.markets[stationId] || this.ensureMarket(stationId);
    const entry = market && market[commodityId];
    const def = commodityDef(state, commodityId);
    if (!entry || !def || !(qty > 0)) return;
    if (side === 'buy') entry.stock = Math.max(1, entry.stock - qty);
    else entry.stock = entry.stock + qty;
    this.recomputePrices(entry, def, this.frontierPenaltyFor(state, stationId));
  },

  // -------------------------------------------------------------------------------------------
  // CREDITS — SOLE WRITER (§0.6). Everyone else emits economy:grant/chargeCredits.
  // -------------------------------------------------------------------------------------------
  grantCredits(amount, reason) {
    amount = Math.round(amount || 0);
    if (amount === 0) return this.state.player.credits;
    const p = this.state.player;
    p.credits = Math.max(0, (p.credits | 0) + amount);
    this.bus.emit('credits:changed', { delta: amount, reason: reason || 'grant', total: p.credits });
    return p.credits;
  },

  chargeCredits(amount, reason) {
    amount = Math.round(amount || 0);
    if (amount === 0) return this.state.player.credits;
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
      if ((state.player.credits | 0) < cost) { this.bus.emit('toast', { text: 'Insufficient credits for fuel', kind: 'error', ttl: 2 }); return; }
      this.chargeCredits(cost, 'service:refuel');
      fuel.current = Math.min(fuel.max, fuel.current + units);
      this.bus.emit('fuel:changed', { current: fuel.current, max: fuel.max });
      this.bus.emit('toast', { text: `Refueled (${round(units)}u, ${cost}cr)`, kind: 'success', ttl: 2 });
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
        ins.lastStationId = state.ui && state.ui.docked ? state.ui.docked : ins.lastStationId;
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
  /** List illicit stacks currently in the hold: [{ commodityId, qty, def }]. */
  illicitCargo(state) {
    const out = [];
    const items = state.player.cargo.items;
    for (const id in items) {
      const def = commodityDef(state, id);
      if (def && def.legality && def.legality !== 'legal') out.push({ commodityId: id, qty: items[id], def });
    }
    return out;
  },

  currentSecurity() {
    const state = this.state;
    const sid = state.world && state.world.currentSectorId;
    const sec = sid && (SECTORS.find((s) => s.id === sid));
    return sec ? sec.security : 0.5;
  },

  scannerCloak(state) {
    // optional ship perk; defaults 0. (efficiencyMods could carry a cloak rating in future.)
    const em = state.player && state.player.efficiencyMods;
    return (em && em.scannerCloak) || 0;
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
    const pScan = clamp(BASE_SCAN * (1 + security) - cloak, SCAN_LO, SCAN_HI);
    const roll = this.rng ? this.rng() : Math.random();
    if (roll > pScan) return { found: false }; // evaded
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
    const factionId = p.factionId || (p.patrolId && this.factionOfEntity(p.patrolId)) || this.scanningFaction(state);
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
    const rng = this.rng || Math.random;
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
            // Simpler & determinism-safe: nudge stock toward the pressured direction by a small frac.
            const dir = ev.type === 'shortage' ? -1 : -1; // both pull neighbour stock down (scarcer)
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
    return side === 'buy' ? e.lastBuy : e.lastSell;
  },

  // -------------------------------------------------------------------------------------------
  // new game / save-load
  // -------------------------------------------------------------------------------------------
  resetRng() {
    const state = this.state;
    const seed = (state.meta && state.meta.seed) || 1;
    const streamSeed = (this.helpers && this.helpers.hash32)
      ? this.helpers.hash32(seed, 'economy')
      : ((seed * 2654435761) >>> 0);
    state.economy.rng = (this.helpers && this.helpers.mulberry32)
      ? this.helpers.mulberry32(streamSeed >>> 0)
      : mulberryLocal(streamSeed >>> 0);
    this.rng = state.economy.rng;
  },

  newGame() {
    const state = this.state;
    state.economy.markets = {};
    state.economy.econEvents = [];
    state.economy.econClock = { accumulator: 0, lastTickT: 0, ticksElapsed: 0 };
    state.economy.marketIntel = {};
    this.resetRng();
    this._nextEventId = 1;
    this._eventAccumulator = 0;
    // warm the home sector's markets so prices exist before first dock
    const home = (state.world && state.world.currentSectorId) || 'sector_helios_prime';
    const sec = SECTORS.find((s) => s.id === home);
    if (sec) for (const st of sec.stations || []) this.ensureMarket(st.id, st.type, st.size);
  },

  /** Serialize stock + equilibrium + baseEq + role + eventMods (prices recomputed on load). */
  serialize() {
    const econ = this.state.economy;
    const markets = {};
    for (const sid in econ.markets) {
      const m = econ.markets[sid]; const out = {};
      for (const cid in m) {
        const e = m[cid];
        out[cid] = { stock: e.stock, equilibrium: e.equilibrium, baseEq: e.baseEq, role: e.role, eventMods: (e.eventMods || []).map((x) => ({ field: x.field, mult: x.mult, eventId: x.eventId })) };
      }
      markets[sid] = out;
    }
    return {
      markets,
      econEvents: (econ.econEvents || []).map((e) => ({ ...e })),
      econClock: { ...econ.econClock },
      marketIntel: econ.marketIntel,
      nextEventId: this._nextEventId,
    };
  },

  deserialize(data) {
    if (!data) return;
    const econ = this.state.economy;
    econ.markets = {};
    for (const sid in (data.markets || {})) {
      const m = data.markets[sid]; const out = {};
      for (const cid in m) {
        const e = m[cid];
        const def = commodityDef(this.state, cid);
        const entry = {
          stock: e.stock, equilibrium: e.equilibrium, baseEq: e.baseEq, role: e.role,
          lastMid: 0, lastBuy: 0, lastSell: 0, eventMods: (e.eventMods || []).slice(),
        };
        if (def) this.recomputePrices(entry, def, this.frontierPenaltyFor(this.state, sid));
        out[cid] = entry;
      }
      econ.markets[sid] = out;
    }
    econ.econEvents = (data.econEvents || []).map((e) => ({ ...e }));
    econ.econClock = data.econClock || { accumulator: 0, lastTickT: 0, ticksElapsed: 0 };
    econ.marketIntel = data.marketIntel || {};
    this._nextEventId = data.nextEventId || 1;
    this._eventAccumulator = 0;
    this.resetRng();
  },
};

// ---- exported public API (UI & other systems call without the bus) --------------------------
export function quote(stationId, commodityId, side, qty) {
  return economy._instance ? economy._instance.quote(stationId, commodityId, side, qty) : { ok: false, reason: 'no_economy' };
}
export function execute(stationId, commodityId, side, qty) {
  return economy._instance ? economy._instance.execute(stationId, commodityId, side, qty) : { ok: false, reason: 'no_economy' };
}

// ---- local PRNG fallback (only if core helpers absent, e.g. isolated unit test) --------------
function mulberryLocal(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
