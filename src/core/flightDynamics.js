// Canonical deterministic starship flight dynamics for the XZ plane.
//
// This module owns authored "space game" handling. It is intentionally not a raw rigid-body
// solver: the pilot/controller sets desired yaw/thrust, this module integrates a stable ship
// response, and collision systems resolve contacts separately. Banking is visual pose only.
import { wrapAngle } from './rng.js';

export const FLIGHT_MODES = Object.freeze(['assisted', 'drift', 'newtonian']);

export const DEFAULT_FLIGHT_TUNING = Object.freeze({
  turnRateMult: 0.78,
  turnRateCap: 3.8,
  turnDeadband: 0.004,

  reverseThrustScale: 0.55,
  strafeThrustScale: 0.55,
  boostThrustMult: 2.2,
  normalMaxSpeedMult: 1.15,
  boostMaxSpeedMult: 2.0,

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

  return {
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
}

export function stepPlayerFlight(e, input, dt, profile = resolveFlightProfile(e), opts = {}) {
  const yaw = stepYawController(e, clampUnit((input && input.turnIntent) || 0), dt, profile);
  const translation = stepTranslation(e, input, dt, profile, {
    boosting: !!(opts.boosting || (input && input.boosting)),
  });
  const bank = stepBankPose(e, yaw.turnFraction, dt, profile);
  const frame = computeFlightFrame(e, profile);
  const diagnostics = Object.assign({}, frame, yaw, translation, bank, {
    mode: profile.mode,
    flightClass: profile.flightClass,
  });
  e._flightFrame = diagnostics;
  return diagnostics;
}

export function stepNpcFlight(e, intent = {}, dt, profile = resolveFlightProfile(e), opts = {}) {
  const desired = Number.isFinite(intent.aimAngle) ? intent.aimAngle : (Number.isFinite(opts.aimAngle) ? opts.aimAngle : e.rot);
  const err = wrapAngle(desired - e.rot);
  const softAngle = opts.softAngle ?? 0.7;
  const turnIntent = clampUnit(err / softAngle);
  const yaw = stepYawController(e, turnIntent, dt, profile);
  const translation = stepTranslation(e, intent, dt, profile, { boosting: !!intent.boost, npc: true });
  const bank = stepBankPose(e, yaw.turnFraction, dt, profile);
  const frame = computeFlightFrame(e, profile);
  const diagnostics = Object.assign({}, frame, yaw, translation, bank, {
    aimError: err,
    mode: profile.mode,
    flightClass: profile.flightClass,
  });
  e._flightFrame = diagnostics;
  return diagnostics;
}

export function computeFlightFrame(e, profile = resolveFlightProfile(e)) {
  const axes = localAxes(e.rot || 0);
  const vx = (e.vel && e.vel.x) || 0;
  const vz = (e.vel && e.vel.z) || 0;
  const forwardSpeed = vx * axes.fx + vz * axes.fz;
  const lateralSpeed = vx * axes.rx + vz * axes.rz;
  const speed = Math.hypot(vx, vz);
  return {
    mode: profile.mode,
    flightClass: profile.flightClass,
    speed,
    forwardSpeed,
    lateralSpeed,
    slipAngle: Math.atan2(lateralSpeed, Math.max(0.0001, Math.abs(forwardSpeed))),
    yawRate: e.angVel || 0,
    bank: e.bank || 0,
    mass: profile.mass,
    inertia: profile.inertia,
    assistStrength: profile.assistStrength,
    maxYawRate: profile.maxYawRate,
    maxSpeed: profile.maxSpeed,
  };
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

export function stepBankPose(e, turnFraction, dt, tuningOrProfile = DEFAULT_FLIGHT_TUNING) {
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
  return { targetBank, bank: e.bank || 0 };
}

export function settleBankPose(e, dt, tuning = DEFAULT_FLIGHT_TUNING) {
  if (!e.bank) return { targetBank: 0, bank: 0 };
  integrateBank(e, 0, dt, tuning);
  return { targetBank: 0, bank: e.bank || 0 };
}

export function effectivePlayerTurnRate(e, tuning = DEFAULT_FLIGHT_TUNING) {
  return Math.min((e.turnRate ?? 3) * tuning.turnRateMult, tuning.turnRateCap);
}

export function npcBankPose(e, turnRate, dt, tuning = DEFAULT_FLIGHT_TUNING) {
  const turnFraction = clampUnit((e.angVel || 0) / Math.max(0.01, turnRate ?? 3));
  return stepBankPose(e, turnFraction, dt, tuning);
}

function stepYawController(e, turnIntent, dt, profile) {
  const targetYawRate = turnIntent * profile.maxYawRate;
  const accel = Math.abs(targetYawRate) > Math.abs(e.angVel || 0) ? profile.angularAccel : profile.angularBrake;
  e.angVel = approachValue(e.angVel || 0, targetYawRate, Math.max(0, accel) * dt);
  if (!turnIntent && Math.abs(e.angVel) < DEFAULT_FLIGHT_TUNING.turnDeadband) e.angVel = 0;
  e.rot = wrapAngle((e.rot || 0) + e.angVel * dt);
  return {
    turnIntent,
    turnRate: profile.maxYawRate,
    targetYawRate,
    turnFraction: clampUnit((e.angVel || 0) / Math.max(0.01, profile.maxYawRate)),
  };
}

function stepTranslation(e, input = {}, dt, profile, opts = {}) {
  ensureVelocity(e);
  const axes = localAxes(e.rot || 0);
  const throttle = clampUnit(input.moveZ || 0);
  const strafe = clampUnit(input.moveX || 0);
  const boosting = !!opts.boosting;
  const thrustMult = boosting ? profile.boostMult : 1;
  const forwardAccel = throttle >= 0 ? profile.mainAccel : profile.reverseAccel;

  e.vel.x += axes.fx * throttle * forwardAccel * thrustMult * dt;
  e.vel.z += axes.fz * throttle * forwardAccel * thrustMult * dt;
  e.vel.x += axes.rx * strafe * profile.strafeAccel * thrustMult * dt;
  e.vel.z += axes.rz * strafe * profile.strafeAccel * thrustMult * dt;

  const before = computeLocalVelocity(e, axes);
  let forwardSpeed = dampScalar(before.forward, profile.linearDrag, dt);
  let lateralSpeed = dampScalar(before.lateral, profile.linearDrag + profile.lateralDrag + profile.assistStrength, dt);

  if (throttle < 0 && before.forward > 0) {
    forwardSpeed = dampScalar(forwardSpeed, profile.reverseBrake * (-throttle), dt);
  }

  e.vel.x = axes.fx * forwardSpeed + axes.rx * lateralSpeed;
  e.vel.z = axes.fz * forwardSpeed + axes.rz * lateralSpeed;

  const max = profile.maxSpeed * (boosting ? profile.boostMaxSpeedMult : profile.normalMaxSpeedMult);
  const speed = clampSpeed(e, max);
  return {
    throttle,
    strafe,
    speed,
    forwardSpeed,
    lateralSpeed,
    assistStrength: profile.assistStrength,
    boosting,
  };
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

function localAxes(rot) {
  const fx = Math.cos(rot), fz = Math.sin(rot);
  return { fx, fz, rx: -fz, rz: fx };
}

function computeLocalVelocity(e, axes) {
  const vx = (e.vel && e.vel.x) || 0;
  const vz = (e.vel && e.vel.z) || 0;
  return {
    forward: vx * axes.fx + vz * axes.fz,
    lateral: vx * axes.rx + vz * axes.rz,
  };
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
