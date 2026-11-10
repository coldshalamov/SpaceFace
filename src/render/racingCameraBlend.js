// Render-only stern transition. Relative offsets survive floating-origin changes and teleports.
// Polar eye interpolation goes AROUND the hull, never through it. No FOV or simulation writes.
const TAU = Math.PI * 2;
const angleDelta = (a, b) => ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
export function createRacingCameraBlend() { return { mix: 0, yaw: NaN }; }
export function stepRacingCameraBlend(memory, dt, enabled, anchor, yaw, speed, rig,
  overhead, reducedMotion, out = {}, forceOverhead = false) {
  const step = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
  if (forceOverhead) memory.mix = 0;
  else memory.mix = lerp(memory.mix, enabled ? 1 : 0, -Math.expm1(-step / 0.22));
  if (memory.mix < 0.0001) memory.mix = 0;
  if (memory.mix > 0.9999) memory.mix = 1;
  const targetYaw = Number.isFinite(yaw) ? yaw : 0;
  if (!Number.isFinite(memory.yaw) || !enabled) memory.yaw = targetYaw;
  else memory.yaw += angleDelta(memory.yaw, targetYaw) * -Math.expm1(-step / 0.075);
  if (memory.mix === 0) return Object.assign(out, overhead);
  const x = anchor.x, z = anchor.z, mix = memory.mix;
  const ox = overhead.eyeX - x, oz = overhead.eyeZ - z;
  const baseAngle = Math.atan2(oz, ox);
  const sternAngle = memory.yaw + Math.PI;
  const angle = baseAngle + angleDelta(baseAngle, sternAngle) * mix;
  const radius = lerp(Math.hypot(ox, oz), rig.distance, mix);
  const lead = rig.lookAhead + (reducedMotion ? 0 : Math.min(32, Math.max(0, speed) * 0.05));
  out.eyeX = x + Math.cos(angle) * radius;
  out.eyeZ = z + Math.sin(angle) * radius;
  out.eyeY = lerp(overhead.eyeY, rig.height, mix);
  out.lookX = lerp(overhead.lookX, x + Math.cos(memory.yaw) * lead, mix);
  out.lookZ = lerp(overhead.lookZ, z + Math.sin(memory.yaw) * lead, mix);
  return out;
}
