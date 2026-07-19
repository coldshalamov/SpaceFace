import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { comparisonKey } from '../scripts/lib/performanceClosureContracts.mjs';
import { buildClosureWindows } from '../scripts/lib/releaseSoakProbe.mjs';

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
  const [profile, probe, command] = await Promise.all([
    readFile(new URL('../scripts/probe-performance-profile.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/lib/releaseSoakProbe.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/check-performance-attribution.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(profile, /import\('\/scripts\/lib\/performanceSceneMetrics\.mjs'\)/);
  assert.match(profile, /collectPerformanceSceneStructure/);
  assert.doesNotMatch(profile, /const sceneBreakdown = \(\) => \{[\s\S]*new WeakMap/);
  assert.match(probe, /setRenderWorkEnabled\(false\)/);
  assert.match(probe, /setSystemTimingEnabled\(false\)/);
  assert.match(probe, /timers\.setEnabled\(false\)/);
  assert.match(probe, /performance-windows\.json/);
  assert.match(probe, /strictWorktreeFingerprint/);
  assert.match(command, /--full-matrix/);
  assert.match(command, /variant-scenarios/);
});
