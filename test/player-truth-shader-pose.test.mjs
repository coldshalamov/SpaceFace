import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { installIllustratedSurface } from '../src/render/illustratedSurface.js';
import { installLampBus } from '../src/render/lampBus.js';
import { installSingleSamplePackedOrmShader } from '../src/render/partsLibrary.js';
import { playerTruthOpaqueBounds } from '../src/testing/playerTruth/reader.js';

function boundsFor(material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), material);
  mesh.updateMatrixWorld(true);
  const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 20);
  camera.position.set(0, 5, 8); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  try { return playerTruthOpaqueBounds(THREE, mesh, camera, 80, 80); }
  finally { mesh.geometry.dispose(); }
}

test('actual illustrated, lamp-bus and packed-ORM hook chain is known to preserve vertex pose', () => {
  const material = new THREE.MeshStandardMaterial();
  const orm = new THREE.Texture();
  material.aoMap = orm; material.roughnessMap = orm; material.metalnessMap = orm;
  try {
    assert.equal(installIllustratedSurface(material), true);
    assert.equal(installLampBus(material, 'nav_port'), true);
    assert.equal(installSingleSamplePackedOrmShader(material), material);
    assert.ok(boundsFor(material), 'registered hook identities allow the geometry-backed mask');
  } finally {
    orm.dispose(); material.dispose();
  }
});

test('arbitrary, replaced, and copied-tag shader hooks remain unsupported', () => {
  const arbitrary = new THREE.MeshStandardMaterial();
  const userHook = () => {};
  arbitrary.onBeforeCompile = userHook;
  arbitrary.userData.spacefaceIllustratedSurface = 'spaceface-illustrated-surface-v17';
  try {
    installIllustratedSurface(arbitrary);
    assert.equal(boundsFor(arbitrary), null, 'wrapping an arbitrary predecessor does not certify it');
  } finally { arbitrary.dispose(); }

  const replaced = new THREE.MeshStandardMaterial();
  try {
    installIllustratedSurface(replaced);
    assert.ok(boundsFor(replaced), 'the actual registered wrapper is accepted');
    replaced.onBeforeCompile = () => {};
    replaced.userData.spacefaceLampChannel = 'nav_port';
    assert.equal(boundsFor(replaced), null, 'replacing the registered function loses provenance');
  } finally { replaced.dispose(); }
});

test('known shader provenance does not permit custom render callbacks or deformation', () => {
  const material = new THREE.MeshStandardMaterial();
  try {
    installIllustratedSurface(material);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), material);
    const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 20);
    camera.position.set(0, 5, 8); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    mesh.onBeforeRender = () => {};
    assert.equal(playerTruthOpaqueBounds(THREE, mesh, camera, 80, 80), null);
    mesh.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
    material.displacementMap = new THREE.Texture();
    assert.equal(playerTruthOpaqueBounds(THREE, mesh, camera, 80, 80), null);
    mesh.geometry.dispose(); material.displacementMap.dispose();
  } finally { material.dispose(); }
});
