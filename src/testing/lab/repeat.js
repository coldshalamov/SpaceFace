// Repeat: prove run==run (identical deterministic-covered + trace hashes).
// G4: evaluate ALL equivalences the scenario declares — never silently pass unsupported ones.
// O2/P1/Q1: sealing is module-private (WeakSet identity) — not an importable mint API.
// Q3: every arm must pass its oracle before equivalence can be ok:true (parity of failures is not a pass).

import { runLabScenarioInternal } from './runScenario.js';
import { compareSaveLoad, isEquivalenceSealedBySaveLoad } from './saveLoadCompare.js';
import { EQUIVALENCE_EXECUTOR_SOURCES } from './equivalenceSources.js';

const RUN_EQ_NAMES = new Set(['run-eq-repeat', 'run-eq-run', 'repeat']);
const SAVE_LOAD_EQ_NAMES = new Set([
  'uninterrupted-eq-save-load',
  'save-load',
  'uninterrupted-eq-saveload',
]);

/** Module-private registry of objects sealed by this executor. Spread does not transfer membership. */
const sealedByRepeat = new WeakSet();

/**
 * Seal a comparison payload under the repeat executor.
 * Not exported — only this module can mint authority.
 * @param {object} result
 * @returns {object} frozen sealed result
 */
function sealEquivalenceResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError('sealEquivalenceResult requires a plain comparison object');
  }
  const sealed = Object.freeze({
    ...result,
    source: EQUIVALENCE_EXECUTOR_SOURCES.REPEAT,
  });
  sealedByRepeat.add(sealed);
  return sealed;
}

/**
 * Membership check for oracle authority. Not a mint API.
 * @param {unknown} pre
 * @returns {boolean}
 */
export function isEquivalenceSealedByRepeat(pre) {
  return !!pre && typeof pre === 'object' && !Array.isArray(pre) && sealedByRepeat.has(pre);
}

/**
 * Collect unique equivalence names declared by the scenario (order preserved).
 * When none are declared, default to run-eq-repeat for CLI `lab repeat` convenience.
 * @param {object} scenarioDoc
 * @returns {string[]}
 */
export function collectDeclaredEquivalences(scenarioDoc) {
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
  if (out.length === 0) out.push('run-eq-repeat');
  return out;
}

/**
 * Run the same scenario twice and compare authoritative checkpoints.
 * Also dispatches other declared equivalences (e.g. save/load) so they cannot silent-pass.
 * @param {object} scenarioDoc
 * @param {object} [options]
 */
export async function repeatScenario(scenarioDoc, options = {}) {
  const declared = collectDeclaredEquivalences(scenarioDoc);
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

  for (const name of declared) {
    if (RUN_EQ_NAMES.has(name)) {
      const repeat = await evaluateRunEqRepeat(scenarioDoc, options);
      equivalence[name] = repeat.equivalenceEntry;
      primary = repeat.primary;
      results = repeat.results;
      mismatches = repeat.mismatches;
      runs = repeat.runs;
      traceHash = repeat.traceHash;
      deterministicHash = repeat.deterministicHash;
      semanticHash = repeat.semanticHash;
      if (!repeat.ok) {
        allOk = false;
        exitClass = Math.max(exitClass, repeat.exitClass || 5);
        status = repeat.status || 'nondeterminism';
      }
      continue;
    }

    if (SAVE_LOAD_EQ_NAMES.has(name)) {
      const saveLoad = await compareSaveLoad(scenarioDoc, {
        ...options,
        runId: options.runId ? `${options.runId}_saveload` : undefined,
      });
      const eq = saveLoad.equivalence && saveLoad.equivalence['uninterrupted-eq-save-load']
        ? saveLoad.equivalence['uninterrupted-eq-save-load']
        : null;
      // Prefer already-sealed entry from compareSaveLoad (WeakSet identity).
      // Re-seal under repeat only when the save-load parent did not produce a sealed object.
      if (eq && isEquivalenceSealedBySaveLoad(eq)) {
        equivalence[name] = eq;
      } else if (eq && isEquivalenceSealedByRepeat(eq)) {
        equivalence[name] = eq;
      } else {
        equivalence[name] = sealEquivalenceResult({
          ok: !!(eq && eq.ok),
          expected: eq?.expected ?? true,
          actual: eq?.actual ?? eq?.ok ?? false,
          contract: eq?.contract || saveLoad.contract,
          firstDivergentTick: eq?.firstDivergentTick ?? saveLoad.firstDivergentTick ?? null,
          reason: eq?.reason || (eq?.ok ? undefined : saveLoad.status),
        });
      }
      if (!primary) primary = saveLoad.uninterrupted || null;
      if (!saveLoad.ok) {
        allOk = false;
        exitClass = Math.max(exitClass, saveLoad.exitClass || 5);
        status = status === 'pass' ? (saveLoad.status || 'parity-fail') : status;
      }
      continue;
    }

    // G4: unsupported declared equivalence is incomplete/fail — never silent pass.
    equivalence[name] = sealEquivalenceResult({
      ok: false,
      incomplete: true,
      expected: true,
      actual: 'unsupported',
      reason: `repeatScenario cannot evaluate equivalence "${name}" — unsupported or missing handler`,
    });
    allOk = false;
    exitClass = Math.max(exitClass, 4);
    status = status === 'pass' ? 'incomplete' : status;
  }

  return {
    schema: 'spaceface.labRepeatResult.v1',
    ok: allOk,
    exitClass: allOk ? 0 : (exitClass || 5),
    status: allOk ? 'pass' : status,
    certifying: true,
    nonPromoting: false,
    runs,
    declaredEquivalences: declared,
    traceHash,
    deterministicHash,
    semanticHash,
    mismatches,
    equivalence,
    primary,
    results: options.verbosity >= 2 ? results : undefined,
  };
}

async function evaluateRunEqRepeat(scenarioDoc, options = {}) {
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
      // Parent-owned multi-run — arms defer equivalence consumption.
      skipMultiRunEquivalence: true,
      childArm: true,
    });
    results.push(r);
  }

  const first = results[0];
  if (!first || first.exitClass === 4 || first.exitClass === 3) {
    return {
      ok: false,
      exitClass: first ? first.exitClass : 3,
      status: first ? first.status : 'infra',
      runs,
      primary: first,
      results,
      mismatches: [],
      traceHash: first?.traceHash ?? null,
      deterministicHash: null,
      semanticHash: null,
      equivalenceEntry: sealEquivalenceResult(
        { ok: false, expected: true, actual: false, reason: 'primary-run-failed' },
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
    }),
  };
}
