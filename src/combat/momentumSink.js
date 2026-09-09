import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { MOMENTUM_SINK_STATUS_ID } from '../data/combatDefs.js';
import { appendCombatTrace } from './trace.js';

export const MOMENTUM_SINK_FRAME_KIND = 'attacker_velocity';

// The sink can remove at most 36 wu/s of relative velocity per second from a light body. Authored
// mass adds explicit resistance; effective Pinned/Unmoored mass then composes naturally at Rapier.
export const MOMENTUM_SINK_TUNING = Object.freeze({
  maxAcceleration: 36,
  referenceMass: 40,
  minMassResponse: 0.25,
  deadbandSpeed: 0.25,
});

/**
 * Queue one bounded impulse opposing target velocity relative to the status attacker's frame.
 * The caller supplies a retained scratch vector so the combat tick allocates only at the existing
 * physics-command membrane. This function never writes velocity, controls, facing, or speed caps.
 */
export function applyMomentumSink(state, target, runtime, dt, scratchImpulse) {
  const active = runtime && runtime.statuses && runtime.statuses[MOMENTUM_SINK_STATUS_ID];
  const tick = Number.isInteger(state && state.tick) ? state.tick : 0;
  if (!active || active.expiresTick <= tick || !target || !scratchImpulse) return false;

  const frameVelocity = resolveFrameVelocity(state, target, active);
  if (!frameVelocity) return false;
  const massScale = positive(runtime.physicsResponse && runtime.physicsResponse.massScale, 1);
  if (!fillMomentumSinkImpulse(scratchImpulse, target.vel, frameVelocity, authoredMass(target), dt, massScale)) {
    return false;
  }
  return queuePhysicsImpulse(target, scratchImpulse);
}

/** Pure, allocation-free impulse planner used by the runtime and focused physics proofs. */
export function fillMomentumSinkImpulse(
  out,
  targetVelocity,
  frameVelocity,
  mass,
  dt,
  effectiveMassScale = 1,
  tuning = MOMENTUM_SINK_TUNING,
) {
  if (!out) return false;
  out.x = 0;
  out.y = 0;
  out.z = 0;

  const step = Number(dt);
  const authored = positive(mass, 1);
  if (!(step > 0) || !Number.isFinite(step)) return false;

  const relativeX = finite(targetVelocity && targetVelocity.x) - finite(frameVelocity && frameVelocity.x);
  const relativeZ = finite(targetVelocity && targetVelocity.z) - finite(frameVelocity && frameVelocity.z);
  const relativeSpeed = Math.hypot(relativeX, relativeZ);
  const deadband = Math.max(0, finite(tuning && tuning.deadbandSpeed));
  if (!(relativeSpeed > deadband)) return false;

  const referenceMass = positive(tuning && tuning.referenceMass, 1);
  const minResponse = clamp(finite(tuning && tuning.minMassResponse, 0.25), 0, 1);
  const massResponse = clamp(Math.sqrt(referenceMass / authored), minResponse, 1);
  const maxAuthoredDeltaV = positive(tuning && tuning.maxAcceleration, 0) * massResponse * step;
  if (!(maxAuthoredDeltaV > 0)) return false;

  // The impulse is authored against base mass so Pinned/Unmoored still change physical response.
  // Cap against effective mass as well so an Unmoored body cannot overshoot through the frame.
  const responseScale = positive(effectiveMassScale, 1);
  const deltaV = Math.min(maxAuthoredDeltaV, relativeSpeed * responseScale);
  const impulseMagnitude = authored * deltaV;
  out.x = -(relativeX / relativeSpeed) * impulseMagnitude;
  out.z = -(relativeZ / relativeSpeed) * impulseMagnitude;
  return true;
}

function resolveFrameVelocity(state, target, active) {
  let data = active.data;
  if (!data || typeof data !== 'object' || data.frameKind !== MOMENTUM_SINK_FRAME_KIND) {
    data = active.data = {
      frameKind: MOMENTUM_SINK_FRAME_KIND,
      frameReady: false,
      frameVelocity: { x: 0, z: 0 },
    };
  } else if (!data.frameVelocity || typeof data.frameVelocity !== 'object') {
    data.frameVelocity = { x: 0, z: 0 };
    data.frameReady = false;
  }

  const attacker = active.attackerId == null || !state.entities || !state.entities.get
    ? null
    : state.entities.get(active.attackerId);
  if (attacker && attacker.alive !== false && attacker.vel) {
    data.frameVelocity.x = finite(attacker.vel.x);
    data.frameVelocity.z = finite(attacker.vel.z);
    data.frameReady = true;
    if (data.boundAppliedTick !== active.appliedTick) {
      data.boundAppliedTick = active.appliedTick;
      appendCombatTrace(state.combat, state.tick, 'momentumSink.frameBound', {
        actorId: active.attackerId,
        targetId: target.id,
        frameKind: data.frameKind,
        frameVelocity: { x: data.frameVelocity.x, z: data.frameVelocity.z },
      });
    }
  }
  return data.frameReady === true ? data.frameVelocity : null;
}

function authoredMass(entity) {
  return positive(entity && entity.physicsBody && entity.physicsBody.mass,
    positive(entity && entity.mass, 1));
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
