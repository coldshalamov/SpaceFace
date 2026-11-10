/**
 * Overhead-flight presentation math.
 *
 * Pure and allocation-light: camera lag, massline latch spring, cold-gas slipstream
 * demand, and engine-bell cooldown. No Three.js, no sim writes. Render and audio both
 * read these answers so the hiss and the ribbon describe the same maneuver.
 */

export const BOOST_LAG_FRACTION = 0.02;
export const BOOST_LAG_RISE = 7.5;
export const BOOST_LAG_FALL = 3.2;

export const LATCH_PULL_FRACTION = 0.16;
export const LATCH_PULL_MAX_WU = 18;
export const LATCH_HOLD_S = 0.32;
export const LATCH_SPRING_RATE = 4.2;

export const SLIPSTREAM_THROTTLE_CUT = 0.22;
export const SLIPSTREAM_SLIDE_WU = 7;
export const SLIPSTREAM_YAW_RATE = 0.45;
export const SLIPSTREAM_DEMAND = 0.3;

/** Full white-hot charge, then this many seconds back through cherry to gunmetal. */
export const BELL_COOL_S = 2;
const BELL_COOL_LAMBDA = Math.log(20) / BELL_COOL_S;

function clamp01(v) {
  const n = Number(v);
  if (!(n > 0)) return 0;
  return n > 1 ? 1 : n;
}

function finite(v) {
  return Number.isFinite(v) ? v : 0;
}

function damp(current, target, lambda, dt) {
  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  if (!(step > 0) || !(lambda > 0)) return Number.isFinite(current) ? current : 0;
  const cur = Number.isFinite(current) ? current : 0;
  const tgt = Number.isFinite(target) ? target : 0;
  return cur + (tgt - cur) * (1 - Math.exp(-lambda * step));
}

/**
 * World-unit pullback along the velocity vector while boosting.
 * `zoom` is the live camera distance; the offset is 2% of that distance.
 */
export function stepBoostLag(current, boosting, zoom, dt, motionReduced = false) {
  const value = Number.isFinite(current) ? current : 0;
  const distance = Number.isFinite(zoom) ? Math.max(0, zoom) : 0;
  const target = boosting && !motionReduced ? BOOST_LAG_FRACTION * distance : 0;
  const rate = target > value ? BOOST_LAG_RISE : BOOST_LAG_FALL;
  return damp(value, target, rate, dt);
}

export function createLatchSpring() {
  return {
    x: 0,
    z: 0,
    targetX: 0,
    targetZ: 0,
    hold: 0,
    wasLatched: false,
  };
}

/**
 * On the rising edge of a heavy latch, spring the focus partway toward the anchor,
 * hold briefly, then spring back to the ship even if the line stays attached.
 */
export function stepLatchSpring(spring, input, dt) {
  const s = spring || createLatchSpring();
  const src = input || {};
  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const now = src.latched === true && src.heavy === true && src.motionReduced !== true;
  if (now && !s.wasLatched) {
    const dx = finite(src.anchorX) - finite(src.playerX);
    const dz = finite(src.anchorZ) - finite(src.playerZ);
    const len = Math.hypot(dx, dz);
    if (len > 1) {
      const pull = Math.min(LATCH_PULL_MAX_WU, len * LATCH_PULL_FRACTION);
      s.targetX = (dx / len) * pull;
      s.targetZ = (dz / len) * pull;
      s.hold = LATCH_HOLD_S;
    }
  }
  if (!now) {
    s.targetX = 0;
    s.targetZ = 0;
    s.hold = 0;
  } else if (s.hold > 0) {
    s.hold = Math.max(0, s.hold - step);
    if (s.hold <= 0) {
      s.targetX = 0;
      s.targetZ = 0;
    }
  }
  s.wasLatched = now;
  s.x = damp(s.x, s.targetX, LATCH_SPRING_RATE, step);
  s.z = damp(s.z, s.targetZ, LATCH_SPRING_RATE, step);
  if (Math.abs(s.x) < 0.0001) s.x = 0;
  if (Math.abs(s.z) < 0.0001) s.z = 0;
  return s;
}

/**
 * Cold-gas ribbons when forward thrust is cut and the hull is sliding or rotating.
 * `side` is the exhaust side in ship-local terms: +1 starboard, -1 port, matching the slide.
 * `yawCouple` is nonzero when the maneuver is a rotation rather than a lateral drift,
 * so both sides of the couple get a ribbon.
 */
export function resolveSlipstreamInto(input, out) {
  const dst = out || { active: false, intensity: 0, side: 0, yawCouple: 0 };
  const src = input || {};
  const throttle = clamp01(src.throttle);
  const boosting = src.boosting === true;
  const lat = finite(src.lateralSpeed);
  const yaw = finite(src.yawRate);
  const latD = finite(src.lateralDemand);
  const yawD = finite(src.yawDemand);
  const thrustCut = !boosting && throttle <= SLIPSTREAM_THROTTLE_CUT;
  const sliding = Math.abs(lat) >= SLIPSTREAM_SLIDE_WU || Math.abs(latD) >= SLIPSTREAM_DEMAND;
  const rotating = Math.abs(yaw) >= SLIPSTREAM_YAW_RATE || Math.abs(yawD) >= SLIPSTREAM_DEMAND;
  if (!thrustCut || (!sliding && !rotating)) {
    dst.active = false;
    dst.intensity = 0;
    dst.side = 0;
    dst.yawCouple = 0;
    return dst;
  }
  const slideU = Math.min(1, Math.abs(lat) / 36);
  const yawU = Math.min(1, Math.abs(yaw) / 1.8);
  const demandU = Math.min(1, Math.max(Math.abs(latD), Math.abs(yawD)));
  const intensity = Math.max(slideU, yawU * 0.8, demandU * 0.65);
  let side = 0;
  if (Math.abs(lat) >= 2) side = Math.sign(lat);
  else if (Math.abs(latD) >= 0.05) side = -Math.sign(latD);
  else side = -Math.sign(yaw || yawD || 0);
  const yawCouple = Math.abs(lat) < SLIPSTREAM_SLIDE_WU
    && (Math.abs(yaw) >= SLIPSTREAM_YAW_RATE || Math.abs(yawD) >= SLIPSTREAM_DEMAND);
  dst.active = intensity >= 0.12;
  dst.intensity = dst.active ? intensity : 0;
  dst.side = dst.active ? side : 0;
  dst.yawCouple = dst.active && yawCouple ? Math.sign(yaw || yawD || side || 1) : 0;
  return dst;
}

/**
 * Bell heat. Full drive charges toward white-hot. Releasing the drive cools to gunmetal
 * on a 2 second exponential (about 5% remains at 2s). A lower sustained throttle cools
 * toward that throttle, not all the way to cold.
 */
export function integrateBellHeat(heat, drive, dt) {
  const h = clamp01(heat);
  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const target = clamp01(drive);
  if (!(step > 0)) return h;
  if (target > h + 1e-5) {
    const tau = target >= 0.95 ? 0.38 : 0.55;
    return clamp01(h + (target - h) * (1 - Math.exp(-step / tau)));
  }
  const cooled = target + (h - target) * Math.exp(-step * BELL_COOL_LAMBDA);
  return cooled < 0.0005 ? 0 : cooled;
}

/** White-hot → cherry → dull iron → off. Intensity 0 is the authored gunmetal. */
export function sampleBellThermal(heat) {
  const h = clamp01(heat);
  if (h <= 0.001) return { r: 0, g: 0, b: 0, intensity: 0 };
  if (h < 0.34) {
    const k = h / 0.34;
    return { r: 0.28 * k, g: 0.07 * k, b: 0.05 * k, intensity: 0.45 * k };
  }
  if (h < 0.68) {
    const k = (h - 0.34) / 0.34;
    return {
      r: 0.28 + 0.72 * k,
      g: 0.07 + 0.08 * k,
      b: 0.05 * (1 - k),
      intensity: 0.45 + 1.15 * k,
    };
  }
  const k = (h - 0.68) / 0.32;
  return {
    r: 1,
    g: 0.15 + 0.85 * k,
    b: 0.02 + 0.98 * k,
    intensity: 1.6 + 1.7 * k,
  };
}

export function writeSlipstreamState(state, active, intensity) {
  if (!state || !state.render) return;
  let slip = state.render.slipstream;
  if (!slip) slip = state.render.slipstream = { active: false, intensity: 0 };
  slip.active = active === true;
  slip.intensity = active ? clamp01(intensity) : 0;
}
