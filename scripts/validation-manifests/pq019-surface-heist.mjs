// PQ-019C Phase H1 broker-authorized FUNCTIONAL route acceptance: the surface capsule heist.
//
// One command runs the headed Browser cell under the validation broker:
//
//   node scripts/validation-broker-cli.mjs --manifest pq019-surface-heist
//
// The cell covers the five terminal routes — lawful observe, heist plus fence, confiscation,
// destruction, and the opt-in reduced-stake recovery — through the shipped mission, facility, law,
// jobs, tether, combat, and settlement owners. Long travel and acquisition are explicitly compressed
// through those owners' production event seams; terminal state is never assigned by the harness.
// It also accepts the authored offer through the real station Missions DOM, abandons from the real J
// Mission Log and danger confirmation, observes the composed witness/WANTED/pursuit line on the one
// visible floor, and checks focus, reduced motion, and text-carried meaning.
//
// This is H1 functional evidence only. It records no frame timing, percentile, hitch result, or speed
// conclusion. Matched performance remains Phase H3. The deterministic headless checks below must be
// green before the broker issues the cell's one-use claim.

import path from 'node:path';

/** Deterministic seed for the acceptance cell (not wall-clock). Matches the headless suites. */
export const PQ019_SURFACE_HEIST_FIXED_SEED = 19019;

export function createPq019SurfaceHeistManifest(overrides = {}) {
  return {
    id: 'pq019-surface-heist',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/probe-pq019-surface-heist.mjs'],
    mode: 'acceptance',
    // Deterministic gates that must be green before a claim is issued. These are exactly the
    // headless checks that prove the mission route without a browser lease.
    fastGateCommands: [
      'npm run check:pq019c:mission',
      'npm run check:pq019b:seams',
      'npm run check:pq019a:facility-embodiment',
      'npm run check:sim:compare',
    ],
    scenarioPaths: [],
    regressionSourcePaths: [
      'test/pq019-surface-heist-manifest.test.mjs',
      'test/pq019c-heist-mission.test.mjs',
      'test/pq019c-heist-routes.test.mjs',
      'test/pq019c-heist-save-reload.test.mjs',
      'test/pq019c-heist-cues.test.mjs',
      'test/pq019c-heist-tuning.test.mjs',
      'test/pq019-heist-arbiter.test.mjs',
      'test/pq019-owner-invariants.test.mjs',
      'test/pq019-facility-embodiment.test.mjs',
      'test/pq019-launch-schedule-cue.test.mjs',
      'test/fixtures/pq019c-tuning-matrix.json',
    ],
    // Every production path whose change should invalidate a previously accepted route receipt.
    productionSourcePaths: [
      'package.json',
      'src/ai/engagementAuthority.js',
      'src/combat/damage.js',
      'src/combat/kernel.js',
      'src/core/coreSystem.js',
      'src/core/timeEffects.js',
      'src/data/heistMission.js',
      'src/data/heistFacilities.js',
      'src/data/missions.js',
      'src/law/authorityResponse.js',
      'src/missions/heistArbiter.js',
      'src/missions/heistMissionRuntime.js',
      'src/systems/combat.js',
      'src/systems/missions.js',
      'src/systems/heistFacilities.js',
      'src/systems/lawSecurity.js',
      'src/systems/heat.js',
      'src/systems/npcJobsRuntime.js',
      'src/systems/tetherGameplay.js',
      'src/systems/world.js',
      'src/ui/alerts.js',
      'src/ui/bindings.js',
      'src/ui/confirm.js',
      'src/ui/input.js',
      'src/ui/screenManager.js',
      'src/ui/screens/missionLog.js',
      'src/ui/station/screens/contracts.js',
      'src/ui/station/stationApp.js',
      'src/ui/toasts.js',
      'src/ui/uiRoot.js',
      'src/ui/voiceArbiter.js',
      'src/save/saveSystem.js',
      'styles/station.css',
      'styles/ui.css',
    ],
    harnessSourcePaths: [
      'scripts/probe-pq019-surface-heist.mjs',
      'scripts/tune-pq019c-heist.mjs',
      'scripts/lib/browser-issues.mjs',
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/validationBroker.mjs',
      'scripts/lib/visualProbeServer.mjs',
      'scripts/validation-broker-cli.mjs',
      'scripts/validation-manifests/pq019-surface-heist.mjs',
    ],
    runtimeProfile: 'default',
    timeoutMs: 600_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'pq019-surface-heist'),
    fixedSeed: PQ019_SURFACE_HEIST_FIXED_SEED,
    requireFastReceipt: false,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq019SurfaceHeistManifest = createPq019SurfaceHeistManifest();

export default pq019SurfaceHeistManifest;
