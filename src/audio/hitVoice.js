// One physical hit, one voice. Pure. Audio presentation only — no sim writes.

export const LAYER_GAP_MS = 40;
export const REMOTE_ENGINE_CAP = 6;
export const REMOTE_ENGINE_THROTTLE_MIN = 0.05;

const LAYER_RECIPE = Object.freeze({
  shield: 'sfx.shieldHit',
  armor: 'sfx.armorHit',
  hull: 'sfx.hullHit',
});

/** Shield collapse is owned by shieldDown. A tick is not a break. */
export function damageLayer(payload) {
  if (!payload || payload.brokeShield) return null;
  if (payload.shieldAbsorbed || Number(payload.shieldDamage) > 0 || payload.dominantLayer === 'shield') {
    return 'shield';
  }
  if (payload.dominantLayer === 'armor' || Number(payload.armorDamage) > 0 || payload.kind === 'armor') {
    return 'armor';
  }
  return 'hull';
}

export function layerRecipeId(layer) {
  return LAYER_RECIPE[layer] || null;
}

/**
 * Admit one layer voice per target. A second hit on the same pair inside the gap is dropped,
 * not pitched into a chord. `book` is a caller-owned map of key -> last time in ms.
 */
export function admitLayerVoice(book, targetId, layer, nowMs) {
  if (!book || targetId == null || !layer) return false;
  const key = String(targetId) + ':' + layer;
  const last = book[key];
  const now = Number(nowMs);
  if (!Number.isFinite(now)) return false;
  if (last != null && now - last < LAYER_GAP_MS) return false;
  book[key] = now;
  return true;
}

/**
 * Pitch ratio from closing speed. Positive closing (the source is approaching) raises pitch.
 * Missing velocities stay at 1. The band is narrow so a bad vector cannot chipmunk a sample.
 */
export function dopplerFactor(listenerPos, listenerVel, sourcePos, sourceVel) {
  if (!listenerPos || !sourcePos || !sourceVel) return 1;
  const lx = Number(listenerPos.x);
  const lz = Number(listenerPos.z);
  const sx = Number(sourcePos.x);
  const sz = Number(sourcePos.z);
  if (!Number.isFinite(lx) || !Number.isFinite(lz) || !Number.isFinite(sx) || !Number.isFinite(sz)) return 1;
  const dx = lx - sx;
  const dz = lz - sz;
  const dist = Math.hypot(dx, dz);
  if (!(dist >= 1)) return 1;
  const svx = Number(sourceVel.x);
  const svz = Number(sourceVel.z);
  if (!Number.isFinite(svx) || !Number.isFinite(svz)) return 1;
  const lvx = Number(listenerVel && listenerVel.x) || 0;
  const lvz = Number(listenerVel && listenerVel.z) || 0;
  const closing = ((svx - lvx) * dx + (svz - lvz) * dz) / dist;
  if (!Number.isFinite(closing)) return 1;
  const factor = 1 + closing / 900;
  if (factor < 0.88) return 0.88;
  if (factor > 1.12) return 1.12;
  return factor;
}

function idUnit(entityId) {
  if (typeof entityId === 'number' && Number.isFinite(entityId)) {
    const n = Math.abs(Math.trunc(entityId));
    return ((n * 17) % 100) / 100;
  }
  const text = String(entityId || '');
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash + text.charCodeAt(i) * (i + 1)) % 100;
  return hash / 100;
}

/** Mass class sets the center. The id hash spreads identical hulls by ±3% so they do not phase. */
export function remoteEnginePlaybackRate(entityId, mass) {
  const m = Number(mass);
  let rate = 1;
  if (Number.isFinite(m) && m >= 110) rate = 0.78;
  else if (Number.isFinite(m) && m <= 32) rate = 1.18;
  const detune = 1 + (idUnit(entityId) - 0.5) * 0.06;
  const out = rate * detune;
  if (out < 0.75) return 0.75;
  if (out > 1.25) return 1.25;
  return out;
}

/**
 * Nearest thrusting glass-tier ships, capped. `rows` are { id, dist, throttle, exact }.
 * Returns the chosen rows in near-to-far order. Does not allocate when `out` is supplied.
 */
export function pickRemoteEngines(rows, cap = REMOTE_ENGINE_CAP, out = null) {
  const chosen = out || [];
  chosen.length = 0;
  if (!Array.isArray(rows) || rows.length === 0) return chosen;
  const limit = cap > 0 ? cap : 0;
  const pool = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.exact !== true) continue;
    if (!(Number(row.throttle) >= REMOTE_ENGINE_THROTTLE_MIN)) continue;
    if (!(Number(row.dist) >= 0)) continue;
    pool.push(row);
  }
  pool.sort((a, b) => a.dist - b.dist);
  const n = Math.min(limit, pool.length);
  for (let i = 0; i < n; i++) chosen.push(pool[i]);
  return chosen;
}
