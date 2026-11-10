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

/** One simulation second after the scheduled launch is enough to observe the facility owner's spawn. */
export const PQ019_CAPSULE_LAUNCH_GRACE_S = 1;

/**
 * Wall time is only a harness-liveness guard. A headed target-profile route can render well below
 * real time while the simulation is still healthy, so it gets a generous bounded window as long as
 * the simulation clock continues to advance.
 */
export const PQ019_CAPSULE_WAIT_HARD_WALL_MS = 180_000;
export const PQ019_CAPSULE_WAIT_NO_PROGRESS_MS = 45_000;

const finiteOrNull = (value) => (
  value === null || value === undefined || value === ''
    ? null
    : (Number.isFinite(Number(value)) ? Number(value) : null)
);
const stableSeconds = (value) => Math.round(value * 1_000) / 1_000;

/**
 * Classify one immutable capsule-wait observation.
 *
 * Wall time is deliberately absent. Slow motion, a paused simulation, and a delayed render frame
 * cannot prove that a scheduled launch was missed. Only the simulation clock, the facility
 * schedule, the live capsule, and the mission's terminal receipt can make that decision.
 */
export function classifyPq019CapsuleWaitSnapshot(snapshot = {}) {
  const startedAtSimT = finiteOrNull(snapshot.startedAtSimT);
  const simTime = finiteOrNull(snapshot.simTime);
  const heist = snapshot.mission?.heist || {};
  const launchAtSimT = finiteOrNull(heist.launchAtSimT ?? snapshot.schedule?.launchAtSimT);
  const simElapsedS = startedAtSimT == null || simTime == null
    ? null : stableSeconds(Math.max(0, simTime - startedAtSimT));
  const launchLagS = launchAtSimT == null || simTime == null
    ? null : stableSeconds(simTime - launchAtSimT);

  if (heist.terminalReceipt || heist.settled || heist.settledOutcome
    || (snapshot.mission?.found === false && startedAtSimT != null)) {
    return {
      status: 'terminal_race',
      reason: heist.terminalReceipt?.outcome || heist.settledOutcome || 'mission_missing',
      simElapsedS,
      launchLagS,
    };
  }
  if (snapshot.capsule?.role === 'cargo_capsule') {
    return { status: 'ready', reason: 'live_capsule', simElapsedS, launchLagS };
  }
  if (launchLagS != null && launchLagS >= PQ019_CAPSULE_LAUNCH_GRACE_S) {
    return { status: 'launch_missed', reason: 'capsule_absent_after_launch_grace', simElapsedS, launchLagS };
  }
  return {
    status: 'pending',
    reason: launchLagS == null ? 'launch_schedule_unobserved' : 'launch_not_due',
    simElapsedS,
    launchLagS,
  };
}

/**
 * Decide whether a still-pending capsule wait is alive or the harness itself has stalled.
 * Product readiness remains entirely simulation-classified above; this guard only prevents an
 * unbounded Browser lease when the simulation stops advancing or the bounded cell is exhausted.
 */
export function classifyPq019CapsuleWaitHarnessGuard({
  startedAtWallMs,
  lastProgressAtWallMs,
  nowWallMs,
  hardWallMs = PQ019_CAPSULE_WAIT_HARD_WALL_MS,
  noProgressMs = PQ019_CAPSULE_WAIT_NO_PROGRESS_MS,
} = {}) {
  const started = finiteOrNull(startedAtWallMs);
  const lastProgress = finiteOrNull(lastProgressAtWallMs);
  const now = finiteOrNull(nowWallMs);
  const hardLimit = finiteOrNull(hardWallMs);
  const progressLimit = finiteOrNull(noProgressMs);

  if (started == null || lastProgress == null || now == null
    || hardLimit == null || hardLimit <= 0 || progressLimit == null || progressLimit <= 0) {
    return { status: 'stalled', reason: 'invalid_harness_guard_state' };
  }

  const wallElapsedMs = Math.max(0, Math.round(now - started));
  const noProgressElapsedMs = Math.max(0, Math.round(now - lastProgress));
  if (wallElapsedMs >= hardLimit) {
    return {
      status: 'stalled',
      reason: 'hard_wall_limit_without_simulation_verdict',
      wallElapsedMs,
      noProgressElapsedMs,
    };
  }
  if (noProgressElapsedMs >= progressLimit) {
    return {
      status: 'stalled',
      reason: 'simulation_progress_stalled',
      wallElapsedMs,
      noProgressElapsedMs,
    };
  }
  return { status: 'continue', reason: 'simulation_progress_within_guard', wallElapsedMs, noProgressElapsedMs };
}

export function createPq019SurfaceHeistManifest(overrides = {}) {
  return {
    id: 'pq019-surface-heist',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/probe-pq019-surface-heist.mjs', '--continuation-only'],
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
