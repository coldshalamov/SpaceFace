// Endless continuation helpers (PQ-133.10b).
// Ruleset-only: never adds keys to run state. Changing run.ruleset to 'endless'
// during the wave-30 refit is the explicit continue choice (no UI).

import { SURVIVAL_ARC_LENGTH } from '../data/survivalActs.js';
import { SURVIVAL_ENDLESS_START_WAVE, SURVIVAL_ENDLESS_WAVE_MAX } from '../data/survivalWaves.js';

export { SURVIVAL_ENDLESS_START_WAVE, SURVIVAL_ENDLESS_WAVE_MAX };

export function isEndlessRuleset(ruleset) {
  return ruleset === 'endless';
}

/**
 * Opt in to unbounded waves from the wave-30 refit. Returns false if the run
 * is not in that window. Does not add run keys; ruleset is the existing field.
 */
export function continueSurvivalEndless(state) {
  const run = state && state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return false;
  if (run.kind !== 'survival') return false;
  if (run.phase !== 'refit') return false;
  if (!Number.isInteger(run.wave) || run.wave < SURVIVAL_ARC_LENGTH) return false;
  run.ruleset = 'endless';
  return true;
}
