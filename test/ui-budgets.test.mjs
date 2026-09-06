// PQ-184.00 — the budget baseline's judge, honestly red. The grammar owns the thresholds
// (scripts/ui-grammar-thresholds.mjs); these tests prove the check cites them (a row at exactly
// the budget passes, a row over it fails), that the aggregation takes the WORST frame sample per
// surface, and that a stale, headless, or empty baseline is red before any number is read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  UI_BUDGETS_SCHEMA,
  aggregateBudgetRows,
  judgeBudgets,
  uiSourceDigest,
} from '../scripts/lib/uiBudgets.mjs';
import { MAX_UI_FRAME_MS, MAX_SURFACE_DOM_NODES } from '../scripts/ui-grammar-thresholds.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function baselineRow(over = 0) {
  return {
    domNodes: MAX_SURFACE_DOM_NODES,
    frameMeanMs: MAX_UI_FRAME_MS + over,
    frameP95Ms: MAX_UI_FRAME_MS + over,
    frameMaxMs: MAX_UI_FRAME_MS + over,
    samples: 40,
  };
}

function goodBaseline() {
  return {
    schema: UI_BUDGETS_SCHEMA,
    headed: true,
    uiSourceDigest: 'digest-a',
    surfaces: { flight: baselineRow(0), chart: baselineRow(0) },
  };
}

test('a baseline at the grammar budgets is green; over-budget rows are named debt, red only under --strict', () => {
  const at = judgeBudgets(goodBaseline(), { sourceDigest: 'digest-a' });
  assert.equal(at.ok, true, `at-budget must pass: ${JSON.stringify(at.failures)}`);
  assert.equal(at.breaches.length, 0);
  assert.equal(at.debt.length, 0);

  const over = goodBaseline();
  over.surfaces.chart = baselineRow(0.001); // one tick over the grammar budget
  const nonStrict = judgeBudgets(over, { sourceDigest: 'digest-a' });
  assert.equal(nonStrict.ok, true, 'grammar debt is reported, not fatal, until .01/.02 pay it');
  assert.equal(nonStrict.debt.length, 1);
  assert.match(nonStrict.debt[0], /chart/);
  assert.match(nonStrict.debt[0], /PQ-184\.01/);

  const strict = judgeBudgets(over, { sourceDigest: 'digest-a', strict: true });
  assert.equal(strict.ok, false, 'under --strict the grammar debt itself is red');
  assert.equal(strict.strictFailures.length, 1);
});

test('a regression against the committed baseline is red the day it lands', () => {
  const current = {
    surfaces: {
      flight: { domNodes: 720, frameMeanMs: 1.2, frameP95Ms: 2, frameMaxMs: 3, frames: 5 },
      chart: { domNodes: 350, frameMeanMs: 12, frameP95Ms: 20, frameMaxMs: 30, frames: 5 },
    },
  };
  const baseline = {
    schema: UI_BUDGETS_SCHEMA,
    headed: true,
    uiSourceDigest: 'digest-a',
    surfaces: {
      flight: { domNodes: 720, frameMeanMs: 1.2, frameP95Ms: 2, frameMaxMs: 3, frames: 5 },
      chart: { domNodes: 350, frameMeanMs: 10, frameP95Ms: 18, frameMaxMs: 28, frames: 5 },
    },
  };
  const judged = judgeBudgets(baseline, { sourceDigest: 'digest-a', current });
  assert.equal(judged.ok, false, 'a 20 % worse chart is a regression');
  assert.equal(judged.breaches.length, 2, 'mean and p95 regressed (max is hitch noise, not a regression key)');
  assert.match(judged.breaches[0], /chart/);
  // A surface the baseline never recorded joins the baseline on the next shoot; it is not red.
  const withNew = { surfaces: { ...current.surfaces, codex: { domNodes: 5, frameMeanMs: 0.1, frameP95Ms: 0.2, frameMaxMs: 0.3, frames: 5 } } };
  assert.equal(judgeBudgets(baseline, { sourceDigest: 'digest-a', current: withNew }).breaches.length, 2);
  // 5 % tolerance + 0.05 ms absorbs measurement dust; a genuine regression clears it easily.
  const dust = { surfaces: { flight: { domNodes: 721, frameMeanMs: 1.22, frameP95Ms: 2.01, frameMaxMs: 3.01, frames: 5 }, chart: baseline.surfaces.chart } };
  assert.equal(judgeBudgets(baseline, { sourceDigest: 'digest-a', current: dust }).ok, true);
});

test('the aggregation keeps the worst frame sample and the worst DOM count per surface', () => {
  const aggregated = aggregateBudgetRows([
    { surface: 'flight', budget: { frameMs: { mean: 1, p95: 1.4, max: 2, n: 10 }, domNodes: 300 } },
    { surface: 'flight', budget: { frameMs: { mean: 1.8, p95: 2.4, max: 3.1, n: 10 }, domNodes: 220 } },
    { surface: 'chart', budget: { frameMs: { mean: 0.5, p95: 0.6, max: 0.9, n: 10 }, domNodes: 900 } },
    { surface: 'chart', budget: { frameMs: { mean: 0, p95: 0, max: 0, n: 0 }, domNodes: 12 } },
    { surface: 'chart', budget: null }, // a frame without a probe reading contributes nothing
  ]);
  assert.equal(aggregated.flight.frameMeanMs, 1.8, 'the worst mean wins, not the average');
  assert.equal(aggregated.flight.frameP95Ms, 2.4);
  assert.equal(aggregated.flight.frameMaxMs, 3.1);
  assert.equal(aggregated.flight.domNodes, 300);
  assert.equal(aggregated.chart.samples, 10, 'rows without probe readings are skipped');
});

test('a stale, headless, or empty baseline is red on its own integrity, before the numbers', () => {
  const stale = goodBaseline();
  stale.uiSourceDigest = 'digest-old';
  const staleVerdict = judgeBudgets(stale, { sourceDigest: 'digest-new' });
  assert.equal(staleVerdict.ok, false);
  assert.ok(staleVerdict.failures.some((f) => f.includes('stale')));

  const headless = goodBaseline();
  headless.headed = false;
  const headlessVerdict = judgeBudgets(headless, { sourceDigest: 'digest-a' });
  assert.equal(headlessVerdict.ok, false);
  assert.ok(headlessVerdict.failures.some((f) => f.includes('not-headed')));

  const empty = goodBaseline();
  empty.surfaces = {};
  assert.equal(judgeBudgets(empty, { sourceDigest: 'digest-a' }).ok, false);

  assert.equal(judgeBudgets(null, {}).ok, false);
  assert.equal(judgeBudgets({ schema: 'something.else' }, {}).ok, false);
});

test('the digest moves when UI source moves (the staleness contract bites)', () => {
  const digest = uiSourceDigest(ROOT);
  assert.ok(/^[0-9a-f]{64}$/.test(digest), 'the digest is a sha256 over the UI source');
  // The committed baseline (if present) must carry THIS digest — the check enforces it at runtime.
  const baselinePath = new URL('../test/ui-frame-references/budgets.json', import.meta.url);
  let baseline = null;
  try { baseline = JSON.parse(readFileSync(baselinePath, 'utf8')); } catch (_) {}
  if (baseline) {
    assert.equal(baseline.uiSourceDigest, digest,
      'the committed budget baseline is stale — re-shoot: capture:ui-matrix --budgets-out');
  }
});

test('the capture and the check cite the same thresholds file and schema', () => {
  const captureSource = readFileSync(new URL('../scripts/capture-ui-matrix.mjs', import.meta.url), 'utf8');
  const checkSource = readFileSync(new URL('../scripts/check-ui-budgets.mjs', import.meta.url), 'utf8');
  for (const source of [captureSource, checkSource]) {
    assert.match(source, /uiBudgets\.mjs/, 'both ends consume the shared budget module');
  }
  assert.match(checkSource, /ui-grammar-thresholds\.mjs/, 'the check cites the grammar thresholds file');
});
