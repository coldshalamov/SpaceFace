// Shared market quotes, route intelligence, and navigation.
// DOM rendering belongs to src/ui/station/screens/market.js.

// src/ui/screens/market.js — STATION "Market" tab panel.
// Lists commodities with the station's buy/sell prices, a qty stepper, and Buy/Sell buttons.
// Uses an industrial control panel layout with commodity card grid, left category filter rail,
// right intel panel, and an expanded canvas price history & prediction chart.
import { COMMODITIES } from '../../data/commodities.js';
import { economyBaseEqForSize, economySpotPriceForRole } from '../../systems/economy.js';
import { stationSurchargeWaiverActive } from '../../systems/factions.js';
import { confirm } from '../confirm.js';
import { escapeHtml } from '../comms.js';
import { summarizeDemandDrivers } from '../demandDriverSummary.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const STEP_PRESETS = [1, 10, 100];

/** Safe hold quantity. Empty cargo / missing player is 0, never a throw. */
export function cargoQty(state, cmdtyId) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  return Math.max(0, Math.floor(Number(items && items[cmdtyId]) || 0));
}

/** Render the event label for the chart log as text, never as markup. */
export function marketEventTypeHtml(value) {
  return escapeHtml(String(value == null ? 'EVENT' : value).toUpperCase());
}

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

export function stationSurchargeWaiverLabel(state) {
  return stationSurchargeWaiverActive(state)
    ? 'CONCORD AUXILIARY · STATION SURCHARGES WAIVED'
    : '';
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
  const owned = cargoQty(state, cmdtyId);
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
  const credits = Math.max(0, Number(state && state.player && state.player.credits) || 0);
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
