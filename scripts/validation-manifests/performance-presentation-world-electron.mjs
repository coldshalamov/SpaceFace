import path from 'node:path';

import {
  createPerformancePresentationWorldBrowserManifest,
  PERFORMANCE_PRESENTATION_WORLD_FIXED_SEED,
} from './performance-presentation-world-browser.mjs';

export { PERFORMANCE_PRESENTATION_WORLD_FIXED_SEED };

export function createPerformancePresentationWorldElectronManifest(overrides = {}) {
  return createPerformancePresentationWorldBrowserManifest({
    id: 'performance-presentation-world-electron',
    runtimeKind: 'electron',
    commandArgs: [
      'scripts/check-performance-presentation-world.mjs',
      '--runtime=electron',
      '--acceptance',
    ],
    artifactRoot: path.join('.devshots', 'perf', 'presentation-world', 'electron'),
    ...overrides,
  });
}

export const performancePresentationWorldElectronManifest =
  createPerformancePresentationWorldElectronManifest();
export default performancePresentationWorldElectronManifest;
