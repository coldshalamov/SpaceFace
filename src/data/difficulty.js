// Player-facing run difficulty. Arcade Core difficulty changes encounter composition/cadence,
// enemy aim error, and economic generosity. It never changes authored hull, weapon, or damage
// values: Plan 11's fixed-stat contract stays true at every preset.

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));

function profile(fields) {
  return Object.freeze({
    playerOutgoingDamage: 1,
    playerIncomingDamage: 1,
    ...fields,
  });
}

export const DIFFICULTY_PROFILES = Object.freeze({
  // Stable internal ids preserve old saves; Settings presents these as Story and Pilot.
  casual: profile({
    id: 'casual', label: 'Story', encounterPressure: 0.70, enemyAccuracy: 0.65,
    economyEase: 1.30, ironman: false,
  }),
  standard: profile({
    id: 'standard', label: 'Pilot', encounterPressure: 1.0, enemyAccuracy: 1.0,
    economyEase: 1.0, ironman: false,
  }),
  veteran: profile({
    id: 'veteran', label: 'Veteran', encounterPressure: 1.15, enemyAccuracy: 1.10,
    economyEase: 0.90, ironman: false,
  }),
  ironman: profile({
    id: 'ironman', label: 'Ironman', encounterPressure: 1.30, enemyAccuracy: 1.20,
    economyEase: 0.82, ironman: true,
  }),
});

export const DIFFICULTY_PRESET_OPTIONS = Object.freeze([
  Object.freeze(['casual', 'Story']),
  Object.freeze(['standard', 'Pilot']),
  Object.freeze(['veteran', 'Veteran']),
  Object.freeze(['ironman', 'Ironman']),
]);

export function difficultyPresetValues(id) {
  const row = DIFFICULTY_PROFILES[id] || DIFFICULTY_PROFILES.standard;
  return {
    difficulty: row.id,
    encounterPressure: row.encounterPressure,
    enemyAccuracy: row.enemyAccuracy,
    economyEase: row.economyEase,
    ironman: row.ironman,
  };
}

function gameplaySettings(state) {
  return state && state.settings && state.settings.gameplay || {};
}

export function difficultyProfile(state) {
  const gameplay = gameplaySettings(state);
  const base = DIFFICULTY_PROFILES[gameplay.difficulty] || DIFFICULTY_PROFILES.standard;
  return {
    ...base,
    encounterPressure: Number.isFinite(gameplay.encounterPressure)
      ? clamp(gameplay.encounterPressure, 0.60, 1.40) : base.encounterPressure,
    enemyAccuracy: Number.isFinite(gameplay.enemyAccuracy)
      ? clamp(gameplay.enemyAccuracy, 0.50, 1.25) : base.enemyAccuracy,
    economyEase: Number.isFinite(gameplay.economyEase)
      ? clamp(gameplay.economyEase, 0.75, 1.50) : base.economyEase,
    ironman: gameplay.ironman === true || base.ironman === true,
  };
}

export function difficultyEncounterPressure(state) {
  return difficultyProfile(state).encounterPressure;
}

export function difficultyEncounterDelayScale(state) {
  return 1 / difficultyEncounterPressure(state);
}

export function difficultyEnemyAimErrorDeg(state) {
  // Authored weapon spread remains the floor; lower accuracy adds a small deterministic error
  // without touching damage, rate of fire, or projectile speed.
  return Math.max(0, (1.20 - difficultyProfile(state).enemyAccuracy) * 2.5);
}

export function difficultyEconomyRewardScale(state) {
  return difficultyProfile(state).economyEase;
}

export function ironmanEnabled(state) {
  return difficultyProfile(state).ironman === true;
}

/**
 * Compatibility entrypoint for the combat damage router. Every preset intentionally returns one:
 * difficulty now comes from pressure and accuracy, never effective HP or player damage inflation.
 */
export function difficultyDamageScale(_state, _attackerId, _targetId) {
  return 1;
}
