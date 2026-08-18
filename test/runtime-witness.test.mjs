import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyRuntimeWitness,
  collectRuntimeWitnessSample,
  createRuntimeWitness,
  formatRuntimeWitnessReport,
} from '../src/core/runtimeWitness.js';

function series(overrides = {}, count = 8) {
  return Array.from({ length: count }, (_, index) => ({
    simTime: index,
    executedFrames: index * 60,
    renderUpdates: index * 60,
    rendererFrame: index * 60,
    rendererFrameObserved: true,
    hasPos: true,
    posX: index * 4,
    posZ: 0,
    speed: 40,
    clockScale: 1,
    mode: 'flight',
    suspended: false,
    documentHidden: false,
    contextLost: false,
    hitch: false,
    frameErrorCount: 0,
    lastFrameError: null,
    topPhase: 'render',
    topPhaseP95: 8,
    ...overrides,
  }));
}

test('a moving sim clock with a stuck GPU frame is draw-dead, not healthy', () => {
  const verdict = classifyRuntimeWitness(series({ rendererFrame: 12 }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.kind, 'draw-dead');
});

test('unchanged canvas hashes are draw-dead even when sim and rAF counters move', () => {
  const verdict = classifyRuntimeWitness(series(), {
    canvasHashes: ['aaaa', 'aaaa', 'aaaa'],
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.kind, 'draw-dead');
});

test('sim, rAF, and GPU frames advancing is presenting', () => {
  const verdict = classifyRuntimeWitness(series());
  assert.equal(verdict.ok, true);
  assert.equal(verdict.kind, 'presenting');
  assert.match(verdict.headline, /render/);
});

test('stopped rAF and stopped sim is loop-dead', () => {
  const verdict = classifyRuntimeWitness(series({
    simTime: 10,
    executedFrames: 10,
    rendererFrame: 10,
  }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.kind, 'loop-dead');
});

test('repeated frame errors are draw-throwing', () => {
  const samples = series().map((row, index) => ({
    ...row,
    frameErrorCount: index + 3,
    lastFrameError: 'contact-shadow unsolicited upload',
  }));
  const verdict = classifyRuntimeWitness(samples);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.kind, 'draw-throwing');
});

test('GPU context lost wins over moving counters', () => {
  const verdict = classifyRuntimeWitness(series({ contextLost: true }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.kind, 'gpu-lost');
});

test('hitching names the top phase instead of declaring the game healthy', () => {
  const verdict = classifyRuntimeWitness(series({ hitch: true, topPhase: 'admission', topPhaseP95: 40 }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.kind, 'hitching');
  assert.match(verdict.next, /admission/);
});

test('missing GPU observation cannot false-green a Node-only sample', () => {
  const verdict = classifyRuntimeWitness(series({ rendererFrameObserved: false, rendererFrame: 0 }));
  assert.equal(verdict.ok, null);
  assert.equal(verdict.kind, 'inconclusive');
});

test('collect reads player pose and renderer frame without throwing', () => {
  const state = {
    mode: 'flight',
    simTime: 12,
    tick: 720,
    clockScale: 1,
    playerId: 1,
    entities: new Map([[1, { pos: { x: 3, z: 4 }, vel: { x: 10, z: 0 } }]]),
    render: {
      renderer: { info: { render: { frame: 44, calls: 120 } } },
    },
  };
  const sample = collectRuntimeWitnessSample(state, {
    diagnostics: { executedFrames: 90, renderUpdates: 90, lifecycleState: 'foreground-visible' },
    lifecycleState: 'foreground-visible',
  });
  assert.equal(sample.hasPos, true);
  assert.equal(sample.speed, 10);
  assert.equal(sample.rendererFrame, 44);
  assert.equal(sample.rendererFrameObserved, true);
  assert.equal(sample.drawCalls, 120);
});

test('witness ring throttles to one sample per period', () => {
  const witness = createRuntimeWitness({ nowMs: () => 1000 });
  const state = { simTime: 1, mode: 'flight', timeScale: 1 };
  const extras = { diagnostics: { executedFrames: 1 }, wallMs: 1000 };
  assert.ok(witness.observe(state, extras));
  assert.equal(witness.observe(state, extras), null);
  assert.ok(witness.observe(state, { ...extras, wallMs: 2000 }));
  assert.equal(witness.recent().length, 2);
});

test('plain-language report includes verdict and ranked costs', () => {
  const samples = series({
    costs: [{ name: 'render', p95: 12, avg: 8, max: 20 }],
  });
  const text = formatRuntimeWitnessReport({
    verdict: classifyRuntimeWitness(samples),
    samples,
  });
  assert.match(text, /Verdict: presenting/);
  assert.match(text, /render: p95 12/);
});
