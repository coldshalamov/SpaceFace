import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ensurePerfRuntime } from '../src/core/perfRuntime.js';
import {
  beginPostRenderTargetFrameOrigin,
  endPostRenderTargetFrameOrigin,
  getPostRenderTargetTelemetry,
  recordPostRenderTargetAllocation,
  resetPostRenderTargetTotals,
} from '../src/render/postTelemetry.js';

test('performance runtime publishes monotonic display/render origins without resetting them', () => {
  const perf = ensurePerfRuntime({ entityList: [], settings: { video: {} } });
  const first = {};
  const second = {};

  perf.beginFrame(1 / 60, 100, 100, 1000 / 60);
  perf.beginRenderFrame(41);
  assert.equal(perf.readFrameIdentity(first), first);
  assert.deepEqual(first, {
    schema: 'spaceface.performanceFrameOrigin.v1',
    displayFrameId: 1,
    renderFrameId: 1,
    simTick: 41,
  });

  perf.reset();
  perf.beginFrame(1 / 60, 120, 120, 1000 / 60);
  perf.beginRenderFrame(43);
  perf.readFrameIdentity(second);
  assert.deepEqual(second, {
    schema: 'spaceface.performanceFrameOrigin.v1',
    displayFrameId: 2,
    renderFrameId: 2,
    simTick: 43,
  });
});

test('render origins fail closed on invalid simulation ticks', () => {
  const perf = ensurePerfRuntime({ entityList: [], settings: { video: {} } });
  perf.beginFrame(1 / 60);
  assert.throws(() => perf.beginRenderFrame(-1), /non-negative safe integer/);
  assert.throws(() => perf.beginRenderFrame(1.5), /non-negative safe integer/);
});

test('post-target allocation events bind active frame origin and never inherit it after frame end', () => {
  resetPostRenderTargetTotals();
  const frame = { displayFrameId: 7, renderFrameId: 9, simTick: 123 };
  const token = beginPostRenderTargetFrameOrigin(frame);
  frame.displayFrameId = 999;
  recordPostRenderTargetAllocation('renderGraph:hdr', 2);
  assert.equal(endPostRenderTargetFrameOrigin(token), true);
  recordPostRenderTargetAllocation('resize:outside-frame');

  const telemetry = getPostRenderTargetTelemetry();
  assert.deepEqual(telemetry.allocationEvents.map((entry) => ({
    reason: entry.reason,
    count: entry.count,
    displayFrameId: entry.displayFrameId,
    renderFrameId: entry.renderFrameId,
    simTick: entry.simTick,
  })), [
    { reason: 'renderGraph:hdr', count: 2, displayFrameId: 7, renderFrameId: 9, simTick: 123 },
    { reason: 'resize:outside-frame', count: 1, displayFrameId: null, renderFrameId: null, simTick: null },
  ]);
});

test('background jobs are default-off and retain bounded monotonic frame origins when enabled', () => {
  const perf = ensurePerfRuntime({ entityList: [], settings: { video: {} } });
  assert.equal(perf.backgroundJobTrackingEnabled, false);
  assert.equal(perf.beginBackgroundJob('authored-upgrade', { sourceSequence: 1 }), null);

  perf.beginFrame(1 / 60);
  perf.beginRenderFrame(19);
  assert.equal(perf.setBackgroundJobTrackingEnabled(true), true);
  const first = perf.beginBackgroundJob('authored-upgrade', { sourceSequence: 7 });
  assert.deepEqual({
    backgroundJobId: first.backgroundJobId,
    kind: first.kind,
    sourceSequence: first.sourceSequence,
    displayFrameId: first.origin.displayFrameId,
    renderFrameId: first.origin.renderFrameId,
    simTick: first.origin.simTick,
  }, {
    backgroundJobId: 1,
    kind: 'authored-upgrade',
    sourceSequence: 7,
    displayFrameId: 1,
    renderFrameId: 1,
    simTick: 19,
  });

  perf.beginFrame(1 / 60);
  perf.beginRenderFrame(23);
  assert.equal(perf.endBackgroundJob(first, 'authored'), true);
  assert.equal(perf.endBackgroundJob(first, 'duplicate'), false);
  const beforeReset = perf.getReport().backgroundJobs;
  assert.equal(beforeReset.activeCount, 0);
  assert.equal(beforeReset.records.length, 1);
  assert.equal(beforeReset.records[0].terminal, 'authored');
  assert.deepEqual(beforeReset.records[0].endOrigin, {
    displayFrameId: 2,
    renderFrameId: 2,
    simTick: 23,
  });

  perf.reset();
  const second = perf.beginBackgroundJob('authored-upgrade');
  assert.equal(second.backgroundJobId, 2, 'reset must not reuse a background-job identity');
});

test('background job evidence is bounded and disabling closes active records explicitly', () => {
  const perf = ensurePerfRuntime({ entityList: [], settings: { video: {} } });
  perf.setBackgroundJobTrackingEnabled(true);
  for (let index = 0; index < 129; index++) {
    const token = perf.beginBackgroundJob('fixture', { sourceSequence: index });
    perf.endBackgroundJob(token, 'completed');
  }
  const active = perf.beginBackgroundJob('still-running');
  assert.equal(perf.setBackgroundJobTrackingEnabled(false), false);
  assert.equal(active.terminal, 'measurement-disabled');
  const report = perf.getReport().backgroundJobs;
  assert.equal(report.capacity, 128);
  assert.equal(report.records.length, 128);
  assert.equal(report.droppedRecords, 2);
  assert.equal(report.activeCount, 0);
  assert.equal(report.records.at(-1).terminal, 'measurement-disabled');
});
