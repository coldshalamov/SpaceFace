// PERF-00 paired Electron authority. Source/scenario identity is inherited intact from Browser;
// only runtime-bound claim identity, command argument, and artifact root differ.

import path from 'node:path';

import {
  createPerformanceClosureBrowserManifest,
  PERFORMANCE_CLOSURE_FIXED_SEED,
} from './performance-closure-browser.mjs';

export { PERFORMANCE_CLOSURE_FIXED_SEED };

export function createPerformanceClosureElectronManifest(overrides = {}) {
  return createPerformanceClosureBrowserManifest({
    id: 'performance-closure-electron',
    runtimeKind: 'electron',
    commandArgs: [
      'scripts/check-performance-attribution.mjs',
      '--runtime=electron',
      '--acceptance',
      '--full-matrix',
    ],
    artifactRoot: path.join('.devshots', 'perf', 'closure', 'electron'),
    ...overrides,
  });
}

export const performanceClosureElectronManifest = createPerformanceClosureElectronManifest();
export default performanceClosureElectronManifest;
