// Holistic V1 system-level hole regressions (H1–H15) + FIX2 (open/partial + N1/N2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm } from 'node:fs/promises';

import { runLabScenario, assertAssertionsConsumed } from '../src/testing/lab/runScenario.js';
import { evaluateOracles } from '../src/testing/lab/oracleEngine.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import { resolveRuntimeManifest } from '../src/runtime/resolveRuntimeManifest.js';
import { travelFlag, massline2Flag, combatFlag } from '../src/data/featureFlags.js';
import {
  validateSimScenario,
  compileSimScenario,
} from '../src/contracts/simScenarioSchema.js';
import { deriveEvidenceClass } from '../src/testing/lab/evidenceClass.js';
import { createInputTapeDriver } from '../src/testing/lab/inputTape.js';
import { mulberry32, mulberry32FromContinuation } from '../src/core/rng.js';
import {
  issueBrokerClaim,
  consumeBrokerClaim,
  validateBrokerClaim,
  getCandidateLaunchCount,
} from '../scripts/lib/validationBroker.mjs';
import { canonicalStringify } from '../src/core/simSnapshot.js';
import { createHash } from 'node:crypto';

const ROOT = dirname(fileURLToPath(import.meta.url));
const flightDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-fixed-input.scenario.json'),
  'utf8',
));

// ── H1 ───────────────────────────────────────────────────────────────────────

test('H1: production-profile lab step seeds process MAPS (travelBurn + massline2 enabled)', async () => {
  let midStepFlags = null;
  const probe = {
    name: 'h1FlagProbe',
    init() {},
    update() {
      // Runs inside withFeatureMaps during runtime.step.
      midStepFlags = {
        travelBurn: travelFlag('travelBurn'),
        masslineEnabled: massline2Flag('enabled'),
        weaponImpulse: combatFlag('weaponImpulseConsequences'),
      };
    },
  };

  const { FOCUSED_FLIGHT_SYSTEMS } = await import('../src/testing/lab/systemBundles.js');
  const result = await runLabScenario(flightDoc, {
    systems: [...FOCUSED_FLIGHT_SYSTEMS, probe],
    verbosity: 1,
  });
  assert.notEqual(result.exitClass, 3, result.error || 'infra');
  assert.ok(midStepFlags, 'probe must run during a step');
  assert.equal(midStepFlags.travelBurn, true, 'travelFlag(travelBurn) must be true mid-step');
  assert.equal(midStepFlags.masslineEnabled, true, 'massline2Flag(enabled) must be true mid-step');
  assert.equal(midStepFlags.weaponImpulse, true, 'combatFlag(weaponImpulseConsequences) must be true mid-step');
});

// ── H2 ───────────────────────────────────────────────────────────────────────

test('H2: focused lab never returns production-fixture even when authored', async () => {
  const authored = {
    ...flightDoc,
    id: 'h2.production-claim',
    evidenceClass: 'production-fixture',
  };
  const result = await runLabScenario(authored, { verbosity: 1 });
  assert.notEqual(result.exitClass, 3, result.error);
  assert.notEqual(result.evidenceClass, 'production-fixture');
  assert.equal(result.evidenceClass, 'focused-fixture');
  assert.equal(result.authoredEvidenceClass, 'production-fixture');
  assert.equal(result.evidenceDemoted, true);
});

test('H2: deriveEvidenceClass demotes production claims for focused runs', () => {
  const d = deriveEvidenceClass({
    authored: 'production-fixture',
    manifestEvidenceClass: 'focused-explicit',
    focusedSystems: true,
    systemNames: ['actions', 'flight', 'weapons', 'physics'],
  });
  assert.equal(d.evidenceClass, 'focused-fixture');
  assert.equal(d.demoted, true);
});

// ── H3 + H4 ──────────────────────────────────────────────────────────────────

test('H3/H4: full production manifest initializes in Node without ReferenceError', () => {
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed: 7,
  });
  assert.ok(runtime.state, 'runtime.state must initialize');
  assert.equal(runtime.manifest.evidenceClass, 'production-manifest');
  assert.ok(runtime.manifest.authoritativeSystemIds.includes('input'));
  assert.ok(runtime.manifest.authoritativeSystemIds.length >= 100);
  // input init must not throw; system must be registered
  const inputSys = runtime.getSystem('input');
  assert.ok(inputSys, 'input system present');
  assert.equal(inputSys._domAdapterAttached, false);
  runtime.dispose();
});

test('H4: getNodeSystemFactoryTable materializes node-safe production set', () => {
  const table = getNodeSystemFactoryTable();
  assert.ok(table.has('input'));
  assert.ok(table.has('save'));
  assert.ok(table.has('weapons'));
  assert.equal(table.has('render'), false);
  assert.equal(table.has('ui'), false);
});

test('H4: Node createAuthoritativeRuntime records sg06-tactical/v3 selected slots', () => {
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed: 11,
  });
  try {
    assert.equal(runtime.manifest.selectedSlots.aiBackend, 'sg06-tactical');
    assert.equal(runtime.manifest.selectedSlots.flightBackend, 'v3');
    // Same profile + same slots → same manifest hash as explicit resolver call.
    const expected = resolveRuntimeManifest({
      profileId: 'production',
      nodeSafeOnly: true,
      tacticalAI: true,
      slots: {
        aiSlot: runtime.manifest.selectedSlots
          ? { name: runtime.manifest.selectedSlots.aiSlot }
          : { name: 'tacticalAI' },
        flightSlot: { name: 'flight' },
        aiBackend: 'sg06-tactical',
        flightBackend: 'v3',
      },
    });
    // Slot backend labels must match browser createRegistry post-selection.
    assert.equal(runtime.manifest.selectedSlots.aiBackend, expected.selectedSlots.aiBackend);
    assert.equal(runtime.manifest.selectedSlots.flightBackend, expected.selectedSlots.flightBackend);
    assert.equal(runtime.fingerprint.manifestHash, expected.manifestHash,
      'Node factory path and explicit slots must share manifestHash');
  } finally {
    runtime.dispose();
  }
});

// ── H11 schema + consumption ─────────────────────────────────────────────────

test('H11: never assertion is consumed exactly once when oracle emits never:signal', async () => {
  // F8: use a real sampled signal. On empty-flight (no tether) tetherActive stays false → never passes.
  // Drop run-eq-repeat so a single-arm run is not incomplete solely for deferred equivalence.
  const ticks = 20;
  const doc = {
    ...flightDoc,
    id: 'h11.never-consumed',
    ticks,
    frames: (flightDoc.frames || []).filter((f) => Number.isInteger(f.tick) && f.tick < ticks),
    inputEvents: (flightDoc.inputEvents || []).filter((e) => Number.isInteger(e.tick) && e.tick < ticks),
    assertions: [
      { kind: 'never', signal: 'tetherActive' },
    ],
  };
  const result = await runLabScenario(doc, { verbosity: 2 });
  assert.notEqual(result.exitClass, 3, result.error);
  assert.equal(result.oracle?.assertionConsumption?.ok, true,
    JSON.stringify(result.oracle?.assertionConsumption));
  // Must not fail solely due to consumption mismatch when temporal oracle passed.
  const consumptionFail = (result.oracle?.failed || []).find(
    (f) => f.id === 'assertions-consumed-exactly-once',
  );
  assert.equal(consumptionFail, undefined, 'never assertion must be consumed');
  assert.ok(
    (result.oracle?.results || []).some((r) => r.id === 'never:tetherActive' && r.ok === true),
    'never:tetherActive must pass on untethered flight',
  );
});

test('H11: metric assertion without metric is rejected at validation', () => {
  const doc = {
    ...flightDoc,
    assertions: [{ kind: 'metric', op: '<=', value: 1 }],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.path.includes('metric') || i.message.includes('metric')));
});

test('H11: never assertion without signal is rejected at validation', () => {
  const doc = {
    ...flightDoc,
    assertions: [{ kind: 'never' }],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.path.includes('signal') || /signal|never/.test(i.message)));
});

test('H11: valid metric assertion consumes exactly once (not 2× vs declared metric)', () => {
  // Metrics emit quantitative source:metric; assertions emit source:assertion — same id, distinct source.
  const oracle = evaluateOracles({
    trace: [
      { tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0 },
      { tick: 1, playerX: 1, playerZ: 0, playerVelX: 0, playerVelZ: 0 },
    ],
    metrics: [
      { name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } },
    ],
    assertions: [
      { kind: 'metric', metric: 'invariant.finiteState', op: '==', value: 1 },
    ],
  });
  assert.equal(oracle.ok, true, JSON.stringify(oracle.failed));
  const consumption = assertAssertionsConsumed(
    [{ kind: 'metric', metric: 'invariant.finiteState', op: '==', value: 1 }],
    oracle.results,
  );
  assert.equal(consumption.ok, true, JSON.stringify(consumption));
  assert.equal(consumption.unconsumed.length, 0);
  // Exactly one assertion-sourced match for the metric name.
  const assertionMatches = oracle.results.filter(
    (r) => r.family === 'quantitative' && r.source === 'assertion' && r.id.startsWith('invariant.finiteState'),
  );
  assert.equal(assertionMatches.length, 1);
});

// ── H14 ──────────────────────────────────────────────────────────────────────

test('H14: pointer/gamepad/touch input events are rejected', () => {
  const doc = {
    ...flightDoc,
    inputEvents: [{ tick: 0, device: 'gamepad', code: 'Button0', pressed: true }],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.rule === 'unsupported-field'));
});

test('H14: non-empty relations are rejected', () => {
  const doc = {
    ...flightDoc,
    relations: [{ type: 'tether', a: 'player', b: 'rock' }],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.path === '$.relations'));
});

test('H14: unknown nested frame.input keys are rejected', () => {
  const doc = {
    ...flightDoc,
    frames: [
      { tick: 0, input: { moveX: 0, moveZ: 1, totallyIgnoredAuthority: 1 } },
    ],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => i.path.includes('.input') && (i.rule === 'unsupported-field' || /unknown|unsupported/i.test(i.message))),
    JSON.stringify(v.issues),
  );
});

// ── H6/H7 broker claims ──────────────────────────────────────────────────────

test('H6: issueBrokerClaim reserves launch quota', async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), 'broker-h6-'));
  try {
    const manifest = {
      id: 'h6-test',
      claimSchema: 'spaceface.validation-broker-claim.v1',
      maxLaunchesPerCandidate: 1,
    };
    const digests = { candidateDigest: 'h6-candidate-aaa' };
    await issueBrokerClaim({
      outputRoot,
      manifest,
      mode: 'acceptance',
      digests,
      receipt: { routeDigest: 'r', regressionDigest: 'g', candidateDigest: digests.candidateDigest },
    });
    assert.equal(await getCandidateLaunchCount(outputRoot, digests.candidateDigest), 1);
    await assert.rejects(
      () => issueBrokerClaim({
        outputRoot,
        manifest,
        mode: 'acceptance',
        digests,
        receipt: { routeDigest: 'r', regressionDigest: 'g', candidateDigest: digests.candidateDigest },
      }),
      /max-launches-per-candidate/,
    );
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test('H6: concurrent issueBrokerClaim cannot both reserve under max=1', async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), 'broker-h6-race-'));
  try {
    const manifest = {
      id: 'h6-race',
      claimSchema: 'spaceface.validation-broker-claim.v1',
      maxLaunchesPerCandidate: 1,
    };
    const digests = { candidateDigest: 'h6-race-candidate' };
    const receipt = {
      routeDigest: 'r',
      regressionDigest: 'g',
      candidateDigest: digests.candidateDigest,
    };
    const results = await Promise.allSettled([
      issueBrokerClaim({ outputRoot, manifest, mode: 'acceptance', digests, receipt }),
      issueBrokerClaim({ outputRoot, manifest, mode: 'acceptance', digests, receipt }),
      issueBrokerClaim({ outputRoot, manifest, mode: 'acceptance', digests, receipt }),
      issueBrokerClaim({ outputRoot, manifest, mode: 'acceptance', digests, receipt }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, `expected exactly one issuer; got ${fulfilled.length}`);
    assert.equal(rejected.length, 3);
    assert.equal(await getCandidateLaunchCount(outputRoot, digests.candidateDigest), 1);
    for (const r of rejected) {
      assert.match(String(r.reason && r.reason.message), /max-launches-per-candidate/);
    }
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test('H7: copied claim is rejected as already-consumed by identity', async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), 'broker-h7-'));
  try {
    const manifest = {
      id: 'h7-test',
      claimSchema: 'spaceface.validation-broker-claim.v1',
      maxLaunchesPerCandidate: 5,
    };
    const digests = { candidateDigest: 'h7-cand' };
    const issued = await issueBrokerClaim({
      outputRoot,
      manifest,
      mode: 'acceptance',
      digests,
      receipt: { routeDigest: 'r', regressionDigest: 'g', candidateDigest: digests.candidateDigest },
    });
    const ok1 = await consumeBrokerClaim({ outputRoot, tokenOrPath: issued.claimPath });
    // L2/L7: consume returns identity object (truthy) rather than bare true.
    assert.ok(ok1);
    assert.equal(ok1.claimId, issued.claimId);
    assert.equal(ok1.candidateDigest, digests.candidateDigest);

    // Copy to another path outside claims dir
    const copyDir = join(outputRoot, 'copied');
    await mkdir(copyDir, { recursive: true });
    const copyPath = join(copyDir, 'claim-copy.json');
    copyFileSync(issued.claimPath, copyPath);

    const check = await validateBrokerClaim({
      outputRoot,
      manifest,
      tokenOrPath: copyPath,
    });
    assert.equal(check.ok, false);
    // Non-canonical path or already-consumed by identity
    assert.ok(
      check.reason === 'broker-claim-noncanonical-path'
      || check.reason === 'broker-claim-already-consumed',
      check.reason,
    );
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

// ── H9 RNG continuation ──────────────────────────────────────────────────────

test('H9: mulberry32 continuation restores post-draw stream', () => {
  const a = mulberry32(42);
  for (let i = 0; i < 5; i++) a();
  const cont = a.getState();
  const more = [a(), a(), a()];
  const b = mulberry32FromContinuation(cont);
  assert.deepEqual([b(), b(), b()], more);
  assert.equal(b.getState().draws, cont.draws + 3);
});

test('H9: save serializeData includes entropy continuation and load restores weapons draws', () => {
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed: 99,
  });
  try {
    const state = runtime.state;
    for (let i = 0; i < 7; i++) state.rng();
    const coreBefore = state.rng.getState();
    const weapons = runtime.getSystem('weapons');
    if (weapons && weapons._rng) {
      for (let i = 0; i < 3; i++) weapons._rng();
    }
    const weaponsBefore = state.weaponsEntropy
      ? { seed0: state.weaponsEntropy.seed0, draws: state.weaponsEntropy.draws }
      : null;

    const saveSys = runtime.getSystem('save');
    assert.ok(saveSys, 'save system required');
    const data = saveSys.serializeData();
    assert.ok(data.entropy, 'entropy block present');
    assert.ok(data.entropy.core, 'core continuation present');
    assert.equal(data.entropy.core.draws, coreBefore.draws);
    assert.equal(data.entropy.core.state, coreBefore.state);

    state.rng = mulberry32(99);
    if (weaponsBefore) {
      state.weaponsEntropy = { seed0: weaponsBefore.seed0, draws: 0, stream: 'weapons' };
    }
    saveSys._restoreEntropy(data.entropy);
    const coreAfter = state.rng.getState();
    assert.equal(coreAfter.state, coreBefore.state);
    assert.equal(coreAfter.draws, coreBefore.draws);
    if (weaponsBefore) {
      assert.equal(state.weaponsEntropy.draws, weaponsBefore.draws);
      assert.equal(state.weaponsEntropy.seed0, weaponsBefore.seed0);
    }
  } finally {
    runtime.dispose();
  }
});

// ── H10 keyboard tape save/load ──────────────────────────────────────────────

test('H10: resetFromTape with recreated state does not crash on keyboard events', () => {
  const driver = createInputTapeDriver({
    events: [
      { tick: 0, device: 'keyboard', code: 'KeyW', pressed: true },
      { tick: 1, device: 'keyboard', code: 'KeyD', pressed: true },
      { tick: 2, device: 'keyboard', code: 'KeyW', pressed: false },
    ],
  });
  const state = {
    settings: {
      controls: { bindings: null },
      gameplay: { controlScheme: 'pilot' },
    },
  };
  const keys = driver.resetFromTape(0, 2, state);
  assert.equal(keys.KeyD, true);
  assert.equal(keys.KeyW, false);
});

test('H10: keyboard-tape mid-run save/load does not crash the lab runner', async () => {
  const doc = {
    ...flightDoc,
    id: 'h10.keyboard-saveload',
    ticks: 30,
    inputEvents: [
      { tick: 0, device: 'keyboard', code: 'KeyW', pressed: true },
      { tick: 5, device: 'keyboard', code: 'KeyA', pressed: true },
      { tick: 10, device: 'keyboard', code: 'KeyA', pressed: false },
    ],
    frames: [],
    checkpoints: [{ tick: 12, kind: 'save-load' }],
    metrics: [
      { name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } },
    ],
    assertions: [
      { kind: 'equivalence', equivalence: 'uninterrupted-eq-save-load' },
    ],
  };
  const result = await runLabScenario(doc, { verbosity: 1, saveLoadAt: 12 });
  assert.notEqual(result.exitClass, 3, result.error || 'infra crash');
  assert.equal(result.params && result.params.saveLoadPerformed, true);
  assert.ok((result.params && result.params.saveLoadRestoreCount) >= 1);
});

// ── H12/H13 comparison policy in hash ────────────────────────────────────────

test('H12/H13: different saveLoadEquivalence produces different scenario digests', () => {
  const base = { ...flightDoc, id: 'h12.policy-a' };
  const a = compileSimScenario({ ...base, saveLoadEquivalence: 'deterministic-covered' });
  const b = compileSimScenario({ ...base, saveLoadEquivalence: 'trace-hash' });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(a.canonical.saveLoadEquivalence, 'deterministic-covered');
  assert.equal(b.canonical.saveLoadEquivalence, 'trace-hash');
  const ha = createHash('sha256').update(canonicalStringify(a.canonical)).digest('hex');
  const hb = createHash('sha256').update(canonicalStringify(b.canonical)).digest('hex');
  assert.notEqual(ha, hb, 'comparison policy must affect canonical digest');
});

// ── N1 weapon vent not host-gated ────────────────────────────────────────────

test('N1: weaponHeatVent is profile-driven (not typeof window)', () => {
  assert.equal(combatFlag('weaponHeatVent', {
    combat: { weaponHeatVent: true },
  }), true);
  assert.equal(combatFlag('weaponHeatVent', {
    combat: { weaponHeatVent: false },
  }), false);
  const src = readFileSync(join(ROOT, '../src/systems/weapons.js'), 'utf8');
  assert.equal(/WEAPON_VENT_ENABLED\s*=\s*typeof window/.test(src), false);
  assert.match(src, /weaponHeatVent/);
});
