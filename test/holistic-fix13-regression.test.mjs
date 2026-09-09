// Holistic FIX13 regressions — close last seal injection seams (Q1–Q3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isAuthoritativeEquivalenceResult,
  isPromotableLabResult,
  EQUIVALENCE_EXECUTOR_SOURCES,
} from '../src/testing/lab/equivalenceAuthority.js';
import { evaluateOracles } from '../src/testing/lab/oracleEngine.js';
import { repeatScenario } from '../src/testing/lab/repeat.js';
import { compareSaveLoad } from '../src/testing/lab/saveLoadCompare.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const LAB = join(ROOT, '../src/testing/lab');
const flightDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-fixed-input.scenario.json'),
  'utf8',
));

// ── Q1: seal module must not be importable ───────────────────────────────────

test('Q1: _equivalenceSeal.js no longer exists as an importable mint file', () => {
  assert.equal(
    existsSync(join(LAB, '_equivalenceSeal.js')),
    false,
    'private seal file must be deleted so callers cannot import sealEquivalenceResult',
  );
});

test('Q1: sealEquivalenceResult is not exported from any public lab surface', async () => {
  const lab = await import('../src/testing/lab/index.js');
  assert.equal(lab.sealEquivalenceResult, undefined);
  assert.equal('sealEquivalenceResult' in lab, false);

  const auth = await import('../src/testing/lab/equivalenceAuthority.js');
  assert.equal(auth.sealEquivalenceResult, undefined);
  assert.equal('sealEquivalenceResult' in auth, false);

  const repeat = await import('../src/testing/lab/repeat.js');
  assert.equal(repeat.sealEquivalenceResult, undefined);
  assert.equal('sealEquivalenceResult' in repeat, false);

  const saveLoad = await import('../src/testing/lab/saveLoadCompare.js');
  assert.equal(saveLoad.sealEquivalenceResult, undefined);
  assert.equal('sealEquivalenceResult' in saveLoad, false);

  // Direct import of the deleted seal module fails.
  await assert.rejects(
    () => import('../src/testing/lab/_equivalenceSeal.js'),
    (err) => err && (err.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find module|ERR_MODULE_NOT_FOUND/i.test(String(err))),
  );
});

test('Q1: only fixed parent executor can produce an authoritative sealed result', async () => {
  const forged = {
    ok: true,
    expected: true,
    actual: true,
    source: EQUIVALENCE_EXECUTOR_SOURCES.REPEAT,
  };
  assert.equal(isAuthoritativeEquivalenceResult(forged), false);

  const doc = {
    ...flightDoc,
    id: 'fix13.q1-parent-seal',
    ticks: 8,
    frames: [{ tick: 0, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false } }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
  };
  const parent = await repeatScenario(doc, { verbosity: 0, runs: 2 });
  const sealed = parent.equivalence?.['run-eq-repeat'];
  assert.ok(sealed, 'repeatScenario must emit equivalence entry');
  assert.equal(isAuthoritativeEquivalenceResult(sealed), true);
  assert.equal(sealed.source, EQUIVALENCE_EXECUTOR_SOURCES.REPEAT);
});

// ── Q2: spreading a sealed result must not copy authority ────────────────────

test('Q2: spreading a legitimate sealed result does not transfer WeakSet authority', async () => {
  const doc = {
    ...flightDoc,
    id: 'fix13.q2-spread-seal',
    ticks: 8,
    frames: [{ tick: 0, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false } }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
  };
  const parent = await repeatScenario(doc, { verbosity: 0, runs: 2 });
  const sealed = parent.equivalence?.['run-eq-repeat'];
  assert.ok(sealed);
  assert.equal(isAuthoritativeEquivalenceResult(sealed), true);

  // Classic forge: copy enumerable fields (including any public source tag) onto a new object.
  const forged = { ...sealed, ok: true };
  assert.notEqual(forged, sealed);
  assert.equal(
    isAuthoritativeEquivalenceResult(forged),
    false,
    'spread copy must not be authoritative (WeakSet identity)',
  );

  const forgedOracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0, hull: 100 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    equivalence: { 'run-eq-repeat': forged },
  });
  assert.equal(forgedOracle.ok, false);
  const forgedEq = forgedOracle.results.find((r) => r.family === 'equivalence');
  assert.equal(forgedEq.ok, false);
  assert.equal(forgedEq.injected, true);

  // Exact object identity from parent is still accepted.
  const legitOracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0, hull: 100 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    equivalence: { 'run-eq-repeat': sealed },
  });
  const legitEq = legitOracle.results.find((r) => r.family === 'equivalence');
  assert.ok(legitEq);
  assert.notEqual(legitEq.injected, true);
  assert.equal(legitEq.ok, sealed.ok);
});

test('Q2: Object.assign / structured clone also fails to mint authority', async () => {
  const doc = {
    ...flightDoc,
    id: 'fix13.q2-clone-seal',
    ticks: 8,
    frames: [{ tick: 0, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false } }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
  };
  const parent = await repeatScenario(doc, { verbosity: 0, runs: 2 });
  const sealed = parent.equivalence?.['run-eq-repeat'];
  assert.ok(sealed);

  const assigned = Object.assign({}, sealed, { ok: true });
  assert.equal(isAuthoritativeEquivalenceResult(assigned), false);

  // JSON round-trip loses identity entirely.
  const jsonCopy = JSON.parse(JSON.stringify(sealed));
  assert.equal(isAuthoritativeEquivalenceResult(jsonCopy), false);
});

// ── Q3: failing repeat arms must not produce passing equivalence ─────────────

test('Q3: both repeat arms failing the same oracle → equivalence ok:false', async () => {
  const failing = {
    ...flightDoc,
    id: 'fix13.q3-double-fail-repeat',
    ticks: 8,
    frames: [{ tick: 0, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false } }],
    metrics: [
      {
        name: 'flight.finalSpeed',
        version: 1,
        // Impossible threshold: both arms fail oracle the same way → matching hashes.
        threshold: { op: '<=', value: -1 },
      },
    ],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
  };
  const result = await repeatScenario(failing, { verbosity: 0, runs: 2 });
  assert.equal(result.ok, false, 'parent must not pass when arms fail oracle');
  assert.equal(result.status, 'arm-oracle-fail');
  assert.equal(result.exitClass, 1);

  const sealed = result.equivalence?.['run-eq-repeat'];
  assert.ok(sealed, 'must still emit sealed equivalence entry');
  assert.equal(isAuthoritativeEquivalenceResult(sealed), true, 'entry is sealed (identity)');
  assert.equal(sealed.ok, false, 'sealed equivalence must be ok:false when arms failed');
  assert.equal(sealed.allArmsOk, false);
  assert.match(String(sealed.reason || ''), /parity of failures|oracle failed/i);

  // evaluateOracles must surface ok:false for the sealed failure (not treat seal as free pass).
  const oracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0, hull: 100 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    equivalence: { 'run-eq-repeat': sealed },
  });
  const eq = oracle.results.find((r) => r.family === 'equivalence');
  assert.equal(eq.ok, false);
  assert.notEqual(eq.injected, true);
});

test('Q3: save-load double-fail still fails (regression of prior parity-of-failures fix)', async () => {
  // Prefer a save-load-capable doc when available; otherwise skip lightly.
  const saveLoadPath = join(ROOT, '../src/testing/scenarios/flight-save-load.scenario.json');
  let base = flightDoc;
  if (existsSync(saveLoadPath)) {
    base = JSON.parse(readFileSync(saveLoadPath, 'utf8'));
  }
  const failing = {
    ...base,
    id: 'fix13.q3-double-fail-saveload',
    metrics: [
      {
        name: 'flight.finalSpeed',
        version: 1,
        threshold: { op: '<=', value: -1 },
      },
    ],
  };
  const result = await compareSaveLoad(failing, { verbosity: 0, saveLoadAt: 4 });
  // Either arm-oracle-fail (both fail metric) or unsupported/invalid depending on systems.
  if (result.status === 'arm-oracle-fail') {
    assert.equal(result.ok, false);
    const sealed = result.equivalence?.['uninterrupted-eq-save-load'];
    assert.ok(sealed);
    assert.equal(sealed.ok, false);
    assert.equal(isAuthoritativeEquivalenceResult(sealed), true);
  } else {
    // Config/unsupported path is still a non-pass.
    assert.equal(result.ok, false);
  }
});

test('Q3: healthy repeat with passing arms can still seal ok:true', async () => {
  const doc = {
    ...flightDoc,
    id: 'fix13.q3-healthy-repeat',
    ticks: 8,
    frames: [{ tick: 0, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false } }],
    assertions: [
      { kind: 'metric', metric: 'invariant.finiteState', op: '==', value: 1 },
      { kind: 'equivalence', equivalence: 'run-eq-repeat' },
    ],
  };
  const result = await repeatScenario(doc, { verbosity: 0, runs: 2 });
  // If arms pass and match, parent may pass; if not, still must not claim free green seal.
  const sealed = result.equivalence?.['run-eq-repeat'];
  assert.ok(sealed);
  assert.equal(isAuthoritativeEquivalenceResult(sealed), true);
  if (result.ok) {
    assert.equal(sealed.ok, true);
    assert.equal(sealed.allArmsOk, true);
    assert.equal(isPromotableLabResult(result), true);
  } else {
    assert.equal(sealed.ok, false);
  }
});
