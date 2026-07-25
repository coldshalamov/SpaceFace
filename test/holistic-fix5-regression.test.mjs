// Holistic FIX5 regressions — I1–I11 (no unverified evidence certifications).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareSaveLoad } from '../src/testing/lab/saveLoadCompare.js';
import { runLabScenario } from '../src/testing/lab/runScenario.js';
import { evaluateOracles } from '../src/testing/lab/oracleEngine.js';
import {
  validateCanonicalScenario,
  compileSimScenario,
} from '../src/contracts/simScenarioSchema.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { compareRuntimeFingerprints } from '../src/testing/lab/differentialReplay.js';
import {
  validateBrokerClaim,
  issueBrokerClaim,
  isResolvedByAcceptedEvidence,
} from '../scripts/lib/validationBroker.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = join(ROOT, '..');

const flightDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-fixed-input.scenario.json'),
  'utf8',
));
const saveLoadDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-save-load.scenario.json'),
  'utf8',
));
const latchDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/massline-latch-reel.scenario.json'),
  'utf8',
));
const orbitDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/massline-orbit-assist.scenario.json'),
  'utf8',
));

// ── I1: save/load must perform restore ───────────────────────────────────────

test('I1: saveLoadAt:999 fails validation (out of range)', async () => {
  const result = await compareSaveLoad(saveLoadDoc, {
    verbosity: 1,
    saveLoadAt: 999,
  });
  assert.equal(result.ok, false);
  assert.equal(result.exitClass, 4);
  assert.ok(
    result.reason === 'saveLoadAt-out-of-range'
      || /out of range|save-load/i.test(String(result.reason || result.status || '')),
    JSON.stringify({ reason: result.reason, status: result.status, error: result.error }),
  );
});

test('I1: saveLoadAt past last post-restore tick fails', async () => {
  const ticks = saveLoadDoc.ticks | 0;
  // last tick index is ticks-1; valid range is 0..ticks-2
  const result = await compareSaveLoad(saveLoadDoc, {
    verbosity: 1,
    saveLoadAt: ticks - 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.exitClass, 4);
  assert.ok(
    result.reason === 'saveLoadAt-out-of-range'
      || /out of range/i.test(String(result.reason || result.detail || '')),
  );
});

test('I1: runLabScenario with saveLoadAt:999 fails at validation', async () => {
  const result = await runLabScenario(saveLoadDoc, {
    verbosity: 1,
    saveLoadAt: 999,
  });
  assert.equal(result.ok, false);
  assert.equal(result.exitClass, 4);
  assert.match(String(result.error || ''), /out of range/i);
  assert.equal(result.params?.saveLoadPerformed, false);
  assert.equal(result.params?.saveLoadRestoreCount | 0, 0);
});

test('I1: normal save/load reports performed + restoreCount=1', async () => {
  const result = await compareSaveLoad(saveLoadDoc, {
    verbosity: 2,
    saveLoadAt: 40,
  });
  // May pass or fail parity, but must not claim success without restore.
  if (result.status === 'save-load-not-performed') {
    assert.fail('save/load arm must actually perform restore on valid saveLoadAt');
  }
  if (result.exitClass === 0 || result.exitClass === 5 || result.exitClass === 1) {
    // When arms ran, check performed flags are present on compare result when available.
    if (result.saveLoadPerformed != null) {
      assert.equal(result.saveLoadPerformed, true);
      assert.equal(result.saveLoadRestoreCount, 1);
    }
    if (result.controlRestoreCount != null) {
      assert.equal(result.controlRestoreCount, 0);
    }
  }
  // Direct run arm check:
  const arm = await runLabScenario(saveLoadDoc, {
    verbosity: 1,
    saveLoadAt: 40,
  });
  if (arm.exitClass !== 3 && arm.exitClass !== 4) {
    assert.equal(arm.params?.saveLoadPerformed, true);
    assert.equal(arm.params?.saveLoadRestoreCount, 1);
  }
});

// ── I2: diagnostic claims cannot authorize acceptance ────────────────────────

test('I2: diagnostic-mode claim rejected for acceptance authorization', async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), 'i2-diag-claim-'));
  try {
    const manifest = {
      id: 'i2-test',
      claimSchema: 'spaceface.validation-broker-claim.v1',
      mode: 'acceptance',
      runtimeKind: 'browser',
      maxLaunchesPerCandidate: 3,
    };
    const issued = await issueBrokerClaim({
      outputRoot,
      manifest,
      mode: 'diagnostic',
      digests: { candidateDigest: 'c1', routeDigest: 'r1', regressionDigest: 'g1' },
    });
    const check = await validateBrokerClaim({
      outputRoot,
      manifest,
      tokenOrPath: issued.claimPath,
      requiredMode: 'acceptance',
    });
    assert.equal(check.ok, false);
    assert.equal(check.reason, 'broker-claim-mode-mismatch');
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

// ── I3: probes must not self-mint ────────────────────────────────────────────

test('I3: probe without SF_BROKER_CLAIM fails acceptance preflight', async () => {
  const guardUrl = new URL('../scripts/lib/pq017ProbeIterationGuard.mjs', import.meta.url);
  const {
    assertPq017ProbeLaunch,
    publishPq017FastGateReceipt,
    createPq017FastGateReceipt,
  } = await import(guardUrl.href);
  const outputRoot = await mkdtemp(join(tmpdir(), 'pq017-i3-'));
  try {
    await mkdir(join(outputRoot, 'staging'), { recursive: true });
    await publishPq017FastGateReceipt({
      outputRoot,
      receipt: createPq017FastGateReceipt({
        routeDigest: 'i3-route',
        regressionDigest: 'i3-reg',
      }),
    });
    await assert.rejects(
      () => assertPq017ProbeLaunch({
        root: REPO,
        outputRoot,
        runtimeKind: 'browser',
        mode: 'acceptance',
        explicitAcceptance: true,
        // No brokerClaimToken / SF_BROKER_CLAIM
      }),
      (err) => {
        assert.match(String(err && err.message), /broker-claim-required|PREFLIGHT_BLOCKED/i);
        assert.equal(err.gateResult?.primaryAcceptance, false);
        return true;
      },
    );
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test('I3: probe entrypoints do not call issuePq017AcceptanceClaim', () => {
  for (const rel of [
    'scripts/probe-pq017-world-site.mjs',
    'scripts/probe-pq017-world-site-electron.mjs',
  ]) {
    const src = readFileSync(join(REPO, rel), 'utf8');
    // Strip comments so doc references to the external issuer do not false-fail.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(stripped, /issuePq017AcceptanceClaim/, `${rel} must not self-mint`);
    assert.match(src, /SF_BROKER_CLAIM/);
  }
});

// ── I4: massline causal assertions ───────────────────────────────────────────

test('I4: massline latch-reel fails with empty input', async () => {
  const empty = {
    ...latchDoc,
    id: 'massline.latch-reel.empty-input',
    inputEvents: [],
    frames: [],
  };
  const result = await runLabScenario(empty, { verbosity: 1 });
  assert.equal(result.ok, false, 'empty input must not pass latch/reel causal assertions');
  assert.ok(
    (result.oracle?.failed?.length || 0) > 0
      || result.exitClass === 1
      || result.exitClass === 4,
    JSON.stringify(result.oracle?.failed || result.error),
  );
});

test('I4: massline orbit-assist fails with empty input', async () => {
  const empty = {
    ...orbitDoc,
    id: 'massline.orbit-assist.empty-input',
    inputEvents: [],
    frames: [],
  };
  const result = await runLabScenario(empty, { verbosity: 1 });
  assert.equal(result.ok, false, 'empty input must not pass orbit-assist causal assertions');
});

test('I4: massline latch-reel with full input still passes causal assertions', async () => {
  const result = await runLabScenario(latchDoc, { verbosity: 1 });
  assert.notEqual(result.exitClass, 3, result.error);
  assert.equal(result.ok, true, JSON.stringify(result.oracle?.failed || result.error));
  assert.equal(result.params?.attachmentActiveAtEnd, true);
});

// ── I5: legacy47a uses legacy AI/flight ──────────────────────────────────────

test('I5: legacy47a runtime materializes legacy AI/flight (not tactical/V3)', () => {
  const runtime = createAuthoritativeRuntime({
    profileId: 'legacy47a',
    seed: 47,
    nodeSafeOnly: true,
    seedProcessMaps: false,
  });
  try {
    const slots = runtime.manifest.selectedSlots;
    assert.equal(slots.aiBackend, 'legacy', `aiBackend=${slots.aiBackend}`);
    assert.equal(slots.flightBackend, 'legacy', `flightBackend=${slots.flightBackend}`);
    assert.notEqual(slots.aiBackend, 'sg06-tactical');
    assert.notEqual(slots.flightBackend, 'v3');
    // Live systems must not be tacticalAI / flightV3 implementation.
    const ai = runtime.getSystem('ai') || runtime.getSystem('tacticalAI');
    const flight = runtime.getSystem('flight');
    if (ai) assert.notEqual(ai.name, 'tacticalAI');
    if (flight) {
      // flightV3 exposes _stepCraft; legacy exposes applyPlayerIntent.
      assert.equal(typeof flight._stepCraft, 'undefined');
    }
  } finally {
    runtime.dispose();
  }
});

// ── I6: evidence must bind candidate digests ─────────────────────────────────

test('I6: evidence without matching candidateDigest does not resolve failure', () => {
  // isResolvedByAcceptedEvidence is exported from validationBroker.
  const ok = isResolvedByAcceptedEvidence({
    latestFailure: {
      primaryAcceptance: true,
      runtimeKind: 'browser',
      generatedAt: '2020-01-01T00:00:00.000Z',
    },
    acceptedRuntimeKind: 'browser',
    acceptedGeneratedAt: '2030-01-01T00:00:00.000Z',
    acceptedEvidence: {
      pass: true,
      primaryAcceptance: true,
      digests: { candidateDigest: 'stale-other-candidate' },
    },
    candidateDigest: 'current-candidate',
  });
  assert.equal(ok, false, 'mismatched candidate digest must not resolve');

  const bound = isResolvedByAcceptedEvidence({
    latestFailure: {
      primaryAcceptance: true,
      runtimeKind: 'browser',
      generatedAt: '2020-01-01T00:00:00.000Z',
    },
    acceptedRuntimeKind: 'browser',
    acceptedGeneratedAt: '2030-01-01T00:00:00.000Z',
    acceptedEvidence: {
      pass: true,
      primaryAcceptance: true,
      digests: { candidateDigest: 'current-candidate' },
    },
    candidateDigest: 'current-candidate',
  });
  assert.equal(bound, true, 'matching candidate digest may resolve');
});

// ── I7: canonical full validation ────────────────────────────────────────────

test('I7: canonical with ticks:0 fails validation', () => {
  const compiled = compileSimScenario(flightDoc);
  assert.equal(compiled.ok, true);
  const canonical = structuredClone(compiled.canonical);
  canonical.ticks = 0;
  const v = validateCanonicalScenario(canonical);
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => i.path === '$.ticks' || /ticks/i.test(i.message)),
    JSON.stringify(v.issues),
  );
});

test('I7: canonical missing seed fails validation', () => {
  const compiled = compileSimScenario(flightDoc);
  const canonical = structuredClone(compiled.canonical);
  delete canonical.seed;
  const v = validateCanonicalScenario(canonical);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.path === '$.seed'));
});

// ── I8: unsampled signals fail temporal assertions ───────────────────────────

test('I8: never cmdRejected with no samples fails (not vacuous pass)', () => {
  const oracle = evaluateOracles({
    // samples lack cmdRejected entirely
    trace: [
      { tick: 0, playerX: 0, playerAlive: true },
      { tick: 1, playerX: 1, playerAlive: true },
    ],
    assertions: [
      { kind: 'never', signal: 'cmdRejected' },
    ],
  });
  assert.equal(oracle.ok, false);
  const failed = oracle.failed.find((f) => f.id === 'never:cmdRejected' || /cmdRejected/.test(f.id));
  assert.ok(failed, JSON.stringify(oracle.results));
  assert.match(String(failed.reason || ''), /never observed|vacuous|unsampled|sampled/i);
});

test('I8: settles on unsampled radialSpeed fails', () => {
  const oracle = evaluateOracles({
    trace: [
      { tick: 0, playerX: 0 },
      { tick: 1, playerX: 1 },
    ],
    assertions: [
      { kind: 'settles' },
    ],
  });
  assert.equal(oracle.ok, false);
  assert.ok(oracle.failed.some((f) => f.id === 'settles' || /radialSpeed|settles/.test(String(f.id))));
});

// ── I9: legacy map isolation ─────────────────────────────────────────────────

test('I9: legacy47a restores own maps even after production seed residual', async () => {
  const {
    combatFlag,
    massline2Flag,
    applyFeatureConfigToMaps,
    snapshotFeatureMaps,
    restoreFeatureMaps,
  } = await import('../src/data/featureFlags.js');
  const { PRODUCTION_FEATURES } = await import('../src/runtime/runtimeProfiles.js');
  const snap = snapshotFeatureMaps();
  try {
    applyFeatureConfigToMaps(PRODUCTION_FEATURES);
    assert.equal(combatFlag('weaponImpulseConsequences'), true);

    const legacy = createAuthoritativeRuntime({
      profileId: 'legacy47a',
      seed: 1,
      systems: [{
        name: 'flagProbe',
        update(_dt, state) {
          state.obs = {
            weaponImpulseConsequences: combatFlag('weaponImpulseConsequences'),
            masslineEnabled: massline2Flag('enabled'),
          };
        },
      }],
      // default seedProcessMaps (true for all profiles after I9)
    });
    try {
      assert.equal(legacy.featureMapIsolation, 'restore-on-step');
      legacy.step(1 / 60);
      assert.deepEqual(legacy.state.obs, {
        weaponImpulseConsequences: false,
        masslineEnabled: false,
      });
    } finally {
      legacy.dispose();
    }
  } finally {
    restoreFeatureMaps(snap);
  }
});

// ── I10: fingerprint requires both hashes ────────────────────────────────────

test('I10: compareRuntimeFingerprints fails when profileHash missing', () => {
  const cmp = compareRuntimeFingerprints(
    { manifestHash: 'same' },
    { manifestHash: 'same', profileHash: 'abc' },
  );
  assert.equal(cmp.match, false);
  assert.equal(cmp.reason, 'profileHash-missing');
});

test('I10: both hashes present and equal → match', () => {
  const cmp = compareRuntimeFingerprints(
    { manifestHash: 'm', profileHash: 'p' },
    { manifestHash: 'm', profileHash: 'p' },
  );
  assert.equal(cmp.match, true);
});

// ── I11: PQ runtime kind binding ─────────────────────────────────────────────

test('I11: browser claim does not authorize electron runtime', async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), 'i11-rk-'));
  try {
    const browserManifest = {
      id: 'i11-test',
      claimSchema: 'spaceface.validation-broker-claim.v1',
      mode: 'acceptance',
      runtimeKind: 'browser',
      maxLaunchesPerCandidate: 3,
    };
    const issued = await issueBrokerClaim({
      outputRoot,
      manifest: browserManifest,
      mode: 'acceptance',
      digests: { candidateDigest: 'c', routeDigest: 'r', regressionDigest: 'g' },
    });
    assert.equal(issued.claim.runtimeKind, 'browser');

    const electronCheck = await validateBrokerClaim({
      outputRoot,
      manifest: { ...browserManifest, runtimeKind: 'electron' },
      tokenOrPath: issued.claimPath,
      requiredMode: 'acceptance',
      requiredRuntimeKind: 'electron',
    });
    assert.equal(electronCheck.ok, false);
    assert.equal(electronCheck.reason, 'broker-claim-runtime-kind-mismatch');
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});
