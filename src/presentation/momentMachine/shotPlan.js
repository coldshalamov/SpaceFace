// Offline top-down shot plan. The lease is an overlay: it never writes ship positions
// and it never replaces the live camera director.

import {
  MOMENT_PLAN_SCHEMA,
  MOMENT_LEASE_SCHEMA,
  TICK_RATE,
  CLIP_MIN_TICKS,
  CLIP_MAX_TICKS,
  CLIP_TARGET_TICKS,
  PRE_ROLL_TICKS,
  clamp,
} from './contract.js';

const ZOOM_MIN = 58;
const ZOOM_MAX = 280;

export function assessFootage(inTick, outTick, samples, window) {
  const tape0 = window && Number.isInteger(window.baseTick) ? window.baseTick : null;
  const tape1 = window && Number.isInteger(window.ticks) && tape0 != null
    ? tape0 + window.ticks - 1
    : null;
  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  const list = Array.isArray(samples) ? samples : [];
  for (let i = 0; i < list.length; i += 1) {
    const sample = list[i];
    if (!sample) continue;
    if (tape0 != null && sample.tick < tape0) continue;
    if (tape1 != null && tape1 >= tape0 && sample.tick > tape1) continue;
    count += 1;
    if (sample.tick < min) min = sample.tick;
    if (sample.tick > max) max = sample.tick;
  }
  if (!count) {
    return {
      status: 'unrecorded',
      missingPreTicks: Math.max(0, outTick - inTick + 1),
      missingPostTicks: 0,
      recordedBaseTick: null,
      recordedEndTick: null,
    };
  }
  const missingPre = Math.max(0, min - inTick);
  const missingPost = Math.max(0, outTick - max);
  let status = 'covered';
  if (min > outTick || max < inTick) status = 'unrecorded';
  // A lead-in short of the requested pre-roll is pre-roll-missing even when the
  // tail also runs past the last sample. The requested in-tick stays put.
  else if (missingPre > 0) status = 'pre-roll-missing';
  else if (missingPost > 0) status = 'post-roll-missing';
  return {
    status,
    missingPreTicks: missingPre,
    missingPostTicks: missingPost,
    recordedBaseTick: min,
    recordedEndTick: max,
  };
}

export function clipWindow(payoffTick) {
  const payoff = Math.max(0, payoffTick | 0);
  // Keep the requested in-tick. A payoff early in the ring does not slide forward
  // to tick 0; the missing lead-in stays missing.
  const inTick = payoff - PRE_ROLL_TICKS;
  const outTick = inTick + CLIP_TARGET_TICKS - 1;
  return { inTick, outTick, payoffTick: payoff, seconds: (outTick - inTick + 1) / TICK_RATE };
}

export function recordedSpan(moment) {
  const foot = moment && moment.footage;
  if (!foot || foot.recordedBaseTick == null || foot.status === 'unrecorded') {
    return {
      exportable: false,
      reason: 'unrecorded',
      missingPreTicks: foot ? foot.missingPreTicks : null,
      missingPostTicks: foot ? foot.missingPostTicks : null,
    };
  }
  let from = Math.max(moment.inTick, foot.recordedBaseTick);
  let to = Math.min(moment.outTick, foot.recordedEndTick);
  if (to < from) {
    return { exportable: false, reason: 'unrecorded', missingPreTicks: foot.missingPreTicks, missingPostTicks: foot.missingPostTicks };
  }
  let ticks = to - from + 1;
  if (ticks < CLIP_MIN_TICKS) {
    return {
      exportable: false,
      reason: 'insufficient-recorded-footage',
      inTick: from,
      outTick: to,
      ticks,
      missingPreTicks: foot.missingPreTicks,
      missingPostTicks: foot.missingPostTicks,
    };
  }
  if (ticks > CLIP_MAX_TICKS) {
    const payoff = Math.max(from, Math.min(to, moment.payoffTick));
    from = Math.max(from, payoff - PRE_ROLL_TICKS);
    to = Math.min(to, from + CLIP_MAX_TICKS - 1);
    ticks = to - from + 1;
  }
  return {
    exportable: true,
    inTick: from,
    outTick: to,
    ticks,
    seconds: ticks / TICK_RATE,
    missingPreTicks: from - moment.inTick,
    missingPostTicks: moment.outTick - to,
    claimsUnrecorded: from !== moment.inTick || to !== moment.outTick,
  };
}

function lastPose(samples, actor, tick) {
  if (!actor) return null;
  let best = null;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    if (sample.id !== actor.id || sample.generation !== actor.generation) continue;
    if (sample.tick > tick) continue;
    if (!best || sample.tick > best.tick) best = sample;
  }
  return best;
}

function zoomFor(poses) {
  if (!poses.length) return 120;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < poses.length; i += 1) {
    const pose = poses[i];
    if (pose.x < minX) minX = pose.x;
    if (pose.x > maxX) maxX = pose.x;
    if (pose.z < minZ) minZ = pose.z;
    if (pose.z > maxZ) maxZ = pose.z;
  }
  const span = Math.max(maxX - minX, maxZ - minZ, 24);
  return clamp(span * 0.72 + 48, ZOOM_MIN, ZOOM_MAX);
}

function focusFor(poses) {
  let x = 0;
  let z = 0;
  for (let i = 0; i < poses.length; i += 1) {
    x += poses[i].x;
    z += poses[i].z;
  }
  return { x: x / poses.length, z: z / poses.length };
}

function beatAt(name, tick, cut, samples, moment) {
  const poses = [];
  const subjectPose = lastPose(samples, moment.subject, tick);
  const secondaryPose = lastPose(samples, moment.secondary, tick);
  if (subjectPose) poses.push(subjectPose);
  if (secondaryPose) poses.push(secondaryPose);
  if (!poses.length) {
    return {
      name,
      tick,
      cut,
      recorded: false,
      framing: 'top-down-xz',
      focus: null,
      zoom: null,
      subject: moment.subject,
      secondary: moment.secondary,
    };
  }
  return {
    name,
    tick,
    cut,
    recorded: true,
    framing: 'top-down-xz',
    focus: focusFor(poses),
    zoom: name === 'establish' ? clamp(zoomFor(poses) * 1.25, ZOOM_MIN, ZOOM_MAX) : zoomFor(poses),
    subject: moment.subject,
    secondary: moment.secondary,
  };
}

/**
 * Plan beats for one selected moment. Missing pre-roll stays missing: beats outside
 * recorded samples are marked recorded:false and carry no invented focus.
 */
export function planShot(stream, moment) {
  const samples = stream && Array.isArray(stream.samples) ? stream.samples : [];
  const inTick = moment.inTick;
  const outTick = moment.outTick;
  const payoff = moment.payoffTick;
  const approach = inTick + Math.floor((payoff - inTick) * 0.45);
  const hold = Math.min(outTick, payoff + 3 * TICK_RATE);
  const specs = [
    ['establish', inTick, true],
    ['approach', Math.max(inTick, Math.min(payoff, approach)), false],
    ['payoff', payoff, true],
    ['hold', Math.max(payoff, hold), false],
  ];
  const beats = [];
  for (let i = 0; i < specs.length; i += 1) {
    const [name, tick, cut] = specs[i];
    if (beats.length && beats[beats.length - 1].tick === tick) continue;
    beats.push(beatAt(name, tick, cut, samples, moment));
  }
  let firstSampleTick = null;
  for (let i = 0; i < samples.length; i += 1) {
    const tick = samples[i] && samples[i].tick;
    if (!Number.isInteger(tick)) continue;
    if (firstSampleTick == null || tick < firstSampleTick) firstSampleTick = tick;
  }
  const span = recordedSpan(moment);
  return {
    schema: MOMENT_PLAN_SCHEMA,
    momentId: moment.id,
    moment,
    writesSimulation: false,
    replacesLiveCamera: false,
    framing: 'top-down-xz',
    beats,
    footage: moment.footage,
    firstSampleTick,
    exportSpan: span,
    subject: moment.subject,
    secondary: moment.secondary,
  };
}

function lerp(a, b, u) {
  return a + (b - a) * u;
}

function beatPair(beats, tick) {
  let prev = beats[0];
  let next = beats[beats.length - 1];
  for (let i = 0; i < beats.length; i += 1) {
    if (beats[i].tick <= tick) prev = beats[i];
    if (beats[i].tick >= tick) {
      next = beats[i];
      break;
    }
  }
  return { prev, next };
}

export function createOfflineCameraLease(plan) {
  let released = false;
  function frameAt(tick) {
    if (released || !plan || !Array.isArray(plan.beats) || !plan.beats.length) return null;
    const first = plan.firstSampleTick;
    if (!Number.isInteger(first) || tick < first) {
      return {
        tick,
        recorded: false,
        framing: 'top-down-xz',
        cut: false,
        focus: null,
        zoom: null,
        subject: plan.subject,
        secondary: plan.secondary,
        writesSimulation: false,
      };
    }
    const { prev, next } = beatPair(plan.beats, tick);
    if (!prev.recorded && !next.recorded) {
      return { tick, recorded: false, framing: 'top-down-xz', focus: null, zoom: null, cut: prev.cut === true };
    }
    const recordedBeat = prev.recorded ? prev : next;
    const other = next.recorded ? next : recordedBeat;
    const span = Math.max(1, other.tick - prev.tick);
    const u = prev.recorded && other.recorded ? clamp((tick - prev.tick) / span, 0, 1) : 0;
    const from = prev.recorded ? prev : other;
    const to = other.recorded ? other : from;
    return {
      tick,
      recorded: true,
      framing: 'top-down-xz',
      cut: prev.cut === true && tick === prev.tick,
      focus: {
        x: lerp(from.focus.x, to.focus.x, u),
        z: lerp(from.focus.z, to.focus.z, u),
      },
      zoom: lerp(from.zoom, to.zoom, u),
      subject: plan.subject,
      secondary: plan.secondary,
      writesSimulation: false,
    };
  }
  return {
    schema: MOMENT_LEASE_SCHEMA,
    mode: 'offline-overlay',
    replacesLiveCamera: false,
    writesSimulation: false,
    beats: plan ? plan.beats : [],
    frameAt,
    release() {
      released = true;
    },
  };
}

export function visualContinuity(samples, subject, inTick, outTick) {
  if (!subject || !Array.isArray(samples) || !samples.length) return 0;
  const stride = TICK_RATE;
  let hit = 0;
  let total = 0;
  for (let tick = inTick; tick <= outTick; tick += stride) {
    total += 1;
    let ok = false;
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i];
      if (sample.id === subject.id && sample.generation === subject.generation
        && Math.abs(sample.tick - tick) <= 30) {
        ok = true;
        break;
      }
    }
    if (ok) hit += 1;
  }
  return total ? hit / total : 0;
}

export function poseAt(samples, actor, tick) {
  return lastPose(samples, actor, tick);
}
