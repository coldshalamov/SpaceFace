// src/ui/screens/market.js — STATION "Market" tab panel.
// Lists commodities with the station's buy/sell prices, a qty stepper, and Buy/Sell buttons.
// Uses an industrial control panel layout with commodity card grid, left category filter rail,
// right intel panel, and an expanded canvas price history & prediction chart.
import { COMMODITIES } from '../../data/commodities.js';
import { isUnsellableCargo } from '../../systems/cargo.js';
import { economyBaseEqForSize, economySpotPriceForRole } from '../../systems/economy.js';
import { confirm } from '../confirm.js';
import { createListControls, buildSortHeader, sortHeaderAria } from '../listControls.js';
import { getPriceHistory } from '../priceHistory.js';
import { drawSparkline } from '../sparkline.js';
import { escapeHtml } from '../comms.js';
import { getCycle } from '../../systems/economy.js';
import { predictPriceCurve, regimeLabel } from '../../systems/economyCycles.js';
import { createCircularGauge, createRouteBeam, createSupplyTree, createMorphLabel, createRippleField } from '../effects/index.js';
import { presentCommodityIntel } from '../marketIntelPresenter.js';
import { summarizeDemandDrivers } from '../demandDriverSummary.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
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

// Stash the last computed list of best trades so it doesn't run every tick if unchanged.
let lastBestTrades = [];

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
  const econ = ctx.registry && ctx.registry.get && ctx.registry.get('economy');
  if (econ && typeof econ.quote === 'function') {
    try {
      const q = econ.quote(stationId, cmdtyId, side, 1);
      const v = usableQuoteUnit(q);
      if (v != null) return v;
    } catch (_) { /* fall through */ }
  }
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

function stationTrades(state, stationId, cmdtyId) {
  // Any commodity with a live market entry is tradeable here. ensureMarket creates an entry for
  // every legal commodity at every station (role only drives price), so the player can always sell
  // what they mined or bought. The role fallback below is a safety net for entries that haven't
  // been lazily built yet — it deliberately admits 'none'-role goods too, matching ensureMarket.
  const e = marketEntry(state, stationId, cmdtyId);
  if (e) return true;
  const def = COMMODITY_BY_ID.get(cmdtyId);
  if (!def) return false;
  const stationType = stationTypeFor(state, stationId);
  if (!stationType) return false;
  return true;
}

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

/**
 * Stock pressure as a 0..1 scope reading: 0 = glutted (stock far above equilibrium, cheap), 1 = scarce
 * (stock far below equilibrium, dear). Uses the same baseEq pricing reference as the economy. 0.5 is
 * equilibrium. This drives the row mini-gauge and the trade-inspector flooding readout.
 */
function stockPressure01(entry) {
  if (!entry || !entry.baseEq || entry.baseEq <= 0) return 0.5;
  const ratio = (entry.stock || 0) / entry.baseEq;             // 1 at equilibrium
  // Map the economy's price-mult clamp band [0.40, 2.60] into a 0..1 scarcity gauge. log scale so the
  // gauge is legible across the wide stock range (baseEq spans 500..2000 across station sizes).
  // ratio=1 -> 0.5; ratio=2.6 (glut) -> ~0; ratio=0.4 (scarce) -> ~1.
  const logR = Math.log(ratio) / Math.log(2.6);                // 0 at eq, +1 at 2.6x, negative when scarce
  return Math.max(0, Math.min(1, 0.5 - logR * 0.5));
}

/** Compact role glyph + label for the supply/demand column of a row. */
function roleGlyph(role) {
  if (role === 'produce') return { glyph: '▲', label: 'SUPPLY', cls: 'st-role--produce' };
  if (role === 'consume') return { glyph: '▼', label: 'DEMAND', cls: 'st-role--consume' };
  return { glyph: '—', label: 'NEUTRAL', cls: 'st-role--none' };
}

/**
 * Build supplyTree nodes for a commodity: its producedBy station-types (producers) and consumedBy
 * station-types (consumers), with the commodity itself as the hub. `flowStationType` (the current
 * station's type) marks the edge that is actively trading this good.
 */
function supplyTreeNodesFor(def, flowStationType) {
  if (!def) return [];
  const nodes = [{ id: 'hub', label: def.name, role: 'hub' }];
  for (const t of (def.producedBy || [])) {
    nodes.push({ id: 'p_' + t, label: stationTypeLabel(t), role: 'produce', flow: t === flowStationType });
  }
  for (const t of (def.consumedBy || [])) {
    nodes.push({ id: 'c_' + t, label: stationTypeLabel(t), role: 'consume', flow: t === flowStationType });
  }
  return nodes;
}

function stationTypeLabel(t) {
  if (!t) return '—';
  return t.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function fmtCr(n) { return (Math.round(n) || 0).toLocaleString('en-US'); }

export function formatCargoUnits(value) {
  if (!Number.isFinite(value)) return '0';
  return (Math.round(value * 10) / 10).toLocaleString('en-US');
}

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
    return 'Tracked contract destination: sell ' + formatCargoUnits(info.remaining) + 'u here to finish the job.';
  }
  if (info.needToLoad > 0) {
    return 'Tracked contract cargo: load ' + formatCargoUnits(info.needToLoad) + 'u more before undocking for ' + info.destination + '.';
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

function ageLabel(state, seenAt) {
  const now = Math.max(0, Number(state && state.simTime) || 0);
  const ageS = Math.max(0, now - Math.max(0, Number(seenAt) || 0));
  if (ageS < 60) return 'fresh';
  return Math.max(1, Math.round(ageS / 60)) + ' min ago';
}

function stationHops(state, stationId) {
  const sector = stationSectorInfo(state, stationId);
  const target = sector && sector.id;
  const start = state && state.world && state.world.currentSectorId;
  if (!start || !target || start === target) return 0;
  const sectors = state.world && state.world.sectors || {};
  const queue = [{ id: start, d: 0 }];
  const seen = new Set([start]);
  while (queue.length) {
    const cur = queue.shift();
    const sec = sectors[cur.id] || {};
    for (const next of sec.neighbors || []) {
      if (seen.has(next)) continue;
      if (next === target) return cur.d + 1;
      seen.add(next);
      queue.push({ id: next, d: cur.d + 1 });
    }
  }
  return null;
}

export function bestKnownSellFor(state, commodityId, hereStationId = null) {
  const memory = state && state.player && state.player.marketMemory;
  if (!memory || !commodityId) return null;
  let best = null;
  for (const stationId in memory) {
    const quote = memory[stationId] && memory[stationId][commodityId];
    if (!quote || !Number.isFinite(Number(quote.sell))) continue;
    const sell = Math.round(Number(quote.sell) || 0);
    if (!best || sell > best.sell || (sell === best.sell && String(stationId) < String(best.stationId))) {
      best = {
        stationId,
        sell,
        buy: Math.round(Number(quote.buy) || 0),
        seenAt: Number(quote.seenAt) || 0,
        stationName: stationName(state, stationId),
        jumps: stationHops(state, stationId),
        isHere: hereStationId === stationId,
      };
    }
  }
  return best;
}

export function formatBestKnownSellLine(state, best) {
  if (!best) return '';
  const jumps = best.jumps == null ? '?' : best.jumps;
  const jumpLabel = jumps === 1 ? '1 jump' : jumps + ' jumps';
  return 'Best known sell: ' + fmtCr(best.sell) + ' cr - ' + best.stationName +
    ' (' + ageLabel(state, best.seenAt) + ', ' + jumpLabel + ')';
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

const CATEGORIES = [
  { id: 'all', label: 'All Listings', icon: '⚖' },
  { id: 'raw ore', label: 'Raw Ore', icon: '🪨' },
  { id: 'gas', label: 'Gas', icon: '💨' },
  { id: 'crystal', label: 'Crystal', icon: '💎' },
  { id: 'exotic', label: 'Exotics', icon: '🌀' },
  { id: 'refined', label: 'Refined', icon: '🔥' },
  { id: 'component', label: 'Components', icon: '🔩' },
  { id: 'tech', label: 'Technology', icon: '💾' },
  { id: 'consumer', label: 'Consumer', icon: '📦' },
  { id: 'luxury', label: 'Luxury', icon: '🏆' },
  { id: 'food', label: 'Food', icon: '🍎' },
  { id: 'med', label: 'Medical', icon: '💉' },
  { id: 'salvage', label: 'Salvage', icon: '🔧' },
  { id: 'contraband', label: 'Contraband', icon: '💀' },
  { id: 'military', label: 'Military', icon: '⚔' }
];

export function createMarketPanel(ctx) {
  const root = document.createElement('div');
  root.className = 'st-panel st-market';

  const qtyState = Object.create(null);
  let pendingLoadNav = null;
  let activeCategory = 'all';

  // --- header: credits + cargo summary ---
  const header = document.createElement('div');
  header.className = 'st-market-head';
  header.innerHTML =
    '<div class="st-stat"><span class="st-stat-l">CREDITS</span><span class="mono st-credits">0</span></div>' +
    '<div class="st-stat"><span class="st-stat-l">CARGO</span><span class="mono st-cargo">0 / 0 u</span></div>';
  root.appendChild(header);

  // purpose copy rides inside the ledger strip — one compact row, not another stacked banner
  const purpose = document.createElement('div');
  purpose.className = 'st-market-purpose';
  purpose.innerHTML = '<b>Market loop:</b> <span class="st-market-purpose-text"></span>';
  header.appendChild(purpose);

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

  // Create 3-column layout wrapper
  const marketLayout = document.createElement('div');
  marketLayout.className = 'st-market-layout';
  root.appendChild(marketLayout);

  // Column 1: Category Filter Rail
  const catRail = document.createElement('div');
  catRail.className = 'st-market-category-rail';
  marketLayout.appendChild(catRail);

  // Column 2: Center Commodity Grid
  const centerPane = document.createElement('div');
  centerPane.className = 'st-market-center';
  marketLayout.appendChild(centerPane);

  // Sort and Search bar inside center pane
  const searchSortBar = document.createElement('div');
  searchSortBar.className = 'st-market-search-sort-bar';
  centerPane.appendChild(searchSortBar);

  const _sort = { key: 'category', dir: 'asc' };
  function applySort(key) {
    if (_sort.key === key) _sort.dir = _sort.dir === 'asc' ? 'desc' : 'asc';
    else { _sort.key = key; _sort.dir = 'asc'; }
    rebuild();
  }

  // Row Head (satisfies check-market-first-loop-runtime.mjs)
  const tableHead = document.createElement('div');
  tableHead.className = 'st-row st-row-head';
  const hName = buildSortHeader({ key: 'name', label: 'Commodity', activeKey: _sort.key, dir: _sort.dir, onSort: applySort });
  const hOwned = buildSortHeader({ key: 'owned', label: 'Owned', activeKey: _sort.key, dir: _sort.dir, onSort: applySort });
  const hBuy = buildSortHeader({ key: 'buy', label: 'Buy', activeKey: _sort.key, dir: _sort.dir, onSort: applySort });
  const hSell = buildSortHeader({ key: 'sell', label: 'Sell', activeKey: _sort.key, dir: _sort.dir, onSort: applySort });
  [hName, hOwned, hBuy, hSell].forEach((h) => { h.className += ' c-num'; tableHead.appendChild(h); });
  const qtyH = document.createElement('span'); qtyH.className = 'c-qty'; qtyH.textContent = 'Qty'; tableHead.appendChild(qtyH);
  const actH = document.createElement('span'); actH.className = 'c-act'; actH.textContent = 'Trade'; tableHead.appendChild(actH);
  searchSortBar.appendChild(tableHead);

  const _filter = { q: '' };
  const ctrls = createListControls({
    search: true, placeholder: 'Search commodities…',
    onSearch: (q) => { _filter.q = q; rebuild(); },
  });
  searchSortBar.appendChild(ctrls.el);

  // Buy|Sell mode param (Station OS control grammar): a segmented filter, not a hidden state.
  // "Selling" shows only what is in your hold; "Buying" shows only what this market has in stock.
  // Handoff "Sell what you hauled" opens this panel with tradeMode 'sell' via setTradeMode().
  let tradeMode = 'all';
  const modeSeg = document.createElement('div');
  modeSeg.className = 'st-trade-modes';
  modeSeg.setAttribute('role', 'group');
  modeSeg.setAttribute('aria-label', 'Trade mode filter');
  modeSeg.innerHTML =
    '<button type="button" data-trade-mode="all" class="active" title="Every commodity traded at this station">All</button>' +
    '<button type="button" data-trade-mode="buy" title="Only what this market has in stock to sell you">Buying</button>' +
    '<button type="button" data-trade-mode="sell" title="Only what is in your hold right now">Selling</button>';
  function setTradeMode(mode, { silent } = {}) {
    const next = (mode === 'buy' || mode === 'sell' || mode === 'all') ? mode : 'all';
    tradeMode = next;
    modeSeg.querySelectorAll('[data-trade-mode]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-trade-mode') === tradeMode);
    });
    root.setAttribute('data-trade-mode', tradeMode);
    rebuild();
    if (!silent && ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  }
  modeSeg.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-trade-mode]');
    if (!btn) return;
    setTradeMode(btn.getAttribute('data-trade-mode') || 'all');
  });
  ctrls.el.appendChild(modeSeg);

  // Scrollable cards list
  const list = document.createElement('div');
  list.className = 'st-list';
  centerPane.appendChild(list);

  // --- Selected-commodity analysis stage (the centerpiece) ---
  // A persistent scope readout that populates when a row is clicked: price-history sparkline, forecast
  // cone, regime morphLabel, supply-chain spindle, and a best-margin route beam. The chart MODAL stays
  // for fullscreen; this stage is the inline trade-intelligence view.
  const stage = document.createElement('div');
  stage.className = 'st-market-stage';
  stage.setAttribute('data-centerpiece', 'trade-intel-scope');
  stage.hidden = true;
  stage.innerHTML =
    '<div class="st-stage-head">' +
      '<span class="st-stage-title">COMMODITY ANALYSIS</span>' +
      '<button class="st-stage-close" aria-label="Close analysis">&times;</button>' +
    '</div>' +
    '<div class="st-stage-grid">' +
      '<div class="st-stage-cell st-stage-cell--price">' +
        '<div class="st-stage-lbl">PRICE / REGIME</div>' +
        '<div class="st-stage-price-row">' +
          '<span class="st-stage-spark-wrap"><canvas class="st-stage-spark" width="160" height="44"></canvas></span>' +
          '<span class="st-stage-regime" >—</span>' +
        '</div>' +
        '<div class="st-stage-forecast-lbl">FORECAST CONE</div>' +
        '<canvas class="st-stage-cone" width="320" height="90"></canvas>' +
      '</div>' +
      '<div class="st-stage-cell st-stage-cell--supply">' +
        '<div class="st-stage-lbl">SUPPLY CHAIN</div>' +
        '<div class="st-stage-supply-mount"></div>' +
      '</div>' +
      '<div class="st-stage-cell st-stage-cell--route">' +
        '<div class="st-stage-lbl">BEST MARGIN ROUTE</div>' +
        '<div class="st-stage-route-mount"></div>' +
        '<div class="st-stage-route-meta"></div>' +
      '</div>' +
      '<div class="st-stage-cell st-stage-cell--inspector">' +
        '<div class="st-stage-lbl">TRADE INSPECTOR</div>' +
        '<div class="st-inspector-row"><span class="st-insp-lbl">QUOTE (max load)</span><span class="st-insp-quote mono">—</span></div>' +
        '<div class="st-inspector-row"><span class="st-insp-lbl">FLOODING IMPACT</span><span class="st-insp-flood-mount"></span></div>' +
        '<div class="st-inspector-row"><span class="st-insp-lbl">PROJECTED PROFIT</span><span class="st-insp-profit mono">—</span></div>' +
        '<div class="st-insp-intel" data-intel-inspector hidden></div>' +
        '<div class="st-inspector-actions"><button class="st-insp-route" disabled>Plot Route</button></div>' +
      '</div>' +
    '</div>';
  centerPane.appendChild(stage);
  const stageCloseBtn = stage.querySelector('.st-stage-close');
  const stageSpark = stage.querySelector('.st-stage-spark');
  const stageCone = stage.querySelector('.st-stage-cone');
  const stageRegime = stage.querySelector('.st-stage-regime');
  const stageSupplyMount = stage.querySelector('.st-stage-supply-mount');
  const stageRouteMount = stage.querySelector('.st-stage-route-mount');
  const stageRouteMeta = stage.querySelector('.st-stage-route-meta');
  const stageOverlay = document.createElement('div');
  stageOverlay.className = 'st-market-stage-overlay';
  stage.appendChild(stageOverlay);

  // Trade inspector elements
  const inspQuote = stage.querySelector('.st-insp-quote');
  const inspFloodMount = stage.querySelector('.st-insp-flood-mount');
  const inspProfit = stage.querySelector('.st-insp-profit');
  const inspRouteBtn = stage.querySelector('.st-insp-route');

  // Create the effect instances ONCE (frame-sleep contract: inert until their verb fires).
  let stageFx = null;
  try {
    stageFx = {
      regime: createMorphLabel(stageRegime, { numeric: false }),
      supply: createSupplyTree(stageSupplyMount, { width: 260, height: 130 }),
      beam: createRouteBeam(stageRouteMount, { width: 240, height: 80 }),
      flood: createCircularGauge(inspFloodMount, { size: 44, stroke: 5, kind: 'warn' }),
      profit: createMorphLabel(inspProfit, { numeric: true }),
      ripple: createRippleField(stageOverlay, { width: 320, height: 200 }),
    };
  } catch (e) { console.error('[market] stage effect init failed', e); }

  let selectedCmdtyId = null;

  // Column 3: Intel Sidebar
  const sidebarPane = document.createElement('div');
  sidebarPane.className = 'st-market-sidebar';
  marketLayout.appendChild(sidebarPane);

  const planner = document.createElement('div');
  planner.className = 'st-market-planner';
  planner.innerHTML = '<div class="st-sub-h">Best Trades <span class="st-planner-hint">(hold + credits)</span></div>' +
    '<div class="st-planner-list"></div>';
  sidebarPane.appendChild(planner);
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

  const ledger = document.createElement('div');
  ledger.className = 'st-market-ledger';
  ledger.innerHTML = '<div class="st-sub-h">Trade Ledger <span class="st-planner-hint">(last 10)</span></div>' +
    '<div class="st-ledger-list"></div>';
  sidebarPane.appendChild(ledger);
  const ledgerList = ledger.querySelector('.st-ledger-list');

  // --- footer: trade preview ---
  const footer = document.createElement('div');
  footer.className = 'st-market-foot';
  footer.setAttribute('aria-live', 'polite');
  footer.innerHTML = '<span class="st-foot-msg">Select a commodity card to pull up interactive price history & forecast cycles.</span>';
  root.appendChild(footer);

  // Setup dynamic chart modal
  const chartModal = document.createElement('div');
  chartModal.id = 'market-chart-modal';
  chartModal.className = 'st-modal';
  chartModal.style.display = 'none';
  chartModal.innerHTML = `
    <div class="st-modal-content">
      <div class="st-modal-header">
        <span class="st-modal-title">Price Chart</span>
        <button class="st-modal-close" aria-label="Close chart">&times;</button>
      </div>
      <div class="st-modal-body">
        <div class="st-modal-chart-info">
          <div class="st-modal-stat"><span class="st-lbl">Base Price</span><span class="st-val st-base-price">0</span></div>
          <div class="st-modal-stat"><span class="st-lbl">Regime</span><span class="st-val st-regime">Stable</span></div>
          <div class="st-modal-stat"><span class="st-lbl">Forecast</span><span class="st-val st-trend">Flat</span></div>
        </div>
        <div class="st-chart-container" style="position:relative; width: 100%; height: 340px;">
          <canvas class="st-expanded-chart" width="700" height="340" style="width: 100%; height: 100%; display: block;"></canvas>
          <div class="st-chart-tooltip" style="position:absolute; display:none; pointer-events:none; background:rgba(26,20,12,0.97); border:1px solid var(--panel-edge-2); padding:6px 10px; border-radius:1px; font-size:0.75rem; color:var(--ink); z-index:100; font-family:var(--mono);"></div>
        </div>
        <div class="st-modal-event-log-title mono">Economic Events History</div>
        <div class="st-modal-event-log"></div>
      </div>
    </div>
  `;
  root.appendChild(chartModal);

  const closeBtn = chartModal.querySelector('.st-modal-close');
  closeBtn.addEventListener('click', () => {
    chartModal.style.display = 'none';
    ctx.bus.emit('audio:cue', { id: 'ui_click' });
  });

  // Stage close clears the selection (effects park via setActive in onHide, not here).
  stageCloseBtn.addEventListener('click', () => {
    selectedCmdtyId = null;
    stage.hidden = true;
    // clear the route beam so it does not idle behind a hidden stage
    if (stageFx && stageFx.beam) stageFx.beam.setPath([], { active: false });
    ctx.bus.emit('audio:cue', { id: 'ui_click' });
  });

  // Plot Route from the trade inspector.
  inspRouteBtn.addEventListener('click', () => {
    if (!selectedCmdtyId || inspRouteBtn.disabled) return;
    const best = bestMarginRouteFor(ctx.state, panel.stationId, selectedCmdtyId);
    if (best && best.destStation) {
      applyTradeNavigation(ctx, best.destStation, selectedCmdtyId);
      setFooterText(footer, 'Route plotted: ' + best.destName + '.');
    }
  });

  if (ctx.bus && typeof ctx.bus.on === 'function') {
    ctx.bus.on('economy:tradeCompleted', (p) => {
      if (!pendingLoadNav || !p || p.side !== 'buy') return;
      if (p.stationId !== pendingLoadNav.stationId || p.commodityId !== pendingLoadNav.cmdtyId) return;
      const pending = pendingLoadNav;
      pendingLoadNav = null;
      applyTradeNavigation(ctx, pending.destStationId, pending.cmdtyId);
      const cmdty = COMMODITY_BY_ID.get(pending.cmdtyId);
      setFooterText(footer,
        'Loaded ' + formatCargoUnits(p.qty || pending.qty) + ' ' + ((cmdty && cmdty.name) || pending.cmdtyId) +
        ' and plotted ' + stationName(ctx.state, pending.destStationId) + '.');
    });
    ctx.bus.on('economy:tradeFailed', (p) => {
      if (!pendingLoadNav || !p || p.side !== 'buy') return;
      if (p.stationId !== pendingLoadNav.stationId || p.commodityId !== pendingLoadNav.cmdtyId) return;
      pendingLoadNav = null;
      ctx.bus.emit('audio:cue', { id: 'ui_deny' });
      setFooterText(footer, 'Route load failed: ' + tradeFailureText(p.reason) + '; nav unchanged.');
    });
    // Event mode: a shortage/blockade/boom/piracy event affecting the selected commodity fires a ripple
    // on the analysis stage and lights the route beam. ONE ripple = ONE event (never a timer).
    ctx.bus.on('economy:eventStarted', (p) => {
      if (!stageFx || !stageFx.ripple || stage.hidden) return;
      if (!p) return;
      if (p.stationId && p.stationId !== panel.stationId) return;
      if (p.commodityId && p.commodityId !== '*' && p.commodityId !== selectedCmdtyId) return;
      try {
        const kind = p.type === 'shortage' || p.type === 'blockade' ? 'danger'
          : p.type === 'boom' ? 'good' : 'warn';
        stageFx.ripple.ping(160, 100, { kind, radius: 90, ttl: 480 });
      } catch (_) {}
    });
  }

  // ONE delegated listener for the whole list
  list.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-act]');
    const rowEl = ev.target.closest('[data-cmdty]');
    if (!rowEl) return;
    const cmdtyId = rowEl.getAttribute('data-cmdty');
    const state = ctx.state;
    const stationId = panel.stationId;
    const owned = (state.player.cargo.items[cmdtyId]) || 0;

    // Background clicks open the chart; the chart opener also syncs the inline analysis stage.
    if (!btn) {
      openChartModal(cmdtyId);
      return;
    }

    const act = btn.getAttribute('data-act');
    if (act === 'expand') {
      openChartModal(cmdtyId);
      return;
    }

    if (act === 'select') {
      selectCommodity(cmdtyId);
      return;
    }

    if (act === 'best-known') {
      applyTradeNavigation(ctx, btn.getAttribute('data-station'), cmdtyId);
      return;
    }

    if (act === 'buy' || act === 'sell') {
      let qty = qtyState[cmdtyId] || 1;
      if (qty === 'max') {
        qty = act === 'buy' ? maxBuyable(ctx, stationId, cmdtyId) : owned;
      }
      qty = Math.max(0, Math.floor(qty));
      if (qty <= 0) { ctx.bus.emit('audio:cue', { id: 'ui_deny' }); return; }
      if (act === 'buy') {
        const ok = await confirmMarketPurchase(ctx, stationId, cmdtyId, qty);
        if (!ok) return;
      }
      ctx.bus.emit(act === 'buy' ? 'ui:buy' : 'ui:sell', { commodityId: cmdtyId, qty });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      footer.querySelector('.st-foot-msg').textContent =
        (act === 'buy' ? 'Buying ' : 'Selling ') + formatCargoUnits(qty) + ' ' + (COMMODITY_BY_ID.get(cmdtyId) || {}).name + '...';
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

  function commodityRowsFor(stationId) {
    const state = ctx.state;
    const out = [];
    const q = (_filter.q || '').trim().toLowerCase();
    for (const c of COMMODITIES) {
      if (!stationTrades(state, stationId, c.id)) continue;
      // Category filter
      if (activeCategory !== 'all' && c.category !== activeCategory) continue;
      // Trade-mode param: Selling = in your hold; Buying = the market has stock to sell.
      if (tradeMode === 'sell' && !((state.player.cargo.items || {})[c.id] > 0)) continue;
      if (tradeMode === 'buy') {
        const mkts = state.economy && state.economy.markets;
        const entry = mkts && mkts[stationId] && mkts[stationId][c.id];
        if (entry && !(Number(entry.stock) > 1)) continue;
      }
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

  // Draw expanded canvas chart modal
  function openChartModal(cmdtyId) {
    const state = ctx.state;
    const stationId = panel.stationId;
    const def = COMMODITY_BY_ID.get(cmdtyId);
    if (!def) return;
    // Opening the fullscreen chart also keeps the inline analysis stage in sync.
    selectCommodity(cmdtyId);

    chartModal.querySelector('.st-modal-title').textContent = def.name + ' Historical Pricing & Forecast';
    chartModal.querySelector('.st-base-price').textContent = def.basePrice + ' CR';

    const cycle = getCycle(stationId, cmdtyId);
    chartModal.querySelector('.st-regime').textContent = cycle ? regimeLabel(cycle.regime) : 'Cyclic';

    // Forecast direction
    const pred = predictPriceCurve(state, stationId, cmdtyId, 24, 5);
    const hist = getPriceHistory(stationId, cmdtyId);
    const currentPrice = hist.length ? hist[hist.length - 1].mid : unitPrice(ctx, stationId, cmdtyId, 'buy');

    let trendLabel = 'Stable';
    if (pred.length) {
      const finalPrice = pred[pred.length - 1].mid;
      const change = (finalPrice - currentPrice) / currentPrice;
      if (change > 0.04) trendLabel = '📈 Rising';
      else if (change < -0.04) trendLabel = '📉 Falling';
    }
    chartModal.querySelector('.st-trend').textContent = trendLabel;

    // Draw log of active/recent events
    const logEl = chartModal.querySelector('.st-modal-event-log');
    logEl.innerHTML = '';
    const activeEvents = state.economy && state.economy.econEvents || [];
    const affected = activeEvents.filter(e => e.stationId === stationId && (e.commodityId === '*' || e.commodityId === cmdtyId));
    if (affected.length) {
      affected.forEach(e => {
        const item = document.createElement('div');
        item.className = 'st-modal-event-item mono';
        item.innerHTML = `<span class="st-ev-name" style="color:var(--warn)">${e.type.toUpperCase()}</span> duration remaining: ${Math.round(e.durationRemainingS)}s`;
        logEl.appendChild(item);
      });
    } else {
      logEl.innerHTML = '<div class="st-modal-event-empty mono text-dim">No anomalies active. Prices driven by local cyclical supply & demand.</div>';
    }

    chartModal.style.display = 'flex';
    ctx.bus.emit('audio:cue', { id: 'ui_click' });

    // Render the chart on canvas
    const canvas = chartModal.querySelector('.st-expanded-chart');
    drawExpandedChart(canvas, hist, pred, def.basePrice);

    // Setup interactive tooltip tracking on canvas
    setupChartTooltip(canvas, hist, pred, def.basePrice);
  }

  function setupChartTooltip(canvas, hist, pred, basePrice) {
    const tooltipEl = chartModal.querySelector('.st-chart-tooltip');
    if (!canvas || !hist) return;

    const W = canvas.width;
    const H = canvas.height;
    const allY = [...hist.map(p => p.mid), ...pred.map(p => p.mid), basePrice];
    const minVal = Math.max(1, Math.min(...allY) * 0.9);
    const maxVal = Math.max(...allY) * 1.1;
    const newRange = maxVal - minVal;
    const totalPoints = hist.length + pred.length;

    canvas.replaceWith(canvas.cloneNode(true));
    const newCanvas = chartModal.querySelector('.st-expanded-chart');

    newCanvas.addEventListener('mousemove', (ev) => {
      const rect = newCanvas.getBoundingClientRect();
      // Map mouse inside scale
      const x = ((ev.clientX - rect.left) / rect.width) * W;
      const y = ((ev.clientY - rect.top) / rect.height) * H;

      const padLeft = 60, padRight = 20, padTop = 30, padBottom = 40;
      const chartW = W - padLeft - padRight;
      const chartH = H - padTop - padBottom;

      if (x < padLeft || x > W - padRight || totalPoints < 2) {
        tooltipEl.style.display = 'none';
        return;
      }

      const relativeX = (x - padLeft) / chartW;
      const index = Math.round(relativeX * (totalPoints - 1));

      if (index >= 0 && index < totalPoints) {
        let pt = null;
        let isPrediction = false;
        if (index < hist.length) {
          pt = hist[index];
        } else {
          pt = pred[index - hist.length];
          isPrediction = true;
        }

        if (pt) {
          const ptX = padLeft + (index / (totalPoints - 1)) * chartW;
          const ptY = padTop + (1 - (pt.mid - minVal) / newRange) * chartH;

          // Convert coordinates back to client space to position tooltip
          const clientX = (ptX / W) * rect.width + rect.left - rect.left;
          const clientY = (ptY / H) * rect.height + rect.top - rect.top;

          tooltipEl.style.display = 'block';
          tooltipEl.style.left = (clientX + 15) + 'px';
          tooltipEl.style.top = (clientY - 45) + 'px';

          const ageS = isPrediction ? `in ${(index - hist.length + 1) * 5}s` : ageLabel(ctx.state, pt.t);
          const typeStr = isPrediction ? '<span style="color:var(--warn)">FORECAST</span>' : '<span style="color:var(--accent)">OBSERVED</span>';
          tooltipEl.innerHTML = `
            <div>${typeStr}</div>
            <div style="font-size:0.9rem; font-weight:bold; color:var(--ink);">${pt.mid} CR</div>
            <div style="color:var(--ink-mute)">Time: ${ageS}</div>
          `;
        }
      }
    });

    newCanvas.addEventListener('mouseleave', () => {
      tooltipEl.style.display = 'none';
    });
  }

  function drawExpandedChart(canvas, historyPoints, predictedPoints, basePrice) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const allY = [...historyPoints.map(p => p.mid), ...predictedPoints.map(p => p.mid), basePrice];
    let minVal = Math.min(...allY);
    let maxVal = Math.max(...allY);
    const valRange = (maxVal - minVal) || 1;
    minVal = Math.max(1, minVal - valRange * 0.1);
    maxVal = maxVal + valRange * 0.1;
    const newRange = maxVal - minVal;

    const totalPoints = historyPoints.length + predictedPoints.length;
    if (totalPoints < 2) return;

    const padLeft = 60, padRight = 20, padTop = 30, padBottom = 40;
    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBottom;

    const xForIndex = (idx) => padLeft + (idx / (totalPoints - 1)) * chartW;
    const yForVal = (v) => padTop + (1 - (v - minVal) / newRange) * chartH;

    // Base price band
    const bandY1 = yForVal(basePrice * 1.1);
    const bandY2 = yForVal(basePrice * 0.9);
    ctx.fillStyle = 'rgba(242, 168, 59, 0.05)';
    ctx.fillRect(padLeft, Math.min(bandY1, bandY2), chartW, Math.abs(bandY2 - bandY1));

    // Y Axis Grid (canvas can't resolve CSS var() strings — concrete colors required)
    ctx.strokeStyle = 'rgba(90, 74, 45, 0.28)';
    ctx.lineWidth = 1;
    ctx.font = '10px Consolas, monospace';
    ctx.fillStyle = '#7d7057';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const val = minVal + (i / gridSteps) * newRange;
      const y = yForVal(val);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(W - padRight, y);
      ctx.stroke();
      ctx.fillText(Math.round(val), padLeft - 8, y);
    }

    // Base price baseline
    const basePriceY = yForVal(basePrice);
    ctx.strokeStyle = 'rgba(255, 208, 97, 0.30)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padLeft, basePriceY);
    ctx.lineTo(W - padRight, basePriceY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd061';
    ctx.fillText('BASE', W - padRight, basePriceY - 8);

    // Observed price history line
    const histLen = historyPoints.length;
    if (histLen > 1) {
      const grad = ctx.createLinearGradient(0, padTop, 0, H - padBottom);
      grad.addColorStop(0, 'rgba(242, 168, 59, 0.16)');
      grad.addColorStop(1, 'rgba(242, 168, 59, 0.0)');
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.moveTo(padLeft, H - padBottom);
      for (let i = 0; i < histLen; i++) {
        ctx.lineTo(xForIndex(i), yForVal(historyPoints[i].mid));
      }
      ctx.lineTo(xForIndex(histLen - 1), H - padBottom);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#f2a83b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < histLen; i++) {
        const x = xForIndex(i);
        const y = yForVal(historyPoints[i].mid);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Future price prediction line
    const predLen = predictedPoints.length;
    if (predLen > 0 && histLen > 0) {
      ctx.strokeStyle = 'rgba(230, 218, 189, 0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(xForIndex(histLen - 1), yForVal(historyPoints[histLen - 1].mid));
      for (let i = 0; i < predLen; i++) {
        ctx.lineTo(xForIndex(histLen + i), yForVal(predictedPoints[i].mid));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // X Axis baseline
    ctx.strokeStyle = '#3a3221';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, H - padBottom);
    ctx.lineTo(W - padRight, H - padBottom);
    ctx.stroke();
  }

  // Category filter selection builder
  function rebuildCategoryRail() {
    catRail.innerHTML = '';
    const state = ctx.state;
    const stationId = panel.stationId;

    // Scan what categories are actually traded at this station
    const activeCats = new Set(['all']);
    for (const c of COMMODITIES) {
      if (stationTrades(state, stationId, c.id)) {
        activeCats.add(c.category);
      }
    }

    CATEGORIES.forEach(cat => {
      if (!activeCats.has(cat.id)) return;
      const b = document.createElement('button');
      b.className = 'st-market-cat-tab' + (activeCategory === cat.id ? ' active' : '');
      b.type = 'button';
      b.setAttribute('data-category', cat.id);
      b.innerHTML = `<span class="st-cat-icon">${cat.icon}</span><span class="st-cat-label">${cat.label}</span>`;
      b.addEventListener('click', () => {
        activeCategory = cat.id;
        rebuildCategoryRail();
        rebuild();
        ctx.bus.emit('audio:cue', { id: 'ui_tab' });
      });
      catRail.appendChild(b);
    });
  }

  // Build/rebuild card grid
  function rebuild() {
    const state = ctx.state;
    const stationId = panel.stationId;

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

    const commodities = commodityRowsFor(stationId);

    // Refresh best trades list cache
    lastBestTrades = computeBestTrades(state, stationId);

    commodities.forEach(c => {
      const card = document.createElement('div');
      card.className = 'st-row st-cmdty-card';
      card.setAttribute('data-cmdty', c.id);

      const legalTag = c.legality !== 'legal'
        ? ' <span class="st-tag st-tag-' + escapeHtml(c.legality) + '">' + escapeHtml(c.legality) + '</span>' : '';

      // We maintain the required class structure inside our custom card format
      card.innerHTML = `
        <div class="st-card-header">
          <span class="c-name">${escapeHtml(c.name)}${legalTag}</span>
          <span class="st-card-cat-badge mono">${escapeHtml(c.category)}</span>
          <button class="st-expand-btn" data-act="expand" title="Open fullscreen chart" aria-label="Open fullscreen chart">↗</button>
        </div>
        <div class="st-card-spark-wrap">
          <svg class="st-row-gauge" width="28" height="28" role="img" aria-label="stock pressure"></svg>
          <canvas class="st-spark" width="160" height="40" title="Recent price trend"></canvas>
          <span class="st-row-role st-role--none" title="role"><span class="st-row-role-glyph">—</span><span class="st-row-role-lbl">NEUTRAL</span></span>
        </div>
        <span class="st-slotline st-cmdty-purpose" hidden>${escapeHtml(commodityPurpose(c))}</span>
        <span class="st-slotline st-market-mission-line"></span>
        <span class="st-slotline st-best-known-line st-intel-strip" data-intel-strip role="group" aria-label="Market intel"></span>
        <div class="st-card-prices">
          <div class="st-card-price-col">
            <span class="st-price-lbl">BUY</span>
            <span class="st-buy mono">—</span>
          </div>
          <div class="st-card-price-col">
            <span class="st-price-lbl">SELL</span>
            <span class="st-sell mono">—</span>
          </div>
          <div class="st-card-price-col">
            <span class="st-price-lbl">OWNED</span>
            <span class="st-owned mono">0</span>
          </div>
        </div>
        <div class="st-card-qty-row">
          <span class="c-qty">
            ${STEP_PRESETS.map((v) => '<button data-act="step" data-v="' + v + '">' + v + '</button>').join('')}
            <button data-act="step" data-v="max">Max</button>
            <span class="st-qty-val mono">1</span>
          </span>
        </div>
        <div class="c-act">
          <button class="st-buy-btn" data-act="buy">Buy</button>
          <button class="st-sell-btn" data-act="sell">Sell</button>
        </div>
      `;

      frag.appendChild(card);
      panel._rowEls[c.id] = card;
      if (qtyState[c.id] == null) qtyState[c.id] = 1;
      updateRowQty(card, qtyState[c.id]);
    });

    list.textContent = '';
    if (!frag.childElementCount) {
      const empty = document.createElement('div');
      empty.className = 'st-empty';
      if (_filter.q) {
        empty.textContent = 'No commodities match "' + _filter.q + '".';
      } else {
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

  function refreshValues() {
    const state = ctx.state;
    const stationId = panel.stationId;
    const p = state.player;
    header.querySelector('.st-credits').textContent = fmtCr(p.credits);
    const cap = p.cargo.capVolume || 0;
    header.querySelector('.st-cargo').textContent = formatCargoUnits(p.cargo.usedVolume || 0) + ' / ' + formatCargoUnits(cap) + ' u';
    const purposeText = purpose.querySelector('.st-market-purpose-text');
    if (purposeText) purposeText.textContent = stationMarketPurpose(state, stationId);
    const missionInfo = trackedMarketMission(state, stationId);
    renderMissionCallout(missionInfo);
    renderRouteCallout(activeTradeRoute(state, stationId));
    refreshPlanner(state, stationId);
    renderTradeLedger(state);
    if (!panel._rowEls) return;

    for (const cmdtyId in panel._rowEls) {
      const card = panel._rowEls[cmdtyId];
      const missionMatch = missionInfo && missionInfo.cmdtyId === cmdtyId;
      card.classList.toggle('tracked-mission', !!missionMatch);
      const missionLine = card.querySelector('.st-market-mission-line');
      if (missionLine) {
        missionLine.textContent = missionMatch ? trackedMarketActionText(missionInfo) : '';
        missionLine.hidden = !missionMatch;
      }
      const owned = (p.cargo.items[cmdtyId]) || 0;
      const buyP = unitPrice(ctx, stationId, cmdtyId, 'buy');
      const sellP = unitPrice(ctx, stationId, cmdtyId, 'sell');
      // Market intel strip: presenter-driven chips + best-known route (the "knowledge layer").
      const strip = card.querySelector('[data-intel-strip]');
      if (strip) {
        const knownRoute = lastBestTrades.find((t) => t && t.cmdtyId === cmdtyId) || null;
        const stripQty = selectedQtyFor(qtyState[cmdtyId] || 1, tradeMode === 'sell' ? owned : maxBuyable(ctx, stationId, cmdtyId));
        renderIntelStrip(strip, state, stationId, cmdtyId, {
          liveBuy: buyP,
          liveSell: sellP,
          qty: stripQty,
          side: tradeMode === 'sell' ? 'sell' : 'buy',
          route: knownRoute,
        });
      }
      card.querySelector('.st-owned').textContent = owned;
      card.querySelector('.st-buy').textContent = fmtCr(buyP);
      card.querySelector('.st-sell').textContent = fmtCr(sellP);
      const def = COMMODITY_BY_ID.get(cmdtyId);
      const base = def ? def.basePrice : 0;
      const buyHeat = base > 0 ? (buyP - base) / base : 0;
      applyPriceHeat(card.querySelector('.st-buy'), buyHeat);
      const sellHeat = base > 0 ? (sellP - base) / base : 0;
      applyPriceHeat(card.querySelector('.st-sell'), sellHeat);
      const spark = card.querySelector('.st-spark');
      const wrap = card.querySelector('.st-card-spark-wrap');
      if (spark) {
        const history = getPriceHistory(stationId, cmdtyId);
        // No scope without data: an empty sparkline is hidden, not a blank stare.
        spark.hidden = !(history && history.length > 1);
        drawSparkline(spark, history, { upColor: '#f2a83b', downColor: '#8fb0c0' });
        // The tick flash marks a price CHANGE, not a repaint (motion = state change only).
        const priceKey = buyP + ':' + sellP;
        if (wrap && card.dataset.lastPrices && card.dataset.lastPrices !== priceKey) {
          wrap.classList.remove('tick');
          void wrap.offsetWidth;
          wrap.classList.add('tick');
        }
        card.dataset.lastPrices = priceKey;
      }
      const buyBtn = card.querySelector('.st-buy-btn');
      const sellBtn = card.querySelector('.st-sell-btn');
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
      // Sealed contract freight (preloaded-mission cargo) cannot be sold — selling it bricks the
      // delivery with no recovery. Lock the sell button the same way jettison is locked in the HUD.
      const contractLocked = isUnsellableCargo(state, cmdtyId);
      const canSellSelected = sellQty > 0 && sellQty <= owned && !contractLocked;
      buyBtn.disabled = !canBuySelected;
      sellBtn.disabled = !canSellSelected;
      if (contractLocked) sellBtn.textContent = 'LOCK: CONTRACT';
      const cName = def ? def.name : cmdtyId;
      const purposeLine = def ? commodityPurpose(def) : 'Trade cargo for credits or objectives.';

      // Kept exact strings matching playwright assertions
      const buyTitle = buyBtn.disabled
        ? (!room ? 'No cargo room for ' + cName + '. Sell cargo, refit cargo modules, or buy a larger hull.' :
          (buyQty > maxBuy ? 'Selected quantity exceeds current credits or cargo room. Pick Max or a smaller amount.' :
            'Need ' + fmtCr(Math.max(buyP, buyTotal)) + ' CR for the selected ' + cName + ' purchase.'))
        : 'Buy ' + formatCargoUnits(buyQty) + ' ' + cName + ' for ' + fmtCr(buyTotal) + ' CR, using about ' + formatCargoUnits(buyQty * vol) + 'u cargo. ' + purposeLine;
      const sellTitle = contractLocked
        ? cName + ' is sealed contract cargo and cannot be sold — it is required for an active mission.'
        : (sellBtn.disabled
          ? (owned <= 0 ? 'You do not own any ' + cName + ' to sell here.' : 'Selected quantity exceeds the ' + formatCargoUnits(owned) + ' ' + cName + ' you own. Pick Max or a smaller amount.')
          : 'Sell ' + formatCargoUnits(sellQty) + ' ' + cName + ' for about ' + fmtCr(sellTotal) + ' CR. Use proceeds for missions, hulls, modules, repairs, and fuel.');

      buyBtn.setAttribute('title', buyTitle);
      sellBtn.setAttribute('title', sellTitle);
      buyBtn.setAttribute('aria-label', buyTitle);
      sellBtn.setAttribute('aria-label', sellTitle);

      // row mini-gauge (stock pressure) + supply/demand glyph
      const gaugeEl = card.querySelector('.st-row-gauge');
      if (gaugeEl) {
        const entry = marketEntry(state, stationId, cmdtyId);
        const pressure = stockPressure01(entry);
        drawRowGauge(gaugeEl, pressure, def);
      }
      const roleEl = card.querySelector('.st-row-role');
      if (roleEl) {
        const stnType = stationTypeFor(state, stationId);
        const role = stationRoleFor(def, stnType);
        const g = roleGlyph(role);
        roleEl.className = 'st-row-role ' + g.cls;
        roleEl.innerHTML = '<span class="st-row-role-glyph">' + g.glyph + '</span><span class="st-row-role-lbl">' + g.label + '</span>';
        roleEl.title = g.label + ' role at this station';
      }
    }

    // keep the analysis stage live on each refresh
    refreshStage();
  }

  /** Draw a tiny stock-pressure ring into a row's inline SVG gauge. */
  function drawRowGauge(svg, pressure01, def) {
    if (!svg) return;
    const size = 28, stroke = 3.5;
    const R = (size - stroke) / 2;
    const CIRC = 2 * Math.PI * R;
    const cx = size / 2;
    let track = svg.querySelector('.st-row-gauge__track');
    let arc = svg.querySelector('.st-row-gauge__arc');
    if (!track) {
      svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
      track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      track.setAttribute('class', 'st-row-gauge__track');
      track.setAttribute('cx', cx); track.setAttribute('cy', cx); track.setAttribute('r', R);
      track.setAttribute('fill', 'none'); track.setAttribute('stroke-width', stroke);
      svg.appendChild(track);
      arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      arc.setAttribute('class', 'st-row-gauge__arc');
      arc.setAttribute('cx', cx); arc.setAttribute('cy', cx); arc.setAttribute('r', R);
      arc.setAttribute('fill', 'none'); arc.setAttribute('stroke-width', stroke);
      arc.setAttribute('stroke-linecap', 'round');
      arc.setAttribute('transform', `rotate(-90 ${cx} ${cx})`);
      svg.appendChild(arc);
    }
    const v = Math.max(0, Math.min(1, pressure01));
    arc.setAttribute('stroke-dasharray', CIRC.toFixed(2));
    arc.setAttribute('stroke-dashoffset', (CIRC * (1 - v)).toFixed(2));
    const kind = v > 0.66 ? 'scarce' : v < 0.34 ? 'glut' : 'mid';
    const col = kind === 'scarce' ? 'var(--warn)' : kind === 'glut' ? 'var(--accent-2)' : 'var(--ink-dim)';
    arc.style.stroke = col;
    svg.setAttribute('aria-label', (kind === 'scarce' ? 'scarce' : kind === 'glut' ? 'well-stocked' : 'balanced') + ' stock');
    svg.title = 'Stock pressure: ' + Math.round(v * 100) + '% (0=glut, 100=scarce)';
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
        escapeHtml(info.cmdtyName) + ' · hold ' + formatCargoUnits(info.owned) + 'u / target ' + formatCargoUnits(info.remaining) + 'u' +
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
      ? 'Sell ' + formatCargoUnits(info.owned) + 'u ' + info.cmdtyName + ' here for about ' + fmtCr(gross) + ' CR and clear the completed trade waypoint.'
      : 'No ' + info.cmdtyName + ' is aboard for this trade route.';
    routeCallout.hidden = false;
    routeCallout.innerHTML =
      '<div class="st-market-route-label mono">TRADE ROUTE DESTINATION</div>' +
      '<div class="st-market-route-title">' + escapeHtml(info.destination) + '</div>' +
      '<div class="st-market-route-body">' +
        (canSell
          ? 'Route cargo is aboard: sell ' + formatCargoUnits(info.owned) + 'u ' + escapeHtml(info.cmdtyName) + ' here for about ' + fmtCr(gross) + ' CR.'
          : 'Route nav is set here, but no ' + escapeHtml(info.cmdtyName) + ' is aboard.') +
      '</div>' +
      '<div class="st-market-route-actions">' +
        '<span class="st-market-route-meta mono">' + escapeHtml(info.reason) + '</span>' +
        '<button data-act="route-sell" data-cmdty="' + escapeHtml(info.cmdtyId) + '" title="' + escapeHtml(routeSellTitle) + '" aria-label="' + escapeHtml(routeSellTitle) + '"' + (canSell ? '' : ' disabled') + '>Sell Route Cargo</button>' +
      '</div>';
  }

  function refreshPlanner(state, stationId) {
    const trades = lastBestTrades;
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
      
      // Kept exact strings matching playwright assertions
      const runLabel = runBlocked
        ? t.loadReason
        : 'load ' + formatCargoUnits(t.loadUnits) + 'u · +' + fmtCr(t.loadProfit) + ' CR';
      const intelLabel = t.intelLabel || describeTradeIntel(state, t);
      
      row.title = runBlocked
        ? 'Profitable route, but you cannot load this cargo right now: ' + t.loadReason + '. ' + intelLabel + '.'
        : 'Current run estimate: buy ' + formatCargoUnits(t.loadUnits) + 'u for ' + fmtCr(t.loadCost) + ' CR, hold ' + formatCargoUnits(t.loadVolume) + 'u, expected gross profit +' + fmtCr(t.loadProfit) + ' CR. ' + intelLabel + '.';
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

  function renderTradeLedger(state) {
    if (!ledgerList) return;
    const rows = state && state.player && Array.isArray(state.player.tradeLedger) ? state.player.tradeLedger : [];
    if (!rows.length) {
      ledgerList.innerHTML = '<div class="st-planner-empty">No trades logged yet.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const trade of rows.slice(0, 10)) {
      const def = COMMODITY_BY_ID.get(trade.commodityId);
      const profit = Math.round(Number(trade.profit) || 0);
      const margin = Math.round(Number(trade.marginPerUnit) || 0);
      const div = document.createElement('div');
      div.className = 'st-ledger-row ' + (profit >= 0 ? 'st-ledger-up' : 'st-ledger-down');
      div.innerHTML =
        '<span>' + escapeHtml(trade.side === 'buy' ? 'BUY' : 'SELL') + ' ' +
          formatCargoUnits(trade.qty) + 'u ' + escapeHtml(def ? def.name : trade.commodityId) + '</span>' +
        '<b class="mono" style="color:' + (profit >= 0 ? '#7af7d0' : '#ff5c5c') + '">' +
          (margin >= 0 ? '+' : '') + fmtCr(margin) + '/u</b>';
      frag.appendChild(div);
    }
    ledgerList.textContent = '';
    ledgerList.appendChild(frag);
  }

  /** Presenter-driven intel strip on a commodity card: stale-aware chips + the best-known sell
   *  route as a plottable button. View comes from marketIntelPresenter (pure, no live formulas). */
  function renderIntelStrip(el, state, stationId, cmdtyId, opts = {}) {
    if (!el) return;
    const def = COMMODITY_BY_ID.get(cmdtyId);
    let impactPct = null;
    const econ = ctx.registry && ctx.registry.get && ctx.registry.get('economy');
    const qty = Math.max(0, Math.floor(Number(opts.qty) || 0));
    let quoteUnit = null;
    if (econ && typeof econ.quote === 'function' && qty > 0) {
      try {
        const q = econ.quote(stationId, cmdtyId, opts.side === 'sell' ? 'sell' : 'buy', qty);
        if (q && q.ok !== false) {
          if (typeof q.priceImpactPct === 'number') impactPct = q.priceImpactPct;
          quoteUnit = usableQuoteUnit(q);
        }
      } catch (_) { /* quote is advisory only */ }
    }
    const view = presentCommodityIntel({
      state,
      commodityId: cmdtyId,
      stationId,
      liveBuy: opts.liveBuy,
      liveSell: opts.liveSell,
      qty,
      quoteUnit,
      priceImpactPct: impactPct,
      side: opts.side === 'sell' ? 'sell' : 'buy',
      def,
      route: opts.route || null,
    });
    el._intelView = view;
    const frag = document.createDocumentFragment();
    const chipRow = document.createElement('div');
    chipRow.className = 'st-intel-chips';
    chipRow.setAttribute('aria-label', view.ariaSummary || 'Market intel');
    for (const [index, c] of (view.chips || []).entries()) {
      if (index > 0) chipRow.appendChild(document.createTextNode(' '));
      const chip = document.createElement('span');
      chip.className = 'sf-chip sf-chip--' + (c.tone || 'muted');
      chip.setAttribute('data-intel-chip', c.id);
      chip.title = c.title || c.text;
      chip.textContent = c.text;
      chipRow.appendChild(chip);
    }
    frag.appendChild(chipRow);

    const best = bestKnownSellFor(state, cmdtyId, stationId);
    if (best) {
      const age = ageLabel(state, best.seenAt).replace(' ago', '');
      const jumps = best.jumps == null ? '?' : best.jumps;
      const label = 'Best ' + fmtCr(best.sell) + ' · ' + best.stationName + ' · ' + age + ' · ' + jumps + 'J';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-act', 'best-known');
      btn.setAttribute('data-station', best.stationId);
      btn.title = 'Set course to ' + best.stationName;
      btn.setAttribute('aria-label', label);
      btn.textContent = label;
      frag.appendChild(btn);
    }

    el.hidden = false;
    el.textContent = '';
    el.appendChild(frag);
    el.setAttribute('aria-label', view.ariaSummary || 'Market intel');
  }

  /** Presenter inspector rows inside the analysis stage (memory age, spread, caveats). */
  function renderIntelInspector(mount, view) {
    if (!mount) return;
    mount.textContent = '';
    const rows = (view && view.inspectorRows) || [];
    if (!rows.length) {
      mount.hidden = true;
      return;
    }
    mount.hidden = false;
    const frag = document.createDocumentFragment();
    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'st-inspector-row';
      line.setAttribute('data-intel-row', row.id);
      const lbl = document.createElement('span');
      lbl.className = 'st-insp-lbl';
      lbl.textContent = row.label;
      const val = document.createElement('span');
      val.className = 'mono st-insp-intel-val';
      val.setAttribute('data-tone', row.tone || 'muted');
      val.textContent = row.value;
      line.appendChild(lbl);
      line.appendChild(val);
      frag.appendChild(line);
    }
    mount.appendChild(frag);
  }

  function applyPriceHeat(el, heat) {
    if (!el) return;
    el.classList.remove('st-heat-up', 'st-heat-down', 'st-heat-flat');
    
    let arrow = '<span class="st-trend-arrow flat">─</span>';
    let isStrong = Math.abs(heat) >= 0.15 ? ' strong' : '';
    
    if (heat <= -0.08) {
      el.classList.add('st-heat-down');
      arrow = '<span class="st-trend-arrow down' + isStrong + '">▼</span>';
    } else if (heat >= 0.08) {
      el.classList.add('st-heat-up');
      arrow = '<span class="st-trend-arrow up' + isStrong + '">▲</span>';
    } else {
      el.classList.add('st-heat-flat');
    }
    
    if (el.textContent && !el.innerHTML.includes('st-trend-arrow')) {
      const txt = el.textContent;
      el.innerHTML = txt + ' ' + arrow;
    }
  }

  /** Select a commodity into the analysis stage. */
  function selectCommodity(cmdtyId) {
    selectedCmdtyId = cmdtyId;
    stage.hidden = false;
    // mark the selected row; the purpose line is detail-on-demand (hidden until selected)
    if (panel._rowEls) {
      for (const id in panel._rowEls) {
        const rowCard = panel._rowEls[id];
        const sel = id === cmdtyId;
        rowCard.classList.toggle('is-selected', sel);
        const purposeLine = rowCard.querySelector('.st-cmdty-purpose');
        if (purposeLine) purposeLine.hidden = !sel;
      }
    }
    refreshStage();
    ctx.bus.emit('audio:cue', { id: 'ui_click' });
    stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** Best known sell route for a single commodity (used by the route beam + inspector Plot Route). */
  function bestMarginRouteFor(state, hereStationId, cmdtyId) {
    const trades = computeBestTrades(state, hereStationId);
    const t = trades.find((x) => x.cmdtyId === cmdtyId);
    if (!t) return null;
    return {
      destStation: t.destStation,
      destName: stationName(state, t.destStation),
      buyHere: t.buyHere,
      sellThere: t.sellThere,
      margin: t.margin,
      loadUnits: t.loadUnits,
      loadProfit: t.loadProfit,
    };
  }

  /** Refresh the analysis stage from current state. Called on select + each refreshValues pass. */
  function refreshStage() {
    if (!selectedCmdtyId || stage.hidden) return;
    const state = ctx.state;
    const stationId = panel.stationId;
    const def = COMMODITY_BY_ID.get(selectedCmdtyId);
    if (!def) return;

    const cycle = getCycle(stationId, selectedCmdtyId);
    const regimeText = cycle ? regimeLabel(cycle.regime) : 'Cyclic';
    if (stageFx && stageFx.regime) { try { stageFx.regime.set(regimeText); } catch (_) {} }

    const hist = getPriceHistory(stationId, selectedCmdtyId);
    drawSparkline(stageSpark, hist, { upColor: '#f2a83b', downColor: '#8fb0c0' });

    const pred = predictPriceCurve(state, stationId, selectedCmdtyId, 24, 5);
    drawForecastCone(stageCone, hist, pred, def.basePrice);

    // Supply chain spindle
    const stationType = stationTypeFor(state, stationId);
    if (stageFx && stageFx.supply) {
      try { stageFx.supply.setNodes(supplyTreeNodesFor(def, stationType)); } catch (_) {}
    }

    // Best margin route beam
    const route = bestMarginRouteFor(state, stationId, selectedCmdtyId);
    if (stageFx && stageFx.beam) {
      try {
        if (route && route.margin > 0) {
          // beam from left (here/buy) to right (sell destination)
          stageFx.beam.setPath([{ x: 20, y: 40 }, { x: 120, y: 20 }, { x: 220, y: 40 }], { active: true, kind: 'route' });
          stageRouteMeta.textContent = route.destName + ' · +' + fmtCr(route.margin) + '/u';
          inspRouteBtn.disabled = false;
        } else {
          stageFx.beam.setPath([], { active: false });
          stageRouteMeta.textContent = 'No profitable route known';
          inspRouteBtn.disabled = true;
        }
      } catch (_) {}
    }

    // Trade inspector: cargo-aware quote + flooding gauge + projected profit
    refreshInspector(state, stationId, selectedCmdtyId, def, route);
  }

  function refreshInspector(state, stationId, cmdtyId, def, route) {
    const econ = ctx.registry && ctx.registry.get && ctx.registry.get('economy');
    const maxBuy = maxBuyable(ctx, stationId, cmdtyId);
    // Cargo-aware quote: what would the max affordable load cost, and how would it move the price?
    let quoteText = '—';
    let flood01 = 0;
    if (econ && typeof econ.quote === 'function' && maxBuy > 0) {
      try {
        const q = econ.quote(stationId, cmdtyId, 'buy', maxBuy);
        if (q && q.ok !== false) {
          const unit = usableQuoteUnit(q) || 0;
          const total = (q.total != null ? q.total : unit * maxBuy) || 0;
          const impact = (typeof q.priceImpactPct === 'number') ? q.priceImpactPct : 0;
          quoteText = formatCargoUnits(maxBuy) + 'u @ ' + fmtCr(Math.round(unit)) + ' = ' + fmtCr(Math.round(total)) + ' CR';
          // flooding gauge: how much would buying maxBuy push the local price UP (0=none, 1=severe).
          // priceImpactPct is fractional; map |impact|>0.25 to full.
          flood01 = Math.max(0, Math.min(1, Math.abs(impact) / 0.25));
        }
      } catch (_) {}
    }
    inspQuote.textContent = quoteText;
    if (stageFx && stageFx.flood) { try { stageFx.flood.setValue(flood01, { kind: flood01 > 0.66 ? 'danger' : flood01 > 0.33 ? 'warn' : 'good', label: Math.round(flood01 * 100) + '% price impact' }); } catch (_) {} }

    // Projected profit: only meaningful after a transaction (a cost basis exists in tradeLots).
    // Show the route's potential profit as a forecast; the morph fires (up/down colour) on change.
    const profit = route && route.loadProfit ? route.loadProfit : 0;
    const profitText = profit > 0 ? '+' + fmtCr(profit) + ' CR' : '—';
    if (stageFx && stageFx.profit) { try { stageFx.profit.set(profitText, { dir: profit > 0 ? 'up' : undefined }); } catch (_) {} }
    else inspProfit.textContent = profitText;

    // Presenter intel rows (memory age, spread, caveats) — reuse the selected card's view.
    const intelMount = stage.querySelector('[data-intel-inspector]');
    if (intelMount) {
      const card = panel._rowEls && panel._rowEls[cmdtyId];
      const strip = card && card.querySelector('[data-intel-strip]');
      renderIntelInspector(intelMount, strip && strip._intelView);
    }
  }

  /** Draw a compact forecast cone (history line + dashed forecast + ±uncertainty band) into a canvas. */
  function drawForecastCone(canvas, historyPoints, predictedPoints, basePrice) {
    const c = canvas.getContext('2d');
    if (!c) return;
    const W = canvas.width, H = canvas.height;
    c.clearRect(0, 0, W, H);
    const allY = [...historyPoints.map((p) => p.mid), ...predictedPoints.map((p) => p.mid), basePrice];
    let minVal = Math.min(...allY), maxVal = Math.max(...allY);
    const range = (maxVal - minVal) || 1;
    minVal = Math.max(1, minVal - range * 0.12);
    maxVal = maxVal + range * 0.12;
    const valRange = maxVal - minVal;
    const total = historyPoints.length + predictedPoints.length;
    if (total < 2) return;
    const padL = 6, padR = 6, padT = 6, padB = 6;
    const cw = W - padL - padR, ch = H - padT - padB;
    const xFor = (i) => padL + (i / (total - 1)) * cw;
    const yFor = (v) => padT + (1 - (v - minVal) / valRange) * ch;

    // base-price reference line
    c.strokeStyle = 'rgba(132,160,200,.18)';
    c.lineWidth = 1;
    c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(padL, yFor(basePrice)); c.lineTo(W - padR, yFor(basePrice)); c.stroke();
    c.setLineDash([]);

    // forecast cone: a widening band around the prediction (uncertainty grows with horizon)
    const predLen = predictedPoints.length;
    const histLen = historyPoints.length;
    if (predLen > 1 && histLen > 0) {
      c.fillStyle = 'rgba(230,218,189,.18)';
      c.beginPath();
      const startX = xFor(histLen - 1);
      const startY = yFor(historyPoints[histLen - 1].mid);
      c.moveTo(startX, startY);
      for (let i = 0; i < predLen; i++) {
        const widening = (i / predLen) * range * 0.42; // band grows toward the right
        c.lineTo(xFor(histLen + i), yFor(predictedPoints[i].mid + widening));
      }
      for (let i = predLen - 1; i >= 0; i--) {
        const widening = (i / predLen) * range * 0.42;
        c.lineTo(xFor(histLen + i), yFor(predictedPoints[i].mid - widening));
      }
      c.closePath(); c.fill();
    }

    // observed history line
    if (histLen > 1) {
      c.strokeStyle = '#f2a83b';
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < histLen; i++) {
        const x = xFor(i), y = yFor(historyPoints[i].mid);
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }

    // Future price prediction line — visually distinct (dashed) from observed history
    if (predLen > 0 && histLen > 0) {
      c.strokeStyle = 'rgba(230,218,189,.55)';
      c.lineWidth = 1.5;
      c.setLineDash([4, 4]);
      c.beginPath();
      c.moveTo(xFor(histLen - 1), yFor(historyPoints[histLen - 1].mid));
      for (let i = 0; i < predLen; i++) c.lineTo(xFor(histLen + i), yFor(predictedPoints[i].mid));
      c.stroke();
      c.setLineDash([]);
    }
  }

  const panel = {
    el: root,
    stationId: null,
    setTradeMode,
    onShow(c) {
      panel.stationId = (c && c.stationId) || panel.stationId;
      if (panel.stationId && ctx.bus) ctx.bus.emit('economy:marketOpened', { stationId: panel.stationId });
      rebuildCategoryRail();
      // Handoff / deep-link can open straight into Selling or Buying (also rebuilds the list).
      if (c && (c.tradeMode === 'buy' || c.tradeMode === 'sell' || c.tradeMode === 'all')) {
        setTradeMode(c.tradeMode, { silent: true });
      } else {
        rebuild();
      }
      if (stageFx) for (const k in stageFx) { try { stageFx[k].setActive(true); } catch (_) {} }
      if (selectedCmdtyId) refreshStage();
    },
    onHide() {
      if (stageFx) for (const k in stageFx) { try { stageFx[k].setActive(false); } catch (_) {} }
    },
    refresh() { refreshValues(); },
    rebuild,
  };
  return panel;
}

function maxBuyable(ctx, stationId, cmdtyId) {
  const p = ctx.state.player;
  const def = COMMODITY_BY_ID.get(cmdtyId);
  const vol = def && def.volPerU > 0 ? def.volPerU : 1;
  const buyP = Math.max(1, unitPrice(ctx, stationId, cmdtyId, 'buy'));
  const byCredits = Math.floor(p.credits / buyP);
  const byRoom = Math.floor((p.cargo.capVolume - p.cargo.usedVolume) / vol);
  return Math.max(0, Math.min(byCredits, byRoom));
}

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

export function applyTradeNavigation(ctx, stationId, cmdtyId) {
  const state = ctx.state;
  state.nav = state.nav || {};
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
  const memory = state && state.player && state.player.marketMemory;
  const hasPlayerMemory = !!(memory && typeof memory === 'object' && !Array.isArray(memory));
  if (hasPlayerMemory) {
    for (const sid in memory) {
      const station = memory[sid];
      if (!station) continue;
      const snapshot = {};
      for (const cid in station) {
        const q = station[cid];
        if (!q) continue;
        snapshot[cid] = {
          buy: q.buy || 0,
          sell: q.sell || 0,
          demandMult: Number(q.demandMult) || 1,
          demandDrivers: Array.isArray(q.demandDrivers) ? q.demandDrivers.map((driver) => ({ ...driver })) : [],
        };
      }
      out[sid] = { snapshot, seenAtT: newestMemorySeenAt(station), intelSource: 'memory' };
    }
  }
  const intel = econ && econ.marketIntel;
  if (intel) {
    for (const sid in intel) {
      if (intel[sid] && intel[sid].snapshot) out[sid] = { ...intel[sid], intelSource: 'scanned' };
    }
  }
  if (hasPlayerMemory) return out;
  const markets = econ && econ.markets;
  if (markets) {
    for (const sid in markets) {
      if (out[sid]) continue;
      const market = markets[sid];
      const snapshot = {};
      for (const cid in market || {}) {
        const e = market[cid];
        if (!e) continue;
        snapshot[cid] = {
          mid: e.lastMid, buy: e.lastBuy, sell: e.lastSell, stock: e.stock, role: e.role,
          demandMult: Number(e.demandMult) || 1,
          demandDrivers: Array.isArray(e.demandDrivers) ? e.demandDrivers.map((driver) => ({ ...driver })) : [],
        };
      }
      out[sid] = { snapshot, seenAtT: (state && state.simTime) || 0, intelSource: 'market' };
    }
  }
  return out;
}

function newestMemorySeenAt(stationMemory) {
  let t = 0;
  for (const cid in stationMemory || {}) {
    const seenAt = Number(stationMemory[cid] && stationMemory[cid].seenAt) || 0;
    if (seenAt > t) t = seenAt;
  }
  return t;
}

export function describeTradeIntel(state, trade) {
  if (!trade) return 'unknown intel';
  if (trade.intelSource === 'market') return 'market feed';
  if (trade.intelSource === 'memory') return 'price memory';
  const now = Math.max(0, Number(state && state.simTime) || 0);
  const seen = Math.max(0, Number(trade.seenAtT != null ? trade.seenAtT : trade.age) || 0);
  const ageS = Math.max(0, now - seen);
  if (ageS < 120) return 'fresh intel';
  const minutes = Math.max(1, Math.round(ageS / 60));
  return (minutes >= 15 ? 'stale ' : '') + minutes + 'm intel';
}

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
    let bestSell = -1, bestStation = null, bestSeen = 0, bestSource = 'unknown', bestDemand = null;
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
        bestDemand = s;
      }
    }
    if (!bestStation || bestSell <= buyHere) continue;
    const margin = bestSell - buyHere;
    const perVol = margin / vol;
    const destinationDemandSummary = summarizeDemandDrivers(
      bestDemand && bestDemand.demandDrivers,
      bestDemand && bestDemand.demandMult,
    );
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
      destinationDemand: {
        multiplier: Number(bestDemand && bestDemand.demandMult) || 1,
        label: destinationDemandSummary ? destinationDemandSummary.shortLabel : 'Market price advantage',
        direction: destinationDemandSummary ? destinationDemandSummary.direction : 'flat',
        drivers: Array.isArray(bestDemand && bestDemand.demandDrivers)
          ? bestDemand.demandDrivers.map((driver) => ({ ...driver }))
          : [],
      },
      ...tradeRunCapacity(state, def, buyHere, margin),
    };
    trade.intelLabel = describeTradeIntel(state, trade);
    out.push(trade);
  }
  out.sort((a, b) => (b.loadProfit - a.loadProfit) || (b.perVol - a.perVol));
  return out.slice(0, 5);
}
