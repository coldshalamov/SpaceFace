// Node ↔ Chromium authoritative parity + within-Chromium determinism (Phase 4 §15).
// Chromium sessions are manual-step hosts (not broker acceptance).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileSimScenario } from '../src/contracts/simScenarioSchema.js';
import { runDifferentialReplay, runChromiumDeterminismCheck } from '../src/testing/lab/differentialReplay.js';
import { compareCheckpoints } from '../src/testing/lab/checkpointCompare.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const flightDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-fixed-input.scenario.json'),
  'utf8',
));

// Keep ticks modest for CI wall time; same artifact contract as full scenario.
const shortDoc = {
  ...flightDoc,
  id: 'flight.fixed-input.parity-short',
  ticks: 45,
};

test('same compiled scenario artifact is consumed by Node and Chromium paths', async () => {
  const compiled = compileSimScenario(shortDoc);
  assert.equal(compiled.ok, true, JSON.stringify(compiled.validation));
  assert.ok(compiled.canonical);
  assert.ok(compiled.canonical.inputTape || compiled.canonical.frames);

  const result = await runDifferentialReplay(shortDoc, {
    canonical: compiled.canonical,
    verbosity: 1,
    checkpointEvery: 15,
    timeoutMs: 180_000,
  });

  assert.equal(result.schema, 'spaceface.labDifferentialReplay.v1');
  assert.notEqual(result.status, 'infra', result.error || JSON.stringify(result));
  assert.notEqual(result.status, 'timeout', result.error);
  assert.equal(result.sameCompiledArtifact, true, JSON.stringify(result.sameArtifact));
  assert.ok(result.scenarioDigest);
  assert.ok(result.inputDigest);
  assert.equal(result.exactWithin.crossRuntime, false);

  if (!result.ok) {
    // Match OR exact first-divergence report — both satisfy §3 item 3.
    assert.ok(result.compare && result.compare.firstDivergence, 'expected first-divergence detail');
    assert.ok(result.firstDivergenceReport && result.firstDivergenceReport.startsWith('first-divergence'));
    assert.ok(result.compare.firstDivergence.raw, 'raw divergence must be recorded');
    console.log('[lab-chromium-parity] divergence report:', result.firstDivergenceReport);
  } else {
    assert.equal(result.firstDivergenceReport, 'match');
    assert.equal(result.compare.match, true);
  }

  assert.ok((result.browserLaunches | 0) >= 1, 'chromium host must launch once for parity');
});

test('repeated Chromium run is deterministic within declared coverage', async () => {
  const compiled = compileSimScenario(shortDoc);
  assert.equal(compiled.ok, true);
  const det = await runChromiumDeterminismCheck(shortDoc, {
    canonical: compiled.canonical,
    checkpointEvery: 15,
    timeoutMs: 180_000,
  });
  assert.equal(det.ok, true, JSON.stringify(det.firstBad || det.error || det));
  assert.equal(det.deterministic, true);
  assert.ok(det.finalHash);
});

test('compareCheckpoints unit: hash-only series', () => {
  const a = [{ tick: 1, hash: 'x' }, { tick: 2, hash: 'y' }];
  const b = [{ tick: 1, hash: 'x' }, { tick: 2, hash: 'y' }];
  assert.equal(compareCheckpoints(a, b).match, true);
  const c = [{ tick: 1, hash: 'x' }, { tick: 2, hash: 'z' }];
  const d = compareCheckpoints(a, c);
  assert.equal(d.match, false);
  assert.equal(d.firstDivergence.tick, 2);
  assert.equal(d.lastMatchingTick, 1);
});

test('FIX2: Node oracle fail + matching Chromium series → arm-oracle-fail (not exit 0)', async () => {
  const compiled = compileSimScenario(shortDoc);
  assert.equal(compiled.ok, true);
  const series = [
    { tick: 14, hash: 'same', surface: { tick: 14 } },
    { tick: 29, hash: 'same2', surface: { tick: 29 } },
    { tick: 44, hash: 'same3', surface: { tick: 44 } },
  ];
  const result = await runDifferentialReplay(shortDoc, {
    canonical: compiled.canonical,
    verbosity: 1,
    checkpointEvery: 15,
    // Inject arms: Node fails oracle; Chromium "matches" with identical series.
    runNodeArm: async () => ({
      ok: false,
      exitClass: 1,
      status: 'fail',
      scenarioDigest: null, // filled after pin — override below via same digests in result path
      inputDigest: null,
      fingerprint: null,
      oracle: {
        ok: false,
        firstBadTick: 10,
        failed: [{ id: 'flight.finalSpeed', ok: false }],
      },
      checkpoints: {
        mid: series.map((p) => ({
          tick: p.tick,
          deterministicCovered: { hash: p.hash, surface: p.surface },
        })),
      },
      ticks: 45,
    }),
    runChromiumArm: async (_can, opts) => ({
      ok: true,
      status: 'pass',
      scenarioDigest: opts.scenarioDigest,
      inputDigest: opts.inputDigest,
      series,
      finalHash: series.at(-1).hash,
      fingerprint: null,
      browserLaunches: 0,
      durationMs: 1,
    }),
  });

  // Pin digests on node arm result aren't needed — gate is ok flags.
  assert.equal(result.ok, false, 'failed Node oracle must not promote parity pass');
  assert.equal(result.status, 'arm-oracle-fail');
  assert.equal(result.exitClass, 1);
  assert.ok(Array.isArray(result.failedArms) && result.failedArms.includes('node'));
  assert.notEqual(result.exitClass, 0);
});

test('FIX3: massline/attachment scenarios are unsupported for Chromium parity', async () => {
  const masslineDoc = JSON.parse(readFileSync(
    join(ROOT, '../src/testing/scenarios/massline-latch-reel.scenario.json'),
    'utf8',
  ));
  const compiled = compileSimScenario(masslineDoc);
  assert.equal(compiled.ok, true);
  const result = await runDifferentialReplay(masslineDoc, {
    canonical: compiled.canonical,
    verbosity: 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.exitClass, 4);
  assert.match(String(result.error || ''), /Chromium parity|attachment|massline|unsupported/i);
});

test('FIX5: series length mismatch localizes after matching prefix', () => {
  const node = [
    { tick: 19, hash: 'a' },
    { tick: 39, hash: 'b' },
    { tick: 59, hash: 'c' },
  ];
  const chrome = [
    { tick: 19, hash: 'a' },
    { tick: 39, hash: 'b' },
  ];
  const r = compareCheckpoints(node, chrome);
  assert.equal(r.match, false);
  assert.equal(r.lastMatchingTick, 39);
  assert.equal(r.firstDivergence.tick, 59);
  assert.equal(r.firstDivergence.kind, 'series-length');
});
