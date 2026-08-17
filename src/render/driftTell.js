// Plan 35 — Newtonian drift tell. Pure over a ship's pose/velocity.
//
// A ship whose velocity is sideways relative to its nose gets a trailing-edge skid point.
// This is not control-loss "drifting" (drive-disabled) and not a HUD gauge. Allocation-free:
// callers pass `out` on the hot path.

export const DRIFT_SPEED_MIN = 12;
export const DRIFT_ALIGN_MAX = 0.72;
export const DRIFT_INTENSITY_MIN = 0.08;

const EMPTY = Object.freeze({
  active: false,
  intensity: 0,
  trailX: 0,
  trailZ: 0,
  heading: 0,
});

/**
 * @param {object|null} entity
 * @param {{active:boolean,intensity:number,trailX:number,trailZ:number,heading:number}|null} [out]
 */
export function shipDriftTell(entity, out = null) {
  const rec = out || {
    active: false,
    intensity: 0,
    trailX: 0,
    trailZ: 0,
    heading: 0,
  };
  rec.active = false;
  rec.intensity = 0;
  rec.trailX = 0;
  rec.trailZ = 0;
  rec.heading = 0;
  if (!entity || entity.alive === false || !entity.pos || !entity.vel) return rec;
  const vx = Number.isFinite(entity.vel.x) ? entity.vel.x : 0;
  const vz = Number.isFinite(entity.vel.z) ? entity.vel.z : 0;
  const speed = Math.hypot(vx, vz);
  if (!(speed >= DRIFT_SPEED_MIN)) return rec;
  const rot = Number.isFinite(entity.rot) ? entity.rot : 0;
  const hx = Math.cos(rot);
  const hz = Math.sin(rot);
  const align = (vx * hx + vz * hz) / speed;
  const sideways = 1 - Math.abs(align);
  if (Math.abs(align) >= DRIFT_ALIGN_MAX) return rec;
  const intensity = Math.min(1, sideways * Math.min(1, (speed - DRIFT_SPEED_MIN) / 40));
  if (intensity < DRIFT_INTENSITY_MIN) return rec;
  const radius = Math.max(3, Number.isFinite(entity.radius) ? entity.radius : 6);
  const inv = 1 / speed;
  rec.active = true;
  rec.intensity = intensity;
  rec.trailX = entity.pos.x - vx * inv * radius;
  rec.trailZ = entity.pos.z - vz * inv * radius;
  rec.heading = Math.atan2(vz, vx);
  return rec;
}

export function idleDriftTell() {
  return EMPTY;
}
