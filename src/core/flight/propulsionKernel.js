// SpaceFace Flight V3 — deterministic force/torque propulsion kernel.
//
// The kernel is deliberately pure: it does not mutate entities, does not know
// Rapier, and never edits position or velocity. It converts pilot/AI intent into
// physical force, torque and optional impulse commands. The physics owner remains
// the only writer of body motion.
//
// Design invariants:
//   1. Reaction / torch / sail drives have no hidden vacuum drag or arcade terminal speed.
//      In ASSISTED mode the flight computer additionally governs commanded forward speed toward
//      the drive's combatSpeed (a speed COMMAND, not drag): thrust eases off as the ship reaches
//      throttle × combatSpeed, and overspeed converges gently using real reverse-thruster
//      authority. Drift and newtonian modes keep the raw ungoverned model — slingshots, massline
//      tricks and expert flying accumulate speed without interference.
//   2. Assisted flight brakes by spending real counter-thruster authority.
//   3. Turning the nose does not rotate the velocity vector.
//   4. Gravimetric drives are explicitly non-Newtonian and trade cumulative speed for control.
//   5. Pulse-plate boost is a charged discrete momentum impulse.
//   6. Every result is deterministic for the same input stream.
//   7. Coast helm: when main throttle and boost are idle, yaw rate/accel rise so pilots can
//      let off the thrusters and flip more nimbly (strategic, not free while thrusting).
//   8. Travel drive (atlas D5) is a THIRD orthogonal axis, not a fourth assist regime: it enters
//      as `input.travelDrive` and only ever SHAPES the governor's cap. The kernel stays pure —
//      the latch, its timers and its bindings live with the input owner.

import { DRIVE_FAMILIES, normalizeProfile } from './propulsionCatalog.js';
import { travelFlag } from '../../data/featureFlags.js';

export const PROPULSION_RUNTIME_SCHEMA_VERSION = 1;
export const FLIGHT_ASSIST_MODES = Object.freeze(['assisted', 'drift', 'newtonian']);
/** Yaw authority multiplier while main thrusters are idle (let-off-and-flip primitive). */
export const COAST_HELM_YAW_MULT = 1.2;

/**
 * Travel-drive axis (atlas D5). Orthogonal to the assist regime (assisted/drift/newtonian) and to
 * the control owner (manual / local autopilot / route follower): *route-follower + assisted +
 * engaged* is autopilot cruise, *manual + engaged* is hand-flown cruise, and a disruption is a
 * forced state transition regardless of who is commanding.
 */
export const TRAVEL_DRIVE_STATES = Object.freeze(['off', 'spooling', 'engaged', 'cooldown']);

/**
 * Per-family travel-speed ceiling, expressed as a multiple of the drive's own governed combat
 * speed so it reads as ship identity rather than a global constant. TORCH is the long-haul drive
 * and gets the most headroom; REACTION is modest; GRAVIMETRIC is an envelope drive whose whole
 * bargain is a hard maxSpeed, so it gains the least; SAIL is slow but patient.
 */
export const TRAVEL_CEILING_FAMILY_MULT = Object.freeze({
  [DRIVE_FAMILIES.TORCH]: 3.5,
  [DRIVE_FAMILIES.PULSE_PLATE]: 2.75,
  [DRIVE_FAMILIES.REACTION]: 2.25,
  [DRIVE_FAMILIES.SAIL]: 2.0,
  [DRIVE_FAMILIES.GRAVIMETRIC]: 1.5,
});

/**
 * Hard ceiling on any travel ceiling, in WU/s. This is an engineering bound, not a feel knob: at
 * 1200 WU/s a 1/60 s tick displaces 20 WU, which stays well under collision-geometry scale (hull
 * radii are single-digit-to-tens of WU) and keeps frame rebasing sane — `FRAME_REBASE_THRESHOLD_WU`
 * is 8192 in src/core/coordinates.js, i.e. ~410 ticks of travel between rebases at the absolute
 * ceiling. Raising this without re-checking both of those is how you get tunnelling.
 */
export const TRAVEL_CEILING_ABSOLUTE_WU_S = 1200;

/** Seconds of ramp to cover the full ceiling span at nominal rate (before the asymptotic taper). */
const TRAVEL_RAMP_FULL_S = 9;
/**
 * Floor on the tapered ramp rate as a fraction of nominal. The taper is what makes the ceiling
 * read as asymptotic rather than as a wall (D5: "approached asymptotically ... so it never reads
 * as a wall"); the floor is what keeps it reachable in finite time instead of asymptotic forever.
 */
const TRAVEL_RAMP_TAPER_FLOOR = 0.12;
/** Exponential decay constant for a disengaged travel cap — mirrors the tether-exit sling decay. */
const TRAVEL_DISENGAGE_DECAY_TAU_S = 5;

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

/**
 * Resolve a drive's travel-speed ceiling in WU/s. Pure, side-effect free and exported so the HUD
 * can draw the V-MAX line on the velocity tape without re-deriving the rule (D5).
 *
 * Precedence: an authored `profile.travelCeiling` wins (drive-tier upgrades hang off this), else
 * the family multiplier applied to the drive's own governed speed. The result is clamped by the
 * drive's `solverSpeedLimit` — an envelope drive must not be handed a travel ceiling its own
 * solver refuses to integrate — and by the absolute engineering bound.
 */
export function resolveTravelCeiling(profileLike) {
  const profile = normalizeProfile(profileLike || {});
  const base = positive(profile.combatSpeed, positive(profile.maxSpeed, 150));
  const mult = positive(TRAVEL_CEILING_FAMILY_MULT[profile.family], TRAVEL_CEILING_FAMILY_MULT[DRIVE_FAMILIES.REACTION]);
  const authored = positive(profile.travelCeiling, 0);
  const raw = authored > 0 ? authored : base * mult;
  return Math.min(raw, finiteOrInfinity(profile.solverSpeedLimit), TRAVEL_CEILING_ABSOLUTE_WU_S);
}

/**
 * Normalize the drive block the input owner hands in. `cap` is the ramp's carried state: the
 * kernel advances it and republishes it on the result, and the owner feeds it back next tick —
 * exactly how `spool` works for the torch drive, except through the input packet rather than the
 * serialized runtime, so the drive axis adds nothing to the saved propulsion runtime.
 */
function normalizeTravelDrive(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const state = TRAVEL_DRIVE_STATES.includes(d.state) ? d.state : 'off';
  return {
    state,
    // Carried ramp state. 0 means "no travel cap in flight"; the first engaged tick seeds it.
    cap: Math.max(0, finite(d.cap, 0)),
    // Optional per-call overrides so a lane volume (D8) can multiply the drive's own numbers
    // without the kernel knowing anything about lanes.
    ceiling: positive(d.ceiling, 0),
    rampRate: positive(d.rampRate, 0),
    rampMult: positive(d.rampMult, 1),
  };
}

/**
 * Advance the travel-drive ramp for one tick and report what the governor should do with it.
 * Pure: consumes the carried `drive.cap`, returns the next one.
 *
 * While Engaged the cap is a moving target climbing toward the ceiling, tapering as it closes so
 * the ceiling is approached rather than hit. In every other state the cap does not snap back to
 * the ordinary governed cap — it DECAYS exponentially and reports `physicsEarnedMomentum`, so the
 * excess velocity a burn earned is spent by the existing decay path rather than confiscated by a
 * reverse-thrust command. That is the same mechanism the tether/self-sling exit already uses.
 */
function advanceTravelDrive(drive, profile, baseCap, forwardSpeed, dt) {
  const ceiling = drive.ceiling > 0
    ? Math.min(drive.ceiling, TRAVEL_CEILING_ABSOLUTE_WU_S)
    : resolveTravelCeiling(profile);
  const engaged = drive.state === 'engaged';
  const step = Math.max(0, finite(dt, 0));

  if (engaged) {
    // Seed from whatever the ship already has: engaging at speed must never yank the pilot down.
    const seed = drive.cap > 0 ? drive.cap : Math.max(baseCap, finite(forwardSpeed, 0));
    const from = Math.min(Math.max(seed, baseCap), ceiling);
    const span = Math.max(EPS, ceiling - Math.min(baseCap, ceiling));
    const remaining = clamp((ceiling - from) / span, 0, 1);
    const nominal = drive.rampRate > 0 ? drive.rampRate : ceiling / TRAVEL_RAMP_FULL_S;
    const rate = nominal * drive.rampMult * (TRAVEL_RAMP_TAPER_FLOOR + (1 - TRAVEL_RAMP_TAPER_FLOOR) * remaining);
    const cap = Math.min(ceiling, from + rate * step);
    return { state: drive.state, cap, ceiling, ramping: cap < ceiling - EPS, physicsEarnedMomentum: false };
  }

  // Off / Spooling / Cooldown: no cap contribution is being *added*, but anything already earned
  // bleeds off gently. Spooling deliberately behaves like Off for the cap — it is the pre-engage
  // window the latch owner times, not a partial burn.
  const decayed = drive.cap > 0 ? drive.cap * Math.exp(-step / TRAVEL_DISENGAGE_DECAY_TAU_S) : 0;
  const cap = decayed > baseCap ? decayed : 0;
  return { state: drive.state, cap, ceiling, ramping: false, physicsEarnedMomentum: cap > 0 };
}

function stepReaction(body, input, profile, runtime, environment, dt) {
  const axes = localAxes(body.rot);
  const boostMult = input.boost ? positive(profile.boostAccelMult, 1) : 1;
  const limits = reactionLimits(profile, boostMult);
  const controlLimits = input.brake ? reactionBrakeLimits(profile) : limits;
  const localVelocity = worldToLocal(body.vel, axes);

  const manualLocal = manualThrustLocal(input, limits, localVelocity, profile);
  const governor = applySpeedGovernor(manualLocal, input, limits, localVelocity, profile, dt);

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
      coastHelm: !!yaw.coastHelm,
      desiredHeading: null,
      boostFraction: input.boost ? 1 : 0,
      governor,
    },
  });
}

// Assisted-mode speed governor: forward throttle is a speed command toward
// throttle × combatSpeed (boost raises the cap by boostSpeedMult). Below the cap the servo
// saturates at full thruster authority, so acceleration feel is unchanged until the last
// ~governorResponseS worth of closing speed. Above the cap — a slingshot, dash or boost
// carry-over — convergence is deliberately gentle (overspeedBrakeFraction of reverse
// authority) so momentum earned through play is spent, not confiscated. Drift/newtonian:
// untouched — those modes ARE the ungoverned toy. Mutates manualLocal.forward in place and
// returns telemetry (null when the governor has no opinion this tick).
function applySpeedGovernor(manualLocal, input, limits, localVelocity, profile, dt) {
  if (normalizeAssistMode(input.assistMode) !== 'assisted') return null;
  const settings = profile.assist || {};
  const deadInput = positive(settings.deadInput, 0.025);
  if (!(input.throttle > deadInput)) return null;
  const governedSpeed = positive(profile.combatSpeed, 0);
  if (!(governedSpeed > 0)) return null;

  const boostMult = input.boost ? positive(profile.boostSpeedMult, 1.55) : 1;
  const baseCap = input.throttle * governedSpeed * boostMult;
  // The tag is supplied only for a real tether/self-sling exit. It cannot create overspeed:
  // from below the ordinary cap, baseCap remains the target. From above it, the moving target
  // decays exponentially, preserving the spectacle while still spending the earned velocity.
  const physicsEarned = !!input.physicsEarnedMomentum && localVelocity.forward > baseCap;
  const decayTauS = positive(input.earnedMomentumDecayTauS, 6);
  const earnedCap = physicsEarned
    ? localVelocity.forward * Math.exp(-Math.max(0, finite(dt, 0)) / decayTauS)
    : baseCap;
  // Travel drive (D5). A third axis, orthogonal to the assist regime and to who is holding the
  // stick: it raises the *cap* along a ramp and never touches thruster authority, so assisted /
  // drift / newtonian keep their existing meanings and `route-follower + assisted + engaged` is
  // simply autopilot cruise. The governor is shaped here, never bypassed.
  //
  // Note the ramp cap is only consulted while there is throttle — this function has already
  // returned null otherwise. That is correct rather than a gap: with no throttle the governor
  // expresses no opinion at all, so a cap that is not applied is indistinguishable from no cap,
  // and the coasting ship is carried by the existing earned-momentum decay instead.
  const burn = travelFlag('travelBurn')
    ? advanceTravelDrive(normalizeTravelDrive(input.travelDrive), profile, baseCap, localVelocity.forward, dt)
    : null;
  const cap = Math.max(baseCap, earnedCap, burn ? burn.cap : 0);
  const err = cap - localVelocity.forward;
  const responseS = positive(settings.governorResponseS, 0.9);
  const overspeedBrake = limits.reverse * clamp(finite(settings.overspeedBrakeFraction, 0.25), 0, 1);
  // RC-4. Above the cap with boost held, the shipped governor commanded *real reverse thrust*:
  // on `drive_reaction_m` at 400 WU/s against a cap of 302.25 it drove manualLocal.forward to
  // -6.24 m/s² — precisely `-reverseAccel 26 × overspeedBrakeFraction 0.24`, i.e. identical to
  // the unboosted brake — while boost energy drained. Held boost therefore made the ship slower.
  // Boost must read as "holding what I have", never as a hidden anchor, so above the cap its
  // floor rises to coast. The UNBOOSTED overspeed brake is deliberate governor behaviour and is
  // untouched; this only ever relaxes a command that was pulling backwards.
  const brakeFloor = travelFlag('boostNeverBrakes') && input.boost && err < 0 ? 0 : -overspeedBrake;
  const governed = clamp(err / responseS, brakeFloor, manualLocal.forward);
  const engaged = governed < manualLocal.forward - EPS;
  manualLocal.forward = governed;
  const telemetry = {
    cap,
    baseCap,
    engaged,
    overspeed: err < 0,
    // A decaying travel cap IS earned momentum being spent. Reporting it here keeps one honest
    // answer to "is the ship above its ordinary cap on purpose?" no matter which mechanism —
    // tether sling or travel burn — earned the excess.
    physicsEarned: physicsEarned || !!(burn && burn.physicsEarnedMomentum),
  };
  // Shape gate, not just a behaviour gate. With the axis off this object must be byte-identical
  // to HEAD — otherwise the frozen kernel baseline and the 47a hash both move with the drive
  // parked at Off, which is the failure mode that makes "flags-off is a no-op" untrue.
  if (burn) {
    telemetry.travel = {
      state: burn.state,
      // Carried ramp state: the input owner feeds this straight back as `travelDrive.cap`.
      cap: burn.cap,
      ceiling: burn.ceiling,
      ramping: burn.ramping,
      // Disengage spends earned velocity through the existing decay rather than confiscating it.
      earned: burn.physicsEarnedMomentum,
    };
  }
  return telemetry;
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
      coastHelm: !!yaw.coastHelm,
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
    : computeHeadingControl(body, desiredHeading, profile, dt, input);

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
      coastHelm: !!yaw.coastHelm,
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
  const governor = applySpeedGovernor(manualLocal, input, limits, localVelocity, effective, dt);
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
      coastHelm: !!yaw.coastHelm,
      desiredHeading: null,
      governor,
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
      coastHelm: !!yaw.coastHelm,
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
  const earnedAssistScale = input.physicsEarnedMomentum && !input.brake && !forceBrake
    ? clamp(finite(input.earnedMomentumAssistScale, 1), 0, 1)
    : 1;
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
    else fraction *= Math.min(clamp(finite(input.coastAssistScale, 1), 0, 1), earnedAssistScale);

    forward = -localVelocity.forward / horizon * fraction;
    lateral = -localVelocity.lateral / horizon * fraction;
    reason = input.brake || forceBrake ? 'pilot-brake' : 'neutral-counterthrust';
  } else if (mode !== 'newtonian') {
    const lateralFraction = (mode === 'drift'
      ? positive(settings.lateralKillFraction, 0.3) * 0.35
      : positive(settings.lateralKillFraction, 0.3)) * earnedAssistScale;
    lateral = -localVelocity.lateral / Math.max(0.25, positive(settings.stopHorizonS, 2.8)) * lateralFraction;

    // A tiny commanded-axis damper suppresses numerical chatter while preserving
    // the core maneuver: rotate the nose while momentum keeps carrying the ship.
    const axisDamping = positive(settings.commandedAxisDamping, 0.06) * earnedAssistScale;
    if (Math.abs(input.throttle) <= deadInput) forward = -localVelocity.forward * axisDamping;
    reason = 'slip-assist';
  }

  const deadSpeed = positive(settings.deadSpeed, 0.18);
  if (Math.abs(localVelocity.forward) < deadSpeed && Math.abs(input.throttle) <= deadInput) forward = 0;
  if (Math.abs(localVelocity.lateral) < deadSpeed && Math.abs(input.strafe) <= deadInput) lateral = 0;

  const local = clampLocalAcceleration({ forward, lateral }, limits);
  return { accel: localToWorld(local, axes), local, reason };
}

/**
 * Coast helm: idle main drive frees RCS for a ~20% yaw authority bump.
 * Gated on throttle + boost only — strafe is RCS and must not cancel the flip bonus.
 */
function coastHelmYawMultiplier(input, profile) {
  const dead = positive(profile.assist && profile.assist.deadInput, 0.025);
  if (Math.abs(finite(input.throttle, 0)) > dead) return 1;
  if (input.boost) return 1;
  return COAST_HELM_YAW_MULT;
}

function computeYawControl(body, input, profile, dt) {
  const mode = normalizeAssistMode(input.assistMode);
  const turn = clamp(finite(input.turn, 0), -1, 1);
  if (mode === 'newtonian' && Math.abs(turn) < 0.001) {
    return { targetYawRate: body.angVel, angularAcceleration: 0, coastHelm: false };
  }
  const helm = coastHelmYawMultiplier(input, profile);
  const targetYawRate = turn * positive(profile.maxYawRate, 2.5) * helm;
  const error = targetYawRate - body.angVel;
  const accelerating = Math.abs(targetYawRate) > Math.abs(body.angVel) && Math.sign(targetYawRate) === Math.sign(error);
  const maxAlpha = accelerating
    ? positive(profile.yawAccel, 8) * helm
    : positive(profile.yawBrake, positive(profile.yawAccel, 8) * 1.4) * helm;
  const angularAcceleration = clamp(error / Math.max(dt, 1 / 120), -maxAlpha, maxAlpha);
  return { targetYawRate, angularAcceleration, coastHelm: helm > 1 };
}

function computeHeadingControl(body, desiredHeading, profile, dt, input = null) {
  const helm = input ? coastHelmYawMultiplier(input, profile) : COAST_HELM_YAW_MULT;
  const error = wrapAngle(desiredHeading - body.rot);
  const maxRate = positive(profile.maxYawRate, 2) * helm;
  const targetYawRate = clamp(error * 3.8, -maxRate, maxRate);
  const rateError = targetYawRate - body.angVel;
  const angularAcceleration = clamp(
    rateError / Math.max(dt, 1 / 120),
    -positive(profile.yawBrake, 9) * helm,
    positive(profile.yawAccel, 7) * helm
  );
  return { targetYawRate, angularAcceleration, coastHelm: helm > 1 };
}

function reactionLimits(profile, boostMult) {
  return {
    forward: positive(profile.mainAccel, 40) * positive(boostMult, 1),
    reverse: positive(profile.reverseAccel, positive(profile.mainAccel, 40) * 0.5),
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
  const result = {
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
  // Travel-drive publication (D5), FLAT and at the top level of telemetry rather than nested
  // under `governor`. The nesting was the obvious place, but `governor` is null for the
  // ungoverned families and whenever throttle sits below `deadInput` — so a nested V-MAX would
  // vanish from the HUD at exactly the moment the pilot lets off the stick, which is when a
  // pilot most wants to read the ceiling. Flat keeps one stable address for the tape.
  //
  // Shape-gated, like the governor block: with the axis off, not one key is attached, so a drive
  // parked at Off leaves this result byte-identical to HEAD.
  if (travelFlag('travelBurn')) {
    const t = result.telemetry;
    const advanced = t.governor && t.governor.travel;
    const drive = input.travelDrive || { state: 'off', cap: 0 };
    // Prefer the governor's advanced values when it ran this tick; otherwise report the carried
    // input state and the drive's static ceiling, so the readout stays truthful rather than absent.
    t.travelDrive = advanced ? advanced.state : drive.state;
    t.travelCap = advanced ? advanced.cap : Math.max(0, finite(drive.cap, 0));
    t.travelCeiling = advanced ? advanced.ceiling : resolveTravelCeiling(profile);
  }
  return result;
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
    physicsEarnedMomentum: !!input.physicsEarnedMomentum,
    earnedMomentumDecayTauS: positive(input.earnedMomentumDecayTauS, 6),
    earnedMomentumAssistScale: clamp(finite(input.earnedMomentumAssistScale, 1), 0, 1),
    coastAssistScale: clamp(finite(input.coastAssistScale, 1), 0, 1),
    assistMode: normalizeAssistMode(input.assistMode || input.flightMode),
    // Travel-drive axis (D5). Normalized unconditionally because this object is rebuilt from
    // scratch and an un-listed key would be dropped before the governor ever saw it. Purely
    // internal: `makeResult` emits nothing from the normalized input except `assistMode`, and
    // the drive rides the input packet rather than the serialized runtime, so it adds nothing to
    // the saved propulsion state and cannot reach a save file.
    travelDrive: normalizeTravelDrive(input.travelDrive),
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
