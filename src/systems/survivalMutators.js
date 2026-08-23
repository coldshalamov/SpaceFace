// Challenge compiler for Crucible mutators and trials (PQ-133.10a).
//
// Mutators fold into the existing seed discipline: the launch seed is kept, the mutator
// list is a second deterministic input (sorted unique ids). Nothing here rolls a fresh
// seed or reads the wall clock. Same seed + same mutators => same compiled challenge
// and the same planner input.
//
// Not a registered tick. survivalRun stamps the compiled list onto run.arenaMutators.

import {
  SURVIVAL_MUTATOR_BY_ID,
  SURVIVAL_PHYSICS_VERBS,
  SURVIVAL_PLANNER_MUTATORS,
  SURVIVAL_TRIAL_BY_ID,
  SURVIVAL_TRIAL_BY_RULESET,
} from '../data/survivalMutators.js';
import { offerDraft } from '../data/survivalDraft.js';

const PLANNER_SET = new Set(SURVIVAL_PLANNER_MUTATORS);
const PHYSICS_SET = new Set(SURVIVAL_PHYSICS_VERBS);

let queued = null;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/** Sorted unique mutator ids. Unknown ids are kept (the planner ignores them; records still label them). */
export function normalizeMutators(mutators) {
  if (!Array.isArray(mutators)) return [];
  const seen = new Set();
  const out = [];
  for (const item of mutators) {
    const id = typeof item === 'string' ? item : (item && isNonEmptyString(item.id) ? item.id : null);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  out.sort();
  return out;
}

/**
 * Mix mutators into a derived uint32 without replacing the run seed.
 * Same idiom as draftStreamSeed / wavePlanStreamSeed.
 */
export function foldMutatorsIntoSeed(seed, mutators) {
  const n = Number.isInteger(seed) ? seed : 0;
  const label = `survival-mutator-v1|${normalizeMutators(mutators).join(',')}`;
  let h = (n >>> 0) ^ 0x9e3779b9;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  }
  return (h >>> 0) || 1;
}

function trialFromRuleset(ruleset) {
  if (!isNonEmptyString(ruleset)) return null;
  return SURVIVAL_TRIAL_BY_RULESET[ruleset] || SURVIVAL_TRIAL_BY_ID[ruleset] || null;
}

/**
 * Compile a launch challenge. Pure. The fingerprint is the only identity a record needs
 * besides the run seed; it does not become a new seed for the wave planner.
 */
export function compileChallenge(seed, mutators, ruleset = 'scored') {
  const trial = trialFromRuleset(ruleset);
  const implied = trial && Array.isArray(trial.impliedMutators) ? trial.impliedMutators : [];
  const all = normalizeMutators([...(Array.isArray(mutators) ? mutators : []), ...implied]);
  let skipDraft = trial ? trial.skipDraft === true : false;
  let skipReroll = false;
  let hullLocked = trial ? trial.hullLocked === true : false;
  let weaponLock = trial && trial.weaponLock ? trial.weaponLock : null;
  let physicsOnly = false;
  for (const id of all) {
    const def = SURVIVAL_MUTATOR_BY_ID[id];
    if (!def) continue;
    if (def.skipDraft) skipDraft = true;
    if (def.skipReroll) skipReroll = true;
    if (def.hullLocked) hullLocked = true;
    if (def.physicsOnly) physicsOnly = true;
    if (def.weaponLock && !weaponLock) weaponLock = def.weaponLock;
  }
  const plannerMutators = all.filter((id) => PLANNER_SET.has(id));
  const resolvedRuleset = isNonEmptyString(ruleset) ? ruleset : 'scored';
  const trialId = trial ? trial.id : null;
  const folded = foldMutatorsIntoSeed(seed, all);
  return Object.freeze({
    seed: (Number.isInteger(seed) ? seed : 0) >>> 0,
    ruleset: resolvedRuleset,
    trialId,
    mutators: Object.freeze(all.slice()),
    plannerMutators: Object.freeze(plannerMutators),
    skipDraft,
    skipReroll,
    hullLocked,
    weaponLock,
    physicsOnly,
    hullId: trial && trial.hullId ? trial.hullId : null,
    fingerprint: `${(Number.isInteger(seed) ? seed : 0) >>> 0}:${all.join(',')}:${resolvedRuleset}:${folded.toString(16)}`,
  });
}

export function challengeFromRun(run) {
  if (!run || typeof run !== 'object') return compileChallenge(0, [], 'scored');
  return compileChallenge(
    Number.isInteger(run.seed) ? run.seed : 0,
    run.arenaMutators,
    run.ruleset || 'scored',
  );
}

export function queueSurvivalChallenge(spec) {
  const src = spec && typeof spec === 'object' ? spec : {};
  const compiled = compileChallenge(src.seed, src.mutators, src.ruleset || src.trialId || 'scored');
  queued = {
    mutators: compiled.mutators.slice(),
    ruleset: compiled.ruleset,
    trialId: compiled.trialId,
  };
  return compiled;
}

export function peekQueuedChallenge() {
  if (!queued) return null;
  return {
    mutators: queued.mutators.slice(),
    ruleset: queued.ruleset,
    trialId: queued.trialId,
  };
}

export function takeQueuedChallenge() {
  const next = queued;
  queued = null;
  return next;
}

export function clearQueuedChallenge() {
  queued = null;
}

export function filterDraftOffers(offers, challenge) {
  if (!Array.isArray(offers)) return [];
  if (!challenge) return offers.slice();
  if (challenge.skipDraft || challenge.weaponLock === 'starting') return [];
  let out = offers.slice();
  if (challenge.physicsOnly) {
    out = out.filter((entry) => entry && PHYSICS_SET.has(entry.verb));
  }
  if (isNonEmptyString(challenge.weaponLock) && challenge.weaponLock !== 'starting') {
    out = out.filter((entry) => entry && entry.defId === challenge.weaponLock);
  }
  return out;
}

/** Same seed, hull, fittings, and challenge always yield the same three (or fewer) cards. */
export function offerDraftForChallenge(input, challenge) {
  const result = offerDraft(input);
  if (!result || result.ok === false) return result;
  return {
    ...result,
    offers: filterDraftOffers(result.offers, challenge),
  };
}

export function allowsReroll(challenge) {
  return !(challenge && challenge.skipReroll);
}

export function allowedHullIds(challenge, fallback = 'ship_kestrel') {
  if (challenge && isNonEmptyString(challenge.hullId)) return [challenge.hullId];
  return [fallback];
}
