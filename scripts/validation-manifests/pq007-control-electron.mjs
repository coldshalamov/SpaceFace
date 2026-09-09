// PQ-007 Electron control-route cell.
//
// This cell deliberately has its own runtime-kind broker authority. It reuses the same public actor
// route as the Browser cell, but its one allowed launch is the isolated Electron player runtime.

import path from 'node:path';

import { PQ007_CONTROL_FIXED_SEED } from './pq007-control-browser.mjs';

export { PQ007_CONTROL_FIXED_SEED };

export function createPq007ControlElectronManifest(overrides = {}) {
  return {
    id: 'pq007-control-electron',
    runtimeKind: 'electron',
    command: process.execPath,
    commandArgs: ['scripts/probe-dod-flight-acceptance.mjs', '--acceptance'],
    mode: 'acceptance',
    fastGateCommands: [
      'node --test test/pq007-control-route-manifest.test.mjs',
      'node scripts/probe-auto-target-steering.mjs',
      'node scripts/probe-dod-flight-acceptance.mjs',
      'node scripts/check-auto-target-registry.mjs',
      'node scripts/check-massline-auto-target.mjs',
    ],
    scenarioPaths: [],
    regressionSourcePaths: [
      'test/pq007-control-route-manifest.test.mjs',
      'test/pq007-control-prompts.test.mjs',
      'test/pursuit-slot.test.mjs',
      'test/input-command-snapshot.test.mjs',
      'test/massline-acquisition-preview.test.mjs',
    ],
    productionSourcePaths: [
      'package.json',
      'electron/main.cjs',
      'src/combat/autoTargetMode.js',
      'src/core/gameState.js',
      'src/core/registry.js',
      'src/systems/autoTargetAssist.js',
      'src/systems/flightV3.js',
      'src/systems/input.js',
      'src/ui/controlPrompts.js',
      'src/ui/hud.js',
      'src/ui/targetPanel.js',
      'src/ui/uiRoot.js',
      'styles/ui.css',
    ],
    harnessSourcePaths: [
      'scripts/probe-auto-target-steering.mjs',
      'scripts/probe-dod-flight-acceptance.mjs',
      'scripts/lib/browser-issues.mjs',
      'scripts/lib/electronTestIsolation.mjs',
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/validationBroker.mjs',
      'scripts/lib/visualProbeServer.mjs',
      'scripts/validation-broker-cli.mjs',
      'scripts/validation-manifests/pq007-control-browser.mjs',
      'scripts/validation-manifests/pq007-control-electron.mjs',
    ],
    runtimeProfile: 'default',
    timeoutMs: 360_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'pq007-control-route'),
    fixedSeed: PQ007_CONTROL_FIXED_SEED,
    requireFastReceipt: false,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq007ControlElectronManifest = createPq007ControlElectronManifest();

export default pq007ControlElectronManifest;
