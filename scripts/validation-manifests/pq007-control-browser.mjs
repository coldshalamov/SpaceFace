// PQ-007 Browser control-route cell.
//
// One broker claim owns one headed system-browser launch. The probe starts at the canonical root,
// supplies the fixed seed through New Game, and acts only through visible controls plus native
// Playwright keyboard/mouse input. This is functional route evidence, not a performance cell.

import path from 'node:path';

export const PQ007_CONTROL_FIXED_SEED = 47;

export function createPq007ControlBrowserManifest(overrides = {}) {
  return {
    id: 'pq007-control-browser',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/probe-auto-target-steering.mjs', '--acceptance'],
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

export const pq007ControlBrowserManifest = createPq007ControlBrowserManifest();

export default pq007ControlBrowserManifest;
