// Public equivalence authority surface — verification helpers only.
// The sealer itself lives in _equivalenceSeal.js and is intentionally NOT re-exported here
// or from the lab barrel (P1). Fixed parent executors import the sealer from the private module.

export {
  isAuthoritativeEquivalenceResult,
  EQUIVALENCE_EXECUTOR_SOURCES,
} from './_equivalenceSeal.js';

/**
 * Pure evaluator helper: results from evaluateOracles with only sealed equivalence
 * still cannot promote unless the outer runner marks certifying. Exported for tests.
 */
export function isPromotableLabResult(result) {
  return !!(result
    && result.ok === true
    && result.exitClass === 0
    && result.nonPromoting !== true
    && result.certifying === true);
}
