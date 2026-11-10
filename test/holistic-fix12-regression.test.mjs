// Holistic FIX12 regressions — close remaining injection-bypass paths (P1–P2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isAuthoritativeEquivalenceResult,
  isPromotableLabResult,
  EQUIVALENCE_EXECUTOR_SOURCES,
} from '../src/testing/lab/equivalenceAuthority.js';
import { evaluateOracles } from '../src/testing/lab/oracleEngine.js';
import { repeatScenario } from '../src/testing/lab/repeat.js';
import {
  runBrowserLabScenario,
  runBrowserLabScenarioInternal,
} from '../src/testing/lab/browserScenarioHost.js';
import {
  runChromiumLabScenario,
  runChromiumLabScenarioInternal,
} from '../src/testing/lab/chromiumHost.js';
import { compileSimScenario } from '../src/contracts/simScenarioSchema.js';
import { BROWSER_FOCUSED_FLIGHT_SYSTEMS } from '../src/testing/lab/browserScenarioHost.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const flightDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-fixed-input.scenario.json'),
  'utf8',
));

// ── P1: sealEquivalenceResult must not be a public mint API ──────────────────

test('P1: sealEquivalenceResult is not exported from lab barrel', async () => {
  const lab = await import('../src/testing/lab/index.js');
  assert.equal(lab.sealEquivalenceResult, undefined);
  assert.equal('sealEquivalenceResult' in lab, false);
});

test('P1: sealEquivalenceResult is not exported from equivalenceAuthority', async () => {
  const auth = await import('../src/testing/lab/equivalenceAuthority.js');
  assert.equal(auth.sealEquivalenceResult, undefined);
  assert.equal('sealEquivalenceResult' in auth, false);
  // Verification helpers remain public.
  assert.equal(typeof auth.isAuthoritativeEquivalenceResult, 'function');
  assert.equal(typeof auth.isPromotableLabResult, 'function');
  assert.ok(auth.EQUIVALENCE_EXECUTOR_SOURCES);
});

test('P1: forged shape without private seal is rejected; parent seal is accepted', async () => {
  const forged = {
    ok: true,
    expected: true,
    actual: true,
    source: EQUIVALENCE_EXECUTOR_SOURCES.REPEAT,
  };
  assert.equal(isAuthoritativeEquivalenceResult(forged), false);

  const forgedOracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0, hull: 100 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    equivalence: { 'run-eq-repeat': forged },
  });
  assert.equal(forgedOracle.ok, false);
  const forgedEq = forgedOracle.results.find((r) => r.family === 'equivalence');
  assert.equal(forgedEq.injected, true);

  // Only fixed parent executor can mint a real seal.
  const doc = {
    ...flightDoc,
    id: 'fix12.p1-parent-seal',
    ticks: 8,
    frames: [{ tick: 0, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false } }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
  };
  const parent = await repeatScenario(doc, { verbosity: 0, runs: 2 });
  const sealed = parent.equivalence?.['run-eq-repeat'];
  assert.ok(sealed, 'repeatScenario must emit equivalence entry');
  assert.equal(isAuthoritativeEquivalenceResult(sealed), true);
});

// ── P2: browser/chromium public runners reject DI ────────────────────────────

test('P2: runBrowserLabScenario(canonical, options) rejects options injection', async () => {
  const compiled = compileSimScenario(flightDoc);
  assert.equal(compiled.ok, true);
  const result = await runBrowserLabScenario(compiled.canonical, {
    systems: [],
    equivalence: { 'run-eq-repeat': { ok: true, expected: 'forged', actual: 'forged' } },
    skipMultiRunEquivalence: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid-config');
  assert.match(String(result.error || ''), /only \(canonical\)|options injection is forbidden/i);
  assert.notEqual(result.certifying, true);
});

test('P2: runBrowserLabScenarioInternal is always nonPromoting', async () => {
  const compiled = compileSimScenario({
    ...flightDoc,
    id: 'fix12.browser-internal',
    assertions: [
      { kind: 'metric', metric: 'invariant.finiteState', op: '==', value: 1 },
    ],
  });
  assert.equal(compiled.ok, true);
  const result = await runBrowserLabScenarioInternal(compiled.canonical, {
    skipMultiRunEquivalence: true,
    systems: [...BROWSER_FOCUSED_FLIGHT_SYSTEMS],
  });
  assert.equal(result.nonPromoting, true);
  assert.equal(result.certifying, false);
  assert.equal(result.focusedSystems, true);
  assert.equal(isPromotableLabResult({
    ...result,
    exitClass: result.ok ? 0 : 1,
  }), false);
});

test('P2: public runBrowserLabScenario cannot accept injected green equivalence', async () => {
  const compiled = compileSimScenario(flightDoc);
  assert.equal(compiled.ok, true);
  // Even if a caller tries to pass options, public path rejects before any oracle DI.
  const rejected = await runBrowserLabScenario(compiled.canonical, {
    equivalence: {
      'run-eq-repeat': {
        ok: true,
        expected: true,
        actual: true,
        source: 'repeat-executor',
      },
    },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, 'invalid-config');

  // Zero-DI public path: multi-run eq remains incomplete (cannot inject green).
  const pure = await runBrowserLabScenario(compiled.canonical);
  // Public path is certifying-shaped when it runs; multi-run eq without seal → not a free pass.
  if (pure.status !== 'invalid-config' && pure.status !== 'unsupported' && pure.status !== 'infra') {
    assert.equal(pure.nonPromoting, false);
    assert.equal(pure.certifying, true);
    assert.equal(pure.focusedSystems, true);
    // flight-fixed-input declares run-eq-repeat — without parent seal, deferred/fail.
    assert.notEqual(pure.ok, true, 'public browser path must not green multi-run eq alone');
  }
});

test('P2: runChromiumLabScenario(canonical, options) rejects options injection', async () => {
  const compiled = compileSimScenario(flightDoc);
  assert.equal(compiled.ok, true);
  const result = await runChromiumLabScenario(compiled.canonical, {
    systems: [],
    equivalence: { 'run-eq-repeat': { ok: true, expected: 'forged', actual: 'forged' } },
    skipMultiRunEquivalence: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid-config');
  assert.match(String(result.error || ''), /only \(canonical\)|options injection is forbidden/i);
  assert.equal(result.browserLaunches, 0, 'must reject before launching browser');
});

test('P2: runChromiumLabScenarioInternal is always nonPromoting (no browser when unsupported)', async () => {
  // Use a canonical that fails support check so we do not launch Chromium in CI.
  const compiled = compileSimScenario(flightDoc);
  assert.equal(compiled.ok, true);
  const bad = {
    ...compiled.canonical,
    systems: ['actions', 'weapons', 'flightV3', 'physics'], // wrong order → unsupported
  };
  const result = await runChromiumLabScenarioInternal(bad, {
    skipMultiRunEquivalence: true,
    equivalence: { 'run-eq-repeat': { ok: true, expected: true, actual: true } },
  });
  assert.equal(result.nonPromoting, true);
  assert.equal(result.certifying, false);
  assert.equal(result.ok, false);
  assert.ok(
    result.status === 'unsupported' || result.status === 'invalid-config' || result.status === 'infra',
    `expected host-level fail, got ${result.status}`,
  );
});
