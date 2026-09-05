// scripts/lib/bench/feelBars.mjs — FEEL_CONTRACT §B bar registry + the bench-to-bar verdict engine.
// PQ-173.01 "The measurer" (design/program/FUN_CONVERGENCE_LOOP.md §3.2).
// Every verdict is recomputed here from raw metric numbers against the §B thresholds.
// Bench-internal pass booleans (barMet, barB4Met, b13Met, ...) are never copied as verdicts.

export const SCREEN_DEPTH_WU = 115; // the screen-depth constant the verb benches already use
export const STARTER_HULL_ID = "ship_kestrel"; // §B measures the starter hull unless a bar names another

// flightBench scenarioId -> Motion Lab scenario id embedded in the run's metrics
const FLIGHT_METRIC_IDS = {
  "flight-accel-brake": "M1",
  "flight-slalom": "M2",
  "flight-reversal": "M3",
  "collision-recovery": "M8",
};

export const FEEL_BARS = [
  {
    id: "B1",
    key: "feel.earned_speed_kept",
    title: "Earned speed is kept",
    statement:
      "After leaving the cap at 2× cruise by ANY means (rope release, shove, well fling, bounce), speed 10 s later is ≥ 99 % of the exit speed with hands off, and ≥ 99 % with forward held. Only the brake spends it.",
    target: "≥ 99 % of exit speed 10 s later, hands off and forward held",
    benchReachable: true,
    scenarioIds: ["feel.rope_swing_release"],
  },
  {
    id: "B2",
    key: "feel.reversal_course",
    title: "Nimble regime",
    statement:
      "From rest to cruise ≤ 1.5 s. Full 180° velocity reversal ≤ 3.0 s. Turn radius at cruise ≤ 1 screen depth.",
    target: "rest→cruise ≤ 1.5 s; 180° velocity reversal ≤ 3.0 s; turn radius at cruise ≤ 1 screen depth",
    benchReachable: true,
    scenarioIds: ["flight-reversal", "flight-accel-brake"],
  },
  {
    id: "B3",
    key: "feel.screen_crossing",
    title: "The fight stays on screen",
    statement:
      "At cruise the hull needs ≥ 1.2 s to cross the visible depth. Above the cap the camera opens so that a 2× cruise exit still shows ≥ 2 s of travel.",
    target: "≥ 1.2 s to cross the visible depth at cruise",
    benchReachable: true,
    scenarioIds: ["feel.stroke_speed"],
  },
  {
    id: "B4",
    key: "feel.shove_magnitude",
    title: "Shove magnitude",
    statement:
      "The dedicated shove weapon changes a light hostile's velocity by ≥ 30 % of its cruise per hit. The starter gun changes it by ≥ 5 % per hit. A light hostile already at cruise gets faster when shoved along its motion.",
    target: "shove ΔV ≥ 30 % of light-hostile cruise per hit (starter gun ≥ 5 %)",
    benchReachable: true,
    scenarioIds: ["feel.shove_magnitude"],
  },
  {
    id: "B5",
    key: "feel.shove_displacement",
    title: "Shove displacement",
    statement:
      "2 s after a shove-weapon hit, a light hostile is ≥ 1 screen depth off the line it was flying and has not fired.",
    target: "≥ 1 screen depth off the original line 2 s after the hit",
    benchReachable: true,
    scenarioIds: ["feel.shove_magnitude"],
  },
  {
    id: "B6",
    key: "feel.terrain_slam",
    title: "Terrain is lethal",
    statement:
      "A light hostile meeting rock at ≥ 50 % of cruise loses ≥ 60 % of hull and its helm; at ≥ 75 % of cruise it dies. A heavy at the same speed loses ≤ 15 % and keeps its helm.",
    target: "dies at ≥ 75 % cruise closing; ≥ 60 % hull + helm lost at ≥ 50 %; heavy ≤ 15 %",
    benchReachable: true,
    scenarioIds: ["feel.terrain_slam"],
  },
  {
    id: "B7",
    key: "feel.rope_swing_release",
    title: "The rope is a rope",
    statement:
      "Swinging at 1.5× cruise on a 100 WU line around a heavy anchor stretches the line < 10 % and does not break; releasing at the tangent keeps ≥ 95 % of tangential speed 5 s later.",
    target: "stretch < 10 %; release keeps ≥ 95 % of tangential speed at 5 s",
    benchReachable: true,
    scenarioIds: ["feel.rope_swing_release"],
  },
  {
    id: "B8",
    key: "feel.stroke_speed",
    title: "Draw-to-fly rips",
    statement:
      "Mean speed along any hand-drawn stroke ≥ 70 % of cruise; the slowest point ≥ 35 % of cruise. Speed is the pass criterion; track is the constraint.",
    target: "mean stroke speed ≥ 70 % of cruise; slowest point ≥ 35 %",
    benchReachable: true,
    scenarioIds: ["feel.stroke_speed"],
  },
  {
    id: "B9",
    key: "feel.impact_feedback",
    title: "Impacts answer",
    statement:
      "Every collision with ΔV ≥ 8 WU/s produces hitstop and camera trauma scaled by exchanged momentum. Collision audio differs by ≥ one octave of pitch and ≥ 12 dB between a scout kissing a rock and a freighter broadsiding a station. A Massline release has a time-domain snap.",
    target: "hitstop + trauma at ΔV ≥ 8 WU/s; audio ≥ 1 octave and ≥ 12 dB apart; release snaps",
    benchReachable: false,
    scenarioIds: [],
    unreachableReason:
      "hitstop, camera trauma and audio are presentation-layer; the headless bench has no instrument for them.",
  },
  {
    id: "B10",
    key: "world.reaction_trio",
    title: "The world reacts",
    statement:
      "Within 10 s of a kill in a patrol's sight, the patrol makes a visible stay-with-wreck / chase choice. Spilled cargo attracts an NPC within 30 s. Civilians within 300 WU of gunfire change course within 3 s.",
    // First clause must speak for the headline value (salvor arrival seconds, lower is
    // better) so the diff direction parses; the other clauses stay for the reader.
    target: "salvor arrives ≤ 30 s; patrol chooses within 10 s; civilians turn within 3 s",
    benchReachable: true,
    scenarioIds: ["world.cargo_spill"],
  },
  {
    id: "B11",
    key: "feel.hitstun_curve",
    title: "Hitstun law is universal",
    statement:
      "Helm-loss duration is one function of (ΔV ÷ cruise) and (attacker mass ÷ victim mass) for guns, throws, flings and collisions alike; lights at ≥ 30 % ΔV lose the helm ≥ 1 s; heavies at gun-scale ΔV never do. NPCs recover with real thruster torque, never a hidden gyro.",
    target: "one universal curve; lights ≥ 30 % ΔV stunned ≥ 1 s; heavies at gun-scale ΔV never",
    benchReachable: true,
    scenarioIds: ["feel.shove_magnitude", "feel.terrain_slam", "feel.hitstun_curve"],
  },
  {
    id: "B12",
    key: "proof.sixty_seconds",
    title: "The 60-second proof",
    statement:
      "At the reference site, the VISION.md sequence (op working → hauler leaves → pirates intercept → shove spins one → rope-swing-release makes a projectile → collateral → cargo spills → hauler flees → patrol arrives → grab pod → run WANTED) occurs in a deterministic scenario with ≥ 9 of the 11 beats, and in a headed capture at the shipping camera.",
    target: "≥ 9 of 11 beats in a deterministic scenario plus a headed capture at the shipping camera",
    benchReachable: false,
    scenarioIds: [],
    unreachableReason: "needs the PQ-141 60-second proof scenario, which does not exist yet.",
  },
  {
    id: "B13",
    key: "feel.knock_budget",
    title: "The player is never knocked around",
    statement:
      "In ten minutes of ordinary flight (no rope, no fields, no deliberate ram), contact changes the player's velocity ≤ 2 times per minute and never by more than 10 % of cruise in one event, never changes the player's heading, and never produces visible jitter; a deliberate big event (a slam the player chose, a well the player flew into) may, and it must be legible.",
    target: "≤ 2 contact knocks per minute; largest ≤ 10 % of cruise; zero heading changes; no visible jitter",
    benchReachable: true,
    scenarioIds: ["feel.knock_budget"],
  },
];

export function evaluateBars(runs) {
  const list = Array.isArray(runs) ? runs.filter((run) => run && typeof run === "object") : [];
  const bars = FEEL_BARS.map((bar) => (BAR_EVALUATORS[bar.id] || evaluateUnreachable)(bar, list));
  for (const bar of bars) mergeRunProvidedBars(bar, list);
  const summary = {
    reachable: bars.filter((bar) => bar.reachable).length,
    met: bars.filter((bar) => bar.met === true).length,
    partial: bars.filter((bar) => bar.coverage === "partial").length,
    unreachable: bars.filter((bar) => !bar.reachable).length,
  };
  return { bars, summary };
}

/**
 * Generic feed seam (single-writer rule): a run whose metrics.bars lists entries for a bar
 * contributes them directly — { bar: "B2" | "feel.reversal_course", label, value, unit, met, note? }.
 * Scenario modules under scripts/lib/bench/scenarios/ use this instead of editing this file.
 */
function mergeRunProvidedBars(bar, list) {
  const provided = [];
  const fedBy = [];
  const notes = [];
  for (const run of list) {
    const entries = run && run.metrics && Array.isArray(run.metrics.bars) ? run.metrics.bars : [];
    for (const item of entries) {
      if (!item || (item.bar !== bar.id && item.bar !== bar.key)) continue;
      const row = providedBarRow(item, bar);
      if (!row) continue;
      provided.push(row);
      const ref = fedByOf(run);
      if (!fedBy.includes(ref)) fedBy.push(ref);
      if (row.unmeasured) {
        notes.push(row.note || `${row.label} unmeasured`);
      } else if (item.note) {
        notes.push(String(item.note));
      }
    }
  }
  if (!provided.length) return;
  const priorMet = bar.met;
  const priorHadValues = Array.isArray(bar.values) && bar.values.length > 0;
  const priorNotes = bar.notes || "";
  const providedHasGap = provided.some((row) => row.unmeasured === true);
  bar.values = [...(bar.values || []), ...provided];
  const existingFed = bar.fedBy || [];
  bar.fedBy = [...existingFed, ...fedBy.filter((ref) => !existingFed.includes(ref))];
  bar.reachable = true;
  if (bar.coverage !== "full") bar.coverage = "partial";
  const fromValues = verdictFromValues(bar.values);
  // Completeness is explicit: an unmeasured/null provided row is a named gap, never a
  // Number() zero, and a numeric subset must not promote a false/null evaluator status.
  // An empty evaluator (B9, superseded stand-in) may still be established by a complete
  // finite provided set.
  let nextMet;
  if (priorMet === false || fromValues === false) {
    nextMet = false;
  } else if (providedHasGap) {
    nextMet = null;
  } else if (priorMet === true) {
    nextMet = true;
  } else if (priorHadValues) {
    nextMet = null;
  } else {
    nextMet = fromValues;
  }
  bar.met = nextMet;
  // Stand-in "still unmeasured" notes would lie beside a fully established bar; keep them
  // whenever the merge cannot claim a pass.
  bar.notes = nextMet === true ? notes.join(" ") : [priorNotes, ...notes].filter(Boolean).join(" ");
}

function finish(bar, { values = [], coverage = "none", notes = [], fedBy = [], met } = {}) {
  return {
    id: bar.id,
    key: bar.key,
    title: bar.title,
    statement: bar.statement,
    target: bar.target,
    reachable: bar.benchReachable,
    coverage,
    values,
    met: met === undefined ? verdictFromValues(values) : met,
    notes: notes.filter(Boolean).join(" "),
    fedBy,
  };
}

function verdictFromValues(values) {
  const rows = Array.isArray(values) ? values : [];
  if (!rows.length) return null;
  let hasMeasured = false;
  let hasGap = false;
  let hasMeasuredFail = false;
  for (const value of rows) {
    if (!value) continue;
    if (value.unmeasured === true || !Number.isFinite(value.value) || typeof value.value !== "number") {
      hasGap = true;
      continue;
    }
    hasMeasured = true;
    if (value.met !== true) hasMeasuredFail = true;
  }
  if (hasMeasuredFail) return false;
  if (hasGap || !hasMeasured) return null;
  return true;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Scenario-provided bar row: never Number()-coerce null/undefined/string/unmeasured into a zero. */
function providedBarRow(item, bar) {
  const label = item.label || bar.id;
  const unit = typeof item.unit === "string" ? item.unit : "";
  const note = item.note != null && String(item.note).trim() ? String(item.note) : "";
  const missing = item.unmeasured === true || item.value === null || item.value === undefined;
  if (missing) {
    return {
      label,
      value: null,
      unit,
      met: false,
      unmeasured: true,
      ...(note ? { note } : {}),
    };
  }
  const value = finiteNumber(item.value);
  if (value == null) return null;
  const row = { label, value, unit, met: item.met === true };
  if (note) row.note = note;
  return row;
}

function scenarioRuns(list, scenarioId) {
  const metricId = FLIGHT_METRIC_IDS[scenarioId] || null;
  return list.filter((run) => {
    if (run.bench === "crucible") return false;
    if (run.scenarioId === scenarioId) return true;
    return Boolean(metricId && run.metrics && run.metrics.scenarioId === metricId);
  });
}

export function fedByOf(run) {
  if (run.bench === "crucible") return `crucible/${run.arenaId}/${run.loadoutId}/s${run.seed}`;
  return `${run.bench}/${run.scenarioId}/s${run.seed}`;
}

/** Scope-neutral gap note: true whether the caller evaluated one run or the whole set. */
function unfedNote(bar) {
  return `fed only by ${bar.scenarioIds.join(" / ")} — not in this evaluation input`;
}

function hullMetrics(run) {
  const hulls = run.metrics && run.metrics.hulls;
  return hulls && typeof hulls === "object" ? hulls : null;
}

/** Worst-case value across runs: "min" for >= targets, "max" for <= targets. */
function worstMetric(runs, read, mode) {
  let worst = null;
  let n = 0;
  for (const run of runs) {
    const value = finiteNumber(read(run));
    if (value == null) continue;
    n += 1;
    if (worst == null || (mode === "min" ? value < worst : value > worst)) worst = value;
  }
  return { value: worst, n };
}

function entry(label, value, unit, met) {
  const n = finiteNumber(value);
  if (n == null) return null;
  return { label, value: n, unit, met: met === true };
}

function evaluateUnreachable(bar) {
  return finish(bar, {
    met: null,
    coverage: "none",
    notes: [bar.unreachableReason, "the bar is listed here for completeness; this bench cannot measure it."],
  });
}

function evaluateB1(bar, list) {
  const runs = scenarioRuns(list, "feel.rope_swing_release");
  if (!runs.length) {
    return finish(bar, { notes: [unfedNote(bar)] });
  }
  const kept = worstMetric(runs, (run) => run.metrics && run.metrics.speedRetainedFraction, "min");
  const values = [
    entry(`release speed kept 5 s after letting go, hands off (worst of ${kept.n} run(s))`, kept.value, "fraction", kept.value >= 0.95),
  ].filter(Boolean);
  return finish(bar, {
    values,
    coverage: "partial",
    fedBy: runs.map(fedByOf),
    // The measured number is the 5 s release-retention clause (≥ 95 %) — B7's sentence. B1's own
    // clauses (≥ 99 % of exit speed 10 s later, hands off and forward held) are kernel-level
    // (test/flightV3.spec.mjs §12c) and are not benched, so the bar itself must never read met.
    met: null,
    notes: [
      "only the 5 s release-retention clause (≥ 95 %) was measured; that sentence belongs to the rope-release scenario, and the value row is kept for the receipt.",
      "B1's own clauses — ≥ 99 % of exit speed 10 s later, hands off and with forward held — are kernel-level (test/flightV3.spec.mjs §12c) and are not benched headlessly, so this bar cannot read met from this bench.",
    ],
  });
}

function evaluateB2(bar, list) {
  const reversalRuns = scenarioRuns(list, "flight-reversal");
  const accelRuns = scenarioRuns(list, "flight-accel-brake");
  if (!reversalRuns.length && !accelRuns.length) {
    return finish(bar, { notes: [unfedNote(bar)] });
  }
  const notes = [];
  const values = [];
  const hullRows = reversalRuns.map(hullMetrics).filter(Boolean);
  let rows = hullRows.map((hulls) => hulls[STARTER_HULL_ID]).filter(Boolean);
  if (rows.length) {
    const alsoMeasured = [...new Set(hullRows.flatMap((hulls) => Object.keys(hulls)))].filter((id) => id !== STARTER_HULL_ID);
    if (alsoMeasured.length) notes.push(`verdict uses the starter hull (${STARTER_HULL_ID}); also measured: ${alsoMeasured.join(", ")} (context only).`);
  } else if (hullRows.length) {
    rows = hullRows;
    notes.push(`no ${STARTER_HULL_ID} row in the M3 output; verdict falls back to the worst hull measured.`);
  }
  const vel180 = worstMetric(rows, (row) => row.velocity180TimeS, "max");
  if (vel180.value != null) {
    const who = rows === hullRows ? "worst hull" : STARTER_HULL_ID;
    values.push(entry(`full 180° velocity reversal, ${who} (worst of ${vel180.n} result(s))`, vel180.value, "s", vel180.value <= 3.0));
  } else if (!reversalRuns.length) {
    notes.push("no flight-reversal run in this evaluation input, so the 180° clause is unmeasured.");
  } else {
    notes.push("flight-reversal output carried no finite velocity180TimeS.");
  }
  notes.push(
    "rest→cruise time and turn radius at cruise have no metric in the Motion Lab M1/M3 output yet (M1 exposes response windows, not a rest-to-cruise time; no scenario reports turn radius), so those clauses are unmeasured and coverage stays partial.",
  );
  return finish(bar, { values, coverage: values.length ? "partial" : "none", fedBy: [...reversalRuns, ...accelRuns].map(fedByOf), notes });
}

function evaluateB3(bar, list) {
  const runs = scenarioRuns(list, "feel.stroke_speed");
  // A real-path feel.screen_crossing run measures this bar directly through the generic seam
  // (mergeRunProvidedBars); the stroke-derived estimate below is a stand-in (SCREEN_DEPTH_WU is a
  // constant and the inline stroke scenario's cruise is synthetic) and must never veto it.
  const measured = list.some((run) => run && run.scenarioId === "feel.screen_crossing");
  if (!runs.length || measured) {
    return finish(bar, {
      notes: [
        measured
          ? "superseded by the real-path feel.screen_crossing run; the stroke-derived estimate is not applied."
          : unfedNote(bar),
      ],
    });
  }
  const fedBy = runs.map(fedByOf);
  // Worst case for the ≥ 1.2 s clause is the fastest measured cruise, hence mode "max".
  const cruise = worstMetric(runs, (run) => run.metrics && run.metrics.cruiseSpeed, "max");
  if (cruise.value == null) {
    return finish(bar, { coverage: "none", fedBy, notes: ["the feeding stroke runs carried no finite cruiseSpeed metric, so the crossing time cannot be derived."] });
  }
  const seconds = SCREEN_DEPTH_WU / cruise.value;
  const values = [
    entry(`derived: ${SCREEN_DEPTH_WU} WU screen depth ÷ ${cruise.value} WU/s measured cruise (worst case)`, seconds, "s", seconds >= 1.2),
  ].filter(Boolean);
  return finish(bar, {
    values,
    coverage: "partial",
    fedBy,
    notes: [
      `this number is derived (screen depth ÷ measured cruise), not directly timed; the cruise speed is fed by ${fedBy.join(", ")}.`,
      "The above-cap camera-open clause (2× cruise exit still shows ≥ 2 s) is not benched.",
    ],
  });
}

function evaluateB4(bar, list) {
  const runs = scenarioRuns(list, "feel.shove_magnitude");
  if (!runs.length) {
    return finish(bar, { notes: [unfedNote(bar)] });
  }
  const values = [
    requiredShoveMetric(runs, "deltaVFractionOfCruise", "shove ΔV, fraction of light-hostile cruise", "fraction", "min", (v) => v >= 0.30 - 1e-7),
    requiredShoveMetric(runs, "starterDeltaVFractionOfCruise", "starter ΔV, fraction of light-hostile cruise", "fraction", "min", (v) => v >= 0.05 - 1e-7),
    requiredShoveMetric(runs, "mineDeltaVFractionOfCruise", "Vector Mine centre-hit ΔV, fraction of light-hostile cruise", "fraction", "min", (v) => v >= 0.45 - 1e-7),
    requiredShoveMetric(runs, "alongSpeedBeforeFractionOfCruise", "along-motion victim speed before hit, fraction of cruise", "fraction", "min", (v) => v >= 0.90),
    requiredShoveMetric(runs, "alongSpeedRatio", "along-motion speed after / before hit", "ratio", "min", (v) => v > 1.0),
  ];
  return finish(bar, {
    values,
    coverage: values.some((value) => value.unmeasured) ? "partial" : "full",
    fedBy: runs.map(fedByOf),
    notes: [
      "Verdicts use measured fractions: shove ≥ 0.30, starter ≥ 0.05, centre mine ≥ 0.45; along-motion acceleration requires the victim already at cruise. Missing metrics in any run keep the bar unmeasured.",
      "Impulse fractions allow 1e-7 absolute error from Rapier Float32 velocity integration; raw measurements and authored thresholds remain unchanged.",
    ],
  });
}

function requiredShoveMetric(runs, key, label, unit, mode, passes) {
  const result = worstMetric(runs, (run) => run.metrics && run.metrics[key], mode);
  if (result.n !== runs.length) {
    return { label, value: null, unit, met: false, unmeasured: true, note: `${key} missing in ${runs.length - result.n} run(s)` };
  }
  return entry(`${label} (worst of ${result.n} run(s))`, result.value, unit, passes(result.value));
}

function evaluateB5(bar, list) {
  const runs = scenarioRuns(list, "feel.shove_magnitude");
  if (!runs.length) {
    return finish(bar, { notes: [unfedNote(bar)] });
  }
  const values = [
    requiredShoveMetric(runs, "screenDepths", "displacement 2 s after the shove, screen depths", "screen depths", "min", (v) => v >= 1.0),
    requiredShoveMetric(runs, "victimShots", "hostile shots during the 2 s after hit", "shots", "max", (v) => v === 0),
    requiredShoveMetric(runs, "controlArmShots", "matched unhit hostile shots in the same window", "shots", "min", (v) => v > 0),
  ];
  return finish(bar, {
    values,
    coverage: values.some((value) => value.unmeasured) ? "partial" : "full",
    fedBy: runs.map(fedByOf),
    notes: ["The has-not-fired clause requires zero hit-arm shots and a firing matched control; a silent control cannot establish suppression."],
  });
}

function evaluateB6(bar, list) {
  const runs = scenarioRuns(list, "feel.terrain_slam");
  if (!runs.length) {
    return finish(bar, { notes: [unfedNote(bar)] });
  }
  const notes = [];
  const values = [];
  const inBand = (run, floor) => run.metrics && Number.isFinite(run.metrics.closingRatio) && run.metrics.closingRatio >= floor;
  const lethalRuns = runs.filter((run) => inBand(run, 0.75));
  const damageRuns = runs.filter((run) => inBand(run, 0.5));
  if (lethalRuns.length) {
    const allDead = lethalRuns.every((run) => run.metrics.isLethal === true);
    const closing = worstMetric(lethalRuns, (run) => run.metrics.closingRatio, "min").value;
    values.push(entry(`light hostile dies at ≥ 75 % of cruise closing (ran at ${Number((closing * 100).toFixed(1))} % of cruise, ${lethalRuns.length} run(s))`, allDead ? 1 : 0, "bool", allDead));
  } else {
    notes.push("no slam run reached the ≥ 75 % closing band, so the lethality clause was not exercised.");
  }
  if (damageRuns.length) {
    const hull = worstMetric(damageRuns, (run) => run.metrics.hullLostFraction, "min");
    if (hull.value != null) {
      values.push(entry(`hull lost at ≥ 50 % of cruise closing (worst of ${hull.n} run(s))`, hull.value, "fraction", hull.value >= 0.6));
    }
    const allHelm = damageRuns.every((run) => run.metrics.lostHelm === true);
    values.push(entry(`helm lost at ≥ 50 % of cruise closing (${damageRuns.length} run(s))`, allHelm ? 1 : 0, "bool", allHelm));
  } else {
    notes.push("no slam run reached the ≥ 50 % closing band, so the damage and helm clauses were not exercised.");
  }
  const heavyHull = worstMetric(runs, (run) => run.metrics && run.metrics.heavy75HullLostFraction, "max");
  if (heavyHull.value != null) {
    values.push(entry(`heavy hull lost at the same speed (worst of ${heavyHull.n} run(s))`, heavyHull.value, "fraction", heavyHull.value <= 0.15));
  }
  const heavyHelmRuns = runs.filter((run) => run.metrics && typeof run.metrics.heavy75KeptHelm === "boolean");
  if (heavyHelmRuns.length) {
    const allKept = heavyHelmRuns.every((run) => run.metrics.heavy75KeptHelm === true);
    values.push(entry(`heavy keeps its helm at the same speed (${heavyHelmRuns.length} run(s))`, allKept ? 1 : 0, "bool", allKept));
  } else if (runs.some((run) => run.metrics && run.metrics.heavy75HelmProof === false)) {
    notes.push("the heavy-side helm clause was reported without proof and cannot pass.");
  }
  if (damageRuns.length && lethalRuns.length) {
    notes.push("the ≥ 50 % band damage and helm clauses were exercised by the same slam run(s) as the lethality clause, not by a separate slower run.");
  }
  return finish(bar, { values, coverage: values.length ? "partial" : "none", fedBy: runs.map(fedByOf), notes });
}

function evaluateB7(bar, list) {
  const runs = scenarioRuns(list, "feel.rope_swing_release");
  if (!runs.length) {
    return finish(bar, { notes: [unfedNote(bar)] });
  }
  const stretch = worstMetric(runs, (run) => run.metrics && run.metrics.maxStretchRatio, "max");
  const kept = worstMetric(runs, (run) => run.metrics && run.metrics.speedRetainedFraction, "min");
  const values = [
    entry(`peak line stretch (worst of ${stretch.n} run(s))`, stretch.value, "fraction", stretch.value < 0.1),
    entry(`tangential speed kept 5 s after release (worst of ${kept.n} run(s))`, kept.value, "fraction", kept.value >= 0.95),
  ].filter(Boolean);
  return finish(bar, {
    values,
    coverage: "partial",
    fedBy: runs.map(fedByOf),
    notes: [
      "Line break is not instrumented (the bench detaches the tether by design at release).",
    ],
  });
}

function evaluateB8(bar, list) {
  const runs = scenarioRuns(list, "feel.stroke_speed");
  if (!runs.length) {
    return finish(bar, { notes: [unfedNote(bar)] });
  }
  const mean = worstMetric(runs, (run) => run.metrics && run.metrics.meanSpeedFraction, "min");
  const min = worstMetric(runs, (run) => run.metrics && run.metrics.minSpeedFraction, "min");
  const values = [
    entry(`mean speed along the stroke, fraction of cruise (worst of ${mean.n} run(s))`, mean.value, "fraction", mean.value >= 0.7),
    entry(`slowest point of the stroke, fraction of cruise (worst of ${min.n} run(s))`, min.value, "fraction", min.value >= 0.35),
  ].filter(Boolean);
  return finish(bar, { values, coverage: "full", fedBy: runs.map(fedByOf) });
}

function evaluateB10(bar, list) {
  const runs = scenarioRuns(list, "world.cargo_spill");
  if (!runs.length) {
    return finish(bar, { notes: [unfedNote(bar)] });
  }
  const arrival = worstMetric(runs, (run) => run.metrics && run.metrics.timeToNpcArrivalS, "max");
  const values = [
    entry(`salvor arrives after the cargo spill (worst of ${arrival.n} run(s))`, arrival.value, "s", arrival.value <= 30),
  ].filter(Boolean);
  return finish(bar, {
    values,
    coverage: "partial",
    fedBy: runs.map(fedByOf),
    notes: ["the patrol stay-with-wreck/chase clause and the civilian course-change clause are unbenched."],
  });
}

function evaluateB11(bar, list) {
  const shoveRuns = scenarioRuns(list, "feel.shove_magnitude");
  const terrainRuns = scenarioRuns(list, "feel.terrain_slam");
  if (!shoveRuns.length && !terrainRuns.length) {
    return finish(bar, { notes: [unfedNote(bar)] });
  }
  const notes = [];
  const values = [];
  // "Lights at ≥ 30 % ΔV lose the helm ≥ 1 s" only applies at ≥ 30 % ΔV. Below that regime (or with
  // the ΔV share unreported) the clause cannot be evaluated from the shove instrument, and the
  // verdict stays null however good the hard-coded 1.5 s scenario constant looks.
  const regimeRuns = shoveRuns.filter((run) => (
    run.metrics && Number.isFinite(run.metrics.deltaVFractionOfCruise) && run.metrics.deltaVFractionOfCruise >= 0.3
  ));
  const inRegime = regimeRuns.length > 0;
  const helmS = worstMetric(inRegime ? regimeRuns : shoveRuns, (run) => run.metrics && run.metrics.helmLossDurationS, "min");
  const dvMax = worstMetric(shoveRuns, (run) => run.metrics && run.metrics.deltaVFractionOfCruise, "max");
  if (helmS.value != null) {
    const scope = inRegime
      ? `at ≥ 30 % ΔV, worst of ${helmS.n} in-regime run(s)`
      : dvMax.value == null
        ? "ΔV share unreported, ≥ 30 % regime unconfirmed"
        : `measured at only ${Math.round(dvMax.value * 100)} % of cruise, below the ≥ 30 % ΔV regime`;
    values.push(entry(`shove helm-loss duration, scenario constant (${scope})`, helmS.value, "s", helmS.value >= 1.0));
  } else {
    notes.push("the feeding shove runs carried no helmLossDurationS.");
  }
  const helmTerrain = terrainRuns.filter((run) => run.metrics && typeof run.metrics.lostHelm === "boolean");
  if (helmTerrain.length) {
    const all = helmTerrain.every((run) => run.metrics.lostHelm === true);
    values.push(entry(`terrain slam strips the helm (${helmTerrain.length} run(s))`, all ? 1 : 0, "bool", all));
  } else {
    notes.push("the feeding terrain-slam runs carried no lostHelm boolean.");
  }
  const helmEvaluable = inRegime && helmS.value != null;
  const met = helmEvaluable && values.length ? values.every((value) => value.met) : null;
  if (!helmEvaluable) {
    notes.push(
      dvMax.value == null
        ? "the shove runs report no ΔV fraction of cruise, so the ≥ 30 % ΔV regime cannot be confirmed; helm duration is the scenario constant, not a measured curve, and the ≥ 1 s helm clause cannot be evaluated from it."
        : "measured below the ≥ 30 % ΔV regime; helm duration is the scenario constant, not a measured curve, and the ≥ 1 s helm clause cannot be evaluated from it.",
    );
  }
  return finish(bar, {
    values,
    coverage: values.length ? "partial" : "none",
    fedBy: [...shoveRuns, ...terrainRuns].map(fedByOf),
    notes,
    met,
  });
}

// B13's magnitude ceiling, and the float tolerance the comparison is made with.
//
// The live rule (`PLAYER_CONTACT_MAX_CRUISE_FRACTION`, src/core/sg02DynamicBodyOwner.js) caps a
// contact event's CUMULATIVE applied delta-V at exactly 0.10 x cruise, and the bench divides the
// bench's own sum of the per-receipt applied values by the same cruise. The two sums are made in
// different orders, so a run that used the whole budget lands at 0.10000000000000002 and a bare
// `<= 0.1` reads red by one ulp — a failure of arithmetic, not of the game. The tolerance is
// stated here rather than hidden in a rounding step, and it is 1e-6 of cruise: at Kestrel's
// 195 WU/s that is 0.0002 WU/s, far below anything a player could feel and far above float dust.
const B13_MAX_KNOCK_FRACTION = 0.10;
const B13_FRACTION_TOLERANCE = 1e-6;
const b13FractionOk = (value) => value <= B13_MAX_KNOCK_FRACTION + B13_FRACTION_TOLERANCE;

function evaluateB13(bar, list) {
  const crucibleRuns = list.filter((run) => run.bench === "crucible");
  const verbRuns = scenarioRuns(list, "feel.knock_budget");
  if (!crucibleRuns.length && !verbRuns.length) {
    return finish(bar, {
      met: null,
      coverage: "none",
      notes: ["fed only by crucible knock metrics (playerKnockEventsPerMin / maxPlayerKnockFraction) or verbs feel.knock_budget — not in this evaluation input."],
    });
  }
  const notes = [];
  const values = [];
  const fedBy = [...crucibleRuns, ...verbRuns].map(fedByOf);
  let missingRequired = false;
  let measuredFail = false;

  function pushWorst(runs, read, label, unit, pass) {
    let worst = null;
    let n = 0;
    let holes = false;
    for (const run of runs) {
      const value = read(run);
      if (typeof value !== "number" || !Number.isFinite(value)) {
        holes = true;
        continue;
      }
      n += 1;
      if (worst == null || value > worst) worst = value;
    }
    if (worst != null) {
      const ok = pass(worst);
      values.push(entry(`${label} (worst of ${n} run(s))`, worst, unit, ok));
      if (!ok) measuredFail = true;
    } else {
      missingRequired = true;
    }
    if (holes) missingRequired = true;
    return holes;
  }

  if (crucibleRuns.length) {
    const rateHoles = pushWorst(
      crucibleRuns,
      (run) => run.metrics && run.metrics.playerKnockEventsPerMin,
      "contact knocks per minute on the player, crucible",
      "events/min",
      (value) => value <= 2,
    );
    const fracHoles = pushWorst(
      crucibleRuns,
      (run) => run.metrics && run.metrics.maxPlayerKnockFraction,
      "largest single knock, fraction of cruise, crucible",
      "fraction",
      b13FractionOk,
    );
    const headingHoles = pushWorst(
      crucibleRuns,
      (run) => run.metrics && run.metrics.headingChangeEvents,
      "knock events that changed the player's heading, crucible",
      "events",
      (value) => value === 0,
    );
    const jitterMeasuredOnAll = crucibleRuns.every((run) => run.metrics && run.metrics.jitterMeasured === true);
    if (!jitterMeasuredOnAll) {
      missingRequired = true;
      notes.push("visible jitter is unmeasured on this headless Crucible path; a full B13 pass is impossible.");
    } else {
      // Measured from a headed strip's frames of the same cell (measure-fun-loop --knock-strip):
      // after each contact the player was in, no reversal of heading or of motion on the glass
      // inside half a second. Zero events is the clause; the worst run decides.
      const jitterHoles = pushWorst(
        crucibleRuns,
        (run) => run.metrics && run.metrics.jitterEvents,
        "visible jitter events after contact, crucible (headed strip, half-second windows)",
        "events",
        (value) => value === 0,
      );
      if (jitterHoles) notes.push("at least one Crucible run has no visible-jitter event count despite a strip.");
      const src = crucibleRuns.map((run) => run.metrics && run.metrics.jitterSource).find(Boolean);
      if (src) notes.push(`visible jitter read from the headed strip (${src.windows} contact window(s), >= ${src.cadenceFpsMin} fps, real time ${src.realtimeFraction}).`);
    }
    if (rateHoles) notes.push("at least one Crucible run has no finite knock rate; it is retained, not filtered away.");
    if (fracHoles) notes.push("at least one Crucible run has no finite knock fraction of cruise; it is retained, not filtered away.");
    if (headingHoles) notes.push("at least one Crucible run has no measured heading-change count.");
    notes.push("crucible knock counts come from short wave runs (~25 s of flight), not the contract's ten minutes of ordinary flight.");
  }
  if (verbRuns.length) {
    const rateHoles = pushWorst(
      verbRuns,
      (run) => run.metrics && run.metrics.knockEventsPerMinute,
      "contact knocks per minute on the player, verbs feel.knock_budget",
      "events/min",
      (value) => value <= 2,
    );
    const fracHoles = pushWorst(
      verbRuns,
      (run) => run.metrics && run.metrics.maxKnockDeltaVFractionOfCruise,
      "largest single knock, fraction of cruise, verbs feel.knock_budget",
      "fraction",
      b13FractionOk,
    );
    const headingHoles = pushWorst(
      verbRuns,
      (run) => run.metrics && run.metrics.headingChangeEvents,
      "knock events that changed the player's heading",
      "events",
      (value) => value === 0,
    );
    // The jitter clause on the flight bench. The strip harness only drives Crucible scenarios and
    // this corridor has no browser route, so — Crucible first — the PICTURES witness for "never
    // produces visible jitter" is the Crucible strip. What the flight bench can add is the strip's
    // OWN DEFINITIONS read off the sim at the strip's frame cadence and at 60 Hz. That is accepted
    // here only when this same evaluation also carries a normal-speed Crucible strip that measured
    // jitter from frames on the same source identity: without the pictures, a headless number
    // answering a question about what a viewer sees is not evidence, and the clause stays open.
    const stripWitness = crucibleStripWitness(crucibleRuns);
    const simSampledOnAll = verbRuns.every((run) => run.metrics && run.metrics.jitterSimSampled);
    if (stripWitness && simSampledOnAll) {
      const jitterHoles = pushWorst(
        verbRuns,
        (run) => simSampledJitterEvents(run.metrics && run.metrics.jitterSimSampled),
        "visible jitter events after contact, verbs feel.knock_budget (the strip's definitions read from the sim at frame cadence and at 60 Hz)",
        "events",
        (value) => value === 0,
      );
      if (jitterHoles) notes.push("at least one feel.knock_budget run measured no sim-sampled jitter despite publishing the block.");
      notes.push(
        "flight-bench jitter is the strip's definition read from the sim at frame cadence; the pictures witness is the Crucible strip"
        + ` (${stripWitness.manifest}).`,
      );
    } else {
      missingRequired = true;
      notes.push(
        simSampledOnAll
          ? "visible jitter on the flight bench has no pictures behind it: this evaluation carries no normal-speed Crucible strip whose frames measured jitter, so the clause stays open."
          : "visible jitter is unmeasured on the headless verb knock-budget path; a full B13 pass is impossible.",
      );
    }
    notes.push("the lateral-velocity sign-flip proxy (jitterEvents/jitterMaxSignFlips) is reported beside the clause and never folded into it.");
    if (rateHoles || fracHoles || headingHoles) {
      notes.push("a feel.knock_budget run is missing a required component and cannot hide behind a complete sibling.");
    }
  }
  notes.push("the visible-jitter clause and the legible-deliberate-event clause are unbenched unless a headed capture sets jitterMeasured.");
  notes.push(
    `the largest-knock ceiling is ${B13_MAX_KNOCK_FRACTION} of cruise compared with a tolerance of `
    + `${B13_FRACTION_TOLERANCE}: the live rule caps a contact event's cumulative applied delta-V at `
    + 'exactly that fraction, and the bench sums the per-receipt values in a different order, so a run '
    + 'that spends the whole budget lands one ulp above it. The tolerance is float slack, never headroom '
    + `— at Kestrel cruise that is 0.0002 WU/s.`,
  );
  const met = measuredFail ? false : (missingRequired ? null : verdictFromValues(values));
  return finish(bar, { values, coverage: "partial", fedBy, notes, met });
}

/**
 * The pictures, if this evaluation has any: a Crucible run whose jitter came from a normal-speed
 * headed strip's frames. `attachStripJitter` sets `jitterMeasured` only for a v2 manifest that ran
 * at or above the normal-speed floor and whose own measurement was `measured`, so this is the
 * frames talking, not a promise that frames exist.
 */
function crucibleStripWitness(crucibleRuns) {
  for (const run of crucibleRuns) {
    const m = run && run.metrics;
    if (m && m.jitterMeasured === true && m.jitterSource && m.jitterSource.manifest) {
      return m.jitterSource;
    }
  }
  return null;
}

/**
 * Worst of the two cadences. A wobble that only the 60 Hz reading can see is still a wobble the
 * hull performed; a strip simply could not photograph it. Either cadence unmeasured is a hole.
 */
function simSampledJitterEvents(block) {
  if (!block) return null;
  const parts = [block.atStripCadence, block.at60Hz];
  let worst = 0;
  for (const part of parts) {
    if (!part || part.measured !== true || !Number.isFinite(part.events)) return null;
    if (part.events > worst) worst = part.events;
  }
  return worst;
}

const BAR_EVALUATORS = {
  B1: evaluateB1,
  B2: evaluateB2,
  B3: evaluateB3,
  B4: evaluateB4,
  B5: evaluateB5,
  B6: evaluateB6,
  B7: evaluateB7,
  B8: evaluateB8,
  B9: evaluateUnreachable,
  B10: evaluateB10,
  B11: evaluateB11,
  B12: evaluateUnreachable,
  B13: evaluateB13,
};
