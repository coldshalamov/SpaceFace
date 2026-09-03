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

function barById(evaluation, id) {
  const bar = evaluation.bars.find((entry) => entry.id === id);
  assert.ok(bar, `bar ${id} must be present in the evaluation`);
  return bar;
}

function assertValueShape(bar) {
  assert.ok(bar.values.length >= 1, `${bar.id} must carry at least one measured value`);
  for (const value of bar.values) {
    assert.equal(typeof value.value, "number", `${bar.id} value must be a number`);
    assert.ok(Number.isFinite(value.value), `${bar.id} value must be finite`);
    assert.equal(typeof value.met, "boolean", `${bar.id} value must carry a boolean met flag`);
    assert.ok(value.label.length > 0 && value.unit.length > 0, `${bar.id} value needs label and unit`);
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
    verbRun("feel.shove_magnitude", { deltaVFractionOfCruise: 0.31, barB4Met: false }),
  ]);
  assert.equal(barById(b4High, "B4").met, true);

  // B13: pinned verb-source metric names; bench-internal barMet ignored.
  const b13Pass = evaluateBars([
    verbRun("feel.knock_budget", {
      knockEventsPerMinute: 1.0, maxKnockDeltaVFractionOfCruise: 0.08, headingChangeEvents: 0, barMet: true,
    }),
  ]);
  const b13PassBar = barById(b13Pass, "B13");
  assert.equal(b13PassBar.met, true);
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
