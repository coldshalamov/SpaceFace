import path from 'node:path';

import { createCeresFiveMinuteBrowserManifest } from './ceres-five-minute-browser.mjs';

const base = createCeresFiveMinuteBrowserManifest();
const unique = (...groups) => [...new Set(groups.flat())];

export function createPq048OreCycleBrowserManifest(overrides = {}) {
  return {
    ...base,
    id: 'pq048-ore-cycle-browser',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: [
      'scripts/check-pq048-ore-cycle.mjs',
      '--acceptance',
    ],
    mode: 'acceptance',
    fastGateCommands: [
      'node scripts/check-pq048-ore-cycle.mjs --preflight',
      ...base.fastGateCommands.slice(1),
      'node --test test/pq048-ore-cycle-acceptance.test.mjs test/pq048-ore-cycle-manifest.test.mjs',
      'node --test test/ore-carrier-freight-route.test.mjs test/ceres-visible-job-actions.test.mjs test/freight-cargo-custody.test.mjs',
      'node --test test/ai-engagement-authority.test.mjs test/law-security-escalation.test.mjs',
      'node --test test/validation-broker.test.mjs',
    ],
    scenarioPaths: unique(
      base.scenarioPaths,
      'scripts/lib/pq048OreCycleAcceptance.mjs',
    ),
    regressionSourcePaths: unique(
      base.regressionSourcePaths,
      'scripts/check-autopilot-v3.mjs',
      'test/ceres-active-pockets.test.mjs',
      'test/ceres-activity-traffic-cast.test.mjs',
      'test/ceres-visible-job-actions.test.mjs',
      'test/freight-cargo-custody.test.mjs',
      'test/ai-engagement-authority.test.mjs',
      'test/law-security-escalation.test.mjs',
      'test/validation-broker.test.mjs',
      'test/ore-carrier-freight-route.test.mjs',
      'test/pq048-ore-cycle-acceptance.test.mjs',
      'test/pq048-ore-cycle-manifest.test.mjs',
    ),
    productionSourcePaths: unique(
      base.productionSourcePaths,
      'src/core/eventBus.js',
      'src/ai/engagementAuthority.js',
      'src/economy/freightCausality.js',
      'src/systems/economy.js',
      'src/systems/lawSecurity.js',
      'src/systems/surrenderRecovery.js',
    ),
    harnessSourcePaths: unique(
      base.harnessSourcePaths,
      'scripts/check-pq048-ore-cycle.mjs',
      'scripts/lib/pq048OreCycleAcceptance.mjs',
      'scripts/validation-manifests/pq048-ore-cycle-browser.mjs',
    ),
    runtimeProfile: 'default-ceres-five-minute-source-runtime',
    timeoutMs: 900_000,
    fastGateTimeoutMs: 600_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'pq048-ore-cycle', 'browser'),
    requireFastReceipt: true,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq048OreCycleBrowserManifest = createPq048OreCycleBrowserManifest();
export default pq048OreCycleBrowserManifest;
