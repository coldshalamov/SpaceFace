// Repeat: prove run==run (identical deterministic-covered + trace hashes).
// G4: evaluate ALL equivalences the scenario declares — never silently pass unsupported ones.
// O2: equivalence entries are sealed by this fixed parent executor only.
// P1: sealer is imported from private _equivalenceSeal (not public barrel / authority).

import { runLabScenarioInternal } from './runScenario.js';
import { compareSaveLoad } from './saveLoadCompare.js';
import {
  sealEquivalenceResult,
  EQUIVALENCE_EXECUTOR_SOURCES,
} from './_equivalenceSeal.js';

const RUN_EQ_NAMES = new Set(['run-eq-repeat', 'run-eq-run', 'repeat']);
const SAVE_LOAD_EQ_NAMES = new Set([
  'uninterrupted-eq-save-load',
  'save-load',
  'uninterrupted-eq-saveload',
]);

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
        : {
          ok: !!saveLoad.ok,
          reason: saveLoad.status || 'save-load-compare',
        };
      // Prefer already-sealed entry from compareSaveLoad; re-seal under repeat if needed.
      equivalence[name] = eq && eq.source
        ? eq
        : sealEquivalenceResult({
          ok: !!eq.ok,
          expected: eq.expected ?? true,
          actual: eq.actual ?? eq.ok,
          contract: eq.contract || saveLoad.contract,
          firstDivergentTick: eq.firstDivergentTick ?? saveLoad.firstDivergentTick ?? null,
          reason: eq.reason || (eq.ok ? undefined : saveLoad.status),
        }, EQUIVALENCE_EXECUTOR_SOURCES.REPEAT);
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
    }, EQUIVALENCE_EXECUTOR_SOURCES.REPEAT);
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
        EQUIVALENCE_EXECUTOR_SOURCES.REPEAT,
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

  const ok = allMatch && first.ok;
  return {
    ok,
    exitClass: allMatch ? (first.ok ? 0 : 1) : 5,
    status: allMatch ? (first.ok ? 'pass' : 'fail') : 'nondeterminism',
    runs,
    primary: first,
    results,
    mismatches,
    traceHash: first.traceHash,
    deterministicHash: first.checkpoints && first.checkpoints.final
      && first.checkpoints.final.deterministicCovered
      && first.checkpoints.final.deterministicCovered.hash,
    semanticHash: first.checkpoints && first.checkpoints.final
      && first.checkpoints.final.semantic
      && first.checkpoints.final.semantic.hash,
    equivalenceEntry: sealEquivalenceResult(
      { ok: allMatch, expected: true, actual: allMatch, runs, mismatches },
      EQUIVALENCE_EXECUTOR_SOURCES.REPEAT,
    ),
  };
}
