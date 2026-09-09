// Holistic FIX4 regressions — G1–G9 (exact identity, no false-green bypasses).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareSaveLoad, compareTracesTickByTick } from '../src/testing/lab/saveLoadCompare.js';
import { repeatScenario } from '../src/testing/lab/repeat.js';
import { runLabScenario, runLabScenarioInternal } from '../src/testing/lab/runScenario.js';
import { evaluateOracles } from '../src/testing/lab/oracleEngine.js';
import {
  validateSimScenario,
  compileSimScenario,
  validateCanonicalScenario,
} from '../src/contracts/simScenarioSchema.js';
import {
  resolveRuntimeManifest,
  authoritativeIdentityEqual,
} from '../src/runtime/resolveRuntimeManifest.js';
import { compareRuntimeFingerprints } from '../src/testing/lab/differentialReplay.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { flight } from '../src/systems/flight.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { ai } from '../src/systems/ai.js';
import { actions } from '../src/systems/actions.js';
import { activityStampMoreRecent } from '../src/systems/input.js';
import { LEADERSHIP_INIT_GRACE_MS, tryReclaimStaleQuotaLock } from '../scripts/lib/validationBroker.mjs';
import { open, utimes } from 'node:fs/promises';

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

// ── G1: same-engine save/load is EXACT ───────────────────────────────────────

test('G1: compareTracesTickByTick fails on 1 ULP-scale numeric drift', () => {
  const a = [{ tick: 46, playerVelX: -0.826540 }];
  const b = [{ tick: 46, playerVelX: -0.826539 }];
  const cmp = compareTracesTickByTick(a, b);
  assert.equal(cmp.ok, false, 'zero tolerance: 1e-6 field delta must fail');
  assert.equal(cmp.firstDivergentTick, 46);
  assert.equal(cmp.firstDivergentField, 'playerVelX');
});

test('G1: flight save/load requires equal trace hashes (unequal hashes cannot pass)', async () => {
  const result = await compareSaveLoad(saveLoadDoc, {
    verbosity: 1,
    saveLoadAt: 40,
  });
  assert.notEqual(result.exitClass, 3, result.withSaveLoad?.error || result.error);
  assert.ok('uninterruptedTraceHash' in result);
  assert.ok('saveLoadTraceHash' in result);
  // G1 closed: unequal hashes must not pass (even if tick-by-tick was "tolerant" before).
  if (result.uninterruptedTraceHash !== result.saveLoadTraceHash) {
    assert.equal(result.ok, false, 'unequal trace hashes must fail same-engine save/load');
  } else if (result.ok) {
    assert.equal(result.firstDivergentTick, null);
    assert.equal(result.uninterruptedHash, result.saveLoadHash);
    assert.equal(result.contract, 'deterministic-covered');
  }
});

// ── G2: automation has no Date.now in gameplay path ──────────────────────────

test('G2: automation source has no Date.now() gameplay calls', () => {
  const src = readFileSync(join(REPO, 'src/systems/automation.js'), 'utf8');
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  // Only allowed behind wallClockOfflineProgressEnabled gate (explicit opt-in).
  // Direct unconditional Date.now() helper must be gone.
  assert.doesNotMatch(stripped, /function\s+nowMs\s*\(/);
  assert.match(src, /simTimeMs/);
  assert.match(src, /wallClockOfflineProgress/);
  assert.match(src, /pendingOfflineElapsedSec/);
});

// ── G3: PQ acceptance with receipt but no external claim fails ───────────────

test('G3: PQ-017 acceptance with on-disk receipt but no external claim still fails', async () => {
  const guardUrl = new URL('../scripts/lib/pq017ProbeIterationGuard.mjs', import.meta.url);
  const { assertPq017ProbeLaunch, publishPq017FastGateReceipt, createPq017FastGateReceipt } = await import(guardUrl.href);
  const outputRoot = await mkdtemp(join(tmpdir(), 'pq017-g3-'));
  try {
    // Non-empty artifact root with a real receipt present.
    await mkdir(join(outputRoot, 'staging'), { recursive: true });
    const receipt = createPq017FastGateReceipt
      ? createPq017FastGateReceipt({
        routeDigest: 'g3-route',
        regressionDigest: 'g3-reg',
        productionDigest: 'g3-prod',
        candidateDigest: 'g3-cand',
      })
      : {
        schema: 'spaceface.pq017-fast-gate-receipt.v1',
        routeDigest: 'g3-route',
        regressionDigest: 'g3-reg',
        candidateDigest: 'g3-cand',
        generatedAt: new Date().toISOString(),
      };
    if (publishPq017FastGateReceipt) {
      await publishPq017FastGateReceipt({ outputRoot, receipt });
    } else {
      await writeFile(join(outputRoot, 'fast-gate-receipt.json'), JSON.stringify(receipt), 'utf8');
    }

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

// ── G4: repeat evaluates all declared equivalences ───────────────────────────

test('G4: repeat with save-load equivalence does not silently pass without save/load', async () => {
  // R2: repeat does not own save-load — foreign claim must be incomplete, never silent-pass.
  const ticks = 30;
  const doc = {
    ...flightDoc,
    id: 'g4.repeat.save-load-eq',
    ticks,
    frames: (flightDoc.frames || []).filter((f) => Number.isInteger(f.tick) && f.tick < ticks),
    inputEvents: (flightDoc.inputEvents || []).filter((e) => Number.isInteger(e.tick) && e.tick < ticks),
    assertions: [
      { kind: 'equivalence', equivalence: 'uninterrupted-eq-save-load' },
    ],
  };
  const result = await repeatScenario(doc, { verbosity: 1, saveLoadAt: 10 });
  assert.equal(result.ok, false, 'repeat must not certify foreign save-load claim');
  assert.equal(result.status, 'incomplete');
  assert.ok(result.equivalence, 'must report equivalence map');
  assert.ok(
    result.equivalence['uninterrupted-eq-save-load'],
    'declared save-load equivalence must be reported (incomplete)',
  );
  const eq = result.equivalence['uninterrupted-eq-save-load'];
  assert.equal(eq.ok, false);
  assert.ok(eq.incomplete || /unsupported/i.test(String(eq.reason || '')));
  // Must not be a silent skipped/pass-without-work marker.
  assert.notEqual(eq.actual, 'evaluated-by-parent');
  assert.notEqual(eq.actual, 'deferred');
});

test('G4: unsupported declared equivalence fails (not silent pass)', async () => {
  const ticks = 10;
  const doc = {
    ...flightDoc,
    id: 'g4.repeat.unsupported-eq',
    ticks,
    frames: (flightDoc.frames || []).filter((f) => Number.isInteger(f.tick) && f.tick < ticks),
    inputEvents: (flightDoc.inputEvents || []).filter((e) => Number.isInteger(e.tick) && e.tick < ticks),
    assertions: [
      { kind: 'equivalence', equivalence: 'node-eq-chromium-totally-made-up' },
    ],
  };
  const result = await repeatScenario(doc, { verbosity: 1 });
  assert.equal(result.ok, false);
  const eq = result.equivalence['node-eq-chromium-totally-made-up'];
  assert.ok(eq);
  assert.equal(eq.ok, false);
  assert.ok(eq.incomplete || /unsupported/i.test(String(eq.reason || '')));
});

// ── G5: quota lock newborn empty file is not reclaimed ───────────────────────

test('G5: newborn empty quota lock is backed off (not reclaimed as corrupt)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-g5-'));
  const lockPath = join(dir, '.quota-test.lock');
  try {
    // Simulate open('wx') without ownership JSON yet.
    const handle = await open(lockPath, 'wx');
    await handle.close();
    const reclaim = await tryReclaimStaleQuotaLock(lockPath, {
      timeoutMs: 30_000,
      log: null,
    });
    assert.equal(reclaim.reclaimed, false, 'must not reclaim in-flight empty lock');
    assert.equal(reclaim.reason, 'quota-lock-init-in-flight');

    // Aged past grace → reclaimable.
    assert.ok(LEADERSHIP_INIT_GRACE_MS > 0);
    const past = new Date(Date.now() - LEADERSHIP_INIT_GRACE_MS - 1_000);
    await utimes(lockPath, past, past);
    const aged = await tryReclaimStaleQuotaLock(lockPath, {
      timeoutMs: 30_000,
      log: null,
    });
    assert.equal(aged.reclaimed, true, 'aged empty lock may be reclaimed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── G6: buttons rejected; canonical full validation ──────────────────────────

test('G6: inputEvents.buttons rejected at validation', () => {
  const v = validateSimScenario({
    ...flightDoc,
    inputEvents: [{ tick: 0, device: 'keyboard', buttons: { fire: true } }],
  });
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => i.rule === 'unimplemented-input-field' || /buttons/.test(i.message)),
    JSON.stringify(v.issues),
  );
});

test('G6: precompiled canonical with frame.input.brake fails validation', async () => {
  const compiled = compileSimScenario(flightDoc);
  assert.equal(compiled.ok, true);
  const canonical = structuredClone(compiled.canonical);
  canonical.inputTape.frames = [
    { tick: 0, input: { moveZ: 1, brake: true }, commands: [] },
  ];
  const v = validateCanonicalScenario(canonical);
  assert.equal(v.ok, false, 'canonical must run full schema checks');
  assert.ok(
    v.issues.some((i) => i.rule === 'unimplemented-input-field' || /brake/.test(i.message)),
    JSON.stringify(v.issues),
  );
  const run = await runLabScenarioInternal(flightDoc, { canonical, verbosity: 0 });
  assert.equal(run.ok, false);
  assert.equal(run.exitClass, 4);
});

// ── G7: explicit slots bound; differential fingerprint gate ──────────────────

test('G7: V3 vs legacy explicit manifests produce different hashes', () => {
  const v3 = resolveRuntimeManifest({
    profileId: 'production',
    explicitSystems: [actions, flightV3],
  });
  const legacy = resolveRuntimeManifest({
    profileId: 'production',
    explicitSystems: [actions, flight],
  });
  assert.notEqual(v3.selectedSlots.flightBackend, 'unbound',
    `V3 slot should bind: ${JSON.stringify(v3.selectedSlots)}`);
  assert.notEqual(legacy.selectedSlots.flightBackend, 'unbound',
    `legacy slot should bind: ${JSON.stringify(legacy.selectedSlots)}`);
  assert.notEqual(v3.selectedSlots.flightBackend, legacy.selectedSlots.flightBackend);
  assert.notEqual(v3.manifestHash, legacy.manifestHash);
  assert.equal(authoritativeIdentityEqual(v3, legacy), false);

  const tacticalAI = createTacticalAISystem();
  const tac = resolveRuntimeManifest({
    profileId: 'production',
    explicitSystems: [actions, tacticalAI],
  });
  const legAi = resolveRuntimeManifest({
    profileId: 'production',
    explicitSystems: [actions, ai],
  });
  assert.equal(tac.selectedSlots.aiBackend, 'sg06-tactical');
  assert.equal(legAi.selectedSlots.aiBackend, 'legacy');
  assert.notEqual(tac.manifestHash, legAi.manifestHash);
});

test('G7: differential fingerprint compare fails on manifestHash mismatch', () => {
  const match = compareRuntimeFingerprints(
    { profileHash: 'p1', manifestHash: 'm1' },
    { profileHash: 'p1', manifestHash: 'm1' },
  );
  assert.equal(match.match, true);
  const mismatch = compareRuntimeFingerprints(
    { profileHash: 'p1', manifestHash: 'm-node' },
    { profileHash: 'p1', manifestHash: 'm-chromium' },
  );
  assert.equal(mismatch.match, false);
  assert.equal(mismatch.reason, 'manifestHash-mismatch');
  const missing = compareRuntimeFingerprints(null, { manifestHash: 'm1' });
  assert.equal(missing.match, false);
});

// ── G8: vacuous temporal signals removed ─────────────────────────────────────

test('G8: never default is rejected (not vacuous pass)', () => {
  const v = validateSimScenario({
    ...flightDoc,
    assertions: [{ kind: 'never', signal: 'default' }],
  });
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.rule === 'unknown-signal' || /default/.test(i.message)));

  const oracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0 }],
    assertions: [{ kind: 'never', signal: 'default' }],
  });
  assert.equal(oracle.ok, false);
});

test('G8: never diverged is rejected', () => {
  const v = validateSimScenario({
    ...flightDoc,
    assertions: [{ kind: 'never', signal: 'diverged' }],
  });
  assert.equal(v.ok, false);
});

// ── G9: (tick, sequence) activity stamp ──────────────────────────────────────

test('G9: activityStampMoreRecent uses sequence within the same tick', () => {
  // Same tick, higher seq wins (not device-type priority).
  assert.equal(activityStampMoreRecent(5, 2, 5, 1), true);
  assert.equal(activityStampMoreRecent(5, 1, 5, 2), false);
  // Higher tick wins regardless of seq.
  assert.equal(activityStampMoreRecent(6, 0, 5, 99), true);
  assert.equal(activityStampMoreRecent(5, 99, 6, 0), false);
  // Equal stamps → neither strictly more recent.
  assert.equal(activityStampMoreRecent(5, 3, 5, 3), false);
});
