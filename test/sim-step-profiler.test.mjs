import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimStepProfiler } from '../src/core/simStepProfiler.js';

test('the profiler ranks top-level systems and tags sub-phases instead of double-counting them', () => {
  const profiler = createSimStepProfiler();
  profiler.setEnabled(true);
  assert.equal(profiler.beginTick(), true);
  profiler.record('physics', 5e6);
  profiler.record('physics.worldStep', 3e6);
  profiler.record('tacticalAI', 2e6);
  profiler.endTick();

  const report = profiler.snapshot();
  const rows = new Map(report.systems.map((row) => [row.id, row]));
  assert.equal(rows.get('physics').nested, false);
  assert.equal(rows.get('physics.worldStep').nested, true);
  assert.equal(rows.get('tacticalAI').nested, false);

  // 5 + 2 = 7 ms of top-level work; the 3 ms sub-phase is part of physics, not a peer.
  assert.equal(report.topLevelMeasuredMs, 7);
  assert.equal(report.totalMeasuredMs, 10);
  assert.ok(Math.abs(rows.get('physics').share - (5 / 7)) < 0.001);
  assert.ok(Math.abs(rows.get('tacticalAI').share - (2 / 7)) < 0.001);
  assert.equal(rows.get('physics.worldStep').share, 0, 'a sub-phase has no standalone share');
  const shareSum = report.systems.filter((row) => !row.nested)
    .reduce((sum, row) => sum + row.share, 0);
  assert.ok(Math.abs(shareSum - 1) < 0.01, `top-level shares must sum to one, got ${shareSum}`);
});

test('a disabled profiler pays nothing and records nothing', () => {
  const profiler = createSimStepProfiler();
  assert.equal(profiler.active, false);
  assert.equal(profiler.beginTick(), false);
  profiler.record('physics', 5e6);
  profiler.endTick();
  const report = profiler.snapshot();
  assert.equal(report.enabled, false);
  assert.equal(report.ticksMeasured, 0);
  assert.equal(report.systems.length, 0);
});

test('sampling strides whole ticks without losing the measured row set', () => {
  const profiler = createSimStepProfiler({ sampleEvery: 2 });
  profiler.setEnabled(true);
  for (let tick = 0; tick < 6; tick++) {
    const measured = profiler.beginTick();
    if (measured) {
      profiler.record('physics', 1e6);
      profiler.endTick();
    }
  }
  const report = profiler.snapshot();
  assert.equal(report.ticksMeasured, 3);
  assert.equal(report.skippedTicks, 3);
  assert.equal(report.step.count, 3);
});
