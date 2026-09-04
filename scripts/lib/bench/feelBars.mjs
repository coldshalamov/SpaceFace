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
    scenarioIds: ["feel.shove_magnitude", "feel.terrain_slam"],
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
      const value = entry(item.label || bar.id, Number(item.value), item.unit || "", item.met === true);
      if (!value) continue;
      provided.push(value);
      const ref = fedByOf(run);
      if (!fedBy.includes(ref)) fedBy.push(ref);
      if (item.note) notes.push(String(item.note));
    }
  }
  if (!provided.length) return;
  // The static notes on a bar describe the inline STAND-IN scenarios ("unbenched", "scenario
  // constant", "not instrumented"). Once a real-path module feeds rows for this bar, those notes
  // would read to the owner as "still unmeasured" beside a measured number — drop them and keep
  // only what the feeding runs said (FORCE, 2026-09-04).
  bar.notes = "";
  bar.values = [...(bar.values || []), ...provided];
  const existingFed = bar.fedBy || [];
  bar.fedBy = [...existingFed, ...fedBy.filter((ref) => !existingFed.includes(ref))];
  bar.reachable = true;
  if (bar.coverage !== "full") bar.coverage = "partial";
  bar.met = verdictFromValues(bar.values);
  if (notes.length) bar.notes = [bar.notes, ...notes].filter(Boolean).join(" ");
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
  if (!values.length) return null;
  return values.every((value) => value.met === true);
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
    const value = Number(read(run));
    if (!Number.isFinite(value)) continue;
    n += 1;
    if (worst == null || (mode === "min" ? value < worst : value > worst)) worst = value;
  }
  return { value: worst, n };
}

function entry(label, value, unit, met) {
  if (!Number.isFinite(value)) return null;
  return { label, value, unit, met: met === true };
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
  const dv = worstMetric(runs, (run) => run.metrics && run.metrics.deltaVFractionOfCruise, "min");
  const values = [
    entry(`shove ΔV, fraction of light-hostile cruise (worst of ${dv.n} run(s))`, dv.value, "fraction", dv.value >= 0.3),
  ].filter(Boolean);
  return finish(bar, {
    values,
    coverage: "partial",
    fedBy: runs.map(fedByOf),
    notes: [
      "the verdict applies the contract's 0.30 threshold; the bench-internal barB4Met boolean uses a looser 0.15 and is ignored here.",
      "The starter-gun ≥ 5 % clause and the faster-along-its-motion clause are unbenched.",
    ],
  });
}

function evaluateB5(bar, list) {
  const runs = scenarioRuns(list, "feel.shove_magnitude");
  if (!runs.length) {
    return finish(bar, { notes: [unfedNote(bar)] });
  }
  const depths = worstMetric(runs, (run) => run.metrics && run.metrics.screenDepths, "min");
  const values = [
    entry(`displacement 2 s after the shove, screen depths (worst of ${depths.n} run(s))`, depths.value, "screen depths", depths.value >= 1.0),
  ].filter(Boolean);
  return finish(bar, {
    values,
    coverage: "partial",
    fedBy: runs.map(fedByOf),
    notes: ["the \"has not fired\" clause is not instrumented by the verb bench."],
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
  notes.push("the heavy-side clause (≤ 15 % hull lost, helm kept at the same speed) is unbenched.");
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
      "the verb scenario swings at cruise (195 WU/s) on an 80 WU line, not the contract's 1.5× cruise on a 100 WU line around a heavy anchor.",
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
  notes.push(
    "the universal-curve sweep (one helm-loss function of ΔV ÷ cruise and attacker ÷ victim mass across guns, throws, flings and collisions) is unbenched.",
  );
  return finish(bar, {
    values,
    coverage: values.length ? "partial" : "none",
    fedBy: [...shoveRuns, ...terrainRuns].map(fedByOf),
    notes,
    met,
  });
}

function evaluateB13(bar, list) {
  const crucibleRuns = list.filter(
    (run) =>
      run.bench === "crucible"
      && run.metrics
      && Number.isFinite(run.metrics.playerKnockEventsPerMin)
      && Number.isFinite(run.metrics.maxPlayerKnockFraction),
  );
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
  if (crucibleRuns.length) {
    const rate = worstMetric(crucibleRuns, (run) => run.metrics.playerKnockEventsPerMin, "max");
    const max = worstMetric(crucibleRuns, (run) => run.metrics.maxPlayerKnockFraction, "max");
    values.push(entry(`contact knocks per minute on the player, crucible (worst of ${rate.n} run(s))`, rate.value, "events/min", rate.value <= 2));
    values.push(entry(`largest single knock, fraction of cruise, crucible (worst of ${max.n} run(s))`, max.value, "fraction", max.value <= 0.1));
    notes.push("crucible knock counts come from short wave runs (~25 s of flight), not the contract's ten minutes of ordinary flight.");
  }
  if (verbRuns.length) {
    const rate = worstMetric(verbRuns, (run) => run.metrics && run.metrics.knockEventsPerMinute, "max");
    const max = worstMetric(verbRuns, (run) => run.metrics && run.metrics.maxKnockDeltaVFractionOfCruise, "max");
    const heading = worstMetric(verbRuns, (run) => run.metrics && run.metrics.headingChangeEvents, "max");
    if (rate.value != null) {
      values.push(entry(`contact knocks per minute on the player, verbs feel.knock_budget (worst of ${rate.n} run(s))`, rate.value, "events/min", rate.value <= 2));
    }
    if (max.value != null) {
      values.push(entry(`largest single knock, fraction of cruise, verbs feel.knock_budget (worst of ${max.n} run(s))`, max.value, "fraction", max.value <= 0.1));
    }
    if (heading.value != null) {
      values.push(entry(`knock events that changed the player's heading (worst of ${heading.n} run(s); contract target zero)`, heading.value, "events", heading.value === 0));
    }
  }
  notes.push("the visible-jitter clause and the legible-deliberate-event clause are unbenched.");
  return finish(bar, { values, coverage: "partial", fedBy, notes });
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
