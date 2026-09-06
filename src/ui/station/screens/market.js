// src/ui/station/screens/market.js — "Market" trading instrument.
// Central price chart (area + gradient) for the selected commodity, a categorised commodity
// list, and a live BUY/SELL console. Emits ui:buy / ui:sell {commodityId, qty}.
import { COMMODITIES } from '../../../data/commodities.js';
import { SECTORS } from '../../../data/sectors.js';
import { isUnsellableCargo } from '../../../systems/cargo.js';
import { escapeHtml } from '../../comms.js';
import { entitySpanHtml } from '../../entityResolver.js';
import { MAP_FOCUS, openGalaxyMap } from '../../mapAuthority.js';
import { mountDataState } from '../../uiPrimitives.js';
import { icon } from '../icons.js';
import { renderAdBoardNotice } from '../adBoard.js';
import { marketCardDrivers, marketQuoteValue, presentMarketDrivers } from '../../marketDriverPresenter.js';
import { presentCommodityIntel, presentInspectorRows } from '../../marketIntelPresenter.js';
import { createVirtualList, rowFromHtml } from '../../virtualList.js';
// Trade-route intel + course plotting reuse the canonical market logic (same waypoint/ui:setCourse
// contract the legacy panel used) — never re-derive routes or nav here.
import { computeBestTrades, applyTradeNavigation } from '../../market/tradeLogic.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const STATION_NAME = new Map();
for (const sec of SECTORS) for (const s of (sec.stations || [])) STATION_NAME.set(s.id, s.name || s.id);

const LEGAL_TONE = { legal: '', restricted: 'warn', contraband: 'loss' };
const LEGAL_LABEL = { legal: 'Legal', restricted: 'Restricted', contraband: 'Contraband' };
const STYLE_ID = 'sf-market-style';

export function chartTrendRole(up) { return up ? 'you' : 'foe'; }
export function chartTrendColor(up) { return up ? 'var(--sf-you)' : 'var(--sf-foe)'; }
export function maxAffordableQuantity({ limit, credits, quote }) {
  let low = 0;
  let high = Math.max(0, Math.floor(Number(limit) || 0));
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const value = quote(mid);
    if (value && value.ok && Number.isFinite(value.total) && value.total <= credits) low = mid;
    else high = mid - 1;
  }
  return low;
}
export function legalityRole(legal) {
  if (legal === 'contraband') return 'foe';
  if (legal === 'restricted') return 'goal';
  return 'calm';
}

function injectStyle() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  if (typeof document.getElementById === 'function' && document.getElementById(STYLE_ID)) return;
  if (!document.head || typeof document.head.appendChild !== 'function') return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

const CSS = `
.sx-mkt { color: var(--sf-paper); font-family: var(--sf-body-face); }
.sx-mkt .sf-fig,
.sx-mkt .sx-stat__v,
.sx-mkt .sx-mkt-row__price,
.sx-mkt .sx-qty__in,
.sx-mkt .sx-mkt-delta {
  font-family: var(--sf-data-face); font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: 0;
}
.sx-mkt .sx-stat__v { font-size: 15px; color: var(--sf-paper); }
.sx-mkt-title h2 {
  font-family: var(--sf-display-face); font-weight: 700; font-size: 28px; line-height: 1.1;
  letter-spacing: 0; text-transform: none; color: var(--sf-paper); margin: 0;
}
.sx-mkt-row__tr.is-up, .sx-mkt-delta.is-up { color: var(--sf-you); }
.sx-mkt-row__tr.is-down, .sx-mkt-delta.is-down { color: var(--sf-foe); }
.sx-mkt .sx-kv b.is-loss { color: var(--sf-foe); }
.sx-mkt .sx-kv b.is-gain { color: var(--sf-you); }
.sx-mkt .sx-mkt-row.is-tracked {
  box-shadow: none;
  border-left: var(--sf-rail-w) solid var(--sf-goal);
}
.sx-mkt .sx-mkt-row__flag { color: var(--sf-goal); }
.sx-mkt .sx-mkt-tracked {
  border-color: var(--sf-goal-edge);
  background: color-mix(in srgb, var(--sf-goal) 8%, transparent);
  color: var(--sf-paper);
}
.sx-mkt .sx-mkt-tracked b, .sx-mkt .sx-mkt-tracked .sx-ico { color: var(--sf-goal); }
.sx-mkt .sx-demand--1 i:nth-child(1) { background: var(--sf-foe); }
.sx-mkt .sx-demand--2 i:nth-child(1), .sx-mkt .sx-demand--2 i:nth-child(2) { background: var(--sf-calm); }
.sx-mkt .sx-demand--3 i { background: var(--sf-you); }
.sx-mkt .sx-trade__go--buy, .sx-mkt .sx-trade__go--sell {
  background: var(--sf-you); color: var(--sf-surface);
}
.sx-mkt .sx-qty__slider { accent-color: var(--sf-you); }
.sx-mkt .sx-qty__b:hover, .sx-mkt .sx-qty__max:hover { border-color: var(--sf-goal); color: var(--sf-paper); }
.sx-mkt .sx-route-row__s { color: var(--sf-you); }
.sx-mkt .sx-tag--warn { color: var(--sf-goal); border-color: var(--sf-goal-edge); }
.sx-mkt .sx-tag--bad { color: var(--sf-foe); border-color: color-mix(in srgb, var(--sf-foe) 45%, transparent); }
/* The stats row sits at the bottom of the stage column, and the dockside notice
   floats over that same edge (absolute, bottom:10px). The console used to be an
   overlay with an 88px stage reserve under it; now that it is a real grid column
   nothing reserved the notice's band, so it painted straight over the
   BUY/SELL/AVG sublabels and left the demand bars a few-pixel sliver. Reserve
   the band again, let the scope chart (which stretches to fit) absorb the
   difference, and keep the stats row itself from ever shrinking. The 320px right
   reservations predate the console column and only starve the four stat cells. */
.sx-app .sx-mkt .sx-mkt__stage { padding-bottom: 68px; }
.sx-app .sx-mkt .sx-mkt-scope { min-height: 140px; }
.sx-app .sx-mkt .sx-mkt-chart { min-height: 0; }
.sx-app .sx-mkt .sx-mkt-stats { flex-shrink: 0; margin-right: 0; }
.sx-app .sx-mkt .sx-mkt-head { max-width: none; }
@media (forced-colors: active) {
  .sx-mkt .sx-mkt-tracked, .sx-mkt .sx-trade__go--buy, .sx-mkt .sx-trade__go--sell {
    background: Canvas; color: CanvasText; border: 1px solid CanvasText;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sx-mkt, .sx-mkt * { animation: none !important; transition: none !important; }
}
`;
const MARKET_FILTERS = [
  { id: 'all', label: 'All stock' },
  { id: 'hold', label: 'In hold' },
  { id: 'raw', label: 'Raw & rare' },
  { id: 'industry', label: 'Industry' },
  { id: 'civilian', label: 'Civilian' },
  { id: 'salvage', label: 'Salvage' },
  { id: 'military', label: 'Military' },
  { id: 'restricted', label: 'Restricted' },
];

// The commodity rail is the station's longest list and its heaviest subtree: every one of the
// exchange's commodities is a ~20-node card, so the whole rail used to cost the better part of a
// thousand DOM nodes to show the dozen cards that fit on screen. It is virtualised through the
// shared visible-window list (`src/ui/virtualList.js`), which needs the row PITCH along the scroll
// axis. These two numbers are the rail's own geometry, declared in styles/station-workbench.css:
//   .sx-mkt__list .sx-mkt-row  { flex:0 0 236px; width:236px; }
//   .sx-mkt-browser__rail      { display:flex; gap:6px; }
// They are corrected from the live card on show (`measureRailPitch`), so a stylesheet change
// cannot silently desynchronise the window from what the browser lays out.
const RAIL_CARD_W = 236;
const RAIL_GAP = 6;
const RAIL_PITCH = RAIL_CARD_W + RAIL_GAP;

function marketFamily(category) {
  if (['raw ore', 'gas', 'crystal', 'exotic'].includes(category)) return 'raw';
  if (['refined', 'component', 'tech'].includes(category)) return 'industry';
  if (['consumer', 'luxury', 'food', 'med'].includes(category)) return 'civilian';
  if (category === 'salvage') return 'salvage';
  if (category === 'military') return 'military';
  if (category === 'contraband') return 'restricted';
  return 'civilian';
}

// Compact cargo marks make commodity families recognizable without turning the selector back into
// anonymous glowing particles. Names remain visible; these are orientation aids, not mystery icons.
function commodityGlyph(category) {
  const paths = {
    'raw ore': '<path d="M4 16 7 6l7-3 6 7-4 9H8Z"/><path d="m7 6 5 6 8-2M12 12l4 7"/>',
    gas: '<path d="M8 4h8v3H8zM7 7h10v13H7z"/><path d="M10 11h4M10 15h4"/>',
    crystal: '<path d="m12 3 7 7-7 11-7-11Z"/><path d="m5 10 7 2 7-2M12 3v9"/>',
    exotic: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"/>',
    refined: '<path d="m4 13 5-4 5 4-5 4Zm7-5 4-3 5 4-5 4Z"/><path d="M4 13v4l5 3 5-3v-4M15 13v4l5-4V9"/>',
    component: '<path d="M5 7h14v10H5z"/><path d="M8 4v3m4-3v3m4-3v3M8 17v3m4-3v3m4-3v3M9 10h6v4H9z"/>',
    tech: '<path d="M5 5h14v14H5z"/><path d="M8 9h4v4h4M8 16h8M3 9h2m-2 6h2m14-6h2m-2 6h2"/>',
    consumer: '<path d="m4 8 8-4 8 4-8 4Z"/><path d="M4 8v9l8 3 8-3V8M12 12v8"/>',
    luxury: '<path d="m4 9 4-5h8l4 5-8 11Z"/><path d="M4 9h16M8 4l4 5 4-5M12 9v11"/>',
    food: '<path d="M7 20V9m5 11V5m5 15V8"/><path d="M7 10c-3-1-3-4 0-5 3 1 3 4 0 5Zm5-4c-3-1-3-4 0-5 3 1 3 4 0 5Zm5 3c-3-1-3-4 0-5 3 1 3 4 0 5Z"/>',
    med: '<path d="M8 4h8v5h5v7h-5v5H8v-5H3V9h5Z"/>',
    salvage: '<path d="M4 17 9 4l4 6 7-3-3 13-6-4Z"/><path d="m7 13 5-1 3 5"/>',
    contraband: '<path d="M5 7h14v12H5zM9 7V4h6v3"/><path d="m9 11 6 4m0-4-6 4"/>',
    military: '<path d="M9 3h6l2 6-5 12L7 9Z"/><path d="M7 9h10M10 6h4"/>',
  };
  return `<svg class="sx-commodity-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${paths[category] || paths.consumer}</svg>`;
}

function stationId(state) { return state && state.ui && state.ui.dockedStationId; }
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

// unit prices — station BUY (what you pay) / SELL (what station pays you)
function unitBuy(entry, def) { return marketQuoteValue(entry, def, 'buy'); }
function unitSell(entry, def) { return marketQuoteValue(entry, def, 'sell'); }
function demandLevel(entry) {
  const multiplier = Number(entry && entry.demandMult) || 1;
  return multiplier > 1.08 ? 3 : multiplier < 0.94 ? 1 : 2;
}
function priceHistory(entry, def) {
  const points = entry && Array.isArray(entry.history) ? entry.history : [];
  const values = points.map((p) => Number(p && typeof p === 'object' ? p.mid : p))
    .filter((p) => Number.isFinite(p) && p > 0);
  if (values.length > 1) return values;
  // The economy seeds every listing before this screen opens. This is only a defensive
  // degradation for malformed legacy data; it never invents a shared trend.
  const current = Math.max(1, unitBuy(entry, def));
  return [current, current];
}

// ---- area chart ----
function chartToken(value) { return String(value || 'market').replace(/[^a-zA-Z0-9_-]/g, '_'); }
function buildChart(hist, avg, gradientId, label) {
  const W = 620, H = 208, padX = 6, padTop = 14, padBot = 18;
  const min = Math.min(...hist, avg), max = Math.max(...hist, avg);
  const span = (max - min) || 1;
  const x = (i) => padX + (i / (hist.length - 1)) * (W - padX * 2);
  const y = (v) => padTop + (1 - (v - min) / span) * (H - padTop - padBot);
  const pts = hist.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = 'M ' + pts.join(' L ');
  const area = `M ${x(0).toFixed(1)},${(H - padBot).toFixed(1)} L ` + pts.join(' L ') + ` L ${x(hist.length - 1).toFixed(1)},${(H - padBot).toFixed(1)} Z`;
  const avgY = y(avg).toFixed(1);
  const endX = x(hist.length - 1).toFixed(1), endY = y(hist[hist.length - 1]).toFixed(1);
  const up = hist[hist.length - 1] >= hist[0];
  const stroke = chartTrendColor(up);
  const fill0 = up
    ? 'color-mix(in srgb, var(--sf-you) 28%, transparent)'
    : 'color-mix(in srgb, var(--sf-foe) 26%, transparent)';
  return (
    `<svg class="sx-mkt-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" tabindex="0" aria-label="${escapeHtml(label || 'Price history')}. Use left and right arrows to inspect values; drag to compare an interval.">` +
      `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" style="stop-color:${fill0}"/>` +
        `<stop offset="1" style="stop-color:transparent"/>` +
      `</linearGradient></defs>` +
      `<line class="sx-mkt-avg" x1="${padX}" y1="${avgY}" x2="${W - padX}" y2="${avgY}"/>` +
      `<path d="${area}" fill="url(#${gradientId})"/>` +
      `<path class="sx-mkt-line" d="${line}" fill="none" style="stroke:${stroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<circle cx="${endX}" cy="${endY}" r="4.5" style="fill:${stroke}"/>` +
      `<rect class="sx-mkt-brush" x="0" y="${padTop}" width="0" height="${H - padTop - padBot}" hidden/>` +
      `<g class="sx-mkt-cursor" hidden><line x1="0" y1="${padTop}" x2="0" y2="${H - padBot}"/><circle cx="0" cy="0" r="4"/><text x="7" y="16"></text></g>` +
      `<rect class="sx-mkt-hit" x="${padX}" y="${padTop}" width="${W - padX * 2}" height="${H - padTop - padBot}" fill="transparent"/>` +
    `</svg>`
  );
}

export function createMarketScreen(ctx) {
  injectStyle();
  const el = document.createElement('div');
  el.className = 'sx-mkt';
  el.innerHTML =
    `<aside class="sx-adboard" data-ad-board aria-label="Dockside commerce notice" hidden></aside>` +
    `<nav class="sx-mkt__list" aria-label="Commodities"></nav>` +
    `<section class="sx-mkt__stage sf-stage"></section>` +
    `<aside class="sx-mkt__console sf-apron">` +
      `<div class="sx-mkt__trade"></div>` +
      `<div class="sx-mkt__routes" aria-label="Trade routes"></div>` +
    `</aside>`;
  const adBoardEl = el.querySelector('[data-ad-board]');
  const listEl = el.querySelector('.sx-mkt__list');
  const stageEl = el.querySelector('.sx-mkt__stage');
  const consoleEl = el.querySelector('.sx-mkt__console');
  let tradeBusy = false;
  const tradeEl = el.querySelector('.sx-mkt__trade');
  const routesEl = el.querySelector('.sx-mkt__routes');
  stageEl.id = 'sx-market-instrument';
  stageEl.setAttribute('role', 'tabpanel');
  stageEl.setAttribute('aria-describedby', 'sx-market-driver-summary');

  let selectedId = null;
  let mode = 'buy';   // 'buy' | 'sell'
  let qty = 1;
  let cargoOnly = false;
  let marketFilter = 'all';
  let marketQuery = '';
  let listRenderSignature = '';
  let listStructureKey = '';
  // The virtualised commodity rail and the chrome around it, all built once by buildBrowserChrome.
  let rail = null;
  let railEl = null;
  let modeEl = null;
  let searchEl = null;
  let filterEls = null;
  // The rail builds rows lazily — including on a scroll, long after renderList returned — so the
  // state and tracked-contract id a card is drawn from are held here rather than passed down.
  let railState = null;
  let railTracked = null;
  let activeChart = null;
  let chartIndex = -1;
  let brushStart = -1;

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
    // The first-dock cargo handoff is intentionally focused: show only what the player can
    // actually sell, rather than making them hunt through a full commodity exchange.
    return cargoOnly
      ? rows.filter((r) => heldQty(state, r.id) > 0 && !isUnsellableCargo(state, r.id))
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

  function tradeQuantityLimit(state, row) {
    if (mode === 'sell') return heldQty(state, row.id);
    const free = holdFree(state);
    const volume = Number(row.def.volPerU) > 0 ? Number(row.def.volPerU) : 1;
    const stock = Math.max(0, Math.floor(Number(row.entry && row.entry.stock) || 0) - 1);
    const limit = Math.min(stock, free === Infinity ? stock : Math.floor(free / volume));
    return maxAffordableQuantity({ limit, credits: credits(state), quote: (n) => selectedTradeQuote(state, row, n) });
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
      qty = heldQty(state, held.id);
    } else {
      qty = 1;
    }
  }

  // One commodity card, byte-for-byte the markup the rail rendered before it was windowed. The
  // virtual list stamps aria-setsize/aria-posinset and the roving tabindex over the top; the
  // `tabindex` written here is the pre-mount default it replaces.
  //
  // `selected` arrives from the list rather than being compared against `selectedId` here. A click
  // restyles the affected rows BEFORE it reports the new selection back to this screen, so a card
  // drawn from `selectedId` would render one selection behind — the quote panel would move while
  // the rail still highlighted the previous commodity.
  function commodityRowHtml(r, state, tracked_, selected) {
    const hist = priceHistory(r.entry, r.def);
    const buy = unitBuy(r.entry, r.def);
    const up = hist[hist.length - 1] >= hist[0];
    const pct = hist[0] ? Math.round(((hist[hist.length - 1] - hist[0]) / hist[0]) * 100) : 0;
    const demand = demandLevel(r.entry);
    const drivers = presentMarketDrivers({ state, stationId: stationId(state), commodity: r.def, entry: r.entry });
    const cardDrivers = marketCardDrivers(drivers.primary);
    const active = selected ? ' is-active' : '';
    const tracked = r.id === tracked_ ? ' is-tracked' : '';
    const held = heldQty(state, r.id);
    const family = marketFamily(r.def.category || '');
    return (
      `<button type="button" id="sx-market-tab-${escapeHtml(r.id)}" class="sx-mkt-row${active}${tracked}" data-cmdty="${escapeHtml(r.id)}" role="tab" aria-selected="${!!selected}" tabindex="${selected ? '0' : '-1'}" aria-controls="sx-market-instrument"` +
        ` data-family="${family}"` +
        // No tooltip on the tracked flag: the row already carries the price-why (causeLedger), so
        // a second reveal here would fight it for the one shared tip. The tracked fact reaches
        // keyboard and screen readers through the aria-label below, and sighted players through
        // the ◆ flag, the row treatment, and the instrument callout.
        ` aria-label="${escapeHtml(r.def.name)}, ${fmt(buy)} credits, ${demand === 3 ? 'high' : demand === 2 ? 'normal' : 'low'} demand${held ? `, ${fmt(held)} units held` : ''}${tracked ? ', tracked for your active contract' : ''}. ${escapeHtml(drivers.accessibleSummary)}">` +
        (tracked ? `<span class="sx-mkt-row__flag" aria-hidden="true">◆</span>` : '') +
        `<span class="sx-mkt-row__glyph">${commodityGlyph(r.def.category || '')}</span>` +
        `<span class="sx-mkt-row__body"><span class="sx-mkt-row__name">${escapeHtml(r.def.name)}</span>` +
          `<span class="sx-mkt-row__category">${escapeHtml(r.def.category || 'goods')}</span></span>` +
        `<span class="sx-mkt-row__quote"><span class="sx-mkt-row__price sf-fig">${fmt(buy)}<i> cr</i></span>` +
          `<span class="sx-mkt-row__tr ${up ? 'is-up' : 'is-down'}">${up ? '▲ UP' : '▼ DOWN'} ${Math.abs(pct)}%</span></span>` +
        `<span class="sx-mkt-row__held">${held > 0 ? fmt(held) + 'u IN HOLD' : (demand === 3 ? 'HIGH DEMAND' : demand === 1 ? 'LOW DEMAND' : 'NORMAL DEMAND')}</span>` +
        (cardDrivers.length ? `<span class="sx-mkt-row__drivers" aria-hidden="true">${cardDrivers.map((item) => `<i data-direction="${item.direction}">${escapeHtml(item.shortLabel)}</i>`).join('')}</span>` : '') +
      `</button>`
    );
  }

  function emptyFilterLabel() {
    return marketQuery || MARKET_FILTERS.find((f) => f.id === marketFilter)?.label || 'this filter';
  }

  // The browser chrome (tools line, family filters, prev/next deck, rail) is built once and then
  // updated in place. It used to be re-written wholesale on every data tick, which is what forced
  // the focus-restoration dance below it — rebuilding the subtree blurred whatever the player was
  // typing in or arrowing through, and reset the rail's scroll position to the far left on every
  // price movement. Nothing here is destroyed now, so neither problem can recur.
  function buildBrowserChrome() {
    listEl.innerHTML =
      `<div class="sx-mkt-browser">` +
        `<div class="sx-mkt-browser__tools">` +
          `<span class="sx-mkt-browser__mode">STATION EXCHANGE<b>0 / 0 visible</b></span>` +
          `<label class="sx-mkt-search"><span>FIND COMMODITY</span><input type="search" data-market-search placeholder="Name or category" autocomplete="off" spellcheck="false"/></label>` +
        `</div>` +
        `<div class="sx-mkt-browser__filters" aria-label="Commodity families">` +
          MARKET_FILTERS.map((filter) =>
            `<button type="button" class="sx-mkt-filter" data-market-filter="${filter.id}" aria-pressed="false">` +
              `${filter.label}<b>0</b></button>`).join('') +
        `</div>` +
        `<div class="sx-mkt-browser__deck">` +
          `<button type="button" class="sx-mkt-browser__step" data-market-step="-1" aria-label="Previous commodities">‹</button>` +
          `<div class="sx-mkt-browser__rail"></div>` +
          `<button type="button" class="sx-mkt-browser__step is-next" data-market-step="1" aria-label="Next commodities">›</button>` +
        `</div>` +
      `</div>`;
    modeEl = listEl.querySelector('.sx-mkt-browser__mode');
    searchEl = listEl.querySelector('[data-market-search]');
    railEl = listEl.querySelector('.sx-mkt-browser__rail');
    filterEls = new Map();
    for (const btn of listEl.querySelectorAll('[data-market-filter]')) {
      filterEls.set(btn.getAttribute('data-market-filter'), btn);
    }

    rail = createVirtualList({
      el: railEl,
      axis: 'x',
      rowExtent: RAIL_PITCH,
      gap: RAIL_GAP,
      role: 'tablist',
      ariaLabel: 'Visible commodities',
      // Arrow keys move the quote with the focus, which is what the rail did before by focusing a
      // tab and clicking it. Home/End reach the first and last commodity even when neither is in
      // the DOM, which is the thing a hand-rolled `querySelectorAll` walk could no longer do.
      selectionFollowsFocus: true,
      getKey: (r) => r.id,
      renderRow: (r, info) => rowFromHtml(commodityRowHtml(r, railState, railTracked, info.selected)),
      renderEmpty: () => rowFromHtml(
        `<div class="sx-mkt-browser__empty">No commodities match <b>${escapeHtml(emptyFilterLabel())}</b>.</div>`,
      ),
      onSelect: (id) => {
        if (!id || id === selectedId) return;
        selectedId = id;
        qty = 1;
        const state = ctx.state || {};
        // Only the two panels that read `selectedId` are redrawn: the rail has already restyled
        // the row it owns, and calling back into renderList from its own callback would re-enter.
        renderStage(state); renderConsole(state);
        if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
      },
    });
  }

  // The declared pitch is the stylesheet's; this is the browser's. Reading it once the rail has a
  // layout box keeps the window aligned if a breakpoint or a later edit changes the card.
  function measureRailPitch() {
    if (!rail || !railEl || typeof window === 'undefined' || !window.getComputedStyle) return;
    const card = railEl.querySelector('.sx-mkt-row');
    if (!card || !card.offsetWidth) return;
    let gap = RAIL_GAP;
    try {
      const parsed = parseFloat(window.getComputedStyle(railEl).columnGap);
      if (Number.isFinite(parsed)) gap = parsed;
    } catch (_) { /* keep the declared gap */ }
    rail.setRowExtent(Math.round(card.offsetWidth + gap));
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
    if (visible.length && !visible.some((r) => r.id === selectedId)) {
      selectedId = visible[0].id;
      qty = mode === 'sell' ? heldQty(state, selectedId) : 1;
    } else if (!selectedId && rows.length) selectedId = rows[0].id;

    const counts = new Map(MARKET_FILTERS.map((filter) => [filter.id, 0]));
    counts.set('all', rows.length);
    for (const r of rows) {
      const family = marketFamily(r.def.category || '');
      counts.set(family, (counts.get(family) || 0) + 1);
      if (heldQty(state, r.id) > 0) counts.set('hold', (counts.get('hold') || 0) + 1);
    }

    const signature = JSON.stringify({
      // `tracked_` belongs in the no-churn signature because it is RENDERED into every row (the
      // is-tracked class and the ◆ "Tracked contract cargo" flag). Without it, accepting or
      // switching a contract while the list was already cached left the flag stale — the instrument
      // panel below re-renders unconditionally and showed the "buy it here for your job" callout,
      // while the row it points at carried no mark at all. Caught by check:mission-handoff.
      //
      // `selectedId` is deliberately NOT here: selection is applied to the rail through
      // setSelectedKey, which restyles only the two rows whose state moved. Folding it into this
      // signature would make every click reload the whole window instead.
      marketFilter, marketQuery, cargoOnly, tracked: tracked_,
      rows: visible.map((r) => [r.id, unitBuy(r.entry, r.def), heldQty(state, r.id), r.entry && r.entry.demandMult,
        JSON.stringify(r.entry && r.entry.demandDrivers || []),
        priceHistory(r.entry, r.def).at(-1)]),
    });
    railState = state;
    railTracked = tracked_;
    if (!rail) buildBrowserChrome();

    let restructured = false;
    if (signature !== listRenderSignature) {
      listRenderSignature = signature;
      // Which set of commodities the rail is showing — as opposed to what those commodities cost.
      // A player action that changes the SET starts the rail at its left edge, exactly as the old
      // full rebuild did; a price tick keeps the player where they had scrolled to.
      const structure = `${marketFilter}\0${marketQuery}\0${cargoOnly}`;
      restructured = structure !== listStructureKey;
      listStructureKey = structure;

      modeEl.firstChild.textContent = cargoOnly ? 'YOUR CARGO HOLD' : 'STATION EXCHANGE';
      modeEl.querySelector('b').textContent = `${visible.length} / ${rows.length} visible`;
      for (const [id, btn] of filterEls) {
        btn.classList.toggle('is-on', id === marketFilter);
        btn.setAttribute('aria-pressed', String(id === marketFilter));
        btn.querySelector('b').textContent = String(counts.get(id) || 0);
      }
      // Written only when it actually differs (an Escape clear, or an external open): assigning to
      // a focused search field on every price tick would drop the caret to the end mid-word.
      if (searchEl.value !== marketQuery) searchEl.value = marketQuery;

      const settled = rail.setItems(visible, { preserveScroll: !restructured });
      // A filter that removes the selected commodity falls to the first survivor. That comes back
      // through the return value rather than onSelect, so the stage and console below — which read
      // `selectedId` — would otherwise keep quoting a row the rail no longer lists.
      if (settled.selectedKey && settled.selectedKey !== selectedId) selectedId = settled.selectedKey;
    }
    if (selectedId) {
      rail.setSelectedKey(selectedId, { scrollIntoView: false, notify: false });
      // A filter or a mode switch reseats the rail at its left edge. If the quoted commodity
      // survived that change further down the list, bring it back on screen rather than leaving
      // the instrument describing a card the player cannot see.
      if (restructured) rail.scrollSelectedIntoView();
    }
  }

  function renderStage(state) {
    const rows = tradedList(state);
    const r = rows.find((x) => x.id === selectedId) || rows[0];
    if (!r) {
      activeChart = null;
      stageEl.removeAttribute('aria-labelledby');
      stageEl.removeAttribute('aria-label');
      stageEl.removeAttribute('aria-describedby');
      mountDataState(stageEl, 'empty', {
        code: mode === 'sell' ? 'HOLD_EMPTY' : 'EXCHANGE_DARK',
        headline: mode === 'sell' ? 'Your hold is empty.' : 'No market at this berth.',
        fills: mode === 'sell'
          ? 'Buy cargo here or bring material back from mining before opening Sell.'
          : 'This station has no tradable stock. Another berth may still quote.',
        verb: mode === 'sell'
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
          },
      });
      return;
    }
    const def = r.def, entry = r.entry;
    const hist = priceHistory(entry, def);
    const buy = unitBuy(entry, def), sell = unitSell(entry, def);
    const avg = Number(def.basePrice) || buy;
    const pct = hist[0] ? Math.round(((hist[hist.length - 1] - hist[0]) / hist[0]) * 100) : 0;
    const up = pct >= 0;
    const demand = demandLevel(entry);
    const demandLabel = demand >= 3 ? 'High' : demand === 2 ? 'Normal' : 'Low';
    const drivers = presentMarketDrivers({ state, stationId: stationId(state), commodity: def, entry });
    const legal = def.legality || 'legal';
    const legalTone = LEGAL_TONE[legal];
    const isTracked = trackedCmdty(state) === r.id;
    const trackedGuidance = isTracked ? trackedCargoGuidance(state, r.id, def.name) : null;
    activeChart = { hist, avg, label: def.name };
    stageEl.setAttribute('aria-labelledby', `sx-market-tab-${r.id}`);
    // The rail mounts only the cards on screen, so the tab this panel names can be scrolled out of
    // the DOM. An aria-labelledby with no resolvable target is skipped by the name computation,
    // which then falls through to this label — the panel keeps a name either way.
    stageEl.setAttribute('aria-label', def.name);
    stageEl.setAttribute('aria-describedby', 'sx-market-driver-summary');
    stageEl.innerHTML =
      (isTracked ? `<div class="sx-mkt-tracked" data-tracked-state="${trackedGuidance.state}">${icon('contracts', 15)}<span><b>Tracked contract</b> — ${escapeHtml(trackedGuidance.text)}</span></div>` : '') +
      `<div class="sx-mkt-head sf-crest">` +
        `<div class="sx-mkt-title"><h2>${entitySpanHtml('commodity:' + r.id, escapeHtml(def.name))}</h2>` +
          `<span class="sx-tag${legalTone ? ' sx-tag--' + (legalTone === 'loss' ? 'bad' : 'warn') : ''}">${LEGAL_LABEL[legal]}</span>` +
          `<span class="sx-mkt-cat-inline">${escapeHtml(def.category || '')}</span></div>` +
        `<div class="sx-mkt-delta ${up ? 'is-up' : 'is-down'}">${up ? '▲ UP' : '▼ DOWN'} ${Math.abs(pct)}%<span>vs. period open</span></div>` +
      `</div>` +
      `<div class="sx-mkt-driver-ribbon" aria-label="Why this quote">` +
        drivers.primary.map((item) => `<span data-direction="${item.direction}" aria-label="${escapeHtml(item.explanation)}"><b>${escapeHtml(item.shortLabel)}</b><i>${escapeHtml(item.label)}</i></span>`).join('') +
      `</div>` +
      `<p class="sr-only" id="sx-market-driver-summary">${escapeHtml(drivers.accessibleSummary)}</p>` +
      `<div class="sx-mkt-scope">` +
        `<span class="sx-mkt-scope__mode">LIVE STATION SCOPE / ${hist.length} SAMPLES</span>` +
        buildChart(hist, avg, `sxmktfill-${chartToken(stationId(state))}-${chartToken(r.id)}`, def.name) +
        `<output class="sx-mkt-brushreadout" aria-live="polite">Point at the curve, or drag an interval to compare movement.</output>` +
      `</div>` +
      `<div class="sx-mkt-stats">` +
        statCell('Buy', fmt(buy) + ' cr', 'You pay') +
        statCell('Sell', fmt(sell) + ' cr', 'Station pays') +
        statCell('Galactic avg', fmt(avg) + ' cr', 'Baseline') +
        `<div class="sx-stat"><span class="sx-stat__k">Demand</span>` +
          `<span class="sx-demand sx-demand--${demand}"><i></i><i></i><i></i></span>` +
          `<span class="sx-stat__sub">${demandLabel}</span></div>` +
      `</div>`;
  }

  function chartPointFromEvent(svg, ev) {
    if (!activeChart || !activeChart.hist.length) return null;
    const rect = svg.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width)));
    const index = Math.round(ratio * (activeChart.hist.length - 1));
    return { index, value: activeChart.hist[index] };
  }

  function showChartPoint(svg, index, announce = false) {
    if (!activeChart || !svg) return;
    const hist = activeChart.hist;
    index = Math.max(0, Math.min(hist.length - 1, index));
    chartIndex = index;
    const min = Math.min(...hist, activeChart.avg);
    const max = Math.max(...hist, activeChart.avg);
    const span = (max - min) || 1;
    const x = 6 + (index / Math.max(1, hist.length - 1)) * 608;
    const y = 14 + (1 - (hist[index] - min) / span) * 176;
    const cursor = svg.querySelector('.sx-mkt-cursor');
    cursor.hidden = false;
    const line = cursor.querySelector('line');
    line.setAttribute('x1', x.toFixed(1));
    line.setAttribute('x2', x.toFixed(1));
    const dot = cursor.querySelector('circle');
    dot.setAttribute('cx', x.toFixed(1));
    dot.setAttribute('cy', y.toFixed(1));
    const text = cursor.querySelector('text');
    text.setAttribute('x', Math.min(560, x + 7).toFixed(1));
    text.setAttribute('y', Math.max(24, y - 9).toFixed(1));
    text.textContent = `${fmt(hist[index])} cr`;
    if (announce) {
      const output = stageEl.querySelector('.sx-mkt-brushreadout');
      if (output) output.textContent = `Sample ${index + 1} of ${hist.length}: ${fmt(hist[index])} credits.`;
    }
  }

  function updateBrush(svg, endIndex) {
    if (!activeChart || brushStart < 0) return;
    const a = Math.min(brushStart, endIndex);
    const b = Math.max(brushStart, endIndex);
    const x1 = 6 + (a / Math.max(1, activeChart.hist.length - 1)) * 608;
    const x2 = 6 + (b / Math.max(1, activeChart.hist.length - 1)) * 608;
    const brush = svg.querySelector('.sx-mkt-brush');
    brush.hidden = false;
    brush.setAttribute('x', x1.toFixed(1));
    brush.setAttribute('width', Math.max(2, x2 - x1).toFixed(1));
    const values = activeChart.hist.slice(a, b + 1);
    const delta = values[values.length - 1] - values[0];
    const output = stageEl.querySelector('.sx-mkt-brushreadout');
    if (output) output.textContent = `Samples ${a + 1}–${b + 1}: ${fmt(Math.min(...values))}–${fmt(Math.max(...values))} cr, ${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta))} net.`;
  }

  function statCell(k, v, sub) {
    return `<div class="sx-stat"><span class="sx-stat__k">${k}</span><span class="sx-stat__v sf-fig">${v}</span><span class="sx-stat__sub">${sub}</span></div>`;
  }

  function renderConsole(state, { receiptOnly = false } = {}) {
    const rows = tradedList(state);
    const r = rows.find((x) => x.id === selectedId) || rows[0];
    if (!r) {
      tradeEl.innerHTML =
        `<div class="sx-trade sx-trade--empty"><div class="sx-seg" role="tablist">` +
          `<button type="button" class="sx-seg__btn${mode === 'buy' ? ' is-on' : ''}" data-mode="buy">Buy</button>` +
          `<button type="button" class="sx-seg__btn${mode === 'sell' ? ' is-on' : ''}" data-mode="sell">Sell</button>` +
        `</div><div class="sx-trade-empty">${icon('cargo', 28)}<b>Nothing in the hold</b><span>Switch to Buy to load cargo.</span></div></div>`;
      return;
    }
    const def = r.def, entry = r.entry;
    const buy = unitBuy(entry, def), sell = unitSell(entry, def);
    const unit = mode === 'buy' ? buy : sell;
    const held = heldQty(state, r.id);
    const cr = credits(state);
    const free = holdFree(state);
    const maxQty = tradeQuantityLimit(state, r);
    if (!receiptOnly) {
      if (qty > maxQty) qty = maxQty;
      if (qty < 1 && maxQty >= 1) qty = 1;
    }
    // This one selected-quantity quote drives both the receipt the pilot sees and the presenter.
    // The static listing stays only as a rail readout; execute() reuses the
    // same economy integral, including the bulk price impact, when the player confirms.
    const quote = selectedTradeQuote(state, r);
    const quoteReady = !!(quote && quote.ok);
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
    const note = !quoteReady && qty >= 1 ? 'Live quote unavailable.'
      : !creditReady ? 'Not enough credits for this quantity.'
      : qty > maxQty ? 'This quantity exceeds available stock or hold space.'
      : maxQty < 1 ? (mode === 'buy' ? 'Not enough credits, stock, or hold space.' : 'Nothing to sell here.') : '';
    if (receiptOnly && tradeEl.querySelector('[data-market-intel]')) {
      // Keep the focused numeric input alive while each keystroke updates its actual quote.
      tradeEl.querySelector('[data-market-intel]').innerHTML = receiptHtml;
      tradeEl.querySelector('[data-go]').disabled = !canAct;
      const noteEl = tradeEl.querySelector('.sx-trade__note');
      noteEl.textContent = note;
      noteEl.hidden = !note;
      return;
    }

    tradeEl.innerHTML =
      `<div class="sx-trade">` +
        `<div class="sx-seg" role="tablist">` +
          `<button type="button" class="sx-seg__btn${mode === 'buy' ? ' is-on' : ''}" data-mode="buy">Buy</button>` +
          `<button type="button" class="sx-seg__btn${mode === 'sell' ? ' is-on' : ''}" data-mode="sell">Sell</button>` +
        `</div>` +
        `<div class="sx-qty">` +
          `<button type="button" class="sx-qty__b" data-q="-1" aria-label="Less">–</button>` +
          `<input class="sx-qty__in sf-fig" type="text" inputmode="numeric" value="${qty}" aria-label="Quantity"/>` +
          `<button type="button" class="sx-qty__b" data-q="1" aria-label="More">+</button>` +
          `<button type="button" class="sx-qty__max" data-q="max">Max</button>` +
        `</div>` +
        `<input class="sx-qty__slider" type="range" min="0" max="${Math.max(1, maxQty)}" value="${qty}" aria-label="Quantity slider"/>` +
        `<div class="sx-trade__rows" data-market-intel>` +
          receiptHtml +
        `</div>` +
        `<button type="button" class="sx-trade__go sx-trade__go--${mode}" data-go ${canAct ? '' : 'disabled'}>` +
          `${mode === 'buy' ? 'Confirm Purchase' : 'Confirm Sale'}` +
        `</button>` +
        `<p class="sx-trade__note" ${note ? '' : 'hidden'}>${escapeHtml(note)}</p>` +
      `</div>`;
  }

  function rowKV(k, v, tone) {
    return `<div class="sx-kv"><span>${escapeHtml(k)}</span><b class="${tone ? 'is-' + tone : ''}">${escapeHtml(v)}</b></div>`;
  }

  // Best trade runs from here + one-click course plotting (canonical logic, same nav contract).
  function renderRoutes(state) {
    let trades = [];
    try { trades = computeBestTrades(state, stationId(state)) || []; } catch (_) { trades = []; }
    const rows = trades.slice(0, 3).map((t) => {
      const dest = STATION_NAME.get(t.destStation) || t.destStation;
      const profit = Number(t.loadProfit) || 0;
      const units = Number(t.loadUnits) || 0;
      const demandReason = t.destinationDemand && t.destinationDemand.drivers && t.destinationDemand.drivers.length
        ? ` · ${t.destinationDemand.label}`
        : '';
      return (
        `<div class="sx-route-row">` +
          `<span class="sx-route-row__body">` +
            `<span class="sx-route-row__t">${entitySpanHtml('commodity:' + t.cmdtyId, escapeHtml(t.cmdtyName || t.cmdtyId))} → ${entitySpanHtml('station:' + t.destStation, escapeHtml(dest))}</span>` +
            `<span class="sx-route-row__s">${profit > 0 ? '+' + fmt(profit) + ' cr' : '—'}${units > 0 ? ' · ' + fmt(units) + 'u run' : ''}${escapeHtml(demandReason)}</span>` +
          `</span>` +
          `<button type="button" class="sx-lead__go" data-course="${escapeHtml(t.cmdtyId)}" data-dest="${escapeHtml(t.destStation)}">Set Course</button>` +
        `</div>`
      );
    }).join('');
    routesEl.innerHTML =
      `<div class="sx-panel">` +
        `<div class="sx-panel__head">${icon('route', 15)}<span>Trade Routes</span></div>` +
        (rows || `<p class="sx-muted">No profitable runs known from here yet — visit more stations to learn their prices.</p>`) +
      `</div>`;
  }

  function renderAll(state) {
    renderAdBoardNotice(adBoardEl, state);
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const editingQuantity = !!(active && tradeEl.contains(active)
      && (active.classList.contains('sx-qty__in') || active.classList.contains('sx-qty__slider')));
    renderList(state); renderStage(state);
    renderConsole(state, { receiptOnly: editingQuantity });
    renderRoutes(state);
  }

  // ---- interactions ----
  listEl.addEventListener('click', (ev) => {
    const filter = ev.target.closest('[data-market-filter]');
    if (filter) {
      marketFilter = filter.getAttribute('data-market-filter') || 'all';
      listRenderSignature = '';
      const state = ctx.state || {};
      renderList(state); renderStage(state); renderConsole(state);
      if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tick' });
      return;
    }
    const step = ev.target.closest('[data-market-step]');
    if (step) {
      const direction = Number(step.getAttribute('data-market-step')) || 1;
      // Still a real scroll of a real scroll container: the rail's scroll event feeds the window,
      // so the smooth animation and the mounted range stay in step.
      if (railEl) railEl.scrollBy({ left: direction * Math.max(300, railEl.clientWidth * .72), behavior: 'smooth' });
    }
    // Selecting a commodity is the virtual list's own click contract (see its onSelect above).
    // Handling it a second time here would double the selection work and the audio cue.
  });
  listEl.addEventListener('input', (ev) => {
    if (!ev.target.matches('[data-market-search]')) return;
    marketQuery = ev.target.value || '';
    listRenderSignature = '';
    const state = ctx.state || {};
    renderList(state); renderStage(state); renderConsole(state);
  });
  listEl.addEventListener('keydown', (ev) => {
    // Arrow/Home/End/PageUp/PageDown over the commodity tabs belong to the virtual list, which
    // scrolls its target into the window before focusing it. The walk that used to live here read
    // `querySelectorAll` and so could only ever reach the rows already in the DOM — with a window
    // mounted, End would have stopped at the edge of the window instead of the last commodity.
    if (ev.key !== 'Escape' || !ev.target.matches('[data-market-search]') || !marketQuery) return;
    ev.preventDefault();
    marketQuery = '';
    listRenderSignature = '';
    const state = ctx.state || {};
    renderList(state); renderStage(state); renderConsole(state);
  });
  listEl.addEventListener('wheel', (ev) => {
    const target = ev.target.closest('.sx-mkt-browser__rail');
    if (!target || Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return;
    ev.preventDefault();
    target.scrollLeft += ev.deltaY;
  }, { passive: false });

  stageEl.addEventListener('pointermove', (ev) => {
    const svg = ev.target.closest && ev.target.closest('.sx-mkt-chart');
    if (!svg) return;
    const point = chartPointFromEvent(svg, ev);
    if (!point) return;
    showChartPoint(svg, point.index, false);
    if (brushStart >= 0) updateBrush(svg, point.index);
  });
  stageEl.addEventListener('pointerdown', (ev) => {
    const svg = ev.target.closest && ev.target.closest('.sx-mkt-chart');
    if (!svg || ev.button !== 0) return;
    const point = chartPointFromEvent(svg, ev);
    if (!point) return;
    ev.preventDefault();
    brushStart = point.index;
    try { svg.setPointerCapture(ev.pointerId); } catch (_) {}
    showChartPoint(svg, point.index, true);
    updateBrush(svg, point.index);
  });
  stageEl.addEventListener('pointerup', (ev) => {
    const svg = ev.target.closest && ev.target.closest('.sx-mkt-chart');
    if (!svg || brushStart < 0) return;
    const point = chartPointFromEvent(svg, ev);
    if (point) updateBrush(svg, point.index);
    brushStart = -1;
    try { svg.releasePointerCapture(ev.pointerId); } catch (_) {}
  });
  stageEl.addEventListener('pointercancel', () => { brushStart = -1; });
  stageEl.addEventListener('keydown', (ev) => {
    const svg = ev.target.closest && ev.target.closest('.sx-mkt-chart');
    if (!svg || !activeChart) return;
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight' && ev.key !== 'Home' && ev.key !== 'End') return;
    ev.preventDefault();
    if (ev.key === 'Home') chartIndex = 0;
    else if (ev.key === 'End') chartIndex = activeChart.hist.length - 1;
    else chartIndex = Math.max(0, Math.min(activeChart.hist.length - 1, (chartIndex < 0 ? activeChart.hist.length - 1 : chartIndex) + (ev.key === 'ArrowLeft' ? -1 : 1)));
    showChartPoint(svg, chartIndex, true);
  });
  stageEl.addEventListener('focusin', (ev) => {
    const svg = ev.target.closest && ev.target.closest('.sx-mkt-chart');
    if (svg && activeChart) showChartPoint(svg, chartIndex < 0 ? activeChart.hist.length - 1 : chartIndex, true);
  });

  consoleEl.addEventListener('click', (ev) => {
    const course = ev.target.closest('[data-course]');
    if (course) {
      const cmdtyId = course.getAttribute('data-course');
      const dest = course.getAttribute('data-dest');
      try { applyTradeNavigation(ctx, dest, cmdtyId); } catch (_) {}
      if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_accept' });
      setTimeout(() => renderAll(ctx.state || {}), 60);
      return;
    }
    const seg = ev.target.closest('[data-mode]');
    if (seg) {
      const nextMode = seg.getAttribute('data-mode');
      openTradeMode(nextMode, ctx.state || {}, { cargoOnly: nextMode === 'sell' });
      renderList(ctx.state || {}); renderStage(ctx.state || {}); renderConsole(ctx.state || {});
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
      if (v === 'max') qty = maxQty; else qty = Math.max(1, Math.min(maxQty, qty + Number(v)));
      renderConsole(state); return;
    }
    const go = ev.target.closest('[data-go]');
    if (go && !go.disabled) {
      if (tradeBusy) return;
      const tradeQty = Math.max(0, Math.floor(Number(qty) || 0));
      if (tradeQty <= 0) return;
      tradeBusy = true;
      go.disabled = true;
      if (ctx.bus) {
        ctx.bus.emit(mode === 'buy' ? 'ui:buy' : 'ui:sell', { commodityId: selectedId, qty: tradeQty });
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
      }
      setTimeout(() => { tradeBusy = false; renderAll(ctx.state || {}); }, 80);
    }
  });

  consoleEl.addEventListener('input', (ev) => {
    if (ev.target.classList.contains('sx-qty__slider')) {
      qty = Math.max(0, Number(ev.target.value) || 0);
      tradeEl.querySelector('.sx-qty__in').value = String(qty);
      renderConsole(ctx.state || {}, { receiptOnly: true });
    }
    else if (ev.target.classList.contains('sx-qty__in')) {
      const n = parseInt(ev.target.value, 10);
      qty = Number.isFinite(n) ? Math.max(0, n) : 0;
      renderConsole(ctx.state || {}, { receiptOnly: true });
    }
  });

  return {
    el,
    onShow(c) {
      const open = c || ctx;
      const st = open.state || {};
      // Enable trading: the economy system opens/initializes this station's live market on show
      // (parity with the legacy market panel — without this, ui:buy/ui:sell are no-ops).
      const sid = stationId(st);
      if (ctx.bus && sid) ctx.bus.emit('economy:marketOpened', { stationId: sid });
      if (open.tradeMode === 'sell' || open.tradeMode === 'buy') {
        openTradeMode(open.tradeMode, st, { cargoOnly: open.tradeMode === 'sell' });
      }
      if (open.commodityId && tradedList(st).some((r) => r.id === open.commodityId)) {
        selectedId = open.commodityId;
        qty = 1;
      }
      // If a tracked contract wants cargo sold/bought here, open straight to that commodity.
      if (!cargoOnly) {
        const tracked = trackedCmdty(st);
        if (tracked && tradedList(st).some((r) => r.id === tracked)) selectedId = tracked;
      }
      // The rail is detached while another destination is on the dock, so it has no layout box and
      // no measurable viewport. onShow is the first moment it does; the station app has already
      // flushed layout by the time it calls us.
      if (rail) rail.onShow();
      renderAll(st);
      measureRailPitch();
      if (rail) rail.scrollSelectedIntoView();
    },
    refresh(c) { renderAll((c || ctx).state || {}); },
    // A rail that is off-screen stops rebuilding rows for nobody; the station app refreshes every
    // destination it has cached, not just the visible one.
    onHide() { if (rail) rail.onHide(); },
    dispose() {
      if (rail) { rail.destroy(); rail = null; }
    },
  };
}
