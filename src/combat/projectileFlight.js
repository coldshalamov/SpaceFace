// Ballistic flight budget, separate from the weapon's engagement range.
//
// Engagement range (data.maxDistance) is the authored combat number: AI, locks,
// hitscan, and the targeting computer keep using it. It is not how far a fired
// round is allowed to exist. A zoomed-out table is several hundred world units
// across, so a 240 WU engagement range expires the shot while it is still on
// the glass.
//
// Flight budget is a long, finite lifetime. The round keeps colliding after it
// leaves the frame, including a bounce that can re-enter the picture. It does
// not live forever: the clock runs out, and a live cap retires the oldest
// rounds so a firefight cannot fill the sector with projectiles.
//
// Drawing is a different question. projectileOnReadableFrame is the frame test.
// Off-frame rounds stay in the sim and are not submitted.

import {
  shouldDrawTableVfx,
  tableLookAtDelta,
  tableVfxDrawWuFromState,
} from '../render/tabletopPolicy.js';

/** Minimum time a fired round keeps its collision body, in seconds. */
export const PROJECTILE_FLIGHT_SECONDS = 16;

/**
 * Extra life a bounce may grant so the same body can travel back onto the
 * frame. Capped, and only a few times, so two mirrors cannot ping forever.
 */
export const PROJECTILE_BOUNCE_REFRESH_SECONDS = 12;
export const PROJECTILE_BOUNCE_REFRESH_CAP = 3;

/** Hard ceiling on simultaneous live projectiles. Oldest bodies retire first. */
export const PROJECTILE_LIVE_CAP = 420;

/**
 * Pad outside the live draw envelope. A bolt's dash and a ribbon head sit
 * behind the body; without this they vanish while the tip is still on glass.
 */
export const PROJECTILE_DRAW_PAD_WU = 64;

const _frameLook = { x: 0, z: 0 };

function finiteSpeed(speed) {
  const value = Number(speed);
  return value > 1 ? value : 1;
}

/**
 * Clock and spatial limit for a newly fired round.
 * `engagementRange` is the authored weapon range and is a floor, not a cap:
 * the round always lives at least PROJECTILE_FLIGHT_SECONDS.
 */
export function projectileFlightPlan(engagementRange, worldSpeed) {
  const speed = finiteSpeed(worldSpeed);
  const range = Math.max(0, Number(engagementRange) || 0);
  const seconds = Math.max(PROJECTILE_FLIGHT_SECONDS, range / speed);
  return {
    seconds,
    flightDistance: speed * seconds,
    ttl: seconds,
  };
}

/**
 * Spatial limit the sweep enforces. A flight budget wins when the spawner
 * wrote one. Bodies that only carry maxDistance (optics, fixtures, old saves)
 * keep that shorter limit.
 */
export function projectileTravelLimit(data) {
  const flight = Number(data && data.flightDistance);
  if (flight > 0) return flight;
  const maxDistance = Number(data && data.maxDistance);
  return maxDistance > 0 ? maxDistance : 0;
}

/**
 * Budget for a child body born from a parent that has already flown.
 * The child measures distance from its own birth point. It keeps whatever
 * the parent had left, and at least four seconds, so a split at the edge of
 * the frame can still cross it. It never receives more than a fresh flight.
 */
export function projectileContinuationPlan(parentData, pos, worldSpeed) {
  const speed = finiteSpeed(worldSpeed);
  const fresh = projectileFlightPlan(0, speed);
  const limit = projectileTravelLimit(parentData);
  const origin = parentData && parentData.spawnPos;
  const px = Number(pos && pos.x) || 0;
  const pz = Number(pos && pos.z) || 0;
  let remaining = limit;
  if (origin && Number.isFinite(origin.x) && Number.isFinite(origin.z) && limit > 0) {
    remaining = Math.max(0, limit - Math.hypot(px - origin.x, pz - origin.z));
  }
  const flightDistance = Math.min(fresh.flightDistance, Math.max(remaining, speed * 4));
  return {
    flightDistance,
    ttl: flightDistance / speed,
    spawnPos: { x: px, z: pz },
  };
}

/**
 * After a real bounce, give the same body enough remaining travel to come
 * back. Straight-line distance from the muzzle would otherwise expire a
 * returning shot, or a shot that had already spent its clock outbound.
 * Refusing further refreshes past the cap is what stops a mirror loop.
 */
export function refreshFlightAfterBounce(projectile, returnTo) {
  if (!projectile || !projectile.pos) return false;
  const data = projectile.data || (projectile.data = {});
  const refreshes = data.bounceRefreshes | 0;
  if (refreshes >= PROJECTILE_BOUNCE_REFRESH_CAP) return false;
  const speed = finiteSpeed(Math.hypot(
    Number(projectile.vel && projectile.vel.x) || 0,
    Number(projectile.vel && projectile.vel.z) || 0,
  ));
  const px = Number(projectile.pos.x) || 0;
  const pz = Number(projectile.pos.z) || 0;
  const back = returnTo && Number.isFinite(returnTo.x) && Number.isFinite(returnTo.z)
    ? Math.hypot(px - returnTo.x, pz - returnTo.z)
    : 0;
  const seconds = Math.min(
    PROJECTILE_BOUNCE_REFRESH_SECONDS,
    Math.max(4, back / speed + 1.5),
  );
  data.bounceRefreshes = refreshes + 1;
  data.spawnPos = { x: px, z: pz };
  data.flightDistance = Math.max(speed * seconds, back + speed * 1.5);
  projectile.ttl = Math.max(Number(projectile.ttl) || 0, seconds);
  return true;
}

function liveProjectiles(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && Array.isArray(index.projectiles)) {
    return index.projectiles;
  }
  return (state && state.entityList) || [];
}

/**
 * Make room for `incoming` new projectiles. Retires the oldest live rounds
 * first. Returns how many were retired.
 */
export function reserveProjectileCapacity(state, incoming = 1) {
  const need = Math.max(0, incoming | 0);
  if (!state || need === 0) return 0;
  const list = liveProjectiles(state);
  let live = 0;
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (entity && entity.alive !== false && entity.type === 'projectile') live += 1;
  }
  let overflow = live + need - PROJECTILE_LIVE_CAP;
  if (overflow <= 0) return 0;
  let retired = 0;
  for (let i = 0; i < list.length && overflow > 0; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false || entity.type !== 'projectile') continue;
    entity.alive = false;
    overflow -= 1;
    retired += 1;
  }
  return retired;
}

/**
 * True when a world position should be drawn this frame. Missing player
 * position does not cull: a fixture with no pilot still has to show the shot.
 * The pad keeps a round visible until its body and dash have left the glass.
 */
export function projectileOnReadableFrame(state, pos, playerPos, drawWu, out) {
  if (!playerPos || !Number.isFinite(playerPos.x) || !Number.isFinite(playerPos.z)) return true;
  const base = Number.isFinite(drawWu) && drawWu > 0 ? drawWu : tableVfxDrawWuFromState(state);
  const look = tableLookAtDelta(state, playerPos, pos, out || _frameLook);
  return shouldDrawTableVfx(look.x, look.z, base + PROJECTILE_DRAW_PAD_WU);
}
