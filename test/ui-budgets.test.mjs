// PQ-184.00 — the budget baseline's judge, honestly red. The grammar owns the thresholds
// (scripts/ui-grammar-thresholds.mjs); these tests prove the scoped UI-owner measurement rejects
// the old whole-rAF schema, a row at exactly the budget passes, a row over it fails, aggregation
// takes the WORST owner sample per surface, and stale/headless/empty baselines are red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  UI_AUXILIARY_RAF_SCOPE,
  UI_BUDGETS_SCHEMA,
  UI_BUDGET_MEASUREMENT_SCOPE,
  UI_DOM_LAYOUT_SCOPE,
  UI_FRAME_TOTAL_SCOPE,
  UI_KNOWN_RAF_SCOPE,
  aggregateBudgetRows,
  isUiBudgetSample,
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
    uiOwnerMeanMs: 1,
    uiOwnerP95Ms: 1.4,
    uiOwnerMaxMs: 2,
    knownUiRafMeanMs: 0,
    knownUiRafP95Ms: 0,
    knownUiRafMaxMs: 0,
    unbucketedUiRafMeanMs: 0,
    unbucketedUiRafP95Ms: 0,
    unbucketedUiRafMaxMs: 0,
    frameTotalMeanMs: 7,
    frameTotalP95Ms: 12,
    frameTotalMaxMs: 24,
    auxiliaryRafMeanMs: 0,
    auxiliaryRafP95Ms: 0,
    auxiliaryRafMaxMs: 0,
    samples: 40,
    uiOwnerSamples: 40,
    knownUiRafSamples: 40,
    unbucketedUiRafSamples: 0,
    frameTotalSamples: 40,
    auxiliaryRafSamples: 0,
  };
}

function goodBaseline() {
  return {
    schema: UI_BUDGETS_SCHEMA,
    measurementScope: UI_BUDGET_MEASUREMENT_SCOPE,
    frameTotalScope: UI_FRAME_TOTAL_SCOPE,
    knownUiRafScope: UI_KNOWN_RAF_SCOPE,
    auxiliaryRafScope: UI_AUXILIARY_RAF_SCOPE,
    domLayoutScope: UI_DOM_LAYOUT_SCOPE,
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
    measurementScope: UI_BUDGET_MEASUREMENT_SCOPE,
    frameTotalScope: UI_FRAME_TOTAL_SCOPE,
    knownUiRafScope: UI_KNOWN_RAF_SCOPE,
    auxiliaryRafScope: UI_AUXILIARY_RAF_SCOPE,
    domLayoutScope: UI_DOM_LAYOUT_SCOPE,
    headed: true,
    uiSourceDigest: 'digest-a',
    surfaces: {
      flight: {
        ...baselineRow(), domNodes: 720, frameMeanMs: 1.2, frameP95Ms: 2, frameMaxMs: 3,
      },
      chart: {
        ...baselineRow(), domNodes: 350, frameMeanMs: 10, frameP95Ms: 18, frameMaxMs: 28,
      },
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
  const budget = (uiMean, uiP95, uiMax, domNodes, totalMean = 3, auxMean = 0.2) => ({
    measurementScope: UI_BUDGET_MEASUREMENT_SCOPE,
    frameTotalScope: UI_FRAME_TOTAL_SCOPE,
    knownUiRafScope: UI_KNOWN_RAF_SCOPE,
    auxiliaryRafScope: UI_AUXILIARY_RAF_SCOPE,
    domLayoutScope: UI_DOM_LAYOUT_SCOPE,
    uiFrameMs: { mean: uiMean, p95: uiP95, max: uiMax, n: 10 },
    uiOwnerMs: { mean: uiMean, p95: uiP95, max: uiMax, n: 10 },
    knownUiRafMs: { mean: 0, p95: 0, max: 0, n: 10 },
    frameTotalMs: { mean: totalMean, p95: totalMean + 0.5, max: totalMean + 1, n: 10 },
    auxiliaryRafMs: { mean: auxMean, p95: auxMean + 0.1, max: auxMean + 0.2, n: auxMean ? 4 : 0 },
    unbucketedUiRafMs: { mean: 0, p95: 0, max: 0, n: 0 },
    domNodes,
  });
  const aggregated = aggregateBudgetRows([
    { surface: 'flight', budget: budget(1, 1.4, 2, 300) },
    { surface: 'flight', budget: budget(1.8, 2.4, 3.1, 220, 4) },
    { surface: 'chart', budget: budget(0.5, 0.6, 0.9, 900) },
    { surface: 'chart', budget: { ...budget(0, 0, 0, 12), uiFrameMs: { mean: 0, p95: 0, max: 0, n: 0 } } },
    { surface: 'chart', budget: null }, // a frame without a probe reading contributes nothing
  ]);
  assert.equal(aggregated.flight.frameMeanMs, 1.8, 'the worst mean wins, not the average');
  assert.equal(aggregated.flight.frameP95Ms, 2.4);
  assert.equal(aggregated.flight.frameMaxMs, 3.1);
  assert.equal(aggregated.flight.domNodes, 300);
  assert.equal(aggregated.chart.samples, 10, 'rows without probe readings are skipped');
  assert.equal(aggregated.flight.frameTotalMeanMs, 4);
  assert.equal(aggregated.flight.auxiliaryRafMeanMs, 0.2);
  assert.equal(aggregated.flight.uiOwnerMeanMs, 1.8);
  assert.equal(aggregated.flight.knownUiRafMeanMs, 0);
});

test('old whole-rAF data and wrong scope tags cannot become UI budget rows', () => {
  const valid = {
    surface: 'valid',
    budget: {
      measurementScope: UI_BUDGET_MEASUREMENT_SCOPE,
      frameTotalScope: UI_FRAME_TOTAL_SCOPE,
      knownUiRafScope: UI_KNOWN_RAF_SCOPE,
      auxiliaryRafScope: UI_AUXILIARY_RAF_SCOPE,
      domLayoutScope: UI_DOM_LAYOUT_SCOPE,
      uiFrameMs: { mean: 1, p95: 1.2, max: 2, n: 10 },
      uiOwnerMs: { mean: 1, p95: 1.2, max: 2, n: 10 },
      knownUiRafMs: { mean: 0, p95: 0, max: 0, n: 10 },
      frameTotalMs: { mean: 4, p95: 5, max: 7, n: 10 },
      auxiliaryRafMs: { mean: 0, p95: 0, max: 0, n: 0 },
      unbucketedUiRafMs: { mean: 0, p95: 0, max: 0, n: 0 },
      domNodes: 12,
    },
  };
  const old = {
    surface: 'old',
    budget: { frameMs: { mean: 1, p95: 1, max: 1, n: 10 }, domNodes: 12 },
  };
  const wrong = {
    ...valid,
    surface: 'wrong',
    budget: { ...valid.budget, measurementScope: UI_FRAME_TOTAL_SCOPE },
  };
  const wrongDomScope = {
    ...valid,
    surface: 'wrong-dom-scope',
    budget: { ...valid.budget, domLayoutScope: UI_BUDGET_MEASUREMENT_SCOPE },
  };
  assert.equal(isUiBudgetSample(valid), true);
  assert.equal(isUiBudgetSample(old), false);
  assert.equal(isUiBudgetSample(wrong), false);
  assert.equal(isUiBudgetSample(wrongDomScope), false);
  assert.deepEqual(Object.keys(aggregateBudgetRows([old, wrong, wrongDomScope, valid])), ['valid']);

  const unbucketed = {
    ...valid,
    surface: 'unbucketed',
    budget: {
      ...valid.budget,
      unbucketedUiRafMs: { mean: 0.4, p95: 0.4, max: 0.4, n: 1 },
    },
  };
  assert.equal(isUiBudgetSample(unbucketed), false);
});

test('the v1 baseline and mismatched scope tags are red before any UI number is read', () => {
  const old = goodBaseline();
  old.schema = 'spaceface.ui-budget-baseline.v1';
  const oldVerdict = judgeBudgets(old, { sourceDigest: 'digest-a' });
  assert.equal(oldVerdict.ok, false);
  assert.match(oldVerdict.failures[0], /spaceface\.ui-budget-baseline\.v2/);

  const wrongScope = goodBaseline();
  wrongScope.measurementScope = UI_FRAME_TOTAL_SCOPE;
  const wrongVerdict = judgeBudgets(wrongScope, { sourceDigest: 'digest-a' });
  assert.equal(wrongVerdict.ok, false);
  assert.ok(wrongVerdict.failures.some((failure) => failure.includes('measurementScope')));
});

test('persisted rows need present-frame samples and zero unbucketed UI callbacks', () => {
  const empty = goodBaseline();
  empty.surfaces.flight.samples = 0;
  const emptyVerdict = judgeBudgets(empty, { sourceDigest: 'digest-a' });
  assert.equal(emptyVerdict.ok, false);
  assert.ok(emptyVerdict.failures.some((failure) => failure.includes('flight requires positive samples')));

  const unbucketed = goodBaseline();
  unbucketed.surfaces.chart.unbucketedUiRafSamples = 2;
  const unbucketedVerdict = judgeBudgets(unbucketed, { sourceDigest: 'digest-a' });
  assert.equal(unbucketedVerdict.ok, false);
  assert.ok(unbucketedVerdict.failures.some((failure) => failure.includes('chart has 2 unbucketed UI rAF')));
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
  if (baseline && baseline.schema === UI_BUDGETS_SCHEMA) {
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
  assert.match(captureSource, /installUiOwner/, 'capture attaches to the public UI owner after boot');
  assert.match(captureSource, /uiFrameMs/, 'capture records the scoped UI-owner sample');
  assert.match(captureSource, /classifyCallback/, 'capture admits only callbacks with authored callsite evidence');
  assert.match(captureSource, /frameBuckets/, 'capture joins known UI callbacks by presentation timestamp');
  assert.match(captureSource, /knownUiRafMs/, 'capture exposes the admitted authored UI callback cost');
  assert.match(captureSource, /frameTotalMs/, 'capture keeps game-frame timing separate');
  assert.match(captureSource, /auxiliaryRafMs/, 'capture reports out-of-band rAF timing separately');
  assert.doesNotMatch(captureSource, /(?:window\.SF|\bsf)\.ctx\b/, 'capture uses the live SF public API');
  assert.doesNotMatch(captureSource, /measured: 'whole rAF frame callback/, 'the budget label is no longer the old whole-rAF claim');
});
