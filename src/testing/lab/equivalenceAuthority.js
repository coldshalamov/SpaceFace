// Public equivalence authority surface — verification helpers only.
// Sealing is module-private inside fixed parent executors (repeat / saveLoadCompare).
// Authority is WeakMap object identity bound to {scenarioDigest, equivalenceId, executor}
// — not a forgeable Symbol property (spread cannot mint) and not a bearer token.

import { isEquivalenceSealedByRepeat, getRepeatSealBinding } from './repeat.js';
import { isEquivalenceSealedBySaveLoad, getSaveLoadSealBinding } from './saveLoadCompare.js';
import { expectedExecutorSourceForEquivalence } from './equivalenceOwnership.js';

export { EQUIVALENCE_EXECUTOR_SOURCES } from './equivalenceSources.js';
export {
  collectDeclaredEquivalences,
  executorOwnsEquivalence,
  foreignEquivalencesFor,
  expectedExecutorSourceForEquivalence,
  REPEAT_OWNED_EQUIVALENCES,
  SAVE_LOAD_OWNED_EQUIVALENCES,
  DIFFERENTIAL_OWNED_EQUIVALENCES,
} from './equivalenceOwnership.js';

/**
 * Binding context stored when a parent sealed `pre`, or null if not sealed.
 * @param {unknown} pre
 * @returns {{ scenarioDigest: string|null, equivalenceId: string, executor: string }|null}
 */
export function getEquivalenceSealBinding(pre) {
  return getRepeatSealBinding(pre) || getSaveLoadSealBinding(pre) || null;
}

/**
 * True only when `pre` is the exact object reference sealed by a fixed parent executor.
 * Shape alone (ok/expected/actual) is never sufficient. Spreading a sealed result creates
 * a new object that is NOT in the executor WeakMap → rejected.
 *
 * When `expected` is provided, also requires the WeakMap binding to match
 * scenarioDigest / equivalenceId / executor (R1 claim binding — not a bearer token).
 *
 * @param {unknown} pre
 * @param {{ scenarioDigest?: string|null, equivalenceId?: string, executor?: string }|null} [expected]
 * @returns {boolean}
 */
export function isAuthoritativeEquivalenceResult(pre, expected = null) {
  if (!pre || typeof pre !== 'object' || Array.isArray(pre)) return false;
  if (typeof pre.ok !== 'boolean') return false;
  return isEquivalenceSealedByRepeat(pre, expected) || isEquivalenceSealedBySaveLoad(pre, expected);
}

/**
 * Build the expected binding context for oracle evaluation of a named claim.
 * @param {string} equivalenceId
 * @param {{ scenarioDigest?: string|null }} [options]
 */
export function expectedSealContextForClaim(equivalenceId, options = {}) {
  return {
    equivalenceId,
    scenarioDigest: options.scenarioDigest ?? null,
    executor: expectedExecutorSourceForEquivalence(equivalenceId),
  };
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
