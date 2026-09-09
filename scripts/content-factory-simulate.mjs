#!/usr/bin/env node
// PQ-133.12 — simulate a wave recipe through planWave. Local only.

import { plannerAgreement, simulateAuthoredRecipe, simulateWave } from '../src/data/waveRecipeSimulator.js';
import { FACTORY_WAVE_RECIPE } from '../src/data/contentFactoryExamples.js';

const seed = Number(process.argv.includes('--seed') ? process.argv[process.argv.indexOf('--seed') + 1] : 47);
const arenaId = process.argv.includes('--arena')
  ? process.argv[process.argv.indexOf('--arena') + 1]
  : 'helios_core';
const wave = Number(process.argv.includes('--wave') ? process.argv[process.argv.indexOf('--wave') + 1] : 1);

const catalog = simulateWave({ seed, arenaId, wave });
const agreement = plannerAgreement({ seed, arenaId, wave });
const authored = simulateAuthoredRecipe(FACTORY_WAVE_RECIPE, { seed });

const report = {
  ok: agreement.ok && authored.ok && catalog.plan && catalog.plan.ok !== false,
  catalog: {
    seed,
    arenaId,
    wave,
    hash: catalog.hash,
    planOk: catalog.plan && catalog.plan.ok !== false,
    packageCount: catalog.plan && Array.isArray(catalog.plan.packages) ? catalog.plan.packages.length : 0,
  },
  agreement,
  authored: {
    id: FACTORY_WAVE_RECIPE.id,
    hash: authored.hash,
    ok: authored.ok,
    estimate: authored.estimate,
    validation: authored.validation,
    packageCount: authored.plan && Array.isArray(authored.plan.packages) ? authored.plan.packages.length : 0,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.ok ? 0 : 1;
