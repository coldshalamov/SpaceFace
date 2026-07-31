#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ATTRIBUTION_DIAGNOSTIC_VARIANTS,
  ATTRIBUTION_ROUTE_TAGS,
} from './lib/releaseSoakContracts.mjs';
import { PERFORMANCE_SCENARIO_IDS } from './lib/performanceClosureContracts.mjs';
import { loadValidationManifestById } from './lib/validationManifestRegistry.mjs';
import { runPerformanceAttributionProbe } from './lib/releaseSoakProbe.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function readArg(name, fallback = null) {
  const flag = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return flag ? flag.slice(name.length + 3) : fallback;
}

function readList(name, fallback) {
  const value = readArg(name);
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [...fallback];
}

function readPositiveInt(name, fallback) {
  const value = Number(readArg(name, String(fallback)));
  if (!Number.isInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer`);
  return value;
}

function readInt(name, fallback) {
  const value = Number(readArg(name, String(fallback)));
  if (!Number.isInteger(value)) throw new Error(`--${name} must be an integer`);
  return value;
}

await main();

async function main() {
  const runtimeKind = readArg('runtime', 'browser');
  if (!['browser', 'electron'].includes(runtimeKind)) {
    console.error('[perf-attribution] --runtime must be browser or electron');
    process.exitCode = 2;
    return;
  }
  const diagnostic = process.argv.includes('--diagnostic');
  const acceptance = process.argv.includes('--acceptance');
  if (!diagnostic && !acceptance) {
    console.error('[perf-attribution] explicit --diagnostic or --acceptance mode is required');
    process.exitCode = 2;
    return;
  }
  if (diagnostic && acceptance) {
    console.error('[perf-attribution] --diagnostic and --acceptance are mutually exclusive');
    process.exitCode = 2;
    return;
  }

  const manifestId = `performance-closure-${runtimeKind}`;
  let manifest;
  try {
    manifest = await loadValidationManifestById({ root: ROOT, id: manifestId });
  } catch (error) {
    console.error(`[perf-attribution] manifest rejected: ${error?.message || error}`);
    process.exitCode = 2;
    return;
  }
  if (manifest.runtimeKind !== runtimeKind) {
    console.error('[perf-attribution] manifest runtime does not match --runtime');
    process.exitCode = 2;
    return;
  }

  const outputRoot = path.resolve(ROOT, readArg('output-root', manifest.artifactRoot));
  const fullMatrix = process.argv.includes('--full-matrix');
  const legacyRoutes = readList('routes', ATTRIBUTION_ROUTE_TAGS);
  const routes = readArg('scenarios')
    ? readList('scenarios', ATTRIBUTION_ROUTE_TAGS)
    : (fullMatrix ? [...PERFORMANCE_SCENARIO_IDS] : legacyRoutes);
  const variants = readList('variants', ATTRIBUTION_DIAGNOSTIC_VARIANTS);
  const variantScenarioIds = readArg('variant-scenarios')
    ? readList('variant-scenarios', ['flight_steady'])
    : (fullMatrix ? ['flight_steady'] : routes);
  const seed = readInt('seed', Number(process.env.SF_PROBE_SEED || manifest.fixedSeed || 47));
  const warmupMs = readPositiveInt('warmup-ms', 2_000);
  const sampleMs = readPositiveInt('sample-ms', 5_000);
  const flightTimeoutMs = readPositiveInt('flight-timeout-ms', 150_000);
  const dockTimeoutMs = readPositiveInt('dock-timeout-ms', 90_000);
  const taskId = readArg('task-id', manifest.id);

  let result;
  try {
    result = await runPerformanceAttributionProbe({
      root: ROOT,
      runtimeKind,
      manifest,
      mode: acceptance ? 'acceptance' : 'diagnostic',
      outputRoot,
      taskId,
      routes,
      variants,
      variantScenarioIds,
      seed,
      warmupMs,
      sampleMs,
      flightTimeoutMs,
      dockTimeoutMs,
      log: (line) => console.log(`[perf-attribution] ${line}`),
    });
  } catch (error) {
    if (error?.code === 'PERFORMANCE_ATTRIBUTION_AUTHORITY_REJECTED') {
      console.error(`[perf-attribution] authority rejected: ${error.reason}`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  console.log(`[perf-attribution] evidence: ${result.outPath}`);
  console.log(`[perf-attribution] closure: ${result.closurePath}`);
  console.log(`[perf-attribution] windows=${result.document?.windows?.length || 0} variants=${result.document?.variants?.length || 0}`);

  if (!result.pass) {
    const failures = result.validation?.failures || [];
    console.error(`[perf-attribution] FAIL${failures.length ? `: ${failures.join(' | ')}` : ''}`);
    process.exitCode = 1;
  } else {
    console.log(`[perf-attribution] PASS (${acceptance ? 'acceptance' : 'diagnostic'})`);
  }
}
