/**
 * Enemy Mind tuning, v1. Distances are world units; durations are SIMULATION SECONDS.
 * TUNE: these are starting values, not measured full-game balance. No HP/aim/DPS buffs.
 * Scheduling limits are work contracts, not difficulty sliders.
 */
export const ENEMY_MIND_TUNING = Object.freeze({
  maxPilots: 128,
  maxThinksPerUpdate: 8,
  maxContactReads: 64,
  maxRadioReads: 128,
  maxPeers: 8,
  maxEvents: 256,
  thinkInterval: 0.20,
  signalInterval: 0.20,
  radioLatency: 0.15,
  radioTTL: 1.4,
  radioRange: 1400,
  maxSensorAge: 0.30,
  maxMemoryAge: 1.1,
  minConfidence: 0.45,
  minCommit: 1.0,
  switchMargin: 0.13,
  telegraph: 0.45,
  offerDuration: 0.75,
  baitDuration: 2.8,
  baitCooldown: 7.0,
  flankDuration: 3.4,
  punishDuration: 1.45,
  coverDuration: 2.5,
  recoveryDuration: 1.7,
  panicDuration: 1.35,
  stubbornDuration: 1.1,
  preferredRange: 230,
  flankOffset: 190,
  breakDistance: 300,
  coverOffset: 90,
  arrivalRadius: 38,
  maxGoalDistance: 720,
  pursuitSpeed: 18,
  pursuitAlignment: 0.68,
  punishReach: 460,
  lowHull: 0.34,
  criticalHull: 0.13,
  panicFear: 0.79,
  withdrawFear: 0.66,
  recoverFear: 0.35,
  fearRise: 1.5,
  fearFall: 0.16,
  hitShock: 2.3,
  shockDecay: 0.46,
  threatWeight: 0.36,
  injuryWeight: 0.52,
  isolationWeight: 0.14,
  confidenceWeight: 0.15,
  allyCalm: 0.16,
  // TUNE: utility weights. Utilities need not sum to one.
  pressBase: 0.42,
  aggressionWeight: 0.18,
  fixationBonus: 0.12,
  occupiedLanePenalty: 0.50,
  flankBase: 0.40,
  teamworkWeight: 0.24,
  flankReadyBonus: 0.11,
  baitBase: 0.30,
  cunningWeight: 0.35,
  attentionBonus: 0.25,
  coverBase: 0.42,
  loyaltyWeight: 0.45,
  casualtyBonus: 0.30,
  punishBase: 0.80,
  withdrawBase: 0.22,
  survivalWeight: 0.88,
  retentionBonus: 0.06,
});

export const ENEMY_MIND_PROFILES = Object.freeze({
  crew: Object.freeze({ courage: 0.60, discipline: 0.68, loyalty: 0.68, cunning: 0.62, aggression: 0.60, patience: 0.62 }),
  raider: Object.freeze({ courage: 0.58, discipline: 0.48, loyalty: 0.47, cunning: 0.83, aggression: 0.76, patience: 0.43 }),
  veteran: Object.freeze({ courage: 0.78, discipline: 0.88, loyalty: 0.82, cunning: 0.78, aggression: 0.56, patience: 0.82 }),
  rookie: Object.freeze({ courage: 0.34, discipline: 0.28, loyalty: 0.58, cunning: 0.35, aggression: 0.76, patience: 0.28 }),
});

/** Fail loudly for misspelled knobs rather than silently shipping untunable behavior. */
export function resolveEnemyMindTuning(overrides = {}) {
  for (const key of Object.keys(overrides)) {
    if (!(key in ENEMY_MIND_TUNING)) throw new TypeError(`Unknown Enemy Mind tuning: ${key}`);
    if (!Number.isFinite(overrides[key]) || overrides[key] < 0) throw new RangeError(`Invalid Enemy Mind tuning: ${key}`);
  }
  const tuning = { ...ENEMY_MIND_TUNING, ...overrides };
  for (const key of ['maxPilots', 'maxThinksPerUpdate', 'maxContactReads', 'maxRadioReads', 'maxPeers', 'maxEvents']) {
    if (!Number.isInteger(tuning[key]) || tuning[key] < 1) throw new RangeError(`${key} must be a positive integer`);
  }
  for (const key of ['thinkInterval', 'signalInterval', 'radioLatency', 'radioTTL', 'maxSensorAge', 'maxMemoryAge', 'minCommit', 'maxGoalDistance']) {
    if (tuning[key] <= 0) throw new RangeError(`${key} must be positive`);
  }
  if (tuning.radioTTL <= tuning.radioLatency) throw new RangeError('radioTTL must exceed radioLatency');
  if (tuning.criticalHull >= tuning.lowHull) throw new RangeError('criticalHull must be below lowHull');
  return Object.freeze(tuning);
}
