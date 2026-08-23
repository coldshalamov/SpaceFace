#!/usr/bin/env node
// PQ-133.12 — preview compiled modifier + arena install. Local only.

import {
  previewModifier,
} from '../src/data/waveRecipeSimulator.js';
import { previewArenaModule, ARENA_MODULE_LIBRARY } from '../src/data/arenaModuleLibrary.js';
import { FACTORY_MODIFIER, FACTORY_WAVE_RECIPE } from '../src/data/contentFactoryExamples.js';
import { resolveFactoryText } from '../src/contracts/contentFactory.js';

const modifier = previewModifier(FACTORY_MODIFIER, { requireLoc: true, weaponId: 'wpn_pulse_laser_s' });
const arena = previewArenaModule(FACTORY_WAVE_RECIPE.arenaId, FACTORY_WAVE_RECIPE.arenaPhase);

const report = {
  ok: modifier.ok && arena.ok,
  modifier: {
    id: FACTORY_MODIFIER && FACTORY_MODIFIER.id,
    knownToCompiler: modifier.knownToCompiler,
    loc: modifier.loc,
    digest: modifier.compiled && modifier.compiled.spec && modifier.compiled.spec.digest,
    metrics: modifier.metrics,
    validation: modifier.validation,
  },
  recipeText: {
    summary: resolveFactoryText(FACTORY_WAVE_RECIPE.loc.summaryKey),
    detail: resolveFactoryText(FACTORY_WAVE_RECIPE.loc.detailKey),
  },
  arena,
  librarySize: ARENA_MODULE_LIBRARY.length,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.ok ? 0 : 1;
