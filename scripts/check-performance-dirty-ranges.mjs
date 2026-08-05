#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DYNAMIC_BUFFER_FULL_SPAN_VARIANT,
  runPerformanceAttributionProbe,
} from './lib/releaseSoakProbe.mjs';
import { evaluateDirtyRangeComparison } from './lib/performanceDirtyRangeAcceptance.mjs';
import { loadValidationManifestById } from './lib/validationManifestRegistry.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function readArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const flag = process.argv.find((arg) => arg.startsWith(prefix));
  return flag ? flag.slice(prefix.length) : fallback;
}

await main();

async function main() {
  const runtimeKind = readArg('runtime', 'browser');
  if (!['browser', 'electron'].includes(runtimeKind)) {
    console.error('[dirty-ranges] --runtime must be browser or electron');
    process.exitCode = 2;
    return;
  }
  const diagnostic = process.argv.includes('--diagnostic');
  const acceptance = process.argv.includes('--acceptance');
  if (diagnostic === acceptance) {
    console.error('[dirty-ranges] exactly one of --diagnostic or --acceptance is required');
    process.exitCode = 2;
    return;
  }

  const manifestId = `performance-dirty-ranges-${runtimeKind}`;
  let manifest;
  try {
    manifest = await loadValidationManifestById({ root: ROOT, id: manifestId });
  } catch (error) {
    console.error(`[dirty-ranges] manifest rejected: ${error?.message || error}`);
    process.exitCode = 2;
    return;
  }
  const outputRoot = path.resolve(ROOT, readArg('output-root', manifest.artifactRoot));
  const seed = Number(readArg('seed', String(process.env.SF_PROBE_SEED || manifest.fixedSeed || 47)));

  const result = await runPerformanceAttributionProbe({
    root: ROOT,
    runtimeKind,
    manifest,
    mode: acceptance ? 'acceptance' : 'diagnostic',
    outputRoot,
    taskId: manifest.id,
    routes: ['combat_vfx_burst'],
    variants: ['baseline', DYNAMIC_BUFFER_FULL_SPAN_VARIANT],
    variantScenarioIds: ['combat_vfx_burst'],
    seed,
    warmupMs: 2_000,
    sampleMs: 5_000,
    enableTier1Counters: true,
    log: (line) => console.log(`[dirty-ranges] ${line}`),
  });

  const comparison = evaluateDirtyRangeComparison(result.document, { runtimeKind });
  const comparisonPath = path.join(result.outputDir, 'dirty-range-comparison.json');
  await writeFile(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`, 'utf8');
  console.log(`[dirty-ranges] evidence: ${result.outPath}`);
  console.log(`[dirty-ranges] comparison: ${comparisonPath}`);
  if (!result.pass || !comparison.pass) {
    const failures = [
      ...(result.validation?.failures || []),
      ...comparison.failures,
    ];
    console.error(`[dirty-ranges] FAIL: ${[...new Set(failures)].join(' | ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[dirty-ranges] PASS (${runtimeKind}, ${acceptance ? 'acceptance' : 'diagnostic'})`);
}
