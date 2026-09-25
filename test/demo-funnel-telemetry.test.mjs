// ZERO_TO_HERO §7.5 — the local demo funnel. Telemetry records the ordered demo path
// (boot → crucibleEntered → round3Reached → resultsShown → adventureEntered → endCardShown)
// from real bus events, first reach only, in demo builds and nowhere else.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTelemetry } from '../src/systems/telemetry.js';
import { DEMO_FUNNEL_STEPS } from '../src/observability/sessionReport.js';

function rig(t, demo) {
  const state = createGameState(4242);
  const bus = createBus();
  const telemetry = createTelemetry(bus, state, { demo });
  t.after(() => telemetry.dispose());
  return { state, bus, telemetry };
}

function walkDemoPath(bus) {
  bus.emit('run:started', { schemaVersion: 1, kind: 'survival', ruleset: 'swarm', seed: 4242, phase: 'loadout' });
  bus.emit('run:wavePlanned', { wave: 1, plan: { arenaPhase: 'idle', schedule: [] }, tick: 10 });
  bus.emit('run:wavePlanned', { wave: 3, plan: { arenaPhase: 'shutter_slow', schedule: [] }, tick: 30 });
  bus.emit('run:resultsReady', { outcome: 'defeat', wave: 3, seed: 4242 });
  bus.emit('game:new', { name: null, difficulty: 'standard' });
  bus.emit('ui:pushScreen', { id: 'demoEnd' });
}

test('demo on: the six ordered events mark every step with non-decreasing offsets', (t) => {
  const { bus, telemetry } = rig(t, true);
  walkDemoPath(bus);

  const steps = telemetry.getDemoFunnel();
  assert.deepEqual(steps.map((s) => s.step), DEMO_FUNNEL_STEPS);
  for (const s of steps) assert.equal(s.reached, true, `${s.step} should be reached`);
  const offsets = steps.map((s) => s.atMs);
  for (let i = 1; i < offsets.length; i++) {
    assert.ok(offsets[i] >= offsets[i - 1], `offset ${steps[i].step} (${offsets[i]}) before ${steps[i - 1].step} (${offsets[i - 1]})`);
  }

  const report = telemetry.getSessionReport();
  assert.ok(report.data.demoFunnel, 'JSON report carries the demo funnel block');
  assert.deepEqual(report.data.demoFunnel.steps.map((s) => s.step), DEMO_FUNNEL_STEPS);
  assert.equal(report.data.demoFunnel.reachedCount, DEMO_FUNNEL_STEPS.length);
  assert.equal(report.data.demoFunnel.complete, true);
  assert.match(report.markdown, /## Demo Funnel/);
  assert.match(report.markdown, /Take it to the belt/);
});

test('demo on: repeating an event does not move the recorded offset', (t) => {
  const { bus, telemetry } = rig(t, true);
  bus.emit('run:started', { kind: 'survival', seed: 4242, phase: 'loadout' });
  const first = telemetry.getDemoFunnel().find((s) => s.step === 'crucibleEntered');
  bus.emit('run:started', { kind: 'survival', seed: 4242, phase: 'loadout' });
  bus.emit('run:wavePlanned', { wave: 3, plan: {}, tick: 31 });
  const second = telemetry.getDemoFunnel().find((s) => s.step === 'crucibleEntered');
  assert.equal(second.atMs, first.atMs);
});

test('demo on: out-of-order events record each step at its own reach', (t) => {
  const { bus, telemetry } = rig(t, true);
  // Results before round 3 — a defeat on wave 1 still produces a results plate.
  bus.emit('run:started', { kind: 'survival', seed: 4242, phase: 'loadout' });
  bus.emit('run:resultsReady', { outcome: 'defeat', wave: 1, seed: 4242 });
  bus.emit('run:wavePlanned', { wave: 3, plan: {}, tick: 90 });
  const steps = telemetry.getDemoFunnel();
  for (const key of ['resultsShown', 'round3Reached', 'crucibleEntered']) {
    assert.equal(steps.find((s) => s.step === key).reached, true, `${key} should record on its own reach`);
  }
});

test('demo on: a voluntary abort produces no resultsShown step', (t) => {
  const { bus, telemetry } = rig(t, true);
  bus.emit('run:started', { kind: 'survival', seed: 4242, phase: 'loadout' });
  bus.emit('run:resultsReady', { outcome: 'aborted', wave: 2, seed: 4242 });
  assert.equal(telemetry.getDemoFunnel().find((s) => s.step === 'resultsShown').reached, false);
  // ...but a failed wave plan still plates the result, exactly like uiRoot.
  bus.emit('run:resultsReady', { outcome: 'aborted', stopReason: 'wave_plan_failed', wave: 2, seed: 4242 });
  assert.equal(telemetry.getDemoFunnel().find((s) => s.step === 'resultsShown').reached, true);
});

test('demo off: the same events record nothing and the report has no demo block', (t) => {
  const { bus, telemetry } = rig(t, false);
  walkDemoPath(bus);
  const steps = telemetry.getDemoFunnel();
  assert.deepEqual(steps.map((s) => s.step), DEMO_FUNNEL_STEPS);
  for (const s of steps) assert.equal(s.reached, false, `${s.step} must stay unreached`);
  const report = telemetry.getSessionReport();
  assert.equal(report.data.demoFunnel, null);
  assert.doesNotMatch(report.markdown, /## Demo Funnel/);
});
