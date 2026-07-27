// src/ui/station/screens/market.js — "Market" trading instrument.
// Central price chart (area + gradient) for the selected commodity, a categorised commodity
// list, and a live BUY/SELL console. Emits ui:buy / ui:sell {commodityId, qty}.
import { COMMODITIES } from '../../../data/commodities.js';
import { SECTORS } from '../../../data/sectors.js';
import { isUnsellableCargo } from '../../../systems/cargo.js';
import { escapeHtml } from '../../comms.js';
import { icon } from '../icons.js';
import { marketQuoteValue, presentMarketDrivers } from '../../marketDriverPresenter.js';
// Trade-route intel + course plotting reuse the canonical market logic (same waypoint/ui:setCourse
// contract the legacy panel used) — never re-derive routes or nav here.
import { computeBestTrades, applyTradeNavigation } from '../../screens/market.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const STATION_NAME = new Map();
for (const sec of SECTORS) for (const s of (sec.stations || [])) STATION_NAME.set(s.id, s.name || s.id);

const LEGAL_TONE = { legal: '', restricted: 'warn', contraband: 'loss' };
const LEGAL_LABEL = { legal: 'Legal', restricted: 'Restricted', contraband: 'Contraband' };
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
  const stroke = up ? 'var(--gain)' : 'var(--loss)';
  return (
    `<svg class="sx-mkt-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" tabindex="0" aria-label="${escapeHtml(label || 'Price history')}. Use left and right arrows to inspect values; drag to compare an interval.">` +
      `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${up ? 'rgba(63,208,127,.28)' : 'rgba(255,106,114,.26)'}"/>` +
        `<stop offset="1" stop-color="rgba(63,208,127,0)"/>` +
      `</linearGradient></defs>` +
      `<line class="sx-mkt-avg" x1="${padX}" y1="${avgY}" x2="${W - padX}" y2="${avgY}"/>` +
      `<path d="${area}" fill="url(#${gradientId})"/>` +
      `<path class="sx-mkt-line" d="${line}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<circle cx="${endX}" cy="${endY}" r="4.5" fill="${stroke}"/>` +
      `<rect class="sx-mkt-brush" x="0" y="${padTop}" width="0" height="${H - padTop - padBot}" hidden/>` +
      `<g class="sx-mkt-cursor" hidden><line x1="0" y1="${padTop}" x2="0" y2="${H - padBot}"/><circle cx="0" cy="0" r="4"/><text x="7" y="16"></text></g>` +
      `<rect class="sx-mkt-hit" x="${padX}" y="${padTop}" width="${W - padX * 2}" height="${H - padTop - padBot}" fill="transparent"/>` +
    `</svg>`
  );
}

export function createMarketScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'sx-mkt';
  el.innerHTML =
    `<nav class="sx-mkt__list" aria-label="Commodities"></nav>` +
    `<section class="sx-mkt__stage"></section>` +
    `<aside class="sx-mkt__console">` +
      `<div class="sx-mkt__trade"></div>` +
      `<div class="sx-mkt__routes" aria-label="Trade routes"></div>` +
    `</aside>`;
  const listEl = el.querySelector('.sx-mkt__list');
  const stageEl = el.querySelector('.sx-mkt__stage');
  const consoleEl = el.querySelector('.sx-mkt__console');
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

    const nodes = visible.map((r) => {
      const hist = priceHistory(r.entry, r.def);
      const buy = unitBuy(r.entry, r.def);
      const up = hist[hist.length - 1] >= hist[0];
      const pct = hist[0] ? Math.round(((hist[hist.length - 1] - hist[0]) / hist[0]) * 100) : 0;
      const demand = demandLevel(r.entry);
      const drivers = presentMarketDrivers({ state, stationId: stationId(state), commodity: r.def, entry: r.entry });
      const active = r.id === selectedId ? ' is-active' : '';
      const tracked = r.id === tracked_ ? ' is-tracked' : '';
      const held = heldQty(state, r.id);
      const family = marketFamily(r.def.category || '');
      return (
        `<button type="button" id="sx-market-tab-${escapeHtml(r.id)}" class="sx-mkt-row${active}${tracked}" data-cmdty="${escapeHtml(r.id)}" role="tab" aria-selected="${r.id === selectedId}" tabindex="${r.id === selectedId ? '0' : '-1'}" aria-controls="sx-market-instrument"` +
          ` data-family="${family}"` +
          ` aria-label="${escapeHtml(r.def.name)}, ${fmt(buy)} credits, ${demand === 3 ? 'high' : demand === 2 ? 'normal' : 'low'} demand${held ? `, ${fmt(held)} units held` : ''}. ${escapeHtml(drivers.accessibleSummary)}">` +
          (tracked ? `<span class="sx-mkt-row__flag" title="Tracked contract cargo">◆</span>` : '') +
          `<span class="sx-mkt-row__glyph">${commodityGlyph(r.def.category || '')}</span>` +
          `<span class="sx-mkt-row__body"><span class="sx-mkt-row__name">${escapeHtml(r.def.name)}</span>` +
            `<span class="sx-mkt-row__category">${escapeHtml(r.def.category || 'goods')}</span></span>` +
          `<span class="sx-mkt-row__quote"><span class="sx-mkt-row__price">${fmt(buy)}<i> cr</i></span>` +
            `<span class="sx-mkt-row__tr ${up ? 'is-up' : 'is-down'}">${up ? '▲' : '▼'} ${Math.abs(pct)}%</span></span>` +
          `<span class="sx-mkt-row__held">${held > 0 ? fmt(held) + 'u IN HOLD' : (demand === 3 ? 'HIGH DEMAND' : demand === 1 ? 'LOW DEMAND' : 'NORMAL DEMAND')}</span>` +
          `<span class="sx-mkt-row__drivers" aria-hidden="true">${drivers.primary.map((item) => `<i data-direction="${item.direction}">${escapeHtml(item.shortLabel)}</i>`).join('')}</span>` +
        `</button>`
      );
    }).join('');
    const signature = JSON.stringify({
      // `tracked_` belongs in the no-churn signature because it is RENDERED into every row (the
      // is-tracked class and the ◆ "Tracked contract cargo" flag). Without it, accepting or
      // switching a contract while the list was already cached left the flag stale — the instrument
      // panel below re-renders unconditionally and showed the "buy it here for your job" callout,
      // while the row it points at carried no mark at all. Caught by check:mission-handoff.
      selectedId, marketFilter, marketQuery, cargoOnly, tracked: tracked_,
      rows: visible.map((r) => [r.id, unitBuy(r.entry, r.def), heldQty(state, r.id), r.entry && r.entry.demandMult,
        JSON.stringify(r.entry && r.entry.demandDrivers || []),
        priceHistory(r.entry, r.def).at(-1)]),
    });
    if (signature === listRenderSignature) return;
    listRenderSignature = signature;
    const searchHadFocus = document.activeElement && document.activeElement.matches('[data-market-search]');
    const searchSelection = searchHadFocus ? document.activeElement.selectionStart : null;
    const focusedCommodity = document.activeElement && document.activeElement.getAttribute
      ? document.activeElement.getAttribute('data-cmdty')
      : null;
    const filters = MARKET_FILTERS.map((filter) =>
      `<button type="button" class="sx-mkt-filter${filter.id === marketFilter ? ' is-on' : ''}" data-market-filter="${filter.id}" ` +
        `aria-pressed="${filter.id === marketFilter}">${filter.label}<b>${counts.get(filter.id) || 0}</b></button>`).join('');
    listEl.innerHTML =
      `<div class="sx-mkt-browser">` +
        `<div class="sx-mkt-browser__tools">` +
          `<span class="sx-mkt-browser__mode">${cargoOnly ? 'YOUR CARGO HOLD' : 'STATION EXCHANGE'}<b>${visible.length} / ${rows.length} visible</b></span>` +
          `<label class="sx-mkt-search"><span>FIND COMMODITY</span><input type="search" data-market-search value="${escapeHtml(marketQuery)}" placeholder="Name or category" autocomplete="off" spellcheck="false"/></label>` +
        `</div>` +
        `<div class="sx-mkt-browser__filters" aria-label="Commodity families">${filters}</div>` +
        `<div class="sx-mkt-browser__deck">` +
          `<button type="button" class="sx-mkt-browser__step" data-market-step="-1" aria-label="Previous commodities">‹</button>` +
          `<div class="sx-mkt-browser__rail" role="tablist" aria-label="Visible commodities">` +
            (nodes || `<div class="sx-mkt-browser__empty">No commodities match <b>${escapeHtml(marketQuery || MARKET_FILTERS.find((f) => f.id === marketFilter)?.label || 'this filter')}</b>.</div>`) +
          `</div>` +
          `<button type="button" class="sx-mkt-browser__step is-next" data-market-step="1" aria-label="Next commodities">›</button>` +
        `</div>` +
      `</div>`;
    if (searchHadFocus) {
      const search = listEl.querySelector('[data-market-search]');
      if (search) {
        search.focus({ preventScroll: true });
        const at = Math.min(search.value.length, searchSelection == null ? search.value.length : searchSelection);
        try { search.setSelectionRange(at, at); } catch (_) {}
      }
    } else if (focusedCommodity) {
      const focused = listEl.querySelector(`[data-cmdty="${focusedCommodity}"]`);
      if (focused) focused.focus({ preventScroll: true });
    }
  }

  function renderStage(state) {
    const rows = tradedList(state);
    const r = rows.find((x) => x.id === selectedId) || rows[0];
    if (!r) {
      activeChart = null;
      stageEl.removeAttribute('aria-labelledby');
      stageEl.removeAttribute('aria-describedby');
      stageEl.innerHTML = `<div class="sx-market-empty">${icon('cargo', 34)}<h3>${mode === 'sell' ? 'Your hold is empty' : 'No market at this berth'}</h3>` +
        `<p>${mode === 'sell' ? 'Buy cargo here or bring material back from mining before opening Sell.' : 'This station has no tradable stock.'}</p></div>`;
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
    activeChart = { hist, avg, label: def.name };
    stageEl.setAttribute('aria-labelledby', `sx-market-tab-${r.id}`);
    stageEl.setAttribute('aria-describedby', 'sx-market-driver-summary');
    stageEl.innerHTML =
      (isTracked ? `<div class="sx-mkt-tracked">${icon('contracts', 15)}<span><b>Tracked contract</b> — buy ${escapeHtml(def.name)} here to load your job.</span></div>` : '') +
      `<div class="sx-mkt-head">` +
        `<div class="sx-mkt-title"><h2>${escapeHtml(def.name)}</h2>` +
          `<span class="sx-tag${legalTone ? ' sx-tag--' + (legalTone === 'loss' ? 'bad' : 'warn') : ''}">${LEGAL_LABEL[legal]}</span>` +
          `<span class="sx-mkt-cat-inline">${escapeHtml(def.category || '')}</span></div>` +
        `<div class="sx-mkt-delta ${up ? 'is-up' : 'is-down'}">${up ? '▲' : '▼'} ${Math.abs(pct)}%<span>vs. period open</span></div>` +
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
    return `<div class="sx-stat"><span class="sx-stat__k">${k}</span><span class="sx-stat__v">${v}</span><span class="sx-stat__sub">${sub}</span></div>`;
  }

  function renderConsole(state) {
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
    const volPerU = Number(def.volPerU) || 1;
    const maxByCredits = unit > 0 ? Math.floor(cr / unit) : 9999;
    const maxByHold = free === Infinity ? 9999 : Math.floor(free / volPerU);
    const maxQty = mode === 'buy' ? Math.max(0, Math.min(maxByCredits, maxByHold)) : held;
    if (qty > maxQty) qty = maxQty;
    if (qty < 1 && maxQty >= 1) qty = 1;
    const total = unit * qty;
    const canAct = qty >= 1 && qty <= maxQty && maxQty >= 1;

    tradeEl.innerHTML =
      `<div class="sx-trade">` +
        `<div class="sx-seg" role="tablist">` +
          `<button type="button" class="sx-seg__btn${mode === 'buy' ? ' is-on' : ''}" data-mode="buy">Buy</button>` +
          `<button type="button" class="sx-seg__btn${mode === 'sell' ? ' is-on' : ''}" data-mode="sell">Sell</button>` +
        `</div>` +
        `<div class="sx-trade__unit"><span>${mode === 'buy' ? 'Buy price' : 'Sell price'}</span><b>${fmt(unit)} cr</b><i>/ unit</i></div>` +
        `<div class="sx-qty">` +
          `<button type="button" class="sx-qty__b" data-q="-1" aria-label="Less">–</button>` +
          `<input class="sx-qty__in" type="text" inputmode="numeric" value="${qty}" aria-label="Quantity"/>` +
          `<button type="button" class="sx-qty__b" data-q="1" aria-label="More">+</button>` +
          `<button type="button" class="sx-qty__max" data-q="max">Max</button>` +
        `</div>` +
        `<input class="sx-qty__slider" type="range" min="0" max="${Math.max(1, maxQty)}" value="${qty}" aria-label="Quantity slider"/>` +
        `<div class="sx-trade__rows">` +
          rowKV('Quantity', fmt(qty) + ' u') +
          rowKV(mode === 'buy' ? 'Total cost' : 'Total gain', fmt(total) + ' cr', mode === 'buy' ? 'loss' : 'gain') +
          rowKV('You hold', fmt(held) + ' u') +
          rowKV('Credits', fmt(cr) + ' cr') +
          (free !== Infinity ? rowKV('Hold free', fmt(free) + ' u') : '') +
        `</div>` +
        `<button type="button" class="sx-trade__go sx-trade__go--${mode}" data-go ${canAct ? '' : 'disabled'}>` +
          `${mode === 'buy' ? 'Confirm Purchase' : 'Confirm Sale'}` +
        `</button>` +
        (maxQty < 1 ? `<p class="sx-trade__note">${mode === 'buy' ? 'Not enough credits or hold space.' : 'Nothing to sell here.'}</p>` : '') +
      `</div>`;
  }

  function rowKV(k, v, tone) {
    return `<div class="sx-kv"><span>${k}</span><b class="${tone ? 'is-' + tone : ''}">${v}</b></div>`;
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
            `<span class="sx-route-row__t">${escapeHtml(t.cmdtyName || t.cmdtyId)} → ${escapeHtml(dest)}</span>` +
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
    renderList(state); renderStage(state); renderConsole(state); renderRoutes(state);
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
      const rail = listEl.querySelector('.sx-mkt-browser__rail');
      const direction = Number(step.getAttribute('data-market-step')) || 1;
      if (rail) rail.scrollBy({ left: direction * Math.max(300, rail.clientWidth * .72), behavior: 'smooth' });
      return;
    }
    const btn = ev.target.closest('[data-cmdty]');
    if (!btn) return;
    const id = btn.getAttribute('data-cmdty');
    if (id === selectedId) return;
    selectedId = id; qty = 1;
    const state = ctx.state || {};
    renderList(state); renderStage(state); renderConsole(state);
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  });
  listEl.addEventListener('input', (ev) => {
    if (!ev.target.matches('[data-market-search]')) return;
    marketQuery = ev.target.value || '';
    listRenderSignature = '';
    const state = ctx.state || {};
    renderList(state); renderStage(state); renderConsole(state);
  });
  listEl.addEventListener('keydown', (ev) => {
    const commodityTab = ev.target.closest && ev.target.closest('[data-cmdty][role="tab"]');
    if (commodityTab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) {
      const tabs = [...listEl.querySelectorAll('[data-cmdty][role="tab"]')];
      const index = tabs.indexOf(commodityTab);
      let next = index;
      if (ev.key === 'Home') next = 0;
      else if (ev.key === 'End') next = tabs.length - 1;
      else next = Math.max(0, Math.min(tabs.length - 1, index + (ev.key === 'ArrowLeft' ? -1 : 1)));
      if (tabs[next]) {
        ev.preventDefault();
        tabs[next].focus({ preventScroll: true });
        tabs[next].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        tabs[next].click();
      }
      return;
    }
    if (ev.key !== 'Escape' || !ev.target.matches('[data-market-search]') || !marketQuery) return;
    ev.preventDefault();
    marketQuery = '';
    listRenderSignature = '';
    const state = ctx.state || {};
    renderList(state); renderStage(state); renderConsole(state);
  });
  listEl.addEventListener('wheel', (ev) => {
    const rail = ev.target.closest('.sx-mkt-browser__rail');
    if (!rail || Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return;
    ev.preventDefault();
    rail.scrollLeft += ev.deltaY;
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
      const unit = mode === 'buy' ? unitBuy(entry, def) : unitSell(entry, def);
      const held = heldQty(state, selectedId);
      const free = holdFree(state); const volPerU = Number(def && def.volPerU) || 1;
      const maxQty = mode === 'buy' ? Math.max(0, Math.min(unit > 0 ? Math.floor(credits(state) / unit) : 9999, free === Infinity ? 9999 : Math.floor(free / volPerU))) : held;
      if (v === 'max') qty = maxQty; else qty = Math.max(1, Math.min(maxQty, qty + Number(v)));
      renderConsole(state); return;
    }
    const go = ev.target.closest('[data-go]');
    if (go && !go.disabled) {
      if (ctx.bus) {
        ctx.bus.emit(mode === 'buy' ? 'ui:buy' : 'ui:sell', { commodityId: selectedId, qty });
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
      }
      setTimeout(() => renderAll(ctx.state || {}), 60);
    }
  });

  consoleEl.addEventListener('input', (ev) => {
    if (ev.target.classList.contains('sx-qty__slider')) { qty = Math.max(0, Number(ev.target.value) || 0); renderConsole(ctx.state || {}); }
    else if (ev.target.classList.contains('sx-qty__in')) { const n = parseInt(ev.target.value, 10); if (Number.isFinite(n)) { qty = Math.max(0, n); } }
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
      renderAll(st);
    },
    refresh(c) { renderAll((c || ctx).state || {}); },
    dispose() {},
  };
}
