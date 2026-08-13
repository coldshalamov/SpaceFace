/**
 * Player thruster recipe — three elements with three different physical timescales.
 *
 *  1. `jet`   Nozzle-locked steady plume. Rigid, straight out of the bell, physical length in WU.
 *             Never follows path history and never scales with ship speed: a real plume's size is
 *             set by the engine, not by how fast the hull happens to be moving.
 *  2. `wake`  Gas that has LEFT the nozzle. World-space parcels with their own aft momentum that
 *             expand and cool where they were emitted. This is the element that bends on a turn
 *             and detaches when throttle is cut.
 *  3. `snake` Stylistic history filament. Thin, long, meanders through a world-space noise field.
 *
 * Scale reference: lab ship ~8 WU long, nozzle bell radius ~1.35 WU.
 */

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

export function smoothstep(edge0, edge1, x) {
  if (!(edge1 > edge0)) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Longitudinal heat / opacity structure of a plume: searing throat, burning body, dissipating tail.
 * `s` is normalized distance downstream. Width is NOT taken from here — a plume expands downstream
 * (see sampleJetHalfWidth); this curve owns how fast it stops emitting light.
 */
export function samplePlasmaEnvelope(s, drive = 1, boost = 0, out = null) {
  const u = Math.max(0, Math.min(1, Number.isFinite(s) ? s : 1));
  const d = Math.max(0, Math.min(1.35, Number.isFinite(drive) ? drive : 0));
  const b = Math.max(0, Math.min(1, Number.isFinite(boost) ? boost : 0));
  const root = 1 - smoothstep(0.0, 0.2, u);
  const jet = (1 - smoothstep(0.05, 0.55, u));
  const wake = smoothstep(0.2, 0.45, u) * (1 - smoothstep(0.72, 1.0, u));
  const belly = Math.exp(-((u - 0.14) * (u - 0.14)) / (2 * 0.11 * 0.11));
  const midBulge = Math.exp(-((u - 0.3) * (u - 0.3)) / (2 * 0.18 * 0.18)) * 0.4;
  const taper = Math.pow(Math.max(0.1, 1.0 - u * 0.8), 0.9);
  const width = (0.58 + root * 0.7 + jet * 0.48 + belly * 0.55 + midBulge + b * 0.28)
    * (0.82 + d * 0.35)
    * taper;
  const heat = Math.min(1.35, root * 1.15 + jet * 0.55 + b * 0.3 + d * 0.15 + belly * 0.2);
  const opacity = (0.7 + root * 0.35 + jet * 0.3 + d * 0.15)
    * (1.0 - smoothstep(0.55, 1.0, u) * 0.55);
  const target = out || {};
  target.s = u;
  target.width = Math.max(0.14, width);
  target.heat = Math.max(0, heat);
  target.opacity = Math.max(0.04, opacity);
  target.root = root;
  target.jet = jet;
  target.wake = wake;
  target.density = target.opacity;
  target.filament = jet * 0.75 + wake * 0.55;
  target.rootWindow = root;
  target.jetWindow = jet;
  target.wakeWindow = wake;
  return target;
}

/**
 * Free-expansion half width of one plume layer, in WU.
 *
 * Exhaust leaves the throat at roughly the exit radius and then opens into a cone, so the plume is
 * NARROWEST where it is brightest and widest where it is nearly gone. `spread` is how much cone each
 * layer contributes: the core is an almost collimated supersonic column, the sheath is the broad
 * mixed shear layer around it. Boost collimates rather than inflates — higher exit momentum makes a
 * longer, harder spear, not a fatter triangle.
 *
 * @param {number} u normalized distance downstream (0 = nozzle exit)
 */
export function sampleJetHalfWidth(u, exitRadiusWU, spread, boost = 0, collimate = 0) {
  const t = Math.max(0, Math.min(1, Number.isFinite(u) ? u : 0));
  const b = Math.max(0, Math.min(1, Number.isFinite(boost) ? boost : 0));
  const cone = Math.max(0, spread) * (1 - Math.max(0, Math.min(1, collimate)) * b);
  // Slight throat neck before the cone opens (the first barrel shock pulls the limb in).
  const neck = 1 - 0.12 * Math.exp(-((t - 0.06) * (t - 0.06)) / (2 * 0.05 * 0.05));
  return Math.max(0.05, exitRadiusWU * neck * (1 + t * cone));
}

/**
 * Standing shock train phase. Nodes sit at integer phase with spacing that SHRINKS downstream, the
 * way a real shock train damps out. Stationary in the nozzle frame — a pressure structure, not
 * material, so it must not advect with the filaments.
 */
export function shockPhase(axialWU, pitchWU) {
  const a = Math.max(0, Number.isFinite(axialWU) ? axialWU : 0);
  const p = Math.max(0.05, Number.isFinite(pitchWU) ? pitchWU : 2);
  return Math.pow(a / p, 1 / 0.7);
}

export const PLAYER_PLASMA_STREAM_RECIPE = freezeDeep({
  id: 'player_liquid_plasma_v26.0',
  kind: 'unified_liquid_plasma',
  displayName: 'Player continuous liquid plasma thruster',
  notes: 'v26: nozzle-locked rigid jet (physical WU length, free-expansion cone, standing shock '
    + 'train) + Lagrangian world-space wake parcels (bend on turns, detach on throttle cut) + thin '
    + 'meandering history filament. Filament noise advects in world units instead of scrolling '
    + 'across a path-normalized mesh. Boost lengthens and collimates instead of widening.',

  // ---- Element 1: rigid nozzle-locked plume -------------------------------------------------
  jet: {
    segments: 72,
    lengthWU: 17,
    exitRadiusWU: 1.32,
    // Length at zero throttle as a fraction of lengthWU (a lit engine is never zero-length).
    driveLengthFloor: 0.45,
    // Advection speed of the filament field, WU/s. A steady jet's coherent structure is nearly
    // standing (it is set by the nozzle), so this is deliberately far below any literal exhaust
    // velocity: axialFreq * this must land around 3 cycles/s or the filaments read as static.
    exhaustSpeedWU: 30,
    boostSpeedMul: 1.6,
    boostCollimate: 0.28,
    // Standing shock train. Kept compact near the throat: a train that survives far downstream
    // reads as a rung ladder rather than the couple of diamonds a real nozzle shows.
    shock: {
      pitchWU: 1.5,
      amplitude: 0.34,
      boostGain: 0.4,
      pinch: 0.14,
      decayWU: 5.0,
    },
    // One-shot ignition transient so boost reads as an event, not a width ramp.
    ignition: { decayPerS: 3.6, lengthOvershoot: 0.24, radianceOvershoot: 0.7, shockGain: 0.8 },
  },

  // `freq` is [cycles per world unit along the flow, cycles across the half width]. Axial frequency
  // stays low so filaments are long streamlines rather than a fine sizzle, and so advection at
  // exhaustSpeedWU lands near 3 cycles/s instead of strobing.
  layers: [
    {
      role: 'core',
      widthScale: 0.60,
      spread: 0.42,
      lengthScale: 0.62,
      opacity: 0.72,
      radiance: 1.95,
      color: [0.62, 0.93, 1.0],
      freq: [0.100, 2.0],
      shock: 1.0,
      cross: false,
    },
    {
      role: 'body',
      widthScale: 1.00,
      spread: 1.45,
      lengthScale: 1.00,
      opacity: 0.56,
      radiance: 1.28,
      color: [0.24, 0.76, 1.0],
      freq: [0.085, 3.0],
      shock: 0.18,
      // Soft cross REQUIRED — a single plane goes edge-on invisible from rear-three-quarter.
      cross: true,
    },
    {
      role: 'sheath',
      widthScale: 1.52,
      spread: 2.35,
      lengthScale: 0.84,
      opacity: 0.28,
      radiance: 0.72,
      color: [0.10, 0.34, 0.90],
      freq: [0.070, 4.0],
      shock: 0.0,
      cross: false,
    },
  ],

  // ---- Element 2: ejected gas with its own momentum ----------------------------------------
  // Short-lived on purpose: this is the cool cloud hugging the plume, not the long thread. Its job
  // is to lag and kink when the ship turns and to stay behind when the throttle is cut.
  wake: {
    capacity: 96,
    emitHz: 90,
    boostEmitMul: 1.45,
    lifeS: 0.5,
    // Aft drift of a parcel once it leaves the bell, WU/s.
    driftWU: 44,
    birthRadiusWU: 1.55,
    expandPerS: 3.4,
    opacity: 0.20,
    radiance: 0.55,
    color: [0.16, 0.52, 0.95],
    freq: [0.17, 2.2],
    cross: true,
  },

  // ---- Element 3: stylistic history filament (the Snake thread) -----------------------------
  snake: {
    widthHeadWU: 0.66,
    widthTailWU: 0.17,
    // World-space meander so the thread is never a ruled line behind a ship flying straight.
    meanderWU: 2.8,
    meanderScaleWU: 0.021,
    meanderOnsetS: 0.05,
    opacity: 0.36,
    radiance: 1.0,
    color: [0.34, 0.82, 1.0],
    freq: [0.13, 1.3],
    // Seconds for the head to erode away after thrust stops (the thread drains, not blinks out).
    eraseS: 1.5,
  },

  path: {
    // 288 * 0.5 = 144 WU of retained thread — a little over twice the previous 48 WU.
    capacity: 288,
    sampleSpacingWU: 0.5,
    sampleHz: 90,
    discontinuityFloorWU: 160,
    discontinuityMaxWU: 640,
  },

  drive: {
    idleFloor: 0.04,
    // Boost is length + heat, NOT width. A uniform width multiply is what made boost read as a
    // triangle inflating in place.
    boostLengthMul: 1.55,
    boostWidthMul: 1.08,
    boostRadianceMul: 1.5,
  },

  // Nozzle-interior glow discs (one per socket): the lit engine core inside the bell.
  throat: {
    radiusWU: 1.45,
    opacity: 0.55,
    radiance: 1.6,
  },
});
