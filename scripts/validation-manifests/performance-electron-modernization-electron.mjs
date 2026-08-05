import path from 'node:path';

import {
  createPerformanceElectronModernizationBrowserManifest,
  PERFORMANCE_ELECTRON_MODERNIZATION_FIXED_SEED,
} from './performance-electron-modernization-browser.mjs';

export { PERFORMANCE_ELECTRON_MODERNIZATION_FIXED_SEED };

export function createPerformanceElectronModernizationElectronManifest(overrides = {}) {
  const artifactRoot = path.join('.devshots', 'perf', 'electron-modernization', 'electron');
  return createPerformanceElectronModernizationBrowserManifest({
    id: 'performance-electron-modernization-electron',
    runtimeKind: 'electron',
    commandArgs: [
      'scripts/check-release-soak-electron.mjs',
      '--cycles=1',
      `--output-root=${artifactRoot.replaceAll('\\', '/')}`,
      '--task-id=release-soak-electron',
    ],
    artifactRoot,
    packagedStartupRequired: true,
    ...overrides,
  });
}

export const performanceElectronModernizationElectronManifest =
  createPerformanceElectronModernizationElectronManifest();
export default performanceElectronModernizationElectronManifest;
