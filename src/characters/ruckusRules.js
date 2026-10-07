/** Pure RUCKUS rules. The registered owner reads bodies; Rapier alone integrates them. */
import { RUCKUS as C } from '../data/ruckus.js';
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const finiteXZ = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
export const distanceXZ = (a, b) => finiteXZ(a) && finiteXZ(b) ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
export const speedOf = e => finiteXZ(e?.vel) ? Math.hypot(e.vel.x, e.vel.z) : 0;
export const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function boundedPoint(point, center, radius) {
  if (!finiteXZ(point) || !finiteXZ(center) || !(radius > 0)) return { ...center };
  const dx = point.x - center.x, dz = point.z - center.z, d = Math.hypot(dx, dz);
  const scale = d > radius ? radius / d : 1;
  return { x: center.x + dx * scale, z: center.z + dz * scale };
}

/** Force-level PD servo. Acceleration is length-clamped (not separately clipped per axis).
 * The velocity goal includes target drift, so the jaws do not ram a moving core. */
export function retrieverControl(entity, target, options = {}) {
  const mass = Number.isFinite(entity?.mass) && entity.mass > 0 ? entity.mass : C.mass;
  const maxSpeed = options.maxSpeed ?? C.maxSpeed, maxAccel = options.maxAccel ?? C.maxAccel;
  if (!finiteXZ(entity?.pos) || !finiteXZ(entity?.vel) || !finiteXZ(target)) return null;
  let dx = target.x - entity.pos.x, dz = target.z - entity.pos.z;
  const d = Math.hypot(dx, dz), travel = Math.min(maxSpeed, Math.sqrt(2 * maxAccel * d), d * 2.8);
  const nx = d > .001 ? dx / d : 0, nz = d > .001 ? dz / d : 0;
  const drift = finiteXZ(options.drift) ? options.drift : { x: 0, z: 0 };
  let ax = (nx * travel + drift.x - entity.vel.x) * 3.5;
  let az = (nz * travel + drift.z - entity.vel.z) * 3.5;
  const a = Math.hypot(ax, az), scale = a > maxAccel ? maxAccel / a : 1;
  ax *= scale; az *= scale;
  const heading = Number.isFinite(options.heading) ? options.heading
    : d > 1 ? Math.atan2(dz, dx) : (entity.rot || 0);
  const turn = clamp(angleDelta(heading, entity.rot || 0) * 9 - (entity.angVel || 0) * 5, -8, 8);
  return { mode: 'uncontrolled', source: 'ruckus', maxSpeed,
    force: { x: ax * mass, y: 0, z: az * mass },
    torque: { x: 0, y: turn * mass * 65, z: 0 } };
}

export function legalFetch({ now, touchedAt, displacement, speed, held }) {
  return !held && Number.isFinite(now) && Number.isFinite(touchedAt)
    && now >= touchedAt && now - touchedAt <= C.throwCreditSeconds
    && Number.isFinite(displacement) && displacement >= C.throwMinDistance
    && Number.isFinite(speed) && speed >= C.throwMinSpeed;
}
export function canCatch(body, toy, held = false) {
  return !held && finiteXZ(body?.vel) && finiteXZ(toy?.vel)
    && distanceXZ(body.pos, toy.pos) <= C.radius + C.toyRadius + C.catchGap
    && Math.hypot(body.vel.x - toy.vel.x, body.vel.z - toy.vel.z) <= C.catchRelativeSpeed;
}
export function mouthPoint(body) {
  const angle = body.rot || 0;
  return { x: body.pos.x + Math.cos(angle) * C.mouthOffset,
    z: body.pos.z + Math.sin(angle) * C.mouthOffset };
}

/** A pressure present moves finite, loose bodies, never static geometry or a docked pilot.
 * It deals no direct hull/shield damage. Distance falloff and a per-event body cap bound work. */
export function barkImpulse(entity, center, excludedIds = []) {
  if (!entity?.alive || excludedIds.includes(entity.id) || entity.flags?.docked
    || entity.physicsBody === false || entity.physicsBody?.dynamic === false
    || !['ship', 'drone', 'payload', 'wreck', 'asteroid'].includes(entity.type)
    || !finiteXZ(entity.pos) || !finiteXZ(entity.vel)) return null;
  const mass = entity.mass;
  if (!Number.isFinite(mass) || mass <= 0 || mass > C.pulseMaxMass) return null;
  const dx = entity.pos.x - center.x, dz = entity.pos.z - center.z, d = Math.hypot(dx, dz);
  if (!Number.isFinite(d) || d >= C.pulseRadius) return null;
  // Coincident bodies use a fixed +X normal: no NaN and no RNG consumption.
  const nx = d > .001 ? dx / d : 1, nz = d > .001 ? dz / d : 0;
  const dv = C.pulseDeltaSpeed * (1 - d / C.pulseRadius) ** 2;
  return { x: nx * dv * mass, y: 0, z: nz * dv * mass };
}

/** Deterministic nearest-obstacle diversion. No navigation mesh or new global physics writer. */
export function avoidObstacle(body, goal, obstacles, allowance = 0) {
  const dx = goal.x - body.pos.x, dz = goal.z - body.pos.z, d = Math.hypot(dx, dz);
  if (d < 1) return goal;
  const nx = dx / d, nz = dz / d, ahead = Math.min(d, 95 + speedOf(body) * .35);
  let closest = null, alongMin = Infinity;
  for (const e of obstacles || []) {
    if (!e?.alive || e.id === body.id || !e.collides || !finiteXZ(e.pos)) continue;
    const ex = e.pos.x - body.pos.x, ez = e.pos.z - body.pos.z;
    const along = ex * nx + ez * nz, across = ex * -nz + ez * nx;
    const radius = (Number.isFinite(e.radius) ? e.radius : 10) + C.radius + 12 + allowance;
    if (along > 0 && along < ahead && Math.abs(across) < radius && along < alongMin) {
      closest = { along, across, radius }; alongMin = along;
    }
  }
  if (!closest) return goal;
  const side = closest.across >= 0 ? -1 : 1;
  return { x: body.pos.x + nx * closest.along - nz * side * (closest.radius + 15),
    z: body.pos.z + nz * closest.along + nx * side * (closest.radius + 15) };
}
