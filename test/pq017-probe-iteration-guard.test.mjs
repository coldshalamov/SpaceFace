import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const guardUrl = new URL('../scripts/lib/pq017ProbeIterationGuard.mjs', import.meta.url);
const repoRoot = new URL('../', import.meta.url);

async function loadGuard() {
  try {
    return await import(guardUrl);
  } catch (error) {
    assert.fail(`PQ-017 iteration guard is missing: ${error?.message || error}`);
  }
}

function primaryFailure(overrides = {}) {
  return {
    generatedAt: '2026-07-23T16:00:00.000Z',
    runtimeKind: 'electron',
    primaryAcceptance: true,
    regressionDigest: 'regression-before',
    routeDigest: 'route-before',
    failureFingerprint: 'known-fingerprint',
    ...overrides,
  };
}

test('PQ-017 failure fingerprints ignore volatile samples but retain causal controller identity', async () => {
  const { derivePq017FailureIdentity } = await loadGuard();
  const report = {
    runtimeKind: 'electron',
    phase: 'massline-delivery',
    error: 'NORMAL_ROUTE_BLOCKED: normal flight did not settle within 156118ms',
    routeFailure: {
      code: 'point-arrival-timeout',
      waypointPhase: 'launch',
      within: 0.75,
      decision: { action: 'approach', reason: 'within-speed-envelope' },
      routeSafety: { reason: null, constraintType: null },
      tick: 13_896,
      distance: 6.684769807817998,
    },
  };
  const first = derivePq017FailureIdentity(report);
  const jittered = derivePq017FailureIdentity({
    ...report,
    error: 'NORMAL_ROUTE_BLOCKED: normal flight did not settle within 147879ms',
    routeFailure: {
      ...report.routeFailure,
      tick: 99_999,
      distance: 31.15690088281566,
    },
  });
  assert.equal(first.fingerprint, jittered.fingerprint);
  assert.equal(first.family,
    'electron/massline-delivery/point-arrival-timeout/launch/approach/within-speed-envelope');

  const changedCause = derivePq017FailureIdentity({
    ...report,
    routeFailure: {
      ...report.routeFailure,
      decision: { action: 'velocity-align', reason: 'tight-waypoint-velocity-align' },
    },
  });
  assert.notEqual(changedCause.fingerprint, first.fingerprint);
});

test('PQ-017 source digests are order-stable and content-sensitive', async () => {
  const { digestPq017Sources } = await loadGuard();
  const first = digestPq017Sources({ route: 'alpha', regression: 'beta' });
  const reordered = digestPq017Sources({ regression: 'beta', route: 'alpha' });
  const changed = digestPq017Sources({ route: 'alpha!', regression: 'beta' });
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('PQ-017 unstructured route failures retain a stable causal reason prefix', async () => {
  const { derivePq017FailureIdentity } = await loadGuard();
  const disappeared = derivePq017FailureIdentity({
    runtimeKind: 'browser',
    phase: 'massline-delivery',
    error: 'NORMAL_ROUTE_BLOCKED: released payload disappeared at tick 7715',
  });
  const jittered = derivePq017FailureIdentity({
    runtimeKind: 'browser',
    phase: 'massline-delivery',
    error: 'NORMAL_ROUTE_BLOCKED: released payload disappeared at tick 99999',
  });
  const unexpectedImpact = derivePq017FailureIdentity({
    runtimeKind: 'browser',
    phase: 'massline-delivery',
    error: 'NORMAL_ROUTE_BLOCKED: impact receipt unexpectedly appeared at tick 7715',
  });
  assert.equal(disappeared.fingerprint, jittered.fingerprint);
  assert.notEqual(disappeared.fingerprint, unexpectedImpact.fingerprint);
  assert.equal(disappeared.family,
    'browser/massline-delivery/normal-route-blocked/none/none/released-payload-disappeared-at-tick');
});

test('PQ-017 fast gate refuses an unchanged regression after an unresolved acceptance failure', async () => {
  const { evaluatePq017FastGate } = await loadGuard();
  const unchanged = evaluatePq017FastGate({
    latestFailure: primaryFailure(),
    acceptedGeneratedAt: '2026-07-23T15:00:00.000Z',
    currentRegressionDigest: 'regression-before',
  });
  assert.deepEqual(unchanged, {
    pass: false,
    reason: 'regression-required-after-acceptance-failure',
    acknowledgesFailureFingerprint: null,
  });

  const covered = evaluatePq017FastGate({
    latestFailure: primaryFailure(),
    acceptedGeneratedAt: '2026-07-23T15:00:00.000Z',
    currentRegressionDigest: 'regression-after',
  });
  assert.deepEqual(covered, {
    pass: true,
    reason: 'new-regression-covers-latest-failure',
    acknowledgesFailureFingerprint: 'known-fingerprint',
  });
});

test('PQ-017 accepted evidence resolves only its runtime primary failure', async () => {
  const { evaluatePq017FastGate } = await loadGuard();
  // I6: resolution requires acceptedEvidence bound to current candidate digests.
  const boundEvidence = {
    pass: true,
    primaryAcceptance: true,
    runtimeKind: 'electron',
    digests: {
      candidateDigest: 'cand-1',
      routeDigest: 'route-before',
      regressionDigest: 'regression-before',
    },
  };
  assert.equal(evaluatePq017FastGate({
    latestFailure: primaryFailure(),
    acceptedRuntimeKind: 'electron',
    acceptedGeneratedAt: '2026-07-23T17:00:00.000Z',
    acceptedEvidence: boundEvidence,
    candidateDigest: 'cand-1',
    routeDigest: 'route-before',
    currentRegressionDigest: 'regression-before',
  }).pass, true);

  // Wrong runtime kind — does not resolve.
  assert.equal(evaluatePq017FastGate({
    latestFailure: primaryFailure(),
    acceptedRuntimeKind: 'browser',
    acceptedGeneratedAt: '2026-07-23T17:00:00.000Z',
    acceptedEvidence: { ...boundEvidence, runtimeKind: 'browser' },
    candidateDigest: 'cand-1',
    currentRegressionDigest: 'regression-before',
  }).pass, false);

  // Matching runtime but wrong candidate digest — does not resolve (I6).
  assert.equal(evaluatePq017FastGate({
    latestFailure: primaryFailure(),
    acceptedRuntimeKind: 'electron',
    acceptedGeneratedAt: '2026-07-23T17:00:00.000Z',
    acceptedEvidence: boundEvidence,
    candidateDigest: 'other-candidate',
    currentRegressionDigest: 'regression-before',
  }).pass, false);

  const diagnostic = evaluatePq017FastGate({
    latestFailure: primaryFailure({ primaryAcceptance: false }),
    currentRegressionDigest: 'regression-before',
  });
  assert.equal(diagnostic.pass, true);
  assert.equal(diagnostic.acknowledgesFailureFingerprint, null);
});

test('PQ-017 acceptance requires an explicit current receipt while diagnostics remain nonpromoting', async () => {
  const {
    createPq017FastGateReceipt,
    evaluatePq017AcceptanceGate,
  } = await loadGuard();
  const failure = primaryFailure();
  const receipt = createPq017FastGateReceipt({
    generatedAt: '2026-07-23T16:05:00.000Z',
    routeDigest: 'route-after',
    regressionDigest: 'regression-after',
    acknowledgesFailureFingerprint: failure.failureFingerprint,
  });

  assert.equal(evaluatePq017AcceptanceGate({
    mode: 'acceptance',
    explicitAcceptance: false,
    receipt,
    latestFailure: failure,
    currentRouteDigest: 'route-after',
    currentRegressionDigest: 'regression-after',
  }).reason, 'explicit-acceptance-flag-required');

  assert.deepEqual(evaluatePq017AcceptanceGate({
    mode: 'acceptance',
    explicitAcceptance: true,
    receipt,
    latestFailure: failure,
    currentRouteDigest: 'route-after',
    currentRegressionDigest: 'regression-after',
  }), {
    pass: true,
    reason: 'current-fast-receipt',
    primaryAcceptance: true,
    resolvesFailure: true,
  });

  assert.equal(evaluatePq017AcceptanceGate({
    mode: 'acceptance',
    explicitAcceptance: true,
    receipt,
    latestFailure: failure,
    currentRouteDigest: 'route-changed-after-fast-gate',
    currentRegressionDigest: 'regression-after',
  }).reason, 'fast-receipt-source-digest-stale');

  assert.equal(evaluatePq017AcceptanceGate({
    mode: 'diagnostic',
    explicitAcceptance: false,
    explicitDiagnostic: false,
    receipt,
    latestFailure: failure,
    currentRouteDigest: 'route-after',
    currentRegressionDigest: 'regression-after',
  }).reason, 'explicit-diagnostic-flag-required');

  assert.deepEqual(evaluatePq017AcceptanceGate({
    mode: 'diagnostic',
    explicitAcceptance: false,
    explicitDiagnostic: true,
    receipt,
    latestFailure: failure,
    currentRouteDigest: 'route-after',
    currentRegressionDigest: 'regression-after',
  }), {
    pass: true,
    reason: 'diagnostic-nonpromoting',
    primaryAcceptance: false,
    resolvesFailure: false,
  });

  const unacknowledgedDiagnostic = createPq017FastGateReceipt({
    generatedAt: '2026-07-23T15:00:00.000Z',
    routeDigest: 'route-after',
    regressionDigest: 'regression-after',
  });
  assert.equal(evaluatePq017AcceptanceGate({
    mode: 'diagnostic',
    explicitDiagnostic: true,
    receipt: unacknowledgedDiagnostic,
    latestFailure: failure,
    currentRouteDigest: 'route-after',
    currentRegressionDigest: 'regression-after',
  }).reason, 'fast-receipt-does-not-cover-latest-failure');
});

test('PQ-017 persists only primary acceptance failures as the unresolved pointer', async (t) => {
  const {
    publishPq017AcceptanceFailure,
    readPq017FailurePointer,
  } = await loadGuard();
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'pq017-guard-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(outputRoot, { recursive: true, force: true });
  });

  const diagnostic = primaryFailure({
    generatedAt: '2026-07-23T16:01:00.000Z',
    primaryAcceptance: false,
    failureFingerprint: 'diagnostic-fingerprint',
  });
  assert.equal(await publishPq017AcceptanceFailure({ outputRoot, failure: diagnostic }), false);
  assert.equal(await readPq017FailurePointer({ outputRoot }), null);

  const primary = primaryFailure();
  assert.equal(await publishPq017AcceptanceFailure({
    outputRoot,
    failure: primary,
    artifactPath: '.devshots/pq017-world-site/tmp/failure-report.json',
  }), true);
  assert.deepEqual(await readPq017FailurePointer({ outputRoot }), {
    ...primary,
    artifactPath: '.devshots/pq017-world-site/tmp/failure-report.json',
  });

  assert.equal(await publishPq017AcceptanceFailure({ outputRoot, failure: diagnostic }), false);
  assert.equal((await readPq017FailurePointer({ outputRoot })).failureFingerprint,
    primary.failureFingerprint);
  assert.match(await readFile(path.join(outputRoot, 'latest-acceptance-failure.json'), 'utf8'),
    /known-fingerprint/);
});

test('PQ-017 gate state files use sibling-temp atomic replacement', async () => {
  const source = await readFile(new URL(
    'scripts/lib/pq017ProbeIterationGuard.mjs',
    repoRoot,
  ), 'utf8');
  assert.match(source, /async function writeJsonAtomically\(/);
  assert.match(source, /await rename\(temporaryPath, targetPath\)/);
  assert.match(source, /writeJsonAtomically\(\s*path\.join\(outputRoot, FAILURE_POINTER_NAME\)/);
  assert.match(source, /writeJsonAtomically\(\s*path\.join\(outputRoot, FAST_RECEIPT_NAME\)/);
});

test('PQ-017 fast receipts are revoked before tests and claimed at most once', async (t) => {
  const {
    acquirePq017FastRunLock,
    claimPq017FastGateReceipt,
    completePq017ProbeClaim,
    createPq017FastGateReceipt,
    publishPq017FastGateReceipt,
    readPq017ProbeInflight,
    releasePq017FastRunLock,
  } = await loadGuard();
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'pq017-claim-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(outputRoot, { recursive: true, force: true });
  });
  const fastRunLock = await acquirePq017FastRunLock({ outputRoot });
  assert(fastRunLock);
  assert.equal(await acquirePq017FastRunLock({ outputRoot }), null);
  await releasePq017FastRunLock({ outputRoot, lockToken: fastRunLock.lockToken });
  const receipt = createPq017FastGateReceipt({
    routeDigest: 'route',
    regressionDigest: 'regression',
  });
  await publishPq017FastGateReceipt({ outputRoot, receipt });
  const replacement = createPq017FastGateReceipt({
    routeDigest: 'route-replaced',
    regressionDigest: 'regression-replaced',
  });
  await publishPq017FastGateReceipt({ outputRoot, receipt: replacement });
  const claimed = await claimPq017FastGateReceipt({ outputRoot });
  assert.deepEqual(claimed.receipt, replacement);
  assert.match(claimed.claimToken, /^\.fast-gate\.json\..+\.claim$/);
  assert.equal(await claimPq017FastGateReceipt({ outputRoot }), null);
  const inflight = await readPq017ProbeInflight({ outputRoot });
  assert.equal(inflight.length, 1);
  assert.equal(inflight[0].claimToken, claimed.claimToken);
  assert.deepEqual(inflight[0].claim, replacement);
  await completePq017ProbeClaim({ outputRoot, claimToken: claimed.claimToken });
  assert.deepEqual(await readPq017ProbeInflight({ outputRoot }), []);

  const fastSource = await readFile(
    new URL('scripts/check-pq017-world-site-fast.mjs', repoRoot),
    'utf8',
  );
  assert.ok(
    fastSource.indexOf('publishPq017FastGatePending({')
      < fastSource.indexOf('runNode([\'--test\''),
    'the old receipt must become invalid before any test can fail or crash',
  );
  assert.ok(
    fastSource.indexOf('const beforeState = await loadPq017GateState({')
      < fastSource.indexOf('runNode([\'--test\''),
    'the fast gate must snapshot source digests before executing tests',
  );
  assert.ok(
    fastSource.indexOf('const afterState = await loadPq017GateState({')
      > fastSource.indexOf('runNode([\'--test\''),
    'the fast gate must recompute source digests after executing tests',
  );
  assert.match(fastSource, /beforeState\.routeDigest !== afterState\.routeDigest/);
  assert.match(fastSource, /beforeState\.regressionDigest !== afterState\.regressionDigest/);
  assert.ok(
    fastSource.indexOf('readPq017ProbeInflight({')
      < fastSource.indexOf('publishPq017FastGatePending({'),
    'an orphaned live claim must block before the previous receipt is replaced',
  );
  assert.ok(
    fastSource.indexOf('acquirePq017FastRunLock({')
      < fastSource.indexOf('readPq017ProbeInflight({'),
    'exclusive fast-writer ownership must precede the first in-flight scan',
  );
  assert.match(fastSource, /finally\s*\{[\s\S]*releasePq017FastRunLock\(\{/);
  assert.ok(
    fastSource.lastIndexOf('readPq017ProbeInflight({')
      > fastSource.indexOf('runNode([\'--test\''),
    'a claim created during the fast tests must block valid receipt publication',
  );
  assert.ok(
    fastSource.indexOf('const inflightAfterRevocation = await readPq017ProbeInflight({')
      > fastSource.indexOf('publishPq017FastGatePending({'),
    'fast must recheck claims immediately after atomically revoking the old receipt',
  );
  assert.ok(
    fastSource.indexOf('const inflightAfterRevocation = await readPq017ProbeInflight({')
      < fastSource.indexOf('runNode([\'--test\''),
    'a claim that wins the initial scan/revocation race must block before tests',
  );
});

test('PQ-017 successful preflight persists an owned live claim until durable settlement', async (t) => {
  const {
    assertPq017ProbeLaunch,
    completePq017ProbeClaim,
    computePq017GateDigests,
    createPq017FastGateReceipt,
    publishPq017FastGateReceipt,
    readPq017ProbeInflight,
    issuePq017AcceptanceClaim,
  } = await loadGuard();
  const root = fileURLToPath(repoRoot);
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'pq017-preflight-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(outputRoot, { recursive: true, force: true });
  });
  const digests = await computePq017GateDigests({ root });
  await publishPq017FastGateReceipt({
    outputRoot,
    receipt: createPq017FastGateReceipt(digests),
  });
  // G3: acceptance claim is issued by the caller, not self-minted inside assert.
  const issued = await issuePq017AcceptanceClaim({ root, outputRoot });
  const launch = await assertPq017ProbeLaunch({
    root,
    outputRoot,
    runtimeKind: 'browser',
    mode: 'acceptance',
    explicitAcceptance: true,
    brokerClaimToken: issued.claimPath,
  });
  const inflight = await readPq017ProbeInflight({ outputRoot });
  assert.equal(inflight.length, 1);
  assert.equal(inflight[0].claim.schema, 'spaceface.pq017-probe-inflight.v1');
  assert.equal(inflight[0].claim.runtimeKind, 'browser');
  assert.equal(inflight[0].claim.mode, 'acceptance');
  assert.equal(inflight[0].claimToken, launch.claimToken);
  await completePq017ProbeClaim({ outputRoot, claimToken: launch.claimToken });
  assert.deepEqual(await readPq017ProbeInflight({ outputRoot }), []);
});

test('PQ-017 migrates one historical primary failure with honest pre-guard digests', async (t) => {
  const { migratePq017HistoricalFailure } = await loadGuard();
  const root = await mkdtemp(path.join(os.tmpdir(), 'pq017-migration-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(root, { recursive: true, force: true });
  });
  const outputRoot = path.join(root, '.devshots', 'pq017-world-site');
  const artifactDir = path.join(
    outputRoot,
    '.tmp-browser-20892-1784823852559-affb3ff6',
  );
  const failureReportPath = path.join(artifactDir, 'failure-report.json');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(failureReportPath, `${JSON.stringify({
    pass: false,
    runtimeKind: 'browser',
    phase: 'massline-delivery',
    error: 'NORMAL_ROUTE_BLOCKED: normal flight did not settle within 99473ms: '
      + '{"point":{"phase":"launch"},"navigation":{"tick":7715,"distance":9.17},'
      + '"routeSafety":{"sweptSegment":{"safe":false,"reason":"segment-blocked",'
      + '"closestConstraint":{"type":"world_site_payload","exclusionRadius":38}}}}',
  })}\n`, 'utf8');

  const migrated = await migratePq017HistoricalFailure({
    root,
    outputRoot,
    failureReportPath,
  });
  assert.equal(migrated.generatedAt, '2026-07-23T16:24:12.559Z');
  assert.equal(migrated.primaryAcceptance, true);
  assert.equal(migrated.regressionDigest, 'pre-guard:unknown');
  assert.equal(migrated.routeDigest, 'pre-guard:unknown');
  assert.equal(migrated.migratedFromHistoricalArtifact, true);
  assert.equal(migrated.family,
    'browser/massline-delivery/point-arrival-timeout/launch/none/segment-blocked');
  assert.match(migrated.failureFingerprint, /^[a-f0-9]{64}$/);
  assert.equal((await readPq017Pointer()).artifactPath,
    '.devshots/pq017-world-site/.tmp-browser-20892-1784823852559-affb3ff6/failure-report.json');

  async function readPq017Pointer() {
    return JSON.parse(await readFile(
      path.join(outputRoot, 'latest-acceptance-failure.json'),
      'utf8',
    ));
  }
});

test('PQ-017 package commands enforce the fast gate before explicit acceptance probes', async () => {
  const packageJson = JSON.parse(await readFile(new URL('package.json', repoRoot), 'utf8'));
  assert.equal(packageJson.scripts['check:pq017:world-site:fast'],
    'node scripts/check-pq017-world-site-fast.mjs');
  // I3: acceptance goes through external authorize wrapper (issues claim), not direct probe.
  assert.equal(packageJson.scripts['check:pq017:world-site:browser'],
    'npm run check:pq017:world-site:fast && node scripts/pq017-authorize-probe.mjs --browser');
  assert.equal(packageJson.scripts['check:pq017:world-site:electron'],
    'npm run check:pq017:world-site:fast && node scripts/pq017-authorize-probe.mjs --electron');
});

test('PQ-017 digests and fast execution cover direct controller and harness dependencies', async () => {
  const guardSource = await readFile(
    new URL('scripts/lib/pq017ProbeIterationGuard.mjs', repoRoot),
    'utf8',
  );
  const fastSource = await readFile(
    new URL('scripts/check-pq017-world-site-fast.mjs', repoRoot),
    'utf8',
  );
  for (const dependency of [
    'scripts/lib/pq017PublicControlTrajectory.mjs',
    'scripts/lib/pq017ClosedLoopControlHarness.mjs',
    'scripts/lib/electronLaunchProtocol.cjs',
    'scripts/lib/gameServer.cjs',
    'scripts/lib/professionalTravelPublicRoute.mjs',
    'scripts/lib/masslineControlLab.mjs',
    'scripts/check-pq017-world-site-fast.mjs',
    'src/combat/attachments.js',
    'src/core/constraints/masslineController.js',
    'src/core/physicsAuthority.js',
    'src/core/physics.js',
    'src/contracts/evidenceSchemas.js',
    'src/data/newGameDefaults.js',
    'src/systems/actions.js',
    'src/systems/flightV3.js',
    'src/systems/input.js',
    'src/systems/ships.js',
    'src/systems/tetherGameplay.js',
    'test/pq017-probe-iteration-guard.test.mjs',
    'test/pq017-closed-loop-control.test.mjs',
  ]) {
    assert.match(guardSource, new RegExp(dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(fastSource, /test\/pq017-closed-loop-control\.test\.mjs/);
});

test('PQ-017 wrappers reject ungated acceptance before creating artifacts and fingerprint failures', async () => {
  for (const relativePath of [
    'scripts/probe-pq017-world-site.mjs',
    'scripts/probe-pq017-world-site-electron.mjs',
  ]) {
    const source = await readFile(new URL(relativePath, repoRoot), 'utf8');
    assert.match(source, /assertPq017ProbeLaunch\(\{/);
    assert.ok(source.indexOf('assertPq017ProbeLaunch({') < source.indexOf('await mkdir(STAGING'),
      `${relativePath} must preflight before creating a staging artifact`);
    assert.ok(source.indexOf('assertPq017ProbeLaunch({') < source.indexOf(
      "await import('./lib/load-playwright.mjs')",
    ), `${relativePath} must preflight before loading Playwright`);
    assert.doesNotMatch(source, /^import \{ loadPlaywright \}/m);
    assert.match(source, /derivePq017FailureIdentity\(failure\)/);
    assert.match(source, /publishPq017AcceptanceFailure\(\{/);
    assert.match(source, /completePq017ProbeClaim\(\{/);
    assert.match(source, /generatedAt: new Date\(\)\.toISOString\(\)/);
  }
  const electronSource = await readFile(
    new URL('scripts/probe-pq017-world-site-electron.mjs', repoRoot),
    'utf8',
  );
  // G3: mode may be bound via electronMode; still derived from primaryAcceptance.
  assert.match(electronSource,
    /(?:mode|electronMode)\s*[:=]\s*runMode\.primaryAcceptance \? 'acceptance' : 'diagnostic'/);
  assert.match(electronSource, /explicitDiagnostic: process\.argv\.includes\('--diagnostic'\)/);
  // I3: probes must NOT self-mint — only consume SF_BROKER_CLAIM from an external issuer.
  assert.match(electronSource, /SF_BROKER_CLAIM/);
  assert.doesNotMatch(electronSource, /issuePq017AcceptanceClaim/);
  const browserSource = await readFile(
    new URL('scripts/probe-pq017-world-site.mjs', repoRoot),
    'utf8',
  );
  assert.doesNotMatch(browserSource, /issuePq017AcceptanceClaim/);
  assert.match(browserSource, /SF_BROKER_CLAIM/);
});
