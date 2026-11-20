// economyCycles.js — COMPATIBILITY SHIM over the closed-form market model.
//
// ECON-BUILD-1 replaced the per-listing wave equations this file used to own with
// src/economy/marketModel.js: regimes now live on a seeded epoch grid and events
// are authored windows, so no state has to persist for a chart to keep its shape.
// What remains here is the caller-facing vocabulary other modules still import:
// the regime label words, the forecast cone shape, and the loss-ledger's manifest
// pressure input. New code should import marketModel.js directly.

import {
  REGIME_KINDS,
  regimeLabel as modelRegimeLabel,
  marketForecastFor,
  marketContextFor,
  eventsAffecting,
} from '../economy/marketModel.js';

/** Player-facing regime keys the old cycle engine rolled. Kept for any surface
 *  that still stores/displays a legacy word. */
export const CYCLE_REGIMES = Object.freeze([
  'stable', 'sine', 'rising', 'falling', 'quadratic', 'cubic',
  'sqrt', 'log', 'volatile', 'turbulent',
]);

// The closed-form regimes, expressed for readers that grew up on the cycle
// vocabulary. New kinds map through; legacy words keep their old labels.
const LEGACY_LABELS = Object.freeze({
  stable: 'Stable demand', sine: 'Cyclic demand', rising: 'Rising demand',
  falling: 'Cooling demand', quadratic: 'Curved demand', cubic: 'Inflecting market',
  sqrt: 'Easing curve', log: 'Saturating demand',
  volatile: 'Volatile pricing', turbulent: 'Turbulent market',
});

/** Human-readable label for a market regime — accepts new kinds and legacy words. */
export function regimeLabel(regime) {
  if (LEGACY_LABELS[regime]) return LEGACY_LABELS[regime];
  return modelRegimeLabel(regime);
}

/**
 * Coverage of this cone at its arrival — same contract the old drift-plus-wave
 * band carried. The closed form is deterministic; the band quotes the ±15%
 * deviation a live dent can still heal through, plus unscheduled world events.
 */
export const FORECAST_CONE_STATED_RATE = 0.99;

/**
 * Predict future mid-price curve. Under the closed form `mid` IS the formula
 * evaluated ahead (regime epoch flips and known event windows included); the
 * band around it is the live-dent recovery envelope — what the shelf can still
 * heal through before the pilot arrives.
 * Returns { t, mid, lo, hi, statedRate }[] plus named props .statedRate/.band/.eventIds.
 */
export function predictPriceCurve(state, stationId, cmdtyId, steps = 24, stepS = 5) {
  const points = marketForecastFor(state, stationId, cmdtyId, steps, stepS);
  const out = points.map((p) => {
    const half = Math.max(1, Math.round(p.mid * 0.15));
    const lo = Math.max(1, p.mid - half);
    return { t: p.t, mid: p.mid, lo, hi: p.mid + half, statedRate: FORECAST_CONE_STATED_RATE };
  });
  out.statedRate = FORECAST_CONE_STATED_RATE;
  const lastPoint = out.length ? out[out.length - 1] : null;
  out.band = lastPoint
    ? Object.freeze({ lo: lastPoint.lo, hi: lastPoint.hi, t: lastPoint.t, statedRate: FORECAST_CONE_STATED_RATE })
    : null;
  const market = state && state.economy && state.economy.markets && state.economy.markets[stationId];
  const ctx = marketContextFor(state, stationId, cmdtyId, market && market[cmdtyId]);
  const causeIds = [];
  if (ctx) {
    const now = (state && state.simTime) || 0;
    const info = eventsAffecting(ctx.seed, ctx.sectorId, stationId, cmdtyId, now,
      ctx.events, ctx.stations, ctx.goodPool);
    for (const ev of info.active) {
      if (ev && ev.id != null && !causeIds.includes(ev.id)) causeIds.push(ev.id);
    }
  }
  out.eventIds = Object.freeze(causeIds);
  return out;
}

/** A carried remote sighting counts as a live quote only inside this window. */
export const REMOTE_QUOTE_STALE_S = 900;

/**
 * Plan a two-leg route (buy leg 1, haul, sell leg 2, optionally buy leg 2's return
 * load) against caller-supplied unit prices and sighting ages. Pure arithmetic —
 * the route computer feeds it remembered quotes, and the estimate/stale marks are
 * the Part-F honesty contract: an old remote sighting stays an estimate, never a
 * fresh present quote.
 */
export function evaluateTwoLegItinerary({
  credits = 0,
  cargoFree = 0,
  leg1 = {},
  leg2 = {},
  now = null,
} = {}) {
  const unit1 = Math.max(0, Number(leg1.unitCr) || 0);
  const fee1 = Math.max(0, Number(leg1.feeCr) || 0);
  const vol1 = Math.max(0, Number(leg1.unitVolume) || 1);
  const want1 = Math.max(0, Math.floor(Number(leg1.qty) || 0));
  const stock1 = Math.max(0, Math.floor(Number(leg1.stock) || 0));
  const affordable1 = unit1 > 0 ? Math.floor(Math.max(0, credits - fee1) / unit1) : 0;
  const room1 = Math.floor(Math.max(0, Number(cargoFree) || 0) / vol1);
  const taken = Math.min(want1, affordable1, room1, stock1);
  const spent = taken > 0 ? taken * unit1 + fee1 : 0;
  const creditsAfter = credits - spent;
  const seenAt = Number.isFinite(Number(leg2.seenAt)) ? Math.max(0, Number(leg2.seenAt)) : null;
  const nowS = Number.isFinite(Number(now)) ? Number(now) : null;
  // A carried sighting is fresh only while the caller's clock proves it inside the window;
  // an unverifiable or old sighting stays an estimate instead of reading as a live quote.
  const stale = leg2.stale === true
    || (seenAt != null && !(nowS != null && nowS - seenAt < REMOTE_QUOTE_STALE_S));
  const estimate = leg2.quoted !== true || stale;
  const fee2 = Math.max(0, Number(leg2.feeCr) || 0);
  const sellUnit = estimate ? null : Math.max(0, Number(leg2.unitCr) || 0);
  const sellWant = Math.max(0, Math.floor(Number(leg2.qty) || taken));
  const sellStock = leg2.stock == null ? taken : Math.max(0, Math.floor(Number(leg2.stock) || 0));
  const sold = Math.min(taken, sellWant, sellStock);
  const afterSale = estimate ? null : creditsAfter + sold * sellUnit - (sold > 0 ? fee2 : 0);
  const freeAfter = Math.max(0, (Number(cargoFree) || 0) - taken * vol1 + sold * vol1);
  const buyUnit = Math.max(0, Number(leg2.buyUnitCr) || 0);
  const buyVol = Math.max(0, Number(leg2.buyVolume) || vol1);
  const buyWant = Math.max(0, Math.floor(Number(leg2.buyQty) || 0));
  const buyStock = leg2.buyStock == null ? buyWant : Math.max(0, Math.floor(Number(leg2.buyStock) || 0));
  let bought = 0;
  let limit = estimate ? 'estimate' : null;
  if (!estimate && buyUnit > 0 && buyWant > 0) {
    const afford = Math.floor(Math.max(0, afterSale) / buyUnit);
    const room = Math.floor(freeAfter / buyVol);
    bought = Math.min(buyWant, afford, room, buyStock);
    if (bought < buyWant) {
      if (afford <= room && afford <= buyStock) limit = 'credits';
      else if (room <= buyStock) limit = 'volume';
      else limit = 'stock';
    }
  }
  return {
    leg1Taken: taken,
    spentCr: spent,
    feeCr: (taken > 0 ? fee1 : 0) + (!estimate && sold > 0 ? fee2 : 0),
    creditsAfter: estimate ? creditsAfter : afterSale,
    leg2SellQty: estimate ? null : sold,
    leg2BuyQty: estimate ? 0 : bought,
    limit,
    estimate,
    quoted: leg2.quoted === true,
    stale,
    seenAt,
    guaranteed: false,
    settlement: 'market',
  };
}

// ECON-08 — a loss you caused moves the price through the SAME shelf-dent funnel every
// other scarcity path uses (economy.applyStockPressure, fed via economy:applyTradePressure
// with a negative vol = buy-side drain). Pure: resolves the primary shipped line +
// destination from a cargo manifest and clamps the pressure volume to the bounds
// applyStockPressure enforces (finite, 1..1_000_000). No price model here — just the
// existing path's input contract.
export function lostShipmentPressure(manifest) {
  if (!manifest || typeof manifest !== 'object') return null;
  const destStationId = typeof manifest.destStationId === 'string' && manifest.destStationId
    ? manifest.destStationId
    : (typeof manifest.destinationId === 'string' && manifest.destinationId ? manifest.destinationId : null);
  const lines = Array.isArray(manifest.lines) ? manifest.lines : [];
  let primary = null;
  for (const line of lines) {
    const commodityId = line && typeof line.commodityId === 'string' ? line.commodityId : null;
    const qty = Math.max(0, Math.floor(Number(line && line.qty) || 0));
    if (!commodityId || qty <= 0) continue;
    if (!primary || qty > primary.qty
      || (qty === primary.qty && commodityId < primary.commodityId)) {
      primary = { commodityId, qty };
    }
  }
  if (!primary || !destStationId) return null;
  const vol = Math.max(1, Math.min(1000000, primary.qty));
  if (!Number.isFinite(vol)) return null;
  return { stationId: destStationId, commodityId: primary.commodityId, vol };
}
