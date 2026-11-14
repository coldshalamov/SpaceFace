// Read-only identity of the authored thirty-wave course. An ending label is not proof
// that a different mode completed this course; all reward/presentation readers share this gate.
import { SURVIVAL_ARC_LENGTH } from './survivalActs.js';

const COURSE_RULESETS = new Set(['scored', 'trial_one_hull', 'trial_one_weapon', 'swarm']);
// A mode stamp names the contract it belongs to. 'arc' is the scored arc's own label;
// every other stamp must name the ruleset the result claims, or the stamps disagree.
const COURSE_MODES = Object.freeze({
  scored: new Set(['arc', 'scored']),
  trial_one_hull: new Set(['arc', 'trial_one_hull']),
  trial_one_weapon: new Set(['arc', 'trial_one_weapon']),
  swarm: new Set(['swarm']),
});

export function isAuthoredCourse(result = {}, run = {}) {
  if (!result || !run || result.practice === true || run.practice === true) return false;
  if ((run.kind != null && run.kind !== 'survival')
    || (result.kind != null && result.kind !== 'survival')) return false;
  if (result.circuit != null || run.telemetry?.circuit != null
    || result.recordRules?.circuit != null || run.recordRules?.circuit != null) return false;
  const ruleset = result.ruleset ?? run.ruleset ?? result.recordRules?.mode ?? run.recordRules?.mode;
  if (!COURSE_RULESETS.has(ruleset)) return false;
  // A run and its result never disagree about which course was played; contradictory
  // stamps are evidence of a different contract, never permission to file under this one.
  if (result.ruleset != null && run.ruleset != null && result.ruleset !== run.ruleset) return false;
  const modes = COURSE_MODES[ruleset];
  for (const mode of [result.mode, result.recordRules?.mode, run.recordRules?.mode]) {
    if (mode != null && !(modes && modes.has(mode))) return false;
  }
  if (run.ruleset != null && !COURSE_RULESETS.has(run.ruleset)) return false;
  return true;
}

export function isAuthoredCourseVictory(result = {}, run = {}) {
  if (!isAuthoredCourse(result, run) || result.outcome !== 'victory') return false;
  for (const start of [result.startWave, run.telemetry?.startWave]) {
    if (start != null && start !== 1) return false;
  }
  // Entering the finale is not clearing it. The clear counter is committed by the
  // wave owner; deepestWave/wave are entry positions and cannot substitute for it.
  if (!Number.isInteger(result.wavesCleared) || result.wavesCleared < SURVIVAL_ARC_LENGTH) return false;
  if (result.lastRoundCleared != null && (!Number.isInteger(result.lastRoundCleared)
    || result.lastRoundCleared < SURVIVAL_ARC_LENGTH)) return false;
  return true;
}
