import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBloom } from '../src/render/bloom.js';

function targetName(target) {
  return target ? `${target.width}x${target.height}` : 'screen';
}

function rendererHarness(options = {}) {
  const events = [];
  let activeTarget = null;
  let renderCount = 0;
  const renderer = {
    capabilities: { isWebGL2: false, maxSamples: 0 },
    autoClear: true,
    setRenderTarget(target) {
      activeTarget = target;
      events.push(`target:${targetName(target)}`);
    },
    getRenderTarget() { return activeTarget; },
    clear() { events.push(`clear:${targetName(activeTarget)}`); },
    render(scene) {
      renderCount += 1;
      events.push(`render:${scene && scene.kind || 'quad'}:${targetName(activeTarget)}`);
      if (renderCount === options.throwOnRenderCall) throw new Error('injected bloom draw failure');
    },
  };
  return { renderer, events, get renderCount() { return renderCount; } };
}

function instrumentationHarness(events) {
  const origin = { frameId: 47 };
  let activeGpuLabel = null;
  const tier1 = {
    isEnabled: () => true,
    countRenderPassPixels(bytes, label) { events.push(`pixels:${label}:${bytes}`); },
  };
  const perf = {
    renderWorkEnabled: true,
    tier1,
    recordRenderWork(label, durationMs) {
      assert(Number.isFinite(durationMs) && durationMs >= 0);
      events.push(`cpu:${label}`);
    },
  };
  const gpu = {
    enabled: true,
    begin(label, candidateOrigin) {
      assert.equal(activeGpuLabel, null, 'bloom pass timers remain sequential');
      assert.strictEqual(candidateOrigin, origin);
      activeGpuLabel = label;
      events.push(`gpu:begin:${label}`);
      return true;
    },
    end() {
      events.push(`gpu:end:${activeGpuLabel}`);
      activeGpuLabel = null;
    },
  };
  return {
    hooks: {
      getPerf: () => perf,
      getGpuTimers: () => gpu,
      getGpuOrigin: () => origin,
    },
    get activeGpuLabel() { return activeGpuLabel; },
  };
}

function timingEvents(events) {
  return events.filter((event) => event.startsWith('gpu:') || event.startsWith('cpu:'));
}

const TIMED_FRAME_EVENTS = [
  'gpu:begin:bloomScene', 'gpu:end:bloomScene', 'cpu:bloomScene',
  'gpu:begin:bloomDownsample', 'gpu:end:bloomDownsample', 'cpu:bloomDownsample',
  'gpu:begin:bloomComposite', 'gpu:end:bloomComposite', 'cpu:bloomComposite',
];

test('bloom keeps exact pass order and instrumentation without per-frame timing callbacks', () => {
  const harness = rendererHarness();
  const instrumentation = instrumentationHarness(harness.events);
  const bloom = createBloom(harness.renderer, 640, 360, instrumentation.hooks);
  try {
    bloom.render({ kind: 'scene' }, { kind: 'camera' });
    bloom.render({ kind: 'scene' }, { kind: 'camera' });

    const twoLevelRenderEvents = [
      'render:scene:640x360',
      'render:quad:320x180',
      'render:quad:160x90',
      'render:quad:screen',
    ];
    assert.deepEqual(
      harness.events.filter((event) => event.startsWith('render:')),
      [
        ...twoLevelRenderEvents,
        'render:scene:640x360',
        'render:quad:320x180',
        'render:quad:160x90',
        'render:quad:screen',
      ],
      'scene, two downsample levels, and composite retain their exact targets and order',
    );
    assert.deepEqual(
      timingEvents(harness.events),
      [...TIMED_FRAME_EVENTS, ...TIMED_FRAME_EVENTS],
    );
    assert.deepEqual(
      harness.events.filter((event) => event.startsWith('pixels:')),
      [
        'pixels:bloom-scene:230400',
        'pixels:bloom-downsample:57600',
        'pixels:bloom-downsample:14400',
        'pixels:bloom-composite:230400',
        'pixels:bloom-scene:230400',
        'pixels:bloom-downsample:57600',
        'pixels:bloom-downsample:14400',
        'pixels:bloom-composite:230400',
      ],
    );
    assert.equal(harness.renderer.autoClear, true);
    assert.equal(instrumentation.activeGpuLabel, null);

    harness.events.length = 0;
    bloom.enabled = false;
    bloom.render({ kind: 'scene' }, { kind: 'camera' });
    assert.deepEqual(harness.events, ['target:screen', 'render:scene:screen'],
      'the bloom-off fast path stays a single uninstrumented screen render');

    harness.events.length = 0;
    bloom.enabled = true;
    bloom.strength = 0.0001;
    bloom.render({ kind: 'scene' }, { kind: 'camera' });
    assert.deepEqual(harness.events, ['target:screen', 'render:scene:screen'],
      'the near-zero-strength fast path stays a single uninstrumented screen render');
  } finally {
    bloom.dispose();
  }
});

test('one-level bloom keeps its exact target, draw, and Tier-1 pixel contract', () => {
  const harness = rendererHarness();
  const instrumentation = instrumentationHarness(harness.events);
  const bloom = createBloom(harness.renderer, 320, 180, instrumentation.hooks);
  try {
    bloom.render({ kind: 'scene' }, { kind: 'camera' });
    assert.deepEqual(
      harness.events.filter((event) => event.startsWith('render:')),
      ['render:scene:320x180', 'render:quad:160x90', 'render:quad:screen'],
    );
    assert.deepEqual(
      harness.events.filter((event) => event.startsWith('pixels:')),
      [
        'pixels:bloom-scene:57600',
        'pixels:bloom-downsample:14400',
        'pixels:bloom-composite:57600',
      ],
    );
    assert.deepEqual(timingEvents(harness.events), TIMED_FRAME_EVENTS);
    assert.equal(instrumentation.activeGpuLabel, null);
  } finally {
    bloom.dispose();
  }
});

test('every failing timed pass closes its matching GPU and CPU group exactly once', () => {
  const cases = [
    { name: 'scene', throwOnRenderCall: 1, expected: TIMED_FRAME_EVENTS.slice(0, 3), autoClear: true },
    { name: 'downsample', throwOnRenderCall: 2, expected: TIMED_FRAME_EVENTS.slice(0, 6), autoClear: false },
    { name: 'composite', throwOnRenderCall: 4, expected: TIMED_FRAME_EVENTS, autoClear: false },
  ];
  for (const candidate of cases) {
    const harness = rendererHarness({ throwOnRenderCall: candidate.throwOnRenderCall });
    const instrumentation = instrumentationHarness(harness.events);
    const bloom = createBloom(harness.renderer, 640, 360, instrumentation.hooks);
    try {
      assert.throws(
        () => bloom.render({ kind: 'scene' }, { kind: 'camera' }),
        /injected bloom draw failure/,
        `${candidate.name} failure remains observable`,
      );
      assert.deepEqual(timingEvents(harness.events), candidate.expected,
        `${candidate.name} closes exactly the timing groups it entered`);
      assert.equal(instrumentation.activeGpuLabel, null);
      assert.equal(harness.renderer.autoClear, candidate.autoClear,
        'the callback refactor must not add outer render-state cleanup semantics');
    } finally {
      bloom.dispose();
    }
  }
});

test('shipping render reuses createBloom-lifetime pass functions with fixed argument slots', () => {
  const source = readFileSync(new URL('../src/render/bloom.js', import.meta.url), 'utf8');
  const factoryStart = source.indexOf('export function createBloom(');
  const start = source.indexOf('  function render(scene, camera) {');
  const end = source.indexOf('\n  function compileScenePipelines(', start);
  assert(factoryStart >= 0 && start > factoryStart && end > start,
    'the shipping bloom factory and render body remain inspectable');
  const factoryPrefix = source.slice(factoryStart, start);
  const body = source.slice(start, end);
  for (const name of ['renderScenePass', 'renderDownsamplePass', 'renderCompositePass']) {
    assert.equal((factoryPrefix.match(new RegExp(`function ${name}\\(`, 'g')) || []).length, 1,
      `${name} is allocated once by createBloom before render`);
  }
  assert.match(factoryPrefix,
    /function timePassGroup\(label, fn, arg0 = null, arg1 = null, arg2 = null\)/,
    'timing dispatch uses fixed explicit slots');
  assert.match(factoryPrefix, /try\s*\{\s*return fn\(arg0, arg1, arg2\);\s*\}\s*finally\s*\{/,
    'the pass invocation remains inside the existing try/finally boundary');
  assert.doesNotMatch(body, /=>/, 'the default bloom frame must not create timing callbacks');
  assert.doesNotMatch(body, /\.bind\(|\.apply\(|\.\.\./,
    'the default bloom frame must not synthesize callback argument containers');
  assert.match(body, /timePassGroup\('bloomScene', renderScenePass, scene, camera, tier1\)/);
  assert.match(body, /timePassGroup\('bloomDownsample', renderDownsamplePass, tier1\)/);
  assert.match(body, /timePassGroup\('bloomComposite', renderCompositePass, tier1\)/);
});
