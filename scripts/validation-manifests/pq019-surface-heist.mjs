// PQ-019 Phase E broker-authorized route acceptance: the surface capsule heist.
//
// BUILT, NOT RUN. PQ-034 holds the performance-evidence / validation-broker / browser-GPU leases, so
// no claim has ever been issued against this manifest and no Browser or Electron process has been
// launched for PQ-019C. This file is the registered manifest the packet names
// (`L3BrokerManifest: pq019-surface-heist`), authored to match the PQ-021 shape so that whoever
// holds the lease can execute it in one command:
//
//   node scripts/validation-broker-cli.mjs --manifest pq019-surface-heist
//
// WHAT THE ACCEPTANCE CELL WOULD COVER — the rows PQ-019C's receipt lists as unclaimed:
//   * the five named routes flown at normal camera through ordinary input: lawful observe,
//     successful heist plus fence, confiscation, destruction, and the reduced-stake recovery;
//   * the authored offer read and accepted on the live Tethys station board, and abandoned from the
//     Mission Log, through the real DOM rather than the `ui:acceptMission` intent directly;
//   * the one-voice floor observed on screen: a single pill for the whole run, carrying the
//     composed witness/WANTED/pursuit line, with no competing pill;
//   * accessibility review of that route — focus behaviour, reduced motion, non-colour semantics;
//   * matched performance with ordinary traffic: frame p95/p99, hitches, draw and program counts,
//     GPU admission and residency across the launcher, capsule, catcher and fence.
//
// The headless half is already green and is listed as the fast gate below; it is what proves
// arbitration, settlement, save/reload and cue behaviour without any lease at all. None of the rows
// above is claimed by the PQ-019C receipt.

import path from 'node:path';

/** Deterministic seed for the acceptance cell (not wall-clock). Matches the headless suites. */
export const PQ019_SURFACE_HEIST_FIXED_SEED = 19019;

export function createPq019SurfaceHeistManifest(overrides = {}) {
  return {
    id: 'pq019-surface-heist',
    runtimeKind: 'browser',
    command: process.execPath,
    // The probe does not exist yet, and deliberately so: writing it would be taking the lease.
    // Whoever holds the lease authors it against the routes listed in the header above.
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
      'src/data/heistMission.js',
      'src/data/heistFacilities.js',
      'src/data/missions.js',
      'src/missions/heistArbiter.js',
      'src/missions/heistMissionRuntime.js',
      'src/systems/missions.js',
      'src/systems/heistFacilities.js',
      'src/systems/lawSecurity.js',
      'src/systems/heat.js',
      'src/systems/npcJobsRuntime.js',
      'src/systems/tetherGameplay.js',
      'src/ui/voiceArbiter.js',
      'src/ui/screens/missionLog.js',
      'src/ui/station/stationApp.js',
      'src/save/saveSystem.js',
    ],
    harnessSourcePaths: [
      'scripts/probe-pq019-surface-heist.mjs',
      'scripts/tune-pq019c-heist.mjs',
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/browser-issues.mjs',
      'scripts/validation-manifests/pq019-surface-heist.mjs',
    ],
    runtimeProfile: 'default',
    timeoutMs: 300_000,
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
