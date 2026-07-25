// Uninterrupted run vs mid-run save/load continuation — compare within declared checkpoint contract.
// F1: equivalence requires every-tick trajectory identity (trace + mid checkpoints), not final hash alone.

import { runLabScenario } from './runScenario.js';

/**
 * @param {object} scenarioDoc
 * @param {{ saveLoadAt?: number, verbosity?: number }} [options]
 */
export async function compareSaveLoad(scenarioDoc, options = {}) {
  const saveLoadAt = Number.isInteger(options.saveLoadAt)
    ? options.saveLoadAt
    : Math.max(1, Math.floor(((scenarioDoc.ticks | 0) || 60) / 2));

  // Control arm: explicit suppression — never restore, even if the scenario authors a
  // save-load checkpoint. Without this, `saveLoadAt: undefined` falls back to the
  // checkpoint tick and both arms perform the same restore (vacuous parity).
  // Retain traces so tick-by-tick divergence is always observable (F1).
  // Multi-run equivalence is owned by this compare — arms skip deferred-eq incomplete.
  const uninterrupted = await runLabScenario(scenarioDoc, {
    ...options,
    runId: options.runId ? `${options.runId}_unint` : undefined,
    suppressSaveLoad: true,
    saveLoadAt: null,
    retainOracleTrace: true,
    skipMultiRunEquivalence: true,
  });

  const withSaveLoad = await runLabScenario(scenarioDoc, {
    ...options,
    runId: options.runId ? `${options.runId}_saveload` : undefined,
    suppressSaveLoad: false,
    saveLoadAt,
    allowRuntimeCheckpoint: false,
    retainOracleTrace: true,
    skipMultiRunEquivalence: true,
  });

  if (uninterrupted.exitClass === 3 || withSaveLoad.exitClass === 3) {
    return {
      schema: 'spaceface.labSaveLoadCompareResult.v1',
      ok: false,
      exitClass: 3,
      status: 'infra',
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
      saveLoadAt,
      failedArms,
      armFailures: {
        uninterrupted: armFailureSummary(uninterrupted),
        withSaveLoad: armFailureSummary(withSaveLoad),
      },
      equivalence: {
        'uninterrupted-eq-save-load': {
          ok: false,
          reason: `oracle failed on arm(s): ${failedArms.join(', ')}`,
        },
      },
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
  const controlRestores = (uninterrupted.params && uninterrupted.params.saveLoadRestoreCount) | 0;

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

  return {
    schema: 'spaceface.labSaveLoadCompareResult.v1',
    ok: match,
    exitClass: match ? 0 : 5,
    status: match ? 'pass' : 'parity-fail',
    saveLoadAt,
    contract,
    authorizedEquivalence: authorized,
    controlRestoreCount: controlRestores,
    uninterruptedHash: h0,
    saveLoadHash: h1,
    uninterruptedTraceHash: t0,
    saveLoadTraceHash: t1,
    firstDivergentTick: tickCompare.firstDivergentTick,
    firstDivergentField: tickCompare.firstDivergentField,
    midCheckpointMismatch: midCompare.ok ? null : midCompare,
    equivalence: {
      'uninterrupted-eq-save-load': {
        ok: match,
        expected: h0,
        actual: h1,
        contract,
        intermediateOk,
        firstDivergentTick: tickCompare.firstDivergentTick,
      },
    },
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
