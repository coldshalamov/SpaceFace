// Internal seal module — NOT re-exported from the lab barrel or equivalenceAuthority.
// Fixed parent executors (repeat / saveLoad / differential) are the only supported importers.
// Callers must not import this file to mint sealed equivalence proof.

/** Module-private seal symbol — never exported. */
const EQUIVALENCE_SEAL = Symbol('spaceface.lab.equivalenceSeal');

/** Allowed executor sources (fixed parent commands only). */
export const EQUIVALENCE_EXECUTOR_SOURCES = Object.freeze({
  REPEAT: 'repeat-executor',
  SAVE_LOAD: 'save-load-executor',
  DIFFERENTIAL: 'differential-executor',
});

const VALID_SOURCES = new Set(Object.values(EQUIVALENCE_EXECUTOR_SOURCES));

/**
 * Attach the private seal. Only fixed parent executors should call this.
 * Not exported from the public lab surface (barrel / equivalenceAuthority).
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
  if (pre.source != null && pre.source !== tag) return false;
  return true;
}
