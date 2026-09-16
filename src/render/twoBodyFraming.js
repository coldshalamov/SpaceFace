/**
 * PQ-159.01 — two-body framing when a Massline is taut or a bridle exists.
 * Pure geometry. The director consumes the pose; this file does not write sim.
 */
export const TWO_BODY_SEED = 15901;
export const TAUT_RATIO = 0.92;
export const TWO_BODY_SAFE_NDC = 0.8;

export function isTautOrBridle(tether) {
  if (!tether || tether.active === false) return false;
  if (tether.bridle || tether.attachmentId === 'attachment_twin_bridle') return true;
  const ratio = Number(tether.ratio ?? tether.stretchRatio ?? tether.tautRatio);
  return Number.isFinite(ratio) && ratio >= TAUT_RATIO;
}

export function lineDiagonalPose(player, other) {
  const ax = Number(player && player.pos && player.pos.x);
  const az = Number(player && player.pos && player.pos.z);
  const bx = Number(other && other.pos && other.pos.x);
  const bz = Number(other && other.pos && other.pos.z);
  if (![ax, az, bx, bz].every(Number.isFinite)) return null;
  const dx = bx - ax;
  const dz = bz - az;
  const span = Math.hypot(dx, dz);
  const ra = Math.max(2, Number(player && player.radius) || 6);
  const rb = Math.max(2, Number(other && other.radius) || 6);
  return {
    focusX: (ax + bx) * 0.5,
    focusZ: (az + bz) * 0.5,
    spanWu: span,
    diagonalAngle: Math.atan2(dz, dx),
    fitWu: span + ra + rb,
  };
}

function ndcFor(entity, pose, zoom, aspect) {
  const x = entity.pos.x - pose.focusX;
  const z = entity.pos.z - pose.focusZ;
  const halfW = zoom * Math.max(0.25, aspect) * 0.5;
  const halfH = zoom * 0.5;
  return { x: halfW > 0 ? x / halfW : 0, z: halfH > 0 ? z / halfH : 0 };
}

export function bothBodiesInside(player, other, pose, zoom, aspect = 16 / 9, safe = TWO_BODY_SAFE_NDC) {
  if (!pose) return false;
  const a = ndcFor(player, pose, zoom, aspect);
  const b = ndcFor(other, pose, zoom, aspect);
  const padA = (Math.max(2, Number(player.radius) || 6) / zoom);
  const padB = (Math.max(2, Number(other.radius) || 6) / zoom);
  return Math.abs(a.x) + padA <= safe
    && Math.abs(a.z) + padA <= safe
    && Math.abs(b.x) + padB <= safe
    && Math.abs(b.z) + padB <= safe;
}

export function zoomToFitBoth(player, other, pose, aspect = 16 / 9, safe = TWO_BODY_SAFE_NDC) {
  if (!pose) return 72;
  let zoom = Math.max(58, pose.fitWu * 0.85);
  for (let i = 0; i < 16 && !bothBodiesInside(player, other, pose, zoom, aspect, safe); i += 1) {
    zoom *= 1.12;
  }
  return Math.min(330, zoom);
}

/**
 * Sample a taut-line swing. Returns the fraction of ticks both bodies stay inside the frame.
 */
export function sampleTautSwing(player, other, ticks = 60) {
  const ax0 = player.pos.x;
  const az0 = player.pos.z;
  const bx0 = other.pos.x;
  const bz0 = other.pos.z;
  const cx = (ax0 + bx0) * 0.5;
  const cz = (az0 + bz0) * 0.5;
  const radius = Math.hypot(ax0 - cx, az0 - cz);
  let inside = 0;
  for (let i = 0; i < ticks; i += 1) {
    const angle = (i / ticks) * Math.PI * 0.65;
    const a = {
      radius: player.radius,
      pos: { x: cx + Math.cos(angle) * radius, z: cz + Math.sin(angle) * radius },
    };
    const b = {
      radius: other.radius,
      pos: { x: cx - Math.cos(angle) * radius, z: cz - Math.sin(angle) * radius },
    };
    const pose = lineDiagonalPose(a, b);
    const zoom = zoomToFitBoth(a, b, pose);
    if (bothBodiesInside(a, b, pose, zoom)) inside += 1;
  }
  return inside / ticks;
}
