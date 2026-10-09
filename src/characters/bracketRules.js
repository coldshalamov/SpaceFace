// Pure, renderer-independent court rules. The live adapter never advances ball motion itself.
import { BRACKET as C } from '../data/bracket.js';
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const finiteXZ = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
export function goalCrossing(previous, current, radius = C.ballRadius, dt = 1 / 60) {
  if (!finiteXZ(previous) || !finiteXZ(current) || !Number.isFinite(radius) || radius <= 0
    || !Number.isFinite(dt) || dt <= 0 || dt > 0.25) return null;
  // The whole sphere must pass the line, front -> back. Swept intersection prevents tunnelling.
  const plane = C.goalZ - radius;
  if (previous.z <= plane || current.z > plane || current.z >= previous.z) return null;
  if (Math.hypot(current.x - previous.x, current.z - previous.z) > C.maxBallSpeed * dt * 1.25 + 1) return null;
  const t = (plane - previous.z) / (current.z - previous.z);
  const x = previous.x + (current.x - previous.x) * t;
  return Math.abs(x) + radius <= C.aperture ? { x, t } : null;
}
export function predictKeeperTarget(ball, tier = 0) {
  if (!finiteXZ(ball?.pos) || !finiteXZ(ball?.vel) || ball.vel.z >= -C.minShotSpeed) return null;
  const eta = (C.keeperZ - ball.pos.z) / ball.vel.z;
  if (!Number.isFinite(eta) || eta < 0 || eta > 2.5) return null;
  // A good keeper, not an omniscient one: bounded range, reaction cadence, committed telegraph.
  const read = clamp(tier, 0, 2) === 0 ? 0.72 : clamp(tier, 0, 2) === 1 ? 0.86 : 1;
  return clamp(ball.pos.x + ball.vel.x * eta * read, -33, 33);
}
export function legalShot(lastTouch, now, displacement, speed) {
  return Number.isFinite(now) && Number.isFinite(lastTouch) && now >= lastTouch
    && now - lastTouch <= C.playerTouchSeconds && Number.isFinite(displacement)
    && displacement > 8 && Number.isFinite(speed) && speed >= C.minShotSpeed;
}
export function keeperControl(entity, targetX, targetZ, tier = 0) {
  const maxAcceleration = 72 + clamp(tier, 0, 2) * 15;
  return { mode: 'uncontrolled', source: 'bracket', maxSpeed: 42 + clamp(tier, 0, 2) * 9,
    force: {
      x: clamp((targetX - entity.pos.x) * 12 - entity.vel.x * 6, -maxAcceleration, maxAcceleration) * C.keeperMass,
      y: 0,
      z: clamp((targetZ - entity.pos.z) * 9 - entity.vel.z * 5, -45, 45) * C.keeperMass,
    },
    torque: { x: 0, y: (-Math.sin(entity.rot || 0) * 8 - (entity.angVel || 0) * 4) * C.keeperMass * 80, z: 0 } };
}
