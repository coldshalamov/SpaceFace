// Boss-circuit helpers (PQ-133.10b).
// Five consecutive authored bosses, compressed refits, no drafts.

import {
  SURVIVAL_BOSS_CIRCUIT,
  SURVIVAL_BOSS_CIRCUIT_LENGTH,
  SURVIVAL_LIVE_CIRCUIT_ARENAS,
} from '../data/survivalWaves.js';

export { SURVIVAL_BOSS_CIRCUIT, SURVIVAL_BOSS_CIRCUIT_LENGTH, SURVIVAL_LIVE_CIRCUIT_ARENAS };

export function isBossCircuitRuleset(ruleset) {
  return ruleset === 'boss_circuit';
}

export function circuitStepForWave(wave) {
  if (!Number.isInteger(wave) || wave < 1 || wave > SURVIVAL_BOSS_CIRCUIT_LENGTH) return null;
  return SURVIVAL_BOSS_CIRCUIT[wave - 1];
}
