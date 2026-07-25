// Public equivalence authority surface — verification helpers only.
// Sealing is module-private inside fixed parent executors (repeat / saveLoadCompare).
// Authority is WeakSet object identity — not a forgeable Symbol property (spread cannot mint).

import { isEquivalenceSealedByRepeat } from './repeat.js';
import { isEquivalenceSealedBySaveLoad } from './saveLoadCompare.js';

export { EQUIVALENCE_EXECUTOR_SOURCES } from './equivalenceSources.js';

/**
 * True only when `pre` is the exact object reference sealed by a fixed parent executor.
 * Shape alone (ok/expected/actual) is never sufficient. Spreading a sealed result creates
 * a new object that is NOT in the executor WeakSet → rejected.
 *
 * @param {unknown} pre
 * @returns {boolean}
 */
export function isAuthoritativeEquivalenceResult(pre) {
  if (!pre || typeof pre !== 'object' || Array.isArray(pre)) return false;
  if (typeof pre.ok !== 'boolean') return false;
  return isEquivalenceSealedByRepeat(pre) || isEquivalenceSealedBySaveLoad(pre);
}

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
