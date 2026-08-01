// Pure PERF-00 arbiter for disabled/enabled instrumentation captures.
//
// A single-frame callback median is useful context, but it cannot rule on a sub-percent budget
// when the clock quantum itself is larger than that budget. The matched-block total is the declared
// authority: accumulating adjacent randomized pairs makes the same clock fine enough to resolve the
// threshold without hiding the coarse diagnostic.

export const PERFORMANCE_INSTRUMENTATION_OVERHEAD_SCHEMA =
  'spaceface.performanceInstrumentationOverheadEvaluation.v1';

const DEFAULTS = Object.freeze({
  thresholdPct: 1,
  minMatchedPairs: 800,
  minMatchedBlocks: 20,
  minPairsPerBlock: 30,
  maxResolutionFractionOfBudget: 0.1,
});

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function integer(value) {
  return Number.isSafeInteger(Number(value)) ? Number(value) : null;
}

export function evaluatePerformanceInstrumentationOverhead(analysis = {}, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const failures = [];
  const thresholdPct = finite(config.thresholdPct);
  const minMatchedPairs = integer(config.minMatchedPairs);
  const minMatchedBlocks = integer(config.minMatchedBlocks);
  const minPairsPerBlock = integer(config.minPairsPerBlock);
  const maxResolutionFractionOfBudget = finite(config.maxResolutionFractionOfBudget);

  if (!(thresholdPct > 0)) failures.push('threshold-invalid');
  if (!(minMatchedPairs > 0)) failures.push('matched-pair-floor-invalid');
  if (!(minMatchedBlocks > 0)) failures.push('matched-block-floor-invalid');
  if (!(minPairsPerBlock > 0)) failures.push('block-pair-floor-invalid');
  if (!(maxResolutionFractionOfBudget > 0 && maxResolutionFractionOfBudget <= 1)) {
    failures.push('resolution-budget-fraction-invalid');
  }

  const matchedPairCount = integer(analysis.matchedPairCount);
  const matchedBlockCount = integer(analysis.matchedBlockCount);
  const matchedBlockPairCount = integer(analysis.matchedBlockPairCount);
  const matchedBlockMedianOverheadPct = finite(analysis.matchedBlockMedianOverheadPct);
  const callbackResolutionMs = finite(analysis.callbackResolutionMs);
  const disabledCallbackMedianMs = finite(analysis.disabledCallbackMedianMs);
  const medianRatioOverheadPct = finite(analysis.medianRatioOverheadPct);

  if (!(matchedPairCount >= minMatchedPairs)) failures.push('matched-pairs-insufficient');
  if (!(matchedBlockCount >= minMatchedBlocks)) failures.push('matched-blocks-insufficient');
  if (!(matchedBlockPairCount >= minPairsPerBlock)) failures.push('block-pairs-insufficient');
  if (!(callbackResolutionMs > 0)) failures.push('callback-resolution-unavailable');
  if (!(disabledCallbackMedianMs > 0)) failures.push('disabled-callback-median-invalid');
  if (matchedBlockMedianOverheadPct === null) failures.push('matched-block-median-invalid');

  const perFrameResolutionPct = callbackResolutionMs > 0 && disabledCallbackMedianMs > 0
    ? (callbackResolutionMs / disabledCallbackMedianMs) * 100
    : null;
  const blockResolutionPct = perFrameResolutionPct !== null && matchedBlockPairCount > 0
    ? perFrameResolutionPct / matchedBlockPairCount
    : null;
  const requiredResolutionPct = thresholdPct > 0 && maxResolutionFractionOfBudget > 0
    ? thresholdPct * maxResolutionFractionOfBudget
    : null;
  const blockResolutionCapable = blockResolutionPct !== null
    && requiredResolutionPct !== null
    && blockResolutionPct <= requiredResolutionPct;
  const perFrameResolutionCapable = perFrameResolutionPct !== null
    && thresholdPct > 0
    && perFrameResolutionPct <= thresholdPct;

  if (!blockResolutionCapable) failures.push('matched-block-resolution-insufficient');
  if (matchedBlockMedianOverheadPct !== null
    && thresholdPct > 0
    && matchedBlockMedianOverheadPct >= thresholdPct) {
    failures.push('matched-block-median-over-budget');
  }

  return {
    schema: PERFORMANCE_INSTRUMENTATION_OVERHEAD_SCHEMA,
    pass: failures.length === 0,
    failures,
    budget: {
      thresholdPct,
      minMatchedPairs,
      minMatchedBlocks,
      minPairsPerBlock,
      maxResolutionFractionOfBudget,
    },
    authority: {
      metric: 'matched-block-median-overhead-pct',
      valuePct: matchedBlockMedianOverheadPct,
      pass: matchedBlockMedianOverheadPct !== null
        && thresholdPct > 0
        && matchedBlockMedianOverheadPct < thresholdPct,
      matchedPairCount,
      matchedBlockCount,
      matchedBlockPairCount,
      callbackResolutionMs,
      blockResolutionPct,
      requiredResolutionPct,
      resolutionCapable: blockResolutionCapable,
    },
    diagnostics: {
      medianRatioOverheadPct,
      perFrameResolutionPct,
      perFrameResolutionCapable,
      note: perFrameResolutionCapable
        ? 'single-frame callback medians are resolution-capable contextual evidence'
        : 'single-frame callback medians are retained but cannot arbitrate the sub-percent budget at this clock quantum',
    },
  };
}
