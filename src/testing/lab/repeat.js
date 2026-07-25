// Repeat: prove run==run (identical deterministic-covered + trace hashes).

import { runLabScenario } from './runScenario.js';

/**
 * Run the same scenario twice and compare authoritative checkpoints.
 * @param {object} scenarioDoc
 * @param {object} [options]
 */
export async function repeatScenario(scenarioDoc, options = {}) {
  const runs = Number.isInteger(options.runs) && options.runs > 1 ? options.runs : 2;
  const results = [];
  for (let i = 0; i < runs; i++) {
    // Multi-run equivalence is owned by this repeat — arms skip deferred-eq incomplete.
    const r = await runLabScenario(scenarioDoc, {
      ...options,
      runId: options.runId ? `${options.runId}_r${i}` : undefined,
      equivalence: {},
      skipMultiRunEquivalence: true,
    });
    results.push(r);
  }

  const first = results[0];
  if (!first || first.exitClass === 4 || first.exitClass === 3) {
    return {
      schema: 'spaceface.labRepeatResult.v1',
      ok: false,
      exitClass: first ? first.exitClass : 3,
      status: first ? first.status : 'infra',
      results,
      equivalence: { 'run-eq-repeat': { ok: false, reason: 'primary-run-failed' } },
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

  const exitClass = allMatch ? (first.ok ? 0 : 1) : 5;
  return {
    schema: 'spaceface.labRepeatResult.v1',
    ok: allMatch && first.ok,
    exitClass,
    status: allMatch ? (first.ok ? 'pass' : 'fail') : 'nondeterminism',
    runs,
    traceHash: first.traceHash,
    deterministicHash: first.checkpoints && first.checkpoints.final
      && first.checkpoints.final.deterministicCovered
      && first.checkpoints.final.deterministicCovered.hash,
    semanticHash: first.checkpoints && first.checkpoints.final
      && first.checkpoints.final.semantic
      && first.checkpoints.final.semantic.hash,
    mismatches,
    equivalence: {
      'run-eq-repeat': { ok: allMatch, expected: true, actual: allMatch },
    },
    primary: first,
    results: options.verbosity >= 2 ? results : undefined,
  };
}
