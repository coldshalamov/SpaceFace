// Render-only stern (third-person) camera. Relative offsets survive floating-origin changes and
// teleports. Polar eye interpolation goes AROUND the hull, never through it. No FOV or simulation
// writes: everything here is where the eye sits and what it looks at.
//
// What the rig does, and why:
//   • It sits behind where the ship is GOING, not only where the nose points. This ship drifts —
//     the nose swings first and the travel line follows — so a camera locked to the nose shows the
//     pilot the inside of the corner while the hull slides toward the outside wall. As speed builds
//     the heading the eye follows is pulled toward the velocity direction.
//   • It trails the heading by a short lag, so a turn reads as the hull moving in the frame before
//     the frame comes round. A rigid follow hides the turn the pilot just made.
//   • The look point runs ahead of a turn (by the hull's own yaw rate), opening the corner.
//   • It pulls back and lifts with speed. The course ahead spreads out exactly when there is less
//     time to read it, and the widening view is the sense of speed.
// Reduced motion keeps the plain rig: nose-locked, fixed distance, no lead.
const TAU = Math.PI * 2;
const angleDelta = (a, b) => ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

export const RACING_CAMERA = Object.freeze({
  yawFollowS: 0.13,       // lag of the eye behind the followed heading
  yawFollowReducedS: 0.075,
  driftBlendMax: 0.5,     // share of the travel direction in the followed heading at speed
  driftSpeedLo: 60,       // below this the nose alone is followed
  driftSpeedHi: 260,
  driftMaxAngle: 1.75,    // a ship flying backwards is not "drifting"; the nose wins
  pullBack: 0.3,          // extra distance at top speed, as a fraction of the rig distance
  lift: 0.22,             // extra height at top speed, as a fraction of the rig height
  speedTop: 460,
  speedLead: 0.06,        // metres of look-ahead per m/s
  speedLeadMax: 28,       // a long lead flattens the pitch and drops the ship under the instruments
  turnLeadS: 0.2,         // seconds of hull yaw rate the look point runs ahead by
  turnLeadMax: 0.26,      // rad
  turnRateSmoothS: 0.18,
});

export function createRacingCameraBlend() { return { mix: 0, yaw: NaN, nose: NaN, rate: 0 }; }

export function stepRacingCameraBlend(memory, dt, enabled, anchor, yaw, speed, rig,
  overhead, reducedMotion, out = {}, forceOverhead = false, motion = null) {
  const C = RACING_CAMERA;
  const step = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
  if (forceOverhead) memory.mix = 0;
  else memory.mix = lerp(memory.mix, enabled ? 1 : 0, -Math.expm1(-step / 0.22));
  if (memory.mix < 0.0001) memory.mix = 0;
  if (memory.mix > 0.9999) memory.mix = 1;
  const nose = Number.isFinite(yaw) ? yaw : 0;
  const spd = Number.isFinite(speed) ? Math.max(0, speed) : 0;

  let heading = nose;
  if (!reducedMotion && motion && Number.isFinite(motion.vx) && Number.isFinite(motion.vz) && spd > C.driftSpeedLo) {
    const off = angleDelta(nose, Math.atan2(motion.vz, motion.vx));
    if (Math.abs(off) < C.driftMaxAngle) {
      heading = nose + off * C.driftBlendMax * smooth((spd - C.driftSpeedLo) / (C.driftSpeedHi - C.driftSpeedLo));
    }
  }
  if (!Number.isFinite(memory.yaw) || !enabled) {
    memory.yaw = heading;
    memory.rate = 0;
  } else {
    memory.yaw += angleDelta(memory.yaw, heading)
      * -Math.expm1(-step / (reducedMotion ? C.yawFollowReducedS : C.yawFollowS));
    if (step > 0 && Number.isFinite(memory.nose)) {
      const instant = angleDelta(memory.nose, nose) / step;
      memory.rate = (memory.rate || 0) + (instant - (memory.rate || 0)) * -Math.expm1(-step / C.turnRateSmoothS);
    }
  }
  memory.nose = nose;
  if (memory.mix === 0) return Object.assign(out, overhead);

  const x = anchor.x, z = anchor.z, mix = memory.mix;
  const pace = reducedMotion ? 0 : smooth(spd / C.speedTop);
  const distance = rig.distance * (1 + C.pullBack * pace);
  const height = rig.height * (1 + C.lift * pace);
  const lead = rig.lookAhead + (reducedMotion ? 0 : Math.min(C.speedLeadMax, spd * C.speedLead));
  const lookYaw = memory.yaw + (reducedMotion ? 0
    : clamp((memory.rate || 0) * C.turnLeadS, -C.turnLeadMax, C.turnLeadMax));

  const ox = overhead.eyeX - x, oz = overhead.eyeZ - z;
  const baseAngle = Math.atan2(oz, ox);
  const sternAngle = memory.yaw + Math.PI;
  const angle = baseAngle + angleDelta(baseAngle, sternAngle) * mix;
  const radius = lerp(Math.hypot(ox, oz), distance, mix);
  out.eyeX = x + Math.cos(angle) * radius;
  out.eyeZ = z + Math.sin(angle) * radius;
  out.eyeY = lerp(overhead.eyeY, height, mix);
  out.lookX = lerp(overhead.lookX, x + Math.cos(lookYaw) * lead, mix);
  out.lookZ = lerp(overhead.lookZ, z + Math.sin(lookYaw) * lead, mix);
  return out;
}
