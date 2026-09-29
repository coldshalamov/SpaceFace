// Canonical deterministic starship flight dynamics for the XZ plane.
//
// This module owns authored "space game" handling. It is intentionally not a raw rigid-body
// solver: the pilot/controller sets desired yaw/thrust, this module integrates a stable ship
// response, and collision systems resolve contacts separately. Banking is visual pose only.
import { writePhysicsControl } from './physicsAuthority.js';
import { wrapAngle } from './rng.js';
import { FLIGHT_TUNING } from '../data/flightTuning.js';

export const FLIGHT_MODES = Object.freeze(['assisted', 'drift', 'newtonian']);

export const DEFAULT_FLIGHT_TUNING = Object.freeze({
  turnRateMult: 0.78,
  turnRateCap: 3.8,
  turnDeadband: 0.004,

  reverseThrustScale: FLIGHT_TUNING.reverseThrustScale,
  strafeThrustScale: FLIGHT_TUNING.strafeThrustScale,
  boostThrustMult: FLIGHT_TUNING.boostThrustMult,
  normalMaxSpeedMult: FLIGHT_TUNING.normalMaxSpeedMult,
  boostMaxSpeedMult: FLIGHT_TUNING.boostMaxSpeedMult,

  bankMax: 0.68,
  bankResponse: 9.5,
  bankReturnResponse: 12.0,
});

const MODE_TUNING = Object.freeze({
  assisted: {
    linearDragScale: 1.0,
    lateralAssistScale: 1.0,
    yawAssistScale: 1.0,
    reverseBrakeScale: 1.0,
  },
  drift: {
    linearDragScale: 0.34,
    lateralAssistScale: 0.32,
    yawAssistScale: 0.82,
    reverseBrakeScale: 0.72,
  },
  newtonian: {
    linearDragScale: 0.04,
    lateralAssistScale: 0.025,
    yawAssistScale: 0.55,
    reverseBrakeScale: 0.35,
  },
});

const CLASS_TUNING = Object.freeze({
  scout: { accel: 1.05, strafe: 1.0, turn: 1.08, brake: 1.08, assist: 1.0 },
  fighter: { accel: 1.16, strafe: 1.12, turn: 1.22, brake: 1.18, assist: 1.08 },
  miner: { accel: 0.9, strafe: 0.72, turn: 0.82, brake: 0.95, assist: 1.03 },
  hauler: { accel: 0.74, strafe: 0.58, turn: 0.62, brake: 0.88, assist: 1.0 },
  capital: { accel: 0.42, strafe: 0.34, turn: 0.34, brake: 0.62, assist: 0.88 },
});

const AUTHORED_MODEL_TUNING = Object.freeze({
  accel: 1,
  strafe: 1,
  turn: 1,
  brake: 1,
  assist: 1,
});

const ASSISTED_NEUTRAL_COUNTERTHRUST = 0.36;
const DRIFT_NEUTRAL_COUNTERTHRUST = 0.10;

// Retained scratch objects for the per-craft step packet. Each helper writes every field of
// its scratch before returning, so callers observe exactly the same values as fresh literals
// while the tick loop stops re-allocating them. Nothing that escapes into retained state is
// pooled: diagnostics objects stay fresh per call, and the force/torque vectors that merge
// into diagnostics (and are read back by renderers via e._flightFrame) are allocated fresh
// inside the scratch results for that reason.
const _probe = { vel: { x: 0, z: 0 }, rot: 0 };
const _axes = { fx: 0, fz: 0, rx: 0, rz: 0 };
const _localVel = { forward: 0, lateral: 0 };
const _translationStep = {
  throttle: 0, strafe: 0, speed: 0, forwardSpeed: 0, lateralSpeed: 0,
  assistStrength: 0, neutralCounterThrust: false, boosting: false,
};
const _translationControl = {
  throttle: 0, strafe: 0, speed: 0, forwardSpeed: 0, lateralSpeed: 0,
  assistStrength: 0, neutralCounterThrust: false, boosting: false, maxSpeed: 0, force: null,
};
const _yawStep = { turnIntent: 0, turnRate: 0, targetYawRate: 0, turnFraction: 0 };
const _yawControl = {
  turnIntent: 0, turnRate: 0, targetYawRate: 0, requestedYawRate: 0, turnFraction: 0, torque: null,
};
const _bankStep = { targetBank: 0, bank: 0 };
const _bankSettle = { targetBank: 0, bank: 0 };
const _frame = {
  mode: '', flightClass: '', speed: 0, forwardSpeed: 0, lateralSpeed: 0, slipAngle: 0,
  yawRate: 0, bank: 0, mass: 0, inertia: 0, assistStrength: 0, maxYawRate: 0, maxSpeed: 0,
};
const _control = { source: '', mode: '', force: null, torque: null, maxSpeed: 0 };

export function resolveFlightProfile(e, stateOrMode = null) {
  const mode = normalizeMode(
    typeof stateOrMode === 'string'
      ? stateOrMode
      : stateOrMode && stateOrMode.settings && stateOrMode.settings.controls && stateOrMode.settings.controls.flightMode
  );
  const model = buildRuntimeModel(e);
  const classTuning = model.authoredFlightModel
    ? AUTHORED_MODEL_TUNING
    : (CLASS_TUNING[model.flightClass] || CLASS_TUNING.scout);
  const modeTuning = MODE_TUNING[mode] || MODE_TUNING.assisted;
  const baseTurnRate = finiteNonNegative(e && e.turnRate, 3);
  const baseThrust = finiteNonNegative(e && e.thrust, 40);
  const baseDrag = finiteNonNegative(e && e.drag, 1.2);
  const baseMaxSpeed = finiteNonNegative(e && e.maxSpeed, 120);
  const maxYawRate = Math.min(
    finiteNonNegative(model.maxYawRate, baseTurnRate * DEFAULT_FLIGHT_TUNING.turnRateMult),
    DEFAULT_FLIGHT_TUNING.turnRateCap
  );

  const profile = {
    mode,
    model,
    flightClass: model.flightClass,
    mass: finiteNonNegative(model.mass, 18),
    inertia: finiteNonNegative(model.inertia, 1),
    maxYawRate,
    angularAccel: finiteNonNegative(model.angularAccel, maxYawRate * 8) * classTuning.turn * modeTuning.yawAssistScale,
    angularBrake: finiteNonNegative(model.angularBrake, maxYawRate * 14) * classTuning.brake * modeTuning.yawAssistScale,
    mainAccel: finiteNonNegative(model.mainAccel, baseThrust) * classTuning.accel,
    reverseAccel: finiteNonNegative(model.reverseAccel, baseThrust * DEFAULT_FLIGHT_TUNING.reverseThrustScale) * classTuning.accel,
    strafeAccel: finiteNonNegative(model.strafeAccel, baseThrust * DEFAULT_FLIGHT_TUNING.strafeThrustScale) * classTuning.strafe,
    linearDrag: finiteNonNegative(model.linearDrag, baseDrag) * modeTuning.linearDragScale,
    lateralDrag: finiteNonNegative(model.lateralDrag, baseDrag * 0.45) * modeTuning.lateralAssistScale,
    assistStrength: finiteNonNegative(model.assistStrength, 1.1) * classTuning.assist * modeTuning.lateralAssistScale,
    reverseBrake: finiteNonNegative(model.reverseBrake, 2.4) * modeTuning.reverseBrakeScale,
    maxSpeed: finiteNonNegative(model.maxSpeed, baseMaxSpeed),
    boostMult: finiteNonNegative(model.boostMult, DEFAULT_FLIGHT_TUNING.boostThrustMult),
    boostMaxSpeedMult: finiteNonNegative(model.boostMaxSpeedMult, DEFAULT_FLIGHT_TUNING.boostMaxSpeedMult),
    normalMaxSpeedMult: finiteNonNegative(model.normalMaxSpeedMult, DEFAULT_FLIGHT_TUNING.normalMaxSpeedMult),
    bankMax: finiteNonNegative(model.bankMax, DEFAULT_FLIGHT_TUNING.bankMax),
    bankFactor: finiteNonNegative(model.bankFactor, finiteNonNegative(e && e.bankFactor, 0.6)),
  };

  // Cruise engagement multipliers (spec2/02 §1): only for the player entity while cruising.
  if (stateOrMode && typeof stateOrMode === 'object' && e && e.id === stateOrMode.playerId) {
    const playerState = safeStatePlayer(stateOrMode);
    const c = playerState && playerState.cruise;
    if (c && c.phase === 'cruising') {
      return {
        ...profile,
        maxSpeed: profile.maxSpeed * 4.0,
        mainAccel: profile.mainAccel * 2.5,
        maxYawRate: profile.maxYawRate * 0.25,
        angularAccel: profile.angularAccel * 0.25,
        angularBrake: profile.angularBrake * 0.25,
      };
    }
  }
  return profile;
}

function safeStatePlayer(state) {
  if (!state || typeof state !== 'object') return null;
  const descriptor = Object.getOwnPropertyDescriptor(state, 'player');
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
  return descriptor.value && typeof descriptor.value === 'object' ? descriptor.value : null;
}

export function stepPlayerFlight(e, input, dt, profile = resolveFlightProfile(e), opts = {}) {
  if (opts.physicsAuthority) {
    return stepPhysicsAuthorityFlight(e, input, dt, profile, {
      ...opts,
      source: opts.source || 'player-flight',
      turnIntent: clampUnit((input && input.turnIntent) || 0),
    });
  }
  const yaw = stepYawController(e, clampUnit((input && input.turnIntent) || 0), dt, profile, _yawStep);
  const translation = stepTranslation(e, input, dt, profile, {
    boosting: !!(opts.boosting || (input && input.boosting)),
  }, _translationStep);
  const bank = stepBankPose(e, yaw.turnFraction, dt, profile, _bankStep);
  const frame = computeFlightFrame(e, profile, _frame);
  const diagnostics = Object.assign({}, frame, yaw, translation, bank);
  diagnostics.mode = profile.mode;
  diagnostics.flightClass = profile.flightClass;
  e._flightFrame = diagnostics;
  return diagnostics;
}

export function stepNpcFlight(e, intent = {}, dt, profile = resolveFlightProfile(e), opts = {}) {
  const desired = Number.isFinite(intent.aimAngle) ? intent.aimAngle : (Number.isFinite(opts.aimAngle) ? opts.aimAngle : e.rot);
  const err = wrapAngle(desired - e.rot);
  const softAngle = opts.softAngle ?? 0.7;
  const turnIntent = clampUnit(err / softAngle);
  if (opts.physicsAuthority) {
    return stepPhysicsAuthorityFlight(e, intent, dt, profile, {
      ...opts,
      source: opts.source || 'npc-flight',
      boosting: !!intent.boost,
      npc: true,
      turnIntent,
      aimError: err,
    });
  }
  const yaw = stepYawController(e, turnIntent, dt, profile, _yawStep);
  const translation = stepTranslation(e, intent, dt, profile, { boosting: !!intent.boost, npc: true }, _translationStep);
  const bank = stepBankPose(e, yaw.turnFraction, dt, profile, _bankStep);
  const frame = computeFlightFrame(e, profile, _frame);
  const diagnostics = Object.assign({}, frame, yaw, translation, bank);
  diagnostics.aimError = err;
  diagnostics.mode = profile.mode;
  diagnostics.flightClass = profile.flightClass;
  e._flightFrame = diagnostics;
  return diagnostics;
}

export function computeFlightFrame(e, profile = resolveFlightProfile(e), out) {
  const axes = localAxesInto(e.rot || 0, _axes);
  const vx = (e.vel && e.vel.x) || 0;
  const vz = (e.vel && e.vel.z) || 0;
  const forwardSpeed = vx * axes.fx + vz * axes.fz;
  const lateralSpeed = vx * axes.rx + vz * axes.rz;
  const speed = Math.hypot(vx, vz);
  const r = out || {};
  r.mode = profile.mode;
  r.flightClass = profile.flightClass;
  r.speed = speed;
  r.forwardSpeed = forwardSpeed;
  r.lateralSpeed = lateralSpeed;
  r.slipAngle = Math.atan2(lateralSpeed, Math.max(0.0001, Math.abs(forwardSpeed)));
  r.yawRate = e.angVel || 0;
  r.bank = e.bank || 0;
  r.mass = profile.mass;
  r.inertia = profile.inertia;
  r.assistStrength = profile.assistStrength;
  r.maxYawRate = profile.maxYawRate;
  r.maxSpeed = profile.maxSpeed;
  return r;
}

export function stepPhysicsDamping(e, dt, profile = resolveFlightProfile(e), opts = {}) {
  ensureVelocity(e);
  const linearDrag = finiteNonNegative(opts.linearDrag, finiteNonNegative(e && e.drag, 1.2));
  const angularDrag = finiteNonNegative(opts.angularDrag, 2.2);
  const dtSafe = Math.max(1e-6, dt || 0);
  const vx = finiteNumber(e.vel.x);
  const vz = finiteNumber(e.vel.z);
  const av = finiteNumber(e.angVel);
  const vScale = Math.max(0, 1 - linearDrag * dtSafe);
  const wScale = Math.max(0, 1 - angularDrag * dtSafe);
  const force = {
    x: ((vx * vScale) - vx) * profile.mass / dtSafe,
    y: 0,
    z: ((vz * vScale) - vz) * profile.mass / dtSafe,
  };
  const torque = {
    x: 0,
    y: ((av * wScale) - av) * profile.inertia / dtSafe,
    z: 0,
  };
  _control.source = opts.source || 'flight-damping';
  _control.mode = profile.mode;
  _control.force = force;
  _control.torque = torque;
  _control.maxSpeed = profile.maxSpeed * profile.normalMaxSpeedMult;
  writePhysicsControl(e, _control);
  const bank = settleBankPose(e, dtSafe, DEFAULT_FLIGHT_TUNING, _bankSettle);
  const frame = computeFlightFrame(e, profile, _frame);
  const diagnostics = Object.assign({}, frame, bank);
  diagnostics.mode = profile.mode;
  diagnostics.flightClass = profile.flightClass;
  diagnostics.physicsAuthority = 'sg02-dynamic';
  diagnostics.force = force;
  diagnostics.torque = torque;
  e._flightFrame = diagnostics;
  return diagnostics;
}

// Compatibility wrappers used by existing callers/tests. New code should call stepPlayerFlight()
// or stepNpcFlight() so yaw, translation, bank, and diagnostics are updated together.
export function stepPlayerYaw(e, input, dt, tuning = DEFAULT_FLIGHT_TUNING) {
  const profile = legacyProfile(e, tuning);
  return stepYawController(e, clampUnit((input && input.turnIntent) || 0), dt, profile);
}

export function stepPlayerTranslation(e, input, dt, opts = {}) {
  const profile = opts.profile || legacyProfile(e, opts.tuning || DEFAULT_FLIGHT_TUNING);
  return stepTranslation(e, input, dt, profile, opts);
}

export function stepBankPose(e, turnFraction, dt, tuningOrProfile = DEFAULT_FLIGHT_TUNING, out) {
  const profileLike = tuningOrProfile && tuningOrProfile.model ? tuningOrProfile : null;
  const bankMax = profileLike ? profileLike.bankMax : (tuningOrProfile.bankMax ?? DEFAULT_FLIGHT_TUNING.bankMax);
  const bankFactor = profileLike
    ? profileLike.bankFactor
    : (e.bankFactor != null ? e.bankFactor : 0.6);
  const targetBank = clamp(turnFraction * bankFactor * bankMax, -bankMax, bankMax);
  integrateBank(e, targetBank, dt, {
    bankMax,
    bankResponse: DEFAULT_FLIGHT_TUNING.bankResponse,
    bankReturnResponse: DEFAULT_FLIGHT_TUNING.bankReturnResponse,
  });
  const r = out || {};
  r.targetBank = targetBank;
  r.bank = e.bank || 0;
  return r;
}

export function settleBankPose(e, dt, tuning = DEFAULT_FLIGHT_TUNING, out) {
  const r = out || {};
  r.targetBank = 0;
  if (e.bank) integrateBank(e, 0, dt, tuning);
  r.bank = e.bank || 0;
  return r;
}

export function effectivePlayerTurnRate(e, tuning = DEFAULT_FLIGHT_TUNING) {
  return Math.min((e.turnRate ?? 3) * tuning.turnRateMult, tuning.turnRateCap);
}

export function npcBankPose(e, turnRate, dt, tuning = DEFAULT_FLIGHT_TUNING) {
  const turnFraction = clampUnit((e.angVel || 0) / Math.max(0.01, turnRate ?? 3));
  return stepBankPose(e, turnFraction, dt, tuning);
}

// NOTE (heap audit): the module scratches above are only safe because every consumer either
// reads scalar fields synchronously (Object.assign merge) or copies vectors into its own
// retained record (writePhysicsControl). Do not pass a scratch into any path that retains the
// object itself.

function stepYawController(e, turnIntent, dt, profile, out) {
  const targetYawRate = turnIntent * profile.maxYawRate;
  const accel = Math.abs(targetYawRate) > Math.abs(e.angVel || 0) ? profile.angularAccel : profile.angularBrake;
  e.angVel = approachValue(e.angVel || 0, targetYawRate, Math.max(0, accel) * dt);
  if (!turnIntent && Math.abs(e.angVel) < DEFAULT_FLIGHT_TUNING.turnDeadband) e.angVel = 0;
  e.rot = wrapAngle((e.rot || 0) + e.angVel * dt);
  const r = out || {};
  r.turnIntent = turnIntent;
  r.turnRate = profile.maxYawRate;
  r.targetYawRate = targetYawRate;
  r.turnFraction = clampUnit((e.angVel || 0) / Math.max(0.01, profile.maxYawRate));
  return r;
}

function stepTranslation(e, input = {}, dt, profile, opts = {}, out) {
  ensureVelocity(e);
  const axes = localAxesInto(e.rot || 0, _axes);
  const throttle = clampUnit(input.moveZ || 0);
  const strafe = clampUnit(input.moveX || 0);
  const boosting = !!opts.boosting;
  const thrustMult = boosting ? profile.boostMult : 1;

  applyLocalThrust(e, axes, throttle, strafe, profile, dt, thrustMult);

  const manual = Math.abs(throttle) > 0.025 || Math.abs(strafe) > 0.025;
  const brakeCommanded = !!input.brake;
  const speedNow = Math.hypot(e.vel.x, e.vel.z);
  const neutralCounterThrust = opts.neutralCounterThrust !== false && !opts.physicsAuthority;
  if (brakeCommanded || (neutralCounterThrust && !manual && speedNow > 0.5 && profile.mode !== 'newtonian')) {
    const neutralScale = profile.mode === 'drift' ? DRIFT_NEUTRAL_COUNTERTHRUST : ASSISTED_NEUTRAL_COUNTERTHRUST;
    applyCounterThrust(e, axes, profile, dt, brakeCommanded ? 1 : neutralScale);
  }

  const before = computeLocalVelocity(e, axes, _localVel);
  let forwardSpeed = dampScalar(before.forward, profile.linearDrag, dt);
  let lateralSpeed = dampScalar(before.lateral, profile.linearDrag + profile.lateralDrag + profile.assistStrength, dt);

  if (throttle < 0 && before.forward > 0) {
    forwardSpeed = dampScalar(forwardSpeed, profile.reverseBrake * (-throttle), dt);
  }

  e.vel.x = axes.fx * forwardSpeed + axes.rx * lateralSpeed;
  e.vel.z = axes.fz * forwardSpeed + axes.rz * lateralSpeed;

  const max = profile.maxSpeed * (boosting ? profile.boostMaxSpeedMult : profile.normalMaxSpeedMult);
  const speed = clampSpeed(e, max);
  const r = out || {};
  r.throttle = throttle;
  r.strafe = strafe;
  r.speed = speed;
  r.forwardSpeed = forwardSpeed;
  r.lateralSpeed = lateralSpeed;
  r.assistStrength = profile.assistStrength;
  r.neutralCounterThrust = neutralCounterThrust;
  r.boosting = boosting;
  return r;
}

function applyLocalThrust(e, axes, throttle, strafe, profile, dt, thrustMult = 1) {
  const forwardAccel = throttle >= 0 ? profile.mainAccel : profile.reverseAccel;
  e.vel.x += axes.fx * throttle * forwardAccel * thrustMult * dt;
  e.vel.z += axes.fz * throttle * forwardAccel * thrustMult * dt;
  e.vel.x += axes.rx * strafe * profile.strafeAccel * thrustMult * dt;
  e.vel.z += axes.rz * strafe * profile.strafeAccel * thrustMult * dt;
}

function applyCounterThrust(e, axes, profile, dt, scale) {
  const speed = Math.hypot(e.vel.x, e.vel.z);
  if (!(speed > 0.0001)) return;
  const nx = -e.vel.x / speed;
  const nz = -e.vel.z / speed;
  const throttle = clampUnit((nx * axes.fx + nz * axes.fz) * scale);
  const strafe = clampUnit((nx * axes.rx + nz * axes.rz) * scale);
  applyLocalThrust(e, axes, throttle, strafe, profile, dt, 1);
}

function stepPhysicsAuthorityFlight(e, input = {}, dt, profile, opts = {}) {
  ensureVelocity(e);
  const dtSafe = Math.max(1e-6, dt || 0);
  const turnIntent = clampUnit(opts.turnIntent || 0);
  const yaw = computeYawControl(e, turnIntent, dtSafe, profile, _yawControl);
  const translation = computeTranslationControl(e, input, dtSafe, profile, opts, _translationControl);
  const bank = stepBankPose(e, yaw.turnFraction, dtSafe, profile, _bankStep);
  _control.source = opts.source || 'flight';
  _control.mode = profile.mode;
  _control.force = translation.force;
  _control.torque = yaw.torque;
  _control.maxSpeed = translation.maxSpeed;
  writePhysicsControl(e, _control);
  const frame = computeFlightFrame(e, profile, _frame);
  const diagnostics = Object.assign({}, frame, yaw, translation, bank);
  diagnostics.mode = profile.mode;
  diagnostics.flightClass = profile.flightClass;
  diagnostics.physicsAuthority = 'sg02-dynamic';
  if (Number.isFinite(opts.aimError)) diagnostics.aimError = opts.aimError;
  e._flightFrame = diagnostics;
  return diagnostics;
}

function computeYawControl(e, turnIntent, dt, profile, out) {
  const currentYawRate = finiteNumber(e.angVel);
  const targetYawRate = turnIntent * profile.maxYawRate;
  const accel = Math.abs(targetYawRate) > Math.abs(currentYawRate) ? profile.angularAccel : profile.angularBrake;
  let requestedYawRate = approachValue(currentYawRate, targetYawRate, Math.max(0, accel) * dt);
  if (!turnIntent && Math.abs(requestedYawRate) < DEFAULT_FLIGHT_TUNING.turnDeadband) requestedYawRate = 0;
  const angularAccelerationY = (requestedYawRate - currentYawRate) / dt;
  const r = out || {};
  r.turnIntent = turnIntent;
  r.turnRate = profile.maxYawRate;
  r.targetYawRate = targetYawRate;
  r.requestedYawRate = requestedYawRate;
  r.turnFraction = clampUnit(requestedYawRate / Math.max(0.01, profile.maxYawRate));
  r.torque = { x: 0, y: angularAccelerationY * profile.inertia, z: 0 };
  return r;
}

function computeTranslationControl(e, input, dt, profile, opts, out) {
  const bx = finiteNumber(e.vel && e.vel.x);
  const bz = finiteNumber(e.vel && e.vel.z);
  _probe.vel.x = bx;
  _probe.vel.z = bz;
  _probe.rot = finiteNumber(e.rot);
  const translation = stepTranslation(_probe, input, dt, profile, opts, _translationStep);
  const maxSpeed = profile.maxSpeed * (translation.boosting ? profile.boostMaxSpeedMult : profile.normalMaxSpeedMult);
  const r = out || {};
  r.throttle = translation.throttle;
  r.strafe = translation.strafe;
  r.speed = translation.speed;
  r.forwardSpeed = translation.forwardSpeed;
  r.lateralSpeed = translation.lateralSpeed;
  r.assistStrength = translation.assistStrength;
  r.neutralCounterThrust = translation.neutralCounterThrust;
  r.boosting = translation.boosting;
  r.maxSpeed = maxSpeed;
  r.force = {
    x: (_probe.vel.x - bx) * profile.mass / dt,
    y: 0,
    z: (_probe.vel.z - bz) * profile.mass / dt,
  };
  return r;
}

function buildRuntimeModel(e) {
  const derived = e && e.data && e.data.derived;
  const saved = (e && e.flightModel) || (derived && derived.flightModel) || {};
  const authoredFlightModel = !!((e && e.flightModel) || (derived && derived.flightModel));
  const flightClass = saved.flightClass || (derived && derived.flightClass) || (e && e.flightClass) || inferFlightClass(e);
  const thrust = finiteNonNegative(e && e.thrust, finiteNonNegative(saved.mainAccel, 40));
  const turnRate = finiteNonNegative(e && e.turnRate, 3);
  const mass = finiteNonNegative(e && e.mass, finiteNonNegative(saved.mass, 18));
  const drag = finiteNonNegative(e && e.drag, 1.2);
  const maxSpeed = finiteNonNegative(e && e.maxSpeed, 120);
  return Object.assign({
    flightClass,
    mass,
    inertia: finiteNonNegative(saved.inertia, Math.max(1, mass / Math.max(0.35, turnRate))),
    mainAccel: thrust,
    reverseAccel: thrust * DEFAULT_FLIGHT_TUNING.reverseThrustScale,
    strafeAccel: thrust * DEFAULT_FLIGHT_TUNING.strafeThrustScale,
    angularAccel: Math.max(8, turnRate * 8),
    angularBrake: Math.max(16, turnRate * 14),
    maxYawRate: Math.min(turnRate * DEFAULT_FLIGHT_TUNING.turnRateMult, DEFAULT_FLIGHT_TUNING.turnRateCap),
    linearDrag: drag,
    lateralDrag: drag * 0.45,
    assistStrength: 1.15,
    reverseBrake: 2.4,
    maxSpeed,
    boostMult: DEFAULT_FLIGHT_TUNING.boostThrustMult,
    boostMaxSpeedMult: DEFAULT_FLIGHT_TUNING.boostMaxSpeedMult,
    normalMaxSpeedMult: DEFAULT_FLIGHT_TUNING.normalMaxSpeedMult,
    bankMax: DEFAULT_FLIGHT_TUNING.bankMax,
    bankFactor: e && e.bankFactor != null ? e.bankFactor : 0.6,
  }, saved, { flightClass, authoredFlightModel });
}

function inferFlightClass(e) {
  const role = String((e && e.data && e.data.role) || (e && e.role) || '').toLowerCase();
  if (role.includes('fighter') || role.includes('interceptor')) return 'fighter';
  if (role.includes('hauler') || role.includes('freighter')) return 'hauler';
  if (role.includes('barge') || role.includes('mining')) return 'miner';
  if (role.includes('capital') || role.includes('cruiser') || role.includes('flagship') || role.includes('gunship')) return 'capital';
  return 'scout';
}

function legacyProfile(e, tuning) {
  const profile = resolveFlightProfile(e, 'assisted');
  profile.maxYawRate = effectivePlayerTurnRate(e, tuning);
  return profile;
}

function localAxesInto(rot, out) {
  const fx = Math.cos(rot), fz = Math.sin(rot);
  out.fx = fx;
  out.fz = fz;
  out.rx = -fz;
  out.rz = fx;
  return out;
}

function computeLocalVelocity(e, axes, out) {
  const vx = (e.vel && e.vel.x) || 0;
  const vz = (e.vel && e.vel.z) || 0;
  const forward = vx * axes.fx + vz * axes.fz;
  const lateral = vx * axes.rx + vz * axes.rz;
  const r = out || {};
  r.forward = forward;
  r.lateral = lateral;
  return r;
}

function ensureVelocity(e) {
  if (!e.vel) e.vel = { x: 0, z: 0 };
  if (!Number.isFinite(e.vel.x)) e.vel.x = 0;
  if (!Number.isFinite(e.vel.z)) e.vel.z = 0;
}

function integrateBank(e, targetBank, dt, tuning) {
  if (e.bank == null) e.bank = 0;
  if (e.bankVel == null) e.bankVel = 0;
  targetBank = clamp(targetBank, -(tuning.bankMax ?? DEFAULT_FLIGHT_TUNING.bankMax), tuning.bankMax ?? DEFAULT_FLIGHT_TUNING.bankMax);
  const prev = e.bank;
  const response = Math.abs(targetBank) > 0.001 ? tuning.bankResponse : tuning.bankReturnResponse;
  e.bank = dampValue(e.bank, targetBank, response, dt);
  e.bankVel = dt > 0 ? (e.bank - prev) / dt : 0;
  if (Math.abs(targetBank) < 0.001 && Math.abs(e.bank) < 0.001 && Math.abs(e.bankVel) < 0.02) {
    e.bank = 0;
    e.bankVel = 0;
  }
}

function clampSpeed(e, max) {
  const sp = Math.hypot(e.vel.x, e.vel.z);
  if (sp > max) {
    const s = max / sp;
    e.vel.x *= s;
    e.vel.z *= s;
    return max;
  }
  return sp;
}

function dampScalar(value, lambda, dt) {
  return value * Math.exp(-Math.max(0, lambda) * dt);
}

function dampValue(cur, tgt, lambda, dt) {
  return cur + (tgt - cur) * (1 - Math.exp(-lambda * dt));
}

function approachValue(cur, tgt, maxDelta) {
  const d = tgt - cur;
  if (Math.abs(d) <= maxDelta) return tgt;
  return cur + Math.sign(d) * maxDelta;
}

function normalizeMode(mode) {
  return FLIGHT_MODES.includes(mode) ? mode : 'assisted';
}

function clamp(v, lo, hi) {
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return n < lo ? lo : n > hi ? hi : n;
}

function clampUnit(v) {
  return clamp(v, -1, 1);
}

function finiteNonNegative(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
