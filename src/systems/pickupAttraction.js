// Universal pickup attraction (Arcade Core AC-02).
//
// Mining remains the collection/event owner. This helper owns the one range policy and one
// relative-velocity homing calculation used by every collectible pickup kind: ore, salvaged
// materials, physical credit chips, and future pickup types.
import { MODULES } from '../data/modules.js';

export const MAGNET_RANGE = 420;
export const MAGNET_ACCEL = 900;
export const MAGNET_APPROACH_MIN = 100;
export const MAGNET_APPROACH_MAX = 280;

const MAGNET_CLOSE_RADIUS_MULT = 2.5;
const MAGNET_CLOSE_APPROACH_MULT = 1.35;
const MAGNET_CLOSE_AUTHORITY_MULT = 1.6;
const MODULE_BY_ID = new Map(MODULES.map((module) => [module.id, module]));

function finiteNum(value) {
  return Number.isFinite(value) ? value : 0;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function maxFittedMagnetRange(player) {
  if (!player || !player.data) return 0;
  const fittings = Array.isArray(player.data.fittings) ? player.data.fittings : [];
  let max = 0;
  for (const id of fittings) {
    const module = id && MODULE_BY_ID.get(id);
    const value = module && module.mods && Number(module.mods.magnetRange);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max;
}

/**
 * Resolve the ordinary pickup-vacuum radius.
 * Ships owns derived fitting stats; the catalog fallback exists only for sparse fixtures that do
 * not run the ships owner. Legacy state.player.magnetRange is not a competing authority.
 */
export function playerPickupMagnetRange(state, playerEntity = null) {
  const player = playerEntity
    || (state && state.entities && state.entities.get && state.entities.get(state.playerId))
    || null;
  const derived = player && player.data && player.data.derived;
  let fittedRange = derived && Number(derived.magnetRange);
  if (!(Number.isFinite(fittedRange) && fittedRange > 0)) {
    fittedRange = maxFittedMagnetRange(player);
  }
  return Number.isFinite(fittedRange) && fittedRange > MAGNET_RANGE
    ? fittedRange
    : MAGNET_RANGE;
}

/**
 * Apply one deterministic relative-velocity attraction step to a pickup.
 *
 * The caller already computes dx/dz/distance for collection, so those scalars cross the boundary
 * without an allocation or a duplicate hypot. No pickup kind or commodity identity is consulted.
 * Returns true only when this helper writes pickup velocity.
 */
export function applyPickupAttraction(
  pickup,
  player,
  dt,
  magnetRange,
  collectRadius,
  dx,
  dz,
  distance,
) {
  if (!pickup || !player || !(dt > 0) || !(magnetRange > 0)) return false;
  if (!Number.isFinite(distance) || distance < 0 || distance > magnetRange) return false;
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return false;

  const safeDistance = distance || 1e-4;
  const nx = dx / safeDistance;
  const nz = dz / safeDistance;
  const rangeT = clamp01(safeDistance / Math.max(1, magnetRange));
  const approach = MAGNET_APPROACH_MIN
    + (MAGNET_APPROACH_MAX - MAGNET_APPROACH_MIN) * rangeT;
  const close = Number.isFinite(collectRadius)
    && collectRadius > 0
    && safeDistance < collectRadius * MAGNET_CLOSE_RADIUS_MULT;
  const approachMult = close ? MAGNET_CLOSE_APPROACH_MULT : 1;
  const desiredVx = finiteNum(player.vel && player.vel.x) + nx * approach * approachMult;
  const desiredVz = finiteNum(player.vel && player.vel.z) + nz * approach * approachMult;
  const currentVx = finiteNum(pickup.vel && pickup.vel.x);
  const currentVz = finiteNum(pickup.vel && pickup.vel.z);
  const dvx = desiredVx - currentVx;
  const dvz = desiredVz - currentVz;
  const need = Math.hypot(dvx, dvz);
  const maxDv = MAGNET_ACCEL * dt * (close ? MAGNET_CLOSE_AUTHORITY_MULT : 1);

  if (!pickup.vel) pickup.vel = { x: 0, z: 0 };
  if (need <= maxDv || need < 1e-6) {
    pickup.vel.x = desiredVx;
    pickup.vel.z = desiredVz;
  } else {
    const scale = maxDv / need;
    pickup.vel.x = currentVx + dvx * scale;
    pickup.vel.z = currentVz + dvz * scale;
  }
  return true;
}
