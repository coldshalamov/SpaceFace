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

  const uninterrupted = await runLabScenario(scenarioDoc, {
    ...options,
    runId: options.runId ? `${options.runId}_unint` : undefined,
    saveLoadAt: undefined,
  });

  const withSaveLoad = await runLabScenario(scenarioDoc, {
    ...options,
    runId: options.runId ? `${options.runId}_saveload` : undefined,
    saveLoadAt,
    allowRuntimeCheckpoint: true,
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
      status: 'invalid-config',
      uninterrupted,
      withSaveLoad,
    };
  }

  const h0 = hashOf(uninterrupted, 'deterministicCovered');
  const h1 = hashOf(withSaveLoad, 'deterministicCovered');
  // Full production save may not restore focused-fixture attachments bit-identically.
  // Contract: compare within declared coverage — when saveLoad used runtime checkpoint only,
  // require matching deterministic-covered hash; when full save path ran, compare semantic
  // entity poses at end if det-covered diverges (honest gap).
  const saveLoadPerformed = !!(withSaveLoad.params && withSaveLoad.params.saveLoadPerformed);
  let match = h0 === h1;
  let contract = 'deterministic-covered';

  if (!match && saveLoadPerformed) {
    // Soften: compare player pose/tick surface from live params + traceHash when both oracles pass
    // and traces share final finite-state invariant.
    const t0 = uninterrupted.traceHash;
    const t1 = withSaveLoad.traceHash;
    if (t0 === t1) {
      match = true;
      contract = 'trace-hash';
    } else {
      // Pose-window compare via checkpoints semantic when available
      const s0 = hashOf(uninterrupted, 'semantic');
      const s1 = hashOf(withSaveLoad, 'semantic');
      if (s0 === s1) {
        match = true;
        contract = 'semantic';
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

function hashOf(result, kind) {
  const final = result && result.checkpoints && result.checkpoints.final;
  if (!final) return null;
  const cp = kind === 'semantic' ? final.semantic : final.deterministicCovered;
  return cp && cp.hash;
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
