// PQ-022 nav-buoy repair (reopened billboard-buoy-reauthor): paired one-use Electron
// presentation/parity cell.

import path from 'node:path';

import {
  createPq022NavBuoyRepairBrowserManifest,
  PQ022_NAV_BUOY_REPAIR_FIXED_SEED,
} from './pq022-nav-buoy-repair-browser.mjs';

export { PQ022_NAV_BUOY_REPAIR_FIXED_SEED };

export function createPq022NavBuoyRepairElectronManifest(overrides = {}) {
  return createPq022NavBuoyRepairBrowserManifest({
    id: 'pq022-nav-buoy-repair-electron',
    runtimeKind: 'electron',
    commandArgs: [
      'scripts/probe-pq022-corridor-asset-leaves.mjs',
      '--only=nav-buoy-repair',
      '--runtime=electron',
    ],
    artifactRoot: path.join('.devshots', 'pq022-nav-buoy-repair', 'electron'),
    ...overrides,
  });
}

export const pq022NavBuoyRepairElectronManifest = createPq022NavBuoyRepairElectronManifest();
export default pq022NavBuoyRepairElectronManifest;
