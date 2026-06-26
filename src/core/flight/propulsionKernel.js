// SpaceFace Flight V3 — deterministic force/torque propulsion kernel.
//
// The kernel is deliberately pure: it does not mutate entities, does not know
// Rapier, and never edits position or velocity. It converts pilot/AI intent into
// physical force, torque and optional impulse commands. The physics owner remains
// the only writer of body motion.
//
// Design invariants:
//   1. Reaction / torch / sail drives have no hidden vacuum drag or arcade terminal speed.
//   2. Assisted flight brakes by spending real counter-thruster authority.
//   3. Turning the nose does not rotate the velocity vector.
//   4. Gravimetric drives are explicitly non-Newtonian and trade cumulative speed for control.
//   5. Pulse-plate boost is a charged discrete momentum impulse.
//   6. Every result is deterministic for the same input stream.

import { DRIVE_FAMILIES, normalizeProfile } from './propulsionCatalog.js';

export const PROPULSION_RUNTIME_SCHEMA_VERSION = 1;
export const FLIGHT_ASSIST_MODES = Object.freeze(['assisted', 'drift', 'newtonian']);

const EPS = 1e-9;
const TAU = Math.PI * 2;

/**
 * @typedef {Object} PropulsionStepInput
 * @property {number} dt fixed simulation step, seconds
 * @property {Object} body {pos,vel,rot,angVel,mass,inertia}
 * @property {Object} input {throttle,strafe,turn,boost,brake,assistMode,boostPressed,boostReleased}
 * @property {Object} profile propulsion profile
 * @property {Object} runtime serialized propulsion runtime from the previous tick
 * @property {Object} environment optional {particulateDensity,dragCoefficient,fieldDirection,fieldStrength}
 */

/** Advance one fixed propulsion tick. */
export function stepPropulsion(args = {}) {
  const dt = clamp(finite(args.dt, 0), 0, 0.25);
  const body = normalizeBody(args.body);
  const input = normalizeInput(args.input);
  const profile = normalizeProfile(args.profile || {});
  const runtime = normalizeRuntime(args.runtime, profile);
  const environment = normalizeEnvironment(args.environment);

  if (!(dt > 0)) return idleResult(body, profile, runtime, input);

  switch (profile.family) {
    case DRIVE_FAMILIES.GRAVIMETRIC:
      return stepGravimetric(body, input, profile, runtime, environment, dt);
    case DRIVE_FAMILIES.PULSE_PLATE:
      return stepPulsePlate(body, input, profile, runtime, environment, dt);
    case DRIVE_FAMILIES.TORCH:
      return stepTorch(body, input, profile, runtime, environment, dt);
    case DRIVE_FAMILIES.SAIL:
      return stepFieldSail(body, input, profile, runtime, environment, dt);
    case DRIVE_FAMILIES.REACTION:
    default:
      return stepReaction(body, input, profile, runtime, environment, dt);
  }
}

/** Pure helper for tools, AI and HUD previews. */
export function previewCounterThrust(bodyLike, profileLike, assistMode = 'assisted', scale = 1) {
  const body = normalizeBody(bodyLike);
  const profile = normalizeProfile(profileLike || {});
  const mode = normalizeAssistMode(assistMode);
  const axes = localAxes(body.rot);
  const assist = reactionAssistAcceleration(body, axes, {
    throttle: 0,
    strafe: 0,
    brake: true,
    assistMode: mode,
  }, profile, true);
  return scale2(assist.accel, clamp(finite(scale, 1), 0, 1));
}

function stepReaction(body, input, profile, runtime, environment, dt) {
  const axes = localAxes(body.rot);
  const boostMult = input.boost ? positive(profile.boostAccelMult, 1) : 1;
  const limits = reactionLimits(profile, boostMult);
  const controlLimits = input.brake ? reactionBrakeLimits(profile) : limits;
  const localVelocity = worldToLocal(body.vel, axes);

  const manualLocal = manualThrustLocal(input, limits, localVelocity, profile);

  const assist = reactionAssistAcceleration(body, axes, input, profile, false);
  const combined = clampLocalAcceleration({
    forward: manualLocal.forward + assist.local.forward,
    lateral: manualLocal.lateral + assist.local.lateral,
  }, controlLimits);

  let accel = localToWorld(combined, axes);
  const environmental = environmentalDragAcceleration(body, environment);
  accel = add2(accel, environmental);

  const yaw = computeYawControl(body, input, profile, dt);
  const demand = resourceDemand(profile, accel, input.boost, dt);
  const nextRuntime = coolRuntime({ ...runtime, family: profile.family }, profile, demand, dt);

  return makeResult({
    body,
    profile,
    input,
    runtime: nextRuntime,
    acceleration: accel,
    angularAcceleration: yaw.angularAcceleration,
    maxSpeed: finiteOrInfinity(profile.solverSpeedLimit),
    demand,
    events: transitionEvents(runtime, nextRuntime, input, profile),
    telemetry: {
      driveState: 'thrust',
      manualLocal,
      assistLocal: assist.local,
      assistReason: assist.reason,
      environmentalAcceleration: environmental,
      targetYawRate: yaw.targetYawRate,
      desiredHeading: null,
      boostFraction: input.boost ? 1 : 0,
    },
  });
}

function stepGravimetric(body, input, profile, runtime, environment, dt) {
  const axes = localAxes(body.rot);
  const maxSpeed = input.boost
    ? positive(profile.boostMaxSpeed, positive(profile.maxSpeed, 150))
    : positive(profile.maxSpeed, 150);
  const desiredLocal = clampMagnitude({ x: input.throttle, z: input.strafe }, 1);
  let targetVelocity;

  // A gravimetric drive's defining bargain is coupled control. In newtonian mode,
  // neutral input preserves momentum, but non-zero input still selects a velocity
  // target; this gives advanced pilots a decoupled option without pretending the
  // drive is a reaction engine.
  if (Math.hypot(desiredLocal.x, desiredLocal.z) <= 0.001 && input.assistMode === 'newtonian' && !input.brake) {
    targetVelocity = { x: body.vel.x, z: body.vel.z };
  } else if (input.brake) {
    targetVelocity = { x: 0, z: 0 };
  } else {
    targetVelocity = {
      x: (axes.fx * desiredLocal.x + axes.rx * desiredLocal.z) * maxSpeed,
      z: (axes.fz * desiredLocal.x + axes.rz * desiredLocal.z) * maxSpeed,
    };
  }

  const error = sub2(targetVelocity, body.vel);
  const response = positive(profile.responseHz, 4.5);
  const raw = scale2(error, response);
  const braking = dot2(error, body.vel) < 0;
  const accelLimit = braking
    ? positive(profile.maxBrakeAccel, positive(profile.maxAccel, 80))
    : positive(profile.maxAccel, 80);
  let accel = clampMagnitude(raw, accelLimit);
  accel = add2(accel, environmentalDragAcceleration(body, environment));

  const yaw = computeYawControl(body, input, profile, dt);
  const demand = resourceDemand(profile, accel, input.boost, dt, positive(profile.resources && profile.resources.idleEnergyPerS, 0));
  const nextRuntime = coolRuntime({ ...runtime, family: profile.family }, profile, demand, dt);

  return makeResult({
    body,
    profile,
    input,
    runtime: nextRuntime,
    acceleration: accel,
    angularAcceleration: yaw.angularAcceleration,
    maxSpeed: Math.min(maxSpeed * 1.04, finiteOrInfinity(profile.solverSpeedLimit)),
    demand,
    events: transitionEvents(runtime, nextRuntime, input, profile),
    telemetry: {
      driveState: 'velocity-servo',
      targetVelocity,
      velocityError: error,
      targetYawRate: yaw.targetYawRate,
      desiredHeading: null,
      boostFraction: input.boost ? 1 : 0,
    },
  });
}

function stepPulsePlate(body, input, profile, runtime, environment, dt) {
  const axes = localAxes(body.rot);
  const cooldown = Math.max(0, finite(runtime.pulseCooldownS, 0) - dt);
  let chargeS = clamp(finite(runtime.chargeS, 0), 0, positive(profile.maxChargeS, 2));
  let autoFlipBurn = !!runtime.autoFlipBurn;
  const events = [];

  const speed = length2(body.vel);
  if (input.brake && speed > 0.5) autoFlipBurn = true;
  if (!input.brake && input.turn !== 0) autoFlipBurn = false;

  const desiredHeading = autoFlipBurn && speed > 0.5
    ? wrapAngle(Math.atan2(body.vel.z, body.vel.x) + Math.PI)
    : null;

  const manualInput = autoFlipBurn
    ? { ...input, throttle: 0, strafe: 0 }
    : input;

  const rcsProfile = {
    ...profile,
    mainAccel: positive(profile.rcsForwardAccel, 10),
    reverseAccel: positive(profile.rcsReverseAccel, 8),
    strafeAccel: positive(profile.rcsStrafeAccel, 6),
    boostAccelMult: 1,
    assist: {
      neutralBrakeFraction: input.assistMode === 'assisted' ? 0.16 : 0,
      lateralKillFraction: input.assistMode === 'assisted' ? 0.12 : 0,
      commandedAxisDamping: 0,
      stopHorizonS: 7,
      driftStopHorizonS: 12,
      deadSpeed: 0.2,
      deadInput: 0.025,
    },
  };
  const limits = reactionLimits(rcsProfile, 1);
  const assist = reactionAssistAcceleration(body, axes, manualInput, rcsProfile, false);
  const local = clampLocalAcceleration({
    forward: (manualInput.throttle >= 0
      ? manualInput.throttle * limits.forward
      : manualInput.throttle * limits.reverse) + assist.local.forward,
    lateral: manualInput.strafe * limits.strafe + assist.local.lateral,
  }, limits);
  let accel = add2(localToWorld(local, axes), environmentalDragAcceleration(body, environment));

  const charging = (input.boost || autoFlipBurn) && cooldown <= 0;
  if (charging) chargeS = Math.min(positive(profile.maxChargeS, 2), chargeS + dt);

  let impulse = null;
  let firedDv = 0;
  const manualRelease = input.boostReleased && chargeS >= positive(profile.minChargeS, 0.1);
  const alignmentError = desiredHeading == null ? 0 : Math.abs(wrapAngle(desiredHeading - body.rot));
  const autoRelease = autoFlipBurn && chargeS >= Math.max(positive(profile.minChargeS, 0.1), 0.28)
    && alignmentError <= positive(profile.fireAlignmentRad, 0.1)
    && cooldown <= 0;

  if ((manualRelease || autoRelease) && cooldown <= 0) {
    const fraction = clamp(chargeS / positive(profile.maxChargeS, 2), 0, 1);
    const curve = positive(profile.chargeCurve, 1.7);
    firedDv = lerp(
      positive(profile.baseImpulseDv, 25),
      positive(profile.maxImpulseDv, 200),
      Math.pow(fraction, curve)
    );
    impulse = {
      x: axes.fx * firedDv * body.mass,
      y: 0,
      z: axes.fz * firedDv * body.mass,
    };
    chargeS = 0;
    autoFlipBurn = false;
    events.push({ type: 'propulsion:pulse', driveId: profile.id, deltaV: firedDv, chargeFraction: fraction });
  }

  const yaw = desiredHeading == null
    ? computeYawControl(body, input, profile, dt)
    : computeHeadingControl(body, desiredHeading, profile, dt);

  const chargeEnergy = charging ? positive(profile.resources && profile.resources.energyPerChargeS, 0) * dt : 0;
  const chargeHeat = charging ? positive(profile.resources && profile.resources.heatPerChargeS, 0) * dt : 0;
  const pulseHeat = firedDv > 0 ? positive(profile.resources && profile.resources.heatPerPulse, 0) : 0;
  const baseDemand = resourceDemand(profile, accel, false, dt);
  const demand = {
    energy: baseDemand.energy + chargeEnergy,
    heat: baseDemand.heat + chargeHeat + pulseHeat,
    fuel: baseDemand.fuel,
  };
  const nextRuntime = coolRuntime({
    ...runtime,
    family: profile.family,
    chargeS,
    pulseCooldownS: firedDv > 0 ? positive(profile.pulseCooldownS, 0.3) : cooldown,
    autoFlipBurn,
  }, profile, demand, dt);

  return makeResult({
    body,
    profile,
    input,
    runtime: nextRuntime,
    acceleration: accel,
    angularAcceleration: yaw.angularAcceleration,
    impulse,
    maxSpeed: finiteOrInfinity(profile.solverSpeedLimit),
    demand,
    events: [...transitionEvents(runtime, nextRuntime, input, profile), ...events],
    telemetry: {
      driveState: firedDv > 0 ? 'pulse' : charging ? 'charging' : autoFlipBurn ? 'flip-burn' : 'rcs',
      chargeS,
      chargeFraction: clamp(chargeS / positive(profile.maxChargeS, 2), 0, 1),
      pulseCooldownS: nextRuntime.pulseCooldownS,
      firedDeltaV: firedDv,
      desiredHeading,
      headingError: desiredHeading == null ? 0 : wrapAngle(desiredHeading - body.rot),
      targetYawRate: yaw.targetYawRate,
    },
  });
}

function stepTorch(body, input, profile, runtime, environment, dt) {
  const desiredSpool = clamp(Math.max(Math.abs(input.throttle), input.boost ? 1 : 0), 0, 1);
  const spool = approach(
    clamp(finite(runtime.spool, 0), 0, 1),
    desiredSpool,
    dt / (desiredSpool > finite(runtime.spool, 0)
      ? positive(profile.spoolUpS, 2.5)
      : positive(profile.spoolDownS, 1.4))
  );

  const effective = {
    ...profile,
    mainAccel: positive(profile.mainAccel, 60) * Math.max(spool, desiredSpool > 0 ? positive(profile.ignitionFloor, 0.15) : 0),
    reverseAccel: positive(profile.reverseAccel, 10),
    strafeAccel: positive(profile.strafeAccel, 5),
    boostAccelMult: input.boost ? positive(profile.boostAccelMult, 1.5) : 1,
    assist: profile.assist || {
      neutralBrakeFraction: 0.20,
      lateralKillFraction: 0.12,
      commandedAxisDamping: 0.02,
      stopHorizonS: 6.5,
      driftStopHorizonS: 12,
      deadSpeed: 0.25,
      deadInput: 0.025,
    },
  };

  const axes = localAxes(body.rot);
  const limits = reactionLimits(effective, effective.boostAccelMult);
  const controlLimits = input.brake ? reactionBrakeLimits(effective) : limits;
  const localVelocity = worldToLocal(body.vel, axes);
  const assist = reactionAssistAcceleration(body, axes, input, effective, false);
  const manualLocal = manualThrustLocal(input, limits, localVelocity, effective);
  const local = clampLocalAcceleration({
    forward: manualLocal.forward + assist.local.forward,
    lateral: manualLocal.lateral + assist.local.lateral,
  }, controlLimits);
  let accel = add2(localToWorld(local, axes), environmentalDragAcceleration(body, environment));
  const yaw = computeYawControl(body, input, profile, dt);
  const demand = resourceDemand(profile, accel, input.boost, dt, spool > 0 ? positive(profile.resources && profile.resources.idleFuelPerS, 0) : 0);
  const nextRuntime = coolRuntime({ ...runtime, family: profile.family, spool }, profile, demand, dt);

  return makeResult({
    body,
    profile,
    input,
    runtime: nextRuntime,
    acceleration: accel,
    angularAcceleration: yaw.angularAcceleration,
    maxSpeed: finiteOrInfinity(profile.solverSpeedLimit),
    demand,
    events: transitionEvents(runtime, nextRuntime, input, profile),
    telemetry: {
      driveState: spool > 0.01 ? 'spooling' : 'idle',
      spool,
      assistLocal: assist.local,
      targetYawRate: yaw.targetYawRate,
      desiredHeading: null,
    },
  });
}

function stepFieldSail(body, input, profile, runtime, environment, dt) {
  const deployTarget = input.boost || input.throttle > 0.05 ? 1 : 0;
  const deployed = approach(
    clamp(finite(runtime.deployed, 0), 0, 1),
    deployTarget,
    dt / (deployTarget > finite(runtime.deployed, 0)
      ? positive(profile.deploymentS, 2.5)
      : positive(profile.collapseS, 0.9))
  );
  const axes = localAxes(body.rot);
  const fieldDir = normalize2(environment.fieldDirection, { x: 1, z: 0 });
  const fieldStrength = Math.max(0, finite(environment.fieldStrength, 0));
  const alignment = Math.max(0, dot2({ x: axes.fx, z: axes.fz }, fieldDir));
  const sailAccel = positive(profile.fieldAccel, 8) * fieldStrength * deployed * alignment * Math.max(0, input.throttle);
  const sailWorld = scale2(fieldDir, sailAccel);

  const trim = localToWorld({
    forward: Math.min(0, input.throttle) * positive(profile.trimAccel, 2),
    lateral: input.strafe * positive(profile.trimAccel, 2),
  }, axes);
  let accel = add2(add2(sailWorld, trim), environmentalDragAcceleration(body, environment));

  const yaw = computeYawControl(body, input, profile, dt);
  const demand = resourceDemand(profile, accel, false, dt, deployed > 0 ? positive(profile.resources && profile.resources.idleEnergyPerS, 0) : 0);
  const nextRuntime = coolRuntime({ ...runtime, family: profile.family, deployed }, profile, demand, dt);

  return makeResult({
    body,
    profile,
    input,
    runtime: nextRuntime,
    acceleration: accel,
    angularAcceleration: yaw.angularAcceleration,
    maxSpeed: finiteOrInfinity(profile.solverSpeedLimit),
    demand,
    events: transitionEvents(runtime, nextRuntime, input, profile),
    telemetry: {
      driveState: deployed > 0.01 ? 'deployed' : 'stowed',
      deployed,
      fieldStrength,
      fieldDirection: fieldDir,
      alignment,
      targetYawRate: yaw.targetYawRate,
      desiredHeading: null,
    },
  });
}

function reactionAssistAcceleration(body, axes, input, profile, forceBrake) {
  const mode = normalizeAssistMode(input.assistMode);
  const settings = profile.assist || {};
  const deadInput = positive(settings.deadInput, 0.025);
  const hasManual = Math.abs(input.throttle) > deadInput || Math.abs(input.strafe) > deadInput;
  const localVelocity = worldToLocal(body.vel, axes);
  const limits = (forceBrake || input.brake) ? reactionBrakeLimits(profile) : reactionLimits(profile, 1);
  let forward = 0;
  let lateral = 0;
  let reason = 'none';

  if (mode === 'newtonian' && !forceBrake && !input.brake) return { accel: zero2(), local: { forward: 0, lateral: 0 }, reason };

  if (forceBrake || input.brake || !hasManual) {
    const horizon = input.brake || forceBrake
      ? positive(settings.pilotBrakeHorizonS, 0.72)
      : mode === 'drift'
        ? positive(settings.driftStopHorizonS, 8)
        : positive(settings.stopHorizonS, 2.8);
    let fraction = mode === 'newtonian'
      ? 1
      : mode === 'drift'
        ? Math.min(positive(settings.neutralBrakeFraction, 0.4), 0.18)
        : positive(settings.neutralBrakeFraction, 0.4);
    if (input.brake || forceBrake) fraction = 1;

    forward = -localVelocity.forward / horizon * fraction;
    lateral = -localVelocity.lateral / horizon * fraction;
    reason = input.brake || forceBrake ? 'pilot-brake' : 'neutral-counterthrust';
  } else if (mode !== 'newtonian') {
    const lateralFraction = mode === 'drift'
      ? positive(settings.lateralKillFraction, 0.3) * 0.35
      : positive(settings.lateralKillFraction, 0.3);
    lateral = -localVelocity.lateral / Math.max(0.25, positive(settings.stopHorizonS, 2.8)) * lateralFraction;

    // A tiny commanded-axis damper suppresses numerical chatter while preserving
    // the core maneuver: rotate the nose while momentum keeps carrying the ship.
    const axisDamping = positive(settings.commandedAxisDamping, 0.06);
    if (Math.abs(input.throttle) <= deadInput) forward = -localVelocity.forward * axisDamping;
    reason = 'slip-assist';
  }

  const deadSpeed = positive(settings.deadSpeed, 0.18);
  if (Math.abs(localVelocity.forward) < deadSpeed && Math.abs(input.throttle) <= deadInput) forward = 0;
  if (Math.abs(localVelocity.lateral) < deadSpeed && Math.abs(input.strafe) <= deadInput) lateral = 0;

  const local = clampLocalAcceleration({ forward, lateral }, limits);
  return { accel: localToWorld(local, axes), local, reason };
}

function computeYawControl(body, input, profile, dt) {
  const mode = normalizeAssistMode(input.assistMode);
  const turn = clamp(finite(input.turn, 0), -1, 1);
  if (mode === 'newtonian' && Math.abs(turn) < 0.001) {
    return { targetYawRate: body.angVel, angularAcceleration: 0 };
  }
  const targetYawRate = turn * positive(profile.maxYawRate, 2.5);
  const error = targetYawRate - body.angVel;
  const accelerating = Math.abs(targetYawRate) > Math.abs(body.angVel) && Math.sign(targetYawRate) === Math.sign(error);
  const maxAlpha = accelerating
    ? positive(profile.yawAccel, 8)
    : positive(profile.yawBrake, positive(profile.yawAccel, 8) * 1.4);
  const angularAcceleration = clamp(error / Math.max(dt, 1 / 120), -maxAlpha, maxAlpha);
  return { targetYawRate, angularAcceleration };
}

function computeHeadingControl(body, desiredHeading, profile, dt) {
  const error = wrapAngle(desiredHeading - body.rot);
  const maxRate = positive(profile.maxYawRate, 2);
  const targetYawRate = clamp(error * 3.8, -maxRate, maxRate);
  const rateError = targetYawRate - body.angVel;
  const angularAcceleration = clamp(
    rateError / Math.max(dt, 1 / 120),
    -positive(profile.yawBrake, 9),
    positive(profile.yawAccel, 7)
  );
  return { targetYawRate, angularAcceleration };
}

function reactionLimits(profile, boostMult) {
  return {
    forward: positive(profile.mainAccel, 40) * positive(boostMult, 1),
    reverse: positive(profile.reverseAccel, positive(profile.mainAccel, 40) * 0.55),
    strafe: positive(profile.strafeAccel, positive(profile.mainAccel, 40) * 0.45),
  };
}

function manualThrustLocal(input, limits, localVelocity, profile) {
  const assist = profile.assist || {};
  const deadInput = positive(assist.deadInput, 0.025);
  const releaseSpeed = positive(assist.brakeReleaseSpeed, 1.2);
  let throttle = input.throttle;
  let strafe = input.strafe;

  if (input.brake) {
    if (Math.abs(throttle) > deadInput && throttle * finite(localVelocity.forward, 0) < -releaseSpeed) throttle = 0;
    if (Math.abs(strafe) > deadInput && strafe * finite(localVelocity.lateral, 0) < -releaseSpeed) strafe = 0;
  }

  return {
    forward: throttle >= 0
      ? throttle * limits.forward
      : throttle * limits.reverse,
    lateral: strafe * limits.strafe,
  };
}

function reactionBrakeLimits(profile) {
  const base = reactionLimits(profile, 1);
  const assist = profile.assist || {};
  const main = positive(profile.mainAccel, 40);
  const brake = positive(profile.brakeAccel, Math.max(base.reverse, main * positive(assist.pilotBrakeAccelMult, 1.35)));
  const lateral = positive(profile.brakeStrafeAccel, Math.max(base.strafe, brake * positive(assist.pilotBrakeLateralFraction, 0.85)));
  return {
    forward: Math.max(base.forward, brake),
    reverse: brake,
    strafe: lateral,
  };
}

function clampLocalAcceleration(local, limits) {
  return {
    forward: clamp(finite(local.forward, 0), -limits.reverse, limits.forward),
    lateral: clamp(finite(local.lateral, 0), -limits.strafe, limits.strafe),
  };
}

function environmentalDragAcceleration(body, environment) {
  const density = Math.max(0, finite(environment.particulateDensity, 0));
  if (!(density > 0)) return zero2();
  const speed = length2(body.vel);
  if (!(speed > EPS)) return zero2();
  const coeff = Math.max(0, finite(environment.dragCoefficient, 0.00002));
  // This is an environmental hazard term, not universal "space resistance".
  // It is intentionally capped so an authored nebula cannot create a one-tick NaN.
  const magnitude = Math.min(120, coeff * density * speed * speed / Math.max(1, body.mass));
  return scale2(body.vel, -magnitude / speed);
}

function resourceDemand(profile, acceleration, boosting, dt, idle = 0) {
  const resources = profile.resources || {};
  const a = length2(acceleration);
  const boostHeat = boosting ? positive(resources.boostHeatMult, 1) : 1;
  return {
    energy: Math.max(0, idle * dt + a * positive(resources.energyPerAccel, 0) * dt),
    heat: Math.max(0, a * positive(resources.heatPerAccel, 0) * boostHeat * dt),
    fuel: Math.max(0, idle * dt + a * positive(resources.fuelPerAccel, 0) * dt),
  };
}

function coolRuntime(runtime, profile, demand, dt) {
  const cooling = positive(profile.resources && profile.resources.coolingPerS, 0);
  return {
    ...runtime,
    schemaVersion: PROPULSION_RUNTIME_SCHEMA_VERSION,
    family: profile.family,
    heat: Math.max(0, finite(runtime.heat, 0) + demand.heat - cooling * dt),
    energySpent: Math.max(0, finite(runtime.energySpent, 0) + demand.energy),
    fuelSpent: Math.max(0, finite(runtime.fuelSpent, 0) + demand.fuel),
  };
}

function transitionEvents(previous, next, input, profile) {
  const events = [];
  if (!!input.boost !== !!previous.boosting) {
    events.push({ type: input.boost ? 'propulsion:boostStart' : 'propulsion:boostStop', driveId: profile.id });
  }
  next.boosting = !!input.boost;
  return events;
}

function makeResult({ body, profile, input, runtime, acceleration, angularAcceleration, impulse = null, maxSpeed, demand, events, telemetry }) {
  const force = {
    x: finite(acceleration.x, 0) * body.mass,
    y: 0,
    z: finite(acceleration.z, 0) * body.mass,
  };
  const torque = {
    x: 0,
    y: finite(angularAcceleration, 0) * body.inertia,
    z: 0,
  };
  return {
    schemaVersion: PROPULSION_RUNTIME_SCHEMA_VERSION,
    driveId: profile.id,
    family: profile.family,
    force,
    torque,
    impulse,
    maxSpeed: finiteOrInfinity(maxSpeed),
    runtime,
    resourceDelta: {
      energy: -Math.max(0, finite(demand && demand.energy, 0)),
      heat: Math.max(0, finite(demand && demand.heat, 0)),
      fuel: -Math.max(0, finite(demand && demand.fuel, 0)),
    },
    events: Array.isArray(events) ? events : [],
    telemetry: {
      family: profile.family,
      driveId: profile.id,
      assistMode: input.assistMode,
      acceleration: { x: finite(acceleration.x, 0), z: finite(acceleration.z, 0) },
      angularAcceleration: finite(angularAcceleration, 0),
      force,
      torque,
      speed: length2(body.vel),
      forwardSpeed: dot2(body.vel, { x: Math.cos(body.rot), z: Math.sin(body.rot) }),
      lateralSpeed: dot2(body.vel, { x: -Math.sin(body.rot), z: Math.cos(body.rot) }),
      ...telemetry,
    },
  };
}

function idleResult(body, profile, runtime, input) {
  return makeResult({
    body,
    profile,
    input,
    runtime,
    acceleration: zero2(),
    angularAcceleration: 0,
    maxSpeed: finiteOrInfinity(profile.solverSpeedLimit),
    demand: { energy: 0, heat: 0, fuel: 0 },
    events: [],
    telemetry: { driveState: 'idle' },
  });
}

export function createPropulsionRuntime(profileLike = {}) {
  const profile = normalizeProfile(profileLike);
  return normalizeRuntime(null, profile);
}

function normalizeRuntime(runtime, profile) {
  const r = runtime && typeof runtime === 'object' ? runtime : {};
  return {
    schemaVersion: PROPULSION_RUNTIME_SCHEMA_VERSION,
    family: profile.family,
    heat: Math.max(0, finite(r.heat, 0)),
    energySpent: Math.max(0, finite(r.energySpent, 0)),
    fuelSpent: Math.max(0, finite(r.fuelSpent, 0)),
    boosting: !!r.boosting,
    chargeS: Math.max(0, finite(r.chargeS, 0)),
    pulseCooldownS: Math.max(0, finite(r.pulseCooldownS, 0)),
    autoFlipBurn: !!r.autoFlipBurn,
    spool: clamp(finite(r.spool, 0), 0, 1),
    deployed: clamp(finite(r.deployed, 0), 0, 1),
  };
}

function normalizeBody(body = {}) {
  const mass = positive(body.mass, 1);
  return {
    pos: { x: finite(body.pos && body.pos.x, 0), z: finite(body.pos && body.pos.z, 0) },
    vel: { x: finite(body.vel && body.vel.x, 0), z: finite(body.vel && body.vel.z, 0) },
    rot: wrapAngle(finite(body.rot, 0)),
    angVel: finite(body.angVel, 0),
    mass,
    inertia: positive(body.inertia, Math.max(1, mass)),
  };
}

function normalizeInput(input = {}) {
  return {
    throttle: clamp(finite(input.throttle ?? input.moveZ, 0), -1, 1),
    strafe: clamp(finite(input.strafe ?? input.moveX, 0), -1, 1),
    turn: clamp(finite(input.turn ?? input.turnIntent, 0), -1, 1),
    boost: !!input.boost,
    brake: !!input.brake,
    boostPressed: !!input.boostPressed,
    boostReleased: !!input.boostReleased,
    assistMode: normalizeAssistMode(input.assistMode || input.flightMode),
  };
}

function normalizeEnvironment(environment = {}) {
  return {
    particulateDensity: Math.max(0, finite(environment.particulateDensity, 0)),
    dragCoefficient: Math.max(0, finite(environment.dragCoefficient, 0.00002)),
    fieldDirection: normalize2(environment.fieldDirection, { x: 1, z: 0 }),
    fieldStrength: Math.max(0, finite(environment.fieldStrength, 0)),
  };
}

function normalizeAssistMode(mode) {
  return FLIGHT_ASSIST_MODES.includes(mode) ? mode : 'assisted';
}

function localAxes(rot) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { fx: c, fz: s, rx: -s, rz: c };
}

function worldToLocal(v, axes) {
  return {
    forward: v.x * axes.fx + v.z * axes.fz,
    lateral: v.x * axes.rx + v.z * axes.rz,
  };
}

function localToWorld(local, axes) {
  return {
    x: axes.fx * finite(local.forward, 0) + axes.rx * finite(local.lateral, 0),
    z: axes.fz * finite(local.forward, 0) + axes.rz * finite(local.lateral, 0),
  };
}

function zero2() { return { x: 0, z: 0 }; }
function add2(a, b) { return { x: finite(a && a.x) + finite(b && b.x), z: finite(a && a.z) + finite(b && b.z) }; }
function sub2(a, b) { return { x: finite(a && a.x) - finite(b && b.x), z: finite(a && a.z) - finite(b && b.z) }; }
function scale2(v, s) { return { x: finite(v && v.x) * s, z: finite(v && v.z) * s }; }
function dot2(a, b) { return finite(a && a.x) * finite(b && b.x) + finite(a && a.z) * finite(b && b.z); }
function length2(v) { return Math.hypot(finite(v && v.x), finite(v && v.z)); }

function normalize2(v, fallback = zero2()) {
  const x = finite(v && v.x, fallback.x);
  const z = finite(v && v.z, fallback.z);
  const len = Math.hypot(x, z);
  return len > EPS ? { x: x / len, z: z / len } : { x: fallback.x, z: fallback.z };
}

function clampMagnitude(v, max) {
  const length = length2(v);
  if (!(length > max) || !(length > EPS)) return { x: finite(v.x), z: finite(v.z) };
  return scale2(v, max / length);
}

function wrapAngle(value) {
  let v = finite(value, 0) % TAU;
  if (v <= -Math.PI) v += TAU;
  if (v > Math.PI) v -= TAU;
  return v;
}

function approach(current, target, maxDelta) {
  const delta = target - current;
  if (Math.abs(delta) <= Math.abs(maxDelta)) return target;
  return current + Math.sign(delta) * Math.abs(maxDelta);
}

function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }
function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function positive(value, fallback) { return Number.isFinite(value) && value > 0 ? value : fallback; }
function finiteOrInfinity(value) { return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY; }
