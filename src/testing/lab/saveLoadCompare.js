// Uninterrupted run vs mid-run save/load continuation — compare within declared checkpoint contract.

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
  const uninterrupted = await runLabScenario(scenarioDoc, {
    ...options,
    runId: options.runId ? `${options.runId}_unint` : undefined,
    suppressSaveLoad: true,
    saveLoadAt: null,
  });

  const withSaveLoad = await runLabScenario(scenarioDoc, {
    ...options,
    runId: options.runId ? `${options.runId}_saveload` : undefined,
    suppressSaveLoad: false,
    saveLoadAt,
    allowRuntimeCheckpoint: false,
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
  // H12: default contract is deterministic-covered. Weaker equivalence (trace/semantic)
  // is accepted only when the scenario explicitly authorizes it.
  const authorized = resolveSaveLoadEquivalence(scenarioDoc, options);
  const controlRestores = (uninterrupted.params && uninterrupted.params.saveLoadRestoreCount) | 0;
  let match = h0 === h1;
  let contract = 'deterministic-covered';

  if (!match && authorized !== 'deterministic-covered') {
    if (authorized === 'trace-hash' || authorized === 'semantic' || authorized === 'any-weaker') {
      const t0 = uninterrupted.traceHash;
      const t1 = withSaveLoad.traceHash;
      if ((authorized === 'trace-hash' || authorized === 'any-weaker') && t0 === t1) {
        match = true;
        contract = 'trace-hash';
      } else if (authorized === 'semantic' || authorized === 'any-weaker') {
        const s0 = hashOf(uninterrupted, 'semantic');
        const s1 = hashOf(withSaveLoad, 'semantic');
        if (s0 === s1) {
          match = true;
          contract = 'semantic';
        }
      }
    }
  }

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
    equivalence: {
      'uninterrupted-eq-save-load': {
        ok: match,
        expected: h0,
        actual: h1,
        contract,
      },
    },
    uninterrupted: options.verbosity >= 2 ? uninterrupted : summarize(uninterrupted),
    withSaveLoad: options.verbosity >= 2 ? withSaveLoad : summarize(withSaveLoad),
  };
}

/**
 * Default: deterministic-covered only. Scenario may set saveLoadEquivalence to
 * "semantic" | "trace-hash" | "any-weaker" to authorize softer contracts.
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
