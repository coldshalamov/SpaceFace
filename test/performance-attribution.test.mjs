import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { ensurePerfRuntime } from '../src/core/perfRuntime.js';
import { createGpuTimers, detectTimerExtension } from '../src/render/gpuTimers.js';
import {
  ATTRIBUTION_DIAGNOSTIC_VARIANTS,
  ATTRIBUTION_ROUTE_TAGS,
  PERFORMANCE_ATTRIBUTION_SCHEMA,
  validatePerformanceAttribution,
} from '../scripts/lib/releaseSoakContracts.mjs';
import {
  applyDiagnosticVariantToState,
  restoreDiagnosticVariantToState,
  snapshotDiagnosticSettings,
} from '../scripts/lib/releaseSoakProbe.mjs';

const ROOT = new URL('../', import.meta.url);

function validWindow(routeTag = 'flight_steady') {
  const docked = routeTag === 'docked_market_ui';
  const vfxSubsystems = routeTag === 'mining_tether_active' ? { miningBeam: 1, tetherCable: 0 } : {};
  return {
    routeTag,
    frameMs: { sampleCount: 180, p50: 16.7, p95: 16.7, p99: 16.7, max: 16.7, hitchesOver32Ms: 0 },
    routeProof: { mode: 'flight', docked, uiOnlyPath: docked, vfxSubsystems },
    settings: { start: { bloom: true }, end: { bloom: true } },
    gpuTimers: { available: false, status: 'unavailable', reason: 'test' },
  };
}

test('attribution schema accepts the complete route matrix', () => {
  const document = {
    schema: PERFORMANCE_ATTRIBUTION_SCHEMA,
    kind: 'diagnostic-measurement',
    qualityPreserving: true,
    windows: ATTRIBUTION_ROUTE_TAGS.map(validWindow),
    variants: ATTRIBUTION_DIAGNOSTIC_VARIANTS.map((id) => ({ id, diagnostic: id !== 'baseline', restored: true })),
  };
  assert.deepEqual(validatePerformanceAttribution(document), { pass: true, failures: [] });
  assert.equal(validatePerformanceAttribution({ ...document, qualityPreserving: false }).pass, false);
});

test('render-work CPU attribution is default-off and explicitly gated', () => {
  const state = {};
  const perf = ensurePerfRuntime(state);
  assert.equal(perf.renderWorkEnabled, false);
  perf.recordRenderWork('candidateTimer', 5);
  assert.equal(perf.getReport().renderWork?.candidateTimer, undefined);
  perf.setRenderWorkEnabled(true);
  perf.recordRenderWork('candidateTimer', 5);
  assert.equal(perf.getReport().renderWork.candidateTimer.samples, 1);
  perf.setRenderWorkEnabled(false);
});

test('diagnostic variants round-trip timeScale and bloom exactly', () => {
  let entityIsolationActive = false;
  const state = {
    timeScale: 0.75,
    settings: { video: { bloom: true } },
    render: {
      spaceBg: { group: { visible: true } },
      perfEntityIsolation: {
        hideNonPlayer() { entityIsolationActive = true; return { active: true, hidden: 17 }; },
        restore() { entityIsolationActive = false; return { restored: true, active: false, restoredCount: 17 }; },
        inspect() { return { active: entityIsolationActive, hidden: entityIsolationActive ? 17 : 0 }; },
      },
    },
  };
  const snapshot = snapshotDiagnosticSettings(state);
  applyDiagnosticVariantToState(state, snapshot, 'sim_paused');
  assert.equal(state.timeScale, 0);
  assert.equal(restoreDiagnosticVariantToState(state, snapshot).restored, true);
  applyDiagnosticVariantToState(state, snapshot, 'bloom_off');
  assert.equal(state.settings.video.bloom, false);
  assert.equal(restoreDiagnosticVariantToState(state, snapshot).restored, true);
  assert.equal(state.timeScale, 0.75);
  assert.equal(state.settings.video.bloom, true);
  applyDiagnosticVariantToState(state, snapshot, 'background_hidden');
  assert.equal(state.render.spaceBg.group.visible, false);
  assert.equal(restoreDiagnosticVariantToState(state, snapshot).restored, true);
  assert.equal(state.render.spaceBg.group.visible, true);
  const isolated = applyDiagnosticVariantToState(state, snapshot, 'non_player_entities_hidden');
  assert.equal(isolated.hidden, 17);
  assert.equal(entityIsolationActive, true);
  assert.equal(restoreDiagnosticVariantToState(state, snapshot).restored, true);
  assert.equal(entityIsolationActive, false);
});

test('GPU timers are unavailable without an extension and reject nested begin', () => {
  const noExtensionGl = { getExtension: () => null };
  assert.equal(detectTimerExtension(noExtensionGl).available, false);
  assert.equal(createGpuTimers(noExtensionGl).getCapability().status, 'unavailable');

  let disjoint = false;
  let active = false;
  const results = new Map();
  const ext = {
    TIME_ELAPSED_EXT: 1,
    QUERY_RESULT_EXT: 2,
    QUERY_RESULT_AVAILABLE_EXT: 3,
    GPU_DISJOINT_EXT: 4,
    createQueryEXT: () => ({}),
    deleteQueryEXT: () => {},
    beginQueryEXT: (_target, query) => { active = true; results.set(query, 1_000_000); },
    endQueryEXT: () => { active = false; },
    getQueryObjectEXT: (query, pname) => pname === 3 ? !active : results.get(query),
  };
  const gl = {
    getExtension: (name) => name === 'EXT_disjoint_timer_query' ? ext : null,
    getParameter: () => disjoint,
  };
  const timers = createGpuTimers(gl);
  assert.equal(timers.setEnabled(true), true);
  assert.equal(timers.begin('bloomScene'), true);
  assert.equal(timers.begin('bloomComposite'), false, 'nested begin must preserve the active outer query');
  assert.equal(timers.end(), true);
  disjoint = true;
  timers.poll();
  assert.equal(timers.getCapability().status, 'disjoint');
  timers.abandon();
});

test('controller command is wired and restoration is failure-atomic', async () => {
  const [pkg, commandSource, probeSource, rendererSource, bloomSource] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../scripts/check-performance-attribution.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/lib/releaseSoakProbe.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/bloom.js', import.meta.url), 'utf8'),
  ]);
  assert.equal(pkg.scripts['check:perf:attribution'], 'node scripts/check-performance-attribution.mjs');
  for (const route of ATTRIBUTION_ROUTE_TAGS) assert.match(commandSource + probeSource, new RegExp(route));
  for (const variant of ATTRIBUTION_DIAGNOSTIC_VARIANTS) assert.match(commandSource + probeSource, new RegExp(variant));
  assert.match(probeSource, /finally\s*\{[\s\S]*restoreDiagnosticVariant[\s\S]*disableMeasurementGates/);
  assert.match(rendererSource, /perf\.renderWorkEnabled/);
  assert.match(rendererSource, /perfEntityIsolation/);
  assert.match(bloomSource, /perf\.renderWorkEnabled/);
});
