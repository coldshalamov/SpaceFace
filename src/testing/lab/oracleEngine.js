// Node-side oracle wrapper.
// Pure invariant/temporal/quantitative evaluation is shared with Chromium through oracleKernel.js.
// Fixed-parent equivalence authority remains Node-only and is deliberately not browser-loadable.

import { evaluateOracleKernel } from './oracleKernel.js';
import {
  isAuthoritativeEquivalenceResult,
  getEquivalenceSealBinding,
  expectedSealContextForClaim,
} from './equivalenceAuthority.js';

export {
  FINITE_STATE_FIELDS,
  RESOURCE_FIELDS,
  KNOWN_ORACLE_SIGNALS,
  signalCoveredEveryTick,
} from './oracleKernel.js';

/**
 * Evaluate pure oracle families and then attach Node-only sealed equivalence results.
 * @param {object} options
 */
export function evaluateOracles(options = {}) {
  const opts = options || {};
  const pure = evaluateOracleKernel(opts);
  const assertions = Array.isArray(opts.assertions) ? opts.assertions : [];
  const equivalenceResults = evaluateEquivalence(
    assertions.filter((a) => a && (a.kind === 'equivalence' || a.equivalence)),
    opts.equivalence || {},
    {
      skipMultiRunEquivalence: opts.skipMultiRunEquivalence === true,
      scenarioDigest: opts.scenarioDigest ?? null,
    },
  );
  const results = [...pure.results, ...equivalenceResults];
  const failed = results.filter((r) => r.ok === false && !r.skipped);
  let firstBadTick = pure.firstBadTick;
  for (const failure of failed) {
    if (Number.isInteger(failure.firstBadTick)
      && (firstBadTick == null || failure.firstBadTick < firstBadTick)) {
      firstBadTick = failure.firstBadTick;
    }
  }
  return { ...pure, ok: failed.length === 0, results, failed, firstBadTick };
}

/**
 * O2/R1: accept equivalence results ONLY when sealed by a fixed parent executor
 * AND bound to this claim + scenario (+ executor type). Bearer seals are rejected.
 * Shape-based authentication ({ ok, expected, actual }) is deliberately rejected.
 */
function evaluateEquivalence(assertions, equivalence, options = {}) {
  const results = [];
  const scenarioDigest = options.scenarioDigest ?? null;
  for (const a of assertions) {
    const name = a.equivalence || a.expected || a.signal || 'run-eq-repeat';
    const pre = equivalence[name];
    // N2: boolean injection is never valid proof (even `true`).
    if (pre === true || pre === false) {
      results.push({
        family: 'equivalence',
        id: name,
        ok: false,
        incomplete: true,
        injected: true,
        expected: true,
        actual: pre,
        signedDelta: 1,
        firstBadTick: null,
        reason: 'caller-injected boolean equivalence is not valid proof — require sealed result from fixed parent executor',
      });
      continue;
    }
    if (pre != null && typeof pre === 'object') {
      // Membership first (unforgeable identity).
      if (!isAuthoritativeEquivalenceResult(pre)) {
        results.push({
          family: 'equivalence',
          id: name,
          ok: false,
          incomplete: true,
          injected: true,
          expected: true,
          actual: {
            ok: pre.ok,
            expected: pre.expected,
            actual: pre.actual,
            source: pre.source ?? null,
          },
          signedDelta: 1,
          firstBadTick: null,
          reason: 'equivalence object lacks fixed-executor seal — shape-only {ok,expected,actual} is not proof',
        });
        continue;
      }
      // R1: seal must be bound to this claim (and scenario when digests are present).
      const expected = expectedSealContextForClaim(name, { scenarioDigest });
      // Always require equivalenceId match; require scenarioDigest when either side has one;
      // require executor match when the claim has a known owner.
      const binding = getEquivalenceSealBinding(pre);
      const claimMismatch = !binding || binding.equivalenceId !== name;
      // Digest check is required only when the evaluator supplies a scenarioDigest
      // (standalone oracle probes may omit it; claim id binding still applies).
      const digestMismatch = scenarioDigest != null
        && binding
        && binding.scenarioDigest !== scenarioDigest;
      const executorExpected = expected.executor;
      const executorMismatch = executorExpected != null
        && binding
        && binding.executor !== executorExpected;
      if (claimMismatch || digestMismatch || executorMismatch) {
        results.push({
          family: 'equivalence',
          id: name,
          ok: false,
          incomplete: true,
          injected: true,
          boundMismatch: true,
          expected: true,
          actual: {
            ok: pre.ok,
            sealEquivalenceId: binding?.equivalenceId ?? null,
            sealScenarioDigest: binding?.scenarioDigest ?? null,
            sealExecutor: binding?.executor ?? null,
            evaluatedEquivalenceId: name,
            evaluatedScenarioDigest: scenarioDigest,
          },
          signedDelta: 1,
          firstBadTick: null,
          reason: claimMismatch
            ? `seal bound to equivalence "${binding?.equivalenceId ?? '?'}" cannot authorize "${name}"`
            : (digestMismatch
              ? 'seal bound to a different scenarioDigest'
              : 'seal executor does not match expected owner for this claim'),
        });
        continue;
      }
      results.push({
        family: 'equivalence',
        id: name,
        ok: pre.ok === true,
        expected: pre.expected ?? true,
        actual: pre.actual ?? pre.ok,
        signedDelta: pre.ok ? 0 : 1,
        firstBadTick: pre.firstBadTick ?? null,
        executorSource: pre.source,
        sealBinding: binding,
        detail: pre,
      });
      continue;
    }
    // O3/N3: compare/repeat child arms — parent owns multi-run equivalence.
    // Emit skipped marker that is NOT ok:true and NOT assertion-consumed.
    // skipMultiRunEquivalence is only meaningful on the internal (nonPromoting) path.
    if (options.skipMultiRunEquivalence) {
      results.push({
        family: 'equivalence',
        id: name,
        ok: false,
        skipped: true,
        multiRunArm: true,
        expected: true,
        actual: 'evaluated-by-parent',
        signedDelta: 0,
        firstBadTick: null,
        reason: 'multi-run equivalence deferred to parent compare/repeat command',
      });
      continue;
    }
    // F5/O3: standalone certifying run with declared equivalence and no sealed result is incomplete.
    results.push({
      family: 'equivalence',
      id: name,
      ok: false,
      deferred: true,
      incomplete: true,
      expected: true,
      actual: 'deferred',
      signedDelta: 1,
      firstBadTick: null,
      reason: 'equivalence-deferred-not-computed — use lab repeat/compare (fixed parent executors); caller injection is rejected',
    });
  }
  return results;
}
