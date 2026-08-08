#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PERFORMANCE_PRESENTATION_WORLD_ROUTES,
  checkPerformancePresentationWorldEvidence,
  evaluatePresentationWorldRuntime,
} from './lib/performancePresentationWorldAcceptance.mjs';
import { runPerformanceAttributionProbe } from './lib/releaseSoakProbe.mjs';
import { loadValidationManifestById } from './lib/validationManifestRegistry.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function readArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const flag = process.argv.find((arg) => arg.startsWith(prefix));
  return flag ? flag.slice(prefix.length) : fallback;
}

await main();

async function main() {
  const runtimeKind = readArg('runtime');
  if (!runtimeKind) {
    const result = await checkPerformancePresentationWorldEvidence({ root: ROOT });
    console.log(`[presentation-world] ${result.status.toUpperCase()}`);
    for (const runtime of result.runtimes || []) console.log(`  ${runtime.runtime}: ${runtime.status}`);
    for (const failure of result.failures || []) console.error(`  - ${failure}`);
    process.exitCode = result.status === 'pass' ? 0 : ['pending', 'partial'].includes(result.status) ? 2 : 1;
    return;
  }
  if (!['browser', 'electron'].includes(runtimeKind)) {
    console.error('[presentation-world] --runtime must be browser or electron');
    process.exitCode = 2;
    return;
  }
  const diagnostic = process.argv.includes('--diagnostic');
  const acceptance = process.argv.includes('--acceptance');
  if (diagnostic === acceptance) {
    console.error('[presentation-world] exactly one of --diagnostic or --acceptance is required');
    process.exitCode = 2;
    return;
  }
  const manifest = await loadValidationManifestById({
    root: ROOT,
    id: `performance-presentation-world-${runtimeKind}`,
  });
  const outputRoot = path.resolve(ROOT, readArg('output-root', manifest.artifactRoot));
  const result = await runPerformanceAttributionProbe({
    root: ROOT,
    runtimeKind,
    manifest,
    mode: acceptance ? 'acceptance' : 'diagnostic',
    outputRoot,
    taskId: manifest.id,
    routes: [...PERFORMANCE_PRESENTATION_WORLD_ROUTES],
    variants: ['baseline'],
    variantScenarioIds: [],
    seed: Number(readArg('seed', String(manifest.fixedSeed || 47))),
    warmupMs: 2_000,
    sampleMs: 5_000,
    additionalDocumentValidator: (document) => evaluatePresentationWorldRuntime(document, { runtimeKind }),
    log: (line) => console.log(`[presentation-world] ${line}`),
  });
  const comparison = result.document?.specializedValidation
    || evaluatePresentationWorldRuntime(result.document, { runtimeKind });
  const comparisonPath = path.join(result.outputDir, 'presentation-world-comparison.json');
  await writeFile(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`, 'utf8');
  console.log(`[presentation-world] evidence: ${result.outPath}`);
  console.log(`[presentation-world] comparison: ${comparisonPath}`);
  if (comparison.status === 'partial' && comparison.criterionPass === true) {
    console.error(`[presentation-world] PARTIAL: ${comparison.openCriteria.join(', ')} remain open`);
    process.exitCode = 2;
    return;
  }
  if (!result.pass || !comparison.pass) {
    console.error(`[presentation-world] FAIL: ${[...new Set([
      ...(result.validation?.failures || []),
      ...comparison.failures,
    ])].join(' | ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[presentation-world] PASS (${runtimeKind}, ${acceptance ? 'acceptance' : 'diagnostic'})`);
}
