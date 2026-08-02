import path from 'node:path';

import {
  createPerformanceLifecycleBrowserManifest,
  PERFORMANCE_LIFECYCLE_FIXED_SEED,
} from './performance-lifecycle-browser.mjs';

export { PERFORMANCE_LIFECYCLE_FIXED_SEED };

export function createPerformanceLifecycleElectronManifest(overrides = {}) {
  return createPerformanceLifecycleBrowserManifest({
    id: 'performance-lifecycle-electron',
    runtimeKind: 'electron',
    commandArgs: ['scripts/check-performance-lifecycle.mjs', '--runtime=electron', '--acceptance'],
    artifactRoot: path.join('.devshots', 'perf', 'lifecycle', 'electron'),
    ...overrides,
  });
}

export const performanceLifecycleElectronManifest = createPerformanceLifecycleElectronManifest();
export default performanceLifecycleElectronManifest;
