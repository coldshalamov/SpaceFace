import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RUNTIME_WITNESS_PRODUCTION_ROUTES,
  productionRouteById,
  summarizeRuntimeWitnessProductionWindow,
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
