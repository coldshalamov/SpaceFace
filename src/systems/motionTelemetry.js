// Motion Lab telemetry — pure metric extraction from sampled motion.
// No rendering, no UI, no wall-clock in any value that feeds a determinism assertion.

import { wrapAngle } from '../core/rng.js';

export const MOTION_METRICS_SCHEMA = 'spaceface.motionMetrics.v1';
export const MOTION_TRACE_SCHEMA = 'spaceface.motionTrace.v1';

const EPS = 1e-9;

export function jsonNumber(value, fallback = null) {
  return Number.isFinite(value) ? value : fallback;
}

export function jsonRoundTrip(value) {
  return JSON.parse(JSON.stringify(value));
}

export function isJsonSerializable(value) {
  try {
    const round = jsonRoundTrip(value);
    return jsonStableEqual(round, value);
  } catch {
    return false;
  }
}

/** Deep equality that treats -0 as 0 and rejects functions / NaN / Infinity. */
export function jsonStableEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'number') {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return a === b;
  }
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!jsonStableEqual(a[i], b[i])) return false;
    return true;
  }
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
    if (!jsonStableEqual(a[aKeys[i]], b[bKeys[i]])) return false;
  }
  return true;
}

export function createMotionTrace({
  scenarioId,
  seed,
  hullId = null,
  loadout = [],
  dt = 1 / 60,
  extra = null,
} = {}) {
  return {
    schema: MOTION_TRACE_SCHEMA,
    scenarioId: String(scenarioId || ''),
    seed: seed | 0,
    hullId: hullId == null ? null : String(hullId),
    loadout: Array.isArray(loadout) ? loadout.slice() : [],
    dt: jsonNumber(dt, 1 / 60),
    extra: extra && typeof extra === 'object' ? extra : null,
    samples: [],
    phases: [],
    contacts: [],
  };
}

export function pushPhase(trace, name, tick) {
  if (!trace || !Array.isArray(trace.phases)) return;
  trace.phases.push({ name: String(name), tick: tick | 0 });
}

export function pushContact(trace, tick, aId, bId) {
  if (!trace || !Array.isArray(trace.contacts)) return;
  trace.contacts.push({ tick: tick | 0, a: aId, b: bId });
}

/**
 * Compact per-tick sample. Keep this JSON-plain: numbers, booleans, short strings, null.
 * Do not store wall-clock, performance counters, or object identity.
 */
export function sampleBody(entity, extras = {}) {
  const pos = entity && entity.pos || {};
  const vel = entity && entity.vel || {};
  const frame = entity && entity._flightFrame || {};
  const accel = frame.acceleration || extras.achievedAccel || {};
  const control = extras.control || readControl(entity);
  return {
    tick: extras.tick | 0,
    t: jsonNumber(extras.t, 0),
    id: entity && entity.id != null ? entity.id : null,
    x: jsonNumber(pos.x, 0),
    z: jsonNumber(pos.z, 0),
    vx: jsonNumber(vel.x, 0),
    vz: jsonNumber(vel.z, 0),
    rot: jsonNumber(entity && entity.rot, 0),
    angVel: jsonNumber(entity && entity.angVel, 0),
    mx: jsonNumber(control.moveX, 0),
    mz: jsonNumber(control.moveZ, 0),
    turn: jsonNumber(control.turnIntent, 0),
    boost: !!control.boost,
    brake: !!control.brake,
    ax: jsonNumber(accel.x, 0),
    az: jsonNumber(accel.z, 0),
    aYaw: jsonNumber(frame.angularAcceleration, extras.angularAccel),
    phase: extras.phase == null ? null : String(extras.phase),
    slotX: jsonNumber(extras.slotX),
    slotZ: jsonNumber(extras.slotZ),
    slotVx: jsonNumber(extras.slotVx),
    slotVz: jsonNumber(extras.slotVz),
    speedBudget: jsonNumber(extras.speedBudget),
    headingError: jsonNumber(extras.headingError),
    closingSpeed: jsonNumber(extras.closingSpeed),
  };
}

export function readControl(entity, playerInput = null) {
  if (playerInput && typeof playerInput === 'object') {
    return {
      moveX: jsonNumber(playerInput.moveX, 0),
      moveZ: jsonNumber(playerInput.moveZ, 0),
      turnIntent: jsonNumber(playerInput.turnIntent, 0),
      boost: !!playerInput.boost,
      brake: !!playerInput.brake,
    };
  }
  const intent = entity && entity.data && entity.data.intent || {};
  return {
    moveX: jsonNumber(intent.moveX, 0),
    moveZ: jsonNumber(intent.moveZ, 0),
    turnIntent: jsonNumber(intent.turnIntent ?? intent.turn, 0),
    boost: !!intent.boost,
    brake: !!intent.brake,
  };
}

export function maybePushSample(trace, sample, stride = 5) {
  if (!trace || !sample) return;
  const tick = sample.tick | 0;
  const last = trace.samples.length ? trace.samples[trace.samples.length - 1] : null;
  const phaseChanged = last && last.phase !== sample.phase;
  if (phaseChanged || tick % stride === 0 || tick === 0) trace.samples.push(sample);
}

export function speedOf(sample) {
  return Math.hypot(sample.vx || 0, sample.vz || 0);
}

export function accelMag(sample) {
  return Math.hypot(sample.ax || 0, sample.az || 0);
}

export function forwardSpeedOf(sample) {
  const c = Math.cos(sample.rot || 0);
  const s = Math.sin(sample.rot || 0);
  return (sample.vx || 0) * c + (sample.vz || 0) * s;
}

export function lateralSpeedOf(sample) {
  const c = Math.cos(sample.rot || 0);
  const s = Math.sin(sample.rot || 0);
  return (sample.vx || 0) * -s + (sample.vz || 0) * c;
}

export function samplesInPhase(samples, phase) {
  const out = [];
  for (const sample of samples || []) if (sample.phase === phase) out.push(sample);
  return out;
}

export function firstTickWhere(samples, predicate) {
  for (const sample of samples || []) if (predicate(sample)) return sample.tick | 0;
  return null;
}

/** Useful-speed band for 10–90% translation response. Peak-in-window of a constant-accel
 *  tape that never reaches cruise is always ~80% of the window (the 2.0 s "underwater"
 *  artifact). This is the speed a stick tap must produce before the ship feels like it answered. */
export const LOW_SPEED_RESPONSE_REF = 36;

export function responseTime10to90(samples, valueFn, dt, ref = null) {
  if (!samples || !samples.length) return null;
  let peak = 0;
  for (const sample of samples) {
    const value = Math.abs(valueFn(sample));
    if (value > peak) peak = value;
  }
  if (!(peak > EPS)) return null;
  const target = Number.isFinite(ref) && ref > EPS ? Math.min(ref, peak) : peak;
  const t10 = firstTickWhere(samples, (s) => Math.abs(valueFn(s)) >= target * 0.1);
  const t90 = firstTickWhere(samples, (s) => Math.abs(valueFn(s)) >= target * 0.9);
  if (t10 == null || t90 == null) return null;
  return jsonNumber((t90 - t10) * dt);
}

export function onsetTicks(samples, inputEdgeTick, dt, accelFloor = 0.4) {
  const after = [];
  for (const sample of samples || []) {
    if ((sample.tick | 0) >= (inputEdgeTick | 0)) after.push(sample);
  }
  const first = firstTickWhere(after, (s) => accelMag(s) >= accelFloor || speedOf(s) >= accelFloor);
  if (first == null) return null;
  return jsonNumber((first - inputEdgeTick) * dt);
}

export function yawOvershoot(samples, releaseTick) {
  let releaseHeading = null;
  let maxAbs = 0;
  for (const sample of samples || []) {
    if (releaseHeading == null && (sample.tick | 0) >= (releaseTick | 0)) releaseHeading = sample.rot;
    if (releaseHeading == null) continue;
    if ((sample.tick | 0) < (releaseTick | 0)) continue;
    const err = Math.abs(wrapAngle((sample.rot || 0) - releaseHeading));
    if (err > maxAbs) maxAbs = err;
  }
  return releaseHeading == null ? null : jsonNumber(maxAbs);
}

export function yawSettleTime(samples, releaseTick, dt, rateFloor = 0.08) {
  let seenMotion = false;
  for (const sample of samples || []) {
    if ((sample.tick | 0) < (releaseTick | 0)) continue;
    const rate = Math.abs(sample.angVel || 0);
    if (rate >= rateFloor) seenMotion = true;
    if (seenMotion && rate < rateFloor) {
      return jsonNumber(((sample.tick | 0) - (releaseTick | 0)) * dt);
    }
  }
  return null;
}

export function stopDistanceAndTime(samples, brakeTick, dt, speedFloor = 1.2) {
  let start = null;
  let dist = 0;
  let prev = null;
  for (const sample of samples || []) {
    if ((sample.tick | 0) < (brakeTick | 0)) continue;
    if (!start) {
      start = sample;
      prev = sample;
      continue;
    }
    dist += Math.hypot((sample.x || 0) - (prev.x || 0), (sample.z || 0) - (prev.z || 0));
    prev = sample;
    if (speedOf(sample) <= speedFloor) {
      return {
        stopDistance: jsonNumber(dist),
        stopTimeS: jsonNumber(((sample.tick | 0) - (brakeTick | 0)) * dt),
      };
    }
  }
  return { stopDistance: null, stopTimeS: null };
}

export function lateralKillTime(samples, startTick, dt, speedFloor = 1.5) {
  let peaked = false;
  for (const sample of samples || []) {
    if ((sample.tick | 0) < (startTick | 0)) continue;
    const lat = Math.abs(lateralSpeedOf(sample));
    if (lat >= speedFloor) peaked = true;
    if (peaked && lat < speedFloor) {
      return jsonNumber(((sample.tick | 0) - (startTick | 0)) * dt);
    }
  }
  return null;
}

export function speedRetained(samples, startTick, endTick) {
  let startSpeed = null;
  let endSpeed = null;
  for (const sample of samples || []) {
    const tick = sample.tick | 0;
    if (startSpeed == null && tick >= (startTick | 0)) startSpeed = speedOf(sample);
    if (tick >= (endTick | 0)) endSpeed = speedOf(sample);
  }
  if (!(startSpeed > EPS) || endSpeed == null) return null;
  return jsonNumber(endSpeed / startSpeed);
}

export function controlSignChangesPerSecond(samples, dt) {
  if (!samples || samples.length < 2) return 0;
  let changes = 0;
  let prev = signOf(samples[0].mz) + 2 * signOf(samples[0].mx) + 4 * signOf(samples[0].turn);
  for (let i = 1; i < samples.length; i++) {
    const cur = signOf(samples[i].mz) + 2 * signOf(samples[i].mx) + 4 * signOf(samples[i].turn);
    if (cur !== prev) changes++;
    prev = cur;
  }
  const duration = Math.max(dt, ((samples[samples.length - 1].tick | 0) - (samples[0].tick | 0)) * dt);
  return jsonNumber(changes / duration, 0);
}

export function angularSignChangesPerSecond(samples, dt) {
  if (!samples || samples.length < 2) return 0;
  let changes = 0;
  let prev = signOf(samples[0].turn);
  for (let i = 1; i < samples.length; i++) {
    const cur = signOf(samples[i].turn);
    if (cur !== prev && cur !== 0 && prev !== 0) changes++;
    prev = cur;
  }
  const duration = Math.max(dt, ((samples[samples.length - 1].tick | 0) - (samples[0].tick | 0)) * dt);
  return jsonNumber(changes / duration, 0);
}

export function accelerationJerkRms(samples, dt) {
  if (!samples || samples.length < 2 || !(dt > 0)) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 1; i < samples.length; i++) {
    const dax = (samples[i].ax || 0) - (samples[i - 1].ax || 0);
    const daz = (samples[i].az || 0) - (samples[i - 1].az || 0);
    const jerk = Math.hypot(dax, daz) / dt;
    sum += jerk * jerk;
    n++;
  }
  return jsonNumber(n ? Math.sqrt(sum / n) : 0, 0);
}

export function headingOscillationRms(samples) {
  if (!samples || samples.length < 3) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 2; i < samples.length; i++) {
    const d1 = wrapAngle((samples[i - 1].rot || 0) - (samples[i - 2].rot || 0));
    const d2 = wrapAngle((samples[i].rot || 0) - (samples[i - 1].rot || 0));
    if (d1 === 0 || d2 === 0) continue;
    if (Math.sign(d1) === Math.sign(d2)) continue;
    sum += (d2 - d1) * (d2 - d1);
    n++;
  }
  return jsonNumber(n ? Math.sqrt(sum / n) : 0, 0);
}

export function rms(values) {
  if (!values || !values.length) return 0;
  let sum = 0;
  for (const value of values) sum += value * value;
  return jsonNumber(Math.sqrt(sum / values.length), 0);
}

export function percentile(sorted, p) {
  if (!sorted || !sorted.length) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
  return jsonNumber(sorted[idx], 0);
}

export function envelopeTrackingMetrics(samples, dt) {
  const errors = slotErrors(samples);
  let peakSpeed = 0;
  let peakClosing = 0;
  let headingAbsSum = 0;
  let headingN = 0;
  let yawAbsSum = 0;
  let yawN = 0;
  let offAxisBurn = 0;
  let burnN = 0;
  for (const sample of samples || []) {
    const spd = speedOf(sample);
    if (spd > peakSpeed) peakSpeed = spd;
    const closing = Number.isFinite(sample.closingSpeed) ? sample.closingSpeed : closingTowardSlot(sample);
    if (closing > peakClosing) peakClosing = closing;
    const headingErr = Number.isFinite(sample.headingError) ? Math.abs(sample.headingError) : headingErrorToSlot(sample);
    if (Number.isFinite(headingErr)) {
      headingAbsSum += headingErr;
      headingN++;
      const throttling = (sample.mz || 0) > 0.2;
      if (throttling) {
        burnN++;
        if (headingErr > 0.55) offAxisBurn++;
      }
    }
    yawAbsSum += Math.abs(sample.angVel || 0);
    yawN++;
  }
  return compactMetrics({
    rmsPositionError: errors.rmsPositionError,
    rmsVelocityError: errors.rmsVelocityError,
    peakOvershoot: errors.peakOvershoot,
    peakSpeed: jsonNumber(peakSpeed, 0),
    peakClosingSpeed: jsonNumber(peakClosing, 0),
    meanHeadingError: headingN ? jsonNumber(headingAbsSum / headingN, 0) : 0,
    meanAbsYawRate: yawN ? jsonNumber(yawAbsSum / yawN, 0) : 0,
    offAxisBurnFraction: burnN ? jsonNumber(offAxisBurn / burnN, 0) : 0,
    settleTimeS: settleTimeToSlot(samples, dt, 28),
  });
}

function closingTowardSlot(sample) {
  if (!Number.isFinite(sample.slotX) || !Number.isFinite(sample.slotZ)) return 0;
  const dx = sample.slotX - (sample.x || 0);
  const dz = sample.slotZ - (sample.z || 0);
  const dist = Math.hypot(dx, dz);
  if (!(dist > EPS)) return 0;
  return ((sample.vx || 0) * dx + (sample.vz || 0) * dz) / dist;
}

function headingErrorToSlot(sample) {
  if (!Number.isFinite(sample.slotX) || !Number.isFinite(sample.slotZ)) return null;
  const desired = Math.atan2(sample.slotZ - (sample.z || 0), sample.slotX - (sample.x || 0));
  return wrapAngle(desired - (sample.rot || 0));
}

export function slotErrors(samples) {
  const pos = [];
  const vel = [];
  let peakOvershoot = 0;
  for (const sample of samples || []) {
    if (!Number.isFinite(sample.slotX) || !Number.isFinite(sample.slotZ)) continue;
    const dx = (sample.x || 0) - sample.slotX;
    const dz = (sample.z || 0) - sample.slotZ;
    const err = Math.hypot(dx, dz);
    pos.push(err);
    if (err > peakOvershoot) peakOvershoot = err;
    if (Number.isFinite(sample.slotVx) && Number.isFinite(sample.slotVz)) {
      vel.push(Math.hypot((sample.vx || 0) - sample.slotVx, (sample.vz || 0) - sample.slotVz));
    }
  }
  return {
    rmsPositionError: rms(pos),
    rmsVelocityError: rms(vel),
    peakOvershoot: jsonNumber(peakOvershoot, 0),
    samples: pos.length,
  };
}

export function settleTimeToSlot(samples, dt, radius, holdTicks = 12) {
  if (!samples || !samples.length) return null;
  let held = 0;
  const start = samples[0].tick | 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample.slotX) || !Number.isFinite(sample.slotZ)) {
      held = 0;
      continue;
    }
    const err = Math.hypot((sample.x || 0) - sample.slotX, (sample.z || 0) - sample.slotZ);
    if (err <= radius) {
      held++;
      if (held >= holdTicks) return jsonNumber(((sample.tick | 0) - start) * dt);
    } else {
      held = 0;
    }
  }
  return null;
}

export function nearestNeighborStats(positions) {
  const distances = [];
  for (let i = 0; i < positions.length; i++) {
    let nearest = Infinity;
    for (let j = 0; j < positions.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(positions[i].x - positions[j].x, positions[i].z - positions[j].z);
      if (d < nearest) nearest = d;
    }
    if (Number.isFinite(nearest)) distances.push(nearest);
  }
  distances.sort((a, b) => a - b);
  return {
    nnMean: jsonNumber(mean(distances), 0),
    nnMedian: percentile(distances, 0.5),
    nnP10: percentile(distances, 0.1),
    nnP90: percentile(distances, 0.9),
    nnMin: distances.length ? jsonNumber(distances[0], 0) : 0,
  };
}

export function flowAlignment(velocities) {
  if (!velocities || velocities.length < 2) return 0;
  let mx = 0;
  let mz = 0;
  const units = [];
  for (const vel of velocities) {
    const mag = Math.hypot(vel.x || 0, vel.z || 0);
    if (mag < 0.5) continue;
    const ux = vel.x / mag;
    const uz = vel.z / mag;
    units.push({ x: ux, z: uz });
    mx += ux;
    mz += uz;
  }
  if (units.length < 2) return 0;
  mx /= units.length;
  mz /= units.length;
  const mag = Math.hypot(mx, mz);
  return jsonNumber(mag, 0);
}

export function minPairDistance(positions) {
  let min = Infinity;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const d = Math.hypot(positions[i].x - positions[j].x, positions[i].z - positions[j].z);
      if (d < min) min = d;
    }
  }
  return Number.isFinite(min) ? jsonNumber(min) : null;
}

export function playerMotionMetrics(denseSamples, phases, dt, extras = {}) {
  const byPhase = groupByPhase(denseSamples);
  const accel = byPhase.accel || [];
  const yawHold = byPhase.yawHold || [];
  const yawRelease = byPhase.yawRelease || [];
  const brake = byPhase.brake || [];
  const turn = byPhase.turn || [];
  const lateral = (byPhase.turn || []).concat(byPhase.lateralKill || []);
  const yawAll = yawHold.concat(yawRelease);
  const stop = stopDistanceAndTime(brake, extras.brakeTick, dt);
  const qualitySamples = denseSamples;
  return compactMetrics({
    onsetS: onsetTicks(accel, extras.accelEdgeTick, dt),
    responseTime10to90S: responseTime10to90(
      accel,
      forwardSpeedOf,
      dt,
      extras.lowSpeedResponseRef ?? LOW_SPEED_RESPONSE_REF,
    ),
    peakWindowResponse10to90S: responseTime10to90(accel, forwardSpeedOf, dt),
    yawOvershootRad: yawOvershoot(yawAll, extras.yawReleaseTick),
    yawSettleS: yawSettleTime(yawRelease, extras.yawReleaseTick, dt),
    stopDistance: stop.stopDistance,
    stopTimeS: stop.stopTimeS,
    lateralVelocityKillTimeS: lateralKillTime(lateral, extras.lateralKillTick, dt),
    speedRetainedThroughTurn: speedRetained(turn, extras.turnStartTick, extras.turnEndTick),
    controlSignChangesPerS: controlSignChangesPerSecond(qualitySamples, dt),
    angularSignChangesPerS: angularSignChangesPerSecond(qualitySamples, dt),
    accelerationJerkRms: accelerationJerkRms(qualitySamples, dt),
    headingOscillationRms: headingOscillationRms(qualitySamples),
    peakForwardSpeed: jsonNumber(maxMap(accel, forwardSpeedOf), 0),
    peakYawRate: jsonNumber(maxMap(yawHold, (s) => Math.abs(s.angVel || 0)), 0),
    propulsionEnergySpent: jsonNumber(extras.propulsionEnergySpent, 0),
    propulsionHeat: jsonNumber(extras.propulsionHeat, 0),
    energyHeatSeam: 'skipped-canonical-cap-and-weapon-heat',
  });
}

export function compactMetrics(metrics) {
  const out = {};
  const keys = Object.keys(metrics).sort();
  for (const key of keys) {
    const value = metrics[key];
    if (typeof value === 'number') out[key] = jsonNumber(value);
    else if (value == null) out[key] = null;
    else if (typeof value === 'boolean' || typeof value === 'string') out[key] = value;
    else if (typeof value === 'object') out[key] = compactMetrics(value);
  }
  return out;
}

export function namedScenarioMetrics(scenarioId, seed, payload) {
  return {
    schema: MOTION_METRICS_SCHEMA,
    scenarioId: String(scenarioId),
    seed: seed | 0,
    ...compactMetrics(payload),
  };
}

export function headingChangeTime(samples, startTick, dt, targetAbs = Math.PI * 0.90) {
  let start = null;
  for (const sample of samples || []) {
    if ((sample.tick | 0) < (startTick | 0)) continue;
    if (start == null) start = sample.rot || 0;
    if (Math.abs(wrapAngle((sample.rot || 0) - start)) >= targetAbs) {
      return jsonNumber(((sample.tick | 0) - (startTick | 0)) * dt);
    }
  }
  return null;
}

export function velocityHeadingChangeTime(samples, startTick, dt, targetAbs = Math.PI * 0.88, minSpeed = 2.2) {
  let start = null;
  for (const sample of samples || []) {
    if ((sample.tick | 0) < (startTick | 0)) continue;
    const spd = speedOf(sample);
    if (spd < minSpeed) continue;
    const heading = Math.atan2(sample.vz || 0, sample.vx || 0);
    if (start == null) {
      start = heading;
      continue;
    }
    if (Math.abs(wrapAngle(heading - start)) >= targetAbs) {
      return jsonNumber(((sample.tick | 0) - (startTick | 0)) * dt);
    }
  }
  return null;
}

export function signedAxisReversalTime(samples, startTick, dt, valueFn, speedFloor = 1.5) {
  let startSign = 0;
  for (const sample of samples || []) {
    if ((sample.tick | 0) < (startTick | 0)) continue;
    const value = valueFn(sample);
    if (!startSign && Math.abs(value) >= speedFloor) startSign = Math.sign(value);
    if (startSign && Math.sign(value) === -startSign && Math.abs(value) >= speedFloor * 0.45) {
      return jsonNumber(((sample.tick | 0) - (startTick | 0)) * dt);
    }
  }
  return null;
}

export function slalomCourseMetrics(samples, gates, dt) {
  const list = Array.isArray(gates) ? gates : [];
  const passed = new Array(list.length).fill(false);
  let pathLength = 0;
  let maxLateralError = 0;
  let peakAbsZ = 0;
  let prev = null;
  let gateSpeedSum = 0;
  let gateSpeedN = 0;
  let peakSpeed = 0;
  let finishTick = null;
  const lastGateX = list.length ? list[list.length - 1].x : Infinity;
  for (const sample of samples || []) {
    const spd = speedOf(sample);
    if (spd > peakSpeed) peakSpeed = spd;
    if (prev) pathLength += Math.hypot((sample.x || 0) - prev.x, (sample.z || 0) - prev.z);
    prev = { x: sample.x || 0, z: sample.z || 0 };
    const absZ = Math.abs(sample.z || 0);
    if (absZ > peakAbsZ) peakAbsZ = absZ;
    if (finishTick == null && (sample.x || 0) >= lastGateX) finishTick = sample.tick | 0;
    if (finishTick == null || (sample.tick | 0) <= finishTick + 12) {
      const latErr = distanceToGatePolyline(sample.x || 0, sample.z || 0, list);
      if (latErr > maxLateralError) maxLateralError = latErr;
    }
    for (let i = 0; i < list.length; i++) {
      if (passed[i]) continue;
      const d = Math.hypot((sample.x || 0) - list[i].x, (sample.z || 0) - list[i].z);
      if (d <= list[i].r) {
        passed[i] = true;
        gateSpeedSum += spd;
        gateSpeedN++;
      }
    }
  }
  const gateAmp = list.reduce((acc, gate) => Math.max(acc, Math.abs(gate.z || 0)), 0);
  return compactMetrics({
    completionTimeS: finishTick == null ? null : jsonNumber(finishTick * dt),
    gatesPassed: passed.reduce((n, ok) => n + (ok ? 1 : 0), 0),
    gateCount: list.length,
    gateMisses: passed.reduce((n, ok) => n + (ok ? 0 : 1), 0),
    pathLength: jsonNumber(pathLength, 0),
    maxLateralError: jsonNumber(maxLateralError, 0),
    peakOvershoot: jsonNumber(Math.max(0, peakAbsZ - gateAmp), 0),
    usefulSpeedRetained: peakSpeed > EPS && gateSpeedN
      ? jsonNumber((gateSpeedSum / gateSpeedN) / peakSpeed)
      : (peakSpeed > EPS ? jsonNumber(0) : null),
    peakSpeed: jsonNumber(peakSpeed, 0),
  });
}

export function reversalBoxMetrics(denseSamples, dt, marks = {}) {
  const byPhase = groupByPhase(denseSamples);
  const forward = byPhase.forward || [];
  const reverse = byPhase.reverse || [];
  const lateral = (byPhase.lateral || []).concat(byPhase.lateralRev || []);
  const turnBurn = byPhase.turnBurn || [];
  const burn = byPhase.burn || [];
  const stop = stopDistanceAndTime(reverse, marks.reverseTick, dt, 1.2);
  const nose180 = headingChangeTime(turnBurn.concat(burn), marks.turnBurnTick, dt);
  const vel180 = velocityHeadingChangeTime(turnBurn.concat(burn), marks.turnBurnTick, dt);
  const latRev = signedAxisReversalTime(lateral, marks.lateralRevTick, dt, lateralSpeedOf, 1.5);
  const fwdRev = signedAxisReversalTime(reverse, marks.reverseTick, dt, forwardSpeedOf, 1.2);
  let lag = null;
  if (nose180 != null && vel180 != null) lag = jsonNumber(vel180 - nose180);
  return compactMetrics({
    peakForwardSpeed: jsonNumber(maxMap(forward, forwardSpeedOf), 0),
    brakeStopDistance: stop.stopDistance,
    brakeStopTimeS: stop.stopTimeS,
    forwardReversalTimeS: fwdRev,
    lateralReversalTimeS: latRev,
    nose180TimeS: nose180,
    velocity180TimeS: vel180,
    headingVelocityLagS: lag,
    reversalCarryDistance: reversalCarryDistance(turnBurn, marks.turnBurnTick),
    postBurnSpeed: jsonNumber(maxMap(burn, speedOf), 0),
    controlSignChangesPerS: controlSignChangesPerSecond(denseSamples, dt),
    angularSignChangesPerS: angularSignChangesPerSecond(denseSamples, dt),
  });
}

function distanceToGatePolyline(x, z, gates) {
  if (!gates || gates.length === 0) return 0;
  if (gates.length === 1) return Math.hypot(x - gates[0].x, z - gates[0].z);
  let min = Infinity;
  for (let i = 1; i < gates.length; i++) {
    const d = pointToSegment(x, z, gates[i - 1].x, gates[i - 1].z, gates[i].x, gates[i].z);
    if (d < min) min = d;
  }
  return Number.isFinite(min) ? min : 0;
}

function pointToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  if (!(len2 > EPS)) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * abx + (pz - az) * abz) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

function reversalCarryDistance(samples, startTick) {
  let start = null;
  let dist = 0;
  let prev = null;
  let nose90 = false;
  for (const sample of samples || []) {
    if ((sample.tick | 0) < (startTick | 0)) continue;
    if (!start) {
      start = sample;
      prev = sample;
      continue;
    }
    dist += Math.hypot((sample.x || 0) - (prev.x || 0), (sample.z || 0) - (prev.z || 0));
    prev = sample;
    if (!nose90 && Math.abs(wrapAngle((sample.rot || 0) - (start.rot || 0))) >= Math.PI * 0.5) {
      nose90 = true;
    }
    if (nose90) {
      const velH = Math.atan2(sample.vz || 0, sample.vx || 0);
      const startH = Math.atan2(start.vz || 0, start.vx || 0);
      if (Math.abs(wrapAngle(velH - startH)) >= Math.PI * 0.5) return jsonNumber(dist);
    }
  }
  return nose90 ? jsonNumber(dist) : null;
}

function groupByPhase(samples) {
  const out = Object.create(null);
  for (const sample of samples || []) {
    const phase = sample.phase || '_';
    if (!out[phase]) out[phase] = [];
    out[phase].push(sample);
  }
  return out;
}

function signOf(value) {
  if (!(Math.abs(value) > 0.04)) return 0;
  return value > 0 ? 1 : -1;
}

function mean(values) {
  if (!values || !values.length) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function maxMap(samples, fn) {
  let peak = 0;
  for (const sample of samples || []) {
    const value = Math.abs(fn(sample));
    if (value > peak) peak = value;
  }
  return peak;
}
