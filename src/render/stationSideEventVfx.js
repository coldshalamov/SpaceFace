// Pure presentation grammar for the station:sideEvent seam.
//
// The seeded simulation director already decides which operation happens, where it starts/ends,
// and how long it lives. This module only turns that truthful payload into a reusable visual pose.
// All profiles are shared and frame writes target caller-owned scratch so the active VFX path does
// not allocate per cadence tick.

const TAU = Math.PI * 2;

export const STATION_SIDE_EVENT_VFX_CAPACITY = 6;

const HAULER_DOCK = Object.freeze({
  id: 'hauler_dock',
  silhouette: 'paired-cargo-rails',
  trajectory: 'dock-ease',
  accent: 'amber-running-lights',
  cadenceHz: 6,
  reducedCadenceHz: 2,
  defaultDurationS: 45,
});

const PATROL_LAUNCH = Object.freeze({
  id: 'patrol_launch',
  silhouette: 'launch-chevron',
  trajectory: 'accelerating-outbound',
  accent: 'twin-drive-streaks',
  cadenceHz: 9,
  reducedCadenceHz: 3,
  defaultDurationS: 60,
});

const REPAIR_DRONE = Object.freeze({
  id: 'repair_drone',
  silhouette: 'crawler-and-stitch',
  trajectory: 'hull-crawl',
  accent: 'cooling-stitch-row',
  cadenceHz: 4,
  reducedCadenceHz: 3,
  defaultDurationS: 90,
});

const CARGO_TRACTOR = Object.freeze({
  id: 'cargo_tractor',
  silhouette: 'tractor-tether-pod',
  trajectory: 'docking-orbit',
  accent: 'load-bearing-tether',
  cadenceHz: 6,
  reducedCadenceHz: 2,
  defaultDurationS: 40,
});

const SENSOR_SWEEP = Object.freeze({
  id: 'sensor_sweep',
  silhouette: 'boom-and-return-arc',
  trajectory: 'dish-sweep',
  accent: 'telemetry-return-row',
  cadenceHz: 5,
  reducedCadenceHz: 2,
  defaultDurationS: 70,
});

const QUIET_DOCK = Object.freeze({
  id: 'quiet_dock',
  silhouette: 'lights-out-runner',
  trajectory: 'slip-run',
  accent: 'dimmed-transit-lights',
  cadenceHz: 5,
  reducedCadenceHz: 2,
  defaultDurationS: 35,
});

export const STATION_SIDE_EVENT_VFX_PROFILES = Object.freeze({
  hauler_dock: HAULER_DOCK,
  patrol_launch: PATROL_LAUNCH,
  repair_drone: REPAIR_DRONE,
  cargo_tractor: CARGO_TRACTOR,
  sensor_sweep: SENSOR_SWEEP,
  quiet_dock: QUIET_DOCK,
});

export function resolveStationSideEventVfxProfile(kind) {
  return STATION_SIDE_EVENT_VFX_PROFILES[kind] || null;
}

export function createStationSideEventVfxFrameScratch() {
  return {
    x: 0,
    z: 0,
    dirX: 1,
    dirZ: 0,
    normalX: 0,
    normalZ: 1,
    progress: 0,
    emitStep: -1,
    accentSlot: 0,
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function writeDirection(out, dx, dz) {
  const length = Math.hypot(dx, dz);
  if (length > 1e-6) {
    out.dirX = dx / length;
    out.dirZ = dz / length;
  }
  out.normalX = -out.dirZ;
  out.normalZ = out.dirX;
}

/**
 * Write one operation pose into `out` and return it. Positional scalar arguments keep this hot
 * function allocation-free; callers retain their event record and frame scratch for its lifetime.
 */
export function writeStationSideEventVfxFrame(
  profile,
  elapsedS,
  durationS,
  fromX,
  fromZ,
  toX,
  toZ,
  centerX,
  centerZ,
  bearing,
  reducedMotion,
  out,
) {
  const frame = out || createStationSideEventVfxFrameScratch();
  if (!profile) return frame;

  const elapsed = Math.max(0, Number.isFinite(elapsedS) ? elapsedS : 0);
  const duration = Math.max(0.25, Number.isFinite(durationS) ? durationS : profile.defaultDurationS);
  const progress = clamp01(elapsed / duration);
  const fx = Number.isFinite(fromX) ? fromX : 0;
  const fz = Number.isFinite(fromZ) ? fromZ : 0;
  const tx = Number.isFinite(toX) ? toX : fx;
  const tz = Number.isFinite(toZ) ? toZ : fz;
  const cx = Number.isFinite(centerX) ? centerX : (fx + tx) * 0.5;
  const cz = Number.isFinite(centerZ) ? centerZ : (fz + tz) * 0.5;
  const baseBearing = Number.isFinite(bearing) ? bearing : Math.atan2(fz - cz, fx - cx);

  if (profile.trajectory === 'dock-ease') {
    const t = reducedMotion ? 0.72 : 1 - (1 - progress) * (1 - progress);
    frame.x = fx + (tx - fx) * t;
    frame.z = fz + (tz - fz) * t;
    writeDirection(frame, tx - fx, tz - fz);
    frame.progress = t;
  } else if (profile.trajectory === 'accelerating-outbound') {
    const t = reducedMotion ? 0.28 : progress * progress;
    frame.x = fx + (tx - fx) * t;
    frame.z = fz + (tz - fz) * t;
    writeDirection(frame, tx - fx, tz - fz);
    frame.progress = t;
  } else if (profile.trajectory === 'hull-crawl') {
    const radius = Math.max(4, Math.hypot(fx - cx, fz - cz));
    const cycle = reducedMotion ? 0 : Math.sin((elapsed / 14) * TAU);
    const angle = baseBearing + cycle * 0.42;
    frame.x = cx + Math.cos(angle) * radius;
    frame.z = cz + Math.sin(angle) * radius;
    const travelSign = reducedMotion || Math.cos((elapsed / 14) * TAU) >= 0 ? 1 : -1;
    writeDirection(frame, -Math.sin(angle) * travelSign, Math.cos(angle) * travelSign);
    frame.progress = (cycle + 1) * 0.5;
  } else if (profile.trajectory === 'docking-orbit') {
    const radius = Math.max(4, Math.hypot(fx - cx, fz - cz));
    const angle = baseBearing + (reducedMotion ? 0 : progress * TAU);
    frame.x = cx + Math.cos(angle) * radius;
    frame.z = cz + Math.sin(angle) * radius;
    writeDirection(frame, -Math.sin(angle), Math.cos(angle));
    frame.progress = progress;
  } else if (profile.trajectory === 'dish-sweep') {
    // A slow calibration pendulum over the near-field arc: the boom swings out and back around the
    // station, distinct from the drone's fast full crawl and the tractor's docking orbit.
    const radius = Math.max(4, Math.hypot(fx - cx, fz - cz));
    const cycle = reducedMotion ? 0 : Math.sin((elapsed / 22) * TAU);
    const angle = baseBearing + cycle * 0.30;
    frame.x = cx + Math.cos(angle) * radius;
    frame.z = cz + Math.sin(angle) * radius;
    const travelSign = reducedMotion || Math.cos((elapsed / 22) * TAU) >= 0 ? 1 : -1;
    writeDirection(frame, -Math.sin(angle) * travelSign, Math.cos(angle) * travelSign);
    frame.progress = (cycle + 1) * 0.5;
  } else if (profile.trajectory === 'slip-run') {
    // The black-market runner does not fly the lane like declared freight: it burns in hot, cuts
    // the drive mid-course and drifts off-line, then rejoins the approach. Cubic ease-out approach
    // + a perpendicular sag keyed to bearing (deterministic per event, never ambient randomness).
    const t = reducedMotion ? 0.72 : 1 - (1 - progress) * (1 - progress) * (1 - progress);
    const sag = reducedMotion ? 0 : Math.sin(progress * Math.PI) * 6;
    const sideSign = Math.sin(baseBearing * 3.7) >= 0 ? 1 : -1;
    const lx = fx + (tx - fx) * t;
    const lz = fz + (tz - fz) * t;
    // Perpendicular of the approach line, applied after the linear step so the offset is readable.
    const pl = Math.hypot(tx - fx, tz - fz) || 1;
    const px = -(tz - fz) / pl;
    const pz = (tx - fx) / pl;
    frame.x = lx + px * sag * sideSign;
    frame.z = lz + pz * sag * sideSign;
    writeDirection(frame, tx - fx, tz - fz);
    frame.progress = t;
  } else {
    frame.x = fx + (tx - fx) * progress;
    frame.z = fz + (tz - fz) * progress;
    writeDirection(frame, tx - fx, tz - fz);
    frame.progress = progress;
  }

  const cadence = reducedMotion ? profile.reducedCadenceHz : profile.cadenceHz;
  frame.emitStep = Math.floor(elapsed * cadence);
  frame.accentSlot = frame.emitStep >= 0 ? frame.emitStep % 7 : 0;
  return frame;
}
