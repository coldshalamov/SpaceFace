// Equivalence claim ownership — each fixed parent executor certifies only its own claims.
// Foreign / unsupported declared equivalences → incomplete (never silent-pass or certify).

import { EQUIVALENCE_EXECUTOR_SOURCES } from './equivalenceSources.js';

/** Claims owned by `repeatScenario` (run == run). */
export const REPEAT_OWNED_EQUIVALENCES = Object.freeze(new Set([
  'run-eq-repeat',
  'run-eq-run',
  'repeat',
]));

/** Claims owned by `compareSaveLoad` (uninterrupted vs mid-run save/load). */
export const SAVE_LOAD_OWNED_EQUIVALENCES = Object.freeze(new Set([
  'uninterrupted-eq-save-load',
  'save-load-eq-uninterrupted',
  'save-load',
  'uninterrupted-eq-saveload',
]));

/** Claims owned by `runDifferentialReplay` (Node vs Chromium). */
export const DIFFERENTIAL_OWNED_EQUIVALENCES = Object.freeze(new Set([
  'node-eq-chromium',
  'browser-parity',
  'node-eq-browser',
]));

/**
 * @param {'repeat'|'save-load'|'differential'} executor
 * @param {string} equivalenceId
 * @returns {boolean}
 */
export function executorOwnsEquivalence(executor, equivalenceId) {
  if (!equivalenceId) return false;
  if (executor === 'repeat') return REPEAT_OWNED_EQUIVALENCES.has(equivalenceId);
  if (executor === 'save-load') return SAVE_LOAD_OWNED_EQUIVALENCES.has(equivalenceId);
  if (executor === 'differential') return DIFFERENTIAL_OWNED_EQUIVALENCES.has(equivalenceId);
  return false;
}

/**
 * Diagnostic / authority executor source tag expected for a claim id.
 * @param {string} equivalenceId
 * @returns {string|null}
 */
export function expectedExecutorSourceForEquivalence(equivalenceId) {
  if (REPEAT_OWNED_EQUIVALENCES.has(equivalenceId)) return EQUIVALENCE_EXECUTOR_SOURCES.REPEAT;
  if (SAVE_LOAD_OWNED_EQUIVALENCES.has(equivalenceId)) return EQUIVALENCE_EXECUTOR_SOURCES.SAVE_LOAD;
  if (DIFFERENTIAL_OWNED_EQUIVALENCES.has(equivalenceId)) return EQUIVALENCE_EXECUTOR_SOURCES.DIFFERENTIAL;
  return null;
}

/**
 * Collect unique equivalence names declared by the scenario (order preserved).
 * @param {object} scenarioDoc
 * @param {{ defaultIfEmpty?: string|null }} [options]
 * @returns {string[]}
 */
export function collectDeclaredEquivalences(scenarioDoc, options = {}) {
  const out = [];
  const seen = new Set();
  const assertions = Array.isArray(scenarioDoc?.assertions) ? scenarioDoc.assertions : [];
  for (const a of assertions) {
    if (!a || (a.kind !== 'equivalence' && !a.equivalence)) continue;
    const name = a.equivalence || a.expected || a.signal || 'run-eq-repeat';
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  if (out.length === 0 && options.defaultIfEmpty) {
    out.push(options.defaultIfEmpty);
  }
  return out;
}

/**
 * @param {'repeat'|'save-load'|'differential'} executor
 * @param {string[]} declared
 * @returns {string[]}
 */
export function foreignEquivalencesFor(executor, declared) {
  const list = Array.isArray(declared) ? declared : [];
  return list.filter((name) => !executorOwnsEquivalence(executor, name));
}
