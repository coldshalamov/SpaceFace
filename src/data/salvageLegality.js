// salvageLegality.js - BP-01.1 SALVAGE_PERMIT_AND_FINES data contract.
//
// Pure helpers only. The economy scanner already treats commodity legality as the law surface; this
// file maps classified/military wreck salvage to a restricted salvage commodity so runScan can reuse
// its shipped fine/confiscation path.

import { SECTORS } from './sectors.js';
import { wreckClassById } from './wreckClasses.js';

export const COMMON_SALVAGE_COMMODITY_ID = 'cmdty_salvage_electronics';
export const CLASSIFIED_SALVAGE_COMMODITY_ID = 'cmdty_classified_salvage';

const BLACKMARKET_STATIONS = new Set();
for (const sector of SECTORS) {
  for (const station of (sector.stations || [])) {
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
