import { hash32, mulberry32 } from '../../core/rng.js';
import { STORM_LIMITS, STORM_PATTERNS, STORM_PATTERN_BY_ID } from './catalog.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const smooth = (v) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
export const stormAngleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function transform(point, origin, heading) {
  const c = Math.cos(heading), s = Math.sin(heading);
  return { x: origin.x + point.x * c - point.z * s, z: origin.z + point.x * s + point.z * c };
}

/** A saved plan contains only finite scalar/ID data. Forecasting never advances an RNG. */
export function createStormPlan({ seed = 4242, patternId, origin = { x: 0, z: 0 }, heading = 0,
  startedAt = 0, sectorId = 'sector_vesta_forge', id } = {}) {
  if (!Number.isFinite(origin?.x) || !Number.isFinite(origin?.z)
    || !Number.isFinite(heading) || !Number.isFinite(startedAt)) throw new TypeError('GLASSWAKE requires finite origin, heading and simulation time');
  const seed32 = Number.isFinite(seed) ? seed >>> 0 : 4242;
  const rng = mulberry32(hash32(seed32, 'glasswake_route'));
  // Consume the choice draw even for an explicitly supplied ID, so restoring the chosen
  // pattern from a saved plan reconstructs exactly the same phase and pocket offsets.
  const choice = Math.floor(rng() * STORM_PATTERNS.length);
  const pattern = patternId == null ? STORM_PATTERNS[choice] : STORM_PATTERN_BY_ID[patternId];
  if (!pattern) throw new RangeError(`Unknown GLASSWAKE pattern: ${String(patternId)}`);
  // Seed changes the front phase and pocket bearings without invalidating the authored route.
  const phase = rng() * TAU;
  const pocketOffset = (rng() - 0.5) * 0.24;
  const planId = typeof id === 'string' && id.length > 0 && id.length <= 120 ? id
    : `glasswake_${hash32(seed32, pattern.id, origin.x, origin.z, startedAt).toString(16)}`;
  const route = pattern.route.map(p => transform(p, origin, heading));
  const reach = Math.max(...pattern.fronts.map(f => f.radius + f.advection + f.halfWidth)) + 24;
  const extraction = { ...transform({ x: -reach - 130, z: 0 }, origin, heading), radius: STORM_LIMITS.extractionRadius };
  const bounds = {
    minX: Math.min(...route.map(p => p.x)) - reach,
    maxX: Math.max(...route.map(p => p.x)) + reach,
    minZ: Math.min(...route.map(p => p.z)) - reach,
    maxZ: Math.max(...route.map(p => p.z)) + reach,
  };
  return { schemaVersion: 1, id: planId, seed: seed32, patternId: pattern.id, sectorId: String(sectorId),
    origin: { x: origin.x, z: origin.z }, heading, startedAt, durationS: pattern.durationS,
    phaseOffset: phase, pocketOffset, route, bounds, extraction };
}

/** Validate persisted geometry instead of trusting caller-modified durations or injected paths. */
export function normalizeStormPlan(saved) {
  if (!saved || saved.schemaVersion !== 1 || !STORM_PATTERN_BY_ID[saved.patternId]
    || !Number.isFinite(saved.seed) || !Number.isFinite(saved.startedAt)
    || !Number.isFinite(saved.heading) || !Number.isFinite(saved.origin?.x) || !Number.isFinite(saved.origin?.z)
    || typeof saved.sectorId !== 'string' || typeof saved.id !== 'string'
    || saved.id.length < 1 || saved.id.length > 120
    || !Number.isInteger(saved.seed) || saved.seed < 0 || saved.seed > 0xffffffff) return null;
  try {
    return createStormPlan({ seed: saved.seed, patternId: saved.patternId, origin: saved.origin,
      heading: saved.heading, startedAt: saved.startedAt, sectorId: saved.sectorId, id: saved.id });
  } catch (_) { return null; }
}

function routePose(plan, pattern, elapsed) {
  const travelS = pattern.durationS - pattern.forecastS - pattern.fadeS;
  const rawT = clamp((elapsed - pattern.forecastS) / travelS, 0, 1);
  // Smooth the time parameter as well as the curve: no kickoff/fade velocity discontinuity.
  const t = smooth(rawT), u = 1 - t;
  const dtds = rawT > 0 && rawT < 1 ? 6 * rawT * (1 - rawT) / travelS : 0;
  const [a, b, c, d] = plan.route;
  const x = u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x;
  const z = u * u * u * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t * t * t * d.z;
  const vx = 3 * (u * u * (b.x - a.x) + 2 * u * t * (c.x - b.x) + t * t * (d.x - c.x)) * dtds;
  const vz = 3 * (u * u * (b.z - a.z) + 2 * u * t * (c.z - b.z) + t * t * (d.z - c.z)) * dtds;
  return { x, z, radius: pattern.eyeRadius, vx, vz };
}

function gapClock(pattern, activeTime, elapsed) {
  const cycle = ((activeTime % pattern.cycleS) + pattern.cycleS) % pattern.cycleS;
  // Full opening [0,openS], with smooth three-second shoulders. Every period has an honest
  // straight corridor through BOTH fronts; the preceding warning lasts six to eight seconds.
  const shoulder = 3;
  let openness = 0;
  if (cycle <= pattern.openS) openness = 1;
  else if (cycle < pattern.openS + shoulder) openness = 1 - smooth((cycle - pattern.openS) / shoulder);
  else if (cycle > pattern.cycleS - shoulder) openness = smooth((cycle - (pattern.cycleS - shoulder)) / shoulder);
  const finalOpen = smooth((elapsed - (pattern.durationS - pattern.fadeS - 6)) / 6);
  openness = Math.max(openness, finalOpen);
  const aligned = openness >= 1 - 1e-10;
  const untilFinal = Math.max(0, pattern.durationS - pattern.fadeS - elapsed);
  const opensInS = aligned ? 0 : Math.min(pattern.cycleS - cycle, untilFinal);
  const closesInS = finalOpen >= 1 ? Math.max(0, pattern.durationS - elapsed)
    : aligned ? pattern.openS - cycle : 0;
  const windup = !aligned && opensInS <= pattern.warningS ? 1 - opensInS / pattern.warningS : 0;
  return { openness, aligned, opensInS, closesInS, windup, finalOpen };
}

/** Pure absolute-clock projection; calling twice, pausing, or forecasting cannot mutate a run. */
export function sampleStorm(plan, simTime) {
  const pattern = STORM_PATTERN_BY_ID[plan?.patternId];
  if (!pattern || !Array.isArray(plan.route) || plan.route.length !== 4 || !Number.isFinite(simTime)
    || !Number.isFinite(plan.startedAt) || !Number.isFinite(plan.heading)
    || !Number.isFinite(plan.phaseOffset) || !Number.isFinite(plan.pocketOffset)
    || plan.route.some(p => !Number.isFinite(p?.x) || !Number.isFinite(p?.z))) return null;
  // A completed finite route freezes its last geometry. Even an extremely late restored clock
  // cannot feed unbounded trigonometric arguments or let a dead storm resume rotating forever.
  const elapsed = clamp(simTime - plan.startedAt, 0, pattern.durationS);
  const activeTime = Math.max(0, elapsed - pattern.forecastS);
  const remainingS = Math.max(0, pattern.durationS - elapsed);
  const phase = elapsed < pattern.forecastS ? 'forecast' : elapsed >= pattern.durationS ? 'finished'
    : elapsed >= pattern.durationS - pattern.fadeS ? 'dissipating' : 'active';
  const intensity = smooth(activeTime / 4) * smooth(remainingS / pattern.fadeS);
  const eye = routePose(plan, pattern, elapsed);
  const gapTime = gapClock(pattern, activeTime, elapsed);
  // The broad common corridor faces the launch receiver, with a slow authored turn. The moving
  // eye can be followed without inventing a new control scheme or suppressing ship input.
  const gapBearing = plan.heading + Math.PI + pattern.gapDrift * activeTime;
  const gapHalfAngle = lerp(pattern.narrowGapHalfAngle, pattern.gapHalfAngle, gapTime.openness);
  const fronts = pattern.fronts.map((front, index) => {
    const phase = front.phase + plan.phaseOffset + activeTime * TAU / front.periodS;
    const radius = front.radius + front.advection * Math.sin(phase);
    const advectVelocity = elapsed >= pattern.forecastS && remainingS > 0
      ? front.advection * Math.cos(phase) * TAU / front.periodS : 0;
    const shear = (index === 0 ? -1 : 1) * pattern.gapShear * (1 - gapTime.openness);
    return { id: `${plan.id}:front:${index}`, index, center: { x: eye.x, z: eye.z }, radius,
      halfWidth: front.halfWidth, angle: plan.heading + plan.phaseOffset + front.rotation * activeTime,
      gapAngle: gapBearing + shear, gapHalfAngle, gapSoftAngle: 0.1, intensity,
      rotation: front.rotation, direction: front.direction, windup: gapTime.windup, advectVelocity };
  });
  const outerRadius = fronts[1].radius + fronts[1].halfWidth + 20;
  const pockets = pattern.pockets.map((pocket, index) => {
    const angle = plan.heading + pocket.bearing + plan.pocketOffset + pattern.fronts[0].rotation * activeTime * 0.42;
    // Between the fronts with a full pod-width of clearance from both hazard cores.
    const innerEdge = fronts[0].radius + fronts[0].halfWidth + 16;
    const outerEdge = fronts[1].radius - fronts[1].halfWidth - 16;
    const r = lerp(innerEdge, outerEdge, pocket.radialFraction);
    return { id: pocket.id, index, x: eye.x + Math.cos(angle) * r, z: eye.z + Math.sin(angle) * r,
      radius: 35, opensAtS: pocket.opensAtS, closesAtS: pocket.closesAtS, valueTier: pocket.valueTier,
      open: elapsed >= pocket.opensAtS && elapsed < pocket.closesAtS && phase !== 'finished', angle };
  });
  return { schemaVersion: 1, planId: plan.id, patternId: pattern.id, sectorId: plan.sectorId,
    simTime, elapsed, remainingS, durationS: pattern.durationS, phase, intensity, eye, fronts, pockets,
    gap: { angle: gapBearing, halfAngle: gapHalfAngle, aligned: gapTime.aligned,
      opensInS: gapTime.opensInS, closesInS: Math.max(0, gapTime.closesInS), windup: gapTime.windup },
    outerRadius, flowSpeed: pattern.flowSpeed, drag: pattern.drag,
    escape: { angle: gapBearing, x: eye.x + Math.cos(gapBearing) * (outerRadius + 60),
      z: eye.z + Math.sin(gapBearing) * (outerRadius + 60), clearance: gapHalfAngle * fronts[0].radius,
      open: gapTime.aligned || phase === 'forecast' || phase === 'dissipating' || phase === 'finished' },
    bounds: { ...plan.bounds }, extraction: { ...plan.extraction } };
}

export function forecastStorm(plan, simTime, horizon = 8) {
  return sampleStorm(plan, finite(simTime) + clamp(finite(horizon), 0, STORM_LIMITS.maxForecastHorizon));
}

/** Bounded trajectory read for HUD/planners; this is a forecast, never a second simulation. */
export function stormForecastTrail(plan, simTime, { horizon = 12, samples = 5 } = {}) {
  const count = clamp(Math.floor(finite(samples, 5)), 2, STORM_LIMITS.maxForecastSamples);
  const span = clamp(finite(horizon, 12), 0, STORM_LIMITS.maxForecastHorizon);
  return Array.from({ length: count }, (_, index) => forecastStorm(plan, simTime, span * index / (count - 1)));
}

function angularExposure(angle, front) {
  const distance = Math.abs(stormAngleDelta(angle, front.gapAngle));
  return smooth((distance - front.gapHalfAngle) / front.gapSoftAngle);
}

/** Geometry/force truth shared by sampling, forecast cues, charging, and tests. C1 at the eye,
 * outer envelope, annular band edges, and gap shoulders; angular wrapping is continuous. */
export function sampleStormAtPoint(frame, position) {
  const zero = { exposure: 0, frontExposure: [0, 0], frontIds: [], inEye: false, inGap: false,
    distance: Infinity, mediumVelocity: { x: 0, z: 0 }, current: { x: 0, z: 0 }, radialSpeed: 0,
    currentGate: 0, curvatureAcceleration: 0 };
  if (!frame || !Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return zero;
  const dx = position.x - frame.eye.x, dz = position.z - frame.eye.z;
  const r = Math.hypot(dx, dz), angle = Math.atan2(dz, dx);
  zero.distance = r; zero.inEye = r <= frame.eye.radius;
  if (frame.phase === 'finished' || frame.intensity <= 0 || r <= frame.eye.radius || r >= frame.outerRadius) return zero;
  const eyeGate = smooth((r - frame.eye.radius) / 18);
  const outerGate = smooth((frame.outerRadius - r) / 24);
  const between = clamp((r - frame.fronts[0].radius) / (frame.fronts[1].radius - frame.fronts[0].radius), 0, 1);
  const a = frame.fronts[0], b = frame.fronts[1];
  const corridorAngle = a.gapAngle + stormAngleDelta(b.gapAngle, a.gapAngle) * between;
  const corridorGate = smooth((Math.abs(stormAngleDelta(angle, corridorAngle)) - frame.gap.halfAngle) / 0.1);
  const frontExposure = frame.fronts.map(front => {
    const radial = 1 - smooth(Math.abs(r - front.radius) / front.halfWidth);
    return radial * angularExposure(angle, front) * eyeGate * outerGate * frame.intensity;
  });
  const band = Math.max(...frontExposure);
  const exposure = clamp((0.24 * corridorGate + 0.76 * band) * eyeGate * outerGate * frame.intensity, 0, 1);
  const rotationSign = lerp(a.direction, b.direction, smooth(between));
  const speed = frame.flowSpeed * (0.72 + 0.28 * between) * rotationSign;
  // Radial flow returns loose matter toward a moving rim through ordinary moving-frame drag.
  // Smoothly choose the nearer front across a 48-WU midline. This is a bounded current,
  // never a positional constraint: a boost or slingshot can still cross it ballistically.
  const midRadius = (a.radius + b.radius) * 0.5;
  const rimBlend = smooth((r - midRadius + 24) / 48);
  const preferredRadius = lerp(a.radius, b.radius, rimBlend);
  const radialSpeed = lerp(a.advectVelocity, b.advectVelocity, between)
    + clamp((preferredRadius - r) * 0.8, -26, 26);
  // A curved stream needs an inward pressure gradient even when debris matches its tangent
  // speed. The existing WELL kernel supplies this centripetal component (v²/r); viscosity
  // alone would let every body fly straight out of a supposedly circulating rim.
  const currentGate = eyeGate * outerGate * corridorGate * frame.intensity;
  const curvatureAcceleration = Math.min(24, speed * speed / Math.max(r, frame.eye.radius)) * currentGate;
  const inv = r > 0 ? 1 / r : 0;
  let vx = frame.eye.vx + (-dz * speed + dx * radialSpeed) * inv;
  let vz = frame.eye.vz + (dx * speed + dz * radialSpeed) * inv;
  const v = Math.hypot(vx, vz);
  if (v > STORM_LIMITS.maxFlowSpeed) { vx *= STORM_LIMITS.maxFlowSpeed / v; vz *= STORM_LIMITS.maxFlowSpeed / v; }
  return { exposure, frontExposure, frontIds: frame.fronts.filter((_, i) => frontExposure[i] > 0).map(f => f.id),
    inEye: false, inGap: corridorGate === 0 && band === 0, distance: r,
    mediumVelocity: { x: vx, z: vz }, current: { x: vx, z: vz }, radialSpeed,
    currentGate, curvatureAcceleration };
}

/** Shared fields owner keeps these bounded zero-force envelopes in its lifecycle. The specialized
 * moving-medium sampler is the only GLASSWAKE force source; never add nonzero registered fields. */
export function stormEnvironmentalProfiles(frame) {
  if (!frame || frame.phase === 'finished') return [];
  return frame.fronts.map(front => ({ id: `glasswake:${front.id}`, kind: 'boundary',
    center: { ...front.center }, radius: front.radius + front.halfWidth,
    innerRadius: Math.max(frame.eye.radius, front.radius - front.halfWidth), innerSoft: 8,
    strength: 0, damping: 0, lockStrength: 0, maxAffected: STORM_LIMITS.maxBodies,
    filters: { types: [] }, sourceId: null, ownerId: null, createdAt: frame.simTime, durationS: Infinity }));
}
