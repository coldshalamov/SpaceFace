// Deterministic PQ-017 public-control trajectory predictor.
//
// This is deliberately smaller than the real closed-loop harness. It reuses the shipped propulsion
// kernel and starter drive profile so the public route can synchronously preflight the displacement
// created by the shipped Pilot actions, while the headless Rapier harness verifies that this
// conservative prediction contains the authority-owned trajectory.

import { MAX_CATCHUP_STEPS } from '../../src/core/loop.js';
import { SIM_DT } from '../../src/core/sim.js';
import {
  createPropulsionRuntime,
  stepPropulsion,
} from '../../src/core/flight/propulsionKernel.js';
import { PROPULSION_PROFILES } from '../../src/core/flight/propulsionCatalog.js';
import { projectPilotFlightControls } from '../../src/systems/input.js';

const BRAKE_MINIMUM_REDUCTION = 0.6;
const BRAKE_MINIMUM_SPEED = 0.5;
const BRAKE_MAX_TICKS = 12;
const BRAKE_RECOVERY_TICKS = 12;
const STARTER_DRIVE_ID = 'drive_reaction_m';
const PRECISION_BRAKE_STOP_MAX_TICKS = 600;
export const PQ017_PRECISION_BRAKE_KEY = 'Digit0';

// A loaded callback can observe up to MAX_CATCHUP_STEPS fixed ticks at once. The physical brake
// contract already permits twelve ticks before release; add only the remainder of one catch-up
// batch to cover a release edge that lands immediately after the predicate was sampled.
export const PQ017_CONTROL_RESPONSE_TICKS = BRAKE_MAX_TICKS + MAX_CATCHUP_STEPS - 1;

export const PQ017_CONTROL_BATCH_PROFILES = Object.freeze([
  Object.freeze({
    id: 'single-tick',
    observationBatchTicks: 1,
    sampleTicks: 1,
    releaseJitterTicks: 0,
  }),
  Object.freeze({
    id: 'nominal-catchup',
    observationBatchTicks: Math.max(1, Math.ceil(MAX_CATCHUP_STEPS / 2)),
    sampleTicks: Math.max(1, Math.ceil(PQ017_CONTROL_RESPONSE_TICKS / 2)),
    releaseJitterTicks: Math.max(0, Math.ceil(MAX_CATCHUP_STEPS / 2) - 1),
  }),
  Object.freeze({
    id: 'loaded-catchup',
    observationBatchTicks: MAX_CATCHUP_STEPS,
    sampleTicks: PQ017_CONTROL_RESPONSE_TICKS,
    releaseJitterTicks: MAX_CATCHUP_STEPS - 1,
  }),
]);

export const PQ017_RELEASED_LOCAL_BATCH_PROFILES = Object.freeze([1, 2, 4].map((ticks) => (
  Object.freeze({
    id: `released-local-${ticks}-tick`,
    observationBatchTicks: ticks,
    sampleTicks: ticks,
    releaseJitterTicks: 0,
    exactControlTicks: true,
  })
)));

export function pq017PrecisionBrakeTargetProjection(
  startSpeed,
  minimumSpeed = BRAKE_MINIMUM_SPEED,
) {
  const speed = finite(startSpeed);
  const floor = finite(minimumSpeed);
  if (speed == null || speed < 0 || floor == null || floor < 0) return null;
  return Math.max(
    floor,
    speed - Math.max(BRAKE_MINIMUM_REDUCTION, speed * 0.1),
  );
}

export function pq017PublicKeysForDecision(decision = {}) {
  const turn = Number(decision.appliedTurnDirection) > 0
    ? 1
    : Number(decision.appliedTurnDirection) < 0 ? -1 : 0;
  if (decision.action === 'precision-brake') {
    return Object.freeze({
      KeyW: false,
      KeyS: false,
      KeyA: false,
      KeyD: false,
      KeyQ: false,
      KeyE: false,
      ShiftLeft: false,
      [PQ017_PRECISION_BRAKE_KEY]: true,
    });
  }
  if (decision.action === 'brake') {
    return Object.freeze({
      KeyW: false,
      KeyS: true,
      KeyA: false,
      KeyD: false,
      KeyQ: false,
      KeyE: false,
      ShiftLeft: false,
      [PQ017_PRECISION_BRAKE_KEY]: false,
    });
  }
  if (decision.action === 'approach' || decision.action === 'velocity-align'
      || decision.action === 'yaw' || decision.action === 'nudge') {
    return Object.freeze({
      KeyW: decision.action === 'nudge'
        || (decision.action === 'approach' && decision.thrust === true),
      KeyS: false,
      KeyA: turn < 0,
      KeyD: turn > 0,
      KeyQ: false,
      KeyE: false,
      ShiftLeft: false,
      [PQ017_PRECISION_BRAKE_KEY]: false,
    });
  }
  return Object.freeze({
    KeyW: false,
    KeyS: false,
    KeyA: false,
    KeyD: false,
    KeyQ: false,
    KeyE: false,
    ShiftLeft: false,
    [PQ017_PRECISION_BRAKE_KEY]: false,
  });
}

export function projectPq017PilotKeyState(keys = {}) {
  const projected = projectPilotFlightControls({
    forward: keys.KeyW === true,
    reverse: keys.KeyS === true,
    brakeHeld: keys[PQ017_PRECISION_BRAKE_KEY] === true,
    yawLeft: keys.KeyA === true,
    yawRight: keys.KeyD === true,
    strafeLeft: keys.KeyQ === true,
    strafeRight: keys.KeyE === true,
    boost: keys.ShiftLeft === true,
  });
  return {
    moveX: projected.moveX,
    moveZ: projected.moveZ,
    turnIntent: projected.turnIntent,
    boost: projected.boost,
    brake: projected.brake,
    assistMode: 'assisted',
  };
}

export function predictPq017PublicControlTrajectory(
  navigation = {},
  decision = {},
  batchProfile = PQ017_CONTROL_BATCH_PROFILES.at(-1),
  {
    driveId = STARTER_DRIVE_ID,
    fixedDt = SIM_DT,
    mass = 1,
    inertia = 1,
  } = {},
) {
  const px = finite(navigation.position?.x);
  const pz = finite(navigation.position?.z);
  const vx = finite(navigation.velocity?.x);
  const vz = finite(navigation.velocity?.z);
  const rotation = finite(navigation.rotation);
  const angularVelocity = finite(navigation.angularVelocity, 0);
  const dt = finite(fixedDt);
  const bodyMass = positive(mass, 1);
  const bodyInertia = positive(inertia, bodyMass);
  const profile = PROPULSION_PROFILES[driveId];
  const observationBatchTicks = positiveInteger(batchProfile?.observationBatchTicks, 1);
  const sampleTicks = positiveInteger(
    batchProfile?.sampleTicks,
    PQ017_CONTROL_RESPONSE_TICKS,
  );
  const releaseJitterTicks = nonNegativeInteger(batchProfile?.releaseJitterTicks, 0);
  if ([px, pz, vx, vz, rotation, angularVelocity, dt].some((value) => value == null)
      || !(dt > 0) || !profile) {
    return {
      safe: false,
      reason: 'public-control-trajectory-input-invalid',
      profileId: batchProfile?.id || null,
      keys: pq017PublicKeysForDecision({ action: 'invalid' }),
      trajectory: [],
    };
  }

  const keys = pq017PublicKeysForDecision(decision);
  const activeInput = projectPq017PilotKeyState(keys);
  const neutralInput = projectPq017PilotKeyState({});
  const initialSpeed = Math.hypot(vx, vz);
  const startUnit = initialSpeed > 1e-9
    ? { x: vx / initialSpeed, z: vz / initialSpeed }
    : { x: Math.cos(rotation), z: Math.sin(rotation) };
  const targetProjection = pq017PrecisionBrakeTargetProjection(initialSpeed);
  const state = {
    pos: { x: px, z: pz },
    vel: { x: vx, z: vz },
    rot: rotation,
    angVel: angularVelocity,
    mass: bodyMass,
    inertia: bodyInertia,
    runtime: createPropulsionRuntime(profile),
  };
  const trajectory = [sampleTrajectoryPoint(state, 0, 'initial', keys)];
  let tick = 0;

  const stepTicks = (count, input, phase, appliedKeys) => {
    for (let index = 0; index < count; index += 1) {
      const previousSample = trajectory.at(-1);
      const result = stepPropulsion({
        dt,
        body: state,
        input,
        profile,
        runtime: state.runtime,
      });
      state.runtime = result.runtime;
      state.vel.x += result.force.x / state.mass * dt;
      state.vel.z += result.force.z / state.mass * dt;
      state.angVel += result.torque.y / state.inertia * dt;
      state.rot = wrapAngle(state.rot + state.angVel * dt);
      state.pos.x += state.vel.x * dt;
      state.pos.z += state.vel.z * dt;
      tick += 1;
      const sample = sampleTrajectoryPoint(state, tick, phase, appliedKeys);
      trajectory.push(sample);
      if (typeof batchProfile?.continueWhile === 'function'
          && batchProfile.continueWhile(previousSample, sample) === false) {
        return false;
      }
    }
    return true;
  };

  if (decision.action === 'precision-brake' && batchProfile?.exactControlTicks === true) {
    stepTicks(sampleTicks, activeInput, 'control', keys);
  } else if (decision.action === 'precision-brake') {
    const targetSpeed = finite(decision.targetSpeed);
    const maxTicks = positiveInteger(
      batchProfile?.maxTicks,
      PRECISION_BRAKE_STOP_MAX_TICKS,
    );
    if (targetSpeed == null || targetSpeed < 0) {
      return {
        safe: false,
        reason: 'precision-brake-target-invalid',
        profileId: batchProfile?.id || null,
        keys,
        input: activeInput,
        trajectory,
      };
    }
    while (Math.hypot(state.vel.x, state.vel.z) > targetSpeed && tick < maxTicks) {
      stepTicks(1, activeInput, 'control', keys);
    }
  } else if (decision.action === 'brake' && batchProfile?.exactControlTicks === true) {
    stepTicks(sampleTicks, activeInput, 'control', keys);
  } else if (decision.action === 'brake') {
    let released = false;
    while (!released) {
      stepTicks(observationBatchTicks, activeInput, 'control', keys);
      const projection = state.vel.x * startUnit.x + state.vel.z * startUnit.z;
      released = projection <= targetProjection || tick >= BRAKE_MAX_TICKS;
      if (tick >= BRAKE_MAX_TICKS + MAX_CATCHUP_STEPS - 1) released = true;
    }
    if (releaseJitterTicks > 0) {
      stepTicks(releaseJitterTicks, activeInput, 'release-jitter', keys);
    }
    const endProjection = state.vel.x * startUnit.x + state.vel.z * startUnit.z;
    const endSpeed = Math.hypot(state.vel.x, state.vel.z);
    const reversed = endProjection <= 0;
    const noSignedProgress = initialSpeed - endProjection <= 0.001;
    const forceCoast = reversed || noSignedProgress || endSpeed >= initialSpeed;
    if (forceCoast) {
      stepTicks(BRAKE_RECOVERY_TICKS, neutralInput, 'neutral-recovery', {});
    }
  } else {
    stepTicks(sampleTicks, activeInput, 'control', keys);
  }

  return {
    safe: true,
    reason: null,
    profileId: batchProfile?.id || null,
    keys,
    input: activeInput,
    trajectory,
    ticks: tick,
    displacement: Math.hypot(state.pos.x - px, state.pos.z - pz),
    end: trajectory.at(-1),
  };
}

export function predictPq017PrecisionBrakeStopTrajectory(
  navigation = {},
  targetSpeed = 0.3,
  { maxTicks = PRECISION_BRAKE_STOP_MAX_TICKS } = {},
) {
  const target = finite(targetSpeed);
  const tickLimit = positiveInteger(maxTicks, PRECISION_BRAKE_STOP_MAX_TICKS);
  if (target == null || target < 0) {
    return {
      safe: false,
      reason: 'precision-brake-target-invalid',
      trajectory: [],
      ticks: 0,
      end: null,
      monotonicSpeedReduction: false,
      signedVelocityPreserved: false,
    };
  }
  const prediction = predictPq017PublicControlTrajectory(
    navigation,
    { action: 'precision-brake', appliedTurnDirection: 0, targetSpeed: target },
    {
      id: 'released-local-precision-stop',
      observationBatchTicks: 1,
      sampleTicks: 1,
      releaseJitterTicks: 0,
      exactControlTicks: false,
      maxTicks: tickLimit,
    },
  );
  const initial = prediction.trajectory[0];
  const initialSpeed = initial?.speed;
  const startUnit = Number.isFinite(initialSpeed) && initialSpeed > 1e-9
    ? {
      x: initial.velocity.x / initialSpeed,
      z: initial.velocity.z / initialSpeed,
    }
    : null;
  const monotonicSpeedReduction = prediction.trajectory.every((sample, index, trajectory) => (
    index === 0 || sample.speed <= trajectory[index - 1].speed + 1e-9
  ));
  const signedVelocityPreserved = startUnit == null || prediction.trajectory.every((sample) => (
    sample.velocity.x * startUnit.x + sample.velocity.z * startUnit.z > 0
  ));
  const reachedTarget = Number.isFinite(prediction.end?.speed)
    && prediction.end.speed <= target + 1e-9;
  const maximumDisplacement = prediction.trajectory.reduce((maximum, sample) => Math.max(
    maximum,
    Math.hypot(
      sample.position.x - initial.position.x,
      sample.position.z - initial.position.z,
    ),
  ), 0);
  return {
    ...prediction,
    safe: prediction.safe
      && reachedTarget
      && monotonicSpeedReduction
      && signedVelocityPreserved,
    reason: !prediction.safe
      ? prediction.reason
      : !reachedTarget
        ? 'precision-brake-stop-budget-exhausted'
        : !monotonicSpeedReduction
          ? 'precision-brake-speed-not-monotonic'
          : !signedVelocityPreserved
            ? 'precision-brake-signed-velocity-reversed'
            : null,
    targetSpeed: target,
    maximumDisplacement,
    monotonicSpeedReduction,
    signedVelocityPreserved,
  };
}

function sampleTrajectoryPoint(state, tick, phase, keys) {
  const forwardX = Math.cos(state.rot);
  const forwardZ = Math.sin(state.rot);
  return {
    tick,
    phase,
    position: { x: state.pos.x, z: state.pos.z },
    velocity: { x: state.vel.x, z: state.vel.z },
    rotation: state.rot,
    angularVelocity: state.angVel,
    speed: Math.hypot(state.vel.x, state.vel.z),
    localForwardVelocity: state.vel.x * forwardX + state.vel.z * forwardZ,
    keys,
  };
}

function wrapAngle(value) {
  let angle = value % (Math.PI * 2);
  if (angle <= -Math.PI) angle += Math.PI * 2;
  if (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  return Math.max(1, Math.trunc(positive(value, fallback)));
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}
