import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  rememberStaticBatchGeometry,
  retainStaticBatchGeometryTree,
  releaseStaticBatchGeometryTree,
  clearStaticBatchGeometryCacheForTests,
} from '../src/render/staticBatchGeometryCache.js';
import { createPhaseBlinkPresentation } from '../src/render/phaseBlinkPresentation.js';
import { createCrucibleGhostPresentation } from '../src/render/crucibleGhost.js';
import {
  sampleGhostPose, takeGhostTape, armGhostPlayback, useCrucibleMetaStorage,
  resetCrucibleMetaForTests,
} from '../src/systems/survivalRecords.js';
import { ghostShareTextForTape, importGhostShareText } from '../src/ui/screens/shareCode.js';

function sourceFixture() {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial();
  root.add(new THREE.Mesh(geometry, material));
  let disposals = 0;
  geometry.addEventListener('dispose', () => { disposals++; });
  rememberStaticBatchGeometry('ghost-source', geometry);
  retainStaticBatchGeometryTree(root);
  return { root, material, disposals: () => disposals };
}

function evictSource(fixture) {
  rememberStaticBatchGeometry('ghost-evictor', new THREE.BoxGeometry(), 1);
  releaseStaticBatchGeometryTree(fixture.root);
  assert.equal(fixture.disposals(), 0, 'the live ghost still owns the geometry');
}

test('phase blink preview owns a lease until actual presentation disposal', () => {
  clearStaticBatchGeometryCacheForTests();
  const fixture = sourceFixture();
  const scene = new THREE.Scene();
  const owner = createPhaseBlinkPresentation();
  const player = {
    id: 1, pos: { x: 0, z: 0 },
    _phaseBlink: { aiming: true, active: true, x: 20, z: 0, rot: 0, charge: 0, dist: 20 },
  };
  const state = { simTime: 1, playerId: 1, entities: new Map([[1, player]]), settings: {} };
  try {
    owner.attach(scene);
    owner.sync(state, fixture.root, null, 0);
    assert.ok(scene.children.some(child => child.userData?.phaseBlinkGhost));
    evictSource(fixture);
    owner.dispose();
    assert.equal(fixture.disposals(), 1);
  } finally {
    owner.dispose();
    fixture.material.dispose();
    clearStaticBatchGeometryCacheForTests();
  }
});

test('Crucible ghost owns a lease until actual presentation disposal', () => {
  clearStaticBatchGeometryCacheForTests();
  takeGhostTape();
  sampleGhostPose({ tick: 0, x: 0, z: 0, r: 0, seed: 42, hullId: 'ship_hornet' });
  sampleGhostPose({ tick: 6, x: 6, z: 0, r: 0, seed: 42, hullId: 'ship_hornet' });
  const tape = takeGhostTape();
  const map = new Map();
  const storage = { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value) };
  useCrucibleMetaStorage(storage);
  const imported = importGhostShareText(ghostShareTextForTape(tape), storage);
  assert.ok(imported.ok);
  assert.ok(armGhostPlayback(imported.hash));
  const fixture = sourceFixture();
  const scene = new THREE.Scene();
  const owner = createCrucibleGhostPresentation();
  try {
    owner.attach(scene);
    owner.sync({ tick: 6 }, fixture.root);
    assert.ok(scene.children.some(child => child.userData?.crucibleGhost));
    evictSource(fixture);
    owner.dispose();
    assert.equal(fixture.disposals(), 1);
  } finally {
    owner.dispose();
    fixture.material.dispose();
    resetCrucibleMetaForTests();
    clearStaticBatchGeometryCacheForTests();
  }
});
