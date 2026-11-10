// M-02 Boomerang Bomb Run. This is choreography tuning only; flightV3 and the canonical
// bombs/phaseBlink owners still resolve movement, ordnance, and phase adoption.
export const BOOMERANG_BOMB_RUN = Object.freeze({
  id: 'boomerang_bomb_run',
  moduleId: 'mod_boomerang_run',
  inputAction: 'bomb',
  // A full rear-side bank travels farther from the launch point than Veil's single charged
  // step. Reserve this sortie envelope up front and let phaseBlink price/certify it normally.
  returnMaxDistanceWu: 520,
  minTargetRangeWu: 72,
  maxTargetRangeWu: 320,
  maxStartSpeedWuS: 80,
  minApproachDot: 0.25,
  bankDurationS: 8,
  bankBoostStartS: 0.75,
  bankBoostDurationS: 1.5,
  attackRegionStartProgress: 0.55,
  startOrbitRadiusWu: 320,
  endOrbitRadiusWu: 92,
  arcRadians: Math.PI,
  maxFlightControl: 1,
  positionGain: 0.01,
  velocityGain: 0.008,
});

// M-08 Pinball Rush: a charged, committed physical dash. The existing flightV3 dash
// owns impulse/capacitor/cooldown; this row only bounds the target lane and charge window.
export const PINBALL_RUSH = Object.freeze({
  id: 'pinball_rush',
  moduleId: 'mod_pinball_rush',
  minTargetRangeWu: 38,
  maxTargetRangeWu: 300,
  minApproachDot: 0.65,
  minChargeS: 0.28,
  maxChargeS: 1.2,
  maxDashDurationS: 1.35,
  maxContactBodies: 5,
  maxDashImpulseScale: 1.5,
});
