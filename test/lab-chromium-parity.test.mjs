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
