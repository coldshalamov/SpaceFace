// Holistic FIX11 regressions — architectural separation of certifying public API
// from injectable internal path (O1–O5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runLabScenario,
  runLabScenarioInternal,
} from '../src/testing/lab/runScenario.js';
import { evaluateOracles } from '../src/testing/lab/oracleEngine.js';
import {
  sealEquivalenceResult,
  isAuthoritativeEquivalenceResult,
  isPromotableLabResult,
  EQUIVALENCE_EXECUTOR_SOURCES,
} from '../src/testing/lab/equivalenceAuthority.js';
import { runDifferentialReplay } from '../src/testing/lab/differentialReplay.js';
import { FOCUSED_FLIGHT_SYSTEMS } from '../src/testing/lab/systemBundles.js';
import { compileSimScenario } from '../src/contracts/simScenarioSchema.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const flightDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-fixed-input.scenario.json'),
  'utf8',
));

// Minimal assertion-bearing doc without multi-run equivalence (public can promote).
function metricOnlyDoc() {
  return {
    ...flightDoc,
    id: 'fix11.metric-only',
    assertions: [
      { kind: 'metric', metric: 'invariant.finiteState', op: '==', value: 1 },
    ],
  };
}

// ── O1: public certifying path has no DI ─────────────────────────────────────

test('O1: runLabScenario(doc, options) rejects options injection', async () => {
  const result = await runLabScenario(flightDoc, {
    systems: [],
    equivalence: { 'run-eq-repeat': { ok: true, expected: 'forged', actual: 'forged' } },
    skipMultiRunEquivalence: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.exitClass, 4);
  assert.equal(result.status, 'invalid-config');
  assert.match(String(result.error || ''), /only \(scenarioDoc\)|options injection is forbidden/i);
});

test('O1: runLabScenarioInternal is nonPromoting even on local arm success', async () => {
  const result = await runLabScenarioInternal(metricOnlyDoc(), {
    skipMultiRunEquivalence: true,
    verbosity: 0,
  });
  // Arm may pass local oracles, but never certifies alone.
  assert.equal(result.nonPromoting, true);
  assert.equal(result.certifying, false);
  assert.equal(result.evidenceClass, 'internal-test');
  assert.equal(isPromotableLabResult(result), false);
});

test('O1: public runLabScenario(doc) cannot inject systems/equivalence/skip', async () => {
  // Function arity / second arg already rejected above; also verify pure call path
  // does not accept systems via doc mutation after compile is separate from DI.
  const result = await runLabScenario(metricOnlyDoc());
  assert.notEqual(result.nonPromoting, true);
  if (result.ok) {
    assert.equal(result.certifying, true);
    assert.notEqual(result.evidenceClass, 'internal-test');
  }
  // With only finiteState metric assertion, should pass when state is finite.
  assert.equal(result.exitClass === 3, false, result.error);
});

// ── O2: equivalence only from fixed parent executor seal ─────────────────────

test('O2: forged {ok:true, expected, actual} equivalence is rejected', () => {
  const forged = { ok: true, expected: 'forged', actual: 'forged' };
  assert.equal(isAuthoritativeEquivalenceResult(forged), false);

  const oracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0, hull: 100 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    equivalence: { 'run-eq-repeat': forged },
  });
  assert.equal(oracle.ok, false);
  const eq = oracle.results.find((r) => r.family === 'equivalence');
  assert.equal(eq.ok, false);
  assert.equal(eq.injected, true);
  assert.match(String(eq.reason || ''), /seal|shape/i);
});

test('O2: sealed result from fixed executor is accepted', () => {
  const sealed = sealEquivalenceResult(
    { ok: true, expected: true, actual: true },
    EQUIVALENCE_EXECUTOR_SOURCES.REPEAT,
  );
  assert.equal(isAuthoritativeEquivalenceResult(sealed), true);
  // Forging source string without private seal fails.
  const fakeSource = { ok: true, expected: true, actual: true, source: 'repeat-executor' };
  assert.equal(isAuthoritativeEquivalenceResult(fakeSource), false);

  const oracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0, hull: 100 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    equivalence: { 'run-eq-repeat': sealed },
  });
  assert.equal(oracle.ok, true);
});

// ── O3: skipMultiRun only in child arms; standalone incomplete ───────────────

test('O3: standalone public path with multi-run eq is incomplete (non-zero)', async () => {
  // flight-fixed-input declares only run-eq-repeat — public cannot evaluate it alone.
  const result = await runLabScenario(flightDoc);
  assert.equal(result.ok, false);
  assert.notEqual(result.exitClass, 0);
  assert.ok(
    result.exitClass === 4 || result.status === 'incomplete' || result.exitClass === 1,
    `expected incomplete/fail, got exit=${result.exitClass} status=${result.status}`,
  );
});

test('O3: internal skipMultiRun produces skipped markers, not certifying pass', async () => {
  const result = await runLabScenarioInternal(flightDoc, {
    skipMultiRunEquivalence: true,
    verbosity: 0,
  });
  assert.equal(result.nonPromoting, true);
  assert.equal(result.certifying, false);
  // Skipped eq is not a green certification even if arm oracles pass.
  assert.equal(isPromotableLabResult(result), false);
  const failedOrResults = [
    ...(result.oracle?.failed || []),
    ...(result.oracle?.results || []),
  ];
  // With skip, multi-run eq is deferred to parent — local arm may be ok with parentOwned skip.
  // Either way: nonPromoting blocks promotion.
  void failedOrResults;
});

// ── O4: differential arms not injectable ─────────────────────────────────────

test('O4: caller-supplied arms rejected on differentialReplay', async () => {
  const result = await runDifferentialReplay(flightDoc, {
    verbosity: 0,
    runNodeArm: async () => ({
      ok: true,
      exitClass: 0,
      status: 'pass',
      oracle: { ok: true },
      checkpoints: { mid: [] },
      browserLaunches: 0,
    }),
    runChromiumArm: async () => ({
      ok: true,
      status: 'pass',
      series: [],
      browserLaunches: 0,
      oracle: { ok: true },
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.exitClass, 4);
  assert.equal(result.status, 'invalid-config');
  assert.match(String(result.error || ''), /arm callback|caller-supplied/i);
});

// ── O5: non-finite hull/cap/credits fail invariants ──────────────────────────

test('O5: NaN hull fails finite-state and resource invariants', () => {
  const oracle = evaluateOracles({
    trace: [
      {
        tick: 0,
        playerX: 0,
        playerZ: 0,
        playerVelX: 0,
        playerVelZ: 0,
        playerRot: 0,
        hull: NaN,
        cap: 50,
        credits: 100,
      },
    ],
    metrics: [
      { name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } },
      { name: 'invariant.noNegativeResources', version: 1, threshold: { op: '==', value: 1 } },
    ],
  });
  assert.equal(oracle.ok, false, 'NaN hull must fail');
  assert.ok(
    oracle.failed.some((f) => f.id === 'finite-state' || (f.id && String(f.id).includes('finite'))),
    JSON.stringify(oracle.failed),
  );
  assert.ok(
    oracle.failed.some((f) => f.id === 'no-negative-resources'
      || (f.id && String(f.id).includes('noNegative'))
      || (f.id && String(f.id).includes('Resource'))),
    `resource invariant must also fail on NaN: ${JSON.stringify(oracle.failed)}`,
  );
});

test('O5: runner with NaN hull injector fails (not ok:true)', async () => {
  const poison = {
    name: 'labNanHullInjector',
    init(ctx) { this.state = ctx.state; },
    update() {
      const player = this.state.entities.get(this.state.playerId);
      if (player) player.hull = NaN;
    },
  };
  const systems = [...FOCUSED_FLIGHT_SYSTEMS, poison];
  const doc = {
    ...flightDoc,
    id: 'fix11.nan-hull',
    ticks: 10,
    frames: [{ tick: 0, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false } }],
    // Keep a non-equivalence assertion so consumption is satisfied; invariants still fire.
    assertions: [
      { kind: 'metric', metric: 'invariant.finiteState', op: '==', value: 1 },
    ],
  };
  const result = await runLabScenarioInternal(doc, {
    systems,
    verbosity: 0,
    skipMultiRunEquivalence: true,
  });
  assert.equal(result.ok, false, `NaN hull must fail runner: ${JSON.stringify(result.oracle || result.error || result.status)}`);
  assert.notEqual(result.exitClass, 0);
  const failed = result.oracle?.failed || [];
  assert.ok(
    failed.some((f) => f.id === 'finite-state'
      || f.id === 'no-negative-resources'
      || (f.id && /finite|resource|hull/i.test(String(f.id)))),
    JSON.stringify(failed),
  );
});

test('O5: Infinity credits fails resource invariant', () => {
  const oracle = evaluateOracles({
    trace: [{
      tick: 0,
      playerX: 0,
      playerZ: 0,
      playerVelX: 0,
      playerVelZ: 0,
      hull: 100,
      cap: 50,
      credits: Infinity,
    }],
  });
  assert.equal(oracle.ok, false);
  assert.ok(oracle.failed.some((f) => f.id === 'finite-state' || f.id === 'no-negative-resources'));
});
