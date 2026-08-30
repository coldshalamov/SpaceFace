import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  VISUAL_PROBE_PHASES,
  awaitVisualProbePhase,
  createVisualProbePhaseTracker,
} from '../scripts/lib/visualProbePhases.mjs';

const flightProbeSource = await readFile(new URL('../scripts/probe-flight-visual.mjs', import.meta.url), 'utf8');
const stabilityProbeSource = await readFile(new URL('../scripts/probe-ship-visual-stability.mjs', import.meta.url), 'utf8');
const residencyTraversalSource = await readFile(new URL('./asset-residency-refcounts.test.mjs', import.meta.url), 'utf8');

assert.deepEqual(VISUAL_PROBE_PHASES, [
  'server-ready',
  'document-loaded',
  'SF-boot-ready',
  'authored-library-ready',
  'flight-ready',
  'first-playable-frame',
  'scene-isolated',
  'sample-started',
  'sample-complete',
  'cleanup-complete',
]);

test('phase tracker records an explicit phase immediately before an awaited operation', async () => {
  let clock = 100;
  const tracker = createVisualProbePhaseTracker({ now: () => clock });
  let observed = null;
  const value = await awaitVisualProbePhase(
    tracker,
    'document-loaded',
    async () => {
      observed = tracker.snapshot();
      clock = 135;
      return 'loaded';
    },
    { waitUntil: 'domcontentloaded', timeoutMs: 90_000 },
  );

  assert.equal(value, 'loaded');
  assert.equal(observed.current, 'document-loaded');
  assert.deepEqual(observed.order, VISUAL_PROBE_PHASES);
  assert.deepEqual(observed.completed, []);
  assert.deepEqual(tracker.snapshot().completed, ['document-loaded']);
  assert.deepEqual(tracker.snapshot().awaits, [{
    operation: 'phase:document-loaded',
    phase: 'document-loaded',
    atMs: 0,
    detail: { waitUntil: 'domcontentloaded', timeoutMs: 90_000 },
  }]);
  assert.deepEqual(tracker.snapshot().entries, [{
    phase: 'document-loaded',
    atMs: 0,
    status: 'complete',
    completedAtMs: 35,
    detail: { waitUntil: 'domcontentloaded', timeoutMs: 90_000 },
  }]);
});

test('phase error identifies the awaited phase and preserves the report', async () => {
  const tracker = createVisualProbePhaseTracker();
  await assert.rejects(
    awaitVisualProbePhase(tracker, 'first-playable-frame', async () => {
      throw new Error('navigation timeout');
    }),
    (error) => {
      assert.match(error.message, /^first-playable-frame: navigation timeout$/);
      assert.equal(error.probePhase, 'first-playable-frame');
      assert.equal(error.phaseReport.current, 'first-playable-frame');
      assert.deepEqual(error.phaseReport.completed, []);
      assert.deepEqual(error.phaseReport.awaits.map((entry) => entry.operation), ['phase:first-playable-frame']);
      assert.equal(error.awaitedOperation, 'phase:first-playable-frame');
      assert.equal(error.cause.message, 'navigation timeout');
      return true;
    },
  );
});

test('unknown phases fail closed instead of producing an unlabelled report', () => {
  const tracker = createVisualProbePhaseTracker();
  assert.throws(() => tracker.mark('renderer-blank'), /unknown visual probe phase/);
});

test('flight visual probe reports lifecycle phases, uses a 90s navigation budget, and serializes viewports', () => {
  for (const phase of VISUAL_PROBE_PHASES) {
    assert.match(flightProbeSource, new RegExp(`['"]${phase}['"]`), `flight probe names ${phase}`);
  }
  assert.match(flightProbeSource, /const NAVIGATION_TIMEOUT_MS = 90_000/);
  assert.match(flightProbeSource, /waitUntil: 'domcontentloaded',[\s\S]{0,120}timeout: NAVIGATION_TIMEOUT_MS/);
  assert.match(flightProbeSource, /waitForFirstPlayableFrame/);
  assert.match(flightProbeSource, /canvasNonBlank: null/,
    'pre-render failures must not masquerade as a blank-frame sample');
  assert.match(flightProbeSource, /canvasStatus: 'not-sampled'/);
  assert.doesNotMatch(flightProbeSource, /Promise\.all\(viewports\.map/,
    'heavy desktop/mobile visual probes must not contend in parallel');
  assert.match(flightProbeSource, /phaseReport/);
});

test('visual stability and real residency probes keep navigation and readiness failures phase-labelled', () => {
  assert.match(stabilityProbeSource, /const NAVIGATION_TIMEOUT_MS = 90_000/);
  assert.match(stabilityProbeSource, /waitUntil: 'domcontentloaded',[\s\S]{0,120}timeout: NAVIGATION_TIMEOUT_MS/);
  for (const phase of ['document-loaded', 'SF-boot-ready', 'authored-library-ready', 'flight-ready', 'first-playable-frame', 'sample-started', 'sample-complete', 'cleanup-complete']) {
    assert.match(stabilityProbeSource, new RegExp(`['"]${phase}['"]`), `stability probe names ${phase}`);
  }
  assert.match(residencyTraversalSource, /RESIDENCY_IN_PAGE_AWAIT_TIMEOUT_MS[\s\S]{0,180}30_000/);
  assert.match(residencyTraversalSource, /timeout: RESIDENCY_NAVIGATION_TIMEOUT_MS/);
  assert.match(residencyTraversalSource, /traversalPhases/);
  assert.match(residencyTraversalSource, /preview-load:\$\{index\}:\$\{file\.url\}/);
  assert.match(residencyTraversalSource, /probePhase=/);
});
