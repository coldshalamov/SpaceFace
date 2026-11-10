// Holistic FIX10 regressions — N1–N4 (tick-range input, non-injectable equivalence,
// skipped ≠ consumed, ledger acceptance mode + probe pass).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateSimScenario,
  validateCanonicalScenario,
  compileSimScenario,
} from '../src/contracts/simScenarioSchema.js';
import { evaluateOracles } from '../src/testing/lab/oracleEngine.js';
import { assertAssertionsConsumed } from '../src/testing/lab/assertionConsumption.js';
import { isResolvedByAcceptedEvidence } from '../scripts/lib/validationBroker.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const flightDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-fixed-input.scenario.json'),
  'utf8',
));

// ── N1: input events/frames beyond tick range must fail ──────────────────────

test('N1: public-input with all events beyond ticks fails validation', () => {
  const doc = {
    ...flightDoc,
    id: 'n1.out-of-range-events',
    evidenceClass: 'public-input',
    ticks: 90,
    frames: [],
    inputEvents: [
      { tick: 999, device: 'keyboard', code: 'KeyW', pressed: true },
    ],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false, 'out-of-range-only tape must fail');
  assert.ok(
    v.issues.some((i) => i.rule === 'no-input-within-tick-range'
      || i.rule === 'tick-out-of-range'
      || /no input within tick range|out of range|tick-out-of-range/i.test(
        `${i.rule} ${i.message}`,
      )),
    JSON.stringify(v.issues),
  );
});

test('N1: individual frame tick >= ticks is rejected', () => {
  const doc = {
    ...flightDoc,
    id: 'n1.frame-oob',
    ticks: 90,
    frames: [
      { tick: 0, input: { moveX: 0, moveZ: 1, turnIntent: 0, boost: false } },
      { tick: 90, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false } },
    ],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => i.rule === 'tick-out-of-range' || /outside executed range/i.test(i.message)),
    JSON.stringify(v.issues),
  );
});

test('N1: public-input canonical tape with only out-of-range ticks fails', () => {
  const compiled = compileSimScenario(flightDoc);
  assert.equal(compiled.ok, true);
  const canonical = structuredClone(compiled.canonical);
  canonical.evidenceClass = 'public-input';
  canonical.ticks = 90;
  canonical.inputTape = {
    events: [{ tick: 999, device: 'keyboard', code: 'KeyW', pressed: true }],
    frames: [],
  };
  canonical.inputEvents = canonical.inputTape.events;
  canonical.frames = [];
  const v = validateCanonicalScenario(canonical);
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => i.rule === 'no-input-within-tick-range'
      || i.rule === 'tick-out-of-range'
      || /no input within tick range|outside executed range/i.test(`${i.rule} ${i.message}`)),
    JSON.stringify(v.issues),
  );
});

test('N1: in-range event on public-input does not fire tick-range rule', () => {
  const doc = {
    ...flightDoc,
    id: 'n1.in-range',
    evidenceClass: 'public-input',
    ticks: 90,
    frames: [
      { tick: 0, input: { moveX: 0, moveZ: 1, turnIntent: 0, boost: false } },
    ],
    inputEvents: [],
  };
  const v = validateSimScenario(doc);
  assert.ok(
    !v.issues.some((i) => i.rule === 'no-input-within-tick-range' || i.rule === 'tick-out-of-range'),
    JSON.stringify(v.issues),
  );
});

// ── N2: equivalence not injectable via caller booleans ───────────────────────

test('N2: caller-injected equivalence boolean true fails (not valid proof)', () => {
  const oracle = evaluateOracles({
    trace: [
      { tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0, playerRot: 0 },
    ],
    metrics: [
      { name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } },
    ],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    equivalence: { 'run-eq-repeat': true },
  });
  assert.equal(oracle.ok, false, 'injected true must not pass');
  const eq = oracle.results.find((r) => r.family === 'equivalence' && r.id === 'run-eq-repeat');
  assert.ok(eq, 'equivalence result required');
  assert.equal(eq.ok, false);
  assert.equal(eq.injected, true);
  assert.match(String(eq.reason || ''), /boolean|not valid proof|inject/i);
});

test('N2: bare { ok: true } equivalence object fails (no comparison payload)', () => {
  const oracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    equivalence: { 'run-eq-repeat': { ok: true } },
  });
  assert.equal(oracle.ok, false);
  const eq = oracle.results.find((r) => r.family === 'equivalence');
  assert.equal(eq.ok, false);
  assert.equal(eq.injected, true);
});

test('N2: shape-only comparison result is rejected (O2 seal required)', () => {
  // FIX11 O2: { ok, expected, actual } without fixed-executor seal is not proof.
  const oracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    equivalence: {
      'run-eq-repeat': { ok: true, expected: true, actual: true },
    },
  });
  assert.equal(oracle.ok, false, 'unsealed shape-only equivalence must not pass');
  const eq = oracle.results.find((r) => r.family === 'equivalence');
  assert.equal(eq.ok, false);
  assert.equal(eq.injected, true);
});

test('N2: sealed comparison result from fixed parent executor may pass', async () => {
  // P1: do not import sealEquivalenceResult — obtain a real seal only via parent executor.
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { repeatScenario } = await import('../src/testing/lab/repeat.js');
  const root = dirname(fileURLToPath(import.meta.url));
  const flightDoc = JSON.parse(readFileSync(
    join(root, '../src/testing/scenarios/flight-fixed-input.scenario.json'),
    'utf8',
  ));
  const doc = {
    ...flightDoc,
    id: 'fix10.n2-sealed-via-parent',
    ticks: 8,
    frames: [{ tick: 0, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false } }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
  };
  const parent = await repeatScenario(doc, { verbosity: 0, runs: 2 });
  const sealed = parent.equivalence && parent.equivalence['run-eq-repeat'];
  assert.ok(sealed, 'parent must emit sealed run-eq-repeat');

  const oracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    equivalence: { 'run-eq-repeat': sealed },
  });
  const eq = oracle.results.find((r) => r.family === 'equivalence');
  assert.ok(eq);
  assert.notEqual(eq.injected, true);
  assert.equal(eq.ok, sealed.ok);
  // When parent proved determinism, oracle accepts the green sealed entry.
  if (sealed.ok) assert.equal(oracle.ok, true);
});

// ── N3: skipped equivalences must not count as consumed ──────────────────────

test('N3: skipMultiRunEquivalence emits skipped, not ok:true', () => {
  const oracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    skipMultiRunEquivalence: true,
  });
  const eq = oracle.results.find((r) => r.family === 'equivalence');
  assert.ok(eq);
  assert.equal(eq.skipped, true);
  assert.notEqual(eq.ok, true, 'skipped must not be ok:true');
  // Skipped is not an oracle failure for the arm (parent owns evaluation).
  assert.equal(oracle.ok, true);
  assert.ok(!oracle.failed.some((f) => f.skipped), 'skipped not in failed');
});

test('N3: skipped equivalence does not match consumption without parent-owned waiver', () => {
  const oracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    skipMultiRunEquivalence: true,
  });
  // Without skipMultiRunEquivalence on consumption, skipped ≠ consumed.
  const bare = assertAssertionsConsumed(
    [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    oracle.results,
  );
  assert.equal(bare.ok, false, 'skipped must not count as consumed');
  assert.ok(bare.unconsumed.length >= 1);
});

test('N3: parent-owned skip waives consumption without counting as passed', () => {
  const oracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    skipMultiRunEquivalence: true,
  });
  const withParent = assertAssertionsConsumed(
    [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    oracle.results,
    { skipMultiRunEquivalence: true },
  );
  assert.equal(withParent.ok, true, 'parent-owned arm may proceed');
  assert.ok(withParent.skippedEquivalences.includes('run-eq-repeat'));
  assert.equal(withParent.consumedIds.length, 0, 'skipped must not appear in consumedIds');
});

test('N3: deferred (standalone, no skip) remains incomplete / not consumed-passing', () => {
  const oracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
  });
  assert.equal(oracle.ok, false);
  const eq = oracle.results.find((r) => r.family === 'equivalence');
  assert.equal(eq.deferred, true);
  assert.equal(eq.ok, false);
  const consumption = assertAssertionsConsumed(
    [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    oracle.results,
  );
  // Deferred result matches for bookkeeping (one result) but ok:false so overall incomplete.
  assert.equal(consumption.ok, true, 'deferred still produces exactly one result for the assertion');
  assert.equal(eq.ok, false, 'deferred must not pass');
});

// ── N4: claim ledger mode + probe pass ───────────────────────────────────────

function baseResolveArgs(now, digests) {
  return {
    latestFailure: {
      primaryAcceptance: true,
      runtimeKind: 'browser',
      generatedAt: new Date(now - 60_000).toISOString(),
    },
    acceptedRuntimeKind: 'browser',
    acceptedGeneratedAt: new Date(now).toISOString(),
    now,
    ...digests,
  };
}

test('N4: diagnostic-mode ledger claim cannot resolve acceptance failure', () => {
  const now = Date.now();
  const digests = { candidateDigest: 'cand-n4-diag' };
  const ok = isResolvedByAcceptedEvidence({
    ...baseResolveArgs(now, digests),
    acceptedEvidence: {
      pass: true,
      primaryAcceptance: true,
      claimId: 'claim-n4-diag',
      digests,
    },
    consumedClaim: {
      claimId: 'claim-n4-diag',
      candidateDigest: digests.candidateDigest,
      runtimeKind: 'browser',
      mode: 'diagnostic',
      consumedAt: new Date(now).toISOString(),
    },
  });
  assert.equal(ok, false, 'diagnostic claim must not clear acceptance failure');
});

test('N4: missing ledger mode cannot resolve acceptance failure', () => {
  const now = Date.now();
  const digests = { candidateDigest: 'cand-n4-nomode' };
  const ok = isResolvedByAcceptedEvidence({
    ...baseResolveArgs(now, digests),
    acceptedEvidence: {
      pass: true,
      primaryAcceptance: true,
      claimId: 'claim-n4-nomode',
      digests,
    },
    consumedClaim: {
      claimId: 'claim-n4-nomode',
      candidateDigest: digests.candidateDigest,
      runtimeKind: 'browser',
      // mode absent
      consumedAt: new Date(now).toISOString(),
    },
  });
  assert.equal(ok, false, 'missing mode must not resolve');
});

test('N4: consumed claim + failing probe (pass:false) cannot resolve', () => {
  const now = Date.now();
  const digests = { candidateDigest: 'cand-n4-failprobe' };
  const ok = isResolvedByAcceptedEvidence({
    ...baseResolveArgs(now, digests),
    acceptedEvidence: {
      pass: false,
      primaryAcceptance: true,
      claimId: 'claim-n4-failprobe',
      digests,
    },
    consumedClaim: {
      claimId: 'claim-n4-failprobe',
      candidateDigest: digests.candidateDigest,
      runtimeKind: 'browser',
      mode: 'acceptance',
      consumedAt: new Date(now).toISOString(),
    },
  });
  assert.equal(ok, false, 'failing probe evidence must not resolve');
});

test('N4: acceptance-mode ledger + pass:true may resolve', () => {
  const now = Date.now();
  const digests = { candidateDigest: 'cand-n4-ok' };
  const ok = isResolvedByAcceptedEvidence({
    ...baseResolveArgs(now, digests),
    acceptedEvidence: {
      pass: true,
      primaryAcceptance: true,
      claimId: 'claim-n4-ok',
      digests,
    },
    consumedClaim: {
      claimId: 'claim-n4-ok',
      candidateDigest: digests.candidateDigest,
      runtimeKind: 'browser',
      mode: 'acceptance',
      consumedAt: new Date(now).toISOString(),
    },
  });
  assert.equal(ok, true);
});
