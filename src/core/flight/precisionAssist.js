import { PRECISION_ASSIST_TUNING } from '../../data/flightTuning.js';

/** Continuous authority for released axes while maneuvering by hand. */
export function precisionAssistWeight(speed, input, profile) {
  if (input.precisionAssist !== true || input.assistMode !== 'assisted'
      || input.brake || input.boost || input.physicsEarnedMomentum
      || input.travelDrive?.state === 'spooling' || input.travelDrive?.state === 'engaged') return 0;
  const combatSpeed = profile.combatSpeed;
  if (!(combatSpeed > 0) || !Number.isFinite(speed)) return 0;
  const start = combatSpeed * PRECISION_ASSIST_TUNING.fullSpeedFraction;
  const end = combatSpeed * PRECISION_ASSIST_TUNING.fadeSpeedFraction;
  const t = Math.max(0, Math.min(1, (speed - start) / (end - start)));
  return 1 - t * t * (3 - 2 * t);
}

/** Exact exponential response expressed as acceleration, never a velocity write. */
export function precisionCounterAcceleration(velocity, dt, profile) {
  const authored = profile.assist?.precisionResponseS;
  const horizon = Number.isFinite(authored) && authored > 0
    ? authored : PRECISION_ASSIST_TUNING.responseS;
  const step = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
  // This cannot reverse a released axis, even at an unusually long fixed step.
  return -velocity * -Math.expm1(-step / horizon) / step;
}
