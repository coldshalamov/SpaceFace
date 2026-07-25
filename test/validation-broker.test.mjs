import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  STATUS,
  FAILURE_POINTER_NAME,
  FAST_RUN_LOCK_NAME,
  LAUNCH_COUNTS_NAME,
  LEADERSHIP_INIT_GRACE_MS,
  acquireRunLock,
  atomicReclaimLockFile,
  claimFastGateReceipt,
  compactFailurePointer,
  createFastGateReceipt,
  createValidationBroker,
  evaluateAcceptanceGate,
  evaluateCachedResult,
  evaluateFastGate,
  incrementCandidateLaunchCount,
  issueBrokerClaim,
  persistFailure,
  publishFastGateReceipt,
  requireBrokerClaimOrDiagnostic,
  resetLaunchCountsForTests,
  validateBrokerClaim,
  consumeBrokerClaim,
  getLaunchCounts,
  getCandidateLaunchCount,
  isPidAlive,
  tryReclaimStaleRunLock,
} from '../scripts/lib/validationBroker.mjs';
import { writeJsonAtomically } from '../scripts/lib/validationAtomicWrite.mjs';
import {
  computeSourceSetDigest,
  digestSourcePaths,
  deriveFailureIdentity,
} from '../scripts/lib/validationFingerprint.mjs';
import { MASSLINE_LIVE_FIXED_SEED } from '../scripts/validation-manifests/massline-live.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

function testManifest(outputRel, overrides = {}) {
  return {
    id: 'unit-test-probe',
    runtimeKind: 'node',
    command: process.execPath,
    commandArgs: ['-e', 'process.exit(0)'],
    mode: 'acceptance',
    fastGateCommands: [],
    scenarioPaths: [],
    regressionSourcePaths: [],
    productionSourcePaths: [],
    harnessSourcePaths: [],
    runtimeProfile: 'default',
    timeoutMs: 5_000,
    maxLaunchesPerCandidate: 2,
    artifactRoot: outputRel,
    fixedSeed: 42,
    receiptSchema: 'spaceface.validation-fast-gate.v1',
    requireFastReceipt: true,
    requireBrokerClaim: false,
    ...overrides,
  };
}

async function tempRoot(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'validation-broker-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

function primaryFailure(overrides = {}) {
  return {
    generatedAt: '2026-07-23T16:00:00.000Z',
    runtimeKind: 'browser',
    primaryAcceptance: true,
    regressionDigest: 'regression-before',
    routeDigest: 'route-before',
    failureFingerprint: 'known-fingerprint',
    pass: false,
    error: 'TEST_FAILURE: controlled failure',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// §3 acceptance items as discrete cases
// ---------------------------------------------------------------------------

test('§3.1 blocked_repeat: unchanged failure is blocked with no process launch', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const manifest = testManifest('out');
  // Materialize matching digests by using empty source lists (stable empty digests).
  const broker = createValidationBroker(manifest, { root, outputRoot });
  const digests = await broker.computeGateDigests();

  await persistFailure({
    outputRoot,
    failure: primaryFailure({
      routeDigest: digests.routeDigest,
      regressionDigest: digests.regressionDigest,
      failureFingerprint: 'fp-unchanged',
    }),
  });
  await broker.recordRunResult({
    status: 'fail',
    failureFingerprint: 'fp-unchanged',
    routeDigest: digests.routeDigest,
    regressionDigest: digests.regressionDigest,
  });

  const cached = await evaluateCachedResult({ root, outputRoot, manifest });
  assert.equal(cached.blocked, true);
  assert.ok(
    cached.status === STATUS.BLOCKED_REPEAT || cached.status === STATUS.CACHED_UNCHANGED,
    `expected blocked_repeat or cached_unchanged, got ${cached.status}`,
  );
  assert.equal(cached.launch, false);

  const authorized = await broker.authorizeAndMaybeRun({
    mode: 'acceptance',
    explicitAcceptance: true,
    spawnProbe: true,
  });
  assert.equal(authorized.launched, false);
  assert.ok(
    authorized.status === STATUS.BLOCKED_REPEAT
      || authorized.status === STATUS.CACHED_UNCHANGED,
  );
});

test('§3.2 one-use receipt cannot be reused', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const receipt = createFastGateReceipt({
    routeDigest: 'route-a',
    regressionDigest: 'reg-a',
  });
  await publishFastGateReceipt({ outputRoot, receipt });
  const first = await claimFastGateReceipt({ outputRoot });
  assert.ok(first?.claimToken);
  assert.deepEqual(first.receipt.routeDigest, 'route-a');
  const second = await claimFastGateReceipt({ outputRoot });
  assert.equal(second, null, 'second claim of the same receipt must fail');
});

test('§3.3 stale receipt is rejected (source/regression digest mismatch)', async () => {
  const result = evaluateAcceptanceGate({
    mode: 'acceptance',
    explicitAcceptance: true,
    receipt: createFastGateReceipt({
      routeDigest: 'old-route',
      regressionDigest: 'old-reg',
    }),
    currentRouteDigest: 'new-route',
    currentRegressionDigest: 'old-reg',
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'fast-receipt-source-digest-stale');
  assert.equal(result.status, STATUS.BLOCKED_STALE_CANDIDATE);
});

test('§3.4 source change invalidates receipt', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  // Manifest with a real production source file we can mutate in the temp root.
  const srcRel = 'prod.js';
  await writeFile(path.join(root, srcRel), 'v1\n', 'utf8');
  const manifest = testManifest('out', {
    productionSourcePaths: [srcRel],
  });
  const broker = createValidationBroker(manifest, { root, outputRoot });
  const before = await broker.computeGateDigests();
  const receipt = createFastGateReceipt({
    routeDigest: before.routeDigest,
    regressionDigest: before.regressionDigest,
    candidateDigest: before.candidateDigest,
  });
  await publishFastGateReceipt({ outputRoot, receipt });

  await writeFile(path.join(root, srcRel), 'v2-changed\n', 'utf8');
  const after = await broker.computeGateDigests();
  assert.notEqual(before.routeDigest, after.routeDigest, 'source change must change production digest');

  const gate = evaluateAcceptanceGate({
    mode: 'acceptance',
    explicitAcceptance: true,
    receipt,
    currentRouteDigest: after.routeDigest,
    currentRegressionDigest: after.regressionDigest,
  });
  assert.equal(gate.pass, false);
  assert.equal(gate.reason, 'fast-receipt-source-digest-stale');
});

test('§3.4b binary source digests distinguish invalid UTF-8 byte sequences', async (t) => {
  const root = await tempRoot(t);
  const asset = path.join(root, 'candidate.glb');
  await writeFile(asset, Buffer.from([0x80]));
  const first = await digestSourcePaths(root, ['candidate.glb']);
  await writeFile(asset, Buffer.from([0x81]));
  const second = await digestSourcePaths(root, ['candidate.glb']);
  assert.notEqual(first, second, 'candidate identity must hash exact bytes rather than decoded text');
});

test('§3.5 regression change can acknowledge latest failure fingerprint', async () => {
  const failure = primaryFailure({ failureFingerprint: 'ack-me' });
  const blocked = evaluateFastGate({
    latestFailure: failure,
    currentRegressionDigest: 'regression-before',
  });
  assert.equal(blocked.pass, false);
  assert.equal(blocked.status, STATUS.BLOCKED_UNRESOLVED_FAILURE);

  const covered = evaluateFastGate({
    latestFailure: failure,
    currentRegressionDigest: 'regression-after',
  });
  assert.equal(covered.pass, true);
  assert.equal(covered.acknowledgesFailureFingerprint, 'ack-me');
  assert.equal(covered.reason, 'new-regression-covers-latest-failure');

  const receipt = createFastGateReceipt({
    generatedAt: '2026-07-23T17:00:00.000Z',
    routeDigest: 'route-before',
    regressionDigest: 'regression-after',
    acknowledgesFailureFingerprint: 'ack-me',
  });
  const accept = evaluateAcceptanceGate({
    mode: 'acceptance',
    explicitAcceptance: true,
    receipt,
    latestFailure: failure,
    currentRouteDigest: 'route-before',
    currentRegressionDigest: 'regression-after',
  });
  assert.equal(accept.pass, true);
  assert.equal(accept.resolvesFailure, true);
});

test('§3.6 concurrent run lock is exclusive', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const broker = createValidationBroker(testManifest('out'), { root, outputRoot });
  const first = await broker.acquireRunLock();
  assert.ok(first?.lockToken);
  const second = await broker.acquireRunLock();
  assert.equal(second, null, 'second concurrent lock must be blocked');
  await broker.releaseRunLock(first.lockToken);
  const third = await broker.acquireRunLock();
  assert.ok(third?.lockToken, 'lock is available after release');
  await broker.releaseRunLock(third.lockToken);
});

test('§3.7 direct raw acceptance fails closed without broker claim', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const manifest = testManifest('out', {
    id: 'massline-live-like',
    requireBrokerClaim: true,
  });

  const denied = await requireBrokerClaimOrDiagnostic({
    outputRoot,
    manifest,
    tokenOrPath: null,
    diagnostic: false,
    explicitDiagnostic: false,
  });
  assert.equal(denied.ok, false);
  assert.match(denied.reason, /broker-claim/);

  // Diagnostic bypass is opt-in and non-promoting.
  const diag = await requireBrokerClaimOrDiagnostic({
    outputRoot,
    manifest,
    tokenOrPath: null,
    diagnostic: true,
    explicitDiagnostic: true,
  });
  assert.equal(diag.ok, true);
  assert.equal(diag.primaryAcceptance, false);
  assert.equal(diag.diagnostic, true);

  // One-use claim authorizes once, then fails on reuse.
  const issued = await issueBrokerClaim({ outputRoot, manifest });
  const first = await validateBrokerClaim({
    outputRoot,
    manifest,
    tokenOrPath: issued.claimPath,
  });
  assert.equal(first.ok, true);
  await consumeBrokerClaim({ outputRoot, tokenOrPath: issued.claimPath });
  const reused = await validateBrokerClaim({
    outputRoot,
    manifest,
    tokenOrPath: issued.claimPath,
  });
  assert.equal(reused.ok, false);
  assert.equal(reused.reason, 'broker-claim-already-consumed');
});

test('§3.8 timeout cleanup is covered by process-control suite (cross-ref)', async () => {
  // Discrete pointer: full proof lives in test/validation-process-control.test.mjs
  // so this suite stays free of long sleeps while still documenting the acceptance item.
  const source = await readFile(
    new URL('./validation-process-control.test.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /runWithTimeout kills a long-running child/);
  assert.match(source, /timedOut/);
  const ctrl = await import('../scripts/lib/validationProcessControl.mjs');
  assert.equal(typeof ctrl.runWithTimeout, 'function');
  assert.equal(typeof ctrl.killProcessTree, 'function');
});

test('§3.9 PQ-017 public exports remain broker-backed (compatibility surface)', async () => {
  const guard = await import('../scripts/lib/pq017ProbeIterationGuard.mjs');
  assert.equal(typeof guard.evaluatePq017FastGate, 'function');
  assert.equal(typeof guard.createPq017FastGateReceipt, 'function');
  assert.equal(typeof guard.assertPq017ProbeLaunch, 'function');
  assert.equal(typeof guard.digestPq017Sources, 'function');
  const digest = guard.digestPq017Sources({ a: '1', b: '2' });
  assert.equal(digest, computeSourceSetDigest({ b: '2', a: '1' }));
  const receipt = guard.createPq017FastGateReceipt({
    routeDigest: 'r',
    regressionDigest: 'g',
  });
  assert.equal(receipt.schema, 'spaceface.pq017-fast-gate.v1');
});

test('§3.10 Massline automation records a fixed seed (no wall-clock seed path)', async () => {
  assert.equal(MASSLINE_LIVE_FIXED_SEED, 47017);
  const probeSource = await readFile(
    new URL('../scripts/probe-massline2-live.mjs', import.meta.url),
    'utf8',
  );
  assert.match(probeSource, /MASSLINE_LIVE_FIXED_SEED/);
  assert.match(probeSource, /#sf-ng-seed/);
  assert.match(probeSource, /FIXED_SEED/);
  assert.match(probeSource, /fixedSeed/);
  assert.match(probeSource, /requireBrokerClaimOrDiagnostic/);
  assert.doesNotMatch(
    probeSource,
    /fill\('#sf-ng-seed',\s*String\(Date\.now/,
  );
  // package script goes through the broker, not the raw probe.
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(
    packageJson.scripts['check:massline2:live'],
    /validation-broker-cli\.mjs --manifest massline-live/,
  );
});

// ---------------------------------------------------------------------------
// Additional structural / status-code coverage
// ---------------------------------------------------------------------------

test('failure identity is stable across volatile samples', () => {
  const base = {
    runtimeKind: 'browser',
    phase: 'massline-delivery',
    error: 'NORMAL_ROUTE_BLOCKED: normal flight did not settle within 156118ms',
    routeFailure: {
      code: 'point-arrival-timeout',
      waypointPhase: 'launch',
      decision: { action: 'approach', reason: 'within-speed-envelope' },
      routeSafety: { reason: null, constraintType: null },
      tick: 100,
      distance: 1.5,
    },
  };
  const a = deriveFailureIdentity(base);
  const b = deriveFailureIdentity({
    ...base,
    error: 'NORMAL_ROUTE_BLOCKED: normal flight did not settle within 999ms',
    routeFailure: { ...base.routeFailure, tick: 9999, distance: 88 },
  });
  assert.equal(a.fingerprint, b.fingerprint);
});

test('candidate/build/scenario/input/profile/manifest digests are present on gate digests', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const broker = createValidationBroker(testManifest('out', {
    scenarioPaths: [],
    fixedSeed: 99,
    runtimeProfile: 'lab-profile',
  }), { root, outputRoot });
  const digests = await broker.computeGateDigests();
  for (const key of [
    'routeDigest',
    'regressionDigest',
    'productionDigest',
    'harnessDigest',
    'scenarioDigest',
    'inputDigest',
    'profileDigest',
    'manifestDigest',
    'candidateDigest',
    'buildDigest',
  ]) {
    assert.match(digests[key], /^[a-f0-9]{64}$/, key);
  }
});

test('diagnostic mode is non-promoting and cannot erase unresolved primary failure', async () => {
  const failure = primaryFailure();
  const receipt = createFastGateReceipt({
    generatedAt: '2026-07-23T17:00:00.000Z',
    routeDigest: 'route-before',
    regressionDigest: 'regression-before',
    acknowledgesFailureFingerprint: failure.failureFingerprint,
  });
  const result = evaluateAcceptanceGate({
    mode: 'diagnostic',
    explicitDiagnostic: true,
    receipt,
    latestFailure: failure,
    currentRouteDigest: 'route-before',
    currentRegressionDigest: 'regression-before',
  });
  assert.equal(result.pass, true);
  assert.equal(result.primaryAcceptance, false);
  assert.equal(result.resolvesFailure, false);
  assert.equal(result.reason, 'diagnostic-nonpromoting');
});

test('launch counts increment on assertProbeLaunch success path', async (t) => {
  resetLaunchCountsForTests();
  const root = repoRoot;
  const outputRoot = await tempRoot(t);
  // Use PQ-017 digests from the real repo so computeGateDigests works.
  const {
    computePq017GateDigests,
    createPq017FastGateReceipt,
    publishPq017FastGateReceipt,
    assertPq017ProbeLaunch,
    completePq017ProbeClaim,
    issuePq017AcceptanceClaim,
  } = await import('../scripts/lib/pq017ProbeIterationGuard.mjs');
  const digests = await computePq017GateDigests({ root });
  await publishPq017FastGateReceipt({
    outputRoot,
    receipt: createPq017FastGateReceipt(digests),
  });
  // G3: caller issues claim; assert never self-mints acceptance claims.
  const issued = await issuePq017AcceptanceClaim({ root, outputRoot });
  const launch = await assertPq017ProbeLaunch({
    root,
    outputRoot,
    runtimeKind: 'browser',
    mode: 'acceptance',
    explicitAcceptance: true,
    brokerClaimToken: issued.claimPath,
  });
  assert.ok(launch.claimToken);
  await completePq017ProbeClaim({ outputRoot, claimToken: launch.claimToken });
  // PQ-017 assert path does not go through recordLaunch in the compatibility façade;
  // broker assertProbeLaunch does. Verify broker path:
  resetLaunchCountsForTests();
  const manifest = testManifest('broker-out', {
    productionSourcePaths: [],
    regressionSourcePaths: [],
    requireBrokerClaim: false,
  });
  const brokerOut = await tempRoot(t);
  const broker = createValidationBroker(manifest, { root: brokerOut, outputRoot: brokerOut });
  const d = await broker.computeGateDigests();
  await broker.publishFastGateReceipt(createFastGateReceipt({
    routeDigest: d.routeDigest,
    regressionDigest: d.regressionDigest,
    candidateDigest: d.candidateDigest,
    profileDigest: d.profileDigest,
  }));
  const bl = await broker.assertProbeLaunch({
    runtimeKind: 'browser',
    mode: 'acceptance',
    explicitAcceptance: true,
  });
  assert.ok(bl.claimToken);
  const counts = getLaunchCounts();
  assert.equal(counts.global, 1);
  assert.equal(counts.browser, 1);
  assert.equal(counts.byProbe['unit-test-probe'], 1);
  await broker.completeProbeClaim(bl.claimToken);
});

test('status codes include timeout/infra/profile/nondeterministic vocabulary', () => {
  for (const key of [
    'PASS', 'FAIL', 'BLOCKED_REPEAT', 'BLOCKED_MISSING_FAST_RECEIPT',
    'BLOCKED_STALE_CANDIDATE', 'BLOCKED_UNRESOLVED_FAILURE', 'TIMEOUT',
    'INFRA_ERROR', 'NONDETERMINISTIC', 'PROFILE_MISMATCH', 'CACHED_UNCHANGED',
  ]) {
    assert.equal(typeof STATUS[key], 'string');
  }
});

// ---------------------------------------------------------------------------
// Phase 1 adversarial-review failure modes (P1 + P2) — would have caught bugs
// ---------------------------------------------------------------------------

test('P1 FIX1: failing fastGateCommands block receipt mint; passing gates mint', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');

  const failing = createValidationBroker(testManifest('out', {
    id: 'fast-gate-fail-probe',
    // Direct argv form avoids shell quoting differences across platforms.
    fastGateCommands: [[process.execPath, '-e', 'process.exit(7)']],
    commandArgs: ['-e', 'process.exit(0)'],
    maxLaunchesPerCandidate: 3,
  }), { root, outputRoot });

  const blocked = await failing.authorizeAndMaybeRun({
    mode: 'acceptance',
    explicitAcceptance: true,
    spawnProbe: true,
  });
  assert.equal(blocked.launched, false, 'must not launch when a fast gate fails');
  assert.equal(blocked.reason, 'fast-gate-failed');
  assert.ok(
    blocked.status === STATUS.FAIL || blocked.status === 'fail',
    `expected fail status, got ${blocked.status}`,
  );
  const receiptAfterFail = await failing.readFastGateReceipt();
  assert.equal(
    receiptAfterFail,
    null,
    'must NOT mint a fast-gate receipt when a declared fast gate fails',
  );

  const passingRoot = await tempRoot(t);
  const passingOut = path.join(passingRoot, 'out');
  const passing = createValidationBroker(testManifest('out', {
    id: 'fast-gate-pass-probe',
    fastGateCommands: [[process.execPath, '-e', 'process.exit(0)']],
    commandArgs: ['-e', 'process.exit(0)'],
  }), { root: passingRoot, outputRoot: passingOut });

  const ok = await passing.authorizeAndMaybeRun({
    mode: 'acceptance',
    explicitAcceptance: true,
    spawnProbe: false,
  });
  assert.equal(ok.status, STATUS.PASS);
  assert.equal(ok.reason, 'claim-issued');
  const receiptAfterPass = await passing.readFastGateReceipt();
  assert.ok(receiptAfterPass?.routeDigest, 'passing fast gates must allow receipt mint');
  assert.ok(ok.fastGateResults?.length >= 1);
});

test('P1 FIX2: probe nonzero exit persists latest-acceptance-failure; second run blocked_repeat', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const broker = createValidationBroker(testManifest('out', {
    id: 'persist-failure-probe',
    commandArgs: ['-e', 'console.error("CONTROLLED_PROBE_FAIL"); process.exit(3)'],
    fastGateCommands: [],
    maxLaunchesPerCandidate: 5,
  }), { root, outputRoot });

  const first = await broker.authorizeAndMaybeRun({
    mode: 'acceptance',
    explicitAcceptance: true,
    spawnProbe: true,
  });
  assert.equal(first.launched, true);
  assert.ok(first.status === STATUS.FAIL || first.exitCode === 3);

  const pointerPath = path.join(outputRoot, FAILURE_POINTER_NAME);
  const pointerRaw = await readFile(pointerPath, 'utf8');
  const pointer = JSON.parse(pointerRaw);
  assert.equal(pointer.primaryAcceptance, true);
  assert.ok(pointer.failureFingerprint, 'failure pointer must include fingerprint');
  assert.ok(pointer.routeDigest);
  assert.ok(pointer.regressionDigest);

  const second = await broker.authorizeAndMaybeRun({
    mode: 'acceptance',
    explicitAcceptance: true,
    spawnProbe: true,
  });
  assert.equal(second.launched, false, 'identical failure must not re-launch');
  assert.ok(
    second.status === STATUS.BLOCKED_REPEAT || second.status === STATUS.CACHED_UNCHANGED,
    `expected blocked_repeat/cached_unchanged, got ${second.status}`,
  );
  assert.equal(second.cached, true);
});

test('P1 FIX3: maxLaunchesPerCandidate is persisted and enforced across runs', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const srcRel = 'candidate-src.js';
  await writeFile(path.join(root, srcRel), 'launch-limit-v1\n', 'utf8');

  const broker = createValidationBroker(testManifest('out', {
    id: 'launch-limit-probe',
    productionSourcePaths: [srcRel],
    commandArgs: ['-e', 'process.exit(0)'],
    fastGateCommands: [],
    maxLaunchesPerCandidate: 1,
  }), { root, outputRoot });

  const first = await broker.authorizeAndMaybeRun({
    mode: 'acceptance',
    explicitAcceptance: true,
    spawnProbe: true,
  });
  assert.equal(first.launched, true);
  assert.equal(first.status, STATUS.PASS);

  const digests = await broker.computeGateDigests();
  assert.equal(await getCandidateLaunchCount(outputRoot, digests.candidateDigest), 1);
  const countsFile = JSON.parse(await readFile(path.join(outputRoot, LAUNCH_COUNTS_NAME), 'utf8'));
  assert.equal(countsFile.byCandidate[digests.candidateDigest], 1);

  const second = await broker.authorizeAndMaybeRun({
    mode: 'acceptance',
    explicitAcceptance: true,
    spawnProbe: true,
  });
  assert.equal(second.launched, false, 'second launch of same candidate must be blocked');
  assert.equal(second.reason, 'max-launches-per-candidate');
  assert.equal(second.status, STATUS.BLOCKED_REPEAT);

  // New source → new candidate digest → launches again.
  await writeFile(path.join(root, srcRel), 'launch-limit-v2-changed\n', 'utf8');
  const third = await broker.authorizeAndMaybeRun({
    mode: 'acceptance',
    explicitAcceptance: true,
    spawnProbe: true,
  });
  assert.equal(third.launched, true, 'new candidate digest must reset launch allowance');
  assert.equal(third.status, STATUS.PASS);
});

test('P2 FIX4: broker claim bound to candidate digests; source change rejects claim', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const srcRel = 'claim-bound.js';
  await writeFile(path.join(root, srcRel), 'claim-v1\n', 'utf8');
  const manifest = testManifest('out', {
    id: 'claim-digest-probe',
    productionSourcePaths: [srcRel],
    requireBrokerClaim: true,
  });
  const broker = createValidationBroker(manifest, { root, outputRoot });
  const before = await broker.computeGateDigests();
  const receipt = createFastGateReceipt({
    routeDigest: before.routeDigest,
    regressionDigest: before.regressionDigest,
    candidateDigest: before.candidateDigest,
    productionDigest: before.productionDigest,
  });
  const issued = await issueBrokerClaim({
    outputRoot,
    manifest,
    receipt,
    digests: before,
  });

  const ok = await validateBrokerClaim({
    outputRoot,
    manifest,
    tokenOrPath: issued.claimPath,
    root,
  });
  assert.equal(ok.ok, true, 'fresh claim must validate against current digests');

  await writeFile(path.join(root, srcRel), 'claim-v2-mutated\n', 'utf8');
  const stale = await validateBrokerClaim({
    outputRoot,
    manifest,
    tokenOrPath: issued.claimPath,
    root,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'broker-claim-stale-digest');
});

test('exact-revision claims reject dirty declared paths and become stale after another commit', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const srcRel = 'declared-owner.js';
  await writeFile(path.join(root, srcRel), 'owner-v1\n', 'utf8');
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore', windowsHide: true });
  execFileSync('git', ['-c', 'user.name=SpaceFace Tests', '-c', 'user.email=tests@spaceface.invalid',
    'add', srcRel], { cwd: root, stdio: 'ignore', windowsHide: true });
  execFileSync('git', ['-c', 'user.name=SpaceFace Tests', '-c', 'user.email=tests@spaceface.invalid',
    'commit', '-m', 'fixture one'], { cwd: root, stdio: 'ignore', windowsHide: true });
  const manifest = testManifest('out', {
    id: 'revision-bound-probe',
    productionSourcePaths: [srcRel],
    requireBrokerClaim: true,
    bindGitRevision: true,
  });
  const broker = createValidationBroker(manifest, { root, outputRoot });
  const before = await broker.computeGateDigests();
  assert.match(before.gitCommit, /^[0-9a-f]{40}$/);
  const issued = await issueBrokerClaim({
    outputRoot,
    manifest,
    digests: before,
    receipt: createFastGateReceipt({
      routeDigest: before.routeDigest,
      regressionDigest: before.regressionDigest,
      candidateDigest: before.candidateDigest,
    }),
  });

  await writeFile(path.join(root, srcRel), 'owner-dirty\n', 'utf8');
  await assert.rejects(
    broker.computeGateDigests(),
    /VALIDATION_ACCEPTANCE_WORKTREE_DIRTY/,
    'acceptance authorization must reject dirty declared owner paths',
  );
  await writeFile(path.join(root, srcRel), 'owner-v1\n', 'utf8');
  await writeFile(path.join(root, 'unrelated.txt'), 'new revision\n', 'utf8');
  execFileSync('git', ['add', 'unrelated.txt'], {
    cwd: root,
    stdio: 'ignore',
    windowsHide: true,
  });
  execFileSync('git', ['-c', 'user.name=SpaceFace Tests', '-c', 'user.email=tests@spaceface.invalid',
    'commit', '-m', 'fixture two'], { cwd: root, stdio: 'ignore', windowsHide: true });
  const after = await broker.computeGateDigests();
  assert.notEqual(after.gitCommit, before.gitCommit);
  assert.equal(after.productionDigest, before.productionDigest);
  assert.notEqual(after.candidateDigest, before.candidateDigest);
  const stale = await validateBrokerClaim({
    outputRoot,
    manifest,
    tokenOrPath: issued.claimPath,
    root,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'broker-claim-stale-digest');
});

test('P2 FIX5: second consumeBrokerClaim is rejected (atomic one-use)', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const manifest = testManifest('out', { id: 'atomic-claim-probe' });
  const digests = await createValidationBroker(manifest, { root, outputRoot }).computeGateDigests();
  const issued = await issueBrokerClaim({
    outputRoot,
    manifest,
    digests,
    receipt: createFastGateReceipt({
      routeDigest: digests.routeDigest,
      regressionDigest: digests.regressionDigest,
      candidateDigest: digests.candidateDigest,
    }),
  });

  const first = await consumeBrokerClaim({ outputRoot, tokenOrPath: issued.claimPath });
  // L2/L7: consume returns claim identity object (truthy), not bare true.
  assert.ok(first);
  assert.equal(first.claimId, issued.claimId);
  const second = await consumeBrokerClaim({ outputRoot, tokenOrPath: issued.claimPath });
  assert.equal(second, false, 'atomic sentinel must reject second consumer');

  const validated = await validateBrokerClaim({
    outputRoot,
    manifest,
    tokenOrPath: issued.claimPath,
    root,
  });
  assert.equal(validated.ok, false);
  assert.equal(validated.reason, 'broker-claim-already-consumed');
});

test('P2 FIX6: dead-owner run lock is reclaimed; live-owner lock stays held', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');

  // Dead PID lock (use a PID that is almost certainly not alive).
  const deadPid = 2_147_000_000;
  assert.equal(isPidAlive(deadPid), false, 'fixture dead PID must not be alive');
  await writeJsonAtomically(path.join(outputRoot, FAST_RUN_LOCK_NAME), {
    schema: 'spaceface.validation-run-lock.v1',
    acquiredAt: new Date().toISOString(),
    lockToken: `${deadPid}-deadfixture`,
    pid: deadPid,
  });

  const reclaimed = await acquireRunLock({
    outputRoot,
    lockSchema: 'spaceface.validation-run-lock.v1',
    timeoutMs: 5_000,
  });
  assert.ok(reclaimed?.lockToken, 'dead-owner lock must be reclaimed');

  // Live owner (this process) — second acquire must fail without reclaim.
  const liveHeld = await acquireRunLock({
    outputRoot,
    lockSchema: 'spaceface.validation-run-lock.v1',
    timeoutMs: 5_000,
  });
  assert.equal(liveHeld, null, 'live-owner lock must not be reclaimed');

  // Explicit reclaim helper agrees the owner is alive.
  const tryLive = await tryReclaimStaleRunLock({
    outputRoot,
    timeoutMs: 5_000,
    log: null,
  });
  assert.equal(tryLive.reclaimed, false);
  assert.equal(tryLive.reason, 'owner-alive');

  // Release via matching token from first reclaim, then clean up.
  const { releaseRunLock } = await import('../scripts/lib/validationBroker.mjs');
  await releaseRunLock({ outputRoot, lockToken: reclaimed.lockToken });
});

// ---------------------------------------------------------------------------
// Phase 1 FIX2 — second-order concurrency / digest correctness (P1 + P2)
// ---------------------------------------------------------------------------

test('P1 FIX7: concurrent dead-owner reclaim is atomic; successor lock is not deleted', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(outputRoot, { recursive: true });

  const deadPid = 2_147_000_001;
  assert.equal(isPidAlive(deadPid), false);
  const deadToken = `${deadPid}-shared-stale`;
  const lockPath = path.join(outputRoot, FAST_RUN_LOCK_NAME);
  await writeJsonAtomically(lockPath, {
    schema: 'spaceface.validation-run-lock.v1',
    acquiredAt: new Date().toISOString(),
    lockToken: deadToken,
    pid: deadPid,
  });

  // Two reclaimers race on the same stale lock; O_EXCL leadership ⇒ exactly one wins.
  const [a, b] = await Promise.all([
    tryReclaimStaleRunLock({ outputRoot, timeoutMs: 5_000, log: null }),
    tryReclaimStaleRunLock({ outputRoot, timeoutMs: 5_000, log: null }),
  ]);
  const winners = [a, b].filter((r) => r.reclaimed);
  const losers = [a, b].filter((r) => !r.reclaimed);
  assert.equal(winners.length, 1, 'exactly one reclaimer must win the leadership race');
  assert.equal(losers.length, 1);
  assert.ok(
    losers[0].reason === 'reclaim-race-lost' || losers[0].reason === 'lock-missing',
    `loser reason should be race/missing, got ${losers[0].reason}`,
  );

  // Winner acquires a live successor lock.
  const successor = await acquireRunLock({
    outputRoot,
    lockSchema: 'spaceface.validation-run-lock.v1',
    timeoutMs: 5_000,
  });
  assert.ok(successor?.lockToken, 'successor lock must be acquirable after reclaim');
  const successorRaw = await readFile(lockPath, 'utf8');
  const successorLock = JSON.parse(successorRaw);
  assert.equal(successorLock.lockToken, successor.lockToken);

  // Stale second-hand reclaim against the OLD dead token must NOT delete the successor.
  const staleAttempt = await atomicReclaimLockFile(lockPath, {
    expectedLockToken: deadToken,
  });
  assert.equal(staleAttempt.reclaimed, false, 'token mismatch must refuse delete');
  assert.equal(staleAttempt.reason, 'token-mismatch');
  const stillThere = JSON.parse(await readFile(lockPath, 'utf8'));
  assert.equal(
    stillThere.lockToken,
    successor.lockToken,
    'successor live lock must survive stale reclaim attempt',
  );

  const { releaseRunLock } = await import('../scripts/lib/validationBroker.mjs');
  await releaseRunLock({ outputRoot, lockToken: successor.lockToken });
});

test('P1 FIX8: diagnostic failure is non-promoting; acceptance is not blocked', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const broker = createValidationBroker(testManifest('out', {
    id: 'diag-nonpromoting-probe',
    commandArgs: ['-e', 'console.error("DIAG_FAIL"); process.exit(4)'],
    fastGateCommands: [],
    maxLaunchesPerCandidate: 5,
  }), { root, outputRoot });

  const diagnostic = await broker.authorizeAndMaybeRun({
    mode: 'diagnostic',
    explicitDiagnostic: true,
    spawnProbe: true,
  });
  assert.equal(diagnostic.launched, true);
  assert.ok(diagnostic.status === STATUS.FAIL || diagnostic.exitCode === 4);

  // No primary acceptance failure pointer may be written.
  let pointerExists = true;
  try {
    await readFile(path.join(outputRoot, FAILURE_POINTER_NAME), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') pointerExists = false;
    else throw error;
  }
  assert.equal(pointerExists, false, 'diagnostic must not write primary acceptance failure');

  // Acceptance run with a passing probe must not be blocked by the diagnostic.
  const accepting = createValidationBroker(testManifest('out', {
    id: 'diag-nonpromoting-probe',
    commandArgs: ['-e', 'process.exit(0)'],
    fastGateCommands: [],
    maxLaunchesPerCandidate: 5,
  }), { root, outputRoot });
  const acceptance = await accepting.authorizeAndMaybeRun({
    mode: 'acceptance',
    explicitAcceptance: true,
    spawnProbe: true,
  });
  assert.equal(acceptance.launched, true, 'acceptance must not be blocked by diagnostic failure');
  assert.equal(acceptance.status, STATUS.PASS);
  assert.notEqual(acceptance.status, STATUS.BLOCKED_REPEAT);
});

test('P1 FIX9: launch count is reserved on spawn before child completes', async (t) => {
  resetLaunchCountsForTests();
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  // Long-running child so we can observe the count mid-flight.
  // Peer must share the same commandArgs so candidateDigest matches.
  const sharedManifest = testManifest('out', {
    id: 'pre-spawn-reserve-probe',
    commandArgs: ['-e', 'setTimeout(() => process.exit(0), 2500)'],
    fastGateCommands: [],
    maxLaunchesPerCandidate: 1,
    timeoutMs: 15_000,
  });
  const broker = createValidationBroker(sharedManifest, { root, outputRoot });

  const digestsPromise = broker.computeGateDigests();
  const runPromise = broker.authorizeAndMaybeRun({
    mode: 'acceptance',
    explicitAcceptance: true,
    spawnProbe: true,
  });

  const digests = await digestsPromise;
  // Poll until launch count is reserved while the child is still running.
  let reserved = 0;
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    reserved = await getCandidateLaunchCount(outputRoot, digests.candidateDigest);
    if (reserved >= 1) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(reserved, 1, 'launch count must be incremented before child exit');

  const first = await runPromise;
  assert.equal(first.launched, true);
  assert.equal(first.status, STATUS.PASS);
  assert.equal(await getCandidateLaunchCount(outputRoot, digests.candidateDigest), 1);

  // Second broker with the same candidate must see the budget already consumed.
  const peer = createValidationBroker(sharedManifest, { root, outputRoot });
  const second = await peer.authorizeAndMaybeRun({
    mode: 'acceptance',
    explicitAcceptance: true,
    spawnProbe: true,
  });
  assert.equal(second.launched, false);
  assert.equal(second.reason, 'max-launches-per-candidate');
});

test('P1 FIX10: evaluateCachedResult uses full candidateDigest (harness change unlocks)', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const harnessRel = 'harness-only.js';
  await writeFile(path.join(root, harnessRel), 'harness-A\n', 'utf8');

  const manifestA = testManifest('out', {
    id: 'candidate-digest-probe',
    harnessSourcePaths: [harnessRel],
    productionSourcePaths: [],
    regressionSourcePaths: [],
  });
  const brokerA = createValidationBroker(manifestA, { root, outputRoot });
  const digestsA = await brokerA.computeGateDigests();

  await persistFailure({
    outputRoot,
    failure: primaryFailure({
      routeDigest: digestsA.routeDigest,
      regressionDigest: digestsA.regressionDigest,
      candidateDigest: digestsA.candidateDigest,
      failureFingerprint: 'fp-candidate-A',
    }),
  });

  // Unchanged candidate → blocked_repeat.
  const blocked = await evaluateCachedResult({
    root,
    outputRoot,
    manifest: brokerA.manifest,
  });
  assert.equal(blocked.blocked, true);
  assert.ok(
    blocked.status === STATUS.BLOCKED_REPEAT || blocked.status === STATUS.CACHED_UNCHANGED,
  );

  // compactFailurePointer must retain candidateDigest.
  const pointer = compactFailurePointer(primaryFailure({
    candidateDigest: digestsA.candidateDigest,
    routeDigest: digestsA.routeDigest,
    regressionDigest: digestsA.regressionDigest,
  }));
  assert.equal(pointer.candidateDigest, digestsA.candidateDigest);

  // Harness-only change → candidateDigest B, route/regression may stay identical.
  await writeFile(path.join(root, harnessRel), 'harness-B-changed\n', 'utf8');
  const brokerB = createValidationBroker(manifestA, { root, outputRoot });
  const digestsB = await brokerB.computeGateDigests();
  assert.notEqual(digestsB.candidateDigest, digestsA.candidateDigest);
  assert.equal(digestsB.routeDigest, digestsA.routeDigest);
  assert.equal(digestsB.regressionDigest, digestsA.regressionDigest);

  const unlocked = await evaluateCachedResult({
    root,
    outputRoot,
    manifest: brokerB.manifest,
  });
  assert.equal(unlocked.blocked, false, 'changed candidateDigest must not blocked_repeat');
  assert.equal(unlocked.reason, 'candidate-digest-changed');
});

test('P2 FIX11: diagnostic run does not consume acceptance launch budget', async (t) => {
  resetLaunchCountsForTests();
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const common = {
    id: 'diag-quota-probe',
    commandArgs: ['-e', 'process.exit(0)'],
    fastGateCommands: [],
    maxLaunchesPerCandidate: 1,
  };

  const diag = createValidationBroker(testManifest('out', common), { root, outputRoot });
  const digests = await diag.computeGateDigests();
  const diagnostic = await diag.authorizeAndMaybeRun({
    mode: 'diagnostic',
    explicitDiagnostic: true,
    spawnProbe: true,
  });
  assert.equal(diagnostic.launched, true);
  assert.equal(
    await getCandidateLaunchCount(outputRoot, digests.candidateDigest),
    0,
    'diagnostic must not increment acceptance launch count',
  );

  const accept = createValidationBroker(testManifest('out', common), { root, outputRoot });
  const first = await accept.authorizeAndMaybeRun({
    mode: 'acceptance',
    explicitAcceptance: true,
    spawnProbe: true,
  });
  assert.equal(first.launched, true, 'acceptance budget must still be available after diagnostic');
  assert.equal(first.status, STATUS.PASS);
  assert.equal(await getCandidateLaunchCount(outputRoot, digests.candidateDigest), 1);
});

test('P2 FIX12: byCandidate counts are merged (A→B→A retains A)', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(outputRoot, { recursive: true });

  assert.equal(await incrementCandidateLaunchCount(outputRoot, 'digest-A'), 1);
  assert.equal(await incrementCandidateLaunchCount(outputRoot, 'digest-B'), 1);
  assert.equal(await incrementCandidateLaunchCount(outputRoot, 'digest-A'), 2);

  const counts = JSON.parse(await readFile(path.join(outputRoot, LAUNCH_COUNTS_NAME), 'utf8'));
  assert.equal(counts.byCandidate['digest-A'], 2);
  assert.equal(counts.byCandidate['digest-B'], 1, 'prior candidate B must be retained');
});

test('P2 FIX13: corrupt partial lock is reclaimed without crash', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(outputRoot, { recursive: true });
  const lockPath = path.join(outputRoot, FAST_RUN_LOCK_NAME);
  // Simulate open(wx) succeeded but JSON write never completed.
  await writeFile(lockPath, '{ "schema": "partial", "lockToken":', 'utf8');

  const reclaimed = await tryReclaimStaleRunLock({
    outputRoot,
    timeoutMs: 5_000,
    log: null,
  });
  assert.equal(reclaimed.reclaimed, true);
  assert.equal(reclaimed.reason, 'corrupt-or-unreadable-lock');

  const acquired = await acquireRunLock({
    outputRoot,
    lockSchema: 'spaceface.validation-run-lock.v1',
    timeoutMs: 5_000,
  });
  assert.ok(acquired?.lockToken, 'must acquire after corrupt-lock reclaim');
  const { releaseRunLock } = await import('../scripts/lib/validationBroker.mjs');
  await releaseRunLock({ outputRoot, lockToken: acquired.lockToken });
});

test('P2 FIX14: fastGateTimeoutMs is normalized and included in manifest digest', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const base = testManifest('out', {
    id: 'fast-gate-timeout-probe',
    timeoutMs: 600_000,
    fastGateTimeoutMs: 12_345,
  });
  const broker = createValidationBroker(base, { root, outputRoot });
  assert.equal(broker.manifest.fastGateTimeoutMs, 12_345);

  const d1 = await broker.computeGateDigests();
  const broker2 = createValidationBroker({
    ...base,
    fastGateTimeoutMs: 54_321,
  }, { root, outputRoot });
  assert.equal(broker2.manifest.fastGateTimeoutMs, 54_321);
  const d2 = await broker2.computeGateDigests();
  assert.notEqual(
    d1.manifestDigest,
    d2.manifestDigest,
    'fastGateTimeoutMs change must alter manifestDigest',
  );
  assert.notEqual(
    d1.candidateDigest,
    d2.candidateDigest,
    'fastGateTimeoutMs change must alter candidateDigest',
  );

  // Default when omitted: min(timeoutMs, 180_000)
  const brokerDefault = createValidationBroker(testManifest('out', {
    id: 'fast-gate-timeout-default',
    timeoutMs: 600_000,
  }), { root, outputRoot });
  assert.equal(brokerDefault.manifest.fastGateTimeoutMs, 180_000);
});

// ---------------------------------------------------------------------------
// Phase 1 FIX3 — third-pass concurrency / accounting (P1 + P2)
// ---------------------------------------------------------------------------

test('P1 FIX16: young empty leadership marker is backed off, not deleted', async (t) => {
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const { mkdir, utimes } = await import('node:fs/promises');
  await mkdir(outputRoot, { recursive: true });

  const lockPath = path.join(outputRoot, FAST_RUN_LOCK_NAME);
  const leadershipPath = `${lockPath}.reclaiming`;
  const deadToken = '2147000002-init-grace';
  await writeJsonAtomically(lockPath, {
    schema: 'spaceface.validation-run-lock.v1',
    acquiredAt: new Date().toISOString(),
    lockToken: deadToken,
    pid: 2_147_000_002,
  });

  // Simulate mid-init: O_EXCL open created the file; PID write has not completed.
  await writeFile(leadershipPath, '', 'utf8');

  const young = await atomicReclaimLockFile(lockPath, {
    expectedLockToken: deadToken,
  });
  assert.equal(young.reclaimed, false, 'young empty marker must not be reclaimed');
  assert.equal(young.reason, 'reclaim-race-lost');

  // Marker must still exist (not deleted as "corrupt").
  const stillEmpty = await readFile(leadershipPath, 'utf8');
  assert.equal(stillEmpty, '');
  // Live lock must also survive.
  const lockStill = JSON.parse(await readFile(lockPath, 'utf8'));
  assert.equal(lockStill.lockToken, deadToken);

  // Age the incomplete marker past the grace window → reclaimable.
  assert.ok(LEADERSHIP_INIT_GRACE_MS > 0);
  const past = new Date(Date.now() - LEADERSHIP_INIT_GRACE_MS - 1_000);
  await utimes(leadershipPath, past, past);

  const aged = await atomicReclaimLockFile(lockPath, {
    expectedLockToken: deadToken,
  });
  assert.equal(aged.reclaimed, true, 'aged empty marker must be reclaimable');
  assert.ok(
    aged.reason === 'compare-and-delete' || aged.reason === 'corrupt-or-unreadable-lock',
    `unexpected aged reclaim reason: ${aged.reason}`,
  );

  // Leadership marker cleaned up after successful reclaim.
  let leadershipGone = false;
  try {
    await readFile(leadershipPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') leadershipGone = true;
    else throw error;
  }
  assert.equal(leadershipGone, true, 'leadership marker must be removed after reclaim');
});

test('P2 FIX17: diagnostic records launch accounting but not acceptance quota', async (t) => {
  resetLaunchCountsForTests();
  const root = await tempRoot(t);
  const outputRoot = path.join(root, 'out');
  const common = {
    id: 'diag-accounting-probe',
    commandArgs: ['-e', 'process.exit(0)'],
    fastGateCommands: [],
    maxLaunchesPerCandidate: 1,
  };

  const diag = createValidationBroker(testManifest('out', common), { root, outputRoot });
  const digests = await diag.computeGateDigests();
  const beforeQuota = await getCandidateLaunchCount(outputRoot, digests.candidateDigest);
  assert.equal(beforeQuota, 0);

  const diagnostic = await diag.authorizeAndMaybeRun({
    mode: 'diagnostic',
    explicitDiagnostic: true,
    spawnProbe: true,
  });
  assert.equal(diagnostic.launched, true);
  assert.equal(diagnostic.status, STATUS.PASS);

  const counts = getLaunchCounts();
  assert.ok(counts.global >= 1, 'diagnostic must call recordLaunch for accounting');
  assert.equal(
    counts.byProbe['diag-accounting-probe'] >= 1,
    true,
    'byProbe must reflect the diagnostic launch',
  );
  assert.equal(
    await getCandidateLaunchCount(outputRoot, digests.candidateDigest),
    0,
    'diagnostic must not charge acceptance quota',
  );
});
