import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { comparisonKey } from '../scripts/lib/performanceClosureContracts.mjs';
import { buildClosureWindows, readPerformanceRouteFailureState } from '../scripts/lib/releaseSoakProbe.mjs';

const ROOT = new URL('../', import.meta.url);

function environment() {
  return {
    runtimeKind: 'browser',
    seed: 47,
    browser: { version: 'test' },
    gpu: { renderer: 'test' },
    viewport: { width: 1440, height: 900 },
    activity: { active: false },
    defaultSettings: { video: { bloom: true } },
  };
}

test('legacy attribution windows publish fail-closed closure window evidence', () => {
  const settings = { video: { bloom: true }, dynResScale: 1, timeScale: 1 };
  const doc = {
    windows: [{
      routeTag: 'flight_steady',
      scenarioId: 'flight_steady',
      diagnosticVariant: 'baseline',
      rawSamples: [
        { frameMs: 16.7, stepsThisFrame: 1, shedBacklog: false },
        { frameMs: 34, stepsThisFrame: 2, shedBacklog: true, shedSteps: 1 },
      ],
      settings: { start: settings, end: settings },
      cpu: { phases: {} },
      gpuTimers: { available: false, status: 'unavailable' },
      scene: { end: { visibleMeshes: 3 } },
      pipeline: { end: { authoredReady: true } },
      memory: { heap: {} },
      restoration: { restored: true },
      routeProof: { mode: 'flight', docked: false },
    }],
  };
  const env = environment();
  const windows = buildClosureWindows(doc, env, { pageErrors: [] }, true);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].evidenceKind, 'diagnostic');
  assert.equal(windows[0].stateInjected, false);
  assert.equal(windows[0].inputSource, 'keyboard-mouse');
  assert.equal(windows[0].summary.framesAbove32Ms, 1);
  assert.equal(windows[0].summary.multiStepSimulationFrames, 1);
  assert.equal(windows[0].summary.backlogSheddingFrames, 1);
  assert.equal(windows[0].restoration.restored, true);
  assert.equal(windows[0].budgets.results.find((entry) => entry.id === 'frame.framesAbove32.max').pass, false);
  assert.equal(windows[0].comparisonKey, comparisonKey({
    scenarioId: 'flight_steady',
    environment: env,
    settings,
  }));

  assert.equal(buildClosureWindows(doc, env, { pageErrors: [] }, false)[0].restoration.restored, false);
});

test('profile and closure probes share scene metrics and bounded measurement gates', async () => {
  const [profile, probe, command, hitch] = await Promise.all([
    readFile(new URL('../scripts/probe-performance-profile.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/lib/releaseSoakProbe.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/check-performance-attribution.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/check-hitch-budget.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(profile, /import\('\/scripts\/lib\/performanceSceneMetrics\.mjs'\)/);
  assert.match(profile, /collectPerformanceSceneStructure/);
  assert.match(profile, /authoredAssetStatus\(state\)/);
  assert.match(profile, /rafHitches: sampled\.raf\.hitches \|\| \[\]/);
  assert.match(profile,
    /name:\s*'raf\.frame\.p95\.target'[\s\S]{0,520}pass:\s*Number\.isFinite\(rafFrameP95\)\s*&&\s*rafFrameP95\s*<=\s*FRAME_TARGET_MS/,
    'the measured environment floor must never waive the literal 16.7ms acceptance target');
  assert.doesNotMatch(profile,
    /name:\s*'raf\.frame\.p95\.target'[\s\S]{0,520}pass:[^\n]*\|\|[^\n]*environmentFloor/,
    'environment-floor attribution must remain diagnostic rather than turning a target miss into a pass');
  assert.match(hitch, /UNCAPPED \? \['--disable-frame-rate-limit', '--disable-gpu-vsync'\] : \[\]/);
  assert.match(hitch, /sample\.programEvents\.length === 0/);
  assert.match(hitch, /sample\.frameMs\.unexpectedOverBudget === 0/);
  assert.match(hitch, /missing-callback-evidence/);
  assert.match(hitch, /authored-admission-active/);
  assert.match(hitch, /scheduler-only/);
  assert.match(hitch, /new GPU program events appeared after warm-up/);
  assert.doesNotMatch(profile, /const sceneBreakdown = \(\) => \{[\s\S]*new WeakMap/);
  assert.match(probe, /setRenderWorkEnabled\(false\)/);
  assert.match(probe, /setSystemTimingEnabled\(false\)/);
  assert.match(probe, /timers\.setEnabled\(false\)/);
  assert.match(probe, /performance-windows\.json/);
  assert.match(probe, /strictWorktreeFingerprint/);
  assert.match(command, /--full-matrix/);
  assert.match(command, /variant-scenarios/);
  assert.match(command, /flight-timeout-ms/);
  assert.match(command, /dock-timeout-ms/);
  assert.match(probe, /routeState: routeFailureState/);
  assert.match(probe, /nonAuthored\.length < 50/);
});

test('route-failure snapshot is unavailable after cleanup and preserves live evidence', async () => {
  assert.equal(await readPerformanceRouteFailureState(null), null);
  assert.equal(await readPerformanceRouteFailureState({ isClosed: () => true }), null);

  const expected = { pass: false, checks: { allShipsAuthored: false } };
  const page = {
    isClosed: () => false,
    evaluate: async () => expected,
  };
  assert.deepEqual(await readPerformanceRouteFailureState(page), expected);
});
