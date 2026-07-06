// Price history recorder (UX-4). Maintains a per-station, per-commodity ring buffer of price
// snapshots so the market screen can draw real sparklines and expanded charts. Upgraded to capture
// longer horizons, event markers, and separate buy/sell/mid values.
//
// Storage: history[stationId][cmdtyId] = { mid, buy, sell, t, events }[] (newest last).
// Samples on every economy:tick so the buffer spans many minutes of sim time.

const MAX_POINTS = 256;

const _history = Object.create(null);   // stationId -> { cmdtyId -> PricePoint[] }
let _tickCount = 0;

function _buf(stationId, cmdtyId) {
  let byStation = _history[stationId];
  if (!byStation) { byStation = Object.create(null); _history[stationId] = byStation; }
  let arr = byStation[cmdtyId];
  if (!arr) { arr = []; byStation[cmdtyId] = arr; }
  return arr;
}

function activeEventIds(state, stationId, cmdtyId) {
  const events = state && state.economy && state.economy.econEvents;
  if (!events) return [];
  const out = [];
  for (const ev of events) {
    if (ev.stationId !== stationId) continue;
    if (ev.commodityId !== '*' && ev.commodityId !== cmdtyId) continue;
    out.push(ev.id);
  }
  return out;
}

/** Wire the recorder to a bus. Call once at boot. */
export function initPriceHistory(bus, state) {
  if (!bus) return;
  bus.on('economy:tick', () => {
    _tickCount++;
    const markets = state && state.economy && state.economy.markets;
    if (!markets) return;
    for (const stationId in markets) {
      const market = markets[stationId];
      for (const cid in market) {
        const e = market[cid];
        const mid = e && (e.lastMid != null ? e.lastMid : (e.lastBuy != null && e.lastSell != null ? (e.lastBuy + e.lastSell) / 2 : null));
        if (mid == null || !isFinite(mid)) continue;
        const arr = _buf(stationId, cid);
        arr.push({
          mid: Math.round(mid),
          buy: Math.round(e.lastBuy != null ? e.lastBuy : mid),
          sell: Math.round(e.lastSell != null ? e.lastSell : mid),
          t: Math.max(0, state.simTime || 0),
          events: activeEventIds(state, stationId, cid),
        });
        if (arr.length > MAX_POINTS) arr.shift();
      }
    }
  });
  bus.on('game:new', () => { for (const k in _history) delete _history[k]; _tickCount = 0; });
  bus.on('save:loaded', () => { for (const k in _history) delete _history[k]; _tickCount = 0; });
}

/** Get the price series for a station+commodity (newest last). Returns [] if none. */
export function getPriceHistory(stationId, cmdtyId, maxAgeS = Infinity) {
  const byStation = _history[stationId];
  if (!byStation) return [];
  const arr = byStation[cmdtyId];
  if (!arr) return [];
  if (!Number.isFinite(maxAgeS) || maxAgeS <= 0) return arr.slice();
  const now = arr.length ? arr[arr.length - 1].t : 0;
  return arr.filter((p) => (now - p.t) <= maxAgeS);
}

/** Export history so UI can persist/inspect it. */
export function snapshotHistory() {
  const out = {};
  for (const sid in _history) {
    out[sid] = {};
    for (const cid in _history[sid]) {
      out[sid][cid] = _history[sid][cid].slice();
    }
  }
  return out;
}

/** Import history (e.g., after save load if we later persist it). */
export function loadHistory(data) {
  for (const k in _history) delete _history[k];
  for (const sid in data || {}) {
    _history[sid] = {};
    for (const cid in data[sid]) {
      _history[sid][cid] = data[sid][cid].slice();
    }
  }
}
