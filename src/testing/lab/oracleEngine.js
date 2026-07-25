// General oracle engine: every-tick invariants, temporal, quantitative metrics, equivalence.
// Thresholds are scenario-authored — never computed from the candidate then certified against itself.

import { evaluateMetrics, compareThreshold } from './metricRegistry.js';
// Side-effect: register massline + flight metrics.
import '../metrics/masslineMetrics.js';

/**
 * Evaluate all oracle families for a completed run.
 * @param {object} options
 * @param {object[]} options.trace
 * @param {object[]} [options.metrics]
 * @param {object[]} [options.assertions]
 * @param {object} [options.ctx]
 * @param {object} [options.equivalence] optional precomputed equivalence results
 */
export function evaluateOracles({
  trace = [],
  metrics = [],
  assertions = [],
  ctx = {},
  equivalence = {},
  // When true (compare/repeat arms), multi-run equivalence is evaluated by the parent
  // command — emit skipped markers so consumption works without false-green deferred pass.
  skipMultiRunEquivalence = false,
} = {}) {
  const metricResults = evaluateMetrics(metrics, trace, ctx);
  const invariantResults = evaluateInvariants(trace, ctx);
  const temporalResults = evaluateTemporal(assertions.filter((a) => isTemporal(a.kind)), trace, ctx);
  const quantitativeFromAssertions = evaluateQuantitativeAssertions(
    assertions.filter((a) => a.kind === 'metric' || a.kind === 'quantitative'),
    metricResults,
    trace,
    ctx,
  );
  const equivalenceResults = evaluateEquivalence(
    assertions.filter((a) => a.kind === 'equivalence' || a.equivalence),
    equivalence,
    { skipMultiRunEquivalence },
  );

  const all = [
    ...invariantResults,
    // H11: declared metrics use source:'metric' so they do not collide with assertion consumption.
    ...metricResults.map((m) => ({
      family: 'quantitative',
      source: 'metric',
      id: `${m.name}@${m.version}`,
      ok: m.ok,
      expected: m.threshold,
      actual: m.value,
      signedDelta: m.signedDelta,
      firstBadTick: m.ok ? null : findMetricFirstBadTick(trace, m, ctx),
    })),
    ...temporalResults,
    ...quantitativeFromAssertions,
    ...equivalenceResults,
  ];

  const failed = all.filter((r) => r.ok === false);
  let firstBadTick = null;
  for (const f of failed) {
    if (Number.isInteger(f.firstBadTick)) {
      if (firstBadTick == null || f.firstBadTick < firstBadTick) firstBadTick = f.firstBadTick;
    }
  }

  return {
    ok: failed.length === 0,
    results: all,
    failed,
    firstBadTick,
    metrics: metricResults,
  };
}

function isTemporal(kind) {
  return [
    'eventByTick',
    'eventInInterval',
    'precedes',
    'holds',
    'never',
    'settles',
    'inputReleaseNextTick',
    'temporal',
  ].includes(kind);
}

function evaluateInvariants(trace, ctx) {
  const results = [];

  // Finite state every tick
  let finiteOk = true;
  let finiteBadTick = null;
  for (const s of trace) {
    const fields = [
      s.playerX, s.playerZ, s.playerVelX, s.playerVelZ, s.playerRot,
      s.distance, s.tension, s.radialSpeed,
    ];
    for (const v of fields) {
      if (v != null && !Number.isFinite(v)) {
        finiteOk = false;
        finiteBadTick = s.tick;
        break;
      }
    }
    if (!finiteOk) break;
  }
  results.push({
    family: 'invariant',
    id: 'finite-state',
    ok: finiteOk,
    expected: true,
    actual: finiteOk,
    signedDelta: finiteOk ? 0 : 1,
    firstBadTick: finiteBadTick,
  });

  // No negative resources
  let resourceOk = true;
  let resourceBadTick = null;
  for (const s of trace) {
    if ((s.hull != null && s.hull < 0) || (s.cap != null && s.cap < 0) || (s.credits != null && s.credits < 0)) {
      resourceOk = false;
      resourceBadTick = s.tick;
      break;
    }
  }
  results.push({
    family: 'invariant',
    id: 'no-negative-resources',
    ok: resourceOk,
    expected: true,
    actual: resourceOk,
    signedDelta: resourceOk ? 0 : 1,
    firstBadTick: resourceBadTick,
  });

  // Dead entity must not keep physics authority samples (when flagged)
  if (ctx.checkDeadPhysics !== false) {
    let deadOk = true;
    let deadBad = null;
    for (const s of trace) {
      if (s.playerAlive === false && s.playerHasPhysicsAuthority === true) {
        deadOk = false;
        deadBad = s.tick;
        break;
      }
    }
    results.push({
      family: 'invariant',
      id: 'no-dead-entity-physics-authority',
      ok: deadOk,
      expected: true,
      actual: deadOk,
      signedDelta: deadOk ? 0 : 1,
      firstBadTick: deadBad,
    });
  }

  return results;
}

function unknownSignalResult(kind, signal) {
  return {
    family: 'temporal',
    id: signal ? `${kind}:${signal}` : kind,
    ok: false,
    expected: { knownSignal: true },
    actual: { signal, known: false },
    signedDelta: 1,
    firstBadTick: 0,
    reason: `unknown temporal signal "${signal}" — must name a sampled field`,
  };
}

function isKnownOracleSignal(signal) {
  return typeof signal === 'string' && KNOWN_ORACLE_SIGNALS.has(signal);
}

function evaluateTemporal(assertions, trace, ctx) {
  const results = [];
  for (const a of assertions) {
    if (a.kind === 'settles' || (a.kind === 'temporal' && a.signal === 'settles')) {
      const band = Number.isFinite(a.value) ? a.value : 3;
      const signal = a.signal && a.signal !== 'settles' ? a.signal : 'radialSpeed';
      if (!isKnownOracleSignal(signal)) {
        results.push(unknownSignalResult('settles', signal));
        continue;
      }
      let lastUnsettled = -1;
      for (let i = 0; i < trace.length; i++) {
        if (Math.abs(trace[i][signal] || 0) > band) lastUnsettled = i;
      }
      const settled = trace.length > 0 && lastUnsettled < trace.length - 1;
      const settleTick = settled ? trace[lastUnsettled + 1].tick : null;
      const byTick = a.byTick;
      const ok = settled && (byTick == null || settleTick <= byTick);
      results.push({
        family: 'temporal',
        id: 'settles',
        ok,
        expected: byTick != null ? { byTick, band } : { settled: true, band },
        actual: { settleTick, settled },
        signedDelta: settleTick != null && byTick != null ? settleTick - byTick : (settled ? 0 : 1),
        firstBadTick: ok ? null : (settleTick ?? (trace.length ? trace[trace.length - 1].tick : 0)),
      });
      continue;
    }

    if (a.kind === 'never') {
      const signal = a.signal || a.never || a.event;
      // H11: never without a signal cannot pass vacuously.
      if (!signal) {
        results.push({
          family: 'temporal',
          id: 'never',
          ok: false,
          expected: { signal: true },
          actual: null,
          signedDelta: 1,
          firstBadTick: 0,
          reason: 'never assertion missing required signal/event field',
        });
        continue;
      }
      // F8: unknown signals fail (not vacuous pass via truthySignal → false).
      if (!isKnownOracleSignal(signal)) {
        results.push(unknownSignalResult('never', signal));
        continue;
      }
      let bad = null;
      for (const s of trace) {
        if (truthySignal(s, signal, a)) {
          bad = s.tick;
          break;
        }
      }
      results.push({
        family: 'temporal',
        id: `never:${signal}`,
        ok: bad == null,
        expected: false,
        actual: bad != null,
        signedDelta: bad == null ? 0 : 1,
        firstBadTick: bad,
      });
      continue;
    }

    if (a.kind === 'holds') {
      const signal = a.signal;
      if (!isKnownOracleSignal(signal)) {
        results.push(unknownSignalResult('holds', signal));
        continue;
      }
      const need = a.holdsTicks | 0;
      let run = 0;
      let ok = false;
      let firstBad = null;
      for (const s of trace) {
        if (truthySignal(s, signal, a)) {
          run++;
          if (run >= need) {
            ok = true;
            break;
          }
        } else {
          run = 0;
        }
      }
      if (!ok && trace.length) firstBad = trace[trace.length - 1].tick;
      results.push({
        family: 'temporal',
        id: `holds:${signal}`,
        ok,
        expected: { holdsTicks: need },
        actual: { maxRun: run },
        signedDelta: ok ? 0 : need - run,
        firstBadTick: firstBad,
      });
      continue;
    }

    if (a.kind === 'eventByTick') {
      const signal = a.signal;
      if (!isKnownOracleSignal(signal)) {
        results.push(unknownSignalResult('eventByTick', signal));
        continue;
      }
      const byTick = a.byTick | 0;
      let foundTick = null;
      for (const s of trace) {
        if (truthySignal(s, signal, a)) {
          foundTick = s.tick;
          break;
        }
      }
      const ok = foundTick != null && foundTick <= byTick;
      results.push({
        family: 'temporal',
        id: `eventByTick:${signal}`,
        ok,
        expected: { byTick },
        actual: { foundTick },
        signedDelta: foundTick != null ? foundTick - byTick : null,
        firstBadTick: ok ? null : byTick,
      });
      continue;
    }

    // Unimplemented temporal kinds must FAIL — never soft-pass (FIX 6).
    // precedes / eventInInterval / inputReleaseNextTick are also rejected at schema validation.
    results.push({
      family: 'temporal',
      id: a.kind || 'unknown',
      ok: false,
      expected: a,
      actual: 'unsupported-temporal-kind',
      signedDelta: 1,
      firstBadTick: 0,
      reason: `assertion kind "${a.kind}" is not implemented; refusing silent pass`,
    });
  }
  return results;
}

function evaluateQuantitativeAssertions(assertions, metricResults, trace, ctx) {
  const results = [];
  const byName = new Map(metricResults.map((m) => [`${m.name}@${m.version}`, m]));

  for (const a of assertions) {
    // H11: metric assertions without a metric name fail closed (never silently disappear).
    if (!a.metric) {
      results.push({
        family: 'quantitative',
        source: 'assertion',
        id: a.kind || 'metric',
        ok: false,
        expected: a,
        actual: null,
        signedDelta: null,
        firstBadTick: 0,
        reason: 'metric assertion missing required metric field',
      });
      continue;
    }
    const key = a.metric.includes('@') ? a.metric : `${a.metric}@1`;
    const m = byName.get(key) || metricResults.find((x) => x.name === a.metric);
    if (!m) {
      results.push({
        family: 'quantitative',
        source: 'assertion',
        id: key,
        ok: false,
        expected: a,
        actual: null,
        signedDelta: null,
        firstBadTick: 0,
      });
      continue;
    }
    const threshold = a.threshold || (a.op ? { op: a.op, value: a.value, epsilon: a.delta } : a.expected);
    const value = extractNumeric(m.value, a);
    const cmp = compareThreshold(value, threshold);
    results.push({
      family: 'quantitative',
      // H11: distinct source from declared metric results so consumption matches exactly once.
      source: 'assertion',
      id: key,
      ok: cmp.ok,
      expected: threshold,
      actual: value,
      signedDelta: cmp.delta,
      firstBadTick: cmp.ok ? null : findMetricFirstBadTick(trace, { ...m, threshold }, ctx),
    });
  }
  return results;
}

function evaluateEquivalence(assertions, equivalence, options = {}) {
  const results = [];
  for (const a of assertions) {
    const name = a.equivalence || a.expected || a.signal || 'run-eq-repeat';
    const pre = equivalence[name];
    if (pre && typeof pre === 'object') {
      results.push({
        family: 'equivalence',
        id: name,
        ok: !!pre.ok,
        expected: pre.expected ?? true,
        actual: pre.actual ?? pre.ok,
        signedDelta: pre.ok ? 0 : 1,
        firstBadTick: pre.firstBadTick ?? null,
        detail: pre,
      });
      continue;
    }
    if (pre === true || pre === false) {
      results.push({
        family: 'equivalence',
        id: name,
        ok: pre === true,
        expected: true,
        actual: pre === true,
        signedDelta: pre === true ? 0 : 1,
        firstBadTick: null,
      });
      continue;
    }
    // Compare/repeat arms: parent command owns multi-run equivalence. Emit a skipped
    // marker so assertion consumption succeeds without treating deferred as a green pass.
    if (options.skipMultiRunEquivalence) {
      results.push({
        family: 'equivalence',
        id: name,
        ok: true,
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
    // F5: standalone `run` with declared equivalence and no compare result is incomplete.
    // Do NOT mark deferred multi-run checks as consumed-and-passing.
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
      reason: 'equivalence-deferred-not-computed — use lab repeat/compare or supply equivalence results',
    });
  }
  return results;
}

/**
 * Known sample fields the runner records (see runScenario makeSample).
 * Unknown signals must not vacuous-pass temporal assertions (F8/G8).
 * G8: `default` / `diverged` are not valid unless present on the sample.
 */
export const KNOWN_ORACLE_SIGNALS = Object.freeze(new Set([
  'tick', 'playerX', 'playerZ', 'playerVelX', 'playerVelZ', 'playerRot',
  'playerAlive', 'hull', 'cap', 'credits', 'tetherActive', 'distance', 'restLength',
  'radiusError', 'radialSpeed', 'tangentialSpeed', 'tangentFraction', 'tension',
  'angularSpeed', 'attachmentActive', 'loadBand', 'mtActive', 'mtPhase', 'mtStrain',
  'orbitAssistActive', 'orbitAssistReason',
  'cmdX', 'cmdZ', 'cmdRejected', 'cmdClamped',
]));

function truthySignal(sample, signal, assertion) {
  if (!signal) return false;
  if (signal === 'attachmentActive') return sample.attachmentActive !== false && !!sample.attachmentActive;
  if (signal === 'tetherActive') return !!sample.tetherActive;
  if (Object.prototype.hasOwnProperty.call(sample, signal)) {
    const v = sample[signal];
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') {
      if (assertion && assertion.op === '>') return v > (assertion.value ?? 0);
      return v !== 0;
    }
    return !!v;
  }
  // Unknown field on sample → not truthy. Callers that need hard-fail on unknown
  // signals should validate via schema (F8/G8) before evaluation.
  return false;
}

function extractNumeric(value, assertion) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    if (assertion && assertion.field && value[assertion.field] != null) return Number(value[assertion.field]);
    if (value.pass != null) return value.pass ? 1 : 0;
    if (value.value != null) return Number(value.value);
  }
  return Number(value);
}

function findMetricFirstBadTick(trace, metricResult, ctx) {
  if (!trace.length) return 0;
  // For pass/fail aggregate metrics, use last tick as the failure locus.
  if (metricResult.threshold == null) return trace[trace.length - 1].tick;
  // Scan when metric is a simple max/min of a signal.
  const name = metricResult.name || '';
  if (name.includes('maxTension') || name.includes('maxRadius')) {
    const signal = name.includes('Tension') ? 'tension' : 'radiusError';
    const thr = metricResult.threshold;
    const bound = thr && (thr.value ?? thr.max);
    if (Number.isFinite(bound)) {
      for (const s of trace) {
        if (Math.abs(s[signal] || 0) > bound) return s.tick;
      }
    }
  }
  return trace[trace.length - 1].tick;
}
