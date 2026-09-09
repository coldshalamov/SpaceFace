/**
 * Player thruster recipe — a raymarched exhaust volume plus a stylistic history thread.
 *
 *  1. `jet`    Physical envelope of the exhaust: length, exit radius, exhaust speed, shock train.
 *              These are engine properties, so the plume never scales with hull speed. The volume
 *              block below says what the gas inside this envelope looks like.
 *  2. `throat` The over-range pinpoint inside the bell that an emission integral cannot reach.
 *  3. `snake`  Stylistic history filament. Thin, long, meanders through a world-space noise field.
 *
 * There is no layer stack and no wake-parcel cloud here any more. Those described camera-facing
 * sheets, which are physically incapable of self-occlusion and could only ever render banding on a
 * cone; `../materials/volumetricPlumeMaterial.js` explains what replaced them.
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

export const PLAYER_PLASMA_STREAM_RECIPE = freezeDeep({
  id: 'player_liquid_plasma_v27.0',
  kind: 'raymarched_plasma_volume',
  displayName: 'Player continuous liquid plasma thruster',
  notes: 'v27: the exhaust is a raymarched density volume (curl-warped ridged noise integrated '
    + 'front-to-back inside an oriented proxy at each nozzle), so filaments braid and occlude each '
    + 'other and the silhouette is where density runs out. Replaces the v26 stack of camera-facing '
    + 'jet sheets and ejected wake parcels. Boost lengthens and collimates instead of widening.',

  // ---- Physical envelope of the plume -------------------------------------------------------
  jet: {
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

  // ---- Exhaust volume (the raymarched plume) ------------------------------------------------
  // Every number here is a property of the density field the shader integrates, not of a mesh.
  // `jet.lengthWU` and `jet.exitRadiusWU` still set the plume's physical size; this block sets
  // what the gas inside that envelope looks like.
  volume: {
    maxNozzles: 4,
    // Marching budget. Close framing gets the ceiling; the system scales down by apparent size.
    minSteps: 12,
    maxSteps: 56,
    quality: 1,

    // Envelope. Roughly a 1:3 width-to-length plume: wide enough that the tail is clearly a
    // dissipating cloud, narrow enough that it still reads as a directed jet rather than a bloom.
    tailFlare: 2.0,
    spread: 0.62,
    fadeStart: 0.42,

    // Structure. `stretch` elongates noise features along the flow: without it the field resolves
    // as blobs of smoke instead of strands. `threshold` opens the dark veins between filaments,
    // and is the single strongest control over whether the plume reads as gas or as fog.
    // Low on purpose: this sets how many strands span the plume, and the target is roughly eight
    // thick ropes, not a fine fuzz. Fine fuzz is also the frequency the march cannot resolve, so
    // raising this trades visible structure for speckle that the mip filter then has to erase.
    noiseScale: 0.18,
    stretch: 2.8,
    threshold: 0.50,
    // Extinction is set so a centre ray accumulates roughly 0.8 opacity over the plume's length.
    // Higher saturates the whole cone to white and erases every filament inside it.
    sigma: 0.58,
    // Small. The veil is a smooth term added everywhere, so it fills the dark veins between
    // strands and is the fastest way to turn a plasma jet back into fog.
    veil: 0.05,
    // Length of the unbroken supersonic core, as a fraction of plume length, before the shear
    // layer breaks down into filaments. Wispiness right at the lip is the classic fake-jet tell.
    coherence: 0.15,
    coreDensity: 0.5,
    radialTight: 2.0,

    // Curl warp — the reason filaments braid instead of running parallel. Amplitude grows with the
    // square of axial distance so eddies visibly widen from the lip to the tail.
    warpAmp: 1.2,
    warpScale: 0.24,
    warpGrowth: 2.0,
    warpBoostGain: 0.3,

    // Downstream advection of the density field, as a fraction of `jet.exhaustSpeedWU`.
    flowScale: 0.22,
    shockScale: 0.12,
    radiance: 2.3,

    // Temperature ramp: searing white at the throat through electric cyan to a deep blue fringe.
    // Red is kept very low in the mid and edge tones on purpose. These are additive HDR values and
    // radiance pushes green and blue past 1.0, so the tone mapper compresses those channels while
    // red stays where it is — the surviving red is what decides how saturated the plume looks. Set
    // red anywhere near green and the whole cloud desaturates to grey smoke on the way through ACES.
    coreColor: [1.0, 0.99, 0.97],
    midColor: [0.14, 0.62, 1.0],
    edgeColor: [0.02, 0.10, 0.72],
  },

  // ---- Stylistic history filament (the Snake thread) ----------------------------------------
  // `freq` is [cycles per world unit along the flow, cycles across the half width].
  snake: {
    widthHeadWU: 0.66,
    // Wider at the tail, not thinner. Exhaust left in space keeps spreading, so a thread that
    // narrows with age converges on a one-pixel line and reads as a ruled line drawn to the edge of
    // the screen. Spreading while the opacity collapses is what makes it read as dispersal.
    widthTailWU: 2.6,
    // World-space meander so the thread is never a ruled line behind a ship flying straight.
    meanderWU: 5.5,
    meanderScaleWU: 0.021,
    meanderOnsetS: 0.05,
    opacity: 0.09,
    radiance: 0.32,
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
  // (retro jets are configured separately — see PLAYER_RETRO_VOLUME_RECIPE below)
  // Small and restrained now that the volume renders its own hot core — the disc only supplies the
  // over-range pinpoint at the bell that an emission integral cannot reach on its own. Oversized,
  // it stops reading as a throat and becomes a white ball stuck on the back of the ship.
  throat: {
    radiusWU: 0.9,
    opacity: 0.35,
    radiance: 1.4,
    color: [0.62, 0.93, 1.0],
  },
});

/**
 * Bow retro jets — the exhaust that fires FORWARD when braking or backing up.
 *
 * These used to be drawn by the attitude-control impulse system, which can only produce short
 * discrete pops. It fired one roughly every 0.11 s, so holding the brake — a sustained action —
 * rendered as about nine separate puffs a second in a line. That mismatch between a continuous
 * input and a burst-only renderer is what read as a dotted line, and no amount of tuning inside
 * the burst system could have fixed it.
 *
 * So retro is the same volumetric exhaust as the main drive, only small: stubby and hard, because
 * a braking thruster is a short high-pressure jet rather than a long cruising plume. Genuinely
 * impulsive attitude pops (strafe, yaw) stay on the burst system, where that model is correct.
 */
export const PLAYER_RETRO_VOLUME_RECIPE = freezeDeep({
  id: 'player_retro_volume_v2',
  lengthWU: 4.8,
  exitRadiusWU: 0.18,
  tailFlare: 1.75,
  spread: 0.75,
  fadeStart: 0.42,

  // Fine-grained supersonic needle filaments with high axial stretch
  noiseScale: 0.22,
  stretch: 7.5,
  threshold: 0.58,
  sigma: 0.85,
  veil: 0.01,
  coherence: 0.35,
  coreDensity: 0.88,
  radialTight: 3.8,

  warpAmp: 0.45,
  warpScale: 0.35,
  warpGrowth: 1.2,
  flowSpeed: 22.0,

  // Supersonic shock diamond train
  shockAmp: 0.55,
  shockPitch: 0.95,
  shockDecay: 3.2,
  radiance: 3.8,

  // High-intensity white-hot core with electric cyan mid and deep sapphire boundary
  coreColor: [1.0, 1.0, 1.0],
  midColor: [0.65, 0.92, 1.0],
  edgeColor: [0.08, 0.35, 0.95],

  // Sharp raymarching steps for crisp needle silhouette without banding
  minSteps: 16,
  maxSteps: 40,
});
