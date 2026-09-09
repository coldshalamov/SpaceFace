// marketIntelligence.js — ECON-P3 "Market Intelligence Honesty".
//
// Pure view model over player.marketMemory (+ tradeLedger for receipts). Surfaces what the
// pilot has *actually seen* — age-banded tints, best-known visited-only lanes, survey provenance,
// and cost-basis trade profit/margin receipts — without inventing live prices for unknown stations.
//
// CRITICAL DISCIPLINE (failure modes, enforced structurally):
//   • PURE — no DOM, no Math.random, no Date.now, no event emit, no state mutation.
//   • VISITED ONLY — reads player.marketMemory exclusively for quotes. Never peeks
//     state.economy.markets / live unknown stations (no omniscience).
//   • ONE PRICE SOURCE — never re-runs the economy integral. Margin/profit on trade receipts
//     come from ledger fields as recorded (buyUnit/marginPerUnit/profit). Best-known lane margin
//     is display arithmetic on remembered buy/sell quotes only (sell − buy), not a second formula.
//   • STALE IS HONEST — age bands fade; best-known always carries STALE_CAVEAT.
//   • CORRUPT FAILS CLOSED — garbage memory/ledger yields empty/null, never throws.
//
// noTouch: market.js / starmap.js / galaxyMap.js / localmap.js / hud.js / economy.js / world.js /
// save / registry / package / goldens. Budget: spawn:none · voice:none · draw:none.

import { summarizeDemandDrivers } from './demandDriverSummary.js';

/** Fresh band upper bound (seconds) — matches starmap memoryTint + SPEC2/05. */
export const AGE_BAND_FRESH_S = 600;
/** Mid band upper bound (seconds) — older than this is "old" gray italic. */
export const AGE_BAND_MID_S = 3600;
/** Hollow fade gate (seconds) — SPEC3-11: >15 min renders hollow. */
export const AGE_HOLLOW_S = 900;

/**
 * Honest caption for any best-known suggestion. Never presents memory as live certainty.
 * SPEC3-11: "best known margin — prices may have moved."
 */
export const STALE_CAVEAT = 'best known — prices may have moved';

/** Allowed provenance tags on a memory quote. Anything else is treated as unknown/excluded. */
export const PROVENANCE = Object.freeze({
  dock: 'dock',
  survey: 'survey',
});

const PROVENANCE_LABEL = Object.freeze({
  dock: 'visited dock',
  survey: 'survey packet',
});

/**
 * ageBandFor(ageS) → { key, color, italic, hollow, fade }
 *
 * PURE. Age bands match the shipped starmap tint contract:
 *   fresh < 10 min → cyan solid
 *   mid   < 60 min → white solid
 *   old   ≥ 60 min → gray italic
 * Hollow when age ≥ 15 min (stale fade). `fade` is a 1→0 display weight (1 = rock solid).
 */
export function ageBandFor(ageS) {
  const age = finiteNonNeg(ageS);
  let key = 'old';
  let color = 'gray';
  let italic = true;
  if (age < AGE_BAND_FRESH_S) {
    key = 'fresh';
    color = 'cyan';
    italic = false;
  } else if (age < AGE_BAND_MID_S) {
    key = 'mid';
    color = 'white';
    italic = false;
  }
  const hollow = age >= AGE_HOLLOW_S;
  // Linear fade over the mid window; clamps so old quotes stay faintly readable (never invent).
  const fade = clamp01(1 - age / AGE_BAND_MID_S);
  return { key, color, italic, hollow, fade, ageS: age };
}

/**
 * ageLabelFor(ageS) → short chip text ("fresh" | "N min").
 * Matches starmap ageText so chips agree across surfaces.
 */
export function ageLabelFor(ageS) {
  const age = finiteNonNeg(ageS);
  if (age < 60) return 'fresh';
  return Math.max(1, Math.round(age / 60)) + ' min';
}

/**
 * quoteProvenance(quote) → { source, label } | null
 *
 * PURE. Dock is the default when source is missing (economy.recordMarketMemory writes dock
 * snapshots without a tag). Explicit `survey` is labeled as survey-packet provenance.
 * Unknown / corrupt source tags fail closed (null) so they never masquerade as live intel.
 */
export function quoteProvenance(quote) {
  if (!quote || typeof quote !== 'object') return null;
  const raw = quote.source;
  if (raw == null || raw === '' || raw === PROVENANCE.dock || raw === 'visit' || raw === 'market') {
    return { source: PROVENANCE.dock, label: PROVENANCE_LABEL.dock };
  }
  if (raw === PROVENANCE.survey) {
    return { source: PROVENANCE.survey, label: PROVENANCE_LABEL.survey };
  }
  return null; // unknown provenance — fail closed
}

/**
 * knownStationQuotes(memory, commodityId, nowS) → QuoteView[]
 *
 * PURE. Enumerates ONLY stations present in player.marketMemory for the commodity.
 * Skips missing/corrupt quotes (no buy AND no sell, non-objects, bad ids). Never consults
 * live markets — unknown stations simply do not appear.
 *
 * QuoteView: {
 *   stationId, commodityId, buy, sell, seenAt, ageS, ageLabel,
 *   band:{key,color,italic,hollow,fade}, provenance:{source,label}|null, staleCaveat
 * }
 */
export function knownStationQuotes(memory, commodityId, nowS) {
  if (!isPlainObject(memory) || !commodityId) return [];
  const now = finiteNonNeg(nowS);
  const out = [];
  const ids = Object.keys(memory).sort();
  for (const stationId of ids) {
    if (!stationId) continue;
    const stationMem = memory[stationId];
    if (!isPlainObject(stationMem)) continue;
    const quote = stationMem[commodityId];
    const view = quoteView(stationId, commodityId, quote, now);
    if (view) out.push(view);
  }
  return out;
}

/**
 * bestKnownSell(memory, commodityId, nowS) → QuoteView | null
 *
 * Highest remembered sell among visited stations only. Tie-break: lower stationId.
 * Always attaches STALE_CAVEAT. null when nothing known.
 */
export function bestKnownSell(memory, commodityId, nowS) {
  return pickBest(knownStationQuotes(memory, commodityId, nowS), 'sell', true);
}

/**
 * bestKnownSellAtStations(memory, stationIds, commodityId, nowS) → QuoteView | null
 *
 * Highest remembered sell across a caller-owned station set. This is the sector-map seam: it
 * keeps multi-station sectors honest without assuming stations[0] represents the whole sector.
 * Unknown stations remain excluded because the only quote source is player.marketMemory.
 */
export function bestKnownSellAtStations(memory, stationIds, commodityId, nowS) {
  const allowed = new Set(
    Array.isArray(stationIds)
      ? stationIds.filter((stationId) => stationId != null && stationId !== '').map(String)
      : [],
  );
  if (!allowed.size) return null;
  const quotes = knownStationQuotes(memory, commodityId, nowS)
    .filter((quote) => allowed.has(quote.stationId));
  return pickBest(quotes, 'sell', true);
}

/**
 * bestKnownBuy(memory, commodityId, nowS) → QuoteView | null
 *
 * Lowest remembered buy among visited stations only (cheapest place to load).
 * Tie-break: lower stationId. Always attaches STALE_CAVEAT.
 */
export function bestKnownBuy(memory, commodityId, nowS) {
  return pickBest(knownStationQuotes(memory, commodityId, nowS), 'buy', false);
}

/**
 * bestKnownMarginLane(memory, commodityId, nowS) → LaneView | null
 *
 * One suggested lane over known memory only: best pairwise (buy@A → sell@B, A≠B) by
 * remembered sell − buy. Margin is pure display arithmetic on memory quotes —
 * NOT a recompute of economy pricing, fuel, or risk. Caption is always STALE_CAVEAT.
 * Tie-break: higher margin, then lower buyStationId, then lower sellStationId.
 *
 * LaneView: {
 *   commodityId, buyStationId, sellStationId, buy, sell, marginPerUnit,
 *   buyQuote, sellQuote, caveat, honest:true
 * }
 */
export function bestKnownMarginLane(memory, commodityId, nowS) {
  const quotes = knownStationQuotes(memory, commodityId, nowS);
  if (quotes.length < 2) return null;
  let best = null;
  for (const a of quotes) {
    if (!Number.isFinite(a.buy)) continue;
    for (const b of quotes) {
      if (a.stationId === b.stationId) continue;
      if (!Number.isFinite(b.sell)) continue;
      const marginPerUnit = Math.round(b.sell - a.buy);
      const candidate = {
        commodityId: String(commodityId),
        buyStationId: a.stationId,
        sellStationId: b.stationId,
        buy: a.buy,
        sell: b.sell,
        marginPerUnit,
        buyQuote: a,
        sellQuote: b,
        caveat: STALE_CAVEAT,
        honest: true,
      };
      if (!best) {
        best = candidate;
        continue;
      }
      if (candidate.marginPerUnit > best.marginPerUnit) {
        best = candidate;
        continue;
      }
      if (candidate.marginPerUnit < best.marginPerUnit) continue;
      if (candidate.buyStationId < best.buyStationId) {
        best = candidate;
        continue;
      }
      if (
        candidate.buyStationId === best.buyStationId &&
        candidate.sellStationId < best.sellStationId
      ) {
        best = candidate;
      }
    }
  }
  return best;
}

/**
 * tradeMarginReceipt(entry) → ReceiptView | null
 *
 * PURE. Surfaces the ledger's recorded cost-basis fields. Does NOT recompute profit from
 * basePrice or live quotes (no second formula). Corrupt/incomplete entries fail closed → null.
 *
 * ReceiptView: {
 *   stationId, commodityId, side, qty, unit, buyUnit, marginPerUnit, profit, total, seenAt,
 *   honest:true
 * }
 */
export function tradeMarginReceipt(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const side = entry.side === 'buy' || entry.side === 'sell' ? entry.side : null;
  if (!side) return null;
  const commodityId = entry.commodityId != null ? String(entry.commodityId) : '';
  if (!commodityId) return null;
  const qty = Math.floor(Number(entry.qty));
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const unit = roundFinite(entry.unit);
  if (unit == null) return null;
  // Sell receipts carry cost-basis margin; buy receipts record basis (profit 0).
  const buyUnit = roundFinite(entry.buyUnit != null ? entry.buyUnit : (side === 'buy' ? entry.unit : null));
  const marginPerUnit = roundFinite(entry.marginPerUnit != null ? entry.marginPerUnit : 0);
  const profit = roundFinite(entry.profit != null ? entry.profit : 0);
  if (marginPerUnit == null || profit == null) return null;
  const total = roundFinite(entry.total != null ? entry.total : unit * qty);
  if (total == null) return null;
  return {
    stationId: entry.stationId != null ? String(entry.stationId) : null,
    commodityId,
    side,
    qty,
    unit,
    buyUnit: buyUnit != null ? buyUnit : unit,
    marginPerUnit,
    profit,
    total,
    seenAt: finiteNonNeg(entry.seenAt),
    honest: true,
  };
}

/**
 * tradeMarginReceipts(ledger, limit=10) → ReceiptView[]
 *
 * PURE. Latest-first ledger rows as honest receipts. Skips corrupt entries.
 */
export function tradeMarginReceipts(ledger, limit = 10) {
  if (!Array.isArray(ledger)) return [];
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  const out = [];
  for (const entry of ledger) {
    if (out.length >= cap) break;
    const receipt = tradeMarginReceipt(entry);
    if (receipt) out.push(receipt);
  }
  return out;
}

/**
 * marketIntelligence(state, commodityId) → IntelligenceView
 *
 * Composite pure view over state.player.marketMemory + tradeLedger at state.simTime.
 * Never reads live economy markets. Corrupt/missing state fails closed to empty bags.
 *
 * IntelligenceView: {
 *   commodityId, nowS, quotes, bestSell, bestBuy, lane, receipts, caveat
 * }
 */
export function marketIntelligence(state, commodityId) {
  const empty = {
    commodityId: commodityId != null ? String(commodityId) : '',
    nowS: 0,
    quotes: [],
    bestSell: null,
    bestBuy: null,
    lane: null,
    receipts: [],
    caveat: STALE_CAVEAT,
  };
  try {
    if (!state || typeof state !== 'object') return empty;
    const player = state.player;
    if (!player || typeof player !== 'object') return empty;
    const memory = player.marketMemory;
    const nowS = finiteNonNeg(state.simTime);
    const cid = commodityId != null ? String(commodityId) : '';
    if (!cid) {
      return {
        ...empty,
        nowS,
        receipts: tradeMarginReceipts(player.tradeLedger, 10),
      };
    }
    const quotes = knownStationQuotes(memory, cid, nowS);
    return {
      commodityId: cid,
      nowS,
      quotes,
      bestSell: pickBest(quotes, 'sell', true),
      bestBuy: pickBest(quotes, 'buy', false),
      lane: bestKnownMarginLane(memory, cid, nowS),
      receipts: tradeMarginReceipts(player.tradeLedger, 10),
      caveat: STALE_CAVEAT,
    };
  } catch {
    return empty;
  }
}

// ── internals ────────────────────────────────────────────────────────────────────────────────

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function finiteNonNeg(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function roundFinite(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function quoteView(stationId, commodityId, quote, nowS) {
  if (!isPlainObject(quote)) return null;
  const buy = Number.isFinite(Number(quote.buy)) ? Math.round(Number(quote.buy)) : null;
  const sell = Number.isFinite(Number(quote.sell)) ? Math.round(Number(quote.sell)) : null;
  if (buy == null && sell == null) return null;
  // Provenance must resolve — unknown tags fail closed (excluded from intelligence).
  const provenance = quoteProvenance(quote);
  if (!provenance) return null;
  const seenAt = finiteNonNeg(quote.seenAt);
  const ageS = Math.max(0, nowS - seenAt);
  const band = ageBandFor(ageS);
  const demand = demandView(quote);
  return {
    stationId: String(stationId),
    commodityId: String(commodityId),
    buy,
    sell,
    seenAt,
    ageS,
    ageLabel: ageLabelFor(ageS),
    band,
    provenance,
    demand,
    demandReason: demand ? demand.label : null,
    demandDirection: demand ? demand.direction : 'flat',
    staleCaveat: STALE_CAVEAT,
  };
}

function demandView(quote) {
  const rawDrivers = Array.isArray(quote && quote.demandDrivers) ? quote.demandDrivers : [];
  const drivers = [];
  for (const raw of rawDrivers) {
    if (!raw || typeof raw !== 'object') continue;
    const label = String(raw.shortLabel || raw.label || raw.explanation || '').trim();
    if (!label) continue;
    const direction = raw.direction === 'up' || raw.direction === 'down' ? raw.direction : 'flat';
    drivers.push({
      id: raw.id != null ? String(raw.id) : '',
      label,
      explanation: raw.explanation != null ? String(raw.explanation) : label,
      direction,
    });
  }
  const rawMultiplier = Number(quote && quote.demandMult);
  const multiplier = Number.isFinite(rawMultiplier) && rawMultiplier > 0 ? rawMultiplier : 1;
  if (!drivers.length && Math.abs(multiplier - 1) < 1e-9) return null;
  const summary = summarizeDemandDrivers(drivers, multiplier);
  return {
    multiplier,
    drivers,
    label: summary ? summary.shortLabel : 'Persistent local demand',
    direction: summary ? summary.direction : (multiplier > 1 ? 'up' : multiplier < 1 ? 'down' : 'flat'),
  };
}

function pickBest(quotes, field, preferHigh) {
  let best = null;
  for (const q of quotes) {
    const v = q[field];
    if (!Number.isFinite(v)) continue;
    if (!best) {
      best = q;
      continue;
    }
    const bv = best[field];
    if (preferHigh) {
      if (v > bv || (v === bv && q.stationId < best.stationId)) best = q;
    } else if (v < bv || (v === bv && q.stationId < best.stationId)) {
      best = q;
    }
  }
  return best;
}

export default {
  AGE_BAND_FRESH_S,
  AGE_BAND_MID_S,
  AGE_HOLLOW_S,
  STALE_CAVEAT,
  PROVENANCE,
  ageBandFor,
  ageLabelFor,
  quoteProvenance,
  knownStationQuotes,
  bestKnownSell,
  bestKnownSellAtStations,
  bestKnownBuy,
  bestKnownMarginLane,
  tradeMarginReceipt,
  tradeMarginReceipts,
  marketIntelligence,
};
