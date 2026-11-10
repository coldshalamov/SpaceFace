// Scar seats (inf-scar-seats).
//
// Sustained fire kept its last marks on a hull (scarHistory), but every strike still spawned its
// own sibling: a hull chewed on one spot read as a scatter of identical round pocks, never as a
// wound growing where the fire was actually working. Now a strike that lands inside an existing
// kept seat is ABSORBED by that seat instead of spawning another mark: the wound widens a step,
// reheats under the fresh hit, and creeps slightly along the fire path. Spread fire still
// scatters; a worked-over seat visibly deepens across a fight.
//
// Pure decision layer over plain pool slots: no THREE, no clock, no rng. The presenter calls
// findScarSeat before the history book — an absorbed strike never spawns and never consumes
// bookkeeping — and reinforceScarSeat does the bounded growth in place. Identity mirrors the
// scar-history contract (targetId + boundKey), so a pooled identity change or a replacement
// hull starts its own seats instead of inheriting the old hull's wounds.

/** A strike within an existing seat's width × this radius is absorbed by that seat. */
export const SCAR_SEAT_RADIUS_SCALE = 1.15;
/** Width growth per absorbed hit, multiplicative. */
export const SCAR_SEAT_GROWTH = 0.16;
/** Height growth per absorbed hit — a wound widens faster than it lengthens. */
export const SCAR_SEAT_HEIGHT_GROWTH = 0.1;
/** Absolute width/height caps (wu): a wound never swallows the hull panel it sits on. */
export const SCAR_SEAT_WIDTH_CAP_WU = 6.5;
export const SCAR_SEAT_HEIGHT_CAP_WU = 3.6;
/** The seat's centre creeps this fraction toward each absorbed strike's point. */
export const SCAR_SEAT_CREEP = 0.22;
/** An absorbed hit reheats the wound: its age is pulled back to at most this fraction of life. */
export const SCAR_SEAT_REHEAT_FRACTION = 0.2;

function finiteOr(v, fb = 0) {
  return Number.isFinite(v) ? v : fb;
}

/** One slot's distance to a strike point in hull-local space (plain number, no allocation). */
function seatDistance(slot, localX, localY, localZ) {
  const dx = finiteOr(slot.localX) - localX;
  const dy = finiteOr(slot.localY) - localY;
  const dz = finiteOr(slot.localZ) - localZ;
  return Math.hypot(dx, dy, dz);
}

/**
 * The kept scar seat that absorbs a strike at this hull-local point, or -1 when the strike
 * should spawn its own mark. Only persistent, alive, identity-matching slots count; the
 * nearest seat within its own reach wins. `radiusScale` sizes each seat's reach by its width.
 */
export function findScarSeat(slots, targetId, boundKey, localX, localY, localZ, radiusScale = SCAR_SEAT_RADIUS_SCALE) {
  if (!Array.isArray(slots) || targetId == null) return -1;
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s || s.alive !== 1 || s.persistent !== true) continue;
    if (s.targetId !== targetId) continue;
    if (s.boundKey !== boundKey) continue;
    const reach = Math.max(0.4, finiteOr(s.width, 1.6)) * radiusScale;
    const d = seatDistance(s, localX, localY, localZ);
    if (d <= reach && d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Absorb one strike into a kept seat, in place: grow (bounded), reheat, creep toward the
 * strike. Pure mutation of the caller's slot struct; deterministic; writes a plan
 * { width, height, grew, reheated } for the caller and the tests. `localX/Y/Z` is the
 * absorbed strike's own point — pass 0s or omit to grow in place without creep.
 */
export function reinforceScarSeat(slot, localX = 0, localY = 0, localZ = 0) {
  const plan = { width: 0, height: 0, grew: false, reheated: false };
  if (!slot || slot.alive !== 1 || slot.persistent !== true) return plan;
  const grewW = finiteOr(slot.width, 1.6) < SCAR_SEAT_WIDTH_CAP_WU;
  const grewH = finiteOr(slot.height, 1.1) < SCAR_SEAT_HEIGHT_CAP_WU;
  if (grewW) {
    slot.width = Math.min(SCAR_SEAT_WIDTH_CAP_WU, finiteOr(slot.width, 1.6) * (1 + SCAR_SEAT_GROWTH));
    plan.grew = true;
  }
  if (grewH) {
    slot.height = Math.min(SCAR_SEAT_HEIGHT_CAP_WU, finiteOr(slot.height, 1.1) * (1 + SCAR_SEAT_HEIGHT_GROWTH));
    plan.grew = true;
  }
  plan.width = slot.width;
  plan.height = slot.height;
  // Reheat: continued fire keeps the wound hot — its age is pulled back toward youth so the
  // blackbody ramp runs hot again, and a persistent mark holds its fade floor anyway.
  const life = Math.max(0.001, finiteOr(slot.life, 1));
  if (slot.age > life * SCAR_SEAT_REHEAT_FRACTION) {
    slot.age = life * SCAR_SEAT_REHEAT_FRACTION;
    plan.reheated = true;
  }
  // Creep: the wound drifts along the fire path, one absorbed hit at a time, never teleporting.
  const hitX = finiteOr(localX);
  const hitY = finiteOr(localY);
  const hitZ = finiteOr(localZ);
  if (hitX !== 0 || hitY !== 0 || hitZ !== 0) {
    slot.localX = finiteOr(slot.localX) * (1 - SCAR_SEAT_CREEP) + hitX * SCAR_SEAT_CREEP;
    slot.localY = finiteOr(slot.localY) * (1 - SCAR_SEAT_CREEP) + hitY * SCAR_SEAT_CREEP;
    slot.localZ = finiteOr(slot.localZ) * (1 - SCAR_SEAT_CREEP) + hitZ * SCAR_SEAT_CREEP;
  }
  return plan;
}
