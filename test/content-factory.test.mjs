// PQ-133.12 — content factory: schemas, lint, loc, simulator/planner agreement, authored examples.
import test from 'node:test';
import assert from 'node:assert/strict';

import { compileAttackSpec, describeAttackMetrics } from '../src/combat/attackSpec.js';
import {
  CONTENT_FACTORY_BOUNDARY,
  FACTORY_SPAWN_DEFAULT_MAX,
  FACTORY_SPAWN_HARD_MAX,
  lintModifierPower,
  lintRecipeSpawn,
  resolveFactoryText,
  validateArenaModule,
  validateFactoryModifier,
  validateFactoryRecipe,
} from '../src/contracts/contentFactory.js';
import {
  ARENA_MODULE_LIBRARY,
  previewArenaModule,
  validateArenaModuleLibrary,
} from '../src/data/arenaModuleLibrary.js';
import {
  FACTORY_HARD_CAP_RECIPE,
  FACTORY_MODIFIER,
  FACTORY_OVER_CAP_RECIPE,
  FACTORY_WAVE_RECIPE,
} from '../src/data/contentFactoryExamples.js';
import { SURVIVAL_WAVES, peakConcurrentDemand } from '../src/data/survivalWaves.js';
import { hashSemanticWavePlan, planWave } from '../src/systems/survivalWavePlanner.js';
import {
  plannerAgreement,
  previewModifier,
  simulateAuthoredRecipe,
  simulateWave,
} from '../src/data/waveRecipeSimulator.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasRule(result, rule) {
  return (result.issues || []).some((item) => item.rule === rule || String(item.rule).startsWith(rule));
}

function hasPath(result, path) {
  return (result.issues || []).some((item) => item.path === path || String(item.path).startsWith(path));
}

test('factory modifier is in the live catalog and compiles without a kernel edit', () => {
  assert.ok(FACTORY_MODIFIER, 'mod_herald_fan must be registered in ATTACK_TRAITS');
  const validation = validateFactoryModifier(FACTORY_MODIFIER, { requireLoc: true });
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
  const baseline = compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers: [] });
  const fanned = compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers: [['mod_herald_fan', 1]] });
  assert.equal(baseline.ok, true, JSON.stringify(baseline.issues));
  assert.equal(fanned.ok, true, JSON.stringify(fanned.issues));
  const baseMetrics = describeAttackMetrics(baseline.spec);
  const fanMetrics = describeAttackMetrics(fanned.spec);
  assert.ok(fanMetrics.spreadDeg > baseMetrics.spreadDeg, 'herald fan must widen spread');
  assert.equal(fanMetrics.payloadScale, baseMetrics.payloadScale);
  assert.ok(fanMetrics.heatScale > baseMetrics.heatScale);
  const preview = previewModifier(FACTORY_MODIFIER, { requireLoc: true });
  assert.equal(preview.ok, true, JSON.stringify(preview.validation));
  assert.equal(preview.knownToCompiler, true);
  assert.match(preview.loc.summary, /cone|spread|widen/i);
});

test('factory wave recipe validates, estimates, and runs through planWave', () => {
  const validation = validateFactoryRecipe(FACTORY_WAVE_RECIPE, { requireLoc: true });
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
  const spawned = simulateAuthoredRecipe(FACTORY_WAVE_RECIPE, { seed: 47 });
  assert.equal(spawned.ok, true, JSON.stringify(spawned.validation));
  assert.equal(typeof spawned.hash, 'string');
  assert.equal(spawned.hash.length, 8);
  assert.equal(spawned.estimate.peakConcurrent, 8);
  assert.equal(spawned.estimate.withinDefaultCap, true);
  assert.ok(Array.isArray(spawned.plan.packages));
  assert.equal(spawned.plan.packages.reduce((sum, pkg) => sum + pkg.count, 0), 8);
  const loc = resolveFactoryText(FACTORY_WAVE_RECIPE.loc.summaryKey);
  assert.match(loc, /pincer/i);
});

test('validator rejects one input per factory/trait rule', () => {
  const base = clone(FACTORY_MODIFIER);
  const cases = [
    { doc: null, rule: 'type' },
    { doc: { ...base, id: 'herald' }, path: 'id' },
    { doc: { ...base, schemaVersion: 2 }, path: 'schemaVersion' },
    { doc: { ...base, name: '' }, path: 'name' },
    { doc: { ...base, tier: 'legendary' }, path: 'tier' },
    { doc: { ...base, family: 'soup' }, path: 'family' },
    { doc: { ...base, maxRank: 0 }, path: 'maxRank' },
    { doc: { ...base, compatibility: null }, path: 'compatibility' },
    { doc: { ...base, compatibility: { ...base.compatibility, emitters: ['laser'] } }, path: 'compatibility.emitters' },
    { doc: { ...base, compatibility: { ...base.compatibility, trajectories: ['spiral'] } }, path: 'compatibility.trajectories' },
    { doc: { ...base, stack: [] }, path: 'stack' },
    { doc: { ...base, stack: [{ mode: 'explode', target: 'emitter.spreadDeg', perRank: 1 }] }, path: 'stack[0].mode' },
    { doc: { ...base, stack: [{ mode: 'add', target: 'secret.field', perRank: 1 }] }, path: 'stack[0].target' },
    { doc: { ...base, stack: [{ mode: 'add', target: 'emitter.spreadDeg', perRank: Infinity }] }, path: 'stack[0].perRank' },
    { doc: { ...base, inheritance: { rootSiblings: true, splitChildren: 'maybe', chainChildren: false } }, path: 'inheritance.splitChildren' },
    { doc: { ...base, text: { summary: '', detail: 'x' } }, path: 'text.summary' },
    { doc: { ...base, loc: null }, rule: 'loc.object' },
    { doc: { ...base, loc: { summaryKey: '', detailKey: 'trait.mod_herald_fan.detail' } }, rule: 'loc.summaryKey' },
    { doc: { ...base, loc: { summaryKey: 'missing.key', detailKey: 'trait.mod_herald_fan.detail' } }, rule: 'loc.catalog' },
    {
      doc: {
        ...base,
        stack: [...base.stack, { mode: 'add', target: 'trajectory.speed', perRank: 40 }],
      },
      rule: 'powerAxis',
    },
    {
      doc: {
        ...base,
        stack: [...base.stack, { mode: 'mul', target: 'costs.payloadScale', perRank: 1.2 }],
      },
      rule: 'powerAxis',
    },
    {
      doc: { ...base, payload: [{ kind: 'damage', channels: { kinetic: 4 } }] },
      rule: 'powerAxis',
    },
  ];
  for (const item of cases) {
    const result = validateFactoryModifier(item.doc, { requireLoc: true });
    assert.equal(result.ok, false, `expected rejection for ${item.rule || item.path}`);
    if (item.rule) assert.ok(hasRule(result, item.rule), `rule ${item.rule} in ${JSON.stringify(result.issues)}`);
    if (item.path) assert.ok(hasPath(result, item.path), `path ${item.path} in ${JSON.stringify(result.issues)}`);
  }
});

test('validator rejects one input per recipe rule', () => {
  const base = clone(FACTORY_WAVE_RECIPE);
  const cases = [
    { doc: null, rule: 'type' },
    { doc: { ...base, id: '' }, path: 'id' },
    { doc: { ...base, schemaVersion: 9 }, path: 'schemaVersion' },
    { doc: { ...base, arenaId: 'not_an_arena' }, path: 'arenaId' },
    { doc: { ...base, wave: 0 }, path: 'wave' },
    { doc: { ...base, objective: {} }, path: 'objective' },
    { doc: { ...base, threatBudget: -1 }, path: 'threatBudget' },
    { doc: { ...base, arenaPhase: '' }, path: 'arenaPhase' },
    { doc: { ...base, packages: null }, path: 'packages' },
    { doc: { ...base, packages: ['nope'] }, path: 'packages[0]' },
    { doc: { ...base, packages: [{ ...base.packages[0], atTick: -1 }] }, path: 'packages[0].atTick' },
    { doc: { ...base, packages: [{ ...base.packages[0], gateGroup: 'up' }] }, path: 'packages[0].gateGroup' },
    { doc: { ...base, packages: [{ ...base.packages[0], role: 'boss' }] }, path: 'packages[0].role' },
    { doc: { ...base, packages: [{ ...base.packages[0], enemyId: 'dragon' }] }, path: 'packages[0].enemyId' },
    { doc: { ...base, packages: [{ ...base.packages[0], count: 0 }] }, path: 'packages[0].count' },
    { doc: { ...base, packages: [{ ...base.packages[0], batchSize: 99 }] }, path: 'packages[0].batchSize' },
    { doc: { ...base, completion: null }, path: 'completion' },
    { doc: { ...base, completion: { ...base.completion, requiredPackagesMaterialized: 'yes' } }, path: 'completion.requiredPackagesMaterialized' },
    { doc: { ...base, completion: { ...base.completion, cleanupTicks: -4 } }, path: 'completion.cleanupTicks' },
    { doc: { ...base, completion: { ...base.completion, blockingRolesResolved: ['ghost'] } }, path: 'completion.blockingRolesResolved' },
    { doc: { ...base, rewards: null }, path: 'rewards' },
    { doc: { ...base, rewards: { xp: -1, credits: 0 } }, path: 'rewards.xp' },
    { doc: { ...base, rewards: { xp: 0, credits: -1 } }, path: 'rewards.credits' },
    { doc: { ...base, loc: { summaryKey: '', detailKey: base.loc.detailKey } }, rule: 'loc.summaryKey' },
    { doc: { ...base, hull: 12 }, rule: 'powerAxis' },
  ];
  for (const item of cases) {
    const result = validateFactoryRecipe(item.doc, { requireLoc: true });
    assert.equal(result.ok, false, `expected rejection for ${item.rule || item.path}: ${JSON.stringify(result.issues)}`);
    if (item.rule) assert.ok(hasRule(result, item.rule), `rule ${item.rule} in ${JSON.stringify(result.issues)}`);
    if (item.path) assert.ok(hasPath(result, item.path), `path ${item.path} in ${JSON.stringify(result.issues)}`);
  }
});

test('spawn-cap lint refuses default-cap and hard-cap breaches', () => {
  assert.equal(FACTORY_SPAWN_DEFAULT_MAX, 24);
  assert.equal(FACTORY_SPAWN_HARD_MAX, 40);
  const over = lintRecipeSpawn(FACTORY_OVER_CAP_RECIPE);
  assert.equal(over.ok, false);
  assert.ok(hasRule(over, 'spawn.defaultCap'));
  assert.equal(over.peak, 25);
  const hard = lintRecipeSpawn(FACTORY_HARD_CAP_RECIPE);
  assert.equal(hard.ok, false);
  assert.ok(hasRule(hard, 'spawn.hardCap'));
  assert.equal(hard.peak, 41);
  const legal = lintRecipeSpawn(FACTORY_WAVE_RECIPE);
  assert.equal(legal.ok, true);
  const validated = validateFactoryRecipe(FACTORY_OVER_CAP_RECIPE, { requireLoc: true });
  assert.equal(validated.ok, false);
});

test('simulator matches planWave hashes across seeds and waves', () => {
  const seeds = [1, 47, 99, 12345];
  const waves = [1, 2, 5, 8, 10];
  for (const seed of seeds) {
    for (const wave of waves) {
      const input = { seed, arenaId: 'helios_core', wave };
      const agreed = plannerAgreement(input);
      assert.equal(agreed.ok, true, `mismatch seed=${seed} wave=${wave} ${agreed.directHash} ${agreed.simulatedHash}`);
      const plan = planWave(input);
      const sim = simulateWave(input);
      assert.equal(hashSemanticWavePlan(plan), sim.hash);
    }
  }
  const catalog = SURVIVAL_WAVES.find((row) => row.arenaId === 'helios_core' && row.wave === 1);
  const viaOverride = planWave({ seed: 47, arenaId: 'helios_core', wave: 1, recipe: catalog });
  const viaLookup = planWave({ seed: 47, arenaId: 'helios_core', wave: 1 });
  assert.equal(hashSemanticWavePlan(viaOverride), hashSemanticWavePlan(viaLookup));
});

test('arena module library names the four live laws and previews them', () => {
  const check = validateArenaModuleLibrary();
  assert.equal(check.ok, true, JSON.stringify(check.issues));
  assert.equal(ARENA_MODULE_LIBRARY.length, 4);
  const laws = ARENA_MODULE_LIBRARY.map((mod) => mod.law).sort();
  assert.deepEqual(laws, ['conduct', 'current', 'freeze', 'pull']);
  for (const mod of ARENA_MODULE_LIBRARY) {
    const preview = previewArenaModule(mod.id, 'idle');
    assert.equal(preview.ok, true, mod.id);
    assert.ok(preview.fieldCount <= 2, `${mod.id} field budget`);
    assert.equal(typeof preview.note, 'string');
  }
  const bad = validateArenaModule({ id: '', law: 'bounce', planInstall: null, bossRole: null, fieldBudget: 9 });
  assert.equal(bad.ok, false);
  assert.ok(hasPath(bad, 'id'));
  assert.ok(hasPath(bad, 'law'));
});

test('mod-facing boundary forbids kernel edits and power axes', () => {
  assert.ok(CONTENT_FACTORY_BOUNDARY.mustNotTouch.includes('src/combat'));
  assert.ok(CONTENT_FACTORY_BOUNDARY.mayAuthor.includes('modifiers'));
  const power = lintModifierPower({
    ...FACTORY_MODIFIER,
    stack: [{ mode: 'add', target: 'trajectory.speed', perRank: 12 }],
  });
  assert.equal(power.ok, false);
  assert.equal(peakConcurrentDemand(FACTORY_WAVE_RECIPE.packages) <= 24, true);
});
