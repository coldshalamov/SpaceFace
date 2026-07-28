import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  advanceFixedTimestep,
  LOOP_FIXED_DT,
} from '../src/core/loop.js';
import { ensurePerfRuntime } from '../src/core/perfRuntime.js';

const loopSource = readFileSync(new URL('../src/core/loop.js', import.meta.url), 'utf8');
const simulationRunnerSource = readFileSync(new URL('../src/core/simulationRunner.js', import.meta.url), 'utf8');
const registrySource = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');

test('detailed per-system clocks are opt-in and default gameplay does not fill timing rings', () => {
  const perf = ensurePerfRuntime({});
  assert.equal(perf.systemTimingEnabled, false);
  assert.equal(perf.isSystemTimingEnabled(), false);
  perf.recordSystem('idle-default', 4);
  assert.equal(perf.getReport().systems['idle-default'], undefined,
    'recordSystem is defense-in-depth gated while detailed attribution is disabled');

  assert.equal(perf.setSystemTimingEnabled(true), true);
  perf.recordSystem('measured', 2.5);
  assert.equal(perf.getReport().systems.measured.samples, 1);
  assert.equal(perf.setSystemTimingEnabled(false), false);
});

test('registry skips per-system perfNow calls unless detailed attribution is enabled', () => {
  assert.match(registrySource, /const measureSystems = perf\.isSystemTimingEnabled\(\)/);
  assert.match(registrySource, /if \(!measureSystems\) \{[\s\S]*?core\.preStep\(dt, state\)[\s\S]*?input\.update\(dt, state\)[\s\S]*?tickBoundary\.publishInputCommand\(state\.input, state\.tick\)[\s\S]*?for \(const s of POST_INPUT_UPDATE_ORDER\)[\s\S]*?core\.lifetimeSweep\(dt, state\)[\s\S]*?return;/,
    'default path preserves input-first order and publishes before downstream systems without clocks');
});

test('SimulationRunner reuses one fixed-step callback instead of allocating every frame', () => {
  assert.match(loopSource, /createSimulationRunner\(state, registry, deps\)/,
    'the compatibility loop must compose the extracted simulation owner');
  assert.match(simulationRunnerSource, /function stepSimulation\(dt\) \{[\s\S]*?registry\.step\(dt, inputTickBoundary\);[\s\S]*?publishCompletedTick\(/);
  assert.match(simulationRunnerSource, /advanceFixedTimestep\([\s\S]*?stepSimulation,[\s\S]*?advanceResult/);
  assert.doesNotMatch(simulationRunnerSource, /advanceFixedTimestep\([\s\S]{0,240}?\(dt\) => registry\.step\(dt\)/);
});

test('catch-up cap drops whole overdue ticks but preserves the fractional interpolation remainder', () => {
  let ticks = 0;
  const remainder = LOOP_FIXED_DT * 0.25;
  const result = advanceFixedTimestep(
    0,
    LOOP_FIXED_DT * 10 + remainder,
    1,
    () => { ticks++; },
  );
  assert.equal(ticks, 4);
  assert.equal(result.shedBacklog, true);
  assert.ok(Math.abs(result.accumulator - remainder) < 1e-9,
    `fractional phase should survive backlog shedding (${result.accumulator} vs ${remainder})`);
});
