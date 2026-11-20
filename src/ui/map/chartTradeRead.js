// The chart's one read of prices (MAPS-2 Part B, Trade layer).
//
// Today it reads the player's market memory (src/ui/marketIntelligence.js: one remembered quote per
// station — buy, sell, when it was seen). The economy is being rebuilt into price trends broken by
// news events (design/overhaul/06_PROGRESSION_AND_ECONOMY.md §5.4); when that lands, only this file
// changes: return the same shape from the new model. The chart never reads economy state directly.
//
// sectorTradeRead(state, commodityId, sectors) → {
//   bySector: Map<sectorId, { buy, buyStationId, sell, sellStationId, trend: 'rising'|'falling'|'flat'|null }>,
//   arrow: { from, to, buy, sell, margin } | null   // best place to buy → best place to sell
// }
// `trend` is null when nothing says which way a price is moving (market memory has no history,
// only an optional previous sell): the chart then draws no trend arrow rather than inventing one.

import { knownStationQuotes } from '../marketIntelligence.js';

function stationSectorIndex(sectors) {
  const index = new Map();
  for (const sector of sectors || []) {
    for (const station of (sector && sector.stations) || []) {
      if (station && station.id) index.set(String(station.id), sector.id);
    }
  }
  return index;
}

function trendOf(quote, raw) {
  const prev = Number(raw && (raw.prevSell ?? raw.lastSell));
  const now = Number(quote && quote.sell);
  if (!Number.isFinite(prev) || !Number.isFinite(now) || prev <= 0) return null;
  const delta = (now - prev) / prev;
  if (delta > 0.03) return 'rising';
  if (delta < -0.03) return 'falling';
  return 'flat';
}

export function sectorTradeRead(state, commodityId, sectors) {
  const bySector = new Map();
  const memory = state && state.player && state.player.marketMemory;
  if (!memory || !commodityId) return { bySector, arrow: null };
  const nowS = Math.max(0, Number(state && state.simTime) || 0);
  const where = stationSectorIndex(sectors);
  for (const quote of knownStationQuotes(memory, commodityId, nowS) || []) {
    const sectorId = where.get(String(quote.stationId));
    if (!sectorId) continue;
    const raw = memory[quote.stationId] && memory[quote.stationId][commodityId];
    let row = bySector.get(sectorId);
    if (!row) { row = { buy: null, buyStationId: null, sell: null, sellStationId: null, trend: null }; bySector.set(sectorId, row); }
    if (quote.buy != null && (row.buy == null || quote.buy < row.buy)) { row.buy = quote.buy; row.buyStationId = quote.stationId; }
    if (quote.sell != null && (row.sell == null || quote.sell > row.sell)) {
      row.sell = quote.sell; row.sellStationId = quote.stationId; row.trend = trendOf(quote, raw);
    }
  }
  let cheapest = null;
  let dearest = null;
  for (const [sectorId, row] of bySector) {
    if (row.buy != null && (!cheapest || row.buy < cheapest.buy)) cheapest = { sectorId, buy: row.buy };
    if (row.sell != null && (!dearest || row.sell > dearest.sell)) dearest = { sectorId, sell: row.sell };
  }
  const arrow = cheapest && dearest && cheapest.sectorId !== dearest.sectorId && dearest.sell > cheapest.buy
    ? { from: cheapest.sectorId, to: dearest.sectorId, buy: cheapest.buy, sell: dearest.sell, margin: dearest.sell - cheapest.buy }
    : null;
  return { bySector, arrow };
}
