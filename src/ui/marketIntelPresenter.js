// marketIntelPresenter.js — PROFESSIONAL-MARKET-INTELLIGENCE-UI presenter.
//
// Pure view mapping for the market board five-second scan:
//   age · confidence · known-vs-live · route cause · risk · cargo fit · expected margin · diminishing returns
//
// Discipline:
//   • PURE — no DOM, no Math.random, no Date.now, no emit, no state mutation.
//   • ONE PRICE AUTHORITY — never re-runs economy integral. Live unit prices and priceImpactPct
//     arrive as inputs from the market screen's existing quote path (docked station only).
//   • NO OMNISCIENCE — known quotes come only from marketIntelligence / player.marketMemory.
//   • SCANNABLE — chip/inspector rows, not spreadsheets or essay walls.
//   • FAIL CLOSED — corrupt inputs yield empty chips / null rows, never throws.

import {
  STALE_CAVEAT,
  ageBandFor,
  ageLabelFor,
  marketIntelligence,
} from './marketIntelligence.js';
import { causeFor } from './causeLedger.js';
import { COMMODITIES } from '../data/commodities.js';
import { SECTORS } from '../data/sectors.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const STATION_TO_SECTOR = new Map();
for (const sec of SECTORS) {
  for (const st of (sec.stations || [])) {
    if (st && st.id) STATION_TO_SECTOR.set(st.id, sec.id);
  }
}

/** Max chips on a commodity card strip (five-second budget). */
export const INTEL_CHIP_CAP = 3;

/**
 * presentCommodityIntel(input) → IntelView
 *
 * @param {object} input
 * @param {object} input.state
 * @param {string} input.commodityId
 * @param {string} input.stationId          docked / open market station
 * @param {number|null} [input.liveBuy]     live docked buy (player buys) unit — authority-quoted
 * @param {number|null} [input.liveSell]    live docked sell (player sells) unit
 * @param {number} [input.qty=1]            selected trade qty for cargo/margin/flood
 * @param {number|null} [input.priceImpactPct] economy.quote impact (percent points, e.g. 12 = +12%)
 * @param {number|null} [input.quoteUnit] economy.quote unitAvg for the selected quantity
 * @param {'buy'|'sell'} [input.side='buy']
 * @param {object|null} [input.def]         commodity def override
 * @param {object|null} [input.route]       current-station known route from market.js
 */
export function presentCommodityIntel(input = {}) {
  try {
    return buildIntel(input);
  } catch {
    return emptyIntel(input && input.commodityId);
  }
}

/**
 * presentIntelChips(view) → ChipSpec[]
 * Thin alias for consumers that only need the strip.
 */
export function presentIntelChips(view) {
  return (view && Array.isArray(view.chips)) ? view.chips : [];
}

/**
 * presentInspectorRows(view) → InspectorRow[]
 */
export function presentInspectorRows(view) {
  return (view && Array.isArray(view.inspectorRows)) ? view.inspectorRows : [];
}

// ── build ────────────────────────────────────────────────────────────────────────────────────

function buildIntel(input) {
  const commodityId = input.commodityId != null ? String(input.commodityId) : '';
  const stationId = input.stationId != null ? String(input.stationId) : '';
  const state = input.state && typeof input.state === 'object' ? input.state : null;
  const def = input.def || (commodityId ? CMDTY_BY_ID.get(commodityId) : null) || null;
  const qty = Math.max(0, Math.floor(Number(input.qty) || 0));
  const side = input.side === 'sell' ? 'sell' : 'buy';
  const liveBuy = finitePos(input.liveBuy);
  const liveSell = finitePos(input.liveSell);
  const quoteUnit = finitePos(input.quoteUnit);
  const impactPct = finiteNum(input.priceImpactPct);

  const intel = state && commodityId
    ? marketIntelligence(state, commodityId)
    : emptyMarketIntel(commodityId);
  const nowS = intel.nowS || finiteNonNeg(state && state.simTime);
  const hereQuote = findQuote(intel.quotes, stationId);
  const bestSell = intel.bestSell || null;
  const lane = intel.lane || null;
  const routeStationId = input.route && (input.route.destStation || input.route.sellStationId);
  const routeQuote = routeStationId ? findQuote(intel.quotes, String(routeStationId)) : null;
  const intelReference = routeQuote || bestSell || hereQuote;

  const age = ageView(intelReference, null, nowS);
  const confidence = confidenceView(intelReference, null, age);
  const source = sourceView(intelReference, null);
  const knownVsLive = knownVsLiveView(hereQuote, liveBuy, liveSell, age);
  const cause = causeView(state, stationId);
  const risk = riskView(def);
  const cargoFit = cargoFitView(state, def, qty);
  const margin = marginView({
    side, liveBuy, liveSell, quoteUnit, bestSell, lane, qty, stationId, route: input.route,
  });
  const route = routeView(input.route, margin);
  const diminishing = diminishingView(impactPct, side, qty);

  const chips = assembleChips({
    age, confidence, source, knownVsLive, cause, route, risk, cargoFit, margin, diminishing,
  });
  const inspectorRows = assembleInspectorRows({
    age, confidence, source, knownVsLive, cause, route, risk, cargoFit, margin, diminishing,
  });
  const ariaSummary = chips.map((c) => c.text).join(' · ') || 'No market intel';

  return {
    commodityId,
    stationId,
    nowS,
    age,
    confidence,
    source,
    knownVsLive,
    cause,
    route,
    risk,
    cargoFit,
    margin,
    diminishing,
    chips,
    inspectorRows,
    ariaSummary,
    caveat: STALE_CAVEAT,
    honest: true,
  };
}

function emptyIntel(commodityId) {
  return {
    commodityId: commodityId != null ? String(commodityId) : '',
    stationId: '',
    nowS: 0,
    age: null,
    confidence: null,
    source: null,
    knownVsLive: null,
    cause: null,
    route: null,
    risk: null,
    cargoFit: null,
    margin: null,
    diminishing: null,
    chips: [],
    inspectorRows: [],
    ariaSummary: 'No market intel',
    caveat: STALE_CAVEAT,
    honest: true,
  };
}

function emptyMarketIntel(commodityId) {
  return {
    commodityId: commodityId != null ? String(commodityId) : '',
    nowS: 0,
    quotes: [],
    bestSell: null,
    bestBuy: null,
    lane: null,
    receipts: [],
    caveat: STALE_CAVEAT,
  };
}

// ── field views ──────────────────────────────────────────────────────────────────────────────

function ageView(hereQuote, bestSell, nowS) {
  const src = hereQuote || bestSell;
  if (!src) {
    return {
      key: 'unknown',
      label: 'no memory',
      ageS: 0,
      hollow: true,
      fade: 0,
      tone: 'muted',
      show: true,
    };
  }
  const ageS = Number.isFinite(src.ageS) ? src.ageS : Math.max(0, nowS - finiteNonNeg(src.seenAt));
  const band = src.band || ageBandFor(ageS);
  const label = src.ageLabel || ageLabelFor(ageS);
  return {
    key: band.key,
    label,
    ageS,
    hollow: !!band.hollow,
    fade: Number.isFinite(band.fade) ? band.fade : 0,
    tone: band.key === 'fresh' ? 'info' : (band.key === 'mid' ? 'muted' : 'muted'),
    italic: !!band.italic,
    show: true,
    source: hereQuote ? 'here' : 'route',
  };
}

function confidenceView(hereQuote, bestSell, age) {
  const src = hereQuote || bestSell;
  if (!src || !age || age.key === 'unknown') {
    return { key: 'none', label: 'no conf', score01: 0, tone: 'muted', show: true };
  }
  const prov = src.provenance && src.provenance.source;
  let score = Number.isFinite(age.fade) ? age.fade : 0;
  // Docked sighting beats survey packet; hollow age cuts hard.
  if (prov === 'survey') score *= 0.72;
  if (age.hollow) score *= 0.55;
  score = clamp01(score);
  let key = 'low';
  let label = 'LOW';
  let tone = 'warn';
  if (score >= 0.72) {
    key = 'high';
    label = 'HIGH';
    tone = 'good';
  } else if (score >= 0.38) {
    key = 'mid';
    label = 'MID';
    tone = 'info';
  }
  if (prov === 'survey' && key === 'high') {
    key = 'mid';
    label = 'MID';
    tone = 'info';
  }
  return {
    key,
    label,
    score01: score,
    tone,
    provenance: prov || 'dock',
    show: true,
  };
}

function sourceView(hereQuote, bestSell) {
  const src = hereQuote || bestSell;
  const provenance = src && src.provenance;
  if (!provenance) {
    return { key: 'none', label: 'no source', tone: 'muted', show: true };
  }
  const label = provenance.label || (provenance.source === 'survey' ? 'survey packet' : 'visited dock');
  return {
    key: provenance.source || 'dock',
    label,
    tone: provenance.source === 'survey' ? 'warn' : 'info',
    show: true,
  };
}

function knownVsLiveView(hereQuote, liveBuy, liveSell, age) {
  const knownBuy = hereQuote && Number.isFinite(hereQuote.buy) ? hereQuote.buy : null;
  const knownSell = hereQuote && Number.isFinite(hereQuote.sell) ? hereQuote.sell : null;
  const hasKnown = knownBuy != null || knownSell != null;
  const hasLive = liveBuy != null || liveSell != null;

  if (!hasKnown && !hasLive) {
    return {
      status: 'none',
      knownBuy: null,
      knownSell: null,
      liveBuy: null,
      liveSell: null,
      sellDelta: null,
      line: 'no quote',
      short: '—',
      tone: 'muted',
      show: false,
    };
  }

  if (hasLive && !hasKnown) {
    const live = liveSell != null ? liveSell : liveBuy;
    return {
      status: 'live',
      knownBuy: null,
      knownSell: null,
      liveBuy,
      liveSell,
      sellDelta: null,
      line: 'live ' + fmtCr(live),
      short: 'live ' + fmtCr(live),
      tone: 'info',
      show: true,
    };
  }

  if (hasKnown && !hasLive) {
    const known = knownSell != null ? knownSell : knownBuy;
    const ageBit = age && age.label ? ' · ' + age.label : '';
    return {
      status: 'known',
      knownBuy,
      knownSell,
      liveBuy: null,
      liveSell: null,
      sellDelta: null,
      line: 'known ' + fmtCr(known) + ageBit,
      short: 'known ' + fmtCr(known),
      tone: age && age.hollow ? 'muted' : 'info',
      show: true,
    };
  }

  // Both known + live for this docked station.
  const k = knownSell != null ? knownSell : knownBuy;
  const l = liveSell != null ? liveSell : liveBuy;
  const sellDelta = (knownSell != null && liveSell != null)
    ? Math.round(liveSell - knownSell)
    : ((knownBuy != null && liveBuy != null) ? Math.round(liveBuy - knownBuy) : null);
  let status = 'match';
  let tone = 'good';
  let deltaBit = 'match';
  if (sellDelta != null && Math.abs(sellDelta) >= 2) {
    if (sellDelta > 0) {
      status = 'live_high';
      tone = 'good';
      deltaBit = '+' + fmtCr(sellDelta);
    } else {
      status = 'live_low';
      tone = 'warn';
      deltaBit = fmtCr(sellDelta);
    }
  }
  return {
    status,
    knownBuy,
    knownSell,
    liveBuy,
    liveSell,
    sellDelta,
    line: 'live ' + fmtCr(l) + ' · known ' + fmtCr(k) + (deltaBit !== 'match' ? ' (' + deltaBit + ')' : ''),
    short: deltaBit === 'match' ? 'live=known' : 'Δ ' + deltaBit,
    tone,
    show: true,
  };
}

function causeView(state, stationId) {
  if (!state || !stationId) return { line: null, show: false, tone: 'muted' };
  let model = state.ui && state.ui.causeLedger;
  if (!model || !model.lines) {
    const sectorId = STATION_TO_SECTOR.get(stationId)
      || (state.world && state.world.currentSectorId)
      || null;
    model = sectorId ? causeFor(state, sectorId) : null;
  }
  const line = model && model.lines
    ? (model.lines.pricePressure || model.lines.danger || null)
    : null;
  if (!line) return { line: null, show: false, tone: 'muted' };
  // Keep strip short: first clause only.
  const short = String(line).split(/[.;]/)[0].trim().slice(0, 42);
  return {
    line: String(line),
    short: short || null,
    show: !!short,
    tone: 'info',
  };
}

function riskView(def) {
  const legality = (def && def.legality) || 'legal';
  if (legality === 'contraband' || legality === 'illegal') {
    return { key: 'contraband', label: 'scan risk', legality, tone: 'danger', show: true, chip: true };
  }
  if (legality === 'restricted') {
    return { key: 'restricted', label: 'restricted', legality, tone: 'warn', show: true, chip: true };
  }
  return { key: 'legal', label: 'clear', legality: 'legal', tone: 'muted', show: true, chip: false };
}

function cargoFitView(state, def, qty) {
  const cargo = state && state.player && state.player.cargo;
  const cap = Math.max(0, Number(cargo && cargo.capVolume) || 0);
  const used = Math.max(0, Number(cargo && cargo.usedVolume) || 0);
  const free = Math.max(0, cap - used);
  const volPer = def && def.volPerU > 0 ? def.volPerU : 1;
  const need = Math.max(0, qty) * volPer;
  const fits = need <= free + 1e-6;
  const freeUnits = volPer > 0 ? Math.floor(free / volPer) : 0;
  if (qty <= 0) {
    return {
      freeU: Math.round(free * 10) / 10,
      needU: 0,
      freeUnits,
      fits: true,
      label: freeUnits > 0 ? freeUnits + 'u room' : 'hold full',
      tone: freeUnits > 0 ? 'muted' : 'warn',
      show: true,
    };
  }
  return {
    freeU: Math.round(free * 10) / 10,
    needU: Math.round(need * 10) / 10,
    freeUnits,
    fits,
    label: fits ? 'fits ' + qty + 'u' : 'hold short',
    tone: fits ? 'good' : 'warn',
    show: true,
  };
}

function marginView({ side, liveBuy, liveSell, quoteUnit, bestSell, lane, qty, stationId, route }) {
  // Only quote a run that actually starts at this open market. A globally best remembered lane
  // is useful on the chart, but presenting it as this row's expected margin would be a lie.
  let perUnit = null;
  let dest = null;
  let fromMemory = false;

  if (side === 'buy' && route && Number.isFinite(route.sellThere)) {
    const buyUnit = quoteUnit != null ? quoteUnit : liveBuy;
    if (buyUnit != null) perUnit = Math.round(route.sellThere - buyUnit);
    dest = route.destStation || route.sellStationId || null;
    fromMemory = true;
  } else if (side === 'buy' && liveBuy != null && bestSell && Number.isFinite(bestSell.sell)) {
    if (bestSell.stationId !== stationId) {
      perUnit = Math.round(bestSell.sell - (quoteUnit != null ? quoteUnit : liveBuy));
      dest = bestSell.stationId;
      fromMemory = true;
    }
  } else if (
    side === 'buy' && lane && lane.buyStationId === stationId
    && Number.isFinite(lane.sell) && Number.isFinite(lane.buy)
  ) {
    perUnit = Math.round(lane.sell - (quoteUnit != null ? quoteUnit : lane.buy));
    dest = lane.sellStationId || null;
    fromMemory = true;
  } else if (side === 'sell' && liveSell != null) {
    // Selling here: margin needs a prior buy basis — leave null without inventing.
    perUnit = null;
  }

  if (perUnit == null || perUnit <= 0) {
    return {
      perUnit: null,
      expected: null,
      dest,
      label: 'no margin',
      short: '—',
      tone: 'muted',
      caveat: fromMemory ? STALE_CAVEAT : null,
      show: false,
    };
  }

  const expected = qty > 0 ? Math.round(perUnit * qty) : null;
  const label = expected != null
    ? '+' + fmtCr(expected) + ' · ' + fmtCr(perUnit) + '/u'
    : '+' + fmtCr(perUnit) + '/u';
  return {
    perUnit,
    expected,
    dest,
    label,
    short: '+' + fmtCr(perUnit) + '/u',
    tone: 'good',
    caveat: STALE_CAVEAT,
    show: true,
  };
}

function routeView(route, margin) {
  if (!route || !margin || !margin.show) {
    return { label: 'no known route', source: 'none', show: false, tone: 'muted' };
  }
  const dest = route.destName || route.destination || route.destStation || margin.dest || 'known buyer';
  const source = route.intelLabel || route.intelSource || 'price memory';
  return {
    label: String(dest),
    source: String(source),
    show: true,
    tone: 'info',
  };
}

function diminishingView(impactPct, side, qty) {
  if (qty <= 0 || impactPct == null) {
    return {
      impactPct: 0,
      severity: 0,
      label: 'no flood',
      short: 'flat',
      tone: 'muted',
      show: false,
    };
  }
  // economy.quote returns percent points (12 = +12%). Never invent a second scale.
  const pct = impactPct;
  const abs = Math.abs(pct);
  const severity = clamp01(abs / 25);
  if (abs < 0.5) {
    return {
      impactPct: pct,
      severity: 0,
      label: 'no flood',
      short: 'flat',
      tone: 'good',
      show: true,
    };
  }
  const sign = pct >= 0 ? '+' : '−';
  const shown = abs < 1 ? (Math.round(abs * 10) / 10) : Math.round(abs);
  return {
    impactPct: pct,
    severity,
    label: (side === 'sell' ? 'sell impact ' : 'buy impact ') + sign + shown + '%',
    short: sign + shown + '%',
    tone: severity > 0.66 ? 'danger' : (severity > 0.33 ? 'warn' : 'info'),
    show: true,
  };
}

// ── chips / inspector ────────────────────────────────────────────────────────────────────────

function assembleChips(fields) {
  const out = [];
  const push = (id, text, tone, title) => {
    if (out.length >= INTEL_CHIP_CAP) return;
    if (!text) return;
    out.push({
      id,
      text: String(text),
      tone: tone || 'muted',
      title: title || String(text),
    });
  };

  // Consequential cargo status must survive the compact cap.
  if (fields.risk && fields.risk.chip) {
    push('risk', fields.risk.label, fields.risk.tone, 'Legality: ' + fields.risk.legality);
  }

  if (fields.age && fields.age.show) {
    push('age', fields.age.label, fields.age.tone, 'Memory age: ' + fields.age.label);
  }
  if (fields.confidence && fields.confidence.show) {
    push('conf', fields.confidence.label, fields.confidence.tone,
      'Confidence: ' + fields.confidence.label);
  }
  if (fields.knownVsLive && fields.knownVsLive.show) {
    push('kvl', fields.knownVsLive.short, fields.knownVsLive.tone, fields.knownVsLive.line);
  }
  if (fields.margin && fields.margin.show) {
    push('margin', fields.margin.short, fields.margin.tone,
      (fields.margin.label || '') + (fields.margin.caveat ? ' — ' + fields.margin.caveat : ''));
  }
  if (fields.diminishing && fields.diminishing.show) {
    push('flood', fields.diminishing.short, fields.diminishing.tone, fields.diminishing.label);
  }
  if (fields.cargoFit && fields.cargoFit.show) {
    push('cargo', fields.cargoFit.label, fields.cargoFit.tone, fields.cargoFit.label);
  }
  // Cause is stage/inspector priority (can be long); only chip if room and short.
  if (fields.cause && fields.cause.show && out.length < INTEL_CHIP_CAP && fields.cause.short) {
    push('cause', 'why', fields.cause.tone, fields.cause.line);
  }
  return out;
}

function assembleInspectorRows(fields) {
  const rows = [];
  const add = (id, label, value, tone) => {
    if (value == null || value === '') return;
    rows.push({
      id,
      label: String(label),
      value: String(value),
      tone: tone || 'muted',
    });
  };

  if (fields.age && fields.age.show) {
    add('age', 'AGE', fields.age.label + (fields.age.hollow ? ' · hollow' : ''), fields.age.tone);
  }
  if (fields.confidence && fields.confidence.show) {
    add('conf', 'CONF', fields.confidence.label, fields.confidence.tone);
  }
  if (fields.source && fields.source.show) {
    add('source', 'SOURCE', fields.source.label, fields.source.tone);
  }
  if (fields.knownVsLive && fields.knownVsLive.show) {
    add('kvl', 'KNOWN / LIVE', fields.knownVsLive.line, fields.knownVsLive.tone);
  }
  if (fields.cause && fields.cause.line) {
    add('cause', 'CAUSE', fields.cause.line, fields.cause.tone);
  }
  if (fields.route && fields.route.show) {
    add('route', 'ROUTE', fields.route.label + ' · ' + fields.route.source, fields.route.tone);
  }
  if (fields.risk && fields.risk.show) {
    add('risk', 'RISK', fields.risk.legality, fields.risk.tone);
  }
  if (fields.cargoFit && fields.cargoFit.show) {
    add('cargo', 'CARGO FIT', fields.cargoFit.label
      + (fields.cargoFit.needU > 0
        ? ' · need ' + fields.cargoFit.needU + 'u / free ' + fields.cargoFit.freeU + 'u'
        : ' · free ' + fields.cargoFit.freeU + 'u'),
    fields.cargoFit.tone);
  }
  if (fields.margin && fields.margin.show) {
    add('margin', 'MARGIN',
      fields.margin.label + (fields.margin.caveat ? ' · ' + fields.margin.caveat : ''),
      fields.margin.tone);
  }
  if (fields.diminishing && fields.diminishing.show) {
    add('flood', 'DIMINISH', fields.diminishing.label, fields.diminishing.tone);
  }
  return rows;
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────

function findQuote(quotes, stationId) {
  if (!Array.isArray(quotes) || !stationId) return null;
  for (const q of quotes) {
    if (q && q.stationId === stationId) return q;
  }
  return null;
}

function finitePos(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function finiteNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

function fmtCr(n) {
  return (Math.round(Number(n) || 0)).toLocaleString('en-US');
}

export default {
  INTEL_CHIP_CAP,
  presentCommodityIntel,
  presentIntelChips,
  presentInspectorRows,
};
