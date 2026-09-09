#!/usr/bin/env node
// PQ-133.12 — compatibility / spawn-cap / power-axis lint. Local only.

import { lintModifierPower, lintRecipeSpawn, validateFactoryModifier, validateFactoryRecipe } from '../src/contracts/contentFactory.js';
import {
  FACTORY_HARD_CAP_RECIPE,
  FACTORY_MODIFIER,
  FACTORY_OVER_CAP_RECIPE,
  FACTORY_WAVE_RECIPE,
} from '../src/data/contentFactoryExamples.js';

const legalModifier = lintModifierPower(FACTORY_MODIFIER);
const legalRecipe = lintRecipeSpawn(FACTORY_WAVE_RECIPE);
const overCap = lintRecipeSpawn(FACTORY_OVER_CAP_RECIPE);
const hardCap = lintRecipeSpawn(FACTORY_HARD_CAP_RECIPE);
const overCapValidate = validateFactoryRecipe(FACTORY_OVER_CAP_RECIPE, { requireLoc: true });
const legalValidate = {
  modifier: validateFactoryModifier(FACTORY_MODIFIER, { requireLoc: true }),
  recipe: validateFactoryRecipe(FACTORY_WAVE_RECIPE, { requireLoc: true }),
};

const report = {
  ok: legalModifier.ok && legalRecipe.ok && !overCap.ok && !hardCap.ok && !overCapValidate.ok
    && legalValidate.modifier.ok && legalValidate.recipe.ok,
  legalModifier,
  legalRecipe,
  overCap,
  hardCap,
  overCapValidate,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.ok ? 0 : 1;
