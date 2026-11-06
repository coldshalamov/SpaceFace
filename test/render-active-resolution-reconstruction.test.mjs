import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createBloom } from '../src/render/bloom.js';
import { render as renderSystem } from '../src/render/renderer.js';
import { getPostRenderTargetTelemetry } from '../src/render/postTelemetry.js';

function harness() {
  let target = null, ratio = 1, width = 640, height = 360;
  const draws = [], compiled = new Map();
  const renderer = {
    capabilities: { isWebGL2: true, maxSamples: 0 },
    autoClear: true,
    getPixelRatio: () => ratio,
    setPixelRatio(value) { ratio = value; },
    setSize(w, h) { width = Math.floor(w * ratio); height = Math.floor(h * ratio); },
    getDrawingBufferSize(out) { return out.set(width, height); },
    getRenderTarget: () => target,
    setRenderTarget(value) { target = value; },
    setScissorTest() {},
    initRenderTarget() {},
    compile(scene) {
      const material = scene.children?.[0]?.material;
      if (!material) return;
      let variants = compiled.get(material);
      if (!variants) compiled.set(material, variants = new Set());
      variants.add(target ? 'working' : 'canvas');
    },
    clear() {},
    render(scene) {
      const material = scene.children?.[0]?.material;
      const uniforms = material?.uniforms;
      draws.push({
        target, material,
        viewport: target?.viewport.toArray(),
        scissor: target?.scissor.toArray(),
        inputSize: uniforms?.uInputSize ? Array.from(uniforms.uInputSize.value) : null,
        noScaling: uniforms?.uNoScaling?.value,
        source: uniforms?.tSrc?.value,
        uvScale: uniforms?.uUvScale?.value.toArray(),
        presentationScale: uniforms?.uPresentationScale?.value.toArray(),
      });
    },
  };
  const bloom = createBloom(renderer, width, height);
  const owner = Object.assign(Object.create(renderSystem), {
    renderer, bloom,
    _drawBufferAspectClass: 'land',
    state: {
      settings: { video: { qualityMode: 'auto', renderScale: 1, pixelRatioCap: 2, sharpen: false } },
      render: { dynResScale: 1, gpu: { tier: 'discrete' } },
    },
  });
  return { renderer, bloom, owner, draws, compiled };
}

function present(h) {
  h.draws.length = 0;
  h.bloom.render({ kind: 'world' }, {});
  return h.draws;
}

function casValues(h) {
  const uniforms = h.bloom.openingProgramMaterials()[2].uniforms;
  const floats = new Float32Array(uniforms.uConst0.value.buffer);
  return { input: Array.from(uniforms.uInputSize.value), constants: Array.from(floats), noScaling: uniforms.uNoScaling.value };
}

test('actual sizing owner handles the first Auto drop, active composite, CAS and native bypass', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { innerWidth: 640, innerHeight: 360, devicePixelRatio: 1 };
  const h = harness();
  const savedVideo = structuredClone(h.owner.state.settings.video);
  try {
    h.owner._applySize();
    assert.equal(h.bloom.diagnostics().casSharpenActive, false);
    const pool = h.bloom.contextLossResources().filter(r => r.isWebGLRenderTarget);
    const allocations = getPostRenderTargetTelemetry().renderTargetAllocationsTotal;
    const [downsample, composite, cas] = h.bloom.openingProgramMaterials();
    assert.equal(present(h).filter(d => d.material === cas).length, 0);

    for (const scale of [0.5, 0.75, 1, 0.85, 0.5, 1]) {
      h.owner.state.render.dynResScale = scale;
      h.owner._applySize();
      const active = scale < 1;
      assert.equal(h.bloom.diagnostics().casSharpenActive, active);
      const draws = present(h);
      const compositeDraw = draws.find(d => d.material === composite);
      const casDraws = draws.filter(d => d.material === cas);
      assert.equal(casDraws.length, active ? 1 : 0);
      if (active) {
        const w = Math.round(640 * scale), height = Math.round(360 * scale);
        assert.deepEqual(compositeDraw.viewport, [0, 0, w, height]);
        assert.deepEqual(compositeDraw.scissor, [0, 0, w, height]);
        assert.deepEqual(compositeDraw.uvScale, [w / 640, height / 360]);
        assert.deepEqual(compositeDraw.presentationScale, [640 / w, 360 / height]);
        assert.deepEqual(casDraws[0].inputSize, [w, height]);
        assert.equal(casDraws[0].noScaling, false);
        assert.strictEqual(casDraws[0].source, compositeDraw.target.texture);
        assert.equal(casDraws[0].target, null);
        assert.ok(draws.indexOf(compositeDraw) > draws.findLastIndex(d => d.material === downsample));
        assert.strictEqual(draws.at(-1), casDraws[0]);
        const values = casValues(h);
        assert.ok(Math.abs(values.constants[0] - w / 640) < 1e-7);
        assert.ok(Math.abs(values.constants[1] - height / 360) < 1e-7);
        assert.ok(Math.abs(values.constants[2] - (0.5 * w / 640 - 0.5)) < 1e-7);
      } else {
        assert.equal(compositeDraw.target, null);
        assert.deepEqual(compositeDraw.presentationScale, [1, 1]);
        assert.strictEqual(draws.at(-1), compositeDraw);
      }
      assert.equal(getPostRenderTargetTelemetry().renderTargetAllocationsTotal, allocations);
      assert.deepEqual(h.bloom.contextLossResources().filter(r => r.isWebGLRenderTarget), pool);
    }
    assert.deepEqual(h.owner.state.settings.video, savedVideo, 'render adaptation never edits saved quality choices');
  } finally { h.bloom.dispose(); globalThis.window = previousWindow; }
});

test('direct content transitions update CAS without a second setSize or any target allocation', () => {
  const h = harness();
  try {
    h.bloom.setSize(640, 360, 640, 360);
    const allocations = getPostRenderTargetTelemetry().renderTargetAllocationsTotal;
    for (const scale of [0.5, 1, 0.75, 1]) {
      h.bloom.setContentScale(scale);
      assert.equal(h.bloom.diagnostics().casSharpenActive, scale < 1);
      present(h);
      assert.equal(getPostRenderTargetTelemetry().renderTargetAllocationsTotal, allocations);
    }
  } finally { h.bloom.dispose(); }
});

test('odd active bounds, resize and context rebuild retain the reconstruction contract', async () => {
  const h = harness();
  try {
    h.bloom.setSize(641, 361, 641, 361);
    h.bloom.setContentScale(0.5);
    assert.deepEqual(casValues(h).input, [321, 181]);
    let draws = present(h);
    assert.deepEqual(draws.at(-2).viewport, [0, 0, 321, 181]);
    assert.deepEqual(draws.at(-1).inputSize, [321, 181], 'CasLoad bounds exclude unused pooled pixels');
    assert.equal(draws.at(-1).target, null);
    const oldTargets = h.bloom.contextLossResources().filter(r => r.isWebGLRenderTarget);
    const disposed = [];
    for (const target of oldTargets) target.addEventListener('dispose', () => disposed.push(target));
    h.bloom.rebuild();
    assert.deepEqual(new Set(disposed), new Set(oldTargets));
    await h.bloom.prepareResources();
    draws = present(h);
    assert.deepEqual(draws.at(-1).inputSize, [321, 181]);
    assert.equal(draws.at(-1).noScaling, false);
    assert.ok(!oldTargets.includes(draws.at(-2).target));

    h.bloom.setSize(360, 640, 360, 640);
    assert.deepEqual(casValues(h).input, [180, 320]);
    draws = present(h);
    assert.deepEqual(draws.at(-2).viewport, [0, 0, 180, 320]);
    assert.deepEqual(draws.at(-1).inputSize, [180, 320]);
    assert.equal(h.bloom.diagnostics().drawingBufferWidth, 360);

    h.bloom.setContentScale(1);
    const nativePool = h.bloom.contextLossResources().filter(r => r.isWebGLRenderTarget);
    const nativePost = nativePool.find(r => r.texture.type === THREE.UnsignedByteType);
    assert.ok(nativePost, 'recovery retains the CAS pool even during native bypass');
    h.bloom.rebuild();
    assert.equal(h.bloom.diagnostics().casSharpenActive, false);
    const restoredPool = h.bloom.contextLossResources().filter(r => r.isWebGLRenderTarget);
    assert.ok(restoredPool.some(r => r.texture.type === THREE.UnsignedByteType));
    const restoredAllocations = getPostRenderTargetTelemetry().renderTargetAllocationsTotal;
    h.bloom.setContentScale(0.5);
    assert.equal(present(h).at(-1).noScaling, false);
    assert.equal(getPostRenderTargetTelemetry().renderTargetAllocationsTotal, restoredAllocations);
  } finally { h.bloom.dispose(); }
});

test('opening at native resolution prepares the future offscreen composite and both CAS modes', async () => {
  const h = harness();
  try {
    h.bloom.setSize(640, 360, 640, 360);
    await h.bloom.prepareResources();
    const [, composite, cas] = h.bloom.openingProgramMaterials();
    assert.deepEqual(h.compiled.get(composite), new Set(['canvas', 'working']));
    assert.deepEqual(h.compiled.get(cas), new Set(['canvas']));
    h.bloom.setContentScale(0.5);
    assert.equal(present(h).at(-1).material, cas);
    h.bloom.setContentScale(1);
    assert.equal(present(h).at(-1).material, composite);
    assert.equal(composite.toneMapped, false);
    assert.equal(cas.toneMapped, false);
    const post = h.bloom.contextLossResources().find(r => r.isWebGLRenderTarget && r.texture.type === THREE.UnsignedByteType);
    assert.equal(post.texture.colorSpace, THREE.NoColorSpace, 'composite-encoded bytes are not encoded again on CAS input');
  } finally { h.bloom.dispose(); }
});

test('manual low drawing buffer retains sharpen-only and supersampled active content bypasses CAS', () => {
  const h = harness();
  try {
    h.bloom.setSize(640, 360, 1280, 720);
    assert.deepEqual(casValues(h).input, [640, 360]);
    assert.equal(casValues(h).noScaling, true, 'browser still owns the cap/renderScale display upscale');
    assert.equal(present(h).at(-1).noScaling, true);
    h.bloom.setSize(1280, 720, 640, 360);
    h.bloom.setContentScale(0.75);
    assert.equal(h.bloom.diagnostics().casSharpenActive, false, 'active 960x540 still exceeds the physical display');
    assert.equal(present(h).at(-1).material, h.bloom.openingProgramMaterials()[1]);
  } finally { h.bloom.dispose(); }
});

test('software floor retains its resolution band without unsupported CAS scaling beyond 4x area', () => {
  const h = harness();
  try {
    h.bloom.setSize(640, 360, 640, 360);
    h.bloom.setContentScale(0.34);
    const allocations = getPostRenderTargetTelemetry().renderTargetAllocationsTotal;
    const draws = present(h);
    assert.equal(h.bloom.diagnostics().contentScale, 0.34);
    assert.deepEqual(draws.at(-2).viewport, [0, 0, 640, 360], 'unsupported ratio retains the linear composite handoff');
    assert.deepEqual(draws.at(-1).inputSize, [640, 360]);
    assert.equal(draws.at(-1).noScaling, true);
    assert.equal(h.bloom.diagnostics().casReconstruction, 'bilinear-sharpen-area-limit');
    assert.equal(getPostRenderTargetTelemetry().renderTargetAllocationsTotal, allocations);
  } finally { h.bloom.dispose(); }
});
