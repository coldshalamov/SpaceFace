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
