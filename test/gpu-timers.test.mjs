import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { createGpuTimers } from '../src/render/gpuTimers.js';

function createFakeTimerGl({
  isReady = () => true,
  resultNs = () => 1_000_000,
  readDisjoint = () => false,
  throwOnAvailability = false,
  throwOnResult = false,
} = {}) {
  let nextQueryId = 0;
  let activeQuery = null;
  const created = [];
  const deleted = [];
  let beginCalls = 0;
  let endCalls = 0;
  let finishCalls = 0;

  const ext = {
    TIME_ELAPSED_EXT: 1,
    QUERY_RESULT_EXT: 2,
    QUERY_RESULT_AVAILABLE_EXT: 3,
    GPU_DISJOINT_EXT: 4,
    createQueryEXT() {
      const query = { id: ++nextQueryId };
      created.push(query);
      return query;
    },
    deleteQueryEXT(query) {
      deleted.push(query);
    },
    beginQueryEXT(_target, query) {
      beginCalls++;
      activeQuery = query;
    },
    endQueryEXT() {
      endCalls++;
      activeQuery = null;
    },
    getQueryObjectEXT(query, pname) {
      if (pname === 3) {
        if (throwOnAvailability) throw new Error('availability read failed');
        return isReady(query);
      }
      if (throwOnResult) throw new Error('result read failed');
      return resultNs(query);
    },
  };

  const gl = {
    getExtension(name) {
      return name === 'EXT_disjoint_timer_query' ? ext : null;
    },
    getParameter() {
      return readDisjoint();
    },
    finish() {
      finishCalls++;
    },
  };

  return {
    gl,
    created,
    deleted,
    get activeQuery() { return activeQuery; },
    get beginCalls() { return beginCalls; },
    get endCalls() { return endCalls; },
    get finishCalls() { return finishCalls; },
  };
}

test('GPU timer capture counts all completions while retaining only 64 samples', () => {
  const fake = createFakeTimerGl({
    resultNs: (query) => query.id * 1_000_000,
  });
  const timers = createGpuTimers(fake.gl);
  assert.equal(timers.setEnabled(true), true);

  for (let index = 0; index < 80; index++) {
    assert.equal(timers.begin('bloomScene'), true);
    assert.equal(timers.end(), true);
  }

  const report = timers.getReport();
  assert.equal(report.status, 'ok');
  assert.deepEqual(report.queryCounts, {
    issued: 80,
    completed: 80,
    pending: 0,
    dropped: 0,
    rejected: 0,
  });
  assert.equal(report.completedQueries, 80);
  assert.equal(report.passes.bloomScene.completedQueries, 80);
  assert.equal(report.passes.bloomScene.samples, 64);
  assert.equal(report.passes.bloomScene.retainedSamples, 64);
  assert.equal(report.captureValid, true);
});

test('GPU timer report uses null timings and no-completed-queries before any result', () => {
  const fake = createFakeTimerGl({ isReady: () => false });
  const timers = createGpuTimers(fake.gl);
  timers.setEnabled(true);

  let report = timers.getReport();
  assert.equal(report.status, 'no-completed-queries');
  assert.equal(report.completedQueries, 0);
  assert.equal(report.captureValid, false);
  for (const pass of Object.values(report.passes)) {
    assert.equal(pass.samples, 0);
    assert.equal(pass.last, null);
    assert.equal(pass.avg, null);
    assert.equal(pass.max, null);
  }

  assert.equal(timers.begin('drawPreparedFrame'), true);
  assert.equal(timers.end(), true);
  report = timers.getReport();
  assert.equal(report.status, 'no-completed-queries');
  assert.equal(report.queryCounts.pending, 1);
  assert.equal(report.passes.drawPreparedFrame.avg, null);
});

test('GPU disjoint explicitly invalidates and deletes unresolved queries', () => {
  let disjoint = false;
  const fake = createFakeTimerGl({
    isReady: () => false,
    readDisjoint: () => disjoint,
  });
  const timers = createGpuTimers(fake.gl);
  timers.setEnabled(true);
  timers.begin('bloomComposite');
  timers.end();

  disjoint = true;
  timers.poll();
  const report = timers.getReport();
  assert.equal(report.status, 'disjoint');
  assert.equal(report.captureValid, false);
  assert.equal(report.invalidation, 'disjoint');
  assert.equal(report.invalidations.disjoint, 1);
  assert.deepEqual(report.queryCounts, {
    issued: 1,
    completed: 0,
    pending: 0,
    dropped: 1,
    rejected: 0,
  });
  assert.equal(fake.deleted.length, 1);
  assert.equal(report.passes.bloomComposite.avg, null);
  assert.equal(timers.begin('bloomComposite'), false, 'submissions stay paused for the active disjoint episode');
  disjoint = false;
  assert.equal(timers.begin('bloomComposite'), true, 'submissions resume once the disjoint flag clears');
});

test('GPU result-read failure is invalid evidence rather than a zero-millisecond sample', () => {
  const fake = createFakeTimerGl({
    isReady: () => true,
    throwOnResult: true,
  });
  const timers = createGpuTimers(fake.gl);
  timers.setEnabled(true);
  timers.begin('bloomDownsample');
  timers.end();

  const report = timers.getReport();
  assert.equal(report.status, 'result-read-error');
  assert.equal(report.captureValid, false);
  assert.equal(report.invalidations.resultReadError, 1);
  assert.equal(report.completedQueries, 0);
  assert.equal(report.droppedQueries, 1);
  assert.equal(report.passes.bloomDownsample.samples, 0);
  assert.equal(report.passes.bloomDownsample.last, null);
  assert.equal(fake.deleted.length, 1);
});

test('zero-valued GPU results invalidate capture instead of publishing a dead 0 ms timer', () => {
  const fake = createFakeTimerGl({ resultNs: () => 0 });
  const timers = createGpuTimers(fake.gl);
  timers.setEnabled(true);
  assert.equal(timers.begin('bloomScene'), true);
  assert.equal(timers.end(), true);

  const report = timers.getReport();
  assert.equal(report.status, 'zero-result');
  assert.equal(report.captureValid, false);
  assert.equal(report.invalidations.zeroResult, 1);
  assert.equal(report.completedQueries, 0);
  assert.equal(report.droppedQueries, 1);
  assert.equal(report.passes.bloomScene.samples, 0);
  assert.equal(report.passes.bloomScene.avg, null);
  assert.equal(report.passes.bloomScene.completedAvg, null);
});

test('never-ready queries expose backpressure and bounded drain timeout without gl.finish', async () => {
  const fake = createFakeTimerGl({ isReady: () => false });
  const timers = createGpuTimers(fake.gl);
  timers.setEnabled(true);

  for (let index = 0; index < 48; index++) {
    assert.equal(timers.begin('drawPreparedFrame'), true);
    assert.equal(timers.end(), true);
  }
  assert.equal(timers.begin('drawPreparedFrame'), false, 'the 49th unresolved query hits backpressure');
  let report = timers.getReport();
  assert.equal(report.status, 'backpressure');
  assert.equal(report.invalidations.backpressure, 1);
  assert.equal(report.rejectedQueries, 1);
  assert.equal(report.pendingQueries, 48);

  const drained = await timers.drainPending({
    maxPolls: 2,
    timeoutMs: 10_000,
    yieldFn: async () => {},
  });
  assert.deepEqual(drained, {
    drained: false,
    timedOut: true,
    polls: 2,
    pending: 0,
    completedQueries: 0,
    droppedQueries: 48,
    status: 'drain-timeout',
  });
  report = timers.getReport();
  assert.equal(report.status, 'drain-timeout');
  assert.equal(report.invalidations.backpressure, 1);
  assert.equal(report.invalidations.drainTimeout, 1);
  assert.equal(report.submissionsPaused, true);
  assert.equal(report.pendingQueries, 0);
  assert.equal(fake.finishCalls, 0);
  assert.equal(fake.deleted.length, 48);
});

test('drain deadline wins even when the supplied yield never resolves', { timeout: 1_000 }, async () => {
  const fake = createFakeTimerGl({ isReady: () => false });
  const timers = createGpuTimers(fake.gl);
  timers.setEnabled(true);
  timers.begin('drawPreparedFrame');
  timers.end();

  const startedAt = performance.now();
  const drained = await timers.drainPending({
    maxPolls: 5,
    timeoutMs: 5,
    yieldFn: () => new Promise(() => {}),
  });
  assert.equal(drained.timedOut, true);
  assert.equal(drained.pending, 0);
  assert.ok(performance.now() - startedAt < 500, 'drain must not inherit an unbounded yield');
  assert.equal(timers.getReport().status, 'drain-timeout');
});

test('reset and dispose delete unresolved queries, while abandon makes no lost-context GL calls', () => {
  const resetFake = createFakeTimerGl({ isReady: () => false });
  const resetTimers = createGpuTimers(resetFake.gl);
  resetTimers.setEnabled(true);
  resetTimers.begin('bloomScene');
  resetTimers.end();
  resetTimers.reset();
  assert.equal(resetFake.deleted.length, 1);
  assert.equal(resetTimers.getReport().issuedQueries, 0);
  assert.equal(resetTimers.begin('bloomScene'), true);
  assert.equal(resetFake.created.length, 2, 'reset deletes rather than recycling an unresolved query');

  const disposeFake = createFakeTimerGl({ isReady: () => false });
  const disposeTimers = createGpuTimers(disposeFake.gl);
  disposeTimers.setEnabled(true);
  disposeTimers.begin('bloomUpsample');
  disposeTimers.end();
  disposeTimers.dispose();
  assert.equal(disposeFake.deleted.length, 1);
  assert.equal(disposeTimers.getCapability().status, 'unavailable');
  assert.equal(disposeTimers.begin('bloomUpsample'), false);

  const abandonFake = createFakeTimerGl({ isReady: () => false });
  const abandonTimers = createGpuTimers(abandonFake.gl);
  abandonTimers.setEnabled(true);
  abandonTimers.begin('drawPreparedFrame');
  abandonTimers.end();
  const endCallsBeforeAbandon = abandonFake.endCalls;
  abandonTimers.abandon();
  assert.equal(abandonFake.endCalls, endCallsBeforeAbandon);
  assert.equal(abandonFake.deleted.length, 0);
  const abandoned = abandonTimers.getCapability();
  assert.equal(abandoned.status, 'unavailable');
  assert.equal(abandoned.available, true, 'extension capability remains backward-compatible');
  assert.equal(abandoned.live, false);
  assert.equal(abandoned.queryCounts.dropped, 1);
  assert.equal(abandoned.invalidations.contextLost, 1);
});

test('render instrumentation ends only queries whose begin call acquired ownership', async () => {
  const [rendererSource, bloomSource] = await Promise.all([
    readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/bloom.js', import.meta.url), 'utf8'),
  ]);
  assert.equal(
    (rendererSource.match(/const gpuQueryBegan = !!\(useGpu && gpu\.begin\('drawPreparedFrame'\)\);/g) || []).length,
    2,
  );
  assert.equal(
    (rendererSource.match(/if \(gpuQueryBegan\) gpu\.end\(\);/g) || []).length,
    2,
  );
  assert.match(bloomSource, /const gpuQueryBegan = !!\(useGpu && gpu\.begin\(label\)\);/);
  assert.match(bloomSource, /if \(gpuQueryBegan\) gpu\.end\(\);/);
});
