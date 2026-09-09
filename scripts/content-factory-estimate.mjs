#!/usr/bin/env node
// PQ-133.12 — performance estimate for the authored recipe + catalog waves. Local only.

import { estimateWaveRecipe } from '../src/contracts/contentFactory.js';
import { previewArenaModule } from '../src/data/arenaModuleLibrary.js';
import { simulateAuthoredRecipe, simulateWave } from '../src/data/waveRecipeSimulator.js';
import { FACTORY_WAVE_RECIPE } from '../src/data/contentFactoryExamples.js';

const authored = simulateAuthoredRecipe(FACTORY_WAVE_RECIPE, { seed: 47 });
const arena = previewArenaModule(FACTORY_WAVE_RECIPE.arenaId, FACTORY_WAVE_RECIPE.arenaPhase);
const catalog = simulateWave({ seed: 47, arenaId: 'helios_core', wave: 1 });
const catalogEstimate = estimateWaveRecipe(
  { packages: catalog.plan && catalog.plan.packages },
  arena.install,
);

const report = {
  ok: authored.ok && arena.ok && catalog.plan && catalog.plan.ok !== false,
  authored: authored.estimate,
  catalogWave1: catalogEstimate,
  arena: {
    id: arena.id,
    law: arena.law,
    fieldCount: arena.fieldCount,
    mineCount: arena.mineCount,
    cover: arena.cover,
    note: arena.note,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.ok ? 0 : 1;
