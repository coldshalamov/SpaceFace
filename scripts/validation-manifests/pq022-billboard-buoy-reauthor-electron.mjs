// PQ-022 billboard/buoy re-author: paired one-use Electron presentation/parity cell.

import path from 'node:path';

import {
  createPq022BillboardBuoyReauthorBrowserManifest,
  PQ022_BILLBOARD_BUOY_REAUTHOR_FIXED_SEED,
} from './pq022-billboard-buoy-reauthor-browser.mjs';

export { PQ022_BILLBOARD_BUOY_REAUTHOR_FIXED_SEED };

export function createPq022BillboardBuoyReauthorElectronManifest(overrides = {}) {
  return createPq022BillboardBuoyReauthorBrowserManifest({
    id: 'pq022-billboard-buoy-reauthor-electron',
    runtimeKind: 'electron',
    commandArgs: [
      'scripts/probe-pq022-corridor-asset-leaves.mjs',
      '--only=billboard-buoy',
      '--runtime=electron',
    ],
    artifactRoot: path.join('.devshots', 'pq022-billboard-buoy-reauthor', 'electron'),
    ...overrides,
  });
}

export const pq022BillboardBuoyReauthorElectronManifest = createPq022BillboardBuoyReauthorElectronManifest();
export default pq022BillboardBuoyReauthorElectronManifest;
