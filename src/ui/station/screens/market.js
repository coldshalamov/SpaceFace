// src/ui/station/screens/market.js — "Market" trading instrument.
// Central price chart (area + gradient) for the selected commodity, a categorised commodity
// list, and a live BUY/SELL console. Emits ui:buy / ui:sell {commodityId, qty}.
import { COMMODITIES } from '../../../data/commodities.js';
import { SECTORS } from '../../../data/sectors.js';
import { escapeHtml } from '../../comms.js';
import { icon } from '../icons.js';
// Trade-route intel + course plotting reuse the canonical market logic (same waypoint/ui:setCourse
// contract the legacy panel used) — never re-derive routes or nav here.
import { computeBestTrades, applyTradeNavigation } from '../../screens/market.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const STATION_NAME = new Map();
for (const sec of SECTORS) for (const s of (sec.stations || [])) STATION_NAME.set(s.id, s.name || s.id);

const LEGAL_TONE = { legal: '', restricted: 'warn', contraband: 'loss' };
const LEGAL_LABEL = { legal: 'Legal', restricted: 'Restricted', contraband: 'Contraband' };
const DEMAND_LEVEL = { low: 1, med: 2, medium: 2, high: 3 };

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
function unitBuy(entry, def) { return Math.round(Number(entry && entry.buy) || Number(def && def.basePrice) || 0); }
function unitSell(entry, def) {
  const v = entry && (entry.sell != null ? entry.sell : entry.lastSell);
  return Math.round(Number(v != null ? v : (def && def.basePrice)) || 0);
}
function priceHistory(entry, def) {
  if (entry && Array.isArray(entry.history) && entry.history.length > 1) return entry.history.map(Number);
  // synthesize a gentle series around base so the chart always reads (real history wired at integration)
  const base = Number((entry && entry.buy) || (def && def.basePrice) || 100);
  const out = []; let v = base * 0.92;
  for (let i = 0; i < 24; i++) { v += (Math.sin(i * 0.7) + (i % 5 === 0 ? 0.6 : -0.2)) * base * 0.015; out.push(Math.max(1, v)); }
  out.push(base);
  return out;
}

// ---- area chart ----
function buildChart(hist, avg) {
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
    `<svg class="sx-mkt-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">` +
      `<defs><linearGradient id="sxmktfill" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${up ? 'rgba(63,208,127,.28)' : 'rgba(255,106,114,.26)'}"/>` +
        `<stop offset="1" stop-color="rgba(63,208,127,0)"/>` +
      `</linearGradient></defs>` +
      `<line class="sx-mkt-avg" x1="${padX}" y1="${avgY}" x2="${W - padX}" y2="${avgY}"/>` +
      `<path d="${area}" fill="url(#sxmktfill)"/>` +
      `<path class="sx-mkt-line" d="${line}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<circle cx="${endX}" cy="${endY}" r="4.5" fill="${stroke}"/>` +
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

  let selectedId = null;
  let mode = 'buy';   // 'buy' | 'sell'
  let qty = 1;

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
    return ids.map((id) => ({ id, def: CMDTY_BY_ID.get(id), entry: table && table[id] }))
      .filter((r) => r.def);
  }

  function renderList(state) {
    const rows = tradedList(state);
    const tracked_ = trackedCmdty(state);
    if (!selectedId && rows.length) selectedId = rows[0].id;
    // group by category, preserve COMMODITIES order
    const groups = new Map();
    for (const r of rows) {
      const cat = (r.def.category || 'other');
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(r);
    }
    let html = '';
    for (const [cat, items] of groups) {
      html += `<div class="sx-mkt-cat">${escapeHtml(cat)}</div>`;
      html += items.map((r) => {
        const hist = priceHistory(r.entry, r.def);
        const buy = unitBuy(r.entry, r.def);
        const up = hist[hist.length - 1] >= hist[0];
        const pct = hist[0] ? Math.round(((hist[hist.length - 1] - hist[0]) / hist[0]) * 100) : 0;
        const active = r.id === selectedId ? ' is-active' : '';
        const tracked = r.id === tracked_ ? ' is-tracked' : '';
        return (
          `<button type="button" class="sx-mkt-row${active}${tracked}" data-cmdty="${escapeHtml(r.id)}" role="tab" aria-selected="${r.id === selectedId}">` +
            (tracked ? `<span class="sx-mkt-row__flag" title="Tracked contract cargo">◆</span>` : '') +
            `<span class="sx-mkt-row__name">${escapeHtml(r.def.name)}</span>` +
            `<span class="sx-mkt-row__price">${fmt(buy)}</span>` +
            `<span class="sx-mkt-row__tr ${up ? 'is-up' : 'is-down'}">${up ? '▲' : '▼'} ${Math.abs(pct)}%</span>` +
          `</button>`
        );
      }).join('');
    }
    listEl.innerHTML = html;
  }

  function renderStage(state) {
    const rows = tradedList(state);
    const r = rows.find((x) => x.id === selectedId) || rows[0];
    if (!r) { stageEl.innerHTML = '<p class="sx-muted">No market at this berth.</p>'; return; }
    const def = r.def, entry = r.entry;
    const hist = priceHistory(entry, def);
    const buy = unitBuy(entry, def), sell = unitSell(entry, def);
    const avg = Number(def.basePrice) || buy;
    const pct = hist[0] ? Math.round(((hist[hist.length - 1] - hist[0]) / hist[0]) * 100) : 0;
    const up = pct >= 0;
    const demand = DEMAND_LEVEL[(entry && entry.demand) || ''] || (buy > avg * 1.1 ? 3 : buy < avg * 0.9 ? 1 : 2);
    const demandLabel = demand >= 3 ? 'High' : demand === 2 ? 'Med' : 'Low';
    const legal = def.legality || 'legal';
    const legalTone = LEGAL_TONE[legal];
    const isTracked = trackedCmdty(state) === r.id;
    stageEl.innerHTML =
      (isTracked ? `<div class="sx-mkt-tracked">${icon('contracts', 15)}<span><b>Tracked contract</b> — buy ${escapeHtml(def.name)} here to load your job.</span></div>` : '') +
      `<div class="sx-mkt-head">` +
        `<div class="sx-mkt-title"><h2>${escapeHtml(def.name)}</h2>` +
          `<span class="sx-tag${legalTone ? ' sx-tag--' + (legalTone === 'loss' ? 'bad' : 'warn') : ''}">${LEGAL_LABEL[legal]}</span>` +
          `<span class="sx-mkt-cat-inline">${escapeHtml(def.category || '')}</span></div>` +
        `<div class="sx-mkt-delta ${up ? 'is-up' : 'is-down'}">${up ? '▲' : '▼'} ${Math.abs(pct)}%<span>vs. period open</span></div>` +
      `</div>` +
      buildChart(hist, avg) +
      `<div class="sx-mkt-stats">` +
        statCell('Buy', fmt(buy) + ' cr', 'You pay') +
        statCell('Sell', fmt(sell) + ' cr', 'Station pays') +
        statCell('Galactic avg', fmt(avg) + ' cr', 'Baseline') +
        `<div class="sx-stat"><span class="sx-stat__k">Demand</span>` +
          `<span class="sx-demand sx-demand--${demand}"><i></i><i></i><i></i></span>` +
          `<span class="sx-stat__sub">${demandLabel}</span></div>` +
      `</div>`;
  }

  function statCell(k, v, sub) {
    return `<div class="sx-stat"><span class="sx-stat__k">${k}</span><span class="sx-stat__v">${v}</span><span class="sx-stat__sub">${sub}</span></div>`;
  }

  function renderConsole(state) {
    const rows = tradedList(state);
    const r = rows.find((x) => x.id === selectedId) || rows[0];
    if (!r) { tradeEl.innerHTML = ''; return; }
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
      return (
        `<div class="sx-route-row">` +
          `<span class="sx-route-row__body">` +
            `<span class="sx-route-row__t">${escapeHtml(t.cmdtyName || t.cmdtyId)} → ${escapeHtml(dest)}</span>` +
            `<span class="sx-route-row__s">${profit > 0 ? '+' + fmt(profit) + ' cr' : '—'}${units > 0 ? ' · ' + fmt(units) + 'u run' : ''}</span>` +
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

  function renderAll(state) { renderList(state); renderStage(state); renderConsole(state); renderRoutes(state); }

  // ---- interactions ----
  listEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-cmdty]');
    if (!btn) return;
    const id = btn.getAttribute('data-cmdty');
    if (id === selectedId) return;
    selectedId = id; qty = 1;
    const state = ctx.state || {};
    renderList(state); renderStage(state); renderConsole(state);
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
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
    if (seg) { mode = seg.getAttribute('data-mode'); qty = 1; renderConsole(ctx.state || {}); if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tick' }); return; }
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
      const st = (c || ctx).state || {};
      // Enable trading: the economy system opens/initializes this station's live market on show
      // (parity with the legacy market panel — without this, ui:buy/ui:sell are no-ops).
      const sid = stationId(st);
      if (ctx.bus && sid) ctx.bus.emit('economy:marketOpened', { stationId: sid });
      // If a tracked contract wants cargo sold/bought here, open straight to that commodity.
      const tracked = trackedCmdty(st);
      if (tracked && tradedList(st).some((r) => r.id === tracked)) selectedId = tracked;
      renderAll(st);
    },
    refresh(c) { renderAll((c || ctx).state || {}); },
    dispose() {},
  };
}
