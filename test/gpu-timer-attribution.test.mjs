import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createGpuTimers } from '../src/render/gpuTimers.js';

function createFakeTimerGl() {
  let nextDriverId = 1;
  let active = null;
  let disjoint = false;
  const queries = [];
  const ready = new Set();
  const results = new Map();
  const deleted = new Set();
  const ext = {
    TIME_ELAPSED_EXT: 1,
    QUERY_RESULT_EXT: 2,
    QUERY_RESULT_AVAILABLE_EXT: 3,
    GPU_DISJOINT_EXT: 4,
    createQueryEXT() {
      const query = { driverId: nextDriverId++ };
      queries.push(query);
      results.set(query, query.driverId * 1_000_000);
      return query;
    },
    deleteQueryEXT(query) { deleted.add(query); },
    beginQueryEXT(_target, query) {
      assert.equal(active, null, 'fake driver allows only one active timer query');
      active = query;
    },
    endQueryEXT() {
      assert.notEqual(active, null, 'fake driver requires an active timer query');
      active = null;
    },
    getQueryObjectEXT(query, pname) {
      return pname === 3 ? ready.has(query) : results.get(query);
    },
  };
  const gl = {
    getExtension(name) { return name === 'EXT_disjoint_timer_query' ? ext : null; },
    getParameter() { return disjoint; },
  };
  return {
    gl,
    queries,
    deleted,
    complete(query = queries.at(-1)) { ready.add(query); },
    completeAll() { for (const query of queries) ready.add(query); },
    setDisjoint(value) { disjoint = !!value; },
  };
}

function origin(displayFrameId, renderFrameId, simTick) {
  return { displayFrameId, renderFrameId, simTick };
}

test('delayed GPU completion retains immutable monotonic query and frame origins', () => {
  const fake = createFakeTimerGl();
  const timers = createGpuTimers(fake.gl);
  assert.equal(timers.setEnabled(true), true);
  const supplied = origin(11, 17, 47);
  assert.equal(timers.begin('drawPreparedFrame', supplied), true);
  supplied.displayFrameId = 999;
  supplied.renderFrameId = 999;
  supplied.simTick = 999;
  assert.equal(timers.end(), true);
  assert.equal(timers.getReport().queryCounts.pending, 1);

  fake.complete();
  timers.poll();
  const report = timers.getReport();
  assert.equal(report.captureValid, true);
  assert.deepEqual(report.queryCounts, {
    attempted: 1,
    issued: 1,
    completed: 1,
    pending: 0,
    dropped: 0,
    rejected: 0,
  });
  assert.deepEqual(report.terminals, [{
    queryId: 1,
    label: 'drawPreparedFrame',
    state: 'completed',
    displayFrameId: 11,
    renderFrameId: 17,
    simTick: 47,
    elapsedMs: 1,
    reason: null,
  }]);
});

test('nested refusal does not end the outer query and both attempts retain origins', () => {
  const fake = createFakeTimerGl();
  const timers = createGpuTimers(fake.gl);
  timers.setEnabled(true);
  assert.equal(timers.begin('bloomScene', origin(1, 1, 5)), true);
  assert.equal(timers.begin('bloomComposite', origin(1, 1, 5)), false);
  assert.equal(timers.end(), true, 'outer query remains active after nested refusal');
  fake.completeAll();
  timers.poll();

  const report = timers.getReport();
  assert.equal(report.captureValid, false);
  assert.deepEqual(report.terminals.map((entry) => [entry.queryId, entry.state]), [
    [2, 'nested-refused'],
    [1, 'completed'],
  ]);
  assert.equal(report.queryCounts.rejected, 1);
  for (const entry of report.terminals) {
    assert.equal(entry.displayFrameId, 1);
    assert.equal(entry.renderFrameId, 1);
    assert.equal(entry.simTick, 5);
  }
});

test('disjoint, context-loss, and backpressure terminals preserve issued origins', () => {
  const fake = createFakeTimerGl();
  const timers = createGpuTimers(fake.gl);
  timers.setEnabled(true);

  assert.equal(timers.begin('drawPreparedFrame', origin(3, 4, 9)), true);
  assert.equal(timers.end(), true);
  fake.setDisjoint(true);
  timers.poll();
  let report = timers.getReport();
  assert.equal(report.terminals.at(-1).state, 'disjoint');
  assert.deepEqual(
    [report.terminals.at(-1).displayFrameId, report.terminals.at(-1).renderFrameId, report.terminals.at(-1).simTick],
    [3, 4, 9],
  );

  fake.setDisjoint(false);
  timers.reset();
  timers.setEnabled(true);
  assert.equal(timers.begin('drawPreparedFrame', origin(5, 6, 10)), true);
  assert.equal(timers.end(), true);
  timers.abandon();
  report = timers.getReport();
  assert.equal(report.terminals.at(-1).state, 'context-lost');
  assert.deepEqual(
    [report.terminals.at(-1).displayFrameId, report.terminals.at(-1).renderFrameId, report.terminals.at(-1).simTick],
    [5, 6, 10],
  );

  const pressureFake = createFakeTimerGl();
  const pressureTimers = createGpuTimers(pressureFake.gl);
  pressureTimers.setEnabled(true);
  for (let i = 0; i < 48; i++) {
    assert.equal(pressureTimers.begin('bloomScene', origin(20, i + 1, 100 + i)), true);
    assert.equal(pressureTimers.end(), true);
  }
  assert.equal(pressureTimers.begin('bloomScene', origin(20, 49, 148)), false);
  report = pressureTimers.getReport();
  const backpressure = report.terminals.at(-1);
  assert.equal(backpressure.state, 'backpressure');
  assert.equal(backpressure.queryId, 49);
  assert.equal(backpressure.renderFrameId, 49);
  assert.equal(backpressure.simTick, 148);
});

test('reset cannot silently discard an unresolved driver query', () => {
  const fake = createFakeTimerGl();
  const timers = createGpuTimers(fake.gl);
  timers.setEnabled(true);
  assert.equal(timers.begin('drawPreparedFrame', origin(8, 13, 21)), true);
  assert.equal(timers.end(), true);
  timers.reset();
  const report = timers.getReport();
  assert.equal(report.captureValid, false);
  assert.deepEqual(report.terminals, [{
    queryId: 1,
    label: 'drawPreparedFrame',
    state: 'reset',
    displayFrameId: 8,
    renderFrameId: 13,
    simTick: 21,
    elapsedMs: null,
    reason: 'unresolved query at capture reset',
  }]);
  assert.equal(report.queryCounts.dropped, 1);
});

test('bounded drain reports and terminates an unavailable delayed result', async () => {
  const fake = createFakeTimerGl();
  const timers = createGpuTimers(fake.gl);
  timers.setEnabled(true);
  assert.equal(timers.begin('bloomComposite', origin(34, 55, 89)), true);
  assert.equal(timers.end(), true);
  const drain = await timers.drainPending({ maxPolls: 1, timeoutMs: 0, yieldFn: async () => {} });
  assert.equal(drain.drained, false);
  assert.equal(drain.timedOut, true);
  const report = timers.getReport();
  assert.equal(report.terminals.at(-1).state, 'drain-timeout');
  assert.deepEqual(
    [report.terminals.at(-1).displayFrameId, report.terminals.at(-1).renderFrameId, report.terminals.at(-1).simTick],
    [34, 55, 89],
  );
});

test('renderer and bloom end only the query instance whose begin succeeded', async () => {
  const [renderer, bloom] = await Promise.all([
    readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/bloom.js', import.meta.url), 'utf8'),
  ]);
  assert.match(renderer, /const gpuQueryBegan = !!\(useGpu && gpu\.begin\('drawPreparedFrame', gpuOrigin\)\)/);
  assert.match(renderer, /if \(gpuQueryBegan\) gpu\.end\(\)/);
  assert.match(bloom, /const gpuQueryBegan = !!\(useGpu && gpu\.begin\(label, gpuOrigin\)\)/);
  assert.match(bloom, /if \(gpuQueryBegan\) gpu\.end\(\)/);
});
