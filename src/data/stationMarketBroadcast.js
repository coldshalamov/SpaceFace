// stationMarketBroadcast.js — the dock-side PA reads the station's own market shelf. One current
// fact projected read-only from authoritative economy state (the rheaShiftBroadcast contract): no
// clock, no event replay, no saved latch, nothing written. The desk only speaks for stations that
// post a public market board — the blackmarket keeps "no manifests", the perimeter post keeps its
// watch voice.
//
// Thresholds are the market screen's own readings, so the line and the table can never disagree:
// sold out is marketStockStatus's stock < 2; high demand is the demand arc's demandMult > 1.08.
import { hash32 } from '../core/rng.js';
import { COMMODITIES } from './commodities.js';

const NAME_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c.name]));
/** marketStockStatus treats stock >= 2 as on the board; below that the shelf is bare. */
export const MARKET_BROADCAST_SOLD_OUT_STOCK = 2;
/** demandLevel reads demandMult > 1.08 as the high arc. */
export const MARKET_BROADCAST_HIGH_DEMAND = 1.08;
/** Station types whose desk would post a market line. The blackmarket posts no manifests and the
 *  military post speaks for its perimeter, not its pantry. */
const DESK_TYPES = new Set(['trade_hub', 'refinery', 'mining', 'fab', 'research']);

function notableFacts(state, stationId) {
  const table = state?.economy?.markets?.[stationId];
  if (!table || typeof table !== 'object') return [];
  const facts = [];
  for (const [commodityId, entry] of Object.entries(table)) {
    const name = NAME_BY_ID.get(commodityId);
    if (!name) continue;
    const stock = Number(entry?.stock);
    const demand = Number(entry?.demandMult);
    if (Number.isFinite(stock) && stock < MARKET_BROADCAST_SOLD_OUT_STOCK) {
      facts.push({
        id: `station:market:${stationId}:${commodityId}:sold-out`,
        severity: 2,
        text: `Market desk: ${name} is off the board. Nothing on the floor until the next barge.`,
      });
    } else if (Number.isFinite(demand) && demand > MARKET_BROADCAST_HIGH_DEMAND) {
      facts.push({
        id: `station:market:${stationId}:${commodityId}:demand`,
        severity: 1,
        text: `Market desk: ${name} is moving fast. The floor buyers are outbidding the board.`,
      });
    }
  }
  return facts;
}

/** The station's loudest current market fact, or null when the shelf is quiet. A sold-out good
 *  outranks a hot one; ties pick deterministically from the run seed and the cadence bucket, so
 *  the same broadcast speaks the same line everywhere (stationBroadcast's reproducibility law). */
export function stationMarketBroadcast(state, station, bucket = 0) {
  const data = station?.data || {};
  const stationId = data.stationId;
  if (!stationId || !DESK_TYPES.has(data.stationTypeId)) return null;
  const facts = notableFacts(state, stationId);
  if (!facts.length) return null;
  facts.sort((a, b) => b.severity - a.severity || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const topSeverity = facts[0].severity;
  const loudest = facts.filter((f) => f.severity === topSeverity);
  const roll = (hash32((state?.meta?.seed) || 0, String(stationId), bucket || 0) >>> 0) / 4294967296;
  return loudest[Math.min(loudest.length - 1, Math.floor(roll * loudest.length))];
}
