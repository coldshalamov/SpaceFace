#!/usr/bin/env node
// PQ-133.12 — local balance / telemetry figures. Prints only. No network.

import { ATTACK_TRAITS } from '../src/data/attackTraits.js';
import { SURVIVAL_WAVES } from '../src/data/survivalWaves.js';
import { catalogFactoryHealth, CONTENT_FACTORY_BOUNDARY, FACTORY_SPAWN_DEFAULT_MAX, FACTORY_SPAWN_HARD_MAX } from '../src/contracts/contentFactory.js';
import { ARENA_MODULE_LIBRARY, validateArenaModuleLibrary } from '../src/data/arenaModuleLibrary.js';
import { previewModifier, plannerAgreement, simulateAuthoredRecipe } from '../src/data/waveRecipeSimulator.js';
import { FACTORY_MODIFIER, FACTORY_WAVE_RECIPE } from '../src/data/contentFactoryExamples.js';
import { peakConcurrentDemand } from '../src/data/survivalWaves.js';

const health = catalogFactoryHealth();
const library = validateArenaModuleLibrary();
const modifier = previewModifier(FACTORY_MODIFIER, { requireLoc: true });
const authored = simulateAuthoredRecipe(FACTORY_WAVE_RECIPE, { seed: 47 });
const peaks = SURVIVAL_WAVES.map((recipe) => peakConcurrentDemand(recipe.packages));
const agreementSeeds = [1, 47, 99];
const agreementWaves = [1, 5, 10];
const agreements = [];
for (const seed of agreementSeeds) {
  for (const wave of agreementWaves) {
    agreements.push({
      seed,
      wave,
      ...plannerAgreement({ seed, arenaId: 'helios_core', wave }),
    });
  }
}

const report = {
  ok: health.traitFailures === 0 && library.ok && modifier.ok && authored.ok
    && agreements.every((row) => row.ok),
  boundary: CONTENT_FACTORY_BOUNDARY,
  catalog: {
    traitCount: ATTACK_TRAITS.length,
    waveCount: SURVIVAL_WAVES.length,
    arenaModuleCount: ARENA_MODULE_LIBRARY.length,
    traitFailures: health.traitFailures,
    maxCatalogPeak: Math.max(0, ...peaks),
    spawnDefaultMax: FACTORY_SPAWN_DEFAULT_MAX,
    spawnHardMax: FACTORY_SPAWN_HARD_MAX,
  },
  exampleModifier: {
    id: FACTORY_MODIFIER && FACTORY_MODIFIER.id,
    digest: modifier.compiled && modifier.compiled.spec && modifier.compiled.spec.digest,
    spreadDeg: modifier.metrics && modifier.metrics.spreadDeg,
    payloadScale: modifier.metrics && modifier.metrics.payloadScale,
    heatScale: modifier.metrics && modifier.metrics.heatScale,
  },
  exampleRecipe: {
    id: FACTORY_WAVE_RECIPE.id,
    hash: authored.hash,
    peak: authored.estimate && authored.estimate.peakConcurrent,
    pressure: authored.estimate && authored.estimate.pressure,
  },
  plannerAgreement: {
    checked: agreements.length,
    mismatches: agreements.filter((row) => !row.ok).length,
  },
  library,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.ok ? 0 : 1;
