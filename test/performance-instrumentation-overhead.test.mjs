import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluatePerformanceInstrumentationOverhead,
} from '../scripts/lib/performanceInstrumentationOverhead.mjs';

const CURRENT_CAPTURE = Object.freeze({
  matchedPairCount: 1111,
  matchedBlockCount: 37,
  matchedBlockPairCount: 30,
  matchedBlockMedianOverheadPct: 0.6993007274770519,
  callbackResolutionMs: 0.1,
  disabledCallbackMedianMs: 6.3,
  medianRatioOverheadPct: 1.5873010166347952,
});

test('resolution-capable matched blocks rule while the coarse per-frame median remains disclosed', () => {
  const result = evaluatePerformanceInstrumentationOverhead(CURRENT_CAPTURE);

  assert.equal(result.pass, true);
  assert.equal(result.authority.metric, 'matched-block-median-overhead-pct');
  assert.equal(result.authority.valuePct, 0.6993007274770519);
  assert.equal(result.authority.resolutionCapable, true);
  assert.equal(result.diagnostics.medianRatioOverheadPct, 1.5873010166347952);
  assert.equal(result.diagnostics.perFrameResolutionCapable, false);
  assert.match(result.diagnostics.note, /cannot arbitrate/);
});

test('a resolution-capable matched-block median at or above one percent fails', () => {
  const result = evaluatePerformanceInstrumentationOverhead({
    ...CURRENT_CAPTURE,
    matchedBlockMedianOverheadPct: 1,
  });

  assert.equal(result.pass, false);
  assert.deepEqual(result.failures, ['matched-block-median-over-budget']);
});

test('too few pairs or blocks cannot publish a passing overhead verdict', () => {
  const result = evaluatePerformanceInstrumentationOverhead({
    ...CURRENT_CAPTURE,
    matchedPairCount: 799,
    matchedBlockCount: 19,
  });

  assert.equal(result.pass, false);
  assert.ok(result.failures.includes('matched-pairs-insufficient'));
  assert.ok(result.failures.includes('matched-blocks-insufficient'));
});

test('a clock that remains too coarse after blocking fails closed', () => {
  const result = evaluatePerformanceInstrumentationOverhead({
    ...CURRENT_CAPTURE,
    callbackResolutionMs: 1,
  });

  assert.equal(result.pass, false);
  assert.ok(result.failures.includes('matched-block-resolution-insufficient'));
});

test('malformed analysis cannot pass', () => {
  const result = evaluatePerformanceInstrumentationOverhead({
    matchedPairCount: null,
    matchedBlockCount: null,
    matchedBlockPairCount: null,
    matchedBlockMedianOverheadPct: null,
    callbackResolutionMs: null,
    disabledCallbackMedianMs: null,
  });

  assert.equal(result.pass, false);
  assert.ok(result.failures.includes('matched-pairs-insufficient'));
  assert.ok(result.failures.includes('callback-resolution-unavailable'));
  assert.ok(result.failures.includes('matched-block-median-invalid'));
});
