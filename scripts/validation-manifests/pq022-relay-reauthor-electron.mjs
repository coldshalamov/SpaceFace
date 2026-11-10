// PQ-022 revised relay: paired one-use Electron presentation/parity cell.

import path from 'node:path';

import {
  createPq022RelayReauthorBrowserManifest,
  PQ022_RELAY_REAUTHOR_FIXED_SEED,
} from './pq022-relay-reauthor-browser.mjs';

export { PQ022_RELAY_REAUTHOR_FIXED_SEED };

export function createPq022RelayReauthorElectronManifest(overrides = {}) {
  return createPq022RelayReauthorBrowserManifest({
    id: 'pq022-relay-reauthor-electron',
    runtimeKind: 'electron',
    commandArgs: [
      'scripts/probe-pq022-corridor-asset-leaves.mjs',
      '--only=relay-collar',
      '--runtime=electron',
    ],
    artifactRoot: path.join('.devshots', 'pq022-relay-reauthor', 'electron'),
    ...overrides,
  });
}

export const pq022RelayReauthorElectronManifest = createPq022RelayReauthorElectronManifest();
export default pq022RelayReauthorElectronManifest;
