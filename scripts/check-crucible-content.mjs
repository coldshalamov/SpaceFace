#!/usr/bin/env node
// PQ-133.12 gate: the Crucible content factory must validate its own catalog,
// agree with the live wave planner, and refuse out-of-contract authoring docs.
// Covers CRU-061 (schemas + validators), CRU-062 (arena recipe toolkit),
// the wave recipe simulator, the spawn-cap lint, and localization-ready text.
import {
  CONTENT_FACTORY_BOUNDARY,
  FACTORY_SPAWN_DEFAULT_MAX,
  FACTORY_SPAWN_HARD_MAX,
  catalogFactoryHealth,
  estimateWaveRecipe,
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

let ok = 0;
let fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { ok += 1; return; }
  fail += 1;
  console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
};

// 1. Catalog health: every live modifier validates under the factory schema.
const health = catalogFactoryHealth();
check('content factory catalog: every live trait validates',
  health.traitFailures === 0,
  `${health.traitFailures}/${health.traitCount} trait(s) rejected`);

// 2. Authored examples carry valid docs and localization-ready text.
const modValidation = validateFactoryModifier(FACTORY_MODIFIER, { requireLoc: true });
check('factory modifier validates with required loc', modValidation.ok,
  JSON.stringify(modValidation.issues));
const recipeValidation = validateFactoryRecipe(FACTORY_WAVE_RECIPE, { requireLoc: true });
check('factory wave recipe validates with required loc', recipeValidation.ok,
  JSON.stringify(recipeValidation.issues));
check('factory loc keys resolve to real strings',
  /cone|spread|widen/i.test(resolveFactoryText(FACTORY_MODIFIER.loc.summaryKey))
    && /pincer/i.test(resolveFactoryText(FACTORY_WAVE_RECIPE.loc.summaryKey)),
  'loc.summaryKey did not resolve to authored text');
const modPreview = previewModifier(FACTORY_MODIFIER, { requireLoc: true });
check('modifier preview reports compiler-known and authored summary',
  modPreview.ok === true && modPreview.knownToCompiler === true
    && /cone|spread|widen/i.test(String(modPreview.loc && modPreview.loc.summary)),
  JSON.stringify(modPreview.validation || modPreview));

// 3. Validators must actually reject: over-cap lint + power axes + structural cases.
const overCap = lintRecipeSpawn(FACTORY_OVER_CAP_RECIPE);
check(`spawn lint refuses >${FACTORY_SPAWN_DEFAULT_MAX} peak`,
  overCap.ok === false && overCap.peak > FACTORY_SPAWN_DEFAULT_MAX,
  `peak=${overCap.peak}`);
const hardCap = lintRecipeSpawn(FACTORY_HARD_CAP_RECIPE);
check(`spawn lint refuses >${FACTORY_SPAWN_HARD_MAX} peak`,
  hardCap.ok === false && hardCap.peak > FACTORY_SPAWN_HARD_MAX,
  `peak=${hardCap.peak}`);
check('spawn lint accepts the authored recipe', lintRecipeSpawn(FACTORY_WAVE_RECIPE).ok === true);
const power = lintModifierPower({
  ...FACTORY_MODIFIER,
  stack: [{ mode: 'add', target: 'trajectory.speed', perRank: 12 }],
});
check('power lint refuses a power-axis stack', power.ok === false);
check('recipe validator refuses the over-cap document',
  validateFactoryRecipe(FACTORY_OVER_CAP_RECIPE, { requireLoc: true }).ok === false);
check('modifier validator refuses a malformed document',
  validateFactoryModifier({ ...FACTORY_MODIFIER, id: 'renamed' }, { requireLoc: true }).ok === false);
check('arena module validator refuses a malformed document',
  validateArenaModule({ id: '', law: 'bounce', planInstall: null, bossRole: null, fieldBudget: 9 }).ok === false);

// 4. The authored recipe estimates inside caps and runs through the live planner.
const estimate = estimateWaveRecipe(FACTORY_WAVE_RECIPE, null);
check('wave recipe estimate reports peak inside the default cap',
  estimate.withinDefaultCap === true && estimate.peakConcurrent <= FACTORY_SPAWN_DEFAULT_MAX,
  `peak=${estimate.peakConcurrent}`);
const spawned = simulateAuthoredRecipe(FACTORY_WAVE_RECIPE, { seed: 47 });
check('wave recipe simulates through the live planner with an 8-char hash',
  spawned.ok === true && typeof spawned.hash === 'string' && spawned.hash.length === 8,
  JSON.stringify(spawned.validation || spawned));

// 5. Simulator/planner agreement across seeds and waves.
let agreed = true;
let agreeDetail = '';
for (const seed of [1, 47, 99, 12345]) {
  for (const wave of [1, 2, 5, 8, 10]) {
    const input = { seed, arenaId: 'helios_core', wave };
    const verdict = plannerAgreement(input);
    if (!verdict.ok) {
      agreed = false;
      agreeDetail = `seed=${seed} wave=${wave} direct=${verdict.directHash} simulated=${verdict.simulatedHash}`;
      break;
    }
    const sim = simulateWave(input);
    if (hashSemanticWavePlan(planWave(input)) !== sim.hash) {
      agreed = false;
      agreeDetail = `hash mismatch seed=${seed} wave=${wave}`;
      break;
    }
  }
  if (!agreed) break;
}
check('recipe simulator agrees with planWave across 20 seed/wave cells', agreed, agreeDetail);

// 6. Arena module library: four live laws, each previewable inside its field budget.
const libraryCheck = validateArenaModuleLibrary();
check('arena module library validates', libraryCheck.ok === true,
  JSON.stringify(libraryCheck.issues));
const laws = ARENA_MODULE_LIBRARY.map((mod) => mod.law).sort();
check('arena module library names the four live laws',
  ARENA_MODULE_LIBRARY.length === 4
    && laws.join(',') === 'conduct,current,freeze,pull',
  laws.join(','));
let previewsOk = true;
let previewDetail = '';
for (const mod of ARENA_MODULE_LIBRARY) {
  const preview = previewArenaModule(mod.id, 'idle');
  if (!preview.ok || preview.fieldCount > 2 || typeof preview.note !== 'string') {
    previewsOk = false;
    previewDetail = mod.id;
    break;
  }
}
check('every arena module previews inside the two-field budget', previewsOk, previewDetail);

// 7. Survival catalog stays inside the spawn cap.
const catalogPeak = Math.max(0, ...SURVIVAL_WAVES.map((row) => peakConcurrentDemand(row.packages || [])));
check('survival wave catalog peak stays inside the default cap',
  catalogPeak <= FACTORY_SPAWN_DEFAULT_MAX, `peak=${catalogPeak}`);

// 8. The mod-facing boundary is intact: no kernel edits, power axes named.
check('content factory boundary forbids combat-kernel edits and names the authorable surfaces',
  CONTENT_FACTORY_BOUNDARY.mustNotTouch.includes('src/combat')
    && CONTENT_FACTORY_BOUNDARY.mayAuthor.includes('modifiers'),
  JSON.stringify(CONTENT_FACTORY_BOUNDARY));

console.log(`\ncheck-crucible-content: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
