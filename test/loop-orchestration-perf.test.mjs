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
const presentationRunnerSource = readFileSync(new URL('../src/core/presentationRunner.js', import.meta.url), 'utf8');
const partsLibrarySource = readFileSync(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
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

function attributedBacklog({
  callbackMs = 5,
  simMs = 1,
  presentationMs = 1,
  uiMs = 0,
  admissionMs = 0,
} = {}) {
  const perf = ensurePerfRuntime({});
  const budgetMs = LOOP_FIXED_DT * 1000;
  perf.beginFrame(LOOP_FIXED_DT, 1000, 1000, budgetMs);
  perf.recordLoop(1, false, 0);
  perf.recordSimFrame(simMs);
  perf.recordPresentationFrame(presentationMs);
  if (uiMs > 0) perf.recordPhase('ui', uiMs);
  perf.recordFrameCallback(callbackMs);
  if (admissionMs > 0) perf.recordAdmissionWork(admissionMs);

  perf.beginFrame(LOOP_FIXED_DT * 3, 1050, 1050, budgetMs);
  perf.recordLoop(3, false, 0);
  return perf.readFrameSample({});
}

test('scheduler backlog attribution separates simulation, presentation, UI, admission, and external gaps', () => {
  assert.equal(attributedBacklog({ callbackMs: 45, simMs: 45 }).backlogCause, 'simulation');
  assert.equal(attributedBacklog({ callbackMs: 45, presentationMs: 45 }).backlogCause, 'presentation');
  assert.equal(attributedBacklog({ callbackMs: 45, presentationMs: 45, uiMs: 45 }).backlogCause, 'ui');
  const admission = attributedBacklog({ admissionMs: 35 });
  assert.equal(admission.backlogCause, 'admission');
  assert.equal(admission.externalCallbackGapMs, 10,
    'only admission work measured between callbacks is removed from the external gap');

  const external = attributedBacklog();
  assert.equal(external.backlogCause, 'external-scheduling');
  assert.equal(external.callbackIntervalMs, 50);
  assert.equal(external.externalCallbackGapMs, 45);
});

test('scheduler attribution clears stale child phases and preserves in-callback admission ownership', () => {
  const perf = ensurePerfRuntime({});
  const budgetMs = LOOP_FIXED_DT * 1000;

  perf.beginFrame(LOOP_FIXED_DT, 1000, 1000, budgetMs);
  perf.recordLoop(1, false, 0);
  perf.recordSimFrame(1);
  perf.recordPresentationFrame(45);
  perf.recordPhase('ui', 45);
  perf.recordAdmissionWork(20);
  perf.recordFrameCallback(45);

  perf.beginFrame(LOOP_FIXED_DT, 1050, 1050, budgetMs);
  assert.equal(perf.readFrameSample({}).externalCallbackGapMs, 5,
    'admission inside the game callback must not be subtracted from the outside-callback gap');
  perf.recordLoop(1, false, 0);
  perf.recordSimFrame(1);
  perf.recordPresentationFrame(45);
  perf.recordFrameCallback(45);

  perf.beginFrame(LOOP_FIXED_DT * 3, 1100, 1100, budgetMs);
  perf.recordLoop(3, false, 0);
  const sample = perf.readFrameSample({});
  assert.equal(sample.uiMs, 0);
  assert.equal(sample.backlogCause, 'presentation',
    'a missing UI phase in the prior frame must not reuse an older UI sample');
});

test('runner and authored-admission owners publish bounded attribution without a second loop', () => {
  assert.match(presentationRunnerSource, /perf\.beginFrame\([\s\S]*callbackStart[\s\S]*simulationRunner\.fixedDt/);
  assert.match(presentationRunnerSource, /perf\.recordPresentationFrame/);
  assert.match(partsLibrarySource, /recordAdmissionSlice[\s\S]*recordAdmissionWork/);
  assert.doesNotMatch(loopSource, /requestAnimationFrame/,
    'the compatibility adapter must not retain a second presentation scheduler');
});
