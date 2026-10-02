import { MARKET_FILTERS, marketFamily, marketBrowserHtml, marketRowHtml, marketQuoteHtml, marketTradeHtml, marketReceiptRow as rowKV, saleLineHtml, rememberedSurveyFreshness } from '../../views/marketPresentation.js';
import { marketFrameHtml } from '../../views/stationFrames.js';
// src/ui/station/screens/market.js — "Market": the dense register (Frontend Task C §1.3).
// Left half: the commodity table — name, buy, sell, stock, held — twelve rows visible with hairlines,
// the selected row marked by a gold rule on its left edge. Right half: the selected commodity's name
// at screen-title size and its price at hero size, one sentence of why, and Buy and Sell as two
// words with a quantity beside them. Emits ui:buy / ui:sell {commodityId, qty}; the trade math, the
// quotes and the route logic are untouched. Field Hardware chrome (kit plates, keys, quiet type)
// is pinned from this module; buy/sell stay the same verbs.
import { COMMODITIES, commodityPresentationFor } from '../../../data/commodities.js';
import { canLaunderSalvageAtStation } from '../../../data/salvageLegality.js';
import { injectOrreryMarket, qtyFromDialPoint, setQtyDial } from '../../orrery/marketLayouts.js';
import { dressLampKey } from '../../orrery/lampKey.js';
import { rollTo } from '../../orrery/text.js';
import { arcD, polar } from '../../orrery/svg.js';
import { SECTORS } from '../../../data/sectors.js';
import { isUnsellableCargo, reservedCargoQuantity, sellableCargoQuantity } from '../../../systems/cargo.js';
import { compareDockedFreight, formatFreightComparison } from '../../../systems/economy.js';
import { predictPriceCurve, regimeLabel } from '../../../systems/economyCycles.js';
import { escapeHtml } from '../../comms.js';
import { entitySpanHtml } from '../../entityResolver.js';
import { MAP_FOCUS, openGalaxyMap } from '../../mapAuthority.js';
import { focusNamedStationControl } from '../../outfittingSpendConfirm.js';
import { mountDataState } from '../../uiPrimitives.js';
import { renderAdBoardNotice } from '../adBoard.js';
import { marketQuoteValue, presentMarketDrivers } from '../../marketDriverPresenter.js';
import { presentCommodityIntel, presentInspectorRows } from '../../marketIntelPresenter.js';
// Trade-route intel + course plotting reuse the canonical market logic (same waypoint/ui:setCourse
// contract the legacy panel used) — never re-derive routes or nav here.
import { computeBestTrades, applyTradeNavigation, formatRouteCard } from '../../market/tradeLogic.js';
import { chooseAdventureDecision, presentSurfaceDecisions } from '../../adventureDecisions.js';
import {
  dressState,
  ensureInteriorStyle,
  paintHero,
  paintInput,
  paintKey,
  paintLegend,
  paintMarking,
  paintPlate,
  paintRow,
  paintSelectedTableRow,
  pinKeyrack,
  syncKeys,
} from './fhChrome.js';
import { bindStationMarkup, stationControlAttrs, stationControlLabel } from '../stationBindingMap.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const STATION_NAME = new Map();
const STATION_TYPE = new Map();
for (const sec of SECTORS) {
  for (const s of (sec.stations || [])) {
    STATION_NAME.set(s.id, s.name || s.id);
    if (s.type) STATION_TYPE.set(s.id, s.type);
  }
}


// Meaning roles kept for the instrument-hierarchy tests and the help screen's shared vocabulary.
export function chartTrendRole(up) { return up ? 'you' : 'foe'; }
export function chartTrendColor(up) { return up ? 'var(--dp-lamp)' : 'var(--dp-danger)'; }
export function maxAffordableQuantity({ limit, credits, quote }) {
  const ceiling = Number(limit);
  const budget = Number(credits);
  if (!Number.isFinite(ceiling) || !Number.isFinite(budget) || budget < 0 || typeof quote !== 'function') return 0;
  let low = 0;
  let high = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(ceiling)));
  // Canonical buy totals are monotone with quantity; this avoids linear quote scans.
  while (low < high) {
    const mid = low + Math.ceil((high - low) / 2);
    const value = quote(mid);
    if (value && value.ok && Number.isFinite(value.total) && value.total <= budget) low = mid;
    else high = mid - 1;
  }
  return low;
}
/**
 * INF-084: the stated-terms binding for the go handler. Returns the rounded quoted
 * total when the stashed render quote covers exactly the confirmed quantity, else
 * undefined (no binding — the authority settles at the live price, as before).
 */
export function expectedTotalForTerms(lastQuotedTerms, qty, commodityId) {
  if (!lastQuotedTerms || lastQuotedTerms.qty !== qty) return undefined;
  if (commodityId != null && lastQuotedTerms.commodityId != null && lastQuotedTerms.commodityId !== commodityId) return undefined;
  const total = Math.round(Number(lastQuotedTerms.total));
  return Number.isFinite(total) && total >= 0 ? total : undefined;
}

/**
 * The receipt and the commit name one commodity. A refresh that drops the lot does not
 * adopt the next row; a filter that only hides it keeps the same trade.
 */
export function resolveMarketSelection({ selectedId = null, visibleIds = [], tradedIds = [] } = {}) {
  const visible = Array.isArray(visibleIds) ? visibleIds.filter(Boolean) : [];
  const traded = Array.isArray(tradedIds) ? tradedIds.filter(Boolean) : [];
  if (!selectedId) {
    const first = visible[0] || traded[0] || null;
    return { selectedId: first, tradeId: first, focusId: first, cleared: false, adoptedInitial: !!first };
  }
  if (traded.includes(selectedId)) {
    return {
      selectedId,
      tradeId: selectedId,
      focusId: visible.includes(selectedId) ? selectedId : (visible[0] || selectedId),
      cleared: false,
      adoptedInitial: false,
    };
  }
  return {
    selectedId,
    tradeId: null,
    focusId: visible[0] || traded[0] || null,
    cleared: true,
    adoptedInitial: false,
  };
}

/**
 * A full paint may lift an empty quantity to one unit. It must not rewrite a named
 * quantity down to whatever the hold or the shelf can take.
 */
export function marketQuantityAfterRefresh(qty, maxQty) {
  const named = Math.floor(Number(qty));
  const limit = Math.floor(Number(maxQty));
  const safeNamed = Number.isFinite(named) ? Math.max(0, named) : 0;
  const safeLimit = Number.isFinite(limit) ? Math.max(0, limit) : 0;
  if (safeNamed < 1 && safeLimit >= 1) return 1;
  return safeNamed;
}

/** A quote can commit only when it fills the named quantity on the named side. A short fill does not. */
export function marketQuoteIsExecutable(quote, qty, side) {
  if (!quote || quote.ok !== true || quote.partial === true) return false;
  const named = Math.floor(Number(qty));
  if (!Number.isFinite(named) || named <= 0) return false;
  if (Math.floor(Number(quote.qty)) !== named) return false;
  if (side != null && quote.side != null && quote.side !== side) return false;
  return true;
}

/**
 * Returning to the market keeps the lot and quantity already on screen.
 * A requested mode, a job commodity, or a tracked contract applies only while
 * nothing is selected yet.
 */
export function marketResumeSelection({
  selectedId = null,
  qty = 1,
  requestedMode = null,
  requestedCommodityId = null,
  trackedCommodityId = null,
  listedIds = [],
} = {}) {
  const namedQty = Math.floor(Number(qty));
  const safeQty = Number.isFinite(namedQty) ? Math.max(0, namedQty) : 0;
  if (selectedId) {
    return { selectedId, qty: safeQty, applyMode: null };
  }
  const listed = new Set(Array.isArray(listedIds) ? listedIds.filter(Boolean) : []);
  const applyMode = requestedMode === 'buy' || requestedMode === 'sell' ? requestedMode : null;
  let nextId = null;
  let nextQty = safeQty > 0 ? safeQty : 1;
  if (requestedCommodityId && listed.has(requestedCommodityId)) {
    nextId = requestedCommodityId;
    nextQty = 1;
  } else if (applyMode !== 'sell' && trackedCommodityId && listed.has(trackedCommodityId)) {
    nextId = trackedCommodityId;
  }
  return { selectedId: nextId, qty: nextId ? nextQty : safeQty, applyMode };
}

/** Null when the click would trade a different lot, side, or quantity than the receipt just named. */
export function marketCommitPayload(lastQuotedTerms, selectedId, qty, side) {
  const tradeQty = Math.max(0, Math.floor(Number(qty) || 0));
  if (!selectedId || tradeQty <= 0 || !lastQuotedTerms) return null;
  if (lastQuotedTerms.commodityId !== selectedId || lastQuotedTerms.qty !== tradeQty) return null;
  if (side != null && lastQuotedTerms.side != null && lastQuotedTerms.side !== side) return null;
  const expectedTotal = expectedTotalForTerms(lastQuotedTerms, tradeQty, selectedId);
  if (expectedTotal === undefined) return null;
  return { commodityId: selectedId, qty: tradeQty, expectedTotal };
}

/**
 * The go control emits only when the receipt, the selection, and a fresh quote
 * still name the same lot, side, quantity, and total.
 */
export function marketGoDecision({ lastQuotedTerms = null, selectedId = null, qty = 0, side = null, freshQuote = null } = {}) {
  const payload = marketCommitPayload(lastQuotedTerms, selectedId, qty, side);
  if (!payload) return { emit: false, payload: null, reason: 'mismatch' };
  if (!marketQuoteIsExecutable(freshQuote, payload.qty, side)) {
    return { emit: false, payload: null, reason: 'quote' };
  }
  if (freshQuote.commodityId != null && freshQuote.commodityId !== payload.commodityId) {
    return { emit: false, payload: null, reason: 'quote' };
  }
  const liveTotal = Math.round(Number(freshQuote.total));
  if (!Number.isFinite(liveTotal) || liveTotal !== payload.expectedTotal) {
    return {
      emit: false,
      payload: null,
      reason: 'price',
      liveTotal: Number.isFinite(liveTotal) ? liveTotal : null,
      expectedTotal: payload.expectedTotal,
    };
  }
  return { emit: true, payload, reason: null };
}

/** After the trade console is rebuilt, the Hand returns to the go control, the quantity, or the selected row. */
export function marketTradeFocusChoice({ goEnabled = false, hasQuantity = false, hasRow = false } = {}) {
  if (goEnabled) return 'go';
  if (hasQuantity) return 'quantity';
  if (hasRow) return 'row';
  return null;
}

export function legalityRole(legal) {
  if (legal === 'contraband') return 'foe';
  if (legal === 'restricted') return 'goal';
  return 'calm';
}


function stationId(state) { return state && state.ui && state.ui.dockedStationId; }

function stationRecordId(station) {
  if (!station) return null;
  if (typeof station.stationId === 'string' && station.stationId) return station.stationId;
  return (typeof station.id === 'string' && station.id) ? station.id : null;
}

function typeFromRecord(record) {
  if (!record) return '';
  return String(record.type || record.stationTypeId || '');
}

function typeFromEntity(entity) {
  const data = entity && entity.data;
  if (!data) return '';
  return String(data.stationTypeId || data.type || '');
}

function eachWorldSector(state, visit) {
  const active = state && state.world && state.world.activeSector;
  if (active && visit(active)) return true;
  const sectors = state && state.world && state.world.sectors;
  if (!sectors) return false;
  const list = Array.isArray(sectors) ? sectors : Object.values(sectors);
  for (const sector of list) {
    if (visit(sector)) return true;
  }
  return false;
}

/** Live dock type: entity first, then the sector station record, then the catalog. */
export function resolveDockStationType(state) {
  const id = stationId(state);
  if (!id) return '';
  const byStationId = state && state.entityIndex && state.entityIndex.byStationId;
  const indexed = byStationId && typeof byStationId.get === 'function' ? byStationId.get(id) : null;
  if (indexed && indexed.type === 'station') {
    const live = typeFromEntity(indexed);
    if (live) return live;
  }
  const stations = state && state.entityIndex && state.entityIndex.stations;
  const entities = Array.isArray(stations) ? stations : ((state && state.entityList) || []);
  for (const entity of entities) {
    if (!entity || entity.type !== 'station') continue;
    const data = entity.data || {};
    if (data.stationId === id || entity.id === id) {
      const live = typeFromEntity(entity);
      if (live) return live;
    }
  }
  let fromSector = '';
  eachWorldSector(state, (sector) => {
    const rec = ((sector && sector.stations) || []).find((station) => stationRecordId(station) === id);
    const typed = typeFromRecord(rec);
    if (typed) {
      fromSector = typed;
      return true;
    }
    return false;
  });
  if (fromSector) return fromSector;
  return STATION_TYPE.get(id) || '';
}

function marketTable(state) {
  const id = stationId(state);
  const markets = state && state.economy && state.economy.markets;
  return (markets && id && markets[id]) || null;
}
function heldQty(state, id) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  return Math.max(0, Math.floor(Number(items && items[id]) || 0));
}
function credits(state) { return Math.max(0, Math.floor(Number(state && state.player && state.player.credits) || 0)); }
function holdFree(state) {
  const c = state && state.player && state.player.cargo;
  if (!c || !(c.capVolume > 0)) return Infinity;
  return Math.max(0, c.capVolume - (c.usedVolume || 0));
}
function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
const r2 = (n) => Math.round(Number(n) * 100) / 100;

/** The quote's price impact as a 0..1 fraction (economy.quote reports percent points). */
function impact01Of(quote) {
  if (!quote || !quote.ok) return 0;
  return Math.max(0, Math.min(1, Math.abs(Number(quote.priceImpactPct) || 0) / 100));
}

/** Demand as an arc: a 120-degree track with a needle at low, normal or high. Pure markup. */
function demandArcHtml(level, word) {
  const cx = 32, cy = 38, r = 26;
  const ang = level >= 3 ? 50 : level <= 1 ? -50 : 0;
  const track = arcD(cx, cy, r, -60, 60);
  let stops = '';
  for (const a of [-50, 0, 50]) {
    const [x0, y0] = polar(cx, cy, r - 4, a);
    const [x1, y1] = polar(cx, cy, r + 3, a);
    stops += `M ${r2(x0)} ${r2(y0)} L ${r2(x1)} ${r2(y1)} `;
  }
  const [nx, ny] = polar(cx, cy, r - 6, ang);
  const safeWord = word === 'high' || word === 'low' ? word : 'normal';
  return `<span class="orr-mkt-demand"><svg viewBox="0 0 64 40" aria-hidden="true" focusable="false">`
    + `<path d="${track}" fill="none" stroke="rgb(236 230 216 / .27)" stroke-width="5" stroke-linecap="round"/>`
    + `<path d="${track}" fill="none" stroke="rgb(236 230 216 / .6)" stroke-width="1.5"/>`
    + `<path d="${stops}" fill="none" stroke="rgb(236 230 216 / .55)" stroke-width="1.5"/>`
    + `<path d="M ${cx} ${cy} L ${r2(nx)} ${r2(ny)}" fill="none" stroke="rgb(248 244 234)" stroke-width="2" stroke-linecap="round"/>`
    + `<circle cx="${r2(nx)}" cy="${r2(ny)}" r="2.6" fill="rgb(248 244 234)"/>`
    + `</svg><span class="orr-mkt-demand__w">${safeWord}</span></span>`;
}

/** The hold after this trade as an arc: used over capacity, the fill to the contemplated level. */
function holdArcHtml(used, cap) {
  if (!(cap > 0)) return '';
  const frac = Math.max(0, Math.min(1, used / cap));
  const cx = 52, cy = 56, r = 44;
  const track = arcD(cx, cy, r, -90, 90);
  const end = -90 + 180 * frac;
  const fill = frac > 0.001 ? arcD(cx, cy, r, -90, end) : '';
  const [bx, by] = polar(cx, cy, r, end);
  return `<svg viewBox="0 0 104 62" aria-hidden="true" focusable="false">`
    + `<path d="${track}" fill="none" stroke="rgb(236 230 216 / .27)" stroke-width="5" stroke-linecap="round"/>`
    + `<path d="${track}" fill="none" stroke="rgb(236 230 216 / .6)" stroke-width="1.5"/>`
    + (fill
      ? `<path d="${fill}" fill="none" stroke="rgb(248 244 234 / .2)" stroke-width="8" stroke-linecap="round"/>`
        + `<path d="${fill}" fill="none" stroke="rgb(248 244 234)" stroke-width="2.5" stroke-linecap="round"/>`
      : '')
    + `<circle cx="${r2(bx)}" cy="${r2(by)}" r="3" fill="rgb(248 244 234)"/>`
    + `</svg><span class="orr-mkt-holdarc__t">Hold<b>${fmt(used)} / ${fmt(cap)} u</b></span>`;
}

/**
 * Ask the dock to wash papers at a black-market berth.
 * The register does not write the ledger, the cut, or the pod.
 */
export function requestMarketLaunder(bus, state) {
  if (!bus || typeof bus.emit !== 'function') return false;
  const sid = stationId(state);
  if (!sid || !canLaunderSalvageAtStation(sid)) return false;
  bus.emit('dock:launder', { stationId: sid });
  return true;
}

/** The corrupt dock owns the wash; the register only reads its durable receipt. */
export function marketLaunderLedgerHtml(state) {
  const sid = stationId(state);
  const ledger = state && state.player && state.player.launderLedger;
  const receipt = sid && Array.isArray(ledger)
    ? ledger.find((entry) => entry && entry.stationId === sid && entry.side === 'launder')
    : null;
  if (!receipt) return '';
  const pods = Array.isArray(receipt.pods) ? receipt.pods : [];
  const units = pods.reduce((sum, pod) => sum + Math.max(0, Math.floor(Number(pod.amount) || 0)), 0);
  const names = [...new Set(pods.map((pod) => {
    const def = CMDTY_BY_ID.get(pod.fromId);
    return def ? def.name : 'Cargo';
  }))];
  return `<section data-launder-ledger aria-label="Laundering ledger">` +
    `<p class="k-caps">Laundering ledger · last wash here</p>` +
    `<ul class="k-rows sx-mkt-stats">` +
      rowKV('Papers washed', `${fmt(units)} u · ${names.join(', ')}`) +
      rowKV(`Cut paid (${fmt((Number(receipt.cutFrac) || 0) * 100)}%)`, `${fmt(receipt.cut)} cr`, 'loss') +
    `</ul></section>`;
}

// unit prices — station BUY (what you pay) / SELL (what station pays you)
function unitBuy(entry, def) { return marketQuoteValue(entry, def, 'buy'); }
function unitSell(entry, def) { return marketQuoteValue(entry, def, 'sell'); }
function demandLevel(entry) {
  const multiplier = Number(entry && entry.demandMult) || 1;
  return multiplier > 1.08 ? 3 : multiplier < 0.94 ? 1 : 2;
}
function demandWord(level) { return level >= 3 ? 'high' : level === 1 ? 'low' : 'normal'; }

// Economy samples every 15s. Forty points is ten minutes when timestamps are missing.
const TEN_MIN_S = 600;
const TEN_MIN_SAMPLES = 40;

function parseHistoryPoints(entry) {
  const points = entry && Array.isArray(entry.history) ? entry.history : [];
  const out = [];
  for (const point of points) {
    if (point && typeof point === 'object') {
      const mid = Number(point.mid != null ? point.mid : point);
      const t = Number(point.t);
      if (Number.isFinite(mid) && mid > 0) {
        const row = Number.isFinite(t) ? { t, mid } : { mid };
        if (point.origin === 'modelled' || point.origin === 'observed') row.origin = point.origin;
        out.push(row);
      }
    } else {
      const mid = Number(point);
      if (Number.isFinite(mid) && mid > 0) out.push({ mid });
    }
  }
  return out;
}

function windowHistory(points, nowS) {
  const now = Number(nowS);
  const timed = points.filter((point) => Number.isFinite(point.t));
  if (Number.isFinite(now) && timed.length) {
    const cut = now - TEN_MIN_S;
    const windowed = points.filter((point) => !Number.isFinite(point.t) || point.t >= cut);
    if (windowed.length) return windowed;
  }
  return points.length > TEN_MIN_SAMPLES ? points.slice(-TEN_MIN_SAMPLES) : points;
}

function priceHistory(entry, def, nowS) {
  const values = windowHistory(parseHistoryPoints(entry), nowS).map((point) => point.mid);
  if (values.length > 1) return values;
  // The economy seeds every listing before this screen opens. This is only a defensive
  // degradation for malformed legacy data; it never invents a shared trend.
  const current = Math.max(1, unitBuy(entry, def));
  return [current, current];
}

function priceHistorySeries(entry, def, nowS) {
  const windowed = windowHistory(parseHistoryPoints(entry), nowS);
  if (windowed.length > 1) return windowed;
  const current = Math.max(1, unitBuy(entry, def));
  const now = Number(nowS);
  return Number.isFinite(now)
    ? [{ t: now - TEN_MIN_S, mid: current }, { t: now, mid: current }]
    : [{ mid: current }, { mid: current }];
}

function liveRegimeWord(state, sid, commodityId) {
  const cycle = state && state.economy && state.economy.cycles
    && sid && commodityId && state.economy.cycles[sid] && state.economy.cycles[sid][commodityId];
  return regimeLabel(cycle && (cycle.regime || cycle.family) || 'stable');
}

// The docked chart says "fresh quote" from the live feed in renderStage.
// Opening the market restamps seenAt, so a word computed only from that
// stamp was a constant. Survey packets are labeled separately.
export function quoteAgeWord(_state, _sid, _commodityId) {
  return '';
}

function marketDecisionHtml(state, stationId) {
  if (!stationId) return '';
  const shown = presentSurfaceDecisions(state, stationId, 'market');
  if (!shown.length) return '';
  return shown.map((decision) => (
    `<section class="sx-decision">` +
      `<p class="k-sentence">${escapeHtml(decision.situation)}</p>` +
      decision.options.map((option) => (
        `<button type="button" ${stationControlAttrs('decision-option')} class="k-row sx-decision__opt" data-adventure-id="${escapeHtml(decision.id)}" data-adventure-option="${escapeHtml(option.id)}">` +
          `<span class="k-row__name">${escapeHtml(option.label)}</span>` +
          `<span class="k-row__sub">${escapeHtml(option.tradeoff)}</span>` +
        `</button>`
      )).join('') +
    `</section>`
  )).join('');
}

export function createMarketScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'k-panel k-panel--split sx-mkt orr-market';
  // ORRERY: the Ladder, the trace as light, the quantity dial (src/ui/orrery/marketLayouts.js)
  injectOrreryMarket(document);
  el.innerHTML = marketFrameHtml();
  const adBoardEl = el.querySelector('[data-ad-board]');
  const listEl = el.querySelector('.sx-mkt__list');
  const stageEl = el.querySelector('.sx-mkt__stage');
  const quoteEl = el.querySelector('.sx-mkt__quote');
  const consoleEl = el.querySelector('.sx-mkt__console');
  const tradeEl = el.querySelector('.sx-mkt__trade');
  const routesEl = el.querySelector('.sx-mkt__routes');
  const decisionEl = el.querySelector('.sx-mkt__decision');
  let tradeBusy = false;

  let selectedId = null;
  let mode = 'buy';   // 'buy' | 'sell'
  let qty = 1;
  // INF-084: the stated accepted terms — the live quote behind the receipt the pilot is
  // looking at when they press Buy/Sell. The go handler binds the trade to these, so a
  // market move between render and confirm aborts with an explanation instead of a
  // surprise settlement. Refreshed on every console render; never read blind.
  let lastQuotedTerms = null;
  let cargoOnly = false;
  let marketFilter = 'all';
  let marketQuery = '';
  let listRenderSignature = '';
  // The verb's last side: the Lamp Key morphs its word only when buy becomes sell or back.
  let lastVerbMode = null;
  // The register's chrome (filters, search, table) is built once and updated in place.
  let modeEl = null;
  let searchEl = null;
  let filterEls = null;
  let pressedFilterEl = null;
  let tbodyEl = null;

  function dressBrowser() {
    ensureInteriorStyle();
    pinKeyrack(listEl.querySelector('.sx-mkt-browser__filters'));
    for (const btn of listEl.querySelectorAll('[data-market-filter]')) paintKey(btn, 'legend');
    paintInput(searchEl);
    paintLegend(modeEl);
    for (const th of listEl.querySelectorAll('th')) paintLegend(th);
    dressRows();
  }

  function dressRows() {
    for (const row of rowEls()) {
      paintSelectedTableRow(row, row.classList.contains('is-active') || row.getAttribute('aria-selected') === 'true');
    }
    syncKeys(listEl);
  }

  function dressStage() {
    ensureInteriorStyle();
    if (quoteEl.querySelector('.sf-state')) { dressState(quoteEl); return; }
    paintLegend(quoteEl.querySelector('.sx-mkt-cat-inline'), true);
    paintMarking(quoteEl.querySelector('.sx-mkt-title'));
    paintHero(quoteEl.querySelector('.k-hero__n'));
    paintLegend(quoteEl.querySelector('.k-hero__w'));
    const chart = quoteEl.querySelector('.sx-mkt-chart');
    // The chart wears NO window. ONE_PHOTOGRAPH.md section 4.5: an instrument shows real data
    // as light, or it is not on the screen. A bezel around a price line is a picture of an
    // instrument; the line itself is the instrument, and the darkening it used to sit on is
    // the berth veil's job now. This is also where the smudge came from: the glass render's
    // centre specular, stretched by border-image-slice:fill across a 440px-wide chart.
    for (const row of quoteEl.querySelectorAll('.k-row')) paintRow(row, false);
  }

  function renderLaunderLedger(state) {
    const html = marketLaunderLedgerHtml(state);
    if (!html) return;
    quoteEl.insertAdjacentHTML('beforeend', html);
    const ledger = quoteEl.querySelector('[data-launder-ledger]');
    paintLegend(ledger.querySelector('.k-caps'), true);
    for (const row of ledger.querySelectorAll('.k-row')) paintRow(row, false);
  }

  function dressConsole() {
    ensureInteriorStyle();
    const trade = tradeEl.querySelector('.sx-trade') || tradeEl;
    paintPlate(trade, 'sunk');
    paintLegend(tradeEl.querySelector('.sx-qty__k'));
    paintInput(tradeEl.querySelector('.sx-qty__in'));
    pinKeyrack(tradeEl.querySelector('.sx-qty__words'));
    pinKeyrack(tradeEl.querySelector('.sx-trade__words, .sx-seg'));
    for (const btn of tradeEl.querySelectorAll('[data-q]')) paintKey(btn, 'small');
    const buy = tradeEl.querySelector('.sx-trade__go--buy, [data-mode="buy"]');
    const sell = tradeEl.querySelector('.sx-trade__go--sell, [data-mode="sell"]');
    // A DISABLED VERB IS NOT THE HEAVIEST THING ON THE SCREEN. ONE_PHOTOGRAPH.md section 4.4 asks
    // whether the most consequential control is the heaviest object; with no credits, BUY wore the
    // full amber cap while SELL -- the only trade the player could actually make -- was a bare
    // word beside it. The live side earns mass only while it can be pressed.
    const heavy = (btn) => btn.hasAttribute('data-go') && !btn.disabled ? 'primary' : 'legend';
    if (buy) paintKey(buy, heavy(buy));
    if (sell) paintKey(sell, heavy(sell));
    for (const row of tradeEl.querySelectorAll('.k-row')) paintRow(row, false);
    dressState(tradeEl);
    syncKeys(tradeEl);
  }

  function dressRoutes() {
    ensureInteriorStyle();
    paintLegend(routesEl.querySelector('.sx-mkt__routes-head'), true);
    for (const row of routesEl.querySelectorAll('.sx-route-row')) paintRow(row, false);
    for (const btn of routesEl.querySelectorAll('[data-course]')) paintKey(btn, 'small');
  }

  // The commodity your tracked contract wants loaded. Market flags it so the accept→buy→deliver loop
  // is legible ("buy this here for your job"). Prefer an explicit trade waypoint; else fall back to
  // the tracked mission's own cargo commodity (works even when nav points elsewhere).
  function trackedCmdty(state) {
    const wp = state && state.nav && state.nav.waypoint;
    if (wp && wp.kind === 'trade' && wp.commodityId) return wp.commodityId;
    const tid = state && state.ui && state.ui.trackedMissionId;
    const active = (state && state.missions && state.missions.active) || [];
    const m = tid ? active.find((x) => x && x.id === tid) : null;
    const cid = m && ((m.cargo && m.cargo.commodityId) || (m.params && m.params.cmdtyId));
    return cid || null;
  }

  function trackedCargoGuidance(state, cmdtyId, commodityName) {
    const trackedId = state && state.ui && state.ui.trackedMissionId;
    const active = (state && state.missions && state.missions.active) || [];
    const mission = trackedId ? active.find((entry) => entry && entry.id === trackedId) : null;
    const missionCmdty = mission && ((mission.cargo && mission.cargo.commodityId)
      || (mission.params && mission.params.cmdtyId));
    if (!mission || !missionCmdty || missionCmdty !== cmdtyId) {
      return { state: 'missing', text: `Buy ${commodityName} here to load your job.` };
    }
    const requested = Math.max(1, Math.floor(Number(
      (mission.cargo && mission.cargo.qty) || (mission.params && mission.params.qty) || 1,
    ) || 1));
    const held = heldQty(state, cmdtyId);
    if (held >= requested) {
      const destination = mission.destinationName || mission.destName
        || (mission.params && (mission.params.destinationName || mission.params.destName))
        || mission.destStationId || mission.destSectorId || 'the marked destination';
      return {
        state: 'aboard',
        text: `Cargo is aboard — undock and follow nav to ${destination}.`,
      };
    }
    const remaining = requested - held;
    return {
      state: 'missing',
      text: `Load ${remaining}u more ${commodityName} before undocking.`,
    };
  }

  function tradedList(state) {
    const table = marketTable(state);
    const ids = table ? Object.keys(table) : COMMODITIES.map((c) => c.id);
    const rows = ids.map((id) => ({ id, def: CMDTY_BY_ID.get(id), entry: table && table[id] }))
      .filter((r) => r.def);
    // Sell is the hold. A sealed lot stays on that list so the pilot can see what they
    // are carrying; the sell limit below is what keeps the counter from buying it.
    return cargoOnly
      ? rows.filter((r) => heldQty(state, r.id) > 0)
      : rows;
  }

  // Keep the commodity instrument honest: exact quantity pricing comes from the live economy
  // authority; remembered quotes stay in the pure presenter, and a route margin only appears for
  // a route the existing Market has actually found from this station.
  function selectedMarketIntel(state, row, quote) {
    const sid = stationId(state);
    let route = null;
    if (mode === 'buy' && sid) {
      try { route = (computeBestTrades(state, sid) || []).find((trade) => trade.cmdtyId === row.id) || null; } catch (_) { route = null; }
    }
    const view = presentCommodityIntel({
      state,
      commodityId: row.id,
      stationId: sid,
      liveBuy: unitBuy(row.entry, row.def),
      liveSell: unitSell(row.entry, row.def),
      qty,
      quoteUnit: quote && quote.ok ? quote.unitAvg : null,
      priceImpactPct: quote && quote.ok ? quote.priceImpactPct : null,
      side: mode,
      def: row.def,
      route,
    });
    return presentInspectorRows(view).filter((intelRow) => {
      if (intelRow.id === 'age' || intelRow.id === 'conf' || intelRow.id === 'kvl') return true;
      if (intelRow.id === 'cargo') return mode === 'buy' && qty >= 1;
      return (intelRow.id === 'margin' || intelRow.id === 'route') && !!route;
    });
  }

  function selectedTradeQuote(state, row, quantity = qty) {
    const sid = stationId(state);
    const economy = ctx.registry && typeof ctx.registry.get === 'function' ? ctx.registry.get('economy') : null;
    if (!economy || typeof economy.quote !== 'function' || !sid || quantity < 1) return null;
    try { return economy.quote(sid, row.id, mode, quantity); } catch (_) { return null; }
  }

  // INF-083: the contemplated-sale line quotes the FULL batch through the economy
  // owner (stock-sensitive average, partial-aware), never unit×qty. Quoting writes
  // nothing — stock moves only in execute() on confirm.
  function contemplatedSaleQuote(sid, cmdtyId, quantity) {
    const economy = ctx.registry && typeof ctx.registry.get === 'function' ? ctx.registry.get('economy') : null;
    if (!economy || typeof economy.quote !== 'function' || !sid) return null;
    try {
      const q = economy.quote(sid, cmdtyId, 'sell', Math.max(1, Math.floor(Number(quantity) || 1)));
      if (!q || !q.ok) return null;
      // The sale is at the berth the pilot is already in, so no jump remains to subtract.
      // Settling at the counter does not charge automation upkeep. Both stay on the line
      // so a later non-zero bill cannot hide inside the gross.
      return { ...q, travelCost: 0, operatingCost: 0 };
    } catch (_) { return null; }
  }

  function tradeQuantityLimit(state, row) {
    if (mode === 'sell' && row) return sellableCargoQuantity(state, row.id);
    const free = holdFree(state);
    const volume = Number(row.def.volPerU) > 0 ? Number(row.def.volPerU) : 1;
    const stock = Math.max(0, Math.floor(Number(row.entry && row.entry.stock) || 0) - 1);
    const limit = Math.min(stock, free === Infinity ? stock : Math.floor(free / volume));
    return maxAffordableQuantity({ limit, credits: credits(state), quote: (n) => selectedTradeQuote(state, row, n) });
  }

  // A sealed lot stays on the sell list. The dial, the sale line, and the hold
  // arc must describe no sale of it, including after Fewer or More. NXB-025:
  // the pin binds the sealed count — units free of the reservation still dial.
  function pinSealedSellQuantity(state, id = selectedId) {
    if (mode === 'sell' && id && reservedCargoQuantity(state, id) > 0) {
      qty = Math.min(qty, sellableCargoQuantity(state, id));
    }
  }

  function sellOpeningQuantity(state, id) {
    return sellableCargoQuantity(state, id);
  }

  function openTradeMode(nextMode, state, options = {}) {
    mode = nextMode === 'sell' ? 'sell' : 'buy';
    // Sell is a cargo operation, so its selector always begins with things actually in the hold.
    // options.cargoOnly remains accepted for call-site compatibility, but never widens Sell into
    // forty-two commodities the player does not own.
    cargoOnly = mode === 'sell';
    marketFilter = cargoOnly ? 'hold' : 'all';
    marketQuery = '';
    listRenderSignature = '';
    const rows = tradedList(state);
    if (mode === 'sell' && rows.length) {
      const held = rows.find((r) => heldQty(state, r.id) > 0) || rows[0];
      selectedId = held.id;
      qty = sellOpeningQuantity(state, held.id);
      pinSealedSellQuantity(state, held.id);
    } else {
      qty = 1;
    }
  }

  // Feature 16 — direct profit badge. Cost basis is the FIFO trade-lot average the economy ledger
  // keeps on the player; cargo without a purchase record (mined, salvaged) falls back to the
  // catalog base price, so a smart route reads the same whether goods were bought or dug out.
  function heldProfitPct(state, cmdtyId, sellUnit, def) {
    if (!Number.isFinite(sellUnit) || sellUnit <= 0) return null;
    let basis = 0;
    const lots = state && state.player && state.player.tradeLots
      && state.player.tradeLots[cmdtyId];
    if (Array.isArray(lots) && lots.length) {
      let qty = 0, cost = 0;
      for (const lot of lots) {
        const q = Math.max(0, Math.floor(Number(lot && lot.qty) || 0));
        const u = Number(lot && lot.unit) || 0;
        if (q > 0 && u > 0) { qty += q; cost += q * u; }
      }
      if (qty > 0) basis = cost / qty;
    }
    if (!(basis > 0)) basis = Number(def && def.basePrice) || 0;
    if (!(basis > 0)) return null;
    return ((sellUnit - basis) / basis) * 100;
  }

  // One register row: name (◆ before it when tracked), buy + trend, sell, stock, held.
  function commodityRowHtml(r, state, tracked_, selected) {
    const hist = priceHistory(r.entry, r.def, state && state.simTime);
    const buy = unitBuy(r.entry, r.def);
    const sell = unitSell(r.entry, r.def);
    const stock = Math.max(0, Math.floor(Number(r.entry && r.entry.stock) || 0));
    const demand = demandLevel(r.entry);
    const drivers = presentMarketDrivers({ state, stationId: stationId(state), commodity: r.def, entry: r.entry });
    const held = heldQty(state, r.id);
    return marketRowHtml({ id: r.id, name: r.def.name, category: r.def.category,
      buy, sell, stock, held, hist, demandWord: demandWord(demand),
      profitPct: heldProfitPct(state, r.id, sell, r.def),
      driversSummary: drivers.accessibleSummary, selected, tracked: r.id === tracked_,
      presentation: commodityPresentationFor(r.def) });
  }

  function emptyFilterLabel() {
    return marketQuery || MARKET_FILTERS.find((f) => f.id === marketFilter)?.label || 'this filter';
  }

  // The register chrome (exchange line, family filters, search, table) is built once and then
  // updated in place, so typing in the search and arrowing through the rows survive price ticks.
  function buildBrowserChrome() {
    listEl.innerHTML = bindStationMarkup(marketBrowserHtml());
    modeEl = listEl.querySelector('.sx-mkt-browser__mode');
    searchEl = listEl.querySelector('[data-market-search]');
    // The find is a scale line with a cursor: the input keeps its hooks, the span carries the rule.
    if (searchEl && typeof searchEl.replaceWith === 'function' && typeof document !== 'undefined'
      && typeof document.createElement === 'function') {
      const wrap = document.createElement('span');
      wrap.className = 'orr-mkt-find';
      searchEl.replaceWith(wrap);
      wrap.appendChild(searchEl);
      const cursor = document.createElement('span');
      cursor.className = 'orr-mkt-find__cursor';
      cursor.setAttribute('aria-hidden', 'true');
      wrap.appendChild(cursor);
    }
    tbodyEl = listEl.querySelector('tbody');
    filterEls = new Map();
    for (const btn of listEl.querySelectorAll('[data-market-filter]')) {
      filterEls.set(btn.getAttribute('data-market-filter'), btn);
    }
    dressBrowser();
  }

  // The register's rows (the fake DOM in tests has no HTMLTableSectionElement.rows).
  function rowEls() { return tbodyEl ? [...tbodyEl.querySelectorAll('.sx-mkt-row')] : []; }

  // Selection follows focus and the pointer alike: restyle the two rows whose state moved, then
  // redraw the two panels that read `selectedId`.
  function selectCommodity(id, { focus = false } = {}) {
    if (!id || !tbodyEl) return;
    const changed = id !== selectedId;
    selectedId = id;
    for (const row of rowEls()) {
      const on = row.getAttribute('data-cmdty') === id;
      row.classList.toggle('is-active', on);
      row.setAttribute('aria-selected', String(on));
      row.setAttribute('tabindex', on ? '0' : '-1');
      if (on && focus) { try { row.focus({ preventScroll: false }); } catch (_) {} }
    }
    dressRows();
    if (!changed) return;
    qty = mode === 'sell' ? sellOpeningQuantity(ctx.state || {}, id) : 1;
    pinSealedSellQuantity(ctx.state || {}, id);
    const state = ctx.state || {};
    renderStage(state); renderConsole(state);
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  }

  // The register's rows are keyed by commodity: a price tick rewrites only the cells that moved and
  // keeps every row node, so the row under the pointer, its focus and the rail's Hand survive the
  // tick (the rows used to be rebuilt wholesale on any price, stock or demand change). A DOM
  // without <template> content (the node test shim) takes the rebuild.
  const rowTpl = typeof document !== 'undefined' && document.createElement ? document.createElement('template') : null;
  function syncRows(keyed) {
    const canPatch = !!(rowTpl && rowTpl.content && typeof tbodyEl.insertBefore === 'function');
    if (!canPatch) { tbodyEl.innerHTML = keyed.map(([, html]) => html).join(''); return; }
    const existing = new Map(rowEls().map((row) => [row.getAttribute('data-cmdty'), row]));
    let prev = null;
    for (const [id, html] of keyed) {
      rowTpl.innerHTML = `<table><tbody>${html}</tbody></table>`;
      const next = rowTpl.content.querySelector('tr');
      if (!next) continue;
      let row = existing.get(id);
      if (row && row.children.length === next.children.length) {
        for (const name of ['aria-selected', 'tabindex', 'aria-label', 'data-family']) {
          const v = next.getAttribute(name);
          if (v == null) row.removeAttribute(name);
          else if (row.getAttribute(name) !== v) row.setAttribute(name, v);
        }
        row.classList.toggle('is-active', next.classList.contains('is-active'));
        row.classList.toggle('is-tracked', next.classList.contains('is-tracked'));
        [...next.children].forEach((cell, i) => {
          const old = row.children[i];
          if (old.innerHTML !== cell.innerHTML) old.innerHTML = cell.innerHTML;
        });
        existing.delete(id);
      } else {
        if (row) { row.remove(); existing.delete(id); }
        row = next;
      }
      const at = prev ? prev.nextElementSibling : tbodyEl.firstElementChild;
      if (row !== at) tbodyEl.insertBefore(row, at);
      prev = row;
    }
    for (const row of existing.values()) row.remove();
  }

  function placeTradeHand() {
    const go = tradeEl && tradeEl.querySelector('[data-go]');
    const qtyIn = tradeEl && tradeEl.querySelector('.sx-qty__in');
    const row = tbodyEl && tbodyEl.querySelector('.sx-mkt-row.is-active');
    const choice = marketTradeFocusChoice({
      goEnabled: !!(go && !go.disabled && !go.hidden),
      hasQuantity: !!(qtyIn && !qtyIn.hidden),
      hasRow: !!(row && !row.hidden),
    });
    const target = choice === 'go' ? go : choice === 'quantity' ? qtyIn : choice === 'row' ? row : null;
    const host = choice === 'row' ? listEl : tradeEl;
    if (!focusNamedStationControl(target, host)) focusNamedStationControl(searchEl, listEl);
  }

  function placeMarketHand(preferredId) {
    const listed = rowEls();
    const row = listed.find((node) => node.getAttribute('data-cmdty') === preferredId);
    if (focusNamedStationControl(row, listEl)) return;
    if (focusNamedStationControl(searchEl, listEl)) return;
    focusNamedStationControl(pressedFilterEl, listEl);
  }

  function renderList(state) {
    const rows = tradedList(state);
    const tracked_ = trackedCmdty(state);
    const query = marketQuery.trim().toLocaleLowerCase();
    const visible = rows.filter((r) => {
      const family = marketFamily(r.def.category || '');
      if (marketFilter === 'hold' && heldQty(state, r.id) <= 0) return false;
      if (marketFilter !== 'all' && marketFilter !== 'hold' && family !== marketFilter) return false;
      return !query || `${r.def.name} ${r.def.category || ''}`.toLocaleLowerCase().includes(query);
    });
    const decision = resolveMarketSelection({
      selectedId,
      visibleIds: visible.map((r) => r.id),
      tradedIds: rows.map((r) => r.id),
    });
    // First open may adopt a listed lot. A later refresh must not replace the lot the receipt names.
    if (decision.adoptedInitial && decision.selectedId) {
      selectedId = decision.selectedId;
      qty = mode === 'sell' ? heldQty(state, selectedId) : 1;
      pinSealedSellQuantity(state, selectedId);
    }
    // Unknown stock prints no column of dashes: when no visible row carries a stock figure or
    // held cargo, the STOCK column yields.
    const stockKnown = visible.some((r) => (Number(r.entry && r.entry.stock) || 0) > 0 || heldQty(state, r.id) > 0);
    if (listEl && listEl.classList && typeof listEl.classList.toggle === 'function') {
      listEl.classList.toggle('is-stockless', !stockKnown);
    }

    if (!tbodyEl) buildBrowserChrome();

    // `tracked_` is rendered into every row (the ◆ flag), so it belongs in the signature; the
    // selection is applied in place by selectCommodity and stays out of it.
    const signature = JSON.stringify({
      marketFilter, marketQuery, cargoOnly, tracked: tracked_,
      rows: visible.map((r) => [r.id, unitBuy(r.entry, r.def), unitSell(r.entry, r.def), r.entry && r.entry.stock,
        heldQty(state, r.id), r.entry && r.entry.demandMult, priceHistory(r.entry, r.def, state.simTime).at(-1),
        // The badge moves with the cost basis, not only the price — include it so a fresh buy
        // reprices the row even when quantity is unchanged.
        Math.round(heldProfitPct(state, r.id, unitSell(r.entry, r.def), r.def) || 0)]),
    });
    if (signature !== listRenderSignature) {
      listRenderSignature = signature;
      modeEl.firstChild.textContent = cargoOnly ? 'Your cargo hold' : 'Station exchange';
      modeEl.querySelector('b').textContent = ` · ${visible.length} of ${rows.length}`;
      for (const [id, btn] of filterEls) {
        btn.classList.toggle('is-on', id === marketFilter);
        btn.setAttribute('aria-pressed', String(id === marketFilter));
      }
      // Written only when it actually differs: assigning to a focused search field on every price
      // tick would drop the caret to the end mid-word.
      if (searchEl.value !== marketQuery) searchEl.value = marketQuery;

      const prior = typeof document !== 'undefined' ? document.activeElement : null;
      const focused = !!(prior && tbodyEl.contains(prior));
      const priorCmdty = prior && prior.getAttribute ? prior.getAttribute('data-cmdty') : null;
      syncRows(visible.map((r) => [r.id, commodityRowHtml(r, state, tracked_, r.id === selectedId)]));
      const emptyEl = listEl.querySelector('.sx-mkt-browser__empty');
      emptyEl.hidden = visible.length > 0;
      emptyEl.textContent = visible.length ? '' : `No commodities match ${emptyFilterLabel()}.`;
      dressRows();
      const listed = rowEls();
      const priorGone = !!(priorCmdty && !listed.some((row) => row.getAttribute('data-cmdty') === priorCmdty));
      if (priorGone) {
        placeMarketHand(decision.focusId);
      } else if (focused) {
        const active = tbodyEl.querySelector('.is-active');
        if (!focusNamedStationControl(active, listEl)) focusNamedStationControl(searchEl, listEl);
      }
    } else if (selectedId) {
      for (const row of rowEls()) {
        const on = row.getAttribute('data-cmdty') === selectedId;
        if (row.classList.contains('is-active') !== on) {
          row.classList.toggle('is-active', on);
          row.setAttribute('aria-selected', String(on));
          row.setAttribute('tabindex', on ? '0' : '-1');
        }
      }
    }
  }

  function renderStage(state) {
    const rows = tradedList(state);
    const r = rows.find((x) => x.id === selectedId) || null;
    if (!r) {
      stageEl.removeAttribute('aria-labelledby');
      stageEl.removeAttribute('aria-label');
      stageEl.removeAttribute('aria-describedby');
      consoleEl.hidden = true;
      if (decisionEl) decisionEl.innerHTML = '';
      const next = rows[0] || null;
      const lotGone = !!selectedId && !!next;
      mountDataState(quoteEl, 'empty', {
        code: lotGone ? 'LOT_GONE' : (mode === 'sell' ? 'HOLD_EMPTY' : 'EXCHANGE_DARK'),
        headline: lotGone ? 'That lot left the board.' : (mode === 'sell' ? 'Your hold is empty.' : 'No market at this berth.'),
        fills: lotGone
          ? 'The confirmation still names the lot you had. Choose a listed lot before anything else is traded.'
          : (mode === 'sell'
            ? 'Buy cargo here or bring material back from mining before opening Sell.'
            : 'This station has no tradable stock. Another berth may still quote.'),
        verb: lotGone
          ? {
            label: 'Show ' + next.def.name,
            onActivate: () => selectCommodity(next.id, { focus: true }),
          }
          : (mode === 'sell'
            ? {
              label: 'Switch to Buy',
              onActivate: () => {
                openTradeMode('buy', ctx.state || {});
                renderAll(ctx.state || {});
              },
            }
            : {
              label: 'Plot another berth',
              onActivate: () => openGalaxyMap(ctx, { focus: MAP_FOCUS.SYSTEM, source: 'market-empty' }),
            }),
      });
      dressStage();
      renderLaunderLedger(state);
      return;
    }
    consoleEl.hidden = false;
    pinSealedSellQuantity(state, r.id);
    const def = r.def, entry = r.entry;
    const sid = stationId(state);
    const hist = priceHistorySeries(entry, def, state && state.simTime);
    const forecast = sid ? predictPriceCurve(state, sid, r.id) : [];
    const buy = unitBuy(entry, def), sell = unitSell(entry, def);
    const avg = Number(def.basePrice) || buy;
    const demand = demandLevel(entry);
    const drivers = presentMarketDrivers({ state, stationId: sid, commodity: def, entry });
    const legal = def.legality || 'legal';
    const isTracked = trackedCmdty(state) === r.id;
    const trackedGuidance = isTracked ? trackedCargoGuidance(state, r.id, def.name) : null;
    stageEl.setAttribute('aria-labelledby', `sx-market-tab-${r.id}`);
    stageEl.setAttribute('aria-label', def.name);
    stageEl.setAttribute('aria-describedby', 'sx-market-driver-summary');
    quoteEl.innerHTML = marketQuoteHtml({ id: r.id, name: def.name, category: def.category, legal,
      titleHtml: entitySpanHtml('commodity:' + r.id, escapeHtml(def.name)), mode, buy, sell, avg,
      demandWord: demandWord(demand), driversSummary: drivers.accessibleSummary, drivers: drivers.primary, hist, trackedGuidance,
      producedBy: def.producedBy, consumedBy: def.consumedBy, stationType: resolveDockStationType(state),
      forecast, now: state && state.simTime, regime: liveRegimeWord(state, sid, r.id),
      quoteAge: 'fresh', quoteSource: 'live',
      survey: rememberedSurveyFreshness(state, r.id),
      saleQty: qty,
      saleQuote: contemplatedSaleQuote(sid, r.id, qty) }) + (decisionEl ? '' : marketDecisionHtml(state, sid));
    if (decisionEl) {
      const decisionHtml = marketDecisionHtml(state, sid);
      if (decisionEl.innerHTML !== decisionHtml) decisionEl.innerHTML = decisionHtml;
    }
    dressStage();
    renderLaunderLedger(state);
    instrumentStage(state, r, { buy, sell, demandLevel: demand, demandWord: demandWord(demand) });
    syncTicker();
  }

  // THE INSTRUMENT DRESSING. The quote's grids dissolve onto the trace: the hero numeral moves to
  // the price scale's right end, the driver words join the foot key, spread brackets the scale,
  // demand becomes an arc, the trace gains its band and the trade's price-impact ghost. Cosmetic
  // only — every reading it moves stays in the DOM for assistive technology and the checks.
  function instrumentStage(state, r, info) {
    const heroEl = quoteEl.querySelector('.sx-mkt__hero');
    const instrumentEl = quoteEl.querySelector('.sx-mkt-instrument');
    const plot = quoteEl.querySelector('.sx-mkt-instrument__plot');
    if (heroEl && instrumentEl && quoteEl.children && typeof getComputedStyle === 'function') {
      heroEl.style.gridColumn = '2';
      heroEl.style.gridRow = String(quoteHeroRow(quoteEl, heroEl, instrumentEl));
    }
    dissolveDrivers(quoteEl);
    const demandVal = quoteEl.querySelector('.sx-mkt-readouts__item--demand dd');
    if (demandVal) demandVal.innerHTML = demandArcHtml(info.demandLevel, info.demandWord);
    if (plot) {
      syncTraceBand(plot);
      syncSpreadBracket(plot, info.buy, info.sell);
      syncGhost(plot, impact01Of(selectedTradeQuote(state, r)), mode);
    }
  }

  // The hero numeral's grid row: the instrument's own row, counting only the siblings that take
  // part in grid auto-placement (the essay and cone read are absolutely placed, the drivers are
  // folded, the tracked line carries order 20, the hero is explicitly placed and takes no slot).
  function quoteHeroRow(quoteRoot, heroEl, instrumentEl) {
    let row = 1;
    for (const sib of quoteRoot.children) {
      if (sib === instrumentEl) break;
      if (sib === heroEl) continue;
      if (sib.classList && sib.classList.contains('sx-mkt-tracked')) continue;
      let cs = null;
      try { cs = getComputedStyle(sib); } catch (_) { cs = null; }
      if (cs && (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed')) continue;
      row += 1;
    }
    return row;
  }

  // The driver grid dissolves: its words join the instrument's foot key while the spread's
  // value brackets the price scale.
  function dissolveDrivers(quoteRoot) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    const items = quoteRoot.querySelectorAll ? [...quoteRoot.querySelectorAll('.sx-mkt-drivers__item')] : [];
    const bits = [];
    for (const it of items) {
      const k = it.querySelector('.sx-mkt-drivers__k');
      const v = it.querySelector('.sx-mkt-drivers__v');
      const kind = k ? k.textContent.trim() : '';
      const value = v ? v.textContent.trim() : '';
      if (!value) continue;
      bits.push({ kind, value, dir: it.getAttribute('data-dir') || 'flat', tip: it.getAttribute('title') || '' });
    }
    const key = quoteRoot.querySelector('.sx-mkt-chart-key');
    if (key && bits.length && key.parentNode) {
      const p = document.createElement('p');
      p.className = 'orr-mkt-subkey';
      p.setAttribute('aria-hidden', 'true');
      for (const bit of bits) {
        const s = document.createElement('span');
        s.className = 'orr-mkt-subkey__bit';
        s.setAttribute('data-dir', bit.dir);
        if (bit.tip) s.setAttribute('title', bit.tip);
        const kk = document.createElement('span');
        kk.textContent = bit.kind;
        const b = document.createElement('b');
        b.textContent = bit.value;
        s.appendChild(kk);
        s.appendChild(document.createTextNode(' '));
        s.appendChild(b);
        p.appendChild(s);
      }
      key.parentNode.insertBefore(p, key.nextSibling);
    }
  }

  // The trace's band: the history line drawn again beneath itself, wide and faint, so the trace
  // is a body of light and not a wire.
  function syncTraceBand(plot) {
    if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return;
    const svg = plot.querySelector('svg.sx-mkt-chart');
    const line = svg ? svg.querySelector('.sx-mkt-line[data-history-line]') : null;
    const d = line ? line.getAttribute('d') : '';
    if (!svg || !line || !d || svg.querySelector('.sx-mkt-band')) return;
    const band = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    band.setAttribute('class', 'sx-mkt-band');
    band.setAttribute('d', d);
    band.setAttribute('fill', 'none');
    band.setAttribute('vector-effect', 'non-scaling-stroke');
    band.setAttribute('stroke-linejoin', 'round');
    band.setAttribute('stroke-linecap', 'round');
    band.setAttribute('aria-hidden', 'true');
    svg.insertBefore(band, line);
  }

  // The spread bracket on the scale between the BUY and SELL beads, labelled with the margin.
  function syncSpreadBracket(plot, buy, sell) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    if (plot.querySelector('.orr-mkt-spread')) return;
    const readTop = (sel) => {
      const tick = plot.querySelector(sel);
      const raw = tick && tick.style ? String(tick.style.top || '') : '';
      const v = raw ? Number(raw.replace('%', '')) : NaN;
      return Number.isFinite(v) ? v : null;
    };
    const a = readTop('.sx-mkt-instrument__tick--buy');
    const b = readTop('.sx-mkt-instrument__tick--sell');
    if (a == null || b == null) return;
    const el = document.createElement('div');
    el.className = 'orr-mkt-spread';
    el.setAttribute('aria-hidden', 'true');
    const h = Number(plot.clientHeight) || 0;
    if (h > 0) {
      const topPx = (Math.min(a, b) / 100) * h;
      const botPx = (Math.max(a, b) / 100) * h;
      const height = Math.max(40, botPx - topPx);
      const top = Math.max(0, Math.min(h - height, ((topPx + botPx) / 2) - (height / 2)));
      el.style.top = `${Math.round(top)}px`;
      el.style.height = `${Math.round(height)}px`;
    } else {
      el.style.top = `${Math.min(a, b)}%`;
      el.style.height = `${Math.max(2, Math.abs(b - a))}%`;
    }
    const margin = Math.max(0, Math.round((Number(buy) || 0) - (Number(sell) || 0)));
    const v = document.createElement('span');
    v.className = 'orr-mkt-spread__v';
    v.appendChild(document.createTextNode(fmt(margin)));
    const k = document.createElement('span');
    k.className = 'orr-mkt-spread__k';
    k.textContent = 'spread';
    v.appendChild(k);
    el.appendChild(v);
    plot.appendChild(el);
  }

  // The price-impact ghost: the contemplated trade's own segment on the trace, from the live end
  // toward where the trade would move the price — up when buying, down when selling. Updates in
  // place while the dial turns; removed when there is no live impact.
  function syncGhost(plot, impact01, tradeMode) {
    if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return;
    const svg = plot.querySelector('svg.sx-mkt-chart');
    const line = svg ? svg.querySelector('.sx-mkt-line[data-history-line]') : null;
    const d = line ? line.getAttribute('d') : '';
    const m = d ? /([\d.]+),([\d.]+)\s*$/.exec(d) : null;
    const ghost = svg ? svg.querySelector('.sx-mkt-ghost') : null;
    const bead = svg ? svg.querySelector('.sx-mkt-ghostbead') : null;
    if (!svg || !m || !(impact01 > 0)) {
      if (ghost) ghost.remove();
      if (bead) bead.remove();
      return;
    }
    const x1 = Number(m[1]);
    const y1 = Number(m[2]);
    const dy = Math.max(6, Math.min(110, impact01 * 140));
    const x2 = Math.min(996, x1 + 64);
    const y2 = Math.max(6, Math.min(234, tradeMode === 'sell' ? y1 + dy : y1 - dy));
    const NS = 'http://www.w3.org/2000/svg';
    let g = ghost;
    if (!g) {
      g = document.createElementNS(NS, 'path');
      g.setAttribute('class', 'sx-mkt-ghost');
      g.setAttribute('fill', 'none');
      g.setAttribute('vector-effect', 'non-scaling-stroke');
      g.setAttribute('aria-hidden', 'true');
      svg.appendChild(g);
    }
    g.setAttribute('d', `M ${r2(x1)} ${r2(y1)} L ${r2(x2)} ${r2(y2)}`);
    let dot = bead;
    if (!dot) {
      dot = document.createElementNS(NS, 'ellipse');
      dot.setAttribute('class', 'sx-mkt-ghostbead');
      dot.setAttribute('rx', '4');
      dot.setAttribute('ry', '6.5');
      dot.setAttribute('aria-hidden', 'true');
      svg.appendChild(dot);
    }
    dot.setAttribute('cx', String(r2(x2)));
    dot.setAttribute('cy', String(r2(y2)));
  }

  function refreshGhost() {
    const plot = quoteEl.querySelector('.sx-mkt-instrument__plot');
    if (!plot) return;
    const state = ctx.state || {};
    const row = tradedList(state).find((x) => x.id === selectedId);
    if (!row) return;
    syncGhost(plot, impact01Of(selectedTradeQuote(state, row)), mode);
  }

  // The tape: the ladder's prices streaming under the trace. Built from the rendered rows
  // (the same numbers the player reads), in ladder order, capped; two identical halves loop
  // the marquee. The ladder holds every reading accessibly, so the tape is motion only.
  let tickerSig = '';
  function syncTicker() {
    const instrument = quoteEl.querySelector('.sx-mkt-instrument');
    // the tape foots the analysis: after the sale line when there is one, else the instrument
    const anchor = quoteEl.querySelector('.sx-mkt-sale') || instrument;
    const prev = quoteEl.querySelector('.orr-mkt-tape');
    const items = [];
    if (anchor && typeof document !== 'undefined' && typeof document.createElement === 'function') {
      for (const row of rowEls().slice(0, 14)) {
        const def = CMDTY_BY_ID.get(row.getAttribute('data-cmdty') || '');
        const priceCell = row.querySelector('.sx-mkt-row__price');
        const price = priceCell && priceCell.firstChild ? String(priceCell.firstChild.textContent || '').trim() : '';
        const tr = row.querySelector('.sx-mkt-row__tr');
        const flat = !tr || (tr.classList && tr.classList.contains('is-flat')) || tr.getAttribute('aria-label') === 'History unavailable';
        const trend = tr && !flat ? String(tr.textContent || '').trim() : '';
        if (!def || !price) continue;
        items.push({ name: def.name, price, trend });
      }
    }
    if (!anchor || !items.length) {
      if (prev) prev.remove();
      tickerSig = '';
      return;
    }
    const sig = items.map((it) => `${it.name}|${it.price}|${it.trend}`).join('~');
    if (prev && sig === tickerSig) return;
    tickerSig = sig;
    const half = items.map((it) => `<span class="orr-mkt-tape__it">${escapeHtml(String(it.name)).toUpperCase()} `
      + `<span class="orr-mkt-tape__p">${escapeHtml(it.price)}</span>`
      + (it.trend ? ` <span class="orr-mkt-tape__t">${escapeHtml(it.trend)}</span>` : '') + '</span>').join('');
    const tape = document.createElement('div');
    tape.className = 'orr-mkt-tape';
    tape.setAttribute('aria-hidden', 'true');
    tape.innerHTML = `<div class="orr-mkt-tape__run"><div class="orr-mkt-tape__half">${half}</div><div class="orr-mkt-tape__half">${half}</div></div>`;
    if (prev) prev.replaceWith(tape);
    else if (anchor.parentNode) anchor.parentNode.insertBefore(tape, anchor.nextSibling);
    else quoteEl.appendChild(tape);
  }

  // The total as a rolling counter: the digits roll, the unit suffix stands beside them.
  function setTradeTotal(el, text) {
    const str = String(text == null ? '' : text);
    const m = /^([\d,]+)(.*)$/.exec(str);
    if (!el || !m || typeof document === 'undefined' || typeof document.createElement !== 'function') {
      if (el) el.textContent = str;
      return;
    }
    const kids = el.children ? [...el.children] : [];
    const has = (cls) => kids.find((k) => k.classList && typeof k.classList.contains === 'function' && k.classList.contains(cls)) || null;
    let num = has('orr-mkt-totalnum');
    if (!num) {
      el.textContent = '';
      num = document.createElement('span');
      num.className = 'orr-mkt-totalnum';
      el.appendChild(num);
    }
    rollTo(num, m[1]);
    // The rolling columns spell every digit for layout; the strong keeps the true value as read.
    el.setAttribute('aria-label', `${m[1]}${m[2] || ''}`.trim());
    const sufText = m[2] || '';
    const suf = has('orr-mkt-totalsuf');
    if (sufText) {
      if (!suf) {
        const s = document.createElement('span');
        s.className = 'orr-mkt-totalsuf';
        s.textContent = sufText;
        el.appendChild(s);
      } else if (suf.textContent !== sufText) suf.textContent = sufText;
    } else if (suf) suf.remove();
  }

  // The hold arc under the total: what the hold looks like after this trade fills.
  function syncHoldArc(state, def) {
    const total = tradeEl.querySelector('.so-trade-total');
    if (!total || typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    const cargo = state && state.player && state.player.cargo;
    const cap = Math.max(0, Number(cargo && cargo.capVolume) || 0);
    const kids = total.children ? [...total.children] : [];
    const host = kids.find((k) => k.classList && typeof k.classList.contains === 'function' && k.classList.contains('orr-mkt-holdarc')) || null;
    if (!(cap > 0)) {
      if (host) host.hidden = true;
      return;
    }
    let box = host;
    if (!box) {
      box = document.createElement('div');
      box.className = 'orr-mkt-holdarc';
      box.setAttribute('aria-hidden', 'true');
      total.appendChild(box);
    }
    box.hidden = false;
    const used = Math.max(0, Number(cargo && cargo.usedVolume) || 0);
    const vol = Number(def && def.volPerU) > 0 ? Number(def.volPerU) : 1;
    const amount = Math.max(0, qty);
    const after = mode === 'buy' ? used + amount * vol : Math.max(0, used - amount * vol);
    const html = holdArcHtml(after, cap);
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  function renderConsole(state, { receiptOnly = false } = {}) {
    const rows = tradedList(state);
    const r = rows.find((x) => x.id === selectedId) || null;
    if (!r) {
      lastQuotedTerms = null;
      tradeEl.innerHTML =
        `<div class="sx-trade sx-trade--empty">` +
          `<ul class="k-words k-words--row sx-seg" role="tablist">` +
            `<li><button type="button" ${stationControlAttrs('buy')} class="k-word k-word--emph sx-seg__btn${mode === 'buy' ? ' is-on' : ''}" data-mode="buy" aria-pressed="${mode === 'buy'}">${stationControlLabel('buy')}</button></li>` +
            `<li><button type="button" ${stationControlAttrs('sell')} class="k-word k-word--emph sx-seg__btn${mode === 'sell' ? ' is-on' : ''}" data-mode="sell" aria-pressed="${mode === 'sell'}">${stationControlLabel('sell')}</button></li>` +
          `</ul>` +
          `<p class="k-empty sx-trade-empty">${selectedId ? 'That lot left the board. Choose another before confirming.' : 'Nothing in the hold. Switch to Buy to load cargo.'}</p>` +
        `</div>`;
      dressConsole();
      return;
    }
    const def = r.def, entry = r.entry;
    const buy = unitBuy(entry, def), sell = unitSell(entry, def);
    const unit = mode === 'buy' ? buy : sell;
    const held = heldQty(state, r.id);
    const cr = credits(state);
    const free = holdFree(state);
    const maxQty = tradeQuantityLimit(state, r);
    pinSealedSellQuantity(state, r.id);
    if (!receiptOnly) qty = marketQuantityAfterRefresh(qty, maxQty);
    // This one selected-quantity quote drives both the receipt the pilot sees and the presenter.
    // execute() reuses the same economy integral, including the bulk price impact, on confirm.
    const quote = selectedTradeQuote(state, r);
    const quoteReady = marketQuoteIsExecutable(quote, qty, mode);
    lastQuotedTerms = quoteReady ? { commodityId: r.id, side: mode, qty, total: quote.total } : null;
    const total = quoteReady ? quote.total : unit * qty;
    const quoteUnit = quoteReady ? quote.unitAvg : unit;
    const creditReady = mode !== 'buy' || (quoteReady && quote.total <= cr);
    const canAct = quoteReady && creditReady && qty >= 1 && qty <= maxQty && maxQty >= 1;
    const intelRows = selectedMarketIntel(state, r, quote);
    const receiptHtml = rowKV('Quantity', fmt(qty) + ' u') +
      rowKV('Average unit', quoteReady ? fmt(quoteUnit) + ' cr/u' : 'Unavailable') +
      rowKV(mode === 'buy' ? 'Total cost' : 'Total gain', quoteReady ? fmt(total) + ' cr' : 'Unavailable', mode === 'buy' ? 'loss' : 'gain') +
      rowKV('You hold', fmt(held) + ' u') + rowKV('Credits', fmt(cr) + ' cr') +
      (free !== Infinity ? rowKV('Hold free', fmt(free) + ' u') : '') +
      intelRows.map((intelRow) => rowKV(intelRow.label, intelRow.value,
        intelRow.tone === 'good' ? 'gain' : (intelRow.tone === 'danger' || intelRow.tone === 'warn' ? 'loss' : ''))).join('');
    // Priority matters: with no quote yet (qty 0, or nothing affordable) creditReady is false by
    // construction, and checking it first blamed credits on first paint of a stockless market.
    const freeSell = mode === 'sell' ? sellableCargoQuantity(state, r.id) : 0;
    const sealedUnits = mode === 'sell' ? reservedCargoQuantity(state, r.id) : 0;
    const sealedHold = mode === 'sell' && isUnsellableCargo(state, r.id) && freeSell <= 0;
    const note = sealedHold ? 'Sealed contract cargo cannot be sold'
      : sealedUnits > 0 ? `${sealedUnits} u sealed on contract — sell limit is ${freeSell} u`
      : maxQty < 1 ? (mode === 'buy' ? 'Not enough credits, stock, or hold space.' : 'Nothing to sell here.')
      : qty < 1 ? ''
      : qty > maxQty ? 'This quantity exceeds available stock or hold space.'
      : !quoteReady ? (quote && quote.partial ? 'The board cannot fill this quantity. Lower it before confirming.' : 'Live quote unavailable.')
      : mode === 'buy' && quote && quote.total > cr ? 'Not enough credits for this quantity.'
      : '';
    const goLabel = (side) => `${side === 'buy' ? 'Buy' : 'Sell'} ${fmt(qty)}`;
    if (receiptOnly && tradeEl.querySelector('[data-market-intel]')) {
      // Keep the focused numeric input alive while each keystroke updates its actual quote.
      // A sealed lot has no quantity to type: put the field back to zero.
      const typed = tradeEl.querySelector('.sx-qty__in');
      if (typed && sealedHold) typed.value = '0';
      tradeEl.querySelector('[data-market-intel]').innerHTML = receiptHtml;
      setQtyDial(tradeEl, qty, maxQty);
      const totalEl = tradeEl.querySelector('[data-trade-total]');
      if (totalEl) setTradeTotal(totalEl, quoteReady ? fmt(total) + ' cr' : 'Unavailable');
      tradeEl.querySelector('[data-trade-total-label]').textContent = mode === 'buy' ? 'Total cost' : 'Total gain';
      const go = tradeEl.querySelector('[data-go]');
      go.disabled = !canAct;
      const goWord = go.querySelector('.orr-lampkey__word');
      if (goWord) goWord.textContent = goLabel(mode);
      else go.textContent = goLabel(mode);
      const noteEl = tradeEl.querySelector('.sx-trade__note');
      noteEl.textContent = note;
      noteEl.hidden = !note;
      syncHoldArc(state, r.def);
      for (const row of tradeEl.querySelectorAll('.k-row')) paintRow(row, false);
      syncKeys(tradeEl);
      return;
    }

    // Preserve the native event contract: the live side commits, the other side switches mode.
    tradeEl.innerHTML = bindStationMarkup(marketTradeHtml({ mode, qty, canAct, receiptHtml, totalLabel: mode === 'buy' ? 'Total cost' : 'Total gain', totalText: quoteReady ? fmt(total) + ' cr' : 'Unavailable', note, limit: maxQty }));
    dressConsole();
    // The commit is the tab's one Lamp Key; its word morphs between BUY and SELL.
    const goBtn = tradeEl.querySelector('[data-go]');
    if (goBtn && goBtn.ownerDocument) {
      dressLampKey(goBtn);
      if (mode !== lastVerbMode) {
        const word = goBtn.querySelector('.orr-lampkey__word');
        if (word) word.classList.add('orr-mkt-morph');
      }
    }
    lastVerbMode = mode;
    const tradeTotal = tradeEl.querySelector('[data-trade-total]');
    if (tradeTotal) setTradeTotal(tradeTotal, quoteReady ? fmt(total) + ' cr' : 'Unavailable');
    syncHoldArc(state, def);
  }

  // Best trade runs from here + one-click course plotting (canonical logic, same nav contract).
  // INF-085: the card is a forecast with distinct spread/cost/limit/age (formatRouteCard);
  // the Set course action below is untouched.
  function renderRoutes(state) {
    let trades = [];
    try { trades = computeBestTrades(state, stationId(state)) || []; } catch (_) { trades = []; }
    const rows = trades.slice(0, 3).map((t, index) => {
      const dest = STATION_NAME.get(t.destStation) || t.destStation;
      const card = formatRouteCard(t);
      let comparison = '';
      if (index === 0) {
        try {
          const freight = compareDockedFreight(state, stationId(state), t);
          comparison = freight ? ` · ${formatFreightComparison(freight)}` : '';
        } catch (_) { comparison = ''; }
      }
      return (
        `<li class="k-row k-row--static sx-route-row">` +
          `<span class="sx-route-row__body"><span class="k-row__name sx-route-row__t">${entitySpanHtml('commodity:' + t.cmdtyId, escapeHtml(t.cmdtyName || t.cmdtyId))} → ${entitySpanHtml('station:' + t.destStation, escapeHtml(dest))}</span>` +
            `<span class="k-row__sub">${escapeHtml(card.sub + comparison)}</span></span>` +
          `<span class="k-row__num sx-route-row__s${t.loadProfit > 0 ? ' k-good' : ''}">${escapeHtml(card.profitText)}</span>` +
          `<button type="button" ${stationControlAttrs('set-course')} class="k-word k-word--fine sx-lead__go" data-course="${escapeHtml(t.cmdtyId)}" data-dest="${escapeHtml(t.destStation)}">${stationControlLabel('set-course')}</button>` +
        `</li>`
      );
    }).join('');
    routesEl.innerHTML =
      `<p class="k-caps sx-mkt__routes-head">Best routes from here</p>` +
      (rows ? `<ul class="k-rows" style="--k-row-cols: minmax(0,1fr) auto auto">${rows}</ul>`
        : `<p class="k-sentence sx-muted">No profitable runs known from here yet — visit more stations to learn their prices.</p>`);
    dressRoutes();
  }

  function renderAll(state) {
    renderAdBoardNotice(adBoardEl, state);
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const editingQuantity = !!(active && tradeEl.contains(active) && active.classList.contains('sx-qty__in'));
    renderList(state); renderStage(state);
    renderConsole(state, { receiptOnly: editingQuantity });
    renderRoutes(state);
  }

  // Presentation timers belong to this visible screen, never a retired dock session.
  let visible = true;
  let disposed = false;
  const deferred = new Set();
  function cancelDeferred() {
    for (const timer of deferred) clearTimeout(timer);
    deferred.clear();
    tradeBusy = false;
  }
  function deferRefresh(delay, settleTrade = false, restoreHand = false) {
    const timer = setTimeout(() => {
      deferred.delete(timer);
      if (settleTrade) tradeBusy = false;
      if (visible && !disposed) {
        renderAll(ctx.state || {});
        if (restoreHand) placeTradeHand();
      }
    }, delay);
    deferred.add(timer);
  }

  // ---- interactions ----
  listEl.addEventListener('click', (ev) => {
    const filter = ev.target.closest('[data-market-filter]');
    if (filter) {
      pressedFilterEl = filter;
      marketFilter = filter.getAttribute('data-market-filter') || 'all';
      listRenderSignature = '';
      const state = ctx.state || {};
      renderList(state); renderStage(state); renderConsole(state);
      if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tick' });
      return;
    }
    const row = ev.target.closest('.sx-mkt-row[data-cmdty]');
    if (row) selectCommodity(row.getAttribute('data-cmdty'));
  });
  // The register rebuilds its rows on every price/stock tick, so a press that lands on a row
  // node replaced between pointerdown and pointerup never dispatches click — the player sees
  // "click did nothing". Track the press by commodity id and select on release over the same
  // id: survives node replacement while keeping same-row click semantics (drag-off cancels).
  let pressCmdtyId = null;
  listEl.addEventListener('pointerdown', (ev) => {
    const row = ev.target.closest && ev.target.closest('.sx-mkt-row[data-cmdty]');
    pressCmdtyId = row ? row.getAttribute('data-cmdty') : null;
  });
  listEl.addEventListener('pointerup', (ev) => {
    const row = ev.target.closest && ev.target.closest('.sx-mkt-row[data-cmdty]');
    const upId = row ? row.getAttribute('data-cmdty') : null;
    if (pressCmdtyId && upId && upId === pressCmdtyId) selectCommodity(upId);
    pressCmdtyId = null;
  });
  listEl.addEventListener('pointercancel', () => { pressCmdtyId = null; });
  listEl.addEventListener('input', (ev) => {
    if (!ev.target.matches('[data-market-search]')) return;
    marketQuery = ev.target.value || '';
    listRenderSignature = '';
    const state = ctx.state || {};
    renderList(state); renderStage(state); renderConsole(state);
  });
  listEl.addEventListener('keydown', (ev) => {
    if (ev.target.matches('[data-market-search]')) {
      if (ev.key !== 'Escape' || !marketQuery) return;
      ev.preventDefault();
      marketQuery = '';
      listRenderSignature = '';
      const state = ctx.state || {};
      renderList(state); renderStage(state); renderConsole(state);
      return;
    }
    // Arrow / Home / End over the register rows: selection follows focus.
    const row = ev.target.closest && ev.target.closest('.sx-mkt-row[data-cmdty]');
    if (!row || !tbodyEl) return;
    const rows = rowEls();
    const cur = rows.indexOf(row);
    let next = -1;
    if (ev.key === 'ArrowDown') next = Math.min(rows.length - 1, cur + 1);
    else if (ev.key === 'ArrowUp') next = Math.max(0, cur - 1);
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = rows.length - 1;
    else if (ev.key === 'PageDown') next = Math.min(rows.length - 1, cur + 12);
    else if (ev.key === 'PageUp') next = Math.max(0, cur - 12);
    else return;
    ev.preventDefault();
    if (next >= 0 && rows[next]) selectCommodity(rows[next].getAttribute('data-cmdty'), { focus: true });
  });

  // Delegation rides the screen root, not consoleEl: the route table and trade leads live in
  // .sx-mkt__stage outside the console, and their Set Course buttons must reach this handler.
  el.addEventListener('click', (ev) => {
    const adventure = ev.target.closest('[data-adventure-option]');
    if (adventure) {
      const decisionId = adventure.getAttribute('data-adventure-id');
      const optionId = adventure.getAttribute('data-adventure-option');
      const chosen = chooseAdventureDecision(ctx.state || {}, decisionId, optionId, {
        bus: ctx.bus,
        economy: null,
      });
      renderStage(ctx.state || {});
      renderConsole(ctx.state || {});
      if (ctx.bus) ctx.bus.emit('audio:cue', { id: chosen && chosen.ok ? 'ui_accept' : 'ui_deny' });
      return;
    }
    const course = ev.target.closest('[data-course]');
    if (course) {
      const cmdtyId = course.getAttribute('data-course');
      const dest = course.getAttribute('data-dest');
      try { applyTradeNavigation(ctx, dest, cmdtyId); } catch (_) {}
      if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_accept' });
      deferRefresh(60);
      return;
    }
    const go = ev.target.closest('[data-go]');
    if (go) {
      if (go.disabled) return;
      if (tradeBusy) return;
      let tradeQty = Math.max(0, Math.floor(Number(qty) || 0));
      if (tradeQty <= 0) return;
      const tradeState = ctx.state || {};
      if (mode === 'sell' && reservedCargoQuantity(tradeState, selectedId) > 0
        && tradeQty > sellableCargoQuantity(tradeState, selectedId)) return;
      const quotedRow = tradedList(tradeState).find((row) => row.id === selectedId) || null;
      const freshQuote = quotedRow ? selectedTradeQuote(tradeState, quotedRow, tradeQty) : null;
      const decision = marketGoDecision({
        lastQuotedTerms,
        selectedId,
        qty: tradeQty,
        side: mode,
        freshQuote,
      });
      if (!decision.emit || !decision.payload) {
        if (ctx.bus) {
          const text = decision.reason === 'price'
            ? `Price changed since the quote (${decision.liveTotal == null ? 'unavailable' : decision.liveTotal} vs ${decision.expectedTotal} cr). Review it and confirm again.`
            : decision.reason === 'quote'
              ? 'The board cannot fill that quantity. Review it and confirm again.'
              : 'That confirmation no longer matches the lot on screen. Review it and confirm again.';
          ctx.bus.emit('toast', { text, kind: 'error', ttl: 3 });
        }
        renderAll(tradeState);
        placeTradeHand();
        return;
      }
      tradeBusy = true;
      go.disabled = true;
      if (ctx.bus) {
        // INF-084: bind the trade to the stated terms so a stale quote cannot settle
        // silently at a worse price. tradeBusy already stops a repeated confirmation
        // from emitting twice in-screen.
        ctx.bus.emit(mode === 'buy' ? 'ui:buy' : 'ui:sell', decision.payload);
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
      }
      deferRefresh(80, true, true);
      return;
    }
    const seg = ev.target.closest('[data-mode]');
    if (seg) {
      const nextMode = seg.getAttribute('data-mode');
      if (nextMode === mode) return;
      openTradeMode(nextMode, ctx.state || {}, { cargoOnly: nextMode === 'sell' });
      renderList(ctx.state || {}); renderStage(ctx.state || {}); renderConsole(ctx.state || {});
      placeTradeHand();
      if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tick' });
      return;
    }
    const q = ev.target.closest('[data-q]');
    if (q) {
      const v = q.getAttribute('data-q');
      const state = ctx.state || {};
      const rows = tradedList(state); const r = rows.find((x) => x.id === selectedId);
      const def = r && r.def; const entry = r && r.entry;
      const maxQty = tradeQuantityLimit(state, { id: selectedId, entry, def });
      if (v === 'max') qty = maxQty;
      else if (maxQty < 1) qty = 0;
      else qty = Math.max(1, Math.min(maxQty, qty + Number(v)));
      renderStage(state);
      renderConsole(state);
      placeTradeHand();
    }
  });

  // THE CROSSHAIR. The quote's trace carries every sample in data-points ("x%:y%:price:secondsFromNow:h|f");
  // hovering the plot parks a hairline on the nearest one and reads its price and age beside it.
  // Nothing re-renders: the cursor is one element inside the plot, moved by transform.
  function relAge(sec, kind) {
    const n = Number(sec);
    if (!Number.isFinite(n)) return kind === 'f' ? 'forecast' : '';
    if (kind === 'f') return n <= 0 ? 'now' : `in ${Math.max(1, Math.round(n / 60))} min`;
    const ago = -n;
    if (ago < 20) return 'now';
    return ago < 90 ? `${Math.round(ago)} s ago` : `${Math.round(ago / 60)} min ago`;
  }
  function chartSamples(host) {
    if (host._samples && host._samplesSrc === host.dataset.points) return host._samples;
    host._samplesSrc = host.dataset.points || '';
    host._samples = host._samplesSrc.split(';').filter(Boolean).map((row) => {
      const [x, y, price, sec, kind] = row.split(':');
      return { x: Number(x), y: Number(y), price: Number(price), sec: sec === '' ? NaN : Number(sec), kind };
    }).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    return host._samples;
  }
  function showSample(plot, index, { announce = false } = {}) {
    const host = plot.closest('[data-chart-host]');
    const cursor = plot.querySelector('[data-chart-cursor]');
    const samples = host ? chartSamples(host) : [];
    if (!cursor || !samples.length) return;
    const i = Math.max(0, Math.min(samples.length - 1, index));
    const best = samples[i];
    plot._index = i;
    cursor.hidden = false;
    cursor.style.setProperty('--cx', `${best.x}%`);
    cursor.style.setProperty('--cy', `${best.y}%`);
    cursor.dataset.kind = best.kind;
    cursor.classList.toggle('is-left', best.x > 70);
    const age = relAge(best.sec, best.kind);
    const text = `${fmt(best.price)} cr${age ? ' · ' + age : ''}`;
    const label = cursor.querySelector('b');
    if (label) label.textContent = text;
    if (announce) {
      const live = plot.querySelector('[data-chart-live]');
      if (live) live.textContent = `${best.kind === 'f' ? 'Forecast' : 'Sample'} ${i + 1} of ${samples.length}: ${fmt(best.price)} credits${age ? ', ' + age : ''}.`;
    }
  }
  quoteEl.addEventListener('pointermove', (ev) => {
    const plot = ev.target.closest && ev.target.closest('.sx-mkt-instrument__plot');
    if (!plot) return;
    const host = plot.closest('[data-chart-host]');
    const samples = host ? chartSamples(host) : [];
    if (!samples.length) return;
    const rect = plot.getBoundingClientRect();
    if (!rect.width) return;
    const fx = ((ev.clientX - rect.left) / rect.width) * 100;
    let best = 0;
    for (let i = 1; i < samples.length; i++) if (Math.abs(samples[i].x - fx) < Math.abs(samples[best].x - fx)) best = i;
    showSample(plot, best);
  });
  quoteEl.addEventListener('pointerleave', () => {
    const cursor = quoteEl.querySelector('[data-chart-cursor]');
    const plot = quoteEl.querySelector('.sx-mkt-instrument__plot');
    if (cursor && (!plot || plot !== document.activeElement)) cursor.hidden = true;
  });
  // Keyboard: the plot takes focus; Left/Right step through the samples (Home/End jump), and each
  // step is read aloud -- the same inspection the older probe offered, on the new instrument.
  quoteEl.addEventListener('keydown', (ev) => {
    const plot = ev.target.closest && ev.target.closest('.sx-mkt-instrument__plot');
    if (!plot || plot !== ev.target) return;
    const host = plot.closest('[data-chart-host]');
    const n = host ? chartSamples(host).length : 0;
    if (!n) return;
    const at = Number.isInteger(plot._index) ? plot._index : n - 1;
    const next = ev.key === 'ArrowLeft' ? at - 1 : ev.key === 'ArrowRight' ? at + 1
      : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : null;
    if (next === null) return;
    ev.preventDefault();
    showSample(plot, next, { announce: true });
  });
  quoteEl.addEventListener('focusin', (ev) => {
    const plot = ev.target.closest && ev.target.closest('.sx-mkt-instrument__plot');
    if (plot && plot === ev.target) {
      const host = plot.closest('[data-chart-host]');
      const n = host ? chartSamples(host).length : 0;
      if (n) showSample(plot, Number.isInteger(plot._index) ? plot._index : n - 1, { announce: true });
    }
  });
  quoteEl.addEventListener('focusout', (ev) => {
    const plot = ev.target.closest && ev.target.closest('.sx-mkt-instrument__plot');
    const cursor = plot && plot.querySelector('[data-chart-cursor]');
    if (cursor) cursor.hidden = true;
  });

  // THE SCRUB. Press on the quantity numeral and drag sideways: the amount runs from 0 to what you
  // can move, the total rolling live. One unit per 6px, faster the further you pull, clamped to
  // the trade limit -- the same limit Max uses. Typing still works; so do Fewer/More/Max and the
  // arrow keys, which are the keyboard channel for the same control.
  let scrub = null;
  function scrubLimit() {
    const state = ctx.state || {};
    const rows = tradedList(state); const r = rows.find((x) => x.id === selectedId);
    return r ? tradeQuantityLimit(state, { id: selectedId, entry: r.entry, def: r.def }) : 0;
  }
  // THE DIAL. Press on the ring and turn: the amount is where the pointer points, from 0 at the
  // foot's left end to all you can move at its right, the total rolling live (one quote a frame).
  let turn = null;
  consoleEl.addEventListener('pointerdown', (ev) => {
    const dial = ev.target.closest && ev.target.closest('.orr-qdial');
    if (!dial || ev.button !== 0) return;
    const limit = scrubLimit();
    if (limit < 1) return;
    ev.preventDefault();
    turn = { id: ev.pointerId, dial, limit, host: dial.closest('.sx-qty') };
    try { dial.setPointerCapture(ev.pointerId); } catch (_) {}
    if (turn.host) turn.host.classList.add('is-turning');
    turnTo(ev);
  });
  function turnTo(ev) {
    const next = qtyFromDialPoint(turn.dial, ev.clientX, ev.clientY, turn.limit);
    if (next == null || next === qty) return;
    qty = next;
    const input = tradeEl.querySelector('.sx-qty__in');
    if (input) input.value = String(qty);
    if (!scrubFrame) scrubFrame = requestAnimationFrame(flushScrub);
  }
  consoleEl.addEventListener('pointermove', (ev) => {
    if (!turn || ev.pointerId !== turn.id) return;
    ev.preventDefault();
    turnTo(ev);
  });
  function endTurn(ev) {
    if (!turn || (ev && ev.pointerId !== turn.id)) return;
    if (turn.host) turn.host.classList.remove('is-turning');
    turn = null;
    if (scrubFrame) { cancelAnimationFrame(scrubFrame); scrubFrame = 0; }
    renderStage(ctx.state || {}); renderConsole(ctx.state || {});
  }
  consoleEl.addEventListener('pointerup', endTurn);
  consoleEl.addEventListener('pointercancel', endTurn);

  consoleEl.addEventListener('pointerdown', (ev) => {
    const input = ev.target.closest && ev.target.closest('.sx-qty__in');
    if (!input || ev.button !== 0) return;
    scrub = { x: ev.clientX, base: qty, limit: scrubLimit(), moved: false, id: ev.pointerId, input };
  });
  consoleEl.addEventListener('pointermove', (ev) => {
    if (!scrub || ev.pointerId !== scrub.id) return;
    const dx = ev.clientX - scrub.x;
    if (!scrub.moved && Math.abs(dx) < 4) return;
    if (!scrub.moved) {
      scrub.moved = true;
      try { scrub.input.setPointerCapture(ev.pointerId); } catch (_) {}
      consoleEl.classList.add('is-scrubbing');
    }
    ev.preventDefault();
    const steps = Math.sign(dx) * Math.floor(Math.pow(Math.abs(dx) / 6, 1.25));
    const next = Math.max(0, Math.min(scrub.limit, scrub.base + steps));
    if (next === qty) return;
    qty = next;
    scrub.input.value = String(qty);
    // no selection may grow under the drag: park the caret at the end of the number
    try { scrub.input.setSelectionRange(scrub.input.value.length, scrub.input.value.length); } catch (_) {}
    // One quote per frame, and only the console's: the pointer can fire far faster than a frame,
    // and the quote above (its trace, its readings) does not depend on the quantity until release.
    if (!scrubFrame) scrubFrame = requestAnimationFrame(flushScrub);
  });
  let scrubFrame = 0;
  function refreshSaleLine() {
    const line = quoteEl.querySelector('[data-sale-line]');
    if (!line) return;
    const state = ctx.state || {};
    const r = tradedList(state).find((x) => x.id === selectedId);
    if (!r) return;
    const html = saleLineHtml({ sell: unitSell(r.entry, r.def), saleQty: qty, saleQuote: contemplatedSaleQuote(stationId(state), r.id, qty) });
    if (line.outerHTML !== html) line.outerHTML = html;
  }
  function flushScrub() {
    scrubFrame = 0;
    renderConsole(ctx.state || {}, { receiptOnly: true });
    refreshSaleLine();
    refreshGhost();
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tick' });
  }
  consoleEl.addEventListener('selectstart', (ev) => { if (scrub && scrub.moved) ev.preventDefault(); });
  function endScrub(ev) {
    if (!scrub || (ev && ev.pointerId !== scrub.id)) return;
    const moved = scrub.moved;
    scrub = null;
    consoleEl.classList.remove('is-scrubbing');
    if (scrubFrame) { cancelAnimationFrame(scrubFrame); scrubFrame = 0; }
    if (moved) { renderStage(ctx.state || {}); renderConsole(ctx.state || {}); }
  }
  consoleEl.addEventListener('pointerup', endScrub);
  consoleEl.addEventListener('pointercancel', endScrub);
  consoleEl.addEventListener('keydown', (ev) => {
    if (!ev.target.classList || !ev.target.classList.contains('sx-qty__in')) return;
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
    ev.preventDefault();
    const step = ev.shiftKey ? 10 : 1;
    qty = Math.max(0, Math.min(scrubLimit(), qty + (ev.key === 'ArrowUp' ? step : -step)));
    ev.target.value = String(qty);
    renderStage(ctx.state || {});
    renderConsole(ctx.state || {}, { receiptOnly: true });
  });

  consoleEl.addEventListener('input', (ev) => {
    if (!ev.target.classList.contains('sx-qty__in')) return;
    const n = parseInt(ev.target.value, 10);
    qty = Number.isFinite(n) ? Math.max(0, n) : 0;
    renderStage(ctx.state || {});
    renderConsole(ctx.state || {}, { receiptOnly: true });
  });

  return {
    el,
    onShow(c) {
      if (disposed) return;
      visible = true;
      const open = c || ctx;
      const st = open.state || {};
      // Enable trading: the economy system opens/initializes this station's live market on show
      // (parity with the legacy market panel — without this, ui:buy/ui:sell are no-ops).
      const sid = stationId(st);
      if (ctx.bus && sid) ctx.bus.emit('economy:marketOpened', { stationId: sid });
      requestMarketLaunder(ctx.bus, st);
      const requestedMode = open.tradeMode === 'sell' || open.tradeMode === 'buy' ? open.tradeMode : null;
      // An explicit handoff ("Sell what I hauled") always applies its mode — even with a lot
      // already on screen, where the implicit resume below would otherwise keep Buy and leave
      // the hold hidden. openTradeMode itself focuses a held lot for Sell.
      if (requestedMode) openTradeMode(requestedMode, st);
      const resume = marketResumeSelection({
        selectedId,
        qty,
        requestedMode,
        requestedCommodityId: open.commodityId,
        trackedCommodityId: (cargoOnly || requestedMode === 'sell') ? null : trackedCmdty(st),
        listedIds: tradedList(st).map((row) => row.id),
      });
      // A lot already on screen stays there. The job and the tracked contract apply on the first open only.
      if (!selectedId) {
        if (resume.applyMode) openTradeMode(resume.applyMode, st, { cargoOnly: resume.applyMode === 'sell' });
        if (resume.selectedId) {
          selectedId = resume.selectedId;
          qty = resume.qty;
        }
      }
      pinSealedSellQuantity(st, selectedId);
      renderAll(st);
      const active = tbodyEl && tbodyEl.querySelector('.is-active');
      if (active && typeof active.scrollIntoView === 'function') { try { active.scrollIntoView({ block: 'nearest' }); } catch (_) {} }
    },
    refresh(c) { if (visible && !disposed) renderAll((c || ctx).state || {}); },
    onHide() { visible = false; cancelDeferred(); },
    dispose() { disposed = true; visible = false; cancelDeferred(); },
  };
}
