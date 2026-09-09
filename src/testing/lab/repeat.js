// Repeat: prove run==run (identical deterministic-covered + trace hashes).
// G4: evaluate ALL equivalences the scenario declares — never silently pass unsupported ones.
// R2: this parent OWNS only run-eq-repeat (and aliases). Foreign claims → incomplete.
// O2/P1/Q1/R1: sealing is module-private WeakMap identity bound to
// {scenarioDigest, equivalenceId, executor} — not a bearer token or mint API.
// Q3: every arm must pass its oracle before equivalence can be ok:true (parity of failures is not a pass).

import { runLabScenarioInternal } from './runScenario.js';
import { EQUIVALENCE_EXECUTOR_SOURCES } from './equivalenceSources.js';
import {
  REPEAT_OWNED_EQUIVALENCES,
  collectDeclaredEquivalences,
  foreignEquivalencesFor,
} from './equivalenceOwnership.js';

/** Module-private registry: sealed object → binding context. Spread does not transfer membership. */
const sealedByRepeat = new WeakMap();

/**
 * Seal a comparison payload under the repeat executor with claim+scenario binding.
 * Not exported — only this module can mint authority.
 * @param {object} result
 * @param {{ scenarioDigest?: string|null, equivalenceId: string }} binding
 * @returns {object} frozen sealed result
 */
function sealEquivalenceResult(result, binding) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError('sealEquivalenceResult requires a plain comparison object');
  }
  if (!binding || typeof binding.equivalenceId !== 'string' || !binding.equivalenceId) {
    throw new TypeError('sealEquivalenceResult requires binding.equivalenceId');
  }
  const sealed = Object.freeze({
    ...result,
    source: EQUIVALENCE_EXECUTOR_SOURCES.REPEAT,
  });
  sealedByRepeat.set(sealed, Object.freeze({
    scenarioDigest: binding.scenarioDigest ?? null,
    equivalenceId: binding.equivalenceId,
    executor: EQUIVALENCE_EXECUTOR_SOURCES.REPEAT,
  }));
  return sealed;
}

/**
 * Membership / binding check for oracle authority. Not a mint API.
 * @param {unknown} pre
 * @param {{ scenarioDigest?: string|null, equivalenceId?: string, executor?: string }|null} [expected]
 * @returns {boolean}
 */
export function isEquivalenceSealedByRepeat(pre, expected = null) {
  if (!pre || typeof pre !== 'object' || Array.isArray(pre)) return false;
  if (!sealedByRepeat.has(pre)) return false;
  if (!expected) return true;
  const b = sealedByRepeat.get(pre);
  if (expected.equivalenceId != null && b.equivalenceId !== expected.equivalenceId) return false;
  if (expected.executor != null && b.executor !== expected.executor) return false;
  if (expected.scenarioDigest != null && b.scenarioDigest !== expected.scenarioDigest) return false;
  return true;
}

/**
 * @param {unknown} pre
 * @returns {{ scenarioDigest: string|null, equivalenceId: string, executor: string }|null}
 */
export function getRepeatSealBinding(pre) {
  if (!pre || typeof pre !== 'object' || Array.isArray(pre)) return null;
  return sealedByRepeat.get(pre) || null;
}

export { collectDeclaredEquivalences, REPEAT_OWNED_EQUIVALENCES };

/**
 * Run the same scenario twice and compare authoritative checkpoints.
 * Only certifies run-eq-repeat (and aliases). Foreign declared claims → incomplete.
 * @param {object} scenarioDoc
 * @param {object} [options]
 */
export async function repeatScenario(scenarioDoc, options = {}) {
  // CLI convenience: when no equivalence is declared, default to the owned claim.
  const declared = collectDeclaredEquivalences(scenarioDoc, { defaultIfEmpty: 'run-eq-repeat' });
  const foreign = foreignEquivalencesFor('repeat', declared);
  const equivalence = {};
  let allOk = true;
  let exitClass = 0;
  let status = 'pass';
  let primary = null;
  let results;
  let mismatches = [];
  let runs = Number.isInteger(options.runs) && options.runs > 1 ? options.runs : 2;
  let traceHash = null;
  let deterministicHash = null;
  let semanticHash = null;
  let scenarioDigest = null;

  // R2: foreign claims cannot be certified by this executor — incomplete, do not run them as owned.
  for (const name of foreign) {
    equivalence[name] = sealEquivalenceResult({
      ok: false,
      incomplete: true,
      expected: true,
      actual: 'unsupported',
      reason: `unsupported equivalence for this executor — repeatScenario does not own "${name}"`,
    }, {
      scenarioDigest: null,
      equivalenceId: name,
    });
    allOk = false;
    exitClass = Math.max(exitClass, 4);
    status = 'incomplete';
  }

  // If ANY foreign claim was declared, do not certify owned claims either — whole parent is incomplete.
  // Still evaluate owned claims for diagnostics when mixed, but refuse green certifying pass.
  const owned = declared.filter((n) => REPEAT_OWNED_EQUIVALENCES.has(n));

  for (const name of owned) {
    const repeat = await evaluateRunEqRepeat(scenarioDoc, options, { equivalenceId: name });
    equivalence[name] = repeat.equivalenceEntry;
    primary = repeat.primary;
    results = repeat.results;
    mismatches = repeat.mismatches;
    runs = repeat.runs;
    traceHash = repeat.traceHash;
    deterministicHash = repeat.deterministicHash;
    semanticHash = repeat.semanticHash;
    scenarioDigest = repeat.scenarioDigest ?? scenarioDigest;
    if (!repeat.ok) {
      allOk = false;
      exitClass = Math.max(exitClass, repeat.exitClass || 5);
      if (status === 'pass') status = repeat.status || 'nondeterminism';
    }
  }

  // Declared nothing owned and no default path hit (shouldn't happen with defaultIfEmpty) —
  // still refuse green if foreign-only.
  if (owned.length === 0 && foreign.length > 0) {
    allOk = false;
    exitClass = Math.max(exitClass, 4);
    status = 'incomplete';
  }

  // Mixed foreign + owned: never certify.
  if (foreign.length > 0) {
    allOk = false;
    exitClass = Math.max(exitClass, 4);
    status = 'incomplete';
  }

  return {
    schema: 'spaceface.labRepeatResult.v1',
    ok: allOk,
    exitClass: allOk ? 0 : (exitClass || 5),
    status: allOk ? 'pass' : status,
    certifying: foreign.length === 0,
    nonPromoting: false,
    runs,
    declaredEquivalences: declared,
    foreignEquivalences: foreign.length ? foreign : undefined,
    scenarioDigest,
    traceHash,
    deterministicHash,
    semanticHash,
    mismatches,
    equivalence,
    primary,
    results: options.verbosity >= 2 ? results : undefined,
  };
}

async function evaluateRunEqRepeat(scenarioDoc, options = {}, binding = {}) {
  const equivalenceId = binding.equivalenceId || 'run-eq-repeat';
  const runs = Number.isInteger(options.runs) && options.runs > 1 ? options.runs : 2;
  const results = [];
  for (let i = 0; i < runs; i++) {
    // O1/O3: child arms use internal non-certifying path; parent seals the equivalence.
    // Strip any caller-injected systems/equivalence/controller from parent options for arms.
    const r = await runLabScenarioInternal(scenarioDoc, {
      file: options.file,
      verbosity: options.verbosity,
      observerEnabled: options.observerEnabled,
      runId: options.runId ? `${options.runId}_r${i}` : undefined,
      // Parent-owned multi-run — arms defer equivalence consumption for owned claims only.
      skipMultiRunEquivalence: true,
      childArm: true,
    });
    results.push(r);
  }

  const first = results[0];
  const scenarioDigest = first?.scenarioDigest ?? null;
  const sealBind = { scenarioDigest, equivalenceId };

  if (!first || first.exitClass === 4 || first.exitClass === 3) {
    return {
      ok: false,
      exitClass: first ? first.exitClass : 3,
      status: first ? first.status : 'infra',
      runs,
      primary: first,
      results,
      mismatches: [],
      scenarioDigest,
      traceHash: first?.traceHash ?? null,
      deterministicHash: null,
      semanticHash: null,
      equivalenceEntry: sealEquivalenceResult(
        { ok: false, expected: true, actual: false, reason: 'primary-run-failed' },
        sealBind,
      ),
    };
  }

  let allMatch = true;
  const mismatches = [];
  for (let i = 1; i < results.length; i++) {
    const r = results[i];
    if (r.traceHash !== first.traceHash) {
      allMatch = false;
      mismatches.push({ run: i, field: 'traceHash', a: first.traceHash, b: r.traceHash });
    }
    const h0 = first.checkpoints && first.checkpoints.final && first.checkpoints.final.deterministicCovered
      && first.checkpoints.final.deterministicCovered.hash;
    const h1 = r.checkpoints && r.checkpoints.final && r.checkpoints.final.deterministicCovered
      && r.checkpoints.final.deterministicCovered.hash;
    if (h0 !== h1) {
      allMatch = false;
      mismatches.push({ run: i, field: 'deterministicCovered.hash', a: h0, b: h1 });
    }
    const s0 = first.checkpoints && first.checkpoints.final && first.checkpoints.final.semantic
      && first.checkpoints.final.semantic.hash;
    const s1 = r.checkpoints && r.checkpoints.final && r.checkpoints.final.semantic
      && r.checkpoints.final.semantic.hash;
    if (s0 !== s1) {
      allMatch = false;
      mismatches.push({ run: i, field: 'semantic.hash', a: s0, b: s1 });
    }
  }

  // Q3: every arm must individually pass its oracle. Matching hashes of two failures is not a pass.
  const failedArms = [];
  for (let i = 0; i < results.length; i++) {
    if (!results[i] || results[i].ok !== true) failedArms.push(i);
  }
  const allArmsOk = failedArms.length === 0;
  const ok = allMatch && allArmsOk;

  let status;
  let exitClass;
  if (!allArmsOk) {
    status = 'arm-oracle-fail';
    exitClass = 1;
  } else if (!allMatch) {
    status = 'nondeterminism';
    exitClass = 5;
  } else {
    status = 'pass';
    exitClass = 0;
  }

  return {
    ok,
    exitClass,
    status,
    runs,
    primary: first,
    results,
    mismatches,
    failedArms: allArmsOk ? undefined : failedArms,
    scenarioDigest,
    traceHash: first.traceHash,
    deterministicHash: first.checkpoints && first.checkpoints.final
      && first.checkpoints.final.deterministicCovered
      && first.checkpoints.final.deterministicCovered.hash,
    semanticHash: first.checkpoints && first.checkpoints.final
      && first.checkpoints.final.semantic
      && first.checkpoints.final.semantic.hash,
    equivalenceEntry: sealEquivalenceResult({
      ok,
      expected: true,
      actual: ok,
      runs,
      mismatches,
      allArmsOk,
      failedArms: allArmsOk ? undefined : failedArms,
      reason: !allArmsOk
        ? `oracle failed on arm(s): ${failedArms.join(', ')} — parity of failures is not a pass`
        : (!allMatch ? 'nondeterminism' : undefined),
    }, sealBind),
  };
}
