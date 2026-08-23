// Surface ricochet continuation (PQ-133.04 / CRU-026, CRU-027).
// Physics owns the receipt and the reflected velocity. This module only spends the
// lineage bounce budget and, when compiled, steers within authored cone/turn caps.
// The same projectile body keeps travelling. No cosmetic respawn.

import {
  SURFACE_RESPONSE,
  applyReflectedVelocity,
  isSurfaceContactReceipt,
  quantizeSurface,
  reflectVelocity,
} from '../core/surfaceContact.js';
import { selectTargets } from './attackTargeting.js';
import { tryBounce } from './attackPropagation.js';

const DEG = Math.PI / 180;

function wrapAngle(radians) {
  return Math.atan2(Math.sin(radians), Math.cos(radians));
}

function headingOf(velocity) {
  return Math.atan2(velocity.z, velocity.x);
}

function speedOf(velocity) {
  return Math.hypot(velocity.x, velocity.z);
}

function inCone(origin, heading, candidate, halfConeRad) {
  const pos = candidate && candidate.pos;
  if (!pos) return false;
  const dx = (pos.x || 0) - origin.x;
  const dz = (pos.z || 0) - origin.z;
  if (!(Math.hypot(dx, dz) > 0)) return false;
  const angle = wrapAngle(Math.atan2(dz, dx) - heading);
  return Math.abs(angle) <= halfConeRad;
}

/**
 * After a bounce, turn at most maxTurnDeg toward the first valid hostile inside coneDeg.
 * Target order is selectTargets (score, distance, id) — insertion order never wins.
 */
export function steerAfterBounce(velocity, point, spec, hostiles, visited) {
  const steer = spec && spec.trajectory && spec.trajectory.afterBounceSteer;
  if (!steer || !(steer.coneDeg > 0) || !(steer.maxTurnDeg > 0)) return velocity;
  const speed = speedOf(velocity);
  if (!(speed > 0)) return velocity;
  const heading = headingOf(velocity);
  const halfCone = (steer.coneDeg * DEG) / 2;
  const origin = { x: point.x, z: point.z };
  const list = Array.isArray(hostiles) ? hostiles : [];
  const inFront = [];
  for (let i = 0; i < list.length; i++) {
    const candidate = list[i];
    if (inCone(origin, heading, candidate, halfCone)) inFront.push(candidate);
  }
  const chosen = selectTargets(inFront, {
    count: 1,
    sourcePos: origin,
    visited,
  })[0];
  if (!chosen || !chosen.pos) return velocity;
  const desired = Math.atan2(chosen.pos.z - origin.z, chosen.pos.x - origin.x);
  let delta = wrapAngle(desired - heading);
  const maxTurn = steer.maxTurnDeg * DEG;
  if (delta > maxTurn) delta = maxTurn;
  else if (delta < -maxTurn) delta = -maxTurn;
  const next = heading + delta;
  return {
    x: quantizeSurface(Math.cos(next) * speed),
    z: quantizeSurface(Math.sin(next) * speed),
  };
}

/**
 * Reflect an eligible projectile off a physics-owned surface contact.
 * Returns a continuation of the same projectile body, or a consume receipt.
 */
export function resolveRicochet(runtime, spec, receipt, body, options = {}) {
  if (!isSurfaceContactReceipt(receipt)) {
    return { ok: false, reason: 'no_physics_receipt', consume: true };
  }
  const materialClass = receipt.response;
  if (materialClass === SURFACE_RESPONSE.absorb) {
    return { ok: false, reason: 'absorbed', consume: true, materialClass };
  }
  if (materialClass !== SURFACE_RESPONSE.reflect) {
    return { ok: false, reason: 'no_surface_response', consume: true, materialClass };
  }
  const bounced = tryBounce(runtime);
  if (!bounced.ok) {
    return {
      ok: false,
      reason: bounced.reason,
      suppressed: !!bounced.suppressed,
      consume: true,
      materialClass,
    };
  }
  const reflected = reflectVelocity(receipt.velocity, receipt.normal);
  const outgoing = steerAfterBounce(
    reflected,
    receipt.point,
    spec,
    options.hostiles,
    runtime && runtime.visitedTargets,
  );
  const steered = outgoing.x !== reflected.x || outgoing.z !== reflected.z;
  if (body) applyReflectedVelocity(body, outgoing);
  return {
    ok: true,
    consume: false,
    materialClass,
    velocity: outgoing,
    reflected,
    steered,
    remaining: bounced.remaining,
    receipt,
    body,
  };
}
