// Deterministic first-flight drill contract. Kept data-only so onboarding, checks, and future
// replay probes share one order without teaching stale physical keys.

export const FLIGHT_DRILL_SPEED_WU = 40;
export const FLIGHT_DRILL_BRAKE_WU = 10;
export const FLIGHT_DRILL_MARKER_RANGE_WU = 230;
export const FLIGHT_DRILL_DISENGAGE_RANGE_WU = 900;
export const FLIGHT_DRILL_BURST_SHOTS = 3;
export const FLIGHT_DRILL_HEAT_RECOVER_FRAC = 0.12;

export const FLIGHT_DRILL_BEATS = Object.freeze([
  Object.freeze({
    key: 'thrust',
    line: 'Thrust until speed passes forty.',
    done: 'speedUp',
  }),
  Object.freeze({
    key: 'brake',
    line: 'Brake below ten.',
    done: 'speedDown',
  }),
  Object.freeze({
    key: 'marker',
    line: 'Follow the amber diamond to the trainer.',
    done: 'trainerRange',
  }),
  Object.freeze({
    key: 'focus',
    line: 'Hold course. Let the trainer cross your bow.',
    done: 'flybyFocus:start',
  }),
  Object.freeze({
    key: 'tether',
    line: 'Latch it. Massline.',
    followups: Object.freeze([
      Object.freeze({ on: 'tether:latched', line: 'Winch in. Hold tether to reel.' }),
      Object.freeze({ on: 'tether:reel', line: 'Cut and coast. Tap tether to cut.' }),
    ]),
    done: 'tether:released',
  }),
  Object.freeze({
    key: 'burst',
    line: 'Fire a short burst into the trainer.',
    followups: Object.freeze([
      Object.freeze({ on: 'burst:ready', line: 'Release. Let the heat bar clear.' }),
    ]),
    done: 'burstCooled',
  }),
  Object.freeze({
    key: 'disengage',
    line: 'Thrust away until the trainer leaves scope.',
    done: 'disengaged',
  }),
]);

export function isTrainingActor(entity) {
  return !!(entity && entity.data && entity.data.onboardingTraining === true);
}

export function maxWeaponHeatFraction(player) {
  const weapons = player && player.data && player.data.weapons;
  if (!Array.isArray(weapons)) return 0;
  let max = 0;
  for (const weapon of weapons) {
    const heat = Number(weapon && weapon._heat);
    const heatMax = Number(weapon && weapon.heatMax);
    if (!Number.isFinite(heat) || !Number.isFinite(heatMax) || heatMax <= 0) continue;
    max = Math.max(max, heat / heatMax);
  }
  return max;
}
