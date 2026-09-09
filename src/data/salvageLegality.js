// salvageLegality.js - BP-01.1 SALVAGE_PERMIT_AND_FINES data contract.
//
// Pure helpers only. The economy scanner already treats commodity legality as the law surface; this
// file maps classified/military wreck salvage to a restricted salvage commodity so runScan can reuse
// its shipped fine/confiscation path.

import { COMMODITIES } from './commodities.js';
import { SECTORS } from './sectors.js';
import { wreckClassById } from './wreckClasses.js';

export const COMMON_SALVAGE_COMMODITY_ID = 'cmdty_salvage_electronics';
export const CLASSIFIED_SALVAGE_COMMODITY_ID = 'cmdty_classified_salvage';

/** PQ-151.02 — dock cut for washing papers. Reputation with the port's faction pays it down. */
export const LAUNDER_CUT_BASE_FRAC = 0.35;
export const LAUNDER_CUT_MIN_FRAC = 0.10;
export const LAUNDER_DOCK_RANGE = 200;
export const LAUNDER_LEDGER_MAX = 16;

const BLACKMARKET_STATIONS = new Set();
const STATION_BY_ID = new Map();
const COMMODITY_BY_ID = new Map((COMMODITIES || []).map((row) => [row.id, row]));
for (const sector of SECTORS) {
  for (const station of (sector.stations || [])) {
    STATION_BY_ID.set(station.id, station);
    if (station.type === 'blackmarket' || (station.services || []).includes('black_market')) {
      BLACKMARKET_STATIONS.add(station.id);
    }
  }
}

export function restrictedSalvageForWreck(wreck) {
  const data = wreck && wreck.data || {};
  if (data.parentType === 'military') return true;
  const cls = wreckClassById(data.wreckClass);
  return !!(cls && cls.restricted);
}

export function salvagePoolForWreck(wreck, basePool = {}) {
  const out = { ...(basePool || {}) };
  if (!restrictedSalvageForWreck(wreck)) return out;

  const electronics = Math.max(0, Math.floor(out[COMMON_SALVAGE_COMMODITY_ID] || 0));
  if (electronics > 0) delete out[COMMON_SALVAGE_COMMODITY_ID];
  out[CLASSIFIED_SALVAGE_COMMODITY_ID] = (out[CLASSIFIED_SALVAGE_COMMODITY_ID] || 0) + Math.max(1, electronics);
  return out;
}

export function canLaunderSalvageAtStation(stationOrId) {
  if (!stationOrId) return false;
  if (typeof stationOrId === 'string') return BLACKMARKET_STATIONS.has(stationOrId);
  return stationOrId.type === 'blackmarket' || (stationOrId.services || []).includes('black_market');
}

export function launderedSalvageCommodityId(commodityId, stationOrId) {
  if (commodityId !== CLASSIFIED_SALVAGE_COMMODITY_ID) return commodityId;
  return canLaunderSalvageAtStation(stationOrId) ? COMMON_SALVAGE_COMMODITY_ID : commodityId;
}

export function stationRecordById(stationId) {
  if (typeof stationId !== 'string' || !stationId) return null;
  return STATION_BY_ID.get(stationId) || null;
}

export function commodityCatalogLegality(commodityId) {
  const def = COMMODITY_BY_ID.get(commodityId);
  return (def && def.legality) || 'legal';
}

/** Hot cargo the Quiet will wash: contraband pods, plus classified salvage they remap. */
export function isHotLaunderCargo(commodityId, legality) {
  if (legality === 'legal') return false;
  if (commodityId === CLASSIFIED_SALVAGE_COMMODITY_ID) return true;
  return commodityCatalogLegality(commodityId) === 'contraband';
}

export function launderCutFrac(rep) {
  const t = Math.max(0, Math.min(1, (Number(rep) || 0) / 1000));
  return LAUNDER_CUT_BASE_FRAC - (LAUNDER_CUT_BASE_FRAC - LAUNDER_CUT_MIN_FRAC) * t;
}

export function cargoValueCredits(commodityId, amount) {
  const def = COMMODITY_BY_ID.get(commodityId);
  const price = def && Number.isFinite(def.basePrice) ? def.basePrice : 0;
  const qty = Math.max(0, Math.floor(Number(amount) || 0));
  return Math.max(0, Math.round(price * qty));
}

export function launderCutCredits(commodityId, amount, rep) {
  const value = cargoValueCredits(commodityId, amount);
  if (value <= 0) return 0;
  return Math.max(1, Math.round(value * launderCutFrac(rep)));
}

/**
 * Wash papers on a field pod. Classified salvage remaps through the existing helper;
 * contraband keeps its commodity and gets a legal stamp the customs cone already honors.
 */
export function applyLaunderStamp(data, stationOrId) {
  if (!data || !canLaunderSalvageAtStation(stationOrId)) return null;
  const fromId = data.commodityId;
  if (!isHotLaunderCargo(fromId, data.legality)) return null;
  const toId = launderedSalvageCommodityId(fromId, stationOrId);
  data.commodityId = toId;
  if (data.salvagePool && typeof data.salvagePool === 'object' && fromId !== toId) {
    const qty = Math.max(0, Math.floor(Number(data.salvagePool[fromId]) || Number(data.amount) || 0));
    delete data.salvagePool[fromId];
    if (qty > 0) data.salvagePool[toId] = (data.salvagePool[toId] || 0) + qty;
  }
  data.legality = 'legal';
  data.laundered = true;
  const stationId = typeof stationOrId === 'string'
    ? stationOrId
    : (stationOrId && stationOrId.id);
  if (stationId) data.launderedAtStationId = stationId;
  if (data.cargoIdentity && typeof data.cargoIdentity === 'object') {
    data.cargoIdentity = { ...data.cargoIdentity, commodityId: toId };
  }
  return { fromId, toId, amount: Math.max(0, Math.floor(Number(data.amount) || 0)) };
}
