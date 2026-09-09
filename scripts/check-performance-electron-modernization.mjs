#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { checkElectronModernizationEvidence } from './lib/performanceElectronModernizationAcceptance.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const result = await checkElectronModernizationEvidence({ root: ROOT });

console.log(`[electron-modernization] ${result.status.toUpperCase()}`);
for (const runtime of result.runtimes || []) {
  console.log(`  ${runtime.runtime}: ${runtime.status}${runtime.evidencePath ? ` (${runtime.evidencePath})` : ''}`);
}
for (const failure of result.failures || []) console.error(`  - ${failure}`);
if (result.comparison?.performance) {
  console.log(`  Browser p95: ${result.comparison.performance.browserP95Ms} ms`);
  console.log(`  Electron p95: ${result.comparison.performance.electronP95Ms} ms`);
  console.log(`  Electron-Browser p95: ${result.comparison.performance.electronMinusBrowserP95Ms} ms`);
}

process.exitCode = result.status === 'pass' ? 0 : result.status === 'pending' ? 2 : 1;
