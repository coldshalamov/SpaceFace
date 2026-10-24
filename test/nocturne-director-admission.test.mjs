import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { prepareNocturneShadowCamera } from '../src/render/nocturne/shadows.js';
import { compileShadowDepthPipelines, disposeAdmissionShadowResources, lightCensusSignature }
  from '../src/render/shadowDepthAdmission.js';

test('local shadow culling poses the refreshed spot before submission and retains cached-map projection', () => {
  const light = new THREE.SpotLight(0xffffff, 9000, 200, 0.4, 0.6, 2);
  light.position.set(35, 14, 20); light.target.position.set(130, 0, 20);
  light.shadow.needsUpdate = true;
  const owner = { renderer: { shadowMap: { enabled: true } },
    _nocturne: { enabled: true, shadowsEnabled: true, shadowLight: light } };
  const prepare = () => prepareNocturneShadowCamera(owner.renderer, light,
    owner._nocturne.enabled && owner._nocturne.shadowsEnabled);
  const camera = prepare();
  assert.equal(camera, light.shadow.camera);
  assert.ok(camera.position.distanceTo(light.position) < 1e-9);
  const original = light.shadow.matrix.clone();
  light.shadow.map = new THREE.WebGLRenderTarget(8, 8);
  light.shadow.needsUpdate = false;
  light.position.x += 10; light.target.position.x += 10;
  assert.equal(prepare(), camera);
  assert.ok(light.shadow.matrix.equals(original), 'unrefreshed depth keeps its original projection');
  assert.equal(camera.position.x, 35);
  light.shadow.needsUpdate = true;
  prepare();
  assert.equal(camera.position.x, 45);
  assert.equal(light.shadow.matrix.equals(original), false);
  owner._nocturne.shadowsEnabled = false;
  assert.equal(prepare(), null);
  assert.equal(prepareNocturneShadowCamera(null, null), null);
  light.dispose();
});

test('local spotlight depth admission preserves the exact light census and independent shadow resources', () => {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight();
  sun.castShadow = false;
  const lamp = new THREE.SpotLight(0xffbd77, 5000, 180, 0.39, 0.7, 2);
  lamp.castShadow = true;
  lamp.position.set(20, 30, 0); lamp.target.position.set(80, 0, 10);
  lamp.shadow.focus = 0.85; lamp.shadow.aspect = 1.2;
  lamp.shadow.mapSize.set(256, 256);
  lamp.shadow.autoUpdate = false;
  lamp.shadow.needsUpdate = true;
  const liveMap = { name: 'live-map' };
  lamp.shadow.map = liveMap;
  const secondary = new THREE.SpotLight();
  secondary.castShadow = true;
  secondary.shadow.needsUpdate = true;
  const hull = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  hull.castShadow = true;
  scene.add(sun, sun.target, lamp, lamp.target, secondary, secondary.target, hull);
  scene.updateMatrixWorld(true);
  const liveSignature = lightCensusSignature(scene);
  let stagedLamp = null, renders = 0;
  const renderer = {
    shadowMap: { enabled: true, needsUpdate: true, autoUpdate: false },
    getRenderTarget() { return null; }, setRenderTarget() {},
    renderBufferDirect() {}, properties: { get: m => m._fixtureProperties || {} },
    render(staging, camera) {
      renders++;
      assert.equal(lightCensusSignature(staging), liveSignature);
      if (!this.shadowMap.enabled) return;
      stagedLamp = staging.children.find(o => o.name === 'SF_AdmissionShadowDepthKey');
      assert.equal(stagedLamp.isSpotLight, true);
      assert.notEqual(stagedLamp, lamp);
      assert.notEqual(stagedLamp.shadow, lamp.shadow);
      assert.notEqual(stagedLamp.target, lamp.target);
      assert.equal(stagedLamp.angle, lamp.angle);
      assert.equal(stagedLamp.distance, lamp.distance);
      assert.equal(stagedLamp.shadow.aspect, 1.2);
      assert.equal(stagedLamp.shadow.mapSize.x, 256);
      const other = staging.children.find(o => o.isSpotLight && o !== stagedLamp);
      assert.equal(other.castShadow, true, 'secondary structural shadow census stays intact');
      assert.equal(other.shadow.autoUpdate, false);
      assert.equal(other.shadow.needsUpdate, false, 'only the selected admission map renders');
      assert.equal(other.shadow.map, null);
      stagedLamp.shadow.updateMatrices(stagedLamp);
      assert.ok(Math.abs(stagedLamp.shadow.camera.fov - 2 * 0.39 * 0.85 * 180 / Math.PI) < 1e-8);
      assert.equal(stagedLamp.shadow.camera.far, 180);
      if (!stagedLamp.shadow.map) stagedLamp.shadow.map = { disposed: false, dispose() { this.disposed = true; } };
      const depthMaterial = { _fixtureProperties: { currentProgram: { cacheKey: 'spot-admitted-depth' } } };
      this.renderBufferDirect(camera, null, hull.geometry, depthMaterial, hull, null);
    },
  };
  const options = { renderer, light: lamp, camera: new THREE.PerspectiveCamera(), subjects: [hull],
    THREE, lightingScene: scene, captureObjectHome: object => ({ object, parent: object.parent }),
    restoreObjectHome: home => home.parent.add(home.object) };
  const result = compileShadowDepthPipelines(options);
  assert.equal(result.skipped, false);
  assert.deepEqual(result.programBindingFailures, []);
  assert.equal(hull.parent, scene);
  assert.equal(lamp.parent, scene);
  assert.equal(lamp.target.parent, scene);
  assert.equal(lamp.shadow.map, liveMap);
  assert.equal(lamp.shadow.needsUpdate, true);
  assert.equal(renderer.shadowMap.needsUpdate, true);
  assert.equal(sun.castShadow, false);
  const privateMap = stagedLamp.shadow.map, firstStaged = stagedLamp;
  const renderedBeforeRepeat = renders;
  compileShadowDepthPipelines(options);
  assert.equal(stagedLamp, firstStaged);
  assert.equal(stagedLamp.shadow.map, privateMap);
  assert.ok(renders > renderedBeforeRepeat);
  disposeAdmissionShadowResources(renderer);
  assert.equal(privateMap.disposed, true);
  assert.equal(lamp.shadow.map, liveMap);
});
