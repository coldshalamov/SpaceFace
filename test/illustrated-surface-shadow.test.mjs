// Component-level WebGL regression: a blocked sun must not leave a clear-coat highlight.
// Uses the shipped Three.js module with SwiftShader; this is not a gameplay capture.
// Run browser tests while holding the shared game lock.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

const require = createRequire(import.meta.url);
const { createGameServer } = require('../scripts/lib/gameServer.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));

const fixture = `<!doctype html><link rel="icon" href="data:,">
<script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/addons/"}}</script>
<script type="module">
import * as THREE from 'three';
import { installIllustratedSurface } from '/src/render/illustratedSurface.js';
import { LOOK_SURFACE_UNIFORMS as U } from '/src/render/look.js';

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setSize(128, 128);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0);
const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 50);
camera.position.set(0, 10, 10);
camera.lookAt(0, 0, 0);

const standard = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: .35 });
const physical = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: .35 });
installIllustratedSurface(standard);
installIllustratedSurface(physical);
const plane = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), standard);
plane.rotation.x = -Math.PI / 2;
plane.receiveShadow = true;
scene.add(plane);
// Invisible to the color pass but present in the shadow pass.
const blocker = new THREE.Mesh(new THREE.BoxGeometry(3, .1, 3),
  new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
blocker.position.set(0, 3, -3);
blocker.castShadow = true;
scene.add(blocker);
function sun(color, z) {
  const light = new THREE.DirectionalLight(color, 1);
  light.position.set(0, 10, z);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  Object.assign(light.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: .1, far: 50 });
  light.shadow.camera.updateProjectionMatrix();
  scene.add(light);
  return light;
}
const redSun = sun(0xffffff, -10);
U.sfLookCoat.value = 1;
U.sfLookCoatRoughness.value = .32;
U.sfLookRimStrength.value = 0;
U.sfLookCoatEnv.value = 0;
U.sfLookBandMix.value = 0;
function sample(shadow, coat) {
  blocker.castShadow = shadow;
  U.sfLookCoatSun.value = coat;
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const rgba = new Uint8Array(4);
  gl.readPixels(64, 64, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  return Array.from(rgba);
}
// Increased gain isolates the coat lobe; it is not a game Look setting.
const result = {
  shadowNoCoat: sample(true, 0), shadowCoat: sample(true, 10),
  litNoCoat: sample(false, 0), litCoat: sample(false, 10),
};
plane.material = physical;
result.physicalShadowNoCoat = sample(true, 0);
result.physicalShadowCoat = sample(true, 10);
plane.material = standard;
camera.position.set(0, 10, .001);
camera.lookAt(0, 0, 0);
redSun.color.setRGB(1, 0, 0);
// The blocker hides red, while blue's separate shadow map remains visible.
const blueSun = sun(0x0000ff, 10);
result.mixedNoCoat = sample(true, 0);
result.mixedCoat = sample(true, 30);
blueSun.castShadow = false;
result.mixedNoBlueShadow = sample(true, 30);
scene.remove(blueSun);
camera.position.set(0, 10, 10);
camera.lookAt(0, 0, 0);
redSun.color.setRGB(1, 1, 1);
renderer.shadowMap.enabled = false;
result.shadowsDisabled = sample(true, 10);
scene.remove(redSun);
result.noDirectional = sample(false, 10);
window.shadowCoatResult = result;
</script>`;

test('each directional coat lobe follows its own shadow and retains unshadowed light',
  { timeout: 60000 }, async () => {
    const server = createGameServer({ root, devDiagnostics: false, extraRoutes: [{
      test: (_method, url) => url === '/__illustrated-shadow-test',
      handle(_request, response) {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(fixture);
      },
    }] });
    let browser;
    const errors = [];
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const { chromium } = await loadPlaywright();
      const executablePath = process.env.SF_BROWSER_EXECUTABLE || process.env.CHROMIUM_EXECUTABLE_PATH;
      browser = await chromium.launch({ headless: true,
        args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        ...(executablePath ? { executablePath } : {}) });
      const page = await browser.newPage();
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`http://127.0.0.1:${server.address().port}/__illustrated-shadow-test`);
      await page.waitForFunction(() => window.shadowCoatResult, null, { timeout: 30000 });
      const p = await page.evaluate(() => window.shadowCoatResult);
      assert.deepEqual(errors, []);
      assert.deepEqual(p.shadowCoat, p.shadowNoCoat, 'blocked white sun cannot create a coat glint');
      assert.deepEqual(p.physicalShadowCoat, p.physicalShadowNoCoat, 'physical materials respect the same shadow');
      assert.ok(p.litCoat[0] > p.litNoCoat[0] + 10, 'the unshadowed highlight remains');
      assert.ok(p.mixedCoat[0] <= 1, 'the blocked red source contributes no red coat');
      assert.ok(p.mixedCoat[2] > p.mixedNoCoat[2] + 4, 'the separately lit blue source keeps its coat');
      assert.deepEqual(p.mixedNoBlueShadow, p.mixedCoat, 'a non-shadow-casting source remains lit');
      assert.deepEqual(p.shadowsDisabled, p.litCoat, 'disabling shadow maps keeps the original light');
      assert.deepEqual(p.noDirectional, [0, 0, 0, 255], 'the no-directional shader variant compiles');
    } finally {
      await browser?.close();
      await new Promise(resolve => server.close(resolve));
    }
  });
