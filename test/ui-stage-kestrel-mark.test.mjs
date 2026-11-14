import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { presentUiStage, releaseUiStage, releaseUiStagePrewarm,
  setUiStagePartLoaderForTest, uiStageReport } from '../src/render/uiStage.js';

function rendererForTest() {
  let target = null;
  const clear = new THREE.Color();
  return {
    domElement: { isConnected: false }, autoClear: true, shadowMap: { enabled: false },
    info: { programs: [] }, scene: null,
    render(scene) { this.scene = scene; },
    async compileAsync() {}, initTexture() {},
    getSize(v) { return v.set(1280, 720); },
    getRenderTarget() { return target; }, setRenderTarget(value) { target = value; },
    getClearColor(out) { return out.copy(clear); }, getClearAlpha() { return 1; },
    setClearColor(color) { clear.set(color); },
  };
}

async function waitForLive() {
  for (let i = 0; i < 400; i++) {
    if (uiStageReport().phase === 'live') return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail(`berth did not become live: ${JSON.stringify(uiStageReport())}`);
}

test('berth preview changes only its own mark and restores the active hull without reloading', async (t) => {
  releaseUiStage('test-start');
  releaseUiStagePrewarm('test-start');
  t.after(() => {
    releaseUiStage('test-finish');
    releaseUiStagePrewarm('test-finish');
    setUiStagePartLoaderForTest(null);
  });
  let loads = 0;
  const hullGeometry = new THREE.BoxGeometry(2, 1, 1);
  const markGeometry = new THREE.BoxGeometry(0.2, 0.01, 0.2);
  const material = new THREE.MeshStandardMaterial();
  setUiStagePartLoaderForTest(async (url) => {
    loads++;
    const kestrel = url.endsWith('wholeships/kestrel.glb');
    return {
      url, assetId: kestrel ? 'SF_K0_KESTREL_BORROWED_TIME_V4' : 'test-prop',
      primitives: [
        { name: 'hull', geometry: hullGeometry, material, matrix: new THREE.Matrix4() },
        ...(kestrel ? [{ name: 'LOD0_Armor_ivory', geometry: markGeometry, material, matrix: new THREE.Matrix4() }] : []),
      ],
    };
  });
  const renderer = rendererForTest();
  const state = {
    mode: 'flight', ui: { docked: true, stageRequest: { scene: 'berth', hullDefId: 'ship_kestrel' } },
    player: { activeShipIndex: 0, ownedShips: [{ defId: 'ship_kestrel' }] },
    settings: { video: { motionReduce: true } }, render: {},
  };
  assert.equal(presentUiStage({ render: { renderer }, state }), true);
  await waitForLive();
  presentUiStage({ render: { renderer }, state });
  const hull = renderer.scene.getObjectByName('UiStageHull');
  const mark = hull.getObjectByName('LOD0_Armor_ivory');
  assert.equal(mark.visible, true, 'legacy starter keeps its lettering');
  assert.equal(mark.castShadow, false, 'the paint film does not leave a latched shadow');
  const trafficMarks = [];
  renderer.scene.traverse((node) => {
    if (node.name.startsWith('StationBay_') && node.name.endsWith('_hull')) {
      trafficMarks.push(node.getObjectByName('LOD0_Armor_ivory'));
    }
  });
  assert.equal(trafficMarks.length, 2);
  assert.ok(trafficMarks.every((node) => node && node.visible === false), 'background craft do not inherit it');
  const loaded = loads;

  state.ui.stageRequest.shipworksPreviewDecalId = 'none';
  presentUiStage({ render: { renderer }, state });
  assert.equal(mark.visible, false, 'stock preview hides the personal mark');
  state.ui.stageRequest.shipworksPreviewDecalId = 'borrowed_time';
  presentUiStage({ render: { renderer }, state });
  assert.equal(mark.visible, true, 'a preview with the explicit mark retains it');
  delete state.ui.stageRequest.shipworksPreviewDecalId;
  state.player.ownedShips[0].appearance = { decalId: 'none' };
  presentUiStage({ render: { renderer }, state });
  assert.equal(mark.visible, false, 'leaving the preview follows the active hull appearance');
  assert.equal(loads, loaded, 'same-hull appearance changes do not reload or rebuild the berth');
  assert.equal(renderer.scene.getObjectByName('UiStageHull'), hull);
  assert.equal(mark.geometry, markGeometry, 'cached source geometry remains shared and untouched');
});
