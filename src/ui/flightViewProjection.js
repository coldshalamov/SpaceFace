// Camera-space HUD geometry. Never infer a chase bearing from fixed world axes: the stern
// view turns with the hull, and perspective divides mirror contacts behind the camera.
import { resolveSteeringView } from '../systems/racingSteer.js';

export function flightBearingAngle(state, player, target) {
  if (!player?.pos || !target) return null;
  const dx = Number(target.x) - Number(player.pos.x);
  const dz = Number(target.z) - Number(player.pos.z);
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) < 0.001) return null;
  if (resolveSteeringView(state) !== 'racing') return Math.atan2(-dx, dz);
  const m = state?.camera?.obj?.matrixWorld?.elements;
  const yaw = m && Math.hypot(m[8], m[10]) > 1e-8
    ? Math.atan2(-m[10], -m[8]) : (Number.isFinite(player.rot) ? player.rot : 0);
  const forward = Math.cos(yaw) * dx + Math.sin(yaw) * dz;
  const right = -Math.sin(yaw) * dx + Math.cos(yaw) * dz;
  return Math.atan2(right, forward);
}

export function resolveFlightEdgePlacement(width, height, projected, margin = 34, out = {}) {
  if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return null;
  const w = Math.max(320, Number(width) || 1280);
  const h = Math.max(240, Number(height) || 720);
  const sign = projected.behind === true ? -1 : 1;
  let dx = (projected.x - w / 2) * sign;
  let dy = (projected.y - h / 2) * sign;
  if (Math.hypot(dx, dy) < 0.001) {
    dx = 0;
    dy = projected.behind === true ? 1 : -1;
  }
  const mx = Math.max(24, w / 2 - margin);
  const my = Math.max(24, h / 2 - margin);
  const tx = Math.abs(dx) > 0.001 ? mx / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 0.001 ? my / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  out.x = w / 2 + dx * t;
  out.y = h / 2 + dy * t;
  out.edge = tx < ty ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'top' : 'bottom');
  out.angleRad = Math.atan2(dy, dx);
  return out;
}

// A target need not be armed, hostile, or inside scanner range to keep its selected marker.
// Selection already owns whether it is known; this consumes only that selected live entity.
export function resolveSelectedTargetMarker(player, target, projected, width, height, out = {}) {
  if (!player?.pos || !target?.pos || target.alive === false || !projected) return null;
  if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return null;
  out.offscreen = projected.onScreen !== true;
  if (out.offscreen) {
    if (!resolveFlightEdgePlacement(width, height, projected, 66, out)) return null;
  } else {
    out.x = projected.x;
    out.y = projected.y;
    out.edge = null;
    out.angleRad = 0;
  }
  const dx = target.pos.x - player.pos.x, dz = target.pos.z - player.pos.z;
  const yaw = Number.isFinite(player.rot) ? player.rot : 0;
  out.aft = dx * Math.cos(yaw) + dz * Math.sin(yaw) < 0;
  out.distance = Math.hypot(dx, dz);
  return out;
}
