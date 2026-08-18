// freightCausality.js — ECON-P2 freight embodiment + conservation (pure).
//
// Live freighters carry deterministic cargo manifests drawn from existing market keys.
// Arrival / loss are *owner-safe intents* (bus recipes) — this module never writes
// credits, cargo, stock, rep, or heat. Economy remains the sole stock writer via
// aiTrader:requestTrade / economy:applyTradePressure; news is presentation-only.
//
// Conservation (pressure-share recipe):
//   liveShare + abstractShare ≤ old abstract baseline volume, always.
// When live freighters are present, abstract sectorSim pressure is scaled down so
// embodied + offscreen flow cannot double-count the same lane budget.
//
// Determinism: hash32 + mulberry32 only. No Math.random, no Date/wall-clock, no DOM.

import { hash32, mulberry32 } from '../core/rng.js';

export const FREIGHT_SCHEMA_ID = 'spaceface.freightCausality.v1';
export const FREIGHT_SCHEMA_VERSION = 1;

/** Named causes attached to intents / news payloads (machine-traceable). */
export const FREIGHT_CAUSE = Object.freeze({
  ARRIVAL: 'freight_arrival',
  LOSS: 'freight_loss',
  PRESSURE_SHARE: 'freight_pressure_share',
  ABSTRACT_LANE: 'sector_field',
});

/** Intent recipe kinds (not live entity types). */
export const FREIGHT_INTENT_KIND = Object.freeze({
  ARRIVAL: 'freight_arrival',
  LOSS: 'freight_loss',
});

/** Fallback market keys when a station market is empty/unbuilt — mirrors sectorSim defaults. */
export const FREIGHT_MARKET_KEYS_FALLBACK = Object.freeze([
  'cmdty_ore_iron',
  'cmdty_ore_copper',
  'cmdty_food',
  'cmdty_fuel_cells',
  'cmdty_scrap_metal',
]);

/** Roles that haul tradeable cargo (match traffic.js trading roles). */
export const FREIGHT_TRADING_ROLES = Object.freeze([
  'hauler',
  'courier',
  'miner',
  'ore_carrier',
  'smuggler',
  'express',
]);

const ROLE_CAPACITY = Object.freeze({
  hauler: 28,
  courier: 12,
  miner: 20,
  ore_carrier: 36,
  smuggler: 14,
  express: 28,
  patrol: 0,
  escort: 0,
  pirate: 0,
  rescue: 0,
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ── identity ────────────────────────────────────────────────────────────────────────────────

/** Stable freighter manifest / intent id (uint32 hex tag). */
export function stableFreightTag(...parts) {
  return (hash32(...parts.map((p) => String(p == null ? '' : p))) >>> 0).toString(16);
}

export function stableManifestId(seed, freighterKey, role) {
  return `fm_${stableFreightTag(seed >>> 0 || 1, 'manifest', freighterKey, role || 'hauler')}`;
}

export function stableArrivalIntentId(seed, freighterKey, stationId, dockSeq) {
  return `fa_${stableFreightTag(seed >>> 0 || 1, 'arrival', freighterKey, stationId, dockSeq | 0)}`;
}

export function stableLossIntentId(seed, freighterKey, tickOrSeq) {
  return `fl_${stableFreightTag(seed >>> 0 || 1, 'loss', freighterKey, tickOrSeq | 0)}`;
}

// ── market keys ─────────────────────────────────────────────────────────────────────────────

/**
 * Collect sorted market commodity keys from a station market object (or array).
 * Pure. Unknown / empty → FREIGHT_MARKET_KEYS_FALLBACK copy.
 */
export function marketKeysFrom(market) {
  let keys;
  if (Array.isArray(market)) {
    keys = market.filter((k) => typeof k === 'string' && k.length > 0);
  } else if (market && typeof market === 'object') {
    keys = Object.keys(market).filter((k) => typeof k === 'string' && k.length > 0);
  } else {
    keys = [];
  }
  if (!keys.length) keys = FREIGHT_MARKET_KEYS_FALLBACK.slice();
  return keys.slice().sort((a, b) => a.localeCompare(b));
}

// ── cargo manifest ──────────────────────────────────────────────────────────────────────────

/**
 * Deterministic cargo manifest for one freighter.
 * Picks 1–3 lines from existing market keys; qty bounded by role capacity.
 *
 * @param {object} opts
 * @param {number|string} [opts.seed]
 * @param {string} opts.freighterKey stable identity (worldRecordId / traffic key / entity id)
 * @param {string} [opts.role] traffic role
 * @param {object|string[]} [opts.market] station market map or key list
 * @param {string[]} [opts.marketKeys] pre-sorted keys (wins over market)
 * @param {number} [opts.capacity] override role capacity
 * @returns {object} serializable manifest
 */
export function buildCargoManifest(opts = {}) {
  const seed = (opts.seed >>> 0) || 1;
  const freighterKey = String(opts.freighterKey || opts.freighterId || 'freighter');
  const role = String(opts.role || 'hauler');
  const keys = Array.isArray(opts.marketKeys) && opts.marketKeys.length
    ? opts.marketKeys.slice().sort((a, b) => a.localeCompare(b))
    : marketKeysFrom(opts.market);

  const capacity = Number.isFinite(opts.capacity)
    ? Math.max(0, Math.floor(opts.capacity))
    : (ROLE_CAPACITY[role] != null ? ROLE_CAPACITY[role] : 18);

  const manifestId = stableManifestId(seed, freighterKey, role);
  if (capacity <= 0 || !FREIGHT_TRADING_ROLES.includes(role) && capacity === 0) {
    return {
      schemaId: FREIGHT_SCHEMA_ID,
      schemaVersion: FREIGHT_SCHEMA_VERSION,
      manifestId,
      freighterKey,
      role,
      lines: [],
      totalQty: 0,
    };
  }
  // Non-trading roles still get empty manifests (scanners may read trafficRole alone).
  if (!FREIGHT_TRADING_ROLES.includes(role)) {
    return {
      schemaId: FREIGHT_SCHEMA_ID,
      schemaVersion: FREIGHT_SCHEMA_VERSION,
      manifestId,
      freighterKey,
      role,
      lines: [],
      totalQty: 0,
    };
  }

  const rng = mulberry32(hash32(seed, 'freightManifest', freighterKey, role));
  const lineCount = 1 + Math.floor(rng() * Math.min(3, keys.length));
  const pickPool = keys.slice();
  const lines = [];
  let remaining = capacity;

  for (let i = 0; i < lineCount && remaining > 0 && pickPool.length; i++) {
    const idx = Math.floor(rng() * pickPool.length);
    const commodityId = pickPool.splice(idx, 1)[0];
    const maxForLine = Math.max(1, Math.floor(remaining / (lineCount - i)));
    const qty = Math.max(1, 1 + Math.floor(rng() * maxForLine));
    const use = Math.min(qty, remaining);
    lines.push({ commodityId, qty: use });
    remaining -= use;
  }

  lines.sort((a, b) => a.commodityId.localeCompare(b.commodityId));
  let totalQty = 0;
  for (const line of lines) totalQty += line.qty;

  return {
    schemaId: FREIGHT_SCHEMA_ID,
    schemaVersion: FREIGHT_SCHEMA_VERSION,
    manifestId,
    freighterKey,
    role,
    lines,
    totalQty,
  };
}

/** Sum totalQty over manifests / freighter records. Pure. */
export function estimateLiveVolume(freightersOrManifests) {
  if (!Array.isArray(freightersOrManifests)) return 0;
  let sum = 0;
  for (const item of freightersOrManifests) {
    if (!item) continue;
    if (typeof item.totalQty === 'number') {
      sum += Math.max(0, item.totalQty | 0);
      continue;
    }
    const m = item.manifest || item.cargoManifest || item.data && item.data.cargoManifest;
    if (m && typeof m.totalQty === 'number') {
      sum += Math.max(0, m.totalQty | 0);
      continue;
    }
    if (m && Array.isArray(m.lines)) {
      for (const line of m.lines) sum += Math.max(0, (line && line.qty) | 0);
    }
  }
  return sum;
}

/**
 * Live freighter volume for a sector from game state (read-only).
 * Only trading freighters with manifests count. Pure over state snapshot.
 */
export function liveVolumeForSector(state, sectorId) {
  if (!state) return 0;
  const currentId = state.world && state.world.currentSectorId;
  // Live traffic is view-gated to the current sector; offscreen sectors have zero live volume.
  if (sectorId && currentId && sectorId !== currentId) return 0;
  const list = state.traffic && Array.isArray(state.traffic.freighters)
    ? state.traffic.freighters
    : [];
  const manifests = [];
  for (const rec of list) {
    if (!rec) continue;
    const role = rec.role || (rec.manifest && rec.manifest.role);
    if (role && !FREIGHT_TRADING_ROLES.includes(role)) continue;
    if (rec.manifest) {
      manifests.push(rec.manifest);
      continue;
    }
    const ent = state.entities && state.entities.get && state.entities.get(rec.id);
    if (ent && ent.data && ent.data.cargoManifest) manifests.push(ent.data.cargoManifest);
  }
  return estimateLiveVolume(manifests);
}

// ── pressure-share conservation ─────────────────────────────────────────────────────────────

/**
 * Bounded pressure-share recipe.
 * liveShare + abstractShare ≤ baselineVolume (old abstract-only budget). Always.
 *
 * @param {object} opts
 * @param {number} opts.baselineVolume old abstract lane volume (pre-embodiment)
 * @param {number} opts.liveVolume desired live freighter volume this window
 * @returns {object} serializable recipe with scales for both channels
 */
export function pressureShareRecipe(opts = {}) {
  const baselineVolume = Math.max(0, Math.round(Number(opts.baselineVolume) || 0));
  const liveVolumeWanted = Math.max(0, Math.round(Number(opts.liveVolume) || 0));
  const liveShare = Math.min(liveVolumeWanted, baselineVolume);
  const abstractShare = Math.max(0, baselineVolume - liveShare);
  const liveScale = liveVolumeWanted > 0 ? liveShare / liveVolumeWanted : 0;
  const abstractScale = baselineVolume > 0 ? abstractShare / baselineVolume : 0;
  const totalVolume = liveShare + abstractShare;

  return {
    schemaId: FREIGHT_SCHEMA_ID,
    schemaVersion: FREIGHT_SCHEMA_VERSION,
    cause: liveShare > 0 ? FREIGHT_CAUSE.PRESSURE_SHARE : FREIGHT_CAUSE.ABSTRACT_LANE,
    baselineVolume,
    liveVolumeWanted,
    liveShare,
    abstractShare,
    liveScale,
    abstractScale,
    totalVolume,
    // Invariant helpers for tests / callers
    withinBudget: totalVolume <= baselineVolume + 1e-9,
  };
}

/**
 * Old abstract baseline matching sectorSim pre-P2 formula for one station window.
 * total = round(|lanePressure| * 72 * days); per-good share = max(1, round(total/goodsCount)).
 * Baseline volume = sum of per-good shares (= the old abstract units emitted).
 */
export function abstractBaselineVolume({ lanePressure, days, goodsCount }) {
  const n = Math.max(1, Math.floor(Number(goodsCount) || 1));
  const total = Math.round(Math.abs(Number(lanePressure) || 0) * 72 * (Number(days) || 0));
  if (total <= 0) return 0;
  const share = Math.max(1, Math.round(total / n));
  return share * n;
}

/**
 * Scale integer volume units by abstractScale, preserving sign. Pure.
 * Zero scale → 0; tiny non-zero baseline with positive scale keeps at least 1 when |vol|>=1 input.
 */
export function scaleVolume(vol, scale) {
  const v = Number(vol) || 0;
  const s = clamp(Number(scale) || 0, 0, 1);
  if (v === 0 || s <= 0) return 0;
  const signed = v < 0 ? -1 : 1;
  const mag = Math.abs(v);
  const scaled = Math.round(mag * s);
  if (scaled <= 0) return 0;
  return signed * scaled;
}

// ── owner-safe intents ──────────────────────────────────────────────────────────────────────

/**
 * Arrival intent: freighter docks and offloads manifest (stock-pressure trades, sell side).
 * Does not mutate economy — caller emits aiTrader:requestTrade per line.
 */
export function buildArrivalIntent(opts = {}) {
  const seed = (opts.seed >>> 0) || 1;
  const freighterKey = String(opts.freighterKey || opts.freighterId || 'freighter');
  const stationId = opts.stationId != null ? String(opts.stationId) : null;
  const sectorId = opts.sectorId != null ? String(opts.sectorId) : null;
  const dockSeq = opts.dockSeq | 0;
  const manifest = opts.manifest || buildCargoManifest(opts);
  const liveScale = Number.isFinite(opts.liveScale) ? clamp(opts.liveScale, 0, 1) : 1;
  const intentId = opts.intentId || stableArrivalIntentId(seed, freighterKey, stationId, dockSeq);

  const trades = [];
  for (const line of (manifest.lines || [])) {
    if (!line || !line.commodityId) continue;
    const qty = Math.max(0, Math.round((line.qty || 0) * liveScale));
    if (qty <= 0) continue;
    trades.push({
      stationId,
      commodityId: line.commodityId,
      side: 'sell', // delivery adds stock
      qty,
    });
  }

  return {
    schemaId: FREIGHT_SCHEMA_ID,
    schemaVersion: FREIGHT_SCHEMA_VERSION,
    intentId,
    kind: FREIGHT_INTENT_KIND.ARRIVAL,
    cause: FREIGHT_CAUSE.ARRIVAL,
    freighterKey,
    freighterId: opts.freighterId != null ? opts.freighterId : null,
    stationId,
    sectorId,
    dockSeq,
    manifestId: manifest.manifestId || null,
    lotId: manifest.lotId || manifest.manifestId || null,
    lotSource: manifest.lotSource ? { ...manifest.lotSource } : null,
    trades,
    totalQty: trades.reduce((s, t) => s + t.qty, 0),
    source: 'traffic_live',
  };
}

/**
 * Loss intent: freighter destroyed with cargo — scarcity pressure (buy/drain) + news cause.
 * Does not mutate economy — caller emits economy:applyTradePressure per line.
 */
export function buildLossIntent(opts = {}) {
  const seed = (opts.seed >>> 0) || 1;
  const freighterKey = String(opts.freighterKey || opts.freighterId || 'freighter');
  const stationId = opts.stationId != null ? String(opts.stationId) : null;
  const sectorId = opts.sectorId != null ? String(opts.sectorId) : null;
  const seq = opts.seq != null ? opts.seq : (opts.tick | 0);
  const manifest = opts.manifest || buildCargoManifest(opts);
  const intentId = opts.intentId || stableLossIntentId(seed, freighterKey, seq);

  const pressures = [];
  for (const line of (manifest.lines || [])) {
    if (!line || !line.commodityId) continue;
    const qty = Math.max(0, line.qty | 0);
    if (qty <= 0) continue;
    // vol < 0 → buy side in economy:applyTradePressure → drains stock → scarcity
    pressures.push({
      stationId,
      good: line.commodityId,
      commodityId: line.commodityId,
      vol: -qty,
      sectorId,
      source: FREIGHT_CAUSE.LOSS,
      cause: FREIGHT_CAUSE.LOSS,
    });
  }

  const primary = (manifest.lines && manifest.lines[0] && manifest.lines[0].commodityId) || null;

  return {
    schemaId: FREIGHT_SCHEMA_ID,
    schemaVersion: FREIGHT_SCHEMA_VERSION,
    intentId,
    kind: FREIGHT_INTENT_KIND.LOSS,
    cause: FREIGHT_CAUSE.LOSS,
    freighterKey,
    freighterId: opts.freighterId != null ? opts.freighterId : null,
    stationId,
    sectorId,
    killerId: opts.killerId != null ? opts.killerId : null,
    manifestId: manifest.manifestId || null,
    lotId: manifest.lotId || manifest.manifestId || null,
    lotSource: manifest.lotSource ? { ...manifest.lotSource } : null,
    pressures,
    totalQty: pressures.reduce((s, p) => s + Math.abs(p.vol), 0),
    primaryCommodityId: primary,
    source: 'traffic_live',
    news: buildFreightNewsPayload({
      kind: FREIGHT_CAUSE.LOSS,
      stationId,
      commodityId: primary,
      cause: FREIGHT_CAUSE.LOSS,
      intentId,
      sectorId,
      freighterKey,
    }),
  };
}

/**
 * Named news payload for marketNews / news:headline consumers.
 * Uses newsTemplates kinds freight_loss / freight_arrival.
 */
export function buildFreightNewsPayload(opts = {}) {
  const kind = opts.kind === FREIGHT_CAUSE.ARRIVAL || opts.kind === 'freight_arrival'
    ? 'freight_arrival'
    : 'freight_loss';
  return {
    type: kind,
    kind,
    stationId: opts.stationId != null ? String(opts.stationId) : null,
    commodityId: opts.commodityId != null ? String(opts.commodityId) : null,
    cause: opts.cause || kind,
    intentId: opts.intentId || null,
    sectorId: opts.sectorId != null ? String(opts.sectorId) : null,
    freighterKey: opts.freighterKey != null ? String(opts.freighterKey) : null,
    source: 'freight_causality',
  };
}

// ── idempotency ledger (plain serializable arrays) ──────────────────────────────────────────

/**
 * Filter intents whose intentId is not yet in the applied ledger.
 * Pure — does not mutate applied.
 */
export function filterNewFreightIntents(intents, applied) {
  const set = toIdSet(applied);
  const out = [];
  for (const it of (Array.isArray(intents) ? intents : [])) {
    if (!it || !it.intentId) continue;
    if (set.has(it.intentId)) continue;
    out.push(it);
  }
  return out;
}

/** Merge applied intent ids into a capped sorted array (save-safe). */
export function mergeAppliedFreightIds(previous, newIntents, cap = 512) {
  const set = toIdSet(previous);
  for (const it of (Array.isArray(newIntents) ? newIntents : [])) {
    if (it && it.intentId) set.add(String(it.intentId));
    else if (typeof it === 'string') set.add(it);
  }
  const ids = Array.from(set).sort();
  if (ids.length > cap) return ids.slice(ids.length - cap);
  return ids;
}

// ── serialization / audit ───────────────────────────────────────────────────────────────────

/** True if value is JSON-serializable plain data (no fn, Map, Set, undefined holes as keys). */
export function isPlainSerializable(value, depth = 0) {
  if (depth > 12) return false;
  if (value === null) return true;
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return true;
  if (t === 'number') return Number.isFinite(value) || value === Infinity || value === -Infinity;
  if (t === 'undefined' || t === 'function' || t === 'symbol' || t === 'bigint') return false;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!isPlainSerializable(value[i], depth + 1)) return false;
    }
    return true;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    return false;
  }
  for (const k of Object.keys(value)) {
    if (!isPlainSerializable(value[k], depth + 1)) return false;
  }
  return true;
}

/** Canonical stable serialization (sorted object keys). Pure. */
export function stableSerialize(value) {
  if (value === null || value === undefined) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(value)) return String(value);
    const n = Object.is(value, -0) ? 0 : value;
    return String(n);
  }
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    let out = '[';
    for (let i = 0; i < value.length; i++) {
      if (i) out += ',';
      out += stableSerialize(value[i]);
    }
    return out + ']';
  }
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    let out = '{';
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = value[k];
      if (v === undefined || typeof v === 'function') continue;
      if (out.length > 1) out += ',';
      out += JSON.stringify(k) + ':' + stableSerialize(v);
    }
    return out + '}';
  }
  return JSON.stringify(String(value));
}

export function freightDigest(intentsOrManifests) {
  const list = Array.isArray(intentsOrManifests) ? intentsOrManifests.slice() : [];
  list.sort((a, b) => {
    const ka = String((a && (a.intentId || a.manifestId)) || '');
    const kb = String((b && (b.intentId || b.manifestId)) || '');
    return ka.localeCompare(kb);
  });
  return hash32(...list.map((x) => stableSerialize(x))) >>> 0;
}

// ── internals ───────────────────────────────────────────────────────────────────────────────

function toIdSet(applied) {
  if (!applied) return new Set();
  if (applied instanceof Set) return new Set(applied);
  if (Array.isArray(applied)) return new Set(applied.map(String));
  if (typeof applied === 'object') return new Set(Object.keys(applied));
  return new Set();
}
