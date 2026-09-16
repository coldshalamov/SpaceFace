import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RUNTIME_WITNESS_PRODUCTION_ROUTES,
  productionRouteById,
  summarizeRuntimeWitnessProductionWindow,
  formatRuntimeWitnessProductionMatrix,
} from '../scripts/lib/runtimeWitnessProductionMatrix.mjs';

test('production matrix names all seven player-visible routes', () => {
  assert.deepEqual(RUNTIME_WITNESS_PRODUCTION_ROUTES.map((route) => route.id), [
    'cold-opening', 'warm-dense-combat', 'earned-speed-traversal', 'sustained-swarm',
    'dock-refit-undock', 'asteroid-works-roundtrip', 'busy-site-save-reload',
  ]);
  assert.equal(productionRouteById('missing'), null);
});

test('matrix preserves foreground distributions and does not sum CPU phase percentiles', () => {
  const result = summarizeRuntimeWitnessProductionWindow({
    route: 'cold-opening',
    samples: [
      { elapsedMs: 1, intervalMs: 10, frame: { simMs: 3, renderMs: 5, shedBacklogFrames: 0 } },
      { elapsedMs: 2, intervalMs: 20, frame: { simMs: 8, renderMs: 7, shedBacklogFrames: 1 } },
      { elapsedMs: 3, intervalMs: 40, frame: { simMs: 11, renderMs: 9, shedBacklogFrames: 0 } },
    ],
    gpuReport: { available: true, terminals: [{ elapsedMs: 4 }, { elapsedMs: 6 }] },
    manifest: { candidate: 'abc' },
  });
  assert.equal(result.status, 'measured');
  assert.equal(result.foregroundFrames.p95, 20);
  assert.equal(result.foregroundFrames.max, 40);
  assert.equal(result.foregroundFrames.exceedances.over33_3ms, 1);
  assert.equal(result.cpuPhases[0].name, 'simMs');
  assert.equal(result.cpuPhases[0].p95, 8);
  assert.equal(result.gpu.status, 'measured');
  assert.equal(result.gpu.p95, 4, 'real gpuTimers terminal elapsedMs values feed the distribution');
  assert.equal(result.shedSimulation.observedShedFrames, 1);
});

test('matrix reports unavailable GPU and input age as unknown rather than zero', () => {
  const result = summarizeRuntimeWitnessProductionWindow({
    route: 'sustained-swarm',
    samples: [{ intervalMs: 16, frame: { simMs: 2, shedBacklogFrames: 0 } }],
    gpuReport: { available: false, reason: 'EXT_disjoint_timer_query unavailable' },
  });
  assert.equal(result.gpu.status, 'unavailable');
  assert.match(result.gpu.reason, /disjoint/i);
  assert.equal(result.inputAge.status, 'unknown');
  assert.notEqual(result.inputAge.reason, '0');
});

test('missing intervals and phase samples do not become zero-duration measurements', () => {
  const result = summarizeRuntimeWitnessProductionWindow({
    route: 'cold-opening',
    samples: [{ intervalMs: null, frame: { simMs: null } },
      { intervalMs: 20, frame: { simMs: 7 } }],
  });
  assert.equal(result.foregroundFrames.samples, 1);
  assert.equal(result.foregroundFrames.p50, 20);
  assert.equal(result.cpuPhases[0].samples, 1);
  assert.equal(result.cpuPhases[0].p50, 7);
});

test('GPU frame totals group complete frame identities instead of mixing pass durations', () => {
  let nextQueryId = 1;
  const terminal = (renderFrameId, label, elapsedMs) => ({ queryId: nextQueryId++, renderFrameId, label, elapsedMs, state: 'completed' });
  const result = summarizeRuntimeWitnessProductionWindow({
    route: 'warm-dense-combat',
    samples: [{ intervalMs: 16, frame: {} }],
    gpuReport: {
      available: true, captureValid: true,
      terminals: [
        terminal(1, 'bloomScene', 4), terminal(1, 'bloomDownsample', 2), terminal(1, 'bloomComposite', 3),
        terminal(2, 'bloomScene', 10), terminal(2, 'bloomDownsample', 1), terminal(2, 'bloomComposite', 2),
        terminal(3, 'drawPreparedFrame', 20),
        terminal(4, 'bloomDownsample', 5), terminal(4, 'bloomComposite', 6),
      ],
    },
  });
  assert.equal(result.gpu.frameTotals.samples, 3);
  assert.equal(result.gpu.frameTotals.p95, 13);
  assert.equal(result.gpu.frameTotals.max, 20);
  assert.equal(result.gpu.frameTotals.incompleteFrames, 1);
  assert.equal(result.gpu.passes.bloomScene.samples, 2);
  assert.equal(result.gpu.passes.bloomScene.max, 10);
  const text = formatRuntimeWitnessProductionMatrix(result);
  assert.match(text, /GPU timed work per render frame/);
  assert.match(text, /GPU query spans/);
});

test('GPU frame totals exclude missing middle queries and non-completed passes', () => {
  const terminal = (queryId, renderFrameId, label, elapsedMs, state = 'completed') => ({ queryId, renderFrameId, label, elapsedMs, state });
  const result = summarizeRuntimeWitnessProductionWindow({
    route: 'warm-dense-combat',
    gpuReport: { available: true, captureValid: true, terminals: [
      terminal(1, 1, 'bloomScene', 4), terminal(3, 1, 'bloomComposite', 2),
      terminal(4, 2, 'bloomScene', 5), terminal(5, 2, 'bloomDownsample', null, 'backpressure'),
      terminal(6, 2, 'bloomComposite', 2), terminal(7, 3, 'drawPreparedFrame', 12),
    ] },
  });
  assert.equal(result.gpu.frameTotals.samples, 1);
  assert.equal(result.gpu.frameTotals.p95, 12);
  assert.equal(result.gpu.frameTotals.incompleteFrames, 2);
});

test('invalid and disjoint GPU captures remain fail-closed despite completed samples', () => {
  for (const validity of [{ captureValid: false }, { captureValid: true, lastDisjoint: true }]) {
    const result = summarizeRuntimeWitnessProductionWindow({
      route: 'warm-dense-combat',
      gpuReport: { available: true, ...validity, terminals: [
        { queryId: 1, renderFrameId: 1, label: 'drawPreparedFrame', elapsedMs: 4, state: 'completed' },
      ] },
    });
    assert.equal(result.gpu.status, 'invalid');
    assert.equal(result.gpu.samples, 0);
  }
});

test('input-to-present uses only distinct commands observed inside the recorder window', () => {
  const result = summarizeRuntimeWitnessProductionWindow({
    route: 'warm-dense-combat',
    samples: [
      { intervalMs: 16, inputToPresentMs: 12, frame: {} },
      { intervalMs: 16, inputToPresentMs: null, frame: {} },
    ],
    inputToPhotonReport: { samples: 100, p95: 1000, max: 2000 },
  });
  assert.equal(result.inputToPhoton.status, 'measured');
  assert.equal(result.inputToPhoton.samples, 1);
  assert.equal(result.inputToPhoton.p95, 12);
  assert.match(result.inputToPhoton.source, /input-to-present/);
  assert.match(formatRuntimeWitnessProductionMatrix(result), /not physical photon latency/);
  const noInput = summarizeRuntimeWitnessProductionWindow({
    route: 'warm-dense-combat',
    samples: [{ intervalMs: 16, inputToPresentMs: null, frame: {} }],
    inputToPhotonReport: { samples: 100, p95: 1000 },
  });
  assert.equal(noInput.inputToPhoton.status, 'unavailable');
  assert.equal(noInput.inputToPhoton.samples, 0);
});

test('shed simulation counts cumulative counter increments, including load resets', () => {
  const result = summarizeRuntimeWitnessProductionWindow({
    route: 'busy-site-save-reload',
    samples: [[10, 40], [11, 42], [11, 42], [0, 0], [2, 3]].map(([frames, steps]) => ({
      intervalMs: 20, frame: { shedBacklogFrames: frames, shedStepsTotal: steps },
    })),
  });
  assert.equal(result.shedSimulation.observedShedFrames, 3);
  assert.equal(result.shedSimulation.observedShedSteps, 5);
  assert.ok(Math.abs(result.shedSimulation.shedTimeMs - 1000 / 12) < 1e-9);
});
