// Holistic FIX7 regressions — K1–K4 (closed inputTape, interval-only temporal,
// transitive core digest, no future-dated evidence).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateOracles,
  signalCoveredEveryTick,
} from '../src/testing/lab/oracleEngine.js';
import {
  validateCanonicalScenario,
  compileSimScenario,
} from '../src/contracts/simScenarioSchema.js';
import {
  isResolvedByAcceptedEvidence,
  CANDIDATE_TRANSITIVE_SOURCE_PATHS,
  EVIDENCE_CLOCK_SKEW_MS,
  computeGateDigestsFromManifest,
} from '../scripts/lib/validationBroker.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = join(ROOT, '..');

const flightDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-fixed-input.scenario.json'),
  'utf8',
));

// ── K1: inputTape closed object + no duplicate masking ───────────────────────

test('K1: non-object inputTape is rejected', () => {
  const compiled = compileSimScenario(flightDoc);
  assert.equal(compiled.ok, true);
  const canonical = structuredClone(compiled.canonical);
  canonical.inputTape = 'not-a-tape';
  const v = validateCanonicalScenario(canonical);
  assert.equal(v.ok, false, 'string inputTape must not pass');
  assert.ok(
    v.issues.some((i) => i.path === '$.inputTape' && /object/i.test(i.message)),
    JSON.stringify(v.issues),
  );
});

test('K1: null / array inputTape is rejected', () => {
  const compiled = compileSimScenario(flightDoc);
  const withNull = structuredClone(compiled.canonical);
  withNull.inputTape = null;
  assert.equal(validateCanonicalScenario(withNull).ok, false);

  const withArr = structuredClone(compiled.canonical);
  withArr.inputTape = [];
  assert.equal(validateCanonicalScenario(withArr).ok, false);
});

test('K1: valid raw inputEvents must not mask invalid inputTape.events', () => {
  const compiled = compileSimScenario(flightDoc);
  assert.equal(compiled.ok, true);
  const canonical = structuredClone(compiled.canonical);
  // Valid empty raw surface (would pass alone).
  canonical.inputEvents = [];
  // Invalid consumed tape: NaN tick must be rejected even when raw is clean.
  canonical.inputTape = {
    events: [{ tick: NaN, device: 'keyboard', code: 'KeyW', pressed: true }],
    frames: Array.isArray(canonical.inputTape?.frames) ? canonical.inputTape.frames : [],
  };
  const v = validateCanonicalScenario(canonical);
  assert.equal(v.ok, false, 'duplicate raw must not mask invalid tape events');
  assert.ok(
    v.issues.some((i) =>
      /inputTape\.events|duplicate-input|tick|finite|integer/i.test(
        `${i.path} ${i.rule} ${i.message}`,
      )),
    JSON.stringify(v.issues),
  );
});

test('K1: consumed inputTape events are validated exactly (bad device)', () => {
  const compiled = compileSimScenario(flightDoc);
  const canonical = structuredClone(compiled.canonical);
  // Ensure no raw surface masks the tape.
  delete canonical.inputEvents;
  delete canonical.frames;
  canonical.inputTape = {
    events: [{ tick: 0, device: 'gamepad', code: 'Button0', pressed: true }],
    frames: [],
  };
  const v = validateCanonicalScenario(canonical);
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => /inputTape\.events|gamepad|unsupported|device/i.test(
      `${i.path} ${i.message}`,
    )),
    JSON.stringify(v.issues),
  );
});

// ── K2: temporal assertions evaluate declared interval only ──────────────────

test('K2: holds true-outside / false-in-interval fails', () => {
  // Signal true only at ticks 0–1; declared holds interval is 10–14 (all false).
  const oracle = evaluateOracles({
    trace: [
      { tick: 0, attachmentActive: true },
      { tick: 1, attachmentActive: true },
      { tick: 10, attachmentActive: false },
      { tick: 11, attachmentActive: false },
      { tick: 12, attachmentActive: false },
      { tick: 13, attachmentActive: false },
      { tick: 14, attachmentActive: false },
    ],
    assertions: [
      {
        kind: 'holds',
        signal: 'attachmentActive',
        holdsTicks: 2,
        fromTick: 10,
        toTick: 14,
      },
    ],
  });
  assert.equal(oracle.ok, false, 'outside-interval truthy must not satisfy holds');
  assert.ok(
    oracle.failed.some((f) => /holds:attachmentActive/.test(String(f.id))),
    JSON.stringify(oracle.results),
  );
});

test('K2: holds true only inside declared interval can pass', () => {
  const oracle = evaluateOracles({
    trace: [
      { tick: 0, attachmentActive: false },
      { tick: 1, attachmentActive: false },
      { tick: 10, attachmentActive: true },
      { tick: 11, attachmentActive: true },
      { tick: 12, attachmentActive: true },
      { tick: 13, attachmentActive: false },
      { tick: 14, attachmentActive: false },
    ],
    assertions: [
      {
        kind: 'holds',
        signal: 'attachmentActive',
        holdsTicks: 2,
        fromTick: 10,
        toTick: 14,
      },
    ],
  });
  assert.equal(oracle.ok, true, JSON.stringify(oracle.failed));
});

test('K2: never ignores truthy signal outside its interval', () => {
  // cmdRejected true at tick 0; interval 10–12 is all false → never passes.
  const oracle = evaluateOracles({
    trace: [
      { tick: 0, cmdRejected: true },
      { tick: 10, cmdRejected: false },
      { tick: 11, cmdRejected: false },
      { tick: 12, cmdRejected: false },
    ],
    assertions: [
      { kind: 'never', signal: 'cmdRejected', fromTick: 10, toTick: 12 },
    ],
  });
  assert.equal(oracle.ok, true, JSON.stringify(oracle.failed));
});

test('K2: signalCoveredEveryTick requires contiguous integer ticks', () => {
  // Ticks 0 and 5 alone are NOT complete coverage of [0,5].
  const sparse = signalCoveredEveryTick(
    [
      { tick: 0, cmdRejected: false },
      { tick: 5, cmdRejected: false },
    ],
    'cmdRejected',
  );
  assert.equal(sparse.ok, false);
  assert.equal(sparse.firstMissingTick, 1);

  // Declared interval [10,12] with only endpoints present → fail middle.
  const intervalSparse = signalCoveredEveryTick(
    [
      { tick: 10, cmdRejected: false },
      { tick: 12, cmdRejected: false },
    ],
    'cmdRejected',
    { fromTick: 10, toTick: 12 },
  );
  assert.equal(intervalSparse.ok, false);
  assert.equal(intervalSparse.firstMissingTick, 11);

  // Contiguous fill of declared interval → ok.
  const full = signalCoveredEveryTick(
    [
      { tick: 10, cmdRejected: false },
      { tick: 11, cmdRejected: false },
      { tick: 12, cmdRejected: false },
    ],
    'cmdRejected',
    { fromTick: 10, toTick: 12 },
  );
  assert.equal(full.ok, true);
});

// ── K3: candidate digest covers core game sources ────────────────────────────

test('K3: transitive source list includes core registry/gameState/sim/save/loop', () => {
  const required = [
    'src/core/registry.js',
    'src/core/gameState.js',
    'src/core/sim.js',
    'src/core/loop.js',
    'src/core/physics.js',
    'src/save/saveSystem.js',
    'src/runtime/runtimeProfiles.js',
    'src/runtime/createAuthoritativeRuntime.js',
    'src/contracts/simScenarioSchema.js',
  ];
  for (const p of required) {
    assert.ok(
      CANDIDATE_TRANSITIVE_SOURCE_PATHS.includes(p),
      `missing transitive source: ${p}`,
    );
  }
});

test('K3: computeGateDigestsFromManifest includes core files in candidate identity', async () => {
  const digests = await computeGateDigestsFromManifest({
    root: REPO,
    manifest: {
      id: 'k3-core-digest-probe',
      runtimeKind: 'node',
      productionSourcePaths: [],
      harnessSourcePaths: [],
      regressionSourcePaths: [],
      scenarioPaths: [],
    },
  });
  assert.ok(digests.candidateDigest);
  assert.match(digests.candidateDigest, /^[a-f0-9]{64}$/i);

  // Changing identity id alone changes candidateDigest (manifest folded in).
  const other = await computeGateDigestsFromManifest({
    root: REPO,
    manifest: {
      id: 'k3-core-digest-probe-b',
      runtimeKind: 'node',
      productionSourcePaths: [],
      harnessSourcePaths: [],
      regressionSourcePaths: [],
      scenarioPaths: [],
    },
  });
  assert.notEqual(digests.candidateDigest, other.candidateDigest);
});

// ── K4: future-dated evidence must not clear failures ────────────────────────

test('K4: future-dated accepted evidence is rejected', () => {
  const now = Date.now();
  const digests = { candidateDigest: 'cand-k4' };
  const ok = isResolvedByAcceptedEvidence({
    latestFailure: {
      primaryAcceptance: true,
      runtimeKind: 'browser',
      generatedAt: new Date(now - 60_000).toISOString(),
    },
    acceptedRuntimeKind: 'browser',
    acceptedGeneratedAt: '2099-01-01T00:00:00.000Z',
    now,
    acceptedEvidence: {
      pass: true,
      primaryAcceptance: true,
      claimId: 'claim-future',
      digests,
    },
    ...digests,
  });
  assert.equal(ok, false, '2099 evidence must not resolve');
});

test('K4: evidence older than clock-skew window is rejected', () => {
  const now = Date.now();
  const digests = { candidateDigest: 'cand-k4-old' };
  const tooOld = new Date(now - EVIDENCE_CLOCK_SKEW_MS - 60_000).toISOString();
  const ok = isResolvedByAcceptedEvidence({
    latestFailure: {
      primaryAcceptance: true,
      runtimeKind: 'browser',
      generatedAt: new Date(now - EVIDENCE_CLOCK_SKEW_MS - 120_000).toISOString(),
    },
    acceptedRuntimeKind: 'browser',
    acceptedGeneratedAt: tooOld,
    now,
    acceptedEvidence: {
      pass: true,
      primaryAcceptance: true,
      claimId: 'claim-stale',
      digests,
    },
    ...digests,
  });
  assert.equal(ok, false, 'stale evidence beyond skew must not resolve');
});

test('K4: digests alone without claim/receipt identity do not resolve', () => {
  const now = Date.now();
  const digests = { candidateDigest: 'cand-k4-noclaim' };
  const ok = isResolvedByAcceptedEvidence({
    latestFailure: {
      primaryAcceptance: true,
      runtimeKind: 'browser',
      generatedAt: new Date(now - 60_000).toISOString(),
    },
    acceptedRuntimeKind: 'browser',
    acceptedGeneratedAt: new Date(now).toISOString(),
    now,
    acceptedEvidence: {
      pass: true,
      primaryAcceptance: true,
      // claimId / receipt intentionally absent
      digests,
    },
    ...digests,
  });
  assert.equal(ok, false, 'missing claim/receipt identity must not resolve');
});

test('K4: near-now evidence with claimId and matching digests may resolve', () => {
  const now = Date.now();
  const digests = { candidateDigest: 'cand-k4-ok' };
  const ok = isResolvedByAcceptedEvidence({
    latestFailure: {
      primaryAcceptance: true,
      runtimeKind: 'browser',
      generatedAt: new Date(now - 60_000).toISOString(),
    },
    acceptedRuntimeKind: 'browser',
    acceptedGeneratedAt: new Date(now).toISOString(),
    now,
    acceptedEvidence: {
      pass: true,
      primaryAcceptance: true,
      claimId: 'claim-k4-ok',
      digests,
    },
    ...digests,
    // L2: ledger-backed claim identity (not self-asserted claimId alone).
    consumedClaim: {
      claimId: 'claim-k4-ok',
      candidateDigest: digests.candidateDigest,
      runtimeKind: 'browser',
      mode: 'acceptance',
      consumedAt: new Date(now).toISOString(),
    },
  });
  assert.equal(ok, true);
});

test('K4: claimId mismatch against expected claim rejects', () => {
  const now = Date.now();
  const digests = { candidateDigest: 'cand-k4-claim' };
  const ok = isResolvedByAcceptedEvidence({
    latestFailure: {
      primaryAcceptance: true,
      runtimeKind: 'browser',
      generatedAt: new Date(now - 60_000).toISOString(),
    },
    acceptedRuntimeKind: 'browser',
    acceptedGeneratedAt: new Date(now).toISOString(),
    now,
    claimId: 'expected-claim',
    acceptedEvidence: {
      pass: true,
      primaryAcceptance: true,
      claimId: 'other-claim',
      digests,
    },
    ...digests,
  });
  assert.equal(ok, false);
});
