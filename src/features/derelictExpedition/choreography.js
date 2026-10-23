/** Pure bounded machinery plans. Only runtime.js submits them to physicsAuthority. */
export const EXPEDITION_CHOREOGRAPHY = Object.freeze({
  maxStepS: 0.1,
  maxLinearAcceleration: 16,
  maxAngularAcceleration: 0.45,
  maxBodySpeed: 46,
  ventWarningS: 3.5,
  ventActiveS: 2.5,
  ventQuietS: 8,
  collapseWarningS: 5,
  maxAffectedBodies: 48,
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
const vec = (v) => ({ x: Number.isFinite(v?.x) ? v.x : 0, z: Number.isFinite(v?.z) ? v.z : 0 });
const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Quiet windows never shrink below eight seconds, even at maximum pressure.
 * The alert has a fixed 3.5-second lead. Time changes force, never cargo custody.
 */
export function sampleExpeditionHazards(record, layout) {
  const pressure = clamp(record?.pressure, 0, 100);
  const elapsed = Math.max(0, Number(record?.elapsedS) || 0);
  const vent = layout.obstacles?.vent || {};
  const warningS = EXPEDITION_CHOREOGRAPHY.ventWarningS;
  const activeS = EXPEDITION_CHOREOGRAPHY.ventActiveS;
  // A fixed period avoids phase jumps when pressure crosses a threshold. Pressure
  // increases force instead; every visible warning therefore precedes its pulse.
  const period = Math.max(22, Number(layout.parameters?.ventPeriodS) || 26);
  const cycle = Math.floor(elapsed / period);
  const phaseS = elapsed - cycle * period;
  const ventDisabled = record?.obstacles?.vent?.opened === true && !['bypass', 'timed'].includes(record.obstacles.vent.method);
  const active = !ventDisabled && phaseS >= period - activeS;
  const warning = !ventDisabled && !active && phaseS >= period - activeS - warningS;
  const direction = vec(vent.direction || { x: 0, z: 1 });
  const length = Math.hypot(direction.x, direction.z) || 1;
  direction.x /= length; direction.z /= length;
  const rackWarning = (kind, latestS) => {
    const recovery = record?.cargo?.[kind]?.recoveredAt;
    return Number.isFinite(recovery) ? Math.min(latestS, Math.max(0, recovery)) : latestS;
  };
  return {
    pressure,
    vent: {
      cycle, phase: active ? 'active' : warning ? 'warning' : 'quiet',
      remainingS: ventDisabled ? 0 : Math.max(0, active ? period - phaseS : warning ? period - activeS - phaseS : period - activeS - warningS - phaseS),
      origin: vec(vent.origin || layout.compartments?.find((c) => c.id === 'vent')?.center),
      direction, length: clamp(vent.length, 40, 220), halfWidth: clamp(vent.halfWidth, 8, 55),
      acceleration: active ? 6 + pressure * 0.08 : 0,
      // Expose actual guarantees rather than a synthetic countdown-to-death.
      minimumQuietS: period - activeS - warningS,
    },
    // Removing cargo unloads a finite rack. Even a quick recovery changes the
    // return; waiting also lets the reactor weaken it. Neither path gates loot
    // on a timer. Runtime re-arms the full warning after every interrupted visit.
    collapse: [
      { id: 'rack_one', warningAtS: rackWarning('blackbox', 240) },
      { id: 'rack_two', warningAtS: rackWarning('core', 420) },
    ].map((row) => {
      const releaseAtS = row.warningAtS + EXPEDITION_CHOREOGRAPHY.collapseWarningS;
      return { ...row, releaseAtS, active: elapsed >= releaseAtS, warning: elapsed >= row.warningAtS && elapsed < releaseAtS };
    }),
    shutterAngle: Math.sin(elapsed * 0.24) * 0.35,
  };
}

/** Rectangle/ray geometry; no radius-only impulse hitting the exterior escape lane. */
export function pointInExpeditionJet(position, vent, bodyRadius = 0) {
  if (!position || !vent) return false;
  const dx = position.x - vent.origin.x, dz = position.z - vent.origin.z;
  const along = dx * vent.direction.x + dz * vent.direction.z;
  const across = Math.abs(dx * -vent.direction.z + dz * vent.direction.x);
  return along >= -bodyRadius && along <= vent.length + bodyRadius && across <= vent.halfWidth + bodyRadius;
}

export function distanceToPolyline(position, points) {
  if (!position || !Array.isArray(points) || !points.length) return Infinity;
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dz = b.z - a.z, den = dx * dx + dz * dz;
    const t = den > 0 ? clamp(((position.x - a.x) * dx + (position.z - a.z) * dz) / den, 0, 1) : 0;
    best = Math.min(best, pointDistance(position, { x: a.x + t * dx, z: a.z + t * dz }));
  }
  return points.length === 1 ? pointDistance(position, points[0]) : best;
}

/** Mass-scaled impulse with a delta-v budget. Does not write entity motion. */
export function expeditionImpulse(entity, acceleration, dt, maxSpeed = EXPEDITION_CHOREOGRAPHY.maxBodySpeed) {
  if (!entity?.alive || entity.physicsBody?.dynamic === false) return null;
  const step = clamp(dt, 0, EXPEDITION_CHOREOGRAPHY.maxStepS);
  const a = vec(acceleration), aLen = Math.hypot(a.x, a.z);
  const scale = aLen > EXPEDITION_CHOREOGRAPHY.maxLinearAcceleration ? EXPEDITION_CHOREOGRAPHY.maxLinearAcceleration / aLen : 1;
  const mass = clamp(entity.physicsBody?.mass ?? entity.mass, 0.01, 10000);
  const velocity = vec(entity.vel);
  let dvx = a.x * scale * step, dvz = a.z * scale * step;
  // Refuse only further acceleration along excessive motion. Player-authored
  // momentum is never clipped or overwritten to enforce the machinery budget.
  if (Math.hypot(velocity.x, velocity.z) >= maxSpeed && dvx * velocity.x + dvz * velocity.z > 0) return null;
  if (!(Math.abs(dvx) + Math.abs(dvz) > 0)) return null;
  return { x: dvx * mass, y: 0, z: dvz * mass };
}

/** A spring-loaded machine can be defeated by physical displacement or damage. */
export function expeditionMachineAcceleration(entity, target, stiffness = 0.3, damping = 1.2) {
  if (!entity?.pos || !target) return { x: 0, z: 0 };
  return {
    x: (target.x - entity.pos.x) * stiffness - (entity.vel?.x || 0) * damping,
    z: (target.z - entity.pos.z) * stiffness - (entity.vel?.z || 0) * damping,
  };
}
