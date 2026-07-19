#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ATTRIBUTION_DIAGNOSTIC_VARIANTS,
  ATTRIBUTION_ROUTE_TAGS,
} from './lib/releaseSoakContracts.mjs';
import { PERFORMANCE_SCENARIO_IDS } from './lib/performanceClosureContracts.mjs';
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

const fullMatrix = process.argv.includes('--full-matrix');
const legacyRoutes = readList('routes', ATTRIBUTION_ROUTE_TAGS);
const routes = readArg('scenarios')
  ? readList('scenarios', ATTRIBUTION_ROUTE_TAGS)
  : (fullMatrix ? [...PERFORMANCE_SCENARIO_IDS] : legacyRoutes);
const variants = readList('variants', ATTRIBUTION_DIAGNOSTIC_VARIANTS);
const variantScenarioIds = readArg('variant-scenarios')
  ? readList('variant-scenarios', ['flight_steady'])
  : (fullMatrix ? ['flight_steady'] : routes);
const seed = readInt('seed', 47);
const warmupMs = readPositiveInt('warmup-ms', 2_000);
const sampleMs = readPositiveInt('sample-ms', 5_000);
const flightTimeoutMs = readPositiveInt('flight-timeout-ms', 150_000);
const dockTimeoutMs = readPositiveInt('dock-timeout-ms', 90_000);
const outputRoot = path.resolve(ROOT, readArg('output-root', '.devshots/perf'));

const result = await runPerformanceAttributionProbe({
  root: ROOT,
  outputRoot,
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

console.log(`[perf-attribution] evidence: ${result.outPath}`);
console.log(`[perf-attribution] closure: ${result.closurePath}`);
console.log(`[perf-attribution] windows=${result.document?.windows?.length || 0} variants=${result.document?.variants?.length || 0}`);

if (!result.pass) {
  const failures = result.validation?.failures || [];
  console.error(`[perf-attribution] FAIL${failures.length ? `: ${failures.join(' | ')}` : ''}`);
  process.exitCode = 1;
} else {
  console.log('[perf-attribution] PASS');
}
