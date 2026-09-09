// Swarm ruleset helpers (PQ-135).
//
// Ruleset-only, exactly like survivalEndless.js and survivalCircuit.js: it never adds a key to run
// state. `run.ruleset === 'swarm'` is the whole switch, and every question the phase machine needs
// to ask about a swarm run is answered here from the wave number.

import {
  SWARM_CLEANUP_TICKS,
  SWARM_DRAFT_EVERY,
  SWARM_REFIT_EVERY,
  SWARM_RULESET,
  SWARM_WAVE_MAX,
  isSwarmBossWave,
  isSwarmDraftWave,
  isSwarmRefitWave,
} from '../data/swarmMode.js';

export {
  SWARM_CLEANUP_TICKS,
  SWARM_DRAFT_EVERY,
  SWARM_REFIT_EVERY,
  SWARM_RULESET,
  SWARM_WAVE_MAX,
  isSwarmBossWave,
  isSwarmDraftWave,
  isSwarmRefitWave,
};

export function isSwarmRuleset(ruleset) {
  return ruleset === SWARM_RULESET;
}

/**
 * Does this wave end in a menu?
 *
 * The arc opens a draft after EVERY wave, which is the single biggest reason it does not read as a
 * swarm game: you never fight twice in a row. Here the answer is no four times out of five — the
 * run goes cleanup -> (auto-resolved draft) -> next wave with nothing to click.
 */
export function swarmWaveEndsInMenu(wave) {
  return isSwarmDraftWave(wave) || isSwarmRefitWave(wave);
}
