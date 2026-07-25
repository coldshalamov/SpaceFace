// Equivalence comparison results are only valid when produced by fixed parent executors.
// Shape-based authentication is intentionally impossible: callers cannot forge the private seal.

/** Module-private seal — never exported. Only sealEquivalenceResult can attach it. */
const EQUIVALENCE_SEAL = Symbol('spaceface.lab.equivalenceSeal');

/** Allowed executor sources (fixed parent commands only). */
export const EQUIVALENCE_EXECUTOR_SOURCES = Object.freeze({
  REPEAT: 'repeat-executor',
  SAVE_LOAD: 'save-load-executor',
  DIFFERENTIAL: 'differential-executor',
});

const VALID_SOURCES = new Set(Object.values(EQUIVALENCE_EXECUTOR_SOURCES));

/**
 * Seal a comparison result produced by a fixed parent executor.
 * Only sealed results are accepted as green (or red) equivalence proof by the oracle engine.
 *
 * @param {object} result comparison payload { ok, expected, actual, ... }
 * @param {string} source one of EQUIVALENCE_EXECUTOR_SOURCES
 * @returns {object} frozen sealed result
 */
export function sealEquivalenceResult(result, source) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError('sealEquivalenceResult requires a plain comparison object');
  }
  if (!VALID_SOURCES.has(source)) {
    throw new TypeError(
      `sealEquivalenceResult: unknown executor source "${source}" — only fixed parent executors may seal`,
    );
  }
  const sealed = {
    ...result,
    source,
    [EQUIVALENCE_SEAL]: source,
  };
  return Object.freeze(sealed);
}

/**
 * True only when `pre` carries the private seal from a fixed parent executor.
 * Shape alone (ok/expected/actual) is never sufficient.
 *
 * @param {unknown} pre
 * @returns {boolean}
 */
export function isAuthoritativeEquivalenceResult(pre) {
  if (!pre || typeof pre !== 'object' || Array.isArray(pre)) return false;
  if (typeof pre.ok !== 'boolean') return false;
  const tag = pre[EQUIVALENCE_SEAL];
  if (tag == null || !VALID_SOURCES.has(tag)) return false;
  // Seal value must match the public source field when present.
  if (pre.source != null && pre.source !== tag) return false;
  return true;
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
