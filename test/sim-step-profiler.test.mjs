import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimStepProfiler } from '../src/core/simStepProfiler.js';
import { createSimulation } from '../src/core/sim.js';
import { getSimStepProfiler } from '../src/core/simStepProfiler.js';
import { economy } from '../src/systems/economy.js';

test('the main-lane registry feeds the same per-system profiler', () => {
  const profiler = getSimStepProfiler();
  profiler.reset();
  profiler.setEnabled(true);
  const sim = createSimulation({ seed: 123, systems: [economy] });
  try {
    sim.step(1 / 60);
    sim.step(1 / 60);
    const report = profiler.snapshot();
    assert.ok(report.ticksMeasured >= 1, 'the main lane measured a tick');
    const ids = new Set(report.systems.map((row) => row.id));
    assert.ok(ids.has('core.preStep'), 'core pre-step is ranked');
    assert.ok(ids.has('core.tickDrains'), 'the per-tick drain is ranked');
    assert.ok(ids.has('core.lifetimeSweep'), 'the lifetime sweep is ranked');
    assert.equal(report.systems.find((row) => row.id === 'core.tickDrains').nested, false);
  } finally {
    profiler.setEnabled(false);
    profiler.reset();
    sim.dispose();
  }
});

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

test('core step rows are ranked as top-level work, not nested sub-phases', () => {
  const profiler = createSimStepProfiler();
  profiler.setEnabled(true);
  profiler.beginTick();
  profiler.record('core.preStep', 1e6);
  profiler.record('core.publishInputCommand', 0.5e6);
  profiler.record('input', 0.5e6);
  profiler.record('physics.worldStep', 2e6);
  profiler.record('physics', 3e6);
  profiler.endTick();

  const report = profiler.snapshot();
  const rows = new Map(report.systems.map((row) => [row.id, row]));
  assert.equal(rows.get('core.preStep').nested, false, 'core.preStep is top-level');
  assert.equal(rows.get('core.publishInputCommand').nested, false, 'the input publish is top-level');
  assert.equal(rows.get('physics.worldStep').nested, true, 'physics.worldStep stays a sub-phase');
  // 1 + 0.5 + 0.5 + 3 = 5 ms of top-level work; the 2 ms physics sub-phase is already inside it.
  assert.equal(report.topLevelMeasuredMs, 5);
  assert.ok(Math.abs(rows.get('core.preStep').share - (1 / 5)) < 0.001);
});

test('the last-tick row set is reset between ticks instead of retaining the previous tick', () => {
  const profiler = createSimStepProfiler();
  profiler.setEnabled(true);
  profiler.beginTick();
  profiler.record('physics', 1e6);
  profiler.endTick();
  profiler.beginTick();
  profiler.record('economy', 2e6);
  profiler.endTick();
  const rows = profiler.lastTick().systems;
  assert.deepEqual(rows.map((row) => row.id), ['economy']);
});
