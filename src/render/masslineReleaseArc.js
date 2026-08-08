// Pure Massline release-annulus planning and geometry writes.
//
// This module deliberately owns no Three.js objects and reads no GameState directly. The VFX
// adapter resolves the already-authored release target plus the live predictor/entity snapshots,
// creates one scratch object at init, and then reuses its typed arrays every frame. Simulation,
// physics, damage, save, camera, and DOM ownership stay with their existing modules.

const TAU = Math.PI * 2;
const MIN_RADIUS = 1;
const MIN_BAND_WIDTH = 0.15;
const MAX_INDEXED_QUADS = 16383; // 4 vertices each, the Uint16 index ceiling.

export const MASSLINE_RELEASE_ARC_SEGMENT_CAPACITY = 128;
export const MASSLINE_RELEASE_QUALITIES = Object.freeze(['messy', 'good', 'clean', 'razor']);

const APPROACHING_PROFILE = Object.freeze({
  shape: 'approaching-window',
  bandWidth: 6.4,
  laneCount: 1,
  segmentCount: 16,
  dashDuty: 0.46,
  laneGap: 0,
  cadenceHz: 1.2,
  brightness: 0.3,
  colorR: 0.49,
  colorG: 0.89,
  colorB: 1,
});

// The ladder is intentionally redundant. Width, topology, segment cadence, and brightness all
// change with the producer-owned classification, so desaturation or reduced color perception does
// not erase the read. These names are the canonical live vocabulary and are never renamed here.
const QUALITY_PROFILES = Object.freeze({
  messy: Object.freeze({
    shape: 'broken-wide',
    bandWidth: 7.2,
    laneCount: 1,
    segmentCount: 12,
    dashDuty: 0.34,
    laneGap: 0,
    cadenceHz: 0.75,
    brightness: 0.32,
    colorR: 1,
    colorG: 0.42,
    colorB: 0.36,
  }),
  good: Object.freeze({
    shape: 'dashed-band',
    bandWidth: 5.4,
    laneCount: 1,
    segmentCount: 18,
    dashDuty: 0.5,
    laneGap: 0,
    cadenceHz: 1.5,
    brightness: 0.52,
    colorR: 1,
    colorG: 0.7,
    colorB: 0.36,
  }),
  clean: Object.freeze({
    shape: 'paired-band',
    bandWidth: 3.8,
    laneCount: 2,
    segmentCount: 26,
    dashDuty: 0.68,
    laneGap: 0.55,
    cadenceHz: 2.75,
    brightness: 0.76,
    colorR: 0.49,
    colorG: 0.89,
    colorB: 1,
  }),
  razor: Object.freeze({
    shape: 'triple-needle',
    bandWidth: 2.4,
    laneCount: 3,
    segmentCount: 36,
    dashDuty: 0.84,
    laneGap: 0.35,
    cadenceHz: 4.5,
    brightness: 1,
    colorR: 0.92,
    colorG: 1,
    colorB: 1,
  }),
});

/** Allocate once when the VFX subsystem initializes. Never call this from its frame update. */
export function createMasslineReleaseArcPlan() {
  return {
    visible: false,
    reason: 'unresolved',
    stage: 'idle',
    quality: null,
    shape: 'none',
    targetKind: null,
    targetId: null,
    centerX: 0,
    centerZ: 0,
    radius: 0,
    innerRadius: 0,
    outerRadius: 0,
    bandWidth: 0,
    y: 0,
    startAngle: 0,
    spanRad: TAU,
    laneCount: 0,
    segmentCount: 0,
    dashDuty: 0,
    laneGap: 0,
    cadenceHz: 0,
    phaseRad: 0,
    pulse: 1,
    brightness: 0,
    colorR: 0,
    colorG: 0,
    colorB: 0,
    reducedMotion: false,
    reducedFlash: false,
    windowOpen: false,
    proximity: 0,
    timeToSolution: 0,
    hasPrediction: false,
    predictedX: 0,
    predictedZ: 0,
  };
}

/** Allocate one indexed quad pool. Indices never change; only positions and draw counts do. */
export function createMasslineReleaseArcGeometry(segmentCapacity = MASSLINE_RELEASE_ARC_SEGMENT_CAPACITY) {
  const capacity = clampInteger(segmentCapacity, 1, MAX_INDEXED_QUADS);
  const positions = new Float32Array(capacity * 4 * 3);
  const colors = new Float32Array(capacity * 4 * 3);
  const indices = new Uint16Array(capacity * 6);
  for (let segment = 0; segment < capacity; segment += 1) {
    const vertex = segment * 4;
    const offset = segment * 6;
    indices[offset] = vertex;
    indices[offset + 1] = vertex + 1;
    indices[offset + 2] = vertex + 2;
    indices[offset + 3] = vertex + 1;
    indices[offset + 4] = vertex + 3;
    indices[offset + 5] = vertex + 2;
  }
  return {
    segmentCapacity: capacity,
    positions,
    colors,
    indices,
    segmentCount: 0,
    vertexCount: 0,
    indexCount: 0,
  };
}

/** Allocate the complete init-time scratch expected by vfx.js. */
export function createMasslineReleaseArcScratch(segmentCapacity = MASSLINE_RELEASE_ARC_SEGMENT_CAPACITY) {
  return {
    plan: createMasslineReleaseArcPlan(),
    geometry: createMasslineReleaseArcGeometry(segmentCapacity),
  };
}

/**
 * Resolve a read-only presentation plan into caller-owned scratch.
 *
 * Expected input is already-existing truth: `releaseTarget`, its optional `liveTarget`, and either
 * a valid pre-release `predictor` or an exact post-release `classification`. This function never
 * invents a destination, rating, trajectory, or outcome.
 */
export function resolveMasslineReleaseArcPlan(out, input) {
  resetPlan(out);
  if (!out || !input || input.active !== true) return fail(out, 'inactive');

  const rawQuality = input.classification != null
    ? input.classification
    : (input.quality != null ? input.quality : null);
  const hasQuality = rawQuality != null && rawQuality !== '';
  const profile = hasQuality ? profileForQuality(rawQuality) : APPROACHING_PROFILE;
  if (hasQuality && !profile) return fail(out, 'unsupported-quality');

  const predictor = input.predictor;
  if (!hasQuality && !(predictor && predictor.valid === true)) return fail(out, 'no-live-predictor');

  const releaseTarget = input.releaseTarget;
  const liveTarget = input.liveTarget;
  const explicitCenter = input.center;
  let centerX = NaN;
  let centerZ = NaN;

  if (finitePoint(explicitCenter)) {
    centerX = explicitCenter.x;
    centerZ = explicitCenter.z;
  } else if (liveTarget && liveTarget.alive !== false && finitePoint(liveTarget.pos)) {
    centerX = liveTarget.pos.x;
    centerZ = liveTarget.pos.z;
  } else if (releaseTarget && finitePoint(releaseTarget.pos)) {
    centerX = releaseTarget.pos.x;
    centerZ = releaseTarget.pos.z;
  }
  if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) return fail(out, 'no-world-target');

  const targetRadius = positive(
    input.targetRadius,
    positive(liveTarget && liveTarget.radius, positive(releaseTarget && releaseTarget.radius, 0)),
  );
  const padding = Math.max(0, finite(input.radiusPadding, 3));
  const radius = Math.max(MIN_RADIUS, targetRadius + padding);
  const reducedMotion = input.reducedMotion === true;
  const reducedFlash = input.reducedFlash === true;
  const windowOpen = !!(predictor && predictor.valid === true && predictor.onSolution === true);
  const proximity = predictor && predictor.valid === true
    ? predictorProximity(predictor)
    : clamp01(input.releaseScore);

  out.visible = true;
  out.reason = 'ready';
  out.stage = hasQuality ? 'released' : 'approaching';
  out.quality = hasQuality ? rawQuality : null;
  out.shape = hasQuality
    ? profile.shape
    : (windowOpen ? 'open-window' : profile.shape);
  out.targetKind = releaseTarget && releaseTarget.kind
    ? releaseTarget.kind
    : (liveTarget ? 'entity' : 'point');
  out.targetId = releaseTarget && releaseTarget.targetId != null
    ? releaseTarget.targetId
    : (liveTarget && liveTarget.id != null ? liveTarget.id : null);
  out.centerX = centerX;
  out.centerZ = centerZ;
  out.radius = radius;
  out.y = finite(input.y, 1.5);
  out.startAngle = finite(input.startAngle, 0);
  out.spanRad = clamp(Math.abs(finite(input.spanRad, TAU)), 0.01, TAU);
  out.reducedMotion = reducedMotion;
  out.reducedFlash = reducedFlash;
  out.windowOpen = windowOpen;
  out.proximity = proximity;
  out.timeToSolution = Math.max(0, finite(predictor && predictor.timeToSolution, 0));
  out.hasPrediction = !!(predictor && finitePoint(predictor.predicted));
  out.predictedX = out.hasPrediction ? predictor.predicted.x : 0;
  out.predictedZ = out.hasPrediction ? predictor.predicted.z : 0;

  if (hasQuality) {
    applyProfile(out, profile);
  } else {
    applyApproachingProfile(out, profile, proximity, windowOpen);
  }

  out.bandWidth = Math.max(MIN_BAND_WIDTH, out.bandWidth);
  out.innerRadius = Math.max(MIN_RADIUS * 0.25, radius - out.bandWidth * 0.5);
  out.outerRadius = radius + out.bandWidth * 0.5;
  if (reducedMotion || reducedFlash) {
    out.cadenceHz = 0;
    out.phaseRad = 0;
    out.pulse = 1;
  } else {
    const timeS = finite(input.timeS, 0);
    // Translate the dash pattern within one logical segment instead of spinning the whole ring.
    // A full-ring phase multiplied a razor ring's 36 edges by its 4.5 Hz cadence into a 162-edge/s
    // strobe. One normalized segment cycle preserves readable motion at the authored cadence.
    const segmentStep = out.spanRad / Math.max(1, out.segmentCount);
    const cadenceCycle = positiveModulo(timeS * out.cadenceHz, 1);
    out.phaseRad = cadenceCycle * segmentStep;
    out.pulse = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(cadenceCycle * TAU));
  }
  return out;
}

/** Mutate the preallocated quad pool with world-space XZ annulus vertices. */
export function writeMasslineReleaseArcGeometry(out, plan) {
  if (!out) return out;
  out.segmentCount = 0;
  out.vertexCount = 0;
  out.indexCount = 0;
  if (!plan || plan.visible !== true || !(out.segmentCapacity > 0)) return out;

  const lanes = clampInteger(plan.laneCount, 1, out.segmentCapacity);
  const logicalSegments = Math.min(
    clampInteger(plan.segmentCount, 1, out.segmentCapacity),
    Math.floor(out.segmentCapacity / lanes),
  );
  if (!(logicalSegments > 0)) return out;

  const positions = out.positions;
  const colors = out.colors;
  const dashDuty = clamp(finite(plan.dashDuty, 0.5), 0.05, 1);
  const span = clamp(Math.abs(finite(plan.spanRad, TAU)), 0.01, TAU);
  const step = span / logicalSegments;
  const gapTotal = Math.max(0, lanes - 1) * Math.max(0, finite(plan.laneGap, 0));
  const laneWidth = Math.max(
    MIN_BAND_WIDTH,
    (Math.max(MIN_BAND_WIDTH, finite(plan.bandWidth, MIN_BAND_WIDTH)) - gapTotal) / lanes,
  );
  const inner = Math.max(MIN_RADIUS * 0.25, finite(plan.innerRadius, MIN_RADIUS));
  const phase = finite(plan.phaseRad, 0);
  const start = finite(plan.startAngle, 0);
  const y = finite(plan.y, 0);
  let emitted = 0;

  for (let lane = 0; lane < lanes; lane += 1) {
    const laneInner = inner + lane * (laneWidth + Math.max(0, finite(plan.laneGap, 0)));
    const laneOuter = laneInner + laneWidth;
    for (let segment = 0; segment < logicalSegments; segment += 1) {
      const angle0 = start + phase + segment * step;
      const angle1 = angle0 + step * dashDuty;
      const cos0 = Math.cos(angle0);
      const sin0 = Math.sin(angle0);
      const cos1 = Math.cos(angle1);
      const sin1 = Math.sin(angle1);
      const offset = emitted * 12;

      positions[offset] = plan.centerX + cos0 * laneInner;
      positions[offset + 1] = y;
      positions[offset + 2] = plan.centerZ + sin0 * laneInner;
      positions[offset + 3] = plan.centerX + cos0 * laneOuter;
      positions[offset + 4] = y;
      positions[offset + 5] = plan.centerZ + sin0 * laneOuter;
      positions[offset + 6] = plan.centerX + cos1 * laneInner;
      positions[offset + 7] = y;
      positions[offset + 8] = plan.centerZ + sin1 * laneInner;
      positions[offset + 9] = plan.centerX + cos1 * laneOuter;
      positions[offset + 10] = y;
      positions[offset + 11] = plan.centerZ + sin1 * laneOuter;
      // Per-vertex radiance keeps a hot inner edge and softer outer sheath. Shape/width/cadence
      // already carry the rating in grayscale; color is an additional authored channel, not the
      // only one. Values stay bounded for MeshBasicMaterial's vertex-color path.
      const segmentBeat = 0.9 + 0.1 * ((segment & 1) === 0 ? 1 : 0);
      const innerGain = clamp(plan.brightness * plan.pulse * segmentBeat, 0, 1);
      const outerGain = innerGain * 0.62;
      writeVertexColor(colors, offset, plan, innerGain);
      writeVertexColor(colors, offset + 3, plan, outerGain);
      writeVertexColor(colors, offset + 6, plan, innerGain);
      writeVertexColor(colors, offset + 9, plan, outerGain);
      emitted += 1;
    }
  }

  out.segmentCount = emitted;
  out.vertexCount = emitted * 4;
  out.indexCount = emitted * 6;
  return out;
}

function writeVertexColor(colors, offset, plan, gain) {
  colors[offset] = clamp(plan.colorR * gain, 0, 1);
  colors[offset + 1] = clamp(plan.colorG * gain, 0, 1);
  colors[offset + 2] = clamp(plan.colorB * gain, 0, 1);
}

function applyProfile(out, profile) {
  out.bandWidth = profile.bandWidth;
  out.laneCount = profile.laneCount;
  out.segmentCount = profile.segmentCount;
  out.dashDuty = profile.dashDuty;
  out.laneGap = profile.laneGap;
  out.cadenceHz = profile.cadenceHz;
  out.brightness = profile.brightness;
  out.colorR = profile.colorR;
  out.colorG = profile.colorG;
  out.colorB = profile.colorB;
}

function applyApproachingProfile(out, profile, proximity, windowOpen) {
  out.bandWidth = profile.bandWidth - proximity * 2.4;
  out.laneCount = windowOpen ? 2 : profile.laneCount;
  out.segmentCount = profile.segmentCount + Math.round(proximity * 8);
  out.dashDuty = profile.dashDuty + proximity * 0.2;
  out.laneGap = windowOpen ? 0.45 : profile.laneGap;
  out.cadenceHz = profile.cadenceHz + proximity * 1.8;
  out.brightness = profile.brightness + proximity * 0.38 + (windowOpen ? 0.18 : 0);
  out.colorR = profile.colorR;
  out.colorG = profile.colorG;
  out.colorB = profile.colorB;
}

function profileForQuality(quality) {
  if (quality === 'messy') return QUALITY_PROFILES.messy;
  if (quality === 'good') return QUALITY_PROFILES.good;
  if (quality === 'clean') return QUALITY_PROFILES.clean;
  if (quality === 'razor') return QUALITY_PROFILES.razor;
  return null;
}

function predictorProximity(predictor) {
  const error = Math.abs(finite(predictor && predictor.errorRad, Math.PI));
  const tolerance = Math.max(0.001, Math.abs(finite(predictor && predictor.tolRad, 0)));
  return clamp01(1 - error / (tolerance * 6));
}

function resetPlan(out) {
  if (!out) return;
  out.visible = false;
  out.reason = 'unresolved';
  out.stage = 'idle';
  out.quality = null;
  out.shape = 'none';
  out.targetKind = null;
  out.targetId = null;
  out.centerX = 0;
  out.centerZ = 0;
  out.radius = 0;
  out.innerRadius = 0;
  out.outerRadius = 0;
  out.bandWidth = 0;
  out.y = 0;
  out.startAngle = 0;
  out.spanRad = TAU;
  out.laneCount = 0;
  out.segmentCount = 0;
  out.dashDuty = 0;
  out.laneGap = 0;
  out.cadenceHz = 0;
  out.phaseRad = 0;
  out.pulse = 1;
  out.brightness = 0;
  out.colorR = 0;
  out.colorG = 0;
  out.colorB = 0;
  out.reducedMotion = false;
  out.reducedFlash = false;
  out.windowOpen = false;
  out.proximity = 0;
  out.timeToSolution = 0;
  out.hasPrediction = false;
  out.predictedX = 0;
  out.predictedZ = 0;
}

function fail(out, reason) {
  if (out) out.reason = reason;
  return out;
}

function finitePoint(point) {
  return !!(point && Number.isFinite(point.x) && Number.isFinite(point.z));
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback = 0) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function clampInteger(value, min, max) {
  return Math.max(min, Math.min(max, Math.trunc(finite(value, min))));
}

function positiveModulo(value, divisor) {
  const remainder = finite(value, 0) % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}
