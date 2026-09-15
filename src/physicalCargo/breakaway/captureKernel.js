// BREAKAWAY — the capture-fork mechanical kernel, promoted from the BREAKAWAY implementation packet.
//
// WHAT THIS IS: a tiny fixed-tick state machine for ONE load entering ONE receiving fork. Its phases
// (`outside`, `braking`, `settling`, `ready`) are mechanical substates, not a mission FSM: the heist
// arbiter still decides the terminal outcome and `heistFacilities` still owns and consumes the body.
//
// WHAT IT MAY NOT DO: touch the bus, the renderer, an entity, economy, the wall clock or RNG. The
// owner samples the body AFTER physics, calls `stepCapture` once per 60 Hz tick, and queues the
// returned impulse through the physics authority for the NEXT step. A receiver never moves a body.

import { finite, positive, dampingImpulse, angularDampingImpulse } from './payloadMath.js';

export const CAPTURE_SCHEMA = 'breakaway.capture.v1';
export const CAPTURE_PHASES = Object.freeze(['outside', 'braking', 'settling', 'ready']);
const ID_RE = /^[A-Za-z0-9_.:-]{1,120}$/;
const TICK_DT = 1 / 60;

function id(value, name) {
  if (typeof value !== 'string' || !ID_RE.test(value)) throw new TypeError(`${name}: invalid stable id`);
  return value;
}

/**
 * Configure once. The inward normal points through the mouth into the fork; half-width is measured
 * between the inner rail faces. Model, collider and UI must all derive from this same geometry.
 */
export function defineReceiver(input) {
  const d = {
    id: id(input.id, 'receiver.id'),
    x: finite(input.x, 'x'),
    z: finite(input.z, 'z'),
    nx: finite(input.nx, 'nx'),
    nz: finite(input.nz, 'nz'),
    halfWidth: positive(input.halfWidth ?? 27, 'halfWidth'),
    depth: positive(input.depth ?? 72, 'depth'),
    maxEntrySpeed: positive(input.maxEntrySpeed ?? 100, 'maxEntrySpeed'),
    maxLateralSpeed: positive(input.maxLateralSpeed ?? 50, 'maxLateralSpeed'),
    settleSpeed: positive(input.settleSpeed ?? 8, 'settleSpeed'),
    settleOmega: positive(input.settleOmega ?? 0.45, 'settleOmega'),
    settleTicks: input.settleTicks ?? 21,
    maxForce: positive(input.maxForce ?? 36000, 'maxForce'),
    dampingRate: positive(input.dampingRate ?? 5, 'dampingRate'),
    maxTorque: positive(input.maxTorque ?? 180000, 'maxTorque'),
    angularDampingRate: positive(input.angularDampingRate ?? 6, 'angularDampingRate'),
  };
  const length = Math.hypot(d.nx, d.nz);
  if (length < 1e-9) throw new RangeError('receiver normal cannot be zero');
  d.nx /= length;
  d.nz /= length;
  if (!Number.isSafeInteger(d.settleTicks) || d.settleTicks < 1 || d.settleTicks > 600) {
    throw new RangeError('invalid settleTicks');
  }
  return Object.freeze(d);
}

export function createCaptureState(payloadId, receiverId) {
  return {
    schema: CAPTURE_SCHEMA,
    payloadId: id(payloadId, 'payloadId'),
    receiverId: id(receiverId, 'receiverId'),
    phase: 'outside',
    lastTick: -1,
    entryTick: null,
    settledTicks: 0,
    entryCount: 0,
    readyAnnounced: false,
  };
}

export function createCaptureOutput() {
  return {
    phase: 'outside', reason: 'approach', event: null, depth: 0, lateral: 0,
    impulse: { x: 0, z: 0, energyRemoved: 0 }, torqueY: 0,
  };
}

/** Receiver-local coordinates. Written into `out` so the per-tick path allocates nothing. */
function localInto(x, z, receiver, out) {
  const dx = x - receiver.x;
  const dz = z - receiver.z;
  out.depth = dx * receiver.nx + dz * receiver.nz;
  out.lateral = -dx * receiver.nz + dz * receiver.nx;
  return out;
}

function validateSample(sample) {
  id(sample.payloadId, 'sample.payloadId');
  for (const key of ['x', 'z', 'prevX', 'prevZ', 'vx', 'vz', 'omegaY']) finite(sample[key], key);
  positive(sample.radius, 'radius');
  positive(sample.mass, 'mass');
  positive(sample.inertiaY, 'inertiaY');
  if (!Number.isSafeInteger(sample.tick) || sample.tick < 0) throw new RangeError('invalid tick');
}

function clear(state, out, reason) {
  const wasAcquired = state.phase !== 'outside';
  state.phase = 'outside';
  state.entryTick = null;
  state.settledTicks = 0;
  state.readyAnnounced = false;
  out.phase = 'outside';
  out.reason = reason;
  if (wasAcquired) out.event = 'capture_lost';
  return out;
}

const SCRATCH_A = { depth: 0, lateral: 0 };
const SCRATCH_B = { depth: 0, lateral: 0 };

/**
 * Swept centre-plane crossing with full lateral clearance. Never captures from the side or back.
 * Positive longitudinal velocity and previous depth < 0 are deliberate: spawning in the interior is
 * not a delivery.
 */
export function mouthCrossing(sample, receiver) {
  const a = localInto(sample.prevX, sample.prevZ, receiver, SCRATCH_A);
  const b = localInto(sample.x, sample.z, receiver, SCRATCH_B);
  if (!(a.depth < 0 && b.depth >= 0 && b.depth > a.depth)) return { crossed: false, reason: 'approach' };
  const t = -a.depth / (b.depth - a.depth);
  const lateral = a.lateral + (b.lateral - a.lateral) * t;
  const forward = sample.vx * receiver.nx + sample.vz * receiver.nz;
  const sideways = -sample.vx * receiver.nz + sample.vz * receiver.nx;
  if (Math.abs(lateral) + sample.radius > receiver.halfWidth) return { crossed: false, reason: 'outside_mouth' };
  if (forward <= 0) return { crossed: false, reason: 'wrong_direction' };
  if (Math.hypot(sample.vx, sample.vz) > receiver.maxEntrySpeed) return { crossed: false, reason: 'too_fast' };
  if (Math.abs(sideways) > receiver.maxLateralSpeed) return { crossed: false, reason: 'too_sideways' };
  return { crossed: true, reason: 'acquired', t, lateral };
}

/**
 * One fixed tick. Mutates only its own small mechanical state and `out`. `authorized` means a
 * receiver-owner permit, not a caller deciding the law.
 */
export function stepCapture(
  state, sample, receiver, { authorized = false, open = true } = {}, out = createCaptureOutput(),
) {
  validateSample(sample);
  if (state.schema !== CAPTURE_SCHEMA || state.payloadId !== sample.payloadId || state.receiverId !== receiver.id) {
    throw new Error('capture identity mismatch');
  }
  if (sample.tick <= state.lastTick) throw new RangeError('capture requires strictly increasing tick');
  const contiguous = sample.tick === state.lastTick + 1;
  state.lastTick = sample.tick;
  out.event = null;
  out.impulse.x = 0;
  out.impulse.z = 0;
  out.impulse.energyRemoved = 0;
  out.torqueY = 0;
  const p = localInto(sample.x, sample.z, receiver, SCRATCH_B);
  out.depth = p.depth;
  out.lateral = p.lateral;
  if (sample.alive === false) return clear(state, out, 'payload_destroyed');
  if (!open) return clear(state, out, 'receiver_closed');
  if (!authorized) return clear(state, out, 'not_registered');
  if (sample.radius * 2 >= receiver.depth || sample.radius >= receiver.halfWidth) {
    return clear(state, out, 'load_too_large');
  }
  if (!contiguous) {
    // A gap (pause, unload, restore) resets dwell; it never synthesizes skipped stable samples.
    state.settledTicks = 0;
    state.readyAnnounced = false;
    if (state.phase === 'ready' || state.phase === 'settling') state.phase = 'braking';
  }
  if (state.phase === 'outside') {
    const cross = mouthCrossing(sample, receiver);
    if (!cross.crossed) {
      out.phase = state.phase;
      out.reason = cross.reason;
      return out;
    }
    state.entryTick = sample.tick;
    state.entryCount++;
    state.phase = 'braking';
    out.event = 'capture_acquired';
  }
  const depth = out.depth;
  const lateral = out.lateral;
  // No telekinetic catch outside the physical bay.
  if (depth < -sample.radius || depth > receiver.depth - sample.radius
    || Math.abs(lateral) > receiver.halfWidth - sample.radius) {
    return clear(state, out, 'left_capture_volume');
  }
  // Let the whole load enter before braking: stopping a slow load at the mouth would strand it
  // outside the settle volume. No attraction, no hidden position writes.
  if (depth < sample.radius) {
    out.phase = state.phase;
    out.reason = 'advance_into_fork';
    return out;
  }
  dampingImpulse({
    vx: sample.vx, vz: sample.vz, mass: sample.mass, dt: TICK_DT,
    rate: receiver.dampingRate, maxForce: receiver.maxForce,
  }, out.impulse);
  out.torqueY = angularDampingImpulse({
    omegaY: sample.omegaY, inertiaY: sample.inertiaY, dt: TICK_DT,
    rate: receiver.angularDampingRate, maxTorque: receiver.maxTorque,
  });
  const stable = Math.hypot(sample.vx, sample.vz) <= receiver.settleSpeed
    && Math.abs(sample.omegaY) <= receiver.settleOmega;
  if (stable) {
    state.settledTicks++;
    if (state.settledTicks >= receiver.settleTicks) {
      state.settledTicks = receiver.settleTicks;
      state.phase = 'ready';
      if (!state.readyAnnounced) {
        out.event = 'capture_ready';
        state.readyAnnounced = true;
      }
    } else {
      state.phase = 'settling';
    }
  } else {
    state.settledTicks = 0;
    state.phase = 'braking';
    state.readyAnnounced = false;
  }
  out.phase = state.phase;
  out.reason = state.phase === 'ready' ? 'ready_for_owner_handoff' : (stable ? 'settling' : 'braking');
  return out;
}

/** Call at prepare AND at commit: arrival history alone is not custody. */
export function validateCaptureProof(state, sample, receiver, authorized) {
  validateSample(sample);
  const p = localInto(sample.x, sample.z, receiver, SCRATCH_A);
  if (!authorized) return { ok: false, reason: 'not_registered' };
  if (state.schema !== CAPTURE_SCHEMA || state.payloadId !== sample.payloadId || state.receiverId !== receiver.id) {
    return { ok: false, reason: 'identity_mismatch' };
  }
  if (sample.alive === false) return { ok: false, reason: 'payload_destroyed' };
  if (sample.tick !== state.lastTick || state.phase !== 'ready' || state.settledTicks < receiver.settleTicks) {
    return { ok: false, reason: 'not_ready_or_stale' };
  }
  if (p.depth < sample.radius || p.depth > receiver.depth - sample.radius
    || Math.abs(p.lateral) > receiver.halfWidth - sample.radius) {
    return { ok: false, reason: 'no_current_custody' };
  }
  if (Math.hypot(sample.vx, sample.vz) > receiver.settleSpeed || Math.abs(sample.omegaY) > receiver.settleOmega) {
    return { ok: false, reason: 'load_not_settled' };
  }
  return { ok: true, reason: 'physical_custody' };
}

export function captureCandidate(state, sample, receiver, { authorized, scheduleId }) {
  id(scheduleId, 'scheduleId');
  const proof = validateCaptureProof(state, sample, receiver, authorized);
  if (!proof.ok) return proof;
  return {
    ok: true,
    receipt: Object.freeze({
      receiptId: `breakaway:${JSON.stringify([scheduleId, state.payloadId, receiver.id, state.entryCount])}`,
      source: 'breakaway:captureSettled',
      scheduleId,
      payloadStableId: state.payloadId,
      receiverId: receiver.id,
      entryTick: state.entryTick,
      tick: sample.tick,
      entryCount: state.entryCount,
    }),
  };
}

export function serializeCaptureState(state) {
  return JSON.stringify(state);
}

export function restoreCaptureState(text) {
  const a = typeof text === 'string' ? JSON.parse(text) : text;
  if (!a || a.schema !== CAPTURE_SCHEMA) throw new Error('unsupported capture schema');
  const s = createCaptureState(a.payloadId, a.receiverId);
  if (!CAPTURE_PHASES.includes(a.phase) || !Number.isSafeInteger(a.lastTick) || a.lastTick < -1
    || !Number.isSafeInteger(a.settledTicks) || a.settledTicks < 0 || a.settledTicks > 600
    || !Number.isSafeInteger(a.entryCount) || a.entryCount < 0 || typeof a.readyAnnounced !== 'boolean') {
    throw new Error('invalid capture save');
  }
  if (a.entryTick !== null && (!Number.isSafeInteger(a.entryTick) || a.entryTick < 0 || a.entryTick > a.lastTick)) {
    throw new Error('invalid entry tick');
  }
  if (a.phase !== 'outside' && (a.entryTick === null || a.entryCount < 1)) {
    throw new Error('acquired save has no acquisition');
  }
  for (const k of Object.keys(s)) s[k] = a[k];
  return s;
}
