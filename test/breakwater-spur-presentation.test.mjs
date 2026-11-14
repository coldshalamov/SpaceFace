import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createBreakwaterSpurPresentation } from '../src/features/breakwaterSpur/presentation.js';
import { breakwaterSiteGlobal, getBreakwaterSpurMapMarkers } from '../src/features/breakwaterSpur/readModel.js';
import { BREAKWATER_PHASE as PH, BREAKWATER_CHARTER, BREAKWATER_SECTOR_ID } from '../src/features/breakwaterSpur/definition.js';

function visibleLights(scene) {
  const lights = [];
  scene.traverseVisible(object => { if (object.isLight) lights.push(object); });
  return lights;
}

function stateWithMirroredView() {
  return {
    world: { currentSectorId: BREAKWATER_SECTOR_ID, breakwaterSpur: { phase: PH.DARK, stage: 0 } },
    breakwaterSpurView: { phase: 'operating', stage: 3, charter: BREAKWATER_CHARTER.COOP,
      nextAction: 'Repair or refuel at the cooperative berth.' },
  };
}

test('live worker view and explicit clear outrank a retained saved Breakwater row', () => {
  const state = stateWithMirroredView(), scene = new THREE.Scene();
  const presentation = createBreakwaterSpurPresentation({ state, scene, THREE });
  try {
    const markers = getBreakwaterSpurMapMarkers(state, BREAKWATER_SECTOR_ID);
    assert.equal(markers.length, 1);
    assert.equal(markers[0].stageId, 'stage_3');
    assert.equal(markers[0].stageLabel, 'co-op berth');
    presentation.update();
    assert.equal(visibleLights(scene).length, 4);
    assert.ok(visibleLights(scene).every(light => light.intensity > 0));
    state.world.breakwaterSpur = { ...state.breakwaterSpurView };
    state.breakwaterSpurView = null;
    presentation.update();
    assert.equal(getBreakwaterSpurMapMarkers(state, BREAKWATER_SECTOR_ID).length, 0);
    assert.equal(visibleLights(scene).length, 0);
  } finally { presentation.dispose(); }
  assert.equal(scene.children.length, 0);
});

test('undiscovered and off-sector worksite contributes no visible scene lights', () => {
  const state = stateWithMirroredView(), scene = new THREE.Scene();
  state.world.currentSectorId = 'sector_helios_prime';
  const presentation = createBreakwaterSpurPresentation({ state, scene, THREE });
  try {
    presentation.update();
    assert.equal(scene.children.length, 0, 'no off-sector lamp allocation');
    state.world.currentSectorId = BREAKWATER_SECTOR_ID;
    state.breakwaterSpurView = { phase: PH.DARK, stage: 0 };
    presentation.update();
    assert.equal(scene.children.length, 0, 'no undiscovered lamp allocation');
    state.breakwaterSpurView = stateWithMirroredView().breakwaterSpurView;
    presentation.update();
    assert.equal(visibleLights(scene).length, 4);
    state.world.currentSectorId = 'sector_helios_prime';
    presentation.update();
    assert.equal(visibleLights(scene).length, 0);
  } finally { presentation.dispose(); }
});

test('site lamps and bulbs follow the current render frame origin', () => {
  const state = stateWithMirroredView(), scene = new THREE.Scene();
  state.world.frameOrigin = { x: -12288, z: 8192 };
  const presentation = createBreakwaterSpurPresentation({ state, scene, THREE });
  const site = breakwaterSiteGlobal();
  try {
    const verifyHead = (origin) => {
      presentation.update();
      scene.updateMatrixWorld(true);
      const group = scene.getObjectByName('breakwaterSpur:lamps');
      const light = group.children.find(object => object.isPointLight);
      const bulb = group.children.find(object => object.isMesh);
      const expected = [site.x - origin.x, 16, site.z + 14 - origin.z];
      assert.deepEqual(light.getWorldPosition(new THREE.Vector3()).toArray(), expected);
      assert.deepEqual(bulb.getWorldPosition(new THREE.Vector3()).toArray(), expected);
      assert.equal(visibleLights(scene).length, 4);
      assert.equal(light.intensity, 1.35);
    };
    verifyHead(state.world.frameOrigin);
    state.world.frameOrigin = { x: -16384, z: 12288 };
    verifyHead(state.world.frameOrigin);
    delete state.world.frameOrigin;
    verifyHead({ x: 0, z: 0 });
  } finally { presentation.dispose(); }
});
