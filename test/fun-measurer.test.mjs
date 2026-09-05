// test/fun-measurer.test.mjs — PQ-173.01: the measurer (fun metrics, measure CLI, diff mode).
//
// Law: design/program/FUN_CONVERGENCE_LOOP.md §3.2 MEASURE, §3.6 COMPARE. Fixture run objects are
// shaped like the committed bench output
// (design/program/roadmap/receipts/fun-loop/runs/2026-09-03-fun-bench-summary.json).
// The full default bench is never run here — the suite stays seconds-scale.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deriveFunMetrics } from '../scripts/lib/bench/funMetrics.mjs';
import { evaluateBars } from '../scripts/lib/bench/feelBars.mjs';
import {
  renderBenchSeedMarkdown,
  buildRunBlock,
  renderRunMarkdown,
  buildMeasureDiff,
  renderDiffMarkdown,
  parseTargetDirection,
  compareCompatibleSweeps,
  listFunLoopHarnessFiles,
  computeFunLoopHarnessDigest,
  computeProductionSourceIdentity,
} from '../scripts/measure-fun-loop.mjs';
import { spawnSync, execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

const HASH64 = (c) => c.repeat(64);

// A synthetic crucible run shaped like real bench output, with the enriched per-tick trace the
// crucible bench emits after PQ-173.01 trace enrichment (shots, kills with causes, collateral,
// player knocks, wave milestones).
function crucibleRunWithTrace() {
  return {
    bench: 'crucible',
    ruleset: 'swarm',
    arenaId: 'helios_core',
    loadoutId: 'physics_toolkit',
    seed: 4242,
    waveCount: 3,
    durationMs: 12,
    runHash: HASH64('a'),
    metrics: {
      totalKills: 5,
      totalShots: 8,
      totalHits: 5,
      hitAccuracy: 0.625,
      totalDamageDealt: 225,
      totalDamageTaken: 0,
      verbsUsedCount: 3,
      verbsPerMinute: 5,
      momentsPerMinute: 2,
      nothingHappenedSeconds: 0,
      playerKnockEventsPerMin: 1.2,
      maxPlayerKnockFraction: 0.06,
      headingChangeEvents: 0,
      jitterMeasured: false,
      b13Met: null,
      wavesCleared: 3,
    },
    eventTrace: [
      { tick: 0, type: 'run:wavePlanned', data: { wave: 1, quota: 12, openingHostiles: 6 } },
      { tick: 60, type: 'player:shot', data: { weapon: 'concussion' } },
      { tick: 90, type: 'player:shot', data: { weapon: 'concussion' } },
      { tick: 120, type: 'collision:playerKnock', data: { deltaVFraction: 0.05, headingChangeRad: 0 } },
      { tick: 150, type: 'entity:killed', data: { wave: 1, targetId: 10, cause: 'gun' } },
      { tick: 180, type: 'player:shot', data: {} },
      { tick: 240, type: 'combat:collateral', data: { wave: 1, bodiesInvolved: 2 } },
      { tick: 300, type: 'player:shot', data: {} },
      { tick: 330, type: 'entity:killed', data: { wave: 1, targetId: 11, cause: 'terrain' } },
      { tick: 360, type: 'player:shot', data: {} },
      { tick: 420, type: 'entity:killed', data: { wave: 2, targetId: 12, cause: 'shove' } },
      { tick: 450, type: 'player:shot', data: {} },
      { tick: 480, type: 'combat:collateral', data: { wave: 2, bodiesInvolved: 3 } },
      { tick: 540, type: 'entity:killed', data: { wave: 2, targetId: 13, cause: 'gun' } },
      { tick: 600, type: 'run:waveCleared', data: { wave: 1, killed: 5, quota: 12 } },
      { tick: 660, type: 'player:shot', data: {} },
      { tick: 720, type: 'player:shot', data: {} },
      { tick: 780, type: 'entity:killed', data: { wave: 3, targetId: 14, cause: 'terrain' } },
      { tick: 3600, type: 'run:waveCleared', data: { wave: 3, killed: 5, quota: 12 } },
    ],
  };
}

test('deriveFunMetrics derives consequences, first consequence, moments, deaths and knock budget from a crucible trace', () => {
  const fm = deriveFunMetrics(crucibleRunWithTrace());

  // (5 kills + 2 collateral + 1 knock) / max(1, 8 traced shots) = 1.0
  assert.equal(fm.consequencesPerAction, 1);
  // first action (player:shot) at tick 60; first consequence after it (knock) at tick 120 → 1.0 s
  assert.equal(fm.timeToFirstConsequenceS, 1);
  // 2 collateral events over 3600 ticks = exactly 1 sim minute → 2 moments/min
  assert.equal(fm.momentsPerMinute, 2);
  assert.deepEqual(fm.deathsByCause, { gun: 2, terrain: 2, shove: 1 });
  // every quiet gap between traced events is < 4 s → measured zero, not null
  assert.equal(fm.nothingHappenedSeconds, 0);
  // verbs come from run metrics
  assert.equal(fm.verbsPerMinute, 5);
  assert.equal(fm.verbsUsed, 3);
  // knock budget from run metrics (B13: ≤ 2/min and ≤ 10% of cruise)
  assert.deepEqual(fm.knockBudget, {
    eventsPerMinute: 1.2,
    maxDeltaVFractionOfCruise: 0.06,
    headingChangeEvents: 0,
    jitterMeasured: false,
    met: null,
    source: 'run',
  });
  assert.ok(fm.gaps.some((g) => /jitter/.test(g)), `headless jitter must be named, got gaps: ${fm.gaps.join('; ')}`);
  assert.ok(fm.gaps.every((g) => /jitter/.test(g)), 'dense trace should only gap on unmeasured jitter');
});

test('honesty: a flight run (sample-only trace) degrades to nulls, each with a gap string — nothing fabricated', () => {
  const fm = deriveFunMetrics({
    bench: 'flight',
    scenarioId: 'flight-slalom',
    label: 'M2 Slalom Course Precision',
    seed: 13502,
    durationMs: 100,
    runHash: HASH64('b'),
    metrics: { seed: 13502, kestrel: { meanSpeed: 100 } },
    eventTrace: [
      { tick: 0, type: 'sample', data: { x: 0, z: 0, spd: 0 } },
      { tick: 30, type: 'sample', data: { x: 1, z: 0, spd: 50 } },
    ],
  });

  for (const key of [
    'verbsPerMinute',
    'verbsUsed',
    'consequencesPerAction',
    'timeToFirstConsequenceS',
    'momentsPerMinute',
    'nothingHappenedSeconds',
    'deathsByCause',
    'knockBudget',
  ]) {
    assert.equal(fm[key], null, `${key} must be null for a sample-only flight trace`);
  }
  assert.ok(Array.isArray(fm.gaps) && fm.gaps.length > 0, 'nulls must be explained by gaps');
  for (const gap of fm.gaps) {
    assert.equal(typeof gap, 'string');
    assert.ok(gap.trim().length > 0, 'every gap string must be non-empty');
  }
  assert.ok(
    fm.gaps.some((g) => g.includes('flight trace has no action/consequence events')),
    'the pinned flight gap must be present'
  );
});

test('knock budget mapping: feel.knock_budget verb run (source scenario) and crucible run over the fraction ceiling', () => {
  const verbRun = deriveFunMetrics({
    bench: 'verbs',
    scenarioId: 'feel.knock_budget',
    label: 'B13 Knock Budget',
    seed: 4242,
    durationMs: 5,
    runHash: HASH64('c'),
    metrics: {
      knockEventsPerMinute: 1.0,
      maxKnockDeltaVFractionOfCruise: 0.08,
      headingChangeEvents: 0,
      barMet: true,
    },
    eventTrace: [],
  });
  assert.deepEqual(verbRun.knockBudget, {
    eventsPerMinute: 1.0,
    maxDeltaVFractionOfCruise: 0.08,
    headingChangeEvents: 0,
    jitterMeasured: false,
    met: null,
    source: 'scenario',
  });
  assert.ok(verbRun.gaps.some((g) => /jitter/.test(g)));

  // Crucible run at 20% of cruise — over the 10% ceiling → met false, source 'run'.
  const crucibleRun = deriveFunMetrics({
    bench: 'crucible',
    arenaId: 'helios_core',
    loadoutId: 'physics_toolkit',
    seed: 4242,
    metrics: {
      totalKills: 4,
      totalShots: 2,
      verbsUsedCount: 2,
      verbsPerMinute: 6,
      momentsPerMinute: 0,
      nothingHappenedSeconds: 0,
      playerKnockEventsPerMin: 3,
      maxPlayerKnockFraction: 0.2,
      b13Met: false,
    },
  });
  assert.equal(crucibleRun.knockBudget.source, 'run');
  assert.equal(crucibleRun.knockBudget.eventsPerMinute, 3);
  assert.equal(crucibleRun.knockBudget.maxDeltaVFractionOfCruise, 0.2);
  assert.equal(crucibleRun.knockBudget.met, false, '3 knocks/min at 20% of cruise must fail the B13 budget');
});

// ── diff mode fixtures (law §3.6) ────────────────────────────────────────────────

function barFixture(id, target, value, met, overrides = {}) {
  return {
    id,
    key: id,
    title: `bar ${id}`,
    statement: '',
    target,
    reachable: overrides.reachable !== false,
    coverage: overrides.coverage || 'full',
    values: overrides.values
      || (value === null ? [] : [{ label: 'x', value, unit: overrides.unit || '', met }]),
    met,
    notes: overrides.notes || '',
    fedBy: overrides.fedBy !== undefined ? overrides.fedBy : ['crucible/helios_core/physics_toolkit/s4242'],
  };
}

function measureSummaryFixture(bars, funMetrics, timestamp) {
  return {
    schema: 'spaceface.funMeasure.v1',
    timestamp,
    date: timestamp.slice(0, 10),
    seeds: [4242],
    benches: {
      crucible: {
        runs: [{
          runRef: 'crucible helios_core/physics_toolkit seed 4242',
          bench: 'crucible',
          arenaId: 'helios_core',
          loadoutId: 'physics_toolkit',
          seed: 4242,
          runHash: HASH64('d'),
          bars,
          funMetrics,
        }],
      },
    },
    summary: { reachable: 1, met: 0, partial: 0, unreachable: 12 },
  };
}

function funMetricsFixture(consequencesPerAction) {
  return {
    verbsPerMinute: 5,
    verbsUsed: 3,
    consequencesPerAction,
    timeToFirstConsequenceS: 2,
    momentsPerMinute: 2,
    nothingHappenedSeconds: 0,
    deathsByCause: { gun: 2 },
    knockBudget: { eventsPerMinute: 1.2, maxDeltaVFractionOfCruise: 0.06, headingChangeEvents: 0, met: true, source: 'run' },
    gaps: [],
  };
}

test('diff mode: direction toward/away/unchanged, verdict KEEP only when every change is toward, ties revert', () => {
  const beforeBars = [
    barFixture('B4', '≥ 0.30 of cruise per hit', 0.15, false),
    barFixture('B2', '≤ 3.0 s reversal', 2.0, true),
  ];
  const before = measureSummaryFixture(beforeBars, funMetricsFixture(1), '2026-09-03T10:00:00.000Z');
  const afterBetter = measureSummaryFixture(
    [barFixture('B4', '≥ 0.30 of cruise per hit', 0.31, false), barFixture('B2', '≤ 3.0 s', 2.0, true)],
    funMetricsFixture(3),
    '2026-09-03T12:00:00.000Z',
  );
  const afterWorse = measureSummaryFixture(
    [barFixture('B4', '≥ 0.30 of cruise per hit', 0.15, false), barFixture('B2', '≤ 3.0 s', 2.6, true)],
    funMetricsFixture(0.5),
    '2026-09-03T14:00:00.000Z',
  );
  const afterTie = measureSummaryFixture(
    [barFixture('B4', '≥ 0.30 of cruise per hit', 0.15, false), barFixture('B2', '≤ 3.0 s', 2.0, true)],
    funMetricsFixture(1),
    '2026-09-03T16:00:00.000Z',
  );

  // Improved: 0.15 → 0.31 toward a ≥ 0.30 target; B2 identical; consequences 1 → 3 (higher is fun).
  const better = buildMeasureDiff(before, afterBetter, { timestamp: '2026-09-03T18:00:00.000Z' });
  assert.equal(better.schema, 'spaceface.funMeasureDiff.v1');
  assert.equal(better.runs.length, 1);
  const b4Better = better.runs[0].bars.find((b) => b.id === 'B4');
  assert.equal(b4Better.before, 0.15);
  assert.equal(b4Better.after, 0.31);
  assert.equal(b4Better.delta, 0.16);
  assert.equal(b4Better.direction, 'toward');
  assert.equal(b4Better.metBefore, 'no');
  assert.equal(b4Better.metAfter, 'no');
  const b2Better = better.runs[0].bars.find((b) => b.id === 'B2');
  assert.equal(b2Better.direction, 'unchanged');
  assert.equal(b2Better.delta, 0);
  const consequencesBetter = better.runs[0].funMetrics.find((m) => m.metric === 'consequencesPerAction');
  assert.equal(consequencesBetter.direction, 'toward');
  assert.equal(better.verdict, 'KEEP', 'all changed bars moved toward target → KEEP');
  const betterMd = renderDiffMarkdown(better);
  assert.ok(betterMd.includes('Verdict: KEEP'), 'diff Markdown must carry the verdict');

  // Regressed: 0.31 → 0.15 (if it had been the before side) — here B4 falls back and B2 slows.
  const worse = buildMeasureDiff(afterBetter, before, { timestamp: '2026-09-03T19:00:00.000Z' });
  const b4Worse = worse.runs[0].bars.find((b) => b.id === 'B4');
  assert.equal(b4Worse.direction, 'away');
  assert.equal(worse.verdict, 'REVERT');
  assert.ok(renderDiffMarkdown(worse).includes('Verdict: REVERT'));

  // Tie: nothing moved anywhere → REVERT per §3.6.
  const tie = buildMeasureDiff(before, afterTie, { timestamp: '2026-09-03T20:00:00.000Z' });
  assert.deepEqual(
    tie.runs[0].bars.map((b) => b.direction),
    ['unchanged', 'unchanged'],
  );
  assert.equal(tie.verdict, 'REVERT', 'ties revert (FUN_CONVERGENCE_LOOP §3.6)');
});

test('diff mode: B7 stretch regression (0.09 met → 0.12 unmet) is away + REVERT, never a silent KEEP', () => {
  // Reviewer-found defect: B7's target is "stretch < 10 %; release keeps ≥ 95 % …";
  // parsing the whole string saw the later "≥" and called higher-is-better, so a
  // worsening stretch read as "toward" and the verdict flipped to KEEP.
  const b7Target = 'stretch < 10 %; release keeps ≥ 95 % of tangential speed at 5 s';
  const before = measureSummaryFixture(
    [barFixture('B7', b7Target, 0.09, true)],
    funMetricsFixture(1),
    '2026-09-03T10:00:00.000Z',
  );
  const after = measureSummaryFixture(
    [barFixture('B7', b7Target, 0.12, false)],
    funMetricsFixture(1),
    '2026-09-03T12:00:00.000Z',
  );
  const diff = buildMeasureDiff(before, after, { timestamp: '2026-09-03T14:00:00.000Z' });
  const b7 = diff.runs[0].bars.find((b) => b.id === 'B7');
  assert.equal(b7.direction, 'away', 'peak stretch growing past its < 10 % ceiling is a regression');
  assert.equal(diff.verdict, 'REVERT', 'a regression must revert (FUN_CONVERGENCE_LOOP §3.6)');
  assert.ok(renderDiffMarkdown(diff).includes('Verdict: REVERT'));
});

test('diff mode: a regression in ANY value row of a multi-clause bar reverts, never just the headline row', () => {
  // Optimizer-sweep defect: the diff used to read only each bar's first value row, so B6's
  // hull-loss clause could collapse 0.9 → 0.2 while the diff said "unchanged" and kept the change.
  const b6Rows = (dies, hull, helm, hullMet) => ([
    { label: `light hostile dies at ≥ 75 % of cruise closing (ran at 76 % of cruise, 1 run(s))`, value: dies, unit: 'bool', met: dies === 1 },
    { label: 'hull lost at ≥ 50 % of cruise closing (worst of 1 run(s))', value: hull, unit: 'fraction', met: hullMet },
    { label: 'helm lost at ≥ 50 % of cruise closing (1 run(s))', value: helm, unit: 'bool', met: helm === 1 },
  ]);
  const before = measureSummaryFixture(
    [
      barFixture('B4', 'shove ΔV ≥ 30 % of light-hostile cruise per hit (starter gun ≥ 5 %)', 0.15, false),
      { ...barFixture('B6', 'dies at ≥ 75 % cruise closing; ≥ 60 % hull + helm lost at ≥ 50 %; heavy ≤ 15 %', null, null), values: b6Rows(1, 0.9, 1, true) },
    ],
    funMetricsFixture(1),
    '2026-09-03T10:00:00.000Z',
  );
  const after = measureSummaryFixture(
    [
      barFixture('B4', 'shove ΔV ≥ 30 % of light-hostile cruise per hit (starter gun ≥ 5 %)', 0.31, false),
      { ...barFixture('B6', 'dies at ≥ 75 % cruise closing; ≥ 60 % hull + helm lost at ≥ 50 %; heavy ≤ 15 %', null, null), values: b6Rows(1, 0.2, 1, false) },
    ],
    funMetricsFixture(3),
    '2026-09-03T12:00:00.000Z',
  );

  const diff = buildMeasureDiff(before, after, { timestamp: '2026-09-03T14:00:00.000Z' });
  const b6 = diff.runs[0].bars.find((b) => b.id === 'B6');
  assert.ok(Array.isArray(b6.rows) && b6.rows.length === 3, 'every paired value row is carried in the diff');
  const hullRow = b6.rows.find((r) => /hull lost/.test(r.label));
  assert.equal(hullRow.direction, 'away', 'the hull-loss clause regressed 0.9 → 0.2');
  assert.equal(b6.direction, 'away', 'the bar inherits its worst row (§3.6: no bar may regress)');
  assert.equal(diff.verdict, 'REVERT', 'a non-headline regression must revert, not KEEP');
  const md = renderDiffMarkdown(diff);
  assert.ok(md.includes('Verdict: REVERT'));
  assert.ok(md.includes('Row detail'), 'multi-row bars explain themselves in the diff');
});

test('diff met columns are strictly bar-level: a met-null bar reads "—" in the diff, same as its receipt', async () => {
  const { evaluateBars, fedByOf } = await import('../scripts/lib/bench/feelBars.mjs');
  const ropeRun = {
    bench: 'verbs',
    scenarioId: 'feel.rope_swing_release',
    seed: 4242,
    metrics: { speedRetainedFraction: 0.958, maxStretchRatio: 0.103 },
    eventTrace: [],
  };
  const pooled = evaluateBars([ropeRun]).bars;
  const before = measureSummaryFixture(pooled, funMetricsFixture(1), '2026-09-03T10:00:00.000Z');
  const ropeAfter = { ...ropeRun, metrics: { speedRetainedFraction: 0.97, maxStretchRatio: 0.09 } };
  const after = measureSummaryFixture(evaluateBars([ropeAfter]).bars, funMetricsFixture(1), '2026-09-03T12:00:00.000Z');

  const diff = buildMeasureDiff(before, after, { timestamp: '2026-09-03T14:00:00.000Z' });
  const b1 = diff.runs[0].bars.find((b) => b.id === 'B1');
  assert.equal(b1.metBefore, '—', 'B1 met null must render "—" in the diff, exactly like its receipt');
  assert.equal(b1.metAfter, '—');
  assert.equal(fedByOf(ropeRun), 'verbs/feel.rope_swing_release/s4242');
});

test('consequencesPerAction is null with a gap when the trace records no player action', () => {
  const noShots = deriveFunMetrics({
    bench: 'crucible',
    arenaId: 'helios_core',
    loadoutId: 'energy_baseline',
    seed: 4242,
    metrics: { totalShots: 0 },
    eventTrace: [
      { tick: 60, type: 'entity:killed', data: { cause: 'weapon' } },
      { tick: 120, type: 'entity:killed', data: { cause: 'weapon' } },
    ],
  });
  assert.equal(noShots.consequencesPerAction, null, 'consequences with zero actions are not a rate');
  assert.ok(noShots.gaps.some((g) => /no player action/.test(g)), 'the gap names the missing actions');

  const noTraceNoShots = deriveFunMetrics({
    bench: 'crucible',
    arenaId: 'helios_core',
    loadoutId: 'energy_baseline',
    seed: 4242,
    metrics: { totalKills: 5, totalShots: 0 },
  });
  assert.equal(noTraceNoShots.consequencesPerAction, null);
  assert.ok(noTraceNoShots.gaps.some((g) => /no shot total/.test(g)));
});

test('buildRunBlock threads the registry fedByOf as fedByRef; local fallback only for fixtures', async () => {
  const { fedByOf } = await import('../scripts/lib/bench/feelBars.mjs');
  const crucibleRun = { bench: 'crucible', arenaId: 'helios_core', loadoutId: 'physics_toolkit', seed: 4242, metrics: {}, eventTrace: [] };
  const verbRun = { bench: 'verbs', scenarioId: 'feel.knock_budget', seed: 4242, metrics: {}, eventTrace: [] };

  const threaded = buildRunBlock(crucibleRun, [], fedByOf);
  assert.equal(threaded.fedByRef, 'crucible/helios_core/physics_toolkit/s4242', 'production blocks carry the registry ref');

  const fallbackVerb = buildRunBlock(verbRun, []);
  assert.equal(fallbackVerb.fedByRef, 'verbs/feel.knock_budget/s4242', 'fixture fallback matches the registry format');
  assert.equal(fallbackVerb.fedByRef, fedByOf(verbRun), 'fallback and registry agree today');
});

test('crucible knockBudget cannot pass when heading is unmeasured even if rate and magnitude look calm', () => {
  const calmButBlind = deriveFunMetrics({
    bench: 'crucible',
    arenaId: 'helios_core',
    loadoutId: 'energy_baseline',
    seed: 4242,
    metrics: {
      playerKnockEventsPerMin: 0.4,
      maxPlayerKnockFraction: 0.02,
    },
  });
  assert.notEqual(calmButBlind.knockBudget.met, true, 'missing heading is not a pass');
  assert.ok(calmButBlind.gaps.some((g) => /heading/.test(g)));
  assert.ok(calmButBlind.gaps.some((g) => /jitter/.test(g)));

  const withHeading = deriveFunMetrics({
    bench: 'crucible',
    arenaId: 'helios_core',
    loadoutId: 'energy_baseline',
    seed: 4242,
    metrics: {
      playerKnockEventsPerMin: 0.4,
      maxPlayerKnockFraction: 0.02,
      headingChangeEvents: 0,
      jitterMeasured: false,
    },
  });
  assert.notEqual(withHeading.knockBudget.met, true, 'headless jitter never full-passes B13');
  assert.equal(withHeading.knockBudget.met, null);
  assert.equal(withHeading.knockBudget.headingChangeEvents, 0);
  assert.equal(withHeading.knockBudget.jitterMeasured, false);
});

test('compareCompatibleSweeps matches only the same harness digest, source identity, and unique cell hashes', () => {
  const digest = 'a'.repeat(64);
  const otherDigest = 'b'.repeat(64);
  const source = {
    gitHead: '1'.repeat(40),
    gitTree: '2'.repeat(40),
    productionDirty: false,
    productionDiffHash: '3'.repeat(64),
  };
  const otherSource = { ...source, gitHead: '9'.repeat(40) };
  const sweep = (harnessDigest, hashA, hashB, extra = {}) => ({
    harnessDigest,
    sourceIdentity: extra.sourceIdentity || source,
    benches: extra.benches || {
      crucible: {
        runs: [
          { bench: 'crucible', arenaId: 'helios_core', loadoutId: 'energy_baseline', seed: 4242, runHash: hashA },
          { bench: 'crucible', arenaId: 'helios_core', loadoutId: 'physics_toolkit', seed: 4242, runHash: hashB },
        ],
      },
    },
  });

  const noDigest = compareCompatibleSweeps(sweep(null, HASH64('1'), HASH64('2')), sweep(digest, HASH64('1'), HASH64('2')));
  assert.equal(noDigest.compatible, false);
  assert.equal(noDigest.identical, false);

  const mismatchHarness = compareCompatibleSweeps(
    sweep(digest, HASH64('1'), HASH64('2')),
    sweep(otherDigest, HASH64('1'), HASH64('2')),
  );
  assert.equal(mismatchHarness.compatible, false);
  assert.equal(mismatchHarness.identical, false);

  const mismatchSource = compareCompatibleSweeps(
    sweep(digest, HASH64('1'), HASH64('2')),
    sweep(digest, HASH64('1'), HASH64('2'), { sourceIdentity: otherSource }),
  );
  assert.equal(mismatchSource.compatible, false);
  assert.equal(mismatchSource.identical, false);

  const mismatchCell = compareCompatibleSweeps(
    sweep(digest, HASH64('1'), HASH64('2')),
    sweep(digest, HASH64('1'), HASH64('9')),
  );
  assert.equal(mismatchCell.compatible, true);
  assert.equal(mismatchCell.identical, false);

  const match = compareCompatibleSweeps(
    sweep(digest, HASH64('1'), HASH64('2')),
    sweep(digest, HASH64('1'), HASH64('2')),
  );
  assert.equal(match.compatible, true);
  assert.equal(match.identical, true);

  const empty = compareCompatibleSweeps(
    { harnessDigest: digest, sourceIdentity: source, benches: { crucible: { runs: [] } } },
    { harnessDigest: digest, sourceIdentity: source, benches: { crucible: { runs: [] } } },
  );
  assert.equal(empty.compatible, false, 'two empty sweeps must not match');
  assert.equal(empty.identical, false);

  const missingHash = compareCompatibleSweeps(
    sweep(digest, HASH64('1'), HASH64('2')),
    sweep(digest, HASH64('1'), HASH64('2'), {
      benches: {
        crucible: {
          runs: [
            { bench: 'crucible', arenaId: 'helios_core', loadoutId: 'energy_baseline', seed: 4242, runHash: HASH64('1') },
            { bench: 'crucible', arenaId: 'helios_core', loadoutId: 'physics_toolkit', seed: 4242, runHash: null },
          ],
        },
      },
    }),
  );
  assert.equal(missingHash.compatible, false);

  const duplicates = compareCompatibleSweeps(
    {
      harnessDigest: digest,
      sourceIdentity: source,
      benches: {
        crucible: {
          runs: [
            { bench: 'crucible', arenaId: 'helios_core', loadoutId: 'energy_baseline', seed: 4242, runHash: HASH64('1') },
            { bench: 'crucible', arenaId: 'helios_core', loadoutId: 'energy_baseline', seed: 4242, runHash: HASH64('9') },
          ],
        },
      },
    },
    sweep(digest, HASH64('1'), HASH64('2')),
  );
  assert.equal(duplicates.compatible, false);

  const differentKeys = compareCompatibleSweeps(
    sweep(digest, HASH64('1'), HASH64('2')),
    {
      harnessDigest: digest,
      sourceIdentity: source,
      benches: {
        crucible: {
          runs: [
            { bench: 'crucible', arenaId: 'lagrange_crucible', loadoutId: 'energy_baseline', seed: 4242, runHash: HASH64('1') },
            { bench: 'crucible', arenaId: 'helios_core', loadoutId: 'physics_toolkit', seed: 4242, runHash: HASH64('2') },
          ],
        },
      },
    },
  );
  assert.equal(differentKeys.compatible, false);
});

// ── receipt rendering (PQ-173.01 defects 1-3): pooled §B table once per receipt ──

test('markdown hygiene: pooled table carries all 13 bar rows, full untruncated notes, no repo paths, no ellipsis, no "not part of this measurement"', () => {
  const bars = [];
  for (let i = 1; i <= 13; i++) {
    if (i === 12) {
      bars.push(barFixture(`B${i}`, '≥ 9 of 11 beats', null, false, {
        reachable: false,
        coverage: 'none',
        fedBy: [],
        notes: 'needs the 60-second proof scenario; see scripts/lib/bench/proofHarness.mjs for the runner and the beat list',
      }));
    } else if (i === 1) {
      bars.push(barFixture(`B${i}`, '≥ 99 % of exit speed 10 s later', 1.25, true, {
        unit: 'screens',
        notes: 'the benched number is the release clause (≥ 95 % kept at 5 s). The bar own clauses are kernel-level (test/flightV3.spec.mjs §12c) and are not benched headlessly.',
      }));
    } else {
      bars.push(barFixture(`B${i}`, '≥ 1 screen depth', 1.25, true, { unit: 'screens' }));
    }
  }
  const run = crucibleRunWithTrace();
  const runBlocks = [buildRunBlock(run, bars)];
  const md = renderBenchSeedMarkdown('crucible', 4242, runBlocks, bars, '2026-09-03T10:00:00.000Z');

  // Exactly ONE pooled bar table for the whole receipt, with every bar id.
  assert.equal(
    md.split('\n').filter((l) => l === '| bar | value(s) | target | met | fed by |').length,
    1,
    'the pooled bar table must appear exactly once per receipt',
  );
  for (let i = 1; i <= 13; i++) {
    assert.ok(md.includes(`| B${i} `), `bar row for B${i} must appear in the pooled table`);
  }

  // Unreachable bars keep their FULL reason (footnote), never an ellipsis-truncated cell.
  assert.ok(md.includes('not reachable by this bench'), 'unreachable bars must be marked, not dropped');
  assert.ok(md.includes('Notes — the full text behind the cells'), 'notes section must be present');
  assert.ok(md.includes('needs the 60-second proof scenario; see'), 'the B12 reason must survive in full');
  assert.ok(md.includes('for the runner and the beat list'), 'the B12 reason must not be cut mid-sentence');
  assert.equal(md.includes('…'), false, 'no rendered text may end in a truncation ellipsis');
  assert.ok(md.includes('<repo file>'), 'path-shaped note text must be sanitized');
  assert.equal(md.includes('proofHarness'), false, 'the raw repo path must be sanitized away');
  assert.equal(md.includes('not part of this measurement'), false, 'the banned per-run sentence must be gone');
  assert.equal(/[A-Za-z]:\\/.test(md), false, 'rendered receipt must not contain drive-letter repo paths');
  assert.equal(/(?:scripts|src|test|docs|design|assets|tools)\//.test(md), false, 'rendered receipt must not contain repo paths');

  // Per-run section lists only the bars that run feeds — the unreachable B12 must not repeat there.
  const runSection = md.slice(md.indexOf('Bars this run feeds'), md.indexOf('Fun metrics'));
  assert.ok(runSection.length > 0, 'the run section must render a fed-bars list');
  assert.equal(/^\| B12 /m.test(runSection), false, 'the unreachable bar must not be listed as fed');
  assert.ok(/^\| B1 /m.test(runSection), 'fed bars appear in the run section');
  const fedIds = [...runSection.matchAll(/^\| (B\d+) /gm)].map((m) => m[1]);
  assert.equal(fedIds.length, 12, 'the run feeds the 12 reachable bars');

  // Target-direction parsing drives the diff verdict; sanity-check both signs.
  assert.equal(parseTargetDirection('≥ 0.30'), 'higher');
  assert.equal(parseTargetDirection('<= 3.0 s'), 'lower');
  assert.equal(parseTargetDirection(0.3), null);
  // Only the FIRST `;`-clause may set the sign: B7's headline value is peak stretch
  // (lower is better) even though a later clause contains "≥ 95 %".
  assert.equal(parseTargetDirection('stretch < 10 %; release keeps ≥ 95 % of tangential speed at 5 s'), 'lower');
  assert.equal(parseTargetDirection('dies at ≥ 75 % cruise closing; ≥ 60 % hull + helm lost at ≥ 50 %'), 'higher');
  assert.equal(parseTargetDirection('patrol chooses within 10 s; salvor arrives ≤ 30 s'), null);
});

test('pooled B13 on a verbs receipt: measured from the feel.knock_budget run (2.3 events/min, met no), fed-only per-run section', () => {
  const knockRun = {
    bench: 'verbs',
    scenarioId: 'feel.knock_budget',
    label: 'B13 Knock Budget',
    seed: 4242,
    durationMs: 5,
    runHash: HASH64('f'),
    metrics: {
      knockEventsPerMinute: 2.3,
      maxKnockDeltaVFractionOfCruise: 0.177,
      headingChangeEvents: 0,
      barMet: false,
    },
    eventTrace: [],
  };
  const pooled = evaluateBars([knockRun]);
  const runBlocks = [buildRunBlock(knockRun, pooled.bars)];
  const md = renderBenchSeedMarkdown('verbs', 4242, runBlocks, pooled.bars, '2026-09-03T10:00:00.000Z');

  // All 13 bars pooled once; the knock-feeding bars show their real numbers.
  for (let i = 1; i <= 13; i++) {
    assert.ok(md.includes(`| B${i} `), `pooled row for B${i} must appear`);
  }
  const b13 = md.split('\n').find((l) => l.startsWith('| B13 '));
  assert.ok(b13, 'the pooled table must carry a B13 row');
  assert.ok(b13.includes('2.3') && b13.includes('events/min'), `B13 must show 2.3 events/min, got: ${b13}`);
  assert.ok(b13.includes('0.177'), `B13 must show the 0.177 max-knock fraction, got: ${b13}`);
  assert.ok(/\| no \| verbs\/feel\.knock_budget\/s4242 \|$/.test(b13), `B13 must be met=no, fed by the knock run, got: ${b13}`);

  // Bars this verbs-only measurement cannot reach name the gap honestly, without the banned string.
  assert.ok(md.includes('no feeding run in this measurement'), 'unfed bars must say so plainly');
  const b4 = md.split('\n').find((l) => l.startsWith('| B4 '));
  assert.ok(b4 && b4.includes('no feeding run in this measurement'), `unfed B4 must show the neutral wording, got: ${b4}`);
  assert.equal(md.includes('not part of this measurement'), false);
  assert.equal(md.includes('…'), false);
  assert.equal(/(?:scripts|src|test|docs|design|assets|tools)\//.test(md), false);

  // The run section lists ONLY the bar this run feeds, with the pooled numbers.
  const runSection = md.slice(md.indexOf('Bars this run feeds'), md.indexOf('Fun metrics'));
  const fedIds = [...runSection.matchAll(/^\| (B\d+) /gm)].map((m) => m[1]);
  assert.deepEqual(fedIds, ['B13'], 'the knock run feeds exactly B13');
  assert.ok(runSection.includes('2.3'), 'the fed B13 row carries the pooled 2.3 events/min number');
});

test('pooled B13 on a crucible receipt: fed-by names the crucible run and the run section repeats the pooled numbers', () => {
  const run = crucibleRunWithTrace();
  const pooled = evaluateBars([run]);
  const runBlocks = [buildRunBlock(run, pooled.bars)];
  const md = renderBenchSeedMarkdown('crucible', 4242, runBlocks, pooled.bars, '2026-09-03T10:00:00.000Z');

  const b13 = md.split('\n').find((l) => l.startsWith('| B13 '));
  assert.ok(b13, 'the pooled table must carry a B13 row');
  assert.ok(b13.includes('1.2') && b13.includes('events/min'), `B13 must show 1.2 events/min, got: ${b13}`);
  assert.ok(b13.includes('crucible/helios_core/physics_toolkit/s4242'), `B13 fed-by must name the crucible run, got: ${b13}`);
  assert.equal(/\| yes \| crucible\//.test(b13), false, `incomplete headless Crucible evidence must not pin met=yes, got: ${b13}`);
  assert.ok(/\| — \| crucible\//.test(b13), `unmeasured jitter keeps the full B13 verdict undecidable, got: ${b13}`);
  assert.ok(md.toLowerCase().includes('jitter'), 'receipt must name visible jitter as unmeasured');

  const runSection = md.slice(md.indexOf('Bars this run feeds'), md.indexOf('Fun metrics'));
  const fedIds = [...runSection.matchAll(/^\| (B\d+) /gm)].map((m) => m[1]);
  assert.deepEqual(fedIds, ['B13'], 'the crucible run feeds exactly B13');
  assert.ok(runSection.includes('1.2'), 'the run section repeats the pooled B13 number');
});

test('renderRunMarkdown with no pooled bars says so instead of listing stale per-run rows', () => {
  const md = renderRunMarkdown({
    runRef: 'verbs feel.knock_budget seed 4242',
    bench: 'verbs',
    scenarioId: 'feel.knock_budget',
    seed: 4242,
    runHash: HASH64('x'),
    bars: [],
    funMetrics: deriveFunMetrics({
      bench: 'verbs',
      scenarioId: 'feel.knock_budget',
      seed: 4242,
      metrics: { knockEventsPerMinute: 2.3, maxKnockDeltaVFractionOfCruise: 0.177, headingChangeEvents: 0, barMet: false },
      eventTrace: [],
    }),
  }, []);
  assert.ok(md.includes('None — this run does not feed a FEEL_CONTRACT §B bar.'));
  assert.equal(md.includes('not part of this measurement'), false);
  assert.ok(md.includes('Gaps:'));
});

test('integration: knock scenario through evaluateBars + deriveFunMetrics once the parallel PQ-173.01 leaves land', async (t) => {
  const verbBench = await import('../scripts/lib/bench/verbBench.mjs');
  const hasKnock = verbBench.VERB_BENCH_SCENARIOS.some((s) => s.id === 'feel.knock_budget');
  const hasBars = await import('../scripts/lib/bench/feelBars.mjs').then(() => true, () => false);
  if (!hasKnock || !hasBars) {
    t.skip(`parallel PQ-173.01 leaves not present yet (feel.knock_budget scenario: ${hasKnock}, feelBars.mjs: ${hasBars})`);
    return;
  }

  const { evaluateBars } = await import('../scripts/lib/bench/feelBars.mjs');
  let result;
  try {
    result = await verbBench.runVerbBench({ seeds: [4242], scenarioIds: ['feel.knock_budget'] });
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' && /three/i.test(err.message)) {
      t.skip(`sparse worktree missing optional renderer dependency 'three': ${err.message}`);
      return;
    }
    throw err;
  }
  assert.equal(result.runs.length, 1);
  const run = result.runs[0];

  const fm = deriveFunMetrics(run);
  assert.ok(fm.knockBudget, 'the knock scenario run must yield a knock budget');
  assert.equal(fm.knockBudget.source, 'scenario');
  assert.notEqual(fm.knockBudget.met, true, 'headless knock scenario cannot full-pass B13');

  const evaluated = evaluateBars([run]);
  const b13 = (evaluated.bars || []).find((b) => /13|knock/i.test(`${b.id ?? ''} ${b.key ?? ''} ${b.title ?? ''}`));
  assert.ok(b13, 'evaluateBars must expose the B13 knock-budget bar');
  const value = b13.values && b13.values[0] ? b13.values[0].value : undefined;
  assert.equal(typeof value, 'number', `B13 must carry a numeric value for the knock scenario run (values: ${JSON.stringify(b13.values)})`);
  assert.notEqual(b13.met, true, 'pooled B13 cannot full-pass without measured jitter');
});

test('harness digest lists scenario modules and realPath, sorted, without receipt files', () => {
  const files = listFunLoopHarnessFiles();
  assert.ok(files.includes('scripts/lib/bench/realPath.mjs'));
  // knockModel.mjs was the invented contact-encounter generator B13 used to be measured with.
  // The drop-in module scenarios/feel.knock_budget.mjs replaced it with the real physics path, and
  // the file is gone: nothing may import it back without this line failing.
  assert.ok(!files.some((f) => f.endsWith('knockModel.mjs')), 'the invented knock model is retired');
  assert.ok(files.some((f) => f.startsWith('scripts/lib/bench/scenarios/') && f.endsWith('.mjs')));
  assert.ok(!files.some((f) => /receipts|contact-sheet|strip-manifest/.test(f)));
  assert.deepEqual(files, [...files].sort((a, b) => a.localeCompare(b)));
  const again = listFunLoopHarnessFiles();
  assert.deepEqual(again, files, 'listing is deterministic');
  const digest = computeFunLoopHarnessDigest();
  assert.equal(typeof digest, 'string');
  assert.equal(digest.length, 64);
  const identity = computeProductionSourceIdentity();
  assert.equal(typeof identity.gitHead, 'string');
  assert.equal(identity.gitHead.length, 40);
  assert.equal(typeof identity.gitTree, 'string');
  assert.equal(typeof identity.productionDiffHash, 'string');
  assert.equal(identity.productionDiffHash.length, 64);
});

test('owner output: provided unmeasured null never renders as numeric zero and keeps fed-by/note', () => {
  const run = {
    bench: 'verbs',
    scenarioId: 'world.reaction_trio',
    seed: 4242,
    runHash: HASH64('u'),
    metrics: {
      bars: [{
        bar: 'B10',
        label: 'patrol decides stay-or-chase after a witnessed kill',
        value: null,
        unit: 's',
        met: false,
        unmeasured: true,
        note: 'UNMEASURED — player had no body. This is not a reading of the world.',
      }],
    },
    eventTrace: [],
  };
  const pooled = evaluateBars([run]);
  const b10 = pooled.bars.find((bar) => bar.id === 'B10');
  assert.equal(b10.met, null);
  assert.equal(b10.values[0].value, null);
  assert.equal(b10.values[0].unmeasured, true);
  const runBlocks = [buildRunBlock(run, pooled.bars)];
  const md = renderBenchSeedMarkdown('verbs', 4242, runBlocks, pooled.bars, '2026-09-04T10:00:00.000Z');
  const row = md.split('\n').find((line) => line.startsWith('| B10 '));
  assert.ok(row, 'pooled table must carry B10');
  assert.ok(row.includes('unmeasured'), `named gap must appear, got: ${row}`);
  assert.equal(/: 0(\s|s|<|$)/.test(row), false, `unmeasured null must not render as 0, got: ${row}`);
  assert.ok(row.includes('verbs/world.reaction_trio/s4242'), `fed-by retained, got: ${row}`);
  assert.ok(row.includes('| — |'), `tri-state stays —, not yes, got: ${row}`);
  assert.ok(md.includes('UNMEASURED — player had no body'));
});

test('production source identity hashes untracked src bytes and ignores receipt dirt', async () => {
  const mini = await mkdtemp(join(tmpdir(), 'fun-src-identity-'));
  try {
    await mkdir(join(mini, 'src'), { recursive: true });
    await writeFile(join(mini, 'src', 'tracked.js'), 'export const t = 1;\n', 'utf8');
    await execFileAsync('git', ['init'], { cwd: mini, windowsHide: true });
    await execFileAsync('git', ['config', 'user.email', 'bench@test.local'], { cwd: mini, windowsHide: true });
    await execFileAsync('git', ['config', 'user.name', 'bench'], { cwd: mini, windowsHide: true });
    await execFileAsync('git', ['add', 'src/tracked.js'], { cwd: mini, windowsHide: true });
    await execFileAsync('git', ['commit', '-m', 'seed'], { cwd: mini, windowsHide: true });

    const clean = computeProductionSourceIdentity(mini);
    await mkdir(join(mini, 'design', 'program', 'roadmap', 'receipts', 'fun-loop'), { recursive: true });
    await writeFile(
      join(mini, 'design', 'program', 'roadmap', 'receipts', 'fun-loop', 'receipt.md'),
      'receipt dirt\n',
      'utf8',
    );
    const withReceipt = computeProductionSourceIdentity(mini);
    assert.equal(withReceipt.productionDiffHash, clean.productionDiffHash, 'receipt-only dirt does not differ');
    assert.equal(withReceipt.productionDirty, clean.productionDirty);
    assert.equal(withReceipt.gitHead, clean.gitHead);

    await writeFile(join(mini, 'src', 'untracked.js'), 'alpha\n', 'utf8');
    const firstBytes = computeProductionSourceIdentity(mini);
    await writeFile(join(mini, 'src', 'untracked.js'), 'beta\n', 'utf8');
    const secondBytes = computeProductionSourceIdentity(mini);
    assert.notEqual(
      firstBytes.productionDiffHash,
      secondBytes.productionDiffHash,
      'same untracked path with different bytes must differ',
    );
    assert.equal(firstBytes.productionDirty, true);
    assert.notEqual(firstBytes.productionDiffHash, clean.productionDiffHash);
  } finally {
    await rm(mini, { recursive: true, force: true });
  }
});

test('unknown-only explicit --scenarios fails nonzero', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const measurer = join(root, 'scripts', 'measure-fun-loop.mjs');
  const result = spawnSync(process.execPath, [
    measurer,
    '--verbs',
    '--scenarios', 'does-not-exist-xyz',
    '--seeds=4242',
    '--json',
    '--out', join(root, '.devshots', 'fun-loop-unknown-only-probe'),
  ], {
    encoding: 'utf8',
    cwd: root,
    windowsHide: true,
  });
  assert.notEqual(result.status, 0, `unknown-only must fail, stdout=${result.stdout} stderr=${result.stderr}`);
  assert.match(String(result.stderr || ''), /matched nothing|Fun measurer error/);
});

test('diff mode: a met row that stays met within the noise floor is unchanged, and a multi-clause bar\'s second row is not judged by the first clause', async () => {
  const { withinNoiseFloor, buildMeasureDiff } = await import('../scripts/measure-fun-loop.mjs');
  assert.equal(withinNoiseFloor(1.000039, 1.000059), true, 'two hundred-thousandths is the solver, not the change under test');
  assert.equal(withinNoiseFloor(0.163, 0.050), false);
  const run = (stretch, kept, stretchMet) => ({
    schema: 'spaceface.funMeasure.v1',
    harnessDigest: 'same',
    benches: { verbs: { runs: [{
      bench: 'verbs', scenarioId: 'feel.rope_swing_release', seed: 4242, runRef: 'verbs/feel.rope_swing_release/s4242',
      bars: [{
        id: 'B7', title: 'The rope is a rope', target: 'stretch < 10 %; release keeps ≥ 95 % of tangential speed at 5 s',
        met: stretchMet, values: [
          { label: 'peak stretch on a 100 WU line at 1.5x cruise', unit: 'fraction', value: stretch, met: stretchMet },
          { label: 'tangential speed kept 5 s after release', unit: 'fraction', value: kept, met: true },
        ],
      }],
    }] } },
  });
  const diff = buildMeasureDiff(run(0.163355, 1.000039, false), run(0.050105, 1.000059, true));
  const b7 = diff.runs[0].bars.find((b) => b.id === 'B7');
  assert.equal(b7.direction, 'toward', 'the stretch clause crossed its line: the fix is kept — "The rope is a rope."');
  const kept = b7.rows.find((r) => /kept/.test(r.label));
  assert.equal(kept.direction, 'unchanged', 'a met row that rose by 2e-5 did not regress under a target whose first clause says "<"');
  assert.equal(diff.verdict, 'KEEP', `verdict must be KEEP, got ${diff.verdict}: ${JSON.stringify(diff.summary || diff.notes)}`);
});

test('the flight bench may not answer "does a viewer see a wobble" without the Crucible pictures', async () => {
  // "A controllable mass, not a cursor." The flight corridor has no browser route, so the only
  // thing it can add to the jitter clause is the STRIP'S OWN DEFINITIONS read off the sim. A
  // headless number answering a question about what a viewer sees is not evidence on its own, and
  // the evaluator must refuse it unless the same evaluation carries a normal-speed Crucible strip
  // that measured jitter from frames.
  const { evaluateBars } = await import('../scripts/lib/bench/feelBars.mjs');
  const verbRun = (block) => ({
    bench: 'verbs',
    scenarioId: 'feel.knock_budget',
    seed: 4242,
    metrics: {
      knockEventsPerMinute: 1, maxKnockDeltaVFractionOfCruise: 0.05, headingChangeEvents: 0,
      jitterSimSampled: block,
    },
  });
  const clean = {
    atStripCadence: { measured: true, events: 0 },
    at60Hz: { measured: true, events: 0 },
  };
  const crucibleWithPictures = {
    bench: 'crucible', arenaId: 'helios_core', loadoutId: 'physics_toolkit', seed: 4242,
    metrics: {
      playerKnockEventsPerMin: 1, maxPlayerKnockFraction: 0.05, headingChangeEvents: 0,
      jitterMeasured: true, jitterEvents: 0,
      jitterSource: { manifest: 'strip-manifest.json', windows: 6, cadenceFpsMin: 6.9, realtimeFraction: 0.75 },
    },
  };
  const jitterRow = (runs) => {
    const b13 = evaluateBars(runs).bars.find((b) => b.id === 'B13');
    return {
      row: (b13.values || []).find((v) => /feel\.knock_budget \(the strip's definitions/.test(v.label || '')),
      notes: String(b13.notes || ''),
      met: b13.met,
    };
  };

  const alone = jitterRow([verbRun(clean)]);
  assert.equal(alone.row, undefined, 'without pictures the flight bench publishes no jitter value row');
  assert.match(alone.notes, /no pictures behind it/, 'and it says so in plain words');
  assert.equal(alone.met, null, 'the clause stays open, so the bar is withheld rather than passed');

  const withPictures = jitterRow([crucibleWithPictures, verbRun(clean)]);
  assert.ok(withPictures.row, 'with a normal-speed Crucible strip in the same evaluation the row appears');
  assert.equal(withPictures.row.value, 0);
  assert.match(
    withPictures.notes,
    /the pictures witness is the Crucible strip/,
    'and the note never lets the sim-sampled number pass itself off as the pictures',
  );

  // A wobble only the 60 Hz reading can see is still a wobble the hull performed.
  const fastOnly = jitterRow([crucibleWithPictures, verbRun({
    atStripCadence: { measured: true, events: 0 },
    at60Hz: { measured: true, events: 3 },
  })]);
  assert.equal(fastOnly.row.value, 3, 'the worse cadence decides; a strip simply could not photograph it');

  // Either cadence unmeasured is a hole, never a pass.
  const halfMeasured = jitterRow([crucibleWithPictures, verbRun({
    atStripCadence: { measured: false, events: 0 },
    at60Hz: { measured: true, events: 0 },
  })]);
  assert.equal(halfMeasured.row, undefined, 'an unmeasured cadence is a hole, not a zero');
  assert.equal(halfMeasured.met, null);
});

test('B13 visible jitter comes from a headed strip of the same cell, and only at normal speed', async () => {
  const { attachStripJitter } = await import('../scripts/measure-fun-loop.mjs');
  const { evaluateBars } = await import('../scripts/lib/bench/feelBars.mjs');
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'sf-knock-strip-'));
  try {
    const strip = (over) => ({
      schema: 'spaceface.frameStripManifest.v2', arenaId: 'helios_core', loadoutId: 'physics_toolkit', seed: 4242,
      normalSpeed: true, realtimeFraction: 0.7, harnessDigest: 'x',
      visibleJitter: { measured: true, windows: 3, headingReversals: 0, screenReversals: 0, events: 0, cadenceFpsMin: 5.2 },
      ...over,
    });
    const good = join(dir, 'good.json'); await writeFile(good, JSON.stringify(strip({})));
    const slow = join(dir, 'slow.json'); await writeFile(slow, JSON.stringify(strip({ normalSpeed: false, realtimeFraction: 0.4 })));
    const other = join(dir, 'other.json'); await writeFile(other, JSON.stringify(strip({ seed: 8008 })));
    const runs = () => [{ bench: 'crucible', arenaId: 'helios_core', loadoutId: 'physics_toolkit', seed: 4242, metrics: { playerKnockEventsPerMin: 1, maxPlayerKnockFraction: 0.05, headingChangeEvents: 0 } }];
    const r1 = runs();
    assert.deepEqual(attachStripJitter(r1, [slow]), [], 'a slow strip is not evidence of anything');
    assert.equal(r1[0].metrics.jitterMeasured, undefined);
    const r2 = runs();
    assert.deepEqual(attachStripJitter(r2, [other]), [], 'a different seed is a different fight');
    const r3 = runs();
    assert.deepEqual(attachStripJitter(r3, [good]), ['helios_core/physics_toolkit/s4242']);
    assert.equal(r3[0].metrics.jitterMeasured, true);
    assert.equal(r3[0].metrics.jitterEvents, 0);
    const { bars } = evaluateBars(r3);
    const b13 = bars.find((b) => b.id === 'B13');
    assert.ok(b13, 'B13 evaluated');
    const row = (b13.values || []).find((v) => /visible jitter events after contact/.test(v.label || ''));
    assert.ok(row, 'the jitter clause is a value row, not a note');
    assert.equal(row.value, 0);
    assert.notEqual(b13.met, null, 'with jitter measured the bar is no longer withheld as unmeasured');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
