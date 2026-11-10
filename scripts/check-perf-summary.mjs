#!/usr/bin/env node
// Unit check: perf-summary Markdown formatter (no browser required).

import assert from 'node:assert/strict';
import {
  formatPerformanceProfileMarkdown,
  performanceProfileMarkdownPath,
} from './lib/perf-summary.mjs';

const FAKE_REPORT = {
  schema: 'spaceface.performanceProfile.v1',
  generatedAt: '2026-07-06T12:00:00.000Z',
  runner: {
    width: 1830,
    height: 973,
    seed: 47,
    warmupMs: 2500,
    durationMs: 7000,
    strict: true,
    diagnosticVariants: true,
  },
  qualityPreserving: {
    settingsOverridesApplied: false,
    forbiddenShortcuts: ['renderScale', 'bloom'],
  },
  summary: {
    pass: false,
    failedBudgets: [
      { scenario: 'crowded-flight', budget: 'raf.frame.hitchesOver32.max', value: 95, limit: 0 },
      { scenario: 'crowded-flight', budget: 'raf.frame.p95.target', value: 33.4, limit: 16.7 },
    ],
    scenarios: [
      {
        name: 'crowded-flight',
        pass: false,
        rafFrameP95: 33.4,
        rafHitchesOver32: 95,
        rafHitchesOverBudget: 95,
        diagnosticFrameP95: 33.4,
        renderCallsPeak: 253,
        trianglesPeak: 17644,
        callback: { callback: 10.7, untracked: 0.2 },
        autosave: {
          requested: true,
          completedCount: 1,
          requestCallMs: 2.4,
          durationMs: { max: 2.4, p95: 2.4 },
          perf: { write: { p95: 1.1 }, bytes: { p95: 18000 } },
        },
        entityScaleSweeps: {
          rows: [
            { variant: 'visible-near', count: 1000, p95: 1.6, perEntityUsP95: 1.6, transformed: 1042, fullSynced: 1042, culled: 0, totalMeshes: 1042 },
            { variant: 'far-culled', count: 1000, p95: 0.4, perEntityUsP95: 0.4, transformed: 1042, fullSynced: 42, culled: 1000, totalMeshes: 1042 },
          ],
        },
        broadphase: {
          rebuildsPerSecond: 0,
          dynamicRebuildsPerSecond: 0,
          queriesPerSecond: 0,
          candidatesPerSecond: 0,
        },
        sceneStructure: {
          visibleMeshes: 208,
          shipDynamicMeshes: 85,
          materialKeys: 49,
          shipCanopySurfaces: 10,
          shipFanSurfaces: 4,
        },
        bottleneck: {
          primary: 'render-submit-present',
          labels: ['render-submit-present'],
          confidence: 'high',
          ruledOut: ['simulation-frame-budget'],
          nextContracts: ['Reduce GPU submit pressure without dropping authored visuals.'],
        },
      },
    ],
  },
  scenarios: [
    {
      name: 'crowded-flight',
      pass: false,
      sampleWindow: { durationMs: 7000 },
      rafFrameMs: { p95: 33.4, over32: 95, overHitchBudget: 95 },
      diagnosticFrameMs: { p95: 33.4 },
      render: { calls: { max: 253 }, triangles: { max: 17644 } },
      phases: { sim: 2.1, simFrame: 3.9, render: 7, vfx: 0.4, feel: 0.1, ui: 1.1 },
      callback: { callback: 10.7, untracked: 0.2 },
      post: {
        activePath: 'bloom',
        renderGraph: false,
        bloom: {
          width: 1636,
          height: 777,
          levels: 2,
          fullFramePasses: 2,
          bloomPasses: 3,
          targets: 5,
          grainFps: 12,
          grainSource: 'quantized-interleaved-gradient',
        },
      },
      perf: {
        topSystems: [
          { name: 'tacticalAI', p95: 0.6, avg: 0.18, max: 2.1 },
          { name: 'physics', p95: 0.5, avg: 0.3, max: 1.2 },
        ],
        renderWork: {
          entityViewSync: { p95: 0.4, avg: 0.2, max: 0.8 },
        },
        counters: { spatialHash: { rebuilds: 0, dynamicRebuilds: 0, queries: 0, candidates: 0 } },
      },
      autosave: {
        requested: true,
        completedCount: 1,
        requestCallMs: 2.4,
        durationMs: { max: 2.4, p95: 2.4 },
        perf: { write: { p95: 1.1 }, bytes: { p95: 18000 } },
      },
      entityScaleSweeps: {
        rows: [
          {
            variant: 'visible-near',
            count: 1000,
            durationMs: { p95: 1.6 },
            perEntityUsP95: 1.6,
            sync: { transformed: 1042, fullSynced: 1042, culled: 0, totalMeshes: 1042 },
          },
          {
            variant: 'far-culled',
            count: 1000,
            durationMs: { p95: 0.4 },
            perEntityUsP95: 0.4,
            sync: { transformed: 1042, fullSynced: 42, culled: 1000, totalMeshes: 1042 },
          },
        ],
      },
      budgets: [
        { name: 'ui.hiddenBackdropActive.max', value: 0, pass: true, severity: 'required' },
        { name: 'ui.inactiveDockFadeDisplayed.max', value: 0, pass: true, severity: 'required' },
      ],
      diagnosticVariants: [
        {
          name: 'webgl-submit-noop-diagnostic',
          note: 'Diagnostic only: skips WebGL render submissions; not a visual-quality fix.',
          rafFrameMs: { p95: 16.8, samples: 80 },
        },
        {
          name: 'bloom-off-straight-render',
          note: 'Diagnostic only: disables bloom; not a quality-preserving fix.',
          rafFrameMs: { p95: 33.4, samples: 80 },
        },
        {
          name: 'hud-hidden-compositor-isolation',
          note: 'Diagnostic only: hides HUD shell; not a gameplay fix.',
          rafFrameMs: { p95: 33.2, samples: 80 },
        },
      ],
      bottleneck: {
        primary: 'render-submit-present',
        labels: ['render-submit-present'],
        confidence: 'high',
        ruledOut: ['simulation-frame-budget'],
        nextContracts: ['Reduce GPU submit pressure without dropping authored visuals.'],
      },
    },
  ],
};

assert.equal(
  performanceProfileMarkdownPath('.devshots/perf/performance-profile.json'),
  '.devshots/perf/performance-profile.md',
);

const md = formatPerformanceProfileMarkdown(FAKE_REPORT);

const required = [
  '**Result: FAIL**',
  'Failed budgets',
  'raf.frame.hitchesOver32.max',
  '### Bottleneck (attack this next)',
  '**Primary:** `render-submit-present`',
  'GPU/WebGL submit',
  'rAF p95 (ms)',
  'Phase p95',
  'Frame callback',
  'Autosave probe',
  'draw calls',
  'material keys',
  'Post-processing',
  'UI compositor shell flags',
  'Spatial hash rates',
  'Render work p95',
  'Entity view-sync scale sweeps',
  'Top systems by p95',
  'Diagnostic variant deltas',
  'webgl-submit-noop-diagnostic',
  'diagnostic-only variant',
  'How to read variants',
  'player-facing fix',
];

for (const snippet of required) {
  assert.ok(md.includes(snippet), `missing snippet: ${snippet}`);
}

const noopIdx = md.indexOf('webgl-submit-noop-diagnostic');
const bloomIdx = md.indexOf('bloom-off-straight-render');
assert.ok(noopIdx >= 0 && bloomIdx >= 0, 'variant rows missing');
assert.ok(noopIdx < bloomIdx, 'variants should be sorted by largest improvement (noop before bloom-off)');

const deltaLine = md.split('\n').find((line) => line.includes('webgl-submit-noop-diagnostic'));
assert.ok(deltaLine && deltaLine.includes('+16.6'), `expected +16.6 ms delta, got: ${deltaLine}`);

// The fixture above supplies a populated `perf.topSystems`, which is right for exercising the
// formatter but means this check passed for as long as every REAL artifact carried `topSystems: []`
// — the profiler was not enabling the opt-in CPU rings, so it reported "the sim phase exceeded its
// budget" across ~130 systems with no way to name one, and the summary omitted the section silently.
// Cover the empty branch too, so a report with no attribution has to say so.
const mdNoAttribution = formatPerformanceProfileMarkdown({
  ...FAKE_REPORT,
  scenarios: (FAKE_REPORT.scenarios || []).map((scenario) => ({
    ...scenario,
    perf: { ...(scenario.perf || {}), topSystems: [] },
  })),
  perf: { ...(FAKE_REPORT.perf || {}), topSystems: [] },
});
assert.ok(mdNoAttribution.includes('Top systems by p95'),
  'the attribution section must still be rendered when there is no attribution');
assert.ok(/No attribution in this artifact/i.test(mdNoAttribution),
  'an artifact with no per-system timing must say so explicitly instead of quietly dropping the table');
assert.ok(/setSystemTimingEnabled/.test(mdNoAttribution),
  'the notice should name the opt-in that was missed so the reader knows how to get attribution');

console.log('ok    performanceProfileMarkdownPath');
console.log('ok    formatPerformanceProfileMarkdown sections');
console.log('ok    diagnostic variant delta ordering');
console.log('ok    missing per-system attribution is reported, not hidden');
console.log('PASS  check:perf-summary');
