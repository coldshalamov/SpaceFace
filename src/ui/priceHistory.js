// Price history recorder (UX-4). Maintains a per-station, per-commodity ring buffer of price
// snapshots so the market screen can draw real sparklines and expanded charts. Upgraded to capture
// longer horizons, event markers, and separate buy/sell/mid values.
//
// Storage: history[stationId][cmdtyId] = { mid, buy, sell, t, events }[] (newest last).
// Samples on every economy:tick so the buffer spans many minutes of sim time.
//
// A fresh game/load used to leave this buffer empty until enough live ticks accrued, so every
// graph fed by it drew a flat line right after starting. The economy already authors an
// authoritative, formula-seeded entry.history per listing (see systems/economy.js seedPriceHistory),
// so on new game / load / market open we backfill the ring buffer from that history. The buffer
// therefore shows a truthful price past on the first dock and keeps appending live ticks after.

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

const NOMINAL_SPREAD = 0.085; // matches economy SPREAD_BASE; used only when an entry has no quotes yet

function entrySpread(e) {
  return (e && e.lastMid > 0 && e.lastBuy > e.lastSell)
    ? (e.lastBuy - e.lastSell) / e.lastMid
    : NOMINAL_SPREAD;
}

// Build a ring-buffer point from a historical mid. Spread is carried from the entry's current quote
// (spread is near-constant per station), with buy/sell floored the same way economy.recomputePrices
// does so buy > sell > 0 always holds. The seeded past predates the pilot's clock (entry.history
// uses negative simTime for pre-campaign samples), but this UI buffer's invariant is t >= 0 and the
// charts position by array index, so clamp the timestamp at the origin.
function pointFromMid(mid, spread, t) {
  const buy = Math.max(1, Math.round(mid * (1 + spread / 2)));
  const sell = Math.max(1, Math.min(buy - 1, Math.round(mid * (1 - spread / 2))));
  return { mid: Math.round(mid), buy, sell, t: Math.max(0, Number(t) || 0), events: [] };
}

/** Backfill one station's ring buffer from the economy's formula-seeded entry.history. No-op once
 *  live ticks have populated the buffer (arr already non-empty) or when no seeded history exists. */
function seedStationFromHistory(state, stationId) {
  const market = state && state.economy && state.economy.markets && state.economy.markets[stationId];
  if (!market) return;
  for (const cid in market) {
    const e = market[cid];
    if (!e) continue;
    const arr = _buf(stationId, cid);
    if (arr.length) continue; // live data already present — never overwrite observed ticks
    const hist = Array.isArray(e.history) ? e.history : [];
    if (hist.length < 2) continue;
    const spread = entrySpread(e);
    for (const p of hist) {
      const mid = Number(p && (p.mid != null ? p.mid : p));
      if (!(mid > 0) || !isFinite(mid)) continue;
      arr.push(pointFromMid(mid, spread, p && p.t));
    }
    if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
  }
}

/** Wire the recorder to a bus. Call once at boot. */
export function initPriceHistory(bus, state) {
  if (!bus) return;

  // On new game / load the buffer is cleared, then reseeded from the economy's seeded entry.history
  // for any markets that already exist. Markets warmed later (first tick / market open) reseed then.
  const resetAndSeed = () => {
    for (const k in _history) delete _history[k];
    _tickCount = 0;
    const markets = state && state.economy && state.economy.markets;
    if (markets) for (const sid in markets) seedStationFromHistory(state, sid);
  };

  bus.on('economy:tick', () => {
    _tickCount++;
    const markets = state && state.economy && state.economy.markets;
    if (!markets) return;
    for (const stationId in markets) {
      // First tick after a reset: backfill a real price past before recording the live sample.
      seedStationFromHistory(state, stationId);
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
  // Opening a market seeds it immediately so the chart has a past before the first 5s tick lands.
  bus.on('economy:marketOpened', (p) => { if (p && p.stationId) seedStationFromHistory(state, p.stationId); });
  bus.on('game:new', resetAndSeed);
  bus.on('save:loaded', resetAndSeed);
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
