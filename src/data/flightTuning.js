export const FLIGHT_TUNING = Object.freeze({
  reverseThrustScale: 0.5,
  strafeThrustScale: 0.55,
  boostPool: Object.freeze({
    max: 100,
    drainRate: 38,
    regenRate: 22,
  }),
  boostThrustMult: 2.2,
  boostMaxSpeedMult: 2.0,
  normalMaxSpeedMult: 1.15,
});

// Hand-flown assisted flight: a continuous precision band below combat speed.
// These are fractions of each drive's combatSpeed, not a second speed limit.
// Counter-thrust is still bounded by the fitted (and possibly damaged) thrusters.
export const PRECISION_ASSIST_TUNING = Object.freeze({
  fullSpeedFraction: 0.18,
  fadeSpeedFraction: 0.42,
  responseS: 0.55,
});
