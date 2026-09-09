import path from 'node:path';

import {
  createPerformanceDirtyRangesBrowserManifest,
  PERFORMANCE_DIRTY_RANGES_FIXED_SEED,
} from './performance-dirty-ranges-browser.mjs';

export { PERFORMANCE_DIRTY_RANGES_FIXED_SEED };

export function createPerformanceDirtyRangesElectronManifest(overrides = {}) {
  return createPerformanceDirtyRangesBrowserManifest({
    id: 'performance-dirty-ranges-electron',
    runtimeKind: 'electron',
    commandArgs: [
      'scripts/check-performance-dirty-ranges.mjs',
      '--runtime=electron',
      '--acceptance',
    ],
    artifactRoot: path.join('.devshots', 'perf', 'dirty-ranges', 'electron'),
    ...overrides,
  });
}

export const performanceDirtyRangesElectronManifest = createPerformanceDirtyRangesElectronManifest();
export default performanceDirtyRangesElectronManifest;
