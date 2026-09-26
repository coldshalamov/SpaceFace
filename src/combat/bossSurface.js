// Boss surface contact verdicts (PQ-133.04 R4 / CRU-031).
//
// A target carrying boss-surface authoring (the Mirrorjaw Foreman's authored mirror prow) is a
// SURFACE, not just an armor table: within the authored prow arc an eligible ricochet shot banks
// off the plate; outside the arc the contact is ordinary armor and the shot is consumed through
// the normal damage pipeline. This module resolves that verdict per contact.
//
// Pure: same inputs -> same verdict. No RNG, no wall clock, no Three.js, no bus, no DOM. The arc
// convention is the one resolveDirectionalArmor already established (src/combat/damage.js:498):
// +X local is the nose, and the arc is measured from the boss centre to the contact point, so a
// shot the damage router sheds at 0.25x is exactly the shot this module banks.
//
// Fail-closed everywhere: authoring that is missing or malformed resolves to "no boss surface"
// (the caller never consults the verdict); a verdict that cannot be proven a prow contact is
// 'damage'. Nothing here spends a bounce budget or writes a velocity — the kernel
// (resolveLiveAttackHit -> resolveRicochet) owns both, on a physics-issued receipt.

import { ENEMY_TYPES } from '../data/enemies.js';

const DEG = Math.PI / 180;

/** Authoring shape: within `arcDeg` of the nose the hull behaves as a `material` surface. */
const PROW_SURFACE_BY_DEF_ID = (() => {
  const map = new Map();
  for (const def of ENEMY_TYPES) {
    if (def && def.id && def.prowSurface) map.set(def.id, def.prowSurface);
  }
  return map;
})();

function clampArcDeg(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(360, Math.max(0, n));
}

function readAuthoring(bag) {
  if (!bag || typeof bag !== 'object') return null;
  const arcDeg = clampArcDeg(bag.arcDeg);
  const material = typeof bag.material === 'string' && bag.material ? bag.material : null;
  if (arcDeg == null || !material) return null;
  return { arcDeg, material };
}

/**
 * The boss-surface authoring a live target carries, or null.
 *
 * Order: authoring stamped on the entity (the way every surface materializer stamps room solids),
 * then the authored enemy def resolved through the target's identity fields — the materializer
 * (makeEnemySpawnSpec) copies an explicit field list only, so the def lookup is how a wave-
 * materialized boss reaches its own prow truth without a second data seam. Identity keys are
 * enemy-def ids (lootTableId / enemyTypeId, plus the fixture convention defId); ship-def ids
 * ('ship_*') never collide with that namespace.
 */
export function bossSurfaceAuthoringOf(target) {
  if (!target || typeof target !== 'object') return null;
  const data = target.data && typeof target.data === 'object' ? target.data : null;
  const direct = readAuthoring(target.prowSurface) || readAuthoring(data && data.prowSurface);
  if (direct) return direct;
  const defId = data && (data.lootTableId || data.enemyTypeId || data.defId);
  return defId != null ? readAuthoring(PROW_SURFACE_BY_DEF_ID.get(defId)) : null;
}

/**
 * Resolve one contact against authored boss-surface machinery.
 *
 * @param {{ surface: object|null, receipt: object|null }} input
 *   `surface` is the struck entity (read for authoring + pose only); `receipt` is the
 *   physics-issued surface-contact receipt (read for the contact point only — the reflected
 *   velocity itself is the kernel's job).
 * @returns {{ ok: boolean, reason?: string, response: 'reflect'|'damage', arc?: 'prow'|'hull',
 *             arcDeg?: number, material?: string }}
 *   `ok:false` means the gate could not prove a prow contact (missing authoring, contact point,
 *   or pose) — the caller must treat the contact as ordinary armor, never as a bank.
 */
export function resolveBossSurfaceContact({ surface, receipt } = {}) {
  const authoring = bossSurfaceAuthoringOf(surface);
  if (!authoring) return { ok: false, reason: 'no_boss_surface', response: 'damage' };
  const point = receipt && receipt.point;
  const pos = surface.pos;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) {
    return { ok: false, reason: 'no_contact_point', response: 'damage' };
  }
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)
    || !Number.isFinite(surface.rot)) {
    return { ok: false, reason: 'no_surface_pose', response: 'damage' };
  }
  const dx = (Number(point.x) || 0) - pos.x;
  const dz = (Number(point.z) || 0) - pos.z;
  if (!(Math.hypot(dx, dz) > 1e-9)) {
    return { ok: false, reason: 'degenerate_contact', response: 'damage' };
  }
  // Normalized arc: |bearing - facing| in [0, pi], identical to the damage router's geometry.
  const bearing = Math.atan2(dz, dx) - surface.rot;
  const delta = Math.abs(Math.atan2(Math.sin(bearing), Math.cos(bearing)));
  const halfArc = (authoring.arcDeg * DEG) / 2;
  if (delta <= halfArc) {
    return {
      ok: true,
      response: 'reflect',
      arc: 'prow',
      arcDeg: authoring.arcDeg,
      material: authoring.material,
    };
  }
  return {
    ok: true,
    response: 'damage',
    arc: 'hull',
    arcDeg: authoring.arcDeg,
    material: authoring.material,
  };
}
