// Release soak contract tests — fast synthetic validation of the evidence
// schema and quality-preserving rules. No browser/Electron runtime required.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';

import {
  RELEASE_SOAK_SCHEMA,
  bytesToMb,
  summarizeSamples,
  validateArtifactFiles,
  validateCleanupEvidence,
  validateMemoryEvidence,
  validateNoQualityShortcuts,
  validatePerformanceEvidence,
  validateReleaseSoakEvidence,
  validateSettingsTruth,
} from '../scripts/lib/releaseSoakContracts.mjs';

const DEFAULT_VIDEO = Object.freeze({
  renderScale: 0.85,
  pixelRatioCap: 2,
  shadows: false,
  bloom: true,
  particleQuality: 'medium',
});

function defaultSettings(videoOverrides = {}) {
  return {
    video: {
      ...DEFAULT_VIDEO,
      ...videoOverrides,
    },
  };
}

function matchingPerformance(sampleCountPerPhase = 180, frameMs = 16) {
  const flight = Array.from({ length: sampleCountPerPhase }, () => ({ frameMs, phaseTag: 'flight_steady' }));
  const recovery = Array.from({ length: sampleCountPerPhase }, () => ({ frameMs, phaseTag: 'context_recover_steady' }));
  const samples = [...flight, ...recovery];
  return {
    frameMs: summarizeSamples(samples),
    samples,
    phases: {
      flight_steady: summarizeSamples(flight),
      context_recover_steady: summarizeSamples(recovery),
    },
    thresholdsClaimed: false,
    notes: ['test'],
  };
}

function consistentMemory(overrides = {}) {
  const heapBytesStart = 100 * 1024 * 1024;
  const heapBytesEnd = 115 * 1024 * 1024;
  const base = {
    heapBytesStart,
    heapBytesEnd,
    heapGrowthBytes: heapBytesEnd - heapBytesStart,
    geometries: { start: 40, end: 42, delta: 2 },
    textures: { start: 80, end: 81, delta: 1 },
    programs: { start: 24, end: 24, delta: 0 },
    withinBudget: true,
    retainedAfterGc: true,
    comparableState: 'docked-market',
    startSnapshot: { phaseTag: 'docked-market-start', docked: true },
    endSnapshot: { phaseTag: 'docked-market-end', docked: true },
  };
  return mergeDeep(base, overrides);
}

function buildEnvelope(overrides = {}) {
  const base = {
    schema: RELEASE_SOAK_SCHEMA,
    taskId: 'release-soak-test',
    generatedAt: new Date().toISOString(),
    worktreeId: 'test-worktree',
    worktreeDigest: 'a'.repeat(64),
    fingerprints: {
      start: { id: 'test-worktree', digest: 'a'.repeat(64) },
      end: { id: 'test-worktree', digest: 'a'.repeat(64) },
    },
    runtimeKind: 'synthetic',
    mode: 'contract',
    cycles: { count: 1, results: [{ index: 0, docked: true, sampleCount: 10 }] },
    primaryAcceptance: false,
    inputSource: 'keyboard-mouse',
    injectedState: false,
    checks: [{ name: 'quality', status: 'pass' }],
    artifacts: [{ kind: 'report', path: 'evidence.json', bytes: 12, sha256: 'b'.repeat(64) }],
    quality: {
      settingsOverridesApplied: false,
      renderScale: 1,
      shadows: true,
      bloom: true,
      particleQuality: 'high',
      physicsSimplification: false,
      authoredAssetFallback: false,
      authoredReady: true,
      settingsPass: true,
      startSettings: defaultSettings(),
      endSettings: defaultSettings(),
    },
    performance: matchingPerformance(180, 12),
    memory: consistentMemory(),
    errors: {
      pageErrors: [],
      requestFailures: [],
      glErrors: [],
      consoleErrors: [],
      httpErrors: [],
      warnings: [],
      all: [],
    },
    contextLoss: {
      available: true,
      lostEvent: true,
      restoredEvent: true,
      meshRebuilt: true,
      pixelProof: true,
      frameAdvanced: true,
      recovered: true,
      before: false,
      after: false,
    },
    cleanup: {
      pageClosed: true,
      browserDisconnected: true,
      serverReleased: true,
      processExited: true,
      portsReleased: true,
      reportPass: true,
      ownedReport: { pass: true, precloseUrlCheck: { pass: true }, urlTracker: { pass: true } },
    },
  };
  return mergeDeep(base, overrides);
}

/** Primary-shaped envelope for adversarial rejection cases (still may fail other gates). */
function buildPrimaryEnvelope(overrides = {}) {
  return buildEnvelope({
    runtimeKind: 'browser',
    primaryAcceptance: true,
    injectedState: false,
    inputSource: 'keyboard-mouse',
    cycles: {
      count: 1,
      results: [{
        index: 0,
        pass: true,
        sampleCount: 60,
        marks: [
          'undock',
          'flight-input',
          'save-written',
          'load-restored',
          'docked',
          'market-opened',
          'trade-roundtrip',
        ],
      }],
    },
    checks: [{ name: 'quality', status: 'pass' }, { name: 'cleanup', status: 'pass' }],
    artifacts: [
      { kind: 'screenshot', path: 'frame.png', bytes: 128, sha256: 'c'.repeat(64) },
      { kind: 'report', path: 'evidence.json', bytes: 12, sha256: 'b'.repeat(64) },
    ],
    ...overrides,
  });
}

function mergeDeep(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      out[key] = mergeDeep(out[key] || {}, val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

function assertFailsWith(result, pattern, message) {
  assert.equal(result.pass, false, message || 'expected validation failure');
  const joined = result.failures.join(' | ');
  assert(
    result.failures.some((f) => pattern.test(f)),
    `expected a failure matching ${pattern}: ${joined}`,
  );
}

function testSchemaAcceptsValidEnvelope() {
  const envelope = buildEnvelope();
  const result = validateReleaseSoakEvidence(envelope);
  assert.equal(result.pass, true, `valid envelope should pass: ${JSON.stringify(result.failures)}`);
}

function testRejectsForgedSchema() {
  const envelope = buildEnvelope({ schema: 'forged' });
  const result = validateReleaseSoakEvidence(envelope);
  assert.equal(result.pass, false, 'forged schema must be rejected');
  assert(result.failures.some((f) => /schema/i.test(f)), 'failure names schema');
}

function testRejectsMissingMemorySection() {
  const envelope = buildEnvelope();
  delete envelope.memory;
  const result = validateReleaseSoakEvidence(envelope);
  assert.equal(result.pass, false, 'missing memory section must be rejected');
}

function testRejectsFailingChecks() {
  const envelope = buildEnvelope({ checks: [{ name: 'quality', status: 'fail' }] });
  const result = validateReleaseSoakEvidence(envelope);
  assert.equal(result.pass, false, 'failing checks must reject evidence');
}

function testRejectsMissingArtifactsForPrimaryAcceptance() {
  const envelope = buildPrimaryEnvelope({ artifacts: [] });
  const result = validateReleaseSoakEvidence(envelope, { requireArtifacts: false });
  assert.equal(result.pass, false, 'primary acceptance requires artifacts');
  assert(result.failures.some((failure) => /artifacts are required/i.test(failure)), 'primary cannot disable artifact enforcement');
}

function testRejectsFingerprintDrift() {
  const envelope = buildPrimaryEnvelope({
    fingerprints: {
      start: { id: 'test-worktree', digest: 'a'.repeat(64) },
      end: { id: 'changed-worktree', digest: 'b'.repeat(64) },
    },
  });
  assertFailsWith(validateReleaseSoakEvidence(envelope), /fingerprint changed during capture/i, 'primary fingerprint drift must fail');
}

function testQualityShortcutsRejected() {
  const overridden = validateNoQualityShortcuts({ settingsOverridesApplied: true });
  assert.equal(overridden.pass, false, 'settingsOverridesApplied=true must fail');

  const fallback = validateNoQualityShortcuts({ settingsOverridesApplied: false, authoredAssetFallback: true });
  assert.equal(fallback.pass, false, 'authored asset fallback must fail');

  const valid = validateNoQualityShortcuts({
    settingsOverridesApplied: false,
    authoredAssetFallback: false,
    authoredReady: true,
    physicsSimplification: false,
  });
  assert.equal(valid.pass, true, `unchanged live-quality profile should pass: ${JSON.stringify(valid.failures)}`);
}

function testPerformanceEvidenceBounds() {
  const valid = validatePerformanceEvidence(matchingPerformance(180, 16));
  assert.equal(valid.pass, true, `reasonable perf evidence passes: ${JSON.stringify(valid.failures)}`);

  const overFloor = validatePerformanceEvidence(matchingPerformance(180, 40));
  assert.equal(overFloor.pass, false, 'p95 over 30fps floor must fail');

  const missingSamples = validatePerformanceEvidence({ frameMs: { sampleCount: 10, p95: 16 } });
  assert.equal(missingSamples.pass, false, 'missing samples must fail');
}

function testMemoryEvidenceBounds() {
  const valid = validateMemoryEvidence(consistentMemory());
  assert.equal(valid.pass, true, `reasonable memory evidence passes: ${JSON.stringify(valid.failures)}`);

  const overBudget = validateMemoryEvidence(consistentMemory({
    heapBytesEnd: 135 * 1024 * 1024,
    heapGrowthBytes: 35 * 1024 * 1024,
    withinBudget: false,
  }));
  assert.equal(overBudget.pass, false, 'heap growth over 30 MB must fail');

  const leak = validateMemoryEvidence(consistentMemory({ geometries: { start: 10, end: 100, delta: 90 } }));
  assert.equal(leak.pass, false, 'large geometry growth must fail');

  const shaderLeak = validateMemoryEvidence(consistentMemory({ programs: { start: 5, end: 6, delta: 1 } }));
  assert.equal(shaderLeak.pass, false, 'program growth must fail');
}

function testSettingsTruth() {
  const valid = validateSettingsTruth(defaultSettings());
  assert.equal(valid.pass, true, `live default settings pass: ${JSON.stringify(valid.failures)}`);
  const changed = validateSettingsTruth(defaultSettings({ renderScale: 1 }), { expected: defaultSettings() });
  assert.equal(changed.pass, false, 'changing the captured profile must fail');
  const invalid = validateSettingsTruth(defaultSettings({ renderScale: Number.NaN }));
  assert.equal(invalid.pass, false, 'non-finite renderScale must fail');
}

function testPrimaryEnvelopePassesWhenComplete() {
  const result = validateReleaseSoakEvidence(buildPrimaryEnvelope());
  assert.equal(result.pass, true, `complete primary envelope should pass: ${JSON.stringify(result.failures)}`);
}

function testPhysicsRangeEdgesResetAfterLoad() {
  const bus = createBus();
  const state = {};
  physics.init({ state, bus, helpers: {} });
  physics._dockStationId = 'station_helios';
  physics._gateEntityId = 42;
  bus.emit('save:loaded');
  assert.equal(physics._dockStationId, null, 'post-load dock range must re-emit even for the same stable station id');
  assert.equal(physics._gateEntityId, null, 'post-load gate range must re-emit even for the same stable gate id');
}

function testCleanupEvidence() {
  const valid = validateCleanupEvidence({
    pageClosed: true,
    browserDisconnected: true,
    serverReleased: true,
    processExited: true,
    portsReleased: true,
    reportPass: true,
    ownedReport: { pass: true, precloseUrlCheck: { pass: true }, urlTracker: { pass: true } },
  });
  assert.equal(valid.pass, true, `complete cleanup passes: ${JSON.stringify(valid.failures)}`);

  const incomplete = validateCleanupEvidence({
    pageClosed: true,
    browserDisconnected: false,
    serverReleased: true,
    processExited: false,
    reportPass: false,
    ownedReport: { pass: false },
  });
  assert.equal(incomplete.pass, false, 'incomplete cleanup must fail');

  const failedOwnedReport = validateCleanupEvidence({
    pageClosed: true,
    browserDisconnected: true,
    serverReleased: true,
    processExited: true,
    portsReleased: true,
    reportPass: false,
    ownedReport: { pass: false },
  }, { runtimeKind: 'electron' });
  assert.equal(failedOwnedReport.pass, false, 'failed owned-runtime detail may not pass through summary booleans');
}

async function testArtifactFileValidation() {
  const root = await mkdtemp(path.join(tmpdir(), 'sf-release-soak-artifact-'));
  try {
    await writeFile(path.join(root, 'evidence.json'), '{"ok":true}\n', 'utf8');
    await writeFile(path.join(root, 'missing.txt'), 'x', 'utf8');

    const valid = await validateArtifactFiles(root, [
      { kind: 'report', path: 'evidence.json' },
    ]);
    assert.equal(valid.pass, true, `existing artifact validates: ${JSON.stringify(valid.failures)}`);
    assert.equal(valid.verified.length, 1, 'one artifact verified');
    assert.equal(typeof valid.verified[0].sha256, 'string', 'artifact has sha256');

    const missingClaims = await validateArtifactFiles(root, [
      { kind: 'report', path: 'evidence.json' },
    ], { requireClaims: true });
    assert.equal(missingClaims.pass, false, 'independent acceptance validation requires byte/hash claims');

    const missing = await validateArtifactFiles(root, [
      { kind: 'report', path: 'does-not-exist.json' },
    ]);
    assert.equal(missing.pass, false, 'missing artifact rejected');

    const escaped = await validateArtifactFiles(root, [
      { kind: 'report', path: '../outside.json' },
    ]);
    assert.equal(escaped.pass, false, 'escaped artifact path rejected');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function testSummarizeSamples() {
  const samples = Array.from({ length: 100 }, (_, i) => ({ frameMs: 10 + i * 0.5 }));
  const summary = summarizeSamples(samples);
  assert.equal(summary.sampleCount, 100);
  assert.equal(summary.p50, 35);
  assert.equal(summary.p95 >= 57, true, 'p95 is at least 57');
  assert.equal(summary.hitchesOver32Ms, 55, 'frames above 32 ms counted');
}

function testBytesToMb() {
  assert.equal(bytesToMb(15 * 1024 * 1024), 15);
  assert.equal(bytesToMb(15.5 * 1024 * 1024), 15.5);
}

// ─── Adversarial integrity cases (M6 release-soak evidence) ─────────────────

function testRejectsPrimarySyntheticEvidence() {
  const envelope = buildEnvelope({
    runtimeKind: 'synthetic',
    primaryAcceptance: true,
  });
  const result = validateReleaseSoakEvidence(envelope);
  assertFailsWith(
    result,
    /synthetic.*primary|primary.*synthetic|synthetic evidence cannot claim primary/i,
    'synthetic evidence claiming primaryAcceptance must be rejected',
  );
}

function testRejectsPrimaryZeroCycles() {
  const envelope = buildPrimaryEnvelope({
    cycles: { count: 0, results: [] },
  });
  const result = validateReleaseSoakEvidence(envelope);
  assertFailsWith(
    result,
    /cycles\.count must be a positive integer/i,
    'primary run with zero cycles must be rejected',
  );
}

function testRejectsPrimarySkipOnlyChecks() {
  const envelope = buildPrimaryEnvelope({
    checks: [{ name: 'quality', status: 'skip' }, { name: 'cleanup', status: 'skip' }],
  });
  const result = validateReleaseSoakEvidence(envelope);
  assert.equal(result.pass, false, 'primary run with skip-only checks must be rejected');
  assert(
    result.failures.some((f) => /skip|primary evidence may not contain fail or skip|requires passing checks/i.test(f)),
    `expected skip/pass primary gate failure: ${result.failures.join(' | ')}`,
  );
}

function testRejectsMissingContextRestorationProof() {
  const missing = buildPrimaryEnvelope();
  delete missing.contextLoss;
  assertFailsWith(
    validateReleaseSoakEvidence(missing),
    /context-loss evidence is required|contextLoss/i,
    'primary evidence without contextLoss must be rejected',
  );
}

function testRejectsFalseContextRestorationProof() {
  const partial = buildPrimaryEnvelope({
    contextLoss: {
      available: true,
      lostEvent: true,
      restoredEvent: false,
      meshRebuilt: false,
      pixelProof: false,
      frameAdvanced: true,
      recovered: false,
      before: false,
      after: false,
    },
  });
  const result = validateReleaseSoakEvidence(partial);
  assert.equal(result.pass, false, 'false context restoration flags must be rejected');
  assert(
    result.failures.some((f) => /contextLoss\.(restoredEvent|meshRebuilt|pixelProof|recovered) must be true/i.test(f)),
    `expected false restoration proof failures: ${result.failures.join(' | ')}`,
  );

  const liveFlagsWrong = buildPrimaryEnvelope({
    contextLoss: {
      available: true,
      lostEvent: true,
      restoredEvent: true,
      meshRebuilt: true,
      pixelProof: true,
      frameAdvanced: true,
      recovered: true,
      before: true,
      after: true,
    },
  });
  assertFailsWith(
    validateReleaseSoakEvidence(liveFlagsWrong),
    /context must be live before and after/i,
    'context before/after must prove live (false) bracketing',
  );
}

function testRejectsElectronCleanupWithoutProcessExit() {
  const incomplete = validateCleanupEvidence(
    {
      pageClosed: true,
      browserDisconnected: true,
      serverReleased: true,
      processExited: false,
      portsReleased: true,
      reportPass: false,
      ownedReport: { pass: false },
    },
    { runtimeKind: 'electron' },
  );
  assertFailsWith(
    incomplete,
    /Electron process exit was not confirmed/i,
    'Electron cleanup with processExited=false must fail',
  );

  const envelope = buildPrimaryEnvelope({
    runtimeKind: 'electron',
    cleanup: {
      pageClosed: true,
      browserDisconnected: true,
      serverReleased: true,
      processExited: false,
      portsReleased: true,
      reportPass: false,
      ownedReport: { pass: false },
    },
  });
  assertFailsWith(
    validateReleaseSoakEvidence(envelope),
    /Electron process exit was not confirmed/i,
    'primary Electron evidence must require processExited',
  );
}

function testRejectsSettingsChangedFromStartProfile() {
  const start = defaultSettings();
  const end = defaultSettings({ renderScale: 0.7, shadows: true });
  const direct = validateSettingsTruth(end, { expected: start });
  assert.equal(direct.pass, false, 'end settings that diverge from start must fail');
  assert(
    direct.failures.some((f) => /renderScale changed during the probe/i.test(f)),
    `expected renderScale change: ${direct.failures.join(' | ')}`,
  );
  assert(
    direct.failures.some((f) => /shadows changed during the probe/i.test(f)),
    `expected shadows change: ${direct.failures.join(' | ')}`,
  );

  const envelope = buildEnvelope({
    quality: {
      settingsOverridesApplied: false,
      physicsSimplification: false,
      authoredAssetFallback: false,
      authoredReady: true,
      settingsPass: true,
      startSettings: start,
      endSettings: end,
    },
  });
  const result = validateReleaseSoakEvidence(envelope);
  assert.equal(result.pass, false, 'envelope with drifted end settings must fail');
  assert(
    result.failures.some((f) => /quality end:.*changed during the probe/i.test(f)),
    `expected quality end drift failure: ${result.failures.join(' | ')}`,
  );
}

function testRejectsNonFiniteOrInconsistentHeapMetrics() {
  const nonFiniteStart = validateMemoryEvidence({
    heapBytesStart: Number.NaN,
    heapBytesEnd: 115 * 1024 * 1024,
    heapGrowthBytes: 15 * 1024 * 1024,
    withinBudget: true,
    geometries: { start: 10, end: 12, delta: 2 },
    textures: { start: 10, end: 11, delta: 1 },
    programs: { start: 5, end: 5, delta: 0 },
  });
  assertFailsWith(nonFiniteStart, /heapBytesStart must be finite/i, 'NaN heapBytesStart must fail');

  const nonFiniteEnd = validateMemoryEvidence({
    heapBytesStart: 100 * 1024 * 1024,
    heapBytesEnd: Number.POSITIVE_INFINITY,
    heapGrowthBytes: 0,
    withinBudget: true,
    geometries: { start: 10, end: 12, delta: 2 },
    textures: { start: 10, end: 11, delta: 1 },
    programs: { start: 5, end: 5, delta: 0 },
  });
  assertFailsWith(nonFiniteEnd, /heapBytesEnd must be finite/i, 'non-finite heapBytesEnd must fail');

  const badGrowth = validateMemoryEvidence({
    heapBytesStart: 100 * 1024 * 1024,
    heapBytesEnd: 115 * 1024 * 1024,
    heapGrowthBytes: 1,
    withinBudget: true,
    geometries: { start: 10, end: 12, delta: 2 },
    textures: { start: 10, end: 11, delta: 1 },
    programs: { start: 5, end: 5, delta: 0 },
  });
  assertFailsWith(
    badGrowth,
    /heapGrowthBytes does not match start\/end/i,
    'inconsistent heapGrowthBytes must fail',
  );

  const badBudgetFlag = validateMemoryEvidence({
    heapBytesStart: 100 * 1024 * 1024,
    heapBytesEnd: 115 * 1024 * 1024,
    heapGrowthBytes: 15 * 1024 * 1024,
    withinBudget: false,
    geometries: { start: 10, end: 12, delta: 2 },
    textures: { start: 10, end: 11, delta: 1 },
    programs: { start: 5, end: 5, delta: 0 },
  });
  assertFailsWith(
    badBudgetFlag,
    /withinBudget does not match computed growth/i,
    'withinBudget flag inconsistent with growth must fail',
  );

  const badResourceDelta = validateMemoryEvidence({
    heapBytesStart: 100 * 1024 * 1024,
    heapBytesEnd: 115 * 1024 * 1024,
    heapGrowthBytes: 15 * 1024 * 1024,
    withinBudget: true,
    geometries: { start: 10, end: 12, delta: 99 },
    textures: { start: 10, end: 11, delta: 1 },
    programs: { start: 5, end: 5, delta: 0 },
  });
  assertFailsWith(
    badResourceDelta,
    /geometries\.delta does not match start\/end/i,
    'inconsistent geometry delta must fail',
  );

  const nonFiniteResource = validateMemoryEvidence({
    heapBytesStart: 100 * 1024 * 1024,
    heapBytesEnd: 115 * 1024 * 1024,
    heapGrowthBytes: 15 * 1024 * 1024,
    withinBudget: true,
    geometries: { start: 10, end: Number.NaN, delta: Number.NaN },
    textures: { start: 10, end: 11, delta: 1 },
    programs: { start: 5, end: 5, delta: 0 },
  });
  assertFailsWith(
    nonFiniteResource,
    /memory\.geometries needs finite start\/end\/delta/i,
    'non-finite resource counters must fail',
  );
}

function testRejectsPerformanceSummaryInconsistentWithSamples() {
  const samples = Array.from({ length: 20 }, () => ({ frameMs: 16 }));
  const computed = summarizeSamples(samples);
  const mismatched = validatePerformanceEvidence({
    samples,
    frameMs: {
      sampleCount: computed.sampleCount,
      p50: 1,
      p95: 1,
      p99: 1,
      max: 1,
      hitchesOver32Ms: 99,
    },
  });
  assert.equal(mismatched.pass, false, 'perf summary that disagrees with samples must fail');
  assert(
    mismatched.failures.some((f) => /performance\.frameMs\.(p50|p95|p99|max|hitchesOver32Ms) does not match raw samples/i.test(f)),
    `expected summary mismatch failures: ${mismatched.failures.join(' | ')}`,
  );

  const badSampleCount = validatePerformanceEvidence({
    samples,
    frameMs: {
      ...computed,
      sampleCount: 999,
    },
  });
  assertFailsWith(
    badSampleCount,
    /performance\.frameMs\.sampleCount does not match raw samples/i,
    'claimed sampleCount must match finite raw samples',
  );

  const nonFiniteSample = validatePerformanceEvidence({
    samples: [{ frameMs: 16 }, { frameMs: Number.NaN }, { frameMs: 16 }],
    frameMs: { sampleCount: 2, p50: 16, p95: 16, p99: 16, max: 16, hitchesOver32Ms: 0 },
  });
  assertFailsWith(
    nonFiniteSample,
    /performance samples must all contain finite positive frameMs/i,
    'non-finite sample frameMs must fail',
  );
}

async function testRejectsArtifactByteAndHashMismatch() {
  const root = await mkdtemp(path.join(tmpdir(), 'sf-release-soak-artifact-mismatch-'));
  try {
    const body = '{"ok":true,"n":1}\n';
    await writeFile(path.join(root, 'evidence.json'), body, 'utf8');
    const realSha = createHash('sha256').update(body).digest('hex');
    const realBytes = Buffer.byteLength(body, 'utf8');

    const byteMismatch = await validateArtifactFiles(root, [
      { kind: 'report', path: 'evidence.json', bytes: realBytes + 7, sha256: realSha },
    ]);
    assertFailsWith(
      byteMismatch,
      /artifact byte count mismatch/i,
      'artifact bytes that disagree with file size must fail',
    );

    const hashMismatch = await validateArtifactFiles(root, [
      { kind: 'report', path: 'evidence.json', bytes: realBytes, sha256: '0'.repeat(64) },
    ]);
    assertFailsWith(
      hashMismatch,
      /artifact hash mismatch/i,
      'artifact sha256 that disagrees with contents must fail',
    );

    const both = await validateArtifactFiles(root, [
      { kind: 'report', path: 'evidence.json', bytes: 1, sha256: 'deadbeef'.repeat(8) },
    ]);
    assert.equal(both.pass, false, 'combined byte+hash forgery must fail');
    assert(both.failures.some((f) => /byte count mismatch/i.test(f)), 'names byte mismatch');
    assert(both.failures.some((f) => /hash mismatch/i.test(f)), 'names hash mismatch');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// ─── Run (node:test — each case independent so concurrent source repair is visible) ─

test('schema accepts valid envelope', () => testSchemaAcceptsValidEnvelope());
test('rejects forged schema', () => testRejectsForgedSchema());
test('rejects missing memory section', () => testRejectsMissingMemorySection());
test('rejects failing checks', () => testRejectsFailingChecks());
test('rejects missing artifacts for primary acceptance', () => testRejectsMissingArtifactsForPrimaryAcceptance());
test('rejects primary fingerprint drift', () => testRejectsFingerprintDrift());
test('quality shortcuts rejected', () => testQualityShortcutsRejected());
test('performance evidence bounds', () => testPerformanceEvidenceBounds());
test('memory evidence bounds', () => testMemoryEvidenceBounds());
test('settings truth', () => testSettingsTruth());
test('complete primary envelope passes', () => testPrimaryEnvelopePassesWhenComplete());
test('physics range edges reset after load', () => testPhysicsRangeEdgesResetAfterLoad());
test('cleanup evidence', () => testCleanupEvidence());
test('artifact file validation', async () => testArtifactFileValidation());
test('summarize samples', () => testSummarizeSamples());
test('bytes to MB', () => testBytesToMb());

test('adversarial: rejects primary synthetic evidence', () => testRejectsPrimarySyntheticEvidence());
test('adversarial: rejects primary zero cycles', () => testRejectsPrimaryZeroCycles());
test('adversarial: rejects primary skip-only checks', () => testRejectsPrimarySkipOnlyChecks());
test('adversarial: rejects missing context restoration proof', () => testRejectsMissingContextRestorationProof());
test('adversarial: rejects false context restoration proof', () => testRejectsFalseContextRestorationProof());
test('adversarial: rejects Electron cleanup without processExited', () => testRejectsElectronCleanupWithoutProcessExit());
test('adversarial: rejects settings changed from start profile', () => testRejectsSettingsChangedFromStartProfile());
test('adversarial: rejects non-finite or inconsistent heap/resource metrics', () => testRejectsNonFiniteOrInconsistentHeapMetrics());
test('adversarial: rejects performance summary inconsistent with raw samples', () => testRejectsPerformanceSummaryInconsistentWithSamples());
test('adversarial: rejects artifact byte/hash mismatch', async () => testRejectsArtifactByteAndHashMismatch());
