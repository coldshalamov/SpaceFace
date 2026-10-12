import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';
import { applySpaceBackgroundRootContract } from '../src/render/spaceBackground.js';

function compiledVertex(material) {
  const shader = {
    uniforms: {},
    vertexShader: material.isShaderMaterial ? material.vertexShader
      : material.isSpriteMaterial ? THREE.ShaderLib.sprite.vertexShader
        : THREE.ShaderLib.basic.vertexShader,
    fragmentShader: '',
  };
  material.onBeforeCompile(shader, {});
  return shader.vertexShader;
}

test('a distant structure stays behind a solid whose underside is below the sky plane', () => {
  const camera = new THREE.PerspectiveCamera(50, 1.6, 1, 14000);
  camera.position.set(0, 124, -72);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const foreground = ray.ray.at(700, new THREE.Vector3());
  const scenery = ray.ray.at(350, new THREE.Vector3());
  assert(foreground.y < -211, 'large authored station extends below the backdrop');
  assert(scenery.clone().project(camera).z < foreground.clone().project(camera).z,
    'physical backdrop depth would put the painted structure on top of the station');
  const root = applySpaceBackgroundRootContract(new THREE.Group(), -211);
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 });
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(100, 100), material));
  const vertex = compiledVertex(material);
  assert.match(vertex, /gl_Position\.z = gl_Position\.w;/,
    'background occupies the far depth boundary, regardless of its parallax plane');
  assert.equal(material.depthTest, true);
  assert.equal(material.depthWrite, false);
  assert(foreground.clone().project(camera).z < 1, 'foreground depth occludes reserved sky depth');
});

test('one root contract covers later structures, sprite planets and custom-shader stars', () => {
  const root = applySpaceBackgroundRootContract(new THREE.Group(), -211);
  const structure = new THREE.Group();
  const hull = new THREE.MeshBasicMaterial({ transparent: true });
  let existingCompileCalls = 0;
  hull.onBeforeCompile = () => { existingCompileCalls += 1; };
  hull.customProgramCacheKey = () => 'authored-structure-art';
  structure.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), hull));
  root.add(structure);
  const planet = new THREE.SpriteMaterial({ transparent: true });
  root.add(new THREE.Sprite(planet));
  const stars = new THREE.ShaderMaterial({ transparent: true, vertexShader: `
    void main() {
      if (position.x > 10.0) { gl_Position = vec4(2.0); return; }
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  ` });
  root.add(new THREE.Points(new THREE.BufferGeometry(), stars));
  for (const material of [hull, planet, stars]) {
    assert.match(compiledVertex(material), /gl_Position\.z = gl_Position\.w;/);
    assert.equal(material.depthTest, true);
    assert.equal(material.depthWrite, false);
  }
  assert.equal(existingCompileCalls, 1, 'authored art shader customization survives');
  assert.match(hull.customProgramCacheKey(), /^authored-structure-art\|/);
  assert.match(compiledVertex(stars), /gl_Position\.z <= gl_Position\.w/,
    'inactive star populations and near/far-clipped geometry stay clipped');
  const key = hull.customProgramCacheKey();
  root.remove(structure);
  root.add(structure);
  assert.equal(hull.customProgramCacheKey(), key, 'readmission does not stack depth programs');
});

test('the contract changes depth only; zoom, tilt and parallax keep their projection', () => {
  const root = applySpaceBackgroundRootContract(new THREE.Group(), -211);
  const material = new THREE.MeshBasicMaterial();
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material));
  const vertex = compiledVertex(material);
  assert.equal((vertex.match(/gl_Position\.z = gl_Position\.w;/g) || []).length, 1);
  assert.doesNotMatch(vertex, /gl_Position\.[xyw]\s*=/,
    'the layer keeps its existing apparent size, perspective and motion');
});

test('existing children and late meshes in an admitted empty group inherit the same depth rule', () => {
  const root = new THREE.Group();
  const existing = new THREE.MeshBasicMaterial();
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), existing));
  applySpaceBackgroundRootContract(root, -211);
  const nested = new THREE.Group();
  root.add(nested);
  const deeper = new THREE.Group();
  nested.add(deeper);
  const late = new THREE.MeshBasicMaterial({ transparent: true });
  deeper.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), late));
  for (const material of [existing, late]) {
    assert.match(compiledVertex(material), /gl_Position\.z = gl_Position\.w;/);
    assert.equal(material.depthTest, true);
    assert.equal(material.depthWrite, false);
  }
  const key = late.customProgramCacheKey();
  applySpaceBackgroundRootContract(root, -211);
  assert.equal(late.customProgramCacheKey(), key, 'reapplying the tree contract stays idempotent');
});

test('rendered scenery stays visible in empty space and behind deep solids at close and wide zoom', async () => {
  const require = createRequire(import.meta.url);
  const { createGameServer } = require('../scripts/lib/gameServer.cjs');
  const server = createGameServer({ root: fileURLToPath(new URL('../', import.meta.url)) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ headless: true, args: [
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    ] });
    const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/background-depth-fixture', route => route.fulfill({
      contentType: 'text/html',
      body: `<script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/addons/","@elemaudio/core":"/node_modules/@elemaudio/core/dist/index.js","shallowequal":"/vendor/elemaudio-deps/shallowequal.mjs","invariant":"/vendor/elemaudio-deps/invariant.mjs","eventemitter3":"/vendor/elemaudio-deps/eventemitter3.mjs"}}</script>`,
    }));
    await page.goto(`http://127.0.0.1:${server.address().port}/background-depth-fixture`);
    const samples = await page.evaluate(async () => {
      const THREE = await import('three');
      const { applySpaceBackgroundRootContract } = await import('/src/render/spaceBackground.js');
      const renderer = new THREE.WebGLRenderer();
      renderer.setSize(64, 64);
      const target = new THREE.WebGLRenderTarget(64, 64);
      renderer.setRenderTarget(target);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 1, 1, 14000);
      const solid = new THREE.Mesh(new THREE.PlaneGeometry(600, 600),
        new THREE.MeshBasicMaterial({ color: '#22cc66', side: THREE.DoubleSide }));
      scene.add(solid);
      const root = applySpaceBackgroundRootContract(new THREE.Group(), -211);
      scene.add(root);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(400, 400),
        new THREE.MeshBasicMaterial({ color: '#ff3300', transparent: true, opacity: 0.9,
          side: THREE.DoubleSide }));
      root.add(plate);
      const ray = new THREE.Raycaster();
      const pixel = new Uint8Array(4);
      const rows = [];
      for (const zoom of [45, 144, 330]) {
        camera.position.set(0, zoom * Math.sin(Math.PI / 3), -zoom * 0.5);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld(true);
        ray.setFromCamera(new THREE.Vector2(), camera);
        solid.position.copy(ray.ray.at(700, new THREE.Vector3()));
        solid.quaternion.copy(camera.quaternion);
        plate.position.copy(ray.ray.at(350, new THREE.Vector3())).sub(root.position);
        plate.quaternion.copy(camera.quaternion);
        solid.visible = false;
        renderer.render(scene, camera);
        renderer.readRenderTargetPixels(target, 32, 32, 1, 1, pixel);
        const empty = [...pixel];
        solid.visible = true;
        renderer.render(scene, camera);
        renderer.readRenderTargetPixels(target, 32, 32, 1, 1, pixel);
        rows.push({ zoom, empty, occluded: [...pixel] });
      }
      target.dispose();
      renderer.dispose();
      return rows;
    });
    assert.deepEqual(errors, []);
    for (const { zoom, empty, occluded } of samples) {
      assert(empty[0] > empty[1] * 3, `zoom ${zoom}: authored backdrop stays visible`);
      assert(occluded[1] > occluded[0] * 3,
        `zoom ${zoom}: solid below the backdrop occludes it; got ${occluded}`);
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
