// Holistic FIX14 regressions — bind seals to claim+scenario; parent ownership.
// R1: WeakMap binding {scenarioDigest, equivalenceId, executor}; bearer tokens rejected.
// R2: each parent owns specific claims; foreign → incomplete (never certify).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isAuthoritativeEquivalenceResult,
  getEquivalenceSealBinding,
  EQUIVALENCE_EXECUTOR_SOURCES,
} from '../src/testing/lab/equivalenceAuthority.js';
import { evaluateOracles } from '../src/testing/lab/oracleEngine.js';
import { repeatScenario } from '../src/testing/lab/repeat.js';
import { compareSaveLoad } from '../src/testing/lab/saveLoadCompare.js';
import { runDifferentialReplay } from '../src/testing/lab/differentialReplay.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const flightDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-fixed-input.scenario.json'),
  'utf8',
));

// ── R1: seal is not a bearer token ───────────────────────────────────────────

test('R1: run-eq-repeat seal submitted for never-proved-by-this-seal is rejected', async () => {
  const doc = {
    ...flightDoc,
    id: 'fix14.r1-bearer-claim-mismatch',
    ticks: 8,
    frames: [{ tick: 0, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false } }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
  };
  const parent = await repeatScenario(doc, { verbosity: 0, runs: 2 });
  const sealed = parent.equivalence?.['run-eq-repeat'];
  assert.ok(sealed, 'parent must emit sealed run-eq-repeat');
  assert.equal(isAuthoritativeEquivalenceResult(sealed), true);

  const binding = getEquivalenceSealBinding(sealed);
  assert.ok(binding);
  assert.equal(binding.equivalenceId, 'run-eq-repeat');
  assert.equal(binding.executor, EQUIVALENCE_EXECUTOR_SOURCES.REPEAT);
  assert.ok(binding.scenarioDigest == null || typeof binding.scenarioDigest === 'string');

  // Codex repro: legitimate seal under a different claim name → must not authorize.
  const oracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0, hull: 100 }],
    assertions: [{ kind: 'equivalence', equivalence: 'never-proved-by-this-seal' }],
    equivalence: { 'never-proved-by-this-seal': sealed },
    scenarioDigest: binding.scenarioDigest,
  });
  assert.equal(oracle.ok, false, 'bearer reuse across claims must fail');
  const eq = oracle.results.find((r) => r.family === 'equivalence' && r.id === 'never-proved-by-this-seal');
  assert.ok(eq);
  assert.equal(eq.ok, false);
  assert.equal(eq.boundMismatch, true);
  assert.match(String(eq.reason || ''), /cannot authorize|bound to/i);

  // Same seal under the bound claim still works (when digests match or evaluator omits digest).
  const legit = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0, hull: 100 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    equivalence: { 'run-eq-repeat': sealed },
    scenarioDigest: binding.scenarioDigest,
  });
  const legitEq = legit.results.find((r) => r.family === 'equivalence' && r.id === 'run-eq-repeat');
  assert.ok(legitEq);
  assert.notEqual(legitEq.boundMismatch, true);
  assert.equal(legitEq.ok, sealed.ok);
});

test('R1: seal for scenario A cannot authorize scenario B (digest mismatch)', async () => {
  const doc = {
    ...flightDoc,
    id: 'fix14.r1-scenario-digest-bind',
    ticks: 8,
    frames: [{ tick: 0, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false } }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
  };
  const parent = await repeatScenario(doc, { verbosity: 0, runs: 2 });
  const sealed = parent.equivalence?.['run-eq-repeat'];
  assert.ok(sealed);
  const binding = getEquivalenceSealBinding(sealed);
  assert.ok(binding?.scenarioDigest, 'parent seal must bind a scenarioDigest');

  const oracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0, hull: 100 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    equivalence: { 'run-eq-repeat': sealed },
    scenarioDigest: '0'.repeat(64), // different digest
  });
  const eq = oracle.results.find((r) => r.family === 'equivalence');
  assert.equal(eq.ok, false);
  assert.equal(eq.boundMismatch, true);
  assert.match(String(eq.reason || ''), /scenarioDigest/i);
});

// ── R2: parent ownership ─────────────────────────────────────────────────────

test('R2: compareSaveLoad with only run-eq-repeat is incomplete (does not certify)', async () => {
  const doc = {
    ...flightDoc,
    id: 'fix14.r2-saveload-foreign-repeat',
    ticks: 16,
    frames: [{ tick: 0, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false } }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
  };
  const result = await compareSaveLoad(doc, { verbosity: 0, saveLoadAt: 4 });
  assert.equal(result.ok, false, 'save/load must not pass foreign run-eq-repeat');
  assert.equal(result.exitClass, 4);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.certifying, false);
  assert.match(String(result.reason || result.detail || ''), /unsupported equivalence|does not own/i);
  assert.ok(
    Array.isArray(result.foreignEquivalences) && result.foreignEquivalences.includes('run-eq-repeat'),
    JSON.stringify(result.foreignEquivalences),
  );
  // Must not emit a sealed run-eq-repeat certification.
  assert.equal(result.equivalence?.['run-eq-repeat'], undefined);
});

test('R2: repeatScenario with uninterrupted-eq-save-load is incomplete', async () => {
  const doc = {
    ...flightDoc,
    id: 'fix14.r2-repeat-foreign-saveload',
    ticks: 12,
    frames: [{ tick: 0, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false } }],
    assertions: [{ kind: 'equivalence', equivalence: 'uninterrupted-eq-save-load' }],
  };
  const result = await repeatScenario(doc, { verbosity: 0, runs: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.certifying, false);
  const eq = result.equivalence?.['uninterrupted-eq-save-load'];
  assert.ok(eq);
  assert.equal(eq.ok, false);
  assert.ok(eq.incomplete || /unsupported|does not own/i.test(String(eq.reason || '')));
});

test('R2: differential with only run-eq-repeat is incomplete', async () => {
  const doc = {
    ...flightDoc,
    id: 'fix14.r2-diff-foreign-repeat',
    ticks: 8,
    frames: [{ tick: 0, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false } }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
  };
  const result = await runDifferentialReplay(doc, { verbosity: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.exitClass, 4);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.certifying, false);
  assert.ok(
    Array.isArray(result.foreignEquivalences) && result.foreignEquivalences.includes('run-eq-repeat'),
  );
});

test('R2: repeatScenario still certifies owned run-eq-repeat', async () => {
  const doc = {
    ...flightDoc,
    id: 'fix14.r2-repeat-owned',
    ticks: 8,
    frames: [{ tick: 0, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false } }],
    assertions: [
      { kind: 'metric', metric: 'invariant.finiteState', op: '==', value: 1 },
      { kind: 'equivalence', equivalence: 'run-eq-repeat' },
    ],
  };
  const result = await repeatScenario(doc, { verbosity: 0, runs: 2 });
  const sealed = result.equivalence?.['run-eq-repeat'];
  assert.ok(sealed);
  assert.equal(isAuthoritativeEquivalenceResult(sealed), true);
  const binding = getEquivalenceSealBinding(sealed);
  assert.equal(binding?.equivalenceId, 'run-eq-repeat');
  assert.equal(binding?.executor, EQUIVALENCE_EXECUTOR_SOURCES.REPEAT);
  if (result.ok) {
    assert.equal(result.certifying, true);
    assert.equal(sealed.ok, true);
  }
});
