// PQ-022 refinery re-author: paired one-use Electron presentation/parity cell.

import path from 'node:path';

import {
  createPq022RefineryReauthorBrowserManifest,
  PQ022_REFINERY_REAUTHOR_FIXED_SEED,
} from './pq022-refinery-reauthor-browser.mjs';

export { PQ022_REFINERY_REAUTHOR_FIXED_SEED };

export function createPq022RefineryReauthorElectronManifest(overrides = {}) {
  return createPq022RefineryReauthorBrowserManifest({
    id: 'pq022-refinery-reauthor-electron',
    runtimeKind: 'electron',
    commandArgs: [
      'scripts/probe-pq022-corridor-asset-leaves.mjs',
      '--only=refinery',
      '--runtime=electron',
    ],
    artifactRoot: path.join('.devshots', 'pq022-refinery-reauthor', 'electron'),
    ...overrides,
  });
}

export const pq022RefineryReauthorElectronManifest = createPq022RefineryReauthorElectronManifest();
export default pq022RefineryReauthorElectronManifest;
