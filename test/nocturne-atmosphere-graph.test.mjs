import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createNocturneAtmosphere } from '../src/render/nocturne/atmosphere.js';
import { SpaceRenderGraph } from '../src/render/post/spaceRenderGraph.js';
import { createBloom } from '../src/render/bloom.js';

function fixture({ ao = true, renderScale = 0.75 } = {}) {
  let target = null, scissorTest = false, alpha = 1;
  const viewport = new THREE.Vector4(0, 0, 800, 600), scissor = viewport.clone();
  const color = new THREE.Color();
  const draws = [], initialized = [];
  const renderer = {
    isWebGLRenderer: true, capabilities: { isWebGL2: true }, autoClear: true,
    getContext: () => ({ getExtension: () => ({}) }),
    getRenderTarget: () => target, setRenderTarget(value) { target = value; },
    getViewport: value => value.copy(viewport),
    setViewport(a, b, c, d) { if (a?.isVector4) viewport.copy(a); else viewport.set(a, b, c, d); },
    getScissor: value => value.copy(scissor), setScissor: value => scissor.copy(value),
    getScissorTest: () => scissorTest, setScissorTest(value) { scissorTest = value; },
    getClearColor: value => value.copy(color), getClearAlpha: () => alpha,
    setClearColor(value, nextAlpha) { color.copy(value); alpha = nextAlpha; },
    clear() {}, compile() {},
    initRenderTarget(value) { initialized.push(value); },
    render(scene) {
      const material = scene.overrideMaterial || scene.children[0]?.material;
      draws.push({ target, material, atmosphere: material?.uniforms?.uNocturneAtmosphere?.value });
    },
    renderAndCaptureList(scene, camera) { this.render(scene, camera); return { opaque: [] }; },
    renderCapturedList(scene, camera) { this.render(scene, camera); },
  };
  const graph = new SpaceRenderGraph(renderer, { ao, bloom: false, renderScale });
  graph.setSize(800, 600);
  const atmosphere = createNocturneAtmosphere(renderer, 800, 600);
  atmosphere.setMedia([{ center: new THREE.Vector3(), radii: new THREE.Vector3(90, 40, 90), density: 0.004 }]);
  atmosphere.setLights([new THREE.PointLight(0xffa050, 10000, 200)]);
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(geometry, material));
  const camera = new THREE.PerspectiveCamera(48, 4 / 3, 1, 1000);
  camera.position.set(0, 125, 160); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  return { renderer, graph, atmosphere, scene, camera, draws, initialized,
    dispose() { graph.dispose(); atmosphere.dispose(); geometry.dispose(); material.dispose(); } };
}

test('graph uses its existing resolved scene depth and composes transport after AO, before final presentation', () => {
  const h = fixture();
  const depth = h.graph.depthTexture, sceneTarget = h.graph.sceneTarget;
  h.graph.attachAtmosphere(h.atmosphere);
  const atmosphericMaterial = h.atmosphere.openingProgramMaterials()[0];
  const composite = h.graph.compositeMaterial;
  h.graph.render(h.scene, h.camera);
  const scatterIndex = h.draws.findIndex(draw => draw.material === atmosphericMaterial);
  const normalIndex = h.draws.findIndex(draw => draw.material === h.graph.normalMaterial);
  const aoIndex = h.draws.findLastIndex(draw => draw.material === h.graph.blurMaterial);
  const compositeIndex = h.draws.findIndex(draw => draw.material === composite);
  assert.ok(normalIndex >= 0 && aoIndex > normalIndex);
  assert.ok(scatterIndex > aoIndex && compositeIndex > scatterIndex);
  assert.strictEqual(h.graph.depthTexture, depth, 'attachment reuses graph depth');
  assert.strictEqual(h.graph.sceneTarget, sceneTarget, 'attachment does not replace the scene target');
  assert.strictEqual(composite.uniforms.tNocturneSceneDepth.value, depth);
  assert.equal(composite.uniforms.uNocturneAtmosphere.value, 1);
  assert.equal(h.atmosphere.getDiagnostics().width, 300);
  assert.equal(h.atmosphere.getDiagnostics().height, 225);
  assert.equal(h.graph.diagnostics().passFamilies.atmosphere, 1);
  const resources = h.atmosphere.contextLossResources();
  h.graph.render(h.scene, h.camera);
  assert.deepEqual(h.atmosphere.contextLossResources(), resources);
  assert.strictEqual(h.graph.compositeMaterial, composite);
  assert.strictEqual(h.renderer.getRenderTarget(), null);
  assert.equal(h.renderer.autoClear, true);
  assert.equal(h.scene.overrideMaterial, null);
  h.dispose();
});

test('graph honors transport toggles, vacuum, scale changes and detach without destroying the shared pass', () => {
  const h = fixture({ ao: false });
  const composite = h.graph.compositeMaterial;
  h.graph.attachAtmosphere(h.atmosphere);
  h.graph.render(h.scene, h.camera);
  h.atmosphere.setEnabled(false);
  h.graph.render(h.scene, h.camera);
  assert.equal(composite.uniforms.uNocturneAtmosphere.value, 0);
  h.atmosphere.setEnabled(true); h.atmosphere.setMedia([]);
  h.graph.render(h.scene, h.camera);
  assert.equal(composite.uniforms.uNocturneAtmosphere.value, 0);
  assert.equal(h.graph.diagnostics().passFamilies.atmosphere, 0);
  h.graph.setOptions({ renderScale: 0.5 });
  assert.equal(h.atmosphere.getDiagnostics().width, 200);
  assert.equal(h.atmosphere.getDiagnostics().height, 150);
  h.graph.attachAtmosphere(null);
  assert.strictEqual(composite.uniforms.tNocturneScatter.value, h.graph.blackBloomTexture);
  assert.strictEqual(composite.uniforms.tNocturneSceneDepth.value, h.graph.blackBloomTexture);
  h.graph.render(h.scene, h.camera);
  assert.strictEqual(h.graph.compositeMaterial, composite);
  assert.equal(h.graph.diagnostics().atmosphere, null);
  assert.equal(h.atmosphere.openingProgramMaterials().length, 1);
  h.graph.attachAtmosphere(h.atmosphere);
  h.graph.dispose();
  assert.equal(h.atmosphere.openingProgramMaterials().length, 1, 'graph does not own the shared lifetime');
  h.atmosphere.dispose();
  h.scene.children[0].geometry.dispose(); h.scene.children[0].material.dispose();
});

test('graph warm-up includes atmospheric targets/programs and context cleanup exposes every shared resource', async () => {
  const h = fixture({ ao: false });
  h.graph.attachAtmosphere(h.atmosphere);
  const resources = h.atmosphere.contextLossResources();
  const material = h.atmosphere.openingProgramMaterials()[0];
  assert.ok(h.graph.openingProgramMaterials().includes(material));
  for (const resource of resources) assert.ok(h.graph.contextLossResources().includes(resource));
  const result = await h.graph.prepareResources({ camera: h.camera });
  assert.equal(result.targets, h.initialized.length);
  for (const resource of resources) if (resource.isWebGLRenderTarget) assert.ok(h.initialized.includes(resource));
  assert.ok(h.draws.some(draw => draw.material === material));
  assert.ok(h.draws.some(draw => draw.material === h.graph.compositeMaterial));
  assert.equal(h.renderer.getRenderTarget(), null);
  h.dispose();
});

test('bloom detaches atmospheric depth without GPU disposal events after context loss', () => {
  const h = fixture({ ao: false });
  const bloom = createBloom(h.renderer, 800, 600);
  bloom.attachAtmosphere(h.atmosphere);
  const sceneTarget = bloom.contextLossResources().find(resource => resource.depthTexture?.name === 'Bloom:NOCTURNE:SceneDepth');
  assert.ok(sceneTarget);
  const composite = bloom.openingProgramMaterials().find(material => material.uniforms.uNocturneAtmosphere);
  let disposalEvents = 0;
  sceneTarget.addEventListener('dispose', () => { disposalEvents++; });
  bloom.attachAtmosphere(null, { disposeGpu: false });
  assert.equal(disposalEvents, 0);
  assert.equal(sceneTarget.depthTexture, null);
  assert.equal(composite.uniforms.uNocturneAtmosphere.value, 0);
  assert.equal(composite.uniforms.tNocturneSceneDepth.value, null);
  assert.equal(h.atmosphere.openingProgramMaterials().length, 1, 'compositor does not dispose the runtime-owned pass');
  bloom.attachAtmosphere(h.atmosphere);
  disposalEvents = 0;
  bloom.attachAtmosphere(null);
  assert.equal(disposalEvents, 1, 'live-context detach still rebuilds the scene attachment');
  bloom.dispose(); h.dispose();
});
