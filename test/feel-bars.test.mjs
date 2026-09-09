// test/feel-bars.test.mjs — FEEL_CONTRACT §B bar registry + measurer verdict engine (PQ-173.01).
// Run: node --test test/feel-bars.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { FEEL_BARS, SCREEN_DEPTH_WU, evaluateBars } from "../scripts/lib/bench/feelBars.mjs";

const CONTRACT_PATH = fileURLToPath(new URL("../design/FEEL_CONTRACT.md", import.meta.url));

const EXPECTED_IDS = [
  "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B11", "B12", "B13",
];

const EXPECTED_KEYS = {
  B1: "feel.earned_speed_kept",
  B2: "feel.reversal_course",
  B3: "feel.screen_crossing",
  B4: "feel.shove_magnitude",
  B5: "feel.shove_displacement",
  B6: "feel.terrain_slam",
  B7: "feel.rope_swing_release",
  B8: "feel.stroke_speed",
  B9: "feel.impact_feedback",
  B10: "world.reaction_trio",
  B11: "feel.hitstun_curve",
  B12: "proof.sixty_seconds",
  B13: "feel.knock_budget",
};

function contractBarIds() {
  const text = readFileSync(CONTRACT_PATH, "utf8");
  const section = text.slice(text.indexOf("## B. The bars"), text.indexOf("## C. Experiment bands"));
  const ids = [...section.matchAll(/^\| \*\*(B\d+) /gm)].map((match) => match[1]);
  assert.ok(ids.length > 0, "must parse at least one §B row from FEEL_CONTRACT.md");
  return ids;
}

function verbRun(scenarioId, metrics, seed = 4242) {
  return { bench: "verbs", scenarioId, seed, metrics };
}

function forceMetrics(overrides = {}) {
  return { deltaVFractionOfCruise: 0.31, starterDeltaVFractionOfCruise: 0.05,
    mineDeltaVFractionOfCruise: 0.45, alongSpeedBeforeFractionOfCruise: 0.95,
    alongSpeedRatio: 1.2, screenDepths: 1.04, victimShots: 0, controlArmShots: 2, ...overrides };
}

function barById(evaluation, id) {
  const bar = evaluation.bars.find((entry) => entry.id === id);
  assert.ok(bar, `bar ${id} must be present in the evaluation`);
  return bar;
}

function assertValueShape(bar) {
  const measured = bar.values.filter((value) => value && value.unmeasured !== true);
  const gaps = bar.values.filter((value) => value && value.unmeasured === true);
  assert.ok(
    measured.length >= 1 || gaps.length >= 1,
    `${bar.id} must carry at least one measured value or a named unmeasured gap`,
  );
  for (const value of measured) {
    assert.equal(typeof value.value, "number", `${bar.id} value must be a number`);
    assert.ok(Number.isFinite(value.value), `${bar.id} value must be finite`);
    assert.equal(typeof value.met, "boolean", `${bar.id} value must carry a boolean met flag`);
    assert.ok(value.label.length > 0 && value.unit.length > 0, `${bar.id} value needs label and unit`);
  }
  for (const gap of gaps) {
    assert.equal(gap.value, null, `${bar.id} unmeasured gap must keep value null, never 0`);
    assert.equal(gap.met, false);
    assert.ok(gap.label.length > 0);
  }
}

test("registry integrity: 13 bars, ids and keys match FEEL_CONTRACT §B exactly", () => {
  assert.equal(FEEL_BARS.length, 13);
  assert.deepEqual(FEEL_BARS.map((bar) => bar.id), EXPECTED_IDS);
  const parsed = contractBarIds();
  assert.deepEqual([...parsed].sort(), [...EXPECTED_IDS].sort(), "registry ids drifted from the contract §B table");
  for (const bar of FEEL_BARS) {
    assert.equal(bar.key, EXPECTED_KEYS[bar.id], `${bar.id} key must equal the contract scenario id`);
    assert.ok(bar.title.length > 0 && bar.statement.length > 0 && bar.target.length > 0);
    if (bar.benchReachable) {
      assert.ok(bar.scenarioIds.length > 0, `${bar.id} reachable bar must name feeding scenarios`);
    } else {
      assert.ok(bar.unreachableReason && bar.unreachableReason.length > 0, `${bar.id} needs an unreachableReason`);
    }
  }
});

test("evaluateBars on bench-shaped fixture: every reachable bar yields a numeric value", () => {
  const runs = [
    verbRun("feel.rope_swing_release", {
      initialSpeed: 195, finalSpeed: 187.2, speedRetainedFraction: 0.96, maxStretchRatio: 0.09,
      lineHeld: false, barMet: true,
    }),
    verbRun("feel.shove_magnitude", {
      deltaV: 30, deltaVFractionOfCruise: 0.31, displacement2s: 120, screenDepths: 1.04,
      helmLossDurationS: 1.5, barB4Met: true, barB5Met: true,
    }),
    verbRun("feel.stroke_speed", {
      cruiseSpeed: 195, meanSpeed: 156, meanSpeedFraction: 0.8, minSpeed: 78, minSpeedFraction: 0.4, barMet: true,
    }),
    verbRun("feel.terrain_slam", {
      closingSpeed: 148.2, closingRatio: 0.76, impactDamage: 90, hullLostFraction: 0.9,
      lostHelm: true, isLethal: true, barMet: true,
    }),
    verbRun("world.cargo_spill", { timeToNpcArrivalS: 3.25, podsAttracted: 3, salvorDistance: 450, barMet: true }),
    {
      bench: "flight",
      scenarioId: "flight-reversal",
      seed: 13502,
      metrics: {
        scenarioId: "M3",
        seed: 13502,
        hulls: {
          ship_kestrel: { velocity180TimeS: 2.4, nose180TimeS: 1.9 },
          ship_atlas: { velocity180TimeS: 5.2, nose180TimeS: 3.3 },
        },
      },
    },
    {
      bench: "crucible",
      ruleset: "swarm",
      arenaId: "cinder_sluice",
      loadoutId: "energy_baseline",
      seed: 4242,
      metrics: { playerKnockEventsPerMin: 2.5, maxPlayerKnockFraction: 0.08, b13Met: true },
    },
  ];

  const evaluation = evaluateBars(runs);
  assert.equal(evaluation.bars.length, 13);
  assert.deepEqual(evaluation.bars.map((bar) => bar.id), EXPECTED_IDS);
  assert.equal(evaluation.summary.reachable, 11);
  assert.equal(evaluation.summary.unreachable, 2);
  assert.equal(evaluation.summary.met, evaluation.bars.filter((bar) => bar.met === true).length);
  assert.equal(evaluation.summary.partial, evaluation.bars.filter((bar) => bar.coverage === "partial").length);

  for (const bar of evaluation.bars.filter((entry) => entry.reachable)) assertValueShape(bar);

  const unreachable = barById(evaluation, "B9");
  assert.equal(unreachable.reachable, false);
  assert.equal(unreachable.met, null);
  assert.equal(unreachable.coverage, "none");
  assert.ok(unreachable.notes.length > 0);
  const proof = barById(evaluation, "B12");
  assert.equal(proof.reachable, false);
  assert.ok(proof.notes.length > 0);
});

test("verdicts are recomputed from raw numbers against contract thresholds", () => {
  // B4: contract threshold 0.30 (the bench's internal 0.15 boolean must not leak through).
  const b4Low = evaluateBars([
    verbRun("feel.shove_magnitude", { deltaVFractionOfCruise: 0.154, barB4Met: true }),
  ]);
  assert.equal(barById(b4Low, "B4").met, false, "0.154 of cruise is under the contract's 30 % shove bar");

  const b4High = evaluateBars([
    verbRun("feel.shove_magnitude", forceMetrics({ barB4Met: false })),
  ]);
  assert.equal(barById(b4High, "B4").met, true);

  // B13: pinned verb-source metric names; bench-internal barMet ignored.
  const b13Pass = evaluateBars([
    verbRun("feel.knock_budget", {
      knockEventsPerMinute: 1.0, maxKnockDeltaVFractionOfCruise: 0.08, headingChangeEvents: 0, barMet: true,
    }),
  ]);
  const b13PassBar = barById(b13Pass, "B13");
  assert.notEqual(b13PassBar.met, true, "headless verb knock budget cannot full-pass B13 without measured jitter");
  assert.equal(b13PassBar.coverage, "partial");
  assert.ok(b13PassBar.notes.includes("jitter"), "full-contract notes must name visible jitter as unmeasured");
  assert.ok(b13PassBar.values.every((value) => value.met === true), "measured rate/magnitude/heading components still pass");
  assert.deepEqual(b13PassBar.fedBy, ["verbs/feel.knock_budget/s4242"]);

  const b13Fail = evaluateBars([
    verbRun("feel.knock_budget", {
      knockEventsPerMinute: 1.0, maxKnockDeltaVFractionOfCruise: 0.2, headingChangeEvents: 0, barMet: true,
    }),
  ]);
  assert.equal(barById(b13Fail, "B13").met, false, "a 20 %-of-cruise knock breaks the 10 % ceiling");

  // B7: both measured clauses pass their contract sentences.
  const b7 = evaluateBars([
    verbRun("feel.rope_swing_release", { speedRetainedFraction: 0.96, maxStretchRatio: 0.09, barMet: false }),
  ]);
  assert.equal(barById(b7, "B7").met, true, "0.96 kept and 0.09 stretch pass ≥ 95 % / < 10 %");
});

test("coverage honesty: bars with no feeding run report coverage none and explain the gap", () => {
  const evaluation = evaluateBars([
    verbRun("feel.rope_swing_release", { speedRetainedFraction: 0.96, maxStretchRatio: 0.09 }),
  ]);
  for (const id of ["B2", "B3", "B4", "B5", "B6", "B8", "B10", "B11", "B13"]) {
    const bar = barById(evaluation, id);
    assert.equal(bar.coverage, "none", `${id} has no feeding run in this evaluation input`);
    assert.equal(bar.met, null, `${id} must not claim a verdict without data`);
    assert.ok(bar.notes.length > 0, `${id} must explain the gap in notes`);
    assert.ok(
      bar.notes.includes("not in this evaluation input"),
      `${id} gap note must be scope-neutral (accurate for single-run and whole-set evaluation)`,
    );
    assert.deepEqual(bar.values, []);
    assert.deepEqual(bar.fedBy, []);
  }
  const fed = barById(evaluation, "B1");
  assert.equal(fed.coverage, "partial");
  assert.equal(fed.met, null, "only the 5 s release clause was measured; B1's own ≥ 99 % @ 10 s clauses are kernel-level");
  assert.ok(fed.notes.includes("release-retention clause"));
  assert.ok(fed.notes.includes("kernel-level"));
  assert.deepEqual(fed.fedBy, ["verbs/feel.rope_swing_release/s4242"]);
});

test("empty measurement: sane summary, unreachable bars still appear, B13 explains itself", () => {
  const evaluation = evaluateBars([]);
  assert.deepEqual(evaluation.summary, { reachable: 11, met: 0, partial: 0, unreachable: 2 });
  assert.equal(evaluation.bars.length, 13);
  assert.ok(barById(evaluation, "B9").notes.includes("presentation-layer"));
  assert.ok(
    barById(evaluation, "B13").notes.includes("fed only by crucible knock metrics"),
  );
});

test("B3 is derived from the measured cruise, not fabricated", () => {
  const slow = evaluateBars([verbRun("feel.stroke_speed", { cruiseSpeed: 95 })]);
  const bar = barById(slow, "B3");
  assert.ok(Math.abs(bar.values[0].value - SCREEN_DEPTH_WU / 95) < 1e-9);
  assert.equal(bar.values[0].met, true, "115/95 s ≈ 1.21 s crossing meets the ≥ 1.2 s bar");
  assert.ok(bar.notes.includes("derived"));
  const fast = evaluateBars([verbRun("feel.stroke_speed", { cruiseSpeed: 115 })]);
  const fastBar = barById(fast, "B3");
  assert.equal(fastBar.values[0].value, SCREEN_DEPTH_WU / 115);
  assert.equal(fastBar.values[0].met, false, "a 1.0 s crossing is under the 1.2 s bar");
});

test("B1 never claims met from the 5 s release clause alone", () => {
  const evaluation = evaluateBars([
    verbRun("feel.rope_swing_release", { speedRetainedFraction: 0.99, maxStretchRatio: 0.05, barMet: true }),
  ]);
  const bar = barById(evaluation, "B1");
  assert.equal(bar.values.length, 1, "the measured release-retention row is kept");
  assert.equal(bar.values[0].met, true, "the 5 s release row keeps its own ≥ 95 % clause check");
  assert.equal(bar.met, null, "≥ 99 % at 10 s hands-off/forward-held are kernel-level and unbenched");
  assert.ok(bar.notes.includes("release-retention clause"), "notes must name exactly which clause was measured");
  assert.ok(bar.notes.includes("kernel-level"), "notes must name which clauses remain unbenched");
});

test("B11 stays null below the ≥ 30 % ΔV regime and evaluates the clause only in-regime", () => {
  const below = evaluateBars([
    verbRun("feel.shove_magnitude", { deltaVFractionOfCruise: 0.154, helmLossDurationS: 1.5, barB4Met: true }),
    verbRun("feel.terrain_slam", { closingRatio: 0.76, hullLostFraction: 0.9, lostHelm: true, isLethal: true, barMet: true }),
  ]);
  const bar = barById(below, "B11");
  assert.equal(bar.met, null, "15.4 % ΔV is below the regime where the ≥ 1 s helm clause even applies");
  assert.equal(bar.values.length, 2, "both measured values are kept for the receipt");
  assert.ok(bar.notes.includes("≥ 30 % ΔV regime"));
  assert.ok(bar.notes.includes("scenario constant, not a measured curve"));

  const inRegime = evaluateBars([
    verbRun("feel.shove_magnitude", { deltaVFractionOfCruise: 0.31, helmLossDurationS: 1.5 }),
  ]);
  assert.equal(barById(inRegime, "B11").met, true, "in-regime helm ≥ 1 s evaluates the clause");

  const inRegimeFail = evaluateBars([
    verbRun("feel.shove_magnitude", { deltaVFractionOfCruise: 0.4, helmLossDurationS: 0.4 }),
  ]);
  assert.equal(barById(inRegimeFail, "B11").met, false, "an in-regime helm duration under 1 s fails the clause");
});

test("every reachable bar's target parses to a diff direction, except the B11 universality claim", async () => {
  // Drift guard: parseTargetDirection reads a bar target's FIRST clause to decide whether a
  // numeric change moved toward the target. A registry edit that makes a headline target
  // sign-less (or buries the signed clause behind an unsigned one) silently turns that bar's
  // diff into "unknown", which the §3.6 verdict counts as a regression. B11 is the one
  // intentional exception: "one universal curve …" has no headline sign, so any change on it
  // reverts — conservative by design.
  const { parseTargetDirection } = await import("../scripts/measure-fun-loop.mjs");

  for (const bar of FEEL_BARS) {
    const direction = parseTargetDirection(bar.target);
    if (!bar.benchReachable) continue; // unreachable bars carry no numeric headline
    if (bar.id === "B11") {
      assert.equal(direction, null, "B11 stays intentionally undecidable — changes on it revert");
      continue;
    }
    assert.notEqual(direction, null, `${bar.id} target must lead with a signed first clause: "${bar.target}"`);
  }
  assert.equal(parseTargetDirection(FEEL_BARS.find((b) => b.id === "B10").target), "lower",
    "B10's headline is salvor arrival seconds — lower is better");
});

test("B13 retains a Crucible run with a missing fraction/heading and cannot pass behind a calm sibling", () => {
  const evaluation = evaluateBars([
    {
      bench: "crucible",
      arenaId: "helios_core",
      loadoutId: "energy_baseline",
      seed: 4242,
      metrics: {
        playerKnockEventsPerMin: 0.4,
        maxPlayerKnockFraction: 0.02,
        headingChangeEvents: 0,
        jitterMeasured: false,
      },
    },
    {
      bench: "crucible",
      arenaId: "cinder_sluice",
      loadoutId: "energy_baseline",
      seed: 4242,
      metrics: {
        playerKnockEventsPerMin: 0.5,
        maxPlayerKnockFraction: null,
        headingChangeEvents: null,
        jitterMeasured: false,
      },
    },
  ]);
  const bar = barById(evaluation, "B13");
  assert.ok(
    bar.fedBy.includes("crucible/helios_core/energy_baseline/s4242"),
    "the complete run is retained",
  );
  assert.ok(
    bar.fedBy.includes("crucible/cinder_sluice/energy_baseline/s4242"),
    "the incomplete run must not be filtered away",
  );
  assert.notEqual(bar.met, true, "missing fraction/heading/jitter cannot hide behind a calm sibling");
  assert.equal(bar.met, null, "missing required components make B13 undecidable, not a pass");
  assert.ok(bar.notes.includes("jitter"));
  assert.ok(bar.notes.includes("fraction") || bar.notes.includes("heading"));
});

test("B13 full-contract verdict is never yes while visible jitter is unmeasured", () => {
  const evaluation = evaluateBars([
    {
      bench: "crucible",
      arenaId: "helios_core",
      loadoutId: "energy_baseline",
      seed: 4242,
      metrics: {
        playerKnockEventsPerMin: 0.2,
        maxPlayerKnockFraction: 0.01,
        headingChangeEvents: 0,
        jitterMeasured: false,
        b13Met: true,
      },
    },
  ]);
  const bar = barById(evaluation, "B13");
  assert.notEqual(bar.met, true);
  assert.ok(bar.values.some((value) => value.met === true), "component rows are preserved");
  assert.ok(bar.notes.toLowerCase().includes("jitter"));
});

test("provided unmeasured null stays a named gap: never numeric zero, keeps fed-by and note", () => {
  const run = verbRun("world.reaction_trio", {
    bars: [
      {
        bar: "B10",
        label: "patrol decides stay-or-chase after a witnessed kill",
        value: null,
        unit: "s",
        met: false,
        unmeasured: true,
        note: "UNMEASURED — player had no body. This is not a reading of the world.",
      },
      {
        bar: "B10",
        label: "a live NPC reaches spilled cargo",
        value: 12,
        unit: "s",
        met: true,
      },
    ],
  });
  const bar = barById(evaluateBars([run]), "B10");
  const gap = bar.values.find((value) => value.unmeasured === true);
  assert.ok(gap, "the unmeasured provided row is retained");
  assert.equal(gap.value, null, "null must not be Number()-coerced to 0");
  assert.notEqual(gap.value, 0);
  assert.equal(gap.met, false);
  assert.deepEqual(bar.fedBy, ["verbs/world.reaction_trio/s4242"]);
  assert.ok(bar.notes.includes("UNMEASURED — player had no body"));
  assert.equal(bar.met, null, "an unmeasured hole cannot promote the bar to true");
  assert.notEqual(bar.met, true);
  const numeric = bar.values.filter((value) => typeof value.value === "number" && Number.isFinite(value.value));
  assert.equal(numeric.length, 1);
  assert.equal(numeric[0].value, 12);
});

test("generic provided numeric subset cannot promote an evaluator-null or evaluator-false bar", () => {
  const b13 = barById(evaluateBars([{
    bench: "crucible",
    arenaId: "helios_core",
    loadoutId: "energy_baseline",
    seed: 4242,
    metrics: {
      playerKnockEventsPerMin: 0.2,
      maxPlayerKnockFraction: 0.01,
      headingChangeEvents: 0,
      jitterMeasured: false,
      bars: [
        { bar: "B13", label: "extra calm knock row", value: 0.1, unit: "events/min", met: true },
      ],
    },
  }]), "B13");
  assert.equal(b13.met, null, "passing provided numbers must not erase B13's missing-jitter null");
  assert.notEqual(b13.met, true);
  assert.ok(b13.notes.toLowerCase().includes("jitter"));

  const b4Fail = barById(evaluateBars([
    verbRun("feel.shove_magnitude", {
      deltaVFractionOfCruise: 0.1,
      bars: [{ bar: "B4", label: "provided shove that looks like a pass", value: 0.4, unit: "fraction", met: true }],
    }),
  ]), "B4");
  assert.equal(b4Fail.met, false, "a measured evaluator fail stays false when a provided subset passes");
});

test("a complete scenario-provided numeric set can establish B9", () => {
  const passing = verbRun("feel.impact_feedback", {
    bars: [
      { bar: "B9", label: "hitstop", value: 12, unit: "ms", met: true },
      { bar: "B9", label: "trauma", value: 0.4, unit: "trauma", met: true },
      { bar: "B9", label: "octaves", value: 1.2, unit: "octaves", met: true },
      { bar: "B9", label: "loudness", value: 14, unit: "dB", met: true },
      { bar: "B9", label: "snap", value: 8, unit: "ms", met: true },
    ],
  });
  const established = barById(evaluateBars([passing]), "B9");
  assert.equal(established.reachable, true);
  assert.equal(established.met, true, "a complete finite provided set may establish the unreachable bar");
  assert.equal(established.values.length, 5);

  const mixed = verbRun("feel.impact_feedback", {
    bars: [
      { bar: "B9", label: "hitstop", value: 12, unit: "ms", met: true },
      { bar: "B9", label: "trauma", value: null, unit: "trauma", met: false, unmeasured: true, note: "UNMEASURED — no camera" },
    ],
  });
  const incomplete = barById(evaluateBars([mixed]), "B9");
  assert.equal(incomplete.met, null);
  assert.notEqual(incomplete.met, true);
  assert.equal(incomplete.values.find((value) => value.unmeasured).value, null);
});

test("worstMetric treats null as missing, not zero, through the public evaluator", () => {
  const withNull = barById(evaluateBars([
    verbRun("feel.shove_magnitude", { deltaVFractionOfCruise: null, screenDepths: 1.2 }),
  ]), "B4");
  assert.ok(withNull.values.every((row) => row.unmeasured && row.value === null), "null metrics stay named missing rows, never zero");
  assert.equal(withNull.met, null);
  assert.notEqual(withNull.met, false, "unmeasured is not a measured fail at zero");

  const withZero = barById(evaluateBars([
    verbRun("feel.shove_magnitude", { deltaVFractionOfCruise: 0 }),
  ]), "B4");
  assert.equal(withZero.values[0].value, 0, "a genuinely measured 0 is kept");
  assert.equal(withZero.met, false);

  const withString = barById(evaluateBars([
    verbRun("feel.shove_magnitude", { deltaVFractionOfCruise: "0.31" }),
  ]), "B4");
  assert.ok(withString.values.every((row) => row.unmeasured && row.value === null), "string metrics are not Number()-coerced");
  assert.equal(withString.met, null);
});

test("B4 and B5 consume every force metric and fail closed across seeds", () => {
  const run = (metrics, seed = 4242) => verbRun("feel.shove_magnitude", metrics, seed);
  const complete = evaluateBars([run(forceMetrics())]);
  assert.equal(barById(complete, "B4").met, true);
  assert.equal(barById(complete, "B5").met, true);
  for (const key of ["deltaVFractionOfCruise", "starterDeltaVFractionOfCruise", "mineDeltaVFractionOfCruise", "alongSpeedBeforeFractionOfCruise", "alongSpeedRatio"]) {
    const incomplete = forceMetrics({ [key]: null });
    incomplete.bars = [{ bar: "B4", label: "passing subset", value: 1, unit: "fraction", met: true }];
    assert.notEqual(barById(evaluateBars([run(forceMetrics()), run(incomplete, 8008)]), "B4").met, true, `${key} cannot be hidden by another seed or provided row`);
  }
  assert.equal(barById(evaluateBars([run(forceMetrics({ starterDeltaVFractionOfCruise: 0.049999995989695144 }))]), "B4").met, true, "Float32 integration noise at exactly 5% is within the explicit 1e-7 fraction tolerance");
  for (const [key, value] of [["starterDeltaVFractionOfCruise", 0.0499], ["mineDeltaVFractionOfCruise", 0.449], ["deltaVFractionOfCruise", 0.299], ["alongSpeedBeforeFractionOfCruise", 0.89], ["alongSpeedRatio", 1]]) {
    assert.equal(barById(evaluateBars([run(forceMetrics({ [key]: value }))]), "B4").met, false, `${key} obeys its unchanged threshold`);
  }
  for (const key of ["screenDepths", "victimShots", "controlArmShots"]) {
    assert.notEqual(barById(evaluateBars([run(forceMetrics({ [key]: null }))]), "B5").met, true);
  }
  for (const delta of [{ screenDepths: 0.999 }, { victimShots: 1 }, { controlArmShots: 0 }]) {
    assert.equal(barById(evaluateBars([run(forceMetrics(delta))]), "B5").met, false);
  }
});
