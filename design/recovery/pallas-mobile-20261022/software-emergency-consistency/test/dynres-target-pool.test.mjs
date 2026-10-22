// Dyn-res target pool (PERF backlog #89): bloom/post RTs pre-allocate at max size;
// content-scale changes must cause ZERO render-target reallocations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createBloom } from '../src/render/bloom.js';
import {
  getPostRenderTargetTelemetry,
  resetPostRenderTargetTotals,
} from '../src/render/postTelemetry.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RENDERER_SRC = readFileSync(join(ROOT, 'src/render/renderer.js'), 'utf8');
const BLOOM_SRC = readFileSync(join(ROOT, 'src/render/bloom.js'), 'utf8');

function rendererHarness() {
  const events = [];
  const binds = [];
  let activeTarget = null;
  let viewport = { x: 0, y: 0, w: 0, h: 0 };
  let scissor = { x: 0, y: 0, w: 0, h: 0 };
  let scissorTest = false;
  const renderer = {
    capabilities: { isWebGL2: false, maxSamples: 0 },
    autoClear: true,
    domElement: { width: 640, height: 360 },
    setRenderTarget(target) {
      activeTarget = target;
      events.push(`target:${target ? `${target.width}x${target.height}` : 'screen'}`);
      // Snapshot the target's own viewport/scissor the way three.js setRenderTarget copies
      // them on bind — target-scoped sub-rects are the dyn-res contract now.
      binds.push({
        size: target ? `${target.width}x${target.height}` : 'screen',
        viewport: target && target.viewport
          ? { x: target.viewport.x, y: target.viewport.y, w: target.viewport.z, h: target.viewport.w }
          : null,
        scissor: target && target.scissor
          ? { x: target.scissor.x, y: target.scissor.y, w: target.scissor.z, h: target.scissor.w }
          : null,
        scissorTest: target ? target.scissorTest === true : null,
      });
    },
    getRenderTarget() { return activeTarget; },
    setViewport(x, y, w, h) {
      if (x && typeof x === 'object') {
        viewport = { x: x.x, y: x.y, w: x.z ?? x.width, h: x.w ?? x.height };
      } else {
        viewport = { x, y, w, h };
      }
      events.push(`viewport:${viewport.w}x${viewport.h}`);
    },
    getViewport(out) {
      if (out) {
        out.x = viewport.x; out.y = viewport.y; out.z = viewport.w; out.w = viewport.h;
        return out;
      }
      return { x: viewport.x, y: viewport.y, z: viewport.w, w: viewport.h };
    },
    setScissor(x, y, w, h) {
      if (x && typeof x === 'object') {
        scissor = { x: x.x, y: x.y, w: x.z ?? x.width, h: x.w ?? x.height };
      } else {
        scissor = { x, y, w, h };
      }
      events.push(`scissor:${scissor.w}x${scissor.h}`);
    },
    getScissor(out) {
      if (out) {
        out.x = scissor.x; out.y = scissor.y; out.z = scissor.w; out.w = scissor.h;
        return out;
      }
      return { x: scissor.x, y: scissor.y, z: scissor.w, w: scissor.h };
    },
    setScissorTest(v) { scissorTest = !!v; events.push(`scissorTest:${scissorTest}`); },
    getScissorTest() { return scissorTest; },
    clear() { events.push(`clear:${activeTarget ? `${activeTarget.width}x${activeTarget.height}` : 'screen'}`); },
    render(scene) {
      if (renderer.autoClear) renderer.clear();
      events.push(`render:${scene && scene.kind || 'quad'}`);
    },
  };
  return { renderer, events, binds };
}

test('static: integrated tier may enable dynRes; bloom exposes setContentScale', () => {
  assert.match(
    RENDERER_SRC,
    /_dynResAllowed\s*=\s*gpu\.tier\s*===\s*['"]software['"]\s*\|\|\s*gpu\.tier\s*===\s*['"]integrated['"]/,
    'software + integrated must be allowed after the target-pool fix',
  );
  assert.match(BLOOM_SRC, /function setContentScale\s*\(/, 'bloom must expose setContentScale');
  assert.match(BLOOM_SRC, /uUvScale/, 'downsample/composite must remap UV for content sub-rects');
  assert.match(
    RENDERER_SRC,
    /setContentScale\s*\(\s*dyn\s*\)/,
    '_applySize must forward dynResScale to bloom.setContentScale',
  );
  assert.doesNotMatch(
    RENDERER_SRC,
    /setPixelRatio\([\s\S]{0,80}base \* scale \* dyn/,
    'drawing buffer must stay at max pool size (no dyn multiply)',
  );
});

test('content scale changes cause zero bloom render-target reallocations', () => {
  resetPostRenderTargetTotals();
  const harness = rendererHarness();
  const bloom = createBloom(harness.renderer, 640, 360);
  try {
    const afterInit = getPostRenderTargetTelemetry().renderTargetAllocationsTotal;
    assert.ok(afterInit >= 2, `expected init allocations, got ${afterInit}`);

    // Sweep through scales the adaptive controller actually uses.
    for (const scale of [1, 0.75, 0.5, 0.34, 0.5, 0.85, 1]) {
      bloom.setContentScale(scale);
      bloom.render({ kind: 'scene' }, { kind: 'camera' });
    }

    const afterScales = getPostRenderTargetTelemetry().renderTargetAllocationsTotal;
    assert.equal(
      afterScales,
      afterInit,
      `scale changes must not reallocate (before=${afterInit} after=${afterScales}; last=${getPostRenderTargetTelemetry().lastAllocationReason})`,
    );

    const diag = bloom.diagnostics();
    assert.equal(diag.targetPoolMaxWidth, 640);
    assert.equal(diag.targetPoolMaxHeight, 360);
    assert.equal(diag.contentScale, 1);
    assert.equal(diag.contentWidth, 640);
    assert.equal(diag.sceneTargetWidth, 640, 'allocated RT stays at max');

    bloom.setContentScale(0.5);
    const half = bloom.diagnostics();
    assert.equal(half.contentWidth, 320);
    assert.equal(half.contentHeight, 180);
    assert.equal(half.sceneTargetWidth, 640, 'still max after scale-down');
    assert.equal(
      getPostRenderTargetTelemetry().renderTargetAllocationsTotal,
      afterInit,
      'setContentScale(0.5) must not allocate',
    );

    // Real window resize (max pool change) MAY allocate — that is not a dyn-res scale change.
    bloom.setSize(800, 450);
    const afterResize = getPostRenderTargetTelemetry().renderTargetAllocationsTotal;
    assert.ok(
      afterResize > afterInit,
      'setSize to a new max must still resize/allocate the pool',
    );
    assert.equal(bloom.diagnostics().targetPoolMaxWidth, 800);
    assert.equal(bloom.diagnostics().contentWidth, 400, 'content stays proportional after max resize');
  } finally {
    bloom.dispose();
  }
});

test('scaled render uses target-scoped content sub-rects and never touches the canvas viewport', () => {
  resetPostRenderTargetTotals();
  const harness = rendererHarness();
  const bloom = createBloom(harness.renderer, 640, 360);
  try {
    bloom.setContentScale(0.5);
    harness.events.length = 0;
    harness.binds.length = 0;
    bloom.render({ kind: 'scene' }, { kind: 'camera' });

    // Scene pass confines drawing via the render target's own viewport/scissor (device px).
    const sceneBind = harness.binds.find((b) => b.size === '640x360');
    assert.ok(sceneBind, 'scene pass must bind the max-size scene target');
    assert.deepEqual(
      sceneBind.viewport,
      { x: 0, y: 0, w: 320, h: 180 },
      `scene target must carry the half-res content rect; got ${JSON.stringify(sceneBind.viewport)}`,
    );
    assert.equal(sceneBind.scissorTest, true, 'scene target must scissor to the content rect');
    // Downsample level 0 writes half of half = 160x90 content into the half-res pyramid target.
    const downBind = harness.binds.find((b) => b.size === '320x180');
    assert.ok(downBind, 'downsample must bind the half-res pyramid target');
    assert.deepEqual(
      downBind.viewport,
      { x: 0, y: 0, w: 160, h: 90 },
      `downsample target must carry its content sub-rect; got ${JSON.stringify(downBind.viewport)}`,
    );

    // Regression (dyn-res corner picture): the scene pass used to write renderer.setViewport,
    // which persists as the canvas's default-framebuffer viewport — the final composite blit
    // then inherited the sub-rect and squeezed the picture into the bottom-left corner. The
    // canvas viewport/scissor must never be written during a bloom render.
    assert.ok(
      !harness.events.some((e) => e.startsWith('viewport:') || e.startsWith('scissor:')),
      `no canvas viewport/scissor writes during render; got ${harness.events.join(',')}`,
    );
    assert.ok(
      !harness.events.includes('scissorTest:true'),
      'canvas scissor test must never be enabled by a bloom pass',
    );
    assert.ok(harness.events.includes('target:screen'), 'composite must still reach the canvas');

    // Soft-GPU / software floor (0.34) shares this zero-realloc pool; integrated uses 0.5+.
    const allocBeforeFloor = getPostRenderTargetTelemetry().renderTargetAllocationsTotal;
    bloom.setContentScale(0.34);
    bloom.render({ kind: 'scene' }, { kind: 'camera' });
    assert.equal(
      getPostRenderTargetTelemetry().renderTargetAllocationsTotal,
      allocBeforeFloor,
      'software-floor scale render must still be zero-realloc',
    );
    const floorSceneBind = harness.binds.filter((b) => b.size === '640x360').pop();
    assert.deepEqual(
      floorSceneBind.viewport,
      { x: 0, y: 0, w: Math.round(640 * 0.34), h: Math.round(360 * 0.34) },
      'software-floor scale must still carry its content rect on the scene target',
    );
  } finally {
    bloom.dispose();
  }
});

test('package script check:dynres-target-pool exists', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(
    pkg.scripts['check:dynres-target-pool'],
    'node --test test/dynres-target-pool.test.mjs',
  );
});
