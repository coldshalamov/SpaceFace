/**
 * GLASSWAKE: bounded, read-only presentation recipes.
 *
 * These are instruments around the existing authored wrecks and sample bodies, never substitute
 * objects. Geometry, opening times and sample positions come from the simulation snapshot. A
 * forecast is explicitly a future trace; it cannot move a current force boundary. All temporal
 * ornament reads simTime, so pausing or replaying the simulation freezes the picture too.
 */
import { STORM_LIMITS } from './catalog.js';

export const STORM_CUE_LIMITS = Object.freeze({ fronts: 2, samples: 12, pockets: 3, covers: 8, arrows: 16, path: 8 });
export const STORM_CUE_PALETTE = Object.freeze({
  eye: 0xbcebf2,
  inner: 0xf2bb78,
  outer: 0xb5a2ef,
  gap: 0xc5e9b5,
  forecast: 0x8297ae,
  sample: 0xe8d499,
  pocket: 0xa8d5e7,
  cover: 0xb2bcc8,
  extraction: 0xc8efce,
});

const TAU = Math.PI * 2;
const EMPTY = Object.freeze([]);
const bounded = (n, low, high, fallback = low) => Number.isFinite(n) ? Math.max(low, Math.min(high, n)) : fallback;
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const pointIsFinite = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
const angle = (v) => Math.atan2(Math.sin(finite(v)), Math.cos(finite(v)));
const string = (s, fallback = '') => typeof s === 'string' ? s.slice(0, 220) : fallback;

function point() { return { x: 0, z: 0 }; }
function front() {
  return {
    id: '', x: 0, z: 0, radius: 0, halfWidth: 0, gapAngle: 0, gapHalfAngle: 0,
    gapSoftAngle: 0, intensity: 0, windup: 0, direction: 1, phase: 0, toothCount: 1,
    color: STORM_CUE_PALETTE.inner, opacity: 0, lift: 0,
  };
}

/** A reusable recipe buffer. One instance per presentation; no simulation values are retained. */
export function createStormCueBuffer() {
  return {
    schema: 'spaceface.stormChase.cues.v1',
    active: false, weatherActive: false, planId: '', simTime: 0, elapsed: 0, phase: 'finished',
    reducedMotion: false, reducedFlash: false,
    // Neither accessibility mode has to trade away a force boundary or a forecast.
    flashRateHz: 0, cameraShake: 0, particleCount: 0, lightCount: 0,
    eye: { x: 0, z: 0, radius: 0, vx: 0, vz: 0, opacity: 0 },
    fronts: Array.from({ length: STORM_CUE_LIMITS.fronts }, front), frontCount: 0,
    futureFronts: Array.from({ length: STORM_CUE_LIMITS.fronts }, front), futureFrontCount: 0,
    futureEye: { x: 0, z: 0, radius: 0 }, forecastSeconds: 0,
    gap: { angle: 0, halfAngle: 0, aligned: false, opensInS: 0, closesInS: 0, windup: 0, opacity: 0 },
    escape: { x: 0, z: 0, angle: 0, clearance: 0 },
    extraction: { x: 0, z: 0, radius: 0, active: false, speedLimit: 0 },
    arrows: Array.from({ length: STORM_CUE_LIMITS.arrows }, () => ({ x: 0, z: 0, angle: 0, length: 0, color: 0, chevrons: 1 })), arrowCount: 0,
    path: Array.from({ length: STORM_CUE_LIMITS.path }, point), pathCount: 0,
    samples: Array.from({ length: STORM_CUE_LIMITS.samples }, () => ({
      id: '', bodyId: null, x: 0, z: 0, radius: 6, charge: 0, ready: false,
      status: '', label: '', color: STORM_CUE_PALETTE.sample,
    })), sampleCount: 0,
    pockets: Array.from({ length: STORM_CUE_LIMITS.pockets }, () => ({
      id: '', x: 0, z: 0, radius: 0, open: false, opensInS: 0, closesInS: 0, valueTier: 1,
    })), pocketCount: 0,
    covers: Array.from({ length: STORM_CUE_LIMITS.covers }, () => ({
      id: null, x: 0, z: 0, radius: 0, angle: 0, reach: 0, pinned: false,
    })), coverCount: 0,
    hud: { title: 'GLASSWAKE', text: '', forecast: '', samples: '', pocket: '', phase: '', revision: 0 },
    _hudTick: -1, _hudPlanId: '', _hudPhase: '', _hudOpen: null,
    _hudSamples: -1, _hudReady: -1, _hudSettled: -1, _hudLost: -1,
    _hudObjective: null, _hudTitle: null, _hudPocketId: '', _hudPocketOpen: false,
  };
}

/** Match the production video/accessibility setting names, including supported legacy aliases. */
export function stormAccessibility(settings, out = {}) {
  const video = settings?.video;
  const a11y = settings?.accessibility;
  out.reducedMotion = !!(video?.motionReduce || a11y?.reducedMotion || a11y?.motionReduce || settings?.reducedMotion);
  out.reducedFlash = !!(video?.flashReduce || a11y?.flashReduce || a11y?.reducedFlash || settings?.reducedFlash);
  return out;
}

function copyFront(dst, src, frame, index, reducedMotion, reducedFlash, isFuture) {
  dst.id = string(src.id, index ? 'outer' : 'inner');
  dst.x = finite(src.center?.x, frame.eye.x);
  dst.z = finite(src.center?.z, frame.eye.z);
  dst.radius = bounded(src.radius, 0, 4000);
  dst.halfWidth = bounded(src.halfWidth, 0, 300);
  dst.gapAngle = angle(src.gapAngle);
  dst.gapHalfAngle = bounded(src.gapHalfAngle, 0, Math.PI);
  dst.gapSoftAngle = bounded(src.gapSoftAngle, 0, 0.6);
  dst.intensity = bounded(src.intensity, 0, 1);
  dst.windup = bounded(src.windup, 0, 1);
  dst.direction = src.direction < 0 ? -1 : 1;
  dst.phase = reducedMotion ? 0 : finite(frame.elapsed) * dst.direction * 0.17;
  dst.toothCount = index + 1;
  dst.color = isFuture ? STORM_CUE_PALETTE.forecast : index ? STORM_CUE_PALETTE.outer : STORM_CUE_PALETTE.inner;
  dst.opacity = isFuture ? (reducedFlash ? 0.20 : 0.28) :
    (reducedFlash ? 0.25 : 0.39) * (0.38 + 0.62 * dst.intensity);
  dst.lift = isFuture ? 0.6 : 3 + 8 * dst.intensity;
}

/**
 * Build layered recipes from an actual runtime frame. Pass the optional retained `out` in frame
 * loops. `forecast` may be one sampled future frame or up to eight chronological future frames.
 * Invalid/missing frames clear the output rather than leaving the previous storm onscreen.
 */
export function buildStormCueFrame(frame, options = {}, out = createStormCueBuffer()) {
  out.active = false;
  out.weatherActive = false;
  out.frontCount = out.futureFrontCount = out.arrowCount = out.pathCount = out.sampleCount = out.pocketCount = out.coverCount = 0;
  out.extraction.active = false;
  const returning = frame?.phase === 'finished' && options.expeditionActive === true;
  if (!frame || !pointIsFinite(frame.eye) || !Number.isFinite(frame.simTime) ||
      options.expeditionActive === false || (frame.phase === 'finished' && !returning) || frame.phase === 'cancelled') {
    out.phase = 'finished';
    out.hud.phase = 'finished';
    return out;
  }
  stormAccessibility(options.settings, out);
  out.active = true;
  out.weatherActive = !returning;
  out.planId = string(frame.planId);
  out.simTime = frame.simTime;
  out.elapsed = Math.max(0, finite(frame.elapsed));
  out.phase = returning ? 'return' : string(frame.phase, 'active');
  const eye = out.eye;
  eye.x = frame.eye.x; eye.z = frame.eye.z;
  eye.radius = bounded(frame.eye.radius, 1, 4000, 1);
  eye.vx = finite(frame.eye.vx); eye.vz = finite(frame.eye.vz);
  eye.opacity = returning ? 0 : out.reducedFlash ? 0.58 : 0.77;
  const fronts = !returning && Array.isArray(frame.fronts) ? frame.fronts : EMPTY;
  for (let i = 0; i < Math.min(STORM_CUE_LIMITS.fronts, fronts.length); i++) {
    if (!fronts[i] || !Number.isFinite(fronts[i].radius) || fronts[i].radius <= 0) continue;
    copyFront(out.fronts[out.frontCount++], fronts[i], frame, i, out.reducedMotion, out.reducedFlash, false);
  }
  const gap = out.gap;
  gap.angle = angle(frame.gap?.angle);
  gap.halfAngle = bounded(frame.gap?.halfAngle, 0, Math.PI);
  gap.aligned = !returning && frame.gap?.aligned === true;
  gap.opensInS = Math.max(0, finite(frame.gap?.opensInS));
  gap.closesInS = Math.max(0, finite(frame.gap?.closesInS));
  gap.windup = bounded(frame.gap?.windup, 0, 1);
  gap.opacity = out.reducedFlash ? 0.62 : 0.84;
  out.escape.x = finite(frame.escape?.x, eye.x);
  out.escape.z = finite(frame.escape?.z, eye.z);
  out.escape.angle = angle(frame.escape?.angle ?? gap.angle);
  out.escape.clearance = Math.max(0, finite(frame.escape?.clearance));

  const sourceForecast = returning ? null : options.forecast;
  let future = null;
  out.path[0].x = eye.x; out.path[0].z = eye.z; out.pathCount = 1;
  if (Array.isArray(sourceForecast)) {
    for (let i = 0; i < Math.min(sourceForecast.length, STORM_CUE_LIMITS.path - 1); i++) {
      const f = sourceForecast[i];
      if (!pointIsFinite(f?.eye) || !Number.isFinite(f.simTime) || f.simTime <= (future?.simTime ?? frame.simTime)) continue;
      const p = out.path[out.pathCount++]; p.x = f.eye.x; p.z = f.eye.z;
      future = f;
    }
  } else if (pointIsFinite(sourceForecast?.eye) && Number.isFinite(sourceForecast.simTime) && sourceForecast.simTime > frame.simTime) {
    future = sourceForecast;
    out.path[1].x = future.eye.x; out.path[1].z = future.eye.z; out.pathCount = 2;
  }
  out.forecastSeconds = future ? Math.max(0, future.simTime - frame.simTime) : 0;
  if (future) {
    out.futureEye.x = future.eye.x; out.futureEye.z = future.eye.z;
    out.futureEye.radius = bounded(future.eye.radius, 1, 4000, eye.radius);
    for (let i = 0; i < Math.min(STORM_CUE_LIMITS.fronts, future.phase === 'finished' ? 0 : future.fronts?.length || 0); i++) {
      const f = future.fronts[i];
      if (!f || !Number.isFinite(f.radius) || f.radius <= 0) continue;
      copyFront(out.futureFronts[out.futureFrontCount++], f, future, i, true, out.reducedFlash, true);
    }
  }

  // Two distinct current rows. The arrowheads preserve direction when animation is disabled.
  for (let fi = 0; fi < out.frontCount; fi++) {
    const f = out.fronts[fi];
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + f.phase;
      if (Math.abs(angle(a - f.gapAngle)) <= f.gapHalfAngle + f.gapSoftAngle) continue;
      const arrow = out.arrows[out.arrowCount++];
      arrow.x = f.x + Math.cos(a) * f.radius;
      arrow.z = f.z + Math.sin(a) * f.radius;
      arrow.angle = a + Math.PI / 2 * f.direction;
      arrow.length = bounded(f.halfWidth * 0.7, 4, 12, 6);
      arrow.color = f.color;
      arrow.chevrons = frame.patternId === 'return_hook' && fi === 1 ? 3 : 1;
    }
  }

  // A pod charges only inside an open pocket. These marks describe the actual sampling region,
  // including its radial edge, and forecast the next pocket before it can spawn a physical pod.
  const pockets = !returning && Array.isArray(frame.pockets) ? frame.pockets : EMPTY;
  let activePocket = null, nextPocket = null;
  for (let i = 0; i < Math.min(pockets.length, STORM_CUE_LIMITS.pockets); i++) {
    const pocket = pockets[i];
    if (!pointIsFinite(pocket) || !(pocket.radius > 0)) continue;
    const opensInS = Math.max(0, finite(pocket.opensAtS) - out.elapsed);
    const closesInS = Math.max(0, finite(pocket.closesAtS) - out.elapsed);
    if (closesInS <= 0 || (!pocket.open && opensInS > 18)) continue;
    const p = out.pockets[out.pocketCount++];
    p.id = string(pocket.id); p.x = pocket.x; p.z = pocket.z;
    p.radius = bounded(pocket.radius, 1, 500); p.open = pocket.open === true;
    p.opensInS = opensInS; p.closesInS = closesInS;
    p.valueTier = bounded(pocket.valueTier, 1, 3, 1);
    if (p.open && (!activePocket || p.valueTier > activePocket.valueTier)) activePocket = p;
    if (!p.open && (!nextPocket || p.opensInS < nextPocket.opensInS)) nextPocket = p;
  }

  // This is a direction/extent cue, not an invulnerable shield outline: the force sampler
  // computes continuous shelter separately at each recipient using its local current vector.
  const covers = !returning && Array.isArray(options.covers) ? options.covers : EMPTY;
  for (let i = 0; i < Math.min(covers.length, STORM_CUE_LIMITS.covers); i++) {
    const cover = covers[i];
    if (!pointIsFinite(cover?.position) || !pointIsFinite(cover.flow) ||
        Math.hypot(cover.flow.x, cover.flow.z) < 0.1 || !(cover.radius > 0)) continue;
    const cue = out.covers[out.coverCount++];
    cue.id = cover.id ?? null; cue.x = cover.position.x; cue.z = cover.position.z;
    cue.radius = bounded(cover.radius, 10, 90, 10);
    cue.angle = Math.atan2(cover.flow.z, cover.flow.x);
    cue.reach = cue.radius + STORM_LIMITS.shelterLength;
    cue.pinned = cover.pinned === true;
  }

  const extraction = options.extraction || frame.extraction;
  if (pointIsFinite(extraction) && extraction.active !== false && extraction.radius > 0) {
    out.extraction.x = extraction.x; out.extraction.z = extraction.z;
    out.extraction.radius = bounded(extraction.radius, 1, 500);
    out.extraction.speedLimit = bounded(extraction.relativeSpeedLimit, 0, 500);
    out.extraction.active = true;
  }
  const samples = Array.isArray(options.samples) ? options.samples : EMPTY;
  let readyCount = 0, settledCount = 0, lostCount = 0;
  for (let i = 0; i < Math.min(samples.length, 64); i++) {
    const sample = samples[i];
    if (!sample) continue;
    if (sample.status === 'settled' || sample.status === 'extracted') { settledCount++; continue; }
    if (sample.status === 'lost' || sample.status === 'destroyed') { lostCount++; continue; }
    if (!pointIsFinite(sample.position) || out.sampleCount >= STORM_CUE_LIMITS.samples) continue;
    const cue = out.samples[out.sampleCount++];
    cue.id = string(sample.id); cue.bodyId = sample.bodyId ?? null;
    cue.x = sample.position.x; cue.z = sample.position.z;
    cue.radius = bounded(sample.radius, 5, 16, 6);
    cue.charge = bounded(finite(sample.charge) / Math.max(0.001, finite(sample.requiredCharge, 1)), 0, 1);
    cue.ready = cue.charge >= 1 || sample.status === 'ready';
    cue.status = string(sample.status, 'field');
    cue.label = string(sample.label, 'Sample');
    cue.color = cue.ready ? STORM_CUE_PALETTE.extraction : STORM_CUE_PALETTE.sample;
    if (cue.ready) readyCount++;
  }

  // Text only changes four times per sim-second or on meaningful state changes. Geometry remains
  // at render cadence; countdown strings never cause per-frame DOM layout or live announcements.
  const tick = Math.floor(frame.simTime * 4);
  const objective = options.objective;
  const focusPocket = activePocket || nextPocket;
  if (tick !== out._hudTick || out.planId !== out._hudPlanId || out.phase !== out._hudPhase ||
      gap.aligned !== out._hudOpen || out.sampleCount !== out._hudSamples || readyCount !== out._hudReady ||
      settledCount !== out._hudSettled || lostCount !== out._hudLost ||
      objective?.text !== out._hudObjective || objective?.title !== out._hudTitle ||
      (focusPocket?.id || '') !== out._hudPocketId || !!focusPocket?.open !== out._hudPocketOpen) {
    out._hudTick = tick; out._hudPlanId = out.planId; out._hudPhase = out.phase;
    out._hudOpen = gap.aligned; out._hudSamples = out.sampleCount; out._hudReady = readyCount;
    out._hudSettled = settledCount; out._hudLost = lostCount;
    out._hudObjective = objective?.text; out._hudTitle = objective?.title;
    out._hudPocketId = focusPocket?.id || ''; out._hudPocketOpen = !!focusPocket?.open;
    out.hud.title = string(objective?.title, 'GLASSWAKE');
    out.hud.text = string(objective?.text, 'Read the gap, charge a sample, bring the physical pod to extraction.');
    out.hud.phase = out.phase;
    out.hud.forecast = returning ? `STORM PASSED · RETURN WINDOW ${Math.ceil(Math.max(0, finite(options.returnRemainingS)))} s` : gap.aligned ?
      `GAP OPEN · ${Math.ceil(gap.closesInS)} s · arrows show current` :
      `GAP IN ${Math.ceil(gap.opensInS)} s · dashed trace +${Math.ceil(out.forecastSeconds)} s`;
    out.hud.samples = `${readyCount} charged · ${settledCount} extracted${lostCount ? ` · ${lostCount} lost` : ''}`;
    out.hud.pocket = activePocket ? `POCKET ${activePocket.valueTier} · ${Math.ceil(activePocket.closesInS)} s · hold pod inside ring` :
      nextPocket ? `NEXT POCKET ${nextPocket.valueTier} IN ${Math.ceil(nextPocket.opensInS)} s` : 'Charge is retained outside the pocket. Tow slowly into the receiver.';
    out.hud.revision++;
  }
  return out;
}
