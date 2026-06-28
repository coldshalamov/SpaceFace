// src/ui/screens/market.js — STATION "Market" tab panel.
// Lists commodities with the station's buy/sell prices, a qty stepper, and Buy/Sell buttons that
// EMIT ui:buy / ui:sell {commodityId, qty}. Shows player cargo + credits. Read-only over sim state;
// the economy system owns the trade + credits (§0.6, §4.4). Refreshes on
// economy:tradeCompleted / economy:tradeFailed / economy:tick / cargo:changed.
//
// Defensive by design: the economy system may be a stub at boot. We prefer
//   ctx.registry.get('economy').quote(stationId, commodityId, side, qty)
// when available, else fall back to the station's MarketEntry (lastBuy/lastSell) or a role-based
// equilibrium estimate. Never throws if markets are empty.
import { COMMODITIES } from '../../data/commodities.js';
import { economyBaseEqForSize, economySpotPriceForRole } from '../../systems/economy.js';
import { confirm } from '../confirm.js';
import { createListControls, buildSortHeader, sortHeaderAria } from '../listControls.js';
import { getPriceHistory } from '../priceHistory.js';
import { drawSparkline } from '../sparkline.js';
import { escapeHtml } from '../comms.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

// Stepper choices per the design spec (1/10/100/Max).
const STEP_PRESETS = [1, 10, 100];

/** Look up the live MarketEntry for a station+commodity, or null. */
function marketEntry(state, stationId, cmdtyId) {
  const markets = state.economy && state.economy.markets;
  const m = markets && markets[stationId];
  return (m && m[cmdtyId]) || null;
}

function stationRecordId(station) {
  if (!station) return null;
  if (typeof station.stationId === 'string' && station.stationId) return station.stationId;
  return (typeof station.id === 'string' && station.id) ? station.id : null;
}

function liveStationEntity(state, stationId) {
  for (const e of ((state && state.entityList) || [])) {
    if (e && e.type === 'station' && e.data && e.data.stationId === stationId) return e;
  }
  return null;
}

function stationInfoFrom(record, entity, stationId) {
  if (!record && !entity) return null;
  const data = (entity && entity.data) || {};
  return {
    ...(record || {}),
    id: stationId || stationRecordId(record) || data.stationId || null,
    name: (record && record.name) || data.name || data.stationName || data.stationId || stationId || 'Station',
    type: (record && (record.type || record.stationTypeId)) || data.stationTypeId || data.type || '',
    size: (record && record.size) || data.size || 'M',
    services: (record && record.services) || data.services || [],
    factionId: (record && record.factionId) || data.factionId || (entity && entity.factionId) || null,
  };
}

function usableQuoteUnit(q) {
  if (q == null || (typeof q === 'object' && q.ok === false)) return null;
  const v = (typeof q === 'number') ? q : (q.unit != null ? q.unit : (q.unitAvg != null ? q.unitAvg : (q.total != null ? q.total : null)));
  return Number.isFinite(v) && v > 0 ? v : null;
}

function usablePrice(v) {
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Best-effort unit price for a side ('buy' = player buys from station, 'sell' = player sells). */
export function unitPrice(ctx, stationId, cmdtyId, side) {
  const state = ctx.state;
  // 1) ask the economy system for an authoritative quote if it exposes one.
  const econ = ctx.registry && ctx.registry.get && ctx.registry.get('economy');
  if (econ && typeof econ.quote === 'function') {
    try {
      const q = econ.quote(stationId, cmdtyId, side, 1);
      const v = usableQuoteUnit(q);
      if (v != null) return v;
    } catch (_) { /* fall through to data fallback */ }
  }
  // 2) station MarketEntry snapshot.
  const e = marketEntry(state, stationId, cmdtyId);
  if (e) {
    if (side === 'buy') {
      const buy = usablePrice(e.lastBuy);
      if (buy != null) return buy;
    }
    if (side === 'sell') {
      const sell = usablePrice(e.lastSell);
      if (sell != null) return sell;
    }
    const mid = usablePrice(e.lastMid);
    if (mid != null) return mid;
  }
  // 3) static equilibrium estimate from the commodity's station role.
  return staticRolePrice(state, stationId, cmdtyId, side);
}

function staticRolePrice(state, stationId, cmdtyId, side) {
  const def = COMMODITY_BY_ID.get(cmdtyId);
  const base = def ? def.basePrice : 0;
  const info = stationInfoFor(state, stationId);
  const role = stationRoleFor(def, info && info.type);
  if (def && role !== 'none') {
    return Math.round(economySpotPriceForRole(def, role, side, {
      baseEq: economyBaseEqForSize((info && info.size) || 'M'),
    }));
  }
  return side === 'buy' ? Math.round(base * 1.04) : Math.round(base * 0.96);
}

/** Does this station trade the given commodity? Honest gate (UX-5): the economy only creates a
 *  market entry for commodities whose role (produce/consume) is non-'none' for this station type,
 *  so the presence of a live entry IS the truth. If the live market hasn't been seeded yet, fall
 *  back to the static producedBy/consumedBy lists vs the station's type so the panel still reflects
 *  the station's real trade identity instead of showing every commodity. */
function stationTrades(state, stationId, cmdtyId) {
  const e = marketEntry(state, stationId, cmdtyId);
  if (e) return e.role !== 'none';
  // No live entry yet — resolve from the static station type + commodity role lists.
  const def = COMMODITY_BY_ID.get(cmdtyId);
  if (!def) return false;
  const stationType = stationTypeFor(state, stationId);
  if (!stationType) return false;
  return stationRoleFor(def, stationType) !== 'none';
}

/** Look up a station profile from the active sector or runtime sector catalog. */
function stationInfoFor(state, stationId) {
  const sect = state.world && state.world.activeSector;
  const live = liveStationEntity(state, stationId);
  let stn = sect && (sect.stations || []).find((x) => stationRecordId(x) === stationId);
  if (!stn) {
    for (const s of (state.world && state.world.sectors ? Object.values(state.world.sectors) : [])) {
      stn = (s.stations || []).find((x) => stationRecordId(x) === stationId);
      if (stn) break;
    }
  }
  return stationInfoFrom(stn, live, stationId);
}

/** Look up a station's type (trade_hub / refinery / mining / fab / military / blackmarket / research)
 *  from the active sector or runtime sector catalog. Returns '' if not found. */
function stationTypeFor(state, stationId) {
  const stn = stationInfoFor(state, stationId);
  return (stn && stn.type) || '';
}

function stationRoleFor(def, stationType) {
  if (!def || !stationType) return 'none';
  if ((def.producedBy || []).includes(stationType)) return 'produce';
  if ((def.consumedBy || []).includes(stationType)) return 'consume';
  return 'none';
}

function fmtCr(n) { return (Math.round(n) || 0).toLocaleString('en-US'); }

function tradeFailureText(reason) {
  switch (reason) {
    case 'credits': return 'insufficient credits';
    case 'cargo_full': return 'cargo hold full';
    case 'no_cargo': return 'nothing to sell';
    case 'no_stock': return 'station out of stock';
    case 'not_docked': return 'not docked';
    default: return 'trade failed';
  }
}

function setFooterText(footer, text) {
  const msg = footer && footer.querySelector && footer.querySelector('.st-foot-msg');
  if (msg) msg.textContent = text;
}

function commodityPurpose(c) {
  const cat = (c && c.category) || '';
  if (c && c.legality === 'contraband') return 'Risk cargo: high margins at black markets, but scans and trouble matter.';
  if (c && c.legality === 'restricted') return 'Restricted cargo: profitable where wanted, risky around patrols.';
  if (/raw|gas|crystal/.test(cat)) return 'Mining output: sell to buyers or feed refineries and fabs.';
  if (/refined/.test(cat)) return 'Industrial input: useful for manufacturing and station demand.';
  if (/component|tech/.test(cat)) return 'Upgrade economy: fabs, research, and military buyers want this.';
  if (/military/.test(cat)) return 'Combat supply: military demand can pay well, but legality varies.';
  if (/salvage/.test(cat)) return 'Recovered cargo: convert wreck runs into credits or fab inputs.';
  if (/food|med|consumer|luxury/.test(cat)) return 'Route cargo: move it from producers to high-demand stations for profit.';
  return 'Trade cargo: buy where cheap, sell where demanded, then spend credits on ship upgrades.';
}

function stationMarketPurpose(state, stationId) {
  const type = stationTypeFor(state, stationId);
  switch (type) {
    case 'mining':
      return 'Mining markets buy supplies and move raw ore into the trade loop; sell mined cargo or stock up before asteroid work.';
    case 'refinery':
      return 'Refineries want ore, gas, and volatiles, then feed refined materials into manufacturing and ship upgrades.';
    case 'fab':
      return 'Fabricators consume refined goods and components; bring materials here when you want modules or hull production.';
    case 'military':
      return 'Military stations pay for combat supply chains and keep repair/refuel options close to dangerous work.';
    case 'blackmarket':
      return 'Black markets trade risky cargo and covert margins; profits can be high, but legal pressure is part of the cost.';
    case 'research':
      return 'Research stations value scans, exotic goods, medical supply, and tech-linked inputs.';
    case 'trade_hub':
      return 'Trade hubs compare many routes; buy low here, set nav to a better buyer, then spend profits on hulls and modules.';
    default:
      return 'Markets turn cargo space into credits; credits buy hulls, modules, repairs, fuel, and mission readiness.';
  }
}

const MARKET_MISSION_TYPES = new Set(['bulk_trade', 'cargo_delivery', 'smuggling_run', 'salvage_retrieval']);

function trackedMarketMission(state, stationId) {
  const trackedId = state && state.ui && state.ui.trackedMissionId;
  const active = state && state.missions && state.missions.active || [];
  const mission = trackedId ? active.find((m) => m && m.id === trackedId && m.status === 'active') : null;
  const cmdtyId = mission && mission.params && mission.params.cmdtyId;
  if (!mission || !cmdtyId || !MARKET_MISSION_TYPES.has(mission.type)) return null;
  const def = COMMODITY_BY_ID.get(cmdtyId);
  const target = Math.max(1, Number(mission.objectiveTarget || mission.params.qty || 1) || 1);
  const progress = Math.max(0, Number(mission.objectiveProgress) || 0);
  const remaining = Math.max(0, target - progress);
  const owned = Math.max(0, Number(state.player && state.player.cargo && state.player.cargo.items && state.player.cargo.items[cmdtyId]) || 0);
  const atDestination = !!(mission.destStationId && mission.destStationId === stationId);
  return {
    mission,
    cmdtyId,
    cmdtyName: def ? def.name : cmdtyId,
    target,
    progress,
    remaining,
    owned,
    needToLoad: Math.max(0, remaining - owned),
    atDestination,
    destination: mission.destStationId ? stationName(state, mission.destStationId) : 'destination',
  };
}

function trackedMarketActionText(info) {
  if (!info) return '';
  if (info.atDestination) {
    return 'Tracked contract destination: sell ' + fmtCr(info.remaining) + 'u here to finish the job.';
  }
  if (info.needToLoad > 0) {
    return 'Tracked contract cargo: load ' + fmtCr(info.needToLoad) + 'u more before undocking for ' + info.destination + '.';
  }
  return 'Tracked contract cargo is aboard: undock and follow nav guidance to ' + info.destination + '.';
}

function activeTradeRoute(state, stationId) {
  const waypoint = state && state.nav && state.nav.waypoint;
  if (!waypoint || waypoint.kind !== 'trade' || waypoint.stationId !== stationId || !waypoint.commodityId) return null;
  const cmdtyId = waypoint.commodityId;
  const def = COMMODITY_BY_ID.get(cmdtyId);
  const cargo = state.player && state.player.cargo || {};
  const owned = Math.max(0, Math.floor(Number(cargo.items && cargo.items[cmdtyId]) || 0));
  return {
    cmdtyId,
    cmdtyName: def ? def.name : cmdtyId,
    owned,
    destination: stationName(state, stationId),
    reason: waypoint.reason || (def ? 'Sell ' + def.name : 'Sell cargo'),
  };
}

function selectedQtyFor(qtySetting, maxValue) {
  if (qtySetting === 'max') return Math.max(0, Math.floor(maxValue || 0));
  return Math.max(0, Math.floor(Number(qtySetting) || 0));
}

async function confirmMarketPurchase(ctx, stationId, cmdtyId, qty, opts = {}) {
  const state = ctx.state;
  const unit = unitPrice(ctx, stationId, cmdtyId, 'buy') || 0;
  const total = unit * qty;
  const credits = state.player.credits || 0;
  const bigShare = credits > 0 && total >= credits * 0.5;
  const bigAbs = total >= 25000;
  if (!bigShare && !bigAbs) return true;
  const name = (COMMODITY_BY_ID.get(cmdtyId) || {}).name || cmdtyId;
  const routeLine = opts.routeName
    ? '\n\nThis loads the Best Trades route and sets nav for ' + opts.routeName + '.'
    : '\n\nCargo only pays off when you sell it into demand, complete a contract, or feed manufacturing. Check Best Trades or Mission Log after buying.';
  return confirm({
    title: 'Confirm purchase',
    body: 'Buy ' + qty + ' ' + name + ' for ' + Math.round(total).toLocaleString() + ' CR?' + routeLine,
    confirmLabel: 'Buy',
    danger: bigShare,
  });
}

/**
 * createMarketPanel(ctx) -> { el, refresh(ctx), onShow(ctx) }
 * stationHub mounts el, calls onShow when the tab becomes active, refresh on data events.
 */
export function createMarketPanel(ctx) {
  const root = document.createElement('div');
  root.className = 'st-panel st-market';

  // qty per-row stepper state (commodityId -> qty), defaulting to 1.
  const qtyState = Object.create(null);
  let pendingLoadNav = null;

  // --- header: credits + cargo summary ---
  const header = document.createElement('div');
  header.className = 'st-market-head';
  header.innerHTML =
    '<div class="st-stat"><span class="st-stat-l">CREDITS</span><span class="mono st-credits">0</span></div>' +
    '<div class="st-stat"><span class="st-stat-l">CARGO</span><span class="mono st-cargo">0 / 0 u</span></div>';
  root.appendChild(header);

  const purpose = document.createElement('div');
  purpose.className = 'st-market-purpose';
  purpose.innerHTML = '<b>Market loop:</b> <span class="st-market-purpose-text"></span>';
  root.appendChild(purpose);

  const missionCallout = document.createElement('div');
  missionCallout.className = 'st-market-mission';
  missionCallout.hidden = true;
  root.appendChild(missionCallout);

  const routeCallout = document.createElement('div');
  routeCallout.className = 'st-market-route';
  routeCallout.hidden = true;
  root.appendChild(routeCallout);
  routeCallout.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act="route-sell"]');
    if (!btn) return;
    const cmdtyId = btn.getAttribute('data-cmdty');
    const owned = Math.max(0, Math.floor(Number(ctx.state.player && ctx.state.player.cargo && ctx.state.player.cargo.items && ctx.state.player.cargo.items[cmdtyId]) || 0));
    if (owned <= 0) { ctx.bus.emit('audio:cue', { id: 'ui_deny' }); return; }
    ctx.bus.emit('ui:sell', { commodityId: cmdtyId, qty: owned });
    ctx.bus.emit('audio:cue', { id: 'ui_click' });
    footer.querySelector('.st-foot-msg').textContent =
      'Selling route cargo: ' + owned + ' ' + ((COMMODITY_BY_ID.get(cmdtyId) || {}).name || cmdtyId) + '...';
  });

  // --- Phase 4: trade route planner ("Best Trades") ---
  // Scans marketIntel snapshots + this station's market for profitable buy-here→sell-there routes,
  // ranked by margin per cargo-volume so haulers see their best move at a glance. "Set Nav" writes a
  // navigation waypoint to the destination station the HUD arrow steers toward.
  const planner = document.createElement('div');
  planner.className = 'st-market-planner';
  planner.innerHTML = '<div class="st-sub-h">Best Trades <span class="st-planner-hint">(current hold + credits)</span></div>' +
    '<div class="st-planner-list"></div>';
  root.appendChild(planner);
  const plannerList = planner.querySelector('.st-planner-list');
  plannerList.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const destStationId = btn.getAttribute('data-station');
    const cmdtyId = btn.getAttribute('data-cmdty');
    if (act === 'nav') {
      applyTradeNavigation(ctx, destStationId, cmdtyId);
      return;
    }
    if (act === 'load-nav') {
      const stationId = panel.stationId;
      const requested = Math.max(0, Math.floor(Number(btn.getAttribute('data-qty')) || 0));
      const qty = Math.min(requested, maxBuyable(ctx, stationId, cmdtyId));
      if (qty <= 0) { ctx.bus.emit('audio:cue', { id: 'ui_deny' }); return; }
      const ok = await confirmMarketPurchase(ctx, stationId, cmdtyId, qty, {
        routeName: stationName(ctx.state, destStationId),
      });
      if (!ok) return;
      pendingLoadNav = { stationId, destStationId, cmdtyId, qty };
      ctx.bus.emit('ui:buy', { commodityId: cmdtyId, qty });
      if (pendingLoadNav && pendingLoadNav.stationId === stationId &&
          pendingLoadNav.destStationId === destStationId && pendingLoadNav.cmdtyId === cmdtyId) {
        pendingLoadNav = null;
        ctx.bus.emit('audio:cue', { id: 'ui_deny' });
        setFooterText(footer, 'Route load did not complete; nav unchanged.');
      }
    }
  });

  // --- table head ---
  const tableHead = document.createElement('div');
  tableHead.className = 'st-row st-row-head';
  // UX-3: sortable column headers. Clicking a header toggles the sort key + direction.
  const _sort = { key: 'category', dir: 'asc' };
  function applySort(key) {
    if (_sort.key === key) _sort.dir = _sort.dir === 'asc' ? 'desc' : 'asc';
    else { _sort.key = key; _sort.dir = 'asc'; }
    rebuild();
  }
  tableHead.innerHTML = '';
  const hName = buildSortHeader({ key: 'name', label: 'Commodity', activeKey: _sort.key, dir: _sort.dir, onSort: applySort });
  hName.style.gridColumn = '1';
  const hOwned = buildSortHeader({ key: 'owned', label: 'Owned', activeKey: _sort.key, dir: _sort.dir, onSort: applySort });
  const hBuy = buildSortHeader({ key: 'buy', label: 'Buy', activeKey: _sort.key, dir: _sort.dir, onSort: applySort });
  const hSell = buildSortHeader({ key: 'sell', label: 'Sell', activeKey: _sort.key, dir: _sort.dir, onSort: applySort });
  [hName, hOwned, hBuy, hSell].forEach((h) => { h.className += ' c-num'; tableHead.appendChild(h); });
  // the qty + trade columns aren't sortable; pad them with plain spans to keep the grid intact
  const qtyH = document.createElement('span'); qtyH.className = 'c-qty'; qtyH.textContent = 'Qty'; tableHead.appendChild(qtyH);
  const actH = document.createElement('span'); actH.className = 'c-act'; actH.textContent = 'Trade'; tableHead.appendChild(actH);
  root.appendChild(tableHead);

  // UX-3: search box above the list (filters by commodity name/category). Cheap substring match.
  const _filter = { q: '' };
  const ctrls = createListControls({
    search: true, placeholder: 'Search commodities…',
    onSearch: (q) => { _filter.q = q; rebuild(); },
  });
  root.appendChild(ctrls.el);

  // --- scrollable list ---
  const list = document.createElement('div');
  list.className = 'st-list';
  root.appendChild(list);

  // --- footer: trade preview ---
  const footer = document.createElement('div');
  footer.className = 'st-market-foot';
  footer.innerHTML = '<span class="st-foot-msg">Buy cargo for missions or profitable routes; sell mined, looted, or delivered goods to fund hulls, modules, repairs, and fuel.</span>';
  root.appendChild(footer);

  if (ctx.bus && typeof ctx.bus.on === 'function') {
    ctx.bus.on('economy:tradeCompleted', (p) => {
      if (!pendingLoadNav || !p || p.side !== 'buy') return;
      if (p.stationId !== pendingLoadNav.stationId || p.commodityId !== pendingLoadNav.cmdtyId) return;
      const pending = pendingLoadNav;
      pendingLoadNav = null;
      applyTradeNavigation(ctx, pending.destStationId, pending.cmdtyId);
      const cmdty = COMMODITY_BY_ID.get(pending.cmdtyId);
      setFooterText(footer,
        'Loaded ' + fmtCr(p.qty || pending.qty) + ' ' + ((cmdty && cmdty.name) || pending.cmdtyId) +
        ' and plotted ' + stationName(ctx.state, pending.destStationId) + '.');
    });
    ctx.bus.on('economy:tradeFailed', (p) => {
      if (!pendingLoadNav || !p || p.side !== 'buy') return;
      if (p.stationId !== pendingLoadNav.stationId || p.commodityId !== pendingLoadNav.cmdtyId) return;
      pendingLoadNav = null;
      ctx.bus.emit('audio:cue', { id: 'ui_deny' });
      setFooterText(footer, 'Route load failed: ' + tradeFailureText(p.reason) + '; nav unchanged.');
    });
  }

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
        const ok = await confirmMarketPurchase(ctx, stationId, cmdtyId, qty);
        if (!ok) return;
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

  // The list of commodities to display for the active station. UX-3: applies the search filter and
  // the chosen sort (name / owned / buy / sell / category fallback). Live prices + owned quantities
  // are read here so sorting by them reflects the current market state, not a stale snapshot.
  function commodityRowsFor(stationId) {
    const state = ctx.state;
    const out = [];
    const q = (_filter.q || '').trim().toLowerCase();
    for (const c of COMMODITIES) {
      if (!stationTrades(state, stationId, c.id)) continue;
      if (q) {
        const hay = (c.name + ' ' + (c.category || '') + ' ' + (c.id || '')).toLowerCase();
        if (!hay.includes(q)) continue;
      }
      out.push(c);
    }
    const dir = _sort.dir === 'desc' ? -1 : 1;
    const byName = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    switch (_sort.key) {
      case 'name': out.sort((a, b) => dir * byName(a, b)); break;
      case 'owned': out.sort((a, b) => dir * ((state.player.cargo.items[a.id] || 0) - (state.player.cargo.items[b.id] || 0)) || byName(a, b)); break;
      case 'buy': out.sort((a, b) => dir * ((unitPrice(ctx, stationId, a.id, 'buy') || 0) - (unitPrice(ctx, stationId, b.id, 'buy') || 0)) || byName(a, b)); break;
      case 'sell': out.sort((a, b) => dir * ((unitPrice(ctx, stationId, a.id, 'sell') || 0) - (unitPrice(ctx, stationId, b.id, 'sell') || 0)) || byName(a, b)); break;
      default: out.sort((a, b) => dir * ((a.category < b.category ? -1 : a.category > b.category ? 1 : byName(a, b)))); break;
    }
    return out;
  }

  // Build the row DOM once per (re)build; subsequent refreshes update prices/owned in place.
  function rebuild() {
    const state = ctx.state;
    const stationId = panel.stationId;
    // UX-3: refresh the sort-header active state + arrows for the current sort key/dir.
    tableHead.querySelectorAll('.sf-sort').forEach((el) => {
      const isActive = el.getAttribute('data-sk') === _sort.key;
      el.classList.toggle('active', isActive);
      el.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      el.setAttribute('aria-label', sortHeaderAria(el.getAttribute('data-label') || '', isActive, _sort.dir));
      const arrow = el.querySelector('.sf-sort__arrow');
      if (arrow) arrow.textContent = isActive ? (_sort.dir === 'asc' ? '▲' : '▼') : '↕';
    });
    const frag = document.createDocumentFragment();
    panel._rowEls = Object.create(null);
    for (const c of commodityRowsFor(stationId)) {
      const row = document.createElement('div');
      row.className = 'st-row';
      row.setAttribute('data-cmdty', c.id);
      const legalTag = c.legality !== 'legal'
        ? ' <span class="st-tag st-tag-' + escapeHtml(c.legality) + '">' + escapeHtml(c.legality) + '</span>' : '';
      row.innerHTML =
        '<span class="c-name">' + escapeHtml(c.name) + legalTag +
          '<canvas class="st-spark" width="56" height="14" title="Recent price trend"></canvas>' +
          '<span class="st-slotline st-cmdty-purpose">' + escapeHtml(commodityPurpose(c)) + '</span>' +
          '<span class="st-slotline st-market-mission-line"></span>' +
        '</span>' +
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
    // UX-3/5: empty state. Distinguish "your search matched nothing" from "this station genuinely
    // trades nothing in this category" so the player understands the station's trade identity.
    if (!frag.childElementCount) {
      const empty = document.createElement('div');
      empty.className = 'st-empty';
      if (_filter.q) {
        empty.textContent = 'No commodities match "' + _filter.q + '".';
      } else {
        // The station trades SOMETHING (roleFor produced/consumed), but maybe nothing yet — surface
        // the station type so the player knows what this place deals in.
        const type = stationTypeFor(ctx.state, stationId).replace('_', ' ');
        empty.textContent = type
          ? 'No active market listings here yet. This ' + type + ' deals in goods matching its role.'
          : 'No commodities traded here.';
      }
      list.appendChild(empty);
    } else {
      list.appendChild(frag);
    }
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
    const purposeText = purpose.querySelector('.st-market-purpose-text');
    if (purposeText) purposeText.textContent = stationMarketPurpose(state, stationId);
    const missionInfo = trackedMarketMission(state, stationId);
    renderMissionCallout(missionInfo);
    renderRouteCallout(activeTradeRoute(state, stationId));
    refreshPlanner(state, stationId);
    if (!panel._rowEls) return;
    for (const cmdtyId in panel._rowEls) {
      const row = panel._rowEls[cmdtyId];
      const missionMatch = missionInfo && missionInfo.cmdtyId === cmdtyId;
      row.classList.toggle('tracked-mission', !!missionMatch);
      const missionLine = row.querySelector('.st-market-mission-line');
      if (missionLine) {
        missionLine.textContent = missionMatch ? trackedMarketActionText(missionInfo) : '';
        missionLine.hidden = !missionMatch;
      }
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
      // UX-4: real price-trend sparkline (session history from priceHistory.js, not basePrice heat).
      const spark = row.querySelector('.st-spark');
      if (spark) drawSparkline(spark, getPriceHistory(stationId, cmdtyId));
      const buyBtn = row.querySelector('.st-buy-btn');
      const sellBtn = row.querySelector('.st-sell-btn');
      // buy disabled if can't afford even 1 unit or cargo full; sell disabled if own nothing.
      const vol = def && def.volPerU > 0 ? def.volPerU : 1;
      const freeVolume = Math.max(0, (p.cargo.capVolume || 0) - (p.cargo.usedVolume || 0));
      const room = freeVolume >= vol;
      const maxBuy = maxBuyable(ctx, stationId, cmdtyId);
      const buyQty = selectedQtyFor(qtyState[cmdtyId] || 1, maxBuy);
      const sellQty = selectedQtyFor(qtyState[cmdtyId] || 1, owned);
      const buyTotal = buyP * buyQty;
      const sellTotal = sellP * sellQty;
      const selectedFits = (buyQty * vol) <= freeVolume + 1e-6;
      const canBuySelected = buyQty > 0 && buyQty <= maxBuy && buyTotal <= (p.credits || 0) && selectedFits;
      const canSellSelected = sellQty > 0 && sellQty <= owned;
      buyBtn.disabled = !canBuySelected;
      sellBtn.disabled = !canSellSelected;
      const cName = def ? def.name : cmdtyId;
      const purposeLine = def ? commodityPurpose(def) : 'Trade cargo for credits or objectives.';
      const buyTitle = buyBtn.disabled
        ? (!room ? 'No cargo room for ' + cName + '. Sell cargo, refit cargo modules, or buy a larger hull.' :
          (buyQty > maxBuy ? 'Selected quantity exceeds current credits or cargo room. Pick Max or a smaller amount.' :
            'Need ' + fmtCr(Math.max(buyP, buyTotal)) + ' CR for the selected ' + cName + ' purchase.'))
        : 'Buy ' + buyQty + ' ' + cName + ' for ' + fmtCr(buyTotal) + ' CR, using about ' + fmtCr(buyQty * vol) + 'u cargo. ' + purposeLine;
      const sellTitle = sellBtn.disabled
        ? (owned <= 0 ? 'You do not own any ' + cName + ' to sell here.' : 'Selected quantity exceeds the ' + owned + ' ' + cName + ' you own. Pick Max or a smaller amount.')
        : 'Sell ' + sellQty + ' ' + cName + ' for about ' + fmtCr(sellTotal) + ' CR. Use proceeds for missions, hulls, modules, repairs, and fuel.';
      buyBtn.title = buyTitle;
      sellBtn.title = sellTitle;
      buyBtn.setAttribute('aria-label', buyTitle);
      sellBtn.setAttribute('aria-label', sellTitle);
    }
  }

  function renderMissionCallout(info) {
    if (!info) {
      missionCallout.hidden = true;
      missionCallout.innerHTML = '';
      return;
    }
    const title = info.mission.title || 'Tracked contract';
    missionCallout.hidden = false;
    missionCallout.innerHTML =
      '<div class="st-market-mission-label mono">TRACKED CONTRACT</div>' +
      '<div class="st-market-mission-title">' + escapeHtml(title) + '</div>' +
      '<div class="st-market-mission-body">' + escapeHtml(trackedMarketActionText(info)) + '</div>' +
      '<div class="st-market-mission-meta mono">' +
        escapeHtml(info.cmdtyName) + ' · hold ' + fmtCr(info.owned) + 'u / target ' + fmtCr(info.remaining) + 'u' +
      '</div>';
  }

  function renderRouteCallout(info) {
    if (!info) {
      routeCallout.hidden = true;
      routeCallout.innerHTML = '';
      return;
    }
    const sellP = unitPrice(ctx, panel.stationId, info.cmdtyId, 'sell') || 0;
    const gross = Math.round(sellP * info.owned);
    const canSell = info.owned > 0;
    const routeSellTitle = canSell
      ? 'Sell ' + fmtCr(info.owned) + 'u ' + info.cmdtyName + ' here for about ' + fmtCr(gross) + ' CR and clear the completed trade waypoint.'
      : 'No ' + info.cmdtyName + ' is aboard for this trade route.';
    routeCallout.hidden = false;
    routeCallout.innerHTML =
      '<div class="st-market-route-label mono">TRADE ROUTE DESTINATION</div>' +
      '<div class="st-market-route-title">' + escapeHtml(info.destination) + '</div>' +
      '<div class="st-market-route-body">' +
        (canSell
          ? 'Route cargo is aboard: sell ' + fmtCr(info.owned) + 'u ' + escapeHtml(info.cmdtyName) + ' here for about ' + fmtCr(gross) + ' CR.'
          : 'Route nav is set here, but no ' + escapeHtml(info.cmdtyName) + ' is aboard.') +
      '</div>' +
      '<div class="st-market-route-actions">' +
        '<span class="st-market-route-meta mono">' + escapeHtml(info.reason) + '</span>' +
        '<button data-act="route-sell" data-cmdty="' + escapeHtml(info.cmdtyId) + '" title="' + escapeHtml(routeSellTitle) + '" aria-label="' + escapeHtml(routeSellTitle) + '"' + (canSell ? '' : ' disabled') + '>Sell Route Cargo</button>' +
      '</div>';
  }

  // Render the trade-route planner (best buy→sell margins from market intel).
  function refreshPlanner(state, stationId) {
    const trades = computeBestTrades(state, stationId);
    plannerList.textContent = '';
    if (!trades.length) {
      plannerList.innerHTML = '<div class="st-planner-empty">No profitable routes known yet — visit other stations, check a trade hub, or let market intel refresh.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const t of trades) {
      const row = document.createElement('div');
      row.className = 'st-planner-row';
      const pct = Math.round((t.margin / t.buyHere) * 100);
      const runBlocked = t.loadUnits <= 0;
      const runLabel = runBlocked
        ? t.loadReason
        : 'load ' + fmtCr(t.loadUnits) + ' · +' + fmtCr(t.loadProfit) + ' CR';
      const intelLabel = t.intelLabel || describeTradeIntel(state, t);
      row.title = runBlocked
        ? 'Profitable route, but you cannot load this cargo right now: ' + t.loadReason + '. ' + intelLabel + '.'
        : 'Current run estimate: buy ' + t.loadUnits + ' for ' + fmtCr(t.loadCost) + ' CR, hold ' + fmtCr(t.loadVolume) + 'u, expected gross profit +' + fmtCr(t.loadProfit) + ' CR. ' + intelLabel + '.';
      row.innerHTML =
        '<span class="st-pl-cmdty">' + escapeHtml(t.cmdtyName) + '</span>' +
        '<span class="st-pl-prices mono">buy ' + fmtCr(t.buyHere) + ' → sell ' + fmtCr(t.sellThere) + '</span>' +
        '<span class="st-pl-margin st-pl-up">+' + fmtCr(t.margin) + '/u (' + pct + '%)</span>' +
        '<span class="st-pl-run ' + (runBlocked ? 'st-pl-run--blocked' : 'st-pl-run--ok') + '">' + escapeHtml(runLabel) + '</span>' +
        '<span class="st-pl-dest">' + escapeHtml(stationName(state, t.destStation)) + '<b class="st-pl-intel mono">' + escapeHtml(intelLabel) + '</b></span>' +
        (runBlocked ? '' :
          '<button class="st-pl-load" data-act="load-nav" data-station="' + escapeHtml(t.destStation) +
          '" data-cmdty="' + escapeHtml(t.cmdtyId) + '" data-qty="' + t.loadUnits +
          '" title="Buy this route load and set nav to the buyer">Load &amp; Nav</button>') +
        '<button class="st-pl-nav" data-act="nav" data-station="' + escapeHtml(t.destStation) + '" data-cmdty="' + escapeHtml(t.cmdtyId) + '">Set Nav</button>';
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
  const info = stationInfoFor(state, stationId);
  return (info && info.name) || stationId || 'Station';
}

function stationSectorInfo(state, stationId) {
  const world = (state && state.world) || {};
  const currentSectorId = world.currentSectorId;
  const currentSector = currentSectorId && world.sectors && world.sectors[currentSectorId];
  const active = world.activeSector && (world.activeSector.stations || []).find((x) => stationRecordId(x) === stationId);
  if (active && currentSectorId) return { id: currentSectorId, name: (currentSector && (currentSector.name || currentSector.id)) || currentSectorId };
  for (const s of (world.sectors ? Object.values(world.sectors) : [])) {
    const stn = (s.stations || []).find((x) => stationRecordId(x) === stationId);
    if (stn) return { id: s.id || null, name: s.name || s.id || null };
  }
  return { id: null, name: null };
}

/** Set a navigation waypoint to a destination station so the HUD arrow steers toward it. */
export function applyTradeNavigation(ctx, stationId, cmdtyId) {
  const state = ctx.state;
  state.nav = state.nav || {};
  // resolve the destination's world position: prefer a live station entity in this sector
  let pos = null;
  let liveStation = null;
  for (const e of (state.entityList || [])) {
    if (e.type === 'station' && e.data && e.data.stationId === stationId) {
      liveStation = e;
      pos = { x: e.pos.x, z: e.pos.z };
      break;
    }
  }
  const cmdty = COMMODITY_BY_ID.get(cmdtyId);
  const sector = stationSectorInfo(state, stationId);
  const currentSectorId = state.world && state.world.currentSectorId;
  const currentSector = currentSectorId && state.world && state.world.sectors && state.world.sectors[currentSectorId];
  const sectorId = sector.id || (liveStation ? currentSectorId : null);
  const sectorName = sector.name || (liveStation && currentSector ? (currentSector.name || currentSector.id) : null);
  const waypoint = {
    kind: 'trade',
    stationId,
    commodityId: cmdtyId,
    pos: pos || null,
    label: stationName(state, stationId) + (cmdty ? ' · ' + cmdty.name : ''),
    reason: cmdty ? `Sell ${cmdty.name}` : 'Trade destination',
    sectorId,
    sectorName,
  };
  state.nav.waypoint = waypoint;
  ctx.bus.emit('nav:waypoint', waypoint);
  if (waypoint.sectorId && currentSectorId && waypoint.sectorId !== currentSectorId) {
    ctx.bus.emit('ui:setCourse', { sectorId: waypoint.sectorId, waypointKind: 'trade', stationId, commodityId: cmdtyId });
  }
  ctx.bus.emit('toast', { text: 'Nav set: ' + waypoint.label + (pos ? '' : ' (in another sector — undock & jump)'), kind: 'info', ttl: 3 });
  ctx.bus.emit('audio:cue', { id: 'ui_click' });
}

function tradeRunCapacity(state, def, buyHere, margin) {
  const player = (state && state.player) || {};
  const cargo = player.cargo || {};
  const credits = Math.max(0, Number(player.credits) || 0);
  const cap = Math.max(0, Number(cargo.capVolume) || 0);
  const used = Math.max(0, Number(cargo.usedVolume) || 0);
  const freeVolume = Math.max(0, cap - used);
  const vol = def && def.volPerU > 0 ? def.volPerU : 1;
  const holdUnits = Math.max(0, Math.floor(freeVolume / vol));
  const affordableUnits = buyHere > 0 ? Math.max(0, Math.floor(credits / buyHere)) : 0;
  const loadUnits = Math.max(0, Math.min(holdUnits, affordableUnits));
  let loadReason = 'no load available';
  if (loadUnits <= 0) {
    if (freeVolume < vol) loadReason = 'hold full';
    else if (credits < buyHere) loadReason = 'need ' + fmtCr(buyHere) + ' CR/u';
  }
  return {
    holdUnits,
    affordableUnits,
    loadUnits,
    loadCost: Math.round(loadUnits * buyHere),
    loadProfit: Math.round(loadUnits * margin),
    loadVolume: Math.round(loadUnits * vol * 10) / 10,
    loadReason,
  };
}

function knownMarketSnapshots(state) {
  const econ = state && state.economy;
  const out = Object.create(null);
  const intel = econ && econ.marketIntel;
  if (intel) {
    for (const sid in intel) {
      if (intel[sid] && intel[sid].snapshot) out[sid] = { ...intel[sid], intelSource: 'scanned' };
    }
  }
  const markets = econ && econ.markets;
  if (markets) {
    for (const sid in markets) {
      if (out[sid]) continue;
      const market = markets[sid];
      const snapshot = {};
      for (const cid in market || {}) {
        const e = market[cid];
        if (!e) continue;
        snapshot[cid] = { mid: e.lastMid, buy: e.lastBuy, sell: e.lastSell, stock: e.stock, role: e.role };
      }
      out[sid] = { snapshot, seenAtT: (state && state.simTime) || 0, intelSource: 'market' };
    }
  }
  return out;
}

export function describeTradeIntel(state, trade) {
  if (!trade) return 'unknown intel';
  if (trade.intelSource === 'market') return 'market feed';
  const now = Math.max(0, Number(state && state.simTime) || 0);
  const seen = Math.max(0, Number(trade.seenAtT != null ? trade.seenAtT : trade.age) || 0);
  const ageS = Math.max(0, now - seen);
  if (ageS < 120) return 'fresh intel';
  const minutes = Math.max(1, Math.round(ageS / 60));
  return (minutes >= 15 ? 'stale ' : '') + minutes + 'm intel';
}

/** Build the ranked "Best Trades" list: for each commodity traded HERE, find the best known
 *  SELL price across marketIntel snapshots, compute the player-loadable profit and per-volume
 *  margin, and rank. */
export function computeBestTrades(state, hereStationId) {
  const hereMarket = state.economy && state.economy.markets && state.economy.markets[hereStationId];
  if (!hereMarket) return [];
  const knownMarkets = knownMarketSnapshots(state);
  const out = [];
  for (const cmdtyId in hereMarket) {
    const entry = hereMarket[cmdtyId];
    if (!entry || entry.lastBuy == null) continue;
    const def = COMMODITY_BY_ID.get(cmdtyId);
    if (!def) continue;
    const vol = def.volPerU > 0 ? def.volPerU : 1;
    const buyHere = entry.lastBuy;
    // scan all known stations' snapshots for the best sell price
    let bestSell = -1, bestStation = null, bestSeen = 0, bestSource = 'unknown';
    for (const sid in knownMarkets) {
      if (sid === hereStationId) continue;
      const known = knownMarkets[sid];
      const snap = known.snapshot || {};
      const s = snap[cmdtyId];
      if (!s || s.sell == null) continue;
      if (s.sell > bestSell) {
        bestSell = s.sell;
        bestStation = sid;
        bestSeen = known.seenAtT || 0;
        bestSource = known.intelSource || 'unknown';
      }
    }
    if (!bestStation || bestSell <= buyHere) continue;
    const margin = bestSell - buyHere;
    const perVol = margin / vol;   // rank by profit per cargo-volume (what a hauler cares about)
    const trade = {
      cmdtyId,
      cmdtyName: def.name,
      buyHere,
      sellThere: bestSell,
      margin,
      perVol,
      destStation: bestStation,
      age: bestSeen,
      seenAtT: bestSeen,
      intelSource: bestSource,
      ...tradeRunCapacity(state, def, buyHere, margin),
    };
    trade.intelLabel = describeTradeIntel(state, trade);
    out.push(trade);
  }
  out.sort((a, b) => (b.loadProfit - a.loadProfit) || (b.perVol - a.perVol));
  return out.slice(0, 5); // top 5
}
