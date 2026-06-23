// Price history recorder (UX-4). Maintains a per-station, per-commodity ring buffer of mid-price
// snapshots so the market screen can draw real sparklines instead of misleading base-price "heat".
//
// This is deliberately a STANDALONE module that only SUBSCRIBES to economy events — it never touches
// economy.js or sim state. The history lives in module scope (ephemeral, not saved) and accumulates
// from the moment the game boots. That's a real, honest trend: you see where the price has actually
// been this session, not a static basePrice comparison.
//
// Storage: history[stationId][commodityId] = number[] (mid prices, newest last, capped at MAX_POINTS).
// We sample on economy:tick (cadence ~ every few sim seconds) rather than every frame.

const MAX_POINTS = 32;          // ring buffer depth — enough for a readable sparkline, cheap to hold
const SAMPLE_EVERY_TICKS = 3;   // sample every Nth economy tick so the buffer spans more wall-time

const _history = Object.create(null);   // stationId -> { cmdtyId -> number[] }
let _tickCount = 0;

function _buf(stationId, cmdtyId) {
  let byStation = _history[stationId];
  if (!byStation) { byStation = Object.create(null); _history[stationId] = byStation; }
  let arr = byStation[cmdtyId];
  if (!arr) { arr = []; byStation[cmdtyId] = arr; }
  return arr;
}

/** Wire the recorder to a bus. Call once at boot (from the UI system or main.js). */
export function initPriceHistory(bus, state) {
  if (!bus) return;
  bus.on('economy:tick', () => {
    _tickCount++;
    if ((_tickCount % SAMPLE_EVERY_TICKS) !== 0) return;
    const markets = state && state.economy && state.economy.markets;
    if (!markets) return;
    for (const stationId in markets) {
      const market = markets[stationId];
      for (const cid in market) {
        const e = market[cid];
        const mid = e && (e.lastMid != null ? e.lastMid : (e.lastBuy != null && e.lastSell != null ? (e.lastBuy + e.lastSell) / 2 : null));
        if (mid == null || !isFinite(mid)) continue;
        const arr = _buf(stationId, cid);
        arr.push(mid);
        if (arr.length > MAX_POINTS) arr.shift();
      }
    }
  });
  // clear on new game / load so stale history from a previous session doesn't bleed in
  bus.on('game:new', () => { for (const k in _history) delete _history[k]; });
  bus.on('save:loaded', () => { for (const k in _history) delete _history[k]; });
}

/**
 * Get the price series for a station+commodity (newest last). Returns [] if none recorded yet.
 * @returns {number[]}
 */
export function getPriceHistory(stationId, cmdtyId) {
  const byStation = _history[stationId];
  if (!byStation) return [];
  const arr = byStation[cmdtyId];
  return arr ? arr.slice() : [];
}
