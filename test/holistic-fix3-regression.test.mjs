// Holistic FIX3 regressions — F1/F3/F5/F8 (false-green + wall-clock + PQ mint + deferred).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { compareSaveLoad, compareTracesTickByTick } from '../src/testing/lab/saveLoadCompare.js';
import { runLabScenario } from '../src/testing/lab/runScenario.js';
import { evaluateOracles } from '../src/testing/lab/oracleEngine.js';
import {
  validateSimScenario,
  compileSimScenario,
} from '../src/contracts/simScenarioSchema.js';
import { authoritativeIdentityEqual } from '../src/runtime/resolveRuntimeManifest.js';
import { FOCUSED_MASSLINE_WITH_SAVE } from '../src/testing/lab/systemBundles.js';

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
const orbitDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/massline-orbit-assist.scenario.json'),
  'utf8',
));

// ── F1: save/load tick-by-tick (not final-hash-only) ─────────────────────────

test('F1: compareTracesTickByTick fails on mid-run field divergence', () => {
  const a = [
    { tick: 0, playerX: 0, tension: 1 },
    { tick: 1, playerX: 0.29, tension: 48.03 },
  ];
  const b = [
    { tick: 0, playerX: 0, tension: 1 },
    { tick: 1, playerX: 0.291, tension: 48.37 },
  ];
  const cmp = compareTracesTickByTick(a, b);
  assert.equal(cmp.ok, false);
  assert.equal(cmp.firstDivergentTick, 1);
  assert.ok(cmp.firstDivergentField === 'playerX' || cmp.firstDivergentField === 'tension');
});

test('F1: flight save/load compare requires tick-by-tick identity (not final-hash-only)', async () => {
  const result = await compareSaveLoad(saveLoadDoc, {
    verbosity: 1,
    saveLoadAt: 40,
  });
  assert.notEqual(result.exitClass, 3, result.withSaveLoad?.error || result.error);
  assert.ok('uninterruptedTraceHash' in result, 'must report both trace hashes');
  assert.ok('saveLoadTraceHash' in result);
  // Flight path must pass tick-by-tick (round6 ULP-tolerant) + final covered hash.
  assert.equal(result.ok, true, JSON.stringify({
    status: result.status,
    first: result.firstDivergentTick,
    field: result.firstDivergentField,
    mid: result.midCheckpointMismatch,
  }));
  assert.equal(result.firstDivergentTick, null);
  assert.equal(result.uninterruptedHash, result.saveLoadHash);
  // False-green closed: if intermediate ticks diverged materially, ok must be false
  // even when final hashes match (exercised by the massline mid-run case below).
});

test('F1: massline mid-run save/load — every trace tick must match (or fail)', async () => {
  // 70-tick massline orbit, save at tick 20 — the Codex false-green repro scenario.
  const doc = {
    ...orbitDoc,
    id: 'massline.save-load.tick-by-tick',
    ticks: 70,
    checkpoints: [{ tick: 20, kind: 'save-load', label: 'mid-run' }],
    assertions: [],
    metrics: [
      { name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } },
    ],
  };
  const result = await compareSaveLoad(doc, {
    verbosity: 1,
    saveLoadAt: 20,
    systems: [...FOCUSED_MASSLINE_WITH_SAVE],
  });
  assert.notEqual(result.exitClass, 3, `infra: ${JSON.stringify(result.withSaveLoad?.error || result)}`);
  // F1 gate: intermediate tick identity is required for pass.
  // If recreate path diverges mid-run, comparison MUST fail (not false-green on final hash).
  if (result.ok) {
    assert.equal(result.uninterruptedTraceHash, result.saveLoadTraceHash);
    assert.equal(result.firstDivergentTick, null);
    assert.equal(result.contract, 'deterministic-covered');
  } else if (result.status === 'parity-fail') {
    // Honest fail: mid-run divergence detected.
    assert.ok(
      result.firstDivergentTick != null
        || result.uninterruptedTraceHash !== result.saveLoadTraceHash,
      `parity-fail must expose intermediate divergence: ${JSON.stringify({
        firstDivergentTick: result.firstDivergentTick,
        t0: result.uninterruptedTraceHash,
        t1: result.saveLoadTraceHash,
      })}`,
    );
  }
  // Never accept final-hash-equal when traces diverged (the false-green).
  if (
    result.uninterruptedHash
    && result.saveLoadHash
    && result.uninterruptedHash === result.saveLoadHash
    && result.uninterruptedTraceHash !== result.saveLoadTraceHash
  ) {
    assert.equal(result.ok, false, 'final-hash-equal + unequal traces must not pass');
  }
});

// ── F5: deferred equivalence is not exit-0 ──────────────────────────────────

test('F5: deferred equivalence is incomplete (not consumed-and-passing)', () => {
  const oracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
  });
  assert.equal(oracle.ok, false, 'deferred must not make oracle.ok true');
  const eq = oracle.results.find((r) => r.family === 'equivalence');
  assert.ok(eq);
  assert.equal(eq.deferred, true);
  assert.equal(eq.ok, false);
  assert.equal(eq.actual, 'deferred');
});

test('F5: sf lab run flight-fixed-input is non-zero when only deferred eq is declared', () => {
  const child = spawnSync(
    process.execPath,
    [join(REPO, 'scripts/sf.mjs'), 'lab', 'run', 'flight-fixed-input', '--verbosity', '1'],
    { cwd: REPO, encoding: 'utf8', timeout: 180_000 },
  );
  assert.equal(child.error, undefined, String(child.error));
  assert.notEqual(child.status, 0, `deferred eq must not exit 0\nstdout=${child.stdout?.slice(0, 1500)}`);
  const parsed = JSON.parse(child.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(
    parsed.exitClass === 4 || parsed.exitClass === 1,
    `expected incomplete/fail exit, got ${parsed.exitClass}`,
  );
  const results = parsed.result?.oracle?.results
    || parsed.result?.oracle?.failed
    || [];
  const deferred = results.find((r) => r.deferred || r.actual === 'deferred');
  assert.ok(deferred || parsed.result?.status === 'incomplete',
    `expected deferred/incomplete signal: ${JSON.stringify(parsed.result?.status)}`);
});

// ── F8: unknown temporal signals rejected ───────────────────────────────────

test('F8: unknown temporal signal rejected at validation', () => {
  const v = validateSimScenario({
    ...flightDoc,
    assertions: [{ kind: 'never', signal: 'definitelyNotASampleField' }],
  });
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => i.rule === 'unknown-signal' || /known lab sample field/.test(i.message)),
    JSON.stringify(v.issues),
  );
});

test('F8: unknown temporal signal fails oracle evaluation (not vacuous pass)', () => {
  const oracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0 }],
    assertions: [{ kind: 'never', signal: 'definitelyNotASampleField' }],
  });
  assert.equal(oracle.ok, false);
  assert.ok(
    oracle.failed.some((f) => /unknown|definitelyNotASampleField/.test(String(f.id || f.reason || ''))),
    JSON.stringify(oracle.failed),
  );
});

// ── F3: PQ self-mint is diagnostic-only ─────────────────────────────────────

test('F3: PQ-017 acceptance without receipt/claim is blocked (no self-mint receipt)', async () => {
  const guardUrl = new URL('../scripts/lib/pq017ProbeIterationGuard.mjs', import.meta.url);
  const { assertPq017ProbeLaunch } = await import(guardUrl.href);
  const outputRoot = await mkdtemp(join(tmpdir(), 'pq017-f3-'));
  try {
    await assert.rejects(
      () => assertPq017ProbeLaunch({
        root: REPO,
        outputRoot,
        runtimeKind: 'browser',
        mode: 'acceptance',
        explicitAcceptance: true,
      }),
      (err) => {
        assert.match(String(err && err.message), /broker-claim-required|PREFLIGHT_BLOCKED/);
        assert.equal(err.gateResult?.primaryAcceptance, false);
        return true;
      },
    );
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

// ── F9: unimplemented frame.input fields rejected ───────────────────────────

test('F9: fireGroup/brake/massline rejected at scenario validation', () => {
  for (const field of ['fireGroup', 'brake', 'massline']) {
    const v = validateSimScenario({
      ...flightDoc,
      frames: [{ tick: 0, input: { moveZ: 1, [field]: field === 'massline' ? { latch: true } : true } }],
    });
    assert.equal(v.ok, false, `${field} must be rejected`);
    assert.ok(
      v.issues.some((i) => i.rule === 'unimplemented-input-field' || i.rule === 'unsupported-field'),
      `${field}: ${JSON.stringify(v.issues)}`,
    );
  }
});

// ── F11: parity includes selectedSlots ──────────────────────────────────────

test('F11: authoritativeIdentityEqual detects selectedSlots drift', () => {
  const base = {
    profileId: 'focused-lab',
    authoritativeSystemIds: ['a', 'b'],
    authoritativeUpdateOrderIds: ['a', 'b'],
    features: { x: 1 },
    selectedSlots: { aiBackend: 'sg06-tactical', flightBackend: 'v3' },
    manifestHash: 'abc',
  };
  assert.equal(authoritativeIdentityEqual(base, { ...base }), true);
  assert.equal(authoritativeIdentityEqual(base, {
    ...base,
    selectedSlots: { aiBackend: 'legacy', flightBackend: 'v3' },
  }), false);
  assert.equal(authoritativeIdentityEqual(base, {
    ...base,
    manifestHash: 'different',
  }), false);
});

// ── F2: sectorSim has no Date.now in catch-up path ──────────────────────────

test('F2: sectorSim source has no Date.now() in offline catch-up / serialize', () => {
  const src = readFileSync(join(REPO, 'src/systems/sectorSim.js'), 'utf8');
  // Allow comments mentioning Date.now but no live calls.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(stripped, /Date\.now\s*\(/);
  assert.match(src, /pendingOfflineElapsedSec/);
  assert.match(src, /runOfflineCatchup/);
});

// ── F10: deterministic-covered is documented coverage-bounded ───────────────

test('F10: deterministic-covered checkpoint omits exact IEEE / private state', async () => {
  const { buildDeterministicCoveredCheckpoint, DETERMINISTIC_OMITTED } = await import(
    '../src/testing/lab/checkpoint.js'
  );
  assert.ok(DETERMINISTIC_OMITTED.includes('ieee754.exactFloats')
    || DETERMINISTIC_OMITTED.includes('systemPrivateState')
    || DETERMINISTIC_OMITTED.includes('rng.fullStream'));
  // hashKind must never be "exact"
  const cp = buildDeterministicCoveredCheckpoint({
    tick: 1,
    simTime: 1 / 60,
    playerId: 1,
    entityList: [],
    entities: new Map(),
    player: { credits: 0 },
    input: {},
    meta: { seed: 1 },
  });
  assert.equal(cp.hashKind, 'deterministic-covered');
  assert.notEqual(cp.hashKind, 'exact');
});
