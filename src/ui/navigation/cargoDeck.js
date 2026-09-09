import { COMMODITIES } from '../../data/commodities.js';
import {
  economyBaseEqForSize,
  economyEquilibriumForListing,
  economySpotPriceForRole,
  economyStockTargetForRole,
  priceMult,
} from '../../systems/economy.js';
import { sectorSignalFor, effectiveDangerTierFor } from '../../systems/sectorSim.js';
import { rankTradeRoutes } from './localSpaceMapModel.js';

const COMMODITY_NAME_BY_ID = new Map(COMMODITIES.map((commodity) => [commodity.id, commodity.name]));
const COMMODITY_BY_ID = new Map(COMMODITIES.map((commodity) => [commodity.id, commodity]));
const DEFAULT_RISK = 0.18;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function currentSectorId(state) {
  return state && state.world && (state.world.currentSectorId || state.world.sectorId) || null;
}

function playerEntity(state) {
  if (!state) return null;
  const entities = state.entities;
  if (!entities || typeof entities.get !== 'function') return null;
  return entities.get(state.playerId) || null;
}

function sectorRecords(state) {
  const list = state && state.world && state.world.sectors;
  return list && typeof list === 'object' ? Object.values(list) : [];
}

function findStationRecord(state, stationId) {
  for (const sector of sectorRecords(state)) {
    for (const station of (sector && sector.stations) || []) {
      if (station && station.id === stationId) return station;
    }
  }
  return null;
}

function stationSectorIdById(state, stationId) {
  for (const sector of sectorRecords(state)) {
    for (const station of (sector && sector.stations) || []) {
      if (station && station.id === stationId) return sector.id || null;
    }
  }
  return null;
}

function stationPositionById(state, stationId) {
  const byStationId = state && state.entityIndex && state.entityIndex.byStationId;
  const indexed = byStationId && typeof byStationId.get === 'function' ? byStationId.get(stationId) : null;
  if (indexed && indexed.pos) return { x: Number(indexed.pos.x) || 0, z: Number(indexed.pos.z) || 0 };
  const record = findStationRecord(state, stationId);
  const anchor = record && (record.pos || record.anchor || record.position);
  if (!anchor || !Number.isFinite(Number(anchor.x))) return null;
  return { x: Number(anchor.x) || 0, z: Number(anchor.z != null ? anchor.z : anchor.y) || 0 };
}

function stationNameById(state, stationId) {
  const rec = findStationRecord(state, stationId);
  return (rec && (rec.name || rec.stationName)) || stationId || 'Station';
}

function stationRoleForCommodity(def, stationType) {
  if (!def || !stationType) return 'none';
  if ((def.producedBy || []).includes(stationType)) return 'produce';
  if ((def.consumedBy || []).includes(stationType)) return 'consume';
  return 'none';
}

function stationInfoForBeacon(state, stationId) {
  const rec = findStationRecord(state, stationId);
  return {
    id: stationId,
    name: (rec && (rec.name || rec.stationName)) || stationId,
    type: (rec && (rec.type || rec.stationTypeId)) || '',
    size: (rec && rec.size) || 'M',
    marketEquilibriumFactors: (rec && rec.marketEquilibriumFactors) || null,
  };
}

function marketEntryForStationCommodity(state, stationId, commodityId) {
  const markets = state && state.economy && state.economy.markets;
  const stationMarket = markets && markets[stationId];
  return stationMarket && stationMarket[commodityId] ? stationMarket[commodityId] : null;
}

function buildModelBeacon(state, stationId, nowS) {
  const info = stationInfoForBeacon(state, stationId);
  const quotes = {};
  const baseEq = economyBaseEqForSize(info.size || 'M');
  for (const def of COMMODITIES) {
    if (!def || !def.id) continue;
    const role = stationRoleForCommodity(def, info.type);
    const equilibrium = Math.max(1, economyEquilibriumForListing(info, def.id, role, baseEq));
    const stockTarget = Math.max(1, economyStockTargetForRole(role, baseEq) || equilibrium);
    const market = marketEntryForStationCommodity(state, stationId, def.id);
    // Guard on the ENTRY first: Number(null && x) is Number(null) === 0, which is finite, so the
    // old shape took the live-market branch with a null market and threw reading `.stock`.
    const stock = market != null && Number.isFinite(Number(market.stock))
      ? Math.max(0, Number(market.stock))
      : stockTarget;
    const buy = market != null && Number.isFinite(Number(market.lastBuy))
      ? Math.max(1, Number(market.lastBuy))
      : Math.max(1, economySpotPriceForRole(def, role, 'buy', { baseEq, stock }));
    const sell = market != null && Number.isFinite(Number(market.lastSell))
      ? Math.max(1, Number(market.lastSell))
      : Math.max(1, economySpotPriceForRole(def, role, 'sell', { baseEq, stock }));
    const demand = role === 'consume'
      ? Math.max(20, Math.round(equilibrium * 0.08))
      : role === 'none'
        ? Math.max(10, Math.round(equilibrium * 0.04))
        : 0;
    const elasticity = Number(def && def.elasticity) || 1;
    const mid = Math.max(1, Number(def && def.basePrice) || 1) * priceMult(Math.max(1, stock), baseEq, elasticity);
    const loMid = Math.max(1, Number(def && def.basePrice) || 1) * priceMult(Math.max(1, stock + 1), baseEq, elasticity);
    const hiMid = Math.max(1, Number(def && def.basePrice) || 1) * priceMult(Math.max(1, stock - 1), baseEq, elasticity);
    const modelBandPct = Math.max(0, ((Math.max(hiMid, loMid) - Math.min(hiMid, loMid)) / Math.max(1, mid)) * 50);
    quotes[def.id] = { buy, sell, stock, demand, source: 'model', approx: true, modelBandPct };
  }
  return {
    stationId,
    quotes,
    capturedAtS: nowS,
    reliability: 0.45,
    source: 'model',
  };
}

function marketIntelBeacons(state, nowS) {
  const intel = state && state.economy && state.economy.marketIntel;
  const out = [];
  if (!intel || typeof intel !== 'object') return out;
  for (const stationId of Object.keys(intel)) {
    const entry = intel[stationId];
    if (!entry || !entry.snapshot) continue;
    const quotes = {};
    for (const commodityId of Object.keys(entry.snapshot)) {
      const q = entry.snapshot[commodityId] || {};
      quotes[commodityId] = {
        buy: q.buy || q.mid || 0,
        sell: q.sell || q.mid || 0,
        stock: q.stock || 0,
        demand: q.role === 'consume' ? 100 : 0,
        source: 'memory',
      };
    }
    out.push({
      stationId,
      quotes,
      capturedAtS: Number(entry.seenAtT) || nowS,
      reliability: 1,
      source: 'memory',
    });
  }
  return out;
}

function modelAndMemoryBeacons(state, nowS) {
  const byStation = new Map();
  for (const sector of sectorRecords(state)) {
    for (const station of (sector && sector.stations) || []) {
      if (!station || !station.id) continue;
      byStation.set(station.id, buildModelBeacon(state, station.id, nowS));
    }
  }
  for (const memory of marketIntelBeacons(state, nowS)) {
    const prev = byStation.get(memory.stationId) || {
      stationId: memory.stationId,
      quotes: {},
      capturedAtS: nowS,
      reliability: 0.35,
      source: 'model',
    };
    for (const commodityId of Object.keys(memory.quotes || {})) {
      const modelQuote = prev.quotes[commodityId] || null;
      prev.quotes[commodityId] = {
        ...memory.quotes[commodityId],
        source: 'memory',
        approx: false,
        modelSell: modelQuote && Number(modelQuote.sell),
        modelBandPct: modelQuote && Number(modelQuote.modelBandPct),
      };
    }
    prev.capturedAtS = Math.max(prev.capturedAtS || 0, memory.capturedAtS || nowS);
    prev.reliability = Math.max(prev.reliability || 0, memory.reliability || 1);
    prev.source = 'memory';
    byStation.set(memory.stationId, prev);
  }
  return Array.from(byStation.values());
}

function nearestStationIdToPlayer(state) {
  const player = playerEntity(state);
  if (!player || !player.pos) return null;
  let bestId = null;
  let bestDist = Infinity;
  for (const sector of sectorRecords(state)) {
    for (const station of (sector && sector.stations) || []) {
      if (!station || !station.id) continue;
      const pos = stationPositionById(state, station.id);
      if (!pos) continue;
      const dist = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = station.id;
      }
    }
  }
  return bestId;
}

function heldCargoLots(state) {
  const hold = state && state.player && state.player.cargo;
  const items = hold && hold.items;
  if (!items || typeof items !== 'object') return [];
  const lots = [];
  for (const [commodityId, qtyRaw] of Object.entries(items)) {
    const qty = Math.max(0, Math.floor(Number(qtyRaw) || 0));
    if (!(qty > 0)) continue;
    lots.push({
      commodityId,
      units: qty,
      costBasis: 0,
      sellHint: 0,
      source: 'held',
    });
  }
  return lots;
}

function createRiskEstimator(state) {
  const pairMemo = new Map();
  return (originStationId, destinationStationId) => {
    const fromSectorId = originStationId === 'HERE'
      ? currentSectorId(state)
      : stationSectorIdById(state, originStationId);
    const toSectorId = destinationStationId === 'HERE'
      ? currentSectorId(state)
      : stationSectorIdById(state, destinationStationId);
    if (!fromSectorId || !toSectorId) return DEFAULT_RISK;
    const key = fromSectorId < toSectorId
      ? `${fromSectorId}|${toSectorId}`
      : `${toSectorId}|${fromSectorId}`;
    if (pairMemo.has(key)) return pairMemo.get(key);
    const a = sectorSignalFor(state, fromSectorId);
    const b = sectorSignalFor(state, toSectorId);
    const danger = ((clamp01(a && a.danger) + clamp01(b && b.danger)) * 0.5);
    const tier = Math.max(
      0,
      Number(effectiveDangerTierFor(state, fromSectorId)) || 0,
      Number(effectiveDangerTierFor(state, toSectorId)) || 0,
    );
    const risk = clamp01((danger * 0.74) + (clamp01(tier / 4) * 0.26));
    pairMemo.set(key, risk);
    return risk;
  };
}

export function buildTradeLanesModel(state, limit = 5, options = {}) {
  const nowS = Math.max(0, Number(state && state.simTime) || 0);
  const beacons = modelAndMemoryBeacons(state, nowS);
  const player = playerEntity(state);
  const cargoState = state && state.player && state.player.cargo;
  const cargoCapacity = Math.max(1, Number(cargoState && cargoState.capVolume)
    || (player && player.data && player.data.cargoCap) || 40);
  const speed = Math.max(50, (player && player.maxSpeed) || 200);
  const travelEstimator = (a, b) => {
    const pa = stationPositionById(state, a);
    const pb = stationPositionById(state, b);
    const dist = (pa && pb) ? Math.hypot(pa.x - pb.x, pa.z - pb.z) : 1000;
    return { timeS: dist / speed, fuel: dist * 0.01 };
  };

  const includeHeldCargo = options.includeHeldCargo !== false;
  const heldLots = includeHeldCargo ? heldCargoLots(state) : [];
  const hasHold = heldLots.length > 0;
  const fallbackStation = beacons[0] && beacons[0].stationId || null;
  const currentStation = hasHold ? 'HERE' : (nearestStationIdToPlayer(state) || fallbackStation);
  const heldCargo = hasHold ? {
    stationId: 'HERE',
    capturedAtS: nowS,
    reliability: 1,
    lots: heldLots,
  } : null;

  let routes = [];
  try {
    routes = rankTradeRoutes({
      beacons,
      cargoCapacity,
      currentStationId: currentStation,
      travelEstimator,
      riskEstimator: createRiskEstimator(state),
      nowS,
      heldCargo,
      sortBy: options.sortBy === 'safest' ? 'safest' : 'best',
    }) || [];
  } catch (_) {
    routes = [];
  }
  return routes.slice(0, Math.max(1, limit)).map((route) => {
    const source = route.originSynthetic
      ? 'HERE'
      : String(route.source || '').toLowerCase() === 'memory'
        ? 'MEMORY'
        : 'MODEL';
    return {
      ...route,
      source,
      originName: route.originSynthetic ? 'HERE (cargo hold)' : stationNameById(state, route.originId),
      destinationName: stationNameById(state, route.destinationId),
      commodityName: COMMODITY_NAME_BY_ID.get(route.commodityId) || route.commodityId,
      destSectorId: stationSectorIdById(state, route.destinationId),
      modelApprox: source === 'MODEL',
    };
  });
}

export const __cargoDeckInternals = Object.freeze({
  stationSectorIdById,
  stationPositionById,
  stationNameById,
  nearestStationIdToPlayer,
  heldCargoLots,
  createRiskEstimator,
  COMMODITY_BY_ID,
});
