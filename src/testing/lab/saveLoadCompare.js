// Uninterrupted run vs mid-run save/load continuation — compare within declared checkpoint contract.
// F1: equivalence requires every-tick trajectory identity (trace + mid checkpoints), not final hash alone.
// O1/O2: child arms use runLabScenarioInternal; equivalence is sealed by this fixed parent executor.
// R2: this parent OWNS only uninterrupted-eq-save-load (and aliases). Foreign claims → incomplete.
// Q1/Q2/R1: sealing is module-private WeakMap identity bound to
// {scenarioDigest, equivalenceId, executor} — not a bearer token or mint API.

import { runLabScenarioInternal } from './runScenario.js';
import { EQUIVALENCE_EXECUTOR_SOURCES } from './equivalenceSources.js';
import {
  SAVE_LOAD_OWNED_EQUIVALENCES,
  collectDeclaredEquivalences,
  foreignEquivalencesFor,
} from './equivalenceOwnership.js';

const CANONICAL_SAVE_LOAD_EQ = 'uninterrupted-eq-save-load';

/** Module-private registry: sealed object → binding context. Spread does not transfer membership. */
const sealedBySaveLoad = new WeakMap();

/**
 * Seal a comparison payload under the save-load executor with claim+scenario binding.
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
    source: EQUIVALENCE_EXECUTOR_SOURCES.SAVE_LOAD,
  });
  sealedBySaveLoad.set(sealed, Object.freeze({
    scenarioDigest: binding.scenarioDigest ?? null,
    equivalenceId: binding.equivalenceId,
    executor: EQUIVALENCE_EXECUTOR_SOURCES.SAVE_LOAD,
  }));
  return sealed;
}

/**
 * Membership / binding check for oracle authority. Not a mint API.
 * @param {unknown} pre
 * @param {{ scenarioDigest?: string|null, equivalenceId?: string, executor?: string }|null} [expected]
 * @returns {boolean}
 */
export function isEquivalenceSealedBySaveLoad(pre, expected = null) {
  if (!pre || typeof pre !== 'object' || Array.isArray(pre)) return false;
  if (!sealedBySaveLoad.has(pre)) return false;
  if (!expected) return true;
  const b = sealedBySaveLoad.get(pre);
  if (expected.equivalenceId != null && b.equivalenceId !== expected.equivalenceId) return false;
  if (expected.executor != null && b.executor !== expected.executor) return false;
  if (expected.scenarioDigest != null && b.scenarioDigest !== expected.scenarioDigest) return false;
  return true;
}

/**
 * @param {unknown} pre
 * @returns {{ scenarioDigest: string|null, equivalenceId: string, executor: string }|null}
 */
export function getSaveLoadSealBinding(pre) {
  if (!pre || typeof pre !== 'object' || Array.isArray(pre)) return null;
  return sealedBySaveLoad.get(pre) || null;
}

/**
 * @param {object} scenarioDoc
 * @param {{ saveLoadAt?: number, verbosity?: number }} [options]
 */
export async function compareSaveLoad(scenarioDoc, options = {}) {
  const ticks = (scenarioDoc && scenarioDoc.ticks) | 0;
  const saveLoadAt = Number.isInteger(options.saveLoadAt)
    ? options.saveLoadAt
    : Math.max(0, Math.min(
      Math.max(1, Math.floor((ticks || 60) / 2)) - 1,
      Math.max(0, (ticks || 60) - 2),
    ));

  // R2: enumerate declared equivalences — foreign claims cannot be certified by save/load.
  // No default: CLI compare certifies only the owned claim without inventing declarations.
  const declared = collectDeclaredEquivalences(scenarioDoc);
  const foreign = foreignEquivalencesFor('save-load', declared);
  if (foreign.length > 0) {
    return {
      schema: 'spaceface.labSaveLoadCompareResult.v1',
      ok: false,
      exitClass: 4,
      status: 'incomplete',
      reason: 'unsupported equivalence for this executor',
      detail: `compareSaveLoad does not own: ${foreign.join(', ')} — use the owning parent executor`,
      saveLoadAt,
      declaredEquivalences: declared,
      foreignEquivalences: foreign,
      certifying: false,
      nonPromoting: true,
    };
  }

  // I1: range-check before any run — need at least one post-restore tick.
  // Valid: 0 <= saveLoadAt < ticks - 1 (ticks must be >= 2).
  if (!Number.isInteger(ticks) || ticks < 2) {
    return {
      schema: 'spaceface.labSaveLoadCompareResult.v1',
      ok: false,
      exitClass: 4,
      status: 'invalid-config',
      reason: 'save-load-ticks-too-short',
      saveLoadAt,
      detail: 'save/load compare requires ticks >= 2 so a post-restore tick exists',
    };
  }
  if (!Number.isInteger(saveLoadAt) || saveLoadAt < 0 || saveLoadAt >= ticks - 1) {
    return {
      schema: 'spaceface.labSaveLoadCompareResult.v1',
      ok: false,
      exitClass: 4,
      status: 'invalid-config',
      reason: 'saveLoadAt-out-of-range',
      saveLoadAt,
      ticks,
      detail: `saveLoadAt must satisfy 0 <= saveLoadAt < ticks - 1 (got ${saveLoadAt}, ticks=${ticks})`,
    };
  }

  // Control arm: explicit suppression — never restore, even if the scenario authors a
  // save-load checkpoint. Without this, `saveLoadAt: undefined` falls back to the
  // checkpoint tick and both arms perform the same restore (vacuous parity).
  // Retain traces so tick-by-tick divergence is always observable (F1).
  // O1/O3: multi-run equivalence is owned by this parent — arms are nonPromoting internals.
  const uninterrupted = await runLabScenarioInternal(scenarioDoc, {
    file: options.file,
    verbosity: options.verbosity,
    observerEnabled: options.observerEnabled,
    runId: options.runId ? `${options.runId}_unint` : undefined,
    suppressSaveLoad: true,
    saveLoadAt: null,
    retainOracleTrace: true,
    skipMultiRunEquivalence: true,
    childArm: true,
  });

  const withSaveLoad = await runLabScenarioInternal(scenarioDoc, {
    file: options.file,
    verbosity: options.verbosity,
    observerEnabled: options.observerEnabled,
    runId: options.runId ? `${options.runId}_saveload` : undefined,
    suppressSaveLoad: false,
    saveLoadAt,
    allowRuntimeCheckpoint: false,
    retainOracleTrace: true,
    skipMultiRunEquivalence: true,
    childArm: true,
  });

  const scenarioDigest = uninterrupted.scenarioDigest
    || withSaveLoad.scenarioDigest
    || null;
  const sealBind = { scenarioDigest, equivalenceId: CANONICAL_SAVE_LOAD_EQ };

  if (uninterrupted.exitClass === 3 || withSaveLoad.exitClass === 3) {
    return {
      schema: 'spaceface.labSaveLoadCompareResult.v1',
      ok: false,
      exitClass: 3,
      status: 'infra',
      scenarioDigest,
      uninterrupted,
      withSaveLoad,
    };
  }
  if (uninterrupted.exitClass === 4 || withSaveLoad.exitClass === 4) {
    return {
      schema: 'spaceface.labSaveLoadCompareResult.v1',
      ok: false,
      exitClass: 4,
      status: withSaveLoad.status === 'unsupported' || uninterrupted.status === 'unsupported'
        ? 'unsupported'
        : 'invalid-config',
      scenarioDigest,
      uninterrupted,
      withSaveLoad,
    };
  }

  // Parity is only meaningful between two oracle-passing runs.
  // Matching hashes of two failures is not a pass (e.g. impossible threshold both miss).
  if (!uninterrupted.ok || !withSaveLoad.ok) {
    const failedArms = [];
    if (!uninterrupted.ok) failedArms.push('uninterrupted');
    if (!withSaveLoad.ok) failedArms.push('withSaveLoad');
    return {
      schema: 'spaceface.labSaveLoadCompareResult.v1',
      ok: false,
      exitClass: 1,
      status: 'arm-oracle-fail',
      certifying: true,
      nonPromoting: false,
      saveLoadAt,
      scenarioDigest,
      declaredEquivalences: declared,
      failedArms,
      armFailures: {
        uninterrupted: armFailureSummary(uninterrupted),
        withSaveLoad: armFailureSummary(withSaveLoad),
      },
      equivalence: {
        [CANONICAL_SAVE_LOAD_EQ]: sealEquivalenceResult({
          ok: false,
          expected: true,
          actual: false,
          reason: `oracle failed on arm(s): ${failedArms.join(', ')}`,
        }, sealBind),
      },
      uninterrupted: options.verbosity >= 2 ? uninterrupted : summarize(uninterrupted),
      withSaveLoad: options.verbosity >= 2 ? withSaveLoad : summarize(withSaveLoad),
    };
  }

  // I1: refuse to certify save/load unless the comparison arm actually restored once
  // and the control arm restored zero times. Out-of-range or missed ticks cannot green.
  const controlRestores = (uninterrupted.params && uninterrupted.params.saveLoadRestoreCount) | 0;
  const controlPerformed = !!(uninterrupted.params && uninterrupted.params.saveLoadPerformed);
  const armPerformed = !!(withSaveLoad.params && withSaveLoad.params.saveLoadPerformed);
  const armRestores = (withSaveLoad.params && withSaveLoad.params.saveLoadRestoreCount) | 0;
  if (controlPerformed || controlRestores !== 0) {
    return {
      schema: 'spaceface.labSaveLoadCompareResult.v1',
      ok: false,
      exitClass: 4,
      status: 'invalid-config',
      reason: 'control-arm-restored',
      saveLoadAt,
      scenarioDigest,
      controlRestoreCount: controlRestores,
      detail: 'uninterrupted control arm must perform zero save/load restores',
      uninterrupted: options.verbosity >= 2 ? uninterrupted : summarize(uninterrupted),
      withSaveLoad: options.verbosity >= 2 ? withSaveLoad : summarize(withSaveLoad),
    };
  }
  if (!armPerformed || armRestores !== 1) {
    return {
      schema: 'spaceface.labSaveLoadCompareResult.v1',
      ok: false,
      exitClass: 4,
      status: 'save-load-not-performed',
      reason: 'save-load-not-performed',
      saveLoadAt,
      scenarioDigest,
      saveLoadPerformed: armPerformed,
      saveLoadRestoreCount: armRestores,
      controlRestoreCount: controlRestores,
      detail: 'save/load arm must perform exactly one restore (saveLoadPerformed===true, restoreCount===1)',
      uninterrupted: options.verbosity >= 2 ? uninterrupted : summarize(uninterrupted),
      withSaveLoad: options.verbosity >= 2 ? withSaveLoad : summarize(withSaveLoad),
    };
  }

  const h0 = hashOf(uninterrupted, 'deterministicCovered');
  const h1 = hashOf(withSaveLoad, 'deterministicCovered');
  const t0 = uninterrupted.traceHash;
  const t1 = withSaveLoad.traceHash;
  // H12: default contract is deterministic-covered. Weaker equivalence (trace/semantic)
  // is accepted only when the scenario explicitly authorizes it — but NEVER when intermediate
  // ticks diverged (F1). Final-hash-equal with unequal traces is a false-green and must fail.
  const authorized = resolveSaveLoadEquivalence(scenarioDoc, options);

  const tickCompare = compareTracesTickByTick(
    uninterrupted.oracleTrace || uninterrupted.trace,
    withSaveLoad.oracleTrace || withSaveLoad.trace,
  );
  const midCompare = compareMidCheckpoints(
    uninterrupted.checkpoints && uninterrupted.checkpoints.mid,
    withSaveLoad.checkpoints && withSaveLoad.checkpoints.mid,
  );

  // G1: same-engine save/load requires EXACT identity — zero tolerance, unequal hashes fail.
  // Trace hashes must match when both present; tick-by-tick uses Object.is / === only.
  // Weaker contracts (trace-hash/semantic) are never accepted for save/load parity.
  const tracesRetained = Array.isArray(uninterrupted.oracleTrace || uninterrupted.trace)
    && Array.isArray(withSaveLoad.oracleTrace || withSaveLoad.trace);
  const traceHashOk = t0 != null && t1 != null ? t0 === t1 : !tracesRetained;
  const intermediateOk = tickCompare.ok && midCompare.ok && traceHashOk;
  let match = intermediateOk && h0 === h1;
  let contract = 'deterministic-covered';

  // If intermediate diverged, contract labels the failure surface.
  if (!intermediateOk) {
    if (!tickCompare.ok) contract = 'trace-tick-by-tick';
    else if (!midCompare.ok) contract = 'mid-checkpoint';
    else if (!traceHashOk) contract = 'trace-hash-mismatch';
  }
  // G1: authorized weaker equivalence does NOT soft-pass save/load. Same-engine is exact only.
  void authorized;

  // When aliases were declared, seal under each owned declared name with matching binding.
  const ownedNames = declared.length
    ? declared.filter((n) => SAVE_LOAD_OWNED_EQUIVALENCES.has(n))
    : [CANONICAL_SAVE_LOAD_EQ];
  const equivalence = {};
  for (const name of ownedNames) {
    equivalence[name] = sealEquivalenceResult({
      ok: match,
      expected: h0,
      actual: h1,
      contract,
      intermediateOk,
      firstDivergentTick: tickCompare.firstDivergentTick,
    }, { scenarioDigest, equivalenceId: name });
  }
  // Always expose canonical key for CLI/consumers that look it up by fixed name.
  if (!equivalence[CANONICAL_SAVE_LOAD_EQ]) {
    equivalence[CANONICAL_SAVE_LOAD_EQ] = sealEquivalenceResult({
      ok: match,
      expected: h0,
      actual: h1,
      contract,
      intermediateOk,
      firstDivergentTick: tickCompare.firstDivergentTick,
    }, sealBind);
  }

  return {
    schema: 'spaceface.labSaveLoadCompareResult.v1',
    ok: match,
    exitClass: match ? 0 : 5,
    status: match ? 'pass' : 'parity-fail',
    certifying: true,
    nonPromoting: false,
    saveLoadAt,
    scenarioDigest,
    declaredEquivalences: declared,
    contract,
    authorizedEquivalence: authorized,
    controlRestoreCount: controlRestores,
    saveLoadPerformed: armPerformed,
    saveLoadRestoreCount: armRestores,
    uninterruptedHash: h0,
    saveLoadHash: h1,
    uninterruptedTraceHash: t0,
    saveLoadTraceHash: t1,
    firstDivergentTick: tickCompare.firstDivergentTick,
    firstDivergentField: tickCompare.firstDivergentField,
    midCheckpointMismatch: midCompare.ok ? null : midCompare,
    equivalence,
    uninterrupted: options.verbosity >= 2 ? uninterrupted : summarize(uninterrupted),
    withSaveLoad: options.verbosity >= 2 ? withSaveLoad : summarize(withSaveLoad),
  };
}

/**
 * Compare two oracle traces tick-by-tick. Any field mismatch → fail.
 * @param {object[]|null|undefined} a
 * @param {object[]|null|undefined} b
 */
export function compareTracesTickByTick(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    // G1: missing traces cannot prove exact identity — fail closed (caller still reports hashes).
    return {
      ok: false,
      firstDivergentTick: null,
      firstDivergentField: null,
      reason: 'traces-not-retained',
    };
  }
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const sa = a[i];
    const sb = b[i];
    if (!sa || !sb) {
      return {
        ok: false,
        firstDivergentTick: i,
        firstDivergentField: 'trace.length',
        expected: sa || null,
        actual: sb || null,
      };
    }
    const keys = new Set([...Object.keys(sa), ...Object.keys(sb)]);
    for (const key of keys) {
      if (!valuesEqualExact(sa[key], sb[key])) {
        return {
          ok: false,
          firstDivergentTick: sa.tick != null ? sa.tick : i,
          firstDivergentField: key,
          expected: sa[key],
          actual: sb[key],
        };
      }
    }
  }
  return { ok: true, firstDivergentTick: null, firstDivergentField: null };
}

function compareMidCheckpoints(a, b) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  if (left.length !== right.length) {
    return {
      ok: false,
      reason: 'mid-checkpoint-count-mismatch',
      expected: left.length,
      actual: right.length,
    };
  }
  for (let i = 0; i < left.length; i++) {
    const la = left[i];
    const lb = right[i];
    if ((la.tick | 0) !== (lb.tick | 0)) {
      return { ok: false, reason: 'mid-checkpoint-tick-mismatch', expected: la.tick, actual: lb.tick };
    }
    const ha = la.deterministicCovered && la.deterministicCovered.hash;
    const hb = lb.deterministicCovered && lb.deterministicCovered.hash;
    if (ha != null && hb != null && ha !== hb) {
      return {
        ok: false,
        reason: 'mid-checkpoint-hash-mismatch',
        tick: la.tick,
        expected: ha,
        actual: hb,
      };
    }
  }
  return { ok: true };
}

/**
 * G1: same-engine comparison uses exact identity only (Object.is / ===).
 * No ULP tolerance — 1 ULP divergence is a real fail with first divergent field.
 */
function valuesEqualExact(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    // NaN handling: Object.is(NaN, NaN) is true above; mixed finite/non-finite fails.
    return false;
  }
  return a === b;
}

/**
 * Default: deterministic-covered only (exact). saveLoadEquivalence is recorded for
 * diagnostics/history but G1 forbids weaker same-engine contracts from greening parity.
 * H12/H13: policy is still compiled into the canonical artifact and hashed.
 */
function resolveSaveLoadEquivalence(scenarioDoc, options = {}) {
  if (options.saveLoadEquivalence) return options.saveLoadEquivalence;
  if (scenarioDoc && scenarioDoc.saveLoadEquivalence) return scenarioDoc.saveLoadEquivalence;
  if (scenarioDoc && scenarioDoc.notes && typeof scenarioDoc.notes === 'object'
    && scenarioDoc.notes.saveLoadEquivalence) {
    return scenarioDoc.notes.saveLoadEquivalence;
  }
  return 'deterministic-covered';
}

export { resolveSaveLoadEquivalence };

function hashOf(result, kind) {
  const final = result && result.checkpoints && result.checkpoints.final;
  if (!final) return null;
  const cp = kind === 'semantic' ? final.semantic : final.deterministicCovered;
  return cp && cp.hash;
}

function armFailureSummary(result) {
  if (!result) return null;
  return {
    ok: result.ok,
    exitClass: result.exitClass,
    status: result.status,
    oracle: result.oracle && {
      ok: result.oracle.ok,
      firstBadTick: result.oracle.firstBadTick,
      failed: result.oracle.failed,
    },
    error: result.error || null,
  };
}

function summarize(result) {
  if (!result) return null;
  return {
    ok: result.ok,
    exitClass: result.exitClass,
    status: result.status,
    traceHash: result.traceHash,
    checkpoints: result.checkpoints,
    params: result.params,
    oracle: result.oracle && {
      ok: result.oracle.ok,
      firstBadTick: result.oracle.firstBadTick,
      failed: result.oracle.failed,
    },
  };
}
