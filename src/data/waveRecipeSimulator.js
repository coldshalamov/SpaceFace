// PQ-133.12 — wave-recipe simulator.
// Calls planWave. Does not reimplement the planner.

import { compileAttackSpec, describeAttackMetrics } from '../combat/attackSpec.js';
import { ATTACK_TRAIT_BY_ID } from '../data/attackTraits.js';
import { hashSemanticWavePlan, planWave } from '../systems/survivalWavePlanner.js';
import {
  estimateWaveRecipe,
  resolveFactoryText,
  validateFactoryModifier,
  validateFactoryRecipe,
} from '../contracts/contentFactory.js';
import { previewArenaModule } from './arenaModuleLibrary.js';

export function simulateWave(input) {
  const plan = planWave(input);
  const hash = hashSemanticWavePlan(plan);
  return { plan, hash };
}

export function simulateAuthoredRecipe(recipe, input = {}) {
  const validation = validateFactoryRecipe(recipe, { requireLoc: true });
  if (!validation.ok) {
    return { ok: false, stage: 'validate', validation, plan: null, hash: null, estimate: null };
  }
  const arenaId = recipe.arenaId;
  const wave = Number.isInteger(input.wave) ? input.wave : recipe.wave;
  const seed = Number.isInteger(input.seed) ? input.seed : 47;
  const sim = simulateWave({
    seed,
    arenaId,
    wave,
    recipe,
    act: input.act,
    difficulty: input.difficulty,
    mutators: input.mutators,
    buildSummary: input.buildSummary,
    mode: input.mode,
  });
  const arena = previewArenaModule(arenaId, recipe.arenaPhase);
  const estimate = estimateWaveRecipe(recipe, arena.ok ? arena.install : null);
  return {
    ok: sim.plan && sim.plan.ok !== false,
    stage: 'plan',
    validation,
    plan: sim.plan,
    hash: sim.hash,
    estimate,
    arena,
  };
}

export function plannerAgreement(input) {
  const direct = planWave(input);
  const simulated = simulateWave(input);
  const directHash = hashSemanticWavePlan(direct);
  return {
    ok: directHash === simulated.hash,
    directHash,
    simulatedHash: simulated.hash,
    firstDivergent: directHash === simulated.hash ? null : 'hash',
  };
}

export function previewModifier(trait, options = {}) {
  const validation = validateFactoryModifier(trait, { requireLoc: options.requireLoc !== false });
  const weaponId = options.weaponId || 'wpn_pulse_laser_s';
  const compiled = compileAttackSpec({
    weaponId,
    modifiers: [[trait && trait.id, 1]],
  });
  const loc = trait && trait.loc
    ? {
      summary: resolveFactoryText(trait.loc.summaryKey),
      detail: resolveFactoryText(trait.loc.detailKey),
    }
    : { summary: trait && trait.text && trait.text.summary, detail: trait && trait.text && trait.text.detail };
  return {
    ok: validation.ok && compiled.ok === true,
    validation,
    compiled,
    metrics: compiled.spec ? describeAttackMetrics(compiled.spec) : null,
    loc,
    knownToCompiler: !!(trait && ATTACK_TRAIT_BY_ID[trait.id]),
  };
}
