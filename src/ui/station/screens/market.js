import { MARKET_FILTERS, marketFamily, marketBrowserHtml, marketRowHtml, marketQuoteHtml, marketTradeHtml, marketReceiptRow as rowKV } from '../../views/marketPresentation.js';
import { marketFrameHtml } from '../../views/stationFrames.js';
// src/ui/station/screens/market.js — "Market": the dense register (Frontend Task C §1.3).
// Left half: the commodity table — name, buy, sell, stock, held — twelve rows visible with hairlines,
// the selected row marked by a gold rule on its left edge. Right half: the selected commodity's name
// at screen-title size and its price at hero size, one sentence of why, and Buy and Sell as two
// words with a quantity beside them. Emits ui:buy / ui:sell {commodityId, qty}; the trade math, the
// quotes and the route logic are untouched. Styled by styles/kit.css + styles/station.css only.
import { COMMODITIES } from '../../../data/commodities.js';
import { SECTORS } from '../../../data/sectors.js';
import { isUnsellableCargo } from '../../../systems/cargo.js';
import { escapeHtml } from '../../comms.js';
import { entitySpanHtml } from '../../entityResolver.js';
import { MAP_FOCUS, openGalaxyMap } from '../../mapAuthority.js';
import { mountDataState } from '../../uiPrimitives.js';
import { renderAdBoardNotice } from '../adBoard.js';
import { marketQuoteValue, presentMarketDrivers } from '../../marketDriverPresenter.js';
import { presentCommodityIntel, presentInspectorRows } from '../../marketIntelPresenter.js';
// Trade-route intel + course plotting reuse the canonical market logic (same waypoint/ui:setCourse
// contract the legacy panel used) — never re-derive routes or nav here.
import { computeBestTrades, applyTradeNavigation } from '../../market/tradeLogic.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const STATION_NAME = new Map();
for (const sec of SECTORS) for (const s of (sec.stations || [])) STATION_NAME.set(s.id, s.name || s.id);


// Meaning roles kept for the instrument-hierarchy tests and the help screen's shared vocabulary.
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
function demandWord(level) { return level >= 3 ? 'high' : level === 1 ? 'low' : 'normal'; }
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

export function createMarketScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'k-panel k-panel--split sx-mkt';
  el.innerHTML = marketFrameHtml();
  const adBoardEl = el.querySelector('[data-ad-board]');
  const listEl = el.querySelector('.sx-mkt__list');
  const stageEl = el.querySelector('.sx-mkt__stage');
  const quoteEl = el.querySelector('.sx-mkt__quote');
  const consoleEl = el.querySelector('.sx-mkt__console');
  const tradeEl = el.querySelector('.sx-mkt__trade');
  const routesEl = el.querySelector('.sx-mkt__routes');
  let tradeBusy = false;

  let selectedId = null;
  let mode = 'buy';   // 'buy' | 'sell'
  let qty = 1;
  let cargoOnly = false;
  let marketFilter = 'all';
  let marketQuery = '';
  let listRenderSignature = '';
  // The register's chrome (filters, search, table) is built once and updated in place.
  let modeEl = null;
  let searchEl = null;
  let filterEls = null;
  let tbodyEl = null;

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

  // One register row: name (◆ before it when tracked), buy + trend, sell, stock, held.
  function commodityRowHtml(r, state, tracked_, selected) {
    const hist = priceHistory(r.entry, r.def);
    const buy = unitBuy(r.entry, r.def);
    const sell = unitSell(r.entry, r.def);
    const stock = Math.max(0, Math.floor(Number(r.entry && r.entry.stock) || 0));
    const demand = demandLevel(r.entry);
    const drivers = presentMarketDrivers({ state, stationId: stationId(state), commodity: r.def, entry: r.entry });
    const held = heldQty(state, r.id);
    return marketRowHtml({ id: r.id, name: r.def.name, category: r.def.category,
      buy, sell, stock, held, hist, demandWord: demandWord(demand),
      driversSummary: drivers.accessibleSummary, selected, tracked: r.id === tracked_ });
  }

  function emptyFilterLabel() {
    return marketQuery || MARKET_FILTERS.find((f) => f.id === marketFilter)?.label || 'this filter';
  }

  // The register chrome (exchange line, family filters, search, table) is built once and then
  // updated in place, so typing in the search and arrowing through the rows survive price ticks.
  function buildBrowserChrome() {
    listEl.innerHTML = marketBrowserHtml();
    modeEl = listEl.querySelector('.sx-mkt-browser__mode');
    searchEl = listEl.querySelector('[data-market-search]');
    tbodyEl = listEl.querySelector('tbody');
    filterEls = new Map();
    for (const btn of listEl.querySelectorAll('[data-market-filter]')) {
      filterEls.set(btn.getAttribute('data-market-filter'), btn);
    }
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
    if (!changed) return;
    qty = mode === 'sell' ? heldQty(ctx.state || {}, id) : 1;
    const state = ctx.state || {};
    renderStage(state); renderConsole(state);
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
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

    if (!tbodyEl) buildBrowserChrome();

    // `tracked_` is rendered into every row (the ◆ flag), so it belongs in the signature; the
    // selection is applied in place by selectCommodity and stays out of it.
    const signature = JSON.stringify({
      marketFilter, marketQuery, cargoOnly, tracked: tracked_,
      rows: visible.map((r) => [r.id, unitBuy(r.entry, r.def), unitSell(r.entry, r.def), r.entry && r.entry.stock,
        heldQty(state, r.id), r.entry && r.entry.demandMult, priceHistory(r.entry, r.def).at(-1)]),
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

      const focused = typeof document !== 'undefined' && tbodyEl.contains(document.activeElement);
      tbodyEl.innerHTML = visible.map((r) => commodityRowHtml(r, state, tracked_, r.id === selectedId)).join('');
      const emptyEl = listEl.querySelector('.sx-mkt-browser__empty');
      emptyEl.hidden = visible.length > 0;
      emptyEl.textContent = visible.length ? '' : `No commodities match ${emptyFilterLabel()}.`;
      if (focused) {
        const active = tbodyEl.querySelector('.is-active');
        if (active) { try { active.focus({ preventScroll: true }); } catch (_) {} }
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
    const r = rows.find((x) => x.id === selectedId) || rows[0];
    if (!r) {
      stageEl.removeAttribute('aria-labelledby');
      stageEl.removeAttribute('aria-label');
      stageEl.removeAttribute('aria-describedby');
      consoleEl.hidden = true;
      mountDataState(quoteEl, 'empty', {
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
    consoleEl.hidden = false;
    const def = r.def, entry = r.entry;
    const hist = priceHistory(entry, def);
    const buy = unitBuy(entry, def), sell = unitSell(entry, def);
    const avg = Number(def.basePrice) || buy;
    const demand = demandLevel(entry);
    const drivers = presentMarketDrivers({ state, stationId: stationId(state), commodity: def, entry });
    const legal = def.legality || 'legal';
    const isTracked = trackedCmdty(state) === r.id;
    const trackedGuidance = isTracked ? trackedCargoGuidance(state, r.id, def.name) : null;
    stageEl.setAttribute('aria-labelledby', `sx-market-tab-${r.id}`);
    stageEl.setAttribute('aria-label', def.name);
    stageEl.setAttribute('aria-describedby', 'sx-market-driver-summary');
    quoteEl.innerHTML = marketQuoteHtml({ id: r.id, name: def.name, category: def.category, legal,
      titleHtml: entitySpanHtml('commodity:' + r.id, escapeHtml(def.name)), mode, buy, sell, avg,
      demandWord: demandWord(demand), driversSummary: drivers.accessibleSummary, hist, trackedGuidance });
  }

  function renderConsole(state, { receiptOnly = false } = {}) {
    const rows = tradedList(state);
    const r = rows.find((x) => x.id === selectedId) || rows[0];
    if (!r) {
      tradeEl.innerHTML =
        `<div class="sx-trade sx-trade--empty">` +
          `<ul class="k-words k-words--row sx-seg" role="tablist">` +
            `<li><button type="button" class="k-word k-word--emph sx-seg__btn${mode === 'buy' ? ' is-on' : ''}" data-mode="buy" aria-pressed="${mode === 'buy'}">Buy</button></li>` +
            `<li><button type="button" class="k-word k-word--emph sx-seg__btn${mode === 'sell' ? ' is-on' : ''}" data-mode="sell" aria-pressed="${mode === 'sell'}">Sell</button></li>` +
          `</ul>` +
          `<p class="k-empty sx-trade-empty">Nothing in the hold. Switch to Buy to load cargo.</p>` +
        `</div>`;
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
    // execute() reuses the same economy integral, including the bulk price impact, on confirm.
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
    const goLabel = (side) => `${side === 'buy' ? 'Buy' : 'Sell'} ${fmt(qty)}`;
    if (receiptOnly && tradeEl.querySelector('[data-market-intel]')) {
      // Keep the focused numeric input alive while each keystroke updates its actual quote.
      tradeEl.querySelector('[data-market-intel]').innerHTML = receiptHtml;
      const go = tradeEl.querySelector('[data-go]');
      go.disabled = !canAct;
      go.textContent = goLabel(mode);
      const noteEl = tradeEl.querySelector('.sx-trade__note');
      noteEl.textContent = note;
      noteEl.hidden = !note;
      return;
    }

    // Preserve the native event contract: the live side commits, the other side switches mode.
    tradeEl.innerHTML = marketTradeHtml({ mode, qty, canAct, receiptHtml, note });
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
        `<li class="k-row k-row--static sx-route-row">` +
          `<span class="sx-route-row__body"><span class="k-row__name sx-route-row__t">${entitySpanHtml('commodity:' + t.cmdtyId, escapeHtml(t.cmdtyName || t.cmdtyId))} → ${entitySpanHtml('station:' + t.destStation, escapeHtml(dest))}</span>` +
            `<span class="k-row__sub">${units > 0 ? fmt(units) + ' u run' : ''}${escapeHtml(demandReason)}</span></span>` +
          `<span class="k-row__num sx-route-row__s${profit > 0 ? ' k-good' : ''}">${profit > 0 ? '+' + fmt(profit) + ' cr' : '—'}</span>` +
          `<button type="button" class="k-word k-word--fine sx-lead__go" data-course="${escapeHtml(t.cmdtyId)}" data-dest="${escapeHtml(t.destStation)}">Set course</button>` +
        `</li>`
      );
    }).join('');
    routesEl.innerHTML =
      `<p class="k-caps sx-mkt__routes-head">Best routes from here</p>` +
      (rows ? `<ul class="k-rows" style="--k-row-cols: minmax(0,1fr) auto auto">${rows}</ul>`
        : `<p class="k-sentence sx-muted">No profitable runs known from here yet — visit more stations to learn their prices.</p>`);
  }

  function renderAll(state) {
    renderAdBoardNotice(adBoardEl, state);
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const editingQuantity = !!(active && tradeEl.contains(active) && active.classList.contains('sx-qty__in'));
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
    const row = ev.target.closest('.sx-mkt-row[data-cmdty]');
    if (row) selectCommodity(row.getAttribute('data-cmdty'));
  });
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
    const go = ev.target.closest('[data-go]');
    if (go) {
      if (go.disabled) return;
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
      return;
    }
    const seg = ev.target.closest('[data-mode]');
    if (seg) {
      const nextMode = seg.getAttribute('data-mode');
      if (nextMode === mode) return;
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
      renderConsole(state);
    }
  });

  consoleEl.addEventListener('input', (ev) => {
    if (!ev.target.classList.contains('sx-qty__in')) return;
    const n = parseInt(ev.target.value, 10);
    qty = Number.isFinite(n) ? Math.max(0, n) : 0;
    renderConsole(ctx.state || {}, { receiptOnly: true });
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
      const active = tbodyEl && tbodyEl.querySelector('.is-active');
      if (active && typeof active.scrollIntoView === 'function') { try { active.scrollIntoView({ block: 'nearest' }); } catch (_) {} }
    },
    refresh(c) { renderAll((c || ctx).state || {}); },
    onHide() {},
    dispose() {},
  };
}
