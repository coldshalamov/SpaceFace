import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createBloom } from '../src/render/bloom.js';
import { WeaponVfxPresenter } from '../src/render/weapons/presenter.js';
import { activeWeaponRenderGraph, weaponPresenterDepthTexture } from '../src/render/vfx.js';

function harness() {
  let target = null;
  let alpha = 0.75;
  const color = new THREE.Color(0x102030);
  const draws = [], clears = [], initialized = [];
  const renderer = {
    capabilities: { isWebGL2: false, maxSamples: 0 }, autoClear: true,
    getRenderTarget: () => target,
    setRenderTarget(value) { target = value; },
    getClearColor(out) { return out.copy(color); },
    getClearAlpha: () => alpha,
    setClearColor(value, nextAlpha) { color.copy(value); alpha = nextAlpha; },
    clear() { clears.push({ target, color: color.clone(), alpha }); },
    initRenderTarget(value) { initialized.push(value); },
    render(scene) {
      const uniforms = scene.children?.[0]?.material?.uniforms;
      draws.push({ scene, target, distortion: uniforms?.uDistortion?.value,
        texture: uniforms?.tDistortion?.value });
    },
  };
  return { renderer, draws, clears, initialized, color, get alpha() { return alpha; } };
}

function activate(field) {
  field.spawn({ x: 3, y: 0.5, z: 4, radius: 8, strength: 0.9, life: 0.8 });
  field.update(0);
}

test('default bloom has no distortion target or draw without an attached producer', () => {
  const h = harness();
  const bloom = createBloom(h.renderer, 640, 360);
  try {
    bloom.render(new THREE.Scene(), new THREE.PerspectiveCamera());
    assert.equal(h.draws.length, 4, 'the existing scene/pyramid/composite cost is unchanged');
    assert.equal(bloom.diagnostics().renderTargetCount, 3);
    assert.equal(bloom.diagnostics().distortionAttached, false);
    assert.equal(bloom.diagnostics().passFamilies.distortion, 0);
    assert.equal(h.draws.at(-1).distortion, 0, 'the idle shader skips displacement texture sampling');
  } finally { bloom.dispose(); }
});

test('native weapon and Well producers share one default-route target, then sleep at expiry', () => {
  const h = harness();
  const bloom = createBloom(h.renderer, 640, 360);
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  const camera = new THREE.PerspectiveCamera();
  try {
    presenter.attachGraph(bloom);
    const target = bloom.contextLossResources().find((rt) => rt.texture.name === 'Bloom:Distortion');
    assert.ok(target);
    bloom.render(new THREE.Scene(), camera);
    assert.equal(h.draws.length, 4, 'attached idle pools add no draw');
    activate(presenter.distortion);
    activate(presenter.wellDistortion);
    h.draws.length = 0;
    bloom.render(new THREE.Scene(), camera);
    assert.deepEqual(h.draws.filter((draw) => draw.target === target).map((draw) => draw.scene),
      [presenter.distortion.scene, presenter.wellDistortion.scene]);
    assert.equal(bloom.diagnostics().passFamilies.distortion, 1);
    assert.equal(bloom.diagnostics().passFamilies.distortionProducers, 2);
    assert.equal(h.draws.at(-1).texture, target.texture);
    assert.equal(h.draws.at(-1).distortion, 1);
    const clear = h.clears.find((entry) => entry.target === target);
    assert.deepEqual(clear.color.toArray(), [0.5, 0.5, 0]);
    assert.equal(clear.alpha, 0);
    assert.equal(h.color.getHex(), 0x102030);
    assert.equal(h.alpha, 0.75);
    assert.equal(h.renderer.autoClear, true);
    assert.equal(h.renderer.getRenderTarget(), null);
    const composite = bloom.openingProgramMaterials().find((mat) => mat.uniforms.uDistortion);
    assert.equal(composite.uniforms.tDistortion.value, null, 'no cross-frame framebuffer feedback binding');

    bloom.enabled = false;
    h.draws.length = 0;
    bloom.render(new THREE.Scene(), camera);
    assert.equal(h.draws.length, 4, 'bloom-off keeps scene, two live producer draws and composite');
    assert.equal(bloom.diagnostics().bloomPasses, 0);
    assert.equal(h.draws.at(-1).distortion, 1, 'glow control does not disable weapon refraction');
    presenter.distortion.update(1);
    presenter.wellDistortion.update(1);
    h.draws.length = 0;
    bloom.render(new THREE.Scene(), camera);
    assert.equal(h.draws.length, 2);
    assert.equal(h.draws.at(-1).distortion, 0, 'expired vectors cannot ghost into later frames');
    assert.equal(bloom.contextLossResources().find((rt) => rt.texture.name === 'Bloom:Distortion'), target,
      'active and idle frames never allocate a replacement target');
  } finally { presenter.dispose(); bloom.dispose(); }
});

test('distortion participates in opening admission, resize, context rebuild and disposal', async () => {
  const h = harness();
  const bloom = createBloom(h.renderer, 800, 600);
  const producer = { hasLive: false, scene: new THREE.Scene() };
  const producers = [producer];
  try {
    bloom.attachDistortionProducers(producers);
    const first = bloom.contextLossResources().find((rt) => rt.texture.name === 'Bloom:Distortion');
    let firstDisposed = 0;
    first.addEventListener('dispose', () => firstDisposed++);
    bloom.attachDistortionProducers(producers);
    await bloom.prepareResources();
    assert.ok(h.initialized.includes(first), 'target is admitted during loading, before the first shot');
    bloom.setSize(1024, 768);
    assert.equal(first.width, 512);
    assert.equal(first.height, 384);
    const afterResize = firstDisposed;
    bloom.rebuild();
    assert.equal(firstDisposed, afterResize + 1);
    const rebuilt = bloom.contextLossResources().find((rt) => rt.texture.name === 'Bloom:Distortion');
    assert.notEqual(rebuilt, first);
    assert.deepEqual([rebuilt.width, rebuilt.height], [512, 384]);
    let rebuiltDisposed = 0;
    rebuilt.addEventListener('dispose', () => rebuiltDisposed++);
    bloom.attachDistortionProducers(null);
    assert.equal(rebuiltDisposed, 1);
    assert.equal(bloom.diagnostics().distortionAttached, false);
    assert.equal(bloom.contextLossResources().includes(rebuilt), false);
  } finally { bloom.dispose(); }
});

test('native presenter switches active compositor and unregisters on disposal', () => {
  const h = harness();
  const bloom = createBloom(h.renderer, 640, 360);
  const graph = { producers: null, attachDistortionProducers(value) { this.producers = value; } };
  const state = { settings: { video: { renderGraph: false } }, render: { bloom, renderGraph: graph } };
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  try {
    assert.equal(activeWeaponRenderGraph(state), bloom, 'the shipping default selects the active bloom compositor');
    assert.equal(weaponPresenterDepthTexture(bloom), null, 'no feedback from current scene depth');
    presenter.attachGraph(activeWeaponRenderGraph(state));
    assert.equal(bloom.diagnostics().distortionAttached, true);
    state.settings.video.renderGraph = true;
    presenter.attachGraph(activeWeaponRenderGraph(state));
    assert.equal(bloom.diagnostics().distortionAttached, false);
    assert.equal(graph.producers, presenter.distortionProducers);
    state.settings.video.renderGraph = false;
    presenter.attachGraph(activeWeaponRenderGraph(state));
    assert.equal(graph.producers, null);
    assert.equal(bloom.diagnostics().distortionAttached, true);
    presenter.dispose();
    assert.equal(bloom.diagnostics().distortionAttached, false);
    assert.equal(bloom.diagnostics().distortionTarget, null);
  } finally { bloom.dispose(); }
});
