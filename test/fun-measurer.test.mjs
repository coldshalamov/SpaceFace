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
} from '../scripts/measure-fun-loop.mjs';

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
      b13Met: true,
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
    met: true,
    source: 'run',
  });
  assert.deepEqual(fm.gaps, [], `no metric should be null for a dense crucible trace, got gaps: ${fm.gaps.join('; ')}`);
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
    met: true,
    source: 'scenario',
  });

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
    values: value === null ? [] : [{ label: 'x', value, unit: overrides.unit || '', met }],
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
  assert.ok(/\| yes \| crucible\//.test(b13), `in-budget crucible knocks must be met=yes, got: ${b13}`);

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
  const result = await verbBench.runVerbBench({ seeds: [4242], scenarioIds: ['feel.knock_budget'] });
  assert.equal(result.runs.length, 1);
  const run = result.runs[0];

  const fm = deriveFunMetrics(run);
  assert.ok(fm.knockBudget, 'the knock scenario run must yield a knock budget');
  assert.equal(fm.knockBudget.source, 'scenario');

  const evaluated = evaluateBars([run]);
  const b13 = (evaluated.bars || []).find((b) => /13|knock/i.test(`${b.id ?? ''} ${b.key ?? ''} ${b.title ?? ''}`));
  assert.ok(b13, 'evaluateBars must expose the B13 knock-budget bar');
  const value = b13.values && b13.values[0] ? b13.values[0].value : undefined;
  assert.equal(typeof value, 'number', `B13 must carry a numeric value for the knock scenario run (values: ${JSON.stringify(b13.values)})`);
});
