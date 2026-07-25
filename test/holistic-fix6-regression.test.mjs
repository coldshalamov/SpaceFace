// Holistic FIX6 regressions — J1–J6 (certification boundary + massSeedHud init).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  performSaveLoad,
  LAB_SAVE_LOAD_CANARY_KEY,
} from '../src/testing/lab/runScenario.js';
import {
  evaluateOracles,
  signalCoveredEveryTick,
} from '../src/testing/lab/oracleEngine.js';
import {
  validateCanonicalScenario,
  validateSimScenario,
  compileSimScenario,
} from '../src/contracts/simScenarioSchema.js';
import {
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
} from '../src/runtime/authoritativeSystemManifest.js';
import {
  validateBrokerClaim,
  issueBrokerClaim,
  isResolvedByAcceptedEvidence,
  CANDIDATE_TRANSITIVE_SOURCE_PATHS,
  computeGateDigestsFromManifest,
} from '../scripts/lib/validationBroker.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = join(ROOT, '..');

const flightDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-fixed-input.scenario.json'),
  'utf8',
));

// ── J1: canary verifies actual restore ───────────────────────────────────────

test('J1: adversarial loadEnvelope that only returns true fails canary check', async () => {
  const state = {
    player: { credits: 100, hull: 1 },
    meta: { seed: 42 },
    simTime: 1.5,
    settings: { gameplay: {} },
  };
  let serialized = null;
  const runtime = {
    getSystem(name) {
      if (name !== 'save') return null;
      return {
        serialize() {
          // Capture player including canary the lab injects before serialize.
          serialized = {
            fmt: 'spaceface-save',
            data: { player: { ...state.player } },
          };
          return structuredClone(serialized);
        },
        // Adversarial: claims success but does not restore anything.
        loadEnvelope() {
          return true;
        },
      };
    },
    config: { profileId: 'production' },
    liveSystems: null,
  };

  const result = await performSaveLoad(runtime, state, {});
  assert.equal(result.ok, false, 'no-op loadEnvelope must not pass');
  assert.equal(result.restoreCount | 0, 0);
  assert.match(String(result.reason || ''), /canary/i);
  // Poison remains — restore did not apply.
  assert.equal(state.player[LAB_SAVE_LOAD_CANARY_KEY], '__lab_canary_poison_no_restore__');
});

test('J1: honest loadEnvelope that restores player canary passes with restoreCount=1', async () => {
  const state = {
    player: { credits: 100, hull: 1 },
    meta: { seed: 7 },
    simTime: 0,
    settings: { gameplay: {} },
  };
  let envelope = null;
  const runtime = {
    getSystem(name) {
      if (name !== 'save') return null;
      return {
        serialize() {
          envelope = {
            fmt: 'spaceface-save',
            data: { player: { ...state.player } },
          };
          return structuredClone(envelope);
        },
        loadEnvelope(env) {
          // Real restore: apply serialized player blob onto live state.
          const p = env && env.data && env.data.player;
          if (!p) return false;
          for (const k of Object.keys(p)) state.player[k] = p[k];
          return true;
        },
      };
    },
    config: { profileId: 'production' },
    liveSystems: null,
  };

  const result = await performSaveLoad(runtime, state, {});
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.restoreCount, 1);
  // Canary cleaned up after successful verify.
  assert.equal(state.player[LAB_SAVE_LOAD_CANARY_KEY], undefined);
});

// ── J2: complete required digests + expanded sources ─────────────────────────

test('J2: evidence missing routeDigest is rejected when routeDigest is declared', () => {
  const now = Date.now();
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
      claimId: 'claim-j2-missing-route',
      digests: {
        candidateDigest: 'cand-1',
        // routeDigest intentionally missing
        regressionDigest: 'reg-1',
      },
    },
    candidateDigest: 'cand-1',
    routeDigest: 'route-1',
    regressionDigest: 'reg-1',
  });
  assert.equal(ok, false, 'missing routeDigest on evidence must not resolve');
});

test('J2: evidence with all declared digests matching may resolve', () => {
  const digests = {
    candidateDigest: 'cand-ok',
    routeDigest: 'route-ok',
    regressionDigest: 'reg-ok',
    profileDigest: 'prof-ok',
    manifestDigest: 'man-ok',
  };
  const now = Date.now();
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
      claimId: 'claim-j2-all-digests',
      digests: { ...digests },
    },
    ...digests,
    // L2: ledger entry required for claimId binding.
    consumedClaim: {
      claimId: 'claim-j2-all-digests',
      candidateDigest: digests.candidateDigest,
      runtimeKind: 'browser',
      consumedAt: new Date(now).toISOString(),
    },
  });
  assert.equal(ok, true);
});

test('J2: candidate transitive sources include runtime/lab/gameplay deps', () => {
  assert.ok(CANDIDATE_TRANSITIVE_SOURCE_PATHS.includes('src/runtime/runtimeProfiles.js'));
  assert.ok(CANDIDATE_TRANSITIVE_SOURCE_PATHS.includes('src/runtime/resolveRuntimeManifest.js'));
  assert.ok(CANDIDATE_TRANSITIVE_SOURCE_PATHS.includes('src/systems/masslineInputGrammar.js'));
  assert.ok(CANDIDATE_TRANSITIVE_SOURCE_PATHS.includes('src/data/featureFlags.js'));
  assert.ok(CANDIDATE_TRANSITIVE_SOURCE_PATHS.includes('src/systems/flightV3.js'));
  assert.ok(CANDIDATE_TRANSITIVE_SOURCE_PATHS.includes('src/testing/lab/runScenario.js'));
  assert.ok(CANDIDATE_TRANSITIVE_SOURCE_PATHS.includes('src/contracts/simScenarioSchema.js'));
  // K3 core closure
  assert.ok(CANDIDATE_TRANSITIVE_SOURCE_PATHS.includes('src/core/registry.js'));
  assert.ok(CANDIDATE_TRANSITIVE_SOURCE_PATHS.includes('src/core/gameState.js'));
  assert.ok(CANDIDATE_TRANSITIVE_SOURCE_PATHS.includes('src/core/sim.js'));
  assert.ok(CANDIDATE_TRANSITIVE_SOURCE_PATHS.includes('src/save/saveSystem.js'));
});

test('J2: computeGateDigestsFromManifest folds transitive sources into candidate', async () => {
  const digests = await computeGateDigestsFromManifest({
    root: REPO,
    manifest: {
      id: 'j2-digest-probe',
      runtimeKind: 'node',
      // Empty production list — transitive sources must still contribute.
      productionSourcePaths: [],
      harnessSourcePaths: [],
      regressionSourcePaths: [],
      scenarioPaths: [],
    },
  });
  assert.ok(digests.candidateDigest);
  assert.ok(digests.routeDigest);
  assert.ok(digests.profileDigest);
  assert.ok(digests.manifestDigest);
  // Empty production paths alone would still hash transitive sources → non-empty identity.
  const emptyOnly = await computeGateDigestsFromManifest({
    root: REPO,
    manifest: {
      id: 'j2-digest-probe-b',
      runtimeKind: 'node',
      productionSourcePaths: [],
      harnessSourcePaths: [],
      regressionSourcePaths: [],
      scenarioPaths: [],
    },
  });
  // Same transitive set + different id → different candidateDigest
  assert.notEqual(digests.candidateDigest, emptyOnly.candidateDigest);
});

// ── J3: canonical full validation reuses raw validators ──────────────────────

test('J3: canonical with unknown top-level field is rejected', () => {
  const compiled = compileSimScenario(flightDoc);
  assert.equal(compiled.ok, true);
  const canonical = structuredClone(compiled.canonical);
  canonical.totallyUnknownField = true;
  const v = validateCanonicalScenario(canonical);
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => i.rule === 'unknown-field' && /totallyUnknownField/.test(i.path + i.message)),
    JSON.stringify(v.issues),
  );
});

test('J3: canonical with unknown world field is rejected', () => {
  const compiled = compileSimScenario(flightDoc);
  const canonical = structuredClone(compiled.canonical);
  canonical.world = { ...canonical.world, secretWorldHack: 1 };
  const v = validateCanonicalScenario(canonical);
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => i.rule === 'unknown-field' && /secretWorldHack/.test(i.path + i.message)),
    JSON.stringify(v.issues),
  );
});

test('J3: canonical with NaN entity position is rejected', () => {
  const compiled = compileSimScenario(flightDoc);
  const canonical = structuredClone(compiled.canonical);
  assert.ok(Array.isArray(canonical.entities) && canonical.entities.length > 0);
  canonical.entities[0].pos = { x: NaN, y: 0, z: 0 };
  const v = validateCanonicalScenario(canonical);
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => /pos/.test(i.path) && /finite/i.test(i.message)),
    JSON.stringify(v.issues),
  );
});

test('J3: raw and canonical reject the same NaN position defect', () => {
  const raw = structuredClone(flightDoc);
  raw.entities = raw.entities || [{ alias: 'player', profile: 'player_basic', isPlayer: true }];
  raw.entities[0] = { ...raw.entities[0], pos: { x: NaN, y: 0, z: 0 } };
  const rawV = validateSimScenario(raw);
  assert.equal(rawV.ok, false);

  const compiled = compileSimScenario(flightDoc);
  const canonical = structuredClone(compiled.canonical);
  canonical.entities[0].pos = { x: NaN, y: 0, z: 0 };
  const canV = validateCanonicalScenario(canonical);
  assert.equal(canV.ok, false);
});

// ── J4: partially-sampled signals fail temporal assertions ───────────────────

test('J4: never on partially-sampled signal fails (not vacuous pass)', () => {
  const oracle = evaluateOracles({
    trace: [
      { tick: 0, playerX: 0, cmdRejected: false },
      { tick: 1, playerX: 1, cmdRejected: false },
      // cmdRejected absent on later ticks — partial coverage
      { tick: 5, playerX: 2 },
    ],
    assertions: [
      { kind: 'never', signal: 'cmdRejected' },
    ],
  });
  assert.equal(oracle.ok, false);
  const failed = oracle.failed.find((f) => /cmdRejected/.test(String(f.id)));
  assert.ok(failed, JSON.stringify(oracle.results));
  assert.match(String(failed.reason || ''), /coverage|absent|insufficient|vacuous/i);
});

test('J4: settles with partial radialSpeed samples fails (missing ≠ 0)', () => {
  const oracle = evaluateOracles({
    trace: [
      { tick: 0, radialSpeed: 10 },
      { tick: 1, radialSpeed: 0 },
      // missing radialSpeed — old code treated as 0 → vacuous settle
      { tick: 2, playerX: 1 },
    ],
    assertions: [
      { kind: 'settles', signal: 'radialSpeed', value: 3 },
    ],
  });
  assert.equal(oracle.ok, false);
  assert.ok(oracle.failed.some((f) => f.id === 'settles' || /radialSpeed|settles/.test(String(f.id))));
});

test('J4: signalCoveredEveryTick requires contiguous ticks (sparse samples fail)', () => {
  // Present on sample 0, absent on sample 5 → partial.
  const partial = signalCoveredEveryTick(
    [
      { tick: 0, cmdRejected: false },
      { tick: 5, playerX: 1 },
    ],
    'cmdRejected',
  );
  assert.equal(partial.ok, false);
  assert.equal(partial.partial, true);
  // Contiguous coverage: first gap is tick 1 (not merely "absent on sample 5").
  assert.equal(partial.firstMissingTick, 1);

  // Sparse 0 + 5 with signal on both still fails contiguous ticks 1–4 (K2).
  const sparse = signalCoveredEveryTick(
    [
      { tick: 0, cmdRejected: false },
      { tick: 5, cmdRejected: false },
    ],
    'cmdRejected',
  );
  assert.equal(sparse.ok, false);
  assert.equal(sparse.firstMissingTick, 1);

  // Contiguous integer ticks with the signal → ok.
  const full = signalCoveredEveryTick(
    [
      { tick: 0, cmdRejected: false },
      { tick: 1, cmdRejected: false },
      { tick: 2, cmdRejected: false },
    ],
    'cmdRejected',
  );
  assert.equal(full.ok, true);
});

// ── J5: claims require runtimeKind + digests ─────────────────────────────────

test('J5: claim missing runtimeKind is rejected', async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), 'j5-rk-'));
  try {
    const manifest = {
      id: 'j5-missing-rk',
      claimSchema: 'spaceface.validation-broker-claim.v1',
      mode: 'acceptance',
      runtimeKind: 'browser',
      maxLaunchesPerCandidate: 3,
    };
    const issued = await issueBrokerClaim({
      outputRoot,
      manifest,
      mode: 'acceptance',
      digests: {
        candidateDigest: 'c',
        routeDigest: 'r',
        regressionDigest: 'g',
        profileDigest: 'p',
        manifestDigest: 'm',
      },
    });
    // Strip runtimeKind after issue to simulate pre-J5 claim.
    const claim = structuredClone(issued.claim);
    delete claim.runtimeKind;
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(join(outputRoot, 'broker-claims'), { recursive: true });
    const badPath = join(outputRoot, 'broker-claims', 'pre-j5-no-rk.json');
    await writeFile(badPath, JSON.stringify(claim), 'utf8');

    const check = await validateBrokerClaim({
      outputRoot,
      manifest,
      tokenOrPath: badPath,
      requiredMode: 'acceptance',
      requiredRuntimeKind: 'browser',
    });
    assert.equal(check.ok, false);
    assert.equal(check.reason, 'broker-claim-missing-runtime-kind');
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test('J5: claim missing declared digest field is rejected', async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), 'j5-dig-'));
  try {
    const manifest = {
      id: 'j5-missing-digest',
      claimSchema: 'spaceface.validation-broker-claim.v1',
      mode: 'acceptance',
      runtimeKind: 'browser',
      maxLaunchesPerCandidate: 3,
    };
    const current = {
      candidateDigest: 'cand-now',
      routeDigest: 'route-now',
      regressionDigest: 'reg-now',
      profileDigest: 'prof-now',
      manifestDigest: 'man-now',
    };
    const issued = await issueBrokerClaim({
      outputRoot,
      manifest,
      mode: 'acceptance',
      digests: {
        candidateDigest: current.candidateDigest,
        // intentionally omit routeDigest etc. on the claim digests
      },
    });
    const check = await validateBrokerClaim({
      outputRoot,
      manifest,
      tokenOrPath: issued.claimPath,
      requiredMode: 'acceptance',
      requiredRuntimeKind: 'browser',
      digests: current,
    });
    assert.equal(check.ok, false);
    assert.ok(
      check.reason === 'broker-claim-missing-digest' || check.reason === 'broker-claim-stale-digest',
      check.reason,
    );
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

// ── J6: massSeedHud in init + update ⊆ init ──────────────────────────────────

test('J6: massSeedHud is in both PRODUCTION_INIT_ORDER and PRODUCTION_UPDATE_ORDER', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('massSeedHud'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('massSeedHud'));
});

test('J6: every production update system is also in init order', () => {
  const initSet = new Set(PRODUCTION_INIT_ORDER);
  const missing = PRODUCTION_UPDATE_ORDER.filter((id) => !initSet.has(id));
  assert.deepEqual(missing, [], `update ⊈ init: ${missing.join(', ')}`);
});
