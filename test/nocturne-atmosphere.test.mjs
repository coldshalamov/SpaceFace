import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  beerLambertTransmittance, createNocturneAtmosphere, createAtmosphereCompositeUniforms,
  intersectNocturneMedium, NOCTURNE_MEDIA_CAP, NOCTURNE_SCATTER_LIGHT_CAP,
} from '../src/render/nocturne/atmosphere.js';

function rendererFixture(supported = true) {
  let target = null, scissorTest = false;
  const viewport = new THREE.Vector4(0, 0, 640, 360);
  const scissor = viewport.clone();
  const color = new THREE.Color(0x031019);
  let alpha = 0.4;
  const draws = [];
  return {
    draws, autoClear: true, capabilities: { isWebGL2: supported },
    getContext: () => ({ getExtension: () => supported ? {} : null }),
    getRenderTarget: () => target, setRenderTarget(t) { target = t; },
    getViewport: (v) => v.copy(viewport), setViewport(a, b, c, d) { if (a?.isVector4) viewport.copy(a); else viewport.set(a, b, c, d); },
    getScissor: (v) => v.copy(scissor), setScissor: (v) => scissor.copy(v),
    getScissorTest: () => scissorTest, setScissorTest: (v) => { scissorTest = v; },
    getClearAlpha: () => alpha, getClearColor: (v) => v.copy(color),
    setClearColor(c, a) { color.copy(c); alpha = a; },
    initRenderTarget() {}, compile() {},
    render(scene) {
      const u = scene.children[0].material.uniforms;
      draws.push({ target, history: u.uHistory.value, media: u.uMediumCount.value,
        lights: u.uLightCount.value, shadow: u.uShadowLight.value,
        shadowEncoding: u.uShadowEncoding.value,
        lightIds: u.uLightShape.value.slice(0, u.uLightCount.value).map(v => v.w),
        scales: [u.uDepthScale.value.x, u.uDepthScale.value.y],
        material: scene.children[0].material });
    },
  };
}

function setup(options) {
  const renderer = rendererFixture();
  const pass = createNocturneAtmosphere(renderer, 640, 360, options);
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 2000);
  camera.position.set(0, 50, 100); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const depth = new THREE.DepthTexture(640, 360);
  const medium = { id: 'yard', center: new THREE.Vector3(), radii: new THREE.Vector3(100, 50, 100),
    density: 0.003, color: new THREE.Color(0.8, 0.7, 0.6), anisotropy: 0.3 };
  const light = new THREE.SpotLight(0xffa040, 8000, 200, 0.5, 0.2, 2);
  light.position.set(20, 30, 0); light.target.position.set(0, 0, 0);
  pass.setMedia([medium]); pass.setLights([light]);
  return { renderer, pass, camera, depth, medium, light };
}

test('Beer-Lambert attenuation composes over adjacent segments and vacuum is exactly clear', () => {
  assert.equal(beerLambertTransmittance(0, 1e9), 1);
  assert.equal(beerLambertTransmittance(0.3, 0), 1);
  assert.equal(beerLambertTransmittance(-1, 100), 1);
  assert.ok(Math.abs(beerLambertTransmittance(0.03, 25) * beerLambertTransmittance(0.03, 35)
    - beerLambertTransmittance(0.03, 60)) < 1e-12);
});

test('bounded medium intersection respects anisotropic radii and camera-inside cases', () => {
  const center = new THREE.Vector3(), radii = new THREE.Vector3(2, 5, 10), out = {};
  assert.equal(intersectNocturneMedium(new THREE.Vector3(0, 0, 30), new THREE.Vector3(0, 0, -1), center, radii, out), true);
  assert.ok(Math.abs(out.near - 20) < 1e-10); assert.ok(Math.abs(out.far - 40) < 1e-10);
  assert.equal(intersectNocturneMedium(center, new THREE.Vector3(0, 0, 1), center, radii, out), true);
  assert.equal(out.near, 0); assert.ok(Math.abs(out.far - 10) < 1e-10);
  assert.equal(intersectNocturneMedium(new THREE.Vector3(3, 0, 30), new THREE.Vector3(0, 0, -1), center, radii, out), false);
});

test('vacuum and disabled atmosphere submit no rendering and cannot reuse a stale illuminated history', () => {
  const h = setup();
  h.pass.render(h.depth, h.camera);
  assert.equal(h.pass.active, true);
  h.pass.setMedia([]); h.pass.render(h.depth, h.camera);
  assert.equal(h.renderer.draws.length, 1); assert.equal(h.pass.active, false);
  assert.equal(h.pass.getDiagnostics().historyValid, false);
  h.pass.setMedia([h.medium]); h.pass.render(h.depth, h.camera);
  assert.equal(h.renderer.draws.at(-1).history, 0);
  h.pass.setEnabled(false); h.pass.render(h.depth, h.camera);
  assert.equal(h.renderer.draws.length, 2); assert.equal(h.pass.active, false);
  const u = createAtmosphereCompositeUniforms(); h.pass.bindComposite(u, h.depth, h.camera);
  assert.equal(u.uNocturneAtmosphere.value, 0);
  h.pass.dispose();
});

test('steady scenes reuse bounded targets/materials; changed sources and camera cuts reject history', () => {
  const h = setup({ quality: 'integrated' });
  const resources = h.pass.contextLossResources();
  h.pass.render(h.depth, h.camera);
  assert.equal(h.renderer.draws[0].history, 0);
  h.pass.render(h.depth, h.camera);
  assert.ok(h.renderer.draws[1].history > 0);
  h.light.intensity *= 2;
  h.pass.render(h.depth, h.camera);
  assert.equal(h.renderer.draws[2].history, 0);
  h.pass.render(h.depth, h.camera);
  h.camera.position.x += 100; h.camera.updateMatrixWorld();
  h.pass.render(h.depth, h.camera);
  assert.equal(h.renderer.draws.at(-1).history, 0);
  assert.equal(h.pass.getDiagnostics().historyReason, 'camera-cut-or-projection');
  for (let i = 0; i < 60; i++) h.pass.render(h.depth, h.camera);
  assert.deepEqual(h.pass.contextLossResources(), resources);
  assert.equal(new Set(h.renderer.draws.map((d) => d.target)).size, 2);
  assert.equal(new Set(h.renderer.draws.map((d) => d.material)).size, 1);
  assert.equal(h.pass.getDiagnostics().width, 160);
  assert.equal(h.pass.getDiagnostics().height, 90);
  assert.equal(h.renderer.autoClear, true);
  assert.equal(h.renderer.getRenderTarget(), null);
  h.pass.dispose();
});

test('input caps, disabled sources and source records are respected without writing authored data', () => {
  const h = setup();
  const media = Array.from({ length: 16 }, (_, i) => ({ ...h.medium, id: `medium-${i}` }));
  media[0] = { ...h.medium, radii: new THREE.Vector3(0, 10, 10) };
  const lights = Array.from({ length: 20 }, () => h.light.clone());
  lights[0].intensity = 0;
  const serialized = JSON.stringify(media);
  h.pass.setMedia(media); h.pass.setLights(lights);
  h.pass.render(h.depth, h.camera, new THREE.Vector2(0.7, 0.7));
  assert.equal(h.renderer.draws[0].media, NOCTURNE_MEDIA_CAP);
  assert.equal(h.renderer.draws[0].lights, NOCTURNE_SCATTER_LIGHT_CAP);
  assert.deepEqual(h.renderer.draws[0].scales, [0.7, 0.7]);
  assert.equal(JSON.stringify(media), serialized);
  h.pass.dispose();
});

test('switching post routes at equal sizes rejects history from a different scene depth source', () => {
  const h = setup();
  const graphDepth = new THREE.DepthTexture(640, 360);
  h.pass.render(h.depth, h.camera);
  h.pass.render(h.depth, h.camera);
  assert.ok(h.renderer.draws.at(-1).history > 0);
  h.pass.render(graphDepth, h.camera);
  assert.equal(h.renderer.draws.at(-1).history, 0);
  assert.equal(h.pass.getDiagnostics().historyReason, 'depth-source-changed');
  h.pass.render(graphDepth, h.camera);
  assert.ok(h.renderer.draws.at(-1).history > 0);
  h.pass.render(h.depth, h.camera);
  assert.equal(h.renderer.draws.at(-1).history, 0);
  h.pass.dispose(); graphDepth.dispose();
});

test('only a ready real spotlight shadow map enables volumetric source occlusion', () => {
  const h = setup();
  h.light.castShadow = true;
  h.pass.render(h.depth, h.camera);
  assert.equal(h.renderer.draws[0].shadow, -1);
  h.light.shadow.map = new THREE.WebGLRenderTarget(256, 256);
  h.pass.render(h.depth, h.camera);
  assert.equal(h.renderer.draws[1].shadow, 0);
  assert.equal(h.pass.getDiagnostics().shadowMode, 'one-selected-spot-pcf');
  h.light.shadow.map.depthTexture = new THREE.DepthTexture(256, 256);
  h.light.shadow.map.depthTexture.compareFunction = THREE.LessEqualCompare;
  h.pass.render(h.depth, h.camera);
  assert.equal(h.renderer.draws.at(-1).shadowEncoding, 2);
  assert.equal(h.pass.getDiagnostics().shadowEncoding, 'native-depth-comparison');
  h.light.intensity = 0; h.pass.render(h.depth, h.camera);
  assert.equal(h.renderer.draws.at(-1).shadow, -1);
  assert.equal(h.renderer.draws.at(-1).lights, 0);
  h.light.shadow.map.dispose(); h.pass.dispose();
});

test('a later strong explosion enters the bounded scatter set while the ready shadow source stays pinned', () => {
  const h = setup();
  h.light.castShadow = true; h.light.shadow.map = new THREE.WebGLRenderTarget(256, 256);
  const points = Array.from({ length: 10 }, (_, i) => {
    const light = new THREE.PointLight(0xffffff, 100 + i, 150, 2);
    light.position.set(i, 0, 0); return light;
  });
  h.pass.setLights([h.light, ...points]);
  h.pass.render(h.depth, h.camera);
  assert.equal(h.renderer.draws.at(-1).lightIds[0], h.light.id);
  points[9].intensity = 100000;
  h.pass.render(h.depth, h.camera);
  const selected = h.renderer.draws.at(-1).lightIds;
  assert.equal(selected.length, NOCTURNE_SCATTER_LIGHT_CAP);
  assert.equal(selected[0], h.light.id);
  assert.ok(selected.includes(points[9].id), 'stable slot order cannot hide a powerful late-slot event');
  h.light.shadow.map.dispose(); h.pass.dispose();
});

test('lost-context teardown clears references without dispatching stale GPU disposal events', () => {
  const h = setup(); let events = 0;
  for (const resource of h.pass.contextLossResources()) resource.addEventListener('dispose', () => { events++; });
  h.pass.render(h.depth, h.camera);
  h.pass.dispose({ disposeGpu: false });
  assert.equal(events, 0);
  assert.equal(h.pass.active, false);
  assert.equal(h.pass.getDiagnostics().targets, 0);
  assert.equal(h.pass.render(h.depth, h.camera), null);
});

test('quality changes resize history without material variants; disposal is idempotent', () => {
  const h = setup({ quality: 'integrated' });
  const material = h.pass.openingProgramMaterials()[0];
  h.pass.setQuality('high'); h.pass.setSize(1280, 720);
  assert.equal(h.pass.getDiagnostics().width, 640);
  assert.equal(h.pass.getDiagnostics().steps, 28);
  assert.equal(h.pass.openingProgramMaterials()[0], material);
  h.pass.dispose(); h.pass.dispose(); h.pass.rebuild(); h.pass.render(h.depth, h.camera);
  assert.equal(h.renderer.draws.length, 0);
  assert.equal(h.pass.getDiagnostics().targets, 0);
  assert.equal(h.pass.openingProgramMaterials().length, 0);
});

test('unsupported WebGL capabilities fail clear without advertising an unprepared shader', () => {
  const renderer = rendererFixture(false);
  const pass = createNocturneAtmosphere(renderer, 640, 360);
  assert.equal(pass.supported, false);
  assert.equal(pass.getDiagnostics().targets, 0);
  assert.equal(pass.openingProgramMaterials().length, 0);
  assert.equal(pass.render(new THREE.DepthTexture(640, 360), new THREE.PerspectiveCamera()), null);
  pass.dispose();
});
