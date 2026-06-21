// src/ui/screens/market.js — STATION "Market" tab panel.
// Lists commodities with the station's buy/sell prices, a qty stepper, and Buy/Sell buttons that
// EMIT ui:buy / ui:sell {commodityId, qty}. Shows player cargo + credits. Read-only over sim state;
// the economy system owns the trade + credits (§0.6, §4.4). Refreshes on
// economy:tradeCompleted / economy:tick / cargo:changed.
//
// Defensive by design: the economy system may be a stub at boot. We prefer
//   ctx.registry.get('economy').quote(stationId, commodityId, side, qty)
// when available, else fall back to the station's MarketEntry (lastBuy/lastSell) or the commodity
// basePrice. Never throws if markets are empty.
import { COMMODITIES } from '../../data/commodities.js';
import { confirm } from '../confirm.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

// Stepper choices per the design spec (1/10/100/Max).
const STEP_PRESETS = [1, 10, 100];

/** Look up the live MarketEntry for a station+commodity, or null. */
function marketEntry(state, stationId, cmdtyId) {
  const markets = state.economy && state.economy.markets;
  const m = markets && markets[stationId];
  return (m && m[cmdtyId]) || null;
}

/** Best-effort unit price for a side ('buy' = player buys from station, 'sell' = player sells). */
function unitPrice(ctx, stationId, cmdtyId, side) {
  const state = ctx.state;
  // 1) ask the economy system for an authoritative quote if it exposes one.
  const econ = ctx.registry && ctx.registry.get && ctx.registry.get('economy');
  if (econ && typeof econ.quote === 'function') {
    try {
      const q = econ.quote(stationId, cmdtyId, side, 1);
      if (q != null) {
        const v = (typeof q === 'number') ? q : (q.unit != null ? q.unit : (q.unitAvg != null ? q.unitAvg : (q.total != null ? q.total : null)));
        if (v != null && isFinite(v)) return v;
      }
    } catch (_) { /* fall through to data fallback */ }
  }
  // 2) station MarketEntry snapshot.
  const e = marketEntry(state, stationId, cmdtyId);
  if (e) {
    if (side === 'buy' && e.lastBuy != null) return e.lastBuy;
    if (side === 'sell' && e.lastSell != null) return e.lastSell;
    if (e.lastMid != null) return e.lastMid;
  }
  // 3) static basePrice (buy slightly above mid, sell slightly below — a readable placeholder).
  const def = COMMODITY_BY_ID.get(cmdtyId);
  const base = def ? def.basePrice : 0;
  return side === 'buy' ? Math.round(base * 1.1) : Math.round(base * 0.9);
}

/** Does this station trade the given commodity? Prefer the live market; else show legal goods. */
function stationTrades(state, stationId, cmdtyId) {
  const e = marketEntry(state, stationId, cmdtyId);
  if (e) return true;
  // no live market yet → show all commodities so the panel is non-empty for testing.
  return true;
}

function fmtCr(n) { return (Math.round(n) || 0).toLocaleString('en-US'); }

/**
 * createMarketPanel(ctx) -> { el, refresh(ctx), onShow(ctx) }
 * stationHub mounts el, calls onShow when the tab becomes active, refresh on data events.
 */
export function createMarketPanel(ctx) {
  const root = document.createElement('div');
  root.className = 'st-panel st-market';

  // qty per-row stepper state (commodityId -> qty), defaulting to 1.
  const qtyState = Object.create(null);

  // --- header: credits + cargo summary ---
  const header = document.createElement('div');
  header.className = 'st-market-head';
  header.innerHTML =
    '<div class="st-stat"><span class="st-stat-l">CREDITS</span><span class="mono st-credits">0</span></div>' +
    '<div class="st-stat"><span class="st-stat-l">CARGO</span><span class="mono st-cargo">0 / 0 u</span></div>';
  root.appendChild(header);

  // --- Phase 4: trade route planner ("Best Trades") ---
  // Scans marketIntel snapshots + this station's market for profitable buy-here→sell-there routes,
  // ranked by margin per cargo-volume so haulers see their best move at a glance. "Set Nav" writes a
  // navigation waypoint to the destination station the HUD arrow steers toward.
  const planner = document.createElement('div');
  planner.className = 'st-market-planner';
  planner.innerHTML = '<div class="st-sub-h">Best Trades <span class="st-planner-hint">(buy here → sell elsewhere)</span></div>' +
    '<div class="st-planner-list"></div>';
  root.appendChild(planner);
  const plannerList = planner.querySelector('.st-planner-list');
  plannerList.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act="nav"]');
    if (!btn) return;
    const stationId = btn.getAttribute('data-station');
    const cmdtyId = btn.getAttribute('data-cmdty');
    setNavTo(ctx, stationId, cmdtyId);
  });

  // --- table head ---
  const tableHead = document.createElement('div');
  tableHead.className = 'st-row st-row-head';
  tableHead.innerHTML =
    '<span class="c-name">Commodity</span>' +
    '<span class="c-num">Owned</span>' +
    '<span class="c-num">Buy</span>' +
    '<span class="c-num">Sell</span>' +
    '<span class="c-qty">Qty</span>' +
    '<span class="c-act">Trade</span>';
  root.appendChild(tableHead);

  // --- scrollable list ---
  const list = document.createElement('div');
  list.className = 'st-list';
  root.appendChild(list);

  // --- footer: trade preview ---
  const footer = document.createElement('div');
  footer.className = 'st-market-foot';
  footer.innerHTML = '<span class="st-foot-msg">Select a quantity, then Buy or Sell.</span>';
  root.appendChild(footer);

  // ONE delegated listener for the whole list (perf §5.5).
  list.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const rowEl = btn.closest('[data-cmdty]');
    if (!rowEl) return;
    const cmdtyId = rowEl.getAttribute('data-cmdty');
    const act = btn.getAttribute('data-act');
    const state = ctx.state;
    const stationId = panel.stationId;
    const owned = (state.player.cargo.items[cmdtyId]) || 0;

    if (act === 'buy' || act === 'sell') {
      let qty = qtyState[cmdtyId] || 1;
      if (qty === 'max') {
        qty = act === 'buy' ? maxBuyable(ctx, stationId, cmdtyId) : owned;
      }
      qty = Math.max(0, Math.floor(qty));
      if (qty <= 0) { ctx.bus.emit('audio:cue', { id: 'ui_deny' }); return; }
      // Large-trade confirm (UX-2): a Max-then-Buy can commit a fortune in one click. Confirm when
      // the trade total exceeds 50% of credits OR an absolute threshold (whichever is lower), so a
      // casual buy of a few units never prompts but a max-out does. Sells are reversible enough
      // (you can buy back) to skip the gate, so only buys are gated.
      if (act === 'buy') {
        const unit = unitPrice(ctx, stationId, cmdtyId, 'buy') || 0;
        const total = unit * qty;
        const credits = state.player.credits || 0;
        const bigShare = credits > 0 && total >= credits * 0.5;
        const bigAbs = total >= 25000;
        if (bigShare || bigAbs) {
          const name = (COMMODITY_BY_ID.get(cmdtyId) || {}).name || cmdtyId;
          const ok = await confirm({
            title: 'Confirm purchase',
            body: 'Buy ' + qty + ' ' + name + ' for ' + Math.round(total).toLocaleString() + ' CR?',
            confirmLabel: 'Buy',
            danger: bigShare,
          });
          if (!ok) return;
        }
      }
      ctx.bus.emit(act === 'buy' ? 'ui:buy' : 'ui:sell', { commodityId: cmdtyId, qty });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      // optimistic footer note; the real refresh comes from economy:tradeCompleted / cargo:changed.
      footer.querySelector('.st-foot-msg').textContent =
        (act === 'buy' ? 'Buying ' : 'Selling ') + qty + ' ' + (COMMODITY_BY_ID.get(cmdtyId) || {}).name + '...';
      return;
    }
    if (act === 'step') {
      const v = btn.getAttribute('data-v');
      qtyState[cmdtyId] = (v === 'max') ? 'max' : Number(v);
      updateRowQty(rowEl, qtyState[cmdtyId]);
      ctx.bus.emit('audio:cue', { id: 'ui_tick' });
    }
  });

  function updateRowQty(rowEl, q) {
    const out = rowEl.querySelector('.st-qty-val');
    if (out) out.textContent = (q === 'max') ? 'MAX' : String(q);
    rowEl.querySelectorAll('[data-act="step"]').forEach((b) => {
      const v = b.getAttribute('data-v');
      const on = (q === 'max' && v === 'max') || String(q) === v;
      b.classList.toggle('on', on);
    });
  }

  // The list of commodities to display for the active station (sorted by category then name).
  function commodityRowsFor(stationId) {
    const state = ctx.state;
    const out = [];
    for (const c of COMMODITIES) {
      if (!stationTrades(state, stationId, c.id)) continue;
      out.push(c);
    }
    out.sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : (a.name < b.name ? -1 : 1)));
    return out;
  }

  // Build the row DOM once per (re)build; subsequent refreshes update prices/owned in place.
  function rebuild() {
    const state = ctx.state;
    const stationId = panel.stationId;
    const frag = document.createDocumentFragment();
    panel._rowEls = Object.create(null);
    for (const c of commodityRowsFor(stationId)) {
      const row = document.createElement('div');
      row.className = 'st-row';
      row.setAttribute('data-cmdty', c.id);
      const legalTag = c.legality !== 'legal'
        ? ' <span class="st-tag st-tag-' + c.legality + '">' + c.legality + '</span>' : '';
      row.innerHTML =
        '<span class="c-name">' + c.name + legalTag + '</span>' +
        '<span class="c-num st-owned mono">0</span>' +
        '<span class="c-num st-buy mono">—</span>' +
        '<span class="c-num st-sell mono">—</span>' +
        '<span class="c-qty">' +
          STEP_PRESETS.map((v) => '<button data-act="step" data-v="' + v + '">' + v + '</button>').join('') +
          '<button data-act="step" data-v="max">Max</button>' +
          '<span class="st-qty-val mono">1</span>' +
        '</span>' +
        '<span class="c-act">' +
          '<button class="st-buy-btn" data-act="buy">Buy</button>' +
          '<button class="st-sell-btn" data-act="sell">Sell</button>' +
        '</span>';
      frag.appendChild(row);
      panel._rowEls[c.id] = row;
      if (qtyState[c.id] == null) qtyState[c.id] = 1;
      updateRowQty(row, qtyState[c.id]);
    }
    list.textContent = '';
    list.appendChild(frag);
    refreshValues();
  }

  // Cheap in-place refresh of prices / owned / button-enabled + planner + price heat.
  function refreshValues() {
    const state = ctx.state;
    const stationId = panel.stationId;
    const p = state.player;
    header.querySelector('.st-credits').textContent = fmtCr(p.credits);
    const cap = p.cargo.capVolume || 0;
    header.querySelector('.st-cargo').textContent = Math.round(p.cargo.usedVolume || 0) + ' / ' + cap + ' u';
    refreshPlanner(state, stationId);
    if (!panel._rowEls) return;
    for (const cmdtyId in panel._rowEls) {
      const row = panel._rowEls[cmdtyId];
      const owned = (p.cargo.items[cmdtyId]) || 0;
      const buyP = unitPrice(ctx, stationId, cmdtyId, 'buy');
      const sellP = unitPrice(ctx, stationId, cmdtyId, 'sell');
      row.querySelector('.st-owned').textContent = owned;
      row.querySelector('.st-buy').textContent = fmtCr(buyP);
      row.querySelector('.st-sell').textContent = fmtCr(sellP);
      // Phase 4 price heat: ▲/▼ vs the commodity base price so a glance shows rich vs cheap.
      const def = COMMODITY_BY_ID.get(cmdtyId);
      const base = def ? def.basePrice : 0;
      const buyHeat = base > 0 ? (buyP - base) / base : 0;
      applyPriceHeat(row.querySelector('.st-buy'), buyHeat);
      const sellHeat = base > 0 ? (sellP - base) / base : 0;
      applyPriceHeat(row.querySelector('.st-sell'), sellHeat);
      const buyBtn = row.querySelector('.st-buy-btn');
      const sellBtn = row.querySelector('.st-sell-btn');
      // buy disabled if can't afford even 1 unit or cargo full; sell disabled if own nothing.
      const vol = def && def.volPerU > 0 ? def.volPerU : 1;
      const room = (p.cargo.capVolume - p.cargo.usedVolume) >= vol;
      buyBtn.disabled = (p.credits < buyP) || !room;
      sellBtn.disabled = owned <= 0;
    }
  }

  // Render the trade-route planner (best buy→sell margins from market intel).
  function refreshPlanner(state, stationId) {
    const trades = computeBestTrades(state, stationId);
    plannerList.textContent = '';
    if (!trades.length) {
      plannerList.innerHTML = '<div class="st-planner-empty">No profitable routes known yet — visit other stations to log their prices.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const t of trades) {
      const row = document.createElement('div');
      row.className = 'st-planner-row';
      const pct = Math.round((t.margin / t.buyHere) * 100);
      row.innerHTML =
        '<span class="st-pl-cmdty">' + t.cmdtyName + '</span>' +
        '<span class="st-pl-prices mono">buy ' + fmtCr(t.buyHere) + ' → sell ' + fmtCr(t.sellThere) + '</span>' +
        '<span class="st-pl-margin st-pl-up">+' + fmtCr(t.margin) + '/u (' + pct + '%)</span>' +
        '<span class="st-pl-dest">' + stationName(state, t.destStation) + '</span>' +
        '<button class="st-pl-nav" data-act="nav" data-station="' + t.destStation + '" data-cmdty="' + t.cmdtyId + '">Set Nav</button>';
      frag.appendChild(row);
    }
    plannerList.appendChild(frag);
  }

  // Tint a price cell green (cheap) or red (dear) relative to the base price.
  function applyPriceHeat(el, heat) {
    if (!el) return;
    el.classList.remove('st-heat-up', 'st-heat-down', 'st-heat-flat');
    if (heat <= -0.08) el.classList.add('st-heat-down');   // notably cheap (buy opportunity)
    else if (heat >= 0.08) el.classList.add('st-heat-up'); // notably dear (sell opportunity)
    else el.classList.add('st-heat-flat');
  }

  const panel = {
    el: root,
    stationId: null,
    onShow(c) {
      panel.stationId = (c && c.stationId) || panel.stationId;
      rebuild();
    },
    refresh() { refreshValues(); },
    rebuild,
  };
  return panel;
}

/** Max units the player can afford + fit, for the Max stepper. */
function maxBuyable(ctx, stationId, cmdtyId) {
  const p = ctx.state.player;
  const def = COMMODITY_BY_ID.get(cmdtyId);
  const vol = def && def.volPerU > 0 ? def.volPerU : 1;
  const buyP = Math.max(1, unitPrice(ctx, stationId, cmdtyId, 'buy'));
  const byCredits = Math.floor(p.credits / buyP);
  const byRoom = Math.floor((p.cargo.capVolume - p.cargo.usedVolume) / vol);
  return Math.max(0, Math.min(byCredits, byRoom));
}

// ---- Phase 4: trade route planner -----------------------------------------------------------

/** Resolve a station's display name from its entity or the sectors data catalog. */
function stationName(state, stationId) {
  for (const e of state.entityList) {
    if (e.type === 'station' && e.data && e.data.stationId === stationId) {
      return e.data.name || e.data.stationName || e.data.stationId || 'Station';
    }
  }
  return stationId || 'Station';
}

/** Set a navigation waypoint to a destination station so the HUD arrow steers toward it. */
function setNavTo(ctx, stationId, cmdtyId) {
  const state = ctx.state;
  // resolve the destination's world position: prefer a live station entity in this sector
  let pos = null;
  for (const e of state.entityList) {
    if (e.type === 'station' && e.data && e.data.stationId === stationId) { pos = { x: e.pos.x, z: e.pos.z }; break; }
  }
  const cmdty = COMMODITY_BY_ID.get(cmdtyId);
  state.nav.waypoint = {
    stationId,
    pos: pos || { x: 0, z: 0 },
    label: stationName(state, stationId) + (cmdty ? ' · ' + cmdty.name : ''),
  };
  ctx.bus.emit('toast', { text: 'Nav set: ' + state.nav.waypoint.label + (pos ? '' : ' (in another sector — undock & jump)'), kind: 'info', ttl: 3 });
  ctx.bus.emit('audio:cue', { id: 'ui_click' });
}

/** Build the ranked "Best Trades" list: for each commodity traded HERE, find the best known
 *  SELL price across marketIntel snapshots, compute the per-unit and per-volume margin, and rank. */
function computeBestTrades(state, hereStationId) {
  const intel = state.economy && state.economy.marketIntel;
  const hereMarket = state.economy && state.economy.markets && state.economy.markets[hereStationId];
  if (!hereMarket) return [];
  const out = [];
  for (const cmdtyId in hereMarket) {
    const entry = hereMarket[cmdtyId];
    if (!entry || entry.lastBuy == null) continue;
    const def = COMMODITY_BY_ID.get(cmdtyId);
    if (!def) continue;
    const vol = def.volPerU > 0 ? def.volPerU : 1;
    const buyHere = entry.lastBuy;
    // scan all known stations' snapshots for the best sell price
    let bestSell = -1, bestStation = null, bestSeen = 0;
    for (const sid in intel) {
      if (sid === hereStationId) continue;
      const snap = intel[sid].snapshot || {};
      const s = snap[cmdtyId];
      if (!s || s.sell == null) continue;
      if (s.sell > bestSell) { bestSell = s.sell; bestStation = sid; bestSeen = intel[sid].seenAtT || 0; }
    }
    if (!bestStation || bestSell <= buyHere) continue;
    const margin = bestSell - buyHere;
    const perVol = margin / vol;   // rank by profit per cargo-volume (what a hauler cares about)
    out.push({ cmdtyId, cmdtyName: def.name, buyHere, sellThere: bestSell, margin, perVol, destStation: bestStation, age: bestSeen });
  }
  out.sort((a, b) => b.perVol - a.perVol);
  return out.slice(0, 5); // top 5
}
