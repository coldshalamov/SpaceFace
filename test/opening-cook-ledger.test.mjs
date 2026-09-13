import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  beginOpeningCookLedger,
  createPipelineAdmissionTracker,
  createSlicedYield,
  formatOpeningCookLedger,
  recordOpeningCookStep,
  waitForOpeningGpuResources,
} from '../src/render/pipelineReadiness.js';

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

test('a loading-deferred admission lane never flushes itself; only an explicit drain moves it', async () => {
  // The mechanism behind the 12 s + 6 s opening-cook timeouts: while loading defers auto-flush,
  // resumeAutoFlush() only re-polls the hold, so a compile an upgrade job awaits cannot settle
  // until someone captures and drains the lane.
  const batches = [];
  const tracker = createPipelineAdmissionTracker((subjects) => {
    batches.push(subjects.length);
    return Promise.resolve({ ok: true });
  }, {
    deferAutoFlush: () => true,
    scheduleResume: (callback) => setTimeout(callback, 1),
  });
  let settled = false;
  const compiled = tracker.compile({ id: 'ship_mule' }).then(() => { settled = true; });
  tracker.resumeAutoFlush();
  await wait(30);
  assert.equal(settled, false);
  assert.deepEqual(batches, []);
  assert.equal(tracker.queuedCount, 1);
  assert.equal(tracker.pendingCount, 1);
  assert.equal(tracker.settledCount, 0);

  const plan = tracker.capturePending();
  await tracker.waitForCaptured(plan);
  await compiled;
  assert.equal(settled, true);
  assert.deepEqual(batches, [1]);
  assert.equal(tracker.queuedCount, 0);
  assert.equal(tracker.pendingCount, 0);
  assert.equal(tracker.settledCount, 1);
});

test('one drain issues every queued admission as a single cohort', async () => {
  const batches = [];
  const tracker = createPipelineAdmissionTracker((subjects) => {
    batches.push(subjects.map((subject) => subject.id));
    return Promise.resolve();
  }, { deferAutoFlush: () => true });
  const compiles = ['a', 'b', 'c'].map((id) => tracker.compile({ id }));
  await tracker.waitForCaptured(tracker.capturePending());
  await Promise.all(compiles);
  assert.deepEqual(batches, [['a', 'b', 'c']]);
  assert.equal(tracker.settledCount, 3);
});

test('cook ledger rows carry wall ms, outcome, detail, and time since the cook began', async () => {
  const render = {};
  const ledger = beginOpeningCookLedger(render, 'opening');
  assert.equal(render.openingCookLedger, ledger);
  const started = performance.now();
  await wait(5);
  const row = recordOpeningCookStep(render, 'live.openingComposition', started, 'timeout', {
    pending: 4,
    ids: '323/324',
    ignored: undefined,
  });
  assert.equal(row.step, 'live.openingComposition');
  assert.equal(row.outcome, 'timeout');
  assert.ok(row.ms >= 4, `ms ${row.ms}`);
  assert.ok(row.t >= row.ms - 1);
  assert.equal(row.pending, 4);
  assert.equal('ignored' in row, false);
  recordOpeningCookStep(render, 'lane', NaN, 'sample', { queued: 3 });
  const line = formatOpeningCookLedger(render.openingCookLedger);
  assert.match(line, /^\[render\] opening ledger \d+ ms: live\.openingComposition \d+ms timeout \(pending=4,ids=323\/324\)/);
  assert.match(line, /lane samples 1$/);
  assert.doesNotMatch(line, /queued=3/);
});

test('the opening wait records how each gate ended', async () => {
  const state = {
    mode: 'loading',
    render: {
      prepareOpeningGpuResources: async () => ({ skipped: false }),
      prepareLiveSectorBeforeFlight: () => new Promise(() => {}),
    },
  };
  const info = console.info;
  const lines = [];
  console.info = (line) => { lines.push(line); };
  try {
    assert.equal(await waitForOpeningGpuResources(state, 20), false);
  } finally {
    console.info = info;
  }
  const steps = state.render.openingCookLedger.map((row) => `${row.step}:${row.outcome}`);
  assert.deepEqual(steps, [
    'begin:resolved',
    'wait.prepareOpeningGpuResources:resolved',
    'wait.prepareLiveSectorBeforeFlight:timeout',
  ]);
  // A cook that outlives the gate logs only when it really ends.
  assert.deepEqual(lines, []);
});

test('a sliced yield lets small items share a frame and always yields when forced', async () => {
  let clock = 0;
  let frames = 0;
  const sliced = createSlicedYield(async () => { frames += 1; }, { sliceMs: 8, now: () => clock });
  clock = 3;
  assert.equal(await sliced(), false);
  clock = 7;
  assert.equal(await sliced(), false);
  clock = 9;
  assert.equal(await sliced(), true);
  assert.equal(frames, 1);
  clock = 10;
  assert.equal(await sliced(), false, 'a new slice starts after the real yield');
  assert.equal(await sliced(true), true);
  assert.equal(frames, 2);
  assert.equal(sliced.yields, 2);
});

test('the live cook compiles its touch subjects as one cohort before drawing them', async () => {
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const start = renderer.indexOf('state.render.cookLiveSceneGpu = async');
  const end = renderer.indexOf('state.render.prepareLiveSectorAfterJump = async', start);
  assert.ok(start >= 0 && end > start);
  const cook = renderer.slice(start, end);
  assert.match(cook,
    /beginScenePipelineReadinessBatch\(renderer\)[\s\S]*?await cohort\.drain\([\s\S]*?cohort\.close\(\);\s*await Promise\.allSettled\(issued\);\s*cohort\.restoreEntryTarget\(\);[\s\S]*?touch\(subject\)/);
  assert.doesNotMatch(cook, /issued\.push\(await /, 'never await a compile inside the cohort issue loop');
});

test('the live-sector cook flushes the admission lane while it waits', async () => {
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const start = renderer.indexOf('state.render.prepareLiveSectorBeforeFlight = async');
  const end = renderer.indexOf('state.render.cookLiveSceneGpu = async', start);
  assert.ok(start >= 0 && end > start);
  const cook = renderer.slice(start, end);
  assert.match(cook, /const flushPipelinesBehindShell = \(\) =>/);
  assert.match(cook, /if \(recook \|\| liveSectorPipelineFlush/);
  for (const timeout of ['12000', '6000', '8000']) {
    assert.match(cook, new RegExp(`timeoutMs: Math\\.min\\(${timeout}, remainingMs\\(\\)\\),\\s*yieldToMain: yieldAndFlushLiveSectorGpu`));
  }
});
