// scripts/lib/bench/funMetrics.mjs — per-run fun metrics for the Fun Convergence Loop (PQ-173.01).
//
// Derives the law §3.2 MEASURE metrics from one bench run record. Honest by construction: every
// number the run data cannot support comes back null with a machine-readable gap string — never
// fabricated, and never derived from a sparse (milestone-level) trace as if it were per-tick.
//
// Law: design/program/FUN_CONVERGENCE_LOOP.md §3.2 (definitions and thresholds), §3.6 (keep or
// revert), §3.7 (plain-words reporting). Bars: design/FEEL_CONTRACT.md §B.

// The distinct player verbs counted for "verbs used per minute" (law §3.2).
export const FUN_VERBS = [
  'thrust', 'brake', 'boost', 'latch', 'reel', 'release', 'throw', 'shove', 'well', 'stroke',
];

// Law thresholds in player units. `min`/`max` name the fun side of each bar.
export const FUN_THRESHOLDS = {
  verbsPerMinute: { fun: 4, direction: 'higher', word: 'a fun run uses >= 4 distinct verbs per minute' },
  consequencesPerAction: { fun: 2, direction: 'higher', word: 'thin is < 2 consequences per player action' },
  timeToFirstConsequenceS: { fun: 0.3, direction: 'lower', word: 'instant is <= 0.3 s' },
  momentsPerMinute: { fun: 1, direction: 'higher', word: 'dead is < 1 moment per minute' },
  nothingHappenedSeconds: { fun: 0, direction: 'lower', word: 'a fight should have none' },
};

// Knock budget (bar B13): contact-sourced player velocity changes.
export const KNOCK_BUDGET_LIMITS = {
  eventsPerMinute: 2, // at most 2 per minute
  maxDeltaVFractionOfCruise: 0.1, // largest no more than 10% of cruise
  headingChanges: 0, // never a heading change
};

const KILL_EVENT = 'entity:killed';
const COLLATERAL_EVENT = 'combat:collateral';
const PLAYER_KNOCK_EVENT = 'collision:playerKnock';
const SHOT_EVENT = 'player:shot';
const VERB_EVENT = 'verb:used';
const MILESTONE_EVENT_TYPES = new Set(['run:wavePlanned', 'run:waveCleared']);

const SIM_TICKS_PER_MINUTE = 3600; // 60 Hz fixed step
const NOTHING_HAPPENED_GAP_TICKS = 4 * 60; // a quiet stretch only counts past 4 s
// Below this many non-milestone events a trace cannot be told apart from milestone-level
// recording, so quiet-gap measurement would be dishonest.
const MIN_DENSE_TRACE_EVENTS = 3;

const FLIGHT_TRACE_GAP = 'flight trace has no action/consequence events';
const MILESTONE_TRACE_GAP = 'trace is milestone-level, not per-tick';

/**
 * Derives the per-run fun metrics (law §3.2) from a bench run record. Never throws: any missing
 * field degrades to null plus a gap string.
 *
 * @param {object} run { bench, scenarioId?, loadoutId?, arenaId?, seed, metrics, eventTrace?, durationMs? }
 * @returns {object} {
 *   verbsPerMinute, verbsUsed,
 *   consequencesPerAction, timeToFirstConsequenceS, momentsPerMinute, nothingHappenedSeconds,
 *   deathsByCause, knockBudget, gaps
 * }
 */
export function deriveFunMetrics(run) {
  const gaps = [];
  const out = {
    verbsPerMinute: null,
    verbsUsed: null,
    consequencesPerAction: null,
    timeToFirstConsequenceS: null,
    momentsPerMinute: null,
    nothingHappenedSeconds: null,
    deathsByCause: null,
    knockBudget: null,
    gaps,
  };
  if (!run || typeof run !== 'object') {
    gaps.push('no run record');
    return out;
  }

  const metrics = run.metrics && typeof run.metrics === 'object' ? run.metrics : {};
  const trace = Array.isArray(run.eventTrace)
    ? run.eventTrace.filter((e) => e && typeof e === 'object')
    : null;
  const bench = inferBench(run);
  const simMinutes = trace ? traceSimMinutes(trace) : null;

  // ── verbs per minute / verbs used ────────────────────────────────────────────
  const vpm = finiteNumber(metrics.verbsPerMinute);
  if (vpm !== null) out.verbsPerMinute = vpm;
  else gaps.push('verbsPerMinute: run metrics do not report verb usage');
  const used = finiteNumber(metrics.verbsUsedCount);
  if (used !== null) out.verbsUsed = used;
  else gaps.push('verbsUsed: run metrics do not report verb usage');

  // ── flight runs carry a sample-only trace: nothing else is honestly derivable ─
  if (bench === 'flight') {
    for (const key of [
      'consequencesPerAction',
      'timeToFirstConsequenceS',
      'momentsPerMinute',
      'nothingHappenedSeconds',
      'deathsByCause',
    ]) {
      gaps.push(`${key}: ${FLIGHT_TRACE_GAP}`);
    }
    out.knockBudget = deriveKnockBudget(run, { bench, metrics, trace, simMinutes, gaps });
    return out;
  }

  // ── crucible runs: full derivation from the (post-enrichment) event trace ────
  if (bench === 'crucible') {
    deriveCrucibleMetrics(out, { metrics, trace, simMinutes, gaps });
    out.knockBudget = deriveKnockBudget(run, { bench, metrics, trace, simMinutes, gaps });
    return out;
  }

  // ── verb runs: scenario-specific traces; derive only what the events support ─
  gaps.push('consequencesPerAction: verb trace is scenario-specific, no player action count');
  gaps.push('timeToFirstConsequenceS: verb trace is scenario-specific, no player action count');
  gaps.push('momentsPerMinute: verb trace is scenario-specific, no per-tick collateral record');
  gaps.push('nothingHappenedSeconds: verb trace is scenario-specific, sampled not per-tick');
  gaps.push('deathsByCause: verb scenario records no deaths');
  out.knockBudget = deriveKnockBudget(run, { bench, metrics, trace, simMinutes, gaps });
  return out;
}

function deriveCrucibleMetrics(out, { metrics, trace, simMinutes, gaps }) {
  if (!trace || trace.length === 0) {
    // No trace: only whole-run totals are honest. Consequences fall back to kills/shots.
    const kills = finiteNumber(metrics.totalKills);
    const shots = finiteNumber(metrics.totalShots);
    if (kills !== null && shots !== null) {
      out.consequencesPerAction = kills / Math.max(1, shots);
    } else {
      gaps.push('consequencesPerAction: no event trace and no kill/shot totals');
    }
    gaps.push('timeToFirstConsequenceS: no event trace, first-consequence tick unknown');
    const moments = finiteNumber(metrics.momentsPerMinute);
    if (moments !== null) out.momentsPerMinute = moments;
    else gaps.push('momentsPerMinute: no event trace and no moment total');
    const quiet = finiteNumber(metrics.nothingHappenedSeconds);
    if (quiet !== null) out.nothingHappenedSeconds = quiet;
    else gaps.push('nothingHappenedSeconds: no event trace, quiet stretches unmeasured');
    gaps.push('deathsByCause: no event trace, kill causes not recorded');
    return;
  }

  const kills = trace.filter((e) => e.type === KILL_EVENT);
  const collateral = trace.filter((e) => e.type === COLLATERAL_EVENT);
  const knocks = trace.filter((e) => e.type === PLAYER_KNOCK_EVENT);
  const shotEvents = trace.filter((e) => e.type === SHOT_EVENT).length;
  const shots = shotEvents > 0 ? shotEvents : (finiteNumber(metrics.totalShots) ?? 0);

  const consequences = kills.length + collateral.length + knocks.length;
  if (consequences > 0 || shots > 0) {
    out.consequencesPerAction = consequences / Math.max(1, shots);
  } else {
    gaps.push('consequencesPerAction: trace records no action or consequence events');
  }

  const consequenceTicks = [...kills, ...collateral, ...knocks]
    .map((e) => finiteNumber(e.tick))
    .filter((t) => t !== null);
  // Law §3.2: time to first consequence AFTER AN ACTION, not after run start.
  const actionTicks = trace
    .filter((e) => e.type === SHOT_EVENT || e.type === VERB_EVENT)
    .map((e) => finiteNumber(e.tick))
    .filter((t) => t !== null);
  if (actionTicks.length === 0) {
    gaps.push('timeToFirstConsequenceS: trace records no player action to measure from');
  } else if (consequenceTicks.length === 0) {
    gaps.push('timeToFirstConsequenceS: trace records no consequence events');
  } else {
    const firstAction = Math.min(...actionTicks);
    const afterAction = consequenceTicks.filter((t) => t >= firstAction);
    if (afterAction.length > 0) {
      out.timeToFirstConsequenceS = (Math.min(...afterAction) - firstAction) / 60;
    } else {
      gaps.push('timeToFirstConsequenceS: no consequence followed the first recorded action');
    }
  }

  if (collateral.length > 0 && simMinutes !== null && simMinutes > 0) {
    out.momentsPerMinute = collateral.length / simMinutes;
  } else if (collateral.length === 0 && simMinutes !== null && simMinutes > 0) {
    out.momentsPerMinute = 0;
  } else {
    gaps.push('momentsPerMinute: no sim minutes derivable from trace');
  }

  out.nothingHappenedSeconds = measureNothingHappenedSeconds(trace, gaps);

  if (kills.length > 0) {
    const byCause = {};
    let withCause = 0;
    for (const kill of kills) {
      const cause = kill.data && typeof kill.data.cause === 'string' ? kill.data.cause : 'unrecorded';
      if (cause !== 'unrecorded') withCause++;
      byCause[cause] = (byCause[cause] || 0) + 1;
    }
    if (withCause > 0) out.deathsByCause = byCause;
    else gaps.push('deathsByCause: kill events carry no cause');
  } else {
    gaps.push('deathsByCause: trace records no kill events');
  }
}

// Nothing-happened seconds: total time in gaps > 4 s between consecutive trace events — but only
// when the trace is dense enough to be honest. A milestone-level trace (only wave boundaries)
// cannot distinguish "nothing happened" from "nothing was recorded", so it yields null + gap.
function measureNothingHappenedSeconds(trace, gaps) {
  const dense = trace
    .filter((e) => !MILESTONE_EVENT_TYPES.has(e.type))
    .map((e) => ({ tick: finiteNumber(e.tick), type: e.type }))
    .filter((e) => e.tick !== null)
    .sort((a, b) => a.tick - b.tick);
  if (dense.length < MIN_DENSE_TRACE_EVENTS) {
    gaps.push(`nothingHappenedSeconds: ${MILESTONE_TRACE_GAP}`);
    return null;
  }
  let quietTicks = 0;
  for (let i = 1; i < dense.length; i++) {
    const gap = dense[i].tick - dense[i - 1].tick;
    if (gap > NOTHING_HAPPENED_GAP_TICKS) quietTicks += gap;
  }
  return quietTicks / 60;
}

// Knock budget (bar B13). Verb source: the feel.knock_budget scenario's pinned metrics.
// Crucible source: the run metrics (playerKnockEventsPerMin / maxPlayerKnockFraction).
function deriveKnockBudget(run, { bench, metrics, trace, simMinutes, gaps }) {
  if (bench === 'verbs') {
    if (run.scenarioId !== 'feel.knock_budget') {
      gaps.push('knockBudget: verb scenario does not measure the knock budget');
      return null;
    }
    const eventsPerMinute = finiteNumber(metrics.knockEventsPerMinute);
    const maxFraction = finiteNumber(metrics.maxKnockDeltaVFractionOfCruise);
    const headingChanges = finiteNumber(metrics.headingChangeEvents);
    if (eventsPerMinute === null && maxFraction === null && headingChanges === null) {
      gaps.push('knockBudget: feel.knock_budget run exposes no knock metrics');
      return null;
    }
    let met;
    if (typeof metrics.barMet === 'boolean') {
      met = metrics.barMet;
    } else if (eventsPerMinute !== null && maxFraction !== null && headingChanges !== null) {
      met = withinKnockBudget(eventsPerMinute, maxFraction, headingChanges);
    } else {
      met = null;
      gaps.push('knockBudget: knock budget components unavailable, met undecidable');
    }
    return {
      eventsPerMinute,
      maxDeltaVFractionOfCruise: maxFraction,
      headingChangeEvents: headingChanges,
      met,
      source: 'scenario',
    };
  }

  if (bench === 'crucible') {
    const metricEvents = finiteNumber(metrics.playerKnockEventsPerMin);
    const maxFraction = finiteNumber(metrics.maxPlayerKnockFraction);
    let eventsPerMinute = metricEvents;
    let headingChanges = null;
    if (trace) {
      const knocks = trace.filter((e) => e.type === PLAYER_KNOCK_EVENT);
      headingChanges = knocks.filter((e) => {
        const rad = finiteNumber(e.data ? e.data.headingChangeRad : null);
        return rad !== null && Math.abs(rad) > 0;
      }).length;
      if (eventsPerMinute === null && simMinutes !== null && simMinutes > 0) {
        eventsPerMinute = knocks.length / simMinutes;
      }
    }
    if (eventsPerMinute === null && maxFraction === null) {
      gaps.push('knockBudget: no knock budget source for this run');
      return null;
    }
    let met;
    if (eventsPerMinute !== null && maxFraction !== null) {
      met = eventsPerMinute <= KNOCK_BUDGET_LIMITS.eventsPerMinute
        && maxFraction <= KNOCK_BUDGET_LIMITS.maxDeltaVFractionOfCruise;
    } else {
      met = null;
      gaps.push('knockBudget: knock budget components unavailable, met undecidable');
    }
    return {
      eventsPerMinute,
      maxDeltaVFractionOfCruise: maxFraction,
      headingChangeEvents: headingChanges,
      met,
      source: 'run',
    };
  }

  gaps.push('knockBudget: no knock budget source for this bench');
  return null;
}

function withinKnockBudget(eventsPerMinute, maxFraction, headingChanges) {
  return eventsPerMinute <= KNOCK_BUDGET_LIMITS.eventsPerMinute
    && maxFraction <= KNOCK_BUDGET_LIMITS.maxDeltaVFractionOfCruise
    && headingChanges <= KNOCK_BUDGET_LIMITS.headingChanges;
}

function inferBench(run) {
  if (typeof run.bench === 'string' && run.bench) return run.bench;
  if (run.arenaId && run.loadoutId) return 'crucible';
  return 'verbs';
}

function traceSimMinutes(trace) {
  let lastTick = null;
  for (const event of trace) {
    const tick = finiteNumber(event.tick);
    if (tick !== null && (lastTick === null || tick > lastTick)) lastTick = tick;
  }
  return lastTick === null ? null : lastTick / SIM_TICKS_PER_MINUTE;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
