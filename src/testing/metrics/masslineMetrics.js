// Massline metrics extracted from scripts/lib/masslineControlLab.mjs computeMetrics.
// Registered under stable name+version for the general lab oracle engine.

import { registerMetric } from '../lab/metricRegistry.js';

const SETTLE_BAND = 3;
const OSC_BUDGET = 40;
const DIVERGENCE_FACTOR = 6;

function round6(n) {
  return Math.round((Number(n) || 0) * 1e6) / 1e6;
}

/** Pure-over-trace massline acceptance metrics (same surface as masslineControlLab.computeMetrics). */
export function computeMasslineTraceMetrics(trace, params = {}, ctx = {}) {
  const restLength0 = Number.isFinite(params.restLength0)
    ? params.restLength0
    : (Number.isFinite(ctx.restLength0) ? ctx.restLength0 : 0);
  const attachmentActiveAtEnd = ctx.attachmentActiveAtEnd !== false;
  const settleBand = Number.isFinite(params.settleBandRadialSpeed) ? params.settleBandRadialSpeed : SETTLE_BAND;
  const oscBudget = Number.isFinite(params.oscBudget) ? params.oscBudget : OSC_BUDGET;
  const divergenceFactor = Number.isFinite(params.divergenceFactor) ? params.divergenceFactor : DIVERGENCE_FACTOR;

  const n = trace.length;
  let maxDistance = 0;
  let maxTension = 0;
  let maxRadiusError = 0;
  let tangentSum = 0;
  let oscillations = 0;
  let prevRadialSign = 0;
  let lastUnsettledIndex = -1;

  for (let i = 0; i < n; i++) {
    const sample = trace[i];
    maxDistance = Math.max(maxDistance, Math.abs(sample.distance || 0));
    maxTension = Math.max(maxTension, Math.abs(sample.tension || 0));
    maxRadiusError = Math.max(maxRadiusError, Math.abs(sample.radiusError || 0));
    tangentSum += sample.tangentFraction || 0;
    const rs = sample.radialSpeed || 0;
    const sign = rs > 0 ? 1 : rs < 0 ? -1 : 0;
    if (sign !== 0) {
      if (prevRadialSign !== 0 && sign !== prevRadialSign) oscillations++;
      prevRadialSign = sign;
    }
    if (Math.abs(rs) > settleBand) lastUnsettledIndex = i;
  }

  let settleTick = null;
  if (n > 0 && lastUnsettledIndex < n - 1) {
    settleTick = trace[lastUnsettledIndex + 1].tick;
  }

  const divergenceBound = Math.max(1, restLength0) * divergenceFactor;
  const diverged = maxDistance > divergenceBound;
  const broke = !attachmentActiveAtEnd;
  const meanTangentFraction = n > 0 ? tangentSum / n : 0;
  const finalRadiusError = n > 0 ? (trace[n - 1].radiusError || 0) : 0;
  const pass = !broke && !diverged && oscillations <= oscBudget;

  return {
    ticks: n,
    settleTick,
    oscillations,
    maxRadiusError: round6(maxRadiusError),
    finalRadiusError: round6(finalRadiusError),
    maxTension: round6(maxTension),
    maxDistance: round6(maxDistance),
    meanTangentFraction: round6(meanTangentFraction),
    diverged,
    broke,
    pass,
  };
}

function signalSeries(trace, signal) {
  return trace.map((s) => {
    if (signal === 'player.speed') {
      return Math.hypot(s.playerVelX || 0, s.playerVelZ || 0);
    }
    return s[signal];
  });
}

registerMetric('massline.acceptance', 1, {
  description: 'Massline pass/fail + settle/osc/divergence surface',
  compute(trace, params, ctx) {
    return computeMasslineTraceMetrics(trace, params, ctx);
  },
});

registerMetric('massline.maxTension', 1, {
  description: 'Peak line tension over the run',
  compute(trace) {
    let max = 0;
    for (const s of trace) max = Math.max(max, Math.abs(s.tension || 0));
    return round6(max);
  },
});

registerMetric('massline.maxRadiusError', 1, {
  description: 'Peak |distance - restLength|',
  compute(trace) {
    let max = 0;
    for (const s of trace) max = Math.max(max, Math.abs(s.radiusError || 0));
    return round6(max);
  },
});

registerMetric('massline.oscillations', 1, {
  description: 'Radial speed sign-change count',
  compute(trace, params, ctx) {
    return computeMasslineTraceMetrics(trace, params, ctx).oscillations;
  },
});

registerMetric('massline.diverged', 1, {
  description: '1 if max distance exceeds divergence bound',
  compute(trace, params, ctx) {
    return computeMasslineTraceMetrics(trace, params, ctx).diverged ? 1 : 0;
  },
});

registerMetric('trace.max', 1, {
  description: 'Max of a named trace signal',
  compute(trace, params) {
    const signal = params.signal || 'distance';
    let max = -Infinity;
    for (const v of signalSeries(trace, signal)) {
      if (Number.isFinite(v)) max = Math.max(max, v);
    }
    return Number.isFinite(max) ? round6(max) : 0;
  },
});

registerMetric('trace.min', 1, {
  description: 'Min of a named trace signal',
  compute(trace, params) {
    const signal = params.signal || 'distance';
    let min = Infinity;
    for (const v of signalSeries(trace, signal)) {
      if (Number.isFinite(v)) min = Math.min(min, v);
    }
    return Number.isFinite(min) ? round6(min) : 0;
  },
});

registerMetric('trace.final', 1, {
  description: 'Final sample of a named trace signal',
  compute(trace, params) {
    if (!trace.length) return 0;
    const signal = params.signal || 'distance';
    const series = signalSeries(trace, signal);
    return round6(series[series.length - 1] || 0);
  },
});

registerMetric('flight.finalSpeed', 1, {
  description: 'Player speed at final tick',
  compute(trace) {
    if (!trace.length) return 0;
    const s = trace[trace.length - 1];
    return round6(Math.hypot(s.playerVelX || 0, s.playerVelZ || 0));
  },
});

registerMetric('invariant.finiteState', 1, {
  description: '1 if every sampled pose/vel is finite',
  compute(trace) {
    for (const s of trace) {
      for (const k of ['playerX', 'playerZ', 'playerVelX', 'playerVelZ', 'distance', 'tension']) {
        if (s[k] != null && !Number.isFinite(s[k])) return 0;
      }
    }
    return 1;
  },
});

registerMetric('invariant.noNegativeResources', 1, {
  description: '1 if hull/cap never negative when present',
  compute(trace) {
    for (const s of trace) {
      if (s.hull != null && s.hull < 0) return 0;
      if (s.cap != null && s.cap < 0) return 0;
      if (s.credits != null && s.credits < 0) return 0;
    }
    return 1;
  },
});
